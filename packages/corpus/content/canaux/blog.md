---
type: instruction
statut: actif
revu: 2026-08
expose: prive
---

# Blog — luminose.fr/blog

**5 à 7 articles par an.** Pédagogie de la thérapie transpersonnelle et des états modifiés de
conscience. C'est le format long : articles de fond, étayés, avec des références nommées
(voir `../repertoire/references.md`).

Registre : pédagogique, humain, étayé scientifiquement, enrichi d'humour léger et de
métaphores concrètes. Les règles de voix transverses s'appliquent intégralement
(`packages/editorial/src/voice.ts`).

## FrontMatter Jekyll — NORMATIF

Champs requis : `layout` (`colonne` ou `default`) · `title` · `image_name` ·
`section: blog` · `category` · `tag` · `description` · `summary`.

**Encadrer une valeur de guillemets `"` dès qu'elle contient des deux-points.**

## Balisage

| Bloc | Classe / balise |
| :--- | :--- |
| Résumé en 2 colonnes avec image | `summary-container` |
| Sections d'explication ou d'étapes | `<div class="light-bg">` |
| Appel à l'action final | `<div class="highlight">` + `<h2 class="subtitle">` + `{% bouton_rendez_vous is-white %}` |

## Visuels

Image principale au format **carré (1:1)** dans le corps de l'article, recadrée en **~16:9**
pour le listing. Déclinaisons HD systématiques :

```html
srcset="/images/blog/nom-image.jpg, /images/blog/nom-image@2x.jpg 2x"
```

## Includes obligatoires en pied d'article

```liquid
{% include liens-partage.html %}
{% include bandeaux/bandeau-auteur.html %}
{% include bandeaux/bandeau-plus-loin-hypnose.html %}
```
