import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { log } from '../logger.js';

// Backup périodique des fichiers .arkprofile (survivants) de chaque serveur.
//
// Stratégie:
//   1. Pour chaque serveur du cluster, on dérive le chemin SavedArks/ depuis logFile
//      ex: D:\ChaosArk\ClusterSolo\Forglar\ShooterGame\Saved\Logs\ShooterGame.log
//          → D:\ChaosArk\ClusterSolo\Forglar\ShooterGame\Saved\SavedArks
//   2. On copie tous les *.arkprofile dans:
//        <BACKUP_ROOT>\<server_id>\<timestamp>\
//   3. Rotation: on garde les N plus récents par serveur (vire les + vieux).

const BACKUP_ROOT      = process.env.BACKUP_ROOT      || 'D:\\ChaosArk\\Backups';
const BACKUP_INTERVAL  = parseInt(process.env.BACKUP_INTERVAL_MINUTES  || '60', 10) * 60 * 1000;
const BACKUP_RETENTION = parseInt(process.env.BACKUP_RETENTION_COUNT   || '24', 10);

function savedArksDir(server) {
  // 2 niveaux au-dessus de logFile (Logs\file → Saved\) puis on rejoint SavedArks
  const saved = path.join(path.dirname(server.logFile), '..');
  return path.join(saved, 'SavedArks');
}

function timestampLabel(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '_',
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join('-').replace('-_-', '_');
}

async function backupOneServer(server) {
  const src = savedArksDir(server);
  const stamp = timestampLabel();
  const destDir = path.join(BACKUP_ROOT, server.id, stamp);

  if (!fs.existsSync(src)) {
    throw new Error(`SavedArks introuvable: ${src}`);
  }

  await fsp.mkdir(destDir, { recursive: true });

  // Liste des .arkprofile dans SavedArks/
  const entries = await fsp.readdir(src, { withFileTypes: true });
  const profiles = entries.filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.arkprofile'));

  let total = 0;
  for (const e of profiles) {
    const from = path.join(src, e.name);
    const to   = path.join(destDir, e.name);
    await fsp.copyFile(from, to);
    const stat = await fsp.stat(to);
    total += stat.size;
  }

  return { destDir, count: profiles.length, bytes: total };
}

async function rotate(serverId) {
  const serverBackupDir = path.join(BACKUP_ROOT, serverId);
  if (!fs.existsSync(serverBackupDir)) return 0;

  const subdirs = (await fsp.readdir(serverBackupDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort(); // tri alphabétique sur le timestamp = tri chronologique

  if (subdirs.length <= BACKUP_RETENTION) return 0;

  const toDelete = subdirs.slice(0, subdirs.length - BACKUP_RETENTION);
  for (const dir of toDelete) {
    await fsp.rm(path.join(serverBackupDir, dir), { recursive: true, force: true });
  }
  return toDelete.length;
}

async function runAllBackups(client) {
  log.info(`Backup survivants: démarrage pour ${config.servers.length} serveur(s)`);
  const results = [];

  for (const server of config.servers) {
    try {
      const r = await backupOneServer(server);
      const removed = await rotate(server.id);
      results.push({
        server,
        ok: true,
        count: r.count,
        bytes: r.bytes,
        path: r.destDir,
        rotated: removed,
      });
      log.info(`Backup ${server.name}: ${r.count} survivants (${(r.bytes / 1024).toFixed(0)} Ko), ` +
               `+ rotation ${removed} ancien(s) supprimé(s)`);
    } catch (e) {
      results.push({ server, ok: false, error: e.message });
      log.error(`Backup ${server.name} échoué: ${e.message}`);
    }
  }

  await sendDiscordReport(client, results);
}

async function sendDiscordReport(client, results) {
  // On poste dans le salon admin-log (pas la peine de créer un salon dédié, c'est tracable)
  const channelId = process.env.CHANNEL_BACKUP || config.discord.channels.adminLog;
  if (!channelId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const failed = results.filter((r) => !r.ok);
  const succeeded = results.filter((r) => r.ok);

  const fmtSize = (b) => (b >= 1024 * 1024
    ? `${(b / 1024 / 1024).toFixed(1)} Mo`
    : `${(b / 1024).toFixed(0)} Ko`);

  const embed = new EmbedBuilder()
    .setColor(failed.length ? 0xff8800 : 0x44dd44)
    .setTitle(failed.length ? '⚠️ Backup survivants (partiel)' : '💾 Backup survivants')
    .setTimestamp();

  if (succeeded.length) {
    embed.addFields({
      name: `✅ Réussis (${succeeded.length})`,
      value: succeeded
        .map((r) => `**${r.server.name}** — ${r.count} survivants, ${fmtSize(r.bytes)}`)
        .join('\n'),
      inline: false,
    });
  }
  if (failed.length) {
    embed.addFields({
      name: `❌ Échec (${failed.length})`,
      value: failed
        .map((r) => `**${r.server.name}** — ${r.error}`)
        .join('\n'),
      inline: false,
    });
  }

  channel.send({ embeds: [embed] }).catch((e) => log.error('Send backup report:', e.message));
}

export function startSurvivorBackup(client) {
  // On vérifie/crée le dossier racine de backup
  try {
    fs.mkdirSync(BACKUP_ROOT, { recursive: true });
  } catch (e) {
    log.error(`Impossible de créer BACKUP_ROOT (${BACKUP_ROOT}): ${e.message}`);
    return;
  }

  log.info(
    `Backup survivants actif — root=${BACKUP_ROOT}, ` +
    `interval=${BACKUP_INTERVAL / 60000}min, rétention=${BACKUP_RETENTION}`
  );

  // Premier backup 1 min après le démarrage (laisse le bot se stabiliser)
  setTimeout(() => runAllBackups(client), 60 * 1000);
  setInterval(() => runAllBackups(client), BACKUP_INTERVAL);
}
