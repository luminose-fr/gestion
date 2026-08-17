# SPEC — gestion.luminose.fr (SocialFlow Manager)

> Synthèse fonctionnelle et technique de l'existant.
> Re-dérivée le 17/08/2026 contre le code de la branche `main`.
>
> **Usage** : reprise de contexte en début de session, et base d'analyse pour proposer
> des améliorations. Décrit ce qui **est**, pas ce qui devrait être. La section
> [8. Dette technique](#8-dette-technique) liste les points à challenger.
>
> ⚠️ Ce document a déjà dérivé une fois : il décrivait une architecture supprimée depuis.
> **Le mettre à jour dans la foulée de tout changement structurel**, sinon il ment.

---

## 1. Vue d'ensemble

**Quoi** : application web mono-utilisateur (Florent Jaouali, psychopraticien) qui gère le
cycle de vie de ses contenus — de l'idée brute au post prêt à publier — avec l'IA comme
copilote éditorial à chaque étape. Notion sert de base de données, l'app est l'interface
de travail.

**Où** : https://gestion.luminose.fr — SPA statique sur GitHub Pages (branche `gh-pages`).

**Particularité structurante** : le produit n'est pas un « bouton générer ». Il encode une
**méthode éditoriale** — sept personas, des règles de voix transverses, une grille de
production par format, sept objectifs qui dictent le CTA — dans des prompts système
versionnés avec le code. La qualité du produit est celle de ces prompts.

### Stack

| Couche | Choix | Note |
| :--- | :--- | :--- |
| Front | React 19.2 + TypeScript 5.4 + Vite 7 | SPA, pas de SSR |
| Style | Tailwind CSS v4 (plugin Vite) | thème clair/sombre via `dark:` |
| Icônes | lucide-react | |
| Routing | **maison**, via `window.location.hash` | pas de react-router |
| État | `useState` dans `App.tsx` | pas de store global |
| Cache local | IndexedDB `LuminoseDB` v3 + localStorage | offline-first partiel |
| Backend | Cloudflare Worker | proxy + auth, aucune persistance |
| Données | Notion API `2025-09-03` | 2 databases |
| IA | **1min.ai uniquement** | catalogue de modèles éditable dans Notion |
| Tests | vitest — 73 tests | voir §8.1 ; aucune CI ne les exécute |

### Commandes

```bash
npm run dev        # serveur de dev sur http://localhost:7860
```

```bash
npm run typecheck  # tsc --noEmit — analyse réellement les 50 fichiers du projet
```

```bash
npm test           # vitest : 73 tests (Worker, Notion, parsing IA, montage des écrans)
```

```bash
npm run build      # build de prod dans dist/
```

Aucune CI n'exécute `typecheck` ni `test` : ce sont des garde-fous manuels, à lancer avant
de pousser.

Déploiement du front : **automatique** sur tout push vers `main`
(`.github/workflows/deploy.yml` → build → branche `gh-pages`). Les IDs de bases Notion
viennent des secrets GitHub `NOTION_CONTENT_DB_ID`, `NOTION_MODELS_DB_ID`.

Déploiement du Worker : **manuel**, `npx wrangler deploy` depuis `gestion-luminose-worker/`.

> ⚠️ **Ordre imposé : le front d'abord, le Worker ensuite.** Le front sait lire les deux
> formats de jeton de session (avec et sans signature) ; l'inverse n'est pas vrai.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Navigateur — SPA React (GitHub Pages)                   │
│                                                          │
│  App.tsx  ── état global (items, aiModels, activeModel)  │
│     │                                                    │
│     ├── services/notionService   ─┐                      │
│     ├── services/oneMinService    │ tout passe par le    │
│     └── services/storageService  ─┘ Worker (IDB : local) │
└───────────────────────┬──────────────────────────────────┘
                        │  HTTPS + header X-Session-Token
                        ▼
┌──────────────────────────────────────────────────────────┐
│  Cloudflare Worker  gestion-luminose-worker              │
│  Détient TOUS les secrets. Aucune persistance.           │
│                                                          │
│   POST /auth/login                → jeton signé          │
│   /v1/*                           → proxy Notion         │
│   /1min/chat, /1min/create-conversation                  │
└───────────────┬──────────────────────┬───────────────────┘
                ▼                      ▼
          api.notion.com          api.1min.ai
```

**Pourquoi un Worker** : une SPA statique ne peut pas garder de secret. Le front ne connaît
que des IDs de bases Notion (non sensibles) et `WORKER_URL` (`constants.ts`).

### Authentification

1. `LoginPage` → `POST /auth/login` avec `{username, password}`.
2. Le Worker compare aux secrets `AUTH_USERNAME` / `AUTH_PASSWORD`.
3. Il renvoie `"<payload base64>.<signature base64>"` — payload
   `{token: uuid, expiresAt: now + 24h}`, signature **HMAC-SHA256** du payload.
4. Le front stocke dans `localStorage.session_token`, envoie en header `X-Session-Token`.
5. Le Worker recalcule le HMAC (`crypto.subtle.verify`, temps constant) avant de regarder
   l'expiration. Payload retouché ou signature recyclée → rejeté.

Clé de signature : `SESSION_SECRET`, avec repli sur `AUTH_PASSWORD` si absent.
CORS : seules les origines de `ALLOWED_ORIGINS` (prod + `localhost:7860`) reçoivent
un `Access-Control-Allow-Origin`.

### Variables et secrets

| Emplacement | Clés |
| :--- | :--- |
| `.env.local` (dev) / secrets GitHub (prod) | `VITE_NOTION_CONTENT_DB_ID`, `VITE_NOTION_MODELS_DB_ID` |
| Secrets Worker (`wrangler secret put`) | `SESSION_SECRET`, `NOTION_API_KEY`, `ONE_MIN_API_KEY`, `AUTH_USERNAME`, `AUTH_PASSWORD` |

---

## 3. Modèle de données — Notion

L'API `2025-09-03` a introduit les **data sources** : une database en contient une ou
plusieurs, et ce sont elles qui portent le schéma. D'où le double appel systématique :
`GET /v1/databases/{db_id}` → `data_sources[0].id`, puis
`POST /v1/data_sources/{ds_id}/query`. Résultat mis en cache mémoire.

### 3.1 Base « Contenu » (`VITE_NOTION_CONTENT_DB_ID`)

| Colonne Notion | Type | Champ `ContentItem` | Rôle |
| :--- | :--- | :--- | :--- |
| Titre | Title | `title` | |
| Statut | Select | `status` | `Idée` / `Brouillon` / `Prêt` / `Publié` |
| Plateforme | Multi-select | `platforms` | Facebook, Instagram, LinkedIn, Google My Business, Youtube, Blog, Newsletter |
| Contenu | Text | `body` | **JSON** du brouillon (tous formats sauf vidéo) |
| Date de publication | Date | `scheduledDate` | |
| Notes | Text | `notes` | matière brute saisie par Florent |
| Analysé | Checkbox | `analyzed` | |
| Verdict | Select | `verdict` | `Valide` / `Trop lisse` / `À revoir` |
| Angle stratégique | Text | `strategicAngle` | produit par l'Analyste |
| Format cible | Select | `targetFormat` | §5.3 — **choisi par l'humain, jamais écrasé par l'IA** |
| Objectif | Select | `objectif` | l'un des 7 objectifs (§5.2) — dicte le CTA |
| Justification | Text | `justification` | |
| Métaphore Suggérée | Text | `suggestedMetaphor` | |
| Profondeur | Select | `depth` | `Direct` / `Légère` / `Complète` |
| Coach Session | Text | `coachSession` | **JSON** de la conversation Coach + brief verrouillé |
| Slides | Text | `slides` | **JSON** des slides carrousel enrichies |
| Post Court | Text | `postCourt` | texte prêt à copier |
| Script vidéo | Text | `scriptVideo` | **JSON** du script (formats vidéo) |
| Réponses / Questions interview | Text | `interviewAnswers`, `interviewQuestions` | *legacy* — ancien flow Interviewer |

`createdAt` et `lastEdited` viennent des métadonnées Notion, pas de colonnes.

### 3.2 Base « Modèles IA » (`VITE_NOTION_MODELS_DB_ID`)

Catalogue éditable des moteurs 1min.ai, géré depuis Réglages → Modèles IA.

| Colonne (alias reconnus) | Type | Champ `AIModel` |
| :--- | :--- | :--- |
| Nom | Title | `name` |
| Code API | Text | `apiCode` — identifiant envoyé à 1min.ai |
| Fournisseur | Text ou Select | `provider` — groupe l'affichage |
| Cout / Coût | Select | `cost` — `low` … `very_high` |
| Forces | Text | `strengths` |
| Cas d'usage | Text | `bestUseCases` — lu/écrit, absent du formulaire |
| Qualité Rédaction | Number | `textQuality` (1-5) — stocké, jamais exploité |
| Défaut | Checkbox | `isDefault` — valeur initiale du sélecteur global |

> Le service **lit le schéma réel de la base au runtime** et s'adapte aux noms (accents,
> apostrophes typographiques, variantes FR/EN) et aux types réels. Une colonne absente est
> ignorée avec un warning au lieu de faire échouer toute la requête.

> Il n'y a plus de base « Contextes IA » : la couche de contexte additionnel a été retirée.

---

## 4. Cache local et synchronisation

`services/storageService.ts` — IndexedDB `LuminoseDB` v3, deux object stores (`content`,
`models`, clé `id`). `localStorage` porte les marqueurs de sync et `AppSettings`
(préférences d'affichage, modèle actif).

**Au démarrage** : lecture du cache → affichage immédiat → `syncWithNotion()` en fond.

**Stratégie** : sync incrémentale par défaut (filtre `last_edited_time > lastSync`, fusion
par `id`), sync complète forcée si la dernière remonte à plus de 24 h ou via le bouton ↻.

**Écritures** : *optimistic UI*. En cas d'échec Notion, on ne revient pas en arrière (ce
serait effacer la frappe) : l'item entre dans `unsavedItemsRef`, ce qui déclenche

1. un bandeau ambre persistant avec « Réessayer maintenant » ;
2. la **protection contre l'écrasement** — la sync réapplique la version locale des items
   non enregistrés, donc une sync réussie ne peut plus détruire du travail en attente ;
3. un `beforeunload` qui empêche de fermer l'onglet sans avertissement.

---

## 5. Parcours fonctionnel

### 5.1 Espaces et routing

| Espace | Hash | État |
| :--- | :--- | :--- |
| **Contenus** | `#social/...` | cœur du produit |
| Clients | `#clients` | placeholder « en construction » |
| Vidéos | `#videos` | `SubtitleConverter` — `.srt` → `.fcpxml` (Final Cut Pro) |
| Psychédéliques | `#psychedeliques` | `PsychedelicsCalculator` — repères de dosage |

Hash : `#{espace}/{onglet}/{itemId}/{étape}`.
Onglets sociaux : `ideas` | `drafts` | `ready` | `calendar` | `archive`.
Étapes d'éditeur : `idea` | `atelier` | `brouillon` | `slides` | `postcourt` | `script`.

Les deux derniers espaces sont des **outils autonomes**, sans lien avec Notion ni avec le
pipeline. `SubtitleConverter` réutilise toutefois le catalogue de modèles pour un
découpage intelligent des sous-titres.

### 5.2 Les sept objectifs (`ai/objectives.ts`)

Chaque contenu a **exactement un** objectif, et c'est lui qui dicte le CTA. Logique
d'entonnoir :

| Objectif | Étape | Quand |
| :--- | :--- | :--- |
| Notoriété | Découverte | l'idée parle de Florent : parcours, vision, opinion assumée |
| Recadrage de croyance | Découverte | l'idée déloge une croyance qui bloque — contenu signature |
| Confiance / Preuve | Considération | montre concrètement comment il travaille |
| Éducation pratique | Considération | démystifie une pratique (hypnose, respiration holotropique) |
| Trafic contenu long | Considération | bande-annonce d'un article, d'une vidéo, d'une newsletter |
| Conversion séance | Décision | invite explicitement à prendre rendez-vous (~1 post sur 8-10) |
| Promotion événement | Décision | stage, atelier, date |

Le registre porte deux choses : `quand` (guidance injectée dans le persona de l'Analyste,
avec un repère d'équilibre éditorial sur 10 publications) et `ctaRules` (règles injectées
dans le prompt du Rédacteur au moment de la rédaction).

### 5.3 Pipeline éditorial

```
  IDÉE          ANALYSE          ATELIER         VERROU        RÉDACTION       FINITION
┌───────┐    ┌──────────┐    ┌───────────┐   ┌──────────┐   ┌───────────┐   ┌──────────┐
│ titre │───▶│ Analyste │───▶│   Coach   │──▶│Verrouil- │──▶│ Rédacteur │──▶│ Artiste  │
│ notes │    │ verdict  │    │  chat     │   │  leur    │   │ JSON du   │   │ slides + │
│ format│    │ objectif │    │maïeutique │   │  brief   │   │  format   │   │ prompts  │
│ cible │    │ angle    │    │           │   │ figé     │   │           │   │ Dzine    │
└───────┘    └──────────┘    └───────────┘   └──────────┘   └───────────┘   └──────────┘
  Idée        analyzed ✓      coachSession    session.brief   body /          slides
                                                              scriptVideo
                                                                   │
                                        ┌──────────────────────────┴────────────┐
                                        ▼                                       ▼
                                 ┌─────────────┐                        ┌──────────────┐
                                 │ Lecteur     │  relecture à froid     │  Ajustement  │
                                 │ froid       │  → corrections         │  (itératif)  │
                                 └─────────────┘                        └──────────────┘
```

1. **Idée** — `SocialIdeasView` + `IdeaModal`. Florent saisit titre, notes, et **choisit le
   format cible**. Statut `Idée`.
2. **Analyse** — unitaire ou en lot (`AnalysisModal`). L'**Analyste** renvoie verdict,
   justification, objectif, plateformes, angle stratégique, métaphore, profondeur.
   Une signature `_Généré par : <modèle> - le <date>_` est concaténée à l'angle.
3. **Coach** — chat multi-tour, réponses JSON `{message, quick_replies[], ready_for_editor}`.
   Les quick replies sont pré-remplies dans le champ de saisie, éditables avant envoi.
   Session persistée dans `coachSession`.
4. **Verrouillage** (`LOCK_BRIEF`) — au « Go Éditeur », le **Verrouilleur** condense la
   session en un brief figé (`coachSession.brief`). Quand il existe, c'est la matière
   **unique** du Rédacteur : la session brute ne lui est plus transmise, pour que les
   pistes écartées ne ressuscitent pas.
5. **Rédaction** (`DRAFT_CONTENT`) — le Rédacteur reçoit titre, format, objectif (et ses
   règles CTA), angle, métaphore, notes, brief. Renvoie le JSON du format cible. Routé vers
   `scriptVideo` (vidéo) ou `body`. Pour un carrousel, `enforceCarrouselConstraints()`
   applique les contraintes de trame et ajoute la slide de signature définie dans
   `constants.ts` (jamais générée par l'IA — zéro dérive).
6. **Relecture à froid** (`COLD_READ`) — sur Post Texte, Carrousel et Reel : le **Lecteur
   froid** relit et propose des corrections, réinjectables en un clic dans l'ajustement.
7. **Slides carrousel** (`GENERATE_CARROUSEL_SLIDES`) — l'**Artiste** recopie le JSON à
   l'identique en ajoutant un `prompt_dzine` (anglais, 50-80 mots) sur les slides
   `ILLUSTRÉE`. Écrit dans `slides`. `ADJUST_DZINE_PROMPTS` retouche les prompts seuls.
8. **Ajustement** (`ADJUST_CONTENT`) — instruction en langage naturel. Porte sur **le champ
   affiché dans l'onglet courant** : `slides` depuis l'onglet Slides, `scriptVideo` pour la
   vidéo, `body` sinon. Toute génération est annulable une fois (bandeau « Revenir à la
   version précédente » tant que l'éditeur est ouvert).
9. **Prêt** / **Publié** — statut manuel, planification via `CalendarView`.

### 5.4 Sélection du modèle

Il n'y a plus de modale de configuration par action : un **sélecteur global** dans l'entête
choisit le modèle actif pour toutes les actions IA. Sa valeur initiale est le modèle coché
« Défaut » dans Notion ; le choix est persisté dans `AppSettings.activeModelId`.

### 5.5 Réglages (`SettingsPanel`)

Panneau latéral à trois onglets :

- **Affichage** — préférences de densité des cartes (`DisplayPrefs`) : bande verdict,
  plateformes, profondeur, objectif.
- **Modèles IA** — CRUD du catalogue, marquage « par défaut », et un **testeur** qui envoie
  un ping à 1min.ai pour valider qu'un code API répond avant de l'enregistrer.
- **Personas** — lecture seule des sept prompts système et des règles de voix.

---

## 6. Couche IA

### 6.1 Fournisseur unique

**1min.ai pour tout.** `OneMinService.generateContent()` est le point d'entrée unique ;
`testModel()` sert au testeur de Réglages. Le catalogue vient intégralement de Notion :
sans au moins un modèle configuré, aucune action IA n'est possible, et les points d'entrée
le signalent explicitement.

### 6.2 Composition des prompts (`ai/prompts/index.ts`)

Trois couches concaténées par `buildSystemPrompt({ action, ... })` :

```
[1] PERSONA (hardcodé, versionné dans ai/prompts/*.ts)
      ↓
[2] --- CONTEXTE ADDITIONNEL (optionnel, peu utilisé depuis le retrait de la base Contextes)
      ↓
[3] --- RÈGLES DE SORTIE, avec injections %%…%%
```

| Persona | Fichier | Action(s) | Règles de voix |
| :--- | :--- | :--- | :--- |
| Analyste (Stratège) | `analyste.ts` | `ANALYZE_BATCH` | ✅ |
| Coach | `coach.ts` | `COACH_CHAT` | ✅ |
| Verrouilleur | `verrouilleur.ts` | `LOCK_BRIEF` | — |
| Rédacteur (Éditeur) | `redacteur.ts` | `DRAFT_CONTENT`, `ADJUST_CONTENT` | ✅ |
| Lecteur froid | `lecteurFroid.ts` | `COLD_READ` | — |
| Directeur artistique | `artiste.ts` | `GENERATE_CARROUSEL_SLIDES`, `ADJUST_DZINE_PROMPTS` | — |
| Interviewer *(legacy)* | `interviewer.ts` | `GENERATE_INTERVIEW` | — |

`ai/voice.ts` → `VOICE_RULES`, source unique des règles transverses : vouvoiement
systématique, oralité écrite, **une** métaphore filée, zéro emoji, rigueur clinique
traduite en expérience vécue, « montre ne dis pas », la « baffe » bienveillante.

### 6.3 Registre des formats (`ai/formats.ts`)

| Format | shortKey | storageField | editorTab |
| :--- | :--- | :--- | :--- |
| Post Texte (Court) | `Post Texte` | `body` | `atelier` |
| Article (Long/SEO) | `Article` | `body` | `atelier` |
| Script Vidéo (Reel/Short) | `Script Reel` | `scriptVideo` | `atelier` |
| Script Vidéo (Youtube) | `Script Youtube` | `scriptVideo` | `atelier` |
| Carrousel (Slide par Slide) | `Carrousel` | `body` | `atelier` |
| Newsletter | `Newsletter` | `body` | `atelier` |
| Prompt Image | `Prompt Image` | `body` | `atelier` |

Chaque définition porte le `promptTemplate` (la grille de production injectée dans le
prompt du Rédacteur — le cœur qualitatif), `toPlainText()` pour la recherche et l'aperçu,
et le `shortKey` que l'IA doit renvoyer dans le champ `format` (validé par
`parseDraftResponse`).

### 6.4 Contrat de sortie

Toutes les actions demandent du **JSON strict**. `ai/executors.ts` nettoie défensivement :
`extractJsonPayload` (retire les fences, tronque entre première `{` et dernière `}`),
`parseDraftResponse` (valide que `format` est connu), `sanitizeSlidesResponse`,
`parseAIResponse(text, key)` avec repli regex.

**Attention** : une signature markdown est concaténée **après** le JSON avant stockage.
Toute relecture doit passer par `parseBodyJson()` / `bodyJsonToText()`, qui retronquent à
la dernière `}`.

---

## 7. Carte des fichiers

```
App.tsx                  état global, routing hash, sync, analyse, modèle actif
auth.ts                  login / logout / lecture du payload de jeton
config.ts                lecture des VITE_* (IDs de bases)
constants.ts             WORKER_URL, SITE_URL, slide de signature, couleurs de statut
types.ts                 enums et interfaces du domaine

ai/
  actions.ts             9 actions IA : system prompt + config de génération
  objectives.ts          7 objectifs : guidance Analyste + règles CTA Rédacteur
  formats.ts             FORMAT_REGISTRY : grilles de production, routage de stockage
  executors.ts           parsing/validation des réponses IA (pur, sans React)
  voice.ts               VOICE_RULES transverses
  prompts/               7 personas + buildSystemPrompt()

services/
  notionService.ts (1011 l.)  CRUD Notion, rich-text ↔ markdown, introspection de schéma
  oneMinService.ts            appel 1min.ai + testModel()
  coachService.ts             session Coach : brief, parsing, append, validation
  storageService.ts           IndexedDB + marqueurs de sync + AppSettings
  subtitleService.ts          .srt → .fcpxml

components/
  Layout/Sidebar.tsx, Layout/MobileSubTabs.tsx
  Views/SocialIdeasView.tsx, Views/SocialGridView.tsx
  ContentEditor/
    index.tsx      (879 l.)   orchestrateur : exécuteurs IA, sauvegarde, navigation
    DraftView.tsx  (1046 l.)  onglets Atelier / Brouillon / Slides / Copie / Script
    EditorLayout.tsx          chrome (header, sous-header, bandeaux, footer)
    PreviewView.tsx, renderers/
  SettingsPanel.tsx (754 l.)  Affichage / Modèles IA (+ testeur) / Personas
  AnalysisModal.tsx, IdeaModal.tsx, CoachChat.tsx, CalendarView.tsx
  SubtitleConverter.tsx, PsychedelicsCalculator.tsx
  RichTextarea, MarkdownToolbar, CommonModals, LoginPage, ContentCard

gestion-luminose-worker/src/index.js   le Worker complet (auth signée, proxy Notion, 1min)
```

---

## 8. Dette technique

### 8.1 ✅ Harnais de test *(posé le 17/08/2026)*

Le dépôt n'avait aucun test exécutable. Le 16/08, un `useEffect` placé après un retour
anticipé dans `SettingsPanel` a passé typecheck **et** build, a été déployé, et rendait une
page blanche au clic sur Réglages.

`npm test` couvre désormais, en 73 tests :

| Fichier | Ce qu'il protège |
| :--- | :--- |
| `test/worker-auth.test.ts` | jetons forgés, expirés, signés par un autre secret ; CORS |
| `test/notion-models.test.ts` | écriture des modèles selon le type réel des colonnes |
| `test/notion-content.test.ts` | JSON traversant Notion sans altération ; balayage d'IDs |
| `test/ai-executors.test.ts` | parsing défensif des réponses IA |
| `test/ai-formats.test.ts` | complétude du registre, routage par format |
| `test/screens.test.tsx` | montage de chaque écran, dont la transition fermé → ouvert |

Le test de non-régression de la page blanche a été validé en réintroduisant volontairement
le bug : il échoue avec *« Rendered more hooks than during the previous render »*.

**Règle** : tout composant ayant un retour anticipé doit être monté dans `screens.test.tsx`
dans les **deux** états. Aucune CI n'exécute ces tests — `npm test` et `npm run typecheck`
sont à lancer à la main avant de pousser.

### 8.2 ✅ `FORMAT_REGISTRY` est devenu la source de vérité *(17/08/2026)*

`getStorageField()` et `getEditorTab()` étaient exportés et importés nulle part, pendant que
`SCRIPT_VIDEO_REEL_SHORT` était testé à la main six fois dans `ContentEditor/index.tsx` et
deux fois dans `DraftView.tsx`.

Le registre porte maintenant trois décisions par format, et l'éditeur les consomme :

- `storageField` — où déposer le résultat de la rédaction ;
- `editorTab` — sur quelle étape atterrir juste après (le champ existait mais valait
  `'atelier'` partout et ne servait à rien ; la vraie destination était codée en dur) ;
- `supportsColdRead` — quels formats bénéficient de la relecture à froid (c'était une liste
  en dur dans l'éditeur).

Il ne reste qu'un test par format en dur, dans `DraftView` : le CTA spécifique au Reel,
qui relève de la présentation et non du routage.

### 8.3 ✅ Le JSON ne traverse plus le parseur markdown *(17/08/2026)*

`body`, `slides`, `postCourt` et `scriptVideo` passaient par `markdownToNotion()`, qui
interprète `**`, `_`, les backticks, `~` et `[texte](url)`. Ils utilisent désormais
`rawTextToNotion()`. Les champs réellement rédigés (Notes, Angle stratégique…) gardent
l'interprétation markdown, qui y a du sens.

Le contenu déjà stocké avec annotations se relit sans migration : `notionToMarkdown`
réémet les marqueurs et reconstitue le JSON à l'identique.

### 8.4 ✅ Les suppressions Notion se propagent *(17/08/2026)*

Une page archivée ne remonte plus du tout dans les résultats de requête : son absence est
le seul signal de suppression, et une synchronisation incrémentale ne peut structurellement
pas la détecter. `fetchLiveContentIds()` balaie les IDs vivants et le cache est purgé en
conséquence — sauf pour les items non enregistrés, dont l'absence côté Notion est
justement ce qu'on cherche à corriger.

Coût : une requête par tranche de 100 pages, uniquement en sync incrémentale (une sync
complète remplace déjà la liste).

### 8.5 🟡 Divers

- **`textQuality` (Qualité Rédaction)** : saisi, stocké, relu, jamais exploité.
- **`bestUseCases` (Cas d'usage)** : lu et écrit, absent du formulaire d'édition.
- **Bundle de 570 kB** (163 kB gzip) en un seul chunk. `SubtitleConverter`,
  `PsychedelicsCalculator` et `CalendarView` sont des candidats évidents au `lazy()`.
  Sans impact perceptible en usage solo sur poste de travail.
- **`/auth/login`** : comparaison des identifiants avec `===` (fuite de timing théorique)
  et aucune limitation de débit (demanderait un binding KV).
- **`ALLOWED_ORIGINS` en dur** dans le Worker : toute nouvelle origine doit y être ajoutée.
- **Flow `GENERATE_INTERVIEW` / `interviewer.ts`** et champs `interviewAnswers` /
  `interviewQuestions` marqués *legacy* mais toujours présents.
- **`.env.local` contient des variables mortes** : `VITE_NOTION_CONTEXT_DB_ID` (base
  supprimée) et `VITE_GEMINI_API_KEY` (fournisseur retiré).
- **`node_modules` peut être installé pour la mauvaise plateforme** (arborescence linux sur
  le Mac) : `npm run build` échoue alors sur les binaires natifs de rollup/esbuild.
  Correctif : `npm install @rollup/rollup-darwin-arm64 @esbuild/darwin-arm64 --no-save`.

## 9. Pistes à instruire

1. **Espace Clients** — placeholder depuis le début : à construire ou à retirer ?
2. **Lien « source → déclinaisons »** (dans `TODO`) — une vidéo YouTube est le parent
   naturel d'un article et de 3-4 posts. Aujourd'hui chaque format repart de zéro.
   Un champ relation Notion + une action « Décliner ce contenu » depuis un item Prêt/Publié.
   ⚠️ Tout le pipeline suppose actuellement **un contenu = un format**, du champ
   `Format cible` au routage `body`/`slides`/`scriptVideo` : ce chantier touchera ce
   postulat partout, et rend §8.2 bloquant.
3. **Exploiter ou retirer `textQuality` et `bestUseCases`** — par exemple une suggestion
   automatique de modèle selon le format cible.
4. **Règles de voix chez l'Artiste et le Lecteur froid** — absentes. Délibéré (l'Artiste
   produit de l'anglais pour Dzine) ou oubli côté Lecteur froid ?

---

## 10. Journal des modifications

### 17/08/2026
Socle de tests, `rawTextToNotion` sur les quatre champs JSON, `FORMAT_REGISTRY` branché
comme source de vérité, propagation des suppressions Notion, README mis à jour.
SPEC re-dérivée contre le code courant.

### 16/08/2026
Sauvegarde des modèles IA réparée (introspection du schéma Notion), jeton de session signé
en HMAC-SHA256 + CORS restreint, protection contre la perte de contenu (erreur propagée,
items non enregistrés protégés de la sync, annulation de génération), typecheck réparé
(`include: ["."]` ne résolvait aucun fichier), ajustement des carrousels routé sur l'onglet
affiché. Puis correctif de la page blanche du panneau Réglages (hook après retour anticipé).
