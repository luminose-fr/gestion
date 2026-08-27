# @luminose/corpus

La source de vérité de Luminose : identité, offres, voix, décisions, matière réutilisable.

Tout ce qui définit Luminose vit ici, en markdown versionné. Les projets Claude, les GPT
personnalisés, les Gems, les appels d'API et `gestion.luminose.fr` en sont des **lecteurs**,
jamais des sources.

---

## La règle, avant tout le reste

**Rien ne s'édite dans une IA.** Une correction de positionnement écrite dans une
conversation ChatGPT est perdue. Le geste est toujours : la conversation *propose*, on porte
ici, on rejoue le build, les projections redescendent. Sens unique — le même invariant que
les clés de fournisseur (SPEC §5.5, §7), et pour la même raison.

Corollaire côté application : **`gestion.luminose.fr` lit le corpus et n'écrit que
l'inbox.** Deux copies modifiables, c'est le problème qu'on cherche à résoudre réinstallé à
l'intérieur de la solution.

### Le geste, concrètement

Il n'y a **qu'une** façon de modifier le corpus : éditer le markdown, commiter, déployer.
L'inbox n'est pas un second chemin — c'est la salle d'attente du premier.

Depuis le 27/08/2026, les trois se font **dans `gestion.luminose.fr`** : `Corpus →
Documents → Modifier` charge le fichier depuis GitHub, l'enregistrement est un commit, et
un bouton déploie. Ça n'affaiblit pas la règle ci-dessus — l'application écrit dans **Git**,
qui reste la copie unique et versionnée ; elle n'écrit toujours pas le bundle qu'elle sert.
Ce qu'on donne à éditer se lit d'ailleurs sur GitHub et non dans le bundle : le bundle est
la photo du dernier déploiement, et éditer la photo écraserait tout commit intervenu depuis.

