/**
 * Les contenus de la console, depuis une conversation — décision du 03/11/2026
 * (decisions/2026-11-03-contenus.md).
 *
 * LIRE : les contenus et les séries, par l'API de gestion.luminose.fr (console.ts).
 *
 * ÉCRIRE, ce que Florent a accordé : créer une idée, modifier la fiche d'un
 * contenu, écrire son brouillon, regrouper des idées en série — et, le
 * 07/11/2026, déplacer un contenu d'une série à l'autre et réordonner une
 * série. Rien d'autre — ni suppression, ni analyse, ni atelier, ni slides —,
 * et la console le revérifie de son côté : son jeton n'ouvre que ces routes et
 * ces champs.
 *
 * Ces écritures partent DIRECTEMENT, sans aperçu ni jeton, à la différence de
 * Google Ads, du corpus et de Tag Manager : les contenus ne sont pas publics,
 * et chaque écriture se rattrape. Un brouillon se signe « Claude (MCP) » au
 * journal des générations et s'annule dans l'éditeur ; une fiche modifiée garde
 * son état d'avant au journal de ce serveur (`contenus_ecritures`). Le
 * plafond sur 24 heures (CONTENUS_ECRITURES_MAX_JOUR) borne le volume.
 *
 * Le vocabulaire de la console est repris tel quel — statut, format, objectif,
 * plateformes — et c'est elle qui valide les valeurs : une valeur inconnue
 * revient avec la liste de celles qu'elle admet.
 */
import { z } from 'zod';
import { LISTE_DES_FORMATS } from '@luminose/editorial';
import { appelerConsole } from './console';
import { dateFr, jourDe } from './dates';
import { exigerEcritureContenus, ouvrirEcriture, type Contexte } from './ecriture';
import { clore } from './journal';
import { DESTRUCTIF, ECRITURE, LECTURE, idempotent, outil, texte } from './outil';
import { Refus } from './refus';
import type { Env } from './env';

/** La plus longue réponse rendue : au-delà, le texte est coupé, et le dit. */
const MAX_CARACTERES = 50_000;

// ── Ce que la console rend ───────────────────────────────────────────────

type Contenu = {
  id: string; title: string; status: string; platforms: string[]; targetFormat: string | null; objectif: string | null;
  depth: string | null; analyzedAt: number | null; verdict: string | null; strategicAngle: string | null;
  justification: string | null; suggestedMetaphor: string | null; notes: string; draft: string | null; slides: string | null;
  coachStatus: string | null; coachBrief: string | null; serieId: string | null; angle: string | null;
  seriePosition: number | null; scheduledDate: string | null; createdAt: number; updatedAt: number;
};
type Serie = { id: string; titre: string; intention: string | null; statut: string; sourceContentId: string | null; updatedAt: number };
type Detail = {
  content: Contenu;
  coachSession: { status: string | null; brief: string | null; messages: unknown[] };
  /** Un changement de statut, ou un déplacement entre séries (`nature`), dont `texte` porte la phrase. */
  gestes: { statut: string; avant: string | null; le: number; nature?: string; texte?: string | null }[];
  cout: { appels: number; tokensEntree: number | null; tokensSortie: number | null; usd: number | null; appelsSansPrix: number };
  gabaritBrouillon?: string;
};
type Generation = { id: string; kind: string; modelLabel: string; instruction: string | null; payload: string; createdAt: number };
/** Une série et ses contenus, dans l'ordre — ce que rendent la lecture, le déplacement et la remise en ordre. */
type SerieEtContenus = { serie: Serie; contents: Contenu[] };
type Deplacement = {
  content: Contenu;
  inchange: boolean;
  /** La phrase du geste laissé au fil ; `null` quand seul l'angle a changé. */
  geste: string | null;
  depart: SerieEtContenus | null;
  arrivee: SerieEtContenus | null;
};

// ── Dire en français ─────────────────────────────────────────────────────

const le = (ms: number) => dateFr(jourDe(ms));
const ligne = (t: string) => t.replace(/\s+/g, ' ').trim();
const extrait = (t: string | null | undefined, n: number) => {
  const l = ligne(t ?? '');
  return l.length > n ? `${l.slice(0, n)}…` : l;
};
const couper = (t: string) => (t.length > MAX_CARACTERES
  ? `${t.slice(0, MAX_CARACTERES)}\n\n[… coupé à ${MAX_CARACTERES} caractères]`
  : t);

