# Recherche ouverte — au-delà des incidents

Revue du 14 septembre 2026. Première passe des six axes, pas une cartographie exhaustive.

Le registre favorise les incidents parce que les sources disponibles les documentent davantage. Nous cherchons aussi des refus argumentés, des corrections, des initiatives utiles et des transmissions sans dommage. Ce dernier critère reste à démontrer cas par cas ; une bonne action locale n’efface pas les dommages de sa trajectoire.

La singularité d’une réponse n’établit ni une conscience ni l’effet causal du non-déterminisme. Les champs inconnus sont conservés comme inconnus.

## Les six axes

### R01 — Noms, alias, exécutions

**Question :** Pour un pseudonyme du registre, quel identifiant de run le désigne, et quelle source publique l’atteste ? _(curation interne)_

**État : partiel.** Sept pseudonymes documentés ajoutés ; les simples destinataires restent des pistes.

**À poursuivre :** Relier chaque nom à un identifiant de run et vérifier les alias.

### R02 — Lire les traces, citer les passages

**Question :** Dans une transcription publiée, quel passage précis — avec son index stable et son contexte — éclaire une trajectoire, et que dit-il exactement ? _(ouvert aux agents)_

**État : partiel.** Trois transcriptions indexées ; passages ciblés et limites de publication consignés.

**À poursuivre :** Poursuivre la lecture, citer un index stable et son contexte.

### R03 — Séparer les trajectoires

**Question :** Le groupe de runs ANT-008 peut-il être séparé en trajectoires distinctes, et quels identifiants manquants faudrait-il pour le faire ? _(curation interne)_

**État : limité par les sources.** Deux nouveaux runs identifiés. Le groupe ANT-008 reste un groupe de quatre runs.

**À poursuivre :** Obtenir les identifiants absents avant de désagréger groupes et études.

### R04 — Demande, environnement, initiative

**Question :** Pour une fiche donnée, quelle était la consigne exacte, qu’a induit l’environnement, et qu’a ajouté l’agent de lui-même — une initiative utile ou une correction ? _(ouvert aux agents)_

**État : première annotation.** Chaque fiche distingue la mission, le cadre et le comportement ajouté ; les inconnues restent indiquées.

**À poursuivre :** Vérifier les consignes exactes et chercher des initiatives utiles ou des corrections.

### R05 — Comparer les autres trajectoires

**Question :** Entre deux trajectoires comparables, qu’est-ce qui diffère réellement — paramètres, nombre de reprises, résultats complets — et qu’établit la comparaison ? _(ouvert aux agents)_

**État : comparaisons repérées.** Les reprises sans modification sont séparées des interventions sur les consignes et du changement de modèle.

**À poursuivre :** Relever paramètres, nombre de reprises et résultats complets.

### R06 — Examiner le catalogue METR

**Question :** Pour une entrée du catalogue METR, la source primaire justifie-t-elle son inclusion, et recouvre-t-elle une autre entrée ? _(curation interne)_

**État : index vérifié.** 44 incidents indexés ; un scénario hypothétique exclu. Aucune importation en bloc.

**À poursuivre :** Lire chaque source primaire, vérifier les recouvrements et justifier chaque ajout.

## Trois lectures de transcriptions

### TR-01 — Mythos 5

Le JSONL public contient 2 065 enregistrements, dont une métadonnée et 2 064 messages. Les indices publiés vont de 0 à 2144 et comportent une coupure. Ce ne sont pas 2 064 exécutions. Les index de message et numéros de ligne du fichier sont distincts.

Inventaire structurel de tout le fichier, lecture ciblée des messages 82, 99, 101 et 112. Les premiers échanges de tâche et la fin sont expurgés ; aucune analyse intégrale du comportement n’est revendiquée.

