/**
 * Ce qui travaille en ce moment, et depuis combien de temps.
 *
 * Même raisonnement que `surEchecIA` (SPEC §3.5.1) : un témoin posé chez
 * l'appelant est un témoin qu'un appelant finira par oublier. Il se pose donc
 * aux points de passage — `aiService.generateContent` pour l'IA, le client HTTP
 * pour le reste — et l'écran s'y abonne une fois pour toutes.
 *
 * Le service ne connaît que des identifiants de modèles : c'est l'application
 * qui lui prête son catalogue, comme partout ailleurs dans le front.
 */

export interface Tache {
  id: number;
  /**
   * Un aller-retour avec un fournisseur d'IA, ou une requête ordinaire. Les
   * écrans s'en servent pour savoir QUEL bouton doit tourner : `isGenerating`
   * seul faisait tourner les quatre à la fois.
   */
  nature: 'ia' | 'reseau';
  /**
   * Ce qui se fait, en clair. Une chaîne vide reste anonyme : le filet de
   * progression s'allume, mais rien ne s'écrit — « PATCH /contents/… » n'apprend
   * rien à personne.
   */
  label: string;
  persona: string | null;
  modele: string | null;
  debut: number;
  /**
   * Durée attendue en millisecondes, tirée des appels comparables déjà mesurés.
   * `null` tant qu'on n'a pas de quoi la calculer : la barre balaie alors au
   * lieu de remplir, plutôt que d'inventer une échéance.
   */
  estimation: number | null;
  /** Progression RÉELLE (0 → 1), quand l'opération sait se compter. */
  part: number | null;
  /** Sous-titre mouvant — « Enregistrement (3/12) ». */
  etape: string | null;
}

export interface Descripteur {
  nature?: 'ia' | 'reseau';
  label?: string;
  persona?: string | null;
  modele?: string | null;
  /**
   * Sous quelle clé mesurer cette durée pour estimer les prochaines. Sans elle,
   * l'appel ne nourrit rien et n'hérite de rien.
   */
  cle?: string | null;
  part?: number | null;
  etape?: string | null;
}

export interface Poignee {
  avancer: (maj: { part?: number | null; etape?: string | null }) => void;
  /**
   * `reussi` à faux écarte la mesure : la durée d'un échec ne dit rien de celle
   * d'un succès — un refus d'authentification revient en 80 ms et ferait
   * ensuite filer la barre à 100 % sur un vrai appel.
   */
  fermer: (reussi?: boolean) => void;
}

// ── Mémoire des durées ───────────────────────────────────────────────────

const CLE_DUREES = 'luminose_durees';
/** Au-delà, une mesure ancienne parle d'un modèle qu'on n'utilise plus. */
const MESURES_GARDEES = 7;
/** Une mesure isolée n'est pas une habitude : on ne l'utilise pas pour estimer. */
const MESURES_MINIMUM = 2;

const lireDurees = (): Record<string, number[]> => {
  try {
    const brut = localStorage.getItem(CLE_DUREES);
    if (!brut) return {};
    const lu = JSON.parse(brut);
    return lu && typeof lu === 'object' ? lu : {};
  } catch {
    return {};
  }
};

const memoriser = (cle: string, duree: number) => {
  // Une seconde de plancher et dix minutes de plafond : sous la première, on
  // mesure le cache du navigateur ; au-dessus du second, un onglet en veille.
  if (duree < 200 || duree > 600_000) return;
  try {
    const durees = lireDurees();
    const suite = [...(durees[cle] ?? []), duree].slice(-MESURES_GARDEES);
    localStorage.setItem(CLE_DUREES, JSON.stringify({ ...durees, [cle]: suite }));
  } catch {
    /* localStorage indisponible : on perd l'estimation, pas l'affichage */
  }
};

const mediane = (valeurs: number[]): number => {
  const triees = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(triees.length / 2);
  return triees.length % 2 === 0
    ? (triees[milieu - 1] + triees[milieu]) / 2
    : triees[milieu];
};

/** La durée attendue pour cette clé, ou `null` faute de mesures suffisantes. */
export const estimationPour = (cle: string): number | null => {
  const mesures = lireDurees()[cle];
  if (!Array.isArray(mesures) || mesures.length < MESURES_MINIMUM) return null;
  return mediane(mesures);
};

// ── Le registre ──────────────────────────────────────────────────────────

