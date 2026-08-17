# SocialFlow Manager — gestion.luminose.fr

Application de gestion du cycle de vie des contenus pour réseaux sociaux : de l'idée brute
au post prêt à publier, avec l'IA comme copilote éditorial à chaque étape. Les données
vivent dans Notion, les appels IA passent par 1min.ai.

> 📘 **[SPEC.md](SPEC.md)** décrit l'architecture, le modèle de données, le pipeline
> éditorial et la dette technique. À lire avant de toucher au code.

---

## Architecture en une image

```
Navigateur (SPA React, GitHub Pages)
        │  HTTPS + X-Session-Token
        ▼
Cloudflare Worker  ── détient TOUS les secrets
        ├──▶ api.notion.com     (données)
        └──▶ api.1min.ai        (IA)
```

Une SPA statique ne peut pas garder de secret : **aucune clé d'API n'est dans le bundle**.
Le front ne connaît que des IDs de bases Notion et l'URL du Worker.

---

## 1. Configuration de Notion

Créez une intégration sur [Notion My Integrations](https://www.notion.so/my-integrations)
et copiez son *Internal Integration Secret* — il ira dans les secrets du **Worker**, jamais
dans le front.

### Base « Contenu »

| Propriété | Type | Options / rôle |
| :--- | :--- | :--- |
| **Titre** | Title | |
| **Statut** | Select | `Idée`, `Brouillon`, `Prêt`, `Publié` |
| **Plateforme** | Multi-select | `Facebook`, `Instagram`, `LinkedIn`, `Google My Business`, `Youtube`, `Blog`, `Newsletter` |
| **Contenu** | Text | JSON du brouillon, écrit par l'IA |
| **Date de publication** | Date | planification |
| **Notes** | Text | matière brute saisie à la main |
| **Analysé** | Checkbox | |
| **Verdict** | Select | `Valide`, `Trop lisse`, `À revoir` |
| **Angle stratégique** | Text | rempli par l'IA |
| **Format cible** | Select | `Post Texte (Court)`, `Article (Long/SEO)`, `Script Vidéo (Reel/Short)`, `Script Vidéo (Youtube)`, `Carrousel (Slide par Slide)`, `Prompt Image`, `Newsletter` |
| **Objectif** | Select | `Notoriété`, `Recadrage de croyance`, `Confiance / Preuve`, `Éducation pratique`, `Trafic contenu long`, `Conversion séance`, `Promotion événement` |
| **Justification** | Text | rempli par l'IA |
| **Métaphore Suggérée** | Text | rempli par l'IA |
| **Profondeur** | Select | `Direct`, `Légère`, `Complète` |
| **Coach Session** | Text | JSON de la session Coach |
| **Slides** | Text | JSON des slides carrousel |
| **Post Court** | Text | texte prêt à copier |
| **Script vidéo** | Text | JSON du script |

### Base « Modèles IA »

Catalogue des moteurs 1min.ai, éditable depuis l'application (Réglages → Modèles IA).

| Propriété | Type | Rôle |
| :--- | :--- | :--- |
| **Nom** | Title | nom commercial |
| **Code API** | Text | identifiant envoyé à 1min.ai |
| **Fournisseur** | Text ou Select | groupe l'affichage |
| **Cout** | Select | `low`, `low_medium`, `medium`, `high`, `very_high` |
| **Forces** | Text | |
| **Cas d'usage** | Text | |
| **Qualité Rédaction** | Number | 1 à 5 |
| **Défaut** | Checkbox | modèle présélectionné au démarrage |

> Les noms de colonnes sont résolus au runtime de façon tolérante (accents, apostrophes
> typographiques, variantes FR/EN), et une colonne absente est ignorée au lieu de faire
> échouer l'enregistrement.

### Connecter l'intégration

Par défaut, une intégration Notion n'a accès à rien. Sur **chacune** des deux bases :
**…** en haut à droite → **Connections** → ajoutez votre intégration.

Récupérez enfin l'ID de chaque base depuis son URL (la partie entre le dernier `/` et le `?`).

---

## 2. Lancement en local

```bash
npm install
```

Créez un fichier `.env.local` à la racine. **Deux variables suffisent.** Aucune clé d'API
n'est nécessaire côté front, même en développement : tout transite par le Worker déployé.

```env
VITE_NOTION_CONTENT_DB_ID=votre_id_base_contenu
VITE_NOTION_MODELS_DB_ID=votre_id_base_modeles
```

```bash
npm run dev
```

L'application écoute sur http://localhost:7860 — origine déjà autorisée par le CORS du
Worker. La connexion se fait avec les identifiants définis dans les secrets du Worker.

### Les autres commandes

```bash
npm run typecheck   # tsc --noEmit sur l'ensemble du projet
```

```bash
npm test            # vitest : Worker, Notion, parsing IA, montage des écrans
```

```bash
npm run build       # build de production dans dist/
```

`npm run typecheck` et `npm test` sont les deux garde-fous du projet. Aucune CI ne les
exécute : lancez-les avant de pousser.

---

## 3. Le Worker

`gestion-luminose-worker/` proxifie Notion et 1min.ai et gère l'authentification. Il
détient tous les secrets :

```bash
npx wrangler secret put SESSION_SECRET
```

```bash
npx wrangler secret put NOTION_API_KEY
```

```bash
npx wrangler secret put ONE_MIN_API_KEY
```

```bash
npx wrangler secret put AUTH_USERNAME
```

```bash
npx wrangler secret put AUTH_PASSWORD
```

`SESSION_SECRET` signe les jetons de session en HMAC-SHA256 — générez-le avec
`openssl rand -base64 32`. Le changer déconnecte immédiatement toutes les sessions : c'est
le mécanisme de révocation.

Les origines autorisées sont codées dans `ALLOWED_ORIGINS` (`src/index.js`) ; toute
nouvelle origine de développement doit y être ajoutée, sinon le navigateur bloque les
réponses.

---

## 4. Déploiement

**Le front est automatique** : tout push sur `main` déclenche
`.github/workflows/deploy.yml` (build puis publication sur la branche `gh-pages`). Les IDs
de bases viennent des secrets GitHub `NOTION_CONTENT_DB_ID` et `NOTION_MODELS_DB_ID`.

**Le Worker est manuel** :

```bash
cd gestion-luminose-worker && npx wrangler deploy
```

> ⚠️ **Quand les deux changent, l'ordre est imposé : le front d'abord, le Worker ensuite.**
> Le front sait lire les deux formats de jeton de session, l'inverse n'est pas vrai —
> déployer le Worker en premier enfermerait la connexion dans une boucle de login.

---

## 5. Note sur l'IA

Tous les appels passent par **1min.ai**, via le Worker. Les modèles disponibles se gèrent
depuis Réglages → Modèles IA, où un testeur intégré vérifie qu'un code API répond avant
enregistrement. **Sans au moins un modèle configuré, aucune action IA n'est possible.**

Les personas, les règles de voix et les grilles de production par format sont **dans le
code** (`ai/prompts/`, `ai/voice.ts`, `ai/formats.ts`), versionnés avec lui, et consultables
en lecture seule depuis Réglages → Personas.
