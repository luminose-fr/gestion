/**
 * Le catalogue des modèles, tenu par App et lu loin dans l'arbre.
 *
 * Les illustrations du Reel expliqué se génèrent cinq composants sous l'éditeur
 * (studio → montage → avant d'exporter → visuels). Y faire descendre le
 * catalogue de prop en prop aurait touché chacun d'eux pour une seule feuille :
 * App l'enregistre ici à chaque changement, la feuille le lit par un hook —
 * comme le registre des modèles d'Activite.
 */
import { useSyncExternalStore } from 'react';
import type { AIModel } from '../types';

export interface CatalogueImage {
  /** Les modèles d'image du catalogue (migration 0014), dans l'ordre du catalogue. */
  modeles: AIModel[];
  /** Celui qui illustre sans autre choix : le réglage de la famille Illustrer, sinon le premier. */
  defaut: string | null;
}

let etat: CatalogueImage = { modeles: [], defaut: null };
const abonnes = new Set<() => void>();

export const enregistrerCatalogue = (modeles: AIModel[], illustrer: string | null) => {
  const images = modeles.filter(m => m.sortie === 'image' && !m.deletedAt);
  const defaut = images.some(m => m.id === illustrer) ? illustrer : images[0]?.id ?? null;
  etat = { modeles: images, defaut };
  for (const abonne of abonnes) abonne();
};

const sAbonner = (abonne: () => void) => {
  abonnes.add(abonne);
  return () => { abonnes.delete(abonne); };
};

export const useCatalogueImage = (): CatalogueImage => useSyncExternalStore(sAbonner, () => etat, () => etat);

/** Les modèles qui écrivent : ceux que proposent les menus de texte. */
export const modelesDeTexte = (modeles: AIModel[]) => modeles.filter(m => m.sortie !== 'image');
