# SPEC v2.10 — gestion.luminose.fr

> **Cible** : migration complète Notion → Cloudflare D1, restructuration en monorepo,
> abstraction du fournisseur IA, et ajout des Séries / Déclinaisons.
>
> **Statut** : document de conception, écrit le 17/08/2026 avant toute implémentation.
> **v2.1 (21/08/2026)** : les clés des fournisseurs peuvent être posées depuis
> l'administration (§5.5). L'invariant du §7 est précisé, pas levé : une clé entre,
> elle ne ressort jamais. L'explorateur de catalogue arrive en §5.6.
> **v2.2 (23/08/2026)** : une série est une PROGRESSION, pas un ensemble (§2.9).
> L'Éclateur produit la matière de chaque publication et fait office d'Analyste pour
> sa série (§6.2) ; l'anti-répétition irrigue tout l'atelier, plus seulement la
> rédaction (§6.4).
> **v2.3 (23/08/2026)** : l'explorateur croise une seconde source, qui juge de la PROSE
> et non du raisonnement, et il s'ouvre sur une courte liste de vingt modèles
> délibérément différents (§5.6). Le coût, la qualité de rédaction et les forces
> d'un modèle sont désormais déduits des mesures, plus saisis de mémoire (§5.6).
> L'atelier du Coach cesse d'être un aller sans retour : rouvrir et
> réinitialiser (§2.7). Les appels IA sont visibles tant qu'ils durent et ne
> détruisent plus ce qui les précède, et tout échec s'annonce de la même façon
> (§3.5.1) ; un tour vide ne part plus chez un fournisseur (§3.5) ; les
> adaptateurs reprennent une fois sur un échec passager (§5.2) ; la relecture à
> froid se relit depuis le journal, datée et signée (§2.6) ; le format d'une
> publication est résolu et non comparé, et exigé avant création (§6.2) ; les
> publications d'une série naissent en Brouillon (§6.3).
> **v2.4 (02/10/2026)** : la vidéo. Un huitième format, le **Reel expliqué**, alterne
> la face caméra et des scènes animées écrites par le Rédacteur (§12). Le montage se
> termine dans l'application, rendu dans le navigateur (§12.4).
> **v2.5 (03/10/2026)** : le serveur MCP lit et écrit le corpus (`workers/mcp`,
> decisions/2026-10-03-corpus.md). Il dépend désormais de `packages/corpus` (§1.1) —
> le seul paquet du dépôt qu'il importe, pur et sans secret — et garde son propre jeton
> GitHub. La garde d'écriture du corpus quitte `workers/api` pour `packages/corpus` :
> la console et le serveur refusent la même chose.
> **v2.6 (04/10/2026)** : les scènes s'animent, se montent et s'exportent depuis l'onglet,
> les visuels se déposent sur leurs cartes, et le minutage ne dépend que d'une horloge
> que la prise viendra remplacer (§12.4.1).
> **v2.7 (04/10/2026)** : la prise se dépose, son son est transcrit par Whisper sur
> Workers AI, le script s'y cale mot à mot et les repères se corrigent à la main (§12.5) ;
> la vidéo finale sort de l'onglet, en 9:16 ou 4:5, organique ou publicitaire (§12.5.1).
> **v2.8 (04/10/2026)** : le montage est rangé chez Cloudflare — prises et visuels dans
> R2, transcription et repères dans D1 (§12.4.2). Il survit à des données de site
> vidées et se reprend depuis un autre poste ; le navigateur n'en garde qu'un cache.
> Les numéros 2.5 à 2.7 ont été remis dans l'ordre des dates le même jour : deux
> sessions avaient chacune écrit une « v2.5 ».
> **v2.9 (04/10/2026)** : rester dans le gratuit. L'écran des quotas suit R2 et Workers AI
> (§0.4), et le montage refuse un dépôt qui ferait dépasser les 10 Go gratuits de R2,
> seul service qui facture au-delà (§12.4.2).
> **v2.10 (04/10/2026)** : le montage a une porte. L'espace Vidéos s'ouvre sur un onglet
> **Montage** qui liste les Reels expliqués et dit où chacun en est ; le montage se tient
> aussi sur un contenu Prêt ou Publié, et chaque export réussi est noté (§12.4.3).
> Les sections marquées **NORMATIF** font foi : toute divergence du code est un bug du
> code, pas de la spec. Les modifier exige un bump de version de ce document.
>
> L'état du système *avant* migration est décrit en §0.3 ; il reste la référence
> jusqu'à la fin de la phase 5 (§11).

---

## 0. Contexte

### 0.1 Le produit

Application mono-utilisateur (Florent Jaouali, psychopraticien transpersonnel) qui gère le
cycle de vie de ses contenus éditoriaux — de l'idée brute au post prêt à publier — avec
l'IA comme copilote à chaque étape.

**Ce qui fait la valeur du produit n'est pas le CRUD : c'est la méthode éditoriale
encodée dans les prompts.** Sept personas, des règles de voix transverses, une grille de
production par format, sept objectifs qui dictent le CTA. Toute décision d'architecture
qui met cette méthode en danger est une mauvaise décision, quelle que soit son élégance.

### 0.2 Pourquoi cette migration

Notion a été un excellent point de départ : zéro infrastructure, édition immédiate.
Le coût est devenu structurel. `services/notionService.ts` fait 1040 lignes, dont
l'essentiel n'existe que pour survivre à l'API :

| Mécanisme | Raison d'être | Devient en D1 |
| :--- | :--- | :--- |
| `getDataSourceId` | double appel imposé par l'API 2025-09-03 | néant |
| `normalizePropName`, `getDataSourceProperties`, `buildPropertyValue` | les colonnes sont identifiées par leur nom affiché | une migration SQL |
| `markdownToNotion` / `notionToMarkdown` | Notion stocke des segments annotés, pas du texte | `TEXT` |
| `rawTextToNotion` | contournement du précédent pour le JSON | néant |
| `enforceRichTextLimit` | découpe à 2000 caractères | `TEXT` (2 Mo par ligne) |
| `fetchLiveContentIds` | une page archivée disparaît des résultats | `deleted_at` |
| `fetchWithRetry` | limite de débit ~3 req/s | néant |

S'y ajoute que la fonctionnalité demandée — les Séries — exige des relations Notion, que
le service ne sait pas écrire. En SQL, c'est une clé étrangère.

**Vérifié avant décision** : l'application couvre déjà l'intégralité du modèle en édition
(titre, statut, plateformes, notes, format, objectif, profondeur, verdict, angle,
métaphore, justification, body, session Coach, slides, post court, date de publication).
Notion n'est plus une surface d'édition nécessaire.

### 0.3 État de départ

SPA React 19 + Vite 7 sur GitHub Pages, Cloudflare Worker en proxy Notion + 1min.ai,
IndexedDB en cache local, 73 tests vitest, jeton de session signé HMAC-SHA256.
Deux bases Notion : « Contenu » et « Modèles IA ».

### 0.4 Quotas Cloudflare (plan gratuit)

| Ressource | Limite gratuite | Besoin estimé |
| :--- | :--- | :--- |
| Stockage D1 | 5 Go (500 Mo/base) | < 50 Mo |
| Lignes lues / jour | 5 000 000 | < 10 000 |
| Lignes écrites / jour | 100 000 | < 500 |
| **Requêtes par invocation Worker** | **50** | **contrainte de conception, §3.6** |
| Time Travel | 7 jours | complété par l'export, §9.4 |
| Stockage R2 (montage, §12.4.2) | 10 Go | quelques prises vidéo de 100 à 500 Mo |
| Opérations R2 classe A / B, **par mois** | 1 000 000 / 10 000 000 | quelques centaines |
| Neurones Workers AI / jour (transcription, §12.5) | 10 000 | ≈ 47 par minute de son |

Le quota n'est pas un facteur limitant. La limite des 50 requêtes par invocation, si.

**Sauf R2, qui FACTURE au-delà de son gratuit** — les autres refusent. Florent veut rester
dans le gratuit (04/10/2026) : l'écran Réglages → Quotas suit R2 (stockage, opérations
de classe A et B au mois) et Workers AI (neurones du jour), et le montage **refuse** un dépôt
qui ferait passer ce qu'il range au-delà de 10 Go (§12.4.2).

---

## 1. Architecture cible — NORMATIF

Monorepo npm workspaces. Quatre moteurs purs, deux Workers, un front.

```
gestion.luminose.fr/
├── apps/
│   └── manager/            SPA React (Vite) → Cloudflare Pages
├── packages/
│   ├── shared/             types + schémas zod partagés front/worker
│   ├── editorial/          LE MOTEUR : personas, voix, formats, objectifs,
│   │                       parsing des réponses IA. Zéro dépendance.
│   ├── ai/                 abstraction fournisseur (port + adaptateurs)
│   ├── subtitles/          .srt → .fcpxml
│   └── psychedelics/       calcul de doses
├── workers/
│   ├── api/                Hono + D1 + auth
│   │   ├── migrations/     NNNN_description.sql
│   │   └── src/routes/
│   └── mcp/                serveur MCP pour Claude, mcp.luminose.fr —
│       │                   OAuth + Google Ads : lire, et préparer en pause ;
│       │                   le corpus : lire main, écrire par commit ;
│       │                   Tag Manager : lire, et préparer dans « [Claude] »
│       └── migrations/     journaux des écritures, base `luminose-mcp`
└── scripts/
    └── deploy.sh
```

### 1.1 Règles de dépendance (NORMATIF)

```
apps/manager  ──▶ packages/{shared, editorial, subtitles, psychedelics}
workers/api   ──▶ packages/{shared, editorial, ai}
workers/mcp   ──▶ packages/corpus
packages/ai   ──▶ packages/shared
packages/editorial ──▶ (rien)
packages/{subtitles, psychedelics} ──▶ (rien)
```

- `packages/editorial`, `subtitles`, `psychedelics` : **zéro dépendance runtime**, zéro
  React, zéro `fetch`, zéro API Workers. Fonctions pures, testables sans réseau ni DOM.
- `packages/ai` : dépend de `shared` uniquement. Ne connaît ni D1 ni Hono.
- Le front n'importe **jamais** `packages/ai` : les clés d'API vivent dans le Worker.
- `workers/mcp` ne partage avec `workers/api` ni code, ni secret, ni binding. Son
  authentification n'est pas celle de la console (OAuth pour Claude), et une erreur de
  configuration de l'un ne doit pas pouvoir exposer l'autre. Sa base D1 est la sienne
  (`luminose-mcp`, les journaux des écritures Google Ads, corpus et Tag Manager) : celle de la console
  porte les clés des fournisseurs IA (§5.5), et il n'a pas à les voir. Son jeton GitHub est
  le sien, pas celui de la console. Dépendances runtime : `zod`,
  `@cloudflare/workers-oauth-provider` et, depuis le 03/10/2026, `@luminose/corpus` — pur,
  sans secret ni accès disque dans ce qu'il exporte, pour composer les profils du corpus
  avec le même `composer()` que la console et refuser ce qu'elle refuse d'écrire
  (`refusDeContenu`). Mise en place et écarts avec le cadrage : `workers/mcp/README.md`.

### 1.2 Une seule origine

`gestion.luminose.fr` est servi par Cloudflare Pages. Le Worker capte `/api/*` sur **cette
même origine** via une route.

Conséquence directe : **plus de CORS du tout**. Plus de `ALLOWED_ORIGINS` à maintenir,
plus de préflight, plus d'origine de développement à déclarer. C'est une simplification,
pas un détail de configuration.

`mcp.luminose.fr` est hors de ce périmètre : aucun front ne l'appelle. Il ouvre CORS sur
ses seuls points d'entrée OAuth et `/mcp`, pour l'inspecteur MCP qui tourne dans un
navigateur. Sans cookie, et derrière un jeton porteur, c'est sans conséquence.

---

## 2. Modèle de données (D1) — NORMATIF

Schéma complet en Annexe A. Le modèle Notion actuel est le produit d'évolutions
successives sous contrainte non relationnelle ; il est ici repris à zéro. Les écarts
volontaires avec l'existant sont justifiés en §2.7.

### 2.1 Suppression logique

Toute table métier porte `deleted_at INTEGER` (epoch ms, `NULL` = vivant).

Une suppression est un `UPDATE … SET deleted_at = ?`. La synchronisation incrémentale
renvoie **aussi** les lignes supprimées depuis `since`, ce qui permet au client de purger
son cache. Le balayage d'identifiants de l'ère Notion disparaît : le problème n'existe plus.

### 2.2 Horodatage

`created_at` et `updated_at` en **epoch millisecondes** (`INTEGER`), jamais en texte ISO.
`updated_at` est la clé de la synchronisation incrémentale et n'est écrit que par le
Worker, jamais par le client.

### 2.3 Charges JSON

`contents.draft`, `contents.slides` et les `generations.payload` restent du **JSON
sérialisé en TEXT**. La base ne les interprète pas, ne les indexe pas, ne les valide pas.

Raison : leur forme varie par format (`accroche`/`corps` pour un post court,
`sections[]` pour un script, `slides[]` pour un carrousel, `objet`/`baffe` pour une
newsletter) et suit l'évolution des prompts. Les normaliser condamnerait chaque évolution
de format à une migration SQL. Leur schéma appartient à `packages/editorial`.

### 2.4 Identifiants

- Contenus migrés : **l'identifiant de page Notion est conservé**. La migration est ainsi
  ré-exécutable sans doublon.
- Nouvelles lignes : UUID v4 généré par le Worker.

