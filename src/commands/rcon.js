import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { send, broadcast } from '../rcon.js';
import { log } from '../logger.js';

export const data = new SlashCommandBuilder()
  .setName('rcon')
  .setDescription('Exécute une commande RCON brute sur un ou tous les serveurs')
  .addStringOption((o) => o.setName('commande').setDescription('Commande à exécuter').setRequired(true))
  .addStringOption((o) =>
    o
      .setName('serveur')
      .setDescription('Serveur cible (laisser vide = tous)')
      .setChoices(...config.servers.map((s) => ({ name: s.name, value: s.id })))
  );

export async function execute(interaction) {
  const cmd = interaction.options.getString('commande');
  const serverId = interaction.options.getString('serveur');
  await interaction.deferReply();

  let output;
  if (serverId) {
    try {
      const res = await send(serverId, cmd);
      output = `**${config.servers.find((s) => s.id === serverId).name}** :\n\`\`\`${(res || 'OK').slice(0, 1500)}\`\`\``;
    } catch (e) {
      output = `❌ ${e.message}`;
    }
  } else {
    const results = await broadcast(cmd);
    output = Object.entries(results)
      .map(
        ([id, res]) =>
          `**${config.servers.find((s) => s.id === id).name}** :\n\`\`\`${(res || 'OK').slice(0, 800)}\`\`\``
      )
      .join('\n');
  }

  const embed = new EmbedBuilder()
    .setColor(0x4444ff)
    .setTitle('💻 RCON')
    .addFields(
      { name: 'Commande', value: `\`${cmd}\``, inline: false },
      { name: 'Auteur', value: interaction.user.tag, inline: true }
    )
    .setDescription(output.slice(0, 3500))
    .setTimestamp();

  log.info(`RCON "${cmd}" par ${interaction.user.tag} sur ${serverId || 'all'}`);
  await interaction.editReply({ embeds: [embed] });
}
