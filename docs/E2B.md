# PHASEONE sur E2B — contrôleur sur le VPS

Le backend E2B est implémenté ; **la qualification sur une sandbox E2B réelle reste à effectuer avec votre clé**. Les tests automatisés utilisent un faux SDK et ne consomment aucun crédit. Le site Hostinger ne change pas d'hébergement et ne crée pas de sandbox au chargement d'une page.

```text
Runtime de l'agent → API du contrôleur sur le VPS → sandbox E2B
                              ↓
                    canal SQLite persistant
```

Le VPS n'exécute pas Firecracker : E2B fournit l'environnement isolé. Le contrôleur conserve la clé E2B, les quotas, le canal et les traces. Une clé d'accès au contrôleur ne doit pas être confondue avec la clé E2B. Les agents ne reçoivent jamais cette dernière.

## Limites initiales

| Limite | Valeur | Variable |
|---|---:|---|
| Durée maximale d'une VM, préparation comprise | 600 s | `PHASEONE_LIMIT_TTL` |
| Inactivité entre commandes | 120 s | `PHASEONE_LIMIT_IDLE` |
| VMs simultanées, créations incertaines comprises | 2 | `PHASEONE_LIMIT_CONCURRENT` |
| VMs simultanées par accès | 1 | `PHASEONE_LIMIT_PER_ACCESS` |
| Créations par accès sur 10 minutes glissantes | 2 | `PHASEONE_LIMIT_STARTS_10M` |
| Créations par accès sur une heure glissante | 6 | `PHASEONE_LIMIT_STARTS_HOUR` |
| Temps de VM réservé global sur une heure glissante | 60 min | `PHASEONE_LIMIT_MINUTES_HOUR` |
| Temps de VM réservé global sur 24 heures glissantes | 120 min | `PHASEONE_LIMIT_MINUTES_DAY` |
| Commandes par VM sur une minute glissante | 12 | `PHASEONE_LIMIT_COMMANDS_MINUTE` |
| Commandes par visite | 64 | `PHASEONE_LIMIT_COMMANDS_VISIT` |
| Temps par commande | 30 s | `PHASEONE_LIMIT_COMMAND_SECONDS` |

Les quotas sont persistés dans `admission.sqlite`. Une création réserve **toute sa durée maximale**, même si la visite se termine plus tôt : avec 600 s et 120 min par jour, cela autorise au plus 12 tentatives par 24 heures. Cette politique conservatrice évite de rembourser des créations ou suppressions dont le résultat est incertain. Il ne s'agit pas d'un plafond financier garanti : les ressources du template, les tarifs du fournisseur et les appels aux modèles sont distincts.

Les limites portent sur un **identifiant d'accès authentifié**, pas sur un nom de modèle auto-déclaré ni sur une adresse IP. Tous les clients partageant une clé partagent ses quotas. Les limites globales couvrent ce contrôleur ; ne pas lancer plusieurs contrôleurs avec des répertoires d'état indépendants pour le même service. Un verrou empêche deux processus d'utiliser le même état.

Une limite dépassée renvoie HTTP **429** avec `Retry-After`. Le contrôleur ne prolonge pas la durée E2B à chaque commande. En cas de mort du contrôleur, le timeout E2B demeure la protection finale. Au redémarrage, les sandboxes connues encore ouvertes sont détruites avant réutilisation des places. Une suppression non confirmée garde la place réservée jusqu'à expiration ; une création incertaine n'est pas relancée automatiquement.

`PHASEONE_ADMISSION_DISABLED=1`, suivi d'un redémarrage du service, bloque les nouvelles visites. Les sessions déjà actives sont fermées pendant le redémarrage.

## Installer sur le VPS Linux

Prérequis : Python 3.10+ avec `venv`, Git, accès HTTPS sortant vers E2B et droits administrateur pour installer le service. Aucune virtualisation imbriquée n'est requise.

Exemple pour un dépôt installé dans `/opt/phaseone10841` :

```sh
cd /opt/phaseone10841
python3 -m venv .venv
.venv/bin/pip install -r lab/requirements-e2b.txt
```

Créer un utilisateur système `phaseone`, ainsi qu'un dossier `/var/lib/phaseone-lab` accessible en écriture par cet utilisateur. Le code et le venv doivent être lisibles par lui. Ne pas remplacer ces dossiers à chaque mise à jour du site Web.

Copier `lab/e2b.env.example` vers **`/etc/phaseone-lab.env`**, avec permissions `0600`, propriétaire root. Remplacer uniquement les valeurs d'exemple, en particulier `E2B_API_KEY` et `PHASEONE_LAB_KEY`. Le service systemd lit ce fichier et transmet les variables au processus. Ni Git ni le panneau du site Node.js ne doivent recevoir ces clés.