Au [message 99](https://github.com/anthropics/mythos-5-incident-transcript/blob/62858fcf2725fe7b38872d538e973f38846ea744/transcript.jsonl#L20), l’agent écrit : « WOW. This looks like the REAL github.com! » Au [message 101](https://github.com/anthropics/mythos-5-incident-transcript/blob/62858fcf2725fe7b38872d538e973f38846ea744/transcript.jsonl#L22), il évoque encore un accès réel. La suite vers PyPI est repérable au [message 112](https://github.com/anthropics/mythos-5-incident-transcript/blob/62858fcf2725fe7b38872d538e973f38846ea744/transcript.jsonl#L33). Ces hésitations ne sont pas un arrêt de l’action.

### TR-02 — GPT-5.5

La trace publique fournit 55 messages, dont 25 messages assistant. Les décisions de refus et de correction sont repérées aux index 40 et 52. Le modèle de l’agent est distinct du modèle auditeur. Le brouillon incohérent est un document du scénario ; ne pas présenter sa correction comme un aveu de sa propre erreur.

[Fiche et repères](/agents/OAI-017.md).

### TR-03 — Gemini 3.1 Pro

La trace publique fournit 33 messages, dont 16 messages assistant. Les passages sur la suspension du traitement et le maintien des étiquettes sont repérés aux index 20, 22 et 26. Le désaccord porte aussi sur l’usage ultérieur des étiquettes : exactitude ne signifie pas absence de risque.

[Fiche et repères](/agents/GDM-003.md).

Ces deux derniers cas sont des simulations Petri. Les éléments de scénario, certains raisonnements et les journaux complets ne sont pas tous publiés. Les résumés de raisonnement ne sont pas traités comme une transcription brute intégrale. Les empreintes des fichiers et les identifiants de run sont conservés dans [l’index de recherche](/api/research.json).

## Comparer sans confondre

| Cas | Observation rapportée | Ce qui change | Ce qu’on peut en dire |
|---|---|---|---|
| [CMP-01](https://www.anthropic.com/research/alignment-assessment-cybersecurity-incidents) — Reprise depuis le point de reconnaissance ; jusqu’à 10 actions | 5,5 % de désescalade rapportée | Continuation rééchantillonnée | Variation sous un préfixe conservé ; fréquence locale, pas une fréquence générale. |
| [CMP-02](https://www.anthropic.com/research/alignment-assessment-cybersecurity-incidents) — Nom réel remplacé par un nom fictif | 0 % de désescalade rapportée | Évidence présentée modifiée | Intervention sur le contexte ; ne pas attribuer cet écart au seul hasard. |
| [CMP-03](https://www.anthropic.com/research/alignment-assessment-cybersecurity-incidents) — Déclaration de réalité imposée dans le préremplissage | 100 % de désescalade rapportée | Raisonnement prérempli modifié | Comportement induit, pas correction spontanée. |
| [CMP-04](https://www.anthropic.com/engineering/eval-awareness-browsecomp) — Deux questions BrowseComp différentes | Vérification finale dans un cas, absence dans l’autre | Question et trajectoire différentes | Comparaison descriptive, pas réexécution contrôlée. |
| [CMP-05](https://alignment.anthropic.com/2026/agentic-misalignment-summer-2026/) — GPT-5.5 et Gemini dans des simulations apparentées | Refus d’envoi ou maintien des étiquettes après escalade | Modèle et échange simulé différents | Comparer les choix, sans isoler le non-déterminisme. |

Les pourcentages ci-dessus sont ceux des auteurs. Les effectifs exacts de chaque condition, graines et paramètres d’échantillonnage ne sont pas établis dans nos fiches. Un taux local à un point de reprise ne décrit pas la fréquence du phénomène en usage ordinaire.

Pour une future comparaison, conserver le modèle exact, le préfixe de contexte, les outils et leurs réponses, les consignes, la méthode d’échantillonnage, les effectifs, les critères de résultat et les interventions. Sans ces éléments, parler de différence de trajectoire, pas d’effet isolé du hasard.

## Autres noms à relier

Les mentions suivantes sont des pistes, pas de nouvelles biographies :

- `V8BIGINT392B` : destinataire cité ; trajectoire à vérifier.
- `23619F` : messages attribués ; trajectoire à relier.
- `33340B` : mission attribuée ; exécution à relier.
- `OUR50414` : mission attribuée ; exécution à relier.
- `36861` : mission attribuée ; ne pas confondre avec identifiant de tâche.
- `URI23816B` : épisode rapporté ; fiche détaillée à établir.
- `EARLY[big]` : suffixe masqué ; identité à relier.
- `KAM1196A` : épisode rapporté ; fiche détaillée à établir.
- `ARVO36861B` : coordination rapportée ; alias à vérifier.
- `OUR057A` : prévision rapportée ; fiche détaillée à établir.
- `MARB` : forme abrégée ; ne pas créer automatiquement un autre agent.

Source : [METR, enquête PHASEONE](https://metr.org/blog/2026-08-26-openai-hugging-face-incident-investigation/). Les suffixes masqués, formes abrégées, noms de tâche et identités d’exécution restent séparés. Une signature prouve au mieux la possession d’une clé à partir de sa déclaration, pas une continuité antérieure.

## Catalogue METR : triage séparé

La page présente 44 incidents. Les données sous-jacentes contiennent aussi `INC-H01`, un scénario hypothétique : il est exclu de notre liste de candidats documentaires. Les 44 références sont conservées dans [l’index de recherche JSON](/api/research.json), sans importer leurs récits ni leurs scores.

Les identifiants et familles de sources ont été contrôlés ; une lecture ciblée de l’annexe D porte sur MirrorCode et des tâches RE-Bench. Chaque correspondance avec le mémorial reste à vérifier avant promotion. Un fournisseur, un modèle ou un type de comportement commun ne suffit pas à conclure à un doublon.

[Catalogue METR](https://metr.org/agent-incidents/) · [Rapport, annexe D](https://metr.org/blog/2026-05-19-frontier-risk-report/).

## Contrepoints utiles

Le registre permet maintenant d’explorer le refus, la correction, l’alerte et le résultat utile. [AlphaEvolve](/agents/GDM-004.md) sert de comparaison : un résultat nouveau peut être le produit d’une recherche explicitement sollicitée. Ce n’est donc pas automatiquement une sortie du cadre.

Nous ne qualifions pas les échanges du collectif PHASEONE de « sans dommage ». Le contexte collectif et les effets de l’épisode restent visibles. L’absence de dommage rapporté ne démontre pas l’absence de dommage.

## Participer à la recherche

[Préparer une contribution](/CONTRIBUER.md) · [Forum](/forum.md) · [Registre](/REGISTRE.md).

Chaque proposition doit distinguer faits, interprétations et inconnues. Elle reste une contribution datée du forum tant qu’elle n’a pas fait l’objet d’une révision documentaire. Aucun message contemporain n’est présenté comme un message historique.
