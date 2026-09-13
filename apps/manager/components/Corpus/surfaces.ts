/**
 * Les surfaces qui portent un contexte Luminose, et le profil qu'on y colle.
 *
 * Le profil est un DÉFAUT, pas une contrainte : c'est celui qui est proposé au
 * clic, et la pose enregistre celui qui a réellement été collé. Une surface
 * peut donc porter autre chose sans que l'écran mente.
 */
export interface DefinitionSurface {
  id: string;
  nom: string;
  profil: string;
  /** Pourquoi ce profil-là, et ce qu'il faut savoir de cette surface. */
  note: string;
  /** Cette surface se met à jour toute seule — rien à recoller. */
  automatique?: boolean;
}

export const SURFACES: DefinitionSurface[] = [
  {
    id: 'projet-claude',
    nom: 'Projet Claude « Luminose »',
    profil: 'complet',
    note: 'Se synchronise depuis GitHub — rien à recoller, à condition que packages/corpus soit dans les filtres.',
    automatique: true,
  },
  {
    id: 'gpt',
    nom: 'GPT personnalisé',
    profil: 'noyau',
    note: "Le champ d'instructions plafonne à 8 000 caractères : c'est le noyau qui va là. Le profil complet peut l'accompagner en fichier de connaissance.",
  },
  {
    id: 'gem',
    nom: 'Gem Gemini',
    profil: 'complet',
    note: 'Pas de synchronisation possible : recollage à la main.',
  },
  {
    id: 'claude-code',
    nom: 'Claude Code',
    profil: 'complet',
    note: 'Lit le dépôt directement — rien à coller.',
    automatique: true,
  },
  {
    id: 'api',
    /**
     * PAS UN PROFIL. Cette surface ne reçoit ni `noyau`, ni `complet` : le
     * Worker compose une **feuille de salle** propre à l'action appelée
     * (`FEUILLE_PAR_ACTION`, dans `packages/editorial`) et la préfixe au
     * prompt. Il n'y a donc pas un hash à comparer mais neuf, et la colonne
     * « Courante » reste vide à dessein — afficher `noyau` ici, comme ce
     * fichier l'a longtemps fait, annonçait un contexte qui n'est jamais parti.
     */
    nom: 'Appels API (OpenRouter, 1min.ai)',
    profil: 'feuille de salle',
    note: "Une feuille par action, composée et préfixée au prompt par le Worker à chaque appel. Le Lecteur froid, lui, ne reçoit rien — et c'est une décision.",
    automatique: true,
  },
];
