/**
 * Les éléments d'annonce — liens annexes, accroches, extraits structurés —
 * décision du 04/10/2026 (workers/mcp/decisions/2026-10-04-elements-et-insertion.md).
 *
 * Le compte simulé a un ÉTAT, comme pour les listes : une exécution le
 * modifie, un aperçu non. Il a des éléments aux trois niveaux — compte,
 * campagne, groupe — pour vérifier ce que l'aperçu dit de ce qui masque et
 * de ce qui serait masqué.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { EN_TETES_EXTRAITS, LIMITES_ELEMENTS, muter, verifierCreationElements, verifierOperation, type Operation } from '../src/google-ads';
import { COMPTE, LIRE_ECRIRE, appelerOutil, creerEnv, simulerFetch, texteDe, type Appel, type EnvFactice } from './aides';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

// ── Un compte à état ─────────────────────────────────────────────────────

type Asset = {
  type: string;
  finalUrls?: string[];
  sitelinkAsset?: { linkText: string; description1?: string; description2?: string };
  calloutAsset?: { calloutText: string };
  structuredSnippetAsset?: { header: string; values: string[] };
};
type Lien = { niveau: 'compte' | 'campagne' | 'groupe'; cible: string; asset: string; fieldType: string; status: string };

type Etat = {
  campagnes: Record<string, { name: string; status: string; advertisingChannelType: string }>;
  groupes: Record<string, { name: string; status: string; campagne: string }>;
  assets: Record<string, Asset>;
  liens: Lien[];
  suivant: number;
};

const QUARTIERS = '68824727611';

const etatInitial = (): Etat => ({
  campagnes: {
    111: { name: 'Troubles anxieux', status: 'ENABLED', advertisingChannelType: 'SEARCH' },
    113: { name: 'Sommeil', status: 'ENABLED', advertisingChannelType: 'SEARCH' },
    222: { name: 'PMax - Faire le point', status: 'PAUSED', advertisingChannelType: 'PERFORMANCE_MAX' },
  },
  groupes: {
    444: { name: 'Anxiété', status: 'ENABLED', campagne: '111' },
    445: { name: 'Phobies', status: 'ENABLED', campagne: '111' },
    446: { name: 'Insomnie', status: 'ENABLED', campagne: '113' },
  },
  assets: {
    [QUARTIERS]: { type: 'STRUCTURED_SNIPPET', structuredSnippetAsset: { header: 'Quartiers', values: ['Presqu’île', 'Croix-Rousse', 'Part-Dieu'] } },
    7001: { type: 'SITELINK', finalUrls: ['https://luminose.fr/rendez-vous/'], sitelinkAsset: { linkText: 'Prendre rendez-vous', description1: 'Première séance de rencontre', description2: 'En cabinet à Lyon' } },
    7002: { type: 'CALLOUT', calloutAsset: { calloutText: 'Séance en cabinet' } },
    7003: { type: 'CALLOUT', calloutAsset: { calloutText: 'Cabinet à Lyon' } },
    7004: { type: 'SITELINK', finalUrls: ['https://luminose.fr/respiration-holotropique/'], sitelinkAsset: { linkText: 'Respiration holotropique' } },
    // Ce que les outils ne doivent jamais associer : un texte interdit, une page hors de luminose.fr, un autre type.
    7005: { type: 'CALLOUT', calloutAsset: { calloutText: 'Guérison durable' } },
    7006: { type: 'SITELINK', finalUrls: ['https://passage.luminose.fr/'], sitelinkAsset: { linkText: 'Le Passage' } },
    7007: { type: 'IMAGE' },
  },
  liens: [
    { niveau: 'compte', cible: COMPTE, asset: '7003', fieldType: 'CALLOUT', status: 'ENABLED' },
    { niveau: 'campagne', cible: '111', asset: '7002', fieldType: 'CALLOUT', status: 'ENABLED' },
    { niveau: 'campagne', cible: '111', asset: '7001', fieldType: 'SITELINK', status: 'ENABLED' },
    { niveau: 'groupe', cible: '445', asset: '7002', fieldType: 'CALLOUT', status: 'ENABLED' },
    { niveau: 'campagne', cible: '113', asset: '7003', fieldType: 'CALLOUT', status: 'PAUSED' },
  ],
  suivant: 80000,
});

const rn = {
  campagne: (c: string, a: string, t: string) => `customers/${COMPTE}/campaignAssets/${c}~${a}~${t}`,
  groupe: (g: string, a: string, t: string) => `customers/${COMPTE}/adGroupAssets/${g}~${a}~${t}`,
};

const reponse = (results: unknown[]) => Response.json({ results });
const erreurAds = (code: Record<string, string>, message: string) => Response.json({ error: {
  code: 400, status: 'INVALID_ARGUMENT', message: 'Request contains an invalid argument.',
  details: [{ errors: [{ errorCode: code, message }] }],
} }, { status: 400 });
const noms = (liste: string) => [...liste.matchAll(/'([^']+)'/g)].map((x) => x[1]);
const TYPES = "\\('SITELINK', 'CALLOUT', 'STRUCTURED_SNIPPET'\\)";
const GERES = ['SITELINK', 'CALLOUT', 'STRUCTURED_SNIPPET'];

/** Les requêtes GAQL des outils, une par une. Une requête inconnue fait échouer le test : elle se voit. */
const repondreGaql = (e: Etat, q: string): unknown[] => {
  let m: RegExpExecArray | null;
  const ligneAsset = (id: string) => ({ asset: { id, ...e.assets[id] } });
  const vivants = (niveau: Lien['niveau'], f: (l: Lien) => boolean) => e.liens.filter((l) => l.niveau === niveau && GERES.includes(l.fieldType) && l.status !== 'REMOVED' && f(l));

  if ((m = /FROM campaign WHERE campaign\.id = (\d+)$/.exec(q))) return e.campagnes[m[1]] ? [{ campaign: { id: m[1], ...e.campagnes[m[1]] } }] : [];
  if ((m = /FROM ad_group WHERE ad_group\.id = (\d+)$/.exec(q))) {
    const g = e.groupes[m[1]];
    return g ? [{ adGroup: { id: m[1], name: g.name, status: g.status }, campaign: { id: g.campagne, ...e.campagnes[g.campagne] } }] : [];
  }
  if (new RegExp(`FROM asset WHERE asset\\.type IN ${TYPES}$`).test(q)) return Object.keys(e.assets).filter((id) => GERES.includes(e.assets[id].type)).map(ligneAsset);
  if ((m = /FROM asset WHERE asset\.id = (\d+)$/.exec(q))) return e.assets[m[1]] ? [ligneAsset(m[1])] : [];
  if (new RegExp(`FROM customer_asset WHERE customer_asset\\.field_type IN ${TYPES} AND customer_asset\\.status != 'REMOVED'$`).test(q)) {
    return vivants('compte', () => true).map((l) => ({ asset: { id: l.asset }, customerAsset: { fieldType: l.fieldType, status: l.status } }));
  }
  if ((m = new RegExp(`FROM campaign_asset WHERE campaign\\.id = (\\d+) AND campaign_asset\\.field_type IN ${TYPES} AND campaign_asset\\.status != 'REMOVED'$`).exec(q))) {
    return vivants('campagne', (l) => l.cible === m![1]).map((l) => ({ asset: { id: l.asset }, campaignAsset: { fieldType: l.fieldType, status: l.status } }));
  }
  const ligneGroupe = (l: Lien) => ({ adGroup: { id: l.cible, name: e.groupes[l.cible].name }, asset: { id: l.asset }, adGroupAsset: { fieldType: l.fieldType, status: l.status } });
  if ((m = new RegExp(`FROM ad_group_asset WHERE ad_group\\.id = (\\d+) AND ad_group_asset\\.field_type IN ${TYPES} AND ad_group_asset\\.status != 'REMOVED'$`).exec(q))) {
    return vivants('groupe', (l) => l.cible === m![1]).map(ligneGroupe);
  }
  if ((m = new RegExp(`FROM ad_group_asset WHERE ad_group\\.campaign = 'customers/${COMPTE}/campaigns/(\\d+)' AND ad_group_asset\\.field_type IN ${TYPES} AND ad_group_asset\\.status != 'REMOVED'$`).exec(q))) {
    return vivants('groupe', (l) => e.groupes[l.cible].campagne === m![1]).map(ligneGroupe);
  }
  if ((m = /FROM campaign_asset WHERE campaign_asset\.resource_name IN \((.+)\)$/.exec(q))) {
    return e.liens.filter((l) => l.niveau === 'campagne' && noms(m![1]).includes(rn.campagne(l.cible, l.asset, l.fieldType)))
      .map((l) => ({ campaignAsset: { resourceName: rn.campagne(l.cible, l.asset, l.fieldType), fieldType: l.fieldType, status: l.status } }));
  }
  if ((m = /FROM ad_group_asset WHERE ad_group_asset\.resource_name IN \((.+)\)$/.exec(q))) {
    return e.liens.filter((l) => l.niveau === 'groupe' && noms(m![1]).includes(rn.groupe(l.cible, l.asset, l.fieldType)))
      .map((l) => ({ adGroupAsset: { resourceName: rn.groupe(l.cible, l.asset, l.fieldType), fieldType: l.fieldType, status: l.status } }));
  }
  throw new Error(`Requête non simulée : ${q}`);
};

