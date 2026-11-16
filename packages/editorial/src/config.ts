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
 * Le lieu du cabinet, tel que les CTA et la signature d'une vidéo le disent.
 * `socle/identite.md` en est propriétaire.
 */
export const LIEU = "Villefranche-de-Lauragais";

/**
 * Le nom exact du breathwork, que `socle/parcours-formations.md` fixe : « La forme
 * exacte compte — c'est une pratique sous marque. »
 *
 * Il compte aussi pour les moteurs de réponse (ChatGPT, Perplexity, les AI
 * Overviews de Google) : ils rapprochent les contenus par les noms. Trois façons
 * de nommer la pratique d'un article à l'autre, c'est trois pratiques — et
 * aucune assez présente pour qu'on l'associe à Florent.
 */
export const BREATHWORK = "Grof® Breathwork (respiration holotropique)";

/**
 * La ligne qui signe la description d'une vidéo YouTube, ajoutée par le code et
 * jamais par le modèle — même raison que l'adresse des posts d'article : une
 * adresse recopiée par un modèle finit un jour avec une lettre en moins. C'est
 * elle qui dit QUI parle à un moteur qui lit la page de la vidéo.
 */
export const SIGNATURE_VIDEO = `${NOM}, ${TITRE} — Luminose, à ${LIEU} et en visio.\n→ ${SITE_URL}`;

/**
 * Slide ajoutée en fin de carrousel **par le code**, jamais générée par l'IA.
 * C'est ce qui garantit zéro dérive sur la signature.
 */
export const SIGNATURE_SLIDE = {
  titre: NOM,
  texte: `${TITRE.charAt(0).toUpperCase()}${TITRE.slice(1)}`,
};