### 2.5 Un seul brouillon

`contents.draft` porte le brouillon, **quel que soit le format**.

L'existant a deux colonnes — `body` et `scriptVideo` — pour la même chose : le résultat de
la rédaction. Elles ne diffèrent que par le format, et `getStorageField()` n'existe que
pour choisir entre elles. Aucun contenu ne remplit les deux.

Une seule colonne, et la notion de `storageField` disparaît du produit.

`contents.slides` est conservée à part : ce n'est **pas** une dérivation du brouillon mais
un enrichissement (les `prompt_dzine` de l'Artiste), ajustable indépendamment.

### 2.6 Les productions IA sont un journal — NORMATIF

Chaque production de l'IA est une ligne de `generations` : analyse, rédaction, slides,
relecture à froid, ajustement, brief verrouillé, plan de série.

`contents` porte l'état **courant** (lecture immédiate, aucune agrégation) ;
`generations` porte la **trace**. Ce n'est pas de l'event sourcing : on ne reconstruit
jamais l'état depuis le journal.

Ce que ça règle, et qui n'est pas décoratif :

1. **La provenance sort de la charge utile.** Aujourd'hui la signature
   `_Généré par : <modèle> - le <date>_` est concaténée **après le JSON**, dans le champ
   lui-même. Résultat : onze `lastIndexOf('}')` dispersés dans sept fichiers, parce que
   chaque lecteur doit savoir qu'un contenu JSON n'est pas du JSON. La colonne redevient
   du JSON pur ; la provenance vit dans sa propre ligne.
2. **L'annulation devient réelle.** Aujourd'hui : un seul niveau, en mémoire, perdu à la
   fermeture de l'éditeur. Demain : revenir à n'importe quelle génération antérieure.
3. **La comparaison devient possible** — deux rédactions du même contenu, côte à côte.

`model_label` est figé à l'écriture : si le modèle est supprimé du catalogue, la
provenance survit.

**Le journal est le seul domicile de la relecture à froid — NORMATIF.** Toutes les
autres productions atterrissent dans une colonne de `contents` : la rédaction dans
`draft`, les slides dans `slides`, le brief dans `coach_brief`, l'analyse dans
`verdict`/`strategic_angle`. La relecture à froid ne vise AUCUNE colonne — c'est un
jugement porté sur le texte, pas une version du texte.

Elle était donc journalisée sans être jamais relue, et le code affirmait même
« éphémère, non persisté » là où elle l'était depuis le début. Fermer le panneau, ou le
voir disparaître sur un échec, revenait à perdre un rapport qui dormait en base.

L'éditeur reprend donc la dernière ligne `cold_read` à l'ouverture, en UNE requête
(`?kind=cold_read&limit=1`), et affiche **quand** et **par quel modèle** — un rapport
d'hier ne doit pas se faire passer pour un jugement du texte d'aujourd'hui. Un échec
d'écriture du journal se voit à l'écran : sans cette ligne, le rapport ne survivra pas à
la fermeture, et c'est précisément ce qu'on répare.

`GET /contents/:id/generations` accepte `limit` (défaut 50, plafond 200). Sans borne, la
route rendait tout : un `payload` est un brouillon entier, trente lignes font des
centaines de kilo-octets pour une question qui n'en demandait qu'une.

Volume : quelques kilo-octets par génération, quelques générations par contenu. Non
significatif à cette échelle ; si cela changeait, une purge au-delà des N dernières par
couple (contenu, nature) suffirait.

**Chaque ligne porte ce que l'appel a coûté — NORMATIF.** `prompt_tokens`,
`completion_tokens`, `cost_usd`. Le journal disait qui a produit quoi ; il ne disait pas
ce que ça valait, et « ce contenu revient-il cher ? » se répondait à l'intuition.

**Les trois colonnes sont nullables, et le resteront.** `null` veut dire « le fournisseur
n'a rien déclaré » — **jamais « zéro »**. 1min.ai ne rend aucun décompte ; une API OpenAI
rend des jetons sans prix ; OpenRouter rend les deux, à condition de le demander
(`usage: {include: true}`, propre à lui — envoyé à une API OpenAI stricte, ce champ
inconnu ferait refuser la requête). Confondre inconnu et gratuit ferait passer une
facture non mesurée pour une facture nulle.

Le prix n'est **jamais recalculé** à partir des jetons et du catalogue : chez OpenRouter
il dépend du fournisseur réellement routé au moment de l'appel, et une estimation maison
divergerait sans que rien ne le signale. On stocke ce que le fournisseur facture, ou rien.

`GET /contents/:id` rend l'agrégat en **une** requête (`SUM`, pas la lecture du journal —
additionner trois nombres ne justifie pas de transporter des charges de plusieurs
kilo-octets). Il compte aussi les appels **sans prix déclaré** : sans ce chiffre, un total
partiel se lirait comme un total. L'écran affiche « ≥ » dans ce cas, et n'affiche rien
plutôt que « 0,00 $ » quand aucun appel n'est chiffré.

**Un appel groupé partage son coût.** L'analyse en lot produit N lignes de journal pour un
seul appel : sa facture se divise entre les idées. Sans ça, chacune porterait le coût du
lot entier et le total serait faux d'un facteur N.

Une reprise (`revert`) recopie une charge déjà produite : elle ne consomme rien, et ses
colonnes de coût restent nulles.

### 2.7 La conversation Coach est une suite de messages — NORMATIF

`coach_messages` : une ligne par message. L'état de session (statut, brief verrouillé,
format calibré, date de validation) reste sur `contents`.

Aujourd'hui la session entière est un blob réécrit **à chaque tour** : dix échanges = dix
réécritures de la conversation complète. Un échec au mauvais moment, et des messages
disparaissent. En lignes, l'écriture est un `INSERT` : un message écrit ne se perd plus.

**L'API masque ce détail.** `GET /api/contents/:id` renvoie une `coachSession` assemblée
`{ status, brief, messages[] }`, et `POST /api/contents/:id/coach/messages` ajoute un
message. Le client garde son modèle mental ; seul le stockage change.

**L'atelier a deux sorties — NORMATIF.** Une session validée n'est pas un état
terminal. Sans retour possible, une rédaction qui échoue derrière la validation laisse
la publication **intouchable** : le chat est en lecture seule, « Go Éditeur » a disparu,
et rien ne peut plus être tenté. C'est arrivé le 23/08/2026, sur une réponse de Coach
rendue en JSON illisible.

| Sortie | Effet | Réversible |
| :--- | :--- | :--- |
| **Rouvrir** | `coach_status` repasse à `in_progress`, `coach_validated_at` s'efface | rien n'est perdu |
| **Réinitialiser** | messages marqués `deleted_at`, statut / brief / format cible remis à zéro | en base, oui |

`DELETE /api/contents/:id/coach` porte la réinitialisation, en deux requêtes. Les
messages sont **marqués, pas détruits** : on jette une session parce qu'elle s'est mal
passée, c'est-à-dire au moment précis où l'on voudra peut-être relire ce qui a été dit.
La lecture filtre `deleted_at IS NULL` ; l'append-only tient toujours.

**Le brouillon n'est jamais touché** par l'une ni l'autre : on jette l'atelier, pas ce
qui en est sorti.

### 2.8 Écarts volontaires avec l'existant

| Existant | Cible | Raison |
| :--- | :--- | :--- |
| `body` + `scriptVideo` | `draft` | même rôle ; `getStorageField()` disparaît (§2.5) |
| `postCourt` (colonne) | **supprimée** | dérivation pure de `body` via `buildPostCourtText()`. Elle est écrite en cache par l'onglet Copie et **recalculée en l'ignorant** par l'aperçu : deux vérités pour un même fait, qui peuvent déjà diverger. Calculée à la lecture. |
| `analyzed` (booléen) | `analyzed_at` (ms) | strictement plus informatif, et une seule source de vérité |
| signature markdown dans le champ | `generations` | §2.6 |
| `coachSession` (blob) | `coach_messages` + colonnes d'état | §2.7 |
| `interviewAnswers`, `interviewQuestions` | `legacy_json` | flow remplacé par le Coach, **aucun déclencheur dans l'interface**. Décision révisée après l'export : 15 contenus portent des questions et 8 des réponses, jusqu'à 8 900 caractères. Une colonne nullable ne coûte rien ; jeter la matière qui a produit ces brouillons, si. |
| `Cible Offre` | déjà remplacé par `objectif` | fait en amont |

`platforms` reste un tableau JSON plutôt qu'une table de jointure : le filtrage est
côté client sur un volume faible, et SQLite sait interroger du JSON le jour où il faudra.

### 2.9 Les Séries

```
series 1 ──── N contents          (contents.serie_id)
series 0..1 ── 1 contents         (series.source_content_id — le contenu pilier)
```

- **Série sans source** : plusieurs contenus autour d'un thème. Chacun construit sa
  matière via le Coach.
