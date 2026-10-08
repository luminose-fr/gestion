/**
 * Les règles de contenu que le serveur applique à ce qu'il crée — mécanique,
 * pas jugement (cadrages du 01/10 et du 02/10/2026).
 *
 * LA RÈGLE ET SON MOTIF FONT FOI DANS LE CORPUS, pas ici :
 *   - packages/corpus/content/socle/cadre-deontologique.md — « Aucune promesse de
 *     guérison, explicite ou suggérée » dans une annonce. Ce fichier gagne tous les
 *     arbitrages. Le questionnaire de santé se mentionne là où l'on s'engage (page
 *     d'offre, d'arrivée, réservation), plus dans ce qui y mène : depuis le
 *     08/10/2026, une annonce de breathwork sans le mot n'avertit plus.
 *   - packages/corpus/content/socle/identite.md — l'hypnose est un outil, pas un
 *     titre.
 *   - packages/corpus/content/socle/offres/ — le statut de chaque offre.
 * Ce module n'en garde que les formes les plus directes, pour qu'un texte qui
 * les contient ne parte pas. LE FILTRE EST UN PLANCHER, PAS UNE RELECTURE :
 * « Retrouvez la paix intérieure en trois séances » passe, et reste une
 * promesse. La relecture de Florent avant activation est le vrai contrôle — et
 * c'est la pause forcée qui la rend obligatoire.
 */

import { LIMITES_ANNONCE, aInsertion, analyser, rendre, texteParDefaut } from './insertion';

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

/** Les textes d'une annonce responsive, tels qu'écrits — insertion de mot-clé comprise. */
export type TextesAnnonce = { titres: string[]; descriptions: string[]; chemins: string[] };

export type Rendu = {
  motCle: string;
  /** Les seuls textes à insertion, tels qu'ils s'afficheraient pour ce mot-clé ; `replie` : trop long, Google montre le texte par défaut. */
  textes: { source: string; texte: string; replie: boolean }[];
  /** Ce que ce mot-clé ajoute au filtre — ce que le texte par défaut déclenchait déjà n'y est pas répété. */
  refus: string[];
  avertissements: string[];
};

/** L'annonce quand aucun mot-clé ne s'insère : ce que Google compte, et ce que le filtre lit d'abord. */
export const textesParDefaut = (a: TextesAnnonce): string[] =>
  [...a.titres, ...a.descriptions].map((t) => texteParDefaut(analyser(t))).concat(a.chemins);

/**
 * L'annonce telle que chaque mot-clé l'écrirait, et ce que le filtre en dit.
 * Avec l'insertion, c'est le mot-clé qui écrit le titre : « hypnose qui guérit »
 * ferait d'un titre sage une promesse. Chaque rendu passe donc au filtre, avec
 * les autres textes de l'annonce — les refus par combinaison portent sur
 * l'ensemble, comme Google affiche l'ensemble.
 */
export const examinerRendus = (a: TextesAnnonce, motsCles: string[]): Rendu[] => {
  const parDefaut = examinerAnnonce(textesParDefaut(a));
  const sources = [
    ...a.titres.map((t) => ({ t, limite: LIMITES_ANNONCE.titre })),
    ...a.descriptions.map((t) => ({ t, limite: LIMITES_ANNONCE.description })),
  ].map((x) => ({ ...x, analyse: analyser(x.t) }));
  return motsCles.map((motCle) => {
    const textes: Rendu['textes'] = [];
    const affiches = sources.map(({ t, limite, analyse }) => {
      if (!aInsertion(analyse)) return texteParDefaut(analyse);
      const r = rendre(analyse, motCle, limite);
      textes.push({ source: t, ...r });
      return r.texte;
    });
    const examen = examinerAnnonce([...affiches, ...a.chemins]);
    return {
      motCle,
      textes,
      refus: examen.refus.filter((r) => !parDefaut.refus.includes(r)),
      avertissements: examen.avertissements.filter((r) => !parDefaut.avertissements.includes(r)),
    };
  });
};
