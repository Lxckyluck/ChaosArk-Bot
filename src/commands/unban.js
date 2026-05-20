import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { broadcast } from '../rcon.js';
import { log } from '../logger.js';

export const data = new SlashCommandBuilder()
  .setName('unban')
  .setDescription('Débannir un EOSID sur tout le cluster')
  .addStringOption((o) => o.setName('eosid').setDescription('EOSID du joueur').setRequired(true));

export async function execute(interaction) {
  const eos = interaction.options.getString('eosid');
  await interaction.deferReply();

  const results = await broadcast(`UnbanEOS ${eos}`);
  const summary = Object.entries(results)
    .map(([id, res]) => `**${config.servers.find((s) => s.id === id).name}** : \`${res.split('\n')[0] || 'OK'}\``)
    .join('\n');

  const embed = new EmbedBuilder()
    .setColor(0x44ff44)
    .setTitle('✅ Unban EOSID')
    .addFields(
      { name: 'EOSID', value: `\`${eos}\``, inline: false },
      { name: 'Auteur', value: interaction.user.tag, inline: true },
      { name: 'Résultat', value: summary, inline: false }
    )
    .setTimestamp();

  log.info(`Unban ${eos} par ${interaction.user.tag}`);
  await interaction.editReply({ embeds: [embed] });

  const banChan = await interaction.client.channels.fetch(config.discord.channels.banLog).catch(() => null);
  if (banChan && banChan.id !== interaction.channelId) {
    banChan.send({ embeds: [embed] }).catch(() => {});
  }
}
