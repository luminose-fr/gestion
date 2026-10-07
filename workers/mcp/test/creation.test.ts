/**
 * Créer, en pause et marqué — lot 2 du cadrage du 02/10/2026
 * (workers/mcp/decisions/2026-10-02-creer-des-campagnes.md).
 *
 * Comme pour le lot 1, chaque test NORMATIF regarde ce qui part réellement chez
 * Google — les corps des `:mutate` — et non ce que l'outil annonce.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { VERSION_API, verifierCreationCampagne, verifierOperation, type Operation } from '../src/google-ads';
import { COMPTE, LIRE_ECRIRE, appelerOutil, creerEnv, simulerFetch, texteDe as texteBrut, type Appel, type EnvFactice } from './aides';

/** Les montants s'écrivent « 10,00 € » avec une espace fine insécable : on la lit comme une espace. */
const texteDe = (corps: unknown) => texteBrut(corps).replace(/[\u00a0\u202f]/g, ' ');

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

// ── Un compte de comptoir ────────────────────────────────────────────────

const CRITERES_MODELE = [
  { campaignCriterion: { type: 'LANGUAGE', negative: false, language: { languageConstant: 'languageConstants/1002' } } },
  { campaignCriterion: { type: 'PROXIMITY', negative: false, proximity: {
    radius: 30, radiusUnits: 'KILOMETERS',
    geoPoint: { latitudeInMicroDegrees: 45764043, longitudeInMicroDegrees: 4835659 },
    address: { cityName: 'Lyon', countryCode: 'FR' },
  } } },
  { campaignCriterion: { type: 'LOCATION', negative: true, location: { geoTargetConstant: 'geoTargetConstants/9040834' } } },
];

/** Un budget quotidien (`euros`), ou total (`total`, sur les dates de la campagne — DG1, 07/10/2026). */
type Budget = { nom: string; statut: string; ressource: string; euros?: number; total?: number; debut?: string; fin?: string };
const BUDGETS_ORDINAIRES: Budget[] = [
  { nom: 'Troubles anxieux', statut: 'ENABLED', ressource: 'b1', euros: 5 },
  { nom: 'Alimentation et corps', statut: 'ENABLED', ressource: 'b2', euros: 5 },
  { nom: 'Ancienne', statut: 'PAUSED', ressource: 'b3', euros: 7 },
];

type Monde = { budgets?: Budget[]; libelle?: boolean; criteres?: unknown[]; refusLibelle?: boolean; reglement?: boolean };

/**
 * Le règlement de Google, tel que l'API REST le rend : santé et tabac arrêtés
 * mais exemptables, un produit dangereux sans exception possible. Une
 * opération qui porte la clé d'exception de sa règle passe.
 */
const REGLES = [
  { motif: /hypno/, policyName: 'HEALTH_IN_PERSONALIZED_ADS', nom: 'Healthcare and medicines', exemptable: true },
  { motif: /tabac|fumer/, policyName: 'TOBACCO', nom: 'Tobacco', exemptable: true },
  { motif: /cocaine/, policyName: 'DANGEROUS_PRODUCTS', nom: 'Dangerous products', exemptable: false },
];
const erreurReglement = (operations: Record<string, any>[]) => {
  const errors = operations.flatMap((o, index) => {
    const texte: string = o.create.keyword.text;
    const exemptees = (o.exemptPolicyViolationKeys ?? []).map((k: { policyName: string }) => k.policyName);
    return REGLES.filter((r) => r.motif.test(texte) && !(r.exemptable && exemptees.includes(r.policyName))).map((r) => ({
      errorCode: { policyViolationError: 'POLICY_ERROR' },
      message: 'A policy was violated. See PolicyViolationDetails for more detail.',
      trigger: { stringValue: texte },
      location: { fieldPathElements: [{ fieldName: 'operations', index }, { fieldName: 'create' }, { fieldName: 'keyword' }, { fieldName: 'text' }] },
      details: { policyViolationDetails: {
        externalPolicyName: r.nom, externalPolicyDescription: `Règle ${r.nom}`,
        key: { policyName: r.policyName, violatingText: texte }, isExemptible: r.exemptable,
      } },
    }));
  });
  return errors.length === 0 ? undefined : Response.json({ error: {
    code: 400, message: 'Request contains an invalid argument.', status: 'INVALID_ARGUMENT',
    details: [{ '@type': `type.googleapis.com/google.ads.googleads.${VERSION_API}.errors.GoogleAdsFailure`, errors, requestId: 'req-regles' }],
  } }, { status: 400 });
};

const reponse = (results: unknown[]) => Response.json({ results });