- **Série avec source** : un contenu existant (l'article) est le pilier ; les autres en
  sont des déclinaisons.

C'est **le même objet**. La seule différence est d'où vient la matière. `contents.angle`
porte l'angle propre de ce contenu au sein de sa série.

**Une série est une progression — NORMATIF.** `contents.serie_position` porte le rang
(1, 2, 3…). Ce n'est pas un confort d'affichage : la première publication ouvre le sujet
pour un inconnu, les suivantes s'appuient sur ce qui précède sans le réinstaller, la
dernière peut proposer quelque chose. Sans rang, une série n'est qu'un ensemble, et
chaque contenu réécrit l'introduction des autres. Le rang est `NULL` pour un contenu
rattaché à la main : il ferme la marche plutôt que de bloquer l'écriture.

## 3. API (Worker, Hono) — NORMATIF

### 3.1 Conventions

- Base : `/api`. Toutes les routes exigent un jeton de session valide (§7), sauf
  `POST /api/auth/login`.
- Entrées validées par **zod** à la frontière. Une entrée invalide → `400` avec le détail.
- Sorties en `camelCase` ; la base est en `snake_case`. La conversion a lieu dans
  `workers/api/src/db.ts`, à un seul endroit.
- Erreurs : `{ error: string, detail?: unknown }`, statut HTTP signifiant.

### 3.2 Contenus

```
GET    /api/contents?since=<ms>     liste ; inclut les lignes supprimées si `since`
GET    /api/contents/:id            contenu + coachSession assemblée (§2.7)
POST   /api/contents                création
PATCH  /api/contents/:id            mise à jour partielle
DELETE /api/contents/:id            suppression logique
POST   /api/contents/batch          création en lot (plan de série, §6.3)
```

La liste ne porte **pas** les messages Coach ni le journal des générations : ils ne sont
lus qu'à l'ouverture d'un contenu. C'est ce qui garde la liste à une seule requête (§3.6).

`postCourt` n'existe plus en base : il est calculé à la lecture depuis `draft` (§2.8).
Le Worker ne le renvoie pas — c'est `packages/editorial` qui le produit, côté client.

### 3.2.1 Conversation Coach (§2.7)

```
POST   /api/contents/:id/coach/messages    ajoute un message (append-only)
PATCH  /api/contents/:id/coach             statut, brief verrouillé, validation
DELETE /api/contents/:id/coach             réinitialise la session (§2.7)
```

### 3.2.2 Journal des productions (§2.6)

```
GET    /api/contents/:id/generations?kind=&limit=  historique, du plus récent au plus ancien
POST   /api/contents/:id/generations/:genId/revert réécrit la colonne cible
```

`limit` vaut 50 par défaut et plafonne à 200. La borne n'est pas cosmétique : un
`payload` est un brouillon entier.

Une génération n'est jamais modifiée ni supprimée par l'application : elle est un fait
daté. `revert` **ajoute** une ligne dont la charge reprend celle visée, plutôt que de
rembobiner le journal — l'annulation d'une annulation reste ainsi possible.

### 3.3 Séries

```
GET    /api/series?since=<ms>
GET    /api/series/:id              série + ses contenus (une seule requête, jointure)
POST   /api/series
PATCH  /api/series/:id
DELETE /api/series/:id?contenus=detacher|supprimer
```

**Supprimer une série pose une question, et le défaut est le geste sûr — NORMATIF.**

`contenus=detacher` (le DÉFAUT, appliqué quand le paramètre est absent) laisse les
publications vivre : elles perdent leur rattachement **et leur rang**, rien d'autre. Un
rang qui désigne une place dans une progression disparue n'en est pas un. Leur `angle`
reste : c'est de la matière éditoriale, pas de la structure.

`contenus=supprimer` les emporte avec la série. C'est le cas où la série entière était
une fausse piste ; sans ce mode, il fallait supprimer les publications une par une avant
de pouvoir atteindre la série.

**Le contenu pilier n'est JAMAIS emporté.** Il n'a pas de `serie_id` — il préexiste à la
série qu'il a fait naître (§6.3). Une déclinaison ratée ne détruit pas l'article dont
elle est partie, et l'écran le dit avant de demander confirmation.

Les deux modes tiennent en **2 requêtes**, dans un batch : la série et ses publications
tombent ensemble ou pas du tout. La réponse compte les deux séparément
(`detachedContents`, `deletedContents`), l'un des deux valant toujours zéro.

### 3.4 Modèles IA

```
GET    /api/models
POST   /api/models
PATCH  /api/models/:id
DELETE /api/models/:id
```

### 3.5 IA

```
POST   /api/ai/chat                 { modelId, system?, messages[], json? } → { text, modelLabel }
POST   /api/ai/test                 { apiCode, provider } → sonde un code, §5.4
```

Le Worker résout `modelId` en ligne de la table `ai_models`, choisit l'adaptateur d'après
`provider`, et appelle le fournisseur. **Le front ne connaît aucun fournisseur.**

**Au moins un message doit porter du CONTENU — NORMATIF.** Pas seulement exister. Une
conversation d'un unique tour vide passait la frontière et arrivait chez le fournisseur,
qui l'écartait et se retrouvait avec zéro message : « messages: at least one message is
required », renvoyé de trois couches plus loin et en anglais.

Trois actions étaient dans ce cas — Ajustement du texte, Slides du carrousel, Prompts
d'image — parce que toute leur matière tient dans le prompt système. 1min.ai ne l'avait
jamais signalé : il aplatit la conversation en un prompt unique, où un tour vide ne se
voit pas. Le défaut n'est apparu qu'en changeant de fournisseur.

Ces actions envoient donc un tour qui NOMME LA TÂCHE — « Applique l'ajustement
demandé. » — sans porter de consigne, comme le « Relis ce contenu. » du Lecteur froid le
faisait déjà. Et le schéma refuse le reste ici, en français, plutôt que de laisser un
tiers le diagnostiquer.

### 3.5.1 Ce que l'écran montre d'un appel IA — NORMATIF

Un aller-retour avec le fournisseur est **visible tant qu'il dure**, dans un bandeau qui
nomme l'action, le persona, le modèle et le temps écoulé. Sans lui, un appel devient
invisible dès que le bouton qui l'a déclenché disparaît — c'est exactement ce qui se
passe au « Go Éditeur » : la validation retire le bouton, la rédaction part, et l'écran
ne montre plus rien. « Il ne s'est rien passé » était une lecture correcte de l'écran.

Le modèle y figure parce qu'on change de fournisseur et qu'on doute de son choix :
savoir qu'« il se passe quelque chose » ne répond pas à la question posée.

**Le témoin se pose dans `aiService.generateContent`, pas chez l'appelant.** Il vivait
dans `callAI`, passage unique des appels **de l'éditeur** — ce qui laissait muets
l'Analyste, l'Éclateur et le découpage de sous-titres, qui ne passent pas par là. Le
raisonnement du signalement d'échec vaut mot pour mot ici : sept appelants qui doivent
chacun penser à afficher, c'est sept occasions d'oublier. `callAI` ne sert plus qu'à
traduire l'identifiant d'action en libellé.

**Le bandeau vit dans la coque de l'application**, sous l'en-tête, et non dans l'écran qui
déclenche. Un appel lancé depuis l'atelier reste donc visible quand on revient à la
liste — et il l'est aussi depuis Réglages ou Sous-titres, d'où partent des appels que
l'éditeur n'a jamais vus.

**Ce qui attend porte une barre — NORMATIF.** Aucun aller-retour ne se signale par un
rond qui tourne seul : chaque témoin d'attente porte une barre de progression, et chaque
bouton qui travaille NOMME son travail (« Rédaction… »), jamais « ... ». Trois formes
distinctes suffisent, définies une fois dans `components/Feedback.tsx` — `Barre`,
`EnCours` (dans un bouton), `Patience` (un panneau entier) — et le registre
`services/activityService.ts` dit ce qui tourne.

La barre **remplit quand on sait, balaie quand on ne sait pas**. Un appel IA ne se compte
pas : son échéance est estimée d'après la médiane des appels comparables déjà mesurés
(même action, même modèle), gardés en local. Sous deux mesures, il n'y a pas d'habitude
et la barre balaie. La progression estimée s'approche de 100 % **sans jamais l'atteindre**
— une barre pleine avant la réponse est un mensonge qu'on ne peut plus rattraper. Passé
deux fois et demie l'échéance attendue, le bandeau le dit : c'est le seul moment où
l'écran sait distinguer « ça travaille » de « c'est bloqué ».

**La synchronisation ne bloque plus l'écran.** Elle posait un voile sur toute la fenêtre,
y compris celle qui part seule au démarrage : elle ne réclame rien, donc elle n'interdit
rien. Elle se nomme dans le bandeau, comme le reste. Seule la première lecture du cache
occupe encore l'écran, faute d'avoir quoi que ce soit à montrer derrière.

**Aucun résultat d'IA n'est écarté avant de savoir si la suite a abouti.** Le rapport du
Lecteur froid partait dès le clic sur « Appliquer les corrections », sans attendre : un
échec côté fournisseur laissait une erreur à l'écran et plus rien pour réessayer — les
problèmes relevés et les corrections proposées étaient perdus, et c'était la seule copie
sous les yeux. Ce qui déclenche une action IA doit donc en recevoir le verdict.

**Tout échec d'appel IA s'annonce, et de la même façon — NORMATIF.** Le signalement vit
dans `aiService.generateContent`, par où passent les sept appelants de l'application ;
l'application s'y abonne et rend un message unique : « Échec — {action} », suivi du texte
du fournisseur, mot pour mot.

Pourquoi là et pas chez les appelants : le 24/08/2026, une « Lecture froide » a échoué
faute de crédits et **rien** ne s'est affiché — l'appelant avalait l'erreur pour ne pas
bloquer la rédaction, ce qui était un bon réflexe pour la rédaction et un mauvais pour
Florent. Sept appelants qui doivent chacun penser à afficher, c'est sept occasions
d'oublier ; un seul passage obligé, c'est zéro.

L'erreur est **marquée** au passage. Un appelant sait donc qu'elle est déjà annoncée et
n'en fait pas une seconde présentation ; ce qu'il montre encore lui-même, c'est ce qui a
cassé APRÈS la réponse — un parsing, une écriture. Une exception assumée : l'atelier du
Coach garde en plus sa trace dans la conversation, parce qu'une fois le message refermé,
un tour sans réponse ressemblerait à un tour qui charge encore.

### 3.5.2 La relecture à froid ne tourne pas en rond — NORMATIF

Le Lecteur froid est **sans mémoire du contenu**, et ça ne change pas : il doit lire avec
les yeux d'un inconnu, sinon il ne sert à rien. Mais sans mémoire **de ses propres
demandes**, il condamne à la passe N+1 la phrase qu'il a dictée à la passe N.

Ce n'est pas une hypothèse. Le 24/08/2026, le carrousel « Le masque qu'on recoud » a été
relu quatre fois sans jamais sortir de « À retoucher » :

| passe | ce qu'il dicte / ce qu'il condamne |
|---|---|
| 2 | dicte slide 5 : « on ne saute pas la salle pour aller au balcon » |
| 3 | condamne : « géographie incohérente sur 4 lieux » ; dicte : « on ne passe pas la scène par-dessus pour filer aux coulisses » |
| 4 | condamne : « la métaphore tourne à vide, je relis deux fois et je ne sais toujours pas ce que ça veut dire » |

Une phrase écrite par un critique pour cocher une case est rarement une bonne phrase en
contexte : il la relit à froid, elle ne passe pas, il en dicte une autre. Rien n'arrête
ça. **Quatre règles y mettent fin.**

**1. La relecture connaît ses passes précédentes.** Les corrections qu'elle a dictées ET
qui ont été appliquées lui reviennent, dans l'ordre, avec la règle qui va avec : une
phrase qu'elle a elle-même écrite ne se rejette que si elle peut dire **en quoi elle est
pire que ce qu'elle remplaçait**. Un point déjà obtenu ne se rouvre pas sous un autre nom.

L'historique s'arrête à la **dernière rédaction complète** : au-delà, les corrections
parlent d'un texte qui n'existe plus, et les annoncer comme présentes serait faux. Il se
reconstruit depuis le journal (§2.6) ; l'en-tête `COLD_READ_APPLY_PREFIX` est ce qui rend
une ligne d'ajustement reconnaissable, d'où la constante partagée plutôt que deux chaînes
recopiées.

**2. « Rien à signaler » est une réponse valide.** Le persona demandait d'être dur et « un
problème signalé = une correction proposée » ; le schéma exigeait `problemes` et
`controles` ; et le verdict était défini **en négatif sur ce champ-là** — « Publiable si
aucun problème Bloquant ou Important ». On demandait à un critique de produire des
reproches, puis on conditionnait la sortie à ce qu'il n'en produise pas. Une liste vide
est désormais explicitement attendue quand le contenu tient.

**3. La retouche reçoit la grille qui a produit le contenu.** `formatTemplate` et
`objectifCta` n'arrivaient que dans `DRAFT_CONTENT` : le Rédacteur retouchait donc sans
les limites qui avaient gouverné sa propre production, et sans les règles CTA que la
relecture, elle, vérifiait. Deux mètres pour la même règle, et une slide repassée
au-dessus de la limite à chaque retouche.

**4. Ce qui se compte se compte dans le code, pas dans le prompt.** Le garde-fou
déterministe des longueurs ne tournait qu'après une rédaction complète. Une retouche
pouvait donc repasser une slide au-dessus de la limite sans que rien ne le voie — c'est
arrivé à un caractère près (« slide 6 = 141 caractères »), sur une correction que le
Lecteur froid avait lui-même annoncée à « 137 car. ». Il tourne aussi après un ajustement,
et la relecture n'annonce plus aucun décompte pour les corrections qu'elle propose : un
décompte faux rend le vrai inutile.

**La légende d'un carrousel est arbitrée.** « La légende ne répète pas les slides » était
KO aux quatre passes, sans jamais être réparable : la grille demande une légende qui
prolonge le propos dans la voix de Florent, donc elle reprend la métaphore. Les deux
côtés disent maintenant la même chose — la légende porte ce que les slides ne peuvent pas
porter (un exemple anonymisé, ce que ça change), reprendre la métaphore centrale n'est pas
un doublon, et seule une phrase entière recopiée qui n'ajoute rien se signale.

### 3.6 Budget de requêtes (contrainte du plan gratuit)

Maximum **50 requêtes D1 par invocation**. Conséquences normatives :

- Interdiction du N+1. Une série et ses contenus se lisent par **une** jointure.
- `POST /api/contents/batch` utilise `db.batch()` — un aller-retour, pas N.
- Toute route nouvelle doit pouvoir énoncer son nombre de requêtes, borné et indépendant
  du volume de données.

### 3.8 Prise de rendez-vous Calendly — NORMATIF

`GET /api/rdv/types` · `GET|PUT /api/rdv/selection` · `GET /api/rdv/creneaux` · `POST
/api/rdv`. **Une requête D1, et seulement sur `/selection`** : le reste ne parle qu'à
Calendly.

**Pourquoi elle existe, et pourquoi elle n'existe que pour ça.** Depuis le milieu de
l'année 2026, Calendly demande à l'invité de confirmer son numéro par SMS avant de lui
envoyer le moindre rappel. Quand l'invité réserve lui-même, il confirme ; quand le
rendez-vous est posé pour lui — au téléphone, en fin de séance — personne n'est là pour
répondre, et **aucun rappel ne part**. La Scheduling API accepte, elle, un numéro fourni
par le compte (`text_reminder_number`) : le titulaire du compte atteste du consentement,
comme le fait déjà le panneau « Réserver une réunion » de l'administration Calendly.

Ce n'est donc pas un agenda, ni un CRM. C'est un raccourci qui remplace quatre écrans de
l'administration Calendly, et **le numéro est sa seule raison d'être**.

- Le jeton vit dans `CALENDLY_TOKEN`, secret du Worker, portée
  `scheduled_events:write`. **Facultatif** : absent, l'écran se tait en disant ce qui
  lui manque (`Refus` 409), et rien d'autre dans l'application ne bouge.
- Un refus de Calendly revient avec **son** message (`Refus`, 4xx) : « ce créneau n'est
  plus disponible » se corrige, « Erreur interne » ne se corrige pas.
- Le numéro est normalisé en E.164 avant l'appel ; un numéro incompréhensible est refusé
  **avant** d'appeler Calendly.
- L'écran rend le numéro **retenu par Calendly**, pas celui qui a été envoyé : sur la
  seule promesse de la fonctionnalité, « envoyé » ne vaut pas « accepté ».
- **Le lieu se transmet en entier.** Un 400 en production l'a appris :
  `location.location is required when location.kind is 'outbound_call', 'ask_invitee',
  'physical' or 'custom'`. Le `kind` voyage donc avec le TEXTE du lieu, pré-rempli
  depuis le type d'événement et corrigeable à l'écran ; pour un appel sortant, le numéro
  de l'invité sert de repli. Un type qui déclare plusieurs lieux — visio ou appel
  sortant — les propose tous, puisque c'est l'invité qui trancherait d'ordinaire.
- **Le formulaire d'invité se remplit ici.** Second 400 : « Required Questions and
  Answers cannot be blank ». Les questions du type sont donc remontées avec lui et
  posées à l'écran ; une question à choix unique qui n'a qu'une réponse possible — les
  conditions d'annulation — se coche d'elle-même. `position` voyage avec chaque réponse :
  c'est elle, et non l'intitulé, qui rattache une réponse à sa question. Une réponse
  vide n'est jamais envoyée : elle ferait refuser la liste entière.
- **Le lieu final est relu sur l'événement créé.** La réponse de création ne porte pas
  l'URL de visioconférence ; un appel de plus la rapporte, et l'écran affiche le lien
  Google Meet — ou son absence, qui est l'information utile quand la séance est à
  distance. Cette relecture ne peut pas faire échouer une réservation déjà acquise.

#### Deux façons de lister les créneaux, et pourquoi la seconde existe

Le mode normal interroge `event_type_available_times`, donc **ce que Calendly publie** :
délai minimum et horizon de réservation compris. Relevé sur « Séance » au 22/09/2026 :
48 h de délai, horizon glissant de 21 jours.

Ces deux garde-fous protègent la page publique. Ils n'ont aucun sens quand c'est le
praticien qui pose le rendez-vous, au téléphone, pour demain ou pour dans deux mois. Le
mode `libre=1` recompose donc les créneaux à partir de deux sources publiques — le
planning de disponibilité et les plages occupées — et **ignore les deux**. Calendly
lui-même offre l'équivalent dans son administration (« Remplacer les heures de
disponibilité »).

