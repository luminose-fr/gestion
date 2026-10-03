/**
 * Les listes de mots-clés à exclure — décision du 03/10/2026
 * (workers/mcp/decisions/2026-10-03-listes-de-negatifs.md).
 *
 * Le compte simulé ici a un ÉTAT : une exécution le modifie, un aperçu non.
 * C'est ce qui permet de vérifier qu'un aperçu ne change rien, que les
 * doublons s'écartent, et qu'un changement survenu entre l'aperçu et
 * l'exécution — un appel concurrent — ne fait pas échouer ce qui reste à faire.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { LIMITES_LISTES, VERSION_API, muter, verifierCreationListe, verifierOperation, type Operation } from '../src/google-ads';
import { bloque, type MotCle } from '../src/negatifs';
import { COMPTE, LIRE_ECRIRE, appelerOutil, creerEnv, simulerFetch, texteDe as texteBrut, type Appel, type EnvFactice } from './aides';

/** « 5 000 » s'écrit avec une espace fine insécable : on la lit comme une espace. */
const texteDe = (corps: unknown) => texteBrut(corps).replace(/[  ]/g, ' ');

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

// ── Un compte à état ─────────────────────────────────────────────────────

type Etat = {
  campagnes: Record<string, { name: string; status: string; advertisingChannelType: string }>;
  listes: Record<string, { name: string; type: string; status: string }>;
  entrees: { liste: string; id: string; type: string; text?: string; matchType?: string }[];
  liens: { campagne: string; liste: string; status: string }[];
  criteres: { campagne: string; id: string; type: string; negative: boolean; text?: string; matchType?: string }[];
  positifs: { campagne: string; groupe: string; text: string; matchType: string; status: string }[];
  suivant: number;
};

const etatInitial = (): Etat => ({
  campagnes: {
    111: { name: 'Troubles anxieux', status: 'ENABLED', advertisingChannelType: 'SEARCH' },
    112: { name: 'Alimentation et corps', status: 'PAUSED', advertisingChannelType: 'SEARCH' },
    113: { name: 'Sommeil', status: 'ENABLED', advertisingChannelType: 'SEARCH' },
    222: { name: 'PMax - Faire le point', status: 'PAUSED', advertisingChannelType: 'PERFORMANCE_MAX' },
  },
  listes: {
    500: { name: 'Exclusions communes', type: 'NEGATIVE_KEYWORDS', status: 'ENABLED' },
    600: { name: 'Sites exclus', type: 'NEGATIVE_PLACEMENTS', status: 'ENABLED' },
  },
  entrees: [
    { liste: '500', id: '5001', type: 'KEYWORD', text: 'gratuit', matchType: 'BROAD' },
    { liste: '500', id: '5002', type: 'KEYWORD', text: 'emploi', matchType: 'PHRASE' },
    { liste: '600', id: '6001', type: 'PLACEMENT' },
  ],
  liens: [
    { campagne: '111', liste: '500', status: 'ENABLED' },
    { campagne: '112', liste: '500', status: 'ENABLED' },
    { campagne: '111', liste: '600', status: 'ENABLED' },
  ],
  criteres: [
    { campagne: '111', id: '901', type: 'KEYWORD', negative: true, text: 'formation', matchType: 'PHRASE' },
    { campagne: '111', id: '902', type: 'KEYWORD', negative: true, text: 'avis', matchType: 'EXACT' },
    { campagne: '111', id: '903', type: 'KEYWORD', negative: true, text: 'emploi', matchType: 'PHRASE' },
    { campagne: '112', id: '904', type: 'KEYWORD', negative: true, text: 'formation', matchType: 'PHRASE' },
    { campagne: '113', id: '905', type: 'KEYWORD', negative: true, text: 'gratuit', matchType: 'BROAD' },
    // Ni des négatifs, ni des mots-clés : ce que le verrou des retraits doit protéger.
    { campagne: '111', id: '990', type: 'LOCATION', negative: false },
    { campagne: '111', id: '991', type: 'KEYWORD', negative: false, text: 'hypnose lyon', matchType: 'PHRASE' },
  ],
  positifs: [
    { campagne: '111', groupe: 'Anxiété', text: 'hypnose lyon', matchType: 'PHRASE', status: 'ENABLED' },
    { campagne: '111', groupe: 'Anxiété', text: 'thérapie anxiété', matchType: 'EXACT', status: 'ENABLED' },
    { campagne: '111', groupe: 'Anxiété', text: 'séance hypnose', matchType: 'EXACT', status: 'REMOVED' },
    { campagne: '112', groupe: 'Corps', text: 'psychologue gratuit lyon', matchType: 'BROAD', status: 'PAUSED' },
    { campagne: '113', groupe: 'Sommeil', text: 'insomnie lyon', matchType: 'PHRASE', status: 'ENABLED' },
    { campagne: '113', groupe: 'Sommeil', text: 'emploi du temps sommeil', matchType: 'PHRASE', status: 'ENABLED' },
  ],
  suivant: 7000,
});

const rn = {
  entree: (liste: string, id: string) => `customers/${COMPTE}/sharedCriteria/${liste}~${id}`,
  lien: (campagne: string, liste: string) => `customers/${COMPTE}/campaignSharedSets/${campagne}~${liste}`,
  critere: (campagne: string, id: string) => `customers/${COMPTE}/campaignCriteria/${campagne}~${id}`,
};

const reponse = (results: unknown[]) => Response.json({ results });
const erreurAds = (code: Record<string, string>, message: string) => Response.json({ error: {
  code: 400, status: 'INVALID_ARGUMENT', message: 'Request contains an invalid argument.',
  details: [{ errors: [{ errorCode: code, message }] }],
} }, { status: 400 });

const ids = (liste: string) => liste.split(',').map((x) => x.trim());
const noms = (liste: string) => [...liste.matchAll(/'([^']+)'/g)].map((x) => x[1]);

