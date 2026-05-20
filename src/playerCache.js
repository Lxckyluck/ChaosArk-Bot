import { config } from './config.js';
import { listPlayers } from './rcon.js';
import { log } from './logger.js';

/**
 * Cache nom → EOSID par serveur, rafraîchi périodiquement et à la demande.
 * Permet d'enrichir les events join/leave avec l'EOSID même quand le log
 * ARK ne le contient pas.
 *
 * Structure: Map<serverId, { byName: Map<string, eosId>, byEos: Map<eosId, name>, lastUpdate }>
 */
const cache = new Map();

const REFRESH_INTERVAL = 30 * 1000;    // refresh régulier toutes les 30s
const STALE_AFTER     = 5 * 60 * 1000; // garde 5 min en mémoire après deco

function getEntry(serverId) {
  if (!cache.has(serverId)) {
    cache.set(serverId, {
      byName: new Map(),
      byEos:  new Map(),
      seenAt: new Map(), // pour expirer les entrées des déconnectés
      lastUpdate: 0,
    });
  }
  return cache.get(serverId);
}

export async function refresh(serverId) {
  const entry = getEntry(serverId);
  try {
    const players = await listPlayers(serverId);
    const now = Date.now();
    for (const { name, eosId } of players) {
      entry.byName.set(name, eosId);
      entry.byEos.set(eosId, name);
      entry.seenAt.set(eosId, now);
    }
    entry.lastUpdate = now;
    // Nettoyage des entrées trop vieilles
    for (const [eos, t] of entry.seenAt.entries()) {
      if (now - t > STALE_AFTER) {
        const name = entry.byEos.get(eos);
        entry.byEos.delete(eos);
        if (name) entry.byName.delete(name);
        entry.seenAt.delete(eos);
      }
    }
    return players;
  } catch (e) {
    log.debug(`playerCache refresh ${serverId} échoué: ${e.message}`);
    return null;
  }
}

export function getEOSByName(serverId, name) {
  const entry = getEntry(serverId);
  return entry.byName.get(name) || null;
}

export function getNameByEOS(serverId, eos) {
  const entry = getEntry(serverId);
  return entry.byEos.get(eos) || null;
}

// Pour une connexion : on tente immédiatement, puis retry après un délai
// si pas trouvé (le joueur n'est pas encore dans ListPlayers tout de suite).
export async function resolveEOSAfterJoin(serverId, name, maxAttempts = 4) {
  for (let i = 0; i < maxAttempts; i++) {
    const eos = getEOSByName(serverId, name);
    if (eos) return eos;
    await refresh(serverId);
    const eos2 = getEOSByName(serverId, name);
    if (eos2) return eos2;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

export function startAutoRefresh() {
  for (const server of config.servers) {
    // Premier refresh au démarrage
    refresh(server.id);
    setInterval(() => refresh(server.id), REFRESH_INTERVAL);
  }
  log.info(`playerCache: auto-refresh activé (interval ${REFRESH_INTERVAL / 1000}s) sur ${config.servers.length} serveur(s)`);
}
