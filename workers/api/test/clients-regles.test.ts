/**
 * Les règles de la base des clients qui se vérifient sur le code et sur les
 * routes (SPEC §14.2, §14.10) : la séparation des deux bases (règle 1), la
 * liaison facultative (règle 2), le module unique des tables sensibles
 * (règle 3), la fermeture au serveur MCP, l'export, et l'origine acceptée
 * selon l'environnement (§14.5, §14.8).
 *
 * Les règles 1 et 3 lisent les SOURCES : c'est le seul moyen de vérifier
 * « même indirectement » et « aucun autre fichier ». Un test qui exercerait
 * les routes ne verrait que les chemins qu'il emprunte.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import app from '../src/index';
import { createSessionToken } from '../src/auth';
import { MESSAGE_NON_RELIEE } from '../src/clients/base';
import { TABLES_SENSIBLES } from '../src/clients/sensible';
import { originesAcceptees } from '../src/environnement';
import { origineVueParLeWorker } from '../../../apps/manager/proxy-dev';
import { makeEnv, type TestD1 } from './helpers/d1';

const RACINE = resolve(import.meta.dirname, '..', '..', '..');
const API_SRC = join(RACINE, 'workers', 'api', 'src');
const CLIENTS_SRC = join(API_SRC, 'clients');

// ─── Lecture des sources ────────────────────────────────────────────────────

const CODE = /\.(ts|tsx|js|mjs|cjs)$/;
/** Hors du contrôle (§14.2, règle 3) : les tests, les dépendances, ce qui est construit, ce qui est généré. */
const ECARTES = new Set(['node_modules', 'dist', 'test', 'tests', '__tests__', 'fixtures', 'coverage']);
/**
 * `workers/api/src/genere/` est le corpus embarqué : du texte de Florent mis
 * en constante au déploiement, pas du code. Le mot « questionnaires » y a sa
 * place dans une phrase, et une fiche du corpus ne doit pas pouvoir casser la
 * suite.
 */
const GENERES = join(API_SRC, 'genere');

const fichiersDeCode = (dossier: string): string[] => {
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return ECARTES.has(nom) || chemin === GENERES ? [] : fichiersDeCode(chemin);
    return CODE.test(nom) && !/\.test\.[jt]sx?$/.test(nom) && !nom.endsWith('.d.ts') ? [chemin] : [];
  });
};

const sousDossiers = (dossier: string) =>
  readdirSync(dossier).map((n) => join(dossier, n)).filter((c) => statSync(c).isDirectory());

/** Le périmètre de la règle 3 : workers/*\/src, packages/*, apps/*. */
const SOURCES = [
  ...sousDossiers(join(RACINE, 'workers')).flatMap((w) => fichiersDeCode(join(w, 'src'))),
  ...sousDossiers(join(RACINE, 'packages')).flatMap(fichiersDeCode),
  ...sousDossiers(join(RACINE, 'apps')).flatMap(fichiersDeCode),
];

const lire = (fichier: string) => readFileSync(fichier, 'utf8');
const rel = (fichier: string) => relative(RACINE, fichier).split(sep).join('/');

// ─── Le graphe des imports ──────────────────────────────────────────────────