/** `:mutate`, comme Google : tout ou rien ; une association qui existe déjà est une erreur. `validateOnly` ne garde rien. */
const repondreMutation = (e: Etat, service: string, corps: { operations?: any[]; mutateOperations?: any[]; validateOnly: boolean }): Response => {
  const copie: Etat = structuredClone(e);
  const rendus: string[] = [];
  const temporaires = new Map<string, string>();
  const lier = (niveau: 'campagne' | 'groupe', c: any) => {
    const cible = /(?:campaigns|adGroups)\/(\d+)$/.exec(c.campaign ?? c.adGroup)![1];
    const asset = temporaires.get(c.asset) ?? /assets\/(\d+)$/.exec(c.asset)![1];
    if (copie.liens.some((l) => l.niveau === niveau && l.cible === cible && l.asset === asset && l.fieldType === c.fieldType && l.status !== 'REMOVED')) return false;
    copie.liens.push({ niveau, cible, asset, fieldType: c.fieldType, status: c.status ?? 'ENABLED' });
    rendus.push((niveau === 'campagne' ? rn.campagne : rn.groupe)(cible, asset, c.fieldType));
    return true;
  };
  for (const op of corps.operations ?? corps.mutateOperations ?? []) {
    if (service === 'googleAds' && op.assetOperation) {
      const { resourceName, ...asset } = op.assetOperation.create;
      const id = String(copie.suivant++);
      const type = asset.sitelinkAsset ? 'SITELINK' : asset.calloutAsset ? 'CALLOUT' : 'STRUCTURED_SNIPPET';
      copie.assets[id] = { type, ...asset };
      temporaires.set(resourceName, id);
      rendus.push(`customers/${COMPTE}/assets/${id}`);
    } else if ((service === 'googleAds' && op.campaignAssetOperation) || (service === 'campaignAssets' && op.create)) {
      if (!lier('campagne', op.campaignAssetOperation?.create ?? op.create)) return erreurAds({ campaignAssetError: 'DUPLICATE' }, 'Déjà associé.');
    } else if ((service === 'googleAds' && op.adGroupAssetOperation) || (service === 'adGroupAssets' && op.create)) {
      if (!lier('groupe', op.adGroupAssetOperation?.create ?? op.create)) return erreurAds({ adGroupAssetError: 'DUPLICATE' }, 'Déjà associé.');
    } else if ((service === 'campaignAssets' || service === 'adGroupAssets') && op.remove) {
      const niveau = service === 'campaignAssets' ? 'campagne' : 'groupe';
      const l = copie.liens.find((x) => x.niveau === niveau && (niveau === 'campagne' ? rn.campagne : rn.groupe)(x.cible, x.asset, x.fieldType) === op.remove && x.status !== 'REMOVED');
      if (!l) return erreurAds({ mutateError: 'RESOURCE_NOT_FOUND' }, 'Introuvable.');
      l.status = 'REMOVED';
      rendus.push(op.remove);
    } else {
      throw new Error(`Mutation non simulée : ${service} ${JSON.stringify(op)}`);
    }
  }
  if (corps.validateOnly) return Response.json({});
  Object.assign(e, copie);
  return service === 'googleAds'
    ? Response.json({ mutateOperationResponses: rendus.map((resourceName) => ({ resultat: { resourceName } })) })
    : reponse(rendus.map((resourceName) => ({ resourceName })));
};

const simulerCompte = (etat: Etat = etatInitial()) => {
  const appels = simulerFetch(({ url, corps }) => {
    if (url.endsWith(':search')) return reponse(repondreGaql(etat, JSON.parse(corps).query));
    if (url.endsWith(':mutate')) return repondreMutation(etat, url.slice(url.lastIndexOf('/') + 1).replace(':mutate', ''), JSON.parse(corps));
    return undefined;
  });
  return { appels, etat };
};

