/**
 * Google Tag Manager, en lecture — décision du 08/10/2026
 * (workers/mcp/decisions/2026-10-08-gtm.md). Trois outils : la vue
 * d'ensemble du conteneur, son contenu, et la comparaison de ses balises de
 * conversion avec les conversions Google Ads actives — les deux côtés lus
 * par le serveur, là où une recopie d'identifiant se trompe en silence.
 *
 * Aucun n'écrit. L'accès, sa table fermée et ses refus sont gtm.ts.
 */
import { z } from 'zod';
import {
  conteneurGtm, contenuEspace, espaces, modifications, versionEnLigne,
  type Balise, type Condition, type Contenu, type Declencheur, type Espace, type Modification, type Parametre, type Variable,
} from './gtm';
import { connexionPour, estUnCompte, normaliserCompte, rechercher } from './google-ads';
import { LECTURE, outil, texte } from './outil';
import { Refus } from './refus';
import type { Env } from './env';

/** Le plafond de sortie d'ads_requete : au-delà, la réponse est coupée, et le dit. */
const MAX_CARACTERES = 50_000;
/** Les espaces de travail dont la vue d'ensemble lit les modifications — trois dans la version gratuite de GTM. */
const MAX_ESPACES = 3;

const ID = z.string().regex(/^\d{1,20}$/, 'identifiant numérique');

// ── Nommer ce que l'API rend ─────────────────────────────────────────────

const TYPES_BALISES: Record<string, string> = {
  awct: 'Conversion Google Ads',
  awcc: 'Appels depuis le site (Google Ads)',
  awud: "Données fournies par l'utilisateur (Google Ads)",
  sp: 'Remarketing Google Ads',
  gclidw: 'Linker de conversion',
  googtag: 'Balise Google',
  gaawe: 'Événement GA4',
  gaawc: 'Configuration GA4 (ancienne)',
  ua: 'Universal Analytics (arrêté)',
  html: 'HTML personnalisé',
  img: 'Image personnalisée',
  flc: 'Floodlight (compteur)',
  fls: 'Floodlight (ventes)',
};

const TYPES_DECLENCHEURS: Record<string, string> = {
  pageview: 'Vue de page',
  domReady: 'DOM prêt',
  windowLoaded: 'Fenêtre chargée',
  customEvent: 'Événement personnalisé',
  click: 'Clic sur un élément',
  linkClick: 'Clic sur un lien',
  formSubmission: 'Envoi de formulaire',
  timer: 'Minuteur',
  historyChange: "Changement d'historique",
  jsError: 'Erreur JavaScript',
  scrollDepth: 'Défilement',
  elementVisibility: "Visibilité d'un élément",
  youTubeVideo: 'Vidéo YouTube',
  init: 'Initialisation',
  consentInit: 'Initialisation du consentement',
  triggerGroup: 'Groupe de déclencheurs',
};

/** Les déclencheurs intégrés de GTM : absents des listes, présents dans les balises par leur identifiant. */
const DECLENCHEURS_INTEGRES: Record<string, string> = {
  2147479553: 'All Pages (toutes les pages)',
  2147479572: 'Consent Initialization - All Pages',
  2147479573: 'Initialization - All Pages',
};

const TYPES_VARIABLES: Record<string, string> = {
  v: 'Couche de données',
  c: 'Constante',
  u: 'URL',
  j: 'Variable JavaScript',
  jsm: 'JavaScript personnalisé',
  k: 'Cookie propriétaire',
  d: 'Élément DOM',
  f: 'Référent',
  e: 'Événement',
  smm: 'Table de correspondance',
  remm: "Table d'expressions régulières",
  aev: "Variable d'événement automatique",
  gas: 'Paramètres Google Analytics',
  awec: "Données fournies par l'utilisateur",
  r: 'Nombre aléatoire',
  vis: "Visibilité d'un élément",
  ctv: 'Version du conteneur',
};

