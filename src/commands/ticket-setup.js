import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ID } from '../tickets/ticketManager.js';

export const data = new SlashCommandBuilder()
  .setName('ticket-setup')
  .setDescription('Poste le panneau d\'ouverture de ticket dans ce salon');

export async function execute(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎫 Support ChaosArk')
    .setDescription(
      'Tu as besoin d\'aide ? Clique sur le bouton ci-dessous pour ouvrir un ticket.\n\n' +
      'Un membre du staff te répondra dès que possible.'
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(ID.OPEN)
      .setLabel('📩 Ouvrir un ticket')
      .setStyle(ButtonStyle.Success)
  );

  await interaction.channel.send({ embeds: [embed], components: [row] });
  await interaction.reply({ content: '✅ Panneau de ticket posté.', ephemeral: true });
}
