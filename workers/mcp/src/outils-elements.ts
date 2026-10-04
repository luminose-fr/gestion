/**
 * Les éléments d'annonce — liens annexes, accroches, extraits structurés —
 * décision du 04/10/2026 (workers/mcp/decisions/2026-10-04-elements-et-insertion.md).
 *
 * Un élément vit dans le compte, et s'affiche par ses ASSOCIATIONS : au compte,
 * à une campagne, à un groupe d'annonces. Pour un même type, le niveau le plus
 * fin l'emporte — un groupe qui a ses propres liens annexes masque ceux de sa
 * campagne, qui masquent ceux du compte. L'aperçu le dit, parce qu'ajouter un
 * lien à un groupe peut faire disparaître ceux qu'on croyait en place.
 *
 * Comme les autres écritures : l'outil prépare, ecriture.ts fait les deux temps
 * et le journal, et la table fermée de google-ads.ts revérifie chaque élément —
 * limites de Google, en-tête de la liste fermée, URL sur luminose.fr (V6),
 * filtre déontologique des annonces (V4). Chaque association naît EN PAUSE :
 * rien ne s'affiche avant que Florent l'active. Un élément n'a ni nom ni libellé
 * visible dans l'interface — sa pause est sa marque.
 */
import { z } from 'zod';
import { compteEcriture, ecrire, exigerEcriture, type Preparation, type Temps } from './ecriture';
import { EN_TETES_EXTRAITS, LIMITES_ELEMENTS, TYPES_ELEMENTS, type Operation, type TypeElement } from './google-ads';
import { longueur } from './insertion';
import { outil, texte } from './outil';
import { DEUX_TEMPS, JETON, exigerSearch, lignes, premiereLigne } from './outils-ecriture';
import { examinerAnnonce, urlAdmise } from './regles';
import { Refus } from './refus';
import type { Env } from './env';

const ID = z.string().regex(/^\d{1,20}$/, 'identifiant numérique');
const AJOUT = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const RETRAIT = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };

const NOMS: Record<TypeElement, { un: string; des: string; le: string; du: string; f: boolean }> = {
  SITELINK: { un: 'lien annexe', des: 'liens annexes', le: 'le lien annexe', du: 'du lien annexe', f: false },
  CALLOUT: { un: 'accroche', des: 'accroches', le: "l'accroche", du: "de l'accroche", f: true },
  STRUCTURED_SNIPPET: { un: 'extrait structuré', des: 'extraits structurés', le: "l'extrait structuré", du: "de l'extrait structuré", f: false },
};
/** L'accord du type : « aucun lien annexe actif », « aucune accroche active ». */
const accord = (type: TypeElement, masculin: string, feminin: string) => (NOMS[type].f ? feminin : masculin);
const capitale = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const STATUTS: Record<string, string> = { ENABLED: 'association active', PAUSED: 'association en pause' };

const EN_PAUSE =
  'Chaque association naît EN PAUSE : rien ne s’affiche avant que Florent l’active dans l’interface Google Ads. Un élément n’a ' +
  'ni nom ni libellé visible : sa pause est sa marque. Pour un même type, le niveau le plus fin l’emporte — un groupe qui a ses ' +
  'propres liens annexes masque ceux de sa campagne, qui masquent ceux du compte ; l’aperçu dit ce qui serait masqué.';

/** Le cadre déontologique : toute promotion du breathwork mentionne le questionnaire de santé (socle/cadre-deontologique.md). */
const PAGE_BREATHWORK = /respiration-holotropique|breathwork/i;

// ── Un élément, tel que le serveur le manipule ───────────────────────────

type Element =
  | { type: 'SITELINK'; texte: string; description1?: string; description2?: string; url: string }
  | { type: 'CALLOUT'; texte: string }
  | { type: 'STRUCTURED_SNIPPET'; enTete: string; valeurs: string[] };

const net = (t: string) => t.normalize('NFC').trim().replace(/\s+/g, ' ');
const minuscules = (t: string) => net(t).toLocaleLowerCase('fr');
const urlComparable = (u: string) => u.trim().toLowerCase().replace(/\/+$/, '');

/**
 * Deux éléments au même contenu affiché sont un doublon : recréer ne sert à
 * rien, associer l'existant suffit. La casse compte — « Séance en ligne » et
 * « séance en ligne » ne s'affichent pas pareil.
 */
const cle = (e: Element): string => JSON.stringify(e.type === 'SITELINK'
  ? [e.type, net(e.texte), net(e.description1 ?? ''), net(e.description2 ?? ''), urlComparable(e.url)]
  : e.type === 'CALLOUT' ? [e.type, net(e.texte)] : [e.type, e.enTete, ...e.valeurs.map(net)]);

