import { EmbedBuilder } from 'discord.js';
import { config } from './config.js';
import { getBanPool } from './mysql.js';
import { log } from './logger.js';

// Registre des joueurs connus sur le cluster.
// Table `players` (créée auto au premier appel):
//   eos_id      VARCHAR(64) PRIMARY KEY
//   player_name VARCHAR(128)
//   first_seen  BIGINT (unix timestamp)
//   last_seen   BIGINT (unix timestamp)
//   times_seen  INT (nombre de connexions cumulées)

let initialized = false;

async function ensureTable() {
  if (initialized) return;
  await getBanPool().execute(
    `CREATE TABLE IF NOT EXISTS players (
        eos_id      VARCHAR(64)  NOT NULL PRIMARY KEY,
        player_name VARCHAR(128) NOT NULL DEFAULT '',
        first_seen  BIGINT       NOT NULL,
        last_seen   BIGINT       NOT NULL,
        times_seen  INT          NOT NULL DEFAULT 1,
        INDEX idx_last_seen (last_seen),
        INDEX idx_name (player_name)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  initialized = true;
  log.info('playerRegistry: table `players` prête');
}

/**
 * Upsert d'un joueur lors d'une connexion. Retourne true si c'est une PREMIÈRE connexion
 * (joueur inconnu jusque-là), false sinon.
 */
export async function registerPlayer(eos_id, player_name) {
  if (!eos_id) return false;
  try {
    await ensureTable();
  } catch (e) {
    log.error('playerRegistry ensureTable:', e.message);
    return false;
  }

  const now = Math.floor(Date.now() / 1000);

  try {
    // 1) Vérifie si le joueur existait avant cet upsert
    const [exist] = await getBanPool().execute(
      'SELECT eos_id FROM players WHERE eos_id = ? LIMIT 1',
      [eos_id]
    );
    const isNew = exist.length === 0;

    // 2) Upsert: insert si nouveau, sinon update du nom et last_seen + increment times_seen
    await getBanPool().execute(
      `INSERT INTO players (eos_id, player_name, first_seen, last_seen, times_seen)
       VALUES (?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         player_name = VALUES(player_name),
         last_seen   = VALUES(last_seen),
         times_seen  = times_seen + 1`,
      [eos_id, player_name || '', now, now]
    );

    return isNew;
  } catch (e) {
    log.error('playerRegistry register:', e.message);
    return false;
  }
}

/**
 * Notifie Discord qu'un nouveau joueur a rejoint le cluster pour la première fois.
 */
export async function notifyNewPlayer(client, { eos_id, player_name, server_name }) {
  const channelId = process.env.CHANNEL_NEW_PLAYER || config.discord.channels.connect;
  if (!channelId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0xffaa00)
    .setTitle('🆕 Nouveau joueur enregistré')
    .setDescription("Première connexion détectée — l'EOSID a été enregistré dans la base.")
    .addFields(
      { name: 'Joueur',  value: `**${player_name || '?'}**`, inline: true },
      { name: 'Carte',   value: server_name || '?',          inline: true },
      { name: 'EOSID',   value: `\`${eos_id}\``,             inline: false }
    )
    .setTimestamp();

  channel.send({ embeds: [embed] }).catch((e) => log.error('Send new player:', e.message));
  log.info(`Nouveau joueur enregistré: ${player_name} (${eos_id})`);
}