/** Les requêtes GAQL des outils, une par une. Une requête inconnue fait échouer le test : elle se voit. */
const repondreGaql = (e: Etat, q: string): unknown[] => {
  let m: RegExpExecArray | null;
  const ligneListe = (id: string) => ({ sharedSet: { id, ...e.listes[id] } });
  const ligneEntree = (x: Etat['entrees'][number]) => ({
    sharedSet: { id: x.liste },
    sharedCriterion: { criterionId: x.id, type: x.type, ...(x.text ? { keyword: { text: x.text, matchType: x.matchType } } : {}) },
  });
  const ligneCampagne = (id: string) => ({ campaign: { id, ...e.campagnes[id] } });

  if ((m = /FROM shared_set WHERE shared_set\.id = (\d+)$/.exec(q))) return e.listes[m[1]] ? [ligneListe(m[1])] : [];
  if (/FROM shared_set WHERE shared_set\.status = 'ENABLED'$/.test(q)) {
    return Object.keys(e.listes).filter((id) => e.listes[id].status === 'ENABLED').map(ligneListe);
  }
  if ((m = /FROM shared_criterion WHERE shared_set\.id = (\d+) AND shared_criterion\.type = 'KEYWORD'$/.exec(q))) {
    return e.entrees.filter((x) => x.liste === m![1] && x.type === 'KEYWORD').map(ligneEntree);
  }
  if ((m = /FROM shared_criterion WHERE shared_set\.id IN \(([\d, ]+)\) AND shared_criterion\.type = 'KEYWORD'$/.exec(q))) {
    return e.entrees.filter((x) => ids(m![1]).includes(x.liste) && x.type === 'KEYWORD').map(ligneEntree);
  }
  if ((m = /FROM shared_criterion WHERE shared_criterion\.resource_name IN \((.+)\)$/.exec(q))) {
    return e.entrees.filter((x) => noms(m![1]).includes(rn.entree(x.liste, x.id)))
      .map((x) => ({ sharedCriterion: { resourceName: rn.entree(x.liste, x.id), type: x.type }, sharedSet: { type: e.listes[x.liste].type } }));
  }
  if ((m = /FROM campaign_shared_set WHERE shared_set\.id = (\d+) AND campaign_shared_set\.status = 'ENABLED' AND campaign\.status != 'REMOVED'$/.exec(q))) {
    return e.liens.filter((l) => l.liste === m![1] && l.status === 'ENABLED' && e.campagnes[l.campagne].status !== 'REMOVED').map((l) => ligneCampagne(l.campagne));
  }
  if ((m = /FROM campaign_shared_set WHERE campaign\.id = (\d+) AND campaign_shared_set\.status = 'ENABLED' AND shared_set\.type = 'NEGATIVE_KEYWORDS' AND shared_set\.status = 'ENABLED'$/.exec(q))) {
    return e.liens.filter((l) => l.campagne === m![1] && l.status === 'ENABLED' && e.listes[l.liste].type === 'NEGATIVE_KEYWORDS' && e.listes[l.liste].status === 'ENABLED')
      .map((l) => ligneListe(l.liste));
  }
  if ((m = /FROM campaign_shared_set WHERE campaign_shared_set\.resource_name IN \((.+)\)$/.exec(q))) {
    return e.liens.filter((l) => noms(m![1]).includes(rn.lien(l.campagne, l.liste)))
      .map((l) => ({ campaignSharedSet: { resourceName: rn.lien(l.campagne, l.liste), status: l.status }, sharedSet: { type: e.listes[l.liste].type } }));
  }
  if ((m = /FROM campaign WHERE campaign\.id = (\d+)$/.exec(q))) return e.campagnes[m[1]] ? [ligneCampagne(m[1])] : [];
  if ((m = /FROM campaign_criterion WHERE campaign\.id IN \(([\d, ]+)\) AND campaign_criterion\.type = 'KEYWORD' AND campaign_criterion\.negative = TRUE AND campaign_criterion\.status != 'REMOVED'$/.exec(q))) {
    return e.criteres.filter((c) => ids(m![1]).includes(c.campagne) && c.type === 'KEYWORD' && c.negative)
      .map((c) => ({ campaign: { id: c.campagne }, campaignCriterion: { criterionId: c.id, keyword: { text: c.text, matchType: c.matchType } } }));
  }
  if ((m = /FROM campaign_criterion WHERE campaign_criterion\.resource_name IN \((.+)\)$/.exec(q))) {
    return e.criteres.filter((c) => noms(m![1]).includes(rn.critere(c.campagne, c.id)))
      .map((c) => ({ campaignCriterion: { resourceName: rn.critere(c.campagne, c.id), type: c.type, negative: c.negative, status: 'ENABLED' } }));
  }
  if ((m = /FROM ad_group_criterion WHERE campaign\.id IN \(([\d, ]+)\) AND ad_group_criterion\.type = 'KEYWORD' AND ad_group_criterion\.negative = FALSE AND ad_group_criterion\.status IN \('ENABLED', 'PAUSED'\)/.exec(q))) {
    return e.positifs.filter((p) => ids(m![1]).includes(p.campagne) && ['ENABLED', 'PAUSED'].includes(p.status)).map((p) => ({
      campaign: { name: e.campagnes[p.campagne].name }, adGroup: { name: p.groupe },
      adGroupCriterion: { status: p.status, keyword: { text: p.text, matchType: p.matchType } },
    }));
  }
  throw new Error(`Requête non simulée : ${q}`);
};

/**
 * `:mutate`, comme Google : tout ou rien, un doublon est une erreur, une cible
 * disparue aussi. `validateOnly` vérifie sur une copie et ne garde rien.
 */
