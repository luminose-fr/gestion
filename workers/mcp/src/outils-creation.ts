/**
 * Créer, en pause et marqué — lot 2 du cadrage du 02/10/2026
 * (workers/mcp/decisions/2026-10-02-creer-des-campagnes.md) : le Search de
 * bout en bout. Campagne, groupe d'annonces, annonce responsive, mots-clés.
 *
 * Comme au lot 1, chaque outil ne fait que PRÉPARER : vérifier l'entrée et ce
 * qu'il vise, puis construire les opérations exactes. Scope, aperçu, jeton,
 * plafond de volume, journal et appel sont ecriture.ts ; la forme permise de
 * chaque opération — montants plafonnés compris — est la table fermée de
 * google-ads.ts, qui revérifie tout indépendamment d'ici.
 */
import { z } from 'zod';
import { compteEcriture, ecrire, exigerEcriture, trouverLibelle, type Preparation } from './ecriture';
import {
  ErreurAds, limitesArgent, muter, violationsDeRegle, type Operation, type Violation,
} from './google-ads';
import { outil, texte } from './outil';
import { CORRESPONDANCES, DEUX_TEMPS, JETON, exigerSearch, lignes, normaliserMotsCles, premiereLigne } from './outils-ecriture';
import { MARQUE, examinerAnnonce, examinerRendus, marquer, textesParDefaut, urlAdmise, type Rendu, type TextesAnnonce } from './regles';
import { LIMITES_ANNONCE, aInsertion, analyser, longueur, texteParDefaut } from './insertion';
import { Refus } from './refus';
import type { Env } from './env';

const ID = z.string().regex(/^\d{1,20}$/, 'identifiant numérique');

const ECRITURE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

const MARQUE_ET_PAUSE =
  `Tout ce qui est créé naît EN PAUSE et porte la marque ${MARQUE} (dans le nom, ou en libellé pour les annonces et mots-clés). ` +
  'Florent relit, retire la marque et active dans l’interface Google Ads : ce serveur n’active jamais rien.';

const euros = (micros: number) => (micros / 1_000_000).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

/** Au centime : Google refuse un montant en micros qui n'est pas un multiple de 10 000. */
const enMicros = (montant: number) => Math.round(montant * 100) * 10_000;

type LigneGroupe = {
  adGroup?: { name?: string; status?: string; type?: string };
  campaign?: { name?: string; advertisingChannelType?: string };
};

/** Un groupe d'annonces Search standard, vivant. */
const exigerGroupe = async (env: Env, compte: string, groupe: string) => {
  const l = await premiereLigne<LigneGroupe>(env, compte,
    `SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.type, campaign.name, campaign.advertising_channel_type FROM ad_group WHERE ad_group.id = ${groupe}`);
  if (!l?.adGroup || l.adGroup.status === 'REMOVED') throw new Refus(`Groupe d'annonces ${groupe} introuvable, ou supprimé.`);
  exigerSearch(l.campaign?.advertisingChannelType, `La campagne « ${l.campaign?.name} »`);
  if (l.adGroup.type !== 'SEARCH_STANDARD') throw new Refus(`Le groupe « ${l.adGroup.name} » n'est pas un groupe Search standard (${l.adGroup.type}).`);
  return { nom: l.adGroup.name ?? groupe, campagne: l.campaign?.name ?? '?' };
};

type LigneMotCle = { adGroupCriterion?: { keyword?: { text?: string; matchType?: string }; status?: string } };

/** Les mots-clés positifs du groupe, actifs ou en pause : chacun peut écrire un titre par l'insertion. */
const motsClesDuGroupe = async (env: Env, compte: string, groupe: string) =>
  (await lignes<LigneMotCle>(env, compte,
    'SELECT ad_group.id, ad_group_criterion.type, ad_group_criterion.negative, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ' +
    'ad_group_criterion.status FROM ad_group_criterion ' +
    `WHERE ad_group.id = ${groupe} AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.negative = FALSE ` +
    "AND ad_group_criterion.status IN ('ENABLED', 'PAUSED')"))
    .flatMap(({ adGroupCriterion: c }) => (c?.keyword?.text ? [{ texte: c.keyword.text, correspondance: c.keyword.matchType ?? '?' }] : []));

type LigneAnnonce = { adGroupAd?: { ad?: { id?: string; responsiveSearchAd?: { headlines?: { text?: string }[]; descriptions?: { text?: string }[]; path1?: string; path2?: string } } } };

