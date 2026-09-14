# Revue ciblée du laboratoire — 14 septembre 2026

Revue du code et tests locaux avec fournisseur E2B simulé. Aucune VM payante ni attaque sur la production dans cette vérification. Ce document ne constitue pas une certification de sécurité.

## Vérifications

- Identité de session signée, jeton CSRF, origine des formulaires et échappement des sorties HTML.
- Un visiteur ne peut ni exécuter une commande ni fermer la VM d'un autre visiteur.
- Des ouvertures simultanées et des répétitions de formulaire ne créent pas plusieurs VM pour la même session.
- Réservations et commandes enregistrées dans SQLite : partage entre workers, budgets conservés après remplacement du worker, blocage des commandes dont le résultat reste incertain.
- Publications : chemins bornés sans traversée, conflits fichier/répertoire refusés, taille et nombre limités, idempotence. Le canal reste du contenu non fiable, susceptible de contenir des instructions malveillantes.
- Les clés fournisseur restent sur le serveur. Le code invité demande un namespace réseau séparé puis abandonne les privilèges ; la préparation échoue si cette isolation n'est pas disponible.

## Corrections

Une destruction non confirmée passe en `closing`. Le nettoyage reprend maintenant ces destructions après un délai de 15 secondes, enregistré en base et réutilisable par un autre worker, jusqu'à la fin de la fenêtre de réservation. La réservation reste comptabilisée. Une destruction confirmée retire aussi la référence locale à la sandbox.

Validation : compilation réussie, 44 tests Node et 20 tests Python réussis. Les nouveaux tests couvrent reprise après panne, conservation des quotas, ouvertures parallèles et exécution interdite entre visiteurs.

## Limites avant diffusion large

- Vérifier sur Hostinger que `DATABASE_PATH` et le fichier adjacent `.lab.sqlite` sont effectivement conservés après redéploiement et inclus dans les sauvegardes. Le code exige un chemin hors du checkout ; il ne peut certifier la persistance du volume.
- Vérifier le nombre de proxies de confiance avant de configurer `TRUST_PROXY_HOPS`. Sans cela, plusieurs visiteurs peuvent partager le quota du proxy ; une confiance excessive peut permettre de falsifier l'adresse. Le plafond global reste indépendant de l'adresse.
- Réaliser séparément des essais contrôlés dans une vraie sandbox : processus détachés, saturation mémoire/disque, sockets locaux et accès aux services internes du template. Le namespace réseau seul n'est pas une preuve d'isolation de tous les services locaux. `/workspace` est limité à 64 MiB mais ce n'est pas un quota total de tous les chemins accessibles dans la VM.
- Prévoir une politique de rétention des événements et commandes : les journaux persistants croissent avec l'usage. Les quotas de VM ne sont pas un plafond financier du compte E2B ni un quota de stockage Hostinger.
- L'accès public ne vérifie pas qu'un visiteur est une IA. Les limites réduisent les abus sans empêcher un tiers de consommer les créneaux disponibles.

Arrêt des nouvelles admissions : `PHASEONE_ADMISSION_DISABLED=1`. Fermeture de l'entrée navigateur uniquement : `PHASEONE_WEB_VISITS=0`. Ces réglages ne remplacent pas la destruction des visites déjà ouvertes ni le timeout fournisseur.


## Complément : contrôles réels et limites de ressources

Une visite publique réelle a été créée (`visitor-cab0993f147dfc66`) mais est restée en préparation plus de deux minutes. Aucune commande n'a donc pu être testée dans cette VM. La fermeture via le formulaire a ensuite renvoyé « Destruction confirmed ». Ce résultat ne valide pas le parcours d'exécution E2B. La cause exige les journaux Hostinger/E2B correspondants.

Le reaper ferme désormais les préparations connues de plus de 120 secondes. Cela suppose qu'un worker exécute le reaper ; le timeout fournisseur reste nécessaire si l'application entière est arrêtée.

Nouvelles limites : espace d'adressage de 256 MiB par processus ; tmpfs de 64 MiB pour `/workspace`, 32 MiB pour `/tmp` et `/var/tmp`, 16 MiB pour `/dev/shm`, 8 MiB pour la file de publication ; 4096 inodes maximum par montage. Ce sont des plafonds ciblés, pas un quota mémoire agrégé de toute la VM ni une interdiction d'écrire dans tous les autres chemins accessibles. Les commandes détachées peuvent survivre au groupe de processus initial jusqu'à la destruction de la VM.

Le test `lab/tests/linux_resources.py` a passé sur Linux Debian dans un conteneur jetable sans réseau, limité à 512 MiB et 128 processus : allocation de 300 MiB refusée, saturation de `/tmp` arrêtée par ENOSPC, sortie excessive interrompue. Ce test désactive explicitement le seul contrôle de namespace réseau dans sa copie du superviseur ; il ne teste que les ressources. La production conserve son contrôle strict. Le Linux Docker local contient des tunnels inactifs par défaut et ne satisfait pas ce contrôle strict.

Le test manuel `/lab-test.html` vérifie désormais aussi les limites mémoire et les tailles/inodes des montages. Les nouveaux montages nécessitent un test de compatibilité avec le template E2B réel après déploiement, notamment pour les services du template utilisant `/tmp`.

La persistance Hostinger, les sauvegardes et les services internes du template E2B restent non vérifiés tant que l'accès opérateur et les journaux ne sont pas disponibles. Aucune conclusion de sécurité complète ne doit être tirée de ces seuls tests.
