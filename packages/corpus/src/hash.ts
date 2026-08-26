/**
 * FNV-1a 32 bits, rendu sur 8 caractères hexadécimaux.
 *
 * Volontairement non cryptographique et **synchrone** : le composeur doit
 * tourner dans un Worker comme dans Node, et WebCrypto y est asynchrone.
 * L'usage est la détection de changement, pas la signature : « le texte que
 * j'ai collé le mois dernier est-il encore le texte courant ? »
 */
export function empreinte(texte: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
