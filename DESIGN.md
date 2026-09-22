# Homogénéiser l'interface — brief d'exécution

> Destinataire : l'agent de design. Ce document dit **ce qui doit devenir vrai**, pas
> comment coder chaque écran. Il s'appuie sur un relevé exhaustif des classes utilisées
> dans `apps/manager` au 22/09/2026 ; les chiffres cités sont des occurrences réelles.

## Le périmètre, et surtout ce qui en est exclu

**Ce qui change :** les tailles de typographie, les espacements (marges, paddings,
gouttières), les boutons, les champs de formulaire, les cartes, les rayons, les ombres,
et la largeur des zones de travail.

**Ce qui ne change pas — NORMATIF :**

- la **structure de navigation** : les espaces, la barre latérale, les sous-niveaux, les
  onglets, le routage par hash. Ils fonctionnent ; les toucher, c'est rouvrir un sujet
  réglé ;
- l'**identité** : polices (`Futura LT`, `Abril Display`), couleurs de marque, thème
  sombre. Les tokens de couleur de `apps/manager/index.css` restent tels quels ;
- le **comportement** : aucune logique, aucun appel d'API, aucun état ne bouge. Un
  changement qui modifie ce que l'application fait n'appartient pas à ce chantier ;
- les **textes**. Un libellé mal formulé se corrige ailleurs.

## Pourquoi ce chantier existe

L'interface s'est construite écran par écran, et chaque écran a réinventé ses valeurs.
Le relevé :

| | Aujourd'hui |
| :--- | :--- |
| Tailles de typo | **11**, dont 5 arbitraires en pixels (`text-[9px]`, `[10px]`, `[11px]`, `[13px]`, `[20px]` — 227 occurrences) |
| Rayons | **9**, de `rounded-sm` à `rounded-3xl` |
| Ombres | **8** (`shadow-xs`, `sm`, `md`, `lg`, `xl`, `2xl`, `brand`, `green`) |
| Couples `px-/py-` sur les boutons | **12**, soit 6 hauteurs différentes |
| Largeurs maximales | **10**, de `max-w-xs` à `max-w-6xl` |
| Bordures de carte | **2 conventions concurrentes** : `border-brand-border` (202) et `border-brand-light` (24), et côté sombre `dark:border-dark-sec-border` (199) contre `dark:border-dark-sec-bg` (29) |

Rien de tout cela ne se voit sur un écran isolé. Tout se voit en passant de l'un à
l'autre — c'est exactement ce que fait l'utilisateur, qui est seul et les connaît tous.

## Les échelles cibles — NORMATIF

Ces échelles sont **fermées** : une valeur hors liste est un bug, pas une exception. Tout
ce qui existe aujourd'hui doit s'y ramener, vers la valeur la plus proche.

### Typographie — six rôles, pas onze tailles

| Rôle | Classe | Emploi |
| :--- | :--- | :--- |
| Étiquette | `text-micro` (11 px) | sur-titres en capitales, pastilles, mentions |
| Secondaire | `text-xs` (12 px) | texte d'accompagnement, métadonnées, aides |
| Courant | `text-sm` (14 px) | **le corps de l'application** — listes, champs, boutons |
| Lecture | `text-base` (16 px) | contenus longs : brouillons, documents du corpus |
| Titre d'écran | `text-lg` (18 px) | en-tête d'une carte ou d'un écran |
| Titre fort | `text-xl` (20 px) | réservé aux vides et aux pages d'accueil |

`text-micro` est à déclarer dans `@theme` (`--text-micro: 0.6875rem`), avec sa hauteur de
ligne. `text-[9px]`, `text-[10px]`, `text-[13px]`, `text-[20px]` et `text-2xl`/`3xl`
disparaissent : le 9 et le 10 deviennent `text-micro`, le 13 devient `text-sm`, le 20 et
au-delà deviennent `text-xl`.

Les graisses se limitent à trois : `font-normal`, `font-semibold`, `font-bold`.
`font-medium` disparaît au profit de `font-semibold`.

### Espacement — des multiples de 4

Valeurs autorisées : `0.5` (2 px, pastilles uniquement), `1`, `1.5`, `2`, `3`, `4`, `5`,
`6`, `8`. Tout le reste disparaît.

- **Gouttière d'écran**, une seule : `px-4 md:px-6 py-5`. Les deux conventions actuelles
  (`px-4 md:px-6` et `p-4 md:p-6`) fusionnent dans celle-là.
- **Carte** : `p-4` en liste dense, `p-5` pour une carte de contenu, `p-6` pour une carte
  seule au centre d'un écran. Pas de `p-3.5`, pas de `p-8`.
- **Entre deux cartes** : `space-y-4`. **Dans une carte** : `space-y-3`.
- **Entre une étiquette et son champ** : `mb-1`. Entre deux groupes de champs : `mb-3`.

### Boutons — trois tailles, trois intentions

| | Classes |
| :--- | :--- |
| Petit | `px-2.5 py-1.5 text-xs font-semibold rounded-lg` |
| Normal | `px-3 py-2 text-sm font-semibold rounded-lg` |
| Grand | `px-4 py-2.5 text-sm font-bold rounded-lg` |

