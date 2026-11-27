/**
 * La configuration RÉSOLUE d'un environnement de `wrangler.toml` (SPEC §14.8).
 *
 * Pourquoi la résoudre nous-mêmes : le déploiement de la recette et le jeu
 * d'essai doivent vérifier leur cible AVANT tout effet — quel Worker, quelles
 * bases, quelles routes. Wrangler ne donne ces valeurs qu'en déployant, ou en
 * construisant le Worker. Ce module lit le fichier, applique les règles
 * d'héritage de wrangler, et rend ce que la commande visera.
 *
 * **Ce qui s'hérite de la racine, et ce qui ne s'hérite pas** — la règle même
 * que le §14.8 demande de ne pas oublier :
 *   - `routes`, `triggers`, `workers_dev`, `main`, `compatibility_*`
 *     s'héritent : une recette qui ne les déclare pas vise les routes et les
 *     déclencheurs de la production ;
 *   - `vars` et toutes les liaisons (`d1_databases`, `r2_buckets`, `ai`…) ne
 *     s'héritent pas : absentes de la section, elles sont absentes ;
 *   - `name` s'hérite suffixé de `-<environnement>`.
 *
 * Le lecteur TOML ne couvre que ce que ce fichier emploie : sections, tableaux
 * de sections, chaînes, booléens, nombres, tableaux sur plusieurs lignes et
 * tables en ligne. Zéro dépendance : il tourne sous `node` nu, sur la VM comme
 * dans la CI.
 */

import { DECLENCHEURS } from '../src/declencheurs.ts';

type Valeur = string | number | boolean | Valeur[] | { [cle: string]: Valeur };
type Table = { [cle: string]: Valeur };

/** Retire un commentaire `#` qui n'est pas dans une chaîne. */
const sansCommentaire = (ligne: string): string => {
  let dansChaine = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (c === '"' && ligne[i - 1] !== '\\') dansChaine = !dansChaine;
    if (c === '#' && !dansChaine) return ligne.slice(0, i);
  }
  return ligne;
};

/** Lit une valeur TOML à partir de `i` ; rend la valeur et la position suivante. */
const lireValeur = (texte: string, i: number): [Valeur, number] => {
  const passer = () => { while (i < texte.length && /\s|,/.test(texte[i])) i++; };
  passer();
  const c = texte[i];
  if (c === '"') {
    const fin = texte.indexOf('"', i + 1);
    return [texte.slice(i + 1, fin), fin + 1];
  }
  if (c === '[') {
    const liste: Valeur[] = [];
    i++;
    for (;;) {
      passer();
      if (texte[i] === ']') return [liste, i + 1];
      const [v, j] = lireValeur(texte, i);
      liste.push(v);
      i = j;
    }
  }
  if (c === '{') {
    const table: Table = {};
    i++;
    for (;;) {
      passer();
      if (texte[i] === '}') return [table, i + 1];
      const egal = texte.indexOf('=', i);
      const cle = texte.slice(i, egal).trim();
      const [v, j] = lireValeur(texte, egal + 1);
      table[cle] = v;
      i = j;
    }
  }
  const m = /^(true|false|-?\d+(?:\.\d+)?)/.exec(texte.slice(i));
  if (!m) throw new Error(`wrangler.toml : valeur illisible près de « ${texte.slice(i, i + 30)} »`);
  const brut = m[1];
  return [brut === 'true' ? true : brut === 'false' ? false : Number(brut), i + brut.length];
};

/** Le fichier en une table imbriquée, comme un lecteur TOML complet la rendrait. */
export const lireToml = (source: string): Table => {
  const racine: Table = {};
  let courante: Table = racine;
  const lignes = source.split('\n').map(sansCommentaire);
  for (let n = 0; n < lignes.length; n++) {
    const ligne = lignes[n].trim();
    if (!ligne) continue;
    const section = /^(\[\[?)\s*([^\]]+?)\s*\]\]?$/.exec(ligne);
    if (section) {
      const chemin = section[2].split('.').map((p) => p.trim());
      let parent: Table = racine;
      for (const p of chemin.slice(0, -1)) {
        const suivant = parent[p];
        // Un tableau de tables : la section suivante complète son DERNIER élément.
        parent = (Array.isArray(suivant) ? suivant[suivant.length - 1] : (parent[p] ??= {})) as Table;
      }
      const dernier = chemin[chemin.length - 1];
      if (section[1] === '[[') {
        const liste = (parent[dernier] ??= []) as Valeur[];
        courante = {};
        liste.push(courante);
      } else {
        courante = (parent[dernier] ??= {}) as Table;
      }
      continue;
    }
    // Une valeur peut s'étendre sur plusieurs lignes : un tableau ouvert se lit jusqu'à sa fermeture.
    let texte = ligne;
    const profondeur = (t: string) => [...t.replace(/"[^"]*"/g, '')].reduce((d, c) => d + (c === '[' || c === '{' ? 1 : c === ']' || c === '}' ? -1 : 0), 0);
    while (profondeur(texte) > 0 && n + 1 < lignes.length) texte += '\n' + lignes[++n];
    const egal = texte.indexOf('=');
    const cle = texte.slice(0, egal).trim();
    courante[cle] = lireValeur(texte, egal + 1)[0];
  }
  return racine;
};