/** Les spécificateurs importés ou réexportés par un fichier, y compris `import()` dynamique. */
const imports = (source: string): string[] => {
  const trouves = new Set<string>();
  const motifs = [
    /\bimport\s+(?:type\s+)?[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const motif of motifs) for (const m of source.matchAll(motif)) trouves.add(m[1]);
  return [...trouves];
};

/** Un paquet du dépôt : `@luminose/x` → son point d'entrée déclaré. */
const entreeDePaquet = (nom: string): string | null => {
  const m = /^@luminose\/([^/]+)(\/.*)?$/.exec(nom);
  if (!m) return null;
  for (const famille of ['packages', 'workers', 'apps']) {
    const dossier = join(RACINE, famille, m[1]);
    if (!existsSync(join(dossier, 'package.json'))) continue;
    if (m[2]) return resoudreFichier(join(dossier, m[2]));
    const manifeste = JSON.parse(lire(join(dossier, 'package.json')));
    const entree = manifeste.exports?.['.'] ?? manifeste.main ?? './src/index.ts';
    return resoudreFichier(join(dossier, typeof entree === 'string' ? entree : entree.default ?? entree.import));
  }
  return null;
};

const resoudreFichier = (base: string): string | null => {
  const candidats = [base, ...['.ts', '.tsx', '.js', '.mjs'].map((e) => base + e),
    ...['index.ts', 'index.tsx', 'index.js'].map((i) => join(base, i))];
  // `./x.js` en ESM désigne `./x.ts` à la compilation.
  if (/\.js$/.test(base)) candidats.push(base.replace(/\.js$/, '.ts'));
  return candidats.find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
};

/** Tous les fichiers atteints depuis `depart`, imports relatifs et paquets du dépôt compris. */
const atteints = (depart: string): Set<string> => {
  const vus = new Set<string>();
  const pile = [depart];
  while (pile.length) {
    const fichier = pile.pop()!;
    if (vus.has(fichier)) continue;
    vus.add(fichier);
    for (const spec of imports(lire(fichier))) {
      const cible = spec.startsWith('.') ? resoudreFichier(resolve(dirname(fichier), spec)) : entreeDePaquet(spec);
      if (cible && !cible.includes(`${sep}node_modules${sep}`)) pile.push(cible);
    }
  }
  return vus;
};

describe('NORMATIF — règle 1 : deux bases qui ne se connaissent pas', () => {
  const MODULES_EDITORIAUX = [
    'workers/api/src/routes/ai.ts',
    'workers/api/src/routes/export.ts',
    'workers/api/src/routes/corpus.ts',
    'workers/api/src/routes/montage.ts',
    'workers/api/src/acces-mcp.ts',
    'workers/api/src/db.ts',
  ];

  it.each(MODULES_EDITORIAUX)('%s n’atteint pas src/clients/, même indirectement', (module) => {
    const fichier = join(RACINE, module);
    expect(existsSync(fichier), module).toBe(true);
    const fautifs = [...atteints(fichier)].filter((f) => f.startsWith(CLIENTS_SRC + sep)).map(rel);
    expect(fautifs).toEqual([]);
  });

  it.each(['editorial', 'ai', 'corpus'])('packages/%s n’atteint pas src/clients/', (paquet) => {
    const fichiers = fichiersDeCode(join(RACINE, 'packages', paquet));
    expect(fichiers.length).toBeGreaterThan(0);
    const fautifs = fichiers.flatMap((f) => [...atteints(f)]).filter((f) => f.startsWith(CLIENTS_SRC + sep)).map(rel);
    expect([...new Set(fautifs)]).toEqual([]);
  });

  it('le graphe voit bien un import indirect : index.ts atteint src/clients/', () => {
    // Le témoin : sans lui, un graphe qui ne suivrait rien passerait les tests ci-dessus.
    expect([...atteints(join(API_SRC, 'index.ts'))].some((f) => f.startsWith(CLIENTS_SRC + sep))).toBe(true);
  });

  it('env.CLIENTS n’est lu que dans clients/base.ts', () => {
    const lecteurs = SOURCES.filter((f) => /\.\s*CLIENTS\b|\[\s*['"]CLIENTS['"]\s*\]|\{[^}]*\bCLIENTS\b[^}]*\}\s*=\s*\w*\.?env\b/.test(lire(f)));
    expect(lecteurs.map(rel)).toEqual(['workers/api/src/clients/base.ts']);
  });
});

describe('NORMATIF — règle 3 : un seul module nomme les tables sensibles', () => {
  it('l’exception de l’adresse du contrat ne couvre que `/v1/` devant le nom', () => {
    const motif = new RegExp(`(?<!/v1/)\\bquestionnaires\\b`);
    expect(motif.test("router.post('/v1/questionnaires/lien')")).toBe(false);
    expect(motif.test('SELECT * FROM questionnaires')).toBe(true);
    expect(motif.test('/api/questionnaires')).toBe(true);
  });

  it('le périmètre lu couvre les trois familles du dépôt', () => {
    const familles = new Set(SOURCES.map((f) => rel(f).split('/')[0]));
    expect([...familles].sort()).toEqual(['apps', 'packages', 'workers']);
    expect(SOURCES.map(rel)).toContain('workers/api/src/clients/sensible.ts');
  });

  /**
   * Une exception, et une seule : l'adresse du contrat `POST /v1/questionnaires`
   * (contrat §3.2) porte le nom de la table sans la désigner. La porte la route,
   * le contrat la documente ; écrite précédée de `/v1/`, elle ne nomme pas la
   * table. Toute autre occurrence reste une faute (phase S2b).
   */
  it.each(TABLES_SENSIBLES)('« %s » n’apparaît que dans clients/sensible.ts', (table) => {
    const motif = new RegExp(`(?<!/v1/)\\b${table}\\b`);
    const fautifs = SOURCES.filter((f) => motif.test(lire(f))).map(rel);
    expect(fautifs).toEqual(['workers/api/src/clients/sensible.ts']);
  });
});

// ─── Les routes ─────────────────────────────────────────────────────────────

const JETON_MCP = 'jeton-du-serveur-mcp-de-test';
const empreinte = async (jeton: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(jeton)))]
    .map((o) => o.toString(16).padStart(2, '0')).join('');

type EnvTest = ReturnType<typeof makeEnv> & { MCP_JETON_EMPREINTE?: string; ENVIRONNEMENT?: string };

const appeler = (env: EnvTest, chemin: string, entetes: Record<string, string>) =>
  app.fetch(new Request(`https://api.test${chemin}`, { headers: entetes }), env as any);
const parSession = async (env: EnvTest, chemin: string) =>
  appeler(env, chemin, { 'X-Session-Token': await createSessionToken(env) });
const parMcp = (env: EnvTest, chemin: string) => appeler(env, chemin, { Authorization: `Bearer ${JETON_MCP}` });

/** Compte les instructions préparées sur une base, sans en changer le comportement. */
const espionner = (base: D1Database) => {
  const preparees: string[] = [];
  const prepare = base.prepare.bind(base);
  (base as any).prepare = (sql: string) => { preparees.push(sql); return prepare(sql); };
  return preparees;
};

let journaux: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  journaux = (['error', 'warn', 'log', 'info', 'debug'] as const).map((n) => vi.spyOn(console, n).mockImplementation(() => {}));
});
afterEach(() => { for (const j of journaux) j.mockRestore(); });
const rienJournalise = () => { for (const j of journaux) expect(j).not.toHaveBeenCalled(); };

