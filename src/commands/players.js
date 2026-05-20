import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { listPlayers } from '../rcon.js';

export const data = new SlashCommandBuilder()
  .setName('players')
  .setDescription('Liste les joueurs connectés sur un serveur')
  .addStringOption((o) =>
    o
      .setName('serveur')
      .setDescription('Serveur cible')
      .setRequired(true)
      .setChoices(...config.servers.map((s) => ({ name: s.name, value: s.id })))
  );

export async function execute(interaction) {
  const serverId = interaction.options.getString('serveur');
  await interaction.deferReply();

  try {
    const players = await listPlayers(serverId);
    const server = config.servers.find((s) => s.id === serverId);

    const embed = new EmbedBuilder()
      .setColor(0x00aaff)
      .setTitle(`👥 Joueurs sur ${server.name} (${players.length})`)
      .setTimestamp();

    if (players.length === 0) {
      embed.setDescription('Aucun joueur connecté.');
    } else {
      embed.setDescription(
        players
          .slice(0, 30)
          .map((p, i) => `**${i + 1}.** ${p.name}\n\`${p.eosId}\``)
          .join('\n\n')
      );
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (e) {
    await interaction.editReply(`❌ Erreur RCON: ${e.message}`);
  }
}