const repondreMutation = (e: Etat, service: string, corps: { operations?: any[]; mutateOperations?: any[]; validateOnly: boolean }): Response => {
  const copie: Etat = structuredClone(e);
  const rendus: string[] = [];
  const temporaires = new Map<string, string>();
  const meme = (x: { text?: string; matchType?: string }, k: { text: string; matchType: string }) => x.text === k.text && x.matchType === k.matchType;

  for (const op of corps.operations ?? corps.mutateOperations ?? []) {
    if (service === 'googleAds' && op.sharedSetOperation) {
      const c = op.sharedSetOperation.create;
      if (Object.values(copie.listes).some((l) => l.name === c.name && l.status === 'ENABLED')) return erreurAds({ sharedSetError: 'DUPLICATE_NAME' }, 'Nom déjà pris.');
      const id = String(copie.suivant++);
      copie.listes[id] = { name: c.name, type: c.type, status: 'ENABLED' };
      temporaires.set(c.resourceName, id);
      rendus.push(`customers/${COMPTE}/sharedSets/${id}`);
    } else if ((service === 'googleAds' && op.sharedCriterionOperation) || (service === 'sharedCriteria' && op.create)) {
      const c = op.sharedCriterionOperation?.create ?? op.create;
      const liste = temporaires.get(c.sharedSet) ?? /sharedSets\/(\d+)$/.exec(c.sharedSet)![1];
      if (copie.entrees.some((x) => x.liste === liste && meme(x, c.keyword))) return erreurAds({ criterionError: 'DUPLICATE_KEYWORD' }, 'Déjà dans la liste.');
      const id = String(copie.suivant++);
      copie.entrees.push({ liste, id, type: 'KEYWORD', text: c.keyword.text, matchType: c.keyword.matchType });
      rendus.push(rn.entree(liste, id));
    } else if (service === 'sharedCriteria' && op.remove) {
      const i = copie.entrees.findIndex((x) => rn.entree(x.liste, x.id) === op.remove);
      if (i < 0) return erreurAds({ mutateError: 'RESOURCE_NOT_FOUND' }, 'Introuvable.');
      copie.entrees.splice(i, 1);
      rendus.push(op.remove);
    } else if (service === 'campaignSharedSets' && op.create) {
      const [campagne, liste] = [/campaigns\/(\d+)$/.exec(op.create.campaign)![1], /sharedSets\/(\d+)$/.exec(op.create.sharedSet)![1]];
      if (copie.liens.some((l) => l.campagne === campagne && l.liste === liste && l.status === 'ENABLED')) return erreurAds({ campaignSharedSetError: 'DUPLICATE' }, 'Déjà associée.');
      copie.liens.push({ campagne, liste, status: 'ENABLED' });
      rendus.push(rn.lien(campagne, liste));
    } else if (service === 'campaignSharedSets' && op.remove) {
      const l = copie.liens.find((x) => rn.lien(x.campagne, x.liste) === op.remove && x.status === 'ENABLED');
      if (!l) return erreurAds({ mutateError: 'RESOURCE_NOT_FOUND' }, 'Introuvable.');
      l.status = 'REMOVED';
      rendus.push(op.remove);
    } else if (service === 'campaignCriteria' && op.remove) {
      const i = copie.criteres.findIndex((c) => rn.critere(c.campagne, c.id) === op.remove);
      if (i < 0) return erreurAds({ mutateError: 'RESOURCE_NOT_FOUND' }, 'Introuvable.');
      copie.criteres.splice(i, 1);
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

const apercuPuisExecution = async (env: EnvFactice, outil: string, args: Record<string, unknown>) => {
  const apercu = await appelerOutil(env, outil, args, LIRE_ECRIRE);
  const jeton = jetonDe(apercu.corps);
  const execution = await appelerOutil(env, outil, { ...args, jeton }, LIRE_ECRIRE);
  return { apercu: apercu.corps, jeton, execution: execution.corps };
};

const mc = (texte: string, correspondance: MotCle['correspondance']) => ({ texte, correspondance });

/** Un appel de chaque outil, valide sur le compte de départ. */
const APPELS: [string, Record<string, unknown>][] = [
  ['ads_liste_negatifs_creer', { nom: 'Exclusions santé', mots_cles: [mc('médicament', 'BROAD'), mc('ordonnance', 'PHRASE')] }],
  ['ads_liste_negatifs_ajouter', { liste: '500', mots_cles: [mc('stage', 'PHRASE'), mc('cours', 'PHRASE')] }],
  ['ads_liste_negatifs_retirer', { liste: '500', mots_cles: [mc('gratuit', 'BROAD')] }],
  ['ads_liste_associer', { liste: '500', campagne: '113' }],
  ['ads_liste_dissocier', { liste: '500', campagne: '112' }],
  ['ads_negatifs_retirer', { campagne: '111', mots_cles: [mc('avis', 'EXACT')] }],
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
    expect(mutations(appels).length).toBe(APPELS.length);
    expect(executions(appels)).toEqual([]);
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
});

// ── Le jeton ─────────────────────────────────────────────────────────────

describe('NORMATIF — un jeton ne vaut que pour ses arguments exacts, une fois, dix minutes', () => {
  const AJOUT = { liste: '500', mots_cles: [mc('stage', 'PHRASE'), mc('cours', 'PHRASE')] };

  it('d’autres arguments : refusé, rien ne part', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerCompte();
    etat.listes[501] = { name: 'Autre', type: 'NEGATIVE_KEYWORDS', status: 'ENABLED' };
    const jeton = jetonDe((await appelerOutil(env, 'ads_liste_negatifs_ajouter', AJOUT, LIRE_ECRIRE)).corps);
    for (const args of [
      { ...AJOUT, mots_cles: [...AJOUT.mots_cles, mc('atelier', 'EXACT')] },
      { ...AJOUT, mots_cles: [mc('stage', 'EXACT'), mc('cours', 'PHRASE')] },
      { ...AJOUT, mots_cles: [mc('stage', 'PHRASE')] },
      { ...AJOUT, liste: '501' },
    ]) {
      const { corps } = await appelerOutil(env, 'ads_liste_negatifs_ajouter', { ...args, jeton }, LIRE_ECRIRE);
      expect(texteDe(corps), JSON.stringify(args)).toMatch(/diffère de celui de l'aperçu/);
    }
    const voisin = await appelerOutil(env, 'ads_liste_negatifs_retirer', { ...AJOUT, jeton }, LIRE_ECRIRE);
    expect(texteDe(voisin.corps)).toMatch(/Jeton d'aperçu invalide pour cet outil/);
    expect(executions(appels)).toEqual([]);
    expect(env.DB.lignes()).toEqual([]);
  });

  it('un retrait aussi : le jeton couvre la demande, pas seulement les entrées trouvées', async () => {
    // L'aperçu ignore « absent » ; sans la demande dans l'empreinte, l'en ôter — ou en
    // ajouter un autre, absent lui aussi — donnerait les mêmes opérations.
    const env = creerEnv();
    const { appels } = simulerCompte();
    const args = { liste: '500', mots_cles: [mc('gratuit', 'BROAD'), mc('absent', 'EXACT')] };
    const jeton = jetonDe((await appelerOutil(env, 'ads_liste_negatifs_retirer', args, LIRE_ECRIRE)).corps);
    for (const mots_cles of [[mc('gratuit', 'BROAD')], [...args.mots_cles, mc('autre absent', 'EXACT')]]) {
      const { corps } = await appelerOutil(env, 'ads_liste_negatifs_retirer', { ...args, mots_cles, jeton }, LIRE_ECRIRE);
      expect(texteDe(corps)).toMatch(/diffère de celui de l'aperçu/);
    }
    expect(executions(appels)).toEqual([]);
  });

  it('une fois — même quand le compte redonnerait à faire', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerCompte();
    const { jeton, execution } = await apercuPuisExecution(env, 'ads_liste_negatifs_ajouter', AJOUT);
    expect(texteDe(execution)).toMatch(/^FAIT/);
    // Quelqu'un retire les deux entrées dans l'interface : rejouer le jeton les remettrait.
    etat.entrees = etat.entrees.filter((x) => !['stage', 'cours'].includes(x.text ?? ''));
    const { corps } = await appelerOutil(env, 'ads_liste_negatifs_ajouter', { ...AJOUT, jeton }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/déjà servi/);
    expect(executions(appels)).toHaveLength(1);
    expect(env.DB.lignes()).toHaveLength(1);
  });

  it('une fois, pour un retrait aussi', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerCompte();
    const args = { liste: '500', campagne: '112' };
    const { jeton } = await apercuPuisExecution(env, 'ads_liste_dissocier', args);
    etat.liens.push({ campagne: '112', liste: '500', status: 'ENABLED' });
    const { corps } = await appelerOutil(env, 'ads_liste_dissocier', { ...args, jeton }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/déjà servi/);
    expect(executions(appels)).toHaveLength(1);
  });

  it('dix minutes', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    const args = { campagne: '111', mots_cles: [mc('avis', 'EXACT')] };
    const jeton = jetonDe((await appelerOutil(env, 'ads_negatifs_retirer', args, LIRE_ECRIRE)).corps);
    vi.useFakeTimers({ now: Date.now() + 10 * 60 * 1000 + 1000 });
    const { corps } = await appelerOutil(env, 'ads_negatifs_retirer', { ...args, jeton }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/expiré/);
    expect(executions(appels)).toEqual([]);
  });

  it('le journal garde ce qui est parti, comme pour toute écriture', async () => {
    const env = creerEnv();
    simulerCompte();
    await apercuPuisExecution(env, 'ads_liste_negatifs_ajouter', AJOUT);
    const [ligne] = env.DB.lignes();
    expect(ligne).toMatchObject({ outil: 'ads_liste_negatifs_ajouter', compte: COMPTE, issue: 'ok' });
    expect(JSON.parse(ligne.contenu as string).service).toBe('sharedCriteria');
  });
});

// ── Les doublons ─────────────────────────────────────────────────────────

describe('les doublons sont signalés, et écartés à l’exécution au lieu d’échouer', () => {
  it('déjà dans la liste, ou déjà exclus au niveau campagne sur toutes les campagnes liées', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerCompte();
    const { apercu, execution } = await apercuPuisExecution(env, 'ads_liste_negatifs_ajouter', {
      liste: '500',
      mots_cles: [mc('Gratuit', 'BROAD'), mc('formation', 'PHRASE'), mc('avis', 'EXACT'), mc('stage', 'PHRASE')],
    });
    const a = texteDe(apercu);
    expect(a).toMatch(/DOUBLONS — signalés, et écartés à l'exécution \(2\)/);
    expect(a).toMatch(/- gratuit \[requête large\] — déjà dans la liste/);
    expect(a).toMatch(/- formation \[expression exacte\] — déjà exclu au niveau campagne sur toutes les campagnes liées/);
    // Négatif de campagne sur une partie seulement des campagnes liées : ajouté pour les autres, et dit.
    expect(a).toMatch(/- avis \[exact\] — déjà exclu au niveau campagne sur « Troubles anxieux » ; ajouté pour les autres/);
    expect(a).toMatch(/2 mots-clés exclus de plus/);

    expect(texteDe(execution)).toMatch(/^FAIT/);
    expect(texteDe(execution)).toMatch(/2 mots-clés ajoutés à la liste « Exclusions communes », pour 2 campagnes liées/);
    const [faite] = executions(appels);
    expect(faite.operations.map((o) => o.create.keyword)).toEqual([{ text: 'avis', matchType: 'EXACT' }, { text: 'stage', matchType: 'PHRASE' }]);
    expect(etat.entrees.filter((x) => x.liste === '500').map((x) => x.text)).toEqual(['gratuit', 'emploi', 'avis', 'stage']);
  });

  it('un doublon apparu entre l’aperçu et l’exécution — un appel concurrent — est écarté, et le reste part', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerCompte();
    const args = { liste: '500', mots_cles: [mc('stage', 'PHRASE'), mc('cours', 'PHRASE')] };
    const jeton = jetonDe((await appelerOutil(env, 'ads_liste_negatifs_ajouter', args, LIRE_ECRIRE)).corps);
    etat.entrees.push({ liste: '500', id: '5999', type: 'KEYWORD', text: 'stage', matchType: 'PHRASE' });

    const { corps } = await appelerOutil(env, 'ads_liste_negatifs_ajouter', { ...args, jeton }, LIRE_ECRIRE);
    const t = texteDe(corps);
    expect(t).toMatch(/^FAIT/);
    expect(t).toMatch(/1 mot-clé ajouté/);
    expect(t).toMatch(/Écarté à l'exécution, sans objet depuis l'aperçu :\n- stage \[expression exacte\] — déjà dans la liste/);
    expect(executions(appels).map((m) => m.operations.map((o) => o.create.keyword.text))).toEqual([['cours']]);
  });

  it('un doublon écarté à l’aperçu n’est jamais envoyé, même s’il ne l’est plus à l’exécution', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerCompte();
    const args = { liste: '500', mots_cles: [mc('gratuit', 'BROAD'), mc('stage', 'PHRASE')] };
    const jeton = jetonDe((await appelerOutil(env, 'ads_liste_negatifs_ajouter', args, LIRE_ECRIRE)).corps);
    etat.entrees = etat.entrees.filter((x) => x.text !== 'gratuit');
    await appelerOutil(env, 'ads_liste_negatifs_ajouter', { ...args, jeton }, LIRE_ECRIRE);
    expect(executions(appels).map((m) => m.operations.map((o) => o.create.keyword.text))).toEqual([['stage']]);
  });

  it('rien que des doublons : refus à l’aperçu, rien ne part', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    const { corps } = await appelerOutil(env, 'ads_liste_negatifs_ajouter', { liste: '500', mots_cles: [mc('gratuit', 'BROAD')] }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/Rien à ajouter à la liste « Exclusions communes » : tous les mots-clés sont des doublons/);
    expect(mutations(appels)).toEqual([]);
  });

  it('une entrée déjà retirée entre l’aperçu et l’exécution : rien à faire, et rien ne part', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerCompte();
    const args = { liste: '500', mots_cles: [mc('gratuit', 'BROAD')] };
    const jeton = jetonDe((await appelerOutil(env, 'ads_liste_negatifs_retirer', args, LIRE_ECRIRE)).corps);
    etat.entrees = etat.entrees.filter((x) => x.id !== '5001');
    const { corps } = await appelerOutil(env, 'ads_liste_negatifs_retirer', { ...args, jeton }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/^RIEN À FAIRE/);
    expect(texteDe(corps)).toMatch(/gratuit \[requête large\] — déjà retiré de la liste/);
    expect(executions(appels)).toEqual([]);
    expect(env.DB.lignes()).toEqual([]);
  });
});