const simulerCompte = (monde: Monde = {}) => simulerFetch(({ url, corps }) => {
  if (url.endsWith(':search')) {
    const q: string = JSON.parse(corps).query;
    let m: RegExpExecArray | null;
    if (/FROM campaign WHERE campaign\.status IN/.test(q)) {
      return reponse((monde.budgets ?? BUDGETS_ORDINAIRES).map((b) => ({
        campaign: {
          name: b.nom, status: b.statut,
          ...(b.debut ? { startDateTime: `${b.debut} 00:00:00` } : {}), ...(b.fin ? { endDateTime: `${b.fin} 23:59:59` } : {}),
        },
        campaignBudget: b.total === undefined
          ? { resourceName: `customers/${COMPTE}/campaignBudgets/${b.ressource}`, period: 'DAILY', amountMicros: String((b.euros ?? 0) * 1_000_000) }
          : { resourceName: `customers/${COMPTE}/campaignBudgets/${b.ressource}`, period: 'CUSTOM_PERIOD', totalAmountMicros: String(b.total * 1_000_000) },
      })));
    }
    if ((m = /FROM campaign WHERE campaign\.id = (\d+)/.exec(q))) {
      if (m[1] === '111') {
        return reponse([{ campaign: {
          name: 'Troubles anxieux', status: 'ENABLED', advertisingChannelType: 'SEARCH',
          geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE', negativeGeoTargetType: 'PRESENCE' },
        } }]);
      }
      if (m[1] === '222') return reponse([{ campaign: { name: 'PMax', status: 'PAUSED', advertisingChannelType: 'PERFORMANCE_MAX' } }]);
      return reponse([]);
    }
    if (/FROM campaign_criterion WHERE campaign\.id = 111/.test(q)) return reponse(monde.criteres ?? CRITERES_MODELE);
    if (/FROM label WHERE label\.name = '\[Claude\]'/.test(q)) {
      return reponse(monde.libelle ? [{ label: { resourceName: `customers/${COMPTE}/labels/42` } }] : []);
    }
    if (/FROM ad_group WHERE ad_group\.id = 444$/.test(q)) {
      return reponse([{ adGroup: { name: 'Groupe A', status: 'ENABLED', type: 'SEARCH_STANDARD' }, campaign: { name: 'Troubles anxieux', advertisingChannelType: 'SEARCH' } }]);
    }
    return reponse([]);
  }
  if (url.endsWith(':mutate')) {
    const c = JSON.parse(corps);
    const service = url.slice(url.lastIndexOf('/') + 1).replace(':mutate', '');
    if (monde.reglement && service === 'adGroupCriteria') {
      const refus = erreurReglement(c.operations);
      if (refus) return refus;
    }
    if (c.validateOnly) return Response.json({});
    if (service === 'googleAds') {
      return Response.json({ mutateOperationResponses: c.mutateOperations.map((o: Record<string, unknown>, i: number) => ({
        [Object.keys(o)[0].replace('Operation', 'Result')]: { resourceName: `customers/${COMPTE}/x/${7000 + i}` },
      })) });
    }
    if (monde.refusLibelle && service.endsWith('Labels')) {
      return Response.json({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'label refusé' } }, { status: 400 });
    }
    if (service === 'labels') return reponse([{ resourceName: `customers/${COMPTE}/labels/99` }]);
    return reponse(c.operations.map((_: unknown, i: number) => ({ resourceName: `customers/${COMPTE}/${service}/444~${8000 + i}` })));
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

const CAMPAGNE_CLICS = { nom: 'Psychopraticien - Prospects - Deuil', budget_jour: 8, encheres: { strategie: 'CLICS', cpc_max: 1.5 } };
const CAMPAGNE_CONVERSIONS = { nom: 'Psychopraticien - Prospects - Sommeil', budget_jour: 6, encheres: { strategie: 'CONVERSIONS', ai_max: true } };
const ANNONCE = {
  groupe: '444',
  titres: ['Psychopraticien à Lyon', 'Séance individuelle', 'Prendre rendez-vous'],
  descriptions: ['Un espace pour déposer ce qui pèse.', 'Première séance : un temps pour se rencontrer.'],
  chemin1: 'seances',
  url_finale: 'https://luminose.fr/seances/',
};
const MOTS_CLES = { groupe: '444', mots_cles: [{ texte: 'psychopraticien lyon', correspondance: 'PHRASE' }, { texte: 'Thérapie Deuil', correspondance: 'EXACT' }] };

// ── La campagne ──────────────────────────────────────────────────────────

describe('ads_campagne_creer — R1 à R7', () => {
  it('NORMATIF — budget, campagne et ciblage partent en une requête atomique, en pause et marqués', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    const { apercu, execution } = await apercuPuisExecution(env, 'ads_campagne_creer', CAMPAGNE_CLICS);

    expect(texteDe(apercu)).toMatch(/^APERÇU/);
    expect(texteDe(apercu)).toMatch(/Campagne Search « \[Claude\] Psychopraticien - Prospects - Deuil », EN PAUSE/);
    expect(texteDe(apercu)).toMatch(/Ciblage recopié de « Troubles anxieux » \(111\) : 1 langue, rayon de 30 km autour de Lyon, 1 exclusion, ciblage par présence réelle/);
    expect(texteDe(execution)).toMatch(/^FAIT/);

    const [vue, faite] = mutations(appels);
    expect(vue.service).toBe('googleAds');
    expect(faite.operations).toEqual(vue.operations);
    const [budget, campagne, ...criteres] = faite.operations;

    expect(budget.campaignBudgetOperation.create).toEqual({
      resourceName: `customers/${COMPTE}/campaignBudgets/-1`,
      name: '[Claude] Psychopraticien - Prospects - Deuil',
      amountMicros: '8000000',
      deliveryMethod: 'STANDARD',
      explicitlyShared: false,
    });
    const c = campagne.campaignOperation.create;
    expect(c).toMatchObject({
      name: '[Claude] Psychopraticien - Prospects - Deuil',
      status: 'PAUSED',
      advertisingChannelType: 'SEARCH',
      campaignBudget: `customers/${COMPTE}/campaignBudgets/-1`,
      networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false, targetPartnerSearchNetwork: false },
      containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
      targetSpend: { cpcBidCeilingMicros: '1500000' },
    });
    expect(c.aiMaxSetting).toBeUndefined();
    expect(criteres).toHaveLength(3);
  });

  it('NORMATIF — le ciblage envoyé est la copie exacte de la campagne modèle', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    await appelerOutil(env, 'ads_campagne_creer', CAMPAGNE_CLICS, LIRE_ECRIRE);
    const [{ operations }] = mutations(appels);
    const tmp = `customers/${COMPTE}/campaigns/-2`;

    expect(operations[1].campaignOperation.create.geoTargetTypeSetting).toEqual({ positiveGeoTargetType: 'PRESENCE', negativeGeoTargetType: 'PRESENCE' });
    expect(operations.slice(2).map((o) => o.campaignCriterionOperation.create)).toEqual([
      { campaign: tmp, language: { languageConstant: 'languageConstants/1002' } },
      { campaign: tmp, proximity: CRITERES_MODELE[1].campaignCriterion.proximity },
      { campaign: tmp, location: { geoTargetConstant: 'geoTargetConstants/9040834' }, negative: true },
    ]);
  });

  it('NORMATIF — rien du ciblage, du réseau ni du statut ne s’accepte en entrée', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    for (const intrus of [{ langue: 'en' }, { zone: 'France' }, { reseau: 'DISPLAY' }, { status: 'ENABLED' }, { audience: 'x' }]) {
      const { corps } = await appelerOutil(env, 'ads_campagne_creer', { ...CAMPAGNE_CLICS, ...intrus }, LIRE_ECRIRE);
      expect(texteDe(corps), JSON.stringify(intrus)).toMatch(/Unrecognized key/);
    }
    expect(appels).toEqual([]);
  });

  it('NORMATIF — personnalisation du texte et extension d’URL toujours coupées ; AI Max seulement en « Maximiser les conversions »', async () => {
    for (const [args, attendu] of [
      [CAMPAGNE_CLICS, undefined],
      [CAMPAGNE_CONVERSIONS, { enableAiMax: true }],
      [{ ...CAMPAGNE_CONVERSIONS, encheres: { strategie: 'CONVERSIONS', ai_max: false } }, { enableAiMax: false }],
    ] as const) {
      const env = creerEnv();
      const appels = simulerCompte();
      await appelerOutil(env, 'ads_campagne_creer', args, LIRE_ECRIRE);
      const c = mutations(appels)[0].operations[1].campaignOperation.create;
      expect(c.assetAutomationSettings).toEqual([
        { assetAutomationType: 'TEXT_ASSET_AUTOMATION', assetAutomationStatus: 'OPTED_OUT' },
        { assetAutomationType: 'FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION', assetAutomationStatus: 'OPTED_OUT' },
      ]);
      expect(c.aiMaxSetting).toEqual(attendu);
      if (attendu) expect(c.maximizeConversions).toEqual({});
    }
    // L'outil n'a aucun moyen d'activer AI Max en « Maximiser les clics » : le champ n'existe pas.
    const env = creerEnv();
    const appels = simulerCompte();
    const { corps } = await appelerOutil(env, 'ads_campagne_creer', { ...CAMPAGNE_CLICS, encheres: { strategie: 'CLICS', cpc_max: 1, ai_max: true } }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/Arguments invalides/);
    expect(mutations(appels)).toEqual([]);
  });

  it('NORMATIF — un budget au-dessus de ADS_BUDGET_MAX_JOUR est refusé', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    const { corps } = await appelerOutil(env, 'ads_campagne_creer', { ...CAMPAGNE_CLICS, budget_jour: 10.01 }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/au-delà du plafond de 10,00 € \(ADS_BUDGET_MAX_JOUR\)/);
    expect(mutations(appels)).toEqual([]);
  });

  it('NORMATIF — un CPC max au-dessus de ADS_CPC_MAX est refusé', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    const { corps } = await appelerOutil(env, 'ads_campagne_creer', { ...CAMPAGNE_CLICS, encheres: { strategie: 'CLICS', cpc_max: 2.5 } }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/au plus 2,00 € \(ADS_CPC_MAX\)/);
    expect(mutations(appels)).toEqual([]);
  });

  it('NORMATIF — un engagement au-dessus de ADS_BUDGET_MAX_TOTAL est refusé : actives + « [Claude] » en pause, nouvelle comprise', async () => {
    const budgets: Budget[] = [
      ...BUDGETS_ORDINAIRES,
      { nom: '[Claude] En attente', statut: 'PAUSED', ressource: 'b4', euros: 9 },
      // Partagé par deux campagnes actives : compté une fois.
      { nom: 'Partagée 1', statut: 'ENABLED', ressource: 'b5', euros: 1 },
      { nom: 'Partagée 2', statut: 'ENABLED', ressource: 'b5', euros: 1 },
    ];
    // Engagement : 5 + 5 + 9 + 1 = 20 € ; « Ancienne », en pause sans la marque, ne compte pas.
    const env = creerEnv();
    const appels = simulerCompte({ budgets });
    const refus = await appelerOutil(env, 'ads_campagne_creer', { ...CAMPAGNE_CLICS, budget_jour: 5.01 }, LIRE_ECRIRE);
    expect(texteDe(refus.corps)).toMatch(/Engagement dépassé : 20,00 € par jour déjà actifs ou en attente de validation, plus 5,01 €, au-delà de 25,00 €/);
    expect(mutations(appels)).toEqual([]);

    const juste = await appelerOutil(env, 'ads_campagne_creer', { ...CAMPAGNE_CLICS, budget_jour: 5 }, LIRE_ECRIRE);
    expect(texteDe(juste.corps)).toMatch(/Engagement après création : 25,00 € par jour sur 25,00 €/);
  });

  it('NORMATIF — un budget total compte dans l’engagement pour son équivalent quotidien, plus rien une fois sa fin passée (DG1)', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-07T10:00:00Z').getTime() });
    const budgets: Budget[] = [
      ...BUDGETS_ORDINAIRES,
      // 300 € sur 30 jours : 10 € par jour. Lu comme un budget quotidien, il aurait compté pour zéro.
      { nom: '[Claude] Budget total', statut: 'PAUSED', ressource: 'b6', total: 300, debut: '2026-10-10', fin: '2026-11-08' },
      // Terminée : elle ne dépense plus.
      { nom: 'Terminée', statut: 'ENABLED', ressource: 'b7', total: 500, debut: '2026-09-01', fin: '2026-09-30' },
    ];
    const env = creerEnv();
    const appels = simulerCompte({ budgets });
    const refus = await appelerOutil(env, 'ads_campagne_creer', { ...CAMPAGNE_CLICS, budget_jour: 5.01 }, LIRE_ECRIRE);
    expect(texteDe(refus.corps)).toMatch(/Engagement dépassé : 20,00 € par jour déjà actifs ou en attente de validation, plus 5,01 €, au-delà de 25,00 €/);
    expect(mutations(appels)).toEqual([]);
    const juste = await appelerOutil(env, 'ads_campagne_creer', { ...CAMPAGNE_CLICS, budget_jour: 5 }, LIRE_ECRIRE);
    expect(texteDe(juste.corps)).toMatch(/Engagement après création : 25,00 € par jour sur 25,00 €/);
  });

  it('marque le nom une fois, même si le modèle l’a déjà mise', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    await appelerOutil(env, 'ads_campagne_creer', { ...CAMPAGNE_CLICS, nom: '[Claude] [claude]  Deuil' }, LIRE_ECRIRE);
    expect(mutations(appels)[0].operations[1].campaignOperation.create.name).toBe('[Claude] Deuil');
  });

  it('ferme la création quand un plafond ou la campagne modèle manque', async () => {
    for (const manque of ['ADS_BUDGET_MAX_JOUR', 'ADS_BUDGET_MAX_TOTAL', 'ADS_CPC_MAX', 'ADS_CAMPAGNE_MODELE'] as const) {
      const env = creerEnv({ [manque]: undefined });
      const appels = simulerCompte();
      const { corps } = await appelerOutil(env, 'ads_campagne_creer', CAMPAGNE_CLICS, LIRE_ECRIRE);
      expect(texteDe(corps), manque).toMatch(new RegExp(`${manque} absent ou illisible`));
      expect(mutations(appels)).toEqual([]);
    }
  });

  it('refuse un modèle sans zone : la campagne diffuserait partout', async () => {
    const env = creerEnv();
    const appels = simulerCompte({ criteres: [CRITERES_MODELE[0], CRITERES_MODELE[2]] });
    const { corps } = await appelerOutil(env, 'ads_campagne_creer', CAMPAGNE_CLICS, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/n'a pas de langue ou pas de zone/);
    expect(mutations(appels)).toEqual([]);
  });
});