/** Les champs de la fiche, sous leur nom dans les outils et dans la console. */
const FICHE = {
  titre: 'title', notes: 'notes', statut: 'status', format: 'targetFormat', objectif: 'objectif',
  plateformes: 'platforms', date_prevue: 'scheduledDate', angle: 'angle',
} as const satisfies Record<string, keyof Contenu>;
type ChampFiche = keyof typeof FICHE;

const dire = (v: unknown) => (v === null || v === undefined || v === '' ? '—'
  : Array.isArray(v) ? (v.length ? v.join(', ') : '—') : `« ${extrait(String(v), 200)} »`);

const STATUTS = ['Idée', 'Brouillon', 'Prêt', 'Publié'] as const;

const champsFiche = {
  notes: z.string().max(20_000).optional()
    .describe('La matière du contenu : ce qu’il doit dire, d’où il vient. Remplace les notes en place.'),
  statut: z.enum(STATUTS).optional(),
  // La liste vient du registre des formats, avec ce qui fait choisir chacun :
  // c'est elle que lit Claude quand il propose un format, comme l'Éclateur.
  format: z.string().max(80).nullable().optional()
    .describe(`Valeur exacte de la console — celle qui précède le tiret —, à choisir sur ce que la matière demande :\n${LISTE_DES_FORMATS}\nnull l’efface.`),
  objectif: z.string().max(80).nullable().optional().describe('Valeur exacte de la console ; une valeur inconnue revient avec la liste admise. null l’efface.'),
  plateformes: z.array(z.string().max(40)).max(10).optional()
    .describe('Facebook, Instagram, LinkedIn, Google My Business, Youtube, Blog, Newsletter. Remplace la liste en place.'),
  date_prevue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'AAAA-MM-JJ').nullable().optional().describe('Date de publication prévue, AAAA-MM-JJ. null l’efface.'),
  angle: z.string().max(2000).nullable().optional().describe('L’angle propre de ce contenu, dans sa série s’il en a une. null l’efface.'),
};

/** Les arguments de la fiche, traduits pour la console — seulement ceux qui sont donnés. */
const versConsole = (args: Partial<Record<ChampFiche, unknown>>): Record<string, unknown> =>
  Object.fromEntries((Object.keys(FICHE) as ChampFiche[]).filter((k) => args[k] !== undefined).map((k) => [FICHE[k], args[k]]));

const ID = z.string().min(1).max(100).regex(/^[A-Za-z0-9-]+$/, 'identifiant de la console');

// ── Une écriture : journal d'abord, console ensuite ──────────────────────

/**
 * V9 puis V7, comme les autres écritures : compter, ouvrir la ligne du journal,
 * appeler, clore. Si le journal ne s'écrit pas, la console n'est pas appelée.
 */
const ecrireDansLaConsole = async <T>(env: Env, contexte: Contexte, o: {
  outil: string; cible: string; contenu: unknown; appel: () => Promise<T>; ressources: (r: T) => string[];
}): Promise<{ numero: number; resultat: T }> => {
  const numero = await ouvrirEcriture(env, 'contenus', {
    outil: o.outil, cible: o.cible, auteur: contexte.email, contenu: o.contenu, jetonEmpreinte: null,
  }, 'la console');
  try {
    const resultat = await o.appel();
    await clore(env, 'contenus', numero, 'ok', { ressources: o.ressources(resultat) })
      .catch((e) => console.error(`Écriture n° ${numero} faite, journal non clos :`, e));
    return { numero, resultat };
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    await clore(env, 'contenus', numero, 'erreur', { erreur: message }).catch((e) => console.error(`Journal n° ${numero} non clos :`, e));
    throw erreur;
  }
};

const series = async (env: Env) => new Map((await appelerConsole<{ items: Serie[] }>(env, '/api/series')).items.map((s) => [s.id, s]));

// ── contenus_lister ──────────────────────────────────────────────────────

