# SPEC v2.0 — gestion.luminose.fr

> **Cible** : migration complète Notion → Cloudflare D1, restructuration en monorepo,
> abstraction du fournisseur IA, et ajout des Séries / Déclinaisons.
>
> **Statut** : document de conception, écrit le 17/08/2026 avant toute implémentation.
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

Le quota n'est pas un facteur limitant. La limite des 50 requêtes par invocation, si.

---

## 1. Architecture cible — NORMATIF

Monorepo npm workspaces. Quatre moteurs purs, un Worker, un front.

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
│   └── api/                Hono + D1 + auth
│       ├── migrations/     NNNN_description.sql
│       └── src/routes/
├── tools/
│   └── import-notion/      migration one-shot, produit un SQL idempotent
└── scripts/
    └── deploy.sh
```

### 1.1 Règles de dépendance (NORMATIF)

```
apps/manager  ──▶ packages/{shared, editorial, subtitles, psychedelics}
workers/api   ──▶ packages/{shared, editorial, ai}
packages/ai   ──▶ packages/shared
packages/editorial ──▶ (rien)
packages/{subtitles, psychedelics} ──▶ (rien)
```

- `packages/editorial`, `subtitles`, `psychedelics` : **zéro dépendance runtime**, zéro
  React, zéro `fetch`, zéro API Workers. Fonctions pures, testables sans réseau ni DOM.
- `packages/ai` : dépend de `shared` uniquement. Ne connaît ni D1 ni Hono.
- Le front n'importe **jamais** `packages/ai` : les clés d'API vivent dans le Worker.

### 1.2 Une seule origine

`gestion.luminose.fr` est servi par Cloudflare Pages. Le Worker capte `/api/*` sur **cette
même origine** via une route.

Conséquence directe : **plus de CORS du tout**. Plus de `ALLOWED_ORIGINS` à maintenir,
plus de préflight, plus d'origine de développement à déclarer. C'est une simplification,
pas un détail de configuration.

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

Volume : quelques kilo-octets par génération, quelques générations par contenu. Non
significatif à cette échelle ; si cela changeait, une purge au-delà des N dernières par
couple (contenu, nature) suffirait.

### 2.7 La conversation Coach est une suite de messages — NORMATIF

`coach_messages` : une ligne par message. L'état de session (statut, brief verrouillé,
format calibré, date de validation) reste sur `contents`.

Aujourd'hui la session entière est un blob réécrit **à chaque tour** : dix échanges = dix
réécritures de la conversation complète. Un échec au mauvais moment, et des messages
disparaissent. En lignes, l'écriture est un `INSERT` : un message écrit ne se perd plus.

**L'API masque ce détail.** `GET /api/contents/:id` renvoie une `coachSession` assemblée
`{ status, brief, messages[] }`, et `POST /api/contents/:id/coach/messages` ajoute un
message. Le client garde son modèle mental ; seul le stockage change.

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
```

### 3.2.2 Journal des productions (§2.6)

```
GET    /api/contents/:id/generations?kind=draft   historique, du plus récent au plus ancien
POST   /api/contents/:id/generations/:genId/revert   réécrit la colonne cible
```

Une génération n'est jamais modifiée ni supprimée par l'application : elle est un fait
daté. `revert` **ajoute** une ligne dont la charge reprend celle visée, plutôt que de
rembobiner le journal — l'annulation d'une annulation reste ainsi possible.

### 3.3 Séries

```
GET    /api/series?since=<ms>
GET    /api/series/:id              série + ses contenus (une seule requête, jointure)
POST   /api/series
PATCH  /api/series/:id
DELETE /api/series/:id              suppression logique ; les contenus survivent, détachés
```

### 3.4 Modèles IA

```
GET    /api/models
POST   /api/models
PATCH  /api/models/:id
DELETE /api/models/:id
POST   /api/models/:id/test         ping du fournisseur, §5.4
```

### 3.5 IA

```
POST   /api/ai/chat                 { modelId, system?, messages[], json? } → { text }
```

Le Worker résout `modelId` en ligne de la table `ai_models`, choisit l'adaptateur d'après
`provider`, et appelle le fournisseur. **Le front ne connaît aucun fournisseur.**

### 3.6 Budget de requêtes (contrainte du plan gratuit)

Maximum **50 requêtes D1 par invocation**. Conséquences normatives :

- Interdiction du N+1. Une série et ses contenus se lisent par **une** jointure.
- `POST /api/contents/batch` utilise `db.batch()` — un aller-retour, pas N.
- Toute route nouvelle doit pouvoir énoncer son nombre de requêtes, borné et indépendant
  du volume de données.

---

## 4. `packages/editorial` — NORMATIF

Le cœur du produit. **Zéro dépendance.** Contient, repris tel quel de l'existant :

| Module | Rôle |
| :--- | :--- |
| `prompts/` | les personas (Analyste, Coach, Verrouilleur, Rédacteur, Lecteur froid, Artiste, Éclateur) et `buildSystemPrompt()` |
| `voice.ts` | `VOICE_RULES` — règles de voix transverses |
| `formats.ts` | `FORMAT_REGISTRY` — source unique de vérité du routage par format |
| `objectives.ts` | `OBJECTIF_REGISTRY` — guidance Analyste + règles CTA |
| `actions.ts` | composition des instructions système par action |
| `executors.ts` | parsing défensif des réponses IA |

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

### 5.3 Deux notions distinctes de « fournisseur »

Aujourd'hui la colonne `provider` sert à grouper l'affichage (« OpenAI », « Anthropic »).
Dans le modèle cible, deux colonnes :

| Colonne | Rôle | Exemple |
| :--- | :--- | :--- |
| `provider` | **quel adaptateur appeler** | `onemin` |
| `vendor` | qui a fabriqué le modèle, pour l'affichage | `OpenAI` |

Un même modèle peut ainsi être joignable via 1min.ai aujourd'hui et en direct demain :
on change une valeur dans la table, pas une ligne de code.

### 5.4 Le testeur

`POST /api/models/:id/test` appelle `provider.test(apiCode)`. C'est le seul moyen fiable
de valider un code API avant enregistrement, et il devient générique.

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
   "objectif": "Recadrage de croyance", "justification": "…" }]
```

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

### 6.4 L'anti-répétition — NORMATIF

C'est la raison d'être de la fonctionnalité. À la rédaction d'un contenu appartenant à une
série, le Rédacteur reçoit en plus :

1. le thème et l'intention de la série ;
2. le texte du contenu source, **si et seulement si** la série en a un ;
3. **les angles des contenus frères** — leurs `titre` et `angle`, **jamais leur texte
   complet**, avec la consigne explicite de ne pas empiéter.

La restriction du point 3 n'est pas une optimisation : sans elle, le prompt croît avec la
série et finit par noyer la consigne.

---

## 7. Authentification et sécurité

Le dispositif actuel est conservé : jeton `"<payload base64>.<signature base64>"`, signé
HMAC-SHA256 avec `SESSION_SECRET`, vérifié en temps constant. Il vient d'être posé et
testé ; le migrer n'apporterait rien.

Ce qui change : l'origine unique (§1.2) supprime CORS. `ALLOWED_ORIGINS` disparaît.

Reste ouvert, non bloquant : comparaison des identifiants en temps constant, limitation de
débit sur `/api/auth/login` (demanderait un binding KV), et à terme Cloudflare Access en
remplacement complet du couple identifiant/mot de passe.

**Invariant** : aucune clé de fournisseur (Notion, 1min.ai, OpenAI…) ne quitte le Worker.

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

- **Avant tout** : export JSON complet des deux bases Notion, versionné dans le dépôt
  (`fixtures/notion-export-<date>.json`). C'est la phase 0.
- **Après bascule** : Notion reste intact, en lecture seule, pendant au moins un mois.
- **En régime** : une route d'export (`GET /api/export`) produit un JSON complet
  téléchargeable. Time Travel (7 jours en gratuit) ne suffit pas comme unique filet.

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
  created_at       INTEGER NOT NULL
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
