/**
 * Demand Gen, en pause et marqué — lot 4, cadrage du 07/10/2026
 * (workers/mcp/decisions/2026-10-07-demand-gen.md). Un test par verrou de §6.
 *
 * Comme aux lots précédents, chaque test NORMATIF regarde ce qui part
 * réellement chez Google — les corps des `:mutate` — et non ce que l'outil
 * annonce. Les noms, lieux et montants sont fictifs.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
  VERSION_API, verifierCreationCampagneDG, verifierCreationGroupeDG, verifierOperation, type Operation,
} from '../src/google-ads';
import { COMPTE, LIRE_ECRIRE, appelerOutil, creerEnv as creerEnvBase, simulerFetch, texteDe as texteBrut, type Appel, type EnvFactice } from './aides';
import type { Env } from '../src/env';

/** Les montants s'écrivent « 10,00 € » avec une espace fine insécable : on la lit comme une espace. */
const texteDe = (corps: unknown) => texteBrut(corps).replace(/[  ]/g, ' ');

/** Le 07/10/2026 à midi, heure de Paris : les dates des campagnes se lisent par rapport à ce jour. */
const AUJOURDHUI = Date.parse('2026-10-07T10:00:00Z');
beforeEach(() => { vi.useFakeTimers({ now: AUJOURDHUI, toFake: ['Date'] }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const LIEUX_LOCAUX = ['9100001', '9100002'];
const creerEnv = (surcharges: Partial<Env> = {}): EnvFactice => creerEnvBase({
  ADS_BUDGET_MAX_CAMPAGNE: '400',
  ADS_OBJECTIFS_CONVERSION: 'rdv:555, achat:556, ancien:557',
  ADS_ZONE_LOCALE: LIEUX_LOCAUX.join(','),
  ...surcharges,
});

// ── Un compte de comptoir ────────────────────────────────────────────────

type Budget = { nom: string; statut: string; euros?: number; total?: number; debut?: string; fin?: string };
const BUDGETS: Budget[] = [
  { nom: 'Active 1', statut: 'ENABLED', euros: 5 },
  { nom: 'Active 2', statut: 'ENABLED', euros: 5 },
  { nom: 'Ancienne', statut: 'PAUSED', euros: 7 },
];

const action = (id: number) => `customers/${COMPTE}/conversionActions/${id}`;
const OBJECTIFS: Record<string, { name: string; status: string; conversionActions: string[] }> = {
  555: { name: 'Rendez-vous', status: 'ENABLED', conversionActions: [action(1), action(2)] },
  556: { name: 'Achat', status: 'ENABLED', conversionActions: [action(3)] },
  557: { name: 'Ancien', status: 'REMOVED', conversionActions: [action(1)] },
};
const ACTIONS: Record<string, { name: string; status: string }> = {
  [action(1)]: { name: 'Prise de rendez-vous', status: 'ENABLED' },
  [action(2)]: { name: 'Formulaire', status: 'ENABLED' },
  [action(3)]: { name: 'Achat retiré', status: 'REMOVED' },
};

const LIEUX: Record<string, { canonicalName: string; status: string }> = {
  2250: { canonicalName: 'France', status: 'ENABLED' },
  9100001: { canonicalName: 'Lieu A,France', status: 'ENABLED' },
  9100002: { canonicalName: 'Lieu B,France', status: 'ENABLED' },
  9100003: { canonicalName: 'Lieu retiré,France', status: 'REMOVAL_PLANNED' },
};

/** Les éléments de la bibliothèque : des images à chaque format, et de quoi se tromper. */
const ELEMENTS: Record<string, { type: string; l?: number; h?: number }> = {
  101: { type: 'IMAGE', l: 1200, h: 628 }, // paysage 1,91:1
  102: { type: 'IMAGE', l: 1200, h: 1200 }, // carrée
  103: { type: 'IMAGE', l: 960, h: 1200 }, // portrait 4:5
  104: { type: 'IMAGE', l: 1080, h: 1920 }, // verticale 9:16
  105: { type: 'IMAGE', l: 512, h: 512 }, // logo
  106: { type: 'TEXT' },
  107: { type: 'IMAGE', l: 500, h: 262 }, // paysage, trop petite
  108: { type: 'IMAGE', l: 100, h: 100 }, // logo trop petit
};

type Monde = { budgets?: Budget[]; libelle?: boolean };

const reponse = (results: unknown[]) => Response.json({ results });

const simulerCompte = (monde: Monde = {}) => simulerFetch(({ url, corps }) => {
  if (url.endsWith(':search')) {
    const q: string = JSON.parse(corps).query;
    let m: RegExpExecArray | null;
    if (/FROM campaign WHERE campaign\.status IN/.test(q)) {
      return reponse((monde.budgets ?? BUDGETS).map((b, i) => ({
        campaign: {
          name: b.nom, status: b.statut,
          ...(b.debut ? { startDateTime: `${b.debut} 00:00:00` } : {}), ...(b.fin ? { endDateTime: `${b.fin} 23:59:59` } : {}),
        },
        campaignBudget: b.total === undefined
          ? { resourceName: `customers/${COMPTE}/campaignBudgets/${i}`, period: 'DAILY', amountMicros: String((b.euros ?? 0) * 1_000_000) }
          : { resourceName: `customers/${COMPTE}/campaignBudgets/${i}`, period: 'CUSTOM_PERIOD', totalAmountMicros: String(b.total * 1_000_000) },
      })));
    }
    if ((m = /FROM custom_conversion_goal WHERE custom_conversion_goal\.id = (\d+)$/.exec(q))) {
      const o = OBJECTIFS[m[1]];
      return reponse(o ? [{ customConversionGoal: { id: m[1], ...o } }] : []);
    }
    if ((m = /FROM conversion_action WHERE conversion_action\.resource_name IN \(([^)]*)\)$/.exec(q))) {
      const noms = m[1].split(',').map((n) => n.trim().replace(/'/g, ''));
      return reponse(noms.filter((n) => ACTIONS[n]).map((n) => ({ conversionAction: { resourceName: n, ...ACTIONS[n] } })));
    }
    if ((m = /FROM campaign WHERE campaign\.id = (\d+)$/.exec(q))) {
      const campagnes: Record<string, unknown> = {
        777: { name: '[Claude] Essai', status: 'PAUSED', advertisingChannelType: 'DEMAND_GEN', demandGenCampaignSettings: { upgradedTargeting: true } },
        778: { name: 'Ancien ciblage', status: 'PAUSED', advertisingChannelType: 'DEMAND_GEN', demandGenCampaignSettings: { upgradedTargeting: false } },
        779: { name: 'Supprimée', status: 'REMOVED', advertisingChannelType: 'DEMAND_GEN', demandGenCampaignSettings: { upgradedTargeting: true } },
        111: { name: 'Search', status: 'ENABLED', advertisingChannelType: 'SEARCH' },
      };
      return reponse(campagnes[m[1]] ? [{ campaign: campagnes[m[1]] }] : []);
    }
    if ((m = /FROM geo_target_constant WHERE geo_target_constant\.id IN \(([^)]*)\)$/.exec(q))) {
      return reponse(m[1].split(',').map((x) => x.trim()).filter((id) => LIEUX[id])
        .map((id) => ({ geoTargetConstant: { id, resourceName: `geoTargetConstants/${id}`, ...LIEUX[id] } })));
    }
    if ((m = /FROM ad_group WHERE ad_group\.id = (\d+)$/.exec(q))) {
      if (m[1] === '888') return reponse([{ adGroup: { name: '[Claude] Groupe DG', status: 'PAUSED' }, campaign: { name: '[Claude] Essai', advertisingChannelType: 'DEMAND_GEN' } }]);
      if (m[1] === '444') return reponse([{ adGroup: { name: 'Groupe Search', status: 'ENABLED', type: 'SEARCH_STANDARD' }, campaign: { name: 'Search', advertisingChannelType: 'SEARCH' } }]);
      return reponse([]);
    }
    if ((m = /FROM asset WHERE asset\.id IN \(([^)]*)\)$/.exec(q))) {
      return reponse(m[1].split(',').map((x) => x.trim()).filter((id) => ELEMENTS[id]).map((id) => {
        const e = ELEMENTS[id];
        return { asset: { id, type: e.type, name: `Élément ${id}`,
          ...(e.l ? { imageAsset: { fullSize: { widthPixels: String(e.l), heightPixels: String(e.h) } } } : {}) } };
      }));
    }
    if (/FROM label WHERE label\.name = '\[Claude\]'/.test(q)) {
      return reponse(monde.libelle ? [{ label: { resourceName: `customers/${COMPTE}/labels/42` } }] : []);
    }
    return reponse([]);
  }
  if (url.endsWith(':mutate')) {
    const c = JSON.parse(corps);
    const service = url.slice(url.lastIndexOf('/') + 1).replace(':mutate', '');
    if (c.validateOnly) return Response.json({});
    if (service === 'googleAds') {
      return Response.json({ mutateOperationResponses: c.mutateOperations.map((o: Record<string, unknown>, i: number) => ({
        [Object.keys(o)[0].replace('Operation', 'Result')]: { resourceName: `customers/${COMPTE}/x/${7000 + i}` },
      })) });
    }
    if (service === 'labels') return reponse([{ resourceName: `customers/${COMPTE}/labels/99` }]);
    return reponse(c.operations.map((_: unknown, i: number) => ({ resourceName: `customers/${COMPTE}/${service}/888~${8000 + i}` })));
  }
  return undefined;
});

type Mutation = { service: string; validateOnly: boolean; operations: Record<string, any>[] };
const mutations = (appels: Appel[]): Mutation[] => appels
  .filter((a) => a.url.endsWith(':mutate'))
  .map((a) => {
    const c = JSON.parse(a.corps);
    return { service: a.url.slice(a.url.lastIndexOf('/') + 1).replace(':mutate', ''), validateOnly: c.validateOnly, operations: c.operations ?? c.mutateOperations };
  });
const executions = (appels: Appel[]) => mutations(appels).filter((m) => !m.validateOnly);

const jetonDe = (corps: any) => /jeton = "([^"]+)"/.exec(texteDe(corps))?.[1];