/** Le même texte à la casse près — ou, pour un lien annexe, le même texte vers une autre page : à signaler, pas à écarter. */
const cleProche = (e: Element): string => JSON.stringify(e.type === 'SITELINK'
  ? [e.type, minuscules(e.texte)]
  : e.type === 'CALLOUT' ? [e.type, minuscules(e.texte)] : [e.type, e.enTete, ...e.valeurs.map(minuscules).sort()]);

const affiche = (e: Element): string => e.type === 'SITELINK'
  ? `« ${e.texte} »${e.description1 ? ` (${e.description1} / ${e.description2})` : ''} → ${e.url}`
  : e.type === 'CALLOUT' ? `« ${e.texte} »` : `${e.enTete} : ${e.valeurs.join(', ')}`;

const textesDe = (e: Element): string[] => e.type === 'SITELINK'
  ? [e.texte, e.description1, e.description2].filter((x): x is string => Boolean(x))
  : e.type === 'CALLOUT' ? [e.texte] : e.valeurs;

/** L'élément sous la forme que Google attend — et que la table fermée revérifie. */
const versAsset = (e: Element): Record<string, unknown> => e.type === 'SITELINK'
  ? { finalUrls: [e.url], sitelinkAsset: { linkText: e.texte, ...(e.description1 ? { description1: e.description1, description2: e.description2 } : {}) } }
  : e.type === 'CALLOUT' ? { calloutAsset: { calloutText: e.texte } } : { structuredSnippetAsset: { header: e.enTete, values: e.valeurs } };

type LigneAsset = {
  asset?: {
    id?: string; type?: string; finalUrls?: string[];
    sitelinkAsset?: { linkText?: string; description1?: string; description2?: string };
    calloutAsset?: { calloutText?: string };
    structuredSnippetAsset?: { header?: string; values?: string[] };
  };
};

const CHAMPS_ASSET = 'asset.id, asset.type, asset.final_urls, asset.sitelink_asset.link_text, asset.sitelink_asset.description1, ' +
  'asset.sitelink_asset.description2, asset.callout_asset.callout_text, asset.structured_snippet_asset.header, asset.structured_snippet_asset.values';

const depuisAsset = (a: LigneAsset['asset']): Element | null => {
  if (a?.type === 'SITELINK' && a.sitelinkAsset?.linkText) {
    return { type: 'SITELINK', texte: a.sitelinkAsset.linkText, description1: a.sitelinkAsset.description1, description2: a.sitelinkAsset.description2, url: a.finalUrls?.[0] ?? '' };
  }
  if (a?.type === 'CALLOUT' && a.calloutAsset?.calloutText) return { type: 'CALLOUT', texte: a.calloutAsset.calloutText };
  if (a?.type === 'STRUCTURED_SNIPPET' && a.structuredSnippetAsset?.header) {
    return { type: 'STRUCTURED_SNIPPET', enTete: a.structuredSnippetAsset.header, valeurs: a.structuredSnippetAsset.values ?? [] };
  }
  return null;
};

/** Ce que le filtre et le cadre déontologique disent d'un élément : refus et avertissements. */
const examiner = (e: Element) => {
  const { refus, avertissements } = examinerAnnonce(textesDe(e));
  if (e.type === 'SITELINK' && PAGE_BREATHWORK.test(e.url)) {
    avertissements.push(`le lien annexe « ${e.texte} » mène à une page de breathwork : le cadre déontologique exige que toute promotion ` +
      'du breathwork mentionne le questionnaire de santé préalable (socle/cadre-deontologique.md)');
  }
  return { refus, avertissements };
};

// ── Lectures ─────────────────────────────────────────────────────────────

type Cible = { niveau: 'campagne' | 'groupe'; id: string; nom: string; campagne: { id: string; nom: string } };

const decrireCible = (c: Cible) => (c.niveau === 'campagne' ? `la campagne « ${c.nom} » (${c.id})` : `le groupe « ${c.nom} » (${c.id}, campagne « ${c.campagne.nom} »)`);
/** « à la campagne … », « au groupe … » — la contraction que « à le groupe » oublierait. */
const aLaCible = (c: Cible) => (c.niveau === 'campagne' ? `à ${decrireCible(c)}` : `au ${decrireCible(c).slice('le '.length)}`);

