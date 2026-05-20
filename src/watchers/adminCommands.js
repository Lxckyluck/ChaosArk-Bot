import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { tail } from './logTailer.js';
import { log } from '../logger.js';

// ShooterGame.log entries pour les commandes admin (cheat) ressemblent à:
//   [Cheat command] PlayerName: John, EOSID: 0002abc..., Command: SpawnDino Rex 150
//   [LogCheatManager] ... AdminCmd executed by ...
//   AdminCheat from "John" (0002abc): GiveItem ...
// On essaie plusieurs patterns.

const PATTERNS = [
  // Format AsaApi log natif (recommandé): "Cheat: <player>(<eos>) ran <cmd>"
  /Cheat:\s*([^()]+)\(([0-9a-fA-F]+)\)\s+ran\s+(.+)/i,
  // Format ARK natif "AdminCmd <cmd> by <player>"
  /AdminCmd\s+(.+?)\s+by\s+([^,\r\n]+)/i,
  // Format générique avec PlayerName et Command
  /\[Cheat.*?\].*?PlayerName:\s*([^,]+),.*?EOSID:\s*([0-9a-fA-F]+),.*?Command:\s*(.+)/i,
];

export function startAdminCommandWatcher(client) {
  for (const server of config.servers) {
    tail(server.logFile, async (line) => {
      for (const re of PATTERNS) {
        const m = line.match(re);
        if (m) {
          await emitAdmin(client, server, line, m);
          break;
        }
      }
    });
  }
}

async function emitAdmin(client, server, rawLine, match) {
  const channel = await client.channels.fetch(config.discord.channels.adminLog).catch(() => null);
  if (!channel) return;

  // Selon le pattern qui a matché, les groupes sont différents
  // On essaie de détecter intelligemment
  let player = '?', eos = null, cmd = '?';
  if (match.length === 4) {
    player = match[1];
    eos = match[2];
    cmd = match[3];
  } else if (match.length === 3) {
    // AdminCmd <cmd> by <player>
    if (/^[0-9a-fA-F]+$/.test(match[2])) {
      eos = match[2];
      cmd = match[1];
    } else {
      cmd = match[1];
      player = match[2];
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0xffaa00)
    .setTitle('⚡ Commande admin')
    .addFields(
      { name: 'Carte', value: server.name, inline: true },
      { name: 'Admin', value: player.trim(), inline: true },
      { name: 'Commande', value: `\`${cmd.trim().slice(0, 500)}\``, inline: false }
    )
    .setTimestamp();

  if (eos) embed.addFields({ name: 'EOSID', value: `\`${eos}\``, inline: false });

  channel.send({ embeds: [embed] }).catch((e) => log.error('Send admin cmd:', e.message));
  log.debug(`AdminCmd: ${player} → ${cmd}`);
}
