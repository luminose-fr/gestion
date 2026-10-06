/**
 * Les éléments d'annonce — liens annexes, info-bulles, extraits structurés,
 * prix — décisions du 04/10/2026 et du 06/10/2026
 * (workers/mcp/decisions/2026-10-04-elements-et-insertion.md).
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
 * filtre déontologique des annonces (V4).
 *
 * Le statut à la naissance (06/10/2026) : une association naît EN PAUSE quand
 * sa campagne est active, ACTIVE quand sa campagne est en pause — la pause de
 * la campagne suffit alors comme barrière, et Florent n'a pas à activer un à un
 * des éléments qu'il relira avec la campagne. Le statut lu à l'aperçu voyage
 * dans le jeton ; à l'exécution, une campagne activée entre-temps fait refuser,
 * et la table le redemande au compte.
 *
 * Vocabulaire : les « callouts » de Google s'appellent « info-bulles » dans son
 * interface française. `accroches`, l'ancien nom du paramètre, reste accepté.
 */
import { z } from 'zod';
import { compteEcriture, ecrire, exigerEcriture, type Preparation, type Temps } from './ecriture';
import {
  EN_TETES_EXTRAITS, LIMITES_ELEMENTS, QUALIFICATIFS_PRIX, TYPES_ELEMENTS, TYPES_PRIX, UNITES_PRIX,
  type Operation, type TypeElement,
} from './google-ads';
import { longueur } from './insertion';
import { outil, texte } from './outil';
import { DEUX_TEMPS, JETON, exigerSearch, lignes, premiereLigne } from './outils-ecriture';
import { examinerAnnonce, urlAdmise } from './regles';
import { Refus } from './refus';
import type { Env } from './env';

const ID = z.string().regex(/^\d{1,20}$/, 'identifiant numérique');
const AJOUT = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const RETRAIT = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };

type TypePrix = keyof typeof TYPES_PRIX;
type Qualificatif = keyof typeof QUALIFICATIFS_PRIX;
type Unite = keyof typeof UNITES_PRIX;
const cles = <T extends object>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

const NOMS: Record<TypeElement, { un: string; des: string; le: string; du: string; f: boolean }> = {
  SITELINK: { un: 'lien annexe', des: 'liens annexes', le: 'le lien annexe', du: 'du lien annexe', f: false },
  CALLOUT: { un: 'info-bulle', des: 'info-bulles', le: "l'info-bulle", du: "de l'info-bulle", f: true },
  STRUCTURED_SNIPPET: { un: 'extrait structuré', des: 'extraits structurés', le: "l'extrait structuré", du: "de l'extrait structuré", f: false },
  PRICE: { un: 'élément de prix', des: 'éléments de prix', le: "l'élément de prix", du: "de l'élément de prix", f: false },
};
/** L'accord du type : « aucun lien annexe actif », « aucune info-bulle active ». */
const accord = (type: TypeElement, masculin: string, feminin: string) => (NOMS[type].f ? feminin : masculin);
const capitale = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const STATUTS: Record<string, string> = { ENABLED: 'association active', PAUSED: 'association en pause' };

const REGLE_NAISSANCE =
  "Statut à la naissance : l'association naît EN PAUSE si la campagne visée — ou celle du groupe visé — est active, et Florent " +
  "l'active dans l'interface Google Ads ; elle naît ACTIVE si la campagne est en pause, dont la pause suffit alors comme barrière. " +
  "L'aperçu dit lequel s'applique. Pour un même type, le niveau le plus fin l’emporte — un groupe qui a ses propres liens annexes " +
  'masque ceux de sa campagne, qui masquent ceux du compte ; l’aperçu dit ce qui serait masqué.';

/** Le cadre déontologique : toute promotion du breathwork mentionne le questionnaire de santé (socle/cadre-deontologique.md). */
const PAGE_BREATHWORK = /respiration-holotropique|breathwork/i;
const QUESTIONNAIRE = /questionnaire/i;

// ── Un élément, tel que le serveur le manipule ───────────────────────────

type LignePrix = { titre: string; description: string; micros: string; unite?: Unite; url: string };

type Element =
  | { type: 'SITELINK'; texte: string; description1?: string; description2?: string; url: string }
  | { type: 'CALLOUT'; texte: string }
  | { type: 'STRUCTURED_SNIPPET'; enTete: string; valeurs: string[] }
  | { type: 'PRICE'; typePrix: string; qualificatif?: string; lignes: LignePrix[] };

