# ChaosArk Discord Bot

Bot Discord en Node.js pour piloter un cluster ARK: Survival Ascended via RCON, avec logs détaillés vers Discord.

## Fonctionnalités

**Commandes slash :**
- `/ban eosid:<> raison:<> serveur:<>` — Bannit un EOSID (via le plugin EOSBanManager)
- `/unban eosid:<>` — Débannit sur tout le cluster
- `/listbans` — Liste les bans actifs (lecture MySQL directe)
- `/rcon commande:<> serveur:<>` — Exécute n'importe quelle commande RCON
- `/players serveur:<>` — Liste les joueurs en ligne

**Logs automatiques vers Discord (un salon par type) :**
- 🟢🔴 Connexions / déconnexions avec carte et position
- ⚡ Commandes admin (cheat) avec nom et EOSID de l'auteur
- 🛒 Achats FusionShop (joueur, item, prix)
- 🔨 Bans / unbans (issus des commandes du bot ou directement en jeu)

## Prérequis

- **Node.js 18+** sur Windows Server 2022 (https://nodejs.org/)
- Le plugin **EOSBanManager** fonctionnel sur ton serveur ARK (sinon `/ban` ne marchera pas)
- **MySQL** avec les bases `ark_bans` (créée par le plugin) et `fusionshop` (créée par FusionShop)
- **RCON activé** sur chaque serveur ARK (`?RCONEnabled=True?RCONPort=27020` dans GameUserSettings.ini ou ligne de commande)
- Un **bot Discord** créé via https://discord.com/developers/applications avec :
  - Bot Token noté
  - Intents : `Guilds` (rien d'autre nécessaire)
  - Scopes OAuth2 : `bot` + `applications.commands`
  - Permissions : Send Messages, Embed Links, Use Slash Commands

## Installation

```powershell
cd C:\Users\Administrator\Documents\Code\Plugin-EOSBanManager\discord-bot
npm install
```

Crée `.env` (copie depuis `.env.example`) :

```env
DISCORD_TOKEN=tonbottoken
DISCORD_CLIENT_ID=1234567890
DISCORD_GUILD_ID=1234567890

CHANNEL_CONNECT=1234567890
CHANNEL_ADMIN_LOG=1234567890
CHANNEL_SHOP_LOG=1234567890
CHANNEL_BAN_LOG=1234567890

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=ark_ban
MYSQL_PASSWORD=...
MYSQL_DATABASE_BANS=ark_bans
MYSQL_DATABASE_SHOP=fusionshop

FUSIONSHOP_POLL_INTERVAL=30
```

Crée `config.json` (copie depuis `config.example.json`) :

```json
{
  "servers": [
    {
      "id": "abberation",
      "name": "Aberration",
      "rcon": { "host": "127.0.0.1", "port": 27020, "password": "..." },
      "logFile": "D:\\ChaosArk\\ClusterSolo\\Abberation\\ShooterGame\\Saved\\Logs\\ShooterGame.log"
    },
    {
      "id": "island",
      "name": "The Island",
      "rcon": { "host": "127.0.0.1", "port": 27021, "password": "..." },
      "logFile": "D:\\ChaosArk\\ClusterSolo\\Island\\ShooterGame\\Saved\\Logs\\ShooterGame.log"
    }
  ],
  "options": { "playerLocationLookup": true }
}
```

## Déploiement des slash commands

À faire une fois après installation, puis à chaque modif de commande :

```powershell
npm run deploy
```

Si tu as mis un `DISCORD_GUILD_ID` dans `.env`, les commandes apparaissent immédiatement sur ce serveur. Sans guildId, c'est global mais peut prendre jusqu'à 1h.

## Lancement

```powershell
npm start
```

Tu dois voir :
```
[INFO ] X commande(s) chargée(s).
[INFO ] Bot connecté en tant que TonBot#1234
[INFO ] Tail démarré: D:\ChaosArk\...\ShooterGame.log
[INFO ] FusionShop watcher actif (interval 30000ms)
```

## Lancement comme service Windows (production)

Le plus simple est d'utiliser **nssm** (Non-Sucking Service Manager) :

```powershell
# Télécharge nssm depuis https://nssm.cc/ et place nssm.exe dans le PATH
nssm install ChaosArkBot "C:\Program Files\nodejs\node.exe" "C:\Users\Administrator\Documents\Code\Plugin-EOSBanManager\discord-bot\src\index.js"
nssm set ChaosArkBot AppDirectory "C:\Users\Administrator\Documents\Code\Plugin-EOSBanManager\discord-bot"
nssm set ChaosArkBot AppStdout "C:\Users\Administrator\Documents\Code\Plugin-EOSBanManager\discord-bot\bot.log"
nssm set ChaosArkBot AppStderr "C:\Users\Administrator\Documents\Code\Plugin-EOSBanManager\discord-bot\bot.err.log"
nssm start ChaosArkBot
```

Le bot redémarrera tout seul en cas de crash et au boot de la machine.

## Configuration FusionShop

Le watcher MySQL utilise par défaut une table `Transactions` avec les colonnes `id`, `eos_id`, `player_name`, `item_name`, `price`, `created_at`. Si ton FusionShop utilise d'autres noms, override-les dans `.env` :

```env
FUSIONSHOP_TABLE=ShopLogs
FUSIONSHOP_COL_ID=transaction_id
FUSIONSHOP_COL_PLAYER=buyer_eos
FUSIONSHOP_COL_NAME=buyer_name
FUSIONSHOP_COL_ITEM=item
FUSIONSHOP_COL_PRICE=cost
FUSIONSHOP_COL_DATE=timestamp
```

Pour identifier le nom exact de la table et des colonnes :
```sql
USE fusionshop;
SHOW TABLES;
DESCRIBE <nom_de_la_table>;
```

## Patterns de regex pour parsing logs

Les patterns dans `watchers/playerEvents.js` et `watchers/adminCommands.js` essaient plusieurs formats de lignes ShooterGame.log. ARK et AsaApi changent parfois ces formats — si tu vois que ça ne capture pas correctement les events, ouvre `ShooterGame.log`, repère une ligne typique de connexion ou de cheat, et adapte les regex en haut de chaque fichier.

## Sécurité

- **Restreins les slash commands aux admins Discord** via les permissions de canaux ou en utilisant Discord's command permissions
- Ne commit JAMAIS ton `.env` ni `config.json` (le `.gitignore` est déjà configuré)
- Utilise un compte MySQL dédié (`ark_ban`) avec les seuls droits sur les bases nécessaires

## Dépannage

- **"config.json introuvable"** → copie `config.example.json` → `config.json` et édite
- **Slash commands invisibles** → relance `npm run deploy` et vérifie que `DISCORD_GUILD_ID` matche bien ton serveur
- **"Cannot connect to RCON"** → vérifie que RCON est activé sur ton serveur ARK et que le port est ouvert dans le firewall
- **Aucune ligne de log capturée** → vérifie le chemin `logFile` dans `config.json`, et regarde si les regex correspondent à ton format de log
- **Erreurs MySQL** → assure-toi que l'utilisateur `ark_ban` a les droits sur la base `fusionshop` aussi (sinon : `GRANT SELECT ON fusionshop.* TO 'ark_ban'@'localhost';`)
