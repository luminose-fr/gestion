---
type: instruction
statut: actif
revu: 2026-09
expose: prive
---

# Direction artistique

Quatre sujets distincts, quatre traitements différents. Les deux derniers sont des **libertés
délibérées** : ne pas les combler.

## 1. L'identité Luminose

**Palette de l'interface** — bandeaux, fonds, boutons, liens du site.

| Rôle | Valeur |
| :--- | :--- |
| Violet principal | `#613F7F` |
| Violet-bleu | `#6163A5` |
| Violet alternatif | `#60407F` |
| Fond clair | `#F9F5FF` |
| Bordure claire | `#E8DEF6` |

Registre visé : violet, profondeur, douceur, intériorité, spiritualité **non générique**,
élégance, atmosphère contemplative.

> **Cette palette fait foi pour l'interface.** C'est celle de `_sass/ui-variables.scss` dans
> le dépôt du site (vérifié le 24/09/2026). Le thème sombre y ajoute `#BB95DD` (violet clair),
> `#3F2258` et `#20122E` (fonds).
>
> Le persona Artiste la reçoit avec cette fiche ; il n'en porte plus de copie. Il en portait
> une, qui avait dérivé vers les couleurs du Seuil, une offre suspendue.
>
> Elle ne décrit **pas** les illustrations du site, qui ont leur propre gamme (§2).

**Typographies** — Futura Book · Abril Display Italic.

**Refusées explicitement : Fraunces, Satoshi.** C'est une interdiction, pas une préférence :
une proposition qui les emploie est à rejeter sans discussion.

## 2. Le style du site

Piloté par une **image de référence** et la consigne « dans le même style que… ». Ça marche
et ça homogénise — c'est le mécanisme, pas une description.

Le fichier porte le **pointeur et la formule**, jamais une description textuelle du style :
une description d'un style visuel est toujours pire que l'image elle-même.

Vaut pour les illustrations des **pages du site — hors blog** (§3).

**L'outil** — ChatGPT Images, l'image de référence jointe à la conversation.

**L'image de référence (l'étalon)** — `_ai_helpers/etalon.jpg`, dans le dépôt du site
(`luminose.fr`). Toute image se génère avec elle jointe.

**La formule** — un prompt d'image s'écrit ainsi, en français, et rien d'autre :

> Nouvelle image indépendante — l'image jointe sert uniquement de référence de style, de
> palette et de grain : [le sujet en 2 à 3 phrases — quoi, où, quelle ambiance ; toujours une
> scène figurative, jamais un concept abstrait]. [Le cadrage : distance, angle]. Aucun texte.
> Format [2:1 / 1:1 / 4:3 / 3:4].

**Les règles de sujet** — silhouettes sans visage détaillé · pas de représentation littérale
d'un état de détresse · pas de symboles ésotériques appuyés · pas de schéma, de courbe ni de
flèche : un processus (respiration, cycle, étapes) s'incarne dans une scène · aucun texte ni
lettre dans l'image.

**La gamme des illustrations** — mesurée sur les illustrations des pages le 24/09/2026. Elle
sert à **vérifier** qu'une image nouvelle tient dans la série, pas à la décrire au modèle :
c'est l'étalon qui fait ça.

| De la lumière… | | | | | | …à l'ombre |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `#FDEEE1` ivoire | `#FBE2D5` ivoire rosé | `#E9B9BB` rose brumeux | `#C98FA5` mauve rosé | `#9A688E` mauve | `#634575` prune | `#3C3061` violet nuit |

Tons chauds et voilés : le contraste vient de la profondeur, jamais de la saturation — pas de
violet électrique, pas de fuchsia. L'ivoire n'est pas du blanc. `marcher-ensemble-cercle`
(ciel étoilé, plus saturé) sort de la série : ne pas la prendre comme référence.

**Sans l'étalon sous la main** (nouvelle conversation, autre outil) : le bloc de style à coller
en tête du prompt, et les phrases de correction de dérive, vivent dans
`_ai_helpers/prompts-images-luminose.md` du même dépôt. Ils ne sont pas recopiés ici.

## 3. Les illustrations du blog

```yaml
statut: volontairement-absent
revu: 2026-09
```

**Pas de charte, et c'est délibéré.** Le plus souvent une scène **réaliste**, photographique,
qui montre concrètement la métaphore de l'article — un tableau électrique ancien pour le
stress, une porte de pierre ouverte sur un paysage pour les rites de passage. C'est une
tendance, pas une règle : un article peut appeler un autre traitement.

Ni l'étalon ni la gamme du §2 ne s'y appliquent.

## 4. Les illustrations réseaux sociaux

```yaml
statut: volontairement-absent
revu: 2026-08
```

**Pas de règle, et c'est délibéré.** Le fonctionnement actuel convient. Cette ligne existe
pour empêcher qu'une IA — ou une session future — comble le vide en inventant une charte :
on récupérerait de l'incohérence là où il y a une liberté assumée.

À reconfirmer à la prochaine revue, pas à combler.

## Symboles

**Pertinents** — l'arche · le seuil · le passage · l'ouroboros · la nature · les cycles ·
la lumière et l'ombre · les espaces de transition · la matière.

**Interdits** — lotus · représentations de chakras · couleurs arc-en-ciel des chakras ·
esthétique yoga générique · accumulation de symboles ésotériques · clichés de méditation ·
imagerie pseudo-spirituelle littérale · new age standardisé.

Préférer la suggestion et le symbolisme discret à la littéralité.

## Le registre, en une ligne

Profond sans emphase · symbolique sans kitsch · transpersonnel sans cliché ésotérique ·
thérapeutique sans froideur médicale · premium sans ostentation · chaleureux mais sobre ·
évocateur tout en restant compréhensible.

## Palette « Le Seuil »

Conservée bien que l'offre soit suspendue : c'est de la matière, pas une offre.

- Fond : `linear-gradient(180deg,#E5C7CD,#E8C6BD,#F8D2B6,#FCDFB9,#FFDDAA)` — rose doux vers
  chair, pêche, crème, doré clair
- Accentuation : `linear-gradient(135deg,#86285A,#660037)`
- Texte : `#660037` · violet profond : `#38154B`

## Ce qui ne vit pas ici

Les règles de voix écrite vivent dans `regles-de-voix.md`, juste à côté : c'est la source, et
`packages/editorial/src/voice.ts` en est engendré au build. Une fixture golden et un test de
concordance avec `FLUX-EDITORIAL.md` §4 gardent la chaîne. **Ne pas recopier ici.**