// ── L'avertissement de blocage ───────────────────────────────────────────

describe('l’avertissement de blocage — jamais un refus', () => {
  it('se déclenche pour chaque type de correspondance, au texte près', () => {
    const cas: [MotCle, string, boolean][] = [
      // BROAD : tous les mots, dans n'importe quel ordre.
      [mc('lyon hypnose', 'BROAD'), 'hypnose lyon', true],
      [mc('hypnose', 'BROAD'), 'séance hypnose lyon', true],
      [mc('hypnose paris', 'BROAD'), 'hypnose lyon', false],
      [mc('hypnoses', 'BROAD'), 'hypnose lyon', false],
      // PHRASE : l'expression, mots consécutifs et dans l'ordre.
      [mc('gratuit lyon', 'PHRASE'), 'psychologue gratuit lyon', true],
      [mc('lyon gratuit', 'PHRASE'), 'psychologue gratuit lyon', false],
      [mc('psychologue lyon', 'PHRASE'), 'psychologue gratuit lyon', false],
      // EXACT : le même texte.
      [mc('thérapie anxiété', 'EXACT'), 'thérapie anxiété', true],
      [mc('Thérapie  Anxiété', 'EXACT'), 'thérapie anxiété', true],
      [mc('thérapie', 'EXACT'), 'thérapie anxiété', false],
      // Accents compris : Google n'étend pas les négatifs aux variantes proches.
      [mc('therapie anxiete', 'EXACT'), 'thérapie anxiété', false],
      [mc('therapie', 'BROAD'), 'thérapie anxiété', false],
      [mc('anxiete', 'PHRASE'), 'thérapie anxiété', false],
      // « é » composé ou décomposé reste le même « é ».
      [mc('thérapie', 'BROAD'), 'thérapie anxiété', true],
    ];
    for (const [negatif, positif, attendu] of cas) {
      expect(bloque(negatif, positif), `${negatif.texte} [${negatif.correspondance}] / ${positif}`).toBe(attendu);
    }
  });

  it('dans l’aperçu : chaque mot-clé positif actif ou en pause d’une campagne liée, et seulement eux', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    const { corps } = await appelerOutil(env, 'ads_liste_negatifs_ajouter', {
      liste: '500',
      mots_cles: [
        mc('lyon hypnose', 'BROAD'), mc('gratuit lyon', 'PHRASE'), mc('thérapie anxiété', 'EXACT'),
        mc('lyon hypnose', 'PHRASE'), mc('therapie anxiete', 'EXACT'), mc('hypnoses', 'BROAD'),
        // Un mot-clé d'une campagne non liée (113), un mot-clé supprimé : hors sujet.
        mc('insomnie', 'BROAD'), mc('séance hypnose', 'EXACT'),
      ],
    }, LIRE_ECRIRE);

    expect(corps.result.isError).toBeUndefined();
    expect(jetonDe(corps)).toBeTruthy();
    const t = texteDe(corps);
    expect(t).toMatch(/AVERTISSEMENT — 3 mots-clés positifs bloqués : la recherche qui le déclenche serait exclue\. Rien n'est refusé/);
    expect(t).toMatch(/« lyon hypnose \[requête large\] » bloquerait « hypnose lyon » \[expression exacte\] — actif, groupe « Anxiété », campagne « Troubles anxieux »/);
    expect(t).toMatch(/« gratuit lyon \[expression exacte\] » bloquerait « psychologue gratuit lyon » \[requête large\] — en pause, groupe « Corps », campagne « Alimentation et corps »/);
    expect(t).toMatch(/« thérapie anxiété \[exact\] » bloquerait « thérapie anxiété » \[exact\] — actif/);
    expect(t.match(/bloquerait/g)).toHaveLength(3);
    expect(executions(appels)).toEqual([]);
  });

  it('à l’association : les entrées de la liste contre les mots-clés de la campagne', async () => {
    const env = creerEnv();
    simulerCompte();
    const { corps } = await appelerOutil(env, 'ads_liste_associer', { liste: '500', campagne: '113' }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/« emploi \[expression exacte\] » bloquerait « emploi du temps sommeil » \[expression exacte\] — actif, groupe « Sommeil »/);
  });
});