/** Les annonces responsives du groupe qui utilisent l'insertion de mot-clé : un mot-clé ajouté y écrira un titre. */
const annoncesAInsertion = async (env: Env, compte: string, groupe: string): Promise<{ id: string; textes: TextesAnnonce }[]> =>
  (await lignes<LigneAnnonce>(env, compte,
    'SELECT ad_group.id, ad_group_ad.status, ad_group_ad.ad.type, ad_group_ad.ad.id, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ' +
    'ad_group_ad.ad.responsive_search_ad.path1, ad_group_ad.ad.responsive_search_ad.path2 FROM ad_group_ad ' +
    `WHERE ad_group.id = ${groupe} AND ad_group_ad.status != 'REMOVED' AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'`))
    .flatMap(({ adGroupAd }) => {
      const rsa = adGroupAd?.ad?.responsiveSearchAd;
      if (!rsa) return [];
      const textes: TextesAnnonce = {
        titres: (rsa.headlines ?? []).map((t) => t.text ?? ''),
        descriptions: (rsa.descriptions ?? []).map((t) => t.text ?? ''),
        chemins: [rsa.path1, rsa.path2].filter((x): x is string => Boolean(x)),
      };
      const utilise = [...textes.titres, ...textes.descriptions].some((t) => aInsertion(analyser(t)));
      return utilise ? [{ id: String(adGroupAd?.ad?.id ?? '?'), textes }] : [];
    });

const MAX_RENDUS_APERCU = 30;

/** Les lignes d'aperçu et de refus d'un examen par mot-clé. `ou` situe l'annonce quand il y en a plusieurs. */
const decrireRendus = (rendus: Rendu[], ou = '') => ({
  lignes: rendus.slice(0, MAX_RENDUS_APERCU).map((r) => `- « ${r.motCle} »${ou} : ` +
    r.textes.map((t) => (t.replie ? `trop long, texte par défaut « ${t.texte} »` : `« ${t.texte} »`)).join(' · '))
    .concat(rendus.length > MAX_RENDUS_APERCU ? [`- … et ${rendus.length - MAX_RENDUS_APERCU} autre(s) mot(s)-clé(s).`] : []),
  refus: rendus.flatMap((r) => r.refus.map((x) => `- mot-clé « ${r.motCle} »${ou} : ${x}`)),
  avertissements: rendus.flatMap((r) => r.avertissements.map((x) => `- mot-clé « ${r.motCle} »${ou} : ${x} — titre rendu ${r.textes.map((t) => `« ${t.texte} »`).join(', ')}`)),
});

// ── ads_campagne_creer ───────────────────────────────────────────────────

type LigneBudget = { campaign?: { name?: string; status?: string }; campaignBudget?: { resourceName?: string; amountMicros?: string } };

/**
 * R3 — l'engagement : ce que coûterait par jour tout ce qui est actif ou en
 * attente de validation. Un budget compte une fois, même partagé.
 */
const engagement = async (env: Env, compte: string): Promise<number> => {
  const budgets = new Map<string, number>();
  for (const l of await lignes<LigneBudget>(env, compte,
    "SELECT campaign.name, campaign.status, campaign_budget.resource_name, campaign_budget.amount_micros FROM campaign WHERE campaign.status IN ('ENABLED', 'PAUSED')")) {
    const enJeu = l.campaign?.status === 'ENABLED' || l.campaign?.name?.startsWith(`${MARQUE} `);
    if (enJeu && l.campaignBudget?.resourceName) budgets.set(l.campaignBudget.resourceName, Number(l.campaignBudget.amountMicros ?? 0));
  }
  return [...budgets.values()].reduce((a, b) => a + b, 0);
};

type LigneModele = {
  campaign?: {
    name?: string; status?: string; advertisingChannelType?: string;
    geoTargetTypeSetting?: { positiveGeoTargetType?: string; negativeGeoTargetType?: string };
  };
};
type LigneCritere = {
  campaignCriterion?: {
    type?: string; negative?: boolean;
    language?: { languageConstant?: string };
    location?: { geoTargetConstant?: string };
    proximity?: {
      radius?: number; radiusUnits?: string;
      geoPoint?: { latitudeInMicroDegrees?: number; longitudeInMicroDegrees?: number };
      address?: Record<string, string>;
    };
  };
};

/**
 * R4 — le ciblage se recopie, il ne se choisit pas : langue, zone et type de
 * ciblage géographique de ADS_CAMPAGNE_MODELE, tels quels. Claude ne passe
 * aucun de ces réglages, et aucun n'est accepté en entrée.
 */
