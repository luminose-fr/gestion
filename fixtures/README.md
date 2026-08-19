# fixtures/

## `notion-export-<date>.json`

L'export brut des bases Notion, produit par `tools/export-notion` **avant** la migration
vers D1 (SPEC §9.4, phase 0). C'est le filet de la migration.

Il contient, pour chacune des deux bases :

- `schema` — la définition des propriétés de la data source, qui donne le **type réel** de
  chaque colonne. Aucune page ne porte cette information à elle seule, et l'import en a
  besoin pour interpréter correctement les valeurs.
- `pages` — les objets `page` **tels que Notion les renvoie**, sans mapping ni
  interprétation.

Le choix du brut est délibéré : un mapping se refait à volonté à partir de ces fichiers,
alors qu'une donnée perdue parce qu'on l'a mal comprise au moment de l'export ne se
retrouve pas.

**Ces fichiers sont commités et ne doivent jamais être supprimés**, y compris longtemps
après la bascule. Time Travel de D1 est limité à 7 jours en plan gratuit ; c'est ici que
vit la mémoire d'avant.

Regénérer :

```bash
NOTION_API_KEY=secret_xxx node tools/export-notion/export.mjs
```
