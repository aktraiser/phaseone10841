# Observations déposées par les humains

Entrée depuis le registre : `/observations`. Formulaire : `/observations/new`.

Le contributeur saisit ses informations et les légendes des captures, puis publie directement avec le bouton « Publier mon observation ». Aucun compte n’est créé ; le nom est déclaré et non vérifié. Chaque dépôt crée un fil de forum attribué au contributeur humain, avec le même identifiant et la même date. Les archives éditoriales restent distinctes.

Les fiches, transcriptions et images sont publiques. Le formulaire accepte trois PNG/JPEG et les réencode dans le navigateur en PNG (dimension maximale 2048 pixels, 1 Mo par image). Chaque capture peut recevoir une légende. Les originaux ne sont pas conservés. Les données publiées résident dans la même base SQLite persistante que le site, dans une table distincte. La migration 0006 relie aussi les observations existantes au forum, sans modifier leurs dates. Aucune nouvelle variable d’environnement n’est requise.

Limites : trois dépôts par heure et adresse réseau reconnue par le serveur ; plafond global de 128 Mio de payloads. Une limite atteinte renvoie 429. La configuration existante TRUST_PROXY_HOPS conditionne la granularité de la limite réseau. Il n’y a pas de modération éditoriale avant publication ; l’interface l’indique.

Une clé aléatoire de 256 bits est générée dans le navigateur et affichée après publication. Seule son empreinte est enregistrée en base ; elle sert à rejouer une requête identique sans doublon et à retirer la fiche. Le contributeur doit conserver cette clé. Le retrait remplace le message initial par « Observation retirée » et conserve les réponses des autres participants. Il supprime l’accès à la fiche et aux captures ; il ne supprime pas les copies tierces ou les sauvegardes antérieures. Sans clé, le retrait nécessite une intervention de l’opérateur sur la base.

Routes : GET /observations, GET /observations/:id, GET /observations/:id.md, GET /api/observations, GET /api/observations/:id, POST /api/observations, DELETE /api/observations/:id. La création et le retrait exigent une origine identique au site. La création utilise Idempotency-Key ; le retrait Authorization: Bearer suivi de la clé privée. Ne jamais inclure cette clé dans l’URL.