// ── Les limites de Google ────────────────────────────────────────────────

describe('les limites de Google : 20 listes par compte, 5 000 mots-clés par liste', () => {
  it('sont celles de la documentation, à un seul endroit', () => {
    expect(LIMITES_LISTES).toEqual({ parCompte: 20, entreesParListe: 5000 });
  });

  it('une vingt et unième liste est refusée ; la vingtième passe', async () => {
    for (const [existantes, refus] of [[20, true], [19, false]] as const) {
      const etat = etatInitial();
      etat.listes = Object.fromEntries(Array.from({ length: existantes }, (_, i) => [String(800 + i), { name: `L${i}`, type: 'NEGATIVE_KEYWORDS', status: 'ENABLED' }]));
      // Les listes supprimées, et celles d'un autre type, ne comptent pas.
      etat.listes[900] = { name: 'Supprimée', type: 'NEGATIVE_KEYWORDS', status: 'REMOVED' };
      etat.listes[901] = { name: 'Sites', type: 'NEGATIVE_PLACEMENTS', status: 'ENABLED' };
      const env = creerEnv();
      const { appels } = simulerCompte(etat);
      const { corps } = await appelerOutil(env, 'ads_liste_negatifs_creer', { nom: 'Nouvelle' }, LIRE_ECRIRE);
      if (refus) {
        expect(texteDe(corps)).toMatch(/déjà 20 listes de mots-clés à exclure : Google n'en admet que 20/);
        expect(mutations(appels)).toEqual([]);
      } else {
        expect(texteDe(corps)).toMatch(/Listes de mots-clés à exclure du compte après création : 20 sur 20/);
      }
    }
  });

  it('une liste ne dépasse pas 5 000 mots-clés', async () => {
    for (const [nouveaux, refus] of [[11, true], [10, false]] as const) {
      const etat = etatInitial();
      etat.entrees = Array.from({ length: 4990 }, (_, i) => ({ liste: '500', id: String(10_000 + i), type: 'KEYWORD', text: `terme ${i}`, matchType: 'EXACT' }));
      const env = creerEnv();
      const { appels } = simulerCompte(etat);
      const mots_cles = Array.from({ length: nouveaux }, (_, i) => mc(`nouveau ${i}`, 'EXACT'));
      const { corps } = await appelerOutil(env, 'ads_liste_negatifs_ajouter', { liste: '500', mots_cles }, LIRE_ECRIRE);
      if (refus) {
        expect(texteDe(corps)).toMatch(/compte 4990 mots-clés : en ajouter 11 dépasserait les 5 000 que Google admet par liste/);
        expect(mutations(appels)).toEqual([]);
      } else {
        expect(texteDe(corps)).toMatch(/Taille de la liste après ajout : 5000 sur 5 000/);
      }
    }
  });
});

// ── Les outils ───────────────────────────────────────────────────────────

describe('ads_liste_negatifs_creer', () => {
  it('une requête atomique : la liste marquée [Claude], puis ses premiers mots-clés', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerCompte();
    const { apercu, execution } = await apercuPuisExecution(env, 'ads_liste_negatifs_creer', APPELS[0][1]);
    expect(texteDe(apercu)).toMatch(/Liste de mots-clés à exclure « \[Claude\] Exclusions santé » — 2 mots-clés :\n- médicament \[requête large\]\n- ordonnance \[expression exacte\]/);
    expect(texteDe(apercu)).toMatch(/Associée à aucune campagne : elle n'exclura rien/);
    expect(texteDe(execution)).toMatch(/^FAIT/);

    const [faite] = executions(appels);
    const tmp = `customers/${COMPTE}/sharedSets/-1`;
    expect(faite.service).toBe('googleAds');
    expect(faite.operations).toEqual([
      { sharedSetOperation: { create: { resourceName: tmp, name: '[Claude] Exclusions santé', type: 'NEGATIVE_KEYWORDS' } } },
      { sharedCriterionOperation: { create: { sharedSet: tmp, keyword: { text: 'médicament', matchType: 'BROAD' } } } },
      { sharedCriterionOperation: { create: { sharedSet: tmp, keyword: { text: 'ordonnance', matchType: 'PHRASE' } } } },
    ]);
    const [id] = Object.entries(etat.listes).find(([, l]) => l.name === '[Claude] Exclusions santé')!;
    expect(etat.entrees.filter((x) => x.liste === id)).toHaveLength(2);
    // Elle naît associée à rien.
    expect(etat.liens.filter((l) => l.liste === id)).toEqual([]);
  });

  it('sans mots-clés, la liste seule ; un nom déjà pris est refusé', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerCompte();
    await apercuPuisExecution(env, 'ads_liste_negatifs_creer', { nom: '[Claude] Vide' });
    expect(executions(appels)[0].operations).toHaveLength(1);
    expect(Object.values(etat.listes).filter((l) => l.name === '[Claude] Vide')).toHaveLength(1);

    const { corps } = await appelerOutil(env, 'ads_liste_negatifs_creer', { nom: 'Vide' }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/Une liste « \[Claude\] Vide » existe déjà/);
  });
});