type Mutation = { service: string; validateOnly: boolean; operations: Record<string, any>[] };
const mutations = (appels: Appel[]): Mutation[] => appels
  .filter((a) => a.url.endsWith(':mutate'))
  .map((a) => {
    const c = JSON.parse(a.corps);
    return { service: a.url.slice(a.url.lastIndexOf('/') + 1).replace(':mutate', ''), validateOnly: c.validateOnly, operations: c.operations ?? c.mutateOperations };
  });
const executions = (appels: Appel[]) => mutations(appels).filter((m) => !m.validateOnly);

const jetonDe = (corps: any) => /jeton = "([^"]+)"/.exec(texteDe(corps))?.[1];
const apercu = async (env: EnvFactice, outil: string, args: Record<string, unknown>) => texteDe((await appelerOutil(env, outil, args, LIRE_ECRIRE)).corps);

const apercuPuisExecution = async (env: EnvFactice, outil: string, args: Record<string, unknown>) => {
  const a = await appelerOutil(env, outil, args, LIRE_ECRIRE);
  const jeton = jetonDe(a.corps);
  const execution = await appelerOutil(env, outil, { ...args, jeton }, LIRE_ECRIRE);
  return { apercu: texteDe(a.corps), jeton, execution: texteDe(execution.corps) };
};

const LIEN = { texte: 'Les séances', description1: 'Une heure, en cabinet', description2: 'Ou en visioconférence', url_finale: 'https://luminose.fr/seances/' };
const EXTRAIT = { en_tete: 'Catalogue de services', valeurs: ['Hypnose', 'Psychopraticien', 'Respiration'] };

/** Un appel de chaque outil, valide sur le compte de départ. */
const APPELS: [string, Record<string, unknown>][] = [
  ['ads_elements_creer', { campagne: '113', liens_annexes: [LIEN], accroches: ['Premier échange offert'], extraits: [EXTRAIT] }],
  ['ads_elements_associer', { asset: QUARTIERS, campagne: '113' }],
  ['ads_elements_dissocier', { asset: '7002', campagne: '111' }],
];

// ── L'aperçu ─────────────────────────────────────────────────────────────

describe('NORMATIF — un aperçu ne modifie rien', () => {
  it('pour chaque outil : Google vérifie à blanc, le compte et le journal restent tels quels', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerCompte();
    const avant = structuredClone(etat);
    for (const [outil, args] of APPELS) {
      const { corps } = await appelerOutil(env, outil, args, LIRE_ECRIRE);
      expect(corps.result.isError, `${outil} : ${texteDe(corps)}`).toBeUndefined();
      expect(texteDe(corps), outil).toMatch(/^APERÇU — rien n'a été modifié/);
      expect(jetonDe(corps), outil).toBeTruthy();
    }
    expect(etat).toEqual(avant);
    expect(mutations(appels).map((m) => m.validateOnly)).toEqual([true, true, true]);
    expect(env.DB.lignes()).toEqual([]);
  });

  it('sans le scope ads:ecrire, aucun outil n’appelle Google', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    for (const [outil, args] of APPELS) {
      const { corps } = await appelerOutil(env, outil, args, ['ads:lire']);
      expect(texteDe(corps), outil).toMatch(/L'écriture n'est pas accordée à cette connexion/);
    }
    expect(appels).toEqual([]);
  });

  it('l’exécution fait ce que l’aperçu a montré, et le journal le garde', async () => {
    const env = creerEnv();
    const { etat } = simulerCompte();
    for (const [outil, args] of APPELS) {
      const { execution } = await apercuPuisExecution(env, outil, args);
      expect(execution, outil).toMatch(/^FAIT — écriture n° \d+ du journal/);
    }
    expect(etat.liens.filter((l) => l.niveau === 'campagne' && l.cible === '113' && l.status === 'PAUSED').map((l) => l.fieldType))
      .toEqual(['CALLOUT', 'SITELINK', 'CALLOUT', 'STRUCTURED_SNIPPET', 'STRUCTURED_SNIPPET']);
    expect(etat.liens.find((l) => l.niveau === 'campagne' && l.cible === '111' && l.asset === '7002')?.status).toBe('REMOVED');
    expect(env.DB.lignes().map((l) => [l.outil, l.issue])).toEqual(APPELS.map(([outil]) => [outil, 'ok']));
  });
});

// ── Le jeton ─────────────────────────────────────────────────────────────

