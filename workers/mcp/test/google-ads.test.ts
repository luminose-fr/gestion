/**
 * Les deux outils Google Ads, et les quatre garanties que le cadrage déclare
 * NORMATIVES (§8). Une garantie qui ne tient que par la discipline de celui qui
 * écrit le code s'érode sans bruit ; celles-ci sont vérifiées sur ce qui sort
 * réellement du Worker — les appels `fetch` — et non sur les intentions.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { VERSION_API } from '../src/google-ads';
import { MAX_CARACTERES, MAX_LIGNES } from '../src/outils';
import { COMPTE, appelerOutil, creerEnv, simulerFetch, texteDe, type Appel } from './aides';

afterEach(() => { vi.unstubAllGlobals(); });

const ADS = 'https://googleads.googleapis.com/';
const versAds = (appels: Appel[]) => appels.filter((a) => a.url.startsWith(ADS));

/** Les seules URL de l'API que le Worker a le droit d'émettre. */
const PERMISES = new RegExp(
  `^https://googleads\\.googleapis\\.com/${VERSION_API}/customers(:listAccessibleCustomers|/\\d{10}/googleAds:search)$`,
);

const reponseRecherche = (lignes: unknown[], nextPageToken?: string) =>
  Response.json({ results: lignes, ...(nextPageToken ? { nextPageToken } : {}), fieldMask: 'x' });

/** Une erreur GAQL telle que l'API REST la renvoie. */
const erreurGaql = () => Response.json({
  error: {
    code: 400,
    message: 'Request contains an invalid argument.',
    status: 'INVALID_ARGUMENT',
    details: [{
      '@type': `type.googleapis.com/google.ads.googleads.${VERSION_API}.errors.GoogleAdsFailure`,
      errors: [{ errorCode: { queryError: 'UNRECOGNIZED_FIELD' }, message: "Unrecognized field in the query: 'campaign.nme'." }],
      requestId: 'req-123',
    }],
  },
}, { status: 400 });