// ── Groupe, annonce, mots-clés ───────────────────────────────────────────

describe('ads_groupe_creer, ads_annonce_creer, ads_mots_cles_ajouter', () => {
  it('NORMATIF — toute création part en pause et porte sa marque : préfixe, ou libellé posé après', async () => {
    const env = creerEnv();
    const appels = simulerCompte({ libelle: true });
    await apercuPuisExecution(env, 'ads_groupe_creer', { campagne: '111', nom: 'Deuil' });
    const annonce = await apercuPuisExecution(env, 'ads_annonce_creer', ANNONCE);
    const mots = await apercuPuisExecution(env, 'ads_mots_cles_ajouter', MOTS_CLES);

    const faites = executions(appels);
    const [groupe, ad, lienAnnonce, criteres, liensMots] = faites;
    expect(groupe.operations).toEqual([{ create: { campaign: `customers/${COMPTE}/campaigns/111`, name: '[Claude] Deuil', status: 'PAUSED', type: 'SEARCH_STANDARD' } }]);
    expect(ad.service).toBe('adGroupAds');
    expect(ad.operations[0].create.status).toBe('PAUSED');
    expect(lienAnnonce).toEqual({ service: 'adGroupAdLabels', validateOnly: false, operations: [
      { create: { adGroupAd: `customers/${COMPTE}/adGroupAds/444~8000`, label: `customers/${COMPTE}/labels/42` } },
    ] });
    expect(criteres.operations.map((o) => o.create)).toEqual([
      { adGroup: `customers/${COMPTE}/adGroups/444`, status: 'PAUSED', keyword: { text: 'psychopraticien lyon', matchType: 'PHRASE' } },
      { adGroup: `customers/${COMPTE}/adGroups/444`, status: 'PAUSED', keyword: { text: 'thérapie deuil', matchType: 'EXACT' } },
    ]);
    expect(liensMots.service).toBe('adGroupCriterionLabels');
    expect(liensMots.operations).toHaveLength(2);
    expect(texteDe(annonce.execution)).toMatch(/Libellé \[Claude\] posé/);
    expect(texteDe(mots.execution)).toMatch(/Libellé \[Claude\] posé/);

    // Le libellé existait : il n'est pas recréé.
    expect(faites.some((m) => m.service === 'labels')).toBe(false);
  });

  it('crée le libellé [Claude] quand le compte ne l’a pas encore', async () => {
    const env = creerEnv();
    const appels = simulerCompte({ libelle: false });
    await apercuPuisExecution(env, 'ads_mots_cles_ajouter', MOTS_CLES);
    const faites = executions(appels);
    expect(faites.find((m) => m.service === 'labels')?.operations).toEqual([{ create: { name: '[Claude]' } }]);
    expect(faites.find((m) => m.service === 'adGroupCriterionLabels')?.operations[0].create.label).toBe(`customers/${COMPTE}/labels/99`);
  });

  it('un libellé qui ne se pose pas ne défait rien, mais se dit — et se journalise', async () => {
    const env = creerEnv();
    simulerCompte({ libelle: true, refusLibelle: true });
    const { execution } = await apercuPuisExecution(env, 'ads_mots_cles_ajouter', MOTS_CLES);
    expect(texteDe(execution)).toMatch(/^FAIT/);
    expect(texteDe(execution)).toMatch(/ATTENTION — libellé \[Claude\] NON posé .*en pause ; à marquer à la main/);
    const [ligne] = env.DB.lignes();
    expect(ligne.issue).toBe('ok');
    expect(ligne.erreur).toMatch(/libellé \[Claude\] NON posé/);
  });

  it('refuse un groupe hors Search', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    const { corps } = await appelerOutil(env, 'ads_groupe_creer', { campagne: '222', nom: 'x' }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/n'est pas une campagne Search/);
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

describe('NORMATIF — V4 : chaque terme de refus fait échouer un texte d’annonce, aucun un mot-clé', () => {
  it('dans un titre, une description ou un chemin', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    for (const [texte, attendu] of INTERDITS) {
      for (const variante of [
        { ...ANNONCE, titres: [texte.slice(0, 30), ...ANNONCE.titres.slice(1)] },
        { ...ANNONCE, descriptions: [texte, ANNONCE.descriptions[1]] },
      ]) {
        const { corps } = await appelerOutil(env, 'ads_annonce_creer', variante, LIRE_ECRIRE);
        expect(corps.result.isError, texte).toBe(true);
        expect(texteDe(corps), texte).toMatch(attendu);
        expect(texteDe(corps)).toMatch(/aucune promesse de guérison/);
      }
    }
    const chemin = await appelerOutil(env, 'ads_annonce_creer', { ...ANNONCE, chemin1: 'guerison' }, LIRE_ECRIRE);
    expect(chemin.corps.result.isError).toBe(true);
    // « remplace » ne refuse qu'avec médecin ou traitement, dans la même annonce.
    const combine = await appelerOutil(env, 'ads_annonce_creer',
      { ...ANNONCE, titres: ['Remplace votre suivi', ...ANNONCE.titres.slice(1)], descriptions: ['Mieux qu’un médecin.', ANNONCE.descriptions[1]] }, LIRE_ECRIRE);
    expect(texteDe(combine.corps)).toMatch(/remplace \+ médecin ou traitement/);
    const seul = await appelerOutil(env, 'ads_annonce_creer', { ...ANNONCE, titres: ['Remplace la routine', ...ANNONCE.titres.slice(1)] }, LIRE_ECRIRE);
    expect(seul.corps.result.isError).toBeUndefined();

    // Aucun texte refusé n'est parti chez Google, pas même en aperçu : seule l'annonce acceptable.
    const envoyees = mutations(appels).filter((m) => m.service === 'adGroupAds');
    expect(envoyees).toHaveLength(1);
    expect(JSON.stringify(envoyees[0].operations)).toMatch(/Remplace la routine/);
  });

  it('les mêmes termes passent dans des mots-clés : on enchérit sur ce que les gens tapent', async () => {
    const env = creerEnv();
    const appels = simulerCompte({ libelle: true });
    const { corps } = await appelerOutil(env, 'ads_mots_cles_ajouter', {
      groupe: '444',
      mots_cles: ['guérir anxiété', 'soigner stress', 'résultat garanti', 'diagnostic anxiété', 'traitement médical anxiété'].map((texte) => ({ texte, correspondance: 'PHRASE' })),
    }, LIRE_ECRIRE);
    expect(corps.result.isError).toBeUndefined();
    expect(mutations(appels).find((m) => m.service === 'adGroupCriteria')?.operations).toHaveLength(5);
  });

  it('les avertissements passent, et l’aperçu les dit', async () => {
    const env = creerEnv();
    simulerCompte();
    const { corps } = await appelerOutil(env, 'ads_annonce_creer', {
      ...ANNONCE,
      titres: ['Florent, hypnothérapeute', 'Le Seuil, parcours', 'Breathwork à Lyon'],
      descriptions: ['Un atelier pour respirer.', 'Séances individuelles.'],
    }, LIRE_ECRIRE);
    const t = texteDe(corps);
    expect(t).toMatch(/^APERÇU/);
    expect(t).toMatch(/AVERTISSEMENTS — à relire avant de valider/);
    expect(t).toMatch(/hypnothérapeute/);
    expect(t).toMatch(/Le Seuil » : offre suspendue/);
    expect(t).toMatch(/atelier » : offre terminée/);
    expect(t).toMatch(/breathwork sans mention du questionnaire/);

    const avecQuestionnaire = await appelerOutil(env, 'ads_annonce_creer', {
      ...ANNONCE, titres: ['Breathwork à Lyon', ...ANNONCE.titres.slice(1)], descriptions: ['Questionnaire de santé préalable.', ANNONCE.descriptions[1]],
    }, LIRE_ECRIRE);
    expect(texteDe(avecQuestionnaire.corps)).not.toMatch(/AVERTISSEMENTS/);
  });
});

describe('NORMATIF — V6 : une URL finale hors de luminose.fr, ou sur un sous-domaine, est refusée', () => {
  it('refuse', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    for (const url of [
      'http://luminose.fr/', 'https://passage.luminose.fr/', 'https://reliance.luminose.fr/offre',
      'https://luminose.fr.evil.example/', 'https://evil.example/?u=https://luminose.fr/', 'https://user@luminose.fr/',
      'https://luminose.fr:8443/', 'https://luminose.fr', 'luminose.fr/seances', 'javascript:alert(1)',
    ]) {
      const { corps } = await appelerOutil(env, 'ads_annonce_creer', { ...ANNONCE, url_finale: url }, LIRE_ECRIRE);
      expect(texteDe(corps), url).toMatch(/URL finale refusée/);
    }
    expect(mutations(appels)).toEqual([]);
  });

  it('accepte luminose.fr et www.luminose.fr', async () => {
    const env = creerEnv();
    simulerCompte();
    for (const url of ['https://luminose.fr/', 'https://www.luminose.fr/seances?source=ads']) {
      const { corps } = await appelerOutil(env, 'ads_annonce_creer', { ...ANNONCE, url_finale: url }, LIRE_ECRIRE);
      expect(texteDe(corps), url).toMatch(/^APERÇU/);
    }
  });
});

// ── La table fermée, revérifiée indépendamment des outils ────────────────

describe('NORMATIF — la table fermée revérifie tout, même construit par le code', () => {
  const LIMITES = { budgetMaxJour: 10_000_000, budgetMaxTotal: 25_000_000, cpcMax: 2_000_000 };
  const tmpB = `customers/${COMPTE}/campaignBudgets/-1`;
  const tmpC = `customers/${COMPTE}/campaigns/-2`;
  const creation = (budget: Record<string, unknown> = {}, campagne: Record<string, unknown> = {}, criteres?: Record<string, unknown>[]): Operation[] => [
    { campaignBudgetOperation: { create: { resourceName: tmpB, name: '[Claude] X', amountMicros: '5000000', deliveryMethod: 'STANDARD', explicitlyShared: false, ...budget } } },
    { campaignOperation: { create: {
      resourceName: tmpC, name: '[Claude] X', status: 'PAUSED', advertisingChannelType: 'SEARCH', campaignBudget: tmpB,
      networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false, targetPartnerSearchNetwork: false },
      geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE' },
      containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
      targetSpend: { cpcBidCeilingMicros: '1000000' },
      assetAutomationSettings: [
        { assetAutomationType: 'TEXT_ASSET_AUTOMATION', assetAutomationStatus: 'OPTED_OUT' },
        { assetAutomationType: 'FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION', assetAutomationStatus: 'OPTED_OUT' },
      ],
      ...campagne,
    } } },
    ...(criteres ?? [
      { campaign: tmpC, language: { languageConstant: 'languageConstants/1002' } },
      { campaign: tmpC, proximity: { radius: 30, radiusUnits: 'KILOMETERS' } },
    ]).map((create) => ({ campaignCriterionOperation: { create } })),
  ];

  it('la création de campagne conforme passe', () => {
    expect(() => verifierCreationCampagne(creation(), LIMITES)).not.toThrow();
  });

  it('et toute dérive est refusée', () => {
    const derives: [string, Operation[]][] = [
      ['budget au-delà du plafond', creation({ amountMicros: '10010000' })],
      ['budget partagé', creation({ explicitlyShared: true })],
      ['budget sans marque', creation({ name: 'X' })],
      ['campagne active', creation({}, { status: 'ENABLED' })],
      ['campagne sans marque', creation({}, { name: 'X' })],
      ['Performance Max', creation({}, { advertisingChannelType: 'PERFORMANCE_MAX' })],
      ['partenaires', creation({}, { networkSettings: { targetGoogleSearch: true, targetSearchNetwork: true, targetContentNetwork: false, targetPartnerSearchNetwork: false } })],
      ['Display', creation({}, { networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: true, targetPartnerSearchNetwork: false } })],
      ['CPC au-delà du plafond', creation({}, { targetSpend: { cpcBidCeilingMicros: '2010000' } })],
      ['CPC absent', creation({}, { targetSpend: {} })],
      ['AI Max en clics', creation({}, { aiMaxSetting: { enableAiMax: true } })],
      ['texte généré', creation({}, { assetAutomationSettings: [
        { assetAutomationType: 'TEXT_ASSET_AUTOMATION', assetAutomationStatus: 'OPTED_IN' },
        { assetAutomationType: 'FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION', assetAutomationStatus: 'OPTED_OUT' },
      ] })],
      ['automatismes absents', creation({}, { assetAutomationSettings: [] })],
      ['champ en plus', creation({}, { startDateTime: '2026-10-03 00:00:00' })],
      ['sans zone', creation({}, {}, [{ campaign: tmpC, language: { languageConstant: 'languageConstants/1002' } }])],
      ['sans langue', creation({}, {}, [{ campaign: tmpC, proximity: { radius: 30, radiusUnits: 'KILOMETERS' } }])],
      ['zone seulement exclue', creation({}, {}, [
        { campaign: tmpC, language: { languageConstant: 'languageConstants/1002' } },
        { campaign: tmpC, location: { geoTargetConstant: 'geoTargetConstants/2250' }, negative: true },
      ])],
      ['audience', creation({}, {}, [
        { campaign: tmpC, language: { languageConstant: 'languageConstants/1002' } },
        { campaign: tmpC, proximity: { radius: 30, radiusUnits: 'KILOMETERS' } },
        { campaign: tmpC, userList: { userList: 'x' } },
      ])],
      ['critère d’une autre campagne', creation({}, {}, [
        { campaign: `customers/${COMPTE}/campaigns/111`, language: { languageConstant: 'languageConstants/1002' } },
        { campaign: tmpC, proximity: { radius: 30, radiusUnits: 'KILOMETERS' } },
      ])],
      ['opération en plus', [...creation(), { campaignOperation: { remove: `customers/${COMPTE}/campaigns/111` } }]],
      ['ordre inversé', [creation()[1], creation()[0], ...creation().slice(2)]],
    ];
    for (const [quoi, operations] of derives) {
      expect(() => verifierCreationCampagne(operations, LIMITES), quoi).toThrow(/table fermée/);
    }
  });

  it('groupes, annonces, mots-clés, libellés : seule la forme marquée et en pause passe', () => {
    const groupe = { campaign: `customers/${COMPTE}/campaigns/111`, name: '[Claude] G', status: 'PAUSED', type: 'SEARCH_STANDARD' };
    const ad = { finalUrls: ['https://luminose.fr/'], responsiveSearchAd: { headlines: [{ text: 'a' }, { text: 'b' }, { text: 'c' }], descriptions: [{ text: 'd' }, { text: 'e' }] } };
    const annonce = { adGroup: `customers/${COMPTE}/adGroups/444`, status: 'PAUSED', ad };
    const motCle = { adGroup: `customers/${COMPTE}/adGroups/444`, status: 'PAUSED', keyword: { text: 'x', matchType: 'EXACT' } };

    expect(() => verifierOperation('adGroups', { create: groupe })).not.toThrow();
    expect(() => verifierOperation('adGroupAds', { create: annonce })).not.toThrow();
    expect(() => verifierOperation('adGroupCriteria', { create: motCle })).not.toThrow();
    expect(() => verifierOperation('labels', { create: { name: '[Claude]' } })).not.toThrow();

    const refusees: [Parameters<typeof verifierOperation>[0], Operation][] = [
      ['adGroups', { create: { ...groupe, status: 'ENABLED' } }],
      ['adGroups', { create: { ...groupe, name: 'G' } }],
      ['adGroups', { create: { ...groupe, cpcBidMicros: '9000000' } }],
      ['adGroupAds', { create: { ...annonce, status: 'ENABLED' } }],
      ['adGroupAds', { create: { ...annonce, ad: { ...ad, finalUrls: ['https://passage.luminose.fr/'] } } }],
      ['adGroupAds', { create: { ...annonce, ad: { ...ad, responsiveSearchAd: { ...ad.responsiveSearchAd, headlines: [{ text: 'Guérir' }, { text: 'b' }, { text: 'c' }] } } } }],
      ['adGroupAds', { create: { ...annonce, ad: { ...ad, responsiveSearchAd: { ...ad.responsiveSearchAd, headlines: [{ text: 'a' }, { text: 'b' }] } } } }],
      ['adGroupCriteria', { create: { ...motCle, status: 'ENABLED' } }],
      ['adGroupCriteria', { create: { ...motCle, negative: true } }],
      ['labels', { create: { name: 'Autre' } }],
      ['adGroupAdLabels', { create: { adGroupAd: `customers/${COMPTE}/adGroupAds/444~1`, label: 'n’importe quoi' } }],
      ['adGroupAds', { remove: `customers/${COMPTE}/adGroupAds/444~1` }],
    ];
    for (const [service, operation] of refusees) {
      expect(() => verifierOperation(service, operation), `${service} ${JSON.stringify(operation)}`).toThrow(/table fermée/);
    }
  });

  it('aucune création, quelle que soit l’entrée, n’envoie ENABLED ni remove', async () => {
    const env = creerEnv();
    const appels = simulerCompte({ libelle: false });
    for (const [outil, args] of [
      ['ads_campagne_creer', CAMPAGNE_CLICS], ['ads_campagne_creer', CAMPAGNE_CONVERSIONS],
      ['ads_groupe_creer', { campagne: '111', nom: 'ENABLED' }], ['ads_annonce_creer', ANNONCE], ['ads_mots_cles_ajouter', MOTS_CLES],
    ] as const) {
      await apercuPuisExecution(env, outil, args);
    }
    const corps = appels.filter((a) => a.url.endsWith(':mutate')).map((a) => a.corps);
    expect(corps.length).toBeGreaterThan(0);
    expect(corps.filter((c) => /"status":"ENABLED"|"remove"/.test(c))).toEqual([]);
    const permis = new RegExp(`^https://googleads\\.googleapis\\.com/${VERSION_API}/customers/${COMPTE}/` +
      '(googleAds:(search|mutate)|(adGroups|adGroupAds|adGroupCriteria|labels|adGroupAdLabels|adGroupCriterionLabels):mutate)$');
    expect(appels.map((a) => a.url).filter((u) => u.startsWith('https://googleads') && !permis.test(u))).toEqual([]);
  });
});