const OPERATEURS: Record<string, string> = {
  equals: 'égale',
  contains: 'contient',
  startsWith: 'commence par',
  endsWith: 'finit par',
  matchRegex: 'correspond à',
  greater: '>',
  greaterOrEquals: '≥',
  less: '<',
  lessOrEquals: '≤',
  cssSelector: 'correspond au sélecteur',
  urlMatches: "l'URL correspond à",
};

const nomType = (table: Record<string, string>, t: string | undefined) =>
  (!t ? '?' : table[t] ? `${table[t]} (${t})` : t.startsWith('cvt_') ? `modèle personnalisé (${t})` : t);

const param = (ps: Parametre[] | undefined, cle: string) => ps?.find((p) => p.key === cle)?.value;

const couper = (t: string, max: number) => (t.length > max ? `${t.slice(0, max)}… (${t.length} caractères)` : t);

/** Une valeur de paramètre sur une ligne : le code d'une balise HTML se lit en entier avec `recherche`. */
const valeur = (p: Parametre, max: number): string => {
  if (p.list) return `[${p.list.map((x) => valeur(x, max)).join(', ')}]`;
  if (p.map) return `{ ${p.map.map((x) => `${x.key ?? '?'}: ${valeur(x, max)}`).join(', ')} }`;
  return couper((p.value ?? '').replace(/\s+/g, ' ').trim(), max);
};

const condition = (c: Condition): string => {
  const non = param(c.parameter, 'negate') === 'true';
  const op = OPERATEURS[c.type ?? ''] ?? c.type ?? '?';
  return `${non ? 'NON ' : ''}${param(c.parameter, 'arg0') ?? '?'} ${op} « ${param(c.parameter, 'arg1') ?? ''} »`;
};

const resumeDeclencheur = (d: Declencheur): string => {
  const conditions = [...(d.customEventFilter ?? []), ...(d.filter ?? []), ...(d.autoEventFilter ?? [])].map(condition);
  return `${nomType(TYPES_DECLENCHEURS, d.type)}${conditions.length ? ` — ${conditions.join(' ET ')}` : ''}`;
};

const indexDeclencheurs = (c: Contenu) => new Map(c.declencheurs.map((d) => [String(d.triggerId), d]));

const nomDeclencheur = (id: string, index: Map<string, Declencheur>): string => {
  if (DECLENCHEURS_INTEGRES[id]) return `« ${DECLENCHEURS_INTEGRES[id]} »`;
  const d = index.get(id);
  return d ? `« ${d.name ?? '?'} » (${resumeDeclencheur(d)})` : `n° ${id} (introuvable)`;
};

/** Pour chercher un nom sans se soucier des accents ni de la casse. */
const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ── Présenter un contenu ─────────────────────────────────────────────────

type Quoi = 'tout' | 'balises' | 'declencheurs' | 'variables';

const blocBalise = (b: Balise, index: Map<string, Declencheur>, max: number): string[] => [
  `### « ${b.name ?? '?'} » — ${nomType(TYPES_BALISES, b.type)}${b.paused ? ' — EN PAUSE' : ''}`,
  `- Déclenchée par : ${b.firingTriggerId?.length ? b.firingTriggerId.map((id) => nomDeclencheur(id, index)).join(', ') : 'AUCUN DÉCLENCHEUR — elle ne part jamais'}`,
  ...(b.blockingTriggerId?.length ? [`- Bloquée par : ${b.blockingTriggerId.map((id) => nomDeclencheur(id, index)).join(', ')}`] : []),
  ...(b.setupTag?.length ? [`- Après : ${b.setupTag.map((s) => `« ${s.tagName ?? '?'} »`).join(', ')}`] : []),
  ...(b.teardownTag?.length ? [`- Puis : ${b.teardownTag.map((s) => `« ${s.tagName ?? '?'} »`).join(', ')}`] : []),
  ...(b.consentSettings?.consentStatus && b.consentSettings.consentStatus !== 'notSet'
    ? [`- Consentement : ${b.consentSettings.consentStatus}${b.consentSettings.consentType ? ` ${valeur(b.consentSettings.consentType, max)}` : ''}`] : []),
  ...(b.parameter ?? []).map((p) => `- ${p.key ?? '?'} = ${valeur(p, max)}`),
];

