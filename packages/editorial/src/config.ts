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
 * Slide ajoutée en fin de carrousel **par le code**, jamais générée par l'IA.
 * C'est ce qui garantit zéro dérive sur la signature.
 */
export const SIGNATURE_SLIDE = {
  titre: "Florent Jaouali",
  texte: "Psychopraticien transpersonnel",
};
