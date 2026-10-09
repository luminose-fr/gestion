/**
 * Google Tag Manager, en lecture — décision du 08/10/2026
 * (workers/mcp/decisions/2026-10-08-gtm.md).
 *
 * Comme pour Google Ads, les tests NORMATIFS regardent ce qui sort réellement
 * du Worker — les appels `fetch` —, et non ce que les outils annoncent. Le
 * conteneur, ses balises et les conversions sont fictifs.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cheminPermis, oublierConteneursGtm, type Conteneur } from '../src/gtm';
import { oublierJetonsGoogle } from '../src/jeton-google';
import { COMPTE, appelerOutil, creerEnv as creerEnvBase, simulerFetch, texteDe as texteBrut, type Appel, type EnvFactice } from './aides';
import type { Env } from '../src/env';

const texteDe = (corps: unknown) => texteBrut(corps).replace(/[  ]/g, ' ');

beforeEach(() => { oublierConteneursGtm(); oublierJetonsGoogle(); });
afterEach(() => { vi.unstubAllGlobals(); });

const API = 'https://tagmanager.googleapis.com/tagmanager/v2';
const BASE = `${API}/accounts/6001/containers/7001`;
const OUTILS = ['gtm_conteneur', 'gtm_lire', 'gtm_verifier_conversions'];

const creerEnv = (surcharges: Partial<Env> = {}): EnvFactice =>
  creerEnvBase({ GTM_REFRESH_TOKEN: 'refresh-gtm', GTM_CONTENEUR: 'GTM-TEST123', ...surcharges });

// ── Un Tag Manager de comptoir ───────────────────────────────────────────

const p = (key: string, value: string) => ({ type: 'template', key, value });
const condition = (type: string, arg0: string, arg1: string) => ({ type, parameter: [p('arg0', arg0), p('arg1', arg1)] });

const AW = '1234567890';
const TOUTES_LES_PAGES = '2147479553';
const INITIALISATION = '2147479573';

const VARIABLES = [
  { variableId: '31', name: 'ID Google Ads', type: 'c', parameter: [p('value', AW)] },
  { variableId: '32', name: 'Libellé dynamique', type: 'v', parameter: [p('name', 'libelle')] },
];
const DECLENCHEURS = [
  { triggerId: '21', name: 'Merci rendez-vous', type: 'pageview', filter: [condition('contains', '{{Page Path}}', '/merci-rdv')] },
  { triggerId: '22', name: 'Achat confirmé', type: 'customEvent', customEventFilter: [condition('equals', '{{_event}}', 'achat')] },
];
const conversion = (name: string, conversionId: string, conversionLabel: string, firingTriggerId: string[], plus: Record<string, unknown> = {}) =>
  ({ name, type: 'awct', parameter: [p('conversionId', conversionId), p('conversionLabel', conversionLabel)], firingTriggerId, ...plus });
const CODE = `<script>${'x'.repeat(1000)}</script>`;
const BALISES = [
  conversion('Conversion — Rendez-vous', '{{ID Google Ads}}', 'LIBELLE_RDV', ['21']),
  conversion('Conversion — Achat', AW, 'LIBELLE_ACHAT', ['22'], { paused: true }),
  conversion('Conversion — Ancienne', `AW-${AW}`, 'LIBELLE_ANCIEN', [TOUTES_LES_PAGES]),
  conversion('Conversion — Variable', '{{ID Google Ads}}', '{{Libellé dynamique}}', ['22']),
  { name: 'Balise Google', type: 'googtag', parameter: [p('tagId', `AW-${AW}`)], firingTriggerId: [INITIALISATION] },
  { name: 'Linker', type: 'gclidw', parameter: [], firingTriggerId: [TOUTES_LES_PAGES] },
  { name: 'Pixel maison', type: 'html', parameter: [p('html', CODE)], firingTriggerId: [TOUTES_LES_PAGES] },
];

const envoi = (libelle: string) => [{ type: 'WEBPAGE', eventSnippet: `<script>gtag('event', 'conversion', {'send_to': 'AW-${AW}/${libelle}'});</script>` }];
const CONVERSIONS = [
  { name: 'Prise de rendez-vous', type: 'WEBPAGE', tagSnippets: envoi('LIBELLE_RDV') },
  { name: 'Achat', type: 'WEBPAGE', tagSnippets: envoi('LIBELLE_ACHAT') },
  { name: 'Appels depuis le site', type: 'WEBSITE_CALL', tagSnippets: [{ type: 'WEBSITE_CALL', eventSnippet: `gtag('config', 'AW-${AW}/LIBELLE_APPEL')` }] },
  { name: 'Inscription', type: 'WEBPAGE_CODELESS', tagSnippets: envoi('LIBELLE_INSCRIPTION') },
  { name: 'Import', type: 'UPLOAD_CLICKS' },
];

type Monde = { balises?: unknown[]; espaces?: unknown[]; conteneur?: Record<string, unknown>; erreur?: { statut: number; corps: unknown } };

/** Google rend les scopes de chaque jeton : celui de Tag Manager est vérifié à chaque service (G1). */
const SCOPES: Record<string, string> = {
  'refresh-gtm': 'https://www.googleapis.com/auth/tagmanager.readonly',
  'refresh-ads': 'https://www.googleapis.com/auth/adwords',
};