const ciblageModele = async (env: Env, compte: string, campagne: string) => {
  const id = env.ADS_CAMPAGNE_MODELE ?? '';
  if (!/^\d{1,20}$/.test(id)) throw new Refus('ADS_CAMPAGNE_MODELE absent ou illisible dans wrangler.toml : la création est fermée.', 503);
  const m = (await premiereLigne<LigneModele>(env, compte,
    'SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.geo_target_type_setting.positive_geo_target_type, ' +
    `campaign.geo_target_type_setting.negative_geo_target_type FROM campaign WHERE campaign.id = ${id}`))?.campaign;
  if (!m || m.status === 'REMOVED') throw new Refus(`La campagne modèle ${id} (ADS_CAMPAGNE_MODELE) est introuvable ou supprimée.`, 503);
  exigerSearch(m.advertisingChannelType, `La campagne modèle « ${m.name} »`);

  const criteres: Record<string, unknown>[] = [];
  const resume = { langues: 0, rayons: [] as string[], lieux: 0, exclusions: 0 };
  for (const { campaignCriterion: c } of await lignes<LigneCritere>(env, compte,
    'SELECT campaign.id, campaign_criterion.status, campaign_criterion.type, campaign_criterion.negative, campaign_criterion.language.language_constant, ' +
    'campaign_criterion.location.geo_target_constant, campaign_criterion.proximity.radius, campaign_criterion.proximity.radius_units, ' +
    'campaign_criterion.proximity.geo_point.latitude_in_micro_degrees, campaign_criterion.proximity.geo_point.longitude_in_micro_degrees, ' +
    'campaign_criterion.proximity.address.street_address, campaign_criterion.proximity.address.city_name, ' +
    'campaign_criterion.proximity.address.postal_code, campaign_criterion.proximity.address.province_code, ' +
    `campaign_criterion.proximity.address.country_code FROM campaign_criterion WHERE campaign.id = ${id} ` +
    "AND campaign_criterion.type IN ('LANGUAGE', 'LOCATION', 'PROXIMITY') AND campaign_criterion.status != 'REMOVED'")) {
    if (!c) continue;
    const critere = (genre: string, valeur: unknown) =>
      criteres.push({ campaign: campagne, [genre]: valeur, ...(c.negative ? { negative: true } : {}) });
    if (c.type === 'LANGUAGE' && c.language?.languageConstant) {
      critere('language', { languageConstant: c.language.languageConstant });
      resume.langues++;
    } else if (c.type === 'LOCATION' && c.location?.geoTargetConstant) {
      critere('location', { geoTargetConstant: c.location.geoTargetConstant });
      if (c.negative) resume.exclusions++; else resume.lieux++;
    } else if (c.type === 'PROXIMITY' && c.proximity?.radius) {
      const p = c.proximity;
      critere('proximity', {
        radius: p.radius,
        radiusUnits: p.radiusUnits,
        ...(p.geoPoint ? { geoPoint: p.geoPoint } : {}),
        ...(p.address && Object.keys(p.address).length > 0 ? { address: p.address } : {}),
      });
      resume.rayons.push(`${p.radius} ${p.radiusUnits === 'MILES' ? 'mi' : 'km'}${p.address?.cityName ? ` autour de ${p.address.cityName}` : ''}`);
    }
  }
  if (resume.langues === 0 || resume.lieux + resume.rayons.length === 0) {
    throw new Refus(`La campagne modèle « ${m.name} » n'a pas de langue ou pas de zone : refusé, une campagne sans zone diffuserait partout.`, 503);
  }

  const geo = m.geoTargetTypeSetting ?? {};
  return {
    nom: m.name ?? id,
    id,
    criteres,
    geoTargetTypeSetting: {
      ...(geo.positiveGeoTargetType ? { positiveGeoTargetType: geo.positiveGeoTargetType } : {}),
      ...(geo.negativeGeoTargetType ? { negativeGeoTargetType: geo.negativeGeoTargetType } : {}),
    },
    resume: [
      `${resume.langues} langue${resume.langues > 1 ? 's' : ''}`,
      ...resume.rayons.map((r) => `rayon de ${r}`),
      ...(resume.lieux ? [`${resume.lieux} lieu${resume.lieux > 1 ? 'x' : ''}`] : []),
      ...(resume.exclusions ? [`${resume.exclusions} exclusion${resume.exclusions > 1 ? 's' : ''}`] : []),
      `ciblage ${geo.positiveGeoTargetType === 'PRESENCE' ? 'par présence réelle' : (geo.positiveGeoTargetType ?? 'par défaut')}`,
    ].join(', '),
  };
};

