/**
 * Ce qu'un mot-clé négatif exclut, comparé au texte d'un mot-clé positif —
 * pour avertir, dans l'aperçu, qu'une exclusion couperait ce qu'on paie pour
 * montrer. Aucune dépendance : de la comparaison de chaînes.
 *
 * Google n'étend pas les négatifs aux variantes proches (pluriels, fautes,
 * accents, synonymes) : on compare au texte près, accents compris. Seules la
 * casse et les espaces ne comptent pas — Google les ignore dans les mots-clés.
 */

export type Correspondance = 'EXACT' | 'PHRASE' | 'BROAD';

export type MotCle = { texte: string; correspondance: Correspondance };

/**
 * La forme sous laquelle deux textes se comparent. NFC : « é » saisi en un ou
 * deux points de code reste le même « é », et reste distinct de « e ».
 */
export const comparable = (texte: string): string =>
  texte.normalize('NFC').toLocaleLowerCase('fr').trim().replace(/\s+/g, ' ');

/** Une entrée et sa correspondance, comme Google les distingue : « gratuit » exact et « gratuit » large sont deux négatifs. */
export const cleMotCle = (m: MotCle): string => `${comparable(m.texte)}\u0000${m.correspondance}`;

const mots = (texte: string): string[] => comparable(texte).split(' ').filter(Boolean);

/**
 * Le négatif exclurait-il la recherche identique au mot-clé positif ?
 * - EXACT : le même texte ;
 * - PHRASE : l'expression, mots consécutifs et dans l'ordre, figure dans le mot-clé ;
 * - BROAD : tous les mots du négatif figurent dans le mot-clé, dans n'importe quel ordre.
 */
export const bloque = (negatif: MotCle, positif: string): boolean => {
  const n = mots(negatif.texte);
  const p = mots(positif);
  if (n.length === 0 || n.length > p.length) return false;
  switch (negatif.correspondance) {
    case 'EXACT':
      return n.length === p.length && n.every((m, i) => m === p[i]);
    case 'PHRASE':
      for (let debut = 0; debut + n.length <= p.length; debut++) {
        if (n.every((m, i) => m === p[debut + i])) return true;
      }
      return false;
    case 'BROAD': {
      const presents = new Set(p);
      return n.every((m) => presents.has(m));
    }
  }
};