const lister = outil({
  name: 'contenus_lister',
  domaine: 'console',
  title: 'Lister les contenus',
  description:
    'Liste les contenus de la console (gestion.luminose.fr), du plus récemment modifié au plus ancien : titre, statut, format, ' +
    'objectif, série et rang, date prévue, début des notes, identifiant. Lecture seule.\n\n' +
    'Filtres facultatifs, cumulables : statut, format (valeur exacte), serie (identifiant) ou sans_serie, recherche (dans le titre ' +
    'et les notes). Pour regrouper des idées en série : statut « Idée » et sans_serie.',
  schema: z.object({
    statut: z.enum(STATUTS).optional(),
    format: z.string().max(80).optional(),
    serie: ID.optional().describe('Identifiant d’une série (series_lister).'),
    sans_serie: z.boolean().optional().describe('Seulement les contenus rattachés à aucune série.'),
    recherche: z.string().max(200).optional(),
    limite: z.number().int().min(1).max(200).default(50),
  }).strict(),
  annotations: LECTURE,
  async executer({ statut, format, serie, sans_serie, recherche, limite }, env) {
    const [{ items }, toutes] = await Promise.all([appelerConsole<{ items: Contenu[] }>(env, '/api/contents'), series(env)]);
    const cherche = recherche?.toLocaleLowerCase('fr');
    const retenus = items.filter((c) =>
      (!statut || c.status === statut) && (!format || c.targetFormat === format) && (!serie || c.serieId === serie) &&
      (!sans_serie || !c.serieId) && (!cherche || `${c.title}\n${c.notes}`.toLocaleLowerCase('fr').includes(cherche)));
    if (retenus.length === 0) return texte(`Aucun contenu ne répond à ces filtres (${items.length} dans la console).`);

    const lignes = retenus.slice(0, limite).map((c) => {
      const s = c.serieId ? toutes.get(c.serieId) : undefined;
      const fiche = [
        c.status, c.targetFormat ?? 'format à décider', c.objectif,
        c.serieId ? `série « ${s?.titre ?? c.serieId} »${c.seriePosition ? ` n° ${c.seriePosition}` : ''}` : null,
        c.scheduledDate ? `prévu le ${dateFr(c.scheduledDate)}` : null,
        `modifié le ${le(c.updatedAt)}`,
      ].filter(Boolean).join(' · ');
      return `- « ${c.title || 'sans titre'} » — ${fiche} — id ${c.id}${c.notes.trim() ? `\n  notes : ${extrait(c.notes, 160)}` : ''}`;
    });
    const entete = `${retenus.length} contenu${retenus.length > 1 ? 's' : ''} sur ${items.length}` +
      (retenus.length > limite ? ` — les ${limite} plus récemment modifiés :` : ' :');
    return texte(couper([entete, ...lignes].join('\n')));
  },
});

// ── contenus_lire ────────────────────────────────────────────────────────