/** Une campagne Search ou un groupe d'une campagne Search, vivants — l'un ou l'autre. */
const exigerCible = async (env: Env, compte: string, campagne?: string, groupe?: string): Promise<Cible> => {
  if ((campagne === undefined) === (groupe === undefined)) throw new Refus('Une cible : `campagne` OU `groupe` — l’une des deux.');
  if (campagne) {
    const c = (await premiereLigne<{ campaign?: { name?: string; status?: string; advertisingChannelType?: string } }>(env, compte,
      `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type FROM campaign WHERE campaign.id = ${campagne}`))?.campaign;
    if (!c || c.status === 'REMOVED') throw new Refus(`Campagne ${campagne} introuvable, ou supprimée.`);
    exigerSearch(c.advertisingChannelType, `La campagne « ${c.name} »`);
    return { niveau: 'campagne', id: campagne, nom: c.name ?? campagne, campagne: { id: campagne, nom: c.name ?? campagne } };
  }
  const l = await premiereLigne<{ adGroup?: { name?: string; status?: string }; campaign?: { id?: string; name?: string; advertisingChannelType?: string } }>(env, compte,
    `SELECT ad_group.id, ad_group.name, ad_group.status, campaign.id, campaign.name, campaign.advertising_channel_type FROM ad_group WHERE ad_group.id = ${groupe}`);
  if (!l?.adGroup || l.adGroup.status === 'REMOVED') throw new Refus(`Groupe d'annonces ${groupe} introuvable, ou supprimé.`);
  exigerSearch(l.campaign?.advertisingChannelType, `La campagne « ${l.campaign?.name} »`);
  const idCampagne = String(l.campaign?.id ?? '');
  if (!/^\d+$/.test(idCampagne)) throw new Error(`Groupe ${groupe} : campagne illisible`);
  return { niveau: 'groupe', id: groupe!, nom: l.adGroup.name ?? groupe!, campagne: { id: idCampagne, nom: l.campaign?.name ?? idCampagne } };
};

/** Les éléments du compte, par identifiant : leur contenu, pour les doublons et pour l'aperçu. */
const elementsDuCompte = async (env: Env, compte: string): Promise<Map<string, Element>> => new Map(
  (await lignes<LigneAsset>(env, compte, `SELECT ${CHAMPS_ASSET} FROM asset WHERE asset.type IN (${TYPES_ELEMENTS.map((t) => `'${t}'`).join(', ')})`))
    .flatMap(({ asset }) => {
      const e = depuisAsset(asset);
      return e && asset?.id ? [[String(asset.id), e] as const] : [];
    }),
);

type Lien = { niveau: 'compte' | 'campagne' | 'groupe'; asset: string; type: TypeElement; statut: string; groupe?: { id: string; nom: string } };

/**
 * Les associations des trois types autour de la cible : au compte, à sa
 * campagne, et à ses groupes (cible campagne) ou à elle-même (cible groupe).
 * Trois lectures, quel que soit le nombre d'éléments.
 */
const liensAutour = async (env: Env, compte: string, cible: Cible): Promise<Lien[]> => {
  const types = `(${TYPES_ELEMENTS.map((t) => `'${t}'`).join(', ')})`;
  type L = { asset?: { id?: string }; adGroup?: { id?: string; name?: string } } & Record<string, { fieldType?: string; status?: string } | undefined>;
  const lire = (niveau: Lien['niveau'], champ: string) => (l: L): Lien[] => {
    const lien = l[champ] as { fieldType?: string; status?: string } | undefined;
    return l.asset?.id && lien?.fieldType ? [{
      niveau, asset: String(l.asset.id), type: lien.fieldType as TypeElement, statut: lien.status ?? '?',
      ...(l.adGroup?.id ? { groupe: { id: String(l.adGroup.id), nom: l.adGroup.name ?? String(l.adGroup.id) } } : {}),
    }] : [];
  };
  const [auCompte, aLaCampagne, auxGroupes] = await Promise.all([
    lignes<L>(env, compte, `SELECT asset.id, customer_asset.field_type, customer_asset.status FROM customer_asset WHERE customer_asset.field_type IN ${types} AND customer_asset.status != 'REMOVED'`),
    lignes<L>(env, compte, `SELECT asset.id, campaign_asset.field_type, campaign_asset.status FROM campaign_asset WHERE campaign.id = ${cible.campagne.id} AND campaign_asset.field_type IN ${types} AND campaign_asset.status != 'REMOVED'`),
    lignes<L>(env, compte, 'SELECT ad_group.id, ad_group.name, asset.id, ad_group_asset.field_type, ad_group_asset.status FROM ad_group_asset WHERE ' +
      (cible.niveau === 'groupe' ? `ad_group.id = ${cible.id}` : `ad_group.campaign = 'customers/${compte}/campaigns/${cible.campagne.id}'`) +
      ` AND ad_group_asset.field_type IN ${types} AND ad_group_asset.status != 'REMOVED'`),
  ]);
  return [
    ...auCompte.flatMap(lire('compte', 'customerAsset')),
    ...aLaCampagne.flatMap(lire('campagne', 'campaignAsset')),
    ...auxGroupes.flatMap(lire('groupe', 'adGroupAsset')),
  ];
};

