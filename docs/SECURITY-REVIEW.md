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