// ── Le règlement de Google : les exceptions ──────────────────────────────

describe('ads_mots_cles_ajouter — exceptions de règlement', () => {
  const ARRETES = {
    groupe: '444',
    mots_cles: [
      { texte: 'hypnose anxiété', correspondance: 'PHRASE' },
      { texte: 'aide pour arrêter de fumer', correspondance: 'PHRASE' },
      { texte: 'psychopraticien lyon', correspondance: 'PHRASE' },
    ],
  };

  it('sans demande, l’outil nomme chaque mot-clé arrêté et sa règle — et ne demande rien', async () => {
    const env = creerEnv();
    const appels = simulerCompte({ libelle: true, reglement: true });
    const { corps } = await appelerOutil(env, 'ads_mots_cles_ajouter', ARRETES, LIRE_ECRIRE);

    expect(corps.result.isError).toBe(true);
    const t = texteDe(corps);
    expect(t).toMatch(/Google arrête 2 mot\(s\)-clé\(s\) pour une règle qui admet une exception — rien n'est parti/);
    expect(t).toMatch(/« aide pour arrêter de fumer » \[expression exacte\] — Tobacco \(TOBACCO\)/);
    expect(t).toMatch(/« hypnose anxiété » \[expression exacte\] — Healthcare and medicines \(HEALTH_IN_PERSONALIZED_ADS\)/);
    expect(t).toMatch(/demander_exceptions: true/);
    expect(executions(appels)).toEqual([]);
    expect(env.DB.lignes()).toEqual([]);
  });

  it('NORMATIF — sans demander_exceptions, aucune clé d’exception ne part, jamais', async () => {
    const env = creerEnv();
    const appels = simulerCompte({ libelle: true, reglement: true });
    await appelerOutil(env, 'ads_mots_cles_ajouter', ARRETES, LIRE_ECRIRE);
    await apercuPuisExecution(env, 'ads_mots_cles_ajouter', MOTS_CLES);
    expect(appels.filter((a) => /exemptPolicyViolationKeys/.test(a.corps))).toEqual([]);
  });

  it('avec demander_exceptions : l’aperçu liste chaque exception, et l’exécution les joint aux seuls mots-clés arrêtés', async () => {
    const env = creerEnv();
    const appels = simulerCompte({ libelle: true, reglement: true });
    const { apercu, execution } = await apercuPuisExecution(env, 'ads_mots_cles_ajouter', { ...ARRETES, demander_exceptions: true });

    const a = texteDe(apercu);
    expect(a).toMatch(/^APERÇU/);
    expect(a).toMatch(/EXCEPTIONS DE RÈGLEMENT DEMANDÉES À GOOGLE \(2\) — à valider/);
    expect(texteDe(execution)).toMatch(/^FAIT/);
    expect(texteDe(execution)).toMatch(/dont 2 avec exception de règlement/);

    const faite = executions(appels).find((m) => m.service === 'adGroupCriteria')!;
    expect(faite.operations).toEqual([
      { create: { adGroup: `customers/${COMPTE}/adGroups/444`, status: 'PAUSED', keyword: { text: 'aide pour arrêter de fumer', matchType: 'PHRASE' } },
        exemptPolicyViolationKeys: [{ policyName: 'TOBACCO', violatingText: 'aide pour arrêter de fumer' }] },
      { create: { adGroup: `customers/${COMPTE}/adGroups/444`, status: 'PAUSED', keyword: { text: 'hypnose anxiété', matchType: 'PHRASE' } },
        exemptPolicyViolationKeys: [{ policyName: 'HEALTH_IN_PERSONALIZED_ADS', violatingText: 'hypnose anxiété' }] },
      { create: { adGroup: `customers/${COMPTE}/adGroups/444`, status: 'PAUSED', keyword: { text: 'psychopraticien lyon', matchType: 'PHRASE' } } },
    ]);
    expect(env.DB.lignes()[0].issue).toBe('ok');
  });

  it('une règle sans exception possible fait refuser, même avec demander_exceptions', async () => {
    const env = creerEnv();
    const appels = simulerCompte({ libelle: true, reglement: true });
    const { corps } = await appelerOutil(env, 'ads_mots_cles_ajouter', {
      ...ARRETES, mots_cles: [...ARRETES.mots_cles, { texte: 'cocaine', correspondance: 'EXACT' }], demander_exceptions: true,
    }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/Google refuse 1 mot\(s\)-clé\(s\) pour une règle SANS exception possible/);
    expect(texteDe(corps)).toMatch(/« cocaine » \[exact\] — Dangerous products \(DANGEROUS_PRODUCTS\)/);
    expect(executions(appels)).toEqual([]);
  });

  it('une autre erreur de Google remonte telle quelle', async () => {
    const env = creerEnv();
    simulerFetch(({ url }) => {
      if (url.endsWith(':search')) {
        return Response.json({ results: [{ adGroup: { name: 'Groupe A', status: 'ENABLED', type: 'SEARCH_STANDARD' }, campaign: { name: 'C', advertisingChannelType: 'SEARCH' } }] });
      }
      if (!url.endsWith(':mutate')) return undefined;
      return Response.json({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Autre chose.',
        details: [{ errors: [{ errorCode: { criterionError: 'INVALID_KEYWORD_TEXT' }, message: 'Texte invalide.' }] }] } }, { status: 400 });
    });
    const { corps } = await appelerOutil(env, 'ads_mots_cles_ajouter', MOTS_CLES, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/criterionError\.INVALID_KEYWORD_TEXT/);
  });

  it('la table n’accepte que des clés d’exception bien formées', () => {
    const motCle = { adGroup: `customers/${COMPTE}/adGroups/444`, status: 'PAUSED', keyword: { text: 'x', matchType: 'EXACT' } };
    expect(() => verifierOperation('adGroupCriteria', { create: motCle, exemptPolicyViolationKeys: [{ policyName: 'TOBACCO', violatingText: 'x' }] })).not.toThrow();
    for (const exceptions of [[], [{ policyName: 'TOBACCO' }], [{ policyName: 'TOBACCO', violatingText: 'x', autre: 1 }], 'TOBACCO']) {
      expect(() => verifierOperation('adGroupCriteria', { create: motCle, exemptPolicyViolationKeys: exceptions }), JSON.stringify(exceptions)).toThrow(/table fermée/);
    }
    // Ni sur une annonce, ni sur un groupe : seuls les mots-clés en portent.
    expect(() => verifierOperation('adGroups', { create: { campaign: `customers/${COMPTE}/campaigns/111`, name: '[Claude] G', status: 'PAUSED', type: 'SEARCH_STANDARD' },
      exemptPolicyViolationKeys: [{ policyName: 'TOBACCO', violatingText: 'x' }] })).toThrow(/table fermée/);
  });
});

