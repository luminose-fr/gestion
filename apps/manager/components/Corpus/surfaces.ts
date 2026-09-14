/**
 * Les surfaces qui portent un contexte Luminose, et ce qu'on y dépose.
 *
 * Le profil est un DÉFAUT, pas une contrainte : c'est celui qui est proposé au
 * clic, et la pose enregistre celui qui a réellement été déposé. Une surface
 * peut donc porter autre chose sans que l'écran mente.
 *
 * ── POURQUOI UN GPT ET UN GEM COMPTENT CHACUN POUR DEUX LIGNES ────────────
 *
 * Les deux ont un champ d'instructions plafonné ET un espace de fichiers de
 * connaissance. Le contexte complet ne tient pas dans le premier : le 14/09,
 * un collage du profil `complet` (35 000 caractères) dans les instructions
 * d'un Gem n'est simplement pas entré.
 *
 * Le montage qui marche a donc deux morceaux, et **ils se périment
 * séparément** : on peut recoller le noyau et oublier le fichier, ou l'inverse.
 * Une ligne par morceau est la seule façon de le voir. C'est le modèle qui
 * existait déjà — une surface, un profil, un hash posé — appliqué à ce qui est
 * réellement deux dépôts.
 */
export interface DefinitionSurface {
  id: string;
  nom: string;
  profil: string;
  /**
   * Ce qu'on fait du texte : le mettre au presse-papier, ou en télécharger un
   * fichier. Un espace de connaissance ne se colle pas — il s'alimente en
   * fichiers.
   *
   * Le champ s'appelle `geste` et non `action` : dans ce dépôt, « action »
   * désigne une action IA du catalogue, et un test parcourt les sources pour
   * vérifier que tout libellé d'appel IA y figure. Il lit du texte, pas du
   * code.
   */
  geste: 'copier' | 'telecharger';
  /** Pourquoi ce profil-là, et ce qu'il faut savoir de cette surface. */
  note: string;
  /** Cette surface se met à jour toute seule — rien à redéposer. */
  automatique?: boolean;
}

/**
 * L'extension du fichier de connaissance : **`.txt`, et pas `.md`**.
 *
 * Google publie la liste des types acceptés en fichier de Gem — TXT, DOC,
 * DOCX, PDF, RTF, DOT, DOTX, HWP, HWPX, Google Docs — et le markdown n'y est
 * pas. Le contenu reste du markdown, qu'un modèle lit parfaitement ; c'est
 * l'extension qui décide si le sélecteur de fichiers l'accepte.
 *
 * Vérifié le 14/09/2026 sur l'annonce Workspace « Upload Google Docs and other
 * file types to Gems ». À reconfirmer si un import est refusé.
 */
export const EXTENSION_CONNAISSANCE = 'txt';

export const SURFACES: DefinitionSurface[] = [
  {
    id: 'projet-claude',
    nom: 'Projet Claude « Luminose »',
    profil: 'complet',
    geste: 'copier',
    note: 'Se synchronise depuis GitHub — rien à redéposer, à condition que packages/corpus soit dans les filtres.',
    automatique: true,
  },
  {
    id: 'gpt',
    nom: 'GPT personnalisé — instructions',
    profil: 'noyau',
    geste: 'copier',
    note: "Le champ d'instructions plafonne à 8 000 caractères : c'est le noyau qui va là, et lui seul. À coller dans « Instructions ».",
  },
  {
    id: 'gpt-fichier',
    nom: 'GPT personnalisé — fichier de connaissance',
    profil: 'complet',
    geste: 'telecharger',
    note: "Le contexte complet, en fichier, dans « Knowledge ». Il complète les instructions, il ne les remplace pas : un fichier de connaissance est consulté, les instructions sont toujours présentes.",
  },
  {
    id: 'gem',
    nom: 'Gem Gemini — instructions',
    profil: 'noyau',
    geste: 'copier',
    note: "À coller dans le champ d'instructions du Gem. Le profil complet n'y entre pas — c'est ce qui a échoué le 14/09.",
  },
  {
    id: 'gem-fichier',
    nom: 'Gem Gemini — fichier de connaissance',
    profil: 'complet',
    geste: 'telecharger',
    note: "À importer dans « Knowledge » (10 fichiers maximum, 100 Mo chacun). Un fichier importé ne se met PAS à jour tout seul : à chaque changement du corpus, il faut le retélécharger et remplacer l'ancien.",
  },
  {
    id: 'claude-code',
    nom: 'Claude Code',
    profil: 'complet',
    geste: 'copier',
    note: 'Lit le dépôt directement — rien à déposer.',
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
    geste: 'copier',
    note: "Une feuille par action, composée et préfixée au prompt par le Worker à chaque appel. Le Lecteur froid, lui, ne reçoit rien — et c'est une décision.",
    automatique: true,
  },
];
