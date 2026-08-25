# Luminose Business Manager — gestion.luminose.fr

De l'idée brute au post prêt à publier, avec l'IA comme copilote éditorial à chaque étape.
Application privée, mono-utilisateur.

## Où lire

| | |
| :--- | :--- |
| [SPEC.md](SPEC.md) | Architecture, modèle de données, API, contraintes. Les sections **NORMATIF** font foi : une divergence du code est un bug du code. |
| [FLUX-EDITORIAL.md](FLUX-EDITORIAL.md) | Comment un contenu se fabrique, et les instructions de chaque persona mot pour mot. |
| [CLAUDE.md](CLAUDE.md) | Les règles de travail sur ce dépôt. |

## Commandes

```bash
npm install
npm run dev            # front Vite sur :7860
npm run dev:api        # wrangler dev sur :8787 (D1 local, migrations auto)
npm test               # vitest, tous les workspaces
npm run typecheck      # tsc --noEmit, tous les workspaces
npm run deploy         # ./scripts/deploy.sh
```

Aucune CI n'exécute les tests. `npm test` et `npm run typecheck` avant chaque push.

---

*Ce fichier ne décrit volontairement ni l'architecture ni le flux : ces deux-là bougent, et
un README qui les répète finit par mentir. Il a déjà décrit pendant des mois un stockage
Notion et un proxy 1min.ai qui n'existaient plus.*