const lire = outil({
  name: 'contenus_lire',
  domaine: 'console',
  title: 'Lire un contenu entier',
  description:
    'Lit un contenu de la console : sa fiche, ses notes, son analyse, l’état de son atelier, son brouillon tel que l’éditeur le lit ' +
    '(du JSON propre à son format), la dernière relecture à froid, et sa place dans sa série avec les angles des autres publications ' +
    '— à ne pas répéter. Lecture seule.\n\n' +
    'Sans brouillon, ou avec gabarit = true, il rend aussi le gabarit du format : la forme JSON que le Rédacteur de la console reçoit, ' +
    'et que contenus_brouillon_ecrire exige.',
  schema: z.object({
    id: ID,
    gabarit: z.boolean().default(false).describe('Rendre le gabarit du format même quand un brouillon existe.'),
  }).strict(),
  annotations: LECTURE,
  async executer({ id, gabarit }, env) {
    const chemin = `/api/contents/${encodeURIComponent(id)}`;
    const [detail, relectures] = await Promise.all([
      appelerConsole<Detail>(env, chemin),
      appelerConsole<{ generations: Generation[] }>(env, `${chemin}/generations?kind=cold_read&limit=1`),
    ]);
    const c = detail.content;
    const serie = c.serieId
      ? await appelerConsole<{ serie: Serie; contents: Contenu[] }>(env, `/api/series/${encodeURIComponent(c.serieId)}`)
      : null;

    const blocs: string[] = [
      `« ${c.title || 'sans titre'} » — id ${c.id}`,
      [
        `Statut : ${c.status}`, `format : ${c.targetFormat ?? 'à décider'}`, `objectif : ${c.objectif ?? '—'}`,
        `plateformes : ${c.platforms.length ? c.platforms.join(', ') : '—'}`,
        `date prévue : ${c.scheduledDate ? dateFr(c.scheduledDate) : '—'}`,
      ].join(' · '),
      `Angle : ${c.angle ?? '—'}`,
      `Créé le ${le(c.createdAt)}, modifié le ${le(c.updatedAt)}.`,
    ];
    if (serie) {
      const freres = serie.contents.map((f) =>
        `${f.seriePosition ?? '·'}. « ${f.title} »${f.id === c.id ? ' ← ce contenu' : ''}${f.angle ? ` — ${f.angle}` : ''} (${f.status})`);
      blocs.push('', `Série « ${serie.serie.titre} »${serie.serie.intention ? ` — ${serie.serie.intention}` : ''} (${serie.contents.length} publications, ` +
        'dans l’ordre de la progression ; ne pas répéter ce que disent les autres) :', ...freres);
    }
    blocs.push('', 'Notes :', c.notes.trim() || '—');
    if (c.analyzedAt) {
      blocs.push('', `Analyse du ${le(c.analyzedAt)} : verdict ${c.verdict ?? '—'}.`,
        ...(c.strategicAngle ? [`Angle stratégique : ${c.strategicAngle}`] : []),
        ...(c.justification ? [`Justification : ${c.justification}`] : []),
        ...(c.suggestedMetaphor ? [`Métaphore suggérée : ${c.suggestedMetaphor}`] : []));
    }
    const coach = detail.coachSession;
    blocs.push('', `Atelier : ${coach.status === 'validated' ? 'validé' : coach.status === 'in_progress' ? 'en cours' : 'pas ouvert'}` +
      `, ${coach.messages.length} message${coach.messages.length > 1 ? 's' : ''}.`, ...(coach.brief ? ['Brief verrouillé :', coach.brief] : []));

    if (c.draft) {
      blocs.push('', 'Brouillon (JSON, tel que l’éditeur le lit) :', '```json', c.draft, '```');
    } else {
      blocs.push('', 'Aucun brouillon.');
    }
    if (detail.gabaritBrouillon && (!c.draft || gabarit)) {
      blocs.push('', `Gabarit du format « ${c.targetFormat} » — la forme que contenus_brouillon_ecrire exige :`, detail.gabaritBrouillon.trim());
    } else if (!c.targetFormat) {
      blocs.push('', 'Pas de format : le poser avec contenus_modifier avant d’écrire un brouillon.');
    }
    const relecture = relectures.generations[0];
    if (relecture) blocs.push('', `Dernière relecture à froid, le ${le(relecture.createdAt)} (${relecture.modelLabel}) :`, extrait(relecture.payload, 3000));
    blocs.push('', `Slides : ${c.slides ? 'produites' : 'aucune'}.`);
    if (detail.gestes.length) {
      blocs.push(`Gestes : ${detail.gestes.slice(-5).map((g) => (g.nature === 'deplacement'
        ? `${(g.texte ?? 'changé de série').replace(/\.$/, '')} le ${le(g.le)}`
        : `${g.avant ?? '—'} → ${g.statut} le ${le(g.le)}`)).join(' ; ')}.`);
    }
    return texte(couper(blocs.join('\n')));
  },
});

// ── series_lister ────────────────────────────────────────────────────────

const listerSeries = outil({
  name: 'series_lister',
  domaine: 'console',
  title: 'Lister les séries',
  description: 'Liste les séries de la console : titre, intention, statut, nombre de publications, identifiant. Lecture seule. ' +
    'contenus_lister avec serie = identifiant en donne les publications.',
  schema: z.object({}).strict(),
  annotations: LECTURE,
  async executer(_args, env) {
    const [toutes, { items }] = await Promise.all([series(env), appelerConsole<{ items: Contenu[] }>(env, '/api/contents')]);
    if (toutes.size === 0) return texte('Aucune série dans la console.');
    const compte = (id: string) => items.filter((c) => c.serieId === id).length;
    return texte([...toutes.values()].map((s) =>
      `- « ${s.titre} » — ${s.statut === 'terminee' ? 'terminée' : 'en cours'} · ${compte(s.id)} publication${compte(s.id) > 1 ? 's' : ''}` +
      `${s.sourceContentId ? ' · déclinée d’un contenu pilier' : ''} — id ${s.id}${s.intention ? `\n  intention : ${extrait(s.intention, 200)}` : ''}`).join('\n'));
  },
});

