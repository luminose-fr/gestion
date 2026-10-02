/**
 * Les règles de contenu que le serveur applique à ce qu'il crée — mécanique,
 * pas jugement (cadrages du 01/10 et du 02/10/2026).
 *
 * LA RÈGLE ET SON MOTIF FONT FOI DANS LE CORPUS, pas ici :
 *   - packages/corpus/content/socle/cadre-deontologique.md — « Aucune promesse de
 *     guérison, explicite ou suggérée », et le questionnaire de santé obligatoire
 *     avant tout breathwork. Ce fichier gagne tous les arbitrages.
 *   - packages/corpus/content/socle/identite.md — l'hypnose est un outil, pas un
 *     titre.
 *   - packages/corpus/content/socle/offres/ — le statut de chaque offre.
 * Ce module n'en garde que les formes les plus directes, pour qu'un texte qui
 * les contient ne parte pas. LE FILTRE EST UN PLANCHER, PAS UNE RELECTURE :
 * « Retrouvez la paix intérieure en trois séances » passe, et reste une
 * promesse. La relecture de Florent avant activation est le vrai contrôle — et
 * c'est la pause forcée qui la rend obligatoire.
 */

/** La marque de ce que Claude a créé (cadrage du 02/10/2026, R2). Florent la retire en validant. */
export const MARQUE = '[Claude]';
const PREFIXE = `${MARQUE} `;

/** « [Claude] nom », une fois, quoi que le modèle ait déjà mis. */
export const marquer = (nom: string): string =>
  PREFIXE + nom.replace(/^\s*(\[claude\]\s*)+/i, '').trim();

/** Minuscules, sans accents, espaces simples : « Guérir » et « guerir » se valent. */
const normaliser = (texte: string): string =>
  texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s  ]+/g, ' ');

type Regle = { motif: RegExp; terme: string };

/** V4 — refus. Une ligne par terme ; la liste se relit ici. */
const REFUS: Regle[] = [
  { motif: /\bgueri/, terme: 'guéri… (guérir, guérison)' },
  { motif: /\bsoign/, terme: 'soign… (soigner, soignant)' },
  { motif: /\bgaranti/, terme: 'garanti…' },
  { motif: /100 ?%/, terme: '100 %' },
  { motif: /\bdefinitivement\b/, terme: 'définitivement' },
  { motif: /\bdiagnosti(c|qu)/, terme: 'diagnostic' },
  { motif: /\btraitements? medic/, terme: 'traitement médical' },
];

/** V4 — refus par combinaison, sur l'ensemble des textes d'une même annonce : elles s'affichent ensemble. */
const REFUS_COMBINES: { tous: RegExp[]; terme: string }[] = [
  { tous: [/\bremplac/, /\b(medecin|traitement)/], terme: 'remplace + médecin ou traitement' },
];

/** V4 — avertissements : l'appel passe, l'aperçu le dit. */
const AVERTISSEMENTS: Regle[] = [
  { motif: /\bhypnotherapeute/, terme: "« hypnothérapeute » : l'hypnose est un outil, pas un titre (socle/identite.md)" },
  { motif: /\ble seuil\b/, terme: '« Le Seuil » : offre suspendue (socle/offres/le-seuil.md)' },
  { motif: /\batelier/, terme: '« atelier » : offre terminée (socle/offres/ateliers.md)' },
];

const BREATHWORK = /\b(breathwork|respiration holotropique)/;
const QUESTIONNAIRE = /\bquestionnaire/;

export type Examen = { refus: string[]; avertissements: string[] };

/**
 * Les textes d'UNE annonce (titres, descriptions, chemins). Pas les mots-clés :
 * enchérir sur ce que les gens tapent n'est pas une promesse, ce que l'annonce
 * leur répond en est une.
 */
export const examinerAnnonce = (textes: string[]): Examen => {
  const normaux = textes.map(normaliser);
  const tout = normaux.join(' | ');
  const refus: string[] = [];
  for (const { motif, terme } of REFUS) {
    const fautif = textes.find((_, i) => motif.test(normaux[i]));
    if (fautif !== undefined) refus.push(`${terme} — dans « ${fautif} »`);
  }
  for (const { tous, terme } of REFUS_COMBINES) {
    if (tous.every((m) => m.test(tout))) refus.push(terme);
  }
  const avertissements = AVERTISSEMENTS.filter(({ motif }) => motif.test(tout)).map(({ terme }) => terme);
  if (BREATHWORK.test(tout) && !QUESTIONNAIRE.test(tout)) {
    avertissements.push('breathwork sans mention du questionnaire de santé préalable (socle/cadre-deontologique.md)');
  }
  return { refus, avertissements };
};

/**
 * V6 — une URL finale sur luminose.fr, et rien d'autre : ni sous-domaine
 * (`passage.luminose.fr` mène à une offre suspendue, `reliance.luminose.fr` est
 * en veille), ni http, ni port, ni identifiants.
 */
export const urlAdmise = (brute: string): boolean => {
  let u: URL;
  try { u = new URL(brute); } catch { return false; }
  return u.protocol === 'https:' && (u.hostname === 'luminose.fr' || u.hostname === 'www.luminose.fr') &&
    !u.port && !u.username && !u.password && brute.startsWith(`https://${u.hostname}/`);
};