const net = (t: string) => t.normalize('NFC').trim().replace(/\s+/g, ' ');
const minuscules = (t: string) => net(t).toLocaleLowerCase('fr');
const urlComparable = (u: string) => u.trim().toLowerCase().replace(/\/+$/, '');
const euros = (micros: string) => {
  const e = Number(micros) / 1_000_000;
  return `${Number.isInteger(e) ? String(e) : e.toFixed(2).replace('.', ',')} €`;
};

/**
 * Deux éléments au même contenu affiché sont un doublon : recréer ne sert à
 * rien, associer l'existant suffit. La casse compte — « Séance en ligne » et
 * « séance en ligne » ne s'affichent pas pareil.
 */
const cle = (e: Element): string => JSON.stringify(e.type === 'SITELINK'
  ? [e.type, net(e.texte), net(e.description1 ?? ''), net(e.description2 ?? ''), urlComparable(e.url)]
  : e.type === 'CALLOUT' ? [e.type, net(e.texte)]
    : e.type === 'STRUCTURED_SNIPPET' ? [e.type, e.enTete, ...e.valeurs.map(net)]
      : [e.type, e.typePrix, e.qualificatif ?? '', ...e.lignes.map((l) => [net(l.titre), net(l.description), l.micros, l.unite ?? '', urlComparable(l.url)])]);

/** Le même texte à la casse près — ou, pour un lien annexe, le même texte vers une autre page : à signaler, pas à écarter. */
const cleProche = (e: Element): string => JSON.stringify(e.type === 'SITELINK'
  ? [e.type, minuscules(e.texte)]
  : e.type === 'CALLOUT' ? [e.type, minuscules(e.texte)]
    : e.type === 'STRUCTURED_SNIPPET' ? [e.type, e.enTete, ...e.valeurs.map(minuscules).sort()]
      : [e.type, e.typePrix, ...e.lignes.map((l) => minuscules(l.titre)).sort()]);

const afficheLigne = (l: LignePrix) =>
  `« ${l.titre} » ${l.description}, ${euros(l.micros)}${l.unite ? ` ${UNITES_PRIX[l.unite]}` : ''} → ${l.url}`;

const affiche = (e: Element): string => e.type === 'SITELINK'
  ? `« ${e.texte} »${e.description1 ? ` (${e.description1} / ${e.description2})` : ''} → ${e.url}`
  : e.type === 'CALLOUT' ? `« ${e.texte} »`
    : e.type === 'STRUCTURED_SNIPPET' ? `${e.enTete} : ${e.valeurs.join(', ')}`
      : `${TYPES_PRIX[e.typePrix as TypePrix] ?? e.typePrix}${e.qualificatif ? `, ${QUALIFICATIFS_PRIX[e.qualificatif as Qualificatif] ?? e.qualificatif}` : ''} : ` +
        e.lignes.map(afficheLigne).join(' ; ');

const textesDe = (e: Element): string[] => e.type === 'SITELINK'
  ? [e.texte, e.description1, e.description2].filter((x): x is string => Boolean(x))
  : e.type === 'CALLOUT' ? [e.texte]
    : e.type === 'STRUCTURED_SNIPPET' ? e.valeurs
      : e.lignes.flatMap((l) => [l.titre, l.description]);

/** Les URL finales d'un élément : celle d'un lien annexe, celles des lignes d'un prix. */
const urlsDe = (e: Element): string[] => (e.type === 'SITELINK' ? [e.url] : e.type === 'PRICE' ? e.lignes.map((l) => l.url) : []);

/** L'élément sous la forme que Google attend — et que la table fermée revérifie. */
const versAsset = (e: Element): Record<string, unknown> => e.type === 'SITELINK'
  ? { finalUrls: [e.url], sitelinkAsset: { linkText: e.texte, ...(e.description1 ? { description1: e.description1, description2: e.description2 } : {}) } }
  : e.type === 'CALLOUT' ? { calloutAsset: { calloutText: e.texte } }
    : e.type === 'STRUCTURED_SNIPPET' ? { structuredSnippetAsset: { header: e.enTete, values: e.valeurs } }
      : { priceAsset: {
        type: e.typePrix,
        ...(e.qualificatif ? { priceQualifier: e.qualificatif } : {}),
        languageCode: 'fr',
        priceOfferings: e.lignes.map((l) => ({
          header: l.titre, description: l.description,
          price: { currencyCode: 'EUR', amountMicros: l.micros },
          ...(l.unite ? { unit: l.unite } : {}),
          finalUrl: l.url,
        })),
      } };

