import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { tail } from './logTailer.js';
import { getPlayerPos } from '../rcon.js';
import { resolveEOSAfterJoin, getEOSByName } from '../playerCache.js';
import { log } from '../logger.js';

// Patterns de détection sur ShooterGame.log.
// On essaie d'extraire à la fois le nom ET un éventuel EOSID dans la ligne.

const JOIN_REGEXES = [
  // Format 1 : "Join request: ... PlayerName="John" ... EOSID=0002abc..."
  { re: /Join request:.*?PlayerName="([^"]+)".*?EOSID=([0-9a-fA-F]+)/i,         keys: ['name', 'eos'] },
  // Format 2 : Login avec EOSID dans la ligne
  { re: /Login:.*?Player=([^,]+).*?EOS=([0-9a-fA-F]+)/i,                         keys: ['name', 'eos'] },
  // Format 3 : "Join succeeded: John"
  { re: /Join succeeded:\s*([^\r\n]+)/i,                                         keys: ['name'] },
  // Format 4 : ARK Ascended typique
  { re: /\[LogNet\].*Login.*PlayerName="([^"]+)"/i,                              keys: ['name'] },
];

const LEAVE_REGEXES = [
  { re: /\[LogNet\].*UNetConnection::Close.*PlayerName="([^"]+)"/i,              keys: ['name'] },
  { re: /Logout:\s*([^,\r\n]+)/i,                                                keys: ['name'] },
  { re: /\[LogNet\].*Connection closed.*?PlayerName="([^"]+)"/i,                 keys: ['name'] },
  { re: /Connection closed.*?EOSID=([0-9a-fA-F]+)/i,                             keys: ['eos'] },
];

function tryMatch(line, patterns) {
  for (const { re, keys } of patterns) {
    const m = line.match(re);
    if (m) {
      const out = {};
      keys.forEach((k, i) => { out[k] = m[i + 1].trim(); });
      return out;
    }
  }
  return null;
}

export function startPlayerEventWatcher(client) {
  for (const server of config.servers) {
    tail(server.logFile, async (line) => {
      const join = tryMatch(line, JOIN_REGEXES);
      if (join) return emitJoin(client, server, join);

      const leave = tryMatch(line, LEAVE_REGEXES);
      if (leave) return emitLeave(client, server, leave);
    });
  }
}

async function getChannel(client) {
  return client.channels.fetch(config.discord.channels.connect).catch(() => null);
}

async function emitJoin(client, server, info) {
  const channel = await getChannel(client);
  if (!channel) return;

  // Résolution EOSID : depuis la ligne si présent, sinon via le cache RCON
  let eos = info.eos || null;
  let name = info.name || null;
  if (!eos && name) {
    eos = await resolveEOSAfterJoin(server.id, name);
  }

  let pos = null;
  if (config.options.playerLocationLookup && name) {
    pos = await getPlayerPos(server.id, name);
  }

  const embed = new EmbedBuilder()
    .setColor(0x44dd44)
    .setTitle('🟢 Connexion')
    .addFields(
      { name: 'Joueur', value: name ? `**${name}**` : '?', inline: true },
      { name: 'Carte',  value: server.name, inline: true },
      { name: 'EOSID',  value: eos ? `\`${eos}\`` : '_(non résolu)_', inline: false }
    )
    .setTimestamp();

  if (pos) embed.addFields({ name: 'Position', value: `\`${pos}\``, inline: false });

  channel.send({ embeds: [embed] }).catch((e) => log.error('Send join:', e.message));
  log.debug(`Join: ${name || '?'} (${eos || '?'}) sur ${server.name}`);
}

async function emitLeave(client, server, info) {
  const channel = await getChannel(client);
  if (!channel) return;

  // Pour les leaves, on a souvent juste le nom — on cherche l'EOSID dans le cache
  // (alimenté par les ListPlayers récents, juste avant la déco)
  let name = info.name || null;
  let eos  = info.eos  || null;
  if (!eos && name) {
    eos = getEOSByName(server.id, name);
  }

  let pos = null;
  if (config.options.playerLocationLookup && name) {
    pos = await getPlayerPos(server.id, name);
  }

  const embed = new EmbedBuilder()
    .setColor(0xdd4444)
    .setTitle('🔴 Déconnexion')
    .addFields(
      { name: 'Joueur', value: name ? `**${name}**` : '?', inline: true },
      { name: 'Carte',  value: server.name, inline: true },
      { name: 'EOSID',  value: eos ? `\`${eos}\`` : '_(non résolu)_', inline: false }
    )
    .setTimestamp();

  if (pos) embed.addFields({ name: 'Dernière position', value: `\`${pos}\``, inline: false });

  channel.send({ embeds: [embed] }).catch((e) => log.error('Send leave:', e.message));
  log.debug(`Leave: ${name || '?'} (${eos || '?'}) sur ${server.name}`);
}