describe('NORMATIF — un jeton ne vaut que pour ses arguments exacts, une fois, dix minutes', () => {
  it('d’autres arguments : refusé, rien ne part', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    const [, creer] = APPELS[0];
    const jeton = jetonDe((await appelerOutil(env, 'ads_elements_creer', creer, LIRE_ECRIRE)).corps);
    for (const args of [
      { ...creer, accroches: ['Premier échange offert !'] },
      { ...creer, accroches: ['Premier échange offert', 'Sur rendez-vous'] },
      { ...creer, liens_annexes: [{ ...LIEN, url_finale: 'https://luminose.fr/tarifs/' }] },
      { ...creer, extraits: [{ ...EXTRAIT, valeurs: ['Hypnose', 'Respiration', 'Psychopraticien'] }] },
      { ...creer, campagne: undefined, groupe: '446' },
    ]) {
      const { corps } = await appelerOutil(env, 'ads_elements_creer', { ...args, jeton }, LIRE_ECRIRE);
      expect(texteDe(corps), JSON.stringify(args)).toMatch(/diffère de celui de l'aperçu/);
    }
    const voisin = await appelerOutil(env, 'ads_elements_associer', { asset: QUARTIERS, campagne: '113', jeton }, LIRE_ECRIRE);
    expect(texteDe(voisin.corps)).toMatch(/Jeton d'aperçu invalide pour cet outil/);

    const jetonAssocier = jetonDe((await appelerOutil(env, 'ads_elements_associer', { asset: QUARTIERS, campagne: '113' }, LIRE_ECRIRE)).corps);
    for (const args of [{ asset: QUARTIERS, campagne: '111' }, { asset: '7001', campagne: '113' }, { asset: QUARTIERS, groupe: '446' }]) {
      const { corps } = await appelerOutil(env, 'ads_elements_associer', { ...args, jeton: jetonAssocier }, LIRE_ECRIRE);
      expect(texteDe(corps), JSON.stringify(args)).toMatch(/diffère de celui de l'aperçu/);
    }
    expect(executions(appels)).toEqual([]);
    expect(env.DB.lignes()).toEqual([]);
  });

  it('le jeton couvre aussi ce que l’aperçu a écarté comme doublon', async () => {
    // Le doublon ne produit aucune opération : sans la demande dans l'empreinte,
    // le remplacer par un autre texte donnerait les mêmes opérations — et il se perdrait.
    const env = creerEnv();
    const { appels } = simulerCompte();
    const args = { campagne: '113', accroches: ['Séance en cabinet', 'Sur rendez-vous'] };
    const jeton = jetonDe((await appelerOutil(env, 'ads_elements_creer', args, LIRE_ECRIRE)).corps);
    const { corps } = await appelerOutil(env, 'ads_elements_creer', { ...args, accroches: ['Accompagnement du deuil', 'Sur rendez-vous'], jeton }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/diffère de celui de l'aperçu/);
    expect(executions(appels)).toEqual([]);
  });

  it('une fois — même quand le compte redonnerait à faire', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerCompte();
    const args = { asset: '7002', campagne: '111' };
    const { jeton, execution } = await apercuPuisExecution(env, 'ads_elements_dissocier', args);
    expect(execution).toMatch(/^FAIT/);
    etat.liens.push({ niveau: 'campagne', cible: '111', asset: '7002', fieldType: 'CALLOUT', status: 'ENABLED' });
    const { corps } = await appelerOutil(env, 'ads_elements_dissocier', { ...args, jeton }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/déjà servi/);
    expect(executions(appels)).toHaveLength(1);
  });

  it('dix minutes', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    const args = { asset: QUARTIERS, campagne: '113' };
    const jeton = jetonDe((await appelerOutil(env, 'ads_elements_associer', args, LIRE_ECRIRE)).corps);
    vi.useFakeTimers({ now: Date.now() + 10 * 60 * 1000 + 1000 });
    const { corps } = await appelerOutil(env, 'ads_elements_associer', { ...args, jeton }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/expiré/);
    expect(executions(appels)).toEqual([]);
  });
});

// ── Les limites de Google ────────────────────────────────────────────────

describe('les limites de Google, comptées en caractères affichés', () => {
  const refus = async (args: Record<string, unknown>) => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    const t = await apercu(env, 'ads_elements_creer', { campagne: '113', ...args });
    expect(appels, t).toEqual([]);
    return t;
  };
  const passe = async (args: Record<string, unknown>) => {
    const env = creerEnv();
    simulerCompte();
    const t = await apercu(env, 'ads_elements_creer', { campagne: '113', ...args });
    expect(t).toMatch(/^APERÇU/);
    return t;
  };
  const n = (k: number, base = 'é') => base.repeat(k);

  it('sont celles de la documentation, à un seul endroit', () => {
    expect(LIMITES_ELEMENTS).toEqual({ lien: 25, lienDescription: 35, accroche: 25, valeur: 25, valeursMin: 3, valeursMax: 10 });
    expect(EN_TETES_EXTRAITS).toContain('Quartiers');
    expect(EN_TETES_EXTRAITS).toContain('Catalogue de services');
    expect(EN_TETES_EXTRAITS).toHaveLength(13);
  });

  it('lien annexe : texte 25, descriptions 35 — un caractère accentué compte pour un', async () => {
    await passe({ liens_annexes: [{ ...LIEN, texte: n(25), description1: n(35), description2: n(35) }] });
    expect(await refus({ liens_annexes: [{ ...LIEN, texte: n(26) }] })).toMatch(/- lien annexe « é+ » : 26 caractères — 25 au plus\./);
    expect(await refus({ liens_annexes: [{ ...LIEN, description2: n(36) }] })).toMatch(/- description du lien « Les séances » « é+ » : 36 caractères — 35 au plus\./);
  });

  it('lien annexe : les deux descriptions, ou aucune', async () => {
    await passe({ liens_annexes: [{ texte: 'Les séances', url_finale: 'https://www.luminose.fr/seances/' }] });
    expect(await refus({ liens_annexes: [{ texte: 'Les séances', description1: 'Une heure', url_finale: 'https://luminose.fr/seances/' }] }))
      .toMatch(/les deux descriptions, ou aucune — Google n'en admet pas une seule/);
  });

  it('lien annexe : une URL finale sur luminose.fr, sans sous-domaine', async () => {
    for (const url_finale of ['http://luminose.fr/seances/', 'https://passage.luminose.fr/', 'https://luminose.fr.exemple.com/', 'https://exemple.fr/']) {
      expect(await refus({ liens_annexes: [{ ...LIEN, url_finale }] }), url_finale).toMatch(/URL « .+ » refusée — https:\/\/www\.luminose\.fr\/… ou https:\/\/luminose\.fr\/…/);
    }
  });

  it('accroche : 25', async () => {
    await passe({ accroches: [n(25)] });
    expect(await refus({ accroches: [n(26)] })).toMatch(/- accroche « é+ » : 26 caractères — 25 au plus\./);
  });

  it('extrait structuré : 3 à 10 valeurs de 25, distinctes, sous un en-tête de la liste de Google', async () => {
    const valeurs = (k: number) => Array.from({ length: k }, (_, i) => `Valeur ${i + 1}`);
    await passe({ extraits: [{ en_tete: 'Types', valeurs: valeurs(3) }] });
    await passe({ extraits: [{ en_tete: 'Types', valeurs: valeurs(10) }] });
    expect(await refus({ extraits: [{ en_tete: 'Types', valeurs: valeurs(2) }] })).toMatch(/- extrait « Types » : 2 valeurs — de 3 à 10\./);
    expect(await refus({ extraits: [{ en_tete: 'Types', valeurs: valeurs(11) }] })).toMatch(/- extrait « Types » : 11 valeurs — de 3 à 10\./);
    expect(await refus({ extraits: [{ en_tete: 'Types', valeurs: ['Hypnose', 'Respiration', n(26)] }] }))
      .toMatch(/- valeur de l'extrait « Types » « é+ » : 26 caractères — 25 au plus\./);
    expect(await refus({ extraits: [{ en_tete: 'Types', valeurs: ['Hypnose', 'hypnose', 'Respiration'] }] })).toMatch(/une valeur en double/);
    expect(await refus({ extraits: [{ en_tete: 'Services', valeurs: valeurs(3) }] })).toMatch(/Arguments invalides pour ads_elements_creer/);
  });

  it('tout est dit d’un coup, et rien ne part', async () => {
    const t = await refus({ liens_annexes: [{ ...LIEN, texte: n(26), url_finale: 'https://exemple.fr/' }], accroches: [n(26)] });
    expect(t).toMatch(/^Éléments refusés, rien n’est parti :/);
    expect(t.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(3);
  });

  it('une cible, et une seule : campagne ou groupe', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    expect(await apercu(env, 'ads_elements_creer', { accroches: ['Sur rendez-vous'] })).toMatch(/Une cible : `campagne` OU `groupe`/);
    expect(await apercu(env, 'ads_elements_creer', { campagne: '113', groupe: '446', accroches: ['Sur rendez-vous'] })).toMatch(/Une cible : `campagne` OU `groupe`/);
    expect(await apercu(env, 'ads_elements_creer', { campagne: '222', accroches: ['Sur rendez-vous'] })).toMatch(/n'est pas une campagne Search/);
    expect(await apercu(env, 'ads_elements_associer', { asset: QUARTIERS, groupe: '999' })).toMatch(/Groupe d'annonces 999 introuvable/);
    expect(mutations(appels)).toEqual([]);
  });
});

// ── Le filtre déontologique ──────────────────────────────────────────────

describe('NORMATIF — le filtre des annonces, pour chaque texte d’élément', () => {
  it('un terme interdit fait refuser, où qu’il soit ; une accolade aussi', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    const cas: [Record<string, unknown>, RegExp][] = [
      [{ accroches: ['Guérison durable'] }, /accroche « Guérison durable » : texte refusé par le filtre déontologique — guéri…/],
      [{ liens_annexes: [{ ...LIEN, description2: 'Résultat garanti' }] }, /lien annexe « Les séances ».+ : texte refusé par le filtre déontologique — garanti…/],
      [{ extraits: [{ en_tete: 'Types', valeurs: ['Hypnose', 'Soigner le stress', 'Respiration'] }] }, /extrait structuré Types : .+ : texte refusé par le filtre déontologique — soign…/],
      [{ accroches: ['{KeyWord:Hypnose}'] }, /pas d'accolades — l'insertion de mot-clé n'existe que dans les annonces/],
    ];
    for (const [args, motif] of cas) expect(await apercu(env, 'ads_elements_creer', { campagne: '113', ...args }), JSON.stringify(args)).toMatch(motif);
    expect(appels).toEqual([]);
  });

  it('« hypnothérapeute » avertit ; un lien annexe vers une page de breathwork rappelle le questionnaire de santé', async () => {
    const env = creerEnv();
    simulerCompte();
    const t = await apercu(env, 'ads_elements_creer', {
      campagne: '113',
      accroches: ['Hypnothérapeute à Lyon'],
      liens_annexes: [
        { texte: 'Respiration', url_finale: 'https://luminose.fr/respiration-holotropique/' },
        { texte: 'Le breathwork', url_finale: 'https://www.luminose.fr/breathwork' },
      ],
    });
    expect(t).toMatch(/^APERÇU/);
    expect(t).toMatch(/AVERTISSEMENTS — à relire avant de valider :/);
    expect(t).toMatch(/- accroche « Hypnothérapeute à Lyon » : « hypnothérapeute » : l'hypnose est un outil, pas un titre \(socle\/identite\.md\)/);
    expect(t).toMatch(/le lien annexe « Respiration » mène à une page de breathwork : le cadre déontologique exige que toute promotion du breathwork mentionne le questionnaire de santé préalable/);
    expect(t).toMatch(/le lien annexe « Le breathwork » mène à une page de breathwork/);
  });

  it('associer : refuse un élément au texte interdit, un lien hors de luminose.fr, un autre type', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    expect(await apercu(env, 'ads_elements_associer', { asset: '7005', campagne: '113' })).toMatch(/L'élément 7005 porte un texte refusé par le filtre déontologique/);
    expect(await apercu(env, 'ads_elements_associer', { asset: '7006', campagne: '113' })).toMatch(/mène à « https:\/\/passage\.luminose\.fr\/ » : hors de luminose\.fr/);
    expect(await apercu(env, 'ads_elements_associer', { asset: '7007', campagne: '113' })).toMatch(/de type IMAGE : ce serveur ne gère que les liens annexes, accroches et extraits structurés/);
    expect(await apercu(env, 'ads_elements_associer', { asset: '12345', campagne: '113' })).toMatch(/Élément 12345 introuvable/);
    expect(mutations(appels)).toEqual([]);
  });

  it('associer un lien annexe de breathwork : l’avertissement aussi', async () => {
    const env = creerEnv();
    simulerCompte();
    expect(await apercu(env, 'ads_elements_associer', { asset: '7004', campagne: '113' })).toMatch(/mène à une page de breathwork/);
  });
});

// ── Les doublons ─────────────────────────────────────────────────────────

describe('les doublons : l’existant est proposé à l’association, pas recréé', () => {
  it('un élément identique du compte est écarté, avec l’appel qui l’associerait ; le reste part', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerCompte();
    const { apercu: a, execution } = await apercuPuisExecution(env, 'ads_elements_creer', {
      groupe: '446', accroches: ['Séance  en cabinet', 'Sur rendez-vous'],
      extraits: [{ en_tete: 'Quartiers', valeurs: ['Presqu’île', 'Croix-Rousse', 'Part-Dieu'] }],
    });
    expect(a).toMatch(/DOUBLONS — déjà dans le compte, écartés : les associer plutôt que les recréer \(2\) :/);
    expect(a).toMatch(/- accroche « Séance en cabinet » — ads_elements_associer \{ asset: "7002", groupe: "446" \}/);
    expect(a).toMatch(new RegExp(`- extrait structuré Quartiers : Presqu’île, Croix-Rousse, Part-Dieu — ads_elements_associer \\{ asset: "${QUARTIERS}", groupe: "446" \\}`));
    expect(a).toMatch(/^1 élément d'annonce créé et associé EN PAUSE au groupe « Insomnie »/m);
    expect(execution).toMatch(/^FAIT/);
    const [faite] = executions(appels);
    expect(faite.operations.map((o) => o.assetOperation?.create.calloutAsset?.calloutText).filter(Boolean)).toEqual(['Sur rendez-vous']);
    expect(Object.values(etat.assets).filter((x) => x.calloutAsset?.calloutText === 'Séance en cabinet')).toHaveLength(1);
  });

  it('rien que des doublons : refus à l’aperçu, avec les appels qui les associeraient ; rien ne part', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    const t = await apercu(env, 'ads_elements_creer', { campagne: '113', accroches: ['Séance en cabinet'] });
    expect(t).toMatch(/Rien à créer : chaque élément existe déjà dans le compte\. Les associer plutôt :\n- accroche « Séance en cabinet » — ads_elements_associer \{ asset: "7002", campagne: "113" \}/);
    expect(mutations(appels)).toEqual([]);
  });

  it('presque des doublons — même texte à la casse près, même lien vers une autre page : signalés, pas écartés', async () => {
    const env = creerEnv();
    simulerCompte();
    const t = await apercu(env, 'ads_elements_creer', {
      campagne: '113', accroches: ['séance en cabinet'],
      liens_annexes: [{ texte: 'Prendre rendez-vous', url_finale: 'https://luminose.fr/contact/' }],
    });
    expect(t).toMatch(/^2 éléments d'annonce créés/m);
    expect(t).toMatch(/PRESQUE DES DOUBLONS — à vérifier :/);
    expect(t).toMatch(/- accroche « séance en cabinet » : le compte a déjà « Séance en cabinet » \(élément 7002\) — ads_elements_associer \{ asset: "7002", campagne: "113" \} s'il fait l'affaire\./);
    expect(t).toMatch(/- lien annexe « Prendre rendez-vous » → https:\/\/luminose\.fr\/contact\/ : le compte a déjà « Prendre rendez-vous » \(Première séance de rencontre \/ En cabinet à Lyon\) → https:\/\/luminose\.fr\/rendez-vous\/ \(élément 7001\)/);
  });

  it('un doublon écarté à l’aperçu n’est jamais envoyé, même s’il a disparu à l’exécution', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerCompte();
    const args = { campagne: '113', accroches: ['Séance en cabinet', 'Sur rendez-vous'] };
    const jeton = jetonDe((await appelerOutil(env, 'ads_elements_creer', args, LIRE_ECRIRE)).corps);
    delete etat.assets[7002];
    await appelerOutil(env, 'ads_elements_creer', { ...args, jeton }, LIRE_ECRIRE);
    expect(executions(appels).map((m) => m.operations.flatMap((o) => o.assetOperation ? [o.assetOperation.create.calloutAsset.calloutText] : []))).toEqual([['Sur rendez-vous']]);
  });

  it('un élément en double dans la demande est refusé', async () => {
    const env = creerEnv();
    simulerCompte();
    expect(await apercu(env, 'ads_elements_creer', { campagne: '113', accroches: ['Sur rendez-vous', 'Sur  rendez-vous'] })).toMatch(/en double dans la demande/);
  });

  it('associer : un élément déjà associé à la cible, en pause ou non, est refusé', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    expect(await apercu(env, 'ads_elements_associer', { asset: '7002', campagne: '111' })).toMatch(/L'élément 7002 est déjà associé à la campagne « Troubles anxieux » \(111\) \(association active\) : rien à faire/);
    expect(await apercu(env, 'ads_elements_associer', { asset: '7003', campagne: '113' })).toMatch(/\(association en pause\) : rien à faire/);
    expect(mutations(appels)).toEqual([]);
  });
});

// ── Les niveaux : compte, campagne, groupe ───────────────────────────────

describe('l’aperçu dit ce qui est en place, et ce qui masque ou serait masqué — le niveau le plus fin l’emporte', () => {
  it('vers un groupe : ce que la campagne et le compte affichent aujourd’hui, et ce qui serait masqué', async () => {
    const env = creerEnv();
    simulerCompte();
    const t = await apercu(env, 'ads_elements_creer', { groupe: '444', accroches: ['Sur rendez-vous'] });
    expect(t).toMatch(/Aucune accroche déjà associée au groupe « Anxiété » \(444, campagne « Troubles anxieux »\)\./);
    expect(t).toMatch(/Accroches de la campagne \(1\) : elles s'affichent aujourd'hui pour ce groupe, et y seront masquées dès qu'une accroche de ce groupe sera active\./);
    expect(t).toMatch(/Accroches du compte \(1\) : déjà masquées pour ce groupe par un niveau plus fin\./);
  });

  it('vers un groupe qui a déjà les siens : ceux du dessus sont déjà masqués', async () => {
    const env = creerEnv();
    simulerCompte();
    const t = await apercu(env, 'ads_elements_creer', { groupe: '445', accroches: ['Sur rendez-vous'] });
    expect(t).toMatch(/Accroches déjà associées au groupe « Phobies » \(445, campagne « Troubles anxieux »\) \(1\) :\n- « Séance en cabinet » \(élément 7002, association active\)/);
    expect(t).toMatch(/Accroches de la campagne \(1\) : déjà masquées pour ce groupe par un niveau plus fin\./);
  });

  it('vers une campagne : le compte serait masqué, et les groupes qui ont les leurs ne verront pas les nouveaux', async () => {
    const env = creerEnv();
    simulerCompte();
    const t = await apercu(env, 'ads_elements_creer', { campagne: '111', accroches: ['Sur rendez-vous'], liens_annexes: [LIEN] });
    expect(t).toMatch(/Accroches déjà associées à la campagne « Troubles anxieux » \(111\) \(1\) :/);
    expect(t).toMatch(/Accroches du compte \(1\) : déjà masquées pour cette campagne par un niveau plus fin\./);
    expect(t).toMatch(/Ces groupes ont leurs propres accroches, qui masquent celles de la campagne : les nouvelles ne s'y afficheront pas — « Phobies » \(445\) : 1\./);
    expect(t).toMatch(/Liens annexes déjà associés à la campagne « Troubles anxieux » \(111\) \(1\) :\n- « Prendre rendez-vous » \(Première séance de rencontre \/ En cabinet à Lyon\) → https:\/\/luminose\.fr\/rendez-vous\/ \(élément 7001, association active\)/);
  });

  it('une association en pause ne masque rien', async () => {
    const env = creerEnv();
    simulerCompte();
    // La campagne 113 a une accroche, mais en pause : celles du compte s'affichent.
    const t = await apercu(env, 'ads_elements_creer', { campagne: '113', accroches: ['Sur rendez-vous'] });
    expect(t).toMatch(/Accroches déjà associées à la campagne « Sommeil » \(113\) \(1\) :\n- « Cabinet à Lyon » \(élément 7003, association en pause\)/);
    expect(t).toMatch(/Accroches du compte \(1\) : elles s'affichent aujourd'hui pour cette campagne, et y seront masquées/);
  });

  it('dissocier : ce qui reste, ou qui prend le relais', async () => {
    const env = creerEnv();
    simulerCompte();
    const t = await apercu(env, 'ads_elements_dissocier', { asset: '7002', campagne: '111' });
    expect(t).toMatch(/RETRAIT de l'association de l'accroche « Séance en cabinet » \(élément 7002, association active\) à la campagne « Troubles anxieux » \(111\)\./);
    expect(t).toMatch(/L'élément reste dans le compte, et ses autres associations aussi\./);
    expect(t).toMatch(/Plus aucune accroche active à ce niveau : celles du compte prendront le relais pour cette campagne :\n- « Cabinet à Lyon » \(élément 7003, association active\)/);
    const groupe = await apercu(env, 'ads_elements_dissocier', { asset: '7002', groupe: '445' });
    expect(groupe).toMatch(/celles de la campagne prendront le relais pour ce groupe :\n- « Séance en cabinet »/);
    const pause = await apercu(env, 'ads_elements_dissocier', { asset: '7003', campagne: '113' });
    expect(pause).toMatch(/L'association était en pause : l'affichage ne change pas\./);
    const sitelink = await apercu(env, 'ads_elements_dissocier', { asset: '7001', campagne: '111' });
    expect(sitelink).toMatch(/Plus aucun lien annexe actif à ce niveau ni au-dessus : cette campagne n'en affichera plus\./);
  });
});

// ── Rien ne naît actif ; l'élément ne se supprime pas ────────────────────

describe('NORMATIF — chaque association naît en pause, et un retrait ne vise que l’association', () => {
  it('créer : une requête atomique, les éléments puis leurs associations, toutes EN PAUSE vers la seule cible', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    const { execution } = await apercuPuisExecution(env, 'ads_elements_creer', { groupe: '446', liens_annexes: [LIEN], accroches: ['Sur rendez-vous'], extraits: [EXTRAIT] });
    expect(execution).toMatch(/3 éléments créés et associés EN PAUSE au groupe « Insomnie »/);
    const [faite] = executions(appels);
    expect(faite.service).toBe('googleAds');
    expect(faite.operations.map((o) => Object.keys(o)[0])).toEqual(['assetOperation', 'assetOperation', 'assetOperation', 'adGroupAssetOperation', 'adGroupAssetOperation', 'adGroupAssetOperation']);
    expect(faite.operations.slice(0, 3).map((o) => o.assetOperation.create)).toEqual([
      { resourceName: `customers/${COMPTE}/assets/-1`, finalUrls: ['https://luminose.fr/seances/'], sitelinkAsset: { linkText: 'Les séances', description1: 'Une heure, en cabinet', description2: 'Ou en visioconférence' } },
      { resourceName: `customers/${COMPTE}/assets/-2`, calloutAsset: { calloutText: 'Sur rendez-vous' } },
      { resourceName: `customers/${COMPTE}/assets/-3`, structuredSnippetAsset: { header: 'Catalogue de services', values: ['Hypnose', 'Psychopraticien', 'Respiration'] } },
    ]);
    expect(faite.operations.slice(3).map((o) => o.adGroupAssetOperation.create)).toEqual(['SITELINK', 'CALLOUT', 'STRUCTURED_SNIPPET'].map((fieldType, i) => ({
      adGroup: `customers/${COMPTE}/adGroups/446`, asset: `customers/${COMPTE}/assets/-${i + 1}`, fieldType, status: 'PAUSED',
    })));
  });

  it('associer : l’association seule, en pause — l’extrait « Quartiers » sans le recréer', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerCompte();
    const { apercu: a, execution } = await apercuPuisExecution(env, 'ads_elements_associer', { asset: QUARTIERS, campagne: '113' });
    expect(a).toMatch(new RegExp(`Associer l'extrait structuré Quartiers : Presqu’île, Croix-Rousse, Part-Dieu \\(élément ${QUARTIERS}\\) à la campagne « Sommeil » \\(113\\), EN PAUSE\\.`));
    expect(a).toMatch(/Aucun extrait structuré déjà associé à la campagne « Sommeil » \(113\)\./);
    expect(execution).toMatch(new RegExp(`Extrait structuré ${QUARTIERS} associé EN PAUSE`));
    expect(executions(appels)).toEqual([{ service: 'campaignAssets', validateOnly: false, operations: [{ create: {
      campaign: `customers/${COMPTE}/campaigns/113`, asset: `customers/${COMPTE}/assets/${QUARTIERS}`, fieldType: 'STRUCTURED_SNIPPET', status: 'PAUSED',
    } }] }]);
    expect(Object.keys(etat.assets)).toHaveLength(Object.keys(etatInitial().assets).length);
  });

  it('dissocier : le nom de l’association, jamais celui de l’élément ; l’élément reste', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerCompte();
    await apercuPuisExecution(env, 'ads_elements_dissocier', { asset: '7002', groupe: '445' });
    expect(executions(appels)).toEqual([{ service: 'adGroupAssets', validateOnly: false, operations: [{ remove: rn.groupe('445', '7002', 'CALLOUT') }] }]);
    expect(etat.assets[7002]).toBeDefined();
    expect(etat.liens.filter((l) => l.asset === '7002' && l.status !== 'REMOVED').map((l) => `${l.niveau}:${l.cible}`)).toEqual(['campagne:111']);
  });

  it('dissocier : refuse une association qui n’existe pas', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    expect(await apercu(env, 'ads_elements_dissocier', { asset: '7002', groupe: '444' })).toMatch(/L'élément 7002 n'est pas associé au groupe « Anxiété ».+ : rien à faire/);
    expect(mutations(appels)).toEqual([]);
  });

  it('aucun outil n’envoie ENABLED, ni de remove hors des associations d’éléments', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    for (const [outil, args] of APPELS) await apercuPuisExecution(env, outil, args);
    await apercuPuisExecution(env, 'ads_elements_associer', { asset: '7001', groupe: '446' });
    const ops = mutations(appels).flatMap((m) => m.operations.map((o) => ({ service: m.service, o })));
    for (const { service, o } of ops.filter(({ o }) => 'remove' in o)) expect(['campaignAssets', 'adGroupAssets']).toContain(service);
    expect(appels.filter((a) => a.url.endsWith(':mutate')).some((a) => /ENABLED/.test(a.corps))).toBe(false);
  });

  it('même construit par le code, un retrait d’association disparue ne part pas : c’est le compte qui le confirme', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    await expect(muter(env, COMPTE, 'campaignAssets', [{ remove: rn.campagne('113', '7001', 'SITELINK') }], true)).rejects.toThrow(/n'existe plus dans le compte/);
    await expect(muter(env, COMPTE, 'adGroupAssets', [{ remove: rn.groupe('445', '7003', 'CALLOUT') }], false)).rejects.toThrow(/n'existe plus dans le compte/);
    expect(mutations(appels)).toEqual([]);
  });

  it('le type vient du compte, pas du nom : un lien que le compte ne dit pas être d’un élément géré ne se retire pas', async () => {
    const env = creerEnv();
    const nom = rn.campagne('111', '7002', 'CALLOUT');
    const appels = simulerFetch(({ url }) => (url.endsWith(':search')
      ? reponse([{ campaignAsset: { resourceName: nom, fieldType: 'HEADLINE', status: 'ENABLED' } }])
      : url.endsWith(':mutate') ? Response.json({}) : undefined));
    await expect(muter(env, COMPTE, 'campaignAssets', [{ remove: nom }], true)).rejects.toThrow(/n'est pas le lien d'un élément d'annonce/);
    expect(mutations(appels)).toEqual([]);
  });

  it('la table : les formes d’association, et rien d’autre', () => {
    const campagne = `customers/${COMPTE}/campaigns/113`;
    const groupe = `customers/${COMPTE}/adGroups/446`;
    const asset = `customers/${COMPTE}/assets/7002`;
    const acceptees: [Parameters<typeof verifierOperation>[0], Operation][] = [
      ['campaignAssets', { create: { campaign: campagne, asset, fieldType: 'CALLOUT', status: 'PAUSED' } }],
      ['adGroupAssets', { create: { adGroup: groupe, asset, fieldType: 'SITELINK', status: 'PAUSED' } }],
      ['campaignAssets', { remove: rn.campagne('111', '7002', 'CALLOUT') }],
      ['adGroupAssets', { remove: rn.groupe('445', '7002', 'STRUCTURED_SNIPPET') }],
    ];
    for (const [service, op] of acceptees) expect(() => verifierOperation(service, op), JSON.stringify(op)).not.toThrow();

    const refusees: [Parameters<typeof verifierOperation>[0], unknown][] = [
      ['campaignAssets', { create: { campaign: campagne, asset, fieldType: 'CALLOUT', status: 'ENABLED' } }],
      ['campaignAssets', { create: { campaign: campagne, asset, fieldType: 'CALLOUT' } }],
      ['campaignAssets', { create: { campaign: campagne, asset, fieldType: 'HEADLINE', status: 'PAUSED' } }],
      ['campaignAssets', { create: { campaign: groupe, asset, fieldType: 'CALLOUT', status: 'PAUSED' } }],
      ['adGroupAssets', { create: { campaign: campagne, asset, fieldType: 'CALLOUT', status: 'PAUSED' } }],
      ['campaignAssets', { update: { resourceName: rn.campagne('111', '7002', 'CALLOUT'), status: 'ENABLED' }, updateMask: 'status' }],
      ['campaignAssets', { remove: rn.campagne('111', '7002', 'HEADLINE') }],
      ['campaignAssets', { remove: asset }],
      ['adGroupAssets', { remove: rn.campagne('111', '7002', 'CALLOUT') }],
    ];
    for (const [service, op] of refusees) {
      expect(() => verifierOperation(service, op as Operation), JSON.stringify(op)).toThrow(/table fermée/);
    }
  });

  it('la création d’éléments : chaque élément conforme, chacun associé une fois, en pause, à une seule cible', () => {
    const tmp = (i: number) => `customers/${COMPTE}/assets/-${i}`;
    const accroche = (i: number, calloutText = 'Sur rendez-vous') => ({ assetOperation: { create: { resourceName: tmp(i), calloutAsset: { calloutText } } } });
    const lien = (i: number, extra: Record<string, unknown> = {}) => ({ campaignAssetOperation: { create: {
      campaign: `customers/${COMPTE}/campaigns/113`, asset: tmp(i), fieldType: 'CALLOUT', status: 'PAUSED', ...extra,
    } } });
    expect(() => verifierCreationElements([accroche(1), accroche(2, 'Cabinet en ville'), lien(1), lien(2)])).not.toThrow();
    const sitelink = (sitelinkAsset: Record<string, unknown>, finalUrls = ['https://luminose.fr/']) => ({ assetOperation: { create: { resourceName: tmp(1), finalUrls, sitelinkAsset } } });
    const lienSitelink = lien(1, { fieldType: 'SITELINK' });
    expect(() => verifierCreationElements([sitelink({ linkText: 'Séances' }), lienSitelink])).not.toThrow();

    const derives: Operation[][] = [
      [accroche(1), lien(1, { status: 'ENABLED' })],
      [accroche(1), lien(1, { fieldType: 'SITELINK' })],
      [accroche(1), accroche(2), lien(1), lien(1)],
      [accroche(1), accroche(2), lien(1), { adGroupAssetOperation: { create: { adGroup: `customers/${COMPTE}/adGroups/446`, asset: tmp(2), fieldType: 'CALLOUT', status: 'PAUSED' } } }],
      [accroche(1), accroche(2), lien(1), lien(2, { campaign: `customers/${COMPTE}/campaigns/111` })],
      [accroche(1)],
      [lien(1), accroche(1)],
      [{ assetOperation: { create: { resourceName: `customers/${COMPTE}/assets/7002`, calloutAsset: { calloutText: 'X y z' } } } }, lien(1)],
      [accroche(1, 'é'.repeat(26)), lien(1)],
      [accroche(1, 'Guérison durable'), lien(1)],
      [accroche(1, '{KeyWord:Hypnose}'), lien(1)],
      [sitelink({ linkText: 'Séances' }, ['https://passage.luminose.fr/']), lienSitelink],
      [sitelink({ linkText: 'Séances', description1: 'Une heure' }), lienSitelink],
      [sitelink({ linkText: 'Séances', description1: 'Une heure', description2: 'é'.repeat(36) }), lienSitelink],
      [{ assetOperation: { create: { resourceName: tmp(1), structuredSnippetAsset: { header: 'Services', values: ['a', 'b', 'c'] } } } }, lien(1, { fieldType: 'STRUCTURED_SNIPPET' })],
      [{ assetOperation: { create: { resourceName: tmp(1), structuredSnippetAsset: { header: 'Types', values: ['a', 'b'] } } } }, lien(1, { fieldType: 'STRUCTURED_SNIPPET' })],
      [{ assetOperation: { create: { resourceName: tmp(1), name: 'x', calloutAsset: { calloutText: 'Sur rendez-vous' } } } }, lien(1)],
      [{ assetOperation: { update: { resourceName: `customers/${COMPTE}/assets/7002`, calloutAsset: { calloutText: 'X' } }, updateMask: 'callout_asset.callout_text' } }, lien(1)],
      [accroche(1), lien(1), { campaignOperation: { update: { resourceName: `customers/${COMPTE}/campaigns/113`, status: 'ENABLED' }, updateMask: 'status' } }],
    ];
    for (const operations of derives) {
      expect(() => verifierCreationElements(operations), JSON.stringify(operations)).toThrow(/table fermée/);
    }
  });
});