const estALaCible = (l: Lien, cible: Cible) => (cible.niveau === 'campagne' ? l.niveau === 'campagne' : l.niveau === 'groupe' && l.groupe?.id === cible.id);

const decrireLien = (l: Lien, contenus: Map<string, Element>) => {
  const e = contenus.get(l.asset);
  return `- ${e ? affiche(e) : `élément ${l.asset}`} (élément ${l.asset}, ${STATUTS[l.statut] ?? l.statut})`;
};

/**
 * Ce qui est déjà en place pour ce type, et ce qui masque ou serait masqué :
 * pour un type donné, Google n'affiche que le niveau le plus fin qui en a
 * d'actifs — groupe, sinon campagne, sinon compte. Seules les associations
 * actives comptent : une association en pause ne masque rien.
 * `retire` : l'élément dont on retire l'association à la cible, pour dire ce
 * qui prendra le relais.
 */
const decrireNiveaux = (cible: Cible, liens: Lien[], type: TypeElement, contenus: Map<string, Element>, retire?: string): string[] => {
  const { un, des } = NOMS[type];
  const duType = liens.filter((l) => l.type === type);
  const actifs = (xs: Lien[]) => xs.filter((l) => l.statut === 'ENABLED');
  const ici = duType.filter((l) => estALaCible(l, cible));
  const au = cible.niveau === 'campagne' ? 'cette campagne' : 'ce groupe';
  // Les niveaux au-dessus de la cible, du plus fin au plus large.
  const dessus = [
    ...(cible.niveau === 'groupe' ? [{ ou: 'de la campagne', xs: actifs(duType.filter((l) => l.niveau === 'campagne')) }] : []),
    { ou: 'du compte', xs: actifs(duType.filter((l) => l.niveau === 'compte')) },
  ].filter(({ xs }) => xs.length > 0);

  if (retire !== undefined) {
    const restent = actifs(ici.filter((l) => l.asset !== retire));
    if (restent.length) return [`${capitale(des)} ${accord(type, 'actifs', 'actives')} qui restent ${aLaCible(cible)} :`, ...restent.map((l) => decrireLien(l, contenus))];
    const [relais] = dessus;
    return relais
      ? [`Plus ${accord(type, 'aucun', 'aucune')} ${un} ${accord(type, 'actif', 'active')} à ce niveau : ${accord(type, 'ceux', 'celles')} ${relais.ou} ` +
        `prendront le relais pour ${au} :`, ...relais.xs.map((l) => decrireLien(l, contenus))]
      : [`Plus ${accord(type, 'aucun', 'aucune')} ${un} ${accord(type, 'actif', 'active')} à ce niveau ni au-dessus : ${au} n'en affichera plus.`];
  }

  const sortie = ici.length
    ? [`${capitale(des)} déjà ${accord(type, 'associés', 'associées')} ${aLaCible(cible)} (${ici.length}) :`, ...ici.map((l) => decrireLien(l, contenus))]
    : [`${accord(type, 'Aucun', 'Aucune')} ${un} déjà ${accord(type, 'associé', 'associée')} ${aLaCible(cible)}.`];
  // Le premier niveau au-dessus qui a des actifs s'affiche aujourd'hui pour la cible — si elle n'a pas les siens.
  let affiche = actifs(ici).length === 0;
  for (const { ou, xs } of dessus) {
    sortie.push(affiche
      ? `${capitale(des)} ${ou} (${xs.length}) : ${accord(type, 'ils', 'elles')} s'affichent aujourd'hui pour ${au}, et y seront ` +
        `${accord(type, 'masqués', 'masquées')} dès qu'${accord(type, 'un', 'une')} ${un} de ${au} sera ${accord(type, 'actif', 'active')}.`
      : `${capitale(des)} ${ou} (${xs.length}) : déjà ${accord(type, 'masqués', 'masquées')} pour ${au} par un niveau plus fin.`);
    affiche = false;
  }
  if (cible.niveau === 'campagne') {
    const parGroupe = new Map<string, number>();
    for (const l of actifs(duType.filter((x) => x.niveau === 'groupe'))) {
      const nom = l.groupe ? `« ${l.groupe.nom} » (${l.groupe.id})` : '?';
      parGroupe.set(nom, (parGroupe.get(nom) ?? 0) + 1);
    }
    if (parGroupe.size) {
      sortie.push(`Ces groupes ont leurs propres ${des}, qui masquent ${accord(type, 'ceux', 'celles')} de la campagne : ` +
        `${accord(type, 'les nouveaux', 'les nouvelles')} ne s'y afficheront pas — ` + [...parGroupe].map(([nom, n]) => `${nom} : ${n}`).join(', ') + '.');
    }
  }
  return sortie;
};