Ce que ce mode ne sait pas faire, et qui doit rester écrit : c'est le planning **par
défaut** qui sert, l'API v2 ne disant pas quel planning suit un type d'événement ; les
tampons avant et après ne sont pas appliqués ; le pas vaut la durée de l'événement. Il
**propose**, il ne garantit pas — Calendly reste seul juge au moment de créer, et son
refus s'affiche tel quel.

Les deux modes couvrent **trois mois**, découpés en tranches de sept jours (le plafond
de Calendly, disponibilités comme occupations) et envoyés par paquets de quatre : treize
requêtes d'un coup sont une limite de débit assurée.

#### Ce que l'écran affiche

Les types retenus vivent dans `app_settings` sous `rdv:types` et s'affichent en boutons
radio, tous visibles. **Une sélection vide veut dire « tous »** : c'est l'état d'un
déploiement neuf, et un écran qui ne proposerait rien s'y lirait comme une panne.

#### Dépendance externe, hors du code

Le numéro enregistré ne sert qu'à ce que Calendly décide d'envoyer. Deux familles de
réglages s'en chargent, et elles s'ajoutent : les **notifications du type d'événement**
(Notifications et annulation) et les **workflows**.

Relevé le 22/09/2026 sur « Séance » : le rappel SMS à l'invité est **actif**, un jour
avant, avec un corps personnalisé ; le rappel e-mail l'est aussi, trois jours avant ; un
workflow ajoute un e-mail à sept jours. Attention à la lecture : ces réglages vivent
dans les notifications **personnalisées** du type, et les gabarits par défaut
apparaissent alors désactivés — les confondre fait conclure à l'inverse de la réalité.

### 3.9 Transcription d'une prise

`POST /api/transcription` — le son d'une prise vidéo, en WAV base64, rend ses mots
horodatés. Workers AI, 0 requête D1. Voir §12.5.

### 3.10 Montage d'un Reel expliqué

```
GET    /api/montage                                  le résumé de tous les montages (1 batch)
GET    /api/montage/:id                              prises, visuels, espace occupé (1 batch)
POST   /api/montage/:id/prises/:role                 déclare une prise, ouvre son envoi (4)
PUT    /api/montage/:id/prises/:role/parties/:n      une partie, 50 Mo au plus (1)
POST   /api/montage/:id/prises/:role/terminer        ferme l'envoi (2)
DELETE /api/montage/:id/prises/:role/envoi           abandonne un envoi raté (2)
GET    /api/montage/:id/prises/:role/fichier         le fichier, en flux (1)
PATCH  /api/montage/:id/prises/:role                 transcription, repères (2)
DELETE /api/montage/:id/prises/:role                 retire la prise et son fichier (2)
PUT    /api/montage/:id/visuels/:seq/:el             l'image d'une carte, 15 Mo au plus (4)
GET    /api/montage/:id/visuels/:seq/:el             (1)
DELETE /api/montage/:id/visuels/:seq/:el             (2)
POST   /api/montage/:id/exports                      note un export réussi (2)
```

`:role` vaut `principale` ou `accroche`. Entre parenthèses, le nombre de requêtes D1.
Voir §12.4.2 et §12.4.3.

### 3.7 Ce qu'une liste retient — NORMATIF

**Le tri et le filtre d'une liste vivent sur le compte, pas dans le navigateur.**
`app_settings`, sous `vue:<liste>` — la même table que les clés et les modèles par
action, une ligne par liste, sa valeur en JSON `{tri, sens, filtre}`.

Deux routes, une requête chacune : `GET /api/settings/vues` rend toutes les listes d'un
coup, `PUT /api/settings/vues/:vue` en pose une. Une liste absente n'a jamais été triée.

Pourquoi pas `localStorage` : un tri qu'il faut refaire à chaque poste n'est pas un
réglage, c'est une corvée qui revient. Et il ne tenait même pas d'un onglet à l'autre —
l'état vivait dans `ContentTable`, donc il repartait à zéro à chaque montage.

**La colonne n'est PAS validée contre une énumération côté Worker.** Les colonnes
appartiennent à l'écran et bougent avec lui ; un réglage qui en désigne une disparue doit
retomber sur le tri par défaut, pas faire échouer l'écriture suivante. Le Worker garde la
forme (`sens` vaut `asc` ou `desc`, les chaînes sont bornées), le front valide `tri`
contre ses propres colonnes. Une valeur illisible en base est ignorée **sans emporter les
autres listes**.

**L'écran suit tout de suite, la base rattrape après.** Un échec d'écriture ne s'affiche
pas : le tri reste appliqué pour la session, seule sa mémoire est perdue. C'est la seule
exception assumée à « un échec se voit » — un bandeau pour un clic sur un en-tête
coûterait plus d'attention que le réglage n'en vaut.

**Le tri est piloté, jamais local.** `ContentTable` et `SeriesView` reçoivent `tri` et
`onTri` ; le clic ne décide de rien, il demande. La règle du clic — même colonne, on
inverse ; autre colonne, on repart en croissant — et l'en-tête cliquable vivent dans
`components/TriTableau.tsx`, seule autorité. Elles étaient enfermées dans `ContentTable`,
où les Séries ne pouvaient pas les atteindre : leur tableau n'avait donc aucun tri.

Cinq listes en retiennent un : `ideas`, `drafts`, `ready`, `archive`, `series`. Le filtre
n'existe aujourd'hui que sur la boîte à idées ; le réglage le porte pour toutes, prêt pour
celles qui en auront un.

---

## 4. `packages/editorial` — NORMATIF

Le cœur du produit. **Zéro dépendance.** Contient, repris tel quel de l'existant :

| Module | Rôle |
| :--- | :--- |
| `prompts/` | les personas (Analyste, Interviewer, Coach, Verrouilleur, Rédacteur, Lecteur froid, Artiste, Éclateur) et `buildSystemPrompt()` |
| `voice.ts` | `VOICE_RULES` — règles de voix transverses. **Engendré** depuis `packages/corpus/content/voix/regles-de-voix.md` par `npm run embarquer` ; gitignoré. |
| `formats.ts` | `FORMAT_REGISTRY` — source unique de vérité du routage par format |
| `objectives.ts` | `OBJECTIF_REGISTRY` — guidance Analyste + règles CTA |
| `actions.ts` | composition des instructions système par action |
| `executors.ts` | parsing défensif des réponses IA |
| `reelExplique.ts` | la forme du Reel expliqué et ses contrôles déterministes (§12.3) |

### 4.1 Invariants

1. **Aucun appel réseau.** Ce package compose des chaînes et parse des chaînes.
2. **`FORMAT_REGISTRY` est la seule autorité** sur : où stocker le résultat
   (`storageField`), où atterrir après rédaction (`editorTab`), qui a droit à la relecture
   à froid (`supportsColdRead`). Aucun test de format en dur ailleurs.
3. **Toute modification d'un prompt exige une fixture golden** mise à jour (§10.2).
4. Le format cible d'un contenu est **choisi par l'humain** et n'est jamais écrasé par l'IA.

---

## 5. `packages/ai` — abstraction fournisseur — NORMATIF

### 5.1 Le problème

`oneMinService.ts` est taillé pour 1min.ai, dont l'API n'est pas standard : conversations
créées séparément, historique aplati à la main dans un prompt unique
(`buildConversationPrompt`). Changer de fournisseur demanderait aujourd'hui de réécrire
tous les points d'appel.

### 5.2 Le port

```ts
export interface ChatMessage { role: 'user' | 'assistant'; content: string }

export interface ChatRequest {
  model: string;              // identifiant opaque, propre au fournisseur
  system?: string;
  messages: ChatMessage[];
  json?: boolean;             // exiger une sortie JSON stricte quand le fournisseur sait le faire
}

export interface ChatResult { text: string; raw?: unknown }

export interface AIProvider {
  readonly id: string;                                   // 'onemin' | 'openai' | 'anthropic'
  chat(req: ChatRequest): Promise<ChatResult>;
  test(model: string): Promise<{ ok: boolean; detail?: string }>;
}
```

Le port est **volontairement étroit** : pas de streaming, pas d'outils, pas de multimodal.
Le produit n'en a pas besoin, et chaque capacité ajoutée est une capacité à réimplémenter
pour chaque fournisseur.

**Une reprise, et une seule — NORMATIF.** Les adaptateurs rejouent un appel qui a
échoué de façon PASSAGÈRE : 408, 409, 425, 429, 5xx, ou un transport qui lâche sans
réponse. Tout le reste — 401, 402, 404, 422, et les refus métier rendus dans un 200,
comme le manque de crédits chez 1min.ai — est un refus **motivé** : le rejouer ne
changerait rien et retarderait un message déjà clair.

Une seule reprise, parce qu'un appel de rédaction dure déjà des dizaines de secondes et
qu'une génération peut avoir abouti côté fournisseur avant que sa réponse se perde —
chaque tentative supplémentaire est facturée. Deux essais couvrent le hoquet ; au-delà,
c'est une panne, et mieux vaut le dire.

Elle est née d'un fait : le 23/08/2026, un « Go Éditeur » a échoué puis fonctionné à
l'identique la fois suivante. Aucune reprise n'existait nulle part.

### 5.3 Deux notions distinctes de « fournisseur »

Aujourd'hui la colonne `provider` sert à grouper l'affichage (« OpenAI », « Anthropic »).
Dans le modèle cible, deux colonnes :

| Colonne | Rôle | Exemple |
| :--- | :--- | :--- |
| `provider` | **quel adaptateur appeler** | `onemin` |
| `vendor` | qui a fabriqué le modèle, pour l'affichage | `OpenAI` |

Un même modèle peut ainsi être joignable via 1min.ai aujourd'hui et en direct demain :
on change une valeur dans la table, pas une ligne de code.

Adaptateurs disponibles : `onemin`, `openai`, `openrouter`. Le troisième n'est
qu'une URL de base posée sur le second — OpenRouter expose l'API
`/chat/completions` d'OpenAI. C'est la démonstration que le port tient : un
fournisseur de plus n'a obligé à réimplémenter personne.

### 5.4 Le testeur

`POST /api/ai/test` avec `{ apiCode, provider }` appelle `provider.test(apiCode)`.

Il porte sur un **code**, pas sur un modèle du catalogue : au moment du test, le modèle
n'existe pas encore — c'est précisément ce qu'on cherche à valider. Le test est devenu
générique, c'est l'adaptateur qui sait comment sonder son API au coût le plus bas.

### 5.5 Où vivent les clés — NORMATIF

Une clé de fournisseur peut être posée de deux façons :

| Origine | Pose | Priorité |
| :--- | :--- | :--- |
| `app_settings`, sous `provider_key:<adaptateur>` | Réglages → Clés | **l'emporte** |
| Variable d'environnement (`ONE_MIN_API_KEY`…) | `wrangler secret put` | repli |

**L'invariant reste le même, et c'est lui qui compte : une clé n'a aucun chemin
de retour vers le navigateur.** Elle entre par `PUT /api/settings/providers/:id`,
sert aux appels, s'efface par `DELETE` — mais aucune route ne la relit. La liste
ne rend qu'une empreinte de quatre caractères et l'origine de la clé : assez pour
reconnaître laquelle est posée, trop peu pour s'en servir.

Deux conséquences non négociables :

1. **L'export (§9.4) exclut ces lignes.** Une sauvegarde se range dans un
   dossier, s'envoie par mail, se pose sur un disque externe. Y glisser des
   identifiants d'API en ferait un secret de plus à protéger.
2. **Le repli sur l'environnement est conservé.** Un déploiement qui pose ses
   secrets avec `wrangler secret put` continue de fonctionner sans que personne
   touche à l'interface.

Ce que ce choix coûte, dit franchement : une clé en base est lisible par qui
peut interroger la base, là où un secret Cloudflare ne l'est par personne, pas
même par l'application. Le gain est l'autonomie — changer de fournisseur ne
demande plus la ligne de commande ni un redéploiement.

### 5.6 L'explorateur de catalogue

`GET /api/models/catalogue` croise **trois** appels sortants. Cache d'une heure,
clé de cache versionnée : les quotas d'OpenRouter sont de 30 requêtes/minute et
500/jour, et un déploiement qui change la forme de la réponse ne doit pas servir
l'ancienne une heure de plus.

| Source | Clé | Ce qu'elle apporte |
| :--- | :--- | :--- |
| OpenRouter `/models` | non | prix, contexte, code exact |
| OpenRouter `/benchmarks` | oui | indices d'Artificial Analysis |
| EQ-Bench *Creative Writing* | non | Elo, note d'écriture, tournures d'IA, profil par critère |

**Ce que les indices d'Artificial Analysis ne mesurent pas.** Les `task_type`
publiés sont `coding`, `intelligence`, `agentic`, `search`. Aucune tâche du flux
éditorial n'est là-dedans : ni juger avec constance, ni recopier un JSON sans
l'abîmer, ni écrire du français incarné sous contrainte de voix. Ils restent
utiles à la famille *Synthétiser*, et à rien d'autre.