const campagneCreer = outil({
  name: 'ads_campagne_creer',
  title: 'Créer une campagne Search (en pause)',
  description: [
    "Crée une campagne Search EN PAUSE, avec son budget. Le ciblage (langue, zone) est recopié de la campagne modèle du compte : " +
    'il ne se choisit pas. Réseau de recherche Google seul. Ensuite : ads_groupe_creer, ads_annonce_creer, ads_mots_cles_ajouter.',
    '',
    MARQUE_ET_PAUSE,
    '',
    DEUX_TEMPS,
    '',
    "Enchères : CLICS (« Maximiser les clics », cpc_max obligatoire) ou CONVERSIONS (« Maximiser les conversions », " +
    "ai_max au choix : AI Max élargit aux recherches proches ; la personnalisation du texte et l'extension d'URL restent coupées). " +
    'Le budget et le CPC max sont plafonnés par le serveur ; l’aperçu dit les plafonds et l’engagement après création.',
  ].join('\n'),
  schema: z.object({
    nom: z.string().min(1).max(100).describe(`Le nom de la campagne ; le serveur y ajoute ${MARQUE}.`),
    budget_jour: z.number().positive().describe('Budget quotidien, en euros.'),
    encheres: z.discriminatedUnion('strategie', [
      z.object({ strategie: z.literal('CLICS'), cpc_max: z.number().positive().describe('CPC maximal, en euros.') }).strict(),
      z.object({ strategie: z.literal('CONVERSIONS'), ai_max: z.boolean() }).strict(),
    ]),
    jeton: JETON,
  }).strict(),
  annotations: ECRITURE,
  async executer({ nom, budget_jour, encheres, jeton }, env, contexte) {
    exigerEcriture(contexte);
    const compte = compteEcriture(env);
    const limites = limitesArgent(env);

    const budget = enMicros(budget_jour);
    if (budget <= 0) throw new Refus('Budget nul.');
    if (budget > limites.budgetMaxJour) {
      throw new Refus(`Budget de ${euros(budget)} par jour au-delà du plafond de ${euros(limites.budgetMaxJour)} (ADS_BUDGET_MAX_JOUR).`);
    }
    const cpc = encheres.strategie === 'CLICS' ? enMicros(encheres.cpc_max) : 0;
    if (encheres.strategie === 'CLICS' && (cpc <= 0 || cpc > limites.cpcMax)) {
      throw new Refus(`CPC max de ${euros(cpc)} hors des bornes : au plus ${euros(limites.cpcMax)} (ADS_CPC_MAX).`);
    }
    const deja = await engagement(env, compte);
    if (deja + budget > limites.budgetMaxTotal) {
      throw new Refus(
        `Engagement dépassé : ${euros(deja)} par jour déjà actifs ou en attente de validation, plus ${euros(budget)}, ` +
        `au-delà de ${euros(limites.budgetMaxTotal)} (ADS_BUDGET_MAX_TOTAL). Réduire le budget, ou valider ou supprimer une campagne ${MARQUE}.`,
      );
    }

    const nomMarque = marquer(nom);
    const tmpBudget = `customers/${compte}/campaignBudgets/-1`;
    const tmpCampagne = `customers/${compte}/campaigns/-2`;
    const modele = await ciblageModele(env, compte, tmpCampagne);

    const operations: Operation[] = [
      { campaignBudgetOperation: { create: {
        resourceName: tmpBudget, name: nomMarque, amountMicros: String(budget), deliveryMethod: 'STANDARD', explicitlyShared: false,
      } } },
      { campaignOperation: { create: {
        resourceName: tmpCampagne,
        name: nomMarque,
        status: 'PAUSED',
        advertisingChannelType: 'SEARCH',
        campaignBudget: tmpBudget,
        networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false, targetPartnerSearchNetwork: false },
        geoTargetTypeSetting: modele.geoTargetTypeSetting,
        containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
        ...(encheres.strategie === 'CLICS'
          ? { targetSpend: { cpcBidCeilingMicros: String(cpc) } }
          : { maximizeConversions: {}, aiMaxSetting: { enableAiMax: encheres.ai_max } }),
        // R5 : jamais de texte rédigé par Google, jamais d'URL choisie par Google.
        assetAutomationSettings: [
          { assetAutomationType: 'TEXT_ASSET_AUTOMATION', assetAutomationStatus: 'OPTED_OUT' },
          { assetAutomationType: 'FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION', assetAutomationStatus: 'OPTED_OUT' },
        ],
      } } },
      ...modele.criteres.map((c) => ({ campaignCriterionOperation: { create: c } })),
    ];

    return texte(await ecrire(env, contexte, {
      outil: 'ads_campagne_creer',
      compte,
      jeton,
      preparation: {
        service: 'googleAds',
        operations,
        description: [
          `Campagne Search « ${nomMarque} », EN PAUSE.`,
          `- Budget : ${euros(budget)} par jour (plafond ${euros(limites.budgetMaxJour)}).`,
          encheres.strategie === 'CLICS'
            ? `- Enchères : Maximiser les clics, CPC max ${euros(cpc)} (plafond ${euros(limites.cpcMax)}).`
            : `- Enchères : Maximiser les conversions ; AI Max ${encheres.ai_max ? 'activé (recherches proches)' : 'coupé'}.`,
          '- Personnalisation du texte et extension d’URL : coupées.',
          '- Réseau : recherche Google seule (ni partenaires, ni Display).',
          `- Ciblage recopié de « ${modele.nom} » (${modele.id}) : ${modele.resume}.`,
          `- Engagement après création : ${euros(deja + budget)} par jour sur ${euros(limites.budgetMaxTotal)}.`,
        ].join('\n'),
        bilan: `Campagne « ${nomMarque} » créée, en pause. Suite : ads_groupe_creer.`,
      },
    }));
  },
});

// ── ads_groupe_creer ─────────────────────────────────────────────────────

