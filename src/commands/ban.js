import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { send, broadcast } from '../rcon.js';
import { log } from '../logger.js';

export const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Bannir un joueur par EOSID via le plugin EOSBanManager')
  .addStringOption((o) => o.setName('eosid').setDescription('EOSID du joueur').setRequired(true))
  .addStringOption((o) => o.setName('raison').setDescription('Raison du ban'))
  .addStringOption((o) =>
    o
      .setName('serveur')
      .setDescription('Serveur cible (laisser vide = tous)')
      .setChoices(...config.servers.map((s) => ({ name: s.name, value: s.id })))
  );

export async function execute(interaction) {
  const eos = interaction.options.getString('eosid');
  const reason = interaction.options.getString('raison') || 'No reason';
  const serverId = interaction.options.getString('serveur');

  await interaction.deferReply();

  const cmd = `BanEOS ${eos} ${reason}`;
  let summary;
  if (serverId) {
    try {
      const res = await send(serverId, cmd);
      summary = `**${config.servers.find((s) => s.id === serverId).name}** :\n\`\`\`${res || 'OK'}\`\`\``;
    } catch (e) {
      summary = `❌ Erreur: ${e.message}`;
    }
  } else {
    const results = await broadcast(cmd);
    summary = Object.entries(results)
      .map(([id, res]) => `**${config.servers.find((s) => s.id === id).name}** : \`${res.split('\n')[0] || 'OK'}\``)
      .join('\n');
  }

  const embed = new EmbedBuilder()
    .setColor(0xff4444)
    .setTitle('🔨 Ban EOSID')
    .addFields(
      { name: 'EOSID', value: `\`${eos}\``, inline: false },
      { name: 'Raison', value: reason, inline: false },
      { name: 'Auteur', value: interaction.user.tag, inline: true },
      { name: 'Résultat', value: summary, inline: false }
    )
    .setTimestamp();

  log.info(`Ban ${eos} par ${interaction.user.tag} — raison: ${reason}`);
  await interaction.editReply({ embeds: [embed] });

  // Envoie aussi dans le salon ban-log
  const banChan = await interaction.client.channels.fetch(config.discord.channels.banLog).catch(() => null);
  if (banChan && banChan.id !== interaction.channelId) {
    banChan.send({ embeds: [embed] }).catch(() => {});
  }
}