**Pourquoi EQ-Bench.** Il juge de la prose, et trois de ses quinze critères
redisent mot pour mot les règles de voix du §3 : *Show-Don't-Tell*, *Avoids
Purple Prose*, *Avoids Positivity Bias*. Son `slop_score` — la densité de
formules toutes faites — est l'exact anti-pattern que les personas combattent,
et c'est la mesure la plus discriminante du jeu (de 6 à 63).

**Ses limites, à dire à l'écran.** Ce n'est pas une API publiée : ce sont les
fichiers que sa page de classement charge, et leur forme peut changer sans
préavis. Il juge de la fiction, en anglais : c'est un **indice** de la voix de
Florent, pas une mesure. La route l'entoure donc en conséquence — son absence
vide les colonnes d'écriture, bascule l'écran sur le catalogue entier, en dit la
raison, et n'emporte rien d'autre.

**La clé OpenRouter ne part qu'à OpenRouter — NORMATIF.** EQ-Bench est une
source tierce ajoutée après coup ; aucun appel sortant vers un autre hôte ne
porte d'en-tête d'autorisation. Le §7 s'applique ici sans exception.

#### La courte liste — NORMATIF

Quatre cents modèles au catalogue, sept utilisés au plus. L'explorateur s'ouvre
donc sur **vingt modèles délibérément différents**, le catalogue entier restant
à un clic. La doctrine vit dans `packages/editorial/src/shortlist.ts`, pas dans
l'écran ni dans la route :

1. **Deux planchers.** Elo ≥ 1400 et slop < 30 : un quota de palier ne justifie
   pas de recommander ce qu'on ne recommanderait pas. Un palier pauvre reste
   incomplet, et ses places sont redistribuées.
2. **L'accès le moins cher d'un même modèle.** Un modèle est publié sous
   plusieurs codes — `:free`, `:batch`, variante datée, déclinaison de taille.
   On n'en garde qu'un, le moins cher ; à prix égal, le meilleur Elo tranche.
   Sans cette étape la liste proposait Inkling à 4,05 $ alors qu'il est gratuit.
3. **Six paliers de prix**, resserrés en bas — entre 0,08 $ et 1 $ l'arbitrage
   est réel, entre 25 $ et 50 $ il ne l'est plus guère.
4. **Trois modèles par fabricant au plus**, et **une seule lignée par ligne** :
   `v4-flash-latest` et `v4-flash-0731` sont le même modèle, `kimi-k2.6` et
   `kimi-k3` ne le sont pas.
5. **Les dominés tombent** — moins bon sur les trois axes sans être moins cher.
   La comparaison est bornée **au palier ET au fabricant**, et ces deux bornes
   portent tout le sens de la règle :
   - le **palier**, parce qu'un modèle gratuit bat sur le papier n'importe quel
     modèle à 0,08 $ tout en étant plafonné en débit — il ne le remplace pas ;
   - le **fabricant**, parce que ces notes mesurent de la fiction en anglais. Un
     écart de deux dixièmes n'y dit rien du français de Florent, et laisser ce
     bruit effacer la maison d'en face coûterait ce qui a le plus de valeur :
     une porte de sortie quand l'une tombe, sature, ou déplaît à la lecture.

   Ce que la règle sait donc dire, et rien de plus : *un fabricant remplace son
   propre modèle*. Opus 5 efface Fable 5 — même maison, moitié prix, meilleur
   sur les trois axes ; il n'efface pas Kimi K3.

Le classement interne pèse l'Elo à 45 %, la note d'écriture à 25 %, l'absence de
tournures d'IA à 30 %.

Au 23/08/2026, ces règles rendent **20 modèles de 11 fabricants**, répartis sur
les six paliers.

L'explorateur sert à **réduire le champ** — jamais à décider. L'écran le dit,
parce qu'un chiffre affiché sans cette phrase se lit comme un verdict.

#### Le profil d'un modèle

« Coût / Crédits », « Qualité rédaction » et « Forces & cas d'usage » se
remplissaient de mémoire, à partir de ce qu'on croyait savoir d'un modèle. Les
mesures existent : elles écrivent ces trois champs, à l'ajout depuis le
catalogue comme au clic sur **Actualiser** pour un modèle déjà posé.

- **Coût** — les mêmes paliers que la courte liste, le gratuit et le micro fondus.
- **Qualité rédaction** — cinq crans sur l'Elo, moins un cran au-delà de 30 de
  slop : un modèle bien classé qui empile les formules toutes faites ne portera
  pas cette voix-là, quoi qu'en dise son rang.
- **Forces** — les forces relatives, les trois mesures, les familles du flux
  auxquelles il convient avec les actions nommées, et **la date du relevé** :
  ces chiffres vieillissent, et un champ rempli sans date se lit comme une
  vérité intemporelle.

**Le prix appartient au fournisseur, l'écriture au modèle — NORMATIF.** Le même
Claude coûte des crédits chez 1min.ai et des dollars par million de jetons chez
OpenRouter. Actualiser un modèle appelé par un AUTRE adaptateur écrit donc la
qualité et les forces, **jamais le coût**, et le texte dit que les tarifs du
fournisseur n'y sont pas repris. La correspondance passe par la même
normalisation que l'appariement des sources : sans elle, `claude-fable-5` et
`anthropic/claude-fable-5` seraient deux modèles étrangers.

---

## 6. Séries et déclinaisons

### 6.1 Le modèle

Voir §2.5. Une série porte un titre (le sujet), une intention, un statut, et
éventuellement un contenu source.

### 6.2 L'Éclateur (persona)

Action `PLAN_SERIES`. Reçoit soit le thème et l'intention, soit le texte du contenu
source, et renvoie un plan de publication :

```json
[{ "titre": "…", "angle": "…", "format": "Post Texte (Court)",
   "objectif": "Recadrage de croyance", "justification": "…", "notes": "…" }]
```

L'ordre du tableau EST la progression (§2.9) : la création en lot y lit le rang.

`notes` porte **la matière** de la publication — ce qu'elle doit contenir, prélevé du
pilier ou du thème. Elle alimente `contents.notes`, celle-là même que Florent écrirait à
la main. Sans elle, une publication de série naît avec un titre et rien d'autre, et tout
est à reconstruire.

**Le format est RÉSOLU, jamais comparé à l'identique — NORMATIF.** `resoudreFormat`
ramène la désignation à une forme comparable (minuscules, sans accents ni ponctuation),
accepte les clés courtes du registre, et rattrape un mot décisif isolé — « Reel »,
« Carrousel », « Newsletter ».

La comparaison était une égalité stricte de chaîne, accents et parenthèses compris. Le
24/08/2026, un plan est arrivé avec des publications sans format alors que l'Éclateur en
avait clairement désigné un : son intention était jetée en silence. Le prompt y contribue
— deux lignes après avoir exigé « la valeur EXACTE », il abrège lui-même en « Post
Texte », « Carrousel », « Script Vidéo ».

La résolution s'arrête où commence la devinette : « Vidéo » seul ne départage pas le Reel
du Youtube, et rend `null`. Choisir à la place de Florent sans le lui dire serait pire que
de ne pas choisir.

**Une ligne de plan ne devient un contenu qu'avec un format — NORMATIF.** Deux notions
distinctes, et la distinction n'est pas cosmétique :

| Règle | Exige | Sert à |
| :--- | :--- | :--- |
| `isPlanEntryUsable` | un titre | garder la ligne au tableau — c'est ce filtre qui s'applique à la réponse de l'Éclateur |
| `isPlanEntryCreatable` | un titre **et** un format | autoriser la création du contenu |

Les confondre ferait DISPARAÎTRE du plan les lignes sans format au lieu de demander à
Florent de les compléter. Une ligne non créée reste au tableau, et l'écran dit ce qui lui
manque : un bouton grisé sans explication est une énigme.

Même exigence à l'ajout rapide d'une idée. Le motif est le même dans les deux cas : le
format ne se modifie que tant que le statut vaut `Idée`, et « Travailler cette idée »
referme cette porte. Un contenu créé sans format traverse le flux amputé de son Brouillon,
de sa Copie et de ses Slides, sans que rien ne le dise.

**L'Éclateur est l'Analyste de sa série — NORMATIF.** Angle, format et objectif sont
décidés ici, en voyant l'ensemble, et ne sont pas repassés à l'Analyste publication par
publication : celui-ci ne voit qu'une idée isolée et casserait l'équilibre éditorial que
l'Éclateur vient de construire. Les contenus créés arrivent donc **analysés**
(`analyzed_at` posé), hors du lot « À analyser ».

Il reçoit `OBJECTIF_REGISTRY` en contexte, y compris la règle d'équilibre éditorial
(« sur 10 publications, viser ~2 Notoriété, 3 Recadrage… »). Aujourd'hui cette règle ne
guide qu'une idée isolée ; **une série est le premier endroit où elle devient
actionnable**.

### 6.3 Le plan de série

Un seul écran, deux portes d'entrée : « Décliner » depuis un contenu Prêt ou Publié,
« Nouvelle série » depuis l'onglet Séries. Tableau éditable, puis création en lot via
`POST /api/contents/batch`.

**Atomicité** : le lot est créé dans une transaction D1. Six contenus créés ou zéro,
jamais une série à moitié peuplée.

**Les publications naissent en `Brouillon`, pas en `Idée` — NORMATIF.** L'étape Idée sert
à décider ce qu'on fait d'une intuition : son format, son angle, son objectif, et
faut-il l'analyser. Pour une publication de série, tout cela est déjà tranché — par
l'Éclateur, en voyant l'ensemble (§6.2), et le format est exigé avant création. Il ne
reste rien à faire à cette étape : c'était un passage obligé sans travail à l'intérieur.

Elles arrivent donc dans « En cours », prêtes pour l'Atelier, avec `analyzed_at` posé.

### 6.4 L'anti-répétition — NORMATIF

C'est la raison d'être de la fonctionnalité. Un contenu appartenant à une série est
travaillé avec, en plus :

1. le thème et l'intention de la série ;
2. le texte du contenu source, **si et seulement si** la série en a un ;
3. **les angles des contenus frères** — leurs `titre` et `angle`, **jamais leur texte
   complet**, avec la consigne explicite de ne pas empiéter ;
4. **sa place dans la progression** — la liste est rendue dans l'ordre, le contenu
   courant à son rang : ce qui précède est déjà dit, ce qui suit viendra.

La restriction du point 3 n'est pas une optimisation : sans elle, le prompt croît avec la
série et finit par noyer la consigne.

**Ce bloc irrigue TOUT l'atelier, pas seulement la rédaction.** Le Coach le reçoit dans
son brief d'ouverture, le Verrouilleur dans sa charge utile, le Rédacteur dans son prompt
système. Le donner au seul Rédacteur revenait à laisser l'atelier — l'endroit où la
direction se décide — choisir une direction qu'il faudrait corriger ensuite.

---

## 7. Authentification et sécurité

Le dispositif actuel est conservé : jeton `"<payload base64>.<signature base64>"`, signé
HMAC-SHA256 avec `SESSION_SECRET`, vérifié en temps constant. Il vient d'être posé et
testé ; le migrer n'apporterait rien.

Ce qui change : l'origine unique (§1.2) supprime CORS. `ALLOWED_ORIGINS` disparaît.

Reste ouvert, non bloquant : comparaison des identifiants en temps constant, limitation de
débit sur `/api/auth/login` (demanderait un binding KV), et à terme Cloudflare Access en
remplacement complet du couple identifiant/mot de passe.

**Invariant** : aucune clé de fournisseur (Notion, 1min.ai, OpenAI, OpenRouter…)
ne quitte le Worker. Elles peuvent désormais y ENTRER depuis l'administration et
être stockées en base (§5.5) — la direction est à sens unique, et c'est elle que
l'invariant protège.

---

## 8. Cache local et synchronisation

IndexedDB conserve son rôle : affichage immédiat au démarrage, puis synchronisation en
fond. Le protocole se simplifie radicalement.

```
GET /api/contents?since=<updated_at max connu>
   → lignes modifiées ET lignes supprimées depuis
   → le client applique : upsert des vivantes, purge des supprimées
```

Plus de synchronisation complète périodique, plus de balayage d'identifiants, plus de
fusion par `mergeById` avec cas particuliers.

**Conservé de l'existant** : la protection contre l'écrasement du travail non enregistré.
Un contenu dont l'écriture a échoué reste protégé de la synchronisation et signalé par un
bandeau. Ce comportement a été construit pour une bonne raison ; il survit à la migration.

---

## 9. Migration des données

> **Exécutée, et ses outils retirés le 20/09/2026.** Ce chapitre reste comme **record** de la
> façon dont les données sont arrivées dans D1 — utile le jour où une valeur paraîtra louche.
> Les commandes ci-dessous ne s'exécutent plus telles quelles : `tools/import-notion` et
> `tools/export-notion` ont quitté le dépôt un mois après la bascule.
>
> Ils restent dans l'histoire, intacts et vérifiés :
> `git show f7f7e9f:tools/import-notion/import.mjs` (14 824 octets) ·
> `git show f7f7e9f:tools/import-notion/verify.mjs` (11 050 octets) ·
> `git show 84c08ee:fixtures/notion-export-2026-08-19-19-24-09.json` (1 716 190 octets).
>
> Partent avec eux les 13 tests de `splitSignature` — l'analyse des signatures « Généré par :
> … » collées aux brouillons Notion. Logique de migration uniquement : rien de vivant ne
> l'importait, et D1 porte `model_label` en colonne plutôt qu'en suffixe de texte.