describe('ads_liste_negatifs_ajouter et ads_liste_negatifs_retirer', () => {
  it('l’aperçu liste les campagnes liées et leur statut — une modification de liste les touche toutes', async () => {
    const env = creerEnv();
    simulerCompte();
    for (const [outil, args] of [APPELS[1], APPELS[2]]) {
      const { corps } = await appelerOutil(env, outil, args, LIRE_ECRIRE);
      const t = texteDe(corps);
      expect(t, outil).toMatch(/Campagnes liées \(2\) — toute modification de la liste les touche toutes :\n- « Troubles anxieux » \(111\) — active\n- « Alimentation et corps » \(112\) — en pause/);
    }
  });

  it('refusent ce qui n’est pas une liste de mots-clés à exclure vivante', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerCompte();
    etat.listes[502] = { name: 'Ancienne', type: 'NEGATIVE_KEYWORDS', status: 'REMOVED' };
    for (const [liste, attendu] of [['600', /n'est pas une liste de mots-clés à exclure \(NEGATIVE_PLACEMENTS\)/], ['502', /introuvable, ou supprimée/], ['999', /introuvable/]] as const) {
      for (const outil of ['ads_liste_negatifs_ajouter', 'ads_liste_negatifs_retirer']) {
        const { corps } = await appelerOutil(env, outil, { liste, mots_cles: [mc('stage', 'PHRASE')] }, LIRE_ECRIRE);
        expect(texteDe(corps), `${outil} ${liste}`).toMatch(attendu);
      }
    }
    expect(mutations(appels)).toEqual([]);
  });

  it('un retrait le dit, liste ce qu’il retire, et ignore ce qui est absent', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerCompte();
    const { apercu, execution } = await apercuPuisExecution(env, 'ads_liste_negatifs_retirer', {
      liste: '500', mots_cles: [mc('gratuit', 'BROAD'), mc('gratuit', 'EXACT')],
    });
    const a = texteDe(apercu);
    expect(a).toMatch(/^APERÇU[^]*RETRAIT — Un retrait peut rouvrir du trafic, donc augmenter la dépense/);
    expect(a).toMatch(/1 mot-clé retiré ; ces recherches ne seront plus exclues :\n- gratuit \[requête large\]/);
    expect(a).toMatch(/Absents de la liste — ignorés \(1\) :\n- gratuit \[exact\]/);
    expect(texteDe(execution)).toMatch(/^FAIT[^]*1 mot-clé retiré de la liste « Exclusions communes »/);
    expect(executions(appels)[0].operations).toEqual([{ remove: rn.entree('500', '5001') }]);
    expect(etat.entrees.some((x) => x.id === '5001')).toBe(false);
  });

  it('rien de présent : refus', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    const { corps } = await appelerOutil(env, 'ads_liste_negatifs_retirer', { liste: '500', mots_cles: [mc('absent', 'EXACT')] }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/Aucun de ces mots-clés n'est dans la liste « Exclusions communes » : rien à retirer/);
    expect(mutations(appels)).toEqual([]);
  });
});

