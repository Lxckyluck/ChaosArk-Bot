import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { getShopPool } from '../mysql.js';
import { log } from '../logger.js';

// FusionShop stocke généralement les transactions dans une table de type
// "Transactions" ou "Logs" avec colonnes (id, player_id/eos, item, price, date).
// Le nom exact de la table dépend de la version — on essaie d'auto-détecter.
//
// Si ta table s'appelle autrement, modifie SHOP_TABLE et les colonnes.

const SHOP_TABLE = process.env.FUSIONSHOP_TABLE || 'Transactions';
const COL_ID     = process.env.FUSIONSHOP_COL_ID     || 'id';
const COL_PLAYER = process.env.FUSIONSHOP_COL_PLAYER || 'eos_id';
const COL_NAME   = process.env.FUSIONSHOP_COL_NAME   || 'player_name';
const COL_ITEM   = process.env.FUSIONSHOP_COL_ITEM   || 'item_name';
const COL_PRICE  = process.env.FUSIONSHOP_COL_PRICE  || 'price';
const COL_DATE   = process.env.FUSIONSHOP_COL_DATE   || 'created_at';

let lastSeenId = 0;
let started = false;

async function initLastId() {
  try {
    const [rows] = await getShopPool().execute(
      `SELECT MAX(\`${COL_ID}\`) AS maxId FROM \`${SHOP_TABLE}\``
    );
    lastSeenId = Number(rows[0]?.maxId) || 0;
    log.info(`FusionShop: lastSeenId initialisé à ${lastSeenId}`);
  } catch (e) {
    log.warn(`FusionShop: impossible de lire la table ${SHOP_TABLE} (${e.message}). Watcher désactivé.`);
    return false;
  }
  return true;
}

async function pollOnce(client) {
  try {
    const [rows] = await getShopPool().execute(
      `SELECT \`${COL_ID}\` AS id,
              \`${COL_PLAYER}\` AS eos,
              \`${COL_NAME}\` AS name,
              \`${COL_ITEM}\` AS item,
              \`${COL_PRICE}\` AS price,
              \`${COL_DATE}\` AS date
         FROM \`${SHOP_TABLE}\`
        WHERE \`${COL_ID}\` > ?
        ORDER BY \`${COL_ID}\` ASC
        LIMIT 50`,
      [lastSeenId]
    );
    if (rows.length === 0) return;

    const channel = await client.channels.fetch(config.discord.channels.shopLog).catch(() => null);
    if (!channel) return;

    for (const tx of rows) {
      const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle('🛒 Achat FusionShop')
        .addFields(
          { name: 'Joueur', value: tx.name || '?', inline: true },
          { name: 'EOSID', value: `\`${tx.eos || '?'}\``, inline: true },
          { name: 'Objet', value: tx.item || '?', inline: false },
          { name: 'Prix', value: String(tx.price ?? '?'), inline: true }
        )
        .setTimestamp(tx.date ? new Date(tx.date) : new Date());

      channel.send({ embeds: [embed] }).catch((e) => log.error('Send shop:', e.message));
      lastSeenId = tx.id;
    }
  } catch (e) {
    log.error('Poll FusionShop:', e.message);
  }
}

export async function startShopWatcher(client) {
  if (started) return;
  const ok = await initLastId();
  if (!ok) return;
  started = true;
  setInterval(() => pollOnce(client), config.fusionShop.pollInterval);
  log.info(`FusionShop watcher actif (interval ${config.fusionShop.pollInterval}ms)`);
}
