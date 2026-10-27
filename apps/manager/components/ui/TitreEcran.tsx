/**
 * Le titre d'un écran et celui d'un contenu ouvert, en Abril Display italique
 * (SPEC §13). Le titre éditorial relève de l'identité, pas de l'échelle
 * typographique de l'interface (DESIGN.md) : ses deux tailles vivent ici, et
 * nulle part ailleurs.
 */
import React from 'react';

const TAILLES = {
  /** Le bandeau d'une liste : 22/28. */
  ecran: 'text-[22px] leading-7',
  /** Le bandeau d'un contenu ouvert : 20/26, à côté du sélecteur d'étape. */
  contenu: 'text-[20px] leading-[26px]',
} as const;

/**
 * Les classes du titre, pour un titre qu'on écrit en place (un `<input>`) : la
 * taille ne s'écrit qu'ici.
 */
export const CLASSES_TITRE_ECRAN = (taille: keyof typeof TAILLES = 'ecran') =>
  `font-display italic font-normal text-brand-hover dark:text-white ${TAILLES[taille]}`;

export interface TitreEcranProps extends React.HTMLAttributes<HTMLHeadingElement> {
  taille?: keyof typeof TAILLES;
  as?: 'h1' | 'h2' | 'p';
}

export const TitreEcran: React.FC<TitreEcranProps> = ({ taille = 'ecran', as: Balise = 'h1', className = '', ...reste }) => (
  <Balise
    className={`font-display italic font-normal truncate text-brand-hover dark:text-white ${TAILLES[taille]} ${className}`}
    {...reste}
  />
);

export default TitreEcran;
