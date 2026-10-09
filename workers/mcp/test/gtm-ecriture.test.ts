/**
 * Google Tag Manager, préparer — décision du 09/10/2026
 * (workers/mcp/decisions/2026-10-09-gtm-ecriture.md).
 *
 * Le conteneur simulé ici a un ÉTAT : une exécution y ouvre l'espace
 * « [Claude] » et y crée ce qu'elle doit, un aperçu non. Chaque test NORMATIF
 * regarde ce qui part réellement chez Tag Manager — les POST, leurs chemins,
 * leurs corps, le jeton qui les porte — et ce que le journal a écrit, pas ce
 * que l'outil annonce. Le conteneur et les conversions sont fictifs.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cheminEcriturePermis, creerGtm, formeRefusee, oublierConteneursGtm, type Conteneur } from '../src/gtm';
import { appelerOutil, creerEnv as creerEnvBase, simulerFetch, texteDe as texteBrut, type Appel, type EnvFactice } from './aides';
import { d1EnPanne } from './d1';
import type { Env } from '../src/env';

const texteDe = (corps: unknown) => texteBrut(corps).replace(/[  ]/g, ' ');

beforeEach(() => { oublierConteneursGtm(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const API = 'https://tagmanager.googleapis.com/tagmanager/v2';
const BASE = `${API}/accounts/6001/containers/7001`;
const LECTURE = 'https://www.googleapis.com/auth/tagmanager.readonly';
const EDITION = 'https://www.googleapis.com/auth/tagmanager.edit.containers';
const GTM = ['ads:lire', 'gtm:ecrire'];

const creerEnv = (surcharges: Partial<Env> = {}): EnvFactice => creerEnvBase({
  GTM_REFRESH_TOKEN: 'refresh-gtm', GTM_ECRITURE_REFRESH_TOKEN: 'refresh-gtm-ecriture', GTM_CONTENEUR: 'GTM-TEST123',
  GTM_ECRITURES_MAX_JOUR: '20', ...surcharges,
});

// ── Un Tag Manager à état ────────────────────────────────────────────────

const AW = '1234567890';
const p = (key: string, value: string) => ({ type: 'template', key, value });
const condition = (type: string, arg0: string, arg1: string) => ({ type, parameter: [p('arg0', arg0), p('arg1', arg1)] });

const BALISES = [
  { tagId: '1', name: 'GADS - Rendez-vous', type: 'awct', parameter: [p('conversionId', AW), p('conversionLabel', 'LIBELLE_RDV')], firingTriggerId: ['21'] },
  { tagId: '2', name: 'Balise Google AdWords', type: 'googtag', parameter: [p('tagId', `AW-${AW}`)], firingTriggerId: ['2147479573'] },
  { tagId: '3', name: 'GA - Init', type: 'googtag', parameter: [p('tagId', '{{GA4 ID}}')], firingTriggerId: ['2147479572'] },
  { tagId: '4', name: 'GA - Prendre un rendez-vous', type: 'gaawe', parameter: [p('eventName', 'bt_prendre_rendez_vous'), p('measurementIdOverride', 'G-TEST1234')], firingTriggerId: ['22'] },
];
const DECLENCHEURS = [
  { triggerId: '21', name: 'Merci rendez-vous', type: 'pageview', filter: [condition('contains', '{{Page Path}}', '/merci-rdv')] },
  { triggerId: '22', name: 'Clic RDV', type: 'click', filter: [condition('cssSelector', '{{Click Element}}', '[data-track="bt_prise_rdv"]')] },
];
const VARIABLES = [
  { variableId: '31', name: 'GA4 ID', type: 'c', parameter: [p('value', 'G-TEST1234')] },
  { variableId: '32', name: 'Données utilisateur', type: 'awec', parameter: [p('mode', 'AUTO')] },
  { variableId: '33', name: 'dl.prix', type: 'v', parameter: [p('name', 'prix')] },
];
const INTEGREES = ['Page Path', 'Page URL', 'Event', 'Click Element', 'Click Text'];

const envoi = (libelle: string) => [{ type: 'WEBPAGE', eventSnippet: `gtag('event', 'conversion', {'send_to': 'AW-${AW}/${libelle}'});` }];
const CONVERSIONS = [
  { id: '501', name: 'Rendez-vous', status: 'ENABLED', type: 'WEBPAGE', tagSnippets: envoi('LIBELLE_RDV') },
  { id: '502', name: 'Passage - adéquation', status: 'ENABLED', type: 'WEBPAGE', tagSnippets: envoi('LIBELLE_PASSAGE') },
  { id: '503', name: 'Inscription', status: 'ENABLED', type: 'WEBPAGE_CODELESS', tagSnippets: envoi('LIBELLE_INSCRIPTION') },
  { id: '504', name: 'Appels', status: 'ENABLED', type: 'WEBSITE_CALL', tagSnippets: [{ type: 'WEBSITE_CALL', eventSnippet: `gtag('config', 'AW-${AW}/LIBELLE_APPEL')` }] },
  { id: '505', name: 'Ancienne', status: 'REMOVED', type: 'WEBPAGE', tagSnippets: envoi('LIBELLE_ANCIEN') },
];

type Element = Record<string, unknown> & { name?: string };
type EspaceSimule = { workspaceId: string; name: string; balises: Element[]; declencheurs: Element[] };
type Etat = {
  espaces: EspaceSimule[];
  suivant: number;
  /** Les scopes que Google rend pour le jeton d'écriture. */
  scopesEcriture?: string;
  /** Ce que Tag Manager rend à la création d'un espace, à la place de l'espace créé. */
  espaceRendu?: Record<string, unknown>;
  /** Les balises de la version en ligne, à la place de BALISES. */
  enLigne?: Element[];
};

const nouvelEtat = (): Etat => ({
  espaces: [{ workspaceId: '3', name: 'Default Workspace', balises: [...BALISES], declencheurs: [...DECLENCHEURS] }],
  suivant: 100,
});

const SCOPES: Record<string, string> = { 'refresh-gtm': LECTURE, 'refresh-ads': 'https://www.googleapis.com/auth/adwords' };