type LigneAsset = {
  asset?: {
    id?: string; type?: string; finalUrls?: string[];
    sitelinkAsset?: { linkText?: string; description1?: string; description2?: string };
    calloutAsset?: { calloutText?: string };
    structuredSnippetAsset?: { header?: string; values?: string[] };
    priceAsset?: {
      type?: string; priceQualifier?: string;
      priceOfferings?: { header?: string; description?: string; price?: { amountMicros?: string }; unit?: string; finalUrl?: string }[];
    };
  };
};

const CHAMPS_ASSET = 'asset.id, asset.type, asset.final_urls, asset.sitelink_asset.link_text, asset.sitelink_asset.description1, ' +
  'asset.sitelink_asset.description2, asset.callout_asset.callout_text, asset.structured_snippet_asset.header, asset.structured_snippet_asset.values, ' +
  'asset.price_asset.type, asset.price_asset.price_qualifier, asset.price_asset.price_offerings';

const depuisAsset = (a: LigneAsset['asset']): Element | null => {
  if (a?.type === 'SITELINK' && a.sitelinkAsset?.linkText) {
    return { type: 'SITELINK', texte: a.sitelinkAsset.linkText, description1: a.sitelinkAsset.description1, description2: a.sitelinkAsset.description2, url: a.finalUrls?.[0] ?? '' };
  }
  if (a?.type === 'CALLOUT' && a.calloutAsset?.calloutText) return { type: 'CALLOUT', texte: a.calloutAsset.calloutText };
  if (a?.type === 'STRUCTURED_SNIPPET' && a.structuredSnippetAsset?.header) {
    return { type: 'STRUCTURED_SNIPPET', enTete: a.structuredSnippetAsset.header, valeurs: a.structuredSnippetAsset.values ?? [] };
  }
  if (a?.type === 'PRICE' && a.priceAsset?.type) {
    return {
      type: 'PRICE', typePrix: a.priceAsset.type,
      ...(a.priceAsset.priceQualifier && a.priceAsset.priceQualifier !== 'UNSPECIFIED' ? { qualificatif: a.priceAsset.priceQualifier } : {}),
      lignes: (a.priceAsset.priceOfferings ?? []).map((l) => ({
        titre: l.header ?? '', description: l.description ?? '', micros: String(l.price?.amountMicros ?? '0'),
        ...(l.unit && l.unit !== 'UNSPECIFIED' ? { unite: l.unit as Unite } : {}), url: l.finalUrl ?? '',
      })),
    };
  }
  return null;
};

/** Ce que le filtre et le cadre déontologique disent d'un élément : refus et avertissements. */
const examiner = (e: Element) => {
  if (e.type === 'PRICE') {
    // Les refus portent sur l'élément entier — ses lignes s'affichent ensemble ; les avertissements, ligne par ligne.
    const { refus } = examinerAnnonce(textesDe(e));
    const avertissements = e.lignes.flatMap((l) => {
      const ici = examinerAnnonce([l.titre, l.description]).avertissements;
      const page = PAGE_BREATHWORK.test(l.url) && !QUESTIONNAIRE.test(`${l.titre} ${l.description}`) && !ici.some((a) => a.startsWith('breathwork'))
        ? ['mène à une page de breathwork sans mention du questionnaire de santé préalable (socle/cadre-deontologique.md)'] : [];
      return [...ici, ...page].map((a) => `ligne « ${l.titre} » : ${a}`);
    });
    return { refus, avertissements };
  }
  const { refus, avertissements } = examinerAnnonce(textesDe(e));
  if (e.type === 'SITELINK' && PAGE_BREATHWORK.test(e.url)) {
    avertissements.push(`le lien annexe « ${e.texte} » mène à une page de breathwork : le cadre déontologique exige que toute promotion ` +
      'du breathwork mentionne le questionnaire de santé préalable (socle/cadre-deontologique.md)');
  }
  return { refus, avertissements };
};

// ── Lectures ─────────────────────────────────────────────────────────────

type Cible = { niveau: 'campagne' | 'groupe'; id: string; nom: string; campagne: { id: string; nom: string; statut: string } };
type Naissance = 'ENABLED' | 'PAUSED';

const decrireCible = (c: Cible) => (c.niveau === 'campagne' ? `la campagne « ${c.nom} » (${c.id})` : `le groupe « ${c.nom} » (${c.id}, campagne « ${c.campagne.nom} »)`);
/** « à la campagne … », « au groupe … » — la contraction que « à le groupe » oublierait. */
const aLaCible = (c: Cible) => (c.niveau === 'campagne' ? `à ${decrireCible(c)}` : `au ${decrireCible(c).slice('le '.length)}`);