const blocDeclencheur = (d: Declencheur, utilisateurs: string[], max: number): string[] => [
  `### « ${d.name ?? '?'} » — ${resumeDeclencheur(d)}`,
  `- Balises : ${utilisateurs.length ? utilisateurs.map((n) => `« ${n} »`).join(', ') : 'aucune'}`,
  ...(d.parameter ?? []).map((p) => `- ${p.key ?? '?'} = ${valeur(p, max)}`),
];

const blocVariable = (v: Variable, max: number): string[] => [
  `### {{${v.name ?? '?'}}} — ${nomType(TYPES_VARIABLES, v.type)}`,
  ...(v.parameter ?? []).map((p) => `- ${p.key ?? '?'} = ${valeur(p, max)}`),
];

/** Coupe à MAX_CARACTERES et le dit en tête : un audit sur une liste incomplète tromperait. */
const plafonner = (entete: string, lignes: string[]): string => {
  const gardees: string[] = [];
  let taille = entete.length;
  for (const l of lignes) {
    if (taille + l.length + 1 > MAX_CARACTERES) {
      return [`SORTIE TRONQUÉE — ${gardees.length} ligne(s) sur ${lignes.length} (plafond : 50 000 caractères). Affiner avec quoi ou recherche.`,
        '', entete, ...gardees].join('\n');
    }
    gardees.push(l);
    taille += l.length + 1;
  }
  return [entete, ...gardees].join('\n');
};

// ── Les espaces de travail ───────────────────────────────────────────────

const ENTITES: [keyof Modification, string][] = [['tag', 'balise'], ['trigger', 'déclencheur'], ['variable', 'variable'], ['folder', 'dossier']];
const STATUTS: Record<string, string> = { added: 'ajouté', updated: 'modifié', deleted: 'supprimé' };

const modification = (m: Modification): string => {
  const [cle, quoi] = ENTITES.find(([k]) => m[k]) ?? [undefined, 'élément'];
  const nom = cle ? (m[cle] as { name?: string }).name : undefined;
  return `${STATUTS[m.changeStatus ?? ''] ?? m.changeStatus ?? '?'} : ${quoi} « ${nom ?? '?'} »`;
};

const trouverEspace = async (env: Env, c: Awaited<ReturnType<typeof conteneurGtm>>, id: string): Promise<Espace> => {
  const liste = await espaces(env, c);
  const e = liste.find((x) => x.workspaceId === id);
  if (!e) {
    throw new Refus(`Espace de travail ${id} introuvable dans ${c.publicId}. Espaces : ` +
      `${liste.map((x) => `« ${x.name ?? '?'} » (${x.workspaceId})`).join(', ') || 'aucun'}.`);
  }
  return e;
};

// ── gtm_conteneur ────────────────────────────────────────────────────────