describe('garanties NORMATIVES (cadrage §8)', () => {
  it('NORMATIF — aucun appel vers un chemin :mutate ne peut être émis, quelle que soit l’entrée', async () => {
    // Des entrées fabriquées pour détourner le chemin : identifiants avec
    // segments, traversée, suffixes, et requêtes qui parlent de mutate.
    const comptes = [
      undefined, COMPTE, '123-456-7890', `${COMPTE}/googleAds:mutate`, `${COMPTE}:mutate`,
      `../${COMPTE}/googleAds:mutate`, `${COMPTE}/campaigns:mutate?x=`, `${COMPTE}%2FgoogleAds:mutate`,
      'customers/1234567890', '12345678901',
    ];
    const requetes = [
      'SELECT campaign.id FROM campaign',
      'SELECT campaign.id FROM campaign WHERE campaign.name = ":mutate"',
      'googleAds:mutate',
      'mutate campaign set status = PAUSED',
      'UPDATE campaign SET campaign.status = PAUSED',
    ];

    // Un compte par défaut forgé ne passe pas non plus.
    const envs = [
      creerEnv(),
      creerEnv({ GOOGLE_ADS_CUSTOMER_ID: `${COMPTE}/googleAds:mutate` }),
      creerEnv({ GOOGLE_ADS_LOGIN_CUSTOMER_ID: `${COMPTE}:mutate` }),
    ];

    const appels = simulerFetch(({ url }) => (url.includes(':listAccessibleCustomers')
      // Une API hostile qui renverrait des noms de ressource piégés.
      ? Response.json({ resourceNames: [`customers/${COMPTE}`, `customers/${COMPTE}/googleAds:mutate`, 'customers/../x'] })
      : undefined));

    for (const env of envs) {
      for (const compte of comptes) {
        for (const requete of requetes) {
          await appelerOutil(env, 'ads_requete', { requete, ...(compte === undefined ? {} : { compte }) });
        }
      }
      await appelerOutil(env, 'ads_lister_comptes');
    }

    const sortants = versAds(appels);
    expect(sortants.length).toBeGreaterThan(0);
    expect(sortants.filter((a) => /mutate/i.test(a.url))).toEqual([]);
    expect(sortants.filter((a) => !PERMISES.test(a.url)).map((a) => a.url)).toEqual([]);
  });

  it('NORMATIF — une requête GAQL qui ne commence pas par SELECT est refusée', async () => {
    const env = creerEnv();
    const appels = simulerFetch();

    for (const requete of [
      '', '   ', 'DELETE FROM campaign', 'UPDATE campaign SET campaign.status = PAUSED',
      'mutate', 'SELECTcampaign.id FROM campaign', '-- SELECT campaign.id FROM campaign',
      'WITH x AS (SELECT campaign.id FROM campaign) SELECT * FROM x', '(SELECT campaign.id FROM campaign)',
    ]) {
      const { corps } = await appelerOutil(env, 'ads_requete', { requete });
      expect(corps.result.isError, requete).toBe(true);
    }
    expect(versAds(appels)).toEqual([]);

    // Et les lectures passent, quelle que soit la casse ou l'indentation.
    for (const requete of ['select campaign.id FROM campaign', '  SELECT\n  campaign.id\nFROM campaign']) {
      const { corps } = await appelerOutil(env, 'ads_requete', { requete });
      expect(corps.result.isError, requete).toBeUndefined();
    }
  });

  it('NORMATIF — un compte hors liste est refusé', async () => {
    const env = creerEnv();
    const appels = simulerFetch();

    const { corps } = await appelerOutil(env, 'ads_requete', { requete: 'SELECT campaign.id FROM campaign', compte: '9999999999' });
    expect(corps.result.isError).toBe(true);
    expect(texteDe(corps)).toMatch(/hors de la liste d'autorisation/);
    // Refusé avant tout appel : pas même un renouvellement de jeton.
    expect(appels).toEqual([]);

    const forme = await appelerOutil(env, 'ads_requete', { requete: 'SELECT campaign.id FROM campaign', compte: 'abc' });
    expect(forme.corps.result.isError).toBe(true);
    expect(appels).toEqual([]);
  });

  it('NORMATIF — la liste d’autorisation, c’est le compte Luminose et son compte administrateur, rien d’autre', async () => {
    const env = creerEnv({ GOOGLE_ADS_LOGIN_CUSTOMER_ID: '111-111-1111' });
    const appels = simulerFetch(({ url }) => (url.includes(':search') ? reponseRecherche([]) : undefined));

    for (const compte of [COMPTE, '123-456-7890', '1111111111', '111-111-1111']) {
      const { corps } = await appelerOutil(env, 'ads_requete', { requete: 'SELECT customer.id FROM customer', compte });
      expect(corps.result.isError, compte).toBeUndefined();
    }
    const refuse = await appelerOutil(env, 'ads_requete', { requete: 'SELECT customer.id FROM customer', compte: '2222222222' });
    expect(refuse.corps.result.isError).toBe(true);
    expect(versAds(appels).every((a) => /\/(1234567890|1111111111)\//.test(a.url))).toBe(true);
  });

  it('NORMATIF — aucun en-tête developer-token n’est envoyé', async () => {
    const env = creerEnv({ GOOGLE_ADS_LOGIN_CUSTOMER_ID: '1111111111' });
    const appels = simulerFetch(({ url }) => {
      if (url.includes(':listAccessibleCustomers')) return Response.json({ resourceNames: ['customers/1111111111'] });
      if (url.includes(':search')) return reponseRecherche([{ customer: { descriptiveName: 'Luminose' } }]);
      return undefined;
    });

    await appelerOutil(env, 'ads_lister_comptes');
    await appelerOutil(env, 'ads_requete', { requete: 'SELECT campaign.id FROM campaign' });

    expect(versAds(appels).length).toBeGreaterThanOrEqual(3);
    for (const appel of appels) {
      expect(Object.keys(appel.entetes).map((k) => k.toLowerCase())).not.toContain('developer-token');
    }
  });
});

describe('ads_requete', () => {
  it('interroge le compte Luminose par défaut et renvoie les lignes', async () => {
    const env = creerEnv();
    const lignes = [
      { campaign: { id: '1', name: 'Séances' }, metrics: { clicks: '12', costMicros: '3450000' } },
      { campaign: { id: '2', name: 'Ateliers' }, metrics: { clicks: '4', costMicros: '990000' } },
    ];
    const appels = simulerFetch(({ url }) => (url.includes(':search') ? reponseRecherche(lignes) : undefined));

    const { corps } = await appelerOutil(env, 'ads_requete', { requete: '  SELECT campaign.id, campaign.name FROM campaign  ' });

    expect(corps.result.isError).toBeUndefined();
    const texte = texteDe(corps);
    expect(texte).toMatch(/^2 ligne\(s\) — compte 1234567890\./);
    expect(JSON.parse(texte.slice(texte.indexOf('[')))).toEqual(lignes);

    const [recherche] = versAds(appels);
    expect(recherche.url).toBe(`${ADS}${VERSION_API}/customers/${COMPTE}/googleAds:search`);
    expect(recherche.methode).toBe('POST');
    expect(JSON.parse(recherche.corps)).toEqual({ query: 'SELECT campaign.id, campaign.name FROM campaign' });
    expect(recherche.entetes.authorization).toBe('Bearer acces-ads');
    // Accès direct : pas d'en-tête de compte administrateur.
    expect(recherche.entetes['login-customer-id']).toBeUndefined();
  });

  it('passe par le compte administrateur quand il y en a un', async () => {
    const env = creerEnv({ GOOGLE_ADS_LOGIN_CUSTOMER_ID: '111-111-1111' });
    const appels = simulerFetch(({ url }) => (url.includes(':search') ? reponseRecherche([]) : undefined));

    await appelerOutil(env, 'ads_requete', { requete: 'SELECT campaign.id FROM campaign' });
    await appelerOutil(env, 'ads_requete', { requete: 'SELECT customer_client.id FROM customer_client', compte: '1111111111' });

    const [client, administrateur] = versAds(appels);
    expect(client.entetes['login-customer-id']).toBe('1111111111');
    // Interroger le compte administrateur lui-même : accès direct.
    expect(administrateur.entetes['login-customer-id']).toBeUndefined();
  });

  it('remonte une erreur GAQL avec son code, pour que le modèle corrige sa requête', async () => {
    const env = creerEnv();
    simulerFetch(({ url }) => (url.includes(':search') ? erreurGaql() : undefined));

    const { statut, corps } = await appelerOutil(env, 'ads_requete', { requete: 'SELECT campaign.nme FROM campaign' });

    expect(statut).toBe(200);
    expect(corps.result.isError).toBe(true);
    const texte = texteDe(corps);
    expect(texte).toMatch(/HTTP 400 INVALID_ARGUMENT/);
    expect(texte).toMatch(/queryError\.UNRECOGNIZED_FIELD — Unrecognized field in the query: 'campaign\.nme'\./);
    expect(texte).toMatch(/Réponse brute :[\s\S]*req-123/);
  });

  it('dit quoi faire quand Google refuse le refresh token', async () => {
    const env = creerEnv();
    const appels = simulerFetch(({ url }) => (url === 'https://oauth2.googleapis.com/token'
      ? Response.json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, { status: 400 })
      : undefined));

    const { corps } = await appelerOutil(env, 'ads_requete', { requete: 'SELECT campaign.id FROM campaign' });

    expect(corps.result.isError).toBe(true);
    expect(texteDe(corps)).toMatch(/invalid_grant[\s\S]*jeton-google-ads\.mjs/);
    expect(versAds(appels)).toEqual([]);
  });

  it('nomme le secret manquant', async () => {
    const env = creerEnv({ GOOGLE_ADS_REFRESH_TOKEN: undefined });
    const appels = simulerFetch();

    const { corps } = await appelerOutil(env, 'ads_requete', { requete: 'SELECT campaign.id FROM campaign' });

    expect(corps.result.isError).toBe(true);
    expect(texteDe(corps)).toMatch(/GOOGLE_ADS_REFRESH_TOKEN[\s\S]*wrangler secret put/);
    expect(appels).toEqual([]);
  });

  it('renouvelle le jeton Google Ads une fois, pas à chaque appel', async () => {
    const env = creerEnv();
    const appels = simulerFetch(({ url }) => (url.includes(':search') ? reponseRecherche([]) : undefined));

    await appelerOutil(env, 'ads_requete', { requete: 'SELECT campaign.id FROM campaign' });
    await appelerOutil(env, 'ads_requete', { requete: 'SELECT campaign.id FROM campaign' });

    const renouvellements = appels.filter((a) => a.url === 'https://oauth2.googleapis.com/token');
    expect(renouvellements).toHaveLength(1);
    expect(new URLSearchParams(renouvellements[0].corps).get('grant_type')).toBe('refresh_token');
    expect(new URLSearchParams(renouvellements[0].corps).get('refresh_token')).toBe('refresh-ads');
  });

  it('refuse un argument inconnu', async () => {
    const env = creerEnv();
    simulerFetch();
    const { corps } = await appelerOutil(env, 'ads_requete', { requete: 'SELECT campaign.id FROM campaign', limite: 10 });
    expect(corps.result.isError).toBe(true);
    expect(texteDe(corps)).toMatch(/Arguments invalides/);
  });
});

describe('troncature', () => {
  it('coupe au nombre de lignes, et le dit', async () => {
    const env = creerEnv();
    const lignes = Array.from({ length: 250 }, (_, i) => ({ segments: { date: `2026-09-${i}` }, metrics: { clicks: String(i) } }));
    simulerFetch(({ url }) => (url.includes(':search') ? reponseRecherche(lignes) : undefined));

    const { corps } = await appelerOutil(env, 'ads_requete', { requete: 'SELECT segments.date FROM customer' });
    const texte = texteDe(corps);

    expect(texte).toMatch(new RegExp(`^RÉPONSE TRONQUÉE — ${MAX_LIGNES} ligne\\(s\\) affichée\\(s\\) sur 250 reçue\\(s\\)`));
    expect(texte).toMatch(/Les totaux calculés sur ces lignes sont partiels/);
    expect(JSON.parse(texte.slice(texte.indexOf('[')))).toHaveLength(MAX_LIGNES);
  });

  it('coupe au nombre de caractères, et le dit', async () => {
    const env = creerEnv();
    const lignes = Array.from({ length: 150 }, (_, i) => ({ search_term_view: { searchTerm: `terme ${i} `.padEnd(1000, '·') } }));
    simulerFetch(({ url }) => (url.includes(':search') ? reponseRecherche(lignes) : undefined));

    const { corps } = await appelerOutil(env, 'ads_requete', { requete: 'SELECT search_term_view.search_term FROM search_term_view' });
    const texte = texteDe(corps);
    const json = texte.slice(texte.indexOf('['));

    expect(texte).toMatch(/^RÉPONSE TRONQUÉE/);
    expect(json.length).toBeLessThanOrEqual(MAX_CARACTERES);
    const gardees = JSON.parse(json);
    expect(gardees.length).toBeGreaterThan(0);
    expect(gardees.length).toBeLessThan(150);
    expect(texte).toContain(`${gardees.length} ligne(s) affichée(s) sur 150 reçue(s)`);
  });

  it('signale les pages que l’API annonce en plus', async () => {
    const env = creerEnv();
    simulerFetch(({ url }) => (url.includes(':search') ? reponseRecherche([{ a: 1 }], 'page-suivante') : undefined));

    const { corps } = await appelerOutil(env, 'ads_requete', { requete: 'SELECT campaign.id FROM campaign' });

    expect(texteDe(corps)).toMatch(/^RÉPONSE TRONQUÉE — 1 ligne\(s\) affichée\(s\) sur 1 reçue\(s\), et l'API annonce d'autres pages/);
  });
});

describe('ads_lister_comptes', () => {
  it('liste les comptes accessibles avec leur nom, et dit lesquels sont interrogeables', async () => {
    const env = creerEnv();
    const appels = simulerFetch(({ url }) => {
      if (url.includes(':listAccessibleCustomers')) return Response.json({ resourceNames: [`customers/${COMPTE}`, 'customers/5555555555'] });
      if (url.includes(`/customers/${COMPTE}/`)) {
        return reponseRecherche([{ customer: { descriptiveName: 'Luminose', currencyCode: 'EUR', timeZone: 'Europe/Paris', manager: false, testAccount: false } }]);
      }
      if (url.includes('/customers/5555555555/')) return reponseRecherche([{ customer: { descriptiveName: 'Autre', currencyCode: 'EUR' } }]);
      return undefined;
    });

    const { corps } = await appelerOutil(env, 'ads_lister_comptes');
    const sortie = JSON.parse(texteDe(corps));

    expect(sortie.compte_par_defaut).toBe(COMPTE);
    expect(sortie.comptes).toEqual([
      { id: COMPTE, autorise: true, acces: 'direct', nom: 'Luminose', devise: 'EUR', fuseau: 'Europe/Paris', administrateur: false, test: false },
      { id: '5555555555', autorise: false, acces: 'direct', nom: 'Autre', devise: 'EUR', fuseau: null, administrateur: false, test: false },
    ]);
    const [liste] = versAds(appels);
    expect(liste.methode).toBe('GET');
    expect(liste.url).toBe(`${ADS}${VERSION_API}/customers:listAccessibleCustomers`);
  });

  it('montre le compte Luminose même quand il n’est visible qu’à travers le compte administrateur', async () => {
    const env = creerEnv({ GOOGLE_ADS_LOGIN_CUSTOMER_ID: '1111111111' });
    const appels = simulerFetch(({ url }) => {
      if (url.includes(':listAccessibleCustomers')) return Response.json({ resourceNames: ['customers/1111111111'] });
      if (url.includes(':search')) return reponseRecherche([{ customer: { descriptiveName: 'Nom' } }]);
      return undefined;
    });

    const { corps } = await appelerOutil(env, 'ads_lister_comptes');
    const { comptes } = JSON.parse(texteDe(corps));

    expect(comptes.map((c: { id: string; acces: string }) => [c.id, c.acces])).toEqual([
      [COMPTE, 'via compte administrateur'],
      ['1111111111', 'direct'],
    ]);
    const viaAdministrateur = versAds(appels).find((a) => a.url.includes(`/customers/${COMPTE}/`))!;
    expect(viaAdministrateur.entetes['login-customer-id']).toBe('1111111111');
  });

  it('un compte en erreur n’efface pas les autres', async () => {
    const env = creerEnv();
    simulerFetch(({ url }) => {
      if (url.includes(':listAccessibleCustomers')) return Response.json({ resourceNames: [`customers/${COMPTE}`, 'customers/5555555555'] });
      if (url.includes('/customers/5555555555/')) {
        return Response.json({ error: { code: 403, status: 'PERMISSION_DENIED', message: 'The customer is not enabled.' } }, { status: 403 });
      }
      if (url.includes(':search')) return reponseRecherche([{ customer: { descriptiveName: 'Luminose' } }]);
      return undefined;
    });

    const { corps } = await appelerOutil(env, 'ads_lister_comptes');
    const { comptes } = JSON.parse(texteDe(corps));

    expect(comptes[0].nom).toBe('Luminose');
    expect(comptes[1].erreur).toMatch(/HTTP 403 PERMISSION_DENIED/);
  });
});