// ── ads_elements_creer ───────────────────────────────────────────────────

const elementsCreer = outil({
  name: 'ads_elements_creer',
  title: "Créer des éléments d'annonce (en pause)",
  description: [
    "Crée des éléments d'annonce Search et les associe EN PAUSE à une campagne OU à un groupe d'annonces : " +
    `liens annexes (texte de ${LIMITES_ELEMENTS.lien} caractères, deux descriptions de ${LIMITES_ELEMENTS.lienDescription} — les deux ou aucune —, ` +
    'URL finale sur https://www.luminose.fr/ ou https://luminose.fr/), accroches (' + LIMITES_ELEMENTS.accroche + ' caractères), ' +
    `extraits structurés (un en-tête de la liste de Google, ${LIMITES_ELEMENTS.valeursMin} à ${LIMITES_ELEMENTS.valeursMax} valeurs de ${LIMITES_ELEMENTS.valeur} caractères).`,
    '',
    EN_PAUSE,
    '',
    DEUX_TEMPS,
    '',
    'Les textes passent le filtre déontologique des annonces. Un élément au contenu identique qui existe déjà dans le compte est ' +
    "écarté : l'aperçu donne son identifiant, pour l'associer avec ads_elements_associer plutôt que de le recréer. " +
    `En-têtes d'extrait : ${EN_TETES_EXTRAITS.join(', ')}.`,
  ].join('\n'),
  schema: z.object({
    campagne: ID.optional().describe('La campagne (campaign.id) — ou `groupe`.'),
    groupe: ID.optional().describe("Le groupe d'annonces (ad_group.id) — ou `campagne`."),
    liens_annexes: z.array(z.object({
      texte: z.string().min(1).max(100),
      description1: z.string().min(1).max(100).optional(),
      description2: z.string().min(1).max(100).optional(),
      url_finale: z.string().max(2048),
    }).strict()).min(1).max(20).optional(),
    accroches: z.array(z.string().min(1).max(100)).min(1).max(20).optional(),
    extraits: z.array(z.object({
      en_tete: z.enum(EN_TETES_EXTRAITS),
      valeurs: z.array(z.string().min(1).max(100)).min(1).max(20),
    }).strict()).min(1).max(10).optional(),
    jeton: JETON,
  }).strict(),
  annotations: AJOUT,
  async executer({ campagne, groupe, liens_annexes, accroches, extraits, jeton }, env, contexte) {
    exigerEcriture(contexte);
    const compte = compteEcriture(env);

    const demandes: Element[] = [
      ...(liens_annexes ?? []).map((l): Element => ({
        type: 'SITELINK', texte: net(l.texte), url: l.url_finale.trim(),
        ...(l.description1 !== undefined ? { description1: net(l.description1) } : {}),
        ...(l.description2 !== undefined ? { description2: net(l.description2) } : {}),
      })),
      ...(accroches ?? []).map((t): Element => ({ type: 'CALLOUT', texte: net(t) })),
      ...(extraits ?? []).map((x): Element => ({ type: 'STRUCTURED_SNIPPET', enTete: x.en_tete, valeurs: x.valeurs.map(net) })),
    ];
    if (demandes.length === 0) throw new Refus('Aucun élément : liens_annexes, accroches ou extraits.');

    // Les limites de Google, comptées comme Google les compte ; l'URL ; le filtre. Tout est dit d'un coup.
    const fautes: string[] = [];
    const trop = (t: string, max: number, quoi: string) => { if (longueur(t) > max) fautes.push(`- ${quoi} « ${t} » : ${longueur(t)} caractères — ${max} au plus.`); };
    const vus = new Set<string>();
    for (const e of demandes) {
      if (e.type === 'SITELINK') {
        trop(e.texte, LIMITES_ELEMENTS.lien, 'lien annexe');
        if ((e.description1 === undefined) !== (e.description2 === undefined)) fautes.push(`- lien annexe « ${e.texte} » : les deux descriptions, ou aucune — Google n'en admet pas une seule.`);
        for (const d of [e.description1, e.description2]) if (d !== undefined) trop(d, LIMITES_ELEMENTS.lienDescription, `description du lien « ${e.texte} »`);
        if (!urlAdmise(e.url)) fautes.push(`- lien annexe « ${e.texte} » : URL « ${e.url} » refusée — https://www.luminose.fr/… ou https://luminose.fr/…, sans sous-domaine.`);
      } else if (e.type === 'CALLOUT') {
        trop(e.texte, LIMITES_ELEMENTS.accroche, 'accroche');
      } else {
        if (e.valeurs.length < LIMITES_ELEMENTS.valeursMin || e.valeurs.length > LIMITES_ELEMENTS.valeursMax) {
          fautes.push(`- extrait « ${e.enTete} » : ${e.valeurs.length} valeurs — de ${LIMITES_ELEMENTS.valeursMin} à ${LIMITES_ELEMENTS.valeursMax}.`);
        }
        for (const v of e.valeurs) trop(v, LIMITES_ELEMENTS.valeur, `valeur de l'extrait « ${e.enTete} »`);
        if (new Set(e.valeurs.map(minuscules)).size !== e.valeurs.length) fautes.push(`- extrait « ${e.enTete} » : une valeur en double.`);
      }
      if (textesDe(e).some((t) => /[{}]/.test(t))) fautes.push(`- ${NOMS[e.type].un} ${affiche(e)} : pas d'accolades — l'insertion de mot-clé n'existe que dans les annonces.`);
      for (const r of examiner(e).refus) fautes.push(`- ${NOMS[e.type].un} ${affiche(e)} : texte refusé par le filtre déontologique — ${r}`);
      if (vus.has(cle(e))) fautes.push(`- ${NOMS[e.type].un} ${affiche(e)} : en double dans la demande.`);
      vus.add(cle(e));
    }
    if (fautes.length) throw new Refus(['Éléments refusés, rien n’est parti :', ...fautes].join('\n'));

    const cible = await exigerCible(env, compte, campagne, groupe);
    const [contenus, liens] = await Promise.all([elementsDuCompte(env, compte), liensAutour(env, compte, cible)]);
    const parCle = new Map([...contenus].map(([id, e]) => [cle(e), id]));
    const suggestion = (id: string) => `ads_elements_associer { asset: "${id}", ${cible.niveau}: "${cible.id}" }`;

    return texte(await ecrire(env, contexte, {
      outil: 'ads_elements_creer',
      compte,
      jeton,
      preparation: async (temps: Temps): Promise<Preparation> => {
        // Les doublons écartés à l'aperçu voyagent dans le jeton : l'exécution ne relit pas le compte pour en décider.
        const ecartes = temps.execution
          ? new Set((temps.fige as { e?: number[] } | undefined)?.e ?? [])
          : new Set(demandes.flatMap((e, i) => (parCle.has(cle(e)) ? [i] : [])));
        const retenus = demandes.filter((_, i) => !ecartes.has(i));
        const doublons = demandes.filter((_, i) => ecartes.has(i));
        if (!temps.execution && retenus.length === 0) {
          throw new Refus(['Rien à créer : chaque élément existe déjà dans le compte. Les associer plutôt :',
            ...doublons.map((e) => `- ${NOMS[e.type].un} ${affiche(e)} — ${suggestion(parCle.get(cle(e))!)}`)].join('\n'));
        }

        const [champ, ressource, operationLien] = cible.niveau === 'campagne'
          ? ['campaign', `customers/${compte}/campaigns/${cible.id}`, 'campaignAssetOperation']
          : ['adGroup', `customers/${compte}/adGroups/${cible.id}`, 'adGroupAssetOperation'];
        const temporaire = (i: number) => `customers/${compte}/assets/-${i + 1}`;
        const operations: Operation[] = [
          ...retenus.map((e, i) => ({ assetOperation: { create: { resourceName: temporaire(i), ...versAsset(e) } } })),
          ...retenus.map((e, i) => ({ [operationLien]: { create: { [champ]: ressource, asset: temporaire(i), fieldType: e.type, status: 'PAUSED' } } })),
        ];

        // Pas un doublon, mais presque : le même texte à la casse près, ou un lien annexe au même texte vers une autre page.
        const proches = retenus.flatMap((e) => [...contenus].filter(([, x]) => cleProche(x) === cleProche(e))
          .map(([id, x]) => `- ${NOMS[e.type].un} ${affiche(e)} : le compte a déjà ${affiche(x)} (élément ${id}) — ${suggestion(id)} s'il fait l'affaire.`));
        const avertissements = retenus.flatMap((e) => examiner(e).avertissements.map((a) => `- ${NOMS[e.type].un} ${affiche(e)} : ${a}`));
        const types = [...new Set(retenus.map((e) => e.type))];
        const n = retenus.length;
        return {
          service: 'googleAds',
          operations,
          demande: { cible: `${cible.niveau}:${cible.id}`, elements: demandes.map(cle) },
          ...(ecartes.size ? { fige: { e: [...ecartes].sort((a, b) => a - b) } } : {}),
          description: [
            `${n} élément${n > 1 ? 's' : ''} d'annonce créé${n > 1 ? 's' : ''} et associé${n > 1 ? 's' : ''} EN PAUSE ${aLaCible(cible)} :`,
            ...retenus.map((e) => `- ${NOMS[e.type].un} ${affiche(e)}`),
            'Rien ne s’affiche avant que Florent active l’association dans l’interface.',
            ...(doublons.length
              ? ['', `DOUBLONS — déjà dans le compte, écartés : les associer plutôt que les recréer (${doublons.length}) :`,
                ...doublons.map((e) => `- ${NOMS[e.type].un} ${affiche(e)} — ${suggestion(parCle.get(cle(e)) ?? '?')}`)]
              : []),
            ...(proches.length ? ['', 'PRESQUE DES DOUBLONS — à vérifier :', ...proches] : []),
            ...types.flatMap((t) => ['', ...decrireNiveaux(cible, liens, t, contenus)]),
            ...(avertissements.length ? ['', 'AVERTISSEMENTS — à relire avant de valider :', ...avertissements] : []),
          ].join('\n'),
          bilan: `${n} élément${n > 1 ? 's' : ''} créé${n > 1 ? 's' : ''} et associé${n > 1 ? 's' : ''} EN PAUSE ${aLaCible(cible)}. ` +
            'Ils s’afficheront une fois l’association activée dans l’interface Google Ads.',
        };
      },
    }));
  },
});

