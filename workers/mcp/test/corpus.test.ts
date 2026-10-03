/**
 * Le corpus depuis Claude — décision du 03/10/2026
 * (workers/mcp/decisions/2026-10-03-corpus.md).
 *
 * Le dépôt simulé ici a un ÉTAT : un commit le modifie, un aperçu non. Chaque
 * test NORMATIF regarde ce qui part réellement chez GitHub — les PUT, les
 * déclenchements de workflow — et ce que le journal a écrit, pas ce que
 * l'outil annonce.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ecrireFichier, ecritureAdmise } from '../src/github';
import { COMPTE, LIRE_ECRIRE, appelerOutil, creerEnv, simulerFetch, texteDe, type Appel, type EnvFactice } from './aides';
import { d1EnPanne } from './d1';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const CORPUS = ['ads:lire', 'corpus:ecrire'];

// ── Un dépôt à état ──────────────────────────────────────────────────────

const FICHIERS: Record<string, string> = {
  'socle/identite.md': '---\ntype: fact\nstatut: actif\nnoyau: true\nrevu: 2026-09\nreview_at: 2026-09\n---\n\n# Identité\n\nFlorent Jaouali, psychopraticien.\n',
  'socle/offres/le-seuil.md': '---\ntype: fact\nstatut: suspendu\noffre: Le Seuil\n---\n\n# Le Seuil\n\nParcours de quatre mois.\n',
  'socle/offres/seance-individuelle.md': '---\ntype: fact\nstatut: actif\noffre: Séance\n---\n\n# Séance individuelle\n\nUne heure, à Lyon.\n',
  'voix/regles-de-voix.md': '---\ntype: instruction\nstatut: actif\n---\n\n# Règles de voix\n\nTutoiement interdit.\n',
  'strategie/a-lire-d-abord.md': '---\ntype: instruction\nstatut: actif\n---\n\n# À lire d’abord\n\nLes décisions sont des arrêts.\n',
  'strategie/decisions/2026-08-seuil-suspendu.md': '---\ntype: decision\nstatut: active\ndecide_le: 2026-08-25\nexpose: prive\n---\n\n# Le Seuil passe en suspendu\n\n**Décidé.**\n',
  'canaux/google-ads.md': '---\ntype: instruction\nstatut: actif\nrevu: 2026-10\n---\n\n# Google Ads\n\nBudget : 10 € par jour.\nCible : Lyon.\nCible : Lyon.\n',
  'canaux/README.md': '# Canaux\n\nUne note pour Florent, pas pour une IA.\n',
};

type Depot = {
  fichiers: Map<string, { texte: string; sha: string }>;
  commit: string;
  suivant: number;
  dispatches: unknown[];
  run: Record<string, unknown> | null;
  /** Un commit d'ailleurs, glissé entre la lecture et l'écriture. */
  conflitAuProchainPut?: boolean;
  tronque?: string;
};

const nouveauDepot = (): Depot => ({
  fichiers: new Map(Object.entries(FICHIERS).map(([c, t], i) => [c, { texte: t, sha: `blob${i}` }])),
  commit: 'c0ffee0000000000000000000000000000000000',
  suivant: 1,
  dispatches: [],
  run: { status: 'completed', conclusion: 'success', created_at: '2026-10-02T09:00:00Z', html_url: 'https://github.com/luminose-fr/gestion/actions/runs/1', head_sha: 'aaaaaaa1' },
});

/** L'arbre GraphQL de `packages/corpus/content`, tel que GitHub le rend. */
const arbre = (d: Depot) => {
  type Noeud = { name: string; type: string; object: Record<string, unknown> };
  const racine: Noeud[] = [];
  for (const [chemin, f] of d.fichiers) {
    const parties = chemin.split('/');
    let niveau = racine;
    for (const dossier of parties.slice(0, -1)) {
      let n = niveau.find((x) => x.name === dossier);
      if (!n) { n = { name: dossier, type: 'tree', object: { entries: [] } }; niveau.push(n); }
      niveau = n.object.entries as Noeud[];
    }
    niveau.push({ name: parties.at(-1)!, type: 'blob', object: { oid: f.sha, text: f.texte, isBinary: false, isTruncated: d.tronque === chemin } });
  }
  return racine;
};

const PREFIXE = '/repos/luminose-fr/gestion/contents/packages/corpus/content/';