const conteneur = outil({
  name: 'gtm_conteneur',
  title: 'Google Tag Manager — vue d’ensemble',
  description: [
    'Le conteneur Google Tag Manager du site (GTM_CONTENEUR du serveur), en LECTURE seule : sa version en ligne — ce que le site ' +
    'exécute —, le nombre de balises par type, de déclencheurs et de variables, et ses espaces de travail avec ce qu’ils changent ' +
    'sans être publiés. Le détail se lit avec gtm_lire ; la comparaison avec les conversions Google Ads, avec gtm_verifier_conversions.',
    '',
    'Ce serveur ne modifie ni ne publie rien dans Tag Manager : son jeton ne le permet pas.',
  ].join('\n'),
  schema: z.object({}).strict(),
  annotations: LECTURE,
  async executer(_args, env) {
    const c = await conteneurGtm(env);
    const [v, liste] = await Promise.all([versionEnLigne(env, c), espaces(env, c)]);
    const lus = liste.slice(0, MAX_ESPACES);
    const changements = await Promise.all(lus.map((e) => modifications(env, c, String(e.workspaceId))));

    const parType = new Map<string, number>();
    for (const b of v.balises) parType.set(nomType(TYPES_BALISES, b.type), (parType.get(nomType(TYPES_BALISES, b.type)) ?? 0) + 1);
    const enPause = v.balises.filter((b) => b.paused).length;
    const sansDeclencheur = v.balises.filter((b) => !b.firingTriggerId?.length).length;

    return texte([
      `Conteneur ${c.publicId}${c.name ? ` « ${c.name} »` : ''} — compte ${c.accountId}, conteneur ${c.containerId}` +
      `${c.domainName?.length ? ` ; domaines : ${c.domainName.join(', ')}` : ''}.`,
      ...(c.tagManagerUrl ? [`Lien : ${c.tagManagerUrl}`] : []),
      '',
      `En ligne — ${v.source} : ${v.balises.length} balise(s)${enPause ? `, dont ${enPause} en pause` : ''}` +
      `${sansDeclencheur ? `, dont ${sansDeclencheur} sans déclencheur` : ''} ; ${v.declencheurs.length} déclencheur(s) ; ` +
      `${v.variables.length} variable(s), et ${v.integrees.length} variable(s) intégrée(s) activée(s).`,
      ...[...parType.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `- ${n} × ${t}`),
      '',
      `Espaces de travail (${liste.length}) :`,
      ...lus.map((e, i) => {
        const m = changements[i];
        return `- « ${e.name ?? '?'} » (${e.workspaceId}) : ${m.length ? `${m.length} modification(s) non publiée(s) — ${m.map(modification).join(' ; ')}` : 'aucune modification non publiée'}`;
      }),
      ...(liste.length > lus.length ? [`- … et ${liste.length - lus.length} autre(s), non lus.`] : []),
    ].join('\n'));
  },
});

// ── gtm_lire ─────────────────────────────────────────────────────────────

const lire = outil({
  name: 'gtm_lire',
  title: 'Google Tag Manager — balises, déclencheurs, variables',
  description: [
    'Le contenu du conteneur Google Tag Manager du site, en LECTURE seule : chaque balise avec son type, ses déclencheurs ' +
    '(conditions comprises), ses paramètres, son état ; chaque déclencheur avec les balises qu’il fait partir ; chaque variable.',
    '',
    'Par défaut, la version en ligne : ce que le site exécute. Avec espace (identifiant donné par gtm_conteneur) : ce qu’un espace ' +
    'de travail publierait. quoi restreint à balises, declencheurs ou variables ; recherche filtre sur le nom, sans tenir compte ' +
    'des accents ni de la casse, et montre alors les valeurs en entier — le code d’une balise HTML personnalisé, par exemple. ' +
    'Sans recherche, chaque valeur est coupée à 300 caractères ; la sortie, à 50 000.',
  ].join('\n'),
  schema: z.object({
    espace: ID.optional().describe('Identifiant d’un espace de travail (workspaceId). Absent : la version en ligne.'),
    quoi: z.enum(['tout', 'balises', 'declencheurs', 'variables']).optional().describe('Par défaut : tout.'),
    recherche: z.string().min(1).max(100).optional().describe('Un morceau du nom cherché.'),
  }).strict(),
  annotations: LECTURE,
  async executer({ espace, quoi = 'tout', recherche }, env) {
    const c = await conteneurGtm(env);
    const contenu = espace ? await contenuEspace(env, c, await trouverEspace(env, c, espace)) : await versionEnLigne(env, c);
    const max = recherche ? 20_000 : 300;
    const garde = (nom: string | undefined) => !recherche || normal(nom ?? '').includes(normal(recherche));
    const index = indexDeclencheurs(contenu);
    const voir = (q: Quoi) => quoi === 'tout' || quoi === q;

    const balises = contenu.balises.filter((b) => garde(b.name));
    const declencheurs = contenu.declencheurs.filter((d) => garde(d.name));
    const variables = contenu.variables.filter((v) => garde(v.name));
    const lignes: string[] = [
      ...(voir('balises') ? ['', `## Balises (${balises.length})`, ...balises.flatMap((b) => ['', ...blocBalise(b, index, max)])] : []),
      ...(voir('declencheurs') ? ['', `## Déclencheurs (${declencheurs.length})`, ...declencheurs.flatMap((d) => ['',
        ...blocDeclencheur(d, contenu.balises.filter((b) => [...(b.firingTriggerId ?? []), ...(b.blockingTriggerId ?? [])]
          .includes(String(d.triggerId))).map((b) => b.name ?? '?'), max)])] : []),
      ...(voir('variables') ? ['', `## Variables (${variables.length})`, ...variables.flatMap((v) => ['', ...blocVariable(v, max)]),
        ...(recherche ? [] : ['', `Variables intégrées activées : ${contenu.integrees.map((n) => `{{${n}}}`).join(', ') || 'aucune'}.`])] : []),
    ];
    const entete = `${c.publicId} — ${contenu.source}${recherche ? `, noms contenant « ${recherche} »` : ''}.` +
      `${contenu.tronque ? ' LISTE INCOMPLÈTE : une liste de Tag Manager dépasse cinq pages.' : ''}`;
    return texte(plafonner(entete, lignes));
  },
});

