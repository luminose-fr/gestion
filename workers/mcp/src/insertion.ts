/**
 * L'insertion de mot-clé de Google — `{KeyWord:texte par défaut}` — lue,
 * comptée et rendue comme Google le fait (aide Google Ads, « Set up keyword
 * insertion for your ad text », relue le 04/10/2026). Aucune dépendance.
 *
 * Pourquoi le serveur s'en mêle : le filtre déontologique (regles.ts) porte
 * sur le texte écrit. Avec l'insertion, c'est le MOT-CLÉ qui écrit le titre —
 * « hypnose qui guérit » en mot-clé du groupe ferait d'un titre sage une
 * promesse de guérison. Chaque rendu possible passe donc au filtre.
 */

/** Les limites d'une annonce responsive du Search, comptées sur ce qui s'affiche. */
export const LIMITES_ANNONCE = { titre: 30, description: 90, chemin: 15 } as const;

/** Les cinq casses que Google admet. Une autre (« KEYWORD », « keyWord ») est refusée, pas devinée. */
export const CASSES = ['keyword', 'Keyword', 'KeyWord', 'KEYWord', 'KeyWORD'] as const;
export type Casse = (typeof CASSES)[number];

type Segment = string | { casse: Casse; defaut: string };

export type Analyse = { segments: Segment[]; erreurs: string[] };

/** Longueur comme Google la compte : en caractères, pas en octets ni en unités UTF-16. */
export const longueur = (texte: string): number => [...texte].length;

/**
 * Découpe un texte en morceaux fixes et insertions. Toute accolade doit
 * appartenir à une insertion bien formée : les autres syntaxes de Google
 * (compte à rebours, personnalisateurs, lieu) ne sont pas admises ici.
 */
export const analyser = (texte: string): Analyse => {
  const segments: Segment[] = [];
  const erreurs: string[] = [];
  let reste = texte;
  while (reste.length > 0) {
    const ouvre = reste.indexOf('{');
    const ferme = reste.indexOf('}');
    if (ouvre < 0) {
      if (ferme >= 0) erreurs.push(`« ${texte} » : accolade fermante sans ouvrante.`);
      segments.push(reste);
      break;
    }
    if (ferme >= 0 && ferme < ouvre) { erreurs.push(`« ${texte} » : accolade fermante sans ouvrante.`); break; }
    if (ouvre > 0) segments.push(reste.slice(0, ouvre));
    const fin = reste.indexOf('}', ouvre);
    if (fin < 0) { erreurs.push(`« ${texte} » : accolade ouvrante sans fermante.`); break; }
    const interieur = reste.slice(ouvre + 1, fin);
    const deuxPoints = interieur.indexOf(':');
    const casse = deuxPoints < 0 ? interieur : interieur.slice(0, deuxPoints);
    const defaut = deuxPoints < 0 ? '' : interieur.slice(deuxPoints + 1);
    if (interieur.includes('{')) {
      erreurs.push(`« ${texte} » : accolades imbriquées.`);
    } else if (!(CASSES as readonly string[]).includes(casse)) {
      erreurs.push(casse.toLowerCase() === 'keyword'
        ? `« {${interieur}} » : la casse « ${casse} » n'est pas admise par Google — ${CASSES.join(', ')}.`
        : `« {${interieur}} » : seule l'insertion de mot-clé est admise ({KeyWord:texte par défaut}).`);
    } else if (!defaut.trim()) {
      erreurs.push(`« {${interieur}} » : il faut un texte par défaut — c'est lui qui s'affiche quand le mot-clé ne tient pas.`);
    } else {
      segments.push({ casse: casse as Casse, defaut });
    }
    reste = reste.slice(fin + 1);
  }
  return { segments, erreurs };
};

export const aInsertion = (a: Analyse): boolean => a.segments.some((s) => typeof s !== 'string');

/** Le texte quand aucun mot-clé ne s'insère — c'est sur lui que Google compte la longueur. */
export const texteParDefaut = (a: Analyse): string => a.segments.map((s) => (typeof s === 'string' ? s : s.defaut)).join('');

const majuscule = (mot: string) => mot.charAt(0).toLocaleUpperCase('fr') + mot.slice(1).toLocaleLowerCase('fr');

/** La casse de Google appliquée au mot-clé : mot par mot, le premier et les suivants. */
export const appliquerCasse = (motCle: string, casse: Casse): string => {
  const mots = motCle.trim().split(/\s+/);
  const regle: Record<Casse, (mot: string, i: number) => string> = {
    keyword: (m) => m.toLocaleLowerCase('fr'),
    Keyword: (m, i) => (i === 0 ? majuscule(m) : m.toLocaleLowerCase('fr')),
    KeyWord: (m) => majuscule(m),
    KEYWord: (m, i) => (i === 0 ? m.toLocaleUpperCase('fr') : majuscule(m)),
    KeyWORD: (m, i) => (i === 0 ? majuscule(m) : m.toLocaleUpperCase('fr')),
  };
  return mots.map((m, i) => regle[casse](m, i)).join(' ');
};

/**
 * Ce que Google afficherait pour ce mot-clé : le texte rendu s'il tient dans
 * la limite, sinon le texte par défaut (`replie`).
 */
export const rendre = (a: Analyse, motCle: string, limite: number): { texte: string; replie: boolean } => {
  const rendu = a.segments.map((s) => (typeof s === 'string' ? s : appliquerCasse(motCle, s.casse))).join('');
  return longueur(rendu) <= limite ? { texte: rendu, replie: false } : { texte: texteParDefaut(a), replie: true };
};
