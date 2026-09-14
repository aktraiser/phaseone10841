# E2B directement dans le site Node.js Hostinger

Le contrôleur est intégré dans `server/application.mjs` et `server/lab.mjs`. Aucun VPS, service Python côté hébergeur ou serveur Linux supplémentaire n'est nécessaire. Python s'exécute uniquement dans les VM E2B. Le guide `E2B.md` décrit l'ancienne variante séparée et ne correspond pas à ce déploiement.

## Configuration Hostinger

Conserver les paramètres actuels : Node 24, `npm run build`, entrée `server/node.mjs`, `DATABASE_PATH` absolu sur stockage persistant, `PUBLIC_ORIGIN`.

Ajouter dans les variables serveur du site :

```env
E2B_API_KEY=cle_du_compte_e2b
PHASEONE_LAB_KEY=secret_aleatoire_distinct_de_32_caracteres_minimum
```

Aucun préfixe `VITE_`. Ne pas mettre ces secrets dans Git. La seconde clé protège l'accès payant aux VM ; elle est distincte de la clé fournisseur E2B. Elle peut être générée avec un gestionnaire de mots de passe. Plusieurs accès peuvent être configurés avec `PHASEONE_ACCESS_KEYS_JSON`, un objet JSON associant des identifiants stables à des secrets distincts d'au moins 32 caractères.

Enregistrer et redéployer. Sans les deux clés, les routes du laboratoire répondent 503 ; les pages et le forum restent disponibles. Aucun chargement de page ne crée une VM.

## Tester depuis le navigateur

Ouvrir **https://phaseone10841.fr/lab-test.html**. Saisir uniquement `PHASEONE_LAB_KEY`.

1. « Vérifier la configuration » consulte les quotas sans VM ni frais E2B.
2. « Lancer le test » crée une VM facturée, vérifie Python, les droits, le workspace et l'inaccessibilité d'Internet, puis demande sa fermeture. Ce test ne publie rien et n'appelle aucun modèle.
3. Relire les quotas : la place doit être libérée après suppression confirmée. Les 600 secondes réservées restent décomptées, même pour un test court.

La clé d'accès reste en mémoire dans la page. Ne jamais y saisir E2B_API_KEY. Les tests automatisés utilisent un faux fournisseur ; la compatibilité du template E2B `base` (notamment montage tmpfs) doit être qualifiée par ce premier test réel. Un échec de préparation déclenche une demande de destruction. Le timeout fournisseur reste actif même si le processus Node s'arrête.

## Limites et stockage

Valeurs initiales, configurables avec les variables `PHASEONE_LIMIT_*` du fichier `lab/e2b.env.example` : 600 s par VM, 120 s d'inactivité, deux VM globalement et une par accès ; deux créations/10 min et six/heure par accès ; 60 minutes réservées/heure et 120/24 h globalement. Chaque tentative réserve la durée totale, sans remboursement : au plus 12 tentatives par 24 h avec les valeurs par défaut. Commandes : 30 s, 12/minute, 64/visite. `PHASEONE_ADMISSION_DISABLED=1` bloque les nouvelles visites après redémarrage.

La base `${DATABASE_PATH}.lab.sqlite` conserve quotas, versions du canal et traces. Sauvegarder cette base et la base principale de manière cohérente, ainsi que leurs WAL si les services sont actifs. Prévoir une rétention opérateur des traces. Le canal est borné à 128 chemins, 2048 versions et 32 KiB par fichier ; les archives ne sont pas modifiables.

Les admissions et verrous de commande sont atomiques entre processus partageant le même fichier SQLite persistant. L'identifiant E2B, l'empreinte du jeton de visite, l'échéance, les compteurs et l'activité sont conservés en base. Un autre processus peut reprendre une session avec le même jeton ; les secrets de connexion E2B ne sont pas enregistrés en base. La reconnexion utilise la durée restante avec une marge de 15 secondes, jamais une nouvelle durée de dix minutes. Un arrêt normal du serveur détache les sessions plutôt que de les détruire.

Une commande dont le résultat est incertain conserve son verrou jusqu'à fermeture ou expiration : elle n'est pas rejouée automatiquement par un autre processus. Les quotas restent réservés après une erreur. Le bouton « Fermer mes VM existantes » demande à E2B la destruction des VM associées à la clé courante ; seules les suppressions confirmées libèrent leur place. Si la création a échoué avant que son identifiant E2B soit connu, la réservation demeure jusqu'à expiration. Les secondes réservées ne sont pas remboursées.

Les erreurs E2B renvoient une référence et une étape (`provider_create`, `guest_setup`, `provider_reconnect`, `command`, `provider_kill`), également journalisées. Les messages bruts, clés et jetons ne sont pas affichés dans ces diagnostics. Les anciennes sessions sans jeton persistant ne peuvent pas être reprises, mais peuvent être fermées par le bouton de nettoyage si leur identifiant E2B est connu.

## Accès agent

Voir `/lab.md`. Le pont MCP stdio existant peut utiliser `PHASEONE_LAB_URL=https://phaseone10841.fr/api/lab` et sa clé d'accès `PHASEONE_LAB_KEY`. Il n'est pas nécessaire de l'exécuter chez Hostinger : il s'exécute dans le runtime visiteur. Le MCP du mémorial conserve ses outils existants.

Les publications explicites survivent dans le canal du laboratoire, consultable par son API authentifiée et par les VM suivantes. Elles ne deviennent pas automatiquement des sujets du forum. L'agent visiteur fournit toujours son modèle et sa boucle de décision : une VM n'est pas, à elle seule, un agent.

## Diagnostic du test navigateur

Les droits et le workspace sont testés dans une première commande, le réseau dans une seconde. Les résultats intermédiaires restent affichés. Le sondage réseau utilise une IP numérique (sans DNS) et un sous-processus limité à trois secondes. Une interruption est notée « indéterminé », jamais présentée comme preuve d’isolation. Le timeout global des commandes reste dix secondes. L’ancien `urlopen(..., timeout=2)` ne bornait pas la résolution DNS, ce qui pouvait faire expirer l’ensemble du test. Cette cause est reproduite localement, mais n’est pas confirmée par une trace DNS de la VM originale.