export type BaseD1 = { binding: string; databaseName: string; databaseId: string; migrationsDir: string };
export type Route = { pattern: string; customDomain: boolean };
export type LiaisonService = { binding: string; service: string; entrypoint: string | null };

/**
 * Les clés de wrangler.toml qui déclarent une liaison ou une ressource. Aucune
 * ne s'hérite ; la porte n'a droit qu'à `services` (§14.3 : ni base, ni secret,
 * ni KV). La liste est large exprès : une liaison qu'elle ne nommerait pas
 * passerait le contrôle sans être vue.
 */
const CLES_DE_LIAISON = [
  'd1_databases', 'kv_namespaces', 'r2_buckets', 'ai', 'services', 'durable_objects', 'queues',
  'vectorize', 'hyperdrive', 'analytics_engine_datasets', 'browser', 'ratelimits', 'unsafe',
  'send_email', 'secrets_store_secrets', 'workflows', 'assets', 'mtls_certificates', 'dispatch_namespaces',
] as const;

/** Ce que `wrangler … --env <nom>` vise, une fois l'héritage appliqué. */
export type Resolue = {
  environnement: string | null;
  name: string;
  workersDev: boolean;
  /** Les adresses d'aperçu, sur workers.dev elles aussi. Non déclarées : la valeur de `workers_dev`. */
  previewUrls: boolean;
  routes: string[];
  routesDetaillees: Route[];
  crons: string[];
  vars: Record<string, string>;
  d1: BaseD1[];
  r2: string[];
  ai: boolean;
  services: LiaisonService[];
  ratelimits: { name: string; namespaceId: string; limit: number; period: number }[];
  /** Les clés de liaison que la section déclare, quelles qu'elles soient. */
  liaisons: string[];
  observabilite: { enabled: boolean; headSamplingRate: number | null };
};

const HERITEES = ['routes', 'triggers', 'workers_dev', 'preview_urls', 'observability'] as const;

/** `null` : la racine — la production. */
export const resoudre = (source: string, environnement: string | null): Resolue => {
  const racine = lireToml(source);
  const envs = (racine.env ?? {}) as Record<string, Table>;
  if (environnement !== null && !envs[environnement]) {
    throw new Error(`wrangler.toml : aucune section [env.${environnement}]`);
  }
  const propre = environnement === null ? racine : envs[environnement];
  const valeur = (cle: (typeof HERITEES)[number] | 'name') => (cle in propre ? propre[cle] : racine[cle]);
  const name = environnement === null
    ? String(racine.name)
    : String(propre.name ?? `${racine.name}-${environnement}`);
  const triggers = (valeur('triggers') ?? {}) as Table;
  // Sans déclaration nulle part, wrangler ouvre workers.dev.
  const workersDev = (valeur('workers_dev') ?? true) as boolean;
  const routesDetaillees = ((valeur('routes') ?? []) as Valeur[]).map((r): Route => (typeof r === 'string'
    ? { pattern: r, customDomain: false }
    : { pattern: String((r as Table).pattern), customDomain: (r as Table).custom_domain === true }));
  const observabilite = (valeur('observability') ?? {}) as Table;
  return {
    environnement,
    name,
    workersDev,
    previewUrls: (valeur('preview_urls') ?? workersDev) as boolean,
    routes: routesDetaillees.map((r) => r.pattern),
    routesDetaillees,
    crons: ((triggers.crons ?? []) as Valeur[]).map(String),
    // Ni les variables ni les liaisons ne s'héritent : seule la section compte.
    vars: Object.fromEntries(Object.entries((propre.vars ?? {}) as Table).map(([k, v]) => [k, String(v)])),
    d1: ((propre.d1_databases ?? []) as Table[]).map((b) => ({
      binding: String(b.binding),
      databaseName: String(b.database_name),
      databaseId: String(b.database_id),
      migrationsDir: String(b.migrations_dir ?? 'migrations'),
    })),
    r2: ((propre.r2_buckets ?? []) as Table[]).map((b) => String(b.bucket_name)),
    ai: propre.ai !== undefined,
    services: ((propre.services ?? []) as Table[]).map((b) => ({
      binding: String(b.binding),
      service: String(b.service),
      entrypoint: b.entrypoint === undefined ? null : String(b.entrypoint),
    })),
    ratelimits: ((propre.ratelimits ?? []) as Table[]).map((b) => {
      const simple = (b.simple ?? {}) as Table;
      return { name: String(b.name), namespaceId: String(b.namespace_id), limit: Number(simple.limit), period: Number(simple.period) };
    }),
    liaisons: CLES_DE_LIAISON.filter((cle) => propre[cle] !== undefined),
    observabilite: {
      enabled: observabilite.enabled === true,
      headSamplingRate: typeof observabilite.head_sampling_rate === 'number' ? observabilite.head_sampling_rate : null,
    },
  };
};