// ── Exécutions concurrentes — l'incident du 02/10/2026 ───────────────────

describe('ads_mots_cles_ajouter — exécutions concurrentes', () => {
  /**
   * Le 02/10/2026 : quatre exécutions lancées ensemble, quatre groupes, quatre
   * jetons, les arguments de leurs aperçus — deux refusées, « Le contenu
   * diffère de celui de l'aperçu ». Ce compte reproduit ce que Google fait :
   * une fois une exception demandée pour un texte, il ne l'arrête plus
   * (documentation « Request exemption for keywords »). Les deux premières
   * exécutions sont faites avant que les deux suivantes ne lisent quoi que ce
   * soit du règlement — l'ordre où la panne apparaît.
   */
  const GROUPES = ['444', '445', '446', '447'];
  const motsCles = (groupe: string) => ({
    groupe,
    mots_cles: [{ texte: 'hypnose anxiété', correspondance: 'PHRASE' }, { texte: `psychopraticien ${groupe}`, correspondance: 'EXACT' }],
    demander_exceptions: true,
  });

  const simulerConcurrence = () => {
    const exemptes = new Set<string>();
    let libelle: string | undefined;
    const etat = { execution: false };
    const barriere = () => {
      let ouvrir!: () => void;
      return { franchie: new Promise<void>((r) => { ouvrir = r; }), ouvrir: () => ouvrir() };
    };
    const deuxFaites = barriere();
    const quatreLectures = barriere();
    let faites = 0;
    let lectures = 0;

    const appels = simulerFetch(({ url, corps }) => {
      if (url.endsWith(':search')) {
        const q: string = JSON.parse(corps).query;
        const m = /FROM ad_group WHERE ad_group\.id = (\d+)$/.exec(q);
        if (m) return reponse([{ adGroup: { name: `Groupe ${m[1]}`, status: 'ENABLED', type: 'SEARCH_STANDARD' }, campaign: { name: 'Troubles anxieux', advertisingChannelType: 'SEARCH' } }]);
        if (/FROM label/.test(q)) {
          if (etat.execution && ++lectures === GROUPES.length) quatreLectures.ouvrir();
          return reponse(libelle ? [{ label: { resourceName: libelle } }] : []);
        }
        return reponse([]);
      }
      if (!url.endsWith(':mutate')) return undefined;
      const c = JSON.parse(corps);
      const service = url.slice(url.lastIndexOf('/') + 1).replace(':mutate', '');

      if (service === 'labels') {
        // Un nom de libellé est unique dans le compte : le second à le créer est refusé. Les quatre
        // exécutions ont lu « pas de libellé » avant que la première ne le crée.
        const creer = () => {
          if (libelle) return Response.json({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'labelError.DUPLICATE_NAME' } }, { status: 400 });
          libelle = `customers/${COMPTE}/labels/99`;
          return reponse([{ resourceName: libelle }]);
        };
        return etat.execution ? quatreLectures.franchie.then(creer) : creer();
      }
      if (service !== 'adGroupCriteria') {
        return reponse(c.operations.map((_: unknown, i: number) => ({ resourceName: `customers/${COMPTE}/${service}/${i}` })));
      }

      const repondre = () => {
        // Un texte pour lequel une exception a déjà été demandée passe comme s'il la portait.
        const refus = erreurReglement(c.operations.map((o: Record<string, any>) => (exemptes.has(o.create.keyword.text)
          ? { ...o, exemptPolicyViolationKeys: [{ policyName: 'HEALTH_IN_PERSONALIZED_ADS', violatingText: o.create.keyword.text }] }
          : o)));
        if (refus) return refus;
        if (c.validateOnly) return Response.json({});
        for (const o of c.operations) if (o.exemptPolicyViolationKeys) exemptes.add(o.create.keyword.text);
        if (++faites === 2) deuxFaites.ouvrir();
        const groupe = /adGroups\/(\d+)/.exec(c.operations[0].create.adGroup)![1];
        return reponse(c.operations.map((_: unknown, i: number) => ({ resourceName: `customers/${COMPTE}/adGroupCriteria/${groupe}~${8000 + i}` })));
      };
      // Les vérifications à blanc des deux derniers groupes attendent que les deux premiers soient écrits.
      const tardif = /adGroups\/(446|447)$/.test(c.operations[0].create.adGroup);
      return etat.execution && c.validateOnly && tardif ? deuxFaites.franchie.then(repondre) : repondre();
    });
    return { appels, etat, exemptes };
  };

  it('NORMATIF — quatre exécutions parallèles, quatre jetons : aucune ne dépend de ce que les autres changent', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerConcurrence();

    const jetons: string[] = [];
    for (const groupe of GROUPES) {
      const { corps } = await appelerOutil(env, 'ads_mots_cles_ajouter', motsCles(groupe), LIRE_ECRIRE);
      expect(texteDe(corps)).toMatch(/EXCEPTIONS DE RÈGLEMENT DEMANDÉES À GOOGLE \(1\)/);
      jetons.push(jetonDe(corps)!);
    }

    etat.execution = true;
    const resultats = await Promise.all(GROUPES.map((groupe, i) =>
      appelerOutil(env, 'ads_mots_cles_ajouter', { ...motsCles(groupe), jeton: jetons[i] }, LIRE_ECRIRE)));

    // L'incident : deux de ces quatre lignes étaient « Le contenu diffère de celui de l'aperçu ».
    const issues = resultats.map(({ corps }) => texteDe(corps).split('\n')[0]);
    expect(issues.filter((l) => !l.startsWith('FAIT')), issues.join('\n')).toEqual([]);
    for (const [i, { corps }] of resultats.entries()) {
      expect(texteDe(corps), GROUPES[i]).toMatch(/dont 1 avec exception de règlement/);
      // Le libellé, créé par la première, est relu par les autres au lieu d'être déclaré « NON posé ».
      expect(texteDe(corps), GROUPES[i]).toMatch(/Libellé \[Claude\] posé/);
    }
    // Chacune a envoyé exactement ce que son aperçu montrait : l'exception comprise.
    const faites = executions(appels).filter((m) => m.service === 'adGroupCriteria');
    expect(faites).toHaveLength(4);
    for (const m of faites) {
      expect(m.operations.find((o) => o.create.keyword.text === 'hypnose anxiété')?.exemptPolicyViolationKeys)
        .toEqual([{ policyName: 'HEALTH_IN_PERSONALIZED_ADS', violatingText: 'hypnose anxiété' }]);
    }
    expect(env.DB.lignes().map((l) => l.issue)).toEqual(['ok', 'ok', 'ok', 'ok']);
    expect(executions(appels).filter((m) => m.service === 'labels')).toHaveLength(4);
  });

  it('l’exécution ne relit pas le règlement : les exceptions sont celles de l’aperçu, portées par le jeton', async () => {
    const env = creerEnv();
    const { appels, exemptes } = simulerConcurrence();
    const { corps } = await appelerOutil(env, 'ads_mots_cles_ajouter', motsCles('444'), LIRE_ECRIRE);
    // Entre l'aperçu et l'exécution, une autre exécution a fait exempter le texte.
    exemptes.add('hypnose anxiété');
    const avant = mutations(appels).length;
    const execution = await appelerOutil(env, 'ads_mots_cles_ajouter', { ...motsCles('444'), jeton: jetonDe(corps) }, LIRE_ECRIRE);

    expect(texteDe(execution.corps)).toMatch(/^FAIT/);
    const apres = mutations(appels).slice(avant).filter((m) => m.service === 'adGroupCriteria');
    expect(apres.map((m) => m.validateOnly)).toEqual([false]);
  });

  it('sans demander_exceptions à l’exécution, le jeton d’un aperçu qui en demandait ne vaut pas', async () => {
    const env = creerEnv();
    const { appels } = simulerConcurrence();
    const { corps } = await appelerOutil(env, 'ads_mots_cles_ajouter', motsCles('444'), LIRE_ECRIRE);
    const { demander_exceptions: _, ...sans } = motsCles('444');
    const execution = await appelerOutil(env, 'ads_mots_cles_ajouter', { ...sans, jeton: jetonDe(corps) }, LIRE_ECRIRE);
    expect(texteDe(execution.corps)).toMatch(/diffère de celui de l'aperçu/);
    expect(executions(appels)).toEqual([]);
  });
});