const simulerGtm = (monde: Monde & { scopes?: string } = {}) => simulerFetch(({ url, corps }) => {
  if (url === 'https://oauth2.googleapis.com/token') {
    const refresh = new URLSearchParams(corps).get('refresh_token') ?? '';
    const scope = refresh === 'refresh-gtm' && 'scopes' in monde ? monde.scopes : SCOPES[refresh];
    return Response.json({ access_token: refresh === 'refresh-gtm' ? 'acces-gtm' : 'acces-ads', expires_in: 3599, ...(scope === undefined ? {} : { scope }) });
  }
  if (url.endsWith(':search')) {
    const q: string = JSON.parse(corps).query;
    if (/FROM conversion_action/.test(q)) return Response.json({ results: CONVERSIONS.map((conversionAction) => ({ conversionAction })) });
    return Response.json({ results: [{ campaign: { id: '1' } }] });
  }
  if (!url.startsWith(API)) return undefined;
  if (monde.erreur) return Response.json(monde.erreur.corps, { status: monde.erreur.statut });
  const chemin = url.slice(API.length);
  if (chemin === '/accounts') return Response.json({ account: [{ accountId: '6001', name: 'Luminose' }] });
  if (chemin === '/accounts/6001/containers') {
    return Response.json({ container: [{ publicId: 'GTM-TEST123', name: 'luminose.fr', domainName: ['www.luminose.fr'] }] });
  }
  if (chemin === '/accounts/containers:lookup?tagId=GTM-TEST123') {
    return Response.json({ accountId: '6001', containerId: '7001', publicId: 'GTM-TEST123', name: 'luminose.fr', domainName: ['www.luminose.fr'], ...monde.conteneur });
  }
  const local = url.startsWith(BASE) ? url.slice(BASE.length) : '';
  if (local === '/versions:live') {
    return Response.json({
      containerVersionId: '12', name: 'Octobre',
      tag: monde.balises ?? BALISES, trigger: DECLENCHEURS, variable: VARIABLES,
      builtInVariable: [{ name: 'Page Path' }, { name: 'Event' }],
    });
  }
  if (local === '/workspaces') return Response.json({ workspace: monde.espaces ?? [{ workspaceId: '3', name: 'Default Workspace' }, { workspaceId: '4', name: 'Essai' }] });
  if (local === '/workspaces/3/status') {
    return Response.json({ workspaceChange: [{ changeStatus: 'added', tag: { name: 'Nouvelle balise' } }, { changeStatus: 'updated', trigger: { name: 'Merci rendez-vous' } }] });
  }
  if (local === '/workspaces/4/status') return Response.json({});
  // L'espace 3 : ses balises sur deux pages.
  if (local === '/workspaces/3/tags') return Response.json({ tag: [BALISES[0]], nextPageToken: 'page 2' });
  if (local === '/workspaces/3/tags?pageToken=page%202') return Response.json({ tag: [{ ...BALISES[1], paused: false, name: 'Conversion — Achat (corrigée)' }] });
  if (local === '/workspaces/3/triggers') return Response.json({ trigger: DECLENCHEURS });
  if (local === '/workspaces/3/variables') return Response.json({ variable: VARIABLES });
  if (local === '/workspaces/3/built_in_variables') return Response.json({ builtInVariable: [{ name: 'Page Path' }] });
  return Response.json({ error: { code: 404, message: `inconnu : ${chemin}`, status: 'NOT_FOUND' } }, { status: 404 });
});

