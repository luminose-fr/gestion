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

type Budget = { nom: string; statut: string; ressource: string; euros: number };
const BUDGETS_ORDINAIRES: Budget[] = [
  { nom: 'Troubles anxieux', statut: 'ENABLED', ressource: 'b1', euros: 5 },
  { nom: 'Alimentation et corps', statut: 'ENABLED', ressource: 'b2', euros: 5 },
  { nom: 'Ancienne', statut: 'PAUSED', ressource: 'b3', euros: 7 },
];

type Monde = { budgets?: Budget[]; libelle?: boolean; criteres?: unknown[]; refusLibelle?: boolean };

const reponse = (results: unknown[]) => Response.json({ results });

const simulerCompte = (monde: Monde = {}) => simulerFetch(({ url, corps }) => {
  if (url.endsWith(':search')) {
    const q: string = JSON.parse(corps).query;
    let m: RegExpExecArray | null;
    if (/FROM campaign WHERE campaign\.status IN/.test(q)) {
      return reponse((monde.budgets ?? BUDGETS_ORDINAIRES).map((b) => ({
        campaign: { name: b.nom, status: b.statut },
        campaignBudget: { resourceName: `customers/${COMPTE}/campaignBudgets/${b.ressource}`, amountMicros: String(b.euros * 1_000_000) },
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
    if (c.validateOnly) return Response.json({});
    const service = url.slice(url.lastIndexOf('/') + 1).replace(':mutate', '');
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