describe('NORMATIF — règle 2 : la liaison CLIENTS est facultative', () => {
  it('sans liaison, /api/clients/etat répond 409, son message dans error, et rien n’est journalisé', async () => {
    const res = await parSession(makeEnv(), '/api/clients/etat');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: MESSAGE_NON_RELIEE });
    rienJournalise();
  });

  it('avec la liaison, les trois effectifs en une seule instruction', async () => {
    const env = makeEnv({ clients: true });
    const base = env.CLIENTS as unknown as TestD1;
    await base.prepare(`INSERT INTO clients (id, prenom, nom, nom_recherche, created_at, updated_at) VALUES ('c', 'Émilie', 'Martin', 'emilie martin', 0, 0)`).run();
    await base.prepare(`INSERT INTO evenements (id, nom, debut, created_at, updated_at) VALUES ('e1', 'Journée', 0, 0, 0)`).run();
    await base.prepare(`INSERT INTO evenements (id, nom, debut, created_at, updated_at, deleted_at) VALUES ('e2', 'Retirée', 0, 0, 0, 1)`).run();
    const preparees = espionner(env.CLIENTS!);
    const res = await parSession(env, '/api/clients/etat');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ fiches: 1, seances: 0, evenements: 1 });
    expect(preparees).toHaveLength(1);
  });

  it('/api/environnement : le nom et la liaison, sans aucune requête métier', async () => {
    for (const [options, attendu] of [
      [{}, { nom: 'production', clientsReliee: false }],
      [{ clients: true }, { nom: 'production', clientsReliee: true }],
    ] as const) {
      const env = makeEnv(options);
      const db = espionner(env.DB);
      const clients = env.CLIENTS ? espionner(env.CLIENTS) : [];
      const res = await parSession(env, '/api/environnement');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(attendu);
      // Seule reste la lecture de révocation de toute route protégée (§7).
      expect(db).toHaveLength(1);
      expect(db[0]).toMatch(/auth_revocations/);
      expect(clients).toEqual([]);
    }
    for (const nom of ['recette', 'local'] as const) {
      const env = { ...makeEnv({ clients: true }), ENVIRONNEMENT: nom };
      expect(await (await parSession(env, '/api/environnement')).json()).toEqual({ nom, clientsReliee: true });
    }
  });
});

describe('NORMATIF — le serveur MCP n’atteint rien de la base des clients (§14.5)', () => {
  it.each([
    ['/api/clients/etat', false], ['/api/clients/etat', true],
    ['/api/environnement', false], ['/api/environnement', true],
  ] as const)('%s → 403, liaison présente : %s', async (chemin, avecClients) => {
    const env: EnvTest = { ...makeEnv({ clients: avecClients }), MCP_JETON_EMPREINTE: await empreinte(JETON_MCP) };
    const clients = env.CLIENTS ? espionner(env.CLIENTS) : [];
    const res = await parMcp(env, chemin);
    expect(res.status).toBe(403);
    // Le refus tombe avant tout examen de la liaison.
    expect(clients).toEqual([]);
  });
});