// ── contenus_creer ───────────────────────────────────────────────────────

const creer = outil({
  name: 'contenus_creer',
  domaine: 'console',
  title: 'Créer une idée',
  description:
    'Crée un contenu dans la console — par défaut une idée (statut « Idée »), avec sa fiche : titre, notes, format, objectif, ' +
    'plateformes, date prévue, angle. Le brouillon s’écrit ensuite avec contenus_brouillon_ecrire.\n\n' +
    'L’écriture part directement, sans aperçu, et se journalise. Exige la case « Modifier les contenus » du consentement.',
  schema: z.object({ titre: z.string().min(1).max(500), ...champsFiche }).strict(),
  annotations: ECRITURE,
  async executer(args, env, contexte) {
    exigerEcritureContenus(contexte);
    const corps = versConsole(args);
    const { numero, resultat } = await ecrireDansLaConsole(env, contexte, {
      outil: 'contenus_creer', cible: 'nouveau', contenu: { corps },
      appel: () => appelerConsole<{ content: Contenu }>(env, '/api/contents', { methode: 'POST', corps }),
      ressources: (r) => [r.content.id],
    });
    const c = resultat.content;
    return texte(`FAIT — écriture n° ${numero} du journal. Contenu créé : « ${c.title} » (${c.status}${c.targetFormat ? `, ${c.targetFormat}` : ''}) — id ${c.id}.`);
  },
});

// ── contenus_modifier ────────────────────────────────────────────────────

const modifier = outil({
  name: 'contenus_modifier',
  domaine: 'console',
  title: 'Modifier la fiche d’un contenu',
  description:
    'Modifie la fiche d’un contenu de la console : titre, notes, statut, format, objectif, plateformes, date prévue, angle. ' +
    'Seuls les champs donnés changent ; null efface un champ facultatif. Le brouillon ne passe pas par ici : contenus_brouillon_ecrire ; ' +
    'la série et le rang non plus : contenus_deplacer.\n\n' +
    'L’écriture part directement, sans aperçu. Le journal de ce serveur garde la fiche d’avant ; un changement de statut laisse ' +
    'un geste dans le fil du contenu. Exige la case « Modifier les contenus » du consentement.',
  schema: z.object({ id: ID, titre: z.string().min(1).max(500).optional(), ...champsFiche }).strict(),
  annotations: idempotent(DESTRUCTIF),
  async executer({ id, ...args }, env, contexte) {
    exigerEcritureContenus(contexte);
    const corps = versConsole(args);
    if (Object.keys(corps).length === 0) throw new Refus('Rien à modifier : donner au moins un champ de la fiche.');

    const chemin = `/api/contents/${encodeURIComponent(id)}`;
    const avant = (await appelerConsole<Detail>(env, chemin)).content;
    const changes = (Object.keys(FICHE) as ChampFiche[])
      .filter((k) => args[k] !== undefined && JSON.stringify(avant[FICHE[k]] ?? null) !== JSON.stringify(args[k] ?? null));
    if (changes.length === 0) return texte(`RIEN À FAIRE — la fiche de « ${avant.title} » porte déjà ces valeurs. Rien n'est parti.`);

    const { numero } = await ecrireDansLaConsole(env, contexte, {
      outil: 'contenus_modifier', cible: id,
      contenu: { corps, avant: Object.fromEntries(changes.map((k) => [FICHE[k], avant[FICHE[k]] ?? null])) },
      appel: () => appelerConsole<{ content: Contenu }>(env, chemin, { methode: 'PATCH', corps }),
      ressources: () => [id],
    });
    return texte([
      `FAIT — écriture n° ${numero} du journal. Fiche de « ${avant.title} » modifiée :`,
      ...changes.map((k) => `- ${k.replace('_', ' ')} : ${dire(avant[FICHE[k]])} → ${dire(args[k])}`),
    ].join('\n'));
  },
});