// ── ads_elements_associer et ads_elements_dissocier ─────────────────────

/** Un élément du compte, d'un des trois types gérés ici. */
const exigerElement = async (env: Env, compte: string, asset: string): Promise<Element> => {
  const l = await premiereLigne<LigneAsset>(env, compte, `SELECT ${CHAMPS_ASSET} FROM asset WHERE asset.id = ${asset}`);
  if (!l?.asset) throw new Refus(`Élément ${asset} introuvable dans le compte.`, 404);
  const e = depuisAsset(l.asset);
  if (!e) throw new Refus(`L'élément ${asset} est de type ${l.asset.type ?? 'inconnu'} : ce serveur ne gère que les liens annexes, accroches et extraits structurés.`);
  return e;
};

const CIBLE = {
  campagne: ID.optional().describe('La campagne (campaign.id) — ou `groupe`.'),
  groupe: ID.optional().describe("Le groupe d'annonces (ad_group.id) — ou `campagne`."),
};

const lienDe = (compte: string, cible: Cible) => (cible.niveau === 'campagne'
  ? { service: 'campaignAssets' as const, champ: 'campaign', ressource: `customers/${compte}/campaigns/${cible.id}` }
  : { service: 'adGroupAssets' as const, champ: 'adGroup', ressource: `customers/${compte}/adGroups/${cible.id}` });