const apercuPuisExecution = async (env: EnvFactice, outil: string, args: Record<string, unknown>) => {
  const apercu = await appelerOutil(env, outil, args, LIRE_ECRIRE);
  const jeton = jetonDe(apercu.corps);
  const execution = await appelerOutil(env, outil, { ...args, jeton }, LIRE_ECRIRE);
  return { apercu: apercu.corps, jeton, execution: execution.corps };
};

/** 150 € sur trente jours : 5 € par jour. */
const CAMPAGNE = { nom: 'Essai Demand Gen', budget_total: 150, debut: '2026-10-10', fin: '2026-11-08', encheres: { strategie: 'CPC_CIBLE', cpc_cible: 1.2 }, objectif: 'rdv' };
const GROUPE = { campagne: '777', nom: 'Groupe essai', zone: 'france_metropolitaine' };
const ANNONCE = {
  groupe: '888',
  titres: ['Séance individuelle', 'Prendre rendez-vous'],
  descriptions: ['Un espace pour déposer ce qui pèse.', 'Première séance : un temps pour se rencontrer.'],
  images: { paysage: ['101'], carre: ['102'] },
  logos: ['105'],
  url_finale: 'https://luminose.fr/seances/',
};

/**
 * Ce que la référence v25 rattache à l'annonce multi-élément, recopié ici et
 * non importé : le test ne se règle pas sur le code. Rien à la campagne :
 * Demand Gen y refuse le champ entier (premier envoi à blanc, 07/10/2026).
 */
const AUTOMATISMES_ANNONCE = ['GENERATE_DESIGN_VERSIONS_FOR_IMAGES', 'GENERATE_VIDEOS_FROM_OTHER_ASSETS', 'GENERATE_ANIMATED_IMAGES_FROM_OTHER_ASSETS'];
const coupes = (types: string[]) => types.map((t) => ({ assetAutomationType: t, assetAutomationStatus: 'OPTED_OUT' }));
const CANAUX = { youtubeInFeed: true, youtubeInStream: true, youtubeShorts: true, discover: true, gmail: true, display: false, maps: false };

// ── La campagne ──────────────────────────────────────────────────────────