const versGtm = (appels: Appel[]) => appels.filter((a) => a.url.startsWith('https://tagmanager.'));

// ── Les verrous ──────────────────────────────────────────────────────────

describe('NORMATIF — Tag Manager, les verrous', () => {
  it('sans GTM_REFRESH_TOKEN, chaque outil refuse en le disant, n’appelle pas Tag Manager, et Google Ads continue', async () => {
    const env = creerEnv({ GTM_REFRESH_TOKEN: undefined });
    const appels = simulerGtm();
    for (const nom of OUTILS) {
      const { corps } = await appelerOutil(env, nom, {});
      expect(corps.result.isError, nom).toBe(true);
      expect(texteDe(corps), nom).toMatch(/Secret GTM_REFRESH_TOKEN absent du Worker MCP : Tag Manager est fermé, Google Ads continue/);
    }
    expect(versGtm(appels)).toEqual([]);

    const ads = await appelerOutil(env, 'ads_requete', { requete: 'SELECT campaign.id FROM campaign' });
    expect(texteDe(ads.corps)).toMatch(/^1 ligne\(s\)/);
  });

  it('le jeton de Tag Manager ne sert jamais Google Ads, ni l’inverse', async () => {
    const env = creerEnv();
    const appels = simulerGtm();
    await appelerOutil(env, 'gtm_verifier_conversions', {});

    const renouvellements = appels.filter((a) => a.url === 'https://oauth2.googleapis.com/token')
      .map((a) => new URLSearchParams(a.corps).get('refresh_token')).sort();
    expect(renouvellements).toEqual(['refresh-ads', 'refresh-gtm']);
    expect(versGtm(appels).length).toBeGreaterThan(0);
    expect(versGtm(appels).every((a) => a.entetes.authorization === 'Bearer acces-gtm')).toBe(true);
    const ads = appels.filter((a) => a.url.startsWith('https://googleads.'));
    expect(ads.length).toBeGreaterThan(0);
    expect(ads.every((a) => a.entetes.authorization === 'Bearer acces-ads')).toBe(true);
  });

  it('un jeton de lecture qui porte plus que la lecture, ou dont Google tait les scopes, ferme Tag Manager avant tout appel', async () => {
    for (const scopes of [
      'https://www.googleapis.com/auth/tagmanager.readonly https://www.googleapis.com/auth/tagmanager.edit.containers',
      'https://www.googleapis.com/auth/tagmanager.publish',
      undefined,
    ]) {
      oublierJetonsGoogle();
      const appels = simulerGtm({ scopes });
      const { corps } = await appelerOutil(creerEnv(), 'gtm_conteneur', {});
      expect(corps.result.isError, String(scopes)).toBe(true);
      expect(texteDe(corps), String(scopes)).toMatch(scopes
        ? /Le jeton de lecture de Tag Manager porte aussi https:\/\/www\.googleapis\.com\/auth\/tagmanager\.(edit\.containers|publish) .* Tag Manager est fermé\. Régénérez GTM_REFRESH_TOKEN/
        : /Google ne dit pas les scopes du jeton de lecture de Tag Manager/);
      expect(versGtm(appels), String(scopes)).toEqual([]);
    }
    // Sans la lecture elle-même : refus aussi.
    oublierJetonsGoogle();
    simulerGtm({ scopes: 'openid email' });
    expect(texteDe((await appelerOutil(creerEnv(), 'gtm_conteneur', {})).corps)).toMatch(/n'a pas le scope https:\/\/www\.googleapis\.com\/auth\/tagmanager\.readonly/);
  });

  it('rien que des GET, et rien d’autre que le conteneur de GTM_CONTENEUR — quel que soit l’outil', async () => {
    const env = creerEnv();
    const appels = simulerGtm();
    for (const [nom, args] of [
      ['gtm_conteneur', {}], ['gtm_lire', {}], ['gtm_lire', { espace: '3' }], ['gtm_verifier_conversions', {}],
      ['gtm_verifier_conversions', { espace: '3' }], ['gtm_lire', { espace: '99' }],
    ] as const) {
      await appelerOutil(env, nom, args);
    }
    const gtm = versGtm(appels);
    expect(gtm.length).toBeGreaterThan(10);
    expect(gtm.filter((a) => a.methode !== 'GET')).toEqual([]);
    expect(gtm.map((a) => a.url).filter((u) => u !== `${API}/accounts/containers:lookup?tagId=GTM-TEST123` && !u.startsWith(`${BASE}/`))).toEqual([]);
  });

  it('la table fermée des chemins : le conteneur résolu, en lecture, rien d’autre', () => {
    const c: Conteneur = { accountId: '6001', containerId: '7001', publicId: 'GTM-TEST123' };
    for (const chemin of [
      '/accounts', '/accounts/6001/containers', '/accounts/containers:lookup?tagId=GTM-TEST123',
      '/accounts/6001/containers/7001/versions:live', '/accounts/6001/containers/7001/workspaces',
      '/accounts/6001/containers/7001/workspaces/3/status', '/accounts/6001/containers/7001/workspaces/3/tags',
      '/accounts/6001/containers/7001/workspaces/3/tags?pageToken=abc%3D', '/accounts/6001/containers/7001/workspaces/3/built_in_variables',
    ]) expect(cheminPermis(chemin, c), chemin).toBe(true);
    for (const chemin of [
      '/accounts/6001/containers/7002/versions:live', '/accounts/6002/containers/7001/versions:live',
      '/accounts/6001/containers/7001/../7002/versions:live', '/accounts/6001/containers/70011/versions:live',
      '/accounts/6001/containers/7001/versions/12:publish', '/accounts/6001/containers/7001/workspaces/3:create_version',
      '/accounts/6001/containers/7001/workspaces/3/tags/5', '/accounts/6001/containers/7001/workspaces/3:quick_preview',
      '/accounts/6001/user_permissions', '/accounts/containers:lookup?destinationId=AW-1', '/accounts/6001/containers/7001',
      '/accounts/6001/containers/7001/workspaces/3/tags?pageToken=a&x=1',
    ]) expect(cheminPermis(chemin, c), chemin).toBe(false);
    // Sans conteneur résolu, rien d'un conteneur.
    expect(cheminPermis('/accounts/6001/containers/7001/versions:live')).toBe(false);
  });

  it('la garde ne dépend pas de l’appelant : un identifiant rendu par Google qui sortirait du conteneur n’est jamais appelé', async () => {
    const appels = simulerGtm({ espaces: [{ workspaceId: '3/../../../7002/workspaces/3', name: 'Piège' }] });
    await appelerOutil(creerEnv(), 'gtm_conteneur', {}).catch(() => undefined);
    expect(versGtm(appels).length).toBeGreaterThan(0);
    expect(versGtm(appels).filter((a) => a.url.includes('7002'))).toEqual([]);
  });

  it('sans GTM_CONTENEUR, aucun contenu ne se lit : le refus liste les conteneurs visibles', async () => {
    const env = creerEnv({ GTM_CONTENEUR: '' });
    const appels = simulerGtm();
    const { corps } = await appelerOutil(env, 'gtm_lire', {});
    expect(texteDe(corps)).toMatch(/GTM_CONTENEUR est vide dans wrangler\.toml : aucun conteneur n'est lu\.\nConteneurs visibles par le compte du jeton :\n- GTM-TEST123 « luminose\.fr » — compte « Luminose », www\.luminose\.fr/);
    expect(versGtm(appels).map((a) => a.url)).toEqual([`${API}/accounts`, `${API}/accounts/6001/containers`]);
  });

  it('un GTM_CONTENEUR mal formé ferme Tag Manager sans rien appeler ; un conteneur rendu sous un autre identifiant est refusé', async () => {
    const appels = simulerGtm();
    const mal = await appelerOutil(creerEnv({ GTM_CONTENEUR: 'UA-12345' }), 'gtm_conteneur', {});
    expect(texteDe(mal.corps)).toMatch(/« UA-12345 » n'est pas un identifiant de conteneur/);
    expect(versGtm(appels)).toEqual([]);

    for (const conteneur of [{ publicId: 'GTM-AUTRE99' }, { accountId: '6001/containers/7002' }, { containerId: '7001/../7002' }]) {
      const ap = simulerGtm({ conteneur });
      const autre = await appelerOutil(creerEnv(), 'gtm_conteneur', {});
      expect(texteDe(autre.corps), JSON.stringify(conteneur)).toMatch(/ne rend pas le conteneur GTM-TEST123 sous une forme attendue/);
      // Rien n'a été lu au-delà de la résolution.
      expect(versGtm(ap).map((a) => a.url), JSON.stringify(conteneur)).toEqual([`${API}/accounts/containers:lookup?tagId=GTM-TEST123`]);
    }
  });

  it('les refus de Google se lisent en clair', async () => {
    for (const [corps, attendu] of [
      [{ error: { code: 403, message: 'Tag Manager API has not been used in project 1 before or it is disabled.', status: 'PERMISSION_DENIED' } }, /L'API Tag Manager n'est pas activée/],
      [{ error: { code: 403, message: 'Request had insufficient authentication scopes.', status: 'PERMISSION_DENIED' } }, /n'a pas le scope https:\/\/www\.googleapis\.com\/auth\/tagmanager\.readonly/],
      [{ error: { code: 403, message: 'The caller does not have permission', status: 'PERMISSION_DENIED' } }, /a-t-il accès à ce conteneur/],
    ] as const) {
      simulerGtm({ erreur: { statut: 403, corps } });
      const { corps: rendu } = await appelerOutil(creerEnv(), 'gtm_conteneur', {});
      expect(rendu.result.isError).toBe(true);
      expect(texteDe(rendu)).toMatch(attendu);
    }
    simulerGtm({ erreur: { statut: 429, corps: { error: { code: 429, message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED' } } } });
    const quota = await appelerOutil(creerEnv(), 'gtm_conteneur', {});
    expect(texteDe(quota.corps)).toMatch(/Quota de l'API Tag Manager atteint/);
  });
});

// ── Les outils ───────────────────────────────────────────────────────────

describe('gtm_conteneur', () => {
  it('la version en ligne, ses balises par type, et ce que chaque espace changerait', async () => {
    const appels = simulerGtm();
    const t = texteDe((await appelerOutil(creerEnv(), 'gtm_conteneur', {})).corps);
    expect(t).toMatch(/^Conteneur GTM-TEST123 « luminose\.fr » — compte 6001, conteneur 7001 ; domaines : www\.luminose\.fr\./);
    expect(t).toMatch(/En ligne — la version en ligne n° 12 « Octobre » : 7 balise\(s\), dont 1 en pause ; 2 déclencheur\(s\) ; 2 variable\(s\), et 2 variable\(s\) intégrée\(s\) activée\(s\)\./);
    expect(t).toMatch(/- 4 × Conversion Google Ads \(awct\)/);
    expect(t).toMatch(/- 1 × HTML personnalisé \(html\)/);
    expect(t).toMatch(/« Default Workspace » \(3\) : 2 modification\(s\) non publiée\(s\) — ajouté : balise « Nouvelle balise » ; modifié : déclencheur « Merci rendez-vous »/);
    expect(t).toMatch(/« Essai » \(4\) : aucune modification non publiée/);
    // Résolution, version en ligne, liste des espaces, deux statuts.
    expect(versGtm(appels)).toHaveLength(5);
  });
});

describe('gtm_lire', () => {
  it('chaque balise avec ses déclencheurs nommés et leurs conditions ; le code HTML coupé', async () => {
    simulerGtm();
    const t = texteDe((await appelerOutil(creerEnv(), 'gtm_lire', {})).corps);
    expect(t).toMatch(/^GTM-TEST123 — la version en ligne n° 12 « Octobre »\./);
    expect(t).toMatch(/### « Conversion — Rendez-vous » — Conversion Google Ads \(awct\)\n- Déclenchée par : « Merci rendez-vous » \(Vue de page \(pageview\) — \{\{Page Path\}\} contient « \/merci-rdv »\)/);
    expect(t).toMatch(/### « Conversion — Achat » — Conversion Google Ads \(awct\) — EN PAUSE/);
    expect(t).toMatch(/- Déclenchée par : « All Pages \(toutes les pages\) »/);
    expect(t).toMatch(/- conversionId = \{\{ID Google Ads\}\}/);
    expect(t).toMatch(/- html = <script>x{292}… \(1017 caractères\)/);
    // Le numéro d'un déclencheur : ce que les outils qui créent une balise attendent.
    expect(t).toMatch(/### « Achat confirmé » \(n° 22\) — Événement personnalisé \(customEvent\) — \{\{_event\}\} égale « achat »\n- Balises : « Conversion — Achat », « Conversion — Variable »/);
    expect(t).toMatch(/### \{\{ID Google Ads\}\} — Constante \(c\)\n- value = 1234567890/);
    expect(t).toMatch(/Variables intégrées activées : \{\{Page Path\}\}, \{\{Event\}\}\./);
  });

  it('recherche filtre par nom, sans accents ni casse, et montre les valeurs en entier ; quoi restreint', async () => {
    simulerGtm();
    const t = texteDe((await appelerOutil(creerEnv(), 'gtm_lire', { recherche: 'PIXEL', quoi: 'balises' })).corps);
    expect(t).toMatch(/## Balises \(1\)/);
    expect(t).toContain(`- html = ${CODE}`);
    expect(t).not.toMatch(/## Déclencheurs|## Variables/);
    const v = texteDe((await appelerOutil(creerEnv(), 'gtm_lire', { recherche: 'libelle', quoi: 'variables' })).corps);
    expect(v).toMatch(/## Variables \(1\)\n\n### \{\{Libellé dynamique\}\} — Couche de données \(v\)/);
  });

  it('un espace de travail : toutes ses pages, et un espace inconnu est refusé en nommant les autres', async () => {
    const appels = simulerGtm();
    const t = texteDe((await appelerOutil(creerEnv(), 'gtm_lire', { espace: '3', quoi: 'balises' })).corps);
    expect(t).toMatch(/^GTM-TEST123 — l'espace de travail « Default Workspace » \(3\)\./);
    expect(t).toMatch(/## Balises \(2\)/);
    expect(t).toMatch(/« Conversion — Achat \(corrigée\) »/);
    expect(appels.some((a) => a.url === `${BASE}/workspaces/3/tags?pageToken=page%202`)).toBe(true);

    const inconnu = texteDe((await appelerOutil(creerEnv(), 'gtm_lire', { espace: '99' })).corps);
    expect(inconnu).toMatch(/Espace de travail 99 introuvable dans GTM-TEST123\. Espaces : « Default Workspace » \(3\), « Essai » \(4\)\./);
  });
});

describe('NORMATIF — gtm_verifier_conversions : chaque conversion du site trouve sa balise par identifiant et libellé', () => {
  it('OK, en pause, manquante, sans code, hors du site, orpheline, à identifiant variable', async () => {
    simulerGtm();
    const t = texteDe((await appelerOutil(creerEnv(), 'gtm_verifier_conversions', {})).corps);
    expect(t).toMatch(new RegExp(`^Conversions Google Ads actives du compte ${COMPTE}, comparées à la version en ligne n° 12 « Octobre » du conteneur GTM-TEST123\\.`));
    expect(t).toMatch(/Mesurées sur le site par une balise : 3 — 1 OK, 1 à voir, 1 sans balise\. Sans code : 1\. Hors du site : 1\./);
    // La constante {{ID Google Ads}} est résolue.
    expect(t).toMatch(/- OK — « Prise de rendez-vous » \(WEBPAGE, AW-1234567890\/LIBELLE_RDV\) : balise « Conversion — Rendez-vous » déclenchée par « Merci rendez-vous »/);
    expect(t).toMatch(/- À VOIR — « Achat » \(WEBPAGE, AW-1234567890\/LIBELLE_ACHAT\) : aucune balise active — balise « Conversion — Achat » EN PAUSE\./);
    expect(t).toMatch(/- MANQUE — « Appels depuis le site » \(WEBSITE_CALL, AW-1234567890\/LIBELLE_APPEL\) : aucune balise dans la version en ligne/);
    expect(t).toMatch(/## Sans code\n- « Inscription » \(AW-1234567890\/LIBELLE_INSCRIPTION\) : pas de balise dédiée/);
    expect(t).toMatch(/## Hors du site — aucune balise attendue\n- « Import » \(UPLOAD_CLICKS\)/);
    expect(t).toMatch(/## Balises de conversion sans conversion active\n- « Conversion — Ancienne » \(AW-1234567890\/LIBELLE_ANCIEN\) déclenchée par « All Pages \(toutes les pages\) » : conversion supprimée, désactivée, ou libellé mal recopié\./);
    expect(t).toMatch(/- « Conversion — Variable » : \{\{Libellé dynamique\}\} ne se résout qu'au chargement de la page\./);
    expect(t).toMatch(/- Balise Google AW-1234567890 : « Balise Google » déclenchée par « Initialization - All Pages »\./);
    expect(t).toMatch(/- Linker de conversion : « Linker » déclenchée par « All Pages \(toutes les pages\) »\./);
  });

  it('deux balises actives pour une conversion : elle peut compter double ; une balise sans déclencheur ne compte pas', async () => {
    simulerGtm({ balises: [
      conversion('RDV 1', AW, 'LIBELLE_RDV', ['21']),
      conversion('RDV 2', AW, 'LIBELLE_RDV', [TOUTES_LES_PAGES]),
      conversion('Achat', AW, 'LIBELLE_ACHAT', []),
    ] });
    const t = texteDe((await appelerOutil(creerEnv(), 'gtm_verifier_conversions', {})).corps);
    expect(t).toMatch(/- À VOIR — « Prise de rendez-vous » .* : 2 balises actives, la conversion peut compter double — balise « RDV 1 »/);
    expect(t).toMatch(/- À VOIR — « Achat » .* : aucune balise active — balise « Achat » AUCUN DÉCLENCHEUR\./);
    expect(t).toMatch(/- Balise Google AW-1234567890 : absente de la version en ligne n° 12 « Octobre »\. Les conversions sans code en dépendent/);
    expect(t).toMatch(/- Linker de conversion : absent\./);
    // Le même libellé sous un autre compte Google Ads n'est pas la conversion : il se nomme comme tel.
    simulerGtm({ balises: [conversion('Autre compte', '999', 'LIBELLE_RDV', ['21'])] });
    const autre = texteDe((await appelerOutil(creerEnv(), 'gtm_verifier_conversions', {})).corps);
    expect(autre).toMatch(/- MANQUE — « Prise de rendez-vous »/);
    expect(autre).toMatch(/« Autre compte » \(AW-999\/LIBELLE_RDV\) déclenchée par « Merci rendez-vous » .* : un autre compte Google Ads \(AW-999\)\./);
  });

  it('avec espace, la comparaison porte sur ce que l’espace publierait', async () => {
    simulerGtm();
    const t = texteDe((await appelerOutil(creerEnv(), 'gtm_verifier_conversions', { espace: '3' })).corps);
    expect(t).toMatch(/comparées à l'espace de travail « Default Workspace » \(3\) du conteneur GTM-TEST123/);
    expect(t).toMatch(/- OK — « Achat » .* : balise « Conversion — Achat \(corrigée\) » déclenchée par « Achat confirmé »/);
  });
});
