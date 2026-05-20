import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { getShopPool } from '../mysql.js';
import { log } from '../logger.js';

// Table FusionShop (format réel observé): `_shoplog`
// Colonnes utiles:
//   eosId          - EOSID du joueur
//   descr          - Description lisible de l'achat ("Kit Starter", etc.)
//   timestamp      - Unix timestamp de l'event
//   amount         - Quantité
//   points_change  - Variation de points
//   newpoints      - Nouveau total
//   isBuy / isSell / isRedeem - Type de transaction
//   serverid       - ID du serveur (numérique)

const TABLE = process.env.FUSIONSHOP_TABLE || '_shoplog';

let lastSeenTs = 0;
let started = false;
const POLL_INTERVAL = config.fusionShop.pollInterval; // par défaut 30s

async function initLastTs() {
  try {
    const [rows] = await getShopPool().execute(
      `SELECT MAX(timestamp) AS maxTs FROM \`${TABLE}\``
    );
    lastSeenTs = Number(rows[0]?.maxTs) || Math.floor(Date.now() / 1000);
    log.info(`FusionShop: lastSeenTs initialisé à ${lastSeenTs}`);
    return true;
  } catch (e) {
    log.warn(`FusionShop: table ${TABLE} introuvable (${e.message}). Watcher désactivé.`);
    return false;
  }
}

function txTypeLabel(row) {
  if (row.isBuy)    return { label: '🛒 Achat',       color: 0xffd700 };
  if (row.isSell)   return { label: '💰 Vente',       color: 0x44dd44 };
  if (row.isRedeem) return { label: '🎁 Redeem',      color: 0x44aaff };
  return { label: '📦 Transaction', color: 0x999999 };
}

async function pollOnce(client) {
  try {
    const [rows] = await getShopPool().execute(
      `SELECT eosId, descr, timestamp, amount, points_change, newpoints,
              isBuy, isSell, isRedeem, serverid
         FROM \`${TABLE}\`
        WHERE timestamp > ?
        ORDER BY timestamp ASC
        LIMIT 100`,
      [lastSeenTs]
    );
    if (rows.length === 0) return;

    const channel = await client.channels.fetch(config.discord.channels.shopLog).catch(() => null);
    if (!channel) {
      lastSeenTs = Number(rows[rows.length - 1].timestamp);
      return;
    }

    for (const r of rows) {
      const { label, color } = txTypeLabel(r);

      const fields = [
        { name: 'EOSID',    value: `\`${r.eosId || '?'}\``,           inline: false },
        { name: 'Item',     value: r.descr || '_(sans description)_', inline: true  },
        { name: 'Quantité', value: String(r.amount ?? 1),             inline: true  },
      ];

      if (r.points_change != null && r.points_change !== 0) {
        const sign = r.points_change > 0 ? '+' : '';
        fields.push({ name: 'Points', value: `${sign}${r.points_change}`, inline: true });
      }
      if (r.newpoints != null) {
        fields.push({ name: 'Solde restant', value: String(r.newpoints), inline: true });
      }

      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`${label} FusionShop`)
        .addFields(fields)
        .setTimestamp(new Date(Number(r.timestamp) * 1000));

      channel.send({ embeds: [embed] }).catch((e) => log.error('Send shop:', e.message));
      lastSeenTs = Math.max(lastSeenTs, Number(r.timestamp));
    }
  } catch (e) {
    log.error('Poll FusionShop:', e.message);
  }
}

export async function startShopWatcher(client) {
  if (started) return;
  const ok = await initLastTs();
  if (!ok) return;
  started = true;
  setInterval(() => pollOnce(client), POLL_INTERVAL);
  log.info(`FusionShop watcher actif sur \`${TABLE}\` (interval ${POLL_INTERVAL}ms)`);
}