// ── gtm_verifier_conversions ─────────────────────────────────────────────

/** `AW-11038825595/m_WhCOKjvIcYEPu43I8p` — dans un extrait d'événement Google Ads comme dans une balise. */
const ENVOI = /AW-(\d+)\/([A-Za-z0-9_-]+)/;

type LigneConversion = {
  conversionAction?: { id?: string; name?: string; type?: string; tagSnippets?: { eventSnippet?: string }[] };
};
type Attendue = { nom: string; type: string; aw?: string; libelle?: string };
/** `variables` : celles qui ne se résolvent qu'au chargement de la page. */
type BaliseConversion = { balise: Balise; aw?: string; libelle?: string; variables: string[] };

/**
 * Une valeur de paramètre, la variable résolue quand c'est une constante :
 * `{{ID Google Ads}}` est souvent une variable de type « c ». Une autre
 * variable ne se résout qu'au chargement de la page : elle reste nommée.
 */
const resoudre = (v: string | undefined, variables: Variable[]): { valeur?: string; via?: string } => {
  const m = /^\{\{(.+)\}\}$/.exec((v ?? '').trim());
  if (!m) return { valeur: v?.trim() };
  const variable = variables.find((x) => x.name === m[1]);
  return variable?.type === 'c' ? { valeur: param(variable.parameter, 'value')?.trim(), via: m[1] } : { via: m[1] };
};

const TYPES_CONVERSION = ['awct', 'awcc'];

const balisesDeConversion = (contenu: Contenu): BaliseConversion[] => contenu.balises
  .filter((b) => TYPES_CONVERSION.includes(b.type ?? ''))
  .map((b) => {
    const id = resoudre(param(b.parameter, 'conversionId'), contenu.variables);
    const libelle = resoudre(param(b.parameter, 'conversionLabel'), contenu.variables);
    return {
      balise: b,
      aw: id.valeur?.replace(/^AW-/, ''),
      libelle: libelle.valeur,
      variables: [id, libelle].filter((x) => x.via && !x.valeur).map((x) => x.via!),
    };
  });

