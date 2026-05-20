import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { tail } from './logTailer.js';
import { log } from '../logger.js';

// Format ARK Ascended ShooterGame.log (confirmé sur le cluster ChaosArk):
//
//   AdminCmd: <commande> (PlayerName: <name>, ARKID: <arkid>, PlatformID: <eos>)
//
// L'EOSID est sous "PlatformID", "ARKID" est l'ID de personnage qu'on ignore.

const ADMIN_RE = /AdminCmd:\s+(.+?)\s+\(PlayerName:\s*(.+?),\s*ARKID:\s*(\d+),\s*PlatformID:\s*([0-9a-fA-F]+)\)/i;

export function startAdminCommandWatcher(client) {
  for (const server of config.servers) {
    tail(server.logFile, async (line) => {
      const m = line.match(ADMIN_RE);
      if (m) {
        const [, cmd, playerName, arkid, eos] = m;
        await emit(client, server, {
          cmd: cmd.trim(),
          name: playerName.trim(),
          arkid: arkid.trim(),
          eos: eos.trim(),
        });
      }
    });
  }
}

async function emit(client, server, info) {
  const channel = await client.channels.fetch(config.discord.channels.adminLog).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0xffaa00)
    .setTitle('⚡ Commande admin')
    .addFields(
      { name: 'Carte',    value: server.name,           inline: true },
      { name: 'Admin',    value: `**${info.name}**`,    inline: true },
      { name: 'EOSID',    value: `\`${info.eos}\``,     inline: false },
      { name: 'Commande', value: `\`${info.cmd.slice(0, 500)}\``, inline: false }
    )
    .setTimestamp();

  channel.send({ embeds: [embed] }).catch((e) => log.error('Send admin cmd:', e.message));
  log.debug(`AdminCmd: ${info.name} (${info.eos}) → ${info.cmd}`);
}
