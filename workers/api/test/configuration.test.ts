/**
 * Les environnements de wrangler.toml (SPEC §14.8), tels que wrangler les
 * résoudra.
 *
 * Ce que ces tests protègent : une recette qui viserait la production. Les
 * routes, le déclencheur et workers.dev s'héritent de la racine ; une section
 * qui oublie de les déclarer déploie la recette sur `gestion.luminose.fr`. Les
 * liaisons, elles, ne s'héritent pas : la production reste sans `CLIENTS`
 * tant qu'on ne l'y écrit pas.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resoudre, ecartsRecette, ecartsPorteRecette, lireToml } from '../scripts/configuration';
import { DECLENCHEURS } from '../src/declencheurs';

const SOURCE = readFileSync(join(import.meta.dirname, '..', 'wrangler.toml'), 'utf8');
const PORTE = readFileSync(join(import.meta.dirname, '..', '..', 'porte', 'wrangler.toml'), 'utf8');
/**
 * Le fichier tel qu'avant le report des identifiants de recette : les tests
 * ne doivent pas dépendre de ce que Florent y a écrit depuis.
 */
const VIERGE = SOURCE.replace(/(\[\[env\.recette\.d1_databases\]\][\s\S]*?database_id = )"[^"]*"/g, '$1"A_REMPLACER"');
const ID_A = '11111111-2222-4333-8444-555555555555';
const ID_B = '66666666-7777-4888-9999-aaaaaaaaaaaa';

/** La recette telle que Florent la complétera, ses deux identifiants reportés. */
const completee = (source = VIERGE) => {
  let n = 0;
  return source.replace(/database_id = "A_REMPLACER"/g, () => `database_id = "${n++ === 0 ? ID_A : ID_B}"`);
};

describe('la production — la racine', () => {
  const prod = resoudre(SOURCE, null);

  it('est inchangée : son Worker, ses routes, son déclencheur, ses liaisons', () => {
    expect(prod.name).toBe('gestion-luminose-worker');
    expect(prod.routes).toEqual(['gestion.luminose.fr/api/*', 'gestion.luminose.fr/auth/*']);
    expect(prod.crons).toEqual(['17 5 * * *']);
    expect(prod.workersDev).toBe(true);
    expect(prod.ai).toBe(true);
    expect(prod.r2).toEqual(['luminose-montage']);
    expect(prod.d1).toEqual([{ binding: 'DB', databaseName: 'luminose-gestion', databaseId: 'e9327701-3b46-4f85-9e3f-513df1488118', migrationsDir: 'migrations' }]);
  });

  it('ne déclare pas la base des clients, et dit qu’elle est la production', () => {
    expect(prod.d1.map((b) => b.binding)).not.toContain('CLIENTS');
    expect(prod.vars).toEqual({ ENVIRONNEMENT: 'production' });
  });
});

