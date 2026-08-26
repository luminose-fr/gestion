/** Un fichier du corpus, tel que le composeur le voit. */
export interface Document {
  /** chemin relatif à content/, sans extension — ex. "socle/offres/le-seuil" */
  chemin: string;
  /** le bloc de premier niveau — socle | voix | strategie | canaux | repertoire | outils */
  bloc: string;
  meta: Meta;
  /** le markdown, frontmatter retiré */
  corps: string;
}

export interface Meta {
  type?: 'fact' | 'decision' | 'instruction';
  statut?: Statut;
  depuis?: string;
  revu?: string;
  review_at?: string;
  supersedes?: string;
  expose?: 'public' | 'prive';
  /** ce document entre dans le profil « noyau » */
  noyau?: boolean;
  /** offres uniquement — alimente le tableau de synthèse */
  offre?: string;
  prix?: string;
  [k: string]: unknown;
}

export type Statut =
  | 'actif'
  | 'active'
  | 'suspendu'
  | 'termine'
  | 'candidat'
  | 'volontairement-absent';

export type Profil = 'noyau' | 'complet' | 'strategie';

export interface Contexte {
  profil: Profil;
  texte: string;
  hash: string;
  /** nombre de caractères — utile pour les champs d'instructions plafonnés */
  taille: number;
  /** chemins retenus, dans l'ordre de composition */
  documents: string[];
}

/**
 * Ce qu'un rôle du flux éditorial reçoit du corpus.
 *
 * Un texte vide et un hash vide signifient « ce rôle ne reçoit rien », et
 * c'est un état légitime : le Lecteur froid et l'Artiste sont dans ce cas
 * par décision, pas par accident.
 */
export interface Feuille {
  texte: string;
  hash: string;
  taille: number;
  documents: string[];
}
