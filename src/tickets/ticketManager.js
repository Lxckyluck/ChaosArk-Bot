import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { config } from '../config.js';
import { send } from '../rcon.js';
import { log } from '../logger.js';

// customId prefixes
export const ID = {
  OPEN: 'ticket_open',
  CLOSE: 'ticket_close',
  RCON_BTN: 'ticket_rcon_btn',
  RCON_SELECT: 'ticket_rcon_select',
  RCON_MODAL: 'ticket_rcon_modal', // ticket_rcon_modal:<serverId>
};

export async function handleTicketInteraction(interaction) {
  const { customId } = interaction;

  if (customId === ID.OPEN) return openTicket(interaction);
  if (customId === ID.CLOSE) return closeTicket(interaction);
  if (customId === ID.RCON_BTN) return showServerSelect(interaction);
  if (customId.startsWith(ID.RCON_SELECT)) return showRconModal(interaction);
  if (customId.startsWith(ID.RCON_MODAL)) return executeRcon(interaction);
}

// ─── Ouvrir un ticket ────────────────────────────────────────────────────────

async function openTicket(interaction) {
  const guild = interaction.guild;
  const user = interaction.user;
  const categoryId = process.env.TICKET_CATEGORY_ID;
  const supportRoleId = process.env.TICKET_SUPPORT_ROLE_ID;

  // Vérifie si l'utilisateur a déjà un ticket ouvert
  const existing = guild.channels.cache.find(
    (ch) => ch.name === `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}` && ch.parentId === categoryId
  );
  if (existing) {
    return interaction.reply({
      content: `❌ Tu as déjà un ticket ouvert : ${existing}`,
      ephemeral: true,
    });
  }

  const permissionOverwrites = [
    { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  ];
  if (supportRoleId) {
    permissionOverwrites.push({
      id: supportRoleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
    });
  }

  const channel = await guild.channels.create({
    name: `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
    type: ChannelType.GuildText,
    parent: categoryId || null,
    permissionOverwrites,
  });

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎫 Ticket ouvert')
    .setDescription(`Bienvenue ${user} !\n\nDécris ton problème ci-dessous. L'équipe te répondra dès que possible.`)
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(ID.RCON_BTN).setLabel('💻 Commande RCON').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(ID.CLOSE).setLabel('🔒 Fermer le ticket').setStyle(ButtonStyle.Danger)
  );

  await channel.send({ content: `${user}${supportRoleId ? ` <@&${supportRoleId}>` : ''}`, embeds: [embed], components: [row] });

  await interaction.reply({ content: `✅ Ticket créé : ${channel}`, ephemeral: true });
  log.info(`Ticket ouvert par ${user.tag} → #${channel.name}`);
}

// ─── Fermer un ticket ────────────────────────────────────────────────────────

async function closeTicket(interaction) {
  await interaction.reply({ content: '🔒 Fermeture du ticket dans 5 secondes…' });
  log.info(`Ticket fermé par ${interaction.user.tag} → #${interaction.channel.name}`);
  setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
}

// ─── Sélection du serveur RCON ───────────────────────────────────────────────

async function showServerSelect(interaction) {
  const options = config.servers.map((s) => ({ label: s.name, value: s.id }));

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(ID.RCON_SELECT)
      .setPlaceholder('Choisir une map…')
      .addOptions(options)
  );

  await interaction.reply({ content: '🗺️ Sur quelle map veux-tu exécuter la commande ?', components: [row], ephemeral: true });
}

// ─── Modal saisie commande RCON ──────────────────────────────────────────────

async function showRconModal(interaction) {
  const serverId = interaction.values[0];
  const serverName = config.servers.find((s) => s.id === serverId)?.name ?? serverId;

  const modal = new ModalBuilder()
    .setCustomId(`${ID.RCON_MODAL}:${serverId}`)
    .setTitle(`RCON — ${serverName}`);

  const input = new TextInputBuilder()
    .setCustomId('rcon_cmd')
    .setLabel('Commande RCON')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('ex: GetChat, ListPlayers, DoExit…')
    .setRequired(true)
    .setMaxLength(500);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

// ─── Exécution RCON depuis ticket ────────────────────────────────────────────

async function executeRcon(interaction) {
  const serverId = interaction.customId.split(':')[1];
  const serverName = config.servers.find((s) => s.id === serverId)?.name ?? serverId;
  const cmd = interaction.fields.getTextInputValue('rcon_cmd');

  await interaction.deferReply();

  let result;
  try {
    result = await send(serverId, cmd);
  } catch (e) {
    result = `❌ Erreur RCON : ${e.message}`;
  }

  const embed = new EmbedBuilder()
    .setColor(0x4444ff)
    .setTitle(`💻 RCON — ${serverName}`)
    .addFields(
      { name: 'Commande', value: `\`${cmd}\`` },
      { name: 'Exécuté par', value: interaction.user.tag, inline: true }
    )
    .setDescription(`\`\`\`${(result || 'OK').slice(0, 3800)}\`\`\``)
    .setTimestamp();

  log.info(`RCON ticket "${cmd}" par ${interaction.user.tag} sur ${serverId}`);
  await interaction.editReply({ embeds: [embed] });
}