const simulerGtm = (etat: Etat = nouvelEtat()) => {
  const appels = simulerFetch(({ url, methode, corps }) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      const refresh = new URLSearchParams(corps).get('refresh_token') ?? '';
      const scope = refresh === 'refresh-gtm-ecriture' ? ('scopesEcriture' in etat ? etat.scopesEcriture : EDITION) : SCOPES[refresh];
      return Response.json({ access_token: refresh.replace('refresh-', 'acces-'), expires_in: 3599, ...(scope === undefined ? {} : { scope }) });
    }
    if (url.endsWith(':search')) {
      // Une conversion par son numéro (gtm_conversion_creer), ou toutes les actives (gtm_verifier_conversions).
      const id = /conversion_action\.id = (\d+)/.exec(JSON.parse(corps).query)?.[1];
      const lues = id ? CONVERSIONS.filter((c) => c.id === id) : CONVERSIONS.filter((c) => c.status === 'ENABLED');
      return Response.json({ results: lues.map((conversionAction) => ({ conversionAction })) });
    }
    if (!url.startsWith(API)) return undefined;
    const chemin = url.slice(API.length);
    if (chemin === '/accounts/containers:lookup?tagId=GTM-TEST123') {
      return Response.json({ accountId: '6001', containerId: '7001', publicId: 'GTM-TEST123', name: 'luminose.fr' });
    }
    const local = url.startsWith(BASE) ? url.slice(BASE.length) : '';
    if (local === '/versions:live') {
      return Response.json({
        containerVersionId: '38', name: 'Octobre', tag: etat.enLigne ?? BALISES, trigger: DECLENCHEURS, variable: VARIABLES,
        builtInVariable: INTEGREES.map((name) => ({ name })),
      });
    }
    const lien = (w: string, quoi = '') => `https://tagmanager.google.com/#/container/accounts/6001/containers/7001/workspaces/${w}${quoi}`;
    if (local === '/workspaces' && methode === 'GET') {
      return Response.json({ workspace: etat.espaces.map((e) => ({ workspaceId: e.workspaceId, name: e.name, tagManagerUrl: lien(e.workspaceId) })) });
    }
    if (local === '/workspaces' && methode === 'POST') {
      if (etat.espaceRendu) return Response.json(etat.espaceRendu);
      const e: EspaceSimule = { workspaceId: String(etat.suivant++), name: JSON.parse(corps).name, balises: [...BALISES], declencheurs: [...DECLENCHEURS] };
      etat.espaces.push(e);
      return Response.json({ workspaceId: e.workspaceId, name: e.name, description: JSON.parse(corps).description, tagManagerUrl: lien(e.workspaceId) });
    }
    const m = /^\/workspaces\/(\d+)\/(tags|triggers|variables|built_in_variables)$/.exec(local);
    const espace = m && etat.espaces.find((e) => e.workspaceId === m[1]);
    if (m && espace && methode === 'GET') {
      if (m[2] === 'tags') return Response.json({ tag: espace.balises });
      if (m[2] === 'triggers') return Response.json({ trigger: espace.declencheurs });
      if (m[2] === 'variables') return Response.json({ variable: VARIABLES });
      return Response.json({ builtInVariable: INTEGREES.map((name) => ({ name })) });
    }
    if (m && espace && methode === 'POST' && (m[2] === 'tags' || m[2] === 'triggers')) {
      const element = JSON.parse(corps) as Element;
      const liste = m[2] === 'tags' ? espace.balises : espace.declencheurs;
      if (liste.some((x) => x.name === element.name)) {
        return Response.json({ error: { code: 400, message: `Found entity with duplicate name: ${element.name}`, status: 'INVALID_ARGUMENT' } }, { status: 400 });
      }
      const id = String(etat.suivant++);
      const cree = { ...element, [m[2] === 'tags' ? 'tagId' : 'triggerId']: id, tagManagerUrl: lien(espace.workspaceId, `/${m[2]}/${id}`) };
      liste.push(cree);
      return Response.json(cree);
    }
    return Response.json({ error: { code: 404, message: `inconnu : ${methode} ${chemin}`, status: 'NOT_FOUND' } }, { status: 404 });
  });
  return { appels, etat };
};

const versGtm = (appels: Appel[]) => appels.filter((a) => a.url.startsWith(API));
const posts = (appels: Appel[]) => versGtm(appels).filter((a) => a.methode !== 'GET');
const jetonDe = (corps: unknown) => /jeton = "([^"]+)"/.exec(texteDe(corps))?.[1];
const lignesGtm = (env: EnvFactice) => env.DB.db.prepare('SELECT * FROM gtm_ecritures ORDER BY id').all() as Record<string, unknown>[];
const claude = (etat: Etat) => etat.espaces.find((e) => e.name === '[Claude]');

const apercuPuisExecution = async (env: EnvFactice, outil: string, args: Record<string, unknown>, scopes = GTM) => {
  const apercu = await appelerOutil(env, outil, args, scopes);
  const execution = await appelerOutil(env, outil, { ...args, jeton: jetonDe(apercu.corps) }, scopes);
  return { apercu: apercu.corps, execution: execution.corps };
};

const DECLENCHEUR = { nom: 'Merci adéquation', type: 'vue_de_page', conditions: [{ variable: 'Page Path', operateur: 'contient', valeur: '/adequation-merci' }] };
const CONVERSION = { conversion: '502', declencheurs: ['21'] };

// ── Les verrous ──────────────────────────────────────────────────────────

