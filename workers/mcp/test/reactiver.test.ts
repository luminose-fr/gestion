/**
 * Annuler une pause — décision du 23/10/2026
 * (workers/mcp/decisions/2026-10-23-reactiver.md).
 *
 * Comme pour les autres écritures, chaque test NORMATIF regarde ce qui part
 * réellement chez Google — les corps des `:mutate` — et ce que le journal a
 * réellement écrit. La pause qu'on annule est faite par le serveur lui-même,
 * avec ads_mettre_en_pause, sur un compte simulé qui garde ses statuts.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { muter, verifierOperation, type Operation } from '../src/google-ads';
import { COMPTE, LIRE_ECRIRE, appelerOutil, creerEnv, simulerFetch, texteDe as texteBrut, type Appel, type EnvFactice } from './aides';

const texteDe = (corps: unknown) => texteBrut(corps).replace(/[  ]/g, ' ');

/** Le 20/10/2026 à midi, heure de Paris : la pause se fait ce jour-là, sauf mention contraire. */
const MAINTENANT = Date.parse('2026-10-20T10:00:00Z');
beforeEach(() => { vi.useFakeTimers({ now: MAINTENANT, toFake: ['Date'] }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

// ── Un compte de comptoir, qui garde ses statuts ─────────────────────────

const LIBELLE = `customers/${COMPTE}/labels/42`;
type Campagne = { name: string; status: string; advertisingChannelType: string };
type Etat = {
  campagnes: Record<string, Campagne>;
  groupes: Record<string, { name: string; status: string; campagne: string }>;
  annonces: Record<string, { status: string; labels: string[]; approval: string }>;
  motsCles: Record<string, { text: string; status: string; labels: string[]; approval: string; negative?: boolean; qualite?: Record<string, unknown> }>;
  associations: Record<string, { status: string }>;
  /** L'historique de Google : qui a changé le statut de quoi, le plus récent d'abord. */
  historique: { ressource: string; type: string; client: string; date: string; champs: string }[];
};

const etatInitial = (): Etat => ({
  campagnes: {
    111: { name: 'Troubles anxieux', status: 'ENABLED', advertisingChannelType: 'SEARCH' },
    112: { name: 'Sommeil', status: 'PAUSED', advertisingChannelType: 'SEARCH' },
    222: { name: 'PMax', status: 'ENABLED', advertisingChannelType: 'PERFORMANCE_MAX' },
  },
  groupes: {
    444: { name: 'Anxiété', status: 'ENABLED', campagne: '111' },
    445: { name: '[Claude] Phobies', status: 'ENABLED', campagne: '111' },
    446: { name: 'Insomnie', status: 'ENABLED', campagne: '112' },
  },
  annonces: {
    '444~555': { status: 'ENABLED', labels: [], approval: 'APPROVED' },
    '444~556': { status: 'ENABLED', labels: [LIBELLE], approval: 'APPROVED' },
    '444~557': { status: 'ENABLED', labels: [], approval: 'DISAPPROVED' },
  },
  motsCles: {
    '444~666': { text: 'anxiété', status: 'ENABLED', labels: [], approval: 'APPROVED' },
    '444~667': { text: 'stress', status: 'ENABLED', labels: [LIBELLE], approval: 'APPROVED' },
    '444~668': { text: 'angoisse', status: 'ENABLED', labels: [], approval: 'DISAPPROVED' },
    '444~669': { text: 'phobie', status: 'PAUSED', labels: [], approval: 'APPROVED' },
    '444~670': { text: 'gratuit', status: 'ENABLED', labels: [], approval: 'APPROVED', negative: true },
    '446~671': { text: 'insomnie', status: 'ENABLED', labels: [], approval: 'APPROVED' },
  },
  associations: {
    'campaignAssets/111~7002~CALLOUT': { status: 'ENABLED' },
    'adGroupAssets/444~7003~SITELINK': { status: 'ENABLED' },
  },
  historique: [],
});

/** Ce que l'élément a fait avant sa pause, pour toute période demandée. */
const METRIQUES = { impressions: '858', clicks: '36', costMicros: '31300000', conversions: 2 };
const HISTORIQUE_QS = { historicalQualityScore: '6', historicalCreativeQualityScore: 'ABOVE_AVERAGE', historicalLandingPageQualityScore: 'AVERAGE', historicalSearchPredictedCtr: 'BELOW_AVERAGE' };

const reponse = (results: unknown[]) => Response.json({ results });

/** Le type de ressource de l'historique de Google, par service. */
const TYPES: Record<string, string> = {
  campaigns: 'CAMPAIGN', adGroups: 'AD_GROUP', adGroupAds: 'AD_GROUP_AD', adGroupCriteria: 'AD_GROUP_CRITERION',
  campaignAssets: 'CAMPAIGN_ASSET', adGroupAssets: 'AD_GROUP_ASSET',
};

/** `qsHistorique` : Google donne le niveau de qualité des 30 jours d'avant ; `qsEnPause` : il donne aussi l'actuel, en pause. */
const simulerCompte = (etat: Etat = etatInitial(), options: { qsHistorique?: boolean; qsEnPause?: boolean } = {}) => {
  const campagne = (id: string) => ({ id, ...etat.campagnes[id] });
  const groupe = (g: string) => ({ id: g, name: etat.groupes[g]?.name, status: etat.groupes[g]?.status });
  const appels = simulerFetch(({ url, corps }) => {
    if (url.endsWith(':search')) {
      const q: string = JSON.parse(corps).query;
      const metriques = /metrics\./.test(q) ? { metrics: { ...METRIQUES, ...(/historical_quality_score/.test(q) && options.qsHistorique !== false ? HISTORIQUE_QS : {}) } } : {};
      let m: RegExpExecArray | null;
      if (/FROM label WHERE label\.name = '\[Claude\]'/.test(q)) return reponse([{ label: { resourceName: LIBELLE, name: '[Claude]' } }]);
      if (/FROM change_event/.test(q)) {
        const type = /change_resource_type = '([A-Z_]+)'/.exec(q)?.[1];
        return reponse(etat.historique.filter((h) => h.type === type).map((h) => ({ changeEvent: {
          changeDateTime: h.date, changeResourceName: h.ressource, changeResourceType: h.type, clientType: h.client, changedFields: h.champs,
        } })));
      }
      if ((m = /FROM campaign WHERE campaign\.id = (\d+)$/.exec(q))) return reponse(etat.campagnes[m[1]] ? [{ campaign: campagne(m[1]) }] : []);
      if ((m = /FROM ad_group WHERE ad_group\.id = (\d+)/.exec(q))) {
        const g = etat.groupes[m[1]];
        return reponse(g ? [{ adGroup: groupe(m[1]), campaign: campagne(g.campagne), ...metriques }] : []);
      }
      if ((m = /FROM ad_group_ad WHERE ad_group\.id = (\d+) AND ad_group_ad\.ad\.id = (\d+)/.exec(q))) {
        const a = etat.annonces[`${m[1]}~${m[2]}`];
        return reponse(a ? [{
          adGroup: groupe(m[1]), campaign: campagne(etat.groupes[m[1]].campagne), ...metriques,
          adGroupAd: { status: a.status, labels: a.labels, policySummary: { approvalStatus: a.approval }, ad: { id: m[2] } },
        }] : []);
      }
      if ((m = /FROM (ad_group_criterion|keyword_view) WHERE ad_group\.id = (\d+) AND ad_group_criterion\.criterion_id = (\d+)/.exec(q))) {
        const k = etat.motsCles[`${m[2]}~${m[3]}`];
        return reponse(k ? [{
          adGroup: groupe(m[2]), campaign: campagne(etat.groupes[m[2]].campagne), ...metriques,
          adGroupCriterion: {
            criterionId: m[3], type: 'KEYWORD', status: k.status, negative: Boolean(k.negative), labels: k.labels, approvalStatus: k.approval,
            keyword: { text: k.text, matchType: 'PHRASE' },
            // Comme Google : pas de niveau de qualité pour un mot-clé en pause.
            ...(k.qualite && (k.status === 'ENABLED' || options.qsEnPause) ? { qualityInfo: k.qualite } : {}),
          },
        }] : []);
      }
      if ((m = /FROM (campaign|ad_group)_asset WHERE (?:campaign|ad_group)\.id = (\d+) AND asset\.id = (\d+) AND \w+\.field_type = '([A-Z_]+)'/.exec(q))) {
        const service = m[1] === 'campaign' ? 'campaignAssets' : 'adGroupAssets';
        const a = etat.associations[`${service}/${m[2]}~${m[3]}~${m[4]}`];
        if (!a) return reponse([]);
        const cible = m[1] === 'campaign' ? { campaign: campagne(m[2]) } : { adGroup: groupe(m[2]), campaign: campagne(etat.groupes[m[2]].campagne) };
        return reponse([{ ...cible, ...metriques, [m[1] === 'campaign' ? 'campaignAsset' : 'adGroupAsset']: { status: a.status, fieldType: m[4] } }]);
      }
      return reponse([]);
    }
    if (url.endsWith(':mutate')) {
      const c = JSON.parse(corps);
      if (c.validateOnly) return Response.json({});
      const service = url.slice(url.lastIndexOf('/') + 1).replace(':mutate', '');
      for (const o of c.operations) {
        const nom: string = o.update.resourceName;
        const cle = nom.slice(nom.indexOf(`/${service}/`) + service.length + 2);
        const cible = service === 'adGroups' ? etat.groupes[cle] : service === 'adGroupAds' ? etat.annonces[cle]
          : service === 'adGroupCriteria' ? etat.motsCles[cle] : service === 'campaigns' ? etat.campagnes[cle] : etat.associations[`${service}/${cle}`];
        cible.status = o.update.status;
        etat.historique.unshift({ ressource: nom, type: TYPES[service], client: 'GOOGLE_ADS_API', date: '2026-10-20 12:00:00', champs: 'status' });
      }
      return reponse(c.operations.map((o: { update: { resourceName: string } }) => ({ resourceName: o.update.resourceName })));
    }
    return undefined;
  });
  return { appels, etat };
};

type Mutation = { service: string; validateOnly: boolean; operations: Record<string, any>[] };
const mutations = (appels: Appel[]): Mutation[] => appels.filter((a) => a.url.endsWith(':mutate')).map((a) => {
  const c = JSON.parse(a.corps);
  return { service: a.url.slice(a.url.lastIndexOf('/') + 1).replace(':mutate', ''), validateOnly: c.validateOnly, operations: c.operations };
});
const executions = (appels: Appel[]) => mutations(appels).filter((m) => !m.validateOnly);
const requetes = (appels: Appel[]) => appels.filter((a) => a.url.endsWith(':search')).map((a) => JSON.parse(a.corps).query as string);

const jetonDe = (corps: unknown) => /jeton = "([^"]+)"/.exec(texteDe(corps))?.[1];

const apercuPuisExecution = async (env: EnvFactice, outil: string, args: Record<string, unknown>) => {
  const apercu = await appelerOutil(env, outil, args, LIRE_ECRIRE);
  const jeton = jetonDe(apercu.corps);
  const execution = await appelerOutil(env, outil, { ...args, jeton }, LIRE_ECRIRE);
  return { apercu: apercu.corps, jeton, execution: execution.corps };
};

/** Le serveur met en pause, comme Florent le lui aurait demandé. */
const pauseDuServeur = async (env: EnvFactice, type: string, identifiant: string) => {
  const { execution } = await apercuPuisExecution(env, 'ads_mettre_en_pause', { type, identifiant });
  expect(texteDe(execution), `${type} ${identifiant}`).toMatch(/^FAIT/);
};

const MOT_CLE = { type: 'mot_cle', identifiant: '444~666' };
const ressource = (service: string, cle: string) => `customers/${COMPTE}/${service}/${cle}`;

// ── Le parcours ──────────────────────────────────────────────────────────

describe('ads_reactiver — annuler une pause du serveur', () => {
  it('NORMATIF — la pause du serveur s’annule : l’aperçu dit tout, l’exécution remet ENABLED, et le journal le garde', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerCompte();
    await pauseDuServeur(env, 'mot_cle', '444~666');
    expect(etat.motsCles['444~666'].status).toBe('PAUSED');

    const { apercu, execution } = await apercuPuisExecution(env, 'ads_reactiver', MOT_CLE);
    const t = texteDe(apercu);
    expect(t).toMatch(/^APERÇU/);
    expect(t).toMatch(/ANNULER UNE PAUSE — le mot-clé « anxiété » \[PHRASE\] du groupe « Anxiété » \(444~666\) repasse en ENABLED \(« Activé »\)\. Ce n'est pas une activation/);
    expect(t).toMatch(/- Mis en pause par ce serveur le 20\/10\/2026 à 12:00 — écriture n° 1 du journal\./);
    expect(t).toMatch(/- Groupe « Anxiété » : active\. Campagne « Troubles anxieux » : active\. La campagne est active : l'élément diffusera dès l'exécution, et dépensera\./);
    expect(t).toMatch(/- Sur les 30 jours précédant la pause \(du 20\/09\/2026 au 19\/10\/2026\) : 858 impressions, 36 clics, 31,30 €, 2 conversions\./);
    // En pause, Google ne donne plus de niveau de qualité : celui des 30 jours d'avant.
    expect(t).toMatch(/- Niveau de qualité sur les 30 jours précédant la pause : 6\/10 — taux de clics attendu en dessous de la moyenne, pertinence de l'annonce au-dessus de la moyenne, expérience sur la page de destination dans la moyenne\./);
    expect(t).toMatch(/Toute autre réactivation — ce qui est né en pause, ce qui a été mis en pause dans l'interface, une campagne — se fait dans l'interface Google Ads/);
    expect(requetes(appels).some((q) => /FROM keyword_view WHERE .* AND segments\.date BETWEEN '2026-09-20' AND '2026-10-19'$/.test(q))).toBe(true);

    expect(texteDe(execution)).toMatch(/^FAIT — écriture n° 2 du journal\.[\s\S]*Pause annulée : le mot-clé « anxiété »/);
    expect(executions(appels).at(-1)).toEqual({ service: 'adGroupCriteria', validateOnly: false, operations: [
      { updateMask: 'status', update: { resourceName: ressource('adGroupCriteria', '444~666'), status: 'ENABLED' } },
    ] });
    expect(etat.motsCles['444~666'].status).toBe('ENABLED');
    expect(env.DB.lignes().map((l) => [l.id, l.outil, l.issue])).toEqual([[1, 'ads_mettre_en_pause', 'ok'], [2, 'ads_reactiver', 'ok']]);
  });

  it('NORMATIF — un aperçu n’écrit rien : ni chez Google, ni au journal', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerCompte();
    await pauseDuServeur(env, 'mot_cle', '444~666');
    const avant = env.DB.lignes().length;
    const { corps } = await appelerOutil(env, 'ads_reactiver', MOT_CLE, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/^APERÇU — rien n'a été modifié/);
    expect(mutations(appels).at(-1)?.validateOnly).toBe(true);
    expect(executions(appels)).toHaveLength(1); // la pause seule
    expect(env.DB.lignes()).toHaveLength(avant);
    expect(etat.motsCles['444~666'].status).toBe('PAUSED');
  });

  it('NORMATIF — le jeton ne vaut que pour ses arguments exacts, son outil, et une fois', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    await pauseDuServeur(env, 'mot_cle', '444~666');
    await pauseDuServeur(env, 'annonce', '444~555');
    const jeton = jetonDe((await appelerOutil(env, 'ads_reactiver', MOT_CLE, LIRE_ECRIRE)).corps);

    const ailleurs = await appelerOutil(env, 'ads_reactiver', { type: 'annonce', identifiant: '444~555', jeton }, LIRE_ECRIRE);
    expect(texteDe(ailleurs.corps)).toMatch(/Le contenu diffère de celui de l'aperçu : rien n'est parti/);
    const jetonDePause = jetonDe((await appelerOutil(env, 'ads_mettre_en_pause', { type: 'groupe', identifiant: '444' }, LIRE_ECRIRE)).corps);
    const autreOutil = await appelerOutil(env, 'ads_reactiver', { ...MOT_CLE, jeton: jetonDePause }, LIRE_ECRIRE);
    expect(autreOutil.corps.result.isError).toBe(true);
    expect(executions(appels)).toHaveLength(2); // les deux pauses

    expect(texteDe((await appelerOutil(env, 'ads_reactiver', { ...MOT_CLE, jeton }, LIRE_ECRIRE)).corps)).toMatch(/^FAIT/);
    const encore = await appelerOutil(env, 'ads_reactiver', { ...MOT_CLE, jeton }, LIRE_ECRIRE);
    expect(encore.corps.result.isError).toBe(true);
    expect(executions(appels)).toHaveLength(3);
  });

  it('une campagne en pause : réactiver ne dépense rien, et l’aperçu le dit', async () => {
    const env = creerEnv();
    simulerCompte();
    await pauseDuServeur(env, 'mot_cle', '446~671');
    const t = texteDe((await appelerOutil(env, 'ads_reactiver', { type: 'mot_cle', identifiant: '446~671' }, LIRE_ECRIRE)).corps);
    expect(t).toMatch(/Campagne « Sommeil » : en pause\. La campagne est en pause : réactiver ne dépense rien tant qu'elle le reste\./);
  });

  it('le niveau de qualité : l’actuel quand Google le donne, sinon celui d’avant la pause, sinon il le dit', async () => {
    const etat = etatInitial();
    etat.motsCles['444~666'].qualite = { qualityScore: 7, creativeQualityScore: 'ABOVE_AVERAGE', postClickQualityScore: 'AVERAGE', searchPredictedCtr: 'AVERAGE' };
    const env = creerEnv();
    simulerCompte(etat, { qsEnPause: true });
    await pauseDuServeur(env, 'mot_cle', '444~666');
    expect(texteDe((await appelerOutil(env, 'ads_reactiver', MOT_CLE, LIRE_ECRIRE)).corps)).toMatch(
      /- Niveau de qualité actuel : 7\/10 — taux de clics attendu dans la moyenne, pertinence de l'annonce au-dessus de la moyenne, expérience sur la page de destination dans la moyenne\./);

    simulerCompte(etat, { qsHistorique: false });
    expect(texteDe((await appelerOutil(env, 'ads_reactiver', MOT_CLE, LIRE_ECRIRE)).corps)).toMatch(
      /- Niveau de qualité : non communiqué par Google — ni aujourd'hui \(en pause\), ni sur les 30 jours précédant la pause\./);
  });

  it('les associations d’éléments : la pause du serveur s’annule au niveau de la campagne comme du groupe', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerCompte();
    for (const [type, identifiant, service] of [
      ['association_campagne', '111~7002~CALLOUT', 'campaignAssets'], ['association_groupe', '444~7003~SITELINK', 'adGroupAssets'],
    ] as const) {
      await pauseDuServeur(env, type, identifiant);
      expect(etat.associations[`${service}/${identifiant}`].status).toBe('PAUSED');
      const { apercu, execution } = await apercuPuisExecution(env, 'ads_reactiver', { type, identifiant });
      expect(texteDe(apercu)).toMatch(/ANNULER UNE PAUSE — l'association (CALLOUT|SITELINK) de l'élément/);
      expect(texteDe(apercu)).toMatch(/858 impressions, 36 clics, 31,30 €, 2 conversions/);
      expect(texteDe(apercu)).not.toMatch(/Niveau de qualité/);
      expect(texteDe(execution)).toMatch(/^FAIT/);
      expect(executions(appels).at(-1)?.operations).toEqual([{ updateMask: 'status', update: { resourceName: ressource(service, identifiant), status: 'ENABLED' } }]);
      expect(etat.associations[`${service}/${identifiant}`].status).toBe('ENABLED');
    }
  });
});

// ── Les règles : refus ───────────────────────────────────────────────────

describe('NORMATIF — ads_reactiver refuse', () => {
  it('règle 1 — une pause absente du journal : faite dans l’interface, elle se lève dans l’interface', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    // Le serveur a mis en pause un autre mot-clé du même groupe : cela ne vaut pas pour celui-ci.
    await pauseDuServeur(env, 'mot_cle', '444~666');
    const { corps } = await appelerOutil(env, 'ads_reactiver', { type: 'mot_cle', identifiant: '444~669' }, LIRE_ECRIRE);
    expect(corps.result.isError).toBe(true);
    expect(texteDe(corps)).toMatch(/le mot-clé « phobie » .* n'a jamais été mis en pause par ce serveur : sa pause n'est pas dans le journal des écritures\. Une pause faite dans l'interface Google Ads se lève dans l'interface\./);
    expect(executions(appels)).toHaveLength(1);
    expect(mutations(appels).filter((m) => m.operations.some((o) => o.update?.status === 'ENABLED'))).toEqual([]);
  });

  it('règle 1 — une pause que Google a refusée n’est pas une pause : le journal ne compte que ce qui a réussi', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    env.DB.db.prepare('INSERT INTO ads_ecritures (created_at, outil, compte, auteur, contenu, jeton_empreinte, issue) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(MAINTENANT, 'ads_mettre_en_pause', COMPTE, 'florent@luminose.fr',
        JSON.stringify({ service: 'adGroupCriteria', operations: [{ updateMask: 'status', update: { resourceName: ressource('adGroupCriteria', '444~669'), status: 'PAUSED' } }] }),
        'empreinte-echec', 'erreur');
    const { corps } = await appelerOutil(env, 'ads_reactiver', { type: 'mot_cle', identifiant: '444~669' }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/n'a jamais été mis en pause par ce serveur/);
    expect(mutations(appels)).toEqual([]);
  });

  it('règle 1 — une pause du serveur déjà annulée, puis refaite ailleurs', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerCompte();
    await pauseDuServeur(env, 'mot_cle', '444~666');
    await apercuPuisExecution(env, 'ads_reactiver', MOT_CLE);
    etat.motsCles['444~666'].status = 'PAUSED'; // dans l'interface
    const { corps } = await appelerOutil(env, 'ads_reactiver', MOT_CLE, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/La dernière pause de le mot-clé « anxiété » .* par ce serveur a déjà été annulée \(écriture n° 2 du journal\)/);
    expect(executions(appels)).toHaveLength(2);
  });

  it('règle 1 — l’historique de Google montre un changement de statut dans l’interface après la pause du serveur', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerCompte();
    await pauseDuServeur(env, 'mot_cle', '444~666');
    etat.historique.unshift({
      ressource: ressource('adGroupCriteria', '444~666'), type: 'AD_GROUP_CRITERION', client: 'GOOGLE_ADS_WEB_CLIENT', date: '2026-10-20 15:30:00.123', champs: 'status',
    });
    const { corps } = await appelerOutil(env, 'ads_reactiver', MOT_CLE, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/Le dernier changement de statut de le mot-clé « anxiété » .* vient de l'interface Google Ads \(2026-10-20 15:30\), après la pause de ce serveur \(écriture n° 1\) : la pause actuelle n'est pas la sienne/);
    expect(executions(appels)).toHaveLength(1);
    // Un changement du serveur lui-même, ou qui ne touche pas au statut, ne gêne pas.
    etat.historique[0] = { ...etat.historique[0], champs: 'keyword.text' };
    expect(texteDe((await appelerOutil(env, 'ads_reactiver', MOT_CLE, LIRE_ECRIRE)).corps)).toMatch(/^APERÇU/);
  });

  it('règle 2 — un élément qui porte encore la marque [Claude], en libellé ou dans son nom : il n’a pas été relu', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    for (const [type, identifiant, ou] of [
      ['mot_cle', '444~667', 'en libellé'], ['annonce', '444~556', 'en libellé'], ['groupe', '445', 'dans son nom'],
    ] as const) {
      await pauseDuServeur(env, type, identifiant);
      const { corps } = await appelerOutil(env, 'ads_reactiver', { type, identifiant }, LIRE_ECRIRE);
      expect(corps.result.isError, identifiant).toBe(true);
      expect(texteDe(corps), identifiant).toMatch(new RegExp(`porte encore la marque \\[Claude\\] \\(${ou}\\) : il n'a pas été relu`));
    }
    expect(executions(appels)).toHaveLength(3); // les trois pauses, rien d'autre
    expect(mutations(appels).filter((m) => m.operations.some((o) => o.update?.status === 'ENABLED'))).toEqual([]);
  });

  it('règle 3 — jamais une campagne : l’outil n’en connaît pas, la table n’en admet pas', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    await pauseDuServeur(env, 'campagne', '111');
    const { corps } = await appelerOutil(env, 'ads_reactiver', { type: 'campagne', identifiant: '111' }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/Arguments invalides/);
    expect(() => verifierOperation('campaigns', { update: { resourceName: ressource('campaigns', '111'), status: 'ENABLED' }, updateMask: 'status' }))
      .toThrow(/table fermée/);
    expect(executions(appels)).toHaveLength(1);
  });

  it('règle 4 — une annonce ou un mot-clé refusé par Google', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    for (const [type, identifiant] of [['annonce', '444~557'], ['mot_cle', '444~668']] as const) {
      await pauseDuServeur(env, type, identifiant);
      const { corps } = await appelerOutil(env, 'ads_reactiver', { type, identifiant }, LIRE_ECRIRE);
      expect(texteDe(corps), identifiant).toMatch(/est refusé par Google \(DISAPPROVED\)/);
    }
    expect(executions(appels)).toHaveLength(2);
  });

  it('ce qui n’est pas en pause, est supprimé, ou est un négatif', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerCompte();
    expect(texteDe((await appelerOutil(env, 'ads_reactiver', MOT_CLE, LIRE_ECRIRE)).corps)).toMatch(/n'est pas en pause : rien à annuler/);
    etat.motsCles['444~666'].status = 'REMOVED';
    expect(texteDe((await appelerOutil(env, 'ads_reactiver', MOT_CLE, LIRE_ECRIRE)).corps)).toMatch(/est supprimé : rien à réactiver/);
    expect(texteDe((await appelerOutil(env, 'ads_reactiver', { type: 'mot_cle', identifiant: '444~670' }, LIRE_ECRIRE)).corps)).toMatch(/mot-clé négatif/);
    expect(mutations(appels)).toEqual([]);
  });

  it('une entrée hostile n’atteint pas Google', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    for (const [type, identifiant] of [
      ['mot_cle', '444'], ['groupe', '444:mutate'], ['annonce', '444~555~1'], ['association_campagne', '111~7002~HEADLINE'],
      ['association_groupe', '444~7003'], ['groupe', '444 OR ad_group.id > 0'],
    ]) {
      const { corps } = await appelerOutil(env, 'ads_reactiver', { type, identifiant }, LIRE_ECRIRE);
      expect(corps.result.isError, identifiant).toBe(true);
    }
    expect(appels.filter((a) => a.url.startsWith('https://googleads.'))).toEqual([]);
  });
});