describe('NORMATIF — la recette', () => {
  it('déclare elle-même ce qui s’hérite : son nom, ses routes, le seul passage des portes, pas de workers.dev', () => {
    const r = resoudre(SOURCE, 'recette');
    expect(r.name).toBe('gestion-luminose-worker-recette');
    expect(r.routes).toEqual(['gestion-recette.luminose.fr/api/*', 'gestion-recette.luminose.fr/auth/*']);
    expect(r.crons).toEqual([DECLENCHEURS.passage]);
    expect(r.workersDev).toBe(false);
    expect(r.vars).toEqual({ ENVIRONNEMENT: 'recette', ORIGINE_SITE: 'https://essai-recette.luminose.fr' });
  });

  it('a ses deux bases, chacune avec ses migrations ; ni R2 ni Workers AI', () => {
    const r = resoudre(SOURCE, 'recette');
    expect(r.d1.map(({ binding, databaseName, migrationsDir }) => ({ binding, databaseName, migrationsDir }))).toEqual([
      { binding: 'DB', databaseName: 'luminose-gestion-recette', migrationsDir: 'migrations' },
      { binding: 'CLIENTS', databaseName: 'luminose-clients-recette', migrationsDir: 'migrations-clients' },
    ]);
    expect(r.r2).toEqual([]);
    expect(r.ai).toBe(false);
  });

  it('le fichier du dépôt est une recette conforme', () => {
    expect(ecartsRecette(SOURCE)).toEqual([]);
  });

  it('tant que les identifiants ne sont pas reportés, la cible est refusée — et dit pourquoi', () => {
    const ecarts = ecartsRecette(VIERGE);
    expect(ecarts).toHaveLength(2);
    expect(ecarts.join('\n')).toMatch(/DB : database_id « A_REMPLACER »/);
    expect(ecarts.join('\n')).toMatch(/wrangler d1 create luminose-clients-recette/);
  });

  it('les identifiants reportés, elle est acceptée', () => {
    expect(ecartsRecette(completee())).toEqual([]);
  });

  it('refuse un identifiant recopié de la production', () => {
    const copie = completee().replace(ID_A, 'e9327701-3b46-4f85-9e3f-513df1488118');
    expect(ecartsRecette(copie)).toEqual(['DB : database_id est celui d’une base de la PRODUCTION']);
  });

  it('une section qui oublie ses routes et son déclencheur hériterait de ceux de la production — refusée', () => {
    const oublieuse = completee()
      .replace(/routes = \[\n  \{ pattern = "gestion-recette[\s\S]*?\n\]\n/, '')
      .replace(`[env.recette.triggers]\ncrons = ["${DECLENCHEURS.passage}"]\n`, '')
      .replace('[env.recette]\nname = "gestion-luminose-worker-recette"\nworkers_dev = false\n', '[env.recette]\nname = "gestion-luminose-worker-recette"\n');
    const r = resoudre(oublieuse, 'recette');
    expect(r.routes).toEqual(['gestion.luminose.fr/api/*', 'gestion.luminose.fr/auth/*']);
    expect(r.crons).toEqual(['17 5 * * *']);
    expect(r.workersDev).toBe(true);
    const ecarts = ecartsRecette(oublieuse).join('\n');
    expect(ecarts).toMatch(/workers_dev/);
    expect(ecarts).toMatch(/déclencheurs/);
    expect(ecarts).toMatch(/routes/);
  });

  it('des variables oubliées ne s’héritent pas : la recette se dirait production — refusée', () => {
    const sansVars = completee().replace(/\[env\.recette\.vars\]\nENVIRONNEMENT = "recette"\n(#.*\n)*ORIGINE_SITE = .*\n/, '');
    expect(resoudre(sansVars, 'recette').vars).toEqual({});
    expect(ecartsRecette(sansVars)).toEqual([
      'vars.ENVIRONNEMENT doit valoir "recette"', 'vars.ORIGINE_SITE doit valoir "https://essai-recette.luminose.fr"',
    ]);
  });
});

describe('le poste local', () => {
  const local = resoudre(SOURCE, 'local');

  it('déclare la base des clients, que la racine ne porte pas', () => {
    expect(local.d1.map((b) => [b.binding, b.migrationsDir])).toEqual([['DB', 'migrations'], ['CLIENTS', 'migrations-clients']]);
    expect(local.vars).toEqual({ ENVIRONNEMENT: 'local', ORIGINE_SITE: 'http://localhost:8790' });
  });

  it('ne peut atteindre aucune base distante de la production, et ne se déploie nulle part', () => {
    const idsProduction = resoudre(SOURCE, null).d1.map((b) => b.databaseId);
    for (const b of local.d1) expect(idsProduction).not.toContain(b.databaseId);
    expect(local.routes).toEqual([]);
    expect(local.crons).toEqual([]);
    expect(local.workersDev).toBe(false);
  });

  it('garde ce que le développement du montage utilise : Workers AI et R2', () => {
    expect(local.ai).toBe(true);
    expect(local.r2).toEqual(['luminose-montage']);
  });
});

describe('NORMATIF — la porte (workers/porte/wrangler.toml, SPEC §14.3, §14.8)', () => {
  it('la racine n’est déployée par rien : ni adresse, ni déclencheur, ni liaison, ni observabilité', () => {
    const racine = resoudre(PORTE, null);
    expect(racine.name).toBe('luminose-porte');
    expect(racine.workersDev).toBe(false);
    expect(racine.previewUrls).toBe(false);
    expect(racine.routes).toEqual([]);
    expect(racine.crons).toEqual([]);
    expect(racine.liaisons).toEqual([]);
    expect(racine.vars).toEqual({});
    expect(racine.observabilite).toEqual({ enabled: false, headSamplingRate: null, journauxDInvocation: false, traces: false });
  });

  it('la recette déclare tout ce qui s’hérite, et ses seules liaisons : les entrées des portes de gestion de recette', () => {
    const r = resoudre(PORTE, 'recette');
    expect(r.name).toBe('luminose-porte-recette');
    expect(r.workersDev).toBe(false);
    expect(r.previewUrls).toBe(false);
    expect(r.routesDetaillees).toEqual([
      { pattern: 'api-recette.luminose.fr', customDomain: true },
      { pattern: 'essai-recette.luminose.fr', customDomain: true },
    ]);
    expect(r.crons).toEqual([]);
    expect(r.vars).toEqual({
      ENVIRONNEMENT: 'recette', ORIGINE_SITE: 'https://recette.luminose.fr', ORIGINE_ESSAI: 'https://essai-recette.luminose.fr', ORIGINE_PORTE: 'https://api-recette.luminose.fr',
    });
    expect(r.liaisons).toEqual(['services', 'ratelimits']);
    expect(r.services).toEqual([
      { binding: 'GESTION_PUBLIQUE', service: 'gestion-luminose-worker-recette', entrypoint: 'PortePublique' },
      { binding: 'GESTION_SERVICE', service: 'gestion-luminose-worker-recette', entrypoint: 'PorteService' },
    ]);
    expect(r.ratelimits).toEqual([
      { name: 'LIMITE_QUESTIONNAIRES', namespaceId: '2611', limit: 10, period: 60 },
      { name: 'LIMITE_LIENS', namespaceId: '2612', limit: 30, period: 60 },
      { name: 'LIMITE_CRENEAUX', namespaceId: '2613', limit: 60, period: 60 },
      { name: 'LIMITE_RESERVATIONS', namespaceId: '2614', limit: 10, period: 60 },
    ]);
    // Les codes de la porte, sans journal d'invocation ni traces (§14.3, règle 7).
    expect(r.observabilite).toEqual({ enabled: true, headSamplingRate: 1, journauxDInvocation: false, traces: false });
  });

  it('le fichier du dépôt est une porte de recette conforme', () => {
    expect(ecartsPorteRecette(PORTE)).toEqual([]);
  });

  it('une liaison vers le gestion de PRODUCTION est refusée', () => {
    const vers = PORTE.replace(/service = "gestion-luminose-worker-recette"/g, 'service = "gestion-luminose-worker"');
    expect(ecartsPorteRecette(vers).join('\n')).toMatch(/seul « gestion-luminose-worker-recette » est admis/);
  });

  it('une section qui oublie workers_dev, preview_urls et ses routes : refusée (rien n’hérite de bon)', () => {
    const oublieuse = PORTE
      .replace('[env.recette]\nname = "luminose-porte-recette"\nworkers_dev = false\npreview_urls = false\n', '[env.recette]\nname = "luminose-porte-recette"\n')
      .replace(/routes = \[\n  \{ pattern = "api-recette[\s\S]*?\n\]\n/, '')
      .replace(/workers_dev = false\npreview_urls = false\nroutes = \[\]\n/, '');
    const r = resoudre(oublieuse, 'recette');
    expect(r.workersDev).toBe(true);
    expect(r.previewUrls).toBe(true);
    const ecarts = ecartsPorteRecette(oublieuse).join('\n');
    expect(ecarts).toMatch(/workers_dev/);
    expect(ecarts).toMatch(/preview_urls/);
    expect(ecarts).toMatch(/routes/);
  });

  it('une route qui n’est pas un domaine personnalisé, ou une autre adresse : refusée', () => {
    expect(ecartsPorteRecette(PORTE.replace('custom_domain = true', 'zone_name = "luminose.fr"')).join('\n')).toMatch(/domaines personnalisés/);
    expect(ecartsPorteRecette(PORTE.replace('pattern = "api-recette.luminose.fr"', 'pattern = "api.luminose.fr"')).join('\n')).toMatch(/routes/);
  });

  it('ni base, ni KV, ni secret : une liaison de plus est refusée', () => {
    const avecKv = `${PORTE}\n[[env.recette.kv_namespaces]]\nbinding = "X"\nid = "abc"\n`;
    expect(ecartsPorteRecette(avecKv)).toEqual(['liaisons interdites à la porte (ni base, ni KV, ni secret — §14.3) : kv_namespaces']);
  });

  it('une autre origine du site, ou un limiteur manquant : refusés', () => {
    expect(ecartsPorteRecette(PORTE.replace('ORIGINE_SITE = "https://recette.luminose.fr"', 'ORIGINE_SITE = "*"')).join('\n')).toMatch(/ORIGINE_SITE/);
    const sansLimite = PORTE.replace(/\[\[env\.recette\.ratelimits\]\]\nname = "LIMITE_LIENS"[\s\S]*$/, '');
    expect(ecartsPorteRecette(sansLimite).join('\n')).toMatch(/limiteurs/);
  });

  it('NORMATIF — règle 7 : des journaux d’invocation, ou des traces, sont refusés', () => {
    const avecJournaux = PORTE.replace('[env.recette.observability.logs]\nenabled = true\ninvocation_logs = false\n', '');
    expect(resoudre(avecJournaux, 'recette').observabilite.journauxDInvocation).toBe(true);
    expect(ecartsPorteRecette(avecJournaux)).toEqual(['recette : invocation_logs doit valoir false (observability.logs) — ils gardent l’adresse IP']);
    const avecTraces = PORTE.replace('[env.recette.observability.traces]\nenabled = false', '[env.recette.observability.traces]\nenabled = true');
    expect(ecartsPorteRecette(avecTraces).join('\n')).toMatch(/recette : observability.traces/);
  });

  it('un déclencheur hérité ou déclaré : refusé', () => {
    const avecCron = PORTE.replace('[env.recette.triggers]\ncrons = []', '[env.recette.triggers]\ncrons = ["*/5 * * * *"]');
    expect(ecartsPorteRecette(avecCron).join('\n')).toMatch(/déclencheurs/);
  });
});

describe('le lecteur TOML', () => {
  it('lit sections, tableaux de sections, tables en ligne et commentaires', () => {
    expect(lireToml(`
a = "x # pas un commentaire" # un commentaire
n = 3
[s]
b = true
[[s.l]]
c = [ { p = "1" },
  { p = "2" } ]
[[s.l]]
c = []
`)).toEqual({ a: 'x # pas un commentaire', n: 3, s: { b: true, l: [{ c: [{ p: '1' }, { p: '2' }] }, { c: [] }] } });
  });

  it('refuse un environnement qui n’existe pas', () => {
    expect(() => resoudre(SOURCE, 'recete')).toThrow(/\[env\.recete\]/);
  });
});