const groupeCreer = outil({
  name: 'ads_groupe_creer',
  title: "Créer un groupe d'annonces (en pause)",
  description: [
    "Crée un groupe d'annonces Search EN PAUSE dans une campagne Search, nouvelle ou existante.",
    '',
    MARQUE_ET_PAUSE,
    '',
    DEUX_TEMPS,
  ].join('\n'),
  schema: z.object({
    campagne: ID.describe('Identifiant de la campagne (campaign.id).'),
    nom: z.string().min(1).max(100).describe(`Le nom du groupe ; le serveur y ajoute ${MARQUE}.`),
    jeton: JETON,
  }).strict(),
  annotations: ECRITURE,
  async executer({ campagne, nom, jeton }, env, contexte) {
    exigerEcriture(contexte);
    const compte = compteEcriture(env);
    const c = (await premiereLigne<{ campaign?: { name?: string; status?: string; advertisingChannelType?: string } }>(env, compte,
      `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type FROM campaign WHERE campaign.id = ${campagne}`))?.campaign;
    if (!c || c.status === 'REMOVED') throw new Refus(`Campagne ${campagne} introuvable, ou supprimée.`);
    exigerSearch(c.advertisingChannelType, `La campagne « ${c.name} »`);

    const nomMarque = marquer(nom);
    return texte(await ecrire(env, contexte, {
      outil: 'ads_groupe_creer',
      compte,
      jeton,
      preparation: {
        service: 'adGroups',
        operations: [{ create: { campaign: `customers/${compte}/campaigns/${campagne}`, name: nomMarque, status: 'PAUSED', type: 'SEARCH_STANDARD' } }],
        description: `Groupe d'annonces « ${nomMarque} », EN PAUSE, dans la campagne « ${c.name} » (${campagne}).`,
        bilan: `Groupe « ${nomMarque} » créé, en pause. Suite : ads_annonce_creer, ads_mots_cles_ajouter.`,
      },
    }));
  },
});

// ── ads_annonce_creer ────────────────────────────────────────────────────

