# Homogénéiser l'interface — brief d'exécution

> Destinataire : l'agent de design. Ce document dit **ce qui doit devenir vrai**, pas
> comment coder chaque écran. Il s'appuie sur un relevé exhaustif des classes utilisées
> dans `apps/manager` au 22/09/2026 ; les chiffres cités sont des occurrences réelles.
>
> Révisé le 22/09/2026 après revue de la phase 1 : quatre rôles typographiques au lieu
> de six, deux tailles de bouton au lieu de trois, deux gabarits au lieu de trois, et trois
> tokens de couleur pour les sens (succès, alerte, erreur).

## Le périmètre, et surtout ce qui en est exclu

**Ce qui change :** les tailles de typographie, les espacements (marges, paddings,
gouttières), les boutons, les champs de formulaire, les cartes, les rayons, les ombres,
et la largeur des zones de travail.

**Ce qui ne change pas — NORMATIF :**

- la **structure de navigation** : les espaces, la barre latérale, les sous-niveaux, les
  onglets, le routage par hash. Ils fonctionnent ; les toucher, c'est rouvrir un sujet
  réglé ;
- l'**identité** : polices (`Futura LT`, `Abril Display`), couleurs de marque, thème
  sombre. Les tokens de couleur existants de `apps/manager/index.css` restent tels quels ;
  seuls s'y ajoutent `--color-succes`, `--color-alerte` et `--color-erreur` (voir plus bas) ;
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
| Tailles d'icône dans les boutons | **3** (`w-3`, `w-3.5`, `w-4`), sans lien avec la taille du bouton |
| Largeurs maximales | **10**, de `max-w-xs` à `max-w-6xl` |
| Bordures de carte | **2 conventions concurrentes** : `border-brand-border` (202) et `border-brand-light` (24), et côté sombre `dark:border-dark-sec-border` (199) contre `dark:border-dark-sec-bg` (29) |
| Couleurs de sens | `green-*`, `emerald-*`, `amber-*` et `red-*` écrits à la main dans une trentaine de fichiers, chacun avec sa jumelle `dark:` |

Rien de tout cela ne se voit sur un écran isolé. Tout se voit en passant de l'un à
l'autre — c'est exactement ce que fait l'utilisateur, qui est seul et les connaît tous.

## Les échelles cibles — NORMATIF

Ces échelles sont **fermées** : une valeur hors liste est un bug, pas une exception. Tout
ce qui existe aujourd'hui doit s'y ramener, vers la valeur la plus proche.

### Typographie — quatre rôles, pas onze tailles

| Rôle | Classe | Emploi |
| :--- | :--- | :--- |
| Étiquette | `text-micro` (11 px) | sur-titres en capitales, pastilles, mentions |
| Secondaire | `text-xs` (12 px) | texte d'accompagnement, métadonnées, aides |
| Courant | `text-sm` (14 px) | **le corps de l'application** — listes, champs, boutons, contenus longs |
| Titre | `text-lg` (18 px) | en-tête d'une carte ou d'un écran, vides, accueil |

`text-micro` est à déclarer dans `@theme` (`--text-micro: 0.6875rem`), avec sa hauteur de
ligne. Le 9, le 10 et le 11 deviennent `text-micro` ; le 13 et `text-base` deviennent
`text-sm` ; le 20, `text-xl`, `text-2xl` et `text-3xl` deviennent `text-lg`.

Le titre éditorial en `font-display` (Abril Display) relève de l'identité et n'est pas
concerné.

Les graisses se limitent à trois : `font-normal`, `font-semibold`, `font-bold`.
`font-medium` disparaît au profit de `font-semibold`.

### Espacement — des multiples de 4

Valeurs autorisées : `0.5` (2 px, pastilles uniquement), `1`, `1.5`, `2`, `3`, `4`, `5`,
`6`, `8`. `2.5` n'existe que dans le padding horizontal du petit bouton. Tout le reste
disparaît.

- **Gouttière d'écran**, une seule : `px-4 md:px-6 py-5`. Les deux conventions actuelles
  (`px-4 md:px-6` et `p-4 md:p-6`) fusionnent dans celle-là.
- **Carte** : `p-4` en liste dense, `p-5` pour une carte de contenu, `p-6` pour une carte
  seule au centre d'un écran. Pas de `p-3.5`, pas de `p-8`.
- **Entre deux cartes** : `space-y-4`. **Dans une carte** : `space-y-3`.
- **Entre une étiquette et son champ** : `mb-1`. Entre deux groupes de champs : `mb-3`.

