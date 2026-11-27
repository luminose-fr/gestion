/**
 * Les notes d'une séance tiennent en UN texte Markdown (retour de Florent du
 * 27/11/2026, qui remplace la trame en six champs du §15.4) : un seul champ,
 * pré-rempli de quelques titres qu'il garde ou efface, comme le modèle de page
 * qu'il utilisait dans Notion.
 *
 * Sans migration : le texte vit dans la colonne `seance` de la table des notes,
 * et toute écriture vide les cinq autres colonnes de la trame. Une note écrite
 * avant ce changement (jeu d'essai, première version de l'écran) n'est pas
 * perdue : ses colonnes se lisent en un seul texte, chacune sous son titre, et
 * la prochaine écriture l'enregistre ainsi.
 *
 * Aucune dépendance, aucun nom de table : l'outil d'import s'en sert aussi.
 */

/** Les colonnes de l'ancienne trame, dans leur ordre, et leur titre. `seance` porte le texte entier. */
export const COLONNES_TRAME = [
  ['demande', 'Demande'],
  ['objectif', 'Objectif'],
  ['seance', 'Séance'],
  ['travail_personnel', 'Travail personnel'],
  ['idees_suite', 'Idées pour la suite'],
  ['reponse_sms', 'Réponse SMS'],
] as const;

export type ColonnesTrame = Partial<Record<(typeof COLONNES_TRAME)[number][0], string | null | undefined>>;

/**
 * Les colonnes d'une note, en un seul texte. Le corps (`seance`) n'a pas de
 * titre s'il ouvre le texte ou s'il commence par un titre à lui ; les autres
 * colonnes non vides passent chacune sous le sien. Rien de non vide : `null`.
 */
export const texteDesNotes = (c: ColonnesTrame): string | null => {
  const parties: string[] = [];
  for (const [colonne, titre] of COLONNES_TRAME) {
    const v = c[colonne]?.trim();
    if (!v) continue;
    const sansTitre = colonne === 'seance' && (parties.length === 0 || v.startsWith('#'));
    parties.push(sansTitre ? v : `## ${titre}\n\n${v}`);
  }
  return parties.length ? parties.join('\n\n') : null;
};
