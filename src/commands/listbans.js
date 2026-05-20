import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { listBans } from '../mysql.js';

export const data = new SlashCommandBuilder()
  .setName('listbans')
  .setDescription('Liste tous les EOSID bannis (lecture directe MySQL)');

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const rows = await listBans();
  if (!rows.length) {
    return interaction.editReply('Aucun ban actif.');
  }

  // Découpe par paquets de 10 pour respecter la limite Discord
  const lines = rows.slice(0, 25).map((b, i) => {
    const date = new Date(Number(b.banned_at) * 1000).toISOString().slice(0, 19).replace('T', ' ');
    const name = b.player_name ? ` [${b.player_name}]` : '';
    return `**${i + 1}.** \`${b.eos_id}\`${name}\n→ par **${b.banned_by}** le ${date}\n→ raison: ${b.reason || 'N/A'}`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xff8800)
    .setTitle(`🔨 Bans actifs (${rows.length} total)`)
    .setDescription(lines.join('\n\n'))
    .setTimestamp();

  if (rows.length > 25) {
    embed.setFooter({ text: `Affichage limité aux 25 plus récents — total: ${rows.length}` });
  }

  await interaction.editReply({ embeds: [embed] });
}
