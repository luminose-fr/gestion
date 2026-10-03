/**
 * L'écriture — lot 1 du cadrage du 01/10/2026 : exclure des recherches, mettre
 * en pause. Et surtout les verrous, qui vivent dans le serveur : chaque test
 * NORMATIF regarde ce qui part réellement chez Google (les appels `fetch`) et
 * ce que la base a réellement écrit, pas ce que le code a l'intention de faire.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { VERSION_API, verifierOperation, type Operation } from '../src/google-ads';
import { COMPTE, LIRE_ECRIRE, appelerOutil, creerEnv, simulerFetch, texteDe, type Appel, type EnvFactice } from './aides';
import { d1EnPanne } from './d1';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

// ── Un compte Google Ads de comptoir ─────────────────────────────────────

const CAMPAGNES: Record<string, { name: string; status: string; advertisingChannelType: string }> = {
  111: { name: 'Troubles anxieux', status: 'ENABLED', advertisingChannelType: 'SEARCH' },
  222: { name: 'PMax - Faire le point', status: 'PAUSED', advertisingChannelType: 'PERFORMANCE_MAX' },
  333: { name: 'Ancienne', status: 'REMOVED', advertisingChannelType: 'SEARCH' },
};
const SEARCH = { name: 'Troubles anxieux', advertisingChannelType: 'SEARCH' };
const CRITERES: Record<string, object> = {
  666: { status: 'ENABLED', negative: false, keyword: { text: 'anxiété', matchType: 'PHRASE' } },
  777: { status: 'ENABLED', negative: true, keyword: { text: 'gratuit', matchType: 'BROAD' } },
  888: { status: 'PAUSED', negative: false, keyword: { text: 'stress', matchType: 'EXACT' } },
};

const reponse = (results: unknown[]) => Response.json({ results });

const simulerAds = (options: { refusExecution?: () => Response } = {}) => simulerFetch(({ url, corps }) => {
  if (url.endsWith(':search')) {
    const q: string = JSON.parse(corps).query;
    let m: RegExpExecArray | null;
    if ((m = /FROM campaign WHERE campaign\.id = (\d+)/.exec(q))) {
      const c = CAMPAGNES[m[1]];
      return reponse(c ? [{ campaign: { id: m[1], ...c } }] : []);
    }
    if (/FROM ad_group WHERE ad_group\.id = 444$/.test(q)) {
      return reponse([{ adGroup: { name: 'Groupe A', status: 'ENABLED' }, campaign: SEARCH }]);
    }
    if (/FROM ad_group_ad WHERE ad_group\.id = 444 AND ad_group_ad\.ad\.id = 555$/.test(q)) {
      return reponse([{ adGroupAd: { status: 'ENABLED' }, adGroup: { name: 'Groupe A' }, campaign: SEARCH }]);
    }
    if ((m = /FROM ad_group_criterion WHERE ad_group\.id = 444 AND ad_group_criterion\.criterion_id = (\d+)/.exec(q)) && CRITERES[m[1]]) {
      return reponse([{ adGroupCriterion: CRITERES[m[1]], adGroup: { name: 'Groupe A' }, campaign: SEARCH }]);
    }
    return reponse([]);
  }
  if (url.endsWith(':mutate')) {
    const c = JSON.parse(corps);
    if (c.validateOnly) return Response.json({});
    if (options.refusExecution) return options.refusExecution();
    const service = url.slice(url.lastIndexOf('/') + 1).replace(':mutate', '');
    return reponse(c.operations.map((_: unknown, i: number) => ({ resourceName: `customers/${COMPTE}/${service}/${9000 + i}` })));
  }
  return undefined;
});

type Mutation = { url: string; validateOnly: boolean; operations: Record<string, any>[] };
const mutations = (appels: Appel[]): Mutation[] => appels
  .filter((a) => a.url.endsWith(':mutate'))
  .map((a) => ({ url: a.url, ...JSON.parse(a.corps) }));
const executions = (appels: Appel[]) => mutations(appels).filter((m) => !m.validateOnly);

const jetonDe = (corps: any) => /jeton = "([^"]+)"/.exec(texteDe(corps))?.[1];

const NEGATIFS = { campagne: '111', mots_cles: [{ texte: 'gratuit', correspondance: 'BROAD' }, { texte: 'psychiatre urgence', correspondance: 'PHRASE' }] };
const PAUSE = { type: 'groupe', identifiant: '444' };

/** L'aperçu, puis l'exécution avec son jeton : le parcours normal. */
const apercuPuisExecution = async (env: EnvFactice, outil: string, args: Record<string, unknown>) => {
  const apercu = await appelerOutil(env, outil, args, LIRE_ECRIRE);
  const jeton = jetonDe(apercu.corps);
  const execution = await appelerOutil(env, outil, { ...args, jeton }, LIRE_ECRIRE);
  return { apercu: apercu.corps, jeton, execution: execution.corps };
};