### 9.1 Principe

`tools/import-notion` lit les deux bases Notion et **produit un fichier `import.sql`**
d'instructions `INSERT OR REPLACE`, avec des identifiants dérivés des pages Notion. Le
fichier est donc **ré-exécutable sans doublon**, ce qui autorise autant de répétitions
que nécessaire.

```bash
NOTION_API_KEY=… npm start -w tools/import-notion
cd workers/api && npx wrangler d1 execute DB --remote --file=../../tools/import-notion/import.sql
```

### 9.2 Correspondance des champs

Table complète en Annexe B. Points d'attention :

- `Contenu` / `Slides` / `Script vidéo` / `Post Court` : lus en **texte brut**, jamais
  réinterprétés en markdown.
- `Plateforme` (multi-select) → JSON array en TEXT.
- Dates Notion (ISO) → epoch ms.
- `Réponses interview` / `Questions interview` : migrés dans une colonne `legacy_json`.
  Champs morts, mais on ne détruit pas de données pendant une migration.

### 9.3 Vérification — NORMATIF

La migration n'est pas terminée quand le SQL passe. Elle est terminée quand un script de
vérification a comparé, **pour chaque ligne et chaque champ**, la valeur Notion et la
valeur D1, et affiché zéro écart. Ce script fait partie du livrable de la phase 4.

### 9.4 Filet

- **Avant tout** : export JSON complet des deux bases Notion, versionné dans le dépôt.
  C'est la phase 0. Produit le 19/08/2026 par un outil `tools/export-notion` retiré depuis,
  il portait pour chaque base le `schema` de la data source — le **type réel** de chaque colonne, qu'aucune page ne
  porte à elle seule et sans lequel l'import interprète mal les valeurs.
  **Retiré du dépôt le 20/09/2026**, un mois après la bascule (voir la ligne suivante). Il
  reste dans l'histoire, intact — 1 716 190 octets :
  `git show 84c08ee:fixtures/notion-export-2026-08-19-19-24-09.json`
  (`84c08ee` est le dernier commit qui le portait ; la commande a été vérifiée avant d'être
  écrite ici). Un filet qu'on décroche ne se jette pas — on note où il est accroché.
- **Après bascule** : Notion reste intact, en lecture seule, pendant au moins un mois.
- **En régime** : une route d'export (`GET /api/export`) produit un JSON complet
  téléchargeable, lignes supprimées comprises. Time Travel (7 jours en gratuit) ne
  suffit pas comme unique filet. **Les clés des fournisseurs en sont exclues** (§5.5).

---

## 10. Tests et garde-fous

### 10.1 Ce qui est couvert aujourd'hui (73 tests, à conserver)

Jetons forgés du Worker, écriture Notion selon le type réel des colonnes, intégrité du
JSON, parsing défensif des réponses IA, complétude du registre de formats, montage de
chaque écran.

### 10.2 Ce qui s'ajoute

| Cible | Nature |
| :--- | :--- |
| `packages/editorial` | **golden fixtures** — un prompt composé attendu par action et par format. Toute évolution d'un persona met à jour la fixture, et la revue de la fixture est la revue du changement. |
| `workers/api` | une suite par route : validation zod, codes de statut, suppression logique, budget de requêtes |
| Migration | comparaison Notion ↔ D1 champ par champ (§9.3) |
| `packages/{subtitles, psychedelics}` | tests de calcul purs |

### 10.3 Règle de montage

Tout composant ayant un retour anticipé est monté dans `screens.test.tsx` **dans les deux
états**. Cette règle est née d'une page blanche en production : un `useEffect` placé après
un `if (!isOpen) return null;`, invisible au typecheck comme au build.

---

## 10.4 Contrainte d'environnement — dépôt partagé entre deux architectures

Le répertoire de travail est partagé entre le Mac (arm64) et une VM Ubuntu (arm64), et
`node_modules` ne peut servir qu'une plateforme à la fois : le dernier `npm install`
gagne, et la machine d'en face échoue sur les binaires natifs — `workerd` pour wrangler,
`rollup` et `esbuild` pour le build.

Le correctif est d'installer le binaire manquant sans toucher au manifeste :

```bash
npm install --no-save @cloudflare/workerd-darwin-arm64      # depuis le Mac
npm install --no-save @cloudflare/workerd-linux-arm64       # depuis la VM
```

Les deux jeux cohabitent sans conflit ; c'est le `npm install` suivant qui élague. À
refaire au changement de machine, tant que le répertoire reste partagé.

---

## 11. Phasage et critères de sortie — NORMATIF

Une phase par lot de travail. **Aucune phase ne laisse l'application cassée.**

| # | Phase | Critère de sortie |
| :--- | :--- | :--- |
| **0** | **Filet** — export JSON complet des bases Notion, versionné | Le fichier existe, il contient N contenus et M modèles, relus |
| **1** | **Monorepo** — workspaces, déplacement du front dans `apps/manager` | `npm test` et `npm run typecheck` verts, application identique |
| **2** | **Moteurs purs** — extraction de `editorial`, `subtitles`, `psychedelics` | Zéro dépendance runtime, golden fixtures en place |
| **3** | **Worker API + D1** — schéma, migrations, routes, auth | Suite de tests API verte, Notion encore en place et intact |
| **4** | **Import** — `tools/import-notion` + vérification | Script de comparaison à zéro écart |
| **5** | **Bascule** — le front lit et écrit l'API | Notion en lecture seule ; parcours complet rejoué de bout en bout |
| **6** | **Abstraction IA** — `packages/ai`, `/api/ai/chat` | Un second adaptateur écrit, même s'il n'est pas activé |
| **7** | **Séries** — table, onglet, écran de plan, création en lot | Une série créée à la main de bout en bout |
| **8** | **L'Éclateur** — `PLAN_SERIES` + anti-répétition | Un plan généré sur un vrai sujet, jugé pertinent |

Phases 0 à 5 : migration, aucune fonctionnalité nouvelle. Phases 6 à 8 : la valeur.

### 11.1 Ce que le modèle révisé déplace

Le journal des générations (§2.6) et la conversation en lignes (§2.7) sont décidés en
**phase 3**, pas ajoutés après coup : la phase 4 doit déjà savoir où déposer l'historique
extrait des signatures Notion. Deux conséquences pour le phasage :

- l'annulation d'une génération, aujourd'hui limitée à un niveau et perdue à la fermeture
  de l'éditeur, devient durable dès la bascule (phase 5) — sans travail supplémentaire ;
- `packages/editorial` perd les onze `lastIndexOf('}')` en phase 2, mais ses fonctions
  doivent rester tolérantes en lecture tant que Notion est la source (phases 2 à 4).

### 11.2 Ce qui peut mal tourner

- **La bascule (phase 5)** est le moment à risque. Elle est réversible tant que Notion
  reste intact : c'est la raison de la règle du mois de lecture seule.
- **L'écriture en lot (phase 7)** doit être transactionnelle, sinon une série à moitié
  créée laisse un état incohérent.
- **Les golden fixtures (phase 2)** vont figer les prompts actuels. Si un prompt est déjà
  imparfait, la fixture fige l'imperfection : les relire à ce moment-là, pas plus tard.

---

## 12. La vidéo — le Reel expliqué

### 12.1 Ce qu'on cherche à produire

La référence est un Short de NerdyKings (`youtube.com/shorts/jzpSgUNvD0w`, 102 s),
décortiqué image par image le 02/10/2026 :

- une **seule prise** face caméra. La voix ne s'arrête jamais : c'est l'image qui
  change ;
- environ **80 % du temps recouvert de scènes** : un titre de deux lignes avec un mot
  surligné, puis des cartes qui apparaissent **une à une, au mot prononcé**, des « vs »,
  des pastilles, des flèches, un compteur qui défile ;
- un retour face caméra pour ouvrir, pour fermer, et une fois au milieu ;
- des sous-titres discrets sur la caméra **seulement**. Sur les scènes, l'écran ne
  transcrit pas : il retient le mot-clé, le chiffre, le contraste.

Une proposition antérieure (Gemini) décrivait autre chose — des images fixes animées par
un zoom lent, une piste de voix off séparée, des sous-titres karaoké, un rendu sur AWS
Lambda. Elle a été écartée sur pièces : ce qui fait l'efficacité de la référence, ce sont
des **scènes écrites**, et ce qu'on écrit se produit ici.

Usage : publications Facebook et Instagram, et à l'occasion des publicités Google Ads et
Meta. Une vidéo publicitaire Google doit être hébergée sur YouTube (non répertoriée
suffit).

### 12.2 Les décisions de Florent (02/10/2026) — NORMATIF

| Question | Décision | Conséquence |
| :--- | :--- | :--- |
| Où se termine le montage ? | **Dans l'application.** La prise est nettoyée dans Final Cut (ratés, silences), l'application pose les scènes et les sous-titres et rend le fichier final. | Les variantes (4:5, seconde accroche) sortent sans refaire de montage. |
| Quelle identité pour les scènes ? | **L'habillage Luminose** : la mécanique de la référence, habillée de la gamme de `voix/direction-artistique.md` (ivoire, prune, violet nuit), en Futura. | Un gabarit, pas deux. |
| Que porte une carte ? | **Du texte, et quand l'image dit mieux que le mot, une illustration ou un schéma** — surtout en pédagogie, et aussi pour l'humour. Les cartes n'ont pas toutes la même taille. Révisé le jour même : « Faut de la souplesse. » | Le Rédacteur **décrit** le visuel ; Florent le produit (ChatGPT Images, Sketch) et le dépose sur la carte. |
| Où vivent prises et visuels ? | **Chez Cloudflare** (04/10/2026) : prises et visuels dans R2, transcription et repères dans D1. La première version les gardait dans le navigateur. | Un montage survit à des données de site vidées et se reprend depuis un autre poste ; une prise met une à deux minutes à partir, et l'espace gratuit (10 Go) se surveille. |

La première réponse à la troisième question était « la typographie seule », par crainte
du cliché — une icône de « honte » ou de « peur ». Florent l'a corrigée : un mécanisme se
montre mieux qu'il ne se dit, et une scène décalée fait rire là où une phrase n'y
arrive pas. Le cliché est donc écarté autrement : pas d'icônes ni d'emojis, des visuels
**décrits un par un** pour ce qu'ils doivent montrer, et les interdits de la direction
artistique (pas d'imagerie littérale de la détresse, pas de symbolisme ésotérique
appuyé).

### 12.3 Le format — NORMATIF

`TargetFormat.REEL_EXPLIQUE` (« Reel expliqué (scènes animées) », clé courte
« Reel expliqué »). Atterrit sur l'onglet `script`, ouvert à la relecture à froid : court,
écrit d'un jet, comme le Reel et le carrousel. Le **Script Reel** existant reste, pour une
vidéo face caméra de bout en bout.

Le brouillon reste dans `contents.draft` (§2.5). Sa forme :

```json
{
  "format": "Reel expliqué",
  "sequences": [
    { "plan": "camera", "role": "Accroche", "voix": "…", "intention": "…" },
    { "plan": "scene", "role": "Mécanique", "registre": "pedagogie", "voix": "…", "intention": "…",
      "titre": "Le titre, avec [un mot] surligné",
      "elements": [
        { "type": "carte", "taille": "moyenne", "texte": "…", "detail": "…", "ton": "ombre",
          "visuel": null, "apparait_sur": "mots exacts de la voix" },
        { "type": "liaison", "texte": "vs", "apparait_sur": "…" },
        { "type": "carte", "taille": "grande", "texte": "…", "ton": "lumiere",
          "visuel": { "nature": "schema", "description": "ce que le schéma montre" },
          "apparait_sur": "…" },
        { "type": "pastille", "texte": "…", "ton": "lumiere", "apparait_sur": "…" }
      ] }
  ],
  "accroche_pub": { "voix": "…", "intention": "…" },
  "legende": { "texte": "…", "cta": "…", "hashtags": ["…"] }
}
```

- **`voix` porte TOUT ce qui se dit**, scène comprise. Concaténées dans l'ordre, les voix
  sont le texte à lire au tournage, et rien d'autre.
- **`apparait_sur` est un repère, pas une durée.** Ce sont des mots recopiés de la voix de
  la même séquence ; l'élément apparaît quand ils sont prononcés. Aucun minutage n'est
  écrit par le modèle : il ne sait pas à quel débit Florent parle, la prise le saura
  (§12.5).
