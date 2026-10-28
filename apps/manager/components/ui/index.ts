/**
 * Le socle visuel de l'interface de gestion.
 *
 * Les échelles — typo, espacements, rayons, ombres, largeurs — ne s'écrivent
 * plus dans les écrans : elles s'écrivent ici. Une valeur hors échelle est un
 * bug, et ce module est le seul endroit où la corriger.
 */
export { Bouton } from './Bouton';
export type { BoutonProps, TailleBouton, IntentionBouton, TonBouton } from './Bouton';

export { Carte } from './Carte';
export type { CarteProps, DensiteCarte } from './Carte';

export { Champ, CLASSES_CHAMP } from './Champ';
export type { ChampProps } from './Champ';

export { Etiquette, CLASSES_SURTITRE } from './Etiquette';
export type { EtiquetteProps, FormeEtiquette, TonEtiquette } from './Etiquette';

export { TitreSection, CLASSES_TITRE } from './TitreSection';
export type { TitreSectionProps } from './TitreSection';

export { GOUTTIERE, GABARITS, ecran } from './gabarits';
export type { Gabarit } from './gabarits';

export { ControleSegmente } from './ControleSegmente';
export type { ControleSegmenteProps, OptionSegment } from './ControleSegmente';

export { BarreProgression } from './BarreProgression';
export type { BarreProgressionProps, EtatSegment } from './BarreProgression';

export { Menu } from './Menu';
export type { MenuProps, EntreeMenu } from './Menu';

export { TitreEcran, CLASSES_TITRE_ECRAN } from './TitreEcran';
export type { TitreEcranProps } from './TitreEcran';

export { Markdown, Tableau } from './Markdown';
export type { VarianteMarkdown } from './Markdown';