describe('NORMATIF — Tag Manager, préparer : les verrous', () => {
  it('sans la case « Tag Manager » du consentement, chaque outil refuse avant tout appel', async () => {
    const env = creerEnv();
    const { appels } = simulerGtm();
    for (const [nom, args] of [['gtm_declencheur_creer', DECLENCHEUR], ['gtm_conversion_creer', CONVERSION], ['gtm_evenement_ga4_creer', { evenement: 'essai', declencheurs: ['21'] }]] as const) {
      const { corps } = await appelerOutil(env, nom, args, ['ads:lire', 'ads:ecrire', 'corpus:ecrire']);
      expect(texteDe(corps), nom).toMatch(/L'écriture dans Tag Manager n'est pas accordée à cette connexion/);
    }
    expect(versGtm(appels)).toEqual([]);
    expect(appels.some((a) => a.url.startsWith('https://googleads.'))).toBe(false);
  });

  it('sans GTM_ECRITURE_REFRESH_TOKEN, l’écriture est fermée dès l’aperçu, et la lecture continue', async () => {
    const env = creerEnv({ GTM_ECRITURE_REFRESH_TOKEN: undefined });
    const { appels } = simulerGtm();
    const { corps } = await appelerOutil(env, 'gtm_declencheur_creer', DECLENCHEUR, GTM);
    expect(texteDe(corps)).toMatch(/Secret GTM_ECRITURE_REFRESH_TOKEN absent du Worker MCP : l'écriture dans Tag Manager est fermée, la lecture continue/);
    expect(versGtm(appels)).toEqual([]);
    const lire = await appelerOutil(env, 'gtm_lire', { quoi: 'declencheurs' }, GTM);
    expect(texteDe(lire.corps)).toMatch(/### « Merci rendez-vous » \(n° 21\)/);
  });

  it('G6 — un jeton d’écriture qui pourrait créer une version ou publier ferme l’écriture, avant tout appel à Tag Manager', async () => {
    for (const scopes of [
      `${EDITION} https://www.googleapis.com/auth/tagmanager.publish`,
      `${EDITION} https://www.googleapis.com/auth/tagmanager.edit.containerversions`,
      `${EDITION} https://www.googleapis.com/auth/tagmanager.delete.containers`,
      LECTURE,
      undefined,
    ]) {
      const env = creerEnv();
      const etat = nouvelEtat();
      etat.scopesEcriture = scopes;
      const { appels } = simulerGtm(etat);
      const { corps } = await appelerOutil(env, 'gtm_declencheur_creer', DECLENCHEUR, GTM);
      expect(corps.result.isError, String(scopes)).toBe(true);
      expect(texteDe(corps), String(scopes)).toMatch(/jeton d'écriture de Tag Manager/);
      expect(texteDe(corps), String(scopes)).toMatch(/Régénérez GTM_ECRITURE_REFRESH_TOKEN : node workers\/mcp\/scripts\/jeton-google-ads\.mjs gtm-ecriture/);
      expect(versGtm(appels), String(scopes)).toEqual([]);
    }
  });

  it('l’aperçu ne fait que lire : aucun POST, aucun journal ; il montre ce qui serait créé, et où', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerGtm();
    const { corps } = await appelerOutil(env, 'gtm_declencheur_creer', DECLENCHEUR, GTM);
    const t = texteDe(corps);
    expect(t).toMatch(/^APERÇU — rien n'a été modifié : Tag Manager n'a été que lu\./);
    expect(t).toMatch(/dans un espace de travail « \[Claude\] », ouvert à l'exécution depuis la dernière version du conteneur \(vérifié sur la version en ligne n° 38 « Octobre »\)/);
    expect(t).toMatch(/### « \[Claude\] Merci adéquation » — Vue de page \(pageview\) — \{\{Page Path\}\} contient « \/adequation-merci »/);
    expect(t).toMatch(/jeton = "/);
    expect(posts(appels)).toEqual([]);
    expect(versGtm(appels).every((a) => a.methode === 'GET' && a.entetes.authorization === 'Bearer acces-gtm')).toBe(true);
    expect(lignesGtm(env)).toEqual([]);
    expect(claude(etat)).toBeUndefined();
  });

  it('la première exécution ouvre l’espace « [Claude] », puis y crée — avec le jeton d’écriture, journalisé avant', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerGtm();
    const { execution } = await apercuPuisExecution(env, 'gtm_declencheur_creer', DECLENCHEUR);
    const t = texteDe(execution);
    expect(t).toMatch(/^FAIT — écriture n° 1 du journal de Tag Manager\.\n\nEspace de travail « \[Claude\] » ouvert \(n° 100\)/);
    expect(t).toMatch(/Déclencheur « \[Claude\] Merci adéquation » créé — n° 101\. Une balise s’en sert avec declencheurs = \["101"\]\./);
    expect(t).toMatch(/Rien n'est publié\. Ce que l'espace publierait : gtm_verifier_conversions ou gtm_lire avec espace = "100"\./);

    const [ouvrir, creer] = posts(appels);
    expect(posts(appels)).toHaveLength(2);
    expect(ouvrir.url).toBe(`${BASE}/workspaces`);
    expect(JSON.parse(ouvrir.corps)).toEqual({ name: '[Claude]', description: expect.stringMatching(/^Préparé par Claude/) });
    expect(creer.url).toBe(`${BASE}/workspaces/100/triggers`);
    expect(JSON.parse(creer.corps)).toEqual({
      name: '[Claude] Merci adéquation', type: 'pageview',
      filter: [{ type: 'contains', parameter: [p('arg0', '{{Page Path}}'), p('arg1', '/adequation-merci')] }],
      notes: expect.stringMatching(/^Préparé par Claude/),
    });
    expect(posts(appels).every((a) => a.methode === 'POST' && a.entetes.authorization === 'Bearer acces-gtm-ecriture')).toBe(true);
    expect(versGtm(appels).filter((a) => a.methode === 'GET').every((a) => a.entetes.authorization === 'Bearer acces-gtm')).toBe(true);
    // Rien dans l'espace de Florent.
    expect(etat.espaces[0].declencheurs).toHaveLength(2);
    expect(claude(etat)!.declencheurs.map((d) => d.name)).toContain('[Claude] Merci adéquation');

    const [ligne] = lignesGtm(env);
    expect(ligne).toMatchObject({ outil: 'gtm_declencheur_creer', conteneur: 'GTM-TEST123', auteur: 'florent@luminose.fr', issue: 'ok' });
    expect(JSON.parse(ligne.contenu as string)).toMatchObject({ espace: 'à créer', entite: 'declencheur', corps: { name: '[Claude] Merci adéquation' } });
    expect(JSON.parse(ligne.ressources as string)).toEqual([
      'https://tagmanager.google.com/#/container/accounts/6001/containers/7001/workspaces/100',
      'https://tagmanager.google.com/#/container/accounts/6001/containers/7001/workspaces/100/triggers/101',
    ]);
    // Les autres journaux n'ont rien vu.
    expect(env.DB.lignes()).toEqual([]);
  });

  it('ensuite, l’espace « [Claude] » sert tel quel, et l’aperçu y voit ce qui a été créé', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerGtm();
    await apercuPuisExecution(env, 'gtm_declencheur_creer', DECLENCHEUR);
    const { apercu, execution } = await apercuPuisExecution(env, 'gtm_conversion_creer', { conversion: '502', declencheurs: ['101'] });
    expect(texteDe(apercu)).toMatch(/dans l'espace de travail « \[Claude\] » \(n° 100\)/);
    expect(texteDe(apercu)).toMatch(/- Déclenchée par : « \[Claude\] Merci adéquation » \(Vue de page/);
    expect(texteDe(execution)).toMatch(/^FAIT — écriture n° 2 du journal de Tag Manager\.\n\nBalise « \[Claude\] GADS - Passage - adéquation » créée — n° 102/);
    expect(posts(appels).map((a) => a.url)).toEqual([`${BASE}/workspaces`, `${BASE}/workspaces/100/triggers`, `${BASE}/workspaces/100/tags`]);
    expect(etat.espaces.filter((e) => e.name === '[Claude]')).toHaveLength(1);
  });

  it('un jeton ne vaut que pour ses arguments, une fois, dix minutes, et pour son outil', async () => {
    const env = creerEnv();
    const { appels } = simulerGtm();
    const jeton = jetonDe((await appelerOutil(env, 'gtm_conversion_creer', CONVERSION, GTM)).corps);

    for (const args of [{ ...CONVERSION, declencheurs: ['22'] }, { ...CONVERSION, valeur: 50 }, { ...CONVERSION, nom: 'Autre nom' }]) {
      const { corps } = await appelerOutil(env, 'gtm_conversion_creer', { ...args, jeton }, GTM);
      expect(texteDe(corps), JSON.stringify(args)).toMatch(/diffère de celui de l'aperçu : rien n'est parti/);
    }
    const voisin = await appelerOutil(env, 'gtm_evenement_ga4_creer', { evenement: 'essai', declencheurs: ['21'], jeton }, GTM);
    expect(texteDe(voisin.corps)).toMatch(/Jeton d'aperçu invalide pour cet outil/);
    expect(posts(appels)).toEqual([]);

    await appelerOutil(env, 'gtm_conversion_creer', { ...CONVERSION, jeton }, GTM);
    expect(posts(appels)).toHaveLength(2);
    const rejoue = await appelerOutil(env, 'gtm_conversion_creer', { ...CONVERSION, jeton }, GTM);
    expect(texteDe(rejoue.corps)).toMatch(/déjà servi/);
    expect(posts(appels)).toHaveLength(2);

    const autre = jetonDe((await appelerOutil(env, 'gtm_evenement_ga4_creer', { evenement: 'essai', declencheurs: ['21'] }, GTM)).corps);
    vi.useFakeTimers({ now: Date.now() + 10 * 60 * 1000 + 1000 });
    const expire = await appelerOutil(env, 'gtm_evenement_ga4_creer', { evenement: 'essai', declencheurs: ['21'], jeton: autre }, GTM);
    expect(texteDe(expire.corps)).toMatch(/expiré/);
    expect(posts(appels)).toHaveLength(2);
  });

  it('l’espace vu à l’aperçu a disparu — publié ou supprimé : refus, rien ne part, rien n’est journalisé', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerGtm();
    await apercuPuisExecution(env, 'gtm_declencheur_creer', DECLENCHEUR);
    const jeton = jetonDe((await appelerOutil(env, 'gtm_conversion_creer', CONVERSION, GTM)).corps);
    // Florent publie l'espace : Tag Manager le ferme.
    etat.espaces = etat.espaces.filter((e) => e.name !== '[Claude]');
    const { corps } = await appelerOutil(env, 'gtm_conversion_creer', { ...CONVERSION, jeton }, GTM);
    expect(texteDe(corps)).toMatch(/L'espace « \[Claude\] » vu à l'aperçu \(n° 100\) n'existe plus — publié ou supprimé depuis : rien n'est parti/);
    expect(posts(appels)).toHaveLength(2);
    expect(lignesGtm(env)).toHaveLength(1);
  });

  it('deux espaces « [Claude] » : on ne choisit pas', async () => {
    const env = creerEnv();
    const etat = nouvelEtat();
    etat.espaces.push({ workspaceId: '8', name: '[Claude]', balises: [], declencheurs: [] }, { workspaceId: '9', name: '[Claude]', balises: [], declencheurs: [] });
    const { appels } = simulerGtm(etat);
    const { corps } = await appelerOutil(env, 'gtm_declencheur_creer', DECLENCHEUR, GTM);
    expect(texteDe(corps)).toMatch(/2 espaces de travail se nomment « \[Claude\] » dans GTM-TEST123/);
    expect(posts(appels)).toEqual([]);
  });

  it('la garde ne dépend pas de l’appelant : un espace rendu par Tag Manager sous un autre nom ou un identifiant piégé ne reçoit rien', async () => {
    for (const espaceRendu of [
      { workspaceId: '3', name: 'Default Workspace' },
      { workspaceId: '100/../3', name: '[Claude]' },
    ]) {
      const env = creerEnv();
      const etat = nouvelEtat();
      etat.espaceRendu = espaceRendu;
      const { appels } = simulerGtm(etat);
      await apercuPuisExecution(env, 'gtm_declencheur_creer', DECLENCHEUR).catch(() => undefined);
      expect(posts(appels).map((a) => a.url), JSON.stringify(espaceRendu)).toEqual([`${BASE}/workspaces`]);
      expect(lignesGtm(env).map((l) => l.issue), JSON.stringify(espaceRendu)).toEqual(['erreur']);
    }
  });

  it('Tag Manager refuse à l’exécution — un nom pris entre-temps : ÉCHEC dit, rien de créé, journal en erreur', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerGtm();
    await apercuPuisExecution(env, 'gtm_declencheur_creer', DECLENCHEUR);
    const args = { ...DECLENCHEUR, nom: 'Autre' };
    const jeton = jetonDe((await appelerOutil(env, 'gtm_declencheur_creer', args, GTM)).corps);
    claude(etat)!.declencheurs.push({ triggerId: '150', name: '[Claude] Autre', type: 'pageview' });
    const { corps } = await appelerOutil(env, 'gtm_declencheur_creer', { ...args, jeton }, GTM);
    expect(texteDe(corps)).toMatch(/^ÉCHEC — écriture n° 2 : Tag Manager refuse la création \(Found entity with duplicate name: \[Claude\] Autre\)\. Rien n'a été créé dans l'espace\./);
    expect(posts(appels)).toHaveLength(3);
    expect(lignesGtm(env).map((l) => l.issue)).toEqual(['ok', 'erreur']);
  });

  it('GTM_ECRITURES_MAX_JOUR : atteint, refus ; absent, fermé ; les écritures Google Ads et du corpus ne comptent pas', async () => {
    const remplir = (env: EnvFactice, table: string, cible: string, n: number) => {
      for (let i = 0; i < n; i++) {
        env.DB.db.prepare(`INSERT INTO ${table} (created_at, outil, ${cible}, auteur, contenu, jeton_empreinte) VALUES (?, ?, ?, ?, ?, ?)`)
          .run(Date.now() - 60_000, 'x', 'x', 'florent@luminose.fr', '{}', `${table}-${i}`);
      }
    };
    const env = creerEnv();
    simulerGtm();
    remplir(env, 'ads_ecritures', 'compte', 30);
    remplir(env, 'corpus_ecritures', 'depot', 20);
    expect(texteDe((await apercuPuisExecution(env, 'gtm_declencheur_creer', DECLENCHEUR)).execution)).toMatch(/^FAIT/);

    const plein = creerEnv();
    const { appels } = simulerGtm();
    remplir(plein, 'gtm_ecritures', 'conteneur', 20);
    expect(texteDe((await apercuPuisExecution(plein, 'gtm_declencheur_creer', DECLENCHEUR)).execution))
      .toMatch(/Plafond atteint : 20 écritures sur les dernières 24 heures \(GTM_ECRITURES_MAX_JOUR = 20\)/);
    expect(posts(appels)).toEqual([]);

    const ferme = creerEnv({ GTM_ECRITURES_MAX_JOUR: undefined });
    const f = simulerGtm();
    expect(texteDe((await apercuPuisExecution(ferme, 'gtm_declencheur_creer', DECLENCHEUR)).execution)).toMatch(/GTM_ECRITURES_MAX_JOUR absent ou illisible/);
    expect(posts(f.appels)).toEqual([]);
  });

  it('sans journal, Tag Manager n’est pas appelé', async () => {
    const env = creerEnv();
    const { appels } = simulerGtm();
    const jeton = jetonDe((await appelerOutil(env, 'gtm_declencheur_creer', DECLENCHEUR, GTM)).corps);
    (env as { DB: unknown }).DB = d1EnPanne();
    const { corps } = await appelerOutil(env, 'gtm_declencheur_creer', { ...DECLENCHEUR, jeton }, GTM);
    expect(texteDe(corps)).toMatch(/Le journal des écritures n'a pas pu s'écrire : rien n'est parti chez Tag Manager/);
    expect(posts(appels)).toEqual([]);
  });

  it('de bout en bout, rien que des GET et des POST sur les chemins permis, jamais dans un autre espace que « [Claude] »', async () => {
    const env = creerEnv();
    const { appels } = simulerGtm();
    await apercuPuisExecution(env, 'gtm_declencheur_creer', DECLENCHEUR);
    await apercuPuisExecution(env, 'gtm_declencheur_creer', { nom: 'Achat', type: 'evenement', evenement: 'achat_confirme' });
    await apercuPuisExecution(env, 'gtm_conversion_creer', { conversion: '502', declencheurs: ['101'], valeur_variable: 'dl.prix', donnees_utilisateur: 'Données utilisateur' });
    await apercuPuisExecution(env, 'gtm_evenement_ga4_creer', { evenement: 'achat_confirme', declencheurs: ['102'], parametres: [{ nom: 'page', valeur: '{{Page Path}}' }] });
    expect(lignesGtm(env).map((l) => l.issue)).toEqual(['ok', 'ok', 'ok', 'ok']);
    expect(versGtm(appels).filter((a) => !['GET', 'POST'].includes(a.methode))).toEqual([]);
    expect(posts(appels).map((a) => a.url)).toEqual([
      `${BASE}/workspaces`, `${BASE}/workspaces/100/triggers`, `${BASE}/workspaces/100/triggers`, `${BASE}/workspaces/100/tags`, `${BASE}/workspaces/100/tags`,
    ]);
    const c: Conteneur = { accountId: '6001', containerId: '7001', publicId: 'GTM-TEST123' };
    for (const a of posts(appels)) {
      expect(cheminEcriturePermis(a.url.slice(API.length), c, { workspaceId: '100', name: '[Claude]' }), a.url).toBe(true);
    }
  });
});

// ── Les tables fermées ───────────────────────────────────────────────────

describe('NORMATIF — G8 : trois chemins, et seulement dans l’espace « [Claude] »', () => {
  const c: Conteneur = { accountId: '6001', containerId: '7001', publicId: 'GTM-TEST123' };
  const espace = { workspaceId: '100', name: '[Claude]' };
  const base = '/accounts/6001/containers/7001/workspaces';

  it('créer l’espace, et y créer un déclencheur ou une balise', () => {
    for (const chemin of [base, `${base}/100/triggers`, `${base}/100/tags`]) expect(cheminEcriturePermis(chemin, c, espace), chemin).toBe(true);
  });

  it('rien d’autre : ni l’espace de Florent, ni publier, ni créer une version, ni modifier, ni un autre conteneur', () => {
    for (const chemin of [
      `${base}/3/tags`, `${base}/3/triggers`, `${base}/100/variables`, `${base}/100/built_in_variables`, `${base}/100/tags/5`,
      `${base}/100:create_version`, `${base}/100:quick_preview`, `${base}/100:sync`, `${base}/100`,
      '/accounts/6001/containers/7001/versions/38:publish', '/accounts/6001/containers/7002/workspaces', '/accounts/6002/containers/7001/workspaces',
      '/accounts/6001/containers/7001/environments', '/accounts/6001/user_permissions', `${base}/100/../3/tags`, `${base}/100/tags?x=1`,
    ]) expect(cheminEcriturePermis(chemin, c, espace), chemin).toBe(false);
    // Un espace d'un autre nom, ou à l'identifiant piégé, ne reçoit rien — même celui de Florent passé comme « espace ».
    expect(cheminEcriturePermis(`${base}/3/tags`, c, { workspaceId: '3', name: 'Default Workspace' })).toBe(false);
    expect(cheminEcriturePermis(`${base}/100/../3/tags`, c, { workspaceId: '100/../3', name: '[Claude]' })).toBe(false);
    expect(cheminEcriturePermis(`${base}/100/tags`, c)).toBe(false);
  });
});

describe('NORMATIF — G9 : la table fermée des corps', () => {
  const awct = {
    name: '[Claude] GADS - X', type: 'awct', parameter: [p('conversionId', AW), p('conversionLabel', 'LIB')],
    firingTriggerId: ['21'], consentSettings: { consentStatus: 'notNeeded' }, notes: 'n',
  };
  const declencheur = { name: '[Claude] D', type: 'pageview', filter: [condition('contains', '{{Page Path}}', '/x')] };

  it('revérifiée au moment d’envoyer, quel que soit l’appelant : rien ne part', async () => {
    const env = creerEnv();
    const { appels } = simulerGtm();
    const c: Conteneur = { accountId: '6001', containerId: '7001', publicId: 'GTM-TEST123' };
    const espace = { workspaceId: '100', name: '[Claude]' };
    await expect(creerGtm(env, c, 'balise', { ...awct, type: 'html', parameter: [p('html', '<script>x</script>')] }, espace))
      .rejects.toThrow(/Écriture refusée par la table fermée de Tag Manager : type de balise html/);
    await expect(creerGtm(env, c, 'declencheur', { ...declencheur, filter: [] }, espace)).rejects.toThrow(/un déclencheur sans condition/);
    await expect(creerGtm(env, c, 'espace', { name: 'Autre', description: 'd' })).rejects.toThrow(/un espace de travail se nomme « \[Claude\] »/);
    await expect(creerGtm(env, c, 'balise', awct, { workspaceId: '3', name: 'Default Workspace' })).rejects.toThrow(/Écriture refusée par la couche D/);
    expect(versGtm(appels)).toEqual([]);
    // Et la forme juste part, avec le jeton d'écriture.
    await creerGtm(env, c, 'balise', awct, espace).catch(() => undefined);
    expect(posts(appels).map((a) => [a.url, a.entetes.authorization])).toEqual([[`${BASE}/workspaces/100/tags`, 'Bearer acces-gtm-ecriture']]);
  });

  it('ce que les outils construisent passe', () => {
    expect(formeRefusee('balise', awct)).toBeNull();
    expect(formeRefusee('declencheur', declencheur)).toBeNull();
    expect(formeRefusee('espace', { name: '[Claude]', description: 'd' })).toBeNull();
  });

  it('jamais de code, jamais de pause ni de blocage, jamais sans la marque', () => {
    for (const [quoi, corps, raison] of [
      ['HTML', { ...awct, type: 'html', parameter: [p('html', '<script>x</script>')] }, /type de balise html hors de la table — jamais de HTML/],
      ['image', { ...awct, type: 'img' }, /type de balise img hors de la table/],
      ['modèle', { ...awct, type: 'cvt_ABCDE' }, /type de balise cvt_ABCDE hors de la table/],
      ['pause', { ...awct, paused: true }, /champ de balise hors de la table : paused/],
      ['blocage', { ...awct, blockingTriggerId: ['22'] }, /champ de balise hors de la table : blockingTriggerId/],
      ['sans marque', { ...awct, name: 'GADS - X' }, /le nom commence par « \[Claude\] »/],
      ['paramètre inconnu', { ...awct, parameter: [...awct.parameter, p('html', 'x')] }, /paramètre html hors de la table/],
      ['balisage', { ...awct, parameter: [p('conversionId', AW), p('conversionLabel', 'LIB'), p('conversionValue', '<img src=x>')] }, /« < » dans la valeur/],
      ['identifiant', { ...awct, parameter: [p('conversionId', 'AW-1'), p('conversionLabel', 'LIB')] }, /une conversion porte son identifiant/],
      ['sans déclencheur', { ...awct, firingTriggerId: [] }, /de 1 à 5 déclencheurs/],
      ['consentement', { ...awct, consentSettings: { consentStatus: 'needed' } }, /consentement/],
      ['GA4 sans mesure', { ...awct, type: 'gaawe', parameter: [p('eventName', 'e'), p('measurementIdOverride', 'UA-1')] }, /l'identifiant de mesure G-/],
    ] as const) expect(formeRefusee('balise', corps), quoi).toMatch(raison);
  });

  it('des déclencheurs de page, d’événement et de clic, toujours avec une condition sur une variable', () => {
    for (const [quoi, corps, raison] of [
      ['minuteur', { ...declencheur, type: 'timer' }, /type de déclencheur timer hors de la table/],
      ['sans condition', { ...declencheur, filter: [] }, /un déclencheur sans condition/],
      ['gauche sans variable', { ...declencheur, filter: [condition('contains', '/x', '/x')] }, /une variable \{\{…\}\}/],
      ['opérateur', { ...declencheur, filter: [condition('greater', '{{Page Path}}', '1')] }, /opérateur greater hors de la table/],
      ['événement sans nom', { ...declencheur, type: 'customEvent' }, /un événement personnalisé se reconnaît à son nom/],
      ['champ en plus', { ...declencheur, waitForTags: { type: 'boolean', value: 'true' } }, /champ de déclencheur hors de la table : waitForTags/],
    ] as const) expect(formeRefusee('declencheur', corps), quoi).toMatch(raison);
    expect(formeRefusee('espace', { name: 'Default Workspace', description: 'd' })).toMatch(/un espace de travail se nomme « \[Claude\] »/);
  });
});

// ── Les outils ───────────────────────────────────────────────────────────

describe('gtm_declencheur_creer', () => {
  it('un événement de la couche de données, et un clic par sélecteur sur un data-track', async () => {
    const env = creerEnv();
    const { appels } = simulerGtm();
    await apercuPuisExecution(env, 'gtm_declencheur_creer', { nom: 'Achat', type: 'evenement', evenement: 'achat_confirme' });
    const selecteur = 'a[data-track="bt_newsletter"], a[data-track="bt_newsletter"] *';
    const { apercu } = await apercuPuisExecution(env, 'gtm_declencheur_creer', {
      nom: 'Clic newsletter', type: 'clic', conditions: [{ variable: 'Click Element', operateur: 'selecteur_css', valeur: selecteur }],
    });
    expect(texteDe(apercu)).toMatch(/« \[Claude\] Clic newsletter » — Clic sur un élément \(click\) — \{\{Click Element\}\} correspond au sélecteur/);
    const [, evenement, clic] = posts(appels).map((a) => JSON.parse(a.corps));
    expect(evenement).toMatchObject({ type: 'customEvent', customEventFilter: [{ type: 'equals', parameter: [p('arg0', '{{_event}}'), p('arg1', 'achat_confirme')] }] });
    expect(evenement.filter).toBeUndefined();
    expect(clic).toMatchObject({ type: 'click', filter: [{ type: 'cssSelector', parameter: [p('arg0', '{{Click Element}}'), p('arg1', selecteur)] }] });
  });

  it('refuse ce qui partirait partout, ce qui ne se compare pas, et ce que le conteneur ne connaît pas', async () => {
    const env = creerEnv();
    const { appels } = simulerGtm();
    for (const [args, raison] of [
      [{ nom: 'Tout', type: 'clic' }, /Un déclencheur clic sans condition partirait à chaque clic/],
      [{ nom: 'X', type: 'evenement' }, /nomme son événement/],
      [{ nom: 'X', type: 'evenement', evenement: 'gtm.dom' }, /Les événements gtm\.\* sont ceux de Tag Manager/],
      [{ nom: 'X', type: 'vue_de_page', conditions: [{ variable: 'Page Path', operateur: 'selecteur_css', valeur: 'a' }] }, /selecteur_css : seulement sur un clic/],
      [{ nom: 'X', type: 'vue_de_page', conditions: [{ variable: 'Page Path', operateur: 'contient', valeur: '{{Page URL}}' }] }, /sans \{\{variable\}\} ni balisage/],
      [{ nom: 'X', type: 'vue_de_page', conditions: [{ variable: 'Page Path', operateur: 'regex', valeur: '(' }] }, /Expression régulière invalide/],
      [{ nom: 'X', type: 'vue_de_page', conditions: [{ variable: 'Form ID', operateur: 'egale', valeur: 'f' }] }, /Variable\(s\) inconnue\(s\) dans la version en ligne n° 38 « Octobre » : \{\{Form ID\}\}/],
      [{ nom: 'Merci rendez-vous', type: 'vue_de_page', conditions: [{ variable: 'Page Path', operateur: 'contient', valeur: '/x' }] }, null],
    ] as const) {
      const { corps } = await appelerOutil(env, 'gtm_declencheur_creer', args, GTM);
      if (raison) expect(texteDe(corps), JSON.stringify(args)).toMatch(raison);
      // Le nom d'un déclencheur existant, sans la marque : « [Claude] Merci rendez-vous » n'existe pas, il passe.
      else expect(texteDe(corps)).toMatch(/^APERÇU/);
    }
    expect(posts(appels)).toEqual([]);
  });
});

describe('NORMATIF — gtm_conversion_creer : l’identifiant et le libellé viennent de Google Ads', () => {
  it('lus dans Google Ads, pas recopiés ; linker activé ; valeur et conversions améliorées par variable', async () => {
    const env = creerEnv();
    const { appels } = simulerGtm();
    const { apercu } = await apercuPuisExecution(env, 'gtm_conversion_creer', {
      conversion: '502', declencheurs: ['21', '21'], valeur_variable: 'dl.prix', donnees_utilisateur: 'Données utilisateur',
    });
    const t = texteDe(apercu);
    expect(t).toMatch(/Balise de conversion dans un espace de travail « \[Claude\] », ouvert à l'exécution .*, pour « Passage - adéquation » — AW-1234567890\/LIBELLE_PASSAGE, lus dans Google Ads :/);
    expect(t).toMatch(/### « \[Claude\] GADS - Passage - adéquation » — Conversion Google Ads \(awct\)\n- Déclenchée par : « Merci rendez-vous » \(Vue de page/);
    const requete = appels.find((a) => a.url.endsWith(':search'))!;
    expect(JSON.parse(requete.corps).query).toMatch(/FROM conversion_action WHERE conversion_action\.id = 502$/);

    const balise = JSON.parse(posts(appels).at(-1)!.corps);
    expect(balise).toEqual({
      name: '[Claude] GADS - Passage - adéquation', type: 'awct',
      parameter: [
        p('conversionId', AW), p('conversionLabel', 'LIBELLE_PASSAGE'), p('conversionValue', '{{dl.prix}}'),
        { type: 'boolean', key: 'enableConversionLinker', value: 'true' }, p('conversionCookiePrefix', '_gcl'),
        { type: 'boolean', key: 'enableEnhancedConversion', value: 'true' }, p('cssProvidedEnhancedConversionValue', '{{Données utilisateur}}'),
        { type: 'boolean', key: 'rdp', value: 'false' },
      ],
      firingTriggerId: ['21'], consentSettings: { consentStatus: 'notNeeded' }, notes: expect.stringMatching(/^Préparé par Claude/),
    });
    // Ce que la balise publierait, le vérificateur le lit déjà dans l'espace.
    const verif = await appelerOutil(env, 'gtm_verifier_conversions', { espace: '100' }, GTM);
    expect(texteDe(verif.corps)).toMatch(/- OK — « Passage - adéquation » \(n° 502, WEBPAGE, AW-1234567890\/LIBELLE_PASSAGE\) : balise « \[Claude\] GADS - Passage - adéquation »/);
  });

  it('le modèle ne donne ni l’identifiant ni le libellé : l’entrée les refuse, et un nom choisi n’y change rien', async () => {
    const env = creerEnv();
    const { appels } = simulerGtm();
    for (const plus of [{ conversionLabel: 'RECOPIE' }, { libelle: 'RECOPIE' }, { conversionId: '999' }]) {
      const { corps } = await appelerOutil(env, 'gtm_conversion_creer', { ...CONVERSION, ...plus }, GTM);
      expect(texteDe(corps), JSON.stringify(plus)).toMatch(/^Arguments invalides pour gtm_conversion_creer/);
    }
    await apercuPuisExecution(env, 'gtm_conversion_creer', { ...CONVERSION, nom: 'RECOPIE' });
    const balise = JSON.parse(posts(appels).at(-1)!.corps);
    expect(balise.name).toBe('[Claude] RECOPIE');
    expect(balise.parameter.slice(0, 2)).toEqual([p('conversionId', AW), p('conversionLabel', 'LIBELLE_PASSAGE')]);
  });

  it('G11 — une conversion qui a déjà sa balise, sans code, d’appel, inactive ou inconnue : refus, rien ne part', async () => {
    const env = creerEnv();
    const { appels } = simulerGtm();
    for (const [conversion, raison] of [
      ['501', /« Rendez-vous » a déjà sa balise dans la version en ligne n° 38 « Octobre » : « GADS - Rendez-vous »\. Une seconde la compterait deux fois/],
      ['503', /« Inscription » \(WEBPAGE_CODELESS\) : Google Ads la détecte sans code/],
      ['504', /« Appels » \(WEBSITE_CALL\) : un appel depuis le site se mesure par une balise d’appel/],
      ['505', /« Ancienne » n'est pas active dans Google Ads \(REMOVED\)/],
      ['599', /Conversion n° 599 introuvable dans le compte 1234567890/],
    ] as const) {
      const { corps } = await appelerOutil(env, 'gtm_conversion_creer', { conversion, declencheurs: ['21'] }, GTM);
      expect(texteDe(corps), conversion).toMatch(raison);
    }
    expect(posts(appels)).toEqual([]);
  });

  it('les déclencheurs : connus du conteneur, toutes les pages permises, l’initialisation non ; la variable de données utilisateur, du bon type', async () => {
    const env = creerEnv();
    const { appels } = simulerGtm();
    for (const [args, raison] of [
      [{ declencheurs: ['77'] }, /Déclencheur\(s\) introuvable\(s\) dans la version en ligne n° 38 « Octobre » : n° 77/],
      [{ declencheurs: ['2147479573'] }, /« Initialization - All Pages » : réservé aux balises de configuration/],
      [{ declencheurs: ['21'], donnees_utilisateur: 'dl.prix' }, /\{\{dl\.prix\}\} n'est pas une variable « Données fournies par l'utilisateur »/],
      [{ declencheurs: ['21'], valeur: 10, valeur_variable: 'dl.prix' }, /`valeur` OU `valeur_variable`/],
      [{ declencheurs: ['2147479553'] }, /^APERÇU/],
    ] as const) {
      const { corps } = await appelerOutil(env, 'gtm_conversion_creer', { conversion: '502', ...args }, GTM);
      expect(texteDe(corps), JSON.stringify(args)).toMatch(raison);
    }
    expect(posts(appels)).toEqual([]);
  });
});

describe('NORMATIF — gtm_evenement_ga4_creer : l’identifiant de mesure vient du conteneur', () => {
  it('lu dans la balise Google, sa constante résolue ; paramètres en texte ou en variable', async () => {
    const env = creerEnv();
    const { appels } = simulerGtm();
    const { apercu } = await apercuPuisExecution(env, 'gtm_evenement_ga4_creer', {
      evenement: 'bt_prendre_rendez_vous', declencheurs: ['21'], parametres: [{ nom: 'page_path', valeur: '{{Page Path}}' }, { nom: 'offre', valeur: 'seance' }],
    });
    expect(texteDe(apercu)).toMatch(/« bt_prendre_rendez_vous » vers G-TEST1234, lu dans la balise Google du conteneur/);
    // Le même événement part déjà d'une autre balise : dit, pas refusé.
    expect(texteDe(apercu)).toMatch(/« bt_prendre_rendez_vous » part déjà de : « GA - Prendre un rendez-vous »/);
    expect(JSON.parse(posts(appels).at(-1)!.corps)).toEqual({
      name: '[Claude] GA - bt_prendre_rendez_vous', type: 'gaawe',
      parameter: [
        p('eventName', 'bt_prendre_rendez_vous'), p('measurementIdOverride', 'G-TEST1234'), { type: 'boolean', key: 'sendEcommerceData', value: 'false' },
        { type: 'list', key: 'eventSettingsTable', list: [
          { type: 'map', map: [p('parameter', 'page_path'), p('parameterValue', '{{Page Path}}')] },
          { type: 'map', map: [p('parameter', 'offre'), p('parameterValue', 'seance')] },
        ] },
      ],
      firingTriggerId: ['21'], consentSettings: { consentStatus: 'notNeeded' }, notes: expect.stringMatching(/^Préparé par Claude/),
    });
  });

  it('deux identifiants GA4 dans le conteneur, ou aucun : le serveur ne choisit pas', async () => {
    const env = creerEnv();
    const deux = nouvelEtat();
    deux.enLigne = [...BALISES, { tagId: '9', name: 'GA - Autre', type: 'googtag', parameter: [p('tagId', 'G-AUTRE999')], firingTriggerId: ['2147479553'] }];
    const a = simulerGtm(deux);
    expect(texteDe((await appelerOutil(env, 'gtm_evenement_ga4_creer', { evenement: 'essai', declencheurs: ['21'] }, GTM)).corps))
      .toMatch(/Plusieurs identifiants GA4 dans la version en ligne n° 38 « Octobre » \(G-TEST1234, G-AUTRE999\) : ce serveur ne choisit pas/);
    expect(posts(a.appels)).toEqual([]);

    const aucun = nouvelEtat();
    aucun.enLigne = BALISES.filter((x) => x.name !== 'GA - Init');
    const b = simulerGtm(aucun);
    expect(texteDe((await appelerOutil(env, 'gtm_evenement_ga4_creer', { evenement: 'essai', declencheurs: ['21'] }, GTM)).corps))
      .toMatch(/Aucune balise Google GA4 \(G-…\) dans la version en ligne/);
    expect(posts(b.appels)).toEqual([]);
  });

  it('noms réservés, page_view, variable inconnue, mélange de texte et de variable : refus, rien ne part', async () => {
    const env = creerEnv();
    const { appels } = simulerGtm();
    for (const [args, raison] of [
      [{ evenement: 'page_view' }, /la balise Google du conteneur envoie déjà les pages vues/],
      [{ evenement: 'session_start' }, /« session_start » est un nom réservé par GA4/],
      [{ evenement: 'ga_essai' }, /« ga_essai » est un nom réservé par GA4/],
      [{ evenement: 'essai', parametres: [{ nom: 'google_x', valeur: 'a' }] }, /préfixe réservé par GA4 : google_x/],
      [{ evenement: 'essai', parametres: [{ nom: 'a', valeur: 'x' }, { nom: 'a', valeur: 'y' }] }, /Deux paramètres portent le même nom/],
      [{ evenement: 'essai', parametres: [{ nom: 'a', valeur: 'page {{Page Path}}' }] }, /un texte, ou une variable seule/],
      [{ evenement: 'essai', parametres: [{ nom: 'a', valeur: '{{Inconnue}}' }] }, /Variable\(s\) inconnue\(s\) .* \{\{Inconnue\}\}/],
    ] as const) {
      const { corps } = await appelerOutil(env, 'gtm_evenement_ga4_creer', { declencheurs: ['21'], ...args }, GTM);
      expect(texteDe(corps), JSON.stringify(args)).toMatch(raison);
    }
    expect(posts(appels)).toEqual([]);
  });
});