- **Une scène a un registre** : `pedagogie` (on montre comment ça marche) ou `humour`
  (on montre l'absurde). Une vidéo peut mêler les deux ; l'animation suivra le registre.
- **Une carte a une taille** : `petite` (demi-largeur, deux petites voisines se placent
  côte à côte), `moyenne` (pleine largeur), `grande` (pleine largeur et haute, pour un
  visuel). Une grande au plus par scène.
- **Un visuel est décrit, jamais généré ici** : `{ nature: illustration | schema,
  description }`. Une carte qui en porte un peut se passer de texte. Le storyboard
  affiche la description ; l'emplacement de l'image arrive avec les scènes animées (V2).
- **Les tons sont `ombre`, `lumiere`, `neutre`** — ce qui coince, ce qui s'ouvre, ce qui
  informe. La référence code le coût en rose et la solution en vert ; la lumière et
  l'ombre sont déjà des symboles de la direction artistique.
- **`accroche_pub`** est une seconde ouverture, à tourner dans la foulée, pour la
  publicité. Meta refuse un texte qui présume de l'état de santé de celui qui regarde
  (« Vous souffrez d'anxiété ? »), et le cadre déontologique interdit toute promesse de
  résultat. L'accroche organique a le droit de dire au lecteur ce qu'il vit ; celle-ci
  nomme la situation sans le désigner. Les variantes publicitaires testent l'accroche,
  et c'est exactement ce qu'un second plan permet.

**Ce qui se compte se compte dans le code — NORMATIF** (même règle que §3.5.2, point 4).
`verifierReelExplique` (`packages/editorial/src/reelExplique.ts`) contrôle, sans appel
réseau :

| Contrôle | Pourquoi |
| :--- | :--- |
| ouvre et ferme face caméra | la confiance et l'appel à l'action passent par un visage |
| 2 à 4 scènes, 1 à 4 éléments par scène, une grande carte au plus | au-delà, le cadre vertical ne se lit plus |
| un élément porte un texte ou un visuel décrit | une carte vide n'a rien à montrer |
| longueurs d'écran (titre ≤ 32, carte ≤ 30, détail ≤ 45, pastille ≤ 30, liaison ≤ 10 caractères) | l'œil a deux secondes ; le cadre a 1 080 pixels de large |
| chaque `apparait_sur` se retrouve dans la voix de sa séquence, dans l'ordre | sans ça, l'élément n'a pas de moment où apparaître |
| durée estimée entre 45 et 90 s, à 150 mots par minute | le débit réel corrigera ; l'ordre de grandeur, lui, se vérifie avant de tourner |

Un écart déclenche **une** passe d'ajustement automatique après rédaction ou retouche,
comme les longueurs du carrousel. Ce qui subsiste s'affiche au-dessus du storyboard : on
ne tourne pas un script dont l'écran sait déjà qu'il ne tiendra pas.

**Le contrôle est porté par le registre** (`FormatDefinition.controler`). L'éditeur
demande « ce format a-t-il des contrôles ? », jamais « est-ce un Reel expliqué ? ».

### 12.4 Le montage — rendu dans le navigateur — NORMATIF

Rendu par **Remotion** : `@remotion/player` pour l'aperçu, `@remotion/web-renderer`
(WebCodecs, stable depuis 4.0.491) pour le fichier. Licence gratuite pour un indépendant
ou une structure de trois salariés au plus.

**Le rendu se fait dans l'onglet**, jamais sur le Worker : un Worker n'exécute ni Chrome
ni FFmpeg. Il demande **WebCodecs** — Chrome 94, Firefox 130, Safari 26 et suivants,
selon Remotion ; vérifié dans Chrome seulement — sur une page **sécurisée** (https ou
localhost), et il occupe l'onglet le temps de l'encodage, à peu près la durée de la
vidéo. `@remotion/lambda` est écarté : il ajouterait AWS, déjà « exploré sans suite » au
parc d'outils, un compte, des clés et une facture. Un rendu côté Cloudflare demanderait
Containers, donc le plan payant ; rien ne le justifie tant que l'onglet suffit.

Le **stockage**, lui, est chez Cloudflare depuis la v2.8 (§12.4.2).

Sorties : **9:16 1080 × 1920, 30 i/s, H.264/AAC** ; variante **4:5** (fil Meta) en
recomposant les scènes, pas en recadrant. Le 16:9 n'est pas prévu : une face caméra
verticale recadrée en paysage perd le visage.

Les scènes restent dans la **zone sûre** : l'interface des Reels et des Shorts recouvre le
bas et le bord droit de l'image. La référence garde ses cartes dans les deux tiers du
haut.

### 12.4.1 Les scènes animées (V2) — NORMATIF

**Une horloge, un calcul.** `minuterReel(data, horloge)` (`reelExplique.ts`) place
chaque séquence et chaque élément à partir du RANG des mots dans la voix entière.
L'horloge dit quand un rang est prononcé : `horlogeEstimee(débit)` avant le tournage,
celle de la prise après (V3). Rien d'autre ne change entre les deux — c'est ce qui
garantit que l'aperçu d'aujourd'hui et le montage de demain parlent de la même chose.

**Le débit se règle** (110 à 200 mots par minute, 150 par défaut). Florent lit son
script, chronomètre, et retrouve sa durée : les scènes exportées tombent alors au
rythme de sa voix, et se posent telles quelles dans Final Cut en attendant le calage
(V3). Le réglage n'est pas retenu : la prise le rendra inutile.

**La scène reste un seul composant.** `SceneLuminose` ne connaît pas Remotion : le
storyboard l'affiche à l'arrêt, la composition (`ReelComposition`) la pilote image par
image et lui prête son composant d'image. Remotion n'est chargé qu'à l'ouverture d'un
storyboard (`React.lazy`), jamais dans le paquet principal.

L'entrée suit le registre : la pédagogie se pose (ressort amorti), l'humour arrive de
travers et rebondit. Un élément pas encore apparu est **transparent**, pas retiré : la
mise en page ne bouge pas quand une carte arrive.

**Ce que le moteur de rendu sait dessiner borne la scène.** Ni `radial-gradient`, ni
`visibility`, ni `z-index` : le fond pointillé est une image SVG. Les polices de la
marque sont chargées par `@remotion/fonts`, depuis les mêmes fichiers que `index.css`,
avant la première image.

**L'export est par scène**, en MP4 1080 × 1920 H.264, **sans son** : une scène se pose sur
la voix de la prise. Un bouton par scène plutôt qu'un lot : un navigateur demande une
autorisation pour plusieurs téléchargements d'un coup, et une scène se refait seule.
L'export s'annonce dans le bandeau d'activité, avec sa progression réelle, et s'annule.

**Aucune télémétrie.** `renderMediaOnWeb` ne reçoit pas de `licenseKey` : avant Remotion
5.0 c'est facultatif, et c'est ce qui l'empêche d'envoyer quoi que ce soit — pas même
l'origine de la page. À revoir au passage à Remotion 5.

**Les visuels déposés sont rangés chez Cloudflare** (§12.4.2), une ligne par (contenu,
séquence, élément), avec la description à laquelle l'image répondait. Le storyboard
signale une image déposée pour une carte dont la description a changé depuis, et se tait
— sans proposer de dépôt — quand R2 n'est pas lié au Worker.

**Les images sont décodées avant chaque export**, et un export qui bute sur une attente de
chargement (`delayRender`) se relance **une fois**. Le 04/10/2026, un export complet a
échoué une fois sur une image restée « en chargement » 28 secondes, puis a réussi à
l'identique : un hoquet du chargement d'images de Remotion, pas un défaut de la scène.

### 12.4.2 Le montage rangé chez Cloudflare (v2.8) — NORMATIF

Décision de Florent, le 04/10/2026 : **tout chez Cloudflare**. La première version gardait
prises et visuels dans le navigateur ; un montage se perdait avec les données du site, et
ne se reprenait pas d'un autre poste.

| Quoi | Où | Pourquoi là |
| :--- | :--- | :--- |
| Fichiers des prises et des visuels | **R2**, bucket `luminose-montage`, liaison `MONTAGE` | objets volumineux ; 10 Go gratuits, sortie gratuite |
| Leur description, la transcription, les repères corrigés | **D1**, `montage_prises` et `montage_visuels` (migration 0007) | quelques kilo-octets, lus en une requête avec le reste |
| Les prises déjà téléchargées | **cache du navigateur**, base `LuminoseMontageCache` | ne pas retélécharger des centaines de mégaoctets à chaque ouverture |

**Routes** (§3.10). Une prise dépasse souvent les **100 Mo** qu'accepte une requête au
Worker : elle s'envoie en **parties de 50 Mo**, par l'envoi en plusieurs parties de R2
(`createMultipartUpload`), chacune passant par le Worker — même origine, même jeton de
session, aucune clé R2 à créer ni CORS à régler. Une partie qui échoue se rejoue une fois ;
un envoi qui échoue s'abandonne, et rien n'est gardé d'une prise à moitié envoyée.

**Remplacer une prise** retire l'ancienne et son fichier — c'est ce qui rend la place — et
reprend ses repères corrigés : on remplace souvent une prise par sa version mieux
nettoyée. Sa transcription, elle, se refait : le fichier a changé.

**Le cache local est un cache.** Sa clé est l'objet R2, neuf à chaque dépôt : un fichier
en cache sous la bonne clé est la bonne version, sans rien comparer. Une version par
place ; le vider ne perd rien.

**L'espace se surveille, et ne se dépasse pas** : le panneau affiche ce qu'occupent tous
les contenus, sur les 10 Go gratuits, et l'écran des quotas lit la taille réelle des
buckets du compte. **Un dépôt qui ferait passer le montage au-delà est refusé** (409),
avant que le moindre octet parte, en disant quoi retirer — R2 facture le surplus, et
Florent veut rester dans le gratuit (v2.9). Ce que le dépôt remplace est déduit : on peut
toujours remplacer une prise par une autre aussi lourde. Le compte se fait sur les lignes
vivantes ; un objet orphelin dans R2 lui échappe, l'écran des quotas non. Une prise
retirée rend sa place. Rien ne purge seul : effacer une vidéo qu'on a peut-être encore à
remonter n'est pas une décision à prendre à la place de Florent.

**La liaison R2 est FACULTATIVE**, comme celle de Workers AI : absente, l'état du montage
se lit quand même, et tout dépôt se refuse en 409 en disant quoi ajouter. Le bucket est
créé par `scripts/deploy.sh` s'il manque, **avant les migrations** ; s'il ne peut pas
l'être — un jeton sans droit sur R2 —, le script s'arrête là, et la production reste telle
qu'elle était.

L'export de la base (§9.4) emporte les descriptions — transcriptions, repères,
descriptions des visuels —, **pas les fichiers** : plusieurs gigaoctets de vidéo ne se
téléchargent pas d'un clic.

### 12.4.3 Où se trouve le montage (v2.10) — NORMATIF

Question de Florent, le 04/10/2026 : « ça se trouve où dans mon interface ? ». Le
montage vivait dans l'onglet Script d'un contenu en Brouillon, et nulle part ailleurs ;
l'espace Vidéos, où on le cherchait, ne contenait que l'outil Sous-titres. Décision :
**les deux portes**.

**L'espace Vidéos s'ouvre sur l'onglet Montage** (`#videos`, ou `#videos/montage`) ;
Sous-titres reste à côté (`#videos/sous-titres`). Montage liste les contenus dont le
format se monte — le registre le dit (`montable`, `estMontable`), l'écran ne nomme aucun
format — et dit de chacun **l'étape suivante**, pas seulement l'état :

| Ce que le montage contient | Ce que la ligne dit |
| :--- | :--- |
| pas de script lisible | « Pas encore de script — il s'écrit dans l'Atelier. » |
| un script, aucune prise | « Script prêt — à tourner. », ou le nombre de points que les contrôles (§12.3) demandent de corriger |
| une prise dont l'envoi n'a pas abouti | « Envoi de la prise interrompu — à redéposer. » |
| une prise non transcrite | « Prise déposée — transcription à faire. » |
| une prise transcrite | « Prise calée — prête à exporter. », et combien de visuels sont posés sur ceux qu'il faut |
| un export noté | « Exportée le …, en 9:16 » — le plus récent, « (publicité) » s'il l'était |

Les lignes se rangent dans l'ordre où l'on travaille : Brouillon, Prêt, Idée, Publié,
puis le plus récent d'abord. **« Ouvrir » mène au montage du contenu** : l'onglet Script
d'un Brouillon, l'aperçu d'un Prêt ou d'un Publié. Une liste vide dit où commence un
Reel expliqué et mène à la boîte à idées. Sous la liste, l'espace occupé dans R2 sur les
10 Go gratuits.

**Le montage se tient aussi sur un contenu Prêt ou Publié.** On tourne souvent après
avoir validé le script, et une vidéo publiée doit pouvoir se réexporter — en 4:5, en
version publicité. L'aperçu d'un script court y ouvre le même panneau que l'onglet
Script.

**Le résumé coûte une requête, pas une par contenu** : `GET /api/montage` lit en un
batch les prises vivantes, le nombre de visuels par contenu, le dernier export de chacun
et l'espace occupé — quatre lectures, quel que soit le nombre de Reels (§3.6).

**Chaque export réussi est noté** (`POST /api/montage/:id/exports`, migration 0008,
table `montage_exports`) : format, version, durée, date. L'export part en
téléchargement ; sans cette ligne, rien ne dirait qu'une prise a fait son office et peut
rendre sa place dans R2. C'est un journal et non une colonne : un même Reel s'exporte en
plusieurs formats et versions. Une note qui échoue ne se signale pas — le fichier, lui,
est déjà téléchargé. L'export de la base (§9.4) emporte ce journal.

### 12.5 Le calage sur la prise (V3) — NORMATIF

**La prise se dépose dans le storyboard.** Florent la nettoie dans Final Cut (ratés,
silences) et l'exporte — H.264 de préférence. Le navigateur la lit avec Mediabunny,
par morceaux : une prise de plusieurs centaines de mégaoctets ne se charge jamais en
entier, et un .mov se lit comme un .mp4. Une prise que ce navigateur ne sait pas
décoder est refusée **au dépôt**, pas à l'export : c'est ici que se fera le rendu.

**Le son part pour être transcrit.** Extrait en WAV mono 16 kHz — environ deux mégaoctets la minute —,
il va à `POST /api/transcription`, qui le passe à Whisper sur Workers AI
(`@cf/openai/whisper-large-v3-turbo`, langue `fr`) et rend les mots horodatés
(`segments[].words[]`). Pas de clé : une liaison `AI` du Worker (wrangler.toml).
**Facultative**, comme les jetons : absente, la route répond 409 en disant quoi ajouter,
et rien d'autre ne bouge. Un échec de Workers AI revient en 502 avec **son** message
(un quota épuisé se corrige). Le corps est borné à dix minutes de son : une vidéo
envoyée par erreur est refusée à la frontière. 0 requête D1.

Un segment rendu sans ses mots voit son texte réparti sur sa durée, au prorata des
lettres : une approximation, mais qui laisse le calage retrouver ses repères plutôt
que de perdre tout un passage.

**Le calage est un calcul pur** (`packages/editorial/src/calage.ts`), à côté de la
découpe en mots qu'il partage avec le contrôle (§12.3) — un repère que le storyboard
trouve, le calage le trouve aussi :

1. Le script et les mots dits sont découpés pareil ; un mot de Whisper qui donne
   deux jetons (« l'envoyer ») partage sa durée au prorata des lettres.
2. Alignement global (Needleman–Wunsch) : un mot dit tel quel compte plein, un mot
   **proche** compte presque — Whisper écrit « luminoz » ce qu'il a bien entendu. Est
   proche un mot de cinq lettres ou plus, même initiale, à une lettre près (deux dès
   sept lettres). « tout » et « bout » ne le sont pas.
3. Chaque mot du script reçoit l'instant où il est dit ; un mot omis prend sa place
   entre ses voisins, au prorata des rangs. L'horloge qui en sort remplace l'horloge
   estimée dans `minuterReel` (§12.4.1) — rien d'autre ne change.
4. La **couverture** — part des mots du script retrouvés — s'affiche. Sous 80 %, l'écran
   demande de vérifier les repères avant d'exporter.

**Le calage ne se stocke pas, il se déduit** de la transcription et du script : une
nouvelle rédaction recale la même prise sans rien retranscrire.

**Les repères se corrigent à la main**, au dixième de seconde, élément par élément ;
un clic sur un repère amène l'aperçu à cet instant. La correction l'emporte sur le
calage, se garde avec la prise, et survit à une nouvelle transcription comme au
remplacement de la prise par une version mieux nettoyée.

**Les prises sont rangées chez Cloudflare** (§12.4.2) : le fichier dans R2, sa
description, sa transcription et ses repères dans D1 — corriger un repère ne réécrit pas
des centaines de mégaoctets.

**Les sous-titres** des passages caméra sortent des mots dits, groupés par quatre au
plus, coupés à une fin de phrase ou à un silence de plus de 0,6 s. Un mot dit qui
répond au script s'écrit **comme dans le script** (« luminose.fr », pas « luminoz ») ;
un mot improvisé, comme Whisper l'a entendu. Un « ? » rendu seul rejoint son mot. Pas
de karaoké, et rien sur les scènes : la référence n'en a pas.

### 12.5.1 Le rendu final (V4) — NORMATIF

`planDeMontage` (même fichier) dit ce que la vidéo montre et quand :

- **Organique** : la prise principale, débarrassée de ses silences — 0,3 s gardées avant
  le premier mot, 0,6 s après le dernier.
- **Publicité** : la seconde accroche, tournée à part et calée sur son propre texte,
  puis la prise principale **reprise juste avant le premier mot de la séquence 2**. Les
  scènes gardent leurs mots ; seule l'ouverture change, et c'est elle que la publicité
  teste.

La composition (`CompositionFinale`) pose la prise en fond (`<Video>` de
`@remotion/media`, `objectFit: cover`), chaque scène par-dessus à son heure, et les
sous-titres sur les seuls passages caméra. **La voix vient de la prise et ne
s'interrompt jamais** : une scène couvre l'image, pas le son.

Les sous-titres reprennent l'outil Sous-titres — Futura gras, blanc, ombre `#60407F` à
315°, 430 points sous le centre du cadre vertical —, en 64 pixels du cadre. L'ombre est
une seconde couche de texte peinte avant le blanc : le moteur de rendu ne dessine pas
`text-shadow` et peint dans l'ordre du document.

**Deux formats, deux versions**, au choix, et l'aperçu suit le choix : 9:16
(1080 × 1920) et 4:5 (1080 × 1350, fil Meta), organique et publicité. En 4:5, la prise
est rognée au centre et les scènes sont **recomposées** dans le cadre plus court, avec
leur propre zone sûre. Sortie MP4, H.264 et AAC.

**Ce qui n'est pas fait, et pourquoi** : pas de musique (§12.1 : optionnelle, et la
référence n'en a pas), pas de normalisation du volume (la prise sort de Final Cut, où
elle se règle), pas de 16:9 (§12.4).

**Ce qui reste à vérifier sur une vraie prise.** Le parcours entier a été vérifié dans
le navigateur le 04/10/2026, avec une prise synthétique (voix de macOS) : lecture,
extraction du son, calage à 99 % malgré un mot omis et un nom mal écrit, aperçu, export
9:16 organique et 4:5 publicitaire, son et image contrôlés. **La transcription y était
simulée** : Whisper sur Workers AI n'est joignable qu'une fois le Worker déployé avec
sa liaison `AI`. Ce que rend Whisper sur la voix de Florent — présence des mots
horodatés, précision des instants — est la première chose à regarder.

Le rangement chez Cloudflare (§12.4.2) a été vérifié de la même façon, contre une
**émulation** de l'API du montage : envoi en trois parties, transcription rangée, autre
poste simulé (cache vidé, prise retéléchargée une fois puis servie par le cache), visuel
et repère retrouvés, exports 9:16 et 4:5. Le Worker et ses routes sont couverts par des
tests contre un R2 en mémoire ; **le passage du flux d'une partie à R2 (`uploadPart` sur
le corps de la requête) ne se vérifie qu'une fois déployé.**

### 12.6 Phasage — NORMATIF

Une branche par étape ; aucune ne laisse l'application cassée, et chacune sert seule.

| # | Étape | Critère de sortie |
| :--- | :--- | :--- |
| **V1** | **Le format** — grille, contrôles, storyboard statique dans l'onglet Script | Un Reel expliqué rédigé sur un vrai sujet, lisible et tournable tel quel |
| **V2** | **Les scènes animées** — composition Remotion, emplacement des visuels, aperçu cadencé sur le débit estimé, export des scènes seules | Les scènes d'un vrai script exportées en MP4 et posées dans Final Cut |
| **V3** | **Le calage** — dépôt du rush, son extrait, Whisper mot à mot, repères alignés, ajustement à la main (§12.5) | Les scènes tombent sur les bons mots d'une vraie prise |
| **V4** | **Le rendu** — face caméra, scènes, sous-titres, 9:16 et 4:5, seconde accroche (§12.5.1) | Une vidéo publiée, et une variante publicitaire |

Au 04/10/2026, les quatre étapes sont écrites et vérifiées dans le navigateur ; les
critères de sortie, eux, demandent une vraie prise et une vraie publication.

---

## Annexe A — Schéma D1

```sql
-- 0001_init.sql

CREATE TABLE series (
  id                TEXT PRIMARY KEY,
  titre             TEXT NOT NULL,
  intention         TEXT,
  statut            TEXT NOT NULL DEFAULT 'en_cours',   -- en_cours | terminee
  source_content_id TEXT REFERENCES contents(id) ON DELETE SET NULL,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  deleted_at        INTEGER
);

CREATE TABLE contents (
  id                 TEXT PRIMARY KEY,
  title              TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL,                     -- Idée | Brouillon | Prêt | Publié
  platforms          TEXT NOT NULL DEFAULT '[]',        -- tableau JSON (§2.8)
  target_format      TEXT,
  objectif           TEXT,
  depth              TEXT,

  -- Produit par l'Analyste
  analyzed_at        INTEGER,                           -- NULL = jamais analysé (§2.8)
  verdict            TEXT,
  strategic_angle    TEXT,
  justification      TEXT,
  suggested_metaphor TEXT,

  -- Matière et productions courantes (JSON pur, sans signature — §2.3, §2.6)
  notes              TEXT NOT NULL DEFAULT '',
  draft              TEXT,                              -- LE brouillon, tous formats (§2.5)
  slides             TEXT,                              -- enrichissement carrousel (§2.5)

  -- Session Coach : état ; les messages sont dans coach_messages (§2.7)
  coach_status       TEXT,                              -- in_progress | validated
  coach_format_cible TEXT,                              -- format pour lequel la session a été calibrée
  coach_brief        TEXT,                              -- brief verrouillé par le Verrouilleur
  coach_validated_at INTEGER,

  -- Séries (§2.9)
  serie_id           TEXT REFERENCES series(id) ON DELETE SET NULL,
  angle              TEXT,
  serie_position     INTEGER,                           -- rang dans la série (§2.9)

  scheduled_date     TEXT,                              -- date ISO, sans heure
  legacy_json        TEXT,                              -- matière de l'ancien flow Interviewer (§2.8)
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  deleted_at         INTEGER
);

-- Journal des productions IA (§2.6)
CREATE TABLE generations (
  id          TEXT PRIMARY KEY,
  content_id  TEXT NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,        -- analysis | draft | slides | cold_read
                                    -- | adjustment | brief | plan_series
  target      TEXT,                 -- colonne visée : draft | slides (NULL sinon)
  model_id    TEXT REFERENCES ai_models(id) ON DELETE SET NULL,
  model_label TEXT NOT NULL,        -- figé à l'écriture : survit à la suppression du modèle
  instruction TEXT,                 -- l'instruction d'ajustement, le cas échéant
  payload     TEXT NOT NULL,        -- JSON produit, propre
  created_at  INTEGER NOT NULL
);

-- Conversation Coach (§2.7)
CREATE TABLE coach_messages (
  id               TEXT PRIMARY KEY,
  content_id       TEXT NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  role             TEXT NOT NULL,                       -- user | assistant
  content          TEXT NOT NULL,
  raw              TEXT,                                -- réponse JSON brute de l'assistant
  quick_replies    TEXT,                                -- tableau JSON
  ready_for_editor INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL,
  deleted_at       INTEGER                              -- réinitialisation de session (§2.7)
);

CREATE TABLE ai_models (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  api_code        TEXT NOT NULL,
  provider        TEXT NOT NULL DEFAULT 'onemin',       -- adaptateur appelé (§5.3)
  vendor          TEXT,                                 -- affichage (§5.3)
  cost            TEXT,
  strengths       TEXT,
  best_use_cases  TEXT,
  text_quality    INTEGER,
  is_default      INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER
);

CREATE TABLE app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Synchronisation incrémentale (§8)
CREATE INDEX idx_contents_updated   ON contents(updated_at);
CREATE INDEX idx_series_updated     ON series(updated_at);
CREATE INDEX idx_models_updated     ON ai_models(updated_at);
-- Listes filtrées, contenus d'une série (§3.3)
CREATE INDEX idx_contents_status    ON contents(status)   WHERE deleted_at IS NULL;
CREATE INDEX idx_contents_serie     ON contents(serie_id) WHERE deleted_at IS NULL;
-- Dernière génération d'une nature pour un contenu (§2.6)
CREATE INDEX idx_generations_lookup ON generations(content_id, kind, created_at DESC);
CREATE INDEX idx_coach_messages     ON coach_messages(content_id, created_at);
```

## Annexe B — Correspondance Notion → D1

| Colonne Notion | Type Notion | Cible D1 | Conversion |
| :--- | :--- | :--- | :--- |
| *(id de page)* | — | `contents.id` | conservé tel quel (§2.4) |
| Titre | title | `title` | texte brut |
| Statut | select | `status` | nom de l'option |
| Plateforme | multi_select | `platforms` | tableau JSON des noms |
| Contenu | rich_text | `draft` | **texte brut**, signature retirée (§2.6) |
| Script vidéo | rich_text | `draft` | idem — une seule colonne (§2.5) |
| Slides | rich_text | `slides` | texte brut, signature retirée |
| Post Court | rich_text | **abandonné** | dérivé de `draft` à la lecture (§2.8) |
| Notes | rich_text | `notes` | texte brut |
| Coach Session | rich_text | `coach_*` + `coach_messages` | JSON éclaté en lignes (§2.7) |
| Date de publication | date | `scheduled_date` | `start` seul |
| Analysé | checkbox | `analyzed_at` | `true` → `last_edited_time` ; `false` → `NULL` |
| Verdict | select | `verdict` | nom |
| Angle stratégique | rich_text | `strategic_angle` | texte brut, signature retirée |
| Format cible | select | `target_format` | nom |
| Objectif | select | `objectif` | nom |
| Justification | rich_text | `justification` | texte brut |
| Métaphore Suggérée | rich_text | `suggested_metaphor` | texte brut |
| Profondeur | select | `depth` | nom |
| Réponses / Questions interview | rich_text | `legacy_json` | objet JSON `{answers, questions}` (§2.8) |
| *(created_time)* | — | `created_at` | ISO → epoch ms |
| *(last_edited_time)* | — | `updated_at` | ISO → epoch ms |

**Signatures.** Les champs produits par l'IA portent une signature markdown concaténée
après le JSON (`_Généré par : … - le …_`). L'import la **retire du contenu** et en dérive
une ligne `generations` (`kind` selon le champ, `model_label` extrait du texte,
`created_at` extrait de la date). L'historique d'avant migration est ainsi conservé, au
bon endroit, et les colonnes redeviennent du JSON pur.

**Modèles IA** : correspondance directe ; `provider` initialisé à `onemin` pour toutes les
lignes, `vendor` reprenant l'ancienne colonne « Fournisseur » (§5.3).