| Intention | Classes |
| :--- | :--- |
| Principale | `bg-brand-main text-white hover:bg-brand-hover dark:bg-white dark:text-brand-main` |
| Secondaire | `border border-brand-border dark:border-dark-sec-border text-brand-main dark:text-dark-text hover:border-brand-main/40` |
| Discrète | `text-brand-main/70 dark:text-dark-text/70 underline hover:no-underline` |

Tous portent `disabled:opacity-40` et `transition-colors`. Un bouton n'a **jamais**
d'ombre, sauf l'action principale d'un écran, qui peut porter `shadow-xs`.

`rounded-full` est réservé aux **pastilles et compteurs** — jamais à un bouton.

### Rayons, ombres, bordures

- Rayons : `rounded-md` (élément dans un champ), `rounded-lg` (bouton, champ, ligne),
  `rounded-xl` (carte), `rounded-full` (pastille). `sm`, `2xl`, `3xl` disparaissent.
- Ombres : `shadow-xs` (carte posée), `shadow-lg` (modale, menu flottant). Rien d'autre.
  `shadow-brand` ne survit que sur l'action principale de l'écran d'accueil.
- Bordures : **une seule convention**, la majoritaire —
  `border border-brand-border dark:border-dark-sec-border`. `border-brand-light` et
  `dark:border-dark-sec-bg` en bordure disparaissent.
- Surfaces : `bg-white dark:bg-dark-surface` pour une carte. Les quatorze exceptions
  (`dark:bg-dark-bg`, `dark:bg-violet-*`, `purple-*`, `emerald-*`, `pink-*`) rentrent dans
  le rang, sauf celles qui portent un **sens** (succès, alerte) — et celles-là passent par
  un token, pas par une couleur Tailwind brute.

### Largeurs de zone de travail — trois gabarits

| Gabarit | Largeur | Pour |
| :--- | :--- | :--- |
| Liste | `max-w-6xl` | tableaux, grilles, calendrier |
| Travail | `max-w-3xl` | formulaires longs, éditeur, réglages |
| Focus | `max-w-2xl` | confirmation, écran à une seule décision |

Toujours avec `mx-auto`. `max-w-xs`, `sm`, `md`, `lg`, `4xl`, `5xl`, `64` disparaissent.

## Comment procéder

1. **Déclarer avant de migrer.** `text-micro` dans `@theme`, et un module
   `apps/manager/components/ui/` qui expose `Bouton`, `Carte`, `Champ`, `Etiquette`,
   `TitreSection`. Ces composants portent les classes ci-dessus **en un seul endroit** :
   c'est ce qui empêchera la dérive de recommencer. Aujourd'hui, une centaine de
   `<button>` répètent chacun leur style à la main.
2. **Migrer écran par écran, un commit par écran.** Ordre suggéré, du plus vu au moins
   vu : Contenus (listes et éditeur), Corpus, Réglages, Clients, Vidéos, Psychédéliques.
3. **Ne pas réécrire ce qui n'est pas visé.** Un composant dont seules les classes
   changent ne change pas de structure JSX, sauf si le composant partagé l'exige.

## Les contraintes du dépôt — NORMATIF

- **Tailwind v4.** Les tokens vivent dans `@theme`, dans `apps/manager/index.css`. Pas de
  `tailwind.config.js`.
- **Le thème sombre suit le système** (`@custom-variant dark (@media
  (prefers-color-scheme: dark))`). Toute classe claire doit avoir sa jumelle `dark:`, et
  les deux se vérifient.
- **`npm test` et `npm run typecheck` avant chaque push.** `screens.test.tsx` monte tous
  les écrans : un composant à retour anticipé s'y monte **dans les deux états**.
- **Vérifier dans le navigateur tout écran modifié.** Le typecheck et le build ne voient
  pas un rendu.
- **`npm install`, `npm run build` et `npm run deploy` se lancent depuis la VM Ubuntu**,
  jamais depuis un agent (voir `CLAUDE.md`).
- **Commentaires en français, sur le pourquoi.** Un commentaire qui paraphrase la ligne
  suivante est du bruit.
- Une branche par phase. Aucune phase ne laisse l'application cassée.

## Comment on saura que c'est fini

Ces commandes, lancées à la racine, doivent rendre **zéro ligne** :

```
grep -rhoE "text-\[[0-9]+px\]" apps/manager --include=*.tsx | sort -u
grep -rhoE "rounded-(sm|2xl|3xl)" apps/manager --include=*.tsx | sort -u
grep -rhoE "max-w-(xs|sm|md|lg|4xl|5xl|64)\b" apps/manager --include=*.tsx | sort -u
grep -rhoE "border-brand-light|dark:border-dark-sec-bg" apps/manager --include=*.tsx | sort -u
grep -rn "font-medium" apps/manager --include=*.tsx
```

Et celles-ci doivent rendre une liste **courte et fermée** :

```
grep -rhoE "\bpx-[0-9.]+ py-[0-9.]+" apps/manager --include=*.tsx | sort | uniq -c | sort -rn
grep -rhoE "shadow-[a-z0-9]+" apps/manager --include=*.tsx | sort | uniq -c
```

Le vrai critère, lui, ne se mesure pas au `grep` : **passer d'un espace à l'autre ne doit
plus se voir**. Même hauteur de bouton, même gouttière, même largeur utile, même taille de
texte pour le même rôle. C'est le test à faire dans le navigateur, avant de dire que c'est
terminé.