/** Le statut à la naissance : ACTIVE derrière une campagne en pause, EN PAUSE derrière une campagne active. */
const naissance = (c: Cible): Naissance => (c.campagne.statut === 'PAUSED' ? 'ENABLED' : 'PAUSED');

const direNaissance = (c: Cible, s: Naissance) => (s === 'ENABLED'
  ? `L'association naît ACTIVE : la campagne « ${c.campagne.nom} » est en pause, et sa pause suffit comme barrière — rien ne s'affiche ` +
    "avant que Florent active la campagne."
  : `L'association naît EN PAUSE : la campagne « ${c.campagne.nom} » est active — rien ne s'affiche avant que Florent active ` +
    "l'association dans l'interface Google Ads.");

/** Ce que l'aperçu a décidé, rendu par le jeton — refusé si la campagne a été activée depuis. */
const naissanceFigee = (c: Cible, figee: Naissance | undefined): Naissance => {
  const s = figee ?? 'PAUSED';
  if (s === 'ENABLED' && c.campagne.statut !== 'PAUSED') {
    throw new Refus(`La campagne « ${c.campagne.nom} » a été activée depuis l'aperçu : l'association y naîtrait active, et ferait dépenser ` +
      "ce que personne n'a relu. Rien n'est parti. Refaites un aperçu : elle y naîtra en pause.");
  }
  return s;
};

