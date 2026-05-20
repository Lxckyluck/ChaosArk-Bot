import { Rcon } from 'rcon-client';
import { config } from './config.js';
import { log } from './logger.js';

// Pool de connexions RCON par serveur — créées paresseusement, reconnect auto.
const pool = new Map();

async function connect(server) {
  const rcon = await Rcon.connect({
    host: server.rcon.host,
    port: server.rcon.port,
    password: server.rcon.password,
    timeout: 5000,
  });
  rcon.on('end', () => {
    log.warn(`RCON ${server.id} déconnecté — sera reconnecté à la prochaine commande`);
    pool.delete(server.id);
  });
  rcon.on('error', (e) => {
    log.error(`RCON ${server.id} erreur:`, e.message);
  });
  return rcon;
}

export async function getRcon(serverId) {
  const server = config.servers.find((s) => s.id === serverId);
  if (!server) throw new Error(`Serveur inconnu: ${serverId}`);
  if (!pool.has(serverId)) {
    log.info(`Connexion RCON à ${server.name} (${server.rcon.host}:${server.rcon.port})...`);
    pool.set(serverId, await connect(server));
  }
  return pool.get(serverId);
}

export async function send(serverId, cmd) {
  const rcon = await getRcon(serverId);
  try {
    const res = await rcon.send(cmd);
    return res?.toString() ?? '';
  } catch (e) {
    // Forcer une reconnexion la prochaine fois
    pool.delete(serverId);
    throw e;
  }
}

// Envoie une commande à TOUS les serveurs du cluster (broadcast)
export async function broadcast(cmd) {
  const results = {};
  for (const server of config.servers) {
    try {
      results[server.id] = await send(server.id, cmd);
    } catch (e) {
      results[server.id] = `[ERR] ${e.message}`;
    }
  }
  return results;
}

// Liste les joueurs en ligne d'un serveur, retourne [{name, eosId}]
export async function listPlayers(serverId) {
  const raw = await send(serverId, 'ListPlayers');
  const players = [];
  // Format typique: "0. PlayerName, 0002abcdef..."
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\d+\.\s+(.+?),\s*([0-9a-fA-F]+)/);
    if (m) players.push({ name: m[1].trim(), eosId: m[2].trim() });
  }
  return players;
}

// Récupère la position d'un joueur via son nom — retourne la string brute
export async function getPlayerPos(serverId, playerName) {
  try {
    const r = await send(serverId, `GetPlayerPos ${playerName}`);
    return r.trim();
  } catch {
    return null;
  }
}