### Boutons — deux tailles, trois intentions

| | Classes | Hauteur | Icône |
| :--- | :--- | :--- | :--- |
| Petit | `px-2.5 py-1.5 text-xs font-semibold rounded-lg` | 30 px | 14 px (`size-3.5`) |
| Normal | `px-3 py-2 text-sm font-semibold rounded-lg` | 38 px | 16 px (`size-4`) |

L'ancien « grand » (`px-4 py-2.5`, `px-8 py-3`…) devient **normal**. La taille d'icône est
imposée par le bouton : une icône ne porte plus sa propre taille quand elle est dans un
bouton.

| Intention | Classes |
| :--- | :--- |
| Principale | `border border-transparent bg-brand-main text-white hover:bg-brand-hover dark:bg-white dark:text-brand-main` |
| Secondaire | `border border-brand-border dark:border-dark-sec-border text-brand-main dark:text-dark-text hover:border-brand-main/40` |
| Discrète | `border border-transparent text-brand-main/70 dark:text-dark-text/70 underline hover:no-underline` |

Chaque intention porte une bordure, transparente quand elle ne se voit pas : sans elle,
la principale mesure 2 px de moins que la secondaire et que le champ voisin.

Tous portent `disabled:opacity-40` et `transition-colors`. Un bouton n'a **jamais**
d'ombre, sauf l'action principale d'un écran, qui peut porter `shadow-xs`.

`rounded-full` est réservé aux **pastilles et compteurs** — jamais à un bouton.

**Boutons qui portent un sens.** Un bouton vert (« Valider », « Publiable »), orange
(« Trop lisse », « Régénérer ») ou rouge (« Supprimer », « À revoir ») garde son sens
mais passe par les tokens : `ton="succes"`, `"alerte"` ou `"erreur"` sur le composant
`Bouton`. En plein (intention principale), le texte est blanc en clair et `dark-bg` en
sombre, parce que les tokens s'éclaircissent en sombre et qu'un texte blanc n'y serait
plus lisible.

### Champs

`w-full px-3 py-2 rounded-lg text-sm bg-brand-light dark:bg-dark-bg border
border-brand-border dark:border-dark-sec-border focus:border-brand-main
dark:focus:border-white` — 38 px, la hauteur du bouton normal. `py-2.5` disparaît.

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
  le rang, sauf celles qui portent un **sens** (succès, alerte), qui passent par les tokens
  ci-dessous.

### Couleurs de sens — trois tokens

| Token | Clair | Sombre |
| :--- | :--- | :--- |
| `--color-succes` | `#047857` | `#6ee7b7` |
| `--color-alerte` | `#b45309` | `#fcd34d` |
| `--color-erreur` | `#b91c1c` | `#fca5a5` |

Déclarés dans `@theme`, leur valeur sombre posée dans un
`@media (prefers-color-scheme: dark)` sur `:root`. Un écran écrit donc `text-succes` et
**jamais** `dark:text-…` pour un sens. Les surfaces s'en déduisent par opacité :
`bg-succes/10` (fond), `border-succes/30` (bordure), `text-succes` (texte). Chaque
valeur passe 4.5:1 sur les fonds de son thème.

`green-*`, `emerald-*`, `amber-*`, `red-*` et `rose-*` disparaissent.

Les pastilles (`Etiquette forme="pastille"`) sont en `text-micro font-semibold`, sans
capitales : les capitales espacées sont réservées au sur-titre.

### Largeurs de zone de travail — deux gabarits

| Gabarit | Largeur | Pour |
| :--- | :--- | :--- |
| Liste | `max-w-6xl` | tableaux, grilles, calendrier, éditeur de contenu |
| Travail | `max-w-3xl` | formulaires, réglages, confirmations, aperçu à une colonne |

L'éditeur de contenu est en « liste » : ses onglets Copie et Slides affichent deux
colonnes côte à côte, et à 768 px la colonne de droite passerait sous sa largeur
minimale.

Toujours avec `mx-auto`. `max-w-xs`, `sm`, `md`, `lg`, `2xl`, `4xl`, `5xl`, `64`
disparaissent.

## Comment procéder

1. **Déclarer avant de migrer.** `text-micro` et les trois tokens de sens dans
   `@theme`, et un module `apps/manager/components/ui/` qui expose `Bouton`, `Carte`,
   `Champ`, `Etiquette`, `TitreSection` et les gabarits. Ces composants portent les
   classes ci-dessus **en un seul endroit** : c'est ce qui empêchera la dérive de
   recommencer. Aujourd'hui, une centaine de `<button>` répètent chacun leur style à la
   main.