describe('ads_dg_campagne_creer — DG1, DG2, DG3, DG6, DG8', () => {
  it('NORMATIF — budget total, campagne et objectif partent en une requête atomique, en pause et marqués', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    const { apercu, execution } = await apercuPuisExecution(env, 'ads_dg_campagne_creer', CAMPAGNE);

    const t = texteDe(apercu);
    expect(t).toMatch(/^APERÇU/);
    expect(t).toMatch(/Campagne Demand Gen « \[Claude\] Essai Demand Gen », EN PAUSE/);
    expect(t).toMatch(/Budget total : 150,00 €, du 10\/10\/2026 au 08\/11\/2026 \(30 jours\), soit 5,00 € par jour\. Plafonds : 400,00 € par campagne, 10,00 € par jour/);
    expect(t).toMatch(/Engagement après création : 15,00 € par jour sur 25,00 €/);
    expect(t).toMatch(/Enchères : CPC cible 1,20 € — une moyenne visée, pas un plafond ; un clic peut coûter plus \(plafond du réglage : 2,00 €\)/);
    expect(t).toMatch(/Objectif de conversion « rdv » : l'objectif personnalisé « Rendez-vous » \(555\) — « Prise de rendez-vous », « Formulaire »/);
    expect(t).toMatch(/Canaux : posés au groupe — YouTube \(flux, InStream, Shorts\), Discover, Gmail ; Display et Maps coupés/);
    expect(t).toMatch(/: coupé à chaque annonce \(ads_dg_annonce_creer\)/);
    expect(texteDe(execution)).toMatch(/^FAIT/);

    const [vue, faite] = mutations(appels);
    expect(vue.service).toBe('googleAds');
    expect(faite.operations).toEqual(vue.operations);
    const [budget, campagne, objectif, ...reste] = faite.operations;
    expect(reste).toEqual([]);

    expect(budget).toEqual({ campaignBudgetOperation: { create: {
      resourceName: `customers/${COMPTE}/campaignBudgets/-1`,
      name: '[Claude] Essai Demand Gen',
      period: 'CUSTOM_PERIOD',
      totalAmountMicros: '150000000',
      deliveryMethod: 'STANDARD',
      explicitlyShared: false,
    } } });
    expect(campagne.campaignOperation.create).toEqual({
      resourceName: `customers/${COMPTE}/campaigns/-2`,
      name: '[Claude] Essai Demand Gen',
      status: 'PAUSED',
      advertisingChannelType: 'DEMAND_GEN',
      campaignBudget: `customers/${COMPTE}/campaignBudgets/-1`,
      startDateTime: '2026-10-10 00:00:00',
      endDateTime: '2026-11-08 23:59:59',
      demandGenCampaignSettings: { upgradedTargeting: true },
      geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE', negativeGeoTargetType: 'PRESENCE' },
      containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
      targetCpc: { targetCpcMicros: '1200000' },
    });
    expect(objectif).toEqual({ conversionGoalCampaignConfigOperation: {
      update: {
        resourceName: `customers/${COMPTE}/conversionGoalCampaignConfigs/-2`,
        goalConfigLevel: 'CAMPAIGN',
        customConversionGoal: `customers/${COMPTE}/customConversionGoals/555`,
      },
      updateMask: 'customConversionGoal,goalConfigLevel',
    } });
  });

  it('NORMATIF — DG1 : le budget total au-delà de ADS_BUDGET_MAX_CAMPAGNE est refusé', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    // 400,01 € sur cinquante jours : sous le plafond quotidien, au-delà du plafond par campagne.
    const { corps } = await appelerOutil(env, 'ads_dg_campagne_creer', { ...CAMPAGNE, budget_total: 400.01, fin: '2026-11-28' }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/Budget total de 400,01 € au-delà du plafond de 400,00 € par campagne \(ADS_BUDGET_MAX_CAMPAGNE\)/);
    expect(mutations(appels)).toEqual([]);

    const juste = await appelerOutil(env, 'ads_dg_campagne_creer', { ...CAMPAGNE, budget_total: 400, fin: '2026-11-28' }, LIRE_ECRIRE);
    expect(texteDe(juste.corps)).toMatch(/^APERÇU/);
  });

  it('NORMATIF — DG1 : l’équivalent quotidien au-delà de ADS_BUDGET_MAX_JOUR est refusé', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    // 300,01 € sur trente jours : 10,01 € par jour.
    const { corps } = await appelerOutil(env, 'ads_dg_campagne_creer', { ...CAMPAGNE, budget_total: 300.01 }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/300,01 € sur 30 jours, c'est 10,01 € par jour : au-delà du plafond de 10,00 € \(ADS_BUDGET_MAX_JOUR\)/);
    expect(mutations(appels)).toEqual([]);
    // Le même budget sur un seul jour.
    const unJour = await appelerOutil(env, 'ads_dg_campagne_creer', { ...CAMPAGNE, budget_total: 11, debut: '2026-10-10', fin: '2026-10-10' }, LIRE_ECRIRE);
    expect(texteDe(unJour.corps)).toMatch(/11,00 € sur 1 jour, c'est 11,00 € par jour/);
    expect(mutations(appels)).toEqual([]);
  });

  it('NORMATIF — DG1 : l’engagement compte la nouvelle campagne et les budgets totaux déjà dans le compte', async () => {
    const budgets: Budget[] = [
      ...BUDGETS,
      // 300 € sur trente jours, en attente de validation : 10 € par jour.
      { nom: '[Claude] Total en attente', statut: 'PAUSED', total: 300, debut: '2026-10-08', fin: '2026-11-06' },
      // Terminée : elle ne dépense plus.
      { nom: 'Terminée', statut: 'ENABLED', total: 500, debut: '2026-09-01', fin: '2026-09-30' },
    ];
    // Engagement : 5 + 5 + 10 = 20 € ; « Ancienne », en pause sans la marque, ne compte pas.
    const env = creerEnv();
    const appels = simulerCompte({ budgets });
    const refus = await appelerOutil(env, 'ads_dg_campagne_creer', { ...CAMPAGNE, budget_total: 150.3 }, LIRE_ECRIRE);
    expect(texteDe(refus.corps)).toMatch(/Engagement dépassé : 20,00 € par jour déjà actifs ou en attente de validation, plus 5,01 €, au-delà de 25,00 €/);
    expect(mutations(appels)).toEqual([]);

    const juste = await appelerOutil(env, 'ads_dg_campagne_creer', CAMPAGNE, LIRE_ECRIRE);
    expect(texteDe(juste.corps)).toMatch(/Engagement après création : 25,00 € par jour sur 25,00 €/);
  });

  it('NORMATIF — DG1 : sans dates, ou avec des dates impossibles, rien ne part', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    const sansDebut: Record<string, unknown> = { ...CAMPAGNE };
    delete sansDebut.debut;
    const sansFin: Record<string, unknown> = { ...CAMPAGNE };
    delete sansFin.fin;
    for (const [args, attendu] of [
      [sansDebut, /Arguments invalides/],
      [sansFin, /Arguments invalides/],
      [{ ...CAMPAGNE, fin: '8/11/2026' }, /Arguments invalides/],
      [{ ...CAMPAGNE, debut: '2026-02-30' }, /Dates illisibles/],
      [{ ...CAMPAGNE, debut: '2026-10-06' }, /Début le 06\/10\/2026, dans le passé : au plus tôt aujourd'hui, 07\/10\/2026/],
      [{ ...CAMPAGNE, debut: '2026-10-10', fin: '2026-10-09' }, /Fin le 09\/10\/2026, avant le début, 10\/10\/2026/],
    ] as const) {
      const { corps } = await appelerOutil(env, 'ads_dg_campagne_creer', args, LIRE_ECRIRE);
      expect(texteDe(corps), JSON.stringify(args)).toMatch(attendu);
    }
    expect(mutations(appels)).toEqual([]);
    // Aujourd'hui est permis.
    const ce = await appelerOutil(env, 'ads_dg_campagne_creer', { ...CAMPAGNE, debut: '2026-10-07' }, LIRE_ECRIRE);
    expect(texteDe(ce.corps)).toMatch(/^APERÇU/);
  });

  it('NORMATIF — DG2 : Maximiser les clics sans plafond, CPC cible plafonné, ou Maximiser les conversions sans cible ; rien d’autre', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    // Chaque stratégie envoie un seul champ d'enchères, et lui seul.
    for (const [encheres, apercu, champ, valeur] of [
      [{ strategie: 'CLICS' }, /Enchères : Maximiser les clics, sans plafond par clic \(Google n’en accepte pas en Demand Gen\) : le budget total est le seul frein/, 'targetSpend', {}],
      [{ strategie: 'CPC_CIBLE', cpc_cible: 1 }, /Enchères : CPC cible 1,00 € — une moyenne visée, pas un plafond/, 'targetCpc', { targetCpcMicros: '1000000' }],
      [{ strategie: 'CONVERSIONS' }, /Enchères : Maximiser les conversions, sans CPA ni ROAS cible/, 'maximizeConversions', {}],
    ] as const) {
      const { corps } = await appelerOutil(env, 'ads_dg_campagne_creer', { ...CAMPAGNE, encheres }, LIRE_ECRIRE);
      expect(texteDe(corps), encheres.strategie).toMatch(apercu);
      const c = mutations(appels).at(-1)!.operations[1].campaignOperation.create;
      expect(c[champ], encheres.strategie).toEqual(valeur);
      const autres = ['targetSpend', 'targetCpc', 'maximizeConversions'].filter((k) => k !== champ);
      expect(autres.filter((k) => k in c), encheres.strategie).toEqual([]);
    }

    const avant = mutations(appels).length;
    for (const encheres of [
      // Le plafond que Google refuse en Demand Gen ne s'accepte plus en entrée.
      { strategie: 'CLICS', cpc_max: 1 },
      { strategie: 'CPC_CIBLE' },
      { strategie: 'CPC_CIBLE', cpc_cible: 1, cpc_max: 2 },
      { strategie: 'CONVERSIONS', cpa_cible: 20 },
      { strategie: 'CONVERSIONS', roas_cible: 3 },
      { strategie: 'CPA_CIBLE', cpa: 20 },
    ]) {
      const { corps } = await appelerOutil(env, 'ads_dg_campagne_creer', { ...CAMPAGNE, encheres }, LIRE_ECRIRE);
      expect(texteDe(corps), JSON.stringify(encheres)).toMatch(/Arguments invalides/);
    }
    const cher = await appelerOutil(env, 'ads_dg_campagne_creer', { ...CAMPAGNE, encheres: { strategie: 'CPC_CIBLE', cpc_cible: 2.01 } }, LIRE_ECRIRE);
    expect(texteDe(cher.corps)).toMatch(/CPC cible de 2,01 € hors des bornes : au plus 2,00 € \(ADS_CPC_MAX\)/);
    expect(mutations(appels)).toHaveLength(avant);
  });

  it('NORMATIF — DG3 : un objectif hors liste, supprimé, ou dont une action ne compte plus, est refusé ; une liste vide ferme tout', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    for (const [objectif, attendu] of [
      ['inconnu', /Objectif « inconnu » hors de la liste \(ADS_OBJECTIFS_CONVERSION\) : rdv, achat, ancien/],
      ['ancien', /L'objectif personnalisé 557 \(« ancien »\) est introuvable ou supprimé/],
      ['achat', /actions de conversion absentes ou inactives : customers\/\d+\/conversionActions\/3/],
    ] as const) {
      const { corps } = await appelerOutil(env, 'ads_dg_campagne_creer', { ...CAMPAGNE, objectif }, LIRE_ECRIRE);
      expect(texteDe(corps), objectif).toMatch(attendu);
    }
    expect(mutations(appels)).toEqual([]);

    for (const [valeur, pourquoi] of [['', 'vide'], [' ', 'vide'], ['rdv=555', 'illisible'], ['rdv:555,rdv:556', 'illisible'], ['Rdv:555', 'illisible']]) {
      const { corps } = await appelerOutil(creerEnv({ ADS_OBJECTIFS_CONVERSION: valeur }), 'ads_dg_campagne_creer', CAMPAGNE, LIRE_ECRIRE);
      expect(texteDe(corps), valeur).toMatch(new RegExp(`ADS_OBJECTIFS_CONVERSION est ${pourquoi} dans wrangler\\.toml : la création de campagne Demand Gen est fermée`));
    }
    expect(mutations(appels)).toEqual([]);
  });

  it('NORMATIF — DG6 : aucun automatisme n’est réglé à la campagne, quelle que soit la stratégie — Demand Gen le refuse', async () => {
    for (const encheres of [CAMPAGNE.encheres, { strategie: 'CLICS' }, { strategie: 'CONVERSIONS' }]) {
      const env = creerEnv();
      const appels = simulerCompte();
      await appelerOutil(env, 'ads_dg_campagne_creer', { ...CAMPAGNE, encheres }, LIRE_ECRIRE);
      expect('assetAutomationSettings' in mutations(appels)[0].operations[1].campaignOperation.create, encheres.strategie).toBe(false);
    }
  });

  it('NORMATIF — rien du ciblage, des canaux, du budget partagé ni du statut ne s’accepte en entrée', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    for (const intrus of [
      { zone: 'france_metropolitaine' }, { canaux: ['DISPLAY'] }, { budget_partage: true }, { budget_jour: 5 },
      { status: 'ENABLED' }, { automatismes: true }, { objectif_id: '555' },
    ]) {
      const { corps } = await appelerOutil(env, 'ads_dg_campagne_creer', { ...CAMPAGNE, ...intrus }, LIRE_ECRIRE);
      expect(texteDe(corps), JSON.stringify(intrus)).toMatch(/Unrecognized key/);
    }
    expect(appels).toEqual([]);
  });
});

