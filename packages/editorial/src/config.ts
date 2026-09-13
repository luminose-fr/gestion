/**
 * Constantes éditoriales.
 *
 * Ce ne sont pas des réglages d'infrastructure : l'adresse du site apparaît
 * dans les CTA que le Rédacteur compose, et la slide de signature est du
 * contenu. Les sortir d'ici les éloignerait du texte qu'elles servent.
 */

/** Site public de Florent — inséré dans les CTA (voir objectives.ts). */
export const SITE_URL = "https://www.luminose.fr";

/**
 * Le nom et le titre, écrits UNE fois.
 *
 * `socle/identite.md` du corpus le dit ainsi : « C'est le titre, et il est
 * unique. » Il était pourtant recopié dans six personas et dans la slide de
 * signature — et une copie avait déjà dérivé : le Verrouilleur disait
 * « psychopraticien (Luminose) », sans « transpersonnel », c'est-à-dire sans le
 * mot qui porte le positionnement.
 *
 * Le corpus reste propriétaire du titre ; cette constante est sa copie unique
 * côté code, et c'est elle qu'on corrige le jour où le titre change.
 */
export const NOM = "Florent Jaouali";
export const TITRE = "psychopraticien transpersonnel";
export const IDENTITE = `${NOM}, ${TITRE}`;

/**
 * Slide ajoutée en fin de carrousel **par le code**, jamais générée par l'IA.
 * C'est ce qui garantit zéro dérive sur la signature.
 */
export const SIGNATURE_SLIDE = {
  titre: NOM,
  texte: `${TITRE.charAt(0).toUpperCase()}${TITRE.slice(1)}`,
};