const simulerDepot = (d: Depot = nouveauDepot()) => {
  const appels = simulerFetch(({ url, methode, corps }) => {
    if (!url.startsWith('https://api.github.com/')) return undefined;
    const chemin = url.slice('https://api.github.com'.length);
    if (chemin === '/graphql') {
      return Response.json({ data: { repository: { object: {
        oid: d.commit, committedDate: '2026-10-03T08:00:00Z', messageHeadline: 'Corpus : canaux/google-ads',
        file: { object: { entries: arbre(d) } },
      } } } });
    }
    if (chemin.startsWith(PREFIXE) && methode === 'PUT') {
      const fichier = chemin.slice(PREFIXE.length);
      const c = JSON.parse(corps);
      const actuel = d.fichiers.get(fichier);
      if (d.conflitAuProchainPut) {
        d.conflitAuProchainPut = false;
        return Response.json({ message: `${fichier} does not match ${c.sha}` }, { status: 409 });
      }
      if (c.sha === undefined && actuel) return Response.json({ message: 'Invalid request. "sha" wasn\'t supplied.' }, { status: 422 });
      if (c.sha !== undefined && (!actuel || actuel.sha !== c.sha)) return Response.json({ message: `${fichier} does not match ${c.sha}` }, { status: 409 });
      const sha = `blob-neuf-${d.suivant}`;
      d.fichiers.set(fichier, { texte: Buffer.from(c.content, 'base64').toString('utf8'), sha });
      d.commit = `commit${d.suivant++}`.padEnd(40, '0');
      return Response.json({ content: { sha }, commit: { sha: d.commit, html_url: `https://github.com/luminose-fr/gestion/commit/${d.commit}` } }, { status: 201 });
    }
    if (chemin.endsWith('/actions/workflows/deploiement.yml/dispatches') && methode === 'POST') {
      d.dispatches.push(JSON.parse(corps));
      return new Response(null, { status: 204 });
    }
    if (chemin.endsWith('/actions/workflows/deploiement.yml/runs?per_page=1')) {
      return Response.json({ workflow_runs: d.run ? [d.run] : [] });
    }
    if (chemin.startsWith('/repos/luminose-fr/gestion/commits?')) {
      return Response.json([
        { sha: 'abcdef1234', commit: { message: 'Corpus : canaux/google-ads\n\ndétail', committer: { date: '2026-10-03T08:00:00Z' } } },
        { sha: '1234abcdef', commit: { message: 'Corpus : socle/audiences', committer: { date: '2026-10-01T08:00:00Z' } } },
      ]);
    }
    return Response.json({ message: `Non simulé : ${methode} ${chemin}` }, { status: 500 });
  });
  return { appels, depot: d };
};

const puts = (appels: Appel[]) => appels.filter((a) => a.methode === 'PUT');
const versGitHub = (appels: Appel[]) => appels.filter((a) => a.url.startsWith('https://api.github.com/'));
const jetonDe = (corps: any) => /jeton = "([^"]+)"/.exec(texteDe(corps))?.[1];

const apercuPuisExecution = async (env: EnvFactice, outil: string, args: Record<string, unknown>, scopes = CORPUS) => {
  const apercu = await appelerOutil(env, outil, args, scopes);
  const execution = await appelerOutil(env, outil, { ...args, jeton: jetonDe(apercu.corps) }, scopes);
  return { apercu: apercu.corps, execution: execution.corps };
};

const lignesCorpus = (env: EnvFactice) =>
  env.DB.db.prepare('SELECT * FROM corpus_ecritures ORDER BY id').all() as Record<string, unknown>[];

const CORRECTION = { chemin: 'canaux/google-ads', remplacements: [{ avant: 'Budget : 10 € par jour.', apres: 'Budget : 12 € par jour.' }] };

// ── Lire ─────────────────────────────────────────────────────────────────