describe('NORMATIF — l’export général ne contient aucune table de la base des clients', () => {
  it('ne lit pas CLIENTS, et rien de ce qu’elle porte ne s’y retrouve', async () => {
    const env = makeEnv({ clients: true });
    const base = env.CLIENTS as unknown as TestD1;
    await base.prepare(`INSERT INTO clients (id, prenom, nom, nom_recherche, email, created_at, updated_at)
      VALUES ('repere-fiche', 'Repère', 'Essai', 'repere essai', 'repere@example.org', 0, 0)`).run();
    const preparees = espionner(env.CLIENTS!);
    const res = await parSession(env, '/api/export');
    expect(res.status).toBe(200);
    const texte = await res.text();
    expect(preparees).toEqual([]);
    expect(texte).not.toContain('repere');
    const tables = base.query("SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => String(r.name));
    const exporte = JSON.parse(texte);
    const cles = Object.keys(exporte);
    for (const table of tables) {
      expect(cles, table).not.toContain(table);
      expect(cles, table).not.toContain(table.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()));
    }
  });
});

// ─── L'origine acceptée pour une écriture (§14.5, §14.8) ────────────────────

const PRODUCTION = 'https://gestion.luminose.fr';
const RECETTE = 'https://gestion-recette.luminose.fr';

/** Une connexion : la première écriture, et celle qui pose le cookie. */
const connexion = (env: EnvTest, adresse: string, origine?: string) =>
  app.fetch(new Request(`${adresse}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(origine ? { Origin: origine } : {}) },
    body: JSON.stringify({ username: env.AUTH_USERNAME, password: env.AUTH_PASSWORD }),
  }), env as any);

describe('NORMATIF — chaque environnement n’accepte que son origine', () => {
  it('la production accepte la sienne et refuse celle de la recette', async () => {
    const env: EnvTest = { ...makeEnv(), ENVIRONNEMENT: 'production' };
    expect((await connexion(env, PRODUCTION, PRODUCTION)).status).toBe(200);
    expect((await connexion(env, PRODUCTION, RECETTE)).status).toBe(403);
    // Appelée par son adresse workers.dev, elle n'accepte toujours que la sienne.
    expect((await connexion(env, 'https://gestion-luminose-worker.example.workers.dev', 'https://gestion-luminose-worker.example.workers.dev')).status).toBe(403);
  });

  it('la recette accepte la sienne et refuse celle de la production', async () => {
    const env: EnvTest = { ...makeEnv(), ENVIRONNEMENT: 'recette' };
    expect((await connexion(env, RECETTE, RECETTE)).status).toBe(200);
    expect((await connexion(env, RECETTE, PRODUCTION)).status).toBe(403);
  });

  it('en local : l’adresse appelée, que le proxy de développement présente ; jamais celle de Vite', async () => {
    const env: EnvTest = { ...makeEnv(), ENVIRONNEMENT: 'local' };
    const worker = 'http://localhost:8787';
    expect((await connexion(env, worker, worker)).status).toBe(200);
    expect((await connexion(env, worker, 'http://localhost:7860')).status).toBe(403);
    expect((await connexion(env, worker, PRODUCTION)).status).toBe(403);
    // Le proxy de Vite traduit la page qu'il sert, et elle seule.
    const traduite = origineVueParLeWorker('http://localhost:7860', 'localhost:7860', worker);
    expect(traduite).toBe(worker);
    expect((await connexion(env, worker, traduite)).status).toBe(200);
    expect(origineVueParLeWorker(PRODUCTION, 'localhost:7860', worker)).toBeUndefined();
  });

  it('une écriture sans en-tête Origin reste acceptée, une écriture cross-site reste refusée', async () => {
    const env: EnvTest = { ...makeEnv(), ENVIRONNEMENT: 'recette' };
    expect((await connexion(env, RECETTE)).status).toBe(200);
    const res = await app.fetch(new Request(`${RECETTE}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' }, body: '{}',
    }), env as any);
    expect(res.status).toBe(403);
  });

  it('une valeur inconnue ferme les écritures plutôt que de rouvrir le repli', async () => {
    const env: EnvTest = { ...makeEnv(), ENVIRONNEMENT: 'recete' };
    expect((await connexion(env, RECETTE, RECETTE)).status).toBe(403);
    expect(originesAcceptees({ ENVIRONNEMENT: 'recete' as any }, RECETTE)).toEqual([]);
  });

  it('sans déclaration — un Worker d’avant la v3.0 —, le comportement d’avant', () => {
    expect(originesAcceptees({}, 'https://w.dev/auth/login')).toEqual(['https://w.dev', PRODUCTION]);
  });
});
