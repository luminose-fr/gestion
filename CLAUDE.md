# gestion.luminose.fr — règles de travail

**Lire [SPEC.md](SPEC.md) avant toute implémentation. Les sections marquées NORMATIF
font foi : une divergence du code est un bug du code.**

Travailler **par phase** (SPEC §11), une branche par phase. Aucune phase ne laisse
l'application cassée.

## Commandes

```
npm install
npm run dev            # front Vite sur :7860
npm run dev:api        # wrangler dev sur :8787 (D1 local, migrations auto)
npm test               # vitest, tous les workspaces
npm run typecheck      # tsc --noEmit, tous les workspaces
npm run deploy         # ./scripts/deploy.sh
```

Aucune CI n'exécute les tests. `npm test` et `npm run typecheck` **avant chaque push**.

## Les cinq règles qui ne se négocient pas

1. **Les secrets ne quittent jamais le Worker.** Aucune clé de fournisseur (Notion,
   1min.ai, OpenAI, OpenRouter…) dans le bundle front, jamais, même en développement. Le
   front ne connaît que des identifiants de modèles et l'origine de l'API.
   Depuis la v2.1 de la SPEC, une clé peut être POSÉE depuis l'administration et stockée
   en base (§5.5) : le sens unique est la règle. Aucune route ne renvoie une clé, l'écran
   n'en affiche que les quatre derniers caractères, et l'export les exclut.

2. **`packages/editorial` n'a aucune dépendance.** Ni React, ni `fetch`, ni API Workers.
   Il compose des chaînes et il en parse. C'est ce qui le rend testable et c'est là que
   vit la valeur du produit.

3. **`FORMAT_REGISTRY` est la seule autorité sur le routage par format** — où stocker,
   où atterrir, qui a droit à la relecture à froid. Aucun `=== TargetFormat.X` ailleurs
   dans le code applicatif. Ajouter un format doit se faire en un seul endroit.

4. **Une migration SQL n'est jamais modifiée après application.** On en ajoute une
   nouvelle. Les fichiers sont numérotés `NNNN_description.sql`, dans l'ordre.

5. **Toute évolution d'un prompt exige la mise à jour de sa golden fixture.** La revue de
   la fixture *est* la revue du changement : c'est le seul endroit où l'on voit ce que le
   modèle recevra réellement. Elle exige aussi la mise à jour de
   [FLUX-EDITORIAL.md](FLUX-EDITORIAL.md), qui cite les personas mot pour mot — un test
   compare les deux, un document qui ment est pire que pas de document.

## Conventions de code

- **Zod à la frontière.** Toute entrée d'API est validée avant d'atteindre la logique.
  À l'intérieur, on fait confiance aux types.
- **`snake_case` en base, `camelCase` en TypeScript.** La conversion a lieu dans
  `workers/api/src/db.ts`, à un seul endroit — jamais dispersée dans les routes.
- **Pas de N+1.** Le plan gratuit plafonne à 50 requêtes D1 par invocation. Une route
  doit pouvoir énoncer son nombre de requêtes, borné, indépendant du volume.
- **Les charges JSON restent du TEXT.** `body`, `slides`, `script_video`,
  `coach_session` ne sont ni indexés ni validés par la base : leur schéma appartient à
  `packages/editorial` et bouge avec les prompts.
- **Commentaires en français, sur le *pourquoi*.** Le *quoi* se lit dans le code. Un
  commentaire qui paraphrase la ligne suivante est du bruit ; un commentaire qui explique
  une contrainte non évidente vaut de l'or.
- **Un refus n'est pas une panne.** Ce que l'appelant peut corriger — une clé absente,
  un fournisseur inconnu — se lève en `Refus` (`workers/api/src/refus.ts`) : statut 4xx,
  message dans `error`, **rien dans les journaux**. Le message doit passer par `error`
  et non par `detail`, parce que c'est `error` qu'affichent `aiService` et `apiService` ;
  servi en 500 avec `error: 'Erreur interne'`, le conseil le plus utile de l'application
  (« Renseignez-la dans Réglages → Fournisseurs ») ne s'est jamais affiché. Un `throw`
  nu reste réservé aux vraies pannes : 500, et la trace part dans les journaux — sans
  quoi l'indicateur qui devrait réveiller quelqu'un se déclenche pour tout, donc pour
  rien.
- **Pas de hook React après un retour anticipé.** Cette règle est née d'une page blanche
  en production : un `useEffect` placé après un `if (!isOpen) return null;`, invisible au
  typecheck comme au build. Tout composant à retour anticipé est monté dans
  `screens.test.tsx` **dans les deux états**.

## Avant de coder

- `git fetch && git status -sb`. Ce dépôt est un répertoire partagé entre le Mac et une
  VM ; il dérive régulièrement derrière `origin`. Une session entière a déjà été
  construite sur un HEAD en retard de dix commits.
- Vérifier dans le navigateur tout écran modifié. Le typecheck et le build ne voient pas
  les erreurs de rendu.

## La machine qui construit

**`npm install`, `npm run build` et `npm run deploy` se lancent depuis la VM Ubuntu.**
Pas depuis le Mac, pas depuis un agent, pas depuis un conteneur monté sur le dépôt.

Le répertoire de travail est partagé entre plusieurs machines et `node_modules` ne peut
servir qu'une plateforme à la fois : **le dernier `npm install` gagne**, et la machine
d'en face échoue sur les binaires natifs — `workerd` pour wrangler, `rollup` et `esbuild`
pour le build. Le SPEC §10.4 donne la parade (`npm install --no-save
@cloudflare/workerd-<plateforme>`), mais ne pas avoir à s'en servir vaut mieux.

Cette règle est née le 26/08/2026 : une session travaillant à travers un pont de fichiers
a lancé `npm install` depuis une troisième machine — ni le Mac, ni la VM — puis un
`npm run build` qui a échoué sur le vidage de `dist/`. Le diagnostic annoncé était le
mauvais : ce n'était pas un problème de permissions, c'était une machine qui n'avait rien
à faire là.

**Ce qu'un agent peut lancer sans risque**, parce que rien n'y est écrit hors du dépôt :

```
npx tsc --noEmit          # dans un workspace, ou npm run typecheck à la racine
npx vitest run            # idem
npm run contexte -w packages/corpus
```

Tout le reste — `install`, `build`, `deploy`, `wrangler` — appartient à la VM.

## Déploiement

`./scripts/deploy.sh` : tests et typecheck bloquants, puis corpus embarqué, puis migrations
D1 distantes, puis Worker, puis front. Voir l'en-tête du script pour les cibles partielles.

**Deux façons de le lancer, un seul script.**

| | |
| :--- | :--- |
| `npm run deploy` | **depuis la VM Ubuntu** (voir ci-dessus) |
| Actions → « Déploiement Cloudflare » → *Run workflow* | depuis n'importe où, y compris un téléphone |

Le workflow (`.github/workflows/deploiement.yml`) **appelle** `deploy.sh`, il ne le
réécrit pas : deux chemins de déploiement finiraient par diverger, et c'est celui qu'on
emprunte le moins qui serait faux. Il ne se déclenche sur aucun push — décision du
27/08/2026 : l'historique porte des commits d'étape, et les publier parce qu'ils touchent
`main` transformerait chaque sauvegarde en mise en ligne.

Il accepte une **répétition** (`DRY_RUN`) : les tests tournent, les commandes s'affichent,
rien ne part. C'est le passage obligé avant de faire confiance à une nouvelle CI.
