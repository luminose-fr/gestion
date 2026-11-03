/**
 * La veille des modèles (SPEC §5.7) : parmi ce qu'un adaptateur publie, ce
 * qui est une version PLUS RÉCENTE d'un modèle déjà au catalogue.
 *
 * « Plus récent » ne se lit pas dans une date — Anthropic seul en publie une —
 * mais dans le code : `claude-opus-4-5` → `claude-opus-5`, `gpt-5.2-pro` →
 * `gpt-5.5-pro`. Le code se décompose en un SQUELETTE (ce qui reste quand on
 * retire les numéros) et une VERSION (les numéros, dans l'ordre). Deux codes
 * de même squelette sont deux versions de la même lignée ; une variante
 * (`-mini`, `-fast`, `-flash`) change le squelette, et n'est donc jamais
 * proposée comme une mise à jour de son aîné.
 *
 * Ce qui tombe avant la décomposition : la date d'un instantané, les suffixes
 * d'instabilité (`-preview`, `-latest`…), la taille (`70b`, `a22b`) et le
 * palier d'OpenRouter (`:free`). Ce sont des déclinaisons du même modèle, pas
 * des générations.
 */

export interface ModeleSuivi {
  id: string;
  name: string;
  apiCode: string;
}

export interface ModelePublie {
  /** Le code exact chez l'adaptateur. */
  id: string;
  name: string;
  creeLe: number | null;
}

export interface NouvelleVersion {
  apiCode: string;
  name: string;
  creeLe: number | null;
  /** Le modèle du catalogue que celui-ci dépasse : le plus récent de sa lignée. */
  remplace: ModeleSuivi;
}

export interface CodeDecompose {
  squelette: string;
  version: number[];
}

const DATE_FINALE = /-(\d{8}|\d{4}-\d{2}-\d{2})$/;
const INSTABLE = /-(preview|latest|exp|experimental|beta)(-[\d-]+)?$/;
const TAILLE = /-(\d+(\.\d+)?[bm]|a\d+(\.\d+)?b|\d+x\d+b)(?=-|$)/g;

/**
 * `claude-opus-4-5-20251101` → `{ squelette: 'claude-opus-#', version: [4, 5] }`.
 * `null` quand le code ne porte aucun numéro : sans version, rien ne se compare.
 *
 * Le préfixe de fabricant reste dans le squelette : chez OpenRouter,
 * `anthropic/claude-…` et un affinage tiers du même nom ne sont pas une lignée.
 */
export const decomposerCode = (code: string): CodeDecompose | null => {
  let s = String(code).toLowerCase().trim()
    .replace(/^~/, '')
    .replace(/:[^/]*$/, '');
  // Dans cet ordre : `-preview-06-05` puis une date, puis un second suffixe.
  for (let i = 0; i < 3; i++) s = s.replace(INSTABLE, '').replace(DATE_FINALE, '');

  const barre = s.lastIndexOf('/');
  const prefixe = barre >= 0 ? s.slice(0, barre + 1) : '';
  let reste = (barre >= 0 ? s.slice(barre + 1) : s).replace(TAILLE, '');

  // Un instantané en MMJJ (`deepseek-chat-v3-0324`) n'est une date que si le
  // code porte AUSSI un numéro de version ; seul (`mistral-large-2411`), il
  // EST la version.
  const sansInstantane = reste.replace(/-\d{4}$/, '');
  if (sansInstantane !== reste && /\d/.test(sansInstantane)) reste = sansInstantane;

  const jetons = reste.match(/[a-z]+|\d+/g) ?? [];
  const version: number[] = [];
  const morceaux: string[] = [];
  for (const j of jetons) {
    if (/^\d+$/.test(j)) {
      version.push(Number(j));
      // Des numéros qui se suivent forment UNE version : 4-5, 4.5 et 4·5 se valent.
      if (morceaux[morceaux.length - 1] !== '#') morceaux.push('#');
    } else {
      morceaux.push(j);
    }
  }
  if (!version.length) return null;
  return { squelette: prefixe + morceaux.join('-'), version };
};

/** Négatif si `a` est plus ancienne que `b`. `[5]` et `[5, 0]` se valent. */
export const comparerVersions = (a: number[], b: number[]): number => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
};

/**
 * Le nom d'une version qu'une source publie sans nom (1min.ai ne donne que des
 * codes) : celui de la version d'avant, son numéro remplacé — « GPT-5.2 Pro »
 * devient « GPT-5.5 Pro ». Sans le numéro d'avant écrit tel quel dans le nom,
 * on ne devine pas : le code reste le nom, et Florent le corrige à l'enregistrement.
 */
export const nomDeVersion = (ancienNom: string, ancienne: number[], nouvelle: number[]): string | null => {
  const avant = ancienne.join('.');
  const motif = new RegExp(`(^|[^0-9.])${avant.replace(/\./g, '\\.')}(?![0-9]|\\.[0-9])`);
  if (!motif.test(ancienNom)) return null;
  return ancienNom.replace(motif, (_, bord: string) => `${bord}${nouvelle.join('.')}`);
};

/**
 * Une proposition par lignée, au plus : la version la plus haute publiée, si
 * elle dépasse la plus haute que le catalogue porte déjà. Une proposition
 * écartée par Florent ne revient pas — mais une version plus récente encore,
 * elle, sera proposée.
 *
 * `ecartes` contient des codes d'adaptateur, tels que publiés.
 */
export const nouvellesVersions = (
  suivis: ModeleSuivi[],
  publies: ModelePublie[],
  ecartes: ReadonlySet<string> = new Set(),
): NouvelleVersion[] => {
  const tetes = new Map<string, { modele: ModeleSuivi; version: number[] }>();
  for (const modele of suivis) {
    const d = decomposerCode(modele.apiCode);
    if (!d) continue;
    const tete = tetes.get(d.squelette);
    if (!tete || comparerVersions(d.version, tete.version) > 0) {
      tetes.set(d.squelette, { modele, version: d.version });
    }
  }

  const meilleures = new Map<string, { publie: ModelePublie; version: number[] }>();
  for (const publie of publies) {
    const d = decomposerCode(publie.id);
    if (!d) continue;
    const tete = tetes.get(d.squelette);
    if (!tete || comparerVersions(d.version, tete.version) <= 0) continue;
    const deja = meilleures.get(d.squelette);
    const ecart = deja ? comparerVersions(d.version, deja.version) : 1;
    // À version égale : la plus récemment publiée, puis la variante payante —
    // `:free` partage la version, pas la disponibilité.
    const prefere = ecart > 0 || (ecart === 0 && deja && (
      (publie.creeLe ?? 0) > (deja.publie.creeLe ?? 0)
      || ((publie.creeLe ?? 0) === (deja.publie.creeLe ?? 0) && deja.publie.id.includes(':') && !publie.id.includes(':'))
    ));
    if (prefere) meilleures.set(d.squelette, { publie, version: d.version });
  }

  const propositions: NouvelleVersion[] = [];
  for (const [squelette, { publie, version }] of meilleures) {
    if (ecartes.has(publie.id)) continue;
    const tete = tetes.get(squelette)!;
    const sansNom = publie.name.trim() === '' || publie.name === publie.id;
    propositions.push({
      apiCode: publie.id,
      name: (sansNom && nomDeVersion(tete.modele.name, tete.version, version)) || publie.name,
      creeLe: publie.creeLe,
      remplace: tete.modele,
    });
  }
  return propositions;
};