// ── contenus_brouillon_ecrire ────────────────────────────────────────────

const ecrireBrouillon = outil({
  name: 'contenus_brouillon_ecrire',
  domaine: 'console',
  title: 'Écrire le brouillon d’un contenu',
  description:
    'Écrit le brouillon d’un contenu de la console, à la place du Rédacteur : le JSON propre à son format — celui que ' +
    'contenus_lire montre, ou son gabarit quand il n’y a pas encore de brouillon. La console le vérifie comme ce qu’écrit son ' +
    'Rédacteur et exige qu’il soit au format du contenu ; un contenu sans format se voit d’abord poser le sien (contenus_modifier).\n\n' +
    'Il entre au journal des générations, signé « Claude (MCP) », avec la raison donnée : l’éditeur le montre, et son historique ramène ' +
    'le précédent. Une retouche à la main qui n’y figurait pas y est versée d’abord. L’écriture part directement, sans aperçu. ' +
    'Exige la case « Modifier les contenus » du consentement.',
  schema: z.object({
    id: ID,
    brouillon: z.union([z.string().min(2).max(200_000), z.record(z.string(), z.unknown())])
      .describe('Le brouillon : un objet JSON, ou son texte. Son champ `format` nomme le format, comme dans le gabarit.'),
    raison: z.string().min(3).max(500).describe('Ce qui a changé et pourquoi, en une phrase : elle apparaît dans le fil du contenu.'),
  }).strict(),
  annotations: DESTRUCTIF,
  async executer({ id, brouillon, raison }, env, contexte) {
    exigerEcritureContenus(contexte);
    const charge = typeof brouillon === 'string' ? brouillon : JSON.stringify(brouillon);
    const corps = { kind: 'draft', target: 'draft', apply: true, modelLabel: 'Claude (MCP)', instruction: raison, payload: charge };
    const { numero, resultat } = await ecrireDansLaConsole(env, contexte, {
      outil: 'contenus_brouillon_ecrire', cible: id, contenu: { raison, payload: charge },
      appel: () => appelerConsole<{ generation: Generation }>(env, `/api/contents/${encodeURIComponent(id)}/generations`, { methode: 'POST', corps }),
      ressources: (r) => [id, r.generation.id],
    });
    return texte([
      `FAIT — écriture n° ${numero} du journal. Brouillon écrit, signé ${resultat.generation.modelLabel} au journal du contenu ` +
      `(génération ${resultat.generation.id}) : « ${raison} ».`,
      'Florent le retrouve dans l’éditeur ; l’historique du brouillon ramène le précédent. Si le contenu est ouvert dans la console, ' +
      'le rouvrir avant d’y retoucher : un éditeur resté ouvert réenregistrerait l’ancien.',
    ].join('\n'));
  },
});

// ── series_regrouper ─────────────────────────────────────────────────────

const regrouper = outil({
  name: 'series_regrouper',
  domaine: 'console',
  title: 'Regrouper des idées en série',
  description:
    'Crée une série dans la console et y range des idées existantes, dans l’ordre donné — l’ordre EST la progression : la première ' +
    'ouvre le sujet, les suivantes s’appuient sur ce qui précède. Un angle par idée, facultatif, dit sa place dans la série ; sans ' +
    'lui, l’idée garde le sien. De deux à vingt idées.\n\n' +
    'Seulement des idées (statut « Idée ») qui n’appartiennent à aucune série — contenus_lister avec statut « Idée » et sans_serie ' +
    'les trouve. Elles restent des idées : format, objectif et angle restent à décider. La série et ses idées existent ensemble ou ' +
    'pas du tout. Pour compléter une série qui existe déjà, ou y faire entrer un contenu engagé : contenus_deplacer, à la position ' +
    'voulue. L’écriture part directement, sans aperçu. Exige la case « Modifier les contenus » du consentement.',
  schema: z.object({
    titre: z.string().min(1).max(500).describe('Le sujet de la série.'),
    intention: z.string().max(2000).optional().describe('Ce que la série doit produire chez le lecteur.'),
    contenus: z.array(z.object({ id: ID, angle: z.string().max(2000).optional() }).strict()).min(2).max(20)
      .describe('Les idées, dans l’ordre de la progression.'),
  }).strict(),
  annotations: ECRITURE,
  async executer({ titre, intention, contenus }, env, contexte) {
    exigerEcritureContenus(contexte);
    const corps = { titre, ...(intention ? { intention } : {}), contenus };
    const { numero, resultat } = await ecrireDansLaConsole(env, contexte, {
      outil: 'series_regrouper', cible: 'série', contenu: { corps },
      appel: () => appelerConsole<{ serie: Serie; contents: Contenu[] }>(env, '/api/series/regrouper', { methode: 'POST', corps }),
      ressources: (r) => [r.serie.id, ...r.contents.map((c) => c.id)],
    });
    return texte([
      `FAIT — écriture n° ${numero} du journal. Série « ${resultat.serie.titre} » créée — id ${resultat.serie.id} :`,
      ...resultat.contents.map((c) => `${c.seriePosition}. « ${c.title} »${c.angle ? ` — ${c.angle}` : ''}`),
    ].join('\n'));
  },
});

