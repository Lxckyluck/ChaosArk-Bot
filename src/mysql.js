import mysql from 'mysql2/promise';
import { config } from './config.js';
import { log } from './logger.js';

let banPool;
let shopPool;

export function getBanPool() {
  if (!banPool) {
    banPool = mysql.createPool({
      host: config.mysql.host,
      port: config.mysql.port,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.bans,
      waitForConnections: true,
      connectionLimit: 5,
    });
    log.info(`MySQL bans pool initialisé → ${config.mysql.bans}`);
  }
  return banPool;
}

export function getShopPool() {
  if (!shopPool) {
    shopPool = mysql.createPool({
      host: config.mysql.host,
      port: config.mysql.port,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.shop,
      waitForConnections: true,
      connectionLimit: 5,
    });
    log.info(`MySQL shop pool initialisé → ${config.mysql.shop}`);
  }
  return shopPool;
}

export async function listBans() {
  const [rows] = await getBanPool().execute(
    'SELECT eos_id, player_name, reason, banned_by, banned_at FROM eos_bans ORDER BY banned_at DESC'
  );
  return rows;
}