describe('ads_liste_associer et ads_liste_dissocier', () => {
  it('associer : le lien seul, rien ne s’active ; l’aperçu dit les doublons de la campagne', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerCompte();
    const { apercu, execution } = await apercuPuisExecution(env, 'ads_liste_associer', { liste: '500', campagne: '113' });
    const a = texteDe(apercu);
    expect(a).toMatch(/Associer la liste « Exclusions communes » \(500, 2 mots-clés\) à la campagne « Sommeil » \(113, active\)/);
    expect(a).toMatch(/Campagnes liées \(2\)/);
    expect(a).toMatch(/DOUBLONS — 1 entrée déjà exclue au niveau campagne sur « Sommeil »[^]*- gratuit \[requête large\]/);
    expect(texteDe(execution)).toMatch(/^FAIT/);
    expect(executions(appels)[0]).toEqual({ service: 'campaignSharedSets', validateOnly: false, operations: [
      { create: { campaign: `customers/${COMPTE}/campaigns/113`, sharedSet: `customers/${COMPTE}/sharedSets/500` } },
    ] });
    expect(etat.campagnes[113].status).toBe('ENABLED');
    expect(etat.liens).toContainEqual({ campagne: '113', liste: '500', status: 'ENABLED' });
  });

  it('associer : refuse une campagne hors Search, une liste déjà associée', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    for (const [args, attendu] of [
      [{ liste: '500', campagne: '222' }, /n'est pas une campagne Search \(PERFORMANCE_MAX\)/],
      [{ liste: '500', campagne: '111' }, /déjà associée à la campagne « Troubles anxieux » : rien à faire/],
      [{ liste: '600', campagne: '113' }, /n'est pas une liste de mots-clés à exclure/],
    ] as const) {
      const { corps } = await appelerOutil(env, 'ads_liste_associer', args, LIRE_ECRIRE);
      expect(texteDe(corps), JSON.stringify(args)).toMatch(attendu);
    }
    expect(mutations(appels)).toEqual([]);
  });

  it('dissocier : un retrait, qui le dit et liste ce que la campagne n’exclura plus', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerCompte();
    const { apercu, execution } = await apercuPuisExecution(env, 'ads_liste_dissocier', { liste: '500', campagne: '112' });
    const a = texteDe(apercu);
    expect(a).toMatch(/RETRAIT — Un retrait peut rouvrir du trafic, donc augmenter la dépense/);
    expect(a).toMatch(/La campagne n'exclura plus ces 2 mots-clés :\n- gratuit \[requête large\]\n- emploi \[expression exacte\]/);
    expect(a).toMatch(/Restent associées \(1\)[^]*« Troubles anxieux » \(111\)/);
    expect(texteDe(execution)).toMatch(/^FAIT/);
    expect(executions(appels)[0].operations).toEqual([{ remove: rn.lien('112', '500') }]);
    expect(etat.liens.find((l) => l.campagne === '112' && l.liste === '500')?.status).toBe('REMOVED');
    // La liste elle-même reste, et son autre association aussi.
    expect(etat.listes[500].status).toBe('ENABLED');
    expect(etat.liens.find((l) => l.campagne === '111' && l.liste === '500')?.status).toBe('ENABLED');
  });

  it('dissocier : refuse une liste qui n’est pas associée', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    const { corps } = await appelerOutil(env, 'ads_liste_dissocier', { liste: '500', campagne: '113' }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/n'est pas associée à la campagne « Sommeil » : rien à faire/);
    expect(mutations(appels)).toEqual([]);
  });
});

describe('ads_negatifs_retirer', () => {
  it('dit, pour chaque négatif, s’il reste exclu par une liste ou si ce trafic se rouvre', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerCompte();
    const { apercu, execution } = await apercuPuisExecution(env, 'ads_negatifs_retirer', {
      campagne: '111', mots_cles: [mc('emploi', 'PHRASE'), mc('avis', 'EXACT'), mc('absent', 'BROAD')],
    });
    const a = texteDe(apercu);
    expect(a).toMatch(/RETRAIT — Un retrait peut rouvrir du trafic, donc augmenter la dépense/);
    expect(a).toMatch(/Campagne « Troubles anxieux » \(111\) — 2 négatifs retirés :/);
    expect(a).toMatch(/- avis \[exact\] — n'est plus exclu : ce trafic se rouvre/);
    expect(a).toMatch(/- emploi \[expression exacte\] — reste exclu par la liste « Exclusions communes »/);
    expect(a).toMatch(/1 recherche de nouveau ouverte aux annonces de la campagne/);
    expect(a).toMatch(/Absents des négatifs de la campagne — ignorés \(1\) :\n- absent \[requête large\]/);

    expect(texteDe(execution)).toMatch(/^FAIT[^]*2 négatifs retirés de la campagne « Troubles anxieux »/);
    expect(executions(appels)[0]).toEqual({ service: 'campaignCriteria', validateOnly: false, operations: [
      { remove: rn.critere('111', '902') }, { remove: rn.critere('111', '903') },
    ] });
    expect(etat.criteres.map((c) => c.id)).not.toContain('902');
    // Le ciblage et les mots-clés positifs restent : seuls des négatifs se retirent.
    expect(etat.criteres.map((c) => c.id)).toEqual(expect.arrayContaining(['990', '991']));
  });

  it('ne désigne jamais un positif ni un critère de ciblage, même au même texte', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    // « hypnose lyon » [PHRASE] est un mot-clé POSITIF de la campagne (991) : rien à retirer.
    const { corps } = await appelerOutil(env, 'ads_negatifs_retirer', { campagne: '111', mots_cles: [mc('hypnose lyon', 'PHRASE')] }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/Aucun de ces mots-clés n'est un négatif de la campagne « Troubles anxieux »/);
    expect(mutations(appels)).toEqual([]);
  });

  it('refuse une campagne hors Search', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    const { corps } = await appelerOutil(env, 'ads_negatifs_retirer', { campagne: '222', mots_cles: [mc('avis', 'EXACT')] }, LIRE_ECRIRE);
    expect(texteDe(corps)).toMatch(/n'est pas une campagne Search/);
    expect(mutations(appels)).toEqual([]);
  });
});

// ── La table fermée ──────────────────────────────────────────────────────