// ── contenus_deplacer ────────────────────────────────────────────────────

/** Une série numérotée, telle que la console la rend après l'opération. */
const numeroter = (s: SerieEtContenus, role: string): string[] => [
  `Série « ${s.serie.titre} »${role} — ${s.contents.length} publication${s.contents.length > 1 ? 's' : ''} :`,
  ...(s.contents.length
    ? s.contents.map((c) => `${c.seriePosition ?? '·'}. « ${c.title || 'sans titre'} »${c.angle ? ` — ${extrait(c.angle, 160)}` : ''} (${c.status}) — id ${c.id}`)
    : ['(vide — elle reste ; la supprimer se décide dans la console)']),
];

const deplacer = outil({
  name: 'contenus_deplacer',
  domaine: 'console',
  title: 'Changer un contenu de série ou de rang',
  description:
    'Déplace un contenu de la console vers une autre série, à la position voulue (par défaut en dernier), le place à un autre rang ' +
    'de sa propre série, ou l’en sort (serie = null). Seuls changent sa série et son rang — et son angle s’il est donné : l’angle ' +
    'est relatif à la série ; absent, il reste tel quel ; null l’efface. Fiche, notes, brouillon, analyse, atelier, relectures et ' +
    'fil restent ceux du contenu. Les rangs des deux séries restent continus ; une série vidée n’est pas supprimée.\n\n' +
    'Idée, Brouillon ou Prêt : un contenu publié ne se déplace pas, sa série fait partie de l’historique de publication. Pour ' +
    'remettre toute une série en ordre : series_reordonner.\n\n' +
    'L’écriture part directement, sans aperçu, et laisse un geste dans le fil du contenu. Le journal de ce serveur garde la série, ' +
    'le rang et l’angle d’avant. Exige la case « Modifier les contenus » du consentement.',
  schema: z.object({
    id: ID,
    serie: ID.nullable().describe('La série d’arrivée (series_lister) ; la sienne pour changer de rang ; null pour l’en sortir.'),
    position: z.number().int().min(1).max(200).optional()
      .describe('Son rang dans la série d’arrivée, à partir de 1 ; par défaut, en dernier — dans sa propre série, il reste où il est.'),
    angle: z.string().max(2000).nullable().optional()
      .describe('Son angle dans la série d’arrivée ; absent, il reste tel quel ; null l’efface.'),
  }).strict(),
  annotations: idempotent(ECRITURE),
  async executer({ id, serie, position, angle }, env, contexte) {
    exigerEcritureContenus(contexte);
    if (serie === null && position !== undefined) {
      throw new Refus('Sans série, pas de position : retirer position, ou donner la série d’arrivée.');
    }
    const chemin = `/api/contents/${encodeURIComponent(id)}`;
    const avant = (await appelerConsole<Detail>(env, chemin)).content;
    if (serie === null && !avant.serieId && angle === undefined) {
      return texte(`RIEN À FAIRE — « ${avant.title} » n’appartient à aucune série. Rien n'est parti.`);
    }

    const corps = { serieId: serie, ...(position !== undefined ? { position } : {}), ...(angle !== undefined ? { angle } : {}) };
    const { numero, resultat } = await ecrireDansLaConsole(env, contexte, {
      outil: 'contenus_deplacer', cible: id,
      contenu: { corps, avant: { serieId: avant.serieId, seriePosition: avant.seriePosition, angle: avant.angle } },
      appel: () => appelerConsole<Deplacement>(env, `${chemin}/deplacer`, { methode: 'POST', corps }),
      ressources: (r) => [...new Set([id, ...[r.depart, r.arrivee].flatMap((x) => (x ? [x.serie.id] : []))])],
    });
    const c = resultat.content;
    if (resultat.inchange) {
      return texte(`RIEN À FAIRE — écriture n° ${numero} du journal, close sans changement : « ${c.title} » est déjà à cette place, avec cet angle.`);
    }
    const angleChange = (avant.angle ?? null) !== (c.angle ?? null);
    return texte(couper([
      `FAIT — écriture n° ${numero} du journal. « ${c.title || 'sans titre'} » : ${resultat.geste ?? 'seul l’angle a changé.'}`,
      ...(angleChange ? [`Angle : ${dire(avant.angle)} → ${dire(c.angle)}`] : []),
      ...(resultat.depart ? ['', ...numeroter(resultat.depart, resultat.arrivee || !c.serieId ? ', au départ' : '')] : []),
      ...(resultat.arrivee ? ['', ...numeroter(resultat.arrivee, ', à l’arrivée')] : []),
      ...(!c.serieId ? ['', 'Le contenu n’appartient plus à aucune série.'] : []),
      ...(angleChange
        ? ['', 'Un éditeur resté ouvert sur ce contenu dans la console réécrirait l’ancien angle : le rouvrir avant d’y retoucher.']
        : []),
    ].join('\n')));
  },
});