2. **Migrer écran par écran, un commit par écran.** Ordre suggéré, du plus vu au moins
   vu : Contenus (listes et éditeur), Corpus, Réglages, Clients, Vidéos, Psychédéliques.
3. **Ne pas réécrire ce qui n'est pas visé.** Un composant dont seules les classes
   changent ne change pas de structure JSX, sauf si le composant partagé l'exige.

## Les contraintes du dépôt — NORMATIF

- **Tailwind v4.** Les tokens vivent dans `@theme`, dans `apps/manager/index.css`. Pas de
  `tailwind.config.js`.
- **Le thème sombre suit le système** (`@custom-variant dark (@media
  (prefers-color-scheme: dark))`). Toute classe claire doit avoir sa jumelle `dark:`, et
  les deux se vérifient — sauf les tokens de sens, qui changent de valeur d'eux-mêmes.
- **`npm test` et `npm run typecheck` avant chaque push.** `screens.test.tsx` monte tous
  les écrans : un composant à retour anticipé s'y monte **dans les deux états**.
- **Vérifier dans le navigateur tout écran modifié.** Le typecheck et le build ne voient
  pas un rendu.
- **`npm install`, `npm run build` et `npm run deploy` se lancent depuis la VM Ubuntu**,
  jamais depuis un agent (voir `CLAUDE.md`).
- **Commentaires en français, sur le pourquoi.** Un commentaire qui paraphrase la ligne
  suivante est du bruit.
- Une branche par phase. Aucune phase ne laisse l'application cassée.

## Les exceptions établies — NORMATIF

Une exception n'est légitime que si elle est **écrite ici**. Celles-ci ont été arbitrées
pendant le chantier (septembre 2026) ; toute autre valeur hors échelle est un bug.

| Où | Ce qui reste | Pourquoi |
| :--- | :--- | :--- |
| `components/Layout/` (barre latérale, sous-onglets mobiles) | ses tailles et graisses propres | la navigation est hors périmètre depuis le départ |
| `components/ui/` | les anciennes valeurs, **dans les commentaires** | c'est là qu'on explique ce que le socle remplace |
| fenêtres modales (`CommonModals`, `AnalysisModal`, `ConfirmSuppressionSerie`, la fenêtre IA de `SubtitleConverter`), `LoginPage`, `Feedback` | `max-w-sm`, `max-w-md`, `max-w-lg`, `max-w-64` | la taille d'une fenêtre ou d'une notification n'est pas une zone de travail |
| `ContentEditor/renderers/` (`BodyRenderer`, `ScriptVideoRenderer`, `shared.tsx`) | liserés et couleurs de blocs, profondeurs, « Illustrée » | un codage de lecture, ni un sens ni une couleur d'outil |
| `PsychedelicsCalculator` | la couleur de chaque substance et ses encadrés | de l'identification |
| `RichTextarea` | `text-base`, `text-xl`, `text-2xl` des titres rendus | c'est le contenu mis en forme, pas l'interface |

## Comment on saura que c'est fini

Ces commandes, lancées à la racine, doivent rendre **zéro ligne**. Les exclusions
correspondent exactement au tableau ci-dessus — en ajouter une sans l'y écrire, c'est
tricher avec le garde-fou.

```
OPTS='-rhoE --include=*.tsx --exclude-dir=Layout --exclude-dir=ui --exclude-dir=test'
MODALES='--exclude=CommonModals.tsx --exclude=AnalysisModal.tsx --exclude=ConfirmSuppressionSerie.tsx --exclude=SubtitleConverter.tsx --exclude=LoginPage.tsx --exclude=Feedback.tsx'
LECTURE='--exclude-dir=renderers --exclude=PsychedelicsCalculator.tsx'

grep $OPTS "text-\[[0-9]+px\]" apps/manager | sort -u
grep $OPTS --exclude=RichTextarea.tsx "\btext-(base|xl|2xl|3xl)\b" apps/manager | sort -u
grep $OPTS "rounded-(sm|2xl|3xl)" apps/manager | sort -u
grep $OPTS $MODALES "max-w-(xs|sm|md|lg|2xl|4xl|5xl|64)\b" apps/manager | sort -u
grep $OPTS "border-brand-light|dark:border-dark-sec-bg" apps/manager | sort -u
grep $OPTS $LECTURE "\b(green|emerald|amber|red|rose)-[0-9]+" apps/manager | sort -u
grep $OPTS "font-medium" apps/manager | sort -u
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