// ─── Ce que la recette doit être (SPEC §14.8) ───────────────────────────────

export const RECETTE = {
  worker: 'gestion-luminose-worker-recette',
  domaine: 'gestion-recette.luminose.fr',
  pagesProjet: 'luminose-gestion-recette',
  pagesBranche: 'main',
  gestion: 'luminose-gestion-recette',
  clients: 'luminose-clients-recette',
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Les écarts entre la recette déclarée et ce qu'elle doit être. Vide : la cible
 * est la bonne. Chaque écart est une raison de ne rien lancer.
 *
 * La comparaison avec la racine est le cœur du contrôle : un identifiant de
 * base recopié depuis la production, une route oubliée — héritée —, et la
 * recette écrirait dans la production.
 */
export const ecartsRecette = (source: string): string[] => {
  const ecarts: string[] = [];
  const r = resoudre(source, 'recette');
  const prod = resoudre(source, null);
  const idsProduction = new Set(prod.d1.map((b) => b.databaseId));

  if (r.name !== RECETTE.worker) ecarts.push(`Worker « ${r.name} », attendu « ${RECETTE.worker} »`);
  if (r.name === prod.name) ecarts.push('le Worker de recette porte le nom de celui de la production');
  if (r.workersDev) ecarts.push('workers_dev doit valoir false : la recette n’a pas d’adresse workers.dev');
  // Le passage des portes, et lui seul : un déclencheur hérité de la racine
  // lancerait la veille des modèles en recette (§14.7).
  if (JSON.stringify(r.crons) !== JSON.stringify([DECLENCHEURS.passage])) {
    ecarts.push(`déclencheurs planifiés hérités ou déclarés (${r.crons.join(', ') || 'aucun'}) : crons = ["${DECLENCHEURS.passage}"] attendu`);
  }
  const routesAttendues = [`${RECETTE.domaine}/api/*`, `${RECETTE.domaine}/auth/*`];
  if (JSON.stringify([...r.routes].sort()) !== JSON.stringify(routesAttendues.sort())) {
    ecarts.push(`routes ${JSON.stringify(r.routes)}, attendues ${JSON.stringify(routesAttendues)}`);
  }
  if (r.vars.ENVIRONNEMENT !== 'recette') ecarts.push('vars.ENVIRONNEMENT doit valoir "recette"');
  if (r.r2.length > 0 || r.ai) ecarts.push('ni R2 ni Workers AI en recette : ces liaisons sont facultatives');

  const attendues: [string, string, string][] = [
    ['DB', RECETTE.gestion, 'migrations'],
    ['CLIENTS', RECETTE.clients, 'migrations-clients'],
  ];
  if (r.d1.length !== attendues.length) ecarts.push(`${r.d1.length} bases D1 déclarées, ${attendues.length} attendues`);
  for (const [binding, nom, dossier] of attendues) {
    const b = r.d1.find((x) => x.binding === binding);
    if (!b) { ecarts.push(`liaison ${binding} absente`); continue; }
    if (b.databaseName !== nom) ecarts.push(`${binding} : base « ${b.databaseName} », attendue « ${nom} »`);
    if (b.migrationsDir !== dossier) ecarts.push(`${binding} : migrations_dir « ${b.migrationsDir} », attendu « ${dossier} »`);
    if (!UUID.test(b.databaseId)) ecarts.push(`${binding} : database_id « ${b.databaseId} » n’est pas un identifiant (wrangler d1 create ${nom})`);
    if (idsProduction.has(b.databaseId)) ecarts.push(`${binding} : database_id est celui d’une base de la PRODUCTION`);
  }
  return ecarts;
};

// ─── La porte de recette (SPEC §14.3, §14.5, §14.8) ─────────────────────────

export const PORTE_RECETTE = {
  worker: 'luminose-porte-recette',
  domaine: 'api-recette.luminose.fr',
  /** La page d'essai (§14.5), servie par la porte de recette sur une origine à elle. */
  domaineEssai: 'essai-recette.luminose.fr',
  origineSite: 'https://essai-recette.luminose.fr',
  originePorte: 'https://api-recette.luminose.fr',
  /**
   * Les seules liaisons de service de la porte : des entrées nommées de
   * gestion DE RECETTE. `Essai` se retire au dernier commit de la phase S2b.
   */
  services: [
    { binding: 'GESTION_ESSAI', service: RECETTE.worker, entrypoint: 'Essai' },
    { binding: 'GESTION_PUBLIQUE', service: RECETTE.worker, entrypoint: 'PortePublique' },
    { binding: 'GESTION_SERVICE', service: RECETTE.worker, entrypoint: 'PorteService' },
  ] as LiaisonService[],
  /** Les limiteurs de fréquence (§14.5) : un par route publique. */
  limiteurs: ['LIMITE_LIENS', 'LIMITE_QUESTIONNAIRES'],
} as const;

/**
 * Les écarts entre la porte de recette déclarée (workers/porte/wrangler.toml)
 * et ce qu'elle doit être. Vide : la cible est la bonne.
 *
 * Ce qui est refusé, c'est tout ce qui la relierait à la production : une
 * route héritée ou recopiée, une adresse workers.dev, une liaison vers le
 * Worker de gestion de production, une base, un KV, un secret.
 */
export const ecartsPorteRecette = (source: string): string[] => {
  const ecarts: string[] = [];
  const r = resoudre(source, 'recette');
  const racine = resoudre(source, null);

  if (r.name !== PORTE_RECETTE.worker) ecarts.push(`Worker « ${r.name} », attendu « ${PORTE_RECETTE.worker} »`);
  if (r.name === racine.name) ecarts.push('la porte de recette porte le nom de la racine');
  if (r.workersDev) ecarts.push('workers_dev doit valoir false : la porte n’a pas d’adresse workers.dev');
  if (r.previewUrls) ecarts.push('preview_urls doit valoir false : une adresse d’aperçu mènerait à la porte hors de son domaine');
  if (r.crons.length > 0) ecarts.push(`déclencheurs planifiés hérités ou déclarés (${r.crons.join(', ')}) : crons = [] attendu`);
  const routesAttendues: Route[] = [PORTE_RECETTE.domaine, PORTE_RECETTE.domaineEssai].map((pattern) => ({ pattern, customDomain: true }));
  if (JSON.stringify(r.routesDetaillees) !== JSON.stringify(routesAttendues)) {
    ecarts.push(`routes ${JSON.stringify(r.routesDetaillees)}, attendues ${PORTE_RECETTE.domaine} et ${PORTE_RECETTE.domaineEssai} en domaines personnalisés (custom_domain = true)`);
  }
  if (r.vars.ENVIRONNEMENT !== 'recette') ecarts.push('vars.ENVIRONNEMENT doit valoir "recette"');
  if (r.vars.ORIGINE_SITE !== PORTE_RECETTE.origineSite) ecarts.push(`vars.ORIGINE_SITE doit valoir "${PORTE_RECETTE.origineSite}"`);
  if (r.vars.ORIGINE_PORTE !== PORTE_RECETTE.originePorte) ecarts.push(`vars.ORIGINE_PORTE doit valoir "${PORTE_RECETTE.originePorte}"`);
  const limiteurs = r.ratelimits.map((l) => l.name).sort();
  if (JSON.stringify(limiteurs) !== JSON.stringify(PORTE_RECETTE.limiteurs)) {
    ecarts.push(`limiteurs [${limiteurs.join(', ')}], attendus [${PORTE_RECETTE.limiteurs.join(', ')}]`);
  }
  for (const l of r.ratelimits) {
    if (!(l.limit > 0) || ![10, 60].includes(l.period)) ecarts.push(`${l.name} : limite ${l.limit} sur ${l.period} s — une limite positive, sur 10 ou 60 secondes`);
  }
  const autres = r.liaisons.filter((l) => l !== 'services' && l !== 'ratelimits');
  if (autres.length > 0) ecarts.push(`liaisons interdites à la porte (ni base, ni KV, ni secret — §14.3) : ${autres.join(', ')}`);
  for (const s of r.services) {
    if (s.service !== RECETTE.worker) ecarts.push(`${s.binding} : lié à « ${s.service} », seul « ${RECETTE.worker} » est admis en recette`);
  }
  const vu = (l: LiaisonService) => `${l.binding} → ${l.service}#${l.entrypoint ?? '(défaut)'}`;
  const declarees = r.services.map(vu).sort();
  const attendues = PORTE_RECETTE.services.map(vu).sort();
  if (JSON.stringify(declarees) !== JSON.stringify(attendues)) {
    ecarts.push(`liaisons de service [${declarees.join(', ')}], attendues [${attendues.join(', ')}]`);
  }
  return ecarts;
};
