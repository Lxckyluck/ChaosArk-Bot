import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { getBanPool } from '../mysql.js';
import { log } from '../logger.js';

// Surveille la table `eos_bans` (alimentée par le plugin EOSBanManager).
//
// Stratégie:
//   - On tient un snapshot de tous les EOSIDs bannis avec leur banned_at.
//   - À chaque tick, on récupère le snapshot actuel.
//   - Diff entre snapshot précédent et nouveau:
//       - EOSIDs ajoutés     → événement 🔨 Ban
//       - EOSIDs disparus    → événement ✅ Unban
//       - EOSIDs avec banned_at différent (rebanned/raison changée) → 🔨 Ban (update)

const POLL_INTERVAL = 2000; // 2 secondes
let snapshot = null; // Map<eos_id, {row}>
let started = false;
let firstPoll = true;

async function fetchSnapshot() {
  const [rows] = await getBanPool().execute(
    'SELECT eos_id, player_name, reason, banned_by, banned_at FROM eos_bans'
  );
  const map = new Map();
  for (const r of rows) map.set(r.eos_id, r);
  return map;
}

function buildBanEmbed(row) {
  return new EmbedBuilder()
    .setColor(0xff4444)
    .setTitle('🔨 Ban EOSID')
    .addFields(
      { name: 'EOSID',  value: `\`${row.eos_id}\``,             inline: false },
      { name: 'Joueur', value: row.player_name || '_(inconnu)_', inline: true },
      { name: 'Auteur', value: row.banned_by || '?',            inline: true },
      { name: 'Raison', value: row.reason || '_(non spécifiée)_', inline: false }
    )
    .setTimestamp(row.banned_at ? new Date(Number(row.banned_at) * 1000) : new Date());
}

function buildUnbanEmbed(row) {
  return new EmbedBuilder()
    .setColor(0x44ff44)
    .setTitle('✅ Unban EOSID')
    .addFields(
      { name: 'EOSID',  value: `\`${row.eos_id}\``,             inline: false },
      { name: 'Joueur', value: row.player_name || '_(inconnu)_', inline: true },
      { name: 'Précédent ban par', value: row.banned_by || '?', inline: true },
      { name: 'Raison précédente', value: row.reason || '_(non spécifiée)_', inline: false }
    )
    .setTimestamp();
}

async function pollOnce(client) {
  try {
    const next = await fetchSnapshot();

    // Premier poll: on initialise sans rien notifier (sinon on spamme tous les bans existants au démarrage)
    if (firstPoll) {
      snapshot = next;
      firstPoll = false;
      log.info(`banWatcher: snapshot initial (${next.size} ban(s) actif(s))`);
      return;
    }

    const channel = await client.channels.fetch(config.discord.channels.banLog).catch(() => null);
    if (!channel) {
      snapshot = next;
      return;
    }

    // Nouveaux bans ou raisons mises à jour
    for (const [eos, row] of next.entries()) {
      const prev = snapshot.get(eos);
      if (!prev) {
        channel.send({ embeds: [buildBanEmbed(row)] }).catch((e) => log.error('Send ban:', e.message));
        log.info(`Ban détecté: ${eos} par ${row.banned_by}`);
      } else if (Number(prev.banned_at) !== Number(row.banned_at)) {
        // Re-ban (le plugin met à jour banned_at en cas de re-ban) → notif aussi
        channel.send({ embeds: [buildBanEmbed(row)] }).catch((e) => log.error('Send reban:', e.message));
        log.info(`Re-ban détecté: ${eos} par ${row.banned_by}`);
      }
    }

    // Unbans (EOSID disparu du snapshot)
    for (const [eos, prev] of snapshot.entries()) {
      if (!next.has(eos)) {
        channel.send({ embeds: [buildUnbanEmbed(prev)] }).catch((e) => log.error('Send unban:', e.message));
        log.info(`Unban détecté: ${eos}`);
      }
    }

    snapshot = next;
  } catch (e) {
    log.error('Poll bans:', e.message);
  }
}

export async function startBanWatcher(client) {
  if (started) return;
  try {
    // Pré-vol : vérifie qu'on peut accéder à la table
    await getBanPool().execute('SELECT 1 FROM eos_bans LIMIT 1');
  } catch (e) {
    log.warn(`banWatcher: impossible d'accéder à eos_bans (${e.message}). Watcher désactivé.`);
    return;
  }
  started = true;
  setInterval(() => pollOnce(client), POLL_INTERVAL);
  log.info(`banWatcher actif (interval ${POLL_INTERVAL}ms)`);
}