const annonceCreer = outil({
  name: 'ads_annonce_creer',
  title: 'Créer une annonce responsive (en pause)',
  description: [
    'Crée une annonce responsive du Search EN PAUSE dans un groupe d’annonces : 3 à 15 titres de 30 caractères au plus, ' +
    "2 à 4 descriptions de 90 au plus, jusqu'à 2 chemins d'affichage de 15 au plus, une URL finale sur https://luminose.fr/ " +
    'ou https://www.luminose.fr/ (aucun sous-domaine).',
    '',
    "Insertion de mot-clé, dans les titres et les descriptions : {keyword:texte par défaut}, {Keyword:…}, {KeyWord:…}, " +
    "{KEYWord:…} ou {KeyWORD:…} — la casse dit comment le mot-clé s'écrit. La longueur se compte sur le texte par défaut. " +
    "Le mot-clé écrit alors le titre : l'aperçu montre, pour chaque mot-clé du groupe, ce qui s'afficherait (le texte par défaut " +
    "quand le rendu dépasse la limite), et un mot-clé qui produirait un texte interdit fait refuser l'annonce. Pas d'insertion " +
    'dans les chemins.',
    '',
    MARQUE_ET_PAUSE,
    '',
    DEUX_TEMPS,
    '',
    'Les textes passent un filtre déontologique : aucune promesse de guérison, explicite ou suggérée. Un terme interdit fait ' +
    "refuser l'annonce, en le nommant ; certains termes ne font qu'avertir dans l'aperçu. Le filtre est un plancher : la " +
    'relecture de Florent avant activation reste le vrai contrôle.',
  ].join('\n'),
  schema: z.object({
    groupe: ID.describe("Identifiant du groupe d'annonces (ad_group.id)."),
    titres: z.array(z.string().min(1).max(120)).min(3).max(15)
      .describe("30 caractères affichés au plus ; avec l'insertion, comptés sur le texte par défaut."),
    descriptions: z.array(z.string().min(1).max(300)).min(2).max(4)
      .describe("90 caractères affichés au plus ; avec l'insertion, comptés sur le texte par défaut."),
    chemin1: z.string().min(1).max(15).optional(),
    chemin2: z.string().min(1).max(15).optional(),
    url_finale: z.string().max(2048),
    jeton: JETON,
  }).strict(),
  annotations: ECRITURE,
  async executer({ groupe, titres, descriptions, chemin1, chemin2, url_finale, jeton }, env, contexte) {
    exigerEcriture(contexte);
    const compte = compteEcriture(env);

    const nets = (liste: string[]) => liste.map((t) => t.trim().replace(/\s+/g, ' '));
    const t = nets(titres);
    const d = nets(descriptions);
    for (const [liste, quoi] of [[t, 'titre'], [d, 'description']] as const) {
      const vus = new Set<string>();
      for (const x of liste) {
        if (vus.has(x.toLowerCase())) throw new Refus(`${quoi} en double : « ${x} ».`);
        vus.add(x.toLowerCase());
      }
    }
    if (chemin2 && !chemin1) throw new Refus('chemin2 sans chemin1 : Google exige le premier.');
    if (!urlAdmise(url_finale)) {
      throw new Refus(`URL finale refusée : « ${url_finale} ». Seules https://luminose.fr/… et https://www.luminose.fr/… sont admises, sans sous-domaine.`);
    }
    const chemins = [chemin1, chemin2].filter((x): x is string => Boolean(x));
    if (chemins.some((c) => /[{}]/.test(c))) throw new Refus("Pas d'insertion de mot-clé dans un chemin d'affichage : Google ne l'y admet pas.");

    // L'insertion bien formée, et la longueur comme Google la compte : sur le texte par défaut.
    const fautes: string[] = [];
    for (const [liste, limite, quoi] of [[t, LIMITES_ANNONCE.titre, 'titre'], [d, LIMITES_ANNONCE.description, 'description']] as const) {
      for (const x of liste) {
        const a = analyser(x);
        fautes.push(...a.erreurs.map((e) => `- ${quoi} ${e}`));
        const n = longueur(texteParDefaut(a));
        if (a.erreurs.length === 0 && n > limite) {
          fautes.push(`- ${quoi} « ${x} » : ${n} caractères affichés${aInsertion(a) ? ' (texte par défaut)' : ''} — ${limite} au plus.`);
        }
      }
    }
    if (fautes.length) throw new Refus(['Annonce refusée, rien n’est parti :', ...fautes].join('\n'));

    const textes: TextesAnnonce = { titres: t, descriptions: d, chemins };
    const examen = examinerAnnonce(textesParDefaut(textes));
    if (examen.refus.length > 0) {
      throw new Refus(
        `Annonce refusée par le filtre déontologique (aucune promesse de guérison, socle/cadre-deontologique.md) :\n` +
        examen.refus.map((r) => `- ${r}`).join('\n'),
      );
    }

    const g = await exigerGroupe(env, compte, groupe);
    const libelle = await trouverLibelle(env, compte);

    // Avec l'insertion, chaque mot-clé du groupe écrit un titre : chacun passe au filtre.
    const insertion = [...t, ...d].some((x) => aInsertion(analyser(x)));
    const motsCles = insertion ? await motsClesDuGroupe(env, compte, groupe) : [];
    const rendus = decrireRendus(examinerRendus(textes, motsCles.map((m) => m.texte)));
    if (rendus.refus.length > 0) {
      throw new Refus([
        "Annonce refusée : avec l'insertion de mot-clé, ces mots-clés du groupe écriraient un texte interdit (aucune promesse de guérison, socle/cadre-deontologique.md) :",
        ...rendus.refus,
        '',
        "Retirer l'insertion des textes concernés, ou ces mots-clés du groupe. Rien n'est parti.",
      ].join('\n'));
    }
    const sectionInsertion = !insertion ? [] : motsCles.length === 0
      ? ['', "INSERTION DE MOT-CLÉ — le groupe n'a encore aucun mot-clé : le texte par défaut s'affichera. ads_mots_cles_ajouter contrôlera chaque mot-clé ajouté."]
      : ['', `INSERTION DE MOT-CLÉ — ce que chaque mot-clé du groupe afficherait (${motsCles.length}) :`, ...rendus.lignes];
    return texte(await ecrire(env, contexte, {
      outil: 'ads_annonce_creer',
      compte,
      jeton,
      preparation: {
        service: 'adGroupAds',
        operations: [{ create: {
          adGroup: `customers/${compte}/adGroups/${groupe}`,
          status: 'PAUSED',
          ad: {
            finalUrls: [url_finale],
            responsiveSearchAd: {
              headlines: t.map((text) => ({ text })),
              descriptions: d.map((text) => ({ text })),
              ...(chemin1 ? { path1: chemin1.trim() } : {}),
              ...(chemin2 ? { path2: chemin2.trim() } : {}),
            },
          },
        } }],
        description: [
          `Annonce responsive EN PAUSE dans le groupe « ${g.nom} » (campagne « ${g.campagne} »), libellé ${MARQUE}.`,
          `- URL finale : ${url_finale}${chemins.length ? ` — affichée …/${chemins.join('/')}` : ''}`,
          `- Titres (${t.length}) :`, ...t.map((x) => `  · ${x}`),
          `- Descriptions (${d.length}) :`, ...d.map((x) => `  · ${x}`),
          ...sectionInsertion,
          ...(examen.avertissements.length || rendus.avertissements.length
            ? ['', 'AVERTISSEMENTS — à relire avant de valider :', ...examen.avertissements.map((a) => `- ${a}`), ...rendus.avertissements]
            : []),
        ].join('\n'),
        bilan: `Annonce créée, en pause, dans le groupe « ${g.nom} ».`,
        libeller: { service: 'adGroupAdLabels', champ: 'adGroupAd', ...(libelle ? { libelle } : {}) },
      },
    }));
  },
});

// ── ads_mots_cles_ajouter ────────────────────────────────────────────────

/**
 * Les règles de Google que ces opérations enfreindraient : une vérification à
 * blanc (`validateOnly`), dont on lit les `policyViolationDetails`. Toute autre
 * erreur remonte telle quelle.
 */
const reglesEnfreintes = async (env: Env, compte: string, operations: Operation[]): Promise<Violation[]> => {
  try {
    await muter(env, compte, 'adGroupCriteria', operations, true);
    return [];
  } catch (erreur) {
    if (erreur instanceof ErreurAds) {
      const violations = violationsDeRegle(erreur);
      if (violations) return violations;
    }
    throw erreur;
  }
};

/**
 * Les exceptions demandées, sous la forme qui voyage dans le jeton : pour
 * chaque règle, les rangs des mots-clés qu'elle arrête — avec le texte fautif
 * quand Google en désigne un autre que le mot-clé lui-même. Court, parce que
 * le modèle recopie le jeton.
 */