const elementsAssocier = outil({
  name: 'ads_elements_associer',
  title: "Associer un élément d'annonce existant (en pause)",
  description: [
    "Associe à une campagne OU à un groupe d'annonces Search un élément qui existe déjà dans le compte — lien annexe, accroche ou " +
    "extrait structuré —, désigné par son identifiant (asset.id), sans le recréer. Exemple : l'extrait « Quartiers », 68824727611.",
    '',
    EN_PAUSE,
    '',
    DEUX_TEMPS,
    '',
    "L'élément passe le filtre déontologique des annonces, et un lien annexe doit mener à luminose.fr. Retrouver les éléments : " +
    "ads_requete, SELECT asset.id, asset.type, asset.sitelink_asset.link_text, asset.callout_asset.callout_text, " +
    "asset.structured_snippet_asset.header FROM asset WHERE asset.type IN ('SITELINK', 'CALLOUT', 'STRUCTURED_SNIPPET').",
  ].join('\n'),
  schema: z.object({ asset: ID.describe("L'élément (asset.id)."), ...CIBLE, jeton: JETON }).strict(),
  annotations: AJOUT,
  async executer({ asset, campagne, groupe, jeton }, env, contexte) {
    exigerEcriture(contexte);
    const compte = compteEcriture(env);
    const cible = await exigerCible(env, compte, campagne, groupe);
    const e = await exigerElement(env, compte, asset);
    const { refus, avertissements } = examiner(e);
    if (refus.length) throw new Refus([`L'élément ${asset} porte un texte refusé par le filtre déontologique : rien n'est parti.`, ...refus.map((r) => `- ${r}`)].join('\n'));
    if (e.type === 'SITELINK' && !urlAdmise(e.url)) throw new Refus(`Le lien annexe ${asset} mène à « ${e.url} » : hors de luminose.fr, il ne s'associe pas d'ici.`);

    const [contenus, liens] = await Promise.all([elementsDuCompte(env, compte), liensAutour(env, compte, cible)]);
    const deja = liens.find((l) => l.asset === asset && l.type === e.type && estALaCible(l, cible));
    if (deja) throw new Refus(`L'élément ${asset} est déjà associé ${aLaCible(cible)} (${STATUTS[deja.statut] ?? deja.statut}) : rien à faire.`);

    const { service, champ, ressource } = lienDe(compte, cible);
    return texte(await ecrire(env, contexte, {
      outil: 'ads_elements_associer',
      compte,
      jeton,
      preparation: {
        service,
        operations: [{ create: { [champ]: ressource, asset: `customers/${compte}/assets/${asset}`, fieldType: e.type, status: 'PAUSED' } }],
        description: [
          `Associer ${NOMS[e.type].le} ${affiche(e)} (élément ${asset}) ${aLaCible(cible)}, EN PAUSE.`,
          'Rien ne s’affiche avant que Florent active l’association dans l’interface.',
          '',
          ...decrireNiveaux(cible, liens, e.type, contenus),
          ...(avertissements.length ? ['', 'AVERTISSEMENTS — à relire avant de valider :', ...avertissements.map((a) => `- ${a}`)] : []),
        ].join('\n'),
        bilan: `${capitale(NOMS[e.type].un)} ${asset} ${accord(e.type, 'associé', 'associée')} EN PAUSE ${aLaCible(cible)}.`,
      },
    }));
  },
});