// ── La table fermée, indépendamment de l'outil ───────────────────────────

describe('NORMATIF — la table fermée revérifie toute réactivation, au journal et au compte', () => {
  const reactivation = (service: string, cle: string): Operation => ({ updateMask: 'status', update: { resourceName: ressource(service, cle), status: 'ENABLED' } });

  it('la forme : le statut seul, ENABLED, sur un groupe, une annonce, un mot-clé, une association — rien d’autre', () => {
    for (const [service, cle] of [
      ['adGroups', '444'], ['adGroupAds', '444~555'], ['adGroupCriteria', '444~666'],
      ['campaignAssets', '111~7002~CALLOUT'], ['adGroupAssets', '444~7003~SITELINK'],
    ] as const) expect(() => verifierOperation(service, reactivation(service, cle)), service).not.toThrow();
    for (const [service, op] of [
      ['campaigns', reactivation('campaigns', '111')],
      ['adGroupCriteria', { updateMask: 'status,cpcBidMicros', update: { resourceName: ressource('adGroupCriteria', '444~666'), status: 'ENABLED', cpcBidMicros: '1' } }],
      ['adGroupCriteria', { updateMask: 'status', update: { resourceName: ressource('adGroupCriteria', '444~666'), status: 'ENABLED', cpcBidMicros: '1' } }],
      ['adGroupCriteria', { updateMask: 'status,cpcBidMicros', update: { resourceName: ressource('adGroupCriteria', '444~666'), status: 'ENABLED' } }],
      ['adGroupCriteria', { updateMask: 'status', update: { resourceName: ressource('adGroupCriteria', '444~666'), status: 'REMOVED' } }],
      ['adGroupCriteria', reactivation('adGroups', '444')],
      ['campaignAssets', reactivation('campaignAssets', '111~7002~HEADLINE')],
      ['campaignCriteria', reactivation('campaignCriteria', '111~1')],
      ['adGroupAdLabels', reactivation('adGroupAdLabels', '444~555~42')],
    ] as const) expect(() => verifierOperation(service, op as Operation), JSON.stringify(op)).toThrow(/table fermée/);
  });

  it('sans pause du serveur au journal, rien ne part — même construit par le code, même en aperçu', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    for (const [service, cle] of [['adGroupCriteria', '444~669'], ['campaignAssets', '111~7002~CALLOUT']] as const) {
      await expect(muter(env, COMPTE, service, [reactivation(service, cle)], true)).rejects.toThrow(/Réactivation refusée par la table fermée .* aucune mise en pause de ce serveur à annuler dans le journal/);
    }
    expect(mutations(appels)).toEqual([]);
  });

  it('une marque [Claude] encore posée, ou un refus de Google : rien ne part, même avec la pause au journal', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    for (const [type, identifiant, service, attendu] of [
      ['mot_cle', '444~667', 'adGroupCriteria', /libellé \[Claude\] encore posé/],
      ['annonce', '444~556', 'adGroupAds', /libellé \[Claude\] encore posé/],
      ['groupe', '445', 'adGroups', /nom encore marqué \[Claude\]/],
      ['mot_cle', '444~668', 'adGroupCriteria', /refusé par Google/],
    ] as const) {
      await pauseDuServeur(env, type, identifiant);
      await expect(muter(env, COMPTE, service, [reactivation(service, identifiant)], false), identifiant).rejects.toThrow(attendu);
    }
    expect(mutations(appels).filter((m) => m.operations.some((o) => o.update?.status === 'ENABLED'))).toEqual([]);
  });

  it('une pause déjà annulée par le serveur ne s’annule pas deux fois', async () => {
    const env = creerEnv();
    simulerCompte();
    await pauseDuServeur(env, 'mot_cle', '444~666');
    await apercuPuisExecution(env, 'ads_reactiver', MOT_CLE);
    await expect(muter(env, COMPTE, 'adGroupCriteria', [reactivation('adGroupCriteria', '444~666')], true)).rejects.toThrow(/aucune mise en pause de ce serveur à annuler/);
  });
});