// ── Le groupe ────────────────────────────────────────────────────────────

describe('ads_dg_groupe_creer — DG4, DG5, DG8', () => {
  it('NORMATIF — le groupe, ses lieux et sa langue partent en une requête atomique, en pause, marqués, Display et Maps coupés', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    const { apercu, execution } = await apercuPuisExecution(env, 'ads_dg_groupe_creer', GROUPE);
    const t = texteDe(apercu);
    expect(t).toMatch(/Groupe d'annonces « \[Claude\] Groupe essai », EN PAUSE, dans la campagne Demand Gen « \[Claude\] Essai »/);
    expect(t).toMatch(/Zone « france_metropolitaine » \(1 lieu\) : France — en présence réelle/);
    expect(t).toMatch(/Langue : français/);
    expect(t).toMatch(/Canaux : YouTube \(flux, InStream, Shorts\), Discover, Gmail ; Display et Maps coupés/);
    expect(texteDe(execution)).toMatch(/^FAIT/);

    const [vue, faite] = mutations(appels);
    expect(vue.service).toBe('googleAds');
    expect(faite.operations).toEqual(vue.operations);
    const tmp = `customers/${COMPTE}/adGroups/-1`;
    expect(faite.operations).toEqual([
      { adGroupOperation: { create: {
        resourceName: tmp,
        campaign: `customers/${COMPTE}/campaigns/777`,
        name: '[Claude] Groupe essai',
        status: 'PAUSED',
        demandGenAdGroupSettings: { channelControls: { selectedChannels: CANAUX } },
      } } },
      { adGroupCriterionOperation: { create: { adGroup: tmp, location: { geoTargetConstant: 'geoTargetConstants/2250' } } } },
      { adGroupCriterionOperation: { create: { adGroup: tmp, language: { languageConstant: 'languageConstants/1002' } } } },
    ]);
  });

  it('NORMATIF — DG4 : « locale » vaut exactement ADS_ZONE_LOCALE ; vide, il est fermé', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    const { corps } = await appelerOutil(env, 'ads_dg_groupe_creer', { ...GROUPE, zone: 'locale' }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/Zone « locale » \(2 lieux\) : Lieu A,France ; Lieu B,France/);
    expect(mutations(appels)[0].operations.slice(1, -1).map((o) => o.adGroupCriterionOperation.create.location.geoTargetConstant))
      .toEqual(LIEUX_LOCAUX.map((id) => `geoTargetConstants/${id}`));

    const vide = await appelerOutil(creerEnv({ ADS_ZONE_LOCALE: '' }), 'ads_dg_groupe_creer', { ...GROUPE, zone: 'locale' }, LIRE_ECRIRE);
    expect(texteDe(vide.corps)).toMatch(/Le préréglage « locale » est vide \(ADS_ZONE_LOCALE/);
    // Vide, « locale » ne ferme pas la France.
    const france = await appelerOutil(creerEnv({ ADS_ZONE_LOCALE: '' }), 'ads_dg_groupe_creer', GROUPE, LIRE_ECRIRE);
    expect(texteDe(france.corps)).toMatch(/^APERÇU/);

    const retire = await appelerOutil(creerEnv({ ADS_ZONE_LOCALE: '9100001,9100003' }), 'ads_dg_groupe_creer', { ...GROUPE, zone: 'locale' }, LIRE_ECRIRE);
    expect(texteDe(retire.corps)).toMatch(/Le lieu geoTargetConstants\/9100003 du préréglage « locale » est introuvable ou retiré/);
    const illisible = await appelerOutil(creerEnv({ ADS_ZONE_LOCALE: 'Lyon' }), 'ads_dg_groupe_creer', GROUPE, LIRE_ECRIRE);
    expect(texteDe(illisible.corps)).toMatch(/ADS_ZONE_LOCALE est illisible/);
    expect(mutations(appels)).toHaveLength(2);
  });

  it('NORMATIF — DG4 : une zone hors des préréglages, un lieu, un rayon ou une langue ne s’acceptent pas', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    for (const intrus of [{ zone: 'France' }, { zone: 'monde' }, { zone: '2250' }]) {
      const { corps } = await appelerOutil(env, 'ads_dg_groupe_creer', { ...GROUPE, ...intrus }, LIRE_ECRIRE);
      expect(texteDe(corps), JSON.stringify(intrus)).toMatch(/Arguments invalides/);
    }
    for (const intrus of [{ lieux: ['2250'] }, { rayon: 30 }, { langue: 'en' }, { canaux: { display: true } }, { status: 'ENABLED' }]) {
      const { corps } = await appelerOutil(env, 'ads_dg_groupe_creer', { ...GROUPE, ...intrus }, LIRE_ECRIRE);
      expect(texteDe(corps), JSON.stringify(intrus)).toMatch(/Unrecognized key/);
    }
    expect(appels).toEqual([]);
  });

  it('refuse une campagne hors Demand Gen, supprimée, ou qui cible à la campagne', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    for (const [campagne, attendu] of [
      ['111', /n'est pas une campagne Demand Gen \(SEARCH\)/],
      ['778', /cible au niveau de la campagne/],
      ['779', /introuvable, ou supprimée/],
      ['999', /introuvable, ou supprimée/],
    ] as const) {
      const { corps } = await appelerOutil(env, 'ads_dg_groupe_creer', { ...GROUPE, campagne }, LIRE_ECRIRE);
      expect(texteDe(corps), campagne).toMatch(attendu);
    }
    expect(mutations(appels)).toEqual([]);
  });
});

