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

// Réponses ARK considérées comme "pas de résultat utile" — à filtrer.
const EMPTY_RESPONSES = [
  /^server received,?\s*but no response/i,
  /^no players?\s*online/i,
  /^command not found/i,
  /^couldn't find/i,
  /^could not find/i,
];

function isEmptyResponse(raw) {
  const t = (raw || '').trim();
  if (!t) return true;
  return EMPTY_RESPONSES.some((re) => re.test(t));
}

/**
 * Récupère la position d'un joueur.
 * On essaye plusieurs syntaxes parce qu'ARK Ascended a un comportement
 * variable selon le build et les plugins installés:
 *   1. GetPlayerPos <EOSID>      ← le plus fiable si dispo
 *   2. GetPlayerPos <PlayerName>
 *   3. GetPlayerLocation <EOSID> ← variante exposée par certains plugins
 *
 * @param {string} serverId
 * @param {{name?: string, eos?: string}} target
 * @returns {Promise<string|null>}
 */
export async function getPlayerPos(serverId, target) {
  // Compat: si target est une string, on traite comme un nom
  if (typeof target === 'string') target = { name: target };
  const { name, eos } = target || {};

  const attempts = [];
  if (eos)  attempts.push(`GetPlayerPos ${eos}`);
  if (name) attempts.push(`GetPlayerPos ${name}`);
  if (eos)  attempts.push(`GetPlayerLocation ${eos}`);

  for (const cmd of attempts) {
    try {
      const r = (await send(serverId, cmd))?.trim();
      if (r && !isEmptyResponse(r)) return r;
    } catch {
      // on essaye la suivante
    }
  }
  return null;
}
