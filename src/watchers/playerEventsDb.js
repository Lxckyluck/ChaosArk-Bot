import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { getBanPool } from '../mysql.js';
import { log } from '../logger.js';
import { registerPlayer, notifyNewPlayer } from '../playerRegistry.js';

// Poll de la table `player_events` (alimentée par le plugin PlayerTracker côté serveur).
// Format attendu (créé auto par le plugin):
//   id, event_type, server_name, eos_id, player_name, pos_x, pos_y, pos_z, created_at

let lastSeenId = 0;
let started = false;
const POLL_INTERVAL = 1500; // ms — réactivité quasi instantanée

async function initLastId() {
  try {
    const [rows] = await getBanPool().execute(
      'SELECT MAX(id) AS maxId FROM player_events'
    );
    lastSeenId = Number(rows[0]?.maxId) || 0;
    log.info(`playerEventsDb: lastSeenId initialisé à ${lastSeenId}`);
    return true;
  } catch (e) {
    log.warn(
      `playerEventsDb: table player_events introuvable (${e.message}). ` +
      `Watcher désactivé. Démarre le plugin PlayerTracker sur le serveur pour créer la table.`
    );
    return false;
  }
}

function formatPos(x, y, z) {
  if (x == null || y == null || z == null) return null;
  // Format de commande cheat prête à copier-coller in-game
  return `cheat SetPlayerPos ${Math.round(x)} ${Math.round(y)} ${Math.round(z)}`;
}

async function pollOnce(client) {
  try {
    const [rows] = await getBanPool().execute(
      `SELECT id, event_type, server_name, eos_id, player_name, pos_x, pos_y, pos_z, created_at
         FROM player_events
        WHERE id > ?
        ORDER BY id ASC
        LIMIT 100`,
      [lastSeenId]
    );
    if (rows.length === 0) return;

    const channel = await client.channels.fetch(config.discord.channels.connect).catch(() => null);
    if (!channel) {
      lastSeenId = rows[rows.length - 1].id;
      return;
    }

    const knownNames = new Set(config.servers.map((s) => s.name.toLowerCase()));

    for (const ev of rows) {
      lastSeenId = ev.id;

      // Ignore les événements provenant d'un serveur absent de config.json
      if (ev.server_name && !knownNames.has(ev.server_name.toLowerCase())) {
        log.warn(`playerEventsDb: événement ignoré, serveur inconnu "${ev.server_name}"`);
        continue;
      }

      const isJoin = ev.event_type === 'join';

      // À chaque connexion: upsert du joueur dans la table `players`.
      // Si c'est une PREMIÈRE connexion (EOSID inconnu), on notifie aussi Discord.
      if (isJoin && ev.eos_id) {
        const isNew = await registerPlayer(ev.eos_id, ev.player_name);
        if (isNew) {
          await notifyNewPlayer(client, {
            eos_id: ev.eos_id,
            player_name: ev.player_name,
            server_name: ev.server_name,
          });
        }
      }

      const embed = new EmbedBuilder()
        .setColor(isJoin ? 0x44dd44 : 0xdd4444)
        .setTitle(isJoin ? '🟢 Connexion' : '🔴 Déconnexion')
        .addFields(
          { name: 'Joueur', value: `**${ev.player_name || '?'}**`, inline: true },
          { name: 'Carte',  value: ev.server_name || '?',          inline: true },
          { name: 'EOSID',  value: `\`${ev.eos_id || '?'}\``,      inline: false }
        )
        .setTimestamp(ev.created_at ? new Date(Number(ev.created_at) * 1000) : new Date());

      const pos = formatPos(ev.pos_x, ev.pos_y, ev.pos_z);
      if (pos) {
        embed.addFields({
          name: isJoin ? '🧭 TP à sa position' : '🧭 TP à sa dernière position',
          value: `\`\`\`${pos}\`\`\``,
          inline: false,
        });
      }

      channel.send({ embeds: [embed] }).catch((e) => log.error('Send event:', e.message));
    }
  } catch (e) {
    log.error('Poll player_events:', e.message);
  }
}

export async function startPlayerEventsDbWatcher(client) {
  if (started) return;
  const ok = await initLastId();
  if (!ok) return;
  started = true;
  setInterval(() => pollOnce(client), POLL_INTERVAL);
  log.info(`playerEventsDb watcher actif (interval ${POLL_INTERVAL}ms)`);
}