const etatBalise = (b: Balise, index: Map<string, Declencheur>): string =>
  b.paused ? 'EN PAUSE' : !b.firingTriggerId?.length ? 'AUCUN DÉCLENCHEUR' : `déclenchée par ${b.firingTriggerId.map((id) => nomDeclencheur(id, index)).join(', ')}`;

const verifier = outil({
  name: 'gtm_verifier_conversions',
  title: 'Conversions Google Ads ↔ balises Tag Manager',
  description: [
    'Compare, en LECTURE seule, les conversions Google Ads actives du compte Luminose aux balises de conversion du conteneur ' +
    'Google Tag Manager du site : pour chaque conversion mesurée sur le site, la balise qui porte son identifiant et son libellé ' +
    '(AW-…/…), active ou en pause, et ses déclencheurs. Signale les conversions sans balise, les balises en double, en pause ou ' +
    'sans déclencheur, les balises dont le libellé ne correspond à aucune conversion active, et la présence de la balise Google ' +
    'et du linker de conversion. Les identifiants passés par une variable constante sont résolus.',
    '',
    'Par défaut, la version en ligne : ce que le site exécute. Avec espace : ce qu’un espace de travail publierait.',
  ].join('\n'),
  schema: z.object({
    espace: ID.optional().describe('Identifiant d’un espace de travail (workspaceId). Absent : la version en ligne.'),
  }).strict(),
  annotations: LECTURE,
  async executer({ espace }, env) {
    const brut = env.GOOGLE_ADS_CUSTOMER_ID;
    const compte = normaliserCompte(brut ?? '');
    if (!estUnCompte(compte)) throw new Refus('GOOGLE_ADS_CUSTOMER_ID n\'est pas posé sur le Worker MCP : rien à comparer.', 503);

    const c = await conteneurGtm(env);
    const [reponse, contenu] = await Promise.all([
      rechercher(env, compte,
        'SELECT conversion_action.id, conversion_action.name, conversion_action.type, conversion_action.status, conversion_action.tag_snippets ' +
        "FROM conversion_action WHERE conversion_action.status = 'ENABLED'", connexionPour(env, compte)),
      espace ? trouverEspace(env, c, espace).then((e) => contenuEspace(env, c, e)) : versionEnLigne(env, c),
    ]);

    const attendues: Attendue[] = ((reponse.results ?? []) as LigneConversion[]).map(({ conversionAction: a = {} }) => {
      const envoi = (a.tagSnippets ?? []).map((s) => ENVOI.exec(s.eventSnippet ?? '')).find(Boolean);
      return { nom: a.name ?? a.id ?? '?', type: a.type ?? '?', aw: envoi?.[1], libelle: envoi?.[2] };
    });
    const balises = balisesDeConversion(contenu);
    const index = indexDeclencheurs(contenu);
    const correspond = (a: Attendue, b: BaliseConversion) => b.aw === a.aw && b.libelle === a.libelle;

    const surLeSite = attendues.filter((a) => a.libelle && a.type !== 'WEBPAGE_CODELESS');
    const sansCode = attendues.filter((a) => a.libelle && a.type === 'WEBPAGE_CODELESS');
    const horsSite = attendues.filter((a) => !a.libelle);

    let ok = 0;
    let aVoir = 0;
    let manque = 0;
    const lignesSite = surLeSite.map((a) => {
      const trouvees = balises.filter((b) => correspond(a, b));
      const actives = trouvees.filter((b) => !b.balise.paused && b.balise.firingTriggerId?.length);
      const tete = `« ${a.nom} » (${a.type}, AW-${a.aw}/${a.libelle})`;
      if (trouvees.length === 0) { manque++; return `- MANQUE — ${tete} : aucune balise dans ${contenu.source}.`; }
      const detail = trouvees.map((b) => `balise « ${b.balise.name ?? '?'} » ${etatBalise(b.balise, index)}`).join(' ; ');
      if (actives.length === 1) { ok++; return `- OK — ${tete} : ${detail}.`; }
      aVoir++;
      return `- À VOIR — ${tete} : ${actives.length > 1 ? `${actives.length} balises actives, la conversion peut compter double — ` : 'aucune balise active — '}${detail}.`;
    });

    const orphelines = balises.filter((b) => b.aw && b.libelle && !attendues.some((a) => correspond(a, b)));
    const nonResolues = balises.filter((b) => !b.aw || !b.libelle);

    // La balise Google du compte : les conversions sans code en dépendent.
    const aw = attendues.find((a) => a.aw)?.aw;
    const googleTags = contenu.balises.filter((b) => b.type === 'googtag' && aw && resoudre(param(b.parameter, 'tagId'), contenu.variables).valeur === `AW-${aw}`);
    const linkers = contenu.balises.filter((b) => b.type === 'gclidw');

    return texte([
      `Conversions Google Ads actives du compte ${compte}, comparées à ${contenu.source} du conteneur ${c.publicId}.` +
      `${contenu.tronque ? ' LISTE INCOMPLÈTE : une liste de Tag Manager dépasse cinq pages.' : ''}`,
      `Mesurées sur le site par une balise : ${surLeSite.length} — ${ok} OK, ${aVoir} à voir, ${manque} sans balise. ` +
      `Sans code : ${sansCode.length}. Hors du site : ${horsSite.length}.`,
      '',
      '## Mesurées sur le site par une balise',
      ...(lignesSite.length ? lignesSite : ['- aucune']),
      '',
      '## Sans code',
      ...(sansCode.length
        ? sansCode.map((a) => {
          const b = balises.filter((x) => correspond(a, x));
          return `- « ${a.nom} » (AW-${a.aw}/${a.libelle}) : ${b.length ? `balise « ${b[0].balise.name ?? '?'} » ${etatBalise(b[0].balise, index)}` : 'pas de balise dédiée — Google Ads la détecte par une règle, à travers la balise Google du compte'}.`;
        })
        : ['- aucune']),
      '',
      '## Hors du site — aucune balise attendue',
      ...(horsSite.length ? horsSite.map((a) => `- « ${a.nom} » (${a.type})`) : ['- aucune']),
      '',
      '## Balises de conversion sans conversion active',
      ...(orphelines.length
        ? orphelines.map((b) => `- « ${b.balise.name ?? '?'} » (AW-${b.aw}/${b.libelle}) ${etatBalise(b.balise, index)} : ` +
          `${aw && b.aw !== aw ? `un autre compte Google Ads (AW-${b.aw})` : 'conversion supprimée, désactivée, ou libellé mal recopié'}.`)
        : ['- aucune']),
      ...(nonResolues.length
        ? ['', '## Balises de conversion à identifiant variable — non comparées',
          ...nonResolues.map((b) => `- « ${b.balise.name ?? '?'} » : ${b.variables.length
            ? `${b.variables.map((v) => `{{${v}}}`).join(', ')} ne se ${b.variables.length > 1 ? 'résolvent' : 'résout'} qu'au chargement de la page`
            : 'identifiant ou libellé absent'}.`)]
        : []),
      '',
      '## Balise Google et linker',
      aw
        ? (googleTags.length
          ? `- Balise Google AW-${aw} : ${googleTags.map((b) => `« ${b.name ?? '?'} » ${etatBalise(b, index)}`).join(' ; ')}.`
          : `- Balise Google AW-${aw} : absente de ${contenu.source}. Les conversions sans code en dépendent : elle doit être posée ailleurs sur le site.`)
        : '- Aucune conversion active ne donne l\'identifiant AW- du compte.',
      linkers.length
        ? `- Linker de conversion : ${linkers.map((b) => `« ${b.name ?? '?'} » ${etatBalise(b, index)}`).join(' ; ')}.`
        : '- Linker de conversion : absent. Google le recommande avec les balises de conversion Google Ads.',
    ].join('\n'));
  },
});

export const OUTILS_GTM = [conteneur, lire, verifier] as const;