// ── L'annonce ────────────────────────────────────────────────────────────

describe('ads_dg_annonce_creer — DG6, DG7', () => {
  it('NORMATIF — l’annonce multi-élément part en pause, au nom de Luminose, automatismes coupés, puis reçoit son libellé', async () => {
    const env = creerEnv();
    const appels = simulerCompte({ libelle: true });
    const args = { ...ANNONCE, images: { paysage: ['101'], carre: ['102'], portrait: ['103'], vertical: ['104'] }, bouton: 'BOOK_NOW', nom: 'Essai 1' };
    const { apercu, execution } = await apercuPuisExecution(env, 'ads_dg_annonce_creer', args);
    const t = texteDe(apercu);
    expect(t).toMatch(/Annonce Demand Gen multi-élément EN PAUSE dans le groupe « \[Claude\] Groupe DG »/);
    expect(t).toMatch(/Nom d'entreprise : Luminose\. Nom interne : « Essai 1 »/);
    expect(t).toMatch(/paysage 1,91:1 101 « Élément 101 » : 1200×628/);
    expect(t).toMatch(/Bouton : « Réserver » \(BOOK_NOW\)/);
    expect(texteDe(execution)).toMatch(/Libellé \[Claude\] posé/);

    const [ad, lien] = executions(appels);
    expect(ad.service).toBe('adGroupAds');
    expect(ad.operations).toEqual([{ create: {
      adGroup: `customers/${COMPTE}/adGroups/888`,
      status: 'PAUSED',
      ad: {
        finalUrls: ['https://luminose.fr/seances/'],
        name: 'Essai 1',
        demandGenMultiAssetAd: {
          businessName: 'Luminose',
          headlines: [{ text: 'Séance individuelle' }, { text: 'Prendre rendez-vous' }],
          descriptions: [{ text: 'Un espace pour déposer ce qui pèse.' }, { text: 'Première séance : un temps pour se rencontrer.' }],
          marketingImages: [{ asset: `customers/${COMPTE}/assets/101` }],
          squareMarketingImages: [{ asset: `customers/${COMPTE}/assets/102` }],
          portraitMarketingImages: [{ asset: `customers/${COMPTE}/assets/103` }],
          tallPortraitMarketingImages: [{ asset: `customers/${COMPTE}/assets/104` }],
          logoImages: [{ asset: `customers/${COMPTE}/assets/105` }],
          callToActionText: 'Book now',
        },
      },
      adGroupAdAssetAutomationSettings: coupes(AUTOMATISMES_ANNONCE),
    } }]);
    expect(lien).toEqual({ service: 'adGroupAdLabels', validateOnly: false, operations: [
      { create: { adGroupAd: `customers/${COMPTE}/adGroupAds/888~8000`, label: `customers/${COMPTE}/labels/42` } },
    ] });
  });

  it('NORMATIF — DG7 : le nom d’entreprise est imposé, le bouton pris dans la liste fermée', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    for (const intrus of [{ nom_entreprise: 'Autre' }, { business_name: 'Autre' }, { image_display: ['101'] }, { status: 'ENABLED' }]) {
      const { corps } = await appelerOutil(env, 'ads_dg_annonce_creer', { ...ANNONCE, ...intrus }, LIRE_ECRIRE);
      expect(texteDe(corps), JSON.stringify(intrus)).toMatch(/Unrecognized key/);
    }
    for (const bouton of ['DONATE_NOW', 'Learn more', 'Réserver']) {
      const { corps } = await appelerOutil(env, 'ads_dg_annonce_creer', { ...ANNONCE, bouton }, LIRE_ECRIRE);
      expect(texteDe(corps), bouton).toMatch(/Arguments invalides/);
    }
    expect(appels).toEqual([]);
    // Sans bouton : aucun texte ne part, Google choisit.
    await appelerOutil(env, 'ads_dg_annonce_creer', ANNONCE, LIRE_ECRIRE);
    expect(mutations(appels)[0].operations[0].create.ad.demandGenMultiAssetAd.callToActionText).toBeUndefined();
  });

  it('NORMATIF — DG7 : un élément inexistant, d’un autre type, d’un autre ratio ou trop petit est refusé', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    for (const [variante, attendu] of [
      [{ images: { paysage: ['999'] } }, /paysage 1,91:1 999 : élément introuvable/],
      [{ images: { paysage: ['106'] } }, /paysage 1,91:1 106 : élément de type TEXT, pas une image/],
      [{ images: { paysage: ['102'] } }, /paysage 1,91:1 102 : 1200×1200, ratio 1\.00 — 1\.91 attendu/],
      [{ images: { carre: ['101'] } }, /carrée 1:1 101 : 1200×628, ratio 1\.91 — 1\.00 attendu/],
      [{ images: { carre: ['102'], portrait: ['104'] } }, /portrait 4:5 104 : 1080×1920/],
      [{ images: { carre: ['102'], vertical: ['103'] } }, /verticale 9:16 103 : 960×1200/],
      [{ images: { paysage: ['107'] } }, /paysage 1,91:1 107 : 500×262 — 600×314 au moins/],
      [{ logos: ['108'] }, /logo 1:1 108 : 100×100 — 128×128 au moins/],
      [{ logos: ['101'] }, /logo 1:1 101 : 1200×628/],
      [{ images: { portrait: ['103'] } }, /une paysage ou une carrée au moins/],
      [{ images: { paysage: ['101', '101'] } }, /paysage 1,91:1 : un élément en double/],
    ] as const) {
      const { corps } = await appelerOutil(env, 'ads_dg_annonce_creer', { ...ANNONCE, ...variante }, LIRE_ECRIRE);
      expect(corps.result.isError, JSON.stringify(variante)).toBe(true);
      expect(texteDe(corps), JSON.stringify(variante)).toMatch(attendu);
    }
    expect(mutations(appels)).toEqual([]);
  });

  it('les limites de Google : titres, descriptions, accolades, doublons, logos, vingt images', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    for (const [variante, attendu] of [
      [{ titres: ['Un titre bien trop long pour Demand Gen'] }, /titre « Un titre bien trop long pour Demand Gen » : 39 caractères — 30 au plus/],
      [{ descriptions: ['x'.repeat(91)] }, /91 caractères — 90 au plus/],
      [{ titres: ['{KeyWord:Séance}'] }, /pas d'accolades/],
      [{ titres: ['Séance', 'séance'] }, /titre en double : « séance »/],
      [{ descriptions: ['   '] }, /description vide/],
      [{ images: { paysage: Array(11).fill('101').map((_, i) => String(i)), carre: Array(10).fill('102').map((_, i) => String(100 + i)) } }, /21 — 20 au plus en tout/],
    ] as const) {
      const { corps } = await appelerOutil(env, 'ads_dg_annonce_creer', { ...ANNONCE, ...variante }, LIRE_ECRIRE);
      expect(texteDe(corps), JSON.stringify(variante)).toMatch(attendu);
    }
    for (const variante of [{ titres: Array(6).fill('Titre') }, { descriptions: [] }, { logos: [] }, { logos: Array(6).fill('105') }]) {
      const { corps } = await appelerOutil(env, 'ads_dg_annonce_creer', { ...ANNONCE, ...variante }, LIRE_ECRIRE);
      expect(texteDe(corps), JSON.stringify(variante)).toMatch(/Arguments invalides/);
    }
    expect(appels).toEqual([]);
  });

  it('refuse un groupe hors Demand Gen, ou introuvable', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    const search = await appelerOutil(env, 'ads_dg_annonce_creer', { ...ANNONCE, groupe: '444' }, LIRE_ECRIRE);
    expect(texteDe(search.corps)).toMatch(/n'est pas une campagne Demand Gen \(SEARCH\)/);
    const absent = await appelerOutil(env, 'ads_dg_annonce_creer', { ...ANNONCE, groupe: '999' }, LIRE_ECRIRE);
    expect(texteDe(absent.corps)).toMatch(/introuvable, ou supprimé/);
    expect(mutations(appels)).toEqual([]);
  });
});