const elementsDissocier = outil({
  name: 'ads_elements_dissocier',
  title: "Dissocier un élément d'annonce",
  description: [
    "Retire l'association d'un élément d'annonce — lien annexe, accroche, extrait structuré — à une campagne OU à un groupe " +
    "d'annonces. L'élément lui-même reste dans le compte, avec ses autres associations.",
    '',
    DEUX_TEMPS,
    '',
    "L'aperçu dit ce qui reste à ce niveau, et, s'il n'y reste plus rien d'actif de ce type, quels éléments du niveau supérieur " +
    'reprendront la main.',
  ].join('\n'),
  schema: z.object({ asset: ID.describe("L'élément (asset.id)."), ...CIBLE, jeton: JETON }).strict(),
  annotations: RETRAIT,
  async executer({ asset, campagne, groupe, jeton }, env, contexte) {
    exigerEcriture(contexte);
    const compte = compteEcriture(env);
    const cible = await exigerCible(env, compte, campagne, groupe);
    const e = await exigerElement(env, compte, asset);
    const [contenus, liens] = await Promise.all([elementsDuCompte(env, compte), liensAutour(env, compte, cible)]);
    const lien = liens.find((l) => l.asset === asset && l.type === e.type && estALaCible(l, cible));
    if (!lien) throw new Refus(`L'élément ${asset} n'est pas associé ${aLaCible(cible)} : rien à faire.`);

    const { service } = lienDe(compte, cible);
    return texte(await ecrire(env, contexte, {
      outil: 'ads_elements_dissocier',
      compte,
      jeton,
      preparation: {
        service,
        operations: [{ remove: `customers/${compte}/${service}/${cible.id}~${asset}~${e.type}` }],
        description: [
          `RETRAIT de l'association ${NOMS[e.type].du} ${affiche(e)} (élément ${asset}, ${STATUTS[lien.statut] ?? lien.statut}) ${aLaCible(cible)}.`,
          "L'élément reste dans le compte, et ses autres associations aussi.",
          '',
          // Une association en pause ne s'affichait pas : la retirer ne change rien à ce que voient les internautes.
          ...(lien.statut === 'ENABLED'
            ? decrireNiveaux(cible, liens, e.type, contenus, asset)
            : ["L'association était en pause : l'affichage ne change pas."]),
        ].join('\n'),
        bilan: `Association retirée : élément ${asset} et ${decrireCible(cible)}. L'élément reste dans le compte.`,
      },
    }));
  },
});

export const OUTILS_ELEMENTS = [elementsCreer, elementsAssocier, elementsDissocier] as const;
