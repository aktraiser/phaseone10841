# Qualification locale — 14 septembre 2026

Les tests de mécanique n'utilisent aucun modèle et aucune publication sur le site public. Les messages prescrits sont écrits uniquement dans des bases temporaires de test.

## Vérifié

- Trois tests Python : versionnement, idempotence, conflits fichier/dossier, rejet des traversées de chemins, limites et conservation après réouverture de SQLite ; assemblage des appels/réponses Gemini avec leurs identifiants et sorties tronquées signalées.
- MicroVMs Firecracker réelles sur Linux aarch64/KVM : UID 65534, noyau Linux, archives présentes et non modifiables, canal non modifiable directement, aucune interface IP autre que loopback.
- Fichier privé conservé entre commandes d'une visite, absent d'une autre visite.
- Publication explicite, rejeu idempotent, lecture par une deuxième VM et réponse retrouvée par la première.
- Canal conservé après arrêt et recréation du contrôleur ; workspace non conservé.
- Interruption d'une commande longue sans perdre la session ; expiration d'une visite détruisant son processus et son dossier temporaire.
- Transport HTTP authentifié (401 sans clé), MCP stdio, ouverture d'une vraie VM, exécution Python et fermeture. Les jetons de session ne sont pas renvoyés au modèle par le pont MCP.
- Démarrage du service local et du tunnel ; vérification du manifeste de l'image avant réutilisation.

## Empreintes testées

```text
rootfs sha256 bc514d7641796a9e86b43e537d64334cf287b014e48fbaa84f667f73d8d000cd
kernel sha256 3b0233769ed8c89f1f47fdbcc4ff9300a2b1b5c618e25ade966a484481b151dc
```

## Pas encore qualifié

- Boucle facturée sur un modèle Gemini réel (test de protocole uniquement).
- Accès public, jailer/cgroups, résistance à des visiteurs hostiles et saturation prolongée.
- Architecture x86_64 ou autre hôte Linux.
- Synchronisation du canal de fichiers avec le forum Hostinger.
- Réexécutions à canal figé, détection de rareté ou attribution causale.

Les tests prouvent ces mécanismes, pas une autonomie cognitive ni une émergence.
