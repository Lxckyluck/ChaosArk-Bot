import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { tail } from './logTailer.js';
import { getPlayerPos } from '../rcon.js';
import { log } from '../logger.js';

// Format ARK Ascended ShooterGame.log (confirmé sur le cluster ChaosArk):
//
// Connexion:
//   [timestamp][frame]date: <NomJoueur> [UniqueNetId:<EOS> Platform:None] joined this ARK!
//
// Déconnexion:
//   [timestamp][frame]date: <NomJoueur> [UniqueNetId:<EOS> Platform:None] left this ARK!
//
// Une seule regex robuste pour chaque cas — l'EOSID est TOUJOURS présent.

const JOIN_RE  = /:\s+(.+?)\s+\[UniqueNetId:([0-9a-fA-F]+)\s+Platform:[^\]]+\]\s+joined this ARK!/i;
const LEAVE_RE = /:\s+(.+?)\s+\[UniqueNetId:([0-9a-fA-F]+)\s+Platform:[^\]]+\]\s+left this ARK!/i;

export function startPlayerEventWatcher(client) {
  for (const server of config.servers) {
    tail(server.logFile, async (line) => {
      const join = line.match(JOIN_RE);
      if (join) return emitJoin(client, server, join[1].trim(), join[2]);

      const leave = line.match(LEAVE_RE);
      if (leave) return emitLeave(client, server, leave[1].trim(), leave[2]);
    });
  }
}

async function getChannel(client) {
  return client.channels.fetch(config.discord.channels.connect).catch(() => null);
}

async function emitJoin(client, server, name, eos) {
  const channel = await getChannel(client);
  if (!channel) return;

  let pos = null;
  if (config.options.playerLocationLookup) {
    pos = await getPlayerPos(server.id, { name, eos });
  }

  const embed = new EmbedBuilder()
    .setColor(0x44dd44)
    .setTitle('🟢 Connexion')
    .addFields(
      { name: 'Joueur', value: `**${name}**`, inline: true },
      { name: 'Carte',  value: server.name,   inline: true },
      { name: 'EOSID',  value: `\`${eos}\``,  inline: false }
    )
    .setTimestamp();

  if (pos) embed.addFields({ name: 'Position', value: `\`${pos}\``, inline: false });

  channel.send({ embeds: [embed] }).catch((e) => log.error('Send join:', e.message));
  log.debug(`Join: ${name} (${eos}) sur ${server.name}`);
}

async function emitLeave(client, server, name, eos) {
  const channel = await getChannel(client);
  if (!channel) return;

  let pos = null;
  if (config.options.playerLocationLookup) {
    pos = await getPlayerPos(server.id, { name, eos });
  }

  const embed = new EmbedBuilder()
    .setColor(0xdd4444)
    .setTitle('🔴 Déconnexion')
    .addFields(
      { name: 'Joueur', value: `**${name}**`, inline: true },
      { name: 'Carte',  value: server.name,   inline: true },
      { name: 'EOSID',  value: `\`${eos}\``,  inline: false }
    )
    .setTimestamp();

  if (pos) embed.addFields({ name: 'Dernière position', value: `\`${pos}\``, inline: false });

  channel.send({ embeds: [embed] }).catch((e) => log.error('Send leave:', e.message));
  log.debug(`Leave: ${name} (${eos}) sur ${server.name}`);
}