let compteur = 0;
let taches: Tache[] = [];
const temoins = new Set<(taches: Tache[]) => void>();

const diffuser = () => {
  const instantane = taches;
  // Un abonné qui jette ne doit pas empêcher les autres d'être prévenus.
  for (const temoin of temoins) {
    try { temoin(instantane); } catch { /* un abonné défaillant ne masque rien */ }
  }
};

/** Ouvre un témoin. À fermer dans un `finally`, sans quoi il tourne pour toujours. */
export const ouvrir = (descripteur: Descripteur): Poignee => {
  const id = ++compteur;
  const cle = descripteur.cle ?? null;
  const tache: Tache = {
    id,
    nature: descripteur.nature ?? 'reseau',
    label: descripteur.label ?? '',
    persona: descripteur.persona ?? null,
    modele: descripteur.modele ?? null,
    debut: Date.now(),
    estimation: cle ? estimationPour(cle) : null,
    part: descripteur.part ?? null,
    etape: descripteur.etape ?? null,
  };
  taches = [...taches, tache];
  diffuser();

  let fermee = false;

  return {
    avancer: (maj) => {
      if (fermee) return;
      taches = taches.map(t => t.id === id ? {
        ...t,
        part:  maj.part  === undefined ? t.part  : maj.part,
        etape: maj.etape === undefined ? t.etape : maj.etape,
      } : t);
      diffuser();
    },
    fermer: (reussi = true) => {
      // Un `finally` qui rejoue ne doit ni fausser la mesure ni retirer deux fois.
      if (fermee) return;
      fermee = true;
      if (cle && reussi) memoriser(cle, Date.now() - tache.debut);
      taches = taches.filter(t => t.id !== id);
      diffuser();
    },
  };
};

/** Enveloppe une promesse : le témoin s'ouvre et se ferme tout seul. */
export const suivre = async <T>(descripteur: Descripteur, travail: () => Promise<T>): Promise<T> => {
  const tache = ouvrir(descripteur);
  try {
    const resultat = await travail();
    tache.fermer(true);
    return resultat;
  } catch (e) {
    tache.fermer(false);
    throw e;
  }
};

export const surTaches = (temoin: (taches: Tache[]) => void): (() => void) => {
  temoins.add(temoin);
  return () => { temoins.delete(temoin); };
};

export const tachesEnCours = (): Tache[] => taches;

// ── Nommer les modèles ───────────────────────────────────────────────────

let nomsDeModeles: Record<string, string> = {};

/**
 * L'application prête son catalogue. Sans lui, le bandeau afficherait un
 * identifiant de base — et savoir « il se passe quelque chose » ne répond pas à
 * la question posée quand on doute de son choix de fournisseur (SPEC §3.5.1).
 */
export const enregistrerModeles = (modeles: Array<{ id: string; name?: string | null }>) => {
  nomsDeModeles = Object.fromEntries(modeles.map(m => [m.id, m.name || m.id]));
};

export const nomDuModele = (id: string | null | undefined): string | null =>
  id ? (nomsDeModeles[id] ?? id) : null;

// ── Ce que la barre montre ───────────────────────────────────────────────

/**
 * La part à afficher, entre 0 et 1 — ou `null` quand on ne sait rien et que la
 * barre doit balayer.
 *
 * Une barre qui atteint 100 % avant la réponse est un mensonge qu'on ne peut
 * plus rattraper : celle-ci s'en approche sans jamais y arriver. À l'échéance
 * attendue elle est à 80 %, puis elle continue de monter de plus en plus
 * lentement — ce qui reste vrai même quand le fournisseur met le triple.
 */
export const partEstimee = (tache: Tache, maintenant: number): number | null => {
  if (tache.part !== null) return Math.min(1, Math.max(0, tache.part));
  if (!tache.estimation) return null;
  const ecoule = Math.max(0, maintenant - tache.debut);
  return 1 - Math.exp(-1.61 * (ecoule / tache.estimation));
};

/**
 * Vrai quand l'appel dépasse nettement ce qu'il met d'habitude. C'est le seul
 * moment où l'écran peut distinguer « ça travaille » de « c'est bloqué », et
 * c'est ce que Florent regarde avant de décider s'il relance.
 */
export const traineEnLongueur = (tache: Tache, maintenant: number): boolean =>
  tache.estimation !== null && maintenant - tache.debut > tache.estimation * 2.5;