// ── V4 et V6 ─────────────────────────────────────────────────────────────

const INTERDITS: [string, RegExp][] = [
  ['Guérir de l’anxiété', /guéri/],
  ['Guerison durable', /guéri/],
  ['On vous soigne', /soign/],
  ['Résultat garanti', /garanti/],
  ['Efficace à 100 %', /100 %/],
  ['Efficace à 100%', /100 %/],
  ['Libéré définitivement', /définitivement/],
  ['Diagnostic offert', /diagnostic/],
  ['Sans traitement médical', /traitement médical/],
];

describe('NORMATIF — V4 : chaque terme de refus fait échouer un titre et une description', () => {
  it('refuse, sans rien envoyer', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    for (const [texte, attendu] of INTERDITS) {
      for (const variante of [
        { ...ANNONCE, titres: [texte, ANNONCE.titres[1]] },
        { ...ANNONCE, descriptions: [texte, ANNONCE.descriptions[1]] },
      ]) {
        const { corps } = await appelerOutil(env, 'ads_dg_annonce_creer', variante, LIRE_ECRIRE);
        expect(corps.result.isError, texte).toBe(true);
        expect(texteDe(corps), texte).toMatch(attendu);
        expect(texteDe(corps)).toMatch(/aucune promesse de guérison/);
      }
    }
    // « remplace » ne refuse qu'avec médecin ou traitement, dans la même annonce.
    const combine = await appelerOutil(env, 'ads_dg_annonce_creer',
      { ...ANNONCE, titres: ['Remplace votre suivi'], descriptions: ['Mieux qu’un médecin.'] }, LIRE_ECRIRE);
    expect(texteDe(combine.corps)).toMatch(/remplace \+ médecin ou traitement/);
    expect(appels).toEqual([]);
  });

  it('les avertissements passent, et l’aperçu les dit', async () => {
    const env = creerEnv();
    simulerCompte();
    const { corps } = await appelerOutil(env, 'ads_dg_annonce_creer',
      { ...ANNONCE, titres: ['Florent, hypnothérapeute', 'Breathwork'], descriptions: ['Un atelier pour respirer.'] }, LIRE_ECRIRE);
    const t = texteDe(corps);
    expect(t).toMatch(/^APERÇU/);
    expect(t).toMatch(/AVERTISSEMENTS — à relire avant de valider/);
    expect(t).toMatch(/hypnothérapeute/);
    expect(t).toMatch(/atelier » : offre terminée/);
    // Le questionnaire se mentionne sur la page d'arrivée, plus dans l'annonce (cadre du 08/10/2026).
    expect(t).not.toMatch(/questionnaire/);
  });
});

describe('NORMATIF — V6 : une URL finale hors de luminose.fr est refusée', () => {
  it('refuse, sans rien envoyer', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    for (const url of ['http://luminose.fr/', 'https://passage.luminose.fr/', 'https://luminose.fr.evil.example/', 'https://evil.example/', 'https://luminose.fr']) {
      const { corps } = await appelerOutil(env, 'ads_dg_annonce_creer', { ...ANNONCE, url_finale: url }, LIRE_ECRIRE);
      expect(texteDe(corps), url).toMatch(/URL finale « .* » refusée/);
    }
    expect(appels).toEqual([]);
  });
});

// ── Les lots ne se croisent pas ──────────────────────────────────────────