/** Une campagne Search ou un groupe d'une campagne Search, vivants — l'un ou l'autre. */
const exigerCible = async (env: Env, compte: string, campagne?: string, groupe?: string): Promise<Cible> => {
  if ((campagne === undefined) === (groupe === undefined)) throw new Refus('Une cible : `campagne` OU `groupe` — l’une des deux.');
  if (campagne) {
    const c = (await premiereLigne<{ campaign?: { name?: string; status?: string; advertisingChannelType?: string } }>(env, compte,
      `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type FROM campaign WHERE campaign.id = ${campagne}`))?.campaign;
    if (!c || c.status === 'REMOVED') throw new Refus(`Campagne ${campagne} introuvable, ou supprimée.`);
    exigerSearch(c.advertisingChannelType, `La campagne « ${c.name} »`);
    return { niveau: 'campagne', id: campagne, nom: c.name ?? campagne, campagne: { id: campagne, nom: c.name ?? campagne, statut: c.status ?? '?' } };
  }
  const l = await premiereLigne<{ adGroup?: { name?: string; status?: string }; campaign?: { id?: string; name?: string; status?: string; advertisingChannelType?: string } }>(env, compte,
    'SELECT ad_group.id, ad_group.name, ad_group.status, campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type ' +
    `FROM ad_group WHERE ad_group.id = ${groupe}`);
  if (!l?.adGroup || l.adGroup.status === 'REMOVED') throw new Refus(`Groupe d'annonces ${groupe} introuvable, ou supprimé.`);
  exigerSearch(l.campaign?.advertisingChannelType, `La campagne « ${l.campaign?.name} »`);
  const idCampagne = String(l.campaign?.id ?? '');
  if (!/^\d+$/.test(idCampagne)) throw new Error(`Groupe ${groupe} : campagne illisible`);
  return {
    niveau: 'groupe', id: groupe!, nom: l.adGroup.name ?? groupe!,
    campagne: { id: idCampagne, nom: l.campaign?.name ?? idCampagne, statut: l.campaign?.status ?? '?' },
  };
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
 * Les associations des types gérés autour de la cible : au compte, à sa
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
    lignes<L>(env, compte, `SELECT campaign.id, asset.id, campaign_asset.field_type, campaign_asset.status FROM campaign_asset WHERE campaign.id = ${cible.campagne.id} AND campaign_asset.field_type IN ${types} AND campaign_asset.status != 'REMOVED'`),
    lignes<L>(env, compte, 'SELECT ad_group.id, ad_group.campaign, ad_group.name, asset.id, ad_group_asset.field_type, ad_group_asset.status FROM ad_group_asset WHERE ' +
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
 * `nee` : le statut à la naissance des nouvelles associations. `retire` :
 * l'élément dont on retire l'association à la cible, pour dire ce qui prendra
 * le relais.
 */
const decrireNiveaux = (cible: Cible, liens: Lien[], type: TypeElement, contenus: Map<string, Element>, nee: Naissance | null, retire?: string): string[] => {
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
  // Le premier niveau au-dessus qui a des actifs vaut aujourd'hui pour la cible — si elle n'a pas les siens.
  let vaut = actifs(ici).length === 0;
  for (const { ou, xs } of dessus) {
    sortie.push(!vaut
      ? `${capitale(des)} ${ou} (${xs.length}) : déjà ${accord(type, 'masqués', 'masquées')} pour ${au} par un niveau plus fin.`
      : nee === 'ENABLED'
        ? `${capitale(des)} ${ou} (${xs.length}) : ${accord(type, 'ils', 'elles')} valent aujourd'hui pour ${au} ; ` +
          `${accord(type, 'les nouveaux', 'les nouvelles')}, ${accord(type, 'nés actifs', 'nées actives')}, les masqueront.`
        : `${capitale(des)} ${ou} (${xs.length}) : ${accord(type, 'ils', 'elles')} valent aujourd'hui pour ${au}, et y seront ` +
          `${accord(type, 'masqués', 'masquées')} dès qu'${accord(type, 'un', 'une')} ${un} de ${au} sera ${accord(type, 'actif', 'active')}.`);
    vaut = false;
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

const TEXTE_COURT = z.string().min(1).max(100);

const elementsCreer = outil({
  name: 'ads_elements_creer',
  title: "Créer des éléments d'annonce",
  description: [
    "Crée des éléments d'annonce Search et les associe à une campagne OU à un groupe d'annonces :",
    `- liens annexes : texte de ${LIMITES_ELEMENTS.lien} caractères, deux descriptions de ${LIMITES_ELEMENTS.lienDescription} — les deux ou aucune —, ` +
    'URL finale sur https://www.luminose.fr/ ou https://luminose.fr/ ;',
    `- info-bulles (les « callouts » de Google) : ${LIMITES_ELEMENTS.infoBulle} caractères ;`,
    `- extraits structurés : un en-tête de la liste de Google, ${LIMITES_ELEMENTS.valeursMin} à ${LIMITES_ELEMENTS.valeursMax} valeurs de ${LIMITES_ELEMENTS.valeur} caractères ;`,
    `- prix : un type, un qualificatif facultatif, ${LIMITES_ELEMENTS.prixLignesMin} à ${LIMITES_ELEMENTS.prixLignesMax} lignes — chacune un titre et une ` +
    `description de ${LIMITES_ELEMENTS.prixTitre} caractères, un prix en euros, une unité facultative, une URL sur luminose.fr.`,
    '',
    REGLE_NAISSANCE,
    '',
    DEUX_TEMPS,
    '',
    'Les textes passent le filtre déontologique des annonces ; une ligne de prix qui promeut le breathwork sans mention du ' +
    "questionnaire de santé avertit. Un élément au contenu identique qui existe déjà dans le compte est écarté : l'aperçu donne " +
    "son identifiant, pour l'associer avec ads_elements_associer plutôt que de le recréer.",
    `En-têtes d'extrait : ${EN_TETES_EXTRAITS.join(', ')}.`,
    `Types de prix : ${Object.entries(TYPES_PRIX).map(([k, v]) => `${k} (${v})`).join(', ')}. ` +
    `Qualificatifs : ${Object.entries(QUALIFICATIFS_PRIX).map(([k, v]) => `${k} (${v})`).join(', ')}. ` +
    `Unités : ${Object.entries(UNITES_PRIX).map(([k, v]) => `${k} (${v})`).join(', ')}.`,
  ].join('\n'),
  schema: z.object({
    campagne: ID.optional().describe('La campagne (campaign.id) — ou `groupe`.'),
    groupe: ID.optional().describe("Le groupe d'annonces (ad_group.id) — ou `campagne`."),
    liens_annexes: z.array(z.object({
      texte: TEXTE_COURT,
      description1: TEXTE_COURT.optional(),
      description2: TEXTE_COURT.optional(),
      url_finale: z.string().max(2048),
    }).strict()).min(1).max(20).optional(),
    info_bulles: z.array(TEXTE_COURT).min(1).max(20).optional()
      .describe(`Les info-bulles (« callouts »), ${LIMITES_ELEMENTS.infoBulle} caractères chacune.`),
    accroches: z.array(TEXTE_COURT).min(1).max(20).optional()
      .describe('Ancien nom de `info_bulles`, accepté pendant la transition — l’un ou l’autre, pas les deux.'),
    extraits: z.array(z.object({
      en_tete: z.enum(EN_TETES_EXTRAITS),
      valeurs: z.array(TEXTE_COURT).min(1).max(20),
    }).strict()).min(1).max(10).optional(),
    prix: z.array(z.object({
      type: z.enum(cles(TYPES_PRIX)),
      qualificatif: z.enum(cles(QUALIFICATIFS_PRIX)).optional(),
      lignes: z.array(z.object({
        titre: TEXTE_COURT,
        description: TEXTE_COURT,
        prix: z.number().positive().max(100_000).describe('En euros, deux décimales au plus.'),
        unite: z.enum(cles(UNITES_PRIX)).optional(),
        url_finale: z.string().max(2048),
      }).strict()).min(1).max(20),
    }).strict()).min(1).max(5).optional(),
    jeton: JETON,
  }).strict(),
  annotations: AJOUT,
  async executer({ campagne, groupe, liens_annexes, info_bulles, accroches, extraits, prix, jeton }, env, contexte) {
    exigerEcriture(contexte);
    const compte = compteEcriture(env);
    if (info_bulles && accroches) throw new Refus('`info_bulles` OU `accroches` (son ancien nom), pas les deux.');

    const fautes: string[] = [];
    const demandes: Element[] = [
      ...(liens_annexes ?? []).map((l): Element => ({
        type: 'SITELINK', texte: net(l.texte), url: l.url_finale.trim(),
        ...(l.description1 !== undefined ? { description1: net(l.description1) } : {}),
        ...(l.description2 !== undefined ? { description2: net(l.description2) } : {}),
      })),
      ...(info_bulles ?? accroches ?? []).map((t): Element => ({ type: 'CALLOUT', texte: net(t) })),
      ...(extraits ?? []).map((x): Element => ({ type: 'STRUCTURED_SNIPPET', enTete: x.en_tete, valeurs: x.valeurs.map(net) })),
      ...(prix ?? []).map((p): Element => ({
        type: 'PRICE', typePrix: p.type, ...(p.qualificatif ? { qualificatif: p.qualificatif } : {}),
        lignes: p.lignes.map((l) => {
          // Des centimes, pas moins : Google compte en micros, et 12,345 € ne s'affiche pas.
          const centimes = Math.round(l.prix * 100);
          if (Math.abs(l.prix * 100 - centimes) > 1e-6) fautes.push(`- prix « ${l.titre} » : ${l.prix} € — deux décimales au plus.`);
          return { titre: net(l.titre), description: net(l.description), micros: String(centimes * 10_000), ...(l.unite ? { unite: l.unite } : {}), url: l.url_finale.trim() };
        }),
      })),
    ];
    if (demandes.length === 0) throw new Refus('Aucun élément : liens_annexes, info_bulles, extraits ou prix.');

    // Les limites de Google, comptées comme Google les compte ; l'URL ; le filtre. Tout est dit d'un coup.
    const trop = (t: string, max: number, quoi: string) => { if (longueur(t) > max) fautes.push(`- ${quoi} « ${t} » : ${longueur(t)} caractères — ${max} au plus.`); };
    const horsSite = (url: string, quoi: string) => {
      if (!urlAdmise(url)) fautes.push(`- ${quoi} : URL « ${url} » refusée — https://www.luminose.fr/… ou https://luminose.fr/…, sans sous-domaine.`);
    };
    const vus = new Set<string>();
    for (const e of demandes) {
      if (e.type === 'SITELINK') {
        trop(e.texte, LIMITES_ELEMENTS.lien, 'lien annexe');
        if ((e.description1 === undefined) !== (e.description2 === undefined)) fautes.push(`- lien annexe « ${e.texte} » : les deux descriptions, ou aucune — Google n'en admet pas une seule.`);
        for (const d of [e.description1, e.description2]) if (d !== undefined) trop(d, LIMITES_ELEMENTS.lienDescription, `description du lien « ${e.texte} »`);
        horsSite(e.url, `lien annexe « ${e.texte} »`);
      } else if (e.type === 'CALLOUT') {
        trop(e.texte, LIMITES_ELEMENTS.infoBulle, 'info-bulle');
      } else if (e.type === 'STRUCTURED_SNIPPET') {
        if (e.valeurs.length < LIMITES_ELEMENTS.valeursMin || e.valeurs.length > LIMITES_ELEMENTS.valeursMax) {
          fautes.push(`- extrait « ${e.enTete} » : ${e.valeurs.length} valeurs — de ${LIMITES_ELEMENTS.valeursMin} à ${LIMITES_ELEMENTS.valeursMax}.`);
        }
        for (const v of e.valeurs) trop(v, LIMITES_ELEMENTS.valeur, `valeur de l'extrait « ${e.enTete} »`);
        if (new Set(e.valeurs.map(minuscules)).size !== e.valeurs.length) fautes.push(`- extrait « ${e.enTete} » : une valeur en double.`);
      } else {
        const quoi = `prix « ${TYPES_PRIX[e.typePrix as TypePrix]} »`;
        if (e.lignes.length < LIMITES_ELEMENTS.prixLignesMin || e.lignes.length > LIMITES_ELEMENTS.prixLignesMax) {
          fautes.push(`- ${quoi} : ${e.lignes.length} lignes — de ${LIMITES_ELEMENTS.prixLignesMin} à ${LIMITES_ELEMENTS.prixLignesMax}.`);
        }
        for (const l of e.lignes) {
          trop(l.titre, LIMITES_ELEMENTS.prixTitre, 'titre de la ligne');
          trop(l.description, LIMITES_ELEMENTS.prixDescription, `description de la ligne « ${l.titre} »`);
          horsSite(l.url, `ligne « ${l.titre} »`);
        }
        if (new Set(e.lignes.map((l) => minuscules(l.titre))).size !== e.lignes.length) fautes.push(`- ${quoi} : deux lignes au même titre.`);
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
        // Ce que l'aperçu a lu voyage dans le jeton : les doublons écartés, le statut à la naissance.
        const fige = temps.execution ? (temps.fige as { e?: number[]; s?: Naissance } | undefined) : undefined;
        const ecartes = temps.execution
          ? new Set(fige?.e ?? [])
          : new Set(demandes.flatMap((e, i) => (parCle.has(cle(e)) ? [i] : [])));
        const statut = temps.execution ? naissanceFigee(cible, fige?.s) : naissance(cible);
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
          ...retenus.map((e, i) => ({ [operationLien]: { create: { [champ]: ressource, asset: temporaire(i), fieldType: e.type, status: statut } } })),
        ];

        // Pas un doublon, mais presque : le même texte à la casse près, ou un lien annexe au même texte vers une autre page.
        const proches = retenus.flatMap((e) => [...contenus].filter(([, x]) => cleProche(x) === cleProche(e))
          .map(([id, x]) => `- ${NOMS[e.type].un} ${affiche(e)} : le compte a déjà ${affiche(x)} (élément ${id}) — ${suggestion(id)} s'il fait l'affaire.`));
        const avertissements = retenus.flatMap((e) => examiner(e).avertissements.map((a) => `- ${NOMS[e.type].un} ${affiche(e)} : ${a}`));
        const types = [...new Set(retenus.map((e) => e.type))];
        const n = retenus.length;
        const s = n > 1 ? 's' : '';
        return {
          service: 'googleAds',
          operations,
          demande: { cible: `${cible.niveau}:${cible.id}`, elements: demandes.map(cle) },
          fige: { s: statut, ...(ecartes.size ? { e: [...ecartes].sort((a, b) => a - b) } : {}) },
          description: [
            `${n} élément${s} d'annonce créé${s} et associé${s} ${aLaCible(cible)} :`,
            ...retenus.map((e) => `- ${NOMS[e.type].un} ${affiche(e)}`),
            direNaissance(cible, statut),
            ...(doublons.length
              ? ['', `DOUBLONS — déjà dans le compte, écartés : les associer plutôt que les recréer (${doublons.length}) :`,
                ...doublons.map((e) => `- ${NOMS[e.type].un} ${affiche(e)} — ${suggestion(parCle.get(cle(e)) ?? '?')}`)]
              : []),
            ...(proches.length ? ['', 'PRESQUE DES DOUBLONS — à vérifier :', ...proches] : []),
            ...types.flatMap((t) => ['', ...decrireNiveaux(cible, liens, t, contenus, statut)]),
            ...(avertissements.length ? ['', 'AVERTISSEMENTS — à relire avant de valider :', ...avertissements] : []),
          ].join('\n'),
          bilan: statut === 'ENABLED'
            ? `${n} élément${s} créé${s} et associé${s} ACTIF${s.toUpperCase()} ${aLaCible(cible)}. La campagne est en pause : ` +
              "ils s'afficheront quand Florent l'activera."
            : `${n} élément${s} créé${s} et associé${s} EN PAUSE ${aLaCible(cible)}. ` +
              'Ils s’afficheront une fois l’association activée dans l’interface Google Ads.',
        };
      },
    }));
  },
});

// ── ads_elements_associer et ads_elements_dissocier ─────────────────────

/** Un élément du compte, d'un des types gérés ici. */
const exigerElement = async (env: Env, compte: string, asset: string): Promise<Element> => {
  const l = await premiereLigne<LigneAsset>(env, compte, `SELECT ${CHAMPS_ASSET} FROM asset WHERE asset.id = ${asset}`);
  if (!l?.asset) throw new Refus(`Élément ${asset} introuvable dans le compte.`, 404);
  const e = depuisAsset(l.asset);
  if (!e) {
    throw new Refus(`L'élément ${asset} est de type ${l.asset.type ?? 'inconnu'} : ce serveur ne gère que les liens annexes, ` +
      'les info-bulles, les extraits structurés et les éléments de prix.');
  }
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
  title: "Associer un élément d'annonce existant",
  description: [
    "Associe à une campagne OU à un groupe d'annonces Search un élément qui existe déjà dans le compte — lien annexe, info-bulle, " +
    "extrait structuré ou élément de prix —, désigné par son identifiant (asset.id), sans le recréer. Exemple : l'extrait " +
    '« Quartiers », 68824727611.',
    '',
    REGLE_NAISSANCE,
    '',
    DEUX_TEMPS,
    '',
    "L'élément passe le filtre déontologique des annonces, et ses URL doivent mener à luminose.fr. Retrouver les éléments : " +
    "ads_requete, SELECT asset.id, asset.type, asset.sitelink_asset.link_text, asset.callout_asset.callout_text, " +
    "asset.structured_snippet_asset.header, asset.price_asset.type FROM asset WHERE asset.type IN ('SITELINK', 'CALLOUT', " +
    "'STRUCTURED_SNIPPET', 'PRICE').",
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
    const dehors = urlsDe(e).filter((u) => !urlAdmise(u));
    if (dehors.length) throw new Refus(`${capitale(NOMS[e.type].le)} ${asset} mène à « ${dehors[0]} » : hors de luminose.fr, ${accord(e.type, 'il', 'elle')} ne s'associe pas d'ici.`);

    const [contenus, liens] = await Promise.all([elementsDuCompte(env, compte), liensAutour(env, compte, cible)]);
    const deja = liens.find((l) => l.asset === asset && l.type === e.type && estALaCible(l, cible));
    if (deja) throw new Refus(`L'élément ${asset} est déjà associé ${aLaCible(cible)} (${STATUTS[deja.statut] ?? deja.statut}) : rien à faire.`);

    const { service, champ, ressource } = lienDe(compte, cible);
    return texte(await ecrire(env, contexte, {
      outil: 'ads_elements_associer',
      compte,
      jeton,
      preparation: async (temps: Temps): Promise<Preparation> => {
        const statut = temps.execution ? naissanceFigee(cible, (temps.fige as { s?: Naissance } | undefined)?.s) : naissance(cible);
        return {
          service,
          operations: [{ create: { [champ]: ressource, asset: `customers/${compte}/assets/${asset}`, fieldType: e.type, status: statut } }],
          fige: { s: statut },
          description: [
            `Associer ${NOMS[e.type].le} ${affiche(e)} (élément ${asset}) ${aLaCible(cible)}.`,
            direNaissance(cible, statut),
            '',
            ...decrireNiveaux(cible, liens, e.type, contenus, statut),
            ...(avertissements.length ? ['', 'AVERTISSEMENTS — à relire avant de valider :', ...avertissements.map((a) => `- ${a}`)] : []),
          ].join('\n'),
          bilan: `${capitale(NOMS[e.type].un)} ${asset} ${accord(e.type, 'associé', 'associée')} ` +
            `${statut === 'ENABLED' ? `${accord(e.type, 'ACTIF', 'ACTIVE')} — la campagne est en pause —` : 'EN PAUSE'} ${aLaCible(cible)}.`,
        };
      },
    }));
  },
});

const elementsDissocier = outil({
  name: 'ads_elements_dissocier',
  title: "Dissocier un élément d'annonce",
  description: [
    "Retire l'association d'un élément d'annonce — lien annexe, info-bulle, extrait structuré, élément de prix — à une campagne " +
    "OU à un groupe d'annonces. L'élément lui-même reste dans le compte, avec ses autres associations.",
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
            ? decrireNiveaux(cible, liens, e.type, contenus, null, asset)
            : ["L'association était en pause : l'affichage ne change pas."]),
        ].join('\n'),
        bilan: `Association retirée : élément ${asset} et ${decrireCible(cible)}. L'élément reste dans le compte.`,
      },
    }));
  },
});

export const OUTILS_ELEMENTS = [elementsCreer, elementsAssocier, elementsDissocier] as const;