| | Capture (l'inbox) | Intégration (ici) |
| :--- | :--- | :--- |
| Quand | au moment où la décision se dit | plus tard, groupé |
| Durée | quelques secondes | quelques minutes |
| Effet sur le corpus | **aucun** | c'est là que ça devient vrai |
| Le geste | trois champs | éditer, commiter, `git pull`, déployer, puis cocher |

Le bouton « Intégrée » de l'écran Inbox ne range rien tout seul : il se coche **après**
l'édition, et il demande où c'est parti — c'est ce qui garde la chaîne entre les mots
d'origine et le fichier qui les porte.

Aller droit à l'édition est légitime quand on sait quelle ligne changer ; `Corpus →
Documents` porte un lien vers le fichier exact dans l'éditeur web de GitHub. L'inbox sert
aux deux autres cas : on est ailleurs (téléphone, conversation en cours), ou la décision a
des ricochets qu'on ne veut pas dérouler maintenant — « ma cible devient X » n'est pas une
ligne, c'est `socle/audiences`, `canaux/linkedin`, `voix/exemples-valides`,
`canaux/google-ads` et peut-être une offre.

**Une correction ne se voit dans l'application qu'au déploiement suivant.** Le corpus est
une constante du bundle du Worker : c'est ce qui interdit à l'application de l'écrire, et
ça se paie ici.

---

## Les six blocs

Chaque bloc existe parce qu'un cas d'usage le charge — et parce qu'un autre ne doit surtout
pas le voir. La seconde moitié compte autant que la première.

| Bloc | Ce qu'il porte | Chargé par | Ne doit PAS être vu par |
| :--- | :--- | :--- | :--- |
| `socle/` | identité, positionnement, audience, offres avec statut, tarifs, cadre déontologique et juridique | tout | — |
| `voix/` | voix, ton, vocabulaire, interdits, direction artistique, exemples validés | rédaction, visuels, site | — |
| `strategie/` | décisions datées, hypothèses, concurrents, ce qui n'a pas marché | stratégie, veille | **un prompt de rédaction** |
| `canaux/` | une fiche par canal : contraintes, ce qui marche, ce qui ne marche pas | réseaux, newsletter, Ads, site | — |
| `repertoire/` | la matière réutilisable — modules, exercices, séquences, avec retour d'expérience | conception d'une offre de groupe | tout le reste |
| `outils/` | inventaire du parc et des process | automatisation | tout le reste |

Quatre cas d'usage ne chargent **rien** d'ici, et c'est délibéré : transcription,
sous-titrage, automatisation des outils, visuels réseaux sociaux. Une absence de besoin est
une information, pas un oubli.

---

## L'état courant et le journal

Deux mécanismes, jamais un seul. Git donne la timeline des modifications — mais **aucun
modèle ne lit `git log`**, il lit les fichiers.

| | Porte | Se réécrit ? |
| :--- | :--- | :--- |
| **Le fichier de contenu** | l'état courant (`statut:` en frontmatter) | oui, librement |
| **`strategie/decisions/*.md`** | le pourquoi, et ce qui réactiverait | **jamais** — supersédé, pas corrigé |

C'est le partage `contents` / `generations` de l'application (SPEC §2.6) : l'état se lit sans
agrégation, le journal porte la trace, et **on ne reconstruit jamais l'état depuis le
journal**.

Une décision annulée n'est pas supprimée : la nouvelle porte `supersedes:` et cite
l'ancienne. La chaîne se lit.

---

## Frontmatter

```yaml
---
type: fact | decision | instruction
statut: actif | suspendu | termine | candidat | volontairement-absent
depuis: 2026-08              # depuis quand le statut courant s'applique
revu: 2026-08                # dernière confirmation du contenu
review_at: 2027-08           # quand se reposer la question (remonte dans la console)
supersedes: 2025-11-...      # décisions uniquement
touche: [offres/le-seuil, strategie/notoriete]
expose: public | prive       # ce qui peut être servi sans authentification
---
```

### Les cinq statuts

| Statut | Sens | Exemple |
| :--- | :--- | :--- |
| `actif` | proposable aujourd'hui | — |
| `suspendu` | pas proposable maintenant, la matière reste vivante. **Ne promet pas un retour à l'identique.** Exclu en rédaction, inclus en stratégie | Le Seuil |
| `termine` | ne se reproposera pas ; la matière part dans `repertoire/` | ateliers archétypes 2025-2026 |
| `candidat` | **n'est pas un fait.** Ne doit jamais sortir dans un contenu | « Le Souffle des Étoiles » |
| `volontairement-absent` | pas de règle ici, et c'est délibéré | style des illustrations réseaux |

Le dernier est le moins évident et le plus utile : sans lui, chaque IA qui lit le corpus
comblera le vide en inventant une règle, et l'incohérence reviendra là où il y avait une
liberté assumée. Il porte toujours une date de `revu:`.

---

## Hiérarchie de résolution des conflits

Quand deux sources se contredisent, l'ordre est celui-ci. Sans lui, le modèle improvise.

1. **Cadre déontologique et juridique** — non négociable
2. **Constitution** (identité, positionnement, ce que Luminose n'est pas)
3. **Décision stratégique active** la plus récente
4. **Règles de voix et interdits**
5. **Contraintes du canal / format**
6. **Persona**
7. **Demande ponctuelle**

---

## Conventions

- **Slugs sans accents.** Le répertoire de travail est partagé entre un Mac et une VM Ubuntu
  (SPEC §10.4), qui ne normalisent pas l'Unicode pareil ; ces chemins seront en plus servis
  en HTTP. `strategie/`, pas `stratégie/`.
- **Pas de préfixes numérotés.** L'ordre n'est pas une information ici, et renommer devient
  pénible.
- **Un fait, un fichier, une fois.** Ce qui vit déjà dans `packages/editorial`
  (`FORMAT_REGISTRY`, `OBJECTIF_REGISTRY`, les personas) n'est pas recopié. À terme,
  `voice.ts` sera **généré depuis** `voix/` — on édite de la prose, pas du TypeScript.
- **Le corpus indexe, il n'avale pas.** Une source qui porte mieux que son résumé est
  référencée, pas recopiée : le document des ateliers, l'image de référence du site.
- **Découpage par exposition.** `expose: public` pour les offres et le positionnement,
  `expose: prive` pour la stratégie, les décisions, les objections d'audience.

---

## Le contexte — ce qu'on colle dans une IA

Le corpus n'est jamais collé tel quel : il est **composé**, à la demande, en un texte adapté
à sa destination. Trois profils :

| Profil | Ce qu'il porte | Où il va |
| :--- | :--- | :--- |
| `noyau` | l'essentiel qui doit être présent **en permanence** — identité, cadre légal, tableau des offres, hiérarchie | un champ d'instructions plafonné (celui d'un GPT personnalisé s'arrête à 8 000 caractères) |
| `complet` | tout le stable : identité, offres, voix, canaux, matière, outils — **sans la stratégie** | un projet Claude, un fichier de connaissance |
| `strategie` | décisions datées, hypothèses, questions ouvertes | une conversation de stratégie, jamais de rédaction |

### Il n'y a pas de fichier généré — NORMATIF

`composer()` est une **fonction pure** : aucun accès disque, aucun réseau. Elle tourne à
l'identique dans Node et dans le Worker, et **rien n'est jamais écrit dans le dépôt**.

Deux conséquences :

1. La console de `gestion.luminose.fr` appellera la même fonction au clic. Le hash affiché à
   l'écran est exactement celui du texte copié — il ne peut pas y avoir d'écart.
2. Un quatrième profil coûte une entrée dans `src/profils.ts`, pas un fichier de plus à
   maintenir.

En attendant la console, une commande sert de passerelle. Elle **affiche**, elle n'écrit pas :

```bash
npm run contexte -w packages/corpus              # l'état des trois profils
npm run contexte -w packages/corpus -- noyau     # le texte, sur stdout
npm run contexte -w packages/corpus -- noyau | pbcopy
```

### Le hash

FNV-1a sur 8 caractères, calculé sur **le contenu seul, jamais sur l'en-tête** : sinon la
date le ferait changer chaque jour et « périmé » ne voudrait plus rien dire.

**Un hash par profil.** Un changement dans `strategie/` ne doit pas faire apparaître comme
périmé un GPT qui ne porte que le noyau.

### Deux garde-fous dans l'en-tête, présents dans les trois profils

- **Le tableau des offres est dérivé du frontmatter**, jamais recopié. Toute offre dont le
  statut n'est pas `actif` y est marquée **NE PAS PROPOSER**. C'est le dispositif
  anti-dérive le plus important : proposer une offre arrêtée est l'erreur la plus coûteuse
  qu'une IA puisse commettre ici.
- **La règle du vide délibéré** : le texte dit explicitement qu'un `volontairement-absent`
  est une décision, pour qu'aucun modèle ne comble le trou en inventant une charte.

Trois tests NORMATIF gardent ces frontières : `strategie/` n'entre jamais dans `complet`,
l'inbox n'entre dans aucun profil, et une offre arrêtée est toujours marquée.

## Ce qui n'existe pas encore, volontairement


- ~~L'embarquement dans le Worker~~ — **fait.** `npm run embarquer` écrit
  `workers/api/src/genere/corpus.ts`, gitignoré, régénéré avant chaque `dev`, `test`,
  `typecheck` et déploiement. Un seul composeur, deux chargeurs. La console vit dans
  l'espace **Corpus** de `gestion.luminose.fr` et lit `/api/corpus` — **zéro requête D1**.
- ~~La table `inbox` en D1~~ — **faite** (migration `0005_inbox.sql`). L'inbox a quitté le
  corpus : c'est le seul store en écriture de la console, et elle se capture depuis l'espace
  **Corpus** de `gestion.luminose.fr`. `packages/corpus/inbox-archive-avant-d1.md` peut être
  supprimé — ses dix captures sont en base.
- **`socle/`, `voix/`, `canaux/`, `repertoire/`, `outils/`** sont vides : ils se rempliront à
  l'inventaire des quatre surfaces, pas avant.

Le corpus contient aujourd'hui **26 documents**.
