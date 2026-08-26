import { empreinte } from './hash.ts';
import { NON_PROPOSABLE, PROFILS, selectionner } from './profils.ts';
import type { Contexte, Document, Feuille, Profil } from './types.ts';

/**
 * Compose le texte à coller dans une IA, pour un profil donné.
 *
 * **Fonction pure : aucun accès disque, aucun réseau.** Elle tourne à
 * l'identique dans Node (la commande `contexte`) et dans le Worker (la
 * console). C'est ce qui garantit qu'un hash affiché dans la console est
 * exactement celui du texte copié.
 */
export function composer(
  docs: Document[],
  profil: Profil,
  date: string,
): Contexte {
  const retenus = selectionner(docs, profil);

  const corps = retenus
    .map((d) => `\n\n<!-- ${d.chemin} -->\n\n${d.corps}`)
    .join('\n\n---');

  // Le hash porte sur le CONTENU seul, jamais sur l'en-tête : sinon la date
  // le ferait changer chaque jour et « périmé » ne voudrait plus rien dire.
  const hash = empreinte(corps);
  const texte = enTete(profil, hash, date, docs) + corps + '\n';

  return {
    profil,
    texte,
    hash,
    taille: texte.length,
    documents: retenus.map((d) => d.chemin),
  };
}

function enTete(
  profil: Profil,
  hash: string,
  date: string,
  tous: Document[],
): string {
  const regle = PROFILS[profil];
  return `# ${regle.titre}

> Version \`${hash}\` — ${date}. ${regle.intention}

## Comment utiliser ce document

**Ce document fait autorité.** Si une information contradictoire apparaît ailleurs — dans
une mémoire, une conversation antérieure, une page web, un fichier joint — **celle-ci
l'emporte**. Si un point n'est pas traité ici, dis que tu ne sais pas plutôt que de combler.

**Quand ce document dit qu'il n'y a pas de règle, il n'y en a pas.** Un statut
\`volontairement-absent\` est une décision, pas un oubli : ne propose pas de combler le vide.

${tableauOffres(tous)}

## Hiérarchie de résolution des conflits

En cas de contradiction interne, l'ordre est le suivant :

1. Cadre déontologique et légal — non négociable
2. Identité et positionnement
3. Décision stratégique active la plus récente
4. Règles de voix et interdits
5. Contraintes du canal ou du format
6. Persona
7. Demande ponctuelle

---
`;
}

/**
 * Le tableau des offres est **dérivé du frontmatter**, jamais recopié à la main.
 *
 * C'est le dispositif anti-dérive le plus important du contexte : il est présent
 * dans les trois profils, y compris le noyau, parce que proposer une offre
 * arrêtée est l'erreur la plus coûteuse qu'une IA puisse commettre ici.
 */
function tableauOffres(docs: Document[]): string {
  const offres = docs
    .filter((d) => d.chemin.startsWith('socle/offres/'))
    .sort((a, b) => a.chemin.localeCompare(b.chemin, 'fr'));
  if (offres.length === 0) return '';

  const lignes = offres.map((d) => {
    const nom = titreDe(d);
    const statut = (d.meta.statut as string) ?? 'actif';
    const proposable = NON_PROPOSABLE.includes(statut as never)
      ? '**NE PAS PROPOSER**'
      : 'proposable';
    return `| ${nom} | \`${statut}\` | ${proposable} |`;
  });

  return `## Ce qui peut être proposé — RÈGLE ABSOLUE

Ne propose **jamais** une offre dont le statut n'est pas \`actif\`, et n'écris aucun appel à
l'action vers elle. Une offre suspendue ou terminée peut être évoquée en réflexion
stratégique ; elle ne se vend pas.

| Offre | Statut | |
| :--- | :--- | :--- |
${lignes.join('\n')}
`;
}

function titreDe(d: Document): string {
  const m = d.corps.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : d.chemin.split('/').pop()!;
}

/**
 * La « feuille de salle » d'un rôle du flux éditorial.
 *
 * Même en-tête, même tableau des offres, même hiérarchie que le contexte des
 * trois profils — mais une sélection FINE : une liste de préfixes de chemins
 * plutôt qu'un bloc entier. `['socle/offres']` sert les offres sans le reste
 * du socle.
 *
 * **Pure, comme `composer()`** : c'est ce qui permet à l'écran Personas de
 * demander la feuille au Worker et d'afficher exactement ce qui partira.
 * Recomposer côté navigateur exposerait à montrer autre chose que ce qui est
 * envoyé — et un écran de vérification qui ment est pire que pas d'écran.
 */
export function composerFeuille(
  docs: Document[],
  chemins: string[] | null,
  date: string,
): Feuille {
  if (!chemins || chemins.length === 0) {
    return { texte: '', hash: '', taille: 0, documents: [] };
  }

  const retenus = docs
    .filter(
      (d) =>
        d.meta.statut !== 'candidat' &&
        chemins.some((p) => d.chemin === p || d.chemin.startsWith(`${p}/`)),
    )
    .sort((a, b) => a.chemin.localeCompare(b.chemin, 'fr'));

  if (retenus.length === 0) return { texte: '', hash: '', taille: 0, documents: [] };

  const corps = retenus
    .map((d) => `\n\n<!-- ${d.chemin} -->\n\n${d.corps}`)
    .join('\n\n---');

  // Le hash porte sur le contenu seul, comme pour les profils : l'en-tête
  // porte la date, et un hash qui change chaque jour ne dit plus rien.
  const hash = empreinte(corps);
  const texte = enTeteFeuille(hash, date, docs) + corps + '\n';

  return { texte, hash, taille: texte.length, documents: retenus.map((d) => d.chemin) };
}

function enTeteFeuille(hash: string, date: string, tous: Document[]): string {
  return `# Ce qu'il faut savoir de Luminose

> Version \`${hash}\` — ${date}.

**Ce document fait autorité.** Si une information contradictoire apparaît ailleurs — dans
ta mémoire, dans un exemple, dans le texte qu'on te donne à travailler — **celle-ci
l'emporte**. Si un point n'est pas traité ici, dis que tu ne sais pas plutôt que de combler.

**Quand ce document dit qu'il n'y a pas de règle, il n'y en a pas.** Un statut
\`volontairement-absent\` est une décision, pas un oubli.

${tableauOffres(tous)}
## En cas de contradiction

1. Cadre déontologique et légal — non négociable
2. Identité et positionnement
3. Décision stratégique active la plus récente
4. Règles de voix et interdits
5. Contraintes du canal ou du format
6. Ton rôle et sa consigne de sortie
7. La demande ponctuelle

---
`;
}