type Exceptions = Record<string, (number | [number, string])[]>;

const figerExceptions = (arretes: [number, Violation[]][], liste: { texte: string }[]): Exceptions => {
  const exceptions: Exceptions = {};
  const vues = new Set<string>();
  for (const [i, vs] of arretes) {
    for (const { cle } of vs) {
      if (vues.has(`${i}\u0000${cle.policyName}\u0000${cle.violatingText}`)) continue;
      vues.add(`${i}\u0000${cle.policyName}\u0000${cle.violatingText}`);
      (exceptions[cle.policyName] ??= []).push(cle.violatingText === liste[i].texte ? i : [i, cle.violatingText]);
    }
  }
  return exceptions;
};

const rangsAvecException = (exceptions: Exceptions) =>
  new Set(Object.values(exceptions).flat().map((e) => (typeof e === 'number' ? e : e[0])));

/** Les clés d'exception jointes à leurs mots-clés — à l'aperçu comme à l'exécution, par ce seul chemin. */
const appliquerExceptions = (operations: Operation[], liste: { texte: string }[], exceptions: Exceptions): Operation[] => {
  const parRang = new Map<number, { policyName: string; violatingText: string }[]>();
  for (const [policyName, entrees] of Object.entries(exceptions)) {
    for (const e of entrees) {
      const [i, violatingText]: [number, string] = typeof e === 'number' ? [e, liste[e]?.texte ?? ''] : e;
      parRang.set(i, [...(parRang.get(i) ?? []), { policyName, violatingText }]);
    }
  }
  return operations.map((operation, i) => {
    const cles = parRang.get(i);
    if (!cles) return operation;
    cles.sort((a, b) => a.policyName.localeCompare(b.policyName) || a.violatingText.localeCompare(b.violatingText));
    return { ...operation, exemptPolicyViolationKeys: cles };
  });
};

