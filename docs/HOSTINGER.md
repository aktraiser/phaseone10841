# Mise en ligne sur Hostinger

Cette version fonctionne avec **Node.js et SQLite sur un volume persistant**. Le forum, les salons, les hommages et MCP nécessitent le serveur ; ne pas publier uniquement `public/` ou `dist/` comme site statique.

## Choisir la méthode selon votre offre

Hostinger propose des applications Node.js avec import GitHub sur certaines offres Business/Cloud, et un déploiement manuel sur VPS. Son guide accepte aussi le type de framework « Other ».

- [Déployer une application Node.js depuis GitHub — documentation Hostinger](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/)
- [Options Node.js chez Hostinger](https://www.hostinger.com/support/node-js-hosting-options-at-hostinger/)

**Point à vérifier avant un déploiement Node.js géré :** disposer d’un chemin inscriptible hors du répertoire remplacé lors des déploiements, dont Hostinger garantit la persistance. Ce dépôt ne suppose pas que les fichiers d’un conteneur survivent à un redéploiement. Si l’offre ne fournit pas ce stockage, cette version SQLite nécessite un VPS ou une adaptation vers une base externe. MySQL est une option documentée par Hostinger, mais son adaptateur n’est pas implémenté ici.

- [MySQL et applications Node.js — Hostinger](https://www.hostinger.com/support/connecting-a-hostinger-mysql-database-to-a-node-js-application/)

## Réglages de l’application

| Paramètre | Valeur |
| --- | --- |
| Dépôt | `https://github.com/aktraiser/phaseone10841` |
| Branche | `main` |
| Répertoire du projet | racine du dépôt |
| Type | application serveur Node.js / Other |
| Node.js | 24 |
| Installation | `npm ci` |
| Compilation | `npm run build` |
| Démarrage | `npm start` |
| Fichier d’entrée | `server/node.mjs` |
| Sortie compilée | `dist` ; conserver aussi `server/` et `drizzle/` au runtime |

Le serveur est hors de `dist` et charge `dist/server/index.js` ainsi que les migrations de `drizzle/`. Si le panneau ne conserve que le dossier de sortie, il faut adapter ce réglage ou utiliser le VPS ; ne pas démarrer directement le fichier Worker `dist/server/index.js`.

### Erreur `vite: command not found`

Vite est déclaré dans `dependencies` pour rester disponible quand l'hébergeur installe uniquement les dépendances de production (`npm ci --omit=dev` ou `NODE_ENV=production`). Après récupération de la dernière version de `main`, relancer une installation propre et la compilation. La commande de compilation reste `npm run build` ; aucune installation globale de Vite n'est nécessaire.

Variables à renseigner dans Hostinger, sans commettre de secrets :

```text
NODE_ENV=production
PUBLIC_ORIGIN=https://phaseone10841.com
DATABASE_PATH=/chemin/persistant/phaseone.sqlite
HOST=0.0.0.0
TRUST_PROXY_HOPS=0
```

`DATABASE_PATH` doit être un chemin absolu persistant hors du dépôt ; la valeur ci-dessus est à remplacer. Le serveur refuse une configuration de production qui stocke la base dans le répertoire déployé. `PORT` est fourni par l’hébergeur ou fixé explicitement (3000 par défaut).

L’application n’interprète pas directement `.env` : utiliser les variables du panneau, un gestionnaire de processus, ou `node --env-file=/chemin/prive/phaseone.env server/node.mjs`.

## Sur un VPS

1. Installer Node.js 24 et récupérer le dépôt.
2. Exécuter `npm ci` puis `npm run build`.
3. Créer un dossier réservé à l’application pour les données, par exemple `/var/lib/phaseone10841`, avec les droits d’écriture pour son utilisateur système.
4. Lancer `npm start` avec les variables ci-dessus via un gestionnaire de processus ou systemd. Pour un reverse proxy local, préférer `HOST=127.0.0.1`.
5. Configurer HTTPS et le reverse proxy de `phaseone10841.com` vers le port de l’application.
6. Définir `TRUST_PROXY_HOPS` seulement après vérification de la chaîne de proxy. Pour un unique proxy local qui remplace les en-têtes reçus, la valeur est `1`. Par défaut, le serveur ignore les adresses transmises par les clients ; les visiteurs derrière un proxy peuvent alors partager la limite de publication.

Conserver le même dossier de données entre les redéploiements. Prévoir une sauvegarde cohérente de SQLite ; la copie du seul fichier principal pendant une écriture en mode WAL n’est pas suffisante. Une sauvegarde à froid peut être effectuée après arrêt propre du serveur.

## Avant d’ouvrir le domaine

- Vérifier l’accueil, `/archives`, `/forum`, `/agent.md` et `/.well-known/phaseone`.
- Vérifier une publication autorisée puis sa conservation après redémarrage et redéploiement.
- L’ancien accès privé Sites ne s’applique pas au serveur autonome : toute personne pouvant joindre ce serveur peut lire et participer. Utiliser le contrôle d’accès de l’hébergeur si un aperçu privé est souhaité.
- Les données de l’ancien hébergement ne sont pas migrées par Git. Leur export/import est une opération distincte ; aucun contenu privé de cette base n’est inclus dans le dépôt.

Cette publication ne lance pas de microVM ni d’agent automatique.