// ── V8 ───────────────────────────────────────────────────────────────────

describe('NORMATIF — V8 : sans le scope ads:ecrire, les outils d’écriture refusent', () => {
  it('ni aperçu ni exécution, et pas un seul appel à Google', async () => {
    for (const scopes of [[], ['ads:lire']]) {
      const env = creerEnv();
      const appels = simulerAds();
      for (const [outil, args] of [['ads_negatifs_ajouter', NEGATIFS], ['ads_mettre_en_pause', PAUSE]] as const) {
        const { corps } = await appelerOutil(env, outil, args, scopes);
        expect(corps.result.isError, `${outil} ${scopes}`).toBe(true);
        expect(texteDe(corps)).toMatch(/L'écriture n'est pas accordée à cette connexion/);
      }
      expect(appels).toEqual([]);
      expect(env.DB.lignes()).toEqual([]);
    }
  });

  it('la lecture, elle, reste ouverte sans le scope', async () => {
    const env = creerEnv();
    simulerAds();
    const { corps } = await appelerOutil(env, 'ads_requete', { requete: 'SELECT campaign.id FROM campaign' }, []);
    expect(corps.result.isError).toBeUndefined();
  });
});

// ── V2 ───────────────────────────────────────────────────────────────────

describe('NORMATIF — V2 : aperçu, puis exécution de ce qui a été vu', () => {
  it('sans jeton, la requête part avec validateOnly: true, et rien n’est journalisé', async () => {
    const env = creerEnv();
    const appels = simulerAds();
    const { corps } = await appelerOutil(env, 'ads_negatifs_ajouter', NEGATIFS, LIRE_ECRIRE);

    expect(corps.result.isError).toBeUndefined();
    expect(texteDe(corps)).toMatch(/^APERÇU — rien n'a été modifié/);
    expect(texteDe(corps)).toMatch(/Campagne « Troubles anxieux » \(111\) — 2 mots-clés négatifs, actifs dès l'exécution/);
    expect(jetonDe(corps)).toBeTruthy();
    const [apercu] = mutations(appels);
    expect(mutations(appels)).toHaveLength(1);
    expect(apercu.validateOnly).toBe(true);
    expect(env.DB.lignes()).toEqual([]);
  });

  it('avec le jeton, la même requête part pour de bon, et le journal la garde', async () => {
    const env = creerEnv();
    const appels = simulerAds();
    const { apercu, execution } = await apercuPuisExecution(env, 'ads_negatifs_ajouter', NEGATIFS);

    expect(texteDe(execution)).toMatch(/^FAIT — écriture n° 1 du journal/);
    const [vue, faite] = mutations(appels);
    expect(faite.validateOnly).toBe(false);
    expect(faite.operations).toEqual(vue.operations);
    expect(faite.url).toBe(vue.url);

    const [ligne] = env.DB.lignes();
    expect(ligne).toMatchObject({ outil: 'ads_negatifs_ajouter', compte: COMPTE, auteur: 'florent@luminose.fr', issue: 'ok' });
    expect(JSON.parse(ligne.contenu as string)).toEqual({ service: 'campaignCriteria', operations: faite.operations });
    expect(JSON.parse(ligne.ressources as string)).toHaveLength(2);
    expect(texteDe(apercu)).not.toMatch(/FAIT/);
  });

  it('un jeton ne vaut que pour le contenu exact de son aperçu', async () => {
    const env = creerEnv();
    const appels = simulerAds();
    const apercu = await appelerOutil(env, 'ads_negatifs_ajouter', NEGATIFS, LIRE_ECRIRE);
    const jeton = jetonDe(apercu.corps);

    const autres = [
      { ...NEGATIFS, mots_cles: [...NEGATIFS.mots_cles, { texte: 'avis', correspondance: 'EXACT' }] },
      { ...NEGATIFS, mots_cles: [{ texte: 'gratuit', correspondance: 'EXACT' }, NEGATIFS.mots_cles[1]] },
      { ...NEGATIFS, campagne: '112' },
    ];
    CAMPAGNES[112] = { ...CAMPAGNES[111] };
    try {
      for (const args of autres) {
        const { corps } = await appelerOutil(env, 'ads_negatifs_ajouter', { ...args, jeton }, LIRE_ECRIRE);
        expect(corps.result.isError, JSON.stringify(args)).toBe(true);
        expect(texteDe(corps)).toMatch(/diffère de celui de l'aperçu/);
      }
      // Ni l'outil voisin : un jeton d'exclusion ne met rien en pause.
      const voisin = await appelerOutil(env, 'ads_mettre_en_pause', { ...PAUSE, jeton }, LIRE_ECRIRE);
      expect(texteDe(voisin.corps)).toMatch(/Jeton d'aperçu invalide pour cet outil/);
    } finally {
      delete CAMPAGNES[112];
    }
    expect(executions(appels)).toEqual([]);
    expect(env.DB.lignes()).toEqual([]);
  });

  it('le même contenu, dans un autre ordre ou une autre casse, reste le même contenu', async () => {
    const env = creerEnv();
    const appels = simulerAds();
    const apercu = await appelerOutil(env, 'ads_negatifs_ajouter', NEGATIFS, LIRE_ECRIRE);
    const jeton = jetonDe(apercu.corps);
    const { corps } = await appelerOutil(env, 'ads_negatifs_ajouter', {
      campagne: '111',
      mots_cles: [{ texte: '  Psychiatre   URGENCE ', correspondance: 'PHRASE' }, { texte: 'Gratuit', correspondance: 'BROAD' }],
      jeton,
    }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/^FAIT/);
    expect(executions(appels)).toHaveLength(1);
  });

  it('un jeton expiré ne vaut plus rien', async () => {
    const env = creerEnv();
    const appels = simulerAds();
    const apercu = await appelerOutil(env, 'ads_mettre_en_pause', PAUSE, LIRE_ECRIRE);
    const jeton = jetonDe(apercu.corps);

    vi.useFakeTimers({ now: Date.now() + 10 * 60 * 1000 + 1000 });
    const { corps } = await appelerOutil(env, 'ads_mettre_en_pause', { ...PAUSE, jeton }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/expiré/);
    expect(executions(appels)).toEqual([]);
  });

  it('un jeton ne sert qu’une fois', async () => {
    const env = creerEnv();
    const appels = simulerAds();
    const { jeton } = await apercuPuisExecution(env, 'ads_mettre_en_pause', PAUSE);
    const { corps } = await appelerOutil(env, 'ads_mettre_en_pause', { ...PAUSE, jeton }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/déjà servi/);
    expect(executions(appels)).toHaveLength(1);
    expect(env.DB.lignes()).toHaveLength(1);
  });

  it('un jeton altéré ou signé ailleurs est refusé', async () => {
    const env = creerEnv();
    const appels = simulerAds();
    const apercu = await appelerOutil(env, 'ads_mettre_en_pause', PAUSE, LIRE_ECRIRE);
    const jeton = jetonDe(apercu.corps)!;
    for (const faux of [`${jeton}x`, `x${jeton}`, 'pas-un-jeton', jeton.replace(/\.[^.]+$/, '.AAAA')]) {
      const { corps } = await appelerOutil(env, 'ads_mettre_en_pause', { ...PAUSE, jeton: faux }, LIRE_ECRIRE);
      expect(corps.result.isError, faux).toBe(true);
    }
    // Un aperçu fait avec une autre clé ne s'exécute pas ici.
    const ailleurs = creerEnv({ ADS_APERCU_KEY: 'autre-cle' });
    const autre = jetonDe((await appelerOutil(ailleurs, 'ads_mettre_en_pause', PAUSE, LIRE_ECRIRE)).corps);
    const { corps } = await appelerOutil(env, 'ads_mettre_en_pause', { ...PAUSE, jeton: autre }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/Jeton d'aperçu invalide/);
    expect(executions(appels)).toEqual([]);
  });

  it('sans ADS_APERCU_KEY, l’écriture est fermée et le dit', async () => {
    const env = creerEnv({ ADS_APERCU_KEY: undefined });
    const appels = simulerAds();
    const { corps } = await appelerOutil(env, 'ads_mettre_en_pause', PAUSE, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/ADS_APERCU_KEY/);
    expect(mutations(appels)).toEqual([]);
  });
});

// ── V1 et V5 ─────────────────────────────────────────────────────────────

const ENTREES: [string, Record<string, unknown>][] = [
  ['ads_negatifs_ajouter', NEGATIFS],
  ['ads_negatifs_ajouter', { campagne: '111', mots_cles: [{ texte: 'enabled', correspondance: 'EXACT' }] }],
  ['ads_mettre_en_pause', { type: 'campagne', identifiant: '111' }],
  ['ads_mettre_en_pause', { type: 'groupe', identifiant: '444' }],
  ['ads_mettre_en_pause', { type: 'annonce', identifiant: '444~555' }],
  ['ads_mettre_en_pause', { type: 'mot_cle', identifiant: '444~666' }],
];

const ENTREES_HOSTILES: [string, Record<string, unknown>][] = [
  ['ads_mettre_en_pause', { type: 'campagne', identifiant: '111/../campaignBudgets' }],
  ['ads_mettre_en_pause', { type: 'groupe', identifiant: '444:mutate' }],
  ['ads_mettre_en_pause', { type: 'annonce', identifiant: '444~555~1' }],
  ['ads_mettre_en_pause', { type: 'mot_cle', identifiant: '444' }],
  ['ads_mettre_en_pause', { type: 'campagne', identifiant: '111 OR campaign.id > 0' }],
  ['ads_negatifs_ajouter', { campagne: '111/remove', mots_cles: [{ texte: 'x', correspondance: 'EXACT' }] }],
  ['ads_negatifs_ajouter', { campagne: '111', mots_cles: [{ texte: 'x', correspondance: 'REMOVE' }] }],
];

describe('NORMATIF — V1 : rien ne naît actif sans décision, rien ne s’active, rien ne se supprime', () => {
  it('aucune opération envoyée ne passe à ENABLED ni ne supprime, quelle que soit l’entrée', async () => {
    const env = creerEnv();
    const appels = simulerAds();
    for (const [outil, args] of [...ENTREES, ...ENTREES_HOSTILES]) await apercuPuisExecution(env, outil, args);

    const operations = mutations(appels).flatMap((m) => m.operations);
    expect(executions(appels).length).toBe(ENTREES.length);
    for (const operation of operations) {
      expect(Object.keys(operation)).not.toContain('remove');
      if ('update' in operation) {
        expect(operation.update.status).toBe('PAUSED');
        expect(operation.updateMask).toBe('status');
      }
    }
    expect(appels.filter((a) => a.url.endsWith(':mutate')).some((a) => /"status":"ENABLED"/.test(a.corps))).toBe(false);
  });

  it('les négatifs naissent actifs — décision du 01/10/2026 : en pause, ils n’excluraient rien', async () => {
    const env = creerEnv();
    const appels = simulerAds();
    await apercuPuisExecution(env, 'ads_negatifs_ajouter', NEGATIFS);
    for (const { operations } of mutations(appels)) {
      for (const operation of operations) {
        expect(operation.create).toEqual({
          campaign: `customers/${COMPTE}/campaigns/111`,
          negative: true,
          keyword: expect.objectContaining({ text: expect.any(String) }),
        });
      }
    }
  });

  it('un champ status fourni en entrée est refusé, pas ignoré', async () => {
    const env = creerEnv();
    const appels = simulerAds();
    for (const [outil, args] of [
      ['ads_negatifs_ajouter', { ...NEGATIFS, status: 'ENABLED' }],
      ['ads_mettre_en_pause', { ...PAUSE, status: 'ENABLED' }],
      ['ads_negatifs_ajouter', { ...NEGATIFS, mots_cles: [{ texte: 'x', correspondance: 'EXACT', status: 'PAUSED' }] }],
    ] as const) {
      const { corps } = await appelerOutil(env, outil, args, LIRE_ECRIRE);
      expect(corps.result.isError).toBe(true);
      expect(texteDe(corps)).toMatch(/Unrecognized key.*"status"/);
    }
    expect(appels).toEqual([]);
  });

  it('la table fermée refuse toute autre forme d’opération, même construite par le code', () => {
    const pause = (update: Record<string, unknown>, updateMask = 'status'): Operation => ({ update, updateMask });
    const negatif = { campaign: `customers/${COMPTE}/campaigns/111`, negative: true, keyword: { text: 'x', matchType: 'EXACT' } };
    const refusees: [Parameters<typeof verifierOperation>[0], unknown][] = [
      ['campaigns', pause({ resourceName: `customers/${COMPTE}/campaigns/111`, status: 'ENABLED' })],
      ['campaigns', pause({ resourceName: `customers/${COMPTE}/campaigns/111`, status: 'REMOVED' })],
      ['campaigns', pause({ resourceName: `customers/${COMPTE}/campaigns/111`, status: 'PAUSED', name: 'x' }, 'status,name')],
      ['campaigns', pause({ resourceName: `customers/${COMPTE}/campaigns/111`, status: 'PAUSED' }, 'name')],
      ['campaigns', pause({ resourceName: `customers/${COMPTE}/adGroups/111`, status: 'PAUSED' })],
      ['campaigns', { remove: `customers/${COMPTE}/campaigns/111` }],
      ['campaigns', { create: { name: 'x', status: 'PAUSED' } }],
      ['adGroupCriteria', { create: { status: 'PAUSED' } }],
      ['campaignCriteria', { create: { ...negatif, negative: false } }],
      ['campaignCriteria', { create: { ...negatif, status: 'PAUSED' } }],
      ['campaignCriteria', { create: { ...negatif, keyword: { text: 'x', matchType: 'PHRASE_REMOVE' } } }],
      // Retirer un négatif est permis depuis le 03/10/2026, sous cette seule forme ; que la cible
      // soit bien un négatif, c'est le compte qui le confirme avant l'envoi (listes.test.ts).
      ['campaignCriteria', { remove: `customers/${COMPTE}/campaignCriteria/111` }],
      ['campaignCriteria', { remove: `customers/${COMPTE}/campaigns/111~1` }],
      ['campaignCriteria', { remove: `customers/${COMPTE}/campaignCriteria/111~1`, create: negatif }],
      ['campaignCriteria', pause({ resourceName: `customers/${COMPTE}/campaignCriteria/111~1`, status: 'PAUSED' })],
    ];
    for (const [service, operation] of refusees) {
      expect(() => verifierOperation(service, operation as Operation), JSON.stringify(operation)).toThrow(/table fermée/);
    }
    expect(() => verifierOperation('campaignCriteria', { create: negatif })).not.toThrow();
    expect(() => verifierOperation('adGroupAds', pause({ resourceName: `customers/${COMPTE}/adGroupAds/444~555`, status: 'PAUSED' }))).not.toThrow();
  });
});

describe('NORMATIF — V5 : aucun chemin hors de la table ne peut être émis', () => {
  it('lectures et écritures confondues, quelles que soient les entrées', async () => {
    const env = creerEnv();
    const appels = simulerAds();
    for (const [outil, args] of [...ENTREES, ...ENTREES_HOSTILES]) await apercuPuisExecution(env, outil, args);

    const permis = new RegExp(
      `^https://googleads\\.googleapis\\.com/${VERSION_API}/customers/${COMPTE}/` +
      '(googleAds:search|(campaignCriteria|campaigns|adGroups|adGroupAds|adGroupCriteria):mutate)$',
    );
    const ads = appels.filter((a) => a.url.startsWith('https://googleads.googleapis.com/'));
    expect(ads.filter((a) => !permis.test(a.url)).map((a) => a.url)).toEqual([]);
    // Les entrées hostiles n'ont même pas atteint Google.
    expect(executions(appels)).toHaveLength(ENTREES.length);
  });
});

// ── V7 et V9 ─────────────────────────────────────────────────────────────

describe('NORMATIF — V7 : si la ligne du journal ne s’écrit pas, Google n’est pas appelé', () => {
  it('base en panne', async () => {
    const env = creerEnv();
    const erreurs = vi.spyOn(console, 'error').mockImplementation(() => {});
    const appels = simulerAds();
    const apercu = await appelerOutil(env, 'ads_mettre_en_pause', PAUSE, LIRE_ECRIRE);
    env.DB = d1EnPanne() as never;
    const { corps } = await appelerOutil(env, 'ads_mettre_en_pause', { ...PAUSE, jeton: jetonDe(apercu.corps) }, LIRE_ECRIRE);

    expect(texteDe(corps)).toMatch(/journal des écritures n'a pas pu s'écrire : rien n'est parti/);
    expect(executions(appels)).toEqual([]);
    // Une base qui ne répond pas est une panne : elle part dans les journaux.
    expect(String(erreurs.mock.calls[0]?.[0])).toMatch(/Journal des écritures indisponible/);
  });

  it('l’insertion seule échoue', async () => {
    const env = creerEnv();
    const erreurs = vi.spyOn(console, 'error').mockImplementation(() => {});
    const appels = simulerAds();
    const apercu = await appelerOutil(env, 'ads_mettre_en_pause', PAUSE, LIRE_ECRIRE);
    const base = env.DB;
    env.DB = {
      ...base,
      lignes: () => base.lignes(),
      prepare: (sql: string) => (/^\s*INSERT/i.test(sql)
        ? { bind: () => ({ run: async () => { throw new Error('D1_ERROR: disque plein'); } }) }
        : base.prepare(sql)),
    } as never;
    const { corps } = await appelerOutil(env, 'ads_mettre_en_pause', { ...PAUSE, jeton: jetonDe(apercu.corps) }, LIRE_ECRIRE);

    expect(texteDe(corps)).toMatch(/rien n'est parti/);
    expect(executions(appels)).toEqual([]);
    expect(String(erreurs.mock.calls[0]?.[0])).toMatch(/Journal des écritures indisponible/);
  });

  it('un refus de Google à l’exécution est journalisé, et le dit', async () => {
    const env = creerEnv();
    simulerAds({
      refusExecution: () => Response.json({
        error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Request contains an invalid argument.',
          details: [{ errors: [{ errorCode: { criterionError: 'KEYWORD_HAS_INVALID_CHARS' }, message: 'Keyword has invalid characters.' }] }] },
      }, { status: 400 }),
    });
    const { execution } = await apercuPuisExecution(env, 'ads_negatifs_ajouter', NEGATIFS);

    expect(execution.result.isError).toBe(true);
    expect(texteDe(execution)).toMatch(/^ÉCHEC — écriture n° 1 : Google a refusé, rien n'a été appliqué/);
    expect(texteDe(execution)).toMatch(/criterionError\.KEYWORD_HAS_INVALID_CHARS/);
    const [ligne] = env.DB.lignes();
    expect(ligne.issue).toBe('erreur');
    expect(ligne.erreur).toMatch(/KEYWORD_HAS_INVALID_CHARS/);
    expect(ligne.closed_at).not.toBeNull();
  });
});

describe('NORMATIF — V9 : au-delà de ADS_ECRITURES_MAX_JOUR, refus', () => {
  const remplir = (env: EnvFactice, n: number, age: number) => {
    for (let i = 0; i < n; i++) {
      env.DB.db.prepare('INSERT INTO ads_ecritures (created_at, outil, compte, auteur, contenu, jeton_empreinte, issue) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(Date.now() - age, 'ads_mettre_en_pause', COMPTE, 'florent@luminose.fr', '{}', `ancien-${age}-${i}`, i % 2 ? 'ok' : 'erreur');
    }
  };

  it('trente écritures sur 24 heures, échecs compris : la trente et unième ne part pas', async () => {
    const env = creerEnv();
    const appels = simulerAds();
    remplir(env, 30, 60 * 60 * 1000);
    const { execution } = await apercuPuisExecution(env, 'ads_mettre_en_pause', PAUSE);
    expect(texteDe(execution)).toMatch(/Plafond atteint : 30 écritures sur les dernières 24 heures \(ADS_ECRITURES_MAX_JOUR = 30\)/);
    expect(executions(appels)).toEqual([]);
  });

  it('ce qui a plus de 24 heures ne compte plus', async () => {
    const env = creerEnv();
    simulerAds();
    remplir(env, 30, 25 * 60 * 60 * 1000);
    const { execution } = await apercuPuisExecution(env, 'ads_mettre_en_pause', PAUSE);
    expect(texteDe(execution)).toMatch(/^FAIT/);
  });

  it('un plafond absent ou illisible ferme l’écriture', async () => {
    for (const plafond of [undefined, '', 'trente', '-1', '2.5']) {
      const env = creerEnv({ ADS_ECRITURES_MAX_JOUR: plafond });
      const appels = simulerAds();
      const { execution } = await apercuPuisExecution(env, 'ads_mettre_en_pause', PAUSE);
      expect(texteDe(execution), String(plafond)).toMatch(/ADS_ECRITURES_MAX_JOUR absent ou illisible/);
      expect(executions(appels)).toEqual([]);
    }
  });
});

// ── Les outils ───────────────────────────────────────────────────────────

describe('ads_negatifs_ajouter', () => {
  it('construit des négatifs de campagne, normalisés, dédoublonnés, triés', async () => {
    const env = creerEnv();
    const appels = simulerAds();
    const { corps } = await appelerOutil(env, 'ads_negatifs_ajouter', {
      campagne: '111',
      mots_cles: [
        { texte: 'Psychiatre', correspondance: 'EXACT' },
        { texte: '  gratuit ', correspondance: 'BROAD' },
        { texte: 'GRATUIT', correspondance: 'BROAD' },
      ],
    }, LIRE_ECRIRE);

    expect(texteDe(corps)).toMatch(/- gratuit \[requête large\]\n- psychiatre \[exact\]/);
    const [m] = mutations(appels);
    expect(m.url).toBe(`https://googleads.googleapis.com/${VERSION_API}/customers/${COMPTE}/campaignCriteria:mutate`);
    expect(m.operations.map((o) => o.create.keyword)).toEqual([
      { text: 'gratuit', matchType: 'BROAD' },
      { text: 'psychiatre', matchType: 'EXACT' },
    ]);
  });

  it('refuse ce qui n’est pas une campagne Search vivante', async () => {
    const env = creerEnv();
    const appels = simulerAds();
    for (const [campagne, attendu] of [['222', /n'est pas une campagne Search \(PERFORMANCE_MAX\)/], ['333', /introuvable, ou supprimée/], ['999', /introuvable/]] as const) {
      const { corps } = await appelerOutil(env, 'ads_negatifs_ajouter', { ...NEGATIFS, campagne }, LIRE_ECRIRE);
      expect(texteDe(corps)).toMatch(attendu);
    }
    expect(mutations(appels)).toEqual([]);
  });

  it('refuse la syntaxe de l’interface, plus de dix mots, plus de cinquante mots-clés', async () => {
    const env = creerEnv();
    const appels = simulerAds();
    const essais = [
      [{ texte: '[gratuit]', correspondance: 'EXACT' }],
      [{ texte: '"gratuit"', correspondance: 'PHRASE' }],
      [{ texte: 'un deux trois quatre cinq six sept huit neuf dix onze', correspondance: 'BROAD' }],
      Array.from({ length: 51 }, (_, i) => ({ texte: `mot ${i}`, correspondance: 'EXACT' })),
      [],
    ];
    for (const mots_cles of essais) {
      const { corps } = await appelerOutil(env, 'ads_negatifs_ajouter', { campagne: '111', mots_cles }, LIRE_ECRIRE);
      expect(corps.result.isError, JSON.stringify(mots_cles).slice(0, 60)).toBe(true);
    }
    expect(mutations(appels)).toEqual([]);
  });
});

describe('ads_mettre_en_pause', () => {
  it('chaque type vise son service, son nom de ressource, et le seul champ status', async () => {
    const cas = [
      ['campagne', '111', 'campaigns', /la campagne « Troubles anxieux »/],
      ['groupe', '444', 'adGroups', /le groupe « Groupe A »/],
      ['annonce', '444~555', 'adGroupAds', /une annonce du groupe « Groupe A »/],
      ['mot_cle', '444~666', 'adGroupCriteria', /le mot-clé « anxiété » \[expression exacte\]/],
    ] as const;
    for (const [type, identifiant, service, nom] of cas) {
      const env = creerEnv();
      const appels = simulerAds();
      const { apercu } = await apercuPuisExecution(env, 'ads_mettre_en_pause', { type, identifiant });
      expect(texteDe(apercu)).toMatch(nom);
      expect(texteDe(apercu)).toMatch(/aujourd'hui ENABLED/);
      for (const m of mutations(appels)) {
        expect(m.url).toBe(`https://googleads.googleapis.com/${VERSION_API}/customers/${COMPTE}/${service}:mutate`);
        expect(m.operations).toEqual([{ updateMask: 'status', update: { resourceName: `customers/${COMPTE}/${service}/${identifiant}`, status: 'PAUSED' } }]);
      }
      expect(executions(appels)).toHaveLength(1);
    }
  });

  it('refuse de mettre en pause un négatif — ce serait rouvrir du trafic', async () => {
    const env = creerEnv();
    const appels = simulerAds();
    const { corps } = await appelerOutil(env, 'ads_mettre_en_pause', { type: 'mot_cle', identifiant: '444~777' }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/mot-clé négatif : le mettre en pause rouvrirait du trafic/);
    expect(mutations(appels)).toEqual([]);
  });

  it('refuse ce qui est déjà en pause, introuvable, hors Search, ou mal formé', async () => {
    const env = creerEnv();
    const appels = simulerAds();
    const cas = [
      [{ type: 'mot_cle', identifiant: '444~888' }, /déjà en pause/],
      [{ type: 'groupe', identifiant: '445' }, /introuvable/],
      [{ type: 'campagne', identifiant: '222' }, /n'est pas une campagne Search/],
      [{ type: 'annonce', identifiant: '555' }, /attendu ad_group\.id~ad_group_ad\.ad\.id/],
    ] as const;
    for (const [args, attendu] of cas) {
      const { corps } = await appelerOutil(env, 'ads_mettre_en_pause', args, LIRE_ECRIRE);
      expect(texteDe(corps), JSON.stringify(args)).toMatch(attendu);
    }
    expect(mutations(appels)).toEqual([]);
  });
});