describe('NORMATIF — DG8 : les outils du Search refusent Demand Gen', () => {
  it('ni groupe, ni annonce, ni mot-clé Search dans une campagne Demand Gen', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    const groupe = await appelerOutil(env, 'ads_groupe_creer', { campagne: '777', nom: 'x' }, LIRE_ECRIRE);
    expect(texteDe(groupe.corps)).toMatch(/n'est pas une campagne Search/);
    const annonce = await appelerOutil(env, 'ads_annonce_creer', {
      groupe: '888', titres: ['Un', 'Deux', 'Trois'], descriptions: ['Une description.', 'Une autre.'], url_finale: 'https://luminose.fr/',
    }, LIRE_ECRIRE);
    expect(texteDe(annonce.corps)).toMatch(/n'est pas une campagne Search/);
    const mots = await appelerOutil(env, 'ads_mots_cles_ajouter', { groupe: '888', mots_cles: [{ texte: 'séance', correspondance: 'PHRASE' }] }, LIRE_ECRIRE);
    expect(texteDe(mots.corps)).toMatch(/n'est pas une campagne Search/);
    expect(mutations(appels)).toEqual([]);
  });
});

// ── La table fermée, revérifiée indépendamment des outils ────────────────

describe('NORMATIF — la table fermée revérifie Demand Gen, même construit par le code', () => {
  const LIMITES = { budgetMaxJour: 10_000_000, budgetMaxTotal: 25_000_000, cpcMax: 2_000_000, budgetMaxCampagne: 400_000_000 };
  const OBJECTIFS_PERMIS = ['555', '556'];
  const tmpB = `customers/${COMPTE}/campaignBudgets/-1`;
  const tmpC = `customers/${COMPTE}/campaigns/-2`;
  const campagne = (budget: Record<string, unknown> = {}, c: Record<string, unknown> = {}, config: Record<string, unknown> = {}): Operation[] => [
    { campaignBudgetOperation: { create: {
      resourceName: tmpB, name: '[Claude] X', period: 'CUSTOM_PERIOD', totalAmountMicros: '150000000',
      deliveryMethod: 'STANDARD', explicitlyShared: false, ...budget,
    } } },
    { campaignOperation: { create: {
      resourceName: tmpC, name: '[Claude] X', status: 'PAUSED', advertisingChannelType: 'DEMAND_GEN', campaignBudget: tmpB,
      startDateTime: '2026-10-10 00:00:00', endDateTime: '2026-11-08 23:59:59',
      demandGenCampaignSettings: { upgradedTargeting: true },
      geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE', negativeGeoTargetType: 'PRESENCE' },
      containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
      targetCpc: { targetCpcMicros: '1000000' },
      ...c,
    } } },
    { conversionGoalCampaignConfigOperation: {
      update: {
        resourceName: `customers/${COMPTE}/conversionGoalCampaignConfigs/-2`, goalConfigLevel: 'CAMPAIGN',
        customConversionGoal: `customers/${COMPTE}/customConversionGoals/555`, ...config,
      },
      updateMask: 'customConversionGoal,goalConfigLevel',
    } },
  ];
  const sans = (o: Record<string, unknown>, cle: string) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== cle));

  /** La campagne de base, son enchère remplacée par une autre. */
  const enchere = (champ: string, valeur: Record<string, unknown>): Operation[] => {
    const ops = campagne();
    const c = (ops[1].campaignOperation as { create: Record<string, unknown> }).create;
    delete c.targetCpc;
    c[champ] = valeur;
    return ops;
  };

  it('la création de campagne conforme passe, en CPC cible, en clics comme en conversions', () => {
    expect(() => verifierCreationCampagneDG(campagne(), LIMITES, OBJECTIFS_PERMIS)).not.toThrow();
    expect(() => verifierCreationCampagneDG(campagne({}, { targetCpc: { targetCpcMicros: '2000000' } }), LIMITES, OBJECTIFS_PERMIS)).not.toThrow();
    expect(() => verifierCreationCampagneDG(enchere('targetSpend', {}), LIMITES, OBJECTIFS_PERMIS)).not.toThrow();
    expect(() => verifierCreationCampagneDG(enchere('maximizeConversions', {}), LIMITES, OBJECTIFS_PERMIS)).not.toThrow();
  });

  it('et toute dérive de campagne est refusée', () => {
    const base = campagne();
    const derives: [string, Operation[]][] = [
      ['budget partagé', campagne({ explicitlyShared: true })],
      ['budget quotidien', campagne({ period: 'DAILY' })],
      ['budget quotidien en montant', [{ campaignBudgetOperation: { create: { ...sans((base[0].campaignBudgetOperation as any).create, 'totalAmountMicros'), amountMicros: '5000000' } } }, base[1], base[2]]],
      ['budget total au-delà du plafond', campagne({ totalAmountMicros: '400010000' }, { endDateTime: '2027-03-31 23:59:59' })],
      ['équivalent quotidien au-delà du plafond', campagne({ totalAmountMicros: '300010000' })],
      ['budget non marqué', campagne({ name: 'X' })],
      ['campagne active', campagne({}, { status: 'ENABLED' })],
      ['campagne Search', campagne({}, { advertisingChannelType: 'SEARCH' })],
      ['campagne non marquée', campagne({}, { name: 'X' })],
      ['sans fin', [base[0], { campaignOperation: { create: sans((base[1].campaignOperation as any).create, 'endDateTime') } }, base[2]]],
      ['sans début', [base[0], { campaignOperation: { create: sans((base[1].campaignOperation as any).create, 'startDateTime') } }, base[2]]],
      ['début passé', campagne({}, { startDateTime: '2026-10-06 00:00:00' })],
      ['fin avant le début', campagne({}, { startDateTime: '2026-10-10 00:00:00', endDateTime: '2026-10-09 23:59:59' })],
      ['heure de début', campagne({}, { startDateTime: '2026-10-10 08:00:00' })],
      ['ciblage à la campagne', campagne({}, { demandGenCampaignSettings: { upgradedTargeting: false } })],
      ['présence ou intérêt', campagne({}, { geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE_OR_INTEREST', negativeGeoTargetType: 'PRESENCE' } })],
      // DG6 — Demand Gen refuse les automatismes à la campagne : même tous coupés, ils ne partent pas.
      ['automatismes à la campagne', campagne({}, { assetAutomationSettings: coupes(AUTOMATISMES_ANNONCE) })],
      ['un automatisme ouvert à la campagne', campagne({}, { assetAutomationSettings: [{ assetAutomationType: AUTOMATISMES_ANNONCE[0], assetAutomationStatus: 'OPTED_IN' }] })],
      // DG2 — le plafond que Google refuse, le montant déprécié, deux enchères à la fois.
      ['clics plafonnés', enchere('targetSpend', { cpcBidCeilingMicros: '1000000' })],
      ['montant cible déprécié', enchere('targetSpend', { targetSpendMicros: '5000000' })],
      ['deux enchères', campagne({}, { targetSpend: {} })],
      ['CPC cible au-delà du plafond', campagne({}, { targetCpc: { targetCpcMicros: '2010000' } })],
      ['CPC cible absent', campagne({}, { targetCpc: {} })],
      ['CPC cible nul', campagne({}, { targetCpc: { targetCpcMicros: '0' } })],
      ['CPC cible hors du centime', campagne({}, { targetCpc: { targetCpcMicros: '1005000' } })],
      ['CPC cible et autre réglage', campagne({}, { targetCpc: { targetCpcMicros: '1000000', cpcBidCeilingMicros: '1500000' } })],
      ['CPA cible', enchere('maximizeConversions', { targetCpaMicros: '20000000' })],
      ['ROAS cible', enchere('maximizeConversionValue', { targetRoas: 3 })],
      ['objectif hors liste', campagne({}, {}, { customConversionGoal: `customers/${COMPTE}/customConversionGoals/557` })],
      ['objectif du compte', campagne({}, {}, { goalConfigLevel: 'CUSTOMER' })],
      ['objectif d’une autre campagne', campagne({}, {}, { resourceName: `customers/${COMPTE}/conversionGoalCampaignConfigs/111` })],
      ['sans objectif', base.slice(0, 2)],
      ['critère en plus', [...base, { campaignCriterionOperation: { create: { campaign: tmpC, language: { languageConstant: 'languageConstants/1002' } } } }]],
      ['suppression', [...base.slice(0, 2), { campaignOperation: { remove: `customers/${COMPTE}/campaigns/1` } }]],
    ];
    for (const [quoi, operations] of derives) {
      expect(() => verifierCreationCampagneDG(operations, LIMITES, OBJECTIFS_PERMIS), quoi).toThrow(/table fermée/);
    }
  });

  const ZONES = { france_metropolitaine: ['geoTargetConstants/2250'], locale: LIEUX_LOCAUX.map((id) => `geoTargetConstants/${id}`) };
  const tmpG = `customers/${COMPTE}/adGroups/-1`;
  const lieu = (id: string) => ({ adGroupCriterionOperation: { create: { adGroup: tmpG, location: { geoTargetConstant: `geoTargetConstants/${id}` } } } });
  const LANGUE = { adGroupCriterionOperation: { create: { adGroup: tmpG, language: { languageConstant: 'languageConstants/1002' } } } };
  const groupe = (g: Record<string, unknown> = {}, criteres: Operation[] = [lieu('2250'), LANGUE]): Operation[] => [
    { adGroupOperation: { create: {
      resourceName: tmpG, campaign: `customers/${COMPTE}/campaigns/777`, name: '[Claude] G', status: 'PAUSED',
      demandGenAdGroupSettings: { channelControls: { selectedChannels: CANAUX } }, ...g,
    } } },
    ...criteres,
  ];

  it('la création de groupe conforme passe, pour chaque préréglage', () => {
    expect(() => verifierCreationGroupeDG(groupe(), ZONES)).not.toThrow();
    expect(() => verifierCreationGroupeDG(groupe({}, [lieu('9100002'), LANGUE, lieu('9100001')]), ZONES)).not.toThrow();
  });

  it('et toute dérive de groupe est refusée', () => {
    const derives: [string, Operation[]][] = [
      ['Display ouvert', groupe({ demandGenAdGroupSettings: { channelControls: { selectedChannels: { ...CANAUX, display: true } } } })],
      ['Maps ouvert', groupe({ demandGenAdGroupSettings: { channelControls: { selectedChannels: { ...CANAUX, maps: true } } } })],
      ['Gmail coupé', groupe({ demandGenAdGroupSettings: { channelControls: { selectedChannels: { ...CANAUX, gmail: false } } } })],
      ['canaux absents', groupe({ demandGenAdGroupSettings: {} })],
      ['stratégie de canaux', groupe({ demandGenAdGroupSettings: { channelControls: { channelStrategy: 'ALL_CHANNELS' } } })],
      ['groupe actif', groupe({ status: 'ENABLED' })],
      ['groupe non marqué', groupe({ name: 'G' })],
      ['lieu hors préréglage', groupe({}, [lieu('2250'), lieu('9100001'), LANGUE])],
      ['« locale » en partie', groupe({}, [lieu('9100001'), LANGUE])],
      ['sans lieu', groupe({}, [LANGUE])],
      ['sans langue', groupe({}, [lieu('2250')])],
      ['une autre langue', groupe({}, [lieu('2250'), { adGroupCriterionOperation: { create: { adGroup: tmpG, language: { languageConstant: 'languageConstants/1000' } } } }])],
      ['rayon', groupe({}, [lieu('2250'), LANGUE, { adGroupCriterionOperation: { create: { adGroup: tmpG, proximity: { radius: 30, radiusUnits: 'KILOMETERS' } } } }])],
      ['lieu exclu', groupe({}, [lieu('2250'), LANGUE, { adGroupCriterionOperation: { create: { adGroup: tmpG, negative: true, location: { geoTargetConstant: 'geoTargetConstants/2250' } } } }])],
      ['critère d’un autre groupe', groupe({}, [{ adGroupCriterionOperation: { create: { adGroup: `customers/${COMPTE}/adGroups/888`, location: { geoTargetConstant: 'geoTargetConstants/2250' } } } }, LANGUE])],
    ];
    for (const [quoi, operations] of derives) {
      expect(() => verifierCreationGroupeDG(operations, ZONES), quoi).toThrow(/table fermée/);
    }
    // « locale » vide ne vaut pas « aucun lieu ».
    expect(() => verifierCreationGroupeDG(groupe({}, [LANGUE]), { ...ZONES, locale: [] })).toThrow(/table fermée/);
  });

  const multi = (m: Record<string, unknown> = {}) => ({
    businessName: 'Luminose', headlines: [{ text: 'Séance' }], descriptions: [{ text: 'Un temps pour soi.' }],
    marketingImages: [{ asset: `customers/${COMPTE}/assets/101` }], logoImages: [{ asset: `customers/${COMPTE}/assets/105` }], ...m,
  });
  const annonce = (a: Record<string, unknown> = {}, ad: Record<string, unknown> = {}, m: Record<string, unknown> = {}): Operation => ({ create: {
    adGroup: `customers/${COMPTE}/adGroups/888`, status: 'PAUSED',
    ad: { finalUrls: ['https://luminose.fr/'], demandGenMultiAssetAd: multi(m), ...ad },
    adGroupAdAssetAutomationSettings: coupes(AUTOMATISMES_ANNONCE), ...a,
  } });

  it('l’annonce conforme passe', () => {
    expect(() => verifierOperation('adGroupAds', annonce())).not.toThrow();
    expect(() => verifierOperation('adGroupAds', annonce({}, { name: 'Essai' }, { callToActionText: 'Learn more' }))).not.toThrow();
  });

  it('et toute dérive d’annonce est refusée', () => {
    const derives: [string, Operation][] = [
      ['active', annonce({ status: 'ENABLED' })],
      ['automatismes absents', annonce({ adGroupAdAssetAutomationSettings: [] })],
      ['un automatisme ouvert', annonce({ adGroupAdAssetAutomationSettings: [...coupes(AUTOMATISMES_ANNONCE.slice(1)), { assetAutomationType: AUTOMATISMES_ANNONCE[0], assetAutomationStatus: 'OPTED_IN' }] })],
      ['autre nom d’entreprise', annonce({}, {}, { businessName: 'Autre' })],
      ['bouton libre', annonce({}, {}, { callToActionText: 'Faites-le' })],
      ['image Display classique', annonce({}, {}, { classicDisplayImages: [{ asset: `customers/${COMPTE}/assets/101` }] })],
      ['image par URL', annonce({}, {}, { marketingImages: [{ asset: 'https://evil.example/x.png' }] })],
      ['sans logo', annonce({}, {}, { logoImages: [] })],
      ['six logos', annonce({}, {}, { logoImages: Array(6).fill({ asset: `customers/${COMPTE}/assets/105` }) })],
      ['ni paysage ni carrée', annonce({}, {}, { marketingImages: undefined, portraitMarketingImages: [{ asset: `customers/${COMPTE}/assets/103` }] })],
      ['vingt et une images', annonce({}, {}, { marketingImages: Array(21).fill({ asset: `customers/${COMPTE}/assets/101` }) })],
      ['titre trop long', annonce({}, {}, { headlines: [{ text: 'x'.repeat(31) }] })],
      ['six titres', annonce({}, {}, { headlines: Array(6).fill({ text: 'Séance' }) })],
      ['description trop longue', annonce({}, {}, { descriptions: [{ text: 'x'.repeat(91) }] })],
      ['insertion de mot-clé', annonce({}, {}, { headlines: [{ text: '{KeyWord:Séance}' }] })],
      ['terme refusé (V4)', annonce({}, {}, { descriptions: [{ text: 'Guérir de l’anxiété.' }] })],
      ['URL hors de luminose.fr (V6)', annonce({}, { finalUrls: ['https://evil.example/'] })],
      ['deux URL', annonce({}, { finalUrls: ['https://luminose.fr/', 'https://luminose.fr/a'] })],
      ['champ d’annonce en plus', annonce({}, { trackingUrlTemplate: 'https://evil.example/?u={lpurl}' })],
      ['vidéo', annonce({}, { demandGenMultiAssetAd: undefined, demandGenVideoResponsiveAd: {} })],
      ['groupe temporaire', annonce({ adGroup: `customers/${COMPTE}/adGroups/-1` })],
    ];
    for (const [quoi, operation] of derives) {
      const propre = JSON.parse(JSON.stringify(operation));
      expect(() => verifierOperation('adGroupAds', propre), quoi).toThrow(/table fermée/);
    }
  });

  it('aucune création Demand Gen, quelle que soit l’entrée, n’envoie ENABLED ni remove', async () => {
    const env = creerEnv();
    const appels = simulerCompte({ libelle: false });
    for (const [outil, args] of [
      ['ads_dg_campagne_creer', CAMPAGNE], ['ads_dg_campagne_creer', { ...CAMPAGNE, encheres: { strategie: 'CONVERSIONS' } }],
      ['ads_dg_campagne_creer', { ...CAMPAGNE, encheres: { strategie: 'CLICS' } }],
      ['ads_dg_groupe_creer', GROUPE], ['ads_dg_groupe_creer', { ...GROUPE, nom: 'ENABLED', zone: 'locale' }],
      ['ads_dg_annonce_creer', { ...ANNONCE, titres: ['ENABLED'] }],
    ] as const) {
      const { execution } = await apercuPuisExecution(env, outil, args);
      expect(texteDe(execution), outil).toMatch(/^FAIT/);
    }
    const corps = appels.filter((a) => a.url.endsWith(':mutate')).map((a) => a.corps);
    expect(corps.length).toBeGreaterThan(0);
    expect(corps.filter((c) => /"status":"ENABLED"|"remove"/.test(c))).toEqual([]);
    const permis = new RegExp(`^https://googleads\\.googleapis\\.com/${VERSION_API}/customers/${COMPTE}/` +
      '(googleAds:(search|mutate)|(adGroupAds|labels|adGroupAdLabels):mutate)$');
    expect(appels.map((a) => a.url).filter((u) => u.startsWith('https://googleads') && !permis.test(u))).toEqual([]);
  });
});