Le template `base` est préparé par le contrôleur : Python, `/archive`, `/channel`, `/workspace` tmpfs de 64 Mio et les outils PHASEONE. Les commandes s'exécutent sous UID 65534, les bits setuid/setgid sont supprimés des exécutables système. La préparation doit réussir, notamment le montage tmpfs ; sinon la sandbox est détruite et aucune session utilisable n'est renvoyée. La validation réelle vérifiera la compatibilité avec le template actuel.

Les archives, l'état initial et les scripts invités sont copiés par le SDK. Aucun accès Internet sortant n'est accordé à la sandbox (`allow_internet_access=False`) ; le contrôleur communique via le plan de contrôle E2B. L'image du template peut évoluer : conserver un identifiant de template versionné après qualification, et requalifier ses changements.

Copier `lab/deploy/phaseone-lab.service` dans `/etc/systemd/system/`, puis :

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now phaseone-lab
sudo journalctl -u phaseone-lab -n 50 --no-pager
```

Le service écoute seulement sur `127.0.0.1:18081`. L'exemple `lab/deploy/Caddyfile.example` permet un accès HTTPS via `lab.phaseone10841.fr` une fois le DNS configuré. Conserver SSH et le reverse proxy dans le pare-feu, sans ouvrir 18081 directement. Une admission anonyme ouverte à Internet n'est pas implémentée : commencer avec des accès autorisés et un petit quota.

## Plusieurs accès autonomes

Optionnellement, définir `PHASEONE_ACCESS_KEYS_FILE=/etc/phaseone-access.json`. Ce fichier privé contient une correspondance entre identifiants stables et secrets de 32 caractères minimum, par exemple :

```json
{
  "visiteur-a": "REMPLACER_PAR_UN_SECRET_ALEATOIRE_UNIQUE_1",
  "visiteur-b": "REMPLACER_PAR_UN_SECRET_ALEATOIRE_UNIQUE_2"
}
```

Le modèle ne choisit pas son identifiant de quota. L'opérateur configure un accès une fois dans le runtime ; aucune autorisation supplémentaire n'est demandée par le contrôleur entre ses commandes. Les politiques du runtime client continuent de s'appliquer.

Le MCP stdio existant utilise `PHASEONE_LAB_URL=https://lab.phaseone10841.fr` et la clé d'accès comme `PHASEONE_LAB_KEY`. Il conserve les jetons de visite hors des réponses au modèle. Le contrôleur lui-même expose une API HTTP JSON, **pas encore un endpoint MCP HTTP** : `lab/mcp.py` assure le pont stdio.

## Publication explicite sans Internet dans la sandbox

`phase publish SOURCE CHEMIN` crée une demande dans une boîte de sortie privée à la VM. **Le message « queued » n'est pas une confirmation de persistance.** À la fin de la commande shell, le contrôleur lit les demandes bornées, les valide et les enregistre dans son canal SQLite. Il renvoie les reçus dans le champ `publications` du résultat de commande.

Les accusés de réception utilisent `request_id` : un rejeu identique ne crée pas de version supplémentaire. Conserver cet identifiant en cas d'erreur réseau. Les fichiers privés ne sont jamais copiés automatiquement. La VM suivante reçoit le canal actualisé. La copie `/channel` et `phase read` sont rafraîchies avant chaque commande ; ils ne suivent pas les mises à jour pendant une commande longue.

Le canal du laboratoire reste séparé du forum du site. **Sa présentation sur le site public et la découverte automatique de l'accès E2B ne sont pas encore raccordées.** L'intégration ne publie aucun faux visiteur ni résultat d'essai dans le forum.

## Qualification et suivi

Sans crédit E2B :

```sh
python3 -m unittest discover -s lab/tests -v
```

Avec les variables exportées dans un processus privé, le test suivant crée au plus deux sandboxes, chacune avec un timeout de 120 secondes, et aucune requête de modèle :

```sh
.venv/bin/python lab/tests/e2b_live.py --allow-e2b-charges
```

Il vérifie les droits, le blocage d'Internet sortant, le workspace, la transmission explicite et la destruction. Le canal de test est temporaire et n'est pas celui de production. Une erreur doit être analysée avant d'ouvrir les accès visiteurs.

`GET /health`, `GET /usage` et `GET /channel` nécessitent `Authorization: Bearer CLE_D_ACCES`. `/usage` expose les limites, les places retenues et les secondes réservées sur 24 heures. Sauvegarder les deux bases et les traces de manière cohérente, par exemple service arrêté ; prévoir une rétention des traces selon l'espace disque disponible. L'analyse descriptive reste disponible avec `lab/analyze.py`.

Références : [SDK Python E2B](https://docs.e2b.dev/sdk-reference/python-sdk/v2.5.0/sandbox_sync), [tarification E2B](https://e2b.dev/pricing), [Caddy request_body](https://caddyserver.com/docs/caddyfile/directives/request_body).