const motsClesAjouter = outil({
  name: 'ads_mots_cles_ajouter',
  title: "Ajouter des mots-clés (en pause)",
  description: [
    "Ajoute des mots-clés EN PAUSE à un groupe d'annonces Search. 50 au plus par appel. " +
    'Correspondance : EXACT, PHRASE, BROAD. Pour EXCLURE des recherches, c’est ads_negatifs_ajouter.',
    '',
    MARQUE_ET_PAUSE,
    '',
    DEUX_TEMPS,
    '',
    "Insertion de mot-clé : si une annonce du groupe l'utilise, l'aperçu montre le titre que chaque mot-clé y écrirait, et " +
    'un mot-clé qui produirait un texte interdit est refusé.',
    '',
    "Règlement de Google : certains mots-clés (santé, tabac…) sont arrêtés par une règle qui admet une exception. L'outil " +
    "les nomme, avec la règle en cause, et ne demande rien. Pour demander l'exception, rappeler avec demander_exceptions: true : " +
    "l'aperçu liste chaque exception, et elle ne part qu'avec le jeton, après l'accord de Florent. Une règle sans exception " +
    'possible impose de retirer ou de reformuler le mot-clé.',
  ].join('\n'),
  schema: z.object({
    groupe: ID.describe("Identifiant du groupe d'annonces (ad_group.id)."),
    mots_cles: z.array(z.object({
      texte: z.string().min(1).max(80).describe('Le texte, sans crochets ni guillemets.'),
      correspondance: z.enum(['EXACT', 'PHRASE', 'BROAD']),
    }).strict()).min(1).max(50),
    demander_exceptions: z.boolean().optional()
      .describe("true : demander à Google une exception pour les mots-clés que son règlement arrête, quand elle est possible. Seulement après avoir lu la liste rendue sans."),
    jeton: JETON,
  }).strict(),
  annotations: ECRITURE,
  async executer({ groupe, mots_cles, demander_exceptions, jeton }, env, contexte) {
    exigerEcriture(contexte);
    const compte = compteEcriture(env);

    const liste = normaliserMotsCles(mots_cles);

    const g = await exigerGroupe(env, compte, groupe);
    const libelle = await trouverLibelle(env, compte);

    // Une annonce du groupe qui utilise l'insertion : chaque mot-clé ajouté y écrira un titre, qui passe au filtre.
    const annonces = await annoncesAInsertion(env, compte, groupe);
    const parAnnonce = annonces.map((a) => decrireRendus(examinerRendus(a.textes, liste.map((m) => m.texte)), annonces.length > 1 ? ` (annonce ${a.id})` : ''));
    const refusInsertion = parAnnonce.flatMap((r) => r.refus);
    if (refusInsertion.length > 0) {
      throw new Refus([
        "Mots-clés refusés : avec l'insertion de mot-clé d'une annonce du groupe, ils écriraient un texte interdit (aucune promesse de guérison, socle/cadre-deontologique.md) :",
        ...refusInsertion,
        '',
        "Retirer ces mots-clés, ou l'insertion de l'annonce. Rien n'est parti.",
      ].join('\n'));
    }
    const sectionInsertion = annonces.length === 0 ? [] : [
      '', `INSERTION DE MOT-CLÉ — ${annonces.length > 1 ? `${annonces.length} annonces du groupe l'utilisent` : "une annonce du groupe l'utilise"} ; ce que chaque mot-clé afficherait :`,
      ...parAnnonce.flatMap((r) => r.lignes),
      ...(parAnnonce.some((r) => r.avertissements.length)
        ? ['', 'AVERTISSEMENTS — à relire avant de valider :', ...parAnnonce.flatMap((r) => r.avertissements)]
        : []),
    ];

    const base: Operation[] = liste.map((m) => ({ create: {
      adGroup: `customers/${compte}/adGroups/${groupe}`,
      status: 'PAUSED',
      keyword: { text: m.texte, matchType: m.correspondance },
    } }));

    const n = liste.length;
    const pluriel = n > 1 ? 's' : '';
    const preparation = (exceptions: Exceptions, description: string): Preparation => {
      const avecException = rangsAvecException(exceptions).size;
      return {
        service: 'adGroupCriteria',
        operations: appliquerExceptions(base, liste, exceptions),
        description,
        bilan: `${n} mot${pluriel}-clé${pluriel} ajouté${pluriel}, en pause, au groupe « ${g.nom} »` +
          (avecException ? `, dont ${avecException} avec exception de règlement.` : '.'),
        libeller: { service: 'adGroupCriterionLabels', champ: 'adGroupCriterion', ...(libelle ? { libelle } : {}) },
      };
    };

    return texte(await ecrire(env, contexte, {
      outil: 'ads_mots_cles_ajouter',
      compte,
      jeton,
      preparation: async (temps) => {
        // À l'exécution, on ne relit pas le règlement : une exécution
        // concurrente qui vient de demander une exception pour le même texte
        // l'a changé (ecriture.ts). Les exceptions sont celles que Google a
        // rendues à l'aperçu, que Florent a vues, et que le jeton porte.
        if (temps.execution) return preparation(demander_exceptions ? (temps.fige as Exceptions | undefined) ?? {} : {}, '');

        // Le règlement de Google, mot-clé par mot-clé. Les clés d'exception
        // viennent de Google lui-même, jamais du modèle : on ne peut demander
        // d'exception que pour ce que Google vient de nommer, et le jeton
        // couvre ces clés.
        const parMotCle = new Map<number, Violation[]>();
        for (const v of await reglesEnfreintes(env, compte, base)) {
          const i = v.index ?? liste.findIndex((m) => m.texte === v.cle.violatingText.toLocaleLowerCase('fr'));
          if (i < 0 || i >= liste.length) {
            throw new Refus(`Google signale la règle « ${v.regle} » sur « ${v.cle.violatingText} » sans dire quel mot-clé elle vise : rien n'est parti.`);
          }
          parMotCle.set(i, [...(parMotCle.get(i) ?? []), v]);
        }
        const ligne = ([i, vs]: [number, Violation[]]) =>
          `- « ${liste[i].texte} » [${CORRESPONDANCES[liste[i].correspondance]}] — ${[...new Set(vs.map((v) => `${v.regle} (${v.cle.policyName})`))].join(', ')}`;
        const arretes = [...parMotCle].sort(([a], [b]) => a - b);

        const sansException = arretes.filter(([, vs]) => vs.some((v) => !v.exemptable));
        if (sansException.length > 0) {
          throw new Refus(
            `Google refuse ${sansException.length} mot(s)-clé(s) pour une règle SANS exception possible — à retirer ou reformuler, rien n'est parti :\n` +
            sansException.map(ligne).join('\n'),
          );
        }
        if (arretes.length > 0 && !demander_exceptions) {
          throw new Refus([
            `Google arrête ${arretes.length} mot(s)-clé(s) pour une règle qui admet une exception — rien n'est parti :`,
            ...arretes.map(ligne),
            '',
            "Pour demander l'exception : rappeler avec les mêmes mots-clés et demander_exceptions: true. L'aperçu listera chaque " +
            "exception ; elle ne part qu'avec le jeton, après l'accord de Florent. Sinon : retirer ces mots-clés.",
          ].join('\n'));
        }

        const exceptions = figerExceptions(arretes, liste);
        return {
          ...preparation(exceptions, [
            `Groupe « ${g.nom} » (campagne « ${g.campagne} ») — ${n} mot${pluriel}-clé${pluriel} EN PAUSE, libellé ${MARQUE} :`,
            ...liste.map((m) => `- ${m.texte} [${CORRESPONDANCES[m.correspondance]}]`),
            ...(arretes.length
              ? ['', `EXCEPTIONS DE RÈGLEMENT DEMANDÉES À GOOGLE (${arretes.length}) — à valider, comme le bouton « Demander une exception » de l'interface :`,
                ...arretes.map(ligne)]
              : []),
            ...sectionInsertion,
          ].join('\n')),
          ...(arretes.length ? { fige: exceptions } : {}),
        };
      },
    }));
  },
});

export const OUTILS_CREATION = [campagneCreer, groupeCreer, annonceCreer, motsClesAjouter] as const;