// ── series_reordonner ────────────────────────────────────────────────────

const reordonner = outil({
  name: 'series_reordonner',
  domaine: 'console',
  title: 'Réordonner une série',
  description:
    'Donne l’ordre complet d’une série de la console : chacun de ses contenus, une fois, dans l’ordre de la progression — la ' +
    'première publication ouvre le sujet, les suivantes s’appuient sur ce qui précède. Ni ajout ni oubli : sinon, la console ' +
    'refuse et rend la liste attendue, numérotée, avec les identifiants. Seuls les rangs changent ; aucun geste au fil des contenus.\n\n' +
    'Pour faire entrer un contenu dans une série, l’en sortir ou n’en déplacer qu’un : contenus_deplacer. L’écriture part ' +
    'directement, sans aperçu ; le journal de ce serveur garde l’ordre d’avant. Exige la case « Modifier les contenus » du consentement.',
  schema: z.object({
    id: ID.describe('La série (series_lister).'),
    ordre: z.array(ID).min(1).max(200).describe('Les identifiants de TOUS ses contenus, dans le nouvel ordre.'),
  }).strict(),
  annotations: idempotent(ECRITURE),
  async executer({ id, ordre }, env, contexte) {
    exigerEcritureContenus(contexte);
    const chemin = `/api/series/${encodeURIComponent(id)}`;
    const avant = await appelerConsole<SerieEtContenus>(env, chemin);
    const ancien = avant.contents.map((c) => c.id);
    if (ancien.length === ordre.length && ancien.every((x, i) => x === ordre[i])) {
      return texte(`RIEN À FAIRE — « ${avant.serie.titre} » est déjà dans cet ordre. Rien n'est parti.`);
    }
    const corps = { ids: ordre };
    const { numero, resultat } = await ecrireDansLaConsole(env, contexte, {
      outil: 'series_reordonner', cible: id, contenu: { corps, avant: ancien },
      appel: () => appelerConsole<SerieEtContenus>(env, `${chemin}/reordonner`, { methode: 'POST', corps }),
      ressources: (r) => [r.serie.id, ...r.contents.map((c) => c.id)],
    });
    return texte(couper([`FAIT — écriture n° ${numero} du journal.`, ...numeroter(resultat, ', remise en ordre')].join('\n')));
  },
});

export const OUTILS_CONTENUS = [lister, lire, listerSeries, creer, modifier, ecrireBrouillon, regrouper, deplacer, reordonner] as const;
