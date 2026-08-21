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
   modèle recevra réellement.

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

## Déploiement

`./scripts/deploy.sh` — tests et typecheck bloquants, puis migrations D1 distantes, puis
Worker, puis front. Voir l'en-tête du script pour les cibles partielles.