describe('lire le corpus — la branche main, en une requête', () => {
  it('corpus_index : les fiches par bloc, sans les README, avec statut et revue échue', async () => {
    const env = creerEnv();
    const { appels } = simulerDepot();
    const { corps } = await appelerOutil(env, 'corpus_index', {}, []);
    const t = texteDe(corps);
    expect(t).toMatch(/^Corpus — main @ c0ffee0 \(2026-10-03, « Corpus : canaux\/google-ads »\), 7 fiches\./);
    expect(t).toMatch(/## socle \(3\)/);
    expect(t).toMatch(/- socle\/offres\/le-seuil — Le Seuil · fact · suspendu/);
    expect(t).toMatch(/- socle\/identite — Identité · fact · actif · revu 2026-09 · à revoir 2026-09 \(ÉCHU\)/);
    expect(t).not.toMatch(/README|Une note pour Florent/);
    expect(versGitHub(appels)).toHaveLength(1);
  });

  it('corpus_lire : le texte exact, frontmatter compris ; un chemin inconnu est refusé', async () => {
    const env = creerEnv();
    simulerDepot();
    const { corps } = await appelerOutil(env, 'corpus_lire', { chemins: ['socle/offres/le-seuil', 'canaux/google-ads'] }, []);
    const t = texteDe(corps);
    expect(t).toContain(`<!-- socle/offres/le-seuil.md — empreinte blob1 -->\n${FICHIERS['socle/offres/le-seuil.md'].trimEnd()}`);
    expect(t).toContain('Budget : 10 € par jour.');
    const inconnu = await appelerOutil(env, 'corpus_lire', { chemins: ['socle/inexistante'] }, []);
    expect(texteDe(inconnu.corps)).toMatch(/introuvable.*socle\/inexistante/);
  });

  it('corpus_contexte : le composeur de la console — la stratégie hors de « complet », l’offre arrêtée marquée', async () => {
    const env = creerEnv();
    simulerDepot();
    const complet = texteDe((await appelerOutil(env, 'corpus_contexte', { profil: 'complet' }, [])).corps);
    expect(complet).toMatch(/^Profil « complet » .* — hash [0-9a-f]{8}, \d+ caractères, \d+ fiches, main @ c0ffee0/);
    expect(complet).toMatch(/\| Le Seuil \| `suspendu` \| \*\*NE PAS PROPOSER\*\* \|/);
    expect(complet).not.toContain('strategie/a-lire-d-abord');
    const strategie = texteDe((await appelerOutil(env, 'corpus_contexte', { profil: 'strategie' }, [])).corps);
    expect(strategie).toContain('<!-- strategie/a-lire-d-abord -->');
  });

  it('la lecture ne demande aucun scope d’écriture ; sans GITHUB_TOKEN, le corpus le dit et Google Ads continue', async () => {
    const env = creerEnv({ GITHUB_TOKEN: undefined });
    const appels = simulerFetch(({ url }) => (url.includes(':search') ? Response.json({ results: [] }) : undefined));
    const { corps } = await appelerOutil(env, 'corpus_index', {}, []);
    expect(texteDe(corps)).toMatch(/Secret GITHUB_TOKEN absent du Worker MCP : le corpus est fermé, Google Ads continue/);
    const ads = await appelerOutil(env, 'ads_requete', { requete: 'SELECT campaign.id FROM campaign' }, []);
    expect(texteDe(ads.corps)).toMatch(/^0 ligne\(s\)/);
    expect(versGitHub(appels)).toEqual([]);
  });

  it('une fiche que GitHub rend tronquée fait refuser la lecture entière', async () => {
    const env = creerEnv();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const d = nouveauDepot();
    d.tronque = 'canaux/google-ads.md';
    const { appels } = simulerDepot(d);
    const { corps } = await appelerOutil(env, 'corpus_modifier', CORRECTION, CORPUS);
    expect(corps.result).toBeUndefined();
    expect(puts(appels)).toEqual([]);
  });
});

// ── V8 ───────────────────────────────────────────────────────────────────

describe('NORMATIF — sans le scope corpus:ecrire, rien ne s’écrit, et GitHub n’est même pas lu', () => {
  it('ni aperçu ni exécution, avec ou sans l’écriture Google Ads', async () => {
    for (const scopes of [[], ['ads:lire'], LIRE_ECRIRE]) {
      const env = creerEnv();
      const { appels } = simulerDepot();
      for (const [outil, args] of [
        ['corpus_modifier', CORRECTION],
        ['corpus_decision_ajouter', { slug: 'essai', titre: 'Essai', corps: '**Décidé.**' }],
        ['corpus_deployer', {}],
      ] as const) {
        const { corps } = await appelerOutil(env, outil, args, scopes);
        expect(texteDe(corps), `${outil} ${scopes}`).toMatch(/L'écriture du corpus n'est pas accordée à cette connexion/);
      }
      expect(appels).toEqual([]);
      expect(lignesCorpus(env)).toEqual([]);
    }
  });
});

// ── V2 ───────────────────────────────────────────────────────────────────

describe('NORMATIF — un aperçu ne modifie rien ; l’exécution fait exactement ce qu’il montrait', () => {
  it('l’aperçu montre le diff, ne fait aucun PUT, n’écrit pas au journal', async () => {
    const env = creerEnv();
    const { appels, depot } = simulerDepot();
    const { corps } = await appelerOutil(env, 'corpus_modifier', CORRECTION, CORPUS);
    const t = texteDe(corps);
    expect(t).toMatch(/^APERÇU — rien n'a été modifié : le dépôt n'a pas été touché\./);
    expect(t).toContain('```diff\n  # Google Ads\n  \n- Budget : 10 € par jour.\n+ Budget : 12 € par jour.\n  Cible : Lyon.\n  Cible : Lyon.\n```');
    expect(t).toMatch(/revu: inchangé \(2026-10\)/);
    expect(t).toMatch(/Le commit ne publie rien/);
    expect(jetonDe(corps)).toBeTruthy();
    expect(puts(appels)).toEqual([]);
    expect(depot.fichiers.get('canaux/google-ads.md')!.texte).toBe(FICHIERS['canaux/google-ads.md']);
    expect(lignesCorpus(env)).toEqual([]);
  });

  it('avec le jeton : un commit, sur l’empreinte vue à l’aperçu, journalisé avant', async () => {
    const env = creerEnv();
    const { appels, depot } = simulerDepot();
    const { execution } = await apercuPuisExecution(env, 'corpus_modifier', CORRECTION);
    expect(texteDe(execution)).toMatch(/^FAIT — écriture n° 1 du journal du corpus\.\n\nFiche « canaux\/google-ads » commitée sur main/);

    const [put] = puts(appels);
    expect(put.url).toBe('https://api.github.com/repos/luminose-fr/gestion/contents/packages/corpus/content/canaux/google-ads.md');
    const envoye = JSON.parse(put.corps);
    expect(envoye.sha).toBe('blob6');
    expect(envoye.branch).toBe('main');
    expect(envoye.message).toMatch(/^Corpus : canaux\/google-ads\n\nPréparé dans une conversation Claude/);
    expect(depot.fichiers.get('canaux/google-ads.md')!.texte).toBe(FICHIERS['canaux/google-ads.md'].replace('10 €', '12 €'));

    const [ligne] = lignesCorpus(env);
    expect(ligne).toMatchObject({ outil: 'corpus_modifier', depot: 'luminose-fr/gestion', auteur: 'florent@luminose.fr', issue: 'ok' });
    expect(JSON.parse(ligne.contenu as string)).toMatchObject({ type: 'commit', chemin: 'canaux/google-ads', sha: 'blob6' });
    expect(JSON.parse(ligne.ressources as string)[0]).toMatch(/^https:\/\/github\.com\/luminose-fr\/gestion\/commit\//);
    // Le journal du corpus est à part : celui de Google Ads n'a rien vu.
    expect(env.DB.lignes()).toEqual([]);
  });

  it('la fiche entière (`contenu`) passe aussi, et la même correction donne le même commit', async () => {
    const env = creerEnv();
    const { depot } = simulerDepot();
    const contenu = FICHIERS['canaux/google-ads.md'].replace('Lyon.\nCible : Lyon.', 'Lyon et Villeurbanne.');
    await apercuPuisExecution(env, 'corpus_modifier', { chemin: 'canaux/google-ads', contenu });
    expect(depot.fichiers.get('canaux/google-ads.md')!.texte).toBe(contenu);
  });

  it('un jeton ne vaut que pour ses arguments, une fois, dix minutes, et pour son outil', async () => {
    const env = creerEnv();
    const { appels, depot } = simulerDepot();
    const jeton = jetonDe((await appelerOutil(env, 'corpus_modifier', CORRECTION, CORPUS)).corps);

    for (const args of [
      { ...CORRECTION, remplacements: [{ avant: 'Budget : 10 € par jour.', apres: 'Budget : 15 € par jour.' }] },
      { ...CORRECTION, message: 'Autre message' },
    ]) {
      const { corps } = await appelerOutil(env, 'corpus_modifier', { ...args, jeton }, CORPUS);
      expect(texteDe(corps)).toMatch(/diffère de celui de l'aperçu/);
    }
    const voisin = await appelerOutil(env, 'corpus_deployer', { jeton }, CORPUS);
    expect(texteDe(voisin.corps)).toMatch(/Jeton d'aperçu invalide pour cet outil/);

    await appelerOutil(env, 'corpus_modifier', { ...CORRECTION, jeton }, CORPUS);
    expect(puts(appels)).toHaveLength(1);
    // Quelqu'un remet l'ancien texte : rejouer le jeton le réécrirait. Il a servi.
    depot.fichiers.set('canaux/google-ads.md', { texte: FICHIERS['canaux/google-ads.md'], sha: 'blob6' });
    const rejoue = await appelerOutil(env, 'corpus_modifier', { ...CORRECTION, jeton }, CORPUS);
    expect(texteDe(rejoue.corps)).toMatch(/déjà servi/);
    expect(puts(appels)).toHaveLength(1);

    const autre = jetonDe((await appelerOutil(env, 'corpus_modifier', CORRECTION, CORPUS)).corps);
    vi.useFakeTimers({ now: Date.now() + 10 * 60 * 1000 + 1000 });
    const expire = await appelerOutil(env, 'corpus_modifier', { ...CORRECTION, jeton: autre }, CORPUS);
    expect(texteDe(expire.corps)).toMatch(/expiré/);
    expect(puts(appels)).toHaveLength(1);
  });
});

// ── Ne jamais écraser ────────────────────────────────────────────────────

describe('NORMATIF — un commit intervenu après l’aperçu n’est jamais écrasé', () => {
  it('la fiche a changé entre l’aperçu et l’exécution : refus, rien n’est écrit, rien n’est journalisé', async () => {
    const env = creerEnv();
    const { appels, depot } = simulerDepot();
    const jeton = jetonDe((await appelerOutil(env, 'corpus_modifier', CORRECTION, CORPUS)).corps);
    depot.fichiers.set('canaux/google-ads.md', { texte: FICHIERS['canaux/google-ads.md'].replace('Lyon.', 'Lyon !'), sha: 'blob-ailleurs' });
    const { corps } = await appelerOutil(env, 'corpus_modifier', { ...CORRECTION, jeton }, CORPUS);
    expect(texteDe(corps)).toMatch(/« canaux\/google-ads » a changé sur GitHub depuis l'aperçu .* rien n'est parti/);
    expect(puts(appels)).toEqual([]);
    expect(lignesCorpus(env)).toEqual([]);
  });

  it('elle change entre la lecture et l’écriture : GitHub refuse, l’échec est journalisé, rien n’est écrasé', async () => {
    const env = creerEnv();
    const { depot } = simulerDepot();
    const jeton = jetonDe((await appelerOutil(env, 'corpus_modifier', CORRECTION, CORPUS)).corps);
    depot.conflitAuProchainPut = true;
    const { corps } = await appelerOutil(env, 'corpus_modifier', { ...CORRECTION, jeton }, CORPUS);
    expect(corps.result.isError).toBe(true);
    expect(texteDe(corps)).toMatch(/^ÉCHEC — écriture n° 1 : « canaux\/google-ads » a changé sur GitHub depuis l'aperçu : rien n'a été écrit/);
    expect(lignesCorpus(env)[0]).toMatchObject({ issue: 'erreur' });
    expect(depot.fichiers.get('canaux/google-ads.md')!.texte).toBe(FICHIERS['canaux/google-ads.md']);
  });
});

// ── Ce qui ne s'écrit pas ────────────────────────────────────────────────

describe('NORMATIF — ce que le serveur refuse d’écrire, quel que soit l’outil', () => {
  it('par l’outil : règles de voix, décision existante, fiche inexistante, README, garde de la console', async () => {
    const env = creerEnv();
    const { appels } = simulerDepot();
    const cas: [Record<string, unknown>, RegExp][] = [
      [{ chemin: 'voix/regles-de-voix', contenu: FICHIERS['voix/regles-de-voix.md'].replace('interdit', 'permis') }, /engendre les règles de voix des prompts/],
      [{ chemin: 'strategie/decisions/2026-08-seuil-suspendu', remplacements: [{ avant: '**Décidé.**', apres: '**Annulé.**' }] }, /une décision ne se réécrit pas/],
      [{ chemin: 'canaux/youtube', contenu: '---\nstatut: actif\n---\n\n# YouTube\n\nx' }, /n'est pas une fiche du corpus.*corpus_decision_ajouter/],
      [{ chemin: 'canaux/README', contenu: '# x' }, /Arguments invalides/],
      [{ chemin: 'autre/fiche', contenu: '# x' }, /n'est pas un bloc du corpus/],
      [{ chemin: 'canaux/google-ads', contenu: '# Google Ads\n\nsans frontmatter' }, /frontmatter a disparu/],
      [{ chemin: 'canaux/google-ads', remplacements: [{ avant: 'statut: actif', apres: 'statut: actiff' }] }, /Statut « actiff » inconnu/],
      [{ chemin: 'canaux/google-ads', remplacements: [{ avant: '# Google Ads', apres: 'Google Ads' }] }, /Aucun titre/],
      [{ chemin: 'canaux/google-ads', remplacements: [{ avant: 'Budget : 99 €', apres: 'x' }] }, /remplacement 1 .* introuvable dans la fiche/],
      [{ chemin: 'canaux/google-ads', remplacements: [{ avant: 'Cible : Lyon.', apres: 'x' }] }, /présent 2 fois — allonger le passage/],
      [{ chemin: 'canaux/google-ads', remplacements: [{ avant: '10 €', apres: '10 €' }] }, /Aucun changement/],
      [{ chemin: 'canaux/google-ads' }, /`remplacements` OU `contenu`/],
      [{ chemin: 'canaux/google-ads', contenu: 'x', remplacements: [{ avant: 'a', apres: 'b' }] }, /`remplacements` OU `contenu`/],
    ];
    for (const [args, attendu] of cas) {
      const { corps } = await appelerOutil(env, 'corpus_modifier', args, CORPUS);
      expect(texteDe(corps), JSON.stringify(args).slice(0, 80)).toMatch(attendu);
    }
    expect(puts(appels)).toEqual([]);
  });

  it('par la table fermée, même appelée directement par le code : rien ne part', async () => {
    const env = creerEnv();
    const { appels } = simulerDepot();
    const valide = '---\ntype: fact\nstatut: actif\n---\n\n# Titre\n\nTexte.\n';
    const refusees: [Parameters<typeof ecrireFichier>[1], RegExp][] = [
      [{ chemin: 'voix/regles-de-voix', contenu: valide, sha: 'blob3', message: 'm' }, /règles de voix/],
      [{ chemin: 'strategie/decisions/2026-08-seuil-suspendu', contenu: valide, sha: 'blob5', message: 'm' }, /ne se réécrit pas/],
      [{ chemin: 'canaux/youtube', contenu: valide, sha: null, message: 'm' }, /seule une décision se crée/],
      [{ chemin: 'canaux/../../../src/index', contenu: valide, sha: 'x', message: 'm' }, /n'est pas un chemin de fiche/],
      [{ chemin: 'canaux/google-ads', contenu: '# sans frontmatter', sha: 'blob6', message: 'm' }, /frontmatter a disparu/],
    ];
    for (const [e, attendu] of refusees) {
      await expect(ecrireFichier(env, e), e.chemin).rejects.toThrow(attendu);
    }
    expect(appels).toEqual([]);
    expect(ecritureAdmise('strategie/decisions/2026-10-nouvelle', true)).toBeNull();
    expect(ecritureAdmise('canaux/google-ads', false)).toBeNull();
  });

  it('un changement de statut se dit dans l’aperçu', async () => {
    const env = creerEnv();
    simulerDepot();
    const { corps } = await appelerOutil(env, 'corpus_modifier', {
      chemin: 'socle/offres/le-seuil', remplacements: [{ avant: 'statut: suspendu', apres: 'statut: actif' }],
    }, CORPUS);
    expect(texteDe(corps)).toMatch(/STATUT : suspendu → actif — le tableau des offres des trois profils le dira\./);
  });
});

// ── Les décisions ────────────────────────────────────────────────────────

describe('corpus_decision_ajouter', () => {
  const DECISION = {
    slug: 'seuil-en-groupe',
    titre: 'Le Seuil revient, en groupe fermé',
    corps: '**Décidé.** Le Seuil revient en groupe fermé.\n\n## Pourquoi\n\nIl est mieux en groupe.',
    touche: ['offres/le-seuil'],
    supersedes: '2026-08-seuil-suspendu',
    review_at: '2027-10',
  };

  it('crée strategie/decisions/AAAA-MM-slug, frontmatter écrit par le serveur, l’ancienne décision intacte', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-03T10:00:00Z') });
    const env = creerEnv();
    const { appels, depot } = simulerDepot();
    const { apercu, execution } = await apercuPuisExecution(env, 'corpus_decision_ajouter', DECISION);
    expect(texteDe(apercu)).toMatch(/Nouvelle décision « strategie\/decisions\/2026-10-seuil-en-groupe »/);
    expect(texteDe(apercu)).toMatch(/Elle supersède « strategie\/decisions\/2026-08-seuil-suspendu », qui n'est pas modifiée/);
    expect(texteDe(execution)).toMatch(/^FAIT/);

    const [put] = puts(appels);
    expect(JSON.parse(put.corps).sha).toBeUndefined();
    expect(depot.fichiers.get('strategie/decisions/2026-10-seuil-en-groupe.md')!.texte).toBe([
      '---', 'type: decision', 'statut: active', 'decide_le: 2026-10-03', 'review_at: 2027-10', 'expose: prive',
      'touche: [offres/le-seuil]', 'supersedes: 2026-08-seuil-suspendu', '---', '',
      '# Le Seuil revient, en groupe fermé', '', DECISION.corps, '',
    ].join('\n'));
    expect(depot.fichiers.get('strategie/decisions/2026-08-seuil-suspendu.md')!.texte).toBe(FICHIERS['strategie/decisions/2026-08-seuil-suspendu.md']);
  });

  it('la date est celle de l’aperçu, même validé après minuit à Paris', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-31T22:55:00Z') }); // 23 h 55 à Paris
    const env = creerEnv();
    const { depot } = simulerDepot();
    const apercu = await appelerOutil(env, 'corpus_decision_ajouter', DECISION, CORPUS);
    vi.useFakeTimers({ now: Date.parse('2026-10-31T23:02:00Z') }); // 0 h 02, le 1er novembre
    const execution = await appelerOutil(env, 'corpus_decision_ajouter', { ...DECISION, jeton: jetonDe(apercu.corps) }, CORPUS);
    expect(texteDe(execution.corps)).toMatch(/^FAIT/);
    expect(depot.fichiers.get('strategie/decisions/2026-10-seuil-en-groupe.md')!.texte).toMatch(/decide_le: 2026-10-31/);
  });

  it('refuse une décision citée qui n’existe pas, un slug déjà pris, un frontmatter ou un titre dans le corps', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-08-10T10:00:00Z') });
    const env = creerEnv();
    const { appels } = simulerDepot();
    for (const [args, attendu] of [
      [{ ...DECISION, supersedes: '2026-07-inexistante' }, /Décision\(s\) introuvable\(s\) : 2026-07-inexistante/],
      [{ ...DECISION, supersedes: undefined, slug: 'seuil-suspendu' }, /existe déjà : une décision ne se réécrit pas/],
      [{ ...DECISION, corps: '---\nstatut: x\n---\ncorps' }, /ne porte pas de frontmatter/],
      [{ ...DECISION, corps: '# Titre\n\ncorps' }, /ne porte pas de titre/],
    ] as const) {
      const { corps } = await appelerOutil(env, 'corpus_decision_ajouter', args, CORPUS);
      expect(texteDe(corps), JSON.stringify(args).slice(0, 60)).toMatch(attendu);
    }
    expect(puts(appels)).toEqual([]);
  });
});

// ── Le déploiement ───────────────────────────────────────────────────────

describe('corpus_deployer', () => {
  it('l’aperçu dit ce qui partirait ; l’exécution lance le workflow, cible api, sur main — et rien d’autre', async () => {
    const env = creerEnv();
    const { depot } = simulerDepot();
    const { apercu, execution } = await apercuPuisExecution(env, 'corpus_deployer', {});
    const a = texteDe(apercu);
    expect(a).toMatch(/Déployer la console \(cible api\) depuis main @ c0ffee0/);
    expect(a).toMatch(/- abcdef1 2026-10-03 Corpus : canaux\/google-ads/);
    expect(a).toMatch(/Dernier passage du workflow : réussi le 2026-10-02, sur aaaaaaa/);
    expect(depot.dispatches).toEqual([{ ref: 'main', inputs: { cible: 'api', repetition: 'false' } }]);
    expect(texteDe(execution)).toMatch(/^FAIT[^]*Déploiement lancé : cible api/);
    expect(lignesCorpus(env)[0]).toMatchObject({ outil: 'corpus_deployer', issue: 'ok' });
  });

  it('main a bougé entre l’aperçu et l’exécution : rien ne part', async () => {
    const env = creerEnv();
    const { depot } = simulerDepot();
    const jeton = jetonDe((await appelerOutil(env, 'corpus_deployer', {}, CORPUS)).corps);
    depot.commit = 'f00d'.padEnd(40, '0');
    const { corps } = await appelerOutil(env, 'corpus_deployer', { jeton }, CORPUS);
    expect(texteDe(corps)).toMatch(/main a bougé depuis l'aperçu \(c0ffee0 → f00d000\) : rien n'est parti/);
    expect(depot.dispatches).toEqual([]);
  });

  it('un passage en cours se signale : le nouveau attendra son tour', async () => {
    const env = creerEnv();
    const d = nouveauDepot();
    d.run = { ...d.run, status: 'in_progress', conclusion: null };
    simulerDepot(d);
    const { corps } = await appelerOutil(env, 'corpus_deployer', {}, CORPUS);
    expect(texteDe(corps)).toMatch(/Dernier passage du workflow : en cours .* Celui-ci attendra son tour/);
  });
});

// ── V7 et V9 ─────────────────────────────────────────────────────────────

describe('NORMATIF — le journal du corpus : écrit avant, plafonné à part', () => {
  it('base en panne : GitHub n’est pas appelé', async () => {
    const env = creerEnv();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { appels } = simulerDepot();
    const jeton = jetonDe((await appelerOutil(env, 'corpus_modifier', CORRECTION, CORPUS)).corps);
    env.DB = d1EnPanne() as never;
    const { corps } = await appelerOutil(env, 'corpus_modifier', { ...CORRECTION, jeton }, CORPUS);
    expect(texteDe(corps)).toMatch(/journal des écritures n'a pas pu s'écrire : rien n'est parti chez GitHub/);
    expect(puts(appels)).toEqual([]);
  });

  it('CORPUS_ECRITURES_MAX_JOUR : atteint, refus ; absent, fermé ; les écritures Google Ads ne comptent pas', async () => {
    const remplir = (env: EnvFactice, table: string, cible: string, n: number) => {
      for (let i = 0; i < n; i++) {
        env.DB.db.prepare(`INSERT INTO ${table} (created_at, outil, ${cible}, auteur, contenu, jeton_empreinte) VALUES (?, ?, ?, ?, ?, ?)`)
          .run(Date.now() - 60_000, 'x', 'x', 'florent@luminose.fr', '{}', `${table}-${i}`);
      }
    };
    const env = creerEnv();
    const { appels } = simulerDepot();
    remplir(env, 'ads_ecritures', 'compte', 30);
    const { execution } = await apercuPuisExecution(env, 'corpus_modifier', CORRECTION);
    expect(texteDe(execution)).toMatch(/^FAIT/);

    const plein = creerEnv();
    simulerDepot();
    remplir(plein, 'corpus_ecritures', 'depot', 20);
    expect(texteDe((await apercuPuisExecution(plein, 'corpus_modifier', CORRECTION)).execution))
      .toMatch(/Plafond atteint : 20 écritures sur les dernières 24 heures \(CORPUS_ECRITURES_MAX_JOUR = 20\)/);

    const ferme = creerEnv({ CORPUS_ECRITURES_MAX_JOUR: undefined });
    simulerDepot();
    expect(texteDe((await apercuPuisExecution(ferme, 'corpus_modifier', CORRECTION)).execution))
      .toMatch(/CORPUS_ECRITURES_MAX_JOUR absent ou illisible/);
    expect(puts(appels)).toHaveLength(1);
  });
});

describe('NORMATIF — la couche C n’appelle que sa table', () => {
  it('lectures, commits et déploiement confondus', async () => {
    const env = creerEnv();
    const { appels } = simulerDepot();
    await appelerOutil(env, 'corpus_index', {}, CORPUS);
    await appelerOutil(env, 'corpus_lire', { chemins: ['socle/identite'] }, CORPUS);
    await appelerOutil(env, 'corpus_contexte', { profil: 'noyau' }, CORPUS);
    await apercuPuisExecution(env, 'corpus_modifier', CORRECTION);
    await apercuPuisExecution(env, 'corpus_decision_ajouter', { slug: 'essai', titre: 'Essai', corps: '**Décidé.**' });
    await apercuPuisExecution(env, 'corpus_deployer', {});
    const permis = [
      /^https:\/\/api\.github\.com\/graphql$/,
      /^https:\/\/api\.github\.com\/repos\/luminose-fr\/gestion\/contents\/packages\/corpus\/content\/[a-z0-9/-]+\.md$/,
      /^https:\/\/api\.github\.com\/repos\/luminose-fr\/gestion\/commits\?sha=main&path=packages\/corpus\/content&per_page=5$/,
      /^https:\/\/api\.github\.com\/repos\/luminose-fr\/gestion\/actions\/workflows\/deploiement\.yml\/(dispatches|runs\?per_page=1)$/,
    ];
    expect(appels.filter((a) => !permis.some((p) => p.test(a.url))).map((a) => a.url)).toEqual([]);
    expect(lignesCorpus(env).map((l) => l.issue)).toEqual(['ok', 'ok', 'ok']);
    // Aucun appel à Google Ads au passage.
    expect(appels.some((a) => a.url.includes('googleads'))).toBe(false);
    expect(COMPTE).toBe('1234567890');
  });
});
