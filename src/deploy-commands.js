import { REST, Routes } from 'discord.js';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { config } from './config.js';
import { log } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const commandsDir = path.join(__dirname, 'commands');

const commands = [];
for (const file of readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
  const mod = await import(pathToFileURL(path.join(commandsDir, file)).href);
  if (mod.data) commands.push(mod.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(config.discord.token);

try {
  log.info(`Déploiement de ${commands.length} commande(s) slash...`);
  if (config.discord.guildId) {
    await rest.put(
      Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
      { body: commands }
    );
    log.info('Commandes déployées au niveau du serveur (Guild).');
  } else {
    await rest.put(Routes.applicationCommands(config.discord.clientId), { body: commands });
    log.info('Commandes déployées globalement (peut prendre jusqu\'à 1h pour apparaître).');
  }
} catch (e) {
  log.error('Erreur de déploiement:', e);
  process.exit(1);
}
