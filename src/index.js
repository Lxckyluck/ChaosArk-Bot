import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { config } from './config.js';
import { log } from './logger.js';
import { startPlayerEventsDbWatcher } from './watchers/playerEventsDb.js';
import { startAdminCommandWatcher } from './watchers/adminCommands.js';
import { startShopWatcher } from './watchers/shopWatcher.js';
import { startBanWatcher } from './watchers/banWatcher.js';
import { startAutoRefresh as startPlayerCache } from './playerCache.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});
client.commands = new Collection();

// Chargement des commandes
const commandsDir = path.join(__dirname, 'commands');
for (const file of readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
  const mod = await import(pathToFileURL(path.join(commandsDir, file)).href);
  if (mod.data && mod.execute) {
    client.commands.set(mod.data.name, mod);
  }
}
log.info(`${client.commands.size} commande(s) chargée(s).`);

client.once(Events.ClientReady, async (c) => {
  log.info(`Bot connecté en tant que ${c.user.tag}`);

  // Démarre les watchers
  try {
    startPlayerCache();  // utile pour /players (nom→EOSID)
  } catch (e) {
    log.error('Player cache:', e);
  }
  try {
    // Watcher MySQL: lit la table player_events (alimentée par plugin PlayerTracker)
    await startPlayerEventsDbWatcher(client);
  } catch (e) {
    log.error('Player events DB watcher:', e);
  }
  try {
    startAdminCommandWatcher(client);
  } catch (e) {
    log.error('Admin watcher:', e);
  }
  try {
    await startShopWatcher(client);
  } catch (e) {
    log.error('Shop watcher:', e);
  }
  try {
    await startBanWatcher(client);
  } catch (e) {
    log.error('Ban watcher:', e);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) return;
  try {
    await cmd.execute(interaction);
  } catch (e) {
    log.error(`Exec ${interaction.commandName}:`, e);
    const reply = { content: `❌ Erreur: ${e.message}`, ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

process.on('unhandledRejection', (e) => log.error('UnhandledRejection:', e));
process.on('uncaughtException', (e) => log.error('UncaughtException:', e));

client.login(config.discord.token);
