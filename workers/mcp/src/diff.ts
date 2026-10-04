/**
 * Un diff ligne à ligne, à la manière de `diff -u`, pour l'aperçu d'une
 * modification du corpus : c'est lui que Florent relit avant de valider. Sans
 * dépendance ; les fiches font quelques centaines de lignes, la table de plus
 * longue sous-suite commune y est instantanée.
 */

/** Au-delà, la table coûterait trop : l'aperçu montre alors le fichier entier. */
const MAX_CELLULES = 4_000_000;

export const diffLignes = (avant: string, apres: string, contexte = 2): string[] => {
  const a = avant.split('\n');
  const b = apres.split('\n');
  if (a.length * b.length > MAX_CELLULES) return ['(fiche trop longue pour un diff ligne à ligne : nouvelle version entière)', ...b.map((l) => `+ ${l}`)];

  // lcs[i][j] : longueur de la plus longue sous-suite commune de a[i..] et b[j..].
  const lcs = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const lignes: { signe: ' ' | '-' | '+'; texte: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { lignes.push({ signe: ' ', texte: a[i] }); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) lignes.push({ signe: '-', texte: a[i++] });
    else lignes.push({ signe: '+', texte: b[j++] });
  }
  while (i < a.length) lignes.push({ signe: '-', texte: a[i++] });
  while (j < b.length) lignes.push({ signe: '+', texte: b[j++] });

  // Les lignes changées, avec `contexte` lignes inchangées autour ; « … » entre deux morceaux.
  const gardees = new Set<number>();
  lignes.forEach((l, k) => {
    if (l.signe !== ' ') for (let d = -contexte; d <= contexte; d++) gardees.add(k + d);
  });
  const sortie: string[] = [];
  let precedente = -1;
  lignes.forEach((l, k) => {
    if (!gardees.has(k)) return;
    if (sortie.length > 0 && k !== precedente + 1) sortie.push('…');
    sortie.push(`${l.signe} ${l.texte}`);
    precedente = k;
  });
  return sortie;
};
