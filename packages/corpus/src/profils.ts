import type { Document, Profil, Statut } from './types.ts';

/**
 * Jamais composé. L'inbox a quitté `content/` pour D1 (migration 0005) : elle
 * n'est plus un document du corpus mais le seul store en écriture de la
 * console. L'exclusion reste, comme filet — un fichier `inbox.md` qui
 * réapparaîtrait ici ne doit jamais partir dans un contexte.
 */
const EXCLUS = ['inbox'];

/** Un statut qui interdit de proposer l'offre dans un contenu. */
export const NON_PROPOSABLE: Statut[] = ['suspendu', 'termine', 'candidat'];

export interface RegleProfil {
  titre: string;
  intention: string;
  /** blocs retenus, dans l'ordre de composition */
  blocs: string[];
  /** un document candidat entre-t-il ? */
  retient(doc: Document): boolean;
  /** plafond indicatif de caractères, ou null */
  plafond: number | null;
}

export const PROFILS: Record<Profil, RegleProfil> = {
  noyau: {
    titre: 'Contexte Luminose — noyau',
    intention:
      "L'essentiel qui doit être présent en permanence, y compris dans un champ d'instructions plafonné.",
    blocs: ['socle', 'voix'],
    retient: (d) => d.meta.noyau === true,
    plafond: 7500,
  },
  complet: {
    titre: 'Contexte Luminose',
    intention:
      "Tout ce qui est stable : identité, cadre, offres, voix, canaux, matière. Sans la stratégie.",
    blocs: ['socle', 'voix', 'canaux', 'repertoire', 'outils'],
    retient: (d) => d.meta.statut !== 'candidat',
    plafond: null,
  },
  strategie: {
    titre: 'Contexte Luminose — stratégie',
    intention:
      "Le complément stratégique : décisions datées, hypothèses, questions ouvertes. Ne doit jamais servir à rédiger un contenu.",
    blocs: ['strategie'],
    retient: () => true,
    plafond: null,
  },
};

/** Filtre et ordonne les documents pour un profil donné. */
export function selectionner(docs: Document[], profil: Profil): Document[] {
  const regle = PROFILS[profil];
  const retenus = docs.filter(
    (d) =>
      !EXCLUS.includes(d.chemin) &&
      regle.blocs.includes(d.bloc) &&
      regle.retient(d),
  );
  return retenus.sort((a, b) => {
    const ba = regle.blocs.indexOf(a.bloc);
    const bb = regle.blocs.indexOf(b.bloc);
    if (ba !== bb) return ba - bb;
    return a.chemin.localeCompare(b.chemin, 'fr');
  });
}