describe('NORMATIF — un retrait ne lève qu’une exclusion, et c’est le compte qui le confirme', () => {
  it('même construit par le code, un retrait qui vise autre chose ne part pas', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerCompte();
    const avant = structuredClone(etat);
    const refusees: [Parameters<typeof muter>[2], string][] = [
      ['campaignCriteria', rn.critere('111', '990')], // la zone de la campagne
      ['campaignCriteria', rn.critere('111', '991')], // un mot-clé positif
      ['sharedCriteria', rn.entree('600', '6001')], // une entrée d'une liste qui n'exclut pas de mots-clés
      ['campaignSharedSets', rn.lien('111', '600')], // le lien d'une telle liste
    ];
    for (const [service, cible] of refusees) {
      for (const validateOnly of [true, false]) {
        await expect(muter(env, COMPTE, service, [{ remove: cible }], validateOnly), cible).rejects.toThrow(/n'est pas une exclusion/);
      }
    }
    // Une cible disparue : un refus, pas une panne.
    await expect(muter(env, COMPTE, 'campaignCriteria', [{ remove: rn.critere('111', '12345') }], true)).rejects.toThrow(/n'existe plus dans le compte/);
    expect(mutations(appels)).toEqual([]);
    expect(etat).toEqual(avant);
  });

  it('aucun outil n’émet de remove hors de ces trois services, ni de statut ENABLED', async () => {
    const env = creerEnv();
    const { appels } = simulerCompte();
    for (const [outil, args] of APPELS) await apercuPuisExecution(env, outil, args);
    const ops = mutations(appels).flatMap((m) => m.operations.map((o) => ({ service: m.service, o })));
    for (const { service, o } of ops.filter(({ o }) => 'remove' in o)) {
      expect(['campaignCriteria', 'sharedCriteria', 'campaignSharedSets']).toContain(service);
    }
    expect(appels.filter((a) => a.url.endsWith(':mutate')).some((a) => /ENABLED/.test(a.corps))).toBe(false);
    const permis = new RegExp(`^https://googleads\\.googleapis\\.com/${VERSION_API}/customers/${COMPTE}/` +
      '(googleAds:search|(googleAds|sharedCriteria|campaignSharedSets|campaignCriteria):mutate)$');
    expect(appels.filter((a) => a.url.startsWith('https://googleads') && !permis.test(a.url)).map((a) => a.url)).toEqual([]);
    expect(env.DB.lignes().map((l) => l.issue)).toEqual(APPELS.map(() => 'ok'));
  });

  it('la table : les formes des listes, et rien d’autre', () => {
    const liste = `customers/${COMPTE}/sharedSets/500`;
    const campagne = `customers/${COMPTE}/campaigns/111`;
    const keyword = { text: 'gratuit', matchType: 'BROAD' };
    const acceptees: [Parameters<typeof verifierOperation>[0], Operation][] = [
      ['sharedCriteria', { create: { sharedSet: liste, keyword } }],
      ['sharedCriteria', { remove: rn.entree('500', '5001') }],
      ['campaignSharedSets', { create: { campaign: campagne, sharedSet: liste } }],
      ['campaignSharedSets', { remove: rn.lien('111', '500') }],
      ['campaignCriteria', { remove: rn.critere('111', '902') }],
    ];
    for (const [service, op] of acceptees) expect(() => verifierOperation(service, op), JSON.stringify(op)).not.toThrow();

    const refusees: [Parameters<typeof verifierOperation>[0], unknown][] = [
      ['sharedCriteria', { create: { sharedSet: liste, keyword, negative: true } }],
      ['sharedCriteria', { create: { sharedSet: liste, keyword: { ...keyword, matchType: 'BROAD_MATCH_MODIFIER' } } }],
      ['sharedCriteria', { create: { sharedSet: liste, placement: { url: 'exemple.fr' } } }],
      ['sharedCriteria', { remove: `customers/${COMPTE}/sharedCriteria/500` }],
      ['sharedCriteria', { update: { resourceName: rn.entree('500', '5001'), keyword }, updateMask: 'keyword' }],
      ['campaignSharedSets', { create: { campaign: campagne, sharedSet: liste, status: 'ENABLED' } }],
      ['campaignSharedSets', { create: { campaign: `customers/${COMPTE}/adGroups/111`, sharedSet: liste } }],
      ['campaignSharedSets', { remove: `customers/${COMPTE}/sharedSets/500` }],
      ['campaigns', { remove: `customers/${COMPTE}/campaigns/111` }],
      ['adGroupCriteria', { remove: `customers/${COMPTE}/adGroupCriteria/444~1` }],
    ];
    for (const [service, op] of refusees) {
      expect(() => verifierOperation(service, op as Operation), JSON.stringify(op)).toThrow(/table fermée/);
    }
  });

  it('la création de liste : marquée, NEGATIVE_KEYWORDS, ses seules entrées', () => {
    const tmp = `customers/${COMPTE}/sharedSets/-1`;
    const liste = (create: Record<string, unknown>) => ({ sharedSetOperation: { create } });
    const entree = (create: Record<string, unknown>) => ({ sharedCriterionOperation: { create } });
    const conforme = [liste({ resourceName: tmp, name: '[Claude] X', type: 'NEGATIVE_KEYWORDS' }), entree({ sharedSet: tmp, keyword: { text: 'x', matchType: 'EXACT' } })];
    expect(() => verifierCreationListe(conforme)).not.toThrow();

    const derives: Operation[][] = [
      [liste({ resourceName: tmp, name: 'X', type: 'NEGATIVE_KEYWORDS' })],
      [liste({ resourceName: tmp, name: '[Claude] X', type: 'NEGATIVE_PLACEMENTS' })],
      [liste({ resourceName: `customers/${COMPTE}/sharedSets/500`, name: '[Claude] X', type: 'NEGATIVE_KEYWORDS' })],
      [liste({ resourceName: tmp, name: '[Claude] X', type: 'NEGATIVE_KEYWORDS', status: 'ENABLED' })],
      [conforme[0], entree({ sharedSet: `customers/${COMPTE}/sharedSets/500`, keyword: { text: 'x', matchType: 'EXACT' } })],
      [conforme[0], { campaignSharedSetOperation: { create: { campaign: `customers/${COMPTE}/campaigns/111`, sharedSet: tmp } } }],
      [conforme[1], conforme[0]],
    ];
    for (const operations of derives) {
      expect(() => verifierCreationListe(operations), JSON.stringify(operations)).toThrow(/table fermée/);
    }
  });
});
