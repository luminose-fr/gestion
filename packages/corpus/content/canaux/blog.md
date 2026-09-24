---
type: instruction
statut: actif
revu: 2026-09
expose: prive
---

# Blog — luminose.fr/blog

**5 à 7 articles par an.** Pédagogie de la thérapie transpersonnelle et des états modifiés de
conscience. C'est le format long : articles de fond, étayés, avec des références nommées
(voir `../repertoire/references.md`).

Registre : pédagogique, humain, étayé scientifiquement, enrichi d'humour léger et de
métaphores concrètes. Les règles de voix transverses s'appliquent intégralement — voir
`../voix/direction-artistique.md`.

**L'article de référence** — celui dont le gabarit fait foi :
`_posts/2026-07-05-stress-installation-electrique.html`.

## FrontMatter Jekyll — NORMATIF

Champs requis : `layout` (`colonne` ou `default`) · `title` · `image_name` ·
`section: blog` · `category` · `tag` · `description` · `summary`.

**Encadrer une valeur de guillemets `"` dès qu'elle contient des deux-points.**

L'adresse publique se déduit du fichier : `/blog/<category>/<slug>.html`, où le slug est le
nom du fichier sans sa date. **Catégorie et slug ne se changent plus après publication** —
les changer casse l'adresse.

### Catégories en usage

Reprendre l'une d'elles. N'en créer une nouvelle que si aucune ne convient.

| Catégorie | Articles |
| :--- | :---: |
| `therapie-transpersonnelle` | 3 |
| `developpement-personnel` | 3 |
| `couple` | 2 |
| `stress` · `anxiete` · `depression` · `traumatisme` · `sommeil` · `dependance` · `alimentation` · `atypique` | 1 chacune |
| `meditation` · `therapie-en-visio` · `video` · `actualite` | 1 chacune |

### Tags

| Tag | Où l'article apparaît sur la page du blog |
| :--- | :--- |
| `exclusif` | dans la grille de cartes mise en avant — **l'article de fond, le cas par défaut** |
| `basique` | dans la liste « L'hypnose vous aide pour… » — une fiche sur un trouble précis |

## Balisage

| Bloc | Classe / balise |
| :--- | :--- |
| Résumé en 2 colonnes avec image | `summary-container` |
| Sections d'explication ou d'étapes | `<div class="light-bg">` |
| Appel à l'action final | `<div class="highlight">` + `<h2 class="subtitle">` + `{% bouton_rendez_vous is-white %}` |

## Visuels

Image principale au format **carré (1:1)** dans le corps de l'article, recadrée en **~16:9**
pour le listing : le sujet doit tenir au centre. Elle porte le nom du slug (`image_name`) et
sert aussi de visuel au post qui annonce l'article. Déclinaisons HD systématiques :

```html
srcset="/images/blog/nom-image.jpg, /images/blog/nom-image@2x.jpg 2x"
```

Style libre, le plus souvent réaliste — `../voix/direction-artistique.md`, §3. Le style des
pages du site (l'étalon) ne s'applique pas au blog.

## Includes obligatoires en pied d'article

```liquid
{% include liens-partage.html %}
{% include bandeaux/bandeau-auteur.html %}
{% include bandeaux/bandeau-temoignages.html %}
{% include bandeaux/bandeau-plus-loin-hypnose.html %}
```

`liens-partage.html` figure deux fois : sous le titre et en fin d'article.
`bandeau-temoignages.html` ne s'affiche que si des témoignages sont rattachés au slug de
l'article — l'inclure ne coûte rien.

## Maillage interne

Un article renvoie vers ce que le blog et le site disent déjà, **uniquement parmi les adresses
ci-dessous** — jamais une adresse devinée. Un lien vers un article passe par son identifiant
(`{% post_url identifiant %}` dans le fichier) : Jekyll résout l'adresse au build.

> **À tenir à jour à chaque publication** : ajouter la ligne de l'article publié.

### Articles publiés

| Identifiant | Sujet |
| :--- | :--- |
| `2026-07-05-stress-installation-electrique` | Le stress : aigu, chronique, post-traumatique |
| `2026-02-05-ombre-colocataire-invisible` | L'Ombre (Jung) et son intégration |
| `2026-01-19-ia-et-therapeute` | L'IA et le thérapeute |
| `2025-12-01-rite-passage-seuil` | Rites de passage, franchir le seuil |
| `2025-08-08-la-theorie-de-attachement` | La théorie de l'attachement |
| `2025-06-06-therapie-distance` | L'accompagnement à distance, en visio |
| `2025-01-21-respiration-holotropique-science` | Le breathwork holotropique étudié par la science |
| `2024-11-22-le-pardon-voie-de-guerison` | Le pardon |
| `2024-11-19-insomnie-et-hypnose` | L'insomnie |
| `2024-08-01-le-triangle-de-amour-sternberg` | Le triangle de l'amour (Sternberg) |
| `2024-01-12-hypnose-une-voie-vers-soi` | L'hypnose, une voie vers Soi (vidéo) |
| `2023-03-06-surdoue-hpi-zebre-hypnose` | Zèbres, surdoués, HPI |
| `2023-02-06-arret-tabac-hypnose` | L'arrêt du tabac |
| `2023-01-26-troubles-anxieux-hypnose` | L'anxiété |
| `2023-01-23-mincir-grace-hypnose` | Mincir |
| `2023-01-23-depression-et-hypnose` | La dépression |
| `2022-12-08-traumatisme-dissociation-et-hypnose` | Trauma et dissociation |
| `2022-09-08-les-langages-de-amour` | Les langages de l'amour |

### Pages du site

| Adresse | Sujet |
| :--- | :--- |
| `/commencer-un-accompagnement.html` | Commencer un accompagnement, le premier échange offert |
| `/hypnotherapie.html` | L'hypnose |
| `/meditation.html` | La méditation |
| `/respiration-holotropique.html` | Le breathwork holotropique — l'adresse garde « respiration », le texte du lien dit « breathwork » |
| `/ateliers-stages.html` | Ateliers et stages de breathwork en groupe |
| `/evenements.html` | L'agenda des ateliers et stages |
| `/faire-le-point.html` | Perte de sens, envie de faire le point |
| `/tarifs-seances-adresse.html` | Tarifs et informations pratiques |
| `/florent-jaouali.html` | Qui est Florent |
| `/outils.html` | Outils pour le développement personnel |
