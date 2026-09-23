/**
 * L'étiquette : sur-titre en capitales, pastille, mention.
 *
 * `text-[9px]`, `[10px]` et `[11px]` se partageaient 227 occurrences pour dire
 * la même chose. Une seule taille désormais, `text-micro`.
 *
 * Deux rôles de sur-titre, pas un. L'audit de la phase 8 en a trouvé des dizaines
 * écrits à la main, en quinze variantes : de `/40` à pleine opacité, trois interlettrages,
 * parfois sans graisse, parfois en `text-xs`. Sous ce désordre, deux usages
 * reviennent, et c'est l'endroit où le sur-titre se trouve qui les sépare :
 *
 * - `entete` nomme **la carte ou l'encadré où il se trouve** : bandeau d'en-tête
 *   (« Script », « Copie »), première ligne d'un encadré (« Lecteur froid »,
 *   « Le piège »). Il tient lieu de titre ; il est plein, parce qu'un `/50` sur
 *   le fond `brand-light` d'un bandeau ne se lit plus.
 * - `surtitre` nomme **ce qui suit** : un champ, une colonne, un groupe de
 *   cartes, une métadonnée. Il s'efface devant le contenu : `/60`.
 */
import React from 'react';

export type FormeEtiquette = 'surtitre' | 'entete' | 'pastille';
/**
 * Le sens d'une pastille ou d'un sur-titre. `succes`, `alerte` et `erreur`
 * passent par les tokens de `@theme` — plus de `green-*`, `emerald-*`,
 * `amber-*` ni `red-*` écrits à la main. Le token change de valeur en sombre :
 * aucune classe `dark:`.
 */
export type TonEtiquette = 'neutre' | 'succes' | 'alerte' | 'erreur';

const CAPITALES = 'text-micro font-bold uppercase tracking-wider';

const COULEUR_ROLE: Record<'surtitre' | 'entete', string> = {
  surtitre: 'text-brand-main/60 dark:text-dark-text/50',
  entete: 'text-brand-main dark:text-dark-text',
};

const COULEUR_SENS: Record<Exclude<TonEtiquette, 'neutre'>, string> = {
  succes: 'text-succes',
  alerte: 'text-alerte',
  erreur: 'text-erreur',
};

/**
 * Le sur-titre discret sans sa disposition, pour les en-têtes de tableau : un
 * `<th>` ou un `<tr>` ne peut pas devenir une `Etiquette`, et un `block` y
 * casserait la table.
 */
export const CLASSES_SURTITRE = `${CAPITALES} ${COULEUR_ROLE.surtitre}`;

/*
  Les capitales sont aux sur-titres seuls. Une pastille porte un verdict, un
  format, une plateforme — des mots qu'on lit, parfois longs (« Script vidéo
  YouTube ») : en capitales espacées, ils déborderaient des colonnes.
*/
const PASTILLE =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-micro font-semibold [&_svg]:size-3 [&_svg]:shrink-0';

const TONS_PASTILLE: Record<TonEtiquette, string> = {
  neutre: 'bg-brand-main/10 text-brand-main dark:bg-white/15 dark:text-white',
  succes: 'bg-succes/10 text-succes',
  alerte: 'bg-alerte/10 text-alerte',
  erreur: 'bg-erreur/10 text-erreur',
};

/*
  La disposition est une prop, pas une classe à ajouter : `block` et `flex` sur
  le même élément se départagent dans l'ordre de la feuille générée, pas dans
  celui de l'attribut. L'icône prend la taille de l'étiquette, comme dans
  `Bouton` : la sienne (`w-3`, `w-2.5`) est ignorée.
*/
const EN_LIGNE = 'flex items-center gap-1.5 [&_svg]:size-3 [&_svg]:shrink-0';

export interface EtiquetteProps extends React.HTMLAttributes<HTMLElement> {
  forme?: FormeEtiquette;
  ton?: TonEtiquette;
  /** Sur-titre précédé d'une icône. Sans effet sur la pastille, déjà en ligne. */
  avecIcone?: boolean;
  /** `label` quand l'étiquette nomme un champ, `span` dans un flux de texte. */
  as?: 'p' | 'span' | 'div' | 'label' | 'h2' | 'h3';
  htmlFor?: string;
}

export const Etiquette: React.FC<EtiquetteProps> = ({
  forme = 'surtitre',
  ton = 'neutre',
  avecIcone = false,
  as = 'p',
  className = '',
  ...reste
}) => {
  const classes =
    forme === 'pastille'
      ? `${PASTILLE} ${TONS_PASTILLE[ton]}`
      : [
          avecIcone ? EN_LIGNE : 'block',
          CAPITALES,
          ton === 'neutre' ? COULEUR_ROLE[forme] : COULEUR_SENS[ton],
        ].join(' ');
  return React.createElement(as, {
    className: [classes, className].filter(Boolean).join(' '),
    ...reste,
  });
};

export default Etiquette;
