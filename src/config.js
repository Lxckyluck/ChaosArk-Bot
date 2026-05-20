import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const configPath = path.join(root, 'config.json');
if (!fs.existsSync(configPath)) {
  console.error(`config.json introuvable à ${configPath}. Copie config.example.json → config.json`);
  process.exit(1);
}

const serversConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

export const config = {
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId: process.env.DISCORD_GUILD_ID,
    channels: {
      connect: process.env.CHANNEL_CONNECT,
      adminLog: process.env.CHANNEL_ADMIN_LOG,
      shopLog: process.env.CHANNEL_SHOP_LOG,
      banLog: process.env.CHANNEL_BAN_LOG,
    },
  },
  mysql: {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    bans: process.env.MYSQL_DATABASE_BANS || 'ark_bans',
    shop: process.env.MYSQL_DATABASE_SHOP || 'fusionshop',
  },
  servers: serversConfig.servers,
  options: serversConfig.options || {},
  fusionShop: {
    pollInterval: parseInt(process.env.FUSIONSHOP_POLL_INTERVAL || '30', 10) * 1000,
  },
};

// Vérifie qu'on a bien tout
if (!config.discord.token || !config.discord.clientId) {
  console.error('DISCORD_TOKEN et DISCORD_CLIENT_ID requis dans .env');
  process.exit(1);
}
if (!config.servers || config.servers.length === 0) {
  console.error('config.json doit contenir au moins 1 serveur');
  process.exit(1);
}

export function getServer(id) {
  return config.servers.find((s) => s.id === id);
}
