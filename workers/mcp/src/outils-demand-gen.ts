/**
 * Demand Gen, en pause et marqué — lot 4, cadrage du 07/10/2026
 * (workers/mcp/decisions/2026-10-07-demand-gen.md). Campagne à budget total,
 * groupe d'annonces, annonce multi-élément.
 *
 * Comme au lot 2, chaque outil ne fait que PRÉPARER : vérifier l'entrée et ce
 * qu'il vise, puis construire les opérations exactes. Scope, aperçu, jeton,
 * plafond de volume, journal et appel sont ecriture.ts ; la table fermée de
 * google-ads.ts revérifie chaque opération indépendamment d'ici — plafonds,
 * dates, enchères, objectif, automatismes, canaux, lieux, nom d'entreprise,
 * textes, URL, marque et pause. Les outils du lot 2 restent au Search ; ceux-ci
 * refusent tout ce qui n'est pas Demand Gen.
 */
import { z } from 'zod';
import { enMicros, engagement, euros } from './argent';
import { aujourdhui, dateFr, dateValide, equivalentQuotidien, joursEntre } from './dates';
import { compteEcriture, ecrire, exigerEcriture, trouverLibelle } from './ecriture';
import {
  BOUTONS, AUTOMATISMES_DG_ANNONCE, AUTOMATISMES_DG_CAMPAGNE, CANAUX_DG, IMAGES_DG, LANGUE_DG, LIMITES_DG,
  NOM_ENTREPRISE, limitesDG, objectifsDG, zonesDG,
  type Bouton, type FormatImage, type Operation,
} from './google-ads';
import { longueur } from './insertion';
import { outil, texte } from './outil';
import { DEUX_TEMPS, JETON, lignes, premiereLigne } from './outils-ecriture';
import { MARQUE, examinerAnnonce, marquer, urlAdmise } from './regles';
import { Refus } from './refus';
import type { Env } from './env';

const ID = z.string().regex(/^\d{1,20}$/, 'identifiant numérique');
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date AAAA-MM-JJ');
const ECRITURE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

const MARQUE_ET_PAUSE =
  `Tout ce qui est créé naît EN PAUSE et porte la marque ${MARQUE} (dans le nom, ou en libellé pour les annonces). ` +
  'Florent relit, retire la marque et active dans l’interface Google Ads : ce serveur n’active jamais rien.';

const CANAUX_EN_CLAIR = 'YouTube (flux, InStream, Shorts), Discover, Gmail ; Display et Maps coupés';

/** Ni Search, ni Performance Max : les outils du lot 4 n'écrivent que dans Demand Gen. */
const exigerDemandGen = (canal: string | undefined, quoi: string) => {
  if (canal !== 'DEMAND_GEN') {
    throw new Refus(`${quoi} n'est pas une campagne Demand Gen (${canal ?? 'type inconnu'}) : ces outils n'écrivent que dans Demand Gen.`);
  }
};

// ── ads_dg_campagne_creer ────────────────────────────────────────────────

type LigneObjectif = { customConversionGoal?: { id?: string; name?: string; status?: string; conversionActions?: string[] } };
type LigneAction = { conversionAction?: { resourceName?: string; name?: string; status?: string } };

/**
 * DG3 — l'objectif personnalisé derrière la clé : il existe, il est actif, et
 * chacune de ses actions de conversion aussi. Deux lectures.
 */
const exigerObjectif = async (env: Env, compte: string, cle: string) => {
  const objectifs = objectifsDG(env);
  const id = objectifs.get(cle);
  if (!id) throw new Refus(`Objectif « ${cle} » hors de la liste (ADS_OBJECTIFS_CONVERSION) : ${[...objectifs.keys()].join(', ')}.`);
  const o = (await premiereLigne<LigneObjectif>(env, compte,
    'SELECT custom_conversion_goal.id, custom_conversion_goal.name, custom_conversion_goal.status, custom_conversion_goal.conversion_actions ' +
    `FROM custom_conversion_goal WHERE custom_conversion_goal.id = ${id}`))?.customConversionGoal;
  if (!o || o.status !== 'ENABLED') throw new Refus(`L'objectif personnalisé ${id} (« ${cle} ») est introuvable ou supprimé : à corriger dans Google Ads ou dans ADS_OBJECTIFS_CONVERSION.`);
  const noms = (o.conversionActions ?? []).filter((n) => /^customers\/\d{10}\/conversionActions\/\d+$/.test(n));
  if (noms.length === 0) throw new Refus(`L'objectif personnalisé « ${o.name} » ne contient aucune action de conversion.`);
  const actions = await lignes<LigneAction>(env, compte,
    'SELECT conversion_action.resource_name, conversion_action.name, conversion_action.status FROM conversion_action ' +
    `WHERE conversion_action.resource_name IN (${noms.map((n) => `'${n}'`).join(', ')})`);
  const inactives = noms.filter((n) => actions.find((a) => a.conversionAction?.resourceName === n)?.conversionAction?.status !== 'ENABLED');
  if (inactives.length) {
    throw new Refus(`L'objectif « ${o.name} » contient des actions de conversion absentes ou inactives : ${inactives.join(', ')}. Une campagne ne s'optimise pas sur ce qui ne compte plus.`);
  }
  return { id, nom: o.name ?? id, actions: actions.map((a) => a.conversionAction?.name ?? '?') };
};

const campagneCreer = outil({
  name: 'ads_dg_campagne_creer',
  title: 'Créer une campagne Demand Gen (en pause)',
  description: [
    'Crée une campagne Demand Gen EN PAUSE, avec un budget TOTAL — jamais partagé — sur des dates de début et de fin ' +
    'obligatoires, et son objectif de conversion. Ensuite : ads_dg_groupe_creer (zone et canaux), ads_dg_annonce_creer.',
    '',
    MARQUE_ET_PAUSE,
    '',
    DEUX_TEMPS,
    '',
    'Enchères : CLICS (« Maximiser les clics », cpc_max obligatoire) ou CONVERSIONS (« Maximiser les conversions », sans CPA ni ' +
    'ROAS cible). Objectif : une clé de la liste du serveur (ADS_OBJECTIFS_CONVERSION). Le budget total, son équivalent quotidien ' +
    "(total ÷ jours) et le CPC max sont plafonnés ; l'aperçu dit les plafonds et l'engagement après création. Tout ce que Google " +
    'génèrerait pour Demand Gen (textes, images, vidéos) est coupé.',
  ].join('\n'),
  schema: z.object({
    nom: z.string().min(1).max(100).describe(`Le nom de la campagne ; le serveur y ajoute ${MARQUE}.`),
    budget_total: z.number().positive().describe('Budget total de la campagne, en euros.'),
    debut: DATE.describe('Premier jour de diffusion, AAAA-MM-JJ, au plus tôt aujourd’hui.'),
    fin: DATE.describe('Dernier jour de diffusion, AAAA-MM-JJ.'),
    encheres: z.discriminatedUnion('strategie', [
      z.object({ strategie: z.literal('CLICS'), cpc_max: z.number().positive().describe('CPC maximal, en euros.') }).strict(),
      z.object({ strategie: z.literal('CONVERSIONS') }).strict(),
    ]),
    objectif: z.string().min(1).max(40).describe("Une clé de la liste des objectifs de conversion du serveur."),
    jeton: JETON,
  }).strict(),
  annotations: ECRITURE,
  async executer({ nom, budget_total, debut, fin, encheres, objectif, jeton }, env, contexte) {
    exigerEcriture(contexte);
    const compte = compteEcriture(env);
    const limites = limitesDG(env);

    // DG1 — des dates qui existent, dans l'ordre, pas dans le passé.
    const ce = aujourdhui();
    if (!dateValide(debut) || !dateValide(fin)) throw new Refus(`Dates illisibles : ${debut}, ${fin} (AAAA-MM-JJ).`);
    if (debut < ce) throw new Refus(`Début le ${dateFr(debut)}, dans le passé : au plus tôt aujourd'hui, ${dateFr(ce)}.`);
    if (fin < debut) throw new Refus(`Fin le ${dateFr(fin)}, avant le début, ${dateFr(debut)}.`);
    const jours = joursEntre(debut, fin);

    const total = enMicros(budget_total);
    if (total <= 0) throw new Refus('Budget nul.');
    if (total > limites.budgetMaxCampagne) {
      throw new Refus(`Budget total de ${euros(total)} au-delà du plafond de ${euros(limites.budgetMaxCampagne)} par campagne (ADS_BUDGET_MAX_CAMPAGNE).`);
    }
    const parJour = equivalentQuotidien(total, debut, fin);
    if (parJour > limites.budgetMaxJour) {
      throw new Refus(`${euros(total)} sur ${jours} jour${jours > 1 ? 's' : ''}, c'est ${euros(parJour)} par jour : au-delà du plafond de ` +
        `${euros(limites.budgetMaxJour)} (ADS_BUDGET_MAX_JOUR). Allonger la période, ou réduire le budget.`);
    }
    const cpc = encheres.strategie === 'CLICS' ? enMicros(encheres.cpc_max) : 0;
    if (encheres.strategie === 'CLICS' && (cpc <= 0 || cpc > limites.cpcMax)) {
      throw new Refus(`CPC max de ${euros(cpc)} hors des bornes : au plus ${euros(limites.cpcMax)} (ADS_CPC_MAX).`);
    }

    const but = await exigerObjectif(env, compte, objectif);
    const deja = await engagement(env, compte);
    if (deja + parJour > limites.budgetMaxTotal) {
      throw new Refus(
        `Engagement dépassé : ${euros(deja)} par jour déjà actifs ou en attente de validation, plus ${euros(parJour)}, ` +
        `au-delà de ${euros(limites.budgetMaxTotal)} (ADS_BUDGET_MAX_TOTAL). Réduire le budget, allonger la période, ou valider ou supprimer une campagne ${MARQUE}.`,
      );
    }

    const nomMarque = marquer(nom);
    const tmpBudget = `customers/${compte}/campaignBudgets/-1`;
    const tmpCampagne = `customers/${compte}/campaigns/-2`;
    const operations: Operation[] = [
      { campaignBudgetOperation: { create: {
        resourceName: tmpBudget, name: nomMarque, period: 'CUSTOM_PERIOD', totalAmountMicros: String(total),
        deliveryMethod: 'STANDARD', explicitlyShared: false,
      } } },
      { campaignOperation: { create: {
        resourceName: tmpCampagne,
        name: nomMarque,
        status: 'PAUSED',
        advertisingChannelType: 'DEMAND_GEN',
        campaignBudget: tmpBudget,
        startDateTime: `${debut} 00:00:00`,
        endDateTime: `${fin} 23:59:59`,
        // DG4 — lieux et langue au groupe ; la présence réelle, réglage de campagne.
        demandGenCampaignSettings: { upgradedTargeting: true },
        geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE', negativeGeoTargetType: 'PRESENCE' },
        containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
        ...(encheres.strategie === 'CLICS' ? { targetSpend: { cpcBidCeilingMicros: String(cpc) } } : { maximizeConversions: {} }),
        // DG6 — rien de ce que Google génèrerait : V4 ne l'aurait jamais vu.
        assetAutomationSettings: AUTOMATISMES_DG_CAMPAGNE.map((t) => ({ assetAutomationType: t, assetAutomationStatus: 'OPTED_OUT' })),
      } } },
      { conversionGoalCampaignConfigOperation: {
        update: {
          resourceName: `customers/${compte}/conversionGoalCampaignConfigs/-2`,
          goalConfigLevel: 'CAMPAIGN',
          customConversionGoal: `customers/${compte}/customConversionGoals/${but.id}`,
        },
        updateMask: 'customConversionGoal,goalConfigLevel',
      } },
    ];

    return texte(await ecrire(env, contexte, {
      outil: 'ads_dg_campagne_creer',
      compte,
      jeton,
      preparation: {
        service: 'googleAds',
        operations,
        description: [
          `Campagne Demand Gen « ${nomMarque} », EN PAUSE.`,
          `- Budget total : ${euros(total)}, du ${dateFr(debut)} au ${dateFr(fin)} (${jours} jour${jours > 1 ? 's' : ''}), ` +
          `soit ${euros(parJour)} par jour. Plafonds : ${euros(limites.budgetMaxCampagne)} par campagne, ${euros(limites.budgetMaxJour)} par jour.`,
          `- Engagement après création : ${euros(deja + parJour)} par jour sur ${euros(limites.budgetMaxTotal)}.`,
          encheres.strategie === 'CLICS'
            ? `- Enchères : Maximiser les clics, CPC max ${euros(cpc)} (plafond ${euros(limites.cpcMax)}).`
            : '- Enchères : Maximiser les conversions, sans CPA ni ROAS cible.',
          `- Objectif de conversion « ${objectif} » : l'objectif personnalisé « ${but.nom} » (${but.id}) — ${but.actions.map((a) => `« ${a} »`).join(', ')}.`,
          '- Zone et langue : posées au groupe (ads_dg_groupe_creer), en présence réelle.',
          `- Canaux : posés au groupe — ${CANAUX_EN_CLAIR}.`,
          `- Ce que Google génèrerait (${AUTOMATISMES_DG_CAMPAGNE.length} automatismes : textes de la page d'arrivée, images retouchées, vidéos) : coupé.`,
        ].join('\n'),
        bilan: `Campagne « ${nomMarque} » créée, en pause. Suite : ads_dg_groupe_creer.`,
      },
    }));
  },
});

// ── ads_dg_groupe_creer ──────────────────────────────────────────────────

type LigneCampagneDG = {
  campaign?: { name?: string; status?: string; advertisingChannelType?: string; demandGenCampaignSettings?: { upgradedTargeting?: boolean } };
};
type LigneLieu = { geoTargetConstant?: { resourceName?: string; canonicalName?: string; status?: string } };

const groupeCreer = outil({
  name: 'ads_dg_groupe_creer',
  title: "Créer un groupe d'annonces Demand Gen (en pause)",
  description: [
    "Crée un groupe d'annonces EN PAUSE dans une campagne Demand Gen, avec sa zone, sa langue et ses canaux. La zone est un " +
    'préréglage du serveur : france_metropolitaine (la France, sans les DROM) ou locale (une liste de lieux fixée par Florent). ' +
    `La langue est le français. Les canaux sont posés par le serveur : ${CANAUX_EN_CLAIR}. Ensuite : ads_dg_annonce_creer.`,
    '',
    MARQUE_ET_PAUSE,
    '',
    DEUX_TEMPS,
  ].join('\n'),
  schema: z.object({
    campagne: ID.describe('Identifiant de la campagne Demand Gen (campaign.id).'),
    nom: z.string().min(1).max(100).describe(`Le nom du groupe ; le serveur y ajoute ${MARQUE}.`),
    zone: z.enum(['france_metropolitaine', 'locale']).describe('Un préréglage de zone, jamais un lieu.'),
    jeton: JETON,
  }).strict(),
  annotations: ECRITURE,
  async executer({ campagne, nom, zone, jeton }, env, contexte) {
    exigerEcriture(contexte);
    const compte = compteEcriture(env);
    const zones = zonesDG(env);
    const lieux = zones[zone];
    if (lieux.length === 0) {
      throw new Refus("Le préréglage « locale » est vide (ADS_ZONE_LOCALE, wrangler.toml) : Florent n'en a pas encore choisi les lieux.", 503);
    }

    const c = (await premiereLigne<LigneCampagneDG>(env, compte,
      'SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.demand_gen_campaign_settings.upgraded_targeting ' +
      `FROM campaign WHERE campaign.id = ${campagne}`))?.campaign;
    if (!c || c.status === 'REMOVED') throw new Refus(`Campagne ${campagne} introuvable, ou supprimée.`);
    exigerDemandGen(c.advertisingChannelType, `La campagne « ${c.name} »`);
    if (c.demandGenCampaignSettings?.upgradedTargeting !== true) {
      throw new Refus(`La campagne « ${c.name} » cible au niveau de la campagne : ses groupes ne portent pas de zone. Ce serveur ne gère que le ciblage au groupe.`);
    }

    // DG4 — des lieux qui existent : un identifiant mal recopié dans wrangler.toml ciblerait autre chose, ou rien.
    const lus = await lignes<LigneLieu>(env, compte,
      'SELECT geo_target_constant.id, geo_target_constant.resource_name, geo_target_constant.canonical_name, geo_target_constant.status ' +
      `FROM geo_target_constant WHERE geo_target_constant.id IN (${lieux.map((l) => l.split('/')[1]).join(', ')})`);
    const noms = lieux.map((l) => {
      const g = lus.find((x) => x.geoTargetConstant?.resourceName === l)?.geoTargetConstant;
      if (!g || g.status !== 'ENABLED') throw new Refus(`Le lieu ${l} du préréglage « ${zone} » est introuvable ou retiré par Google : à corriger dans wrangler.toml.`, 503);
      return g.canonicalName ?? l;
    });

    const nomMarque = marquer(nom);
    const tmpGroupe = `customers/${compte}/adGroups/-1`;
    const operations: Operation[] = [
      { adGroupOperation: { create: {
        resourceName: tmpGroupe,
        campaign: `customers/${compte}/campaigns/${campagne}`,
        name: nomMarque,
        status: 'PAUSED',
        demandGenAdGroupSettings: { channelControls: { selectedChannels: { ...CANAUX_DG } } },
      } } },
      ...lieux.map((l) => ({ adGroupCriterionOperation: { create: { adGroup: tmpGroupe, location: { geoTargetConstant: l } } } })),
      { adGroupCriterionOperation: { create: { adGroup: tmpGroupe, language: { languageConstant: LANGUE_DG } } } },
    ];

    return texte(await ecrire(env, contexte, {
      outil: 'ads_dg_groupe_creer',
      compte,
      jeton,
      preparation: {
        service: 'googleAds',
        operations,
        description: [
          `Groupe d'annonces « ${nomMarque} », EN PAUSE, dans la campagne Demand Gen « ${c.name} ».`,
          `- Zone « ${zone} » (${noms.length} lieu${noms.length > 1 ? 'x' : ''}) : ${noms.join(' ; ')} — en présence réelle, réglée à la campagne.`,
          '- Langue : français.',
          `- Canaux : ${CANAUX_EN_CLAIR}.`,
        ].join('\n'),
        bilan: `Groupe « ${nomMarque} » créé, en pause. Suite : ads_dg_annonce_creer.`,
      },
    }));
  },
});

// ── ads_dg_annonce_creer ─────────────────────────────────────────────────

type LigneGroupeDG = { adGroup?: { name?: string; status?: string }; campaign?: { name?: string; advertisingChannelType?: string } };
type LigneImage = { asset?: { id?: string; type?: string; name?: string; imageAsset?: { fullSize?: { widthPixels?: string; heightPixels?: string } } } };

const IMAGES = z.array(ID).min(1).max(LIMITES_DG.imagesMax);

const annonceCreer = outil({
  name: 'ads_dg_annonce_creer',
  title: 'Créer une annonce Demand Gen multi-élément (en pause)',
  description: [
    `Crée une annonce Demand Gen multi-élément EN PAUSE dans un groupe Demand Gen : 1 à ${LIMITES_DG.titresMax} titres de ` +
    `${LIMITES_DG.titre} caractères, 1 à ${LIMITES_DG.descriptionsMax} descriptions de ${LIMITES_DG.description}, des images et 1 à ` +
    `${LIMITES_DG.logosMax} logos de la bibliothèque d'éléments du compte (par identifiant), une URL finale sur https://luminose.fr/ ` +
    `ou https://www.luminose.fr/. Le nom d'entreprise est « ${NOM_ENTREPRISE} », posé par le serveur.`,
    '',
    `Images, 20 au plus en tout, au ratio de leur champ (±1 %) : paysage 1,91:1 (600×314 au moins), carre 1:1 (300×300), ` +
    'portrait 4:5 (480×600), vertical 9:16 (600×1067) — une paysage ou une carrée au moins ; logos 1:1 (128×128). Le serveur ' +
    'vérifie que chaque élément existe, est une image, et respecte le ratio et la taille de son champ.',
    '',
    MARQUE_ET_PAUSE,
    '',
    DEUX_TEMPS,
    '',
    'Les textes passent un filtre déontologique : aucune promesse de guérison, explicite ou suggérée. Un terme interdit fait ' +
    "refuser l'annonce ; certains termes ne font qu'avertir. Ce que Google génèrerait à partir de l'annonce (images retouchées, " +
    `vidéos, animations) est coupé. Bouton facultatif : ${Object.keys(BOUTONS).join(', ')} ; absent, Google le choisit.`,
  ].join('\n'),
  schema: z.object({
    groupe: ID.describe("Identifiant du groupe d'annonces Demand Gen (ad_group.id)."),
    titres: z.array(z.string().min(1).max(100)).min(1).max(LIMITES_DG.titresMax),
    descriptions: z.array(z.string().min(1).max(300)).min(1).max(LIMITES_DG.descriptionsMax),
    images: z.object({
      paysage: IMAGES.optional(), carre: IMAGES.optional(), portrait: IMAGES.optional(), vertical: IMAGES.optional(),
    }).strict().describe('Identifiants d’éléments IMAGE (asset.id), par format.'),
    logos: z.array(ID).min(1).max(LIMITES_DG.logosMax).describe('Identifiants d’éléments IMAGE carrés (asset.id).'),
    url_finale: z.string().max(2048),
    bouton: z.enum(Object.keys(BOUTONS) as [Bouton, ...Bouton[]]).optional().describe("Le bouton de l'annonce ; absent, Google le choisit."),
    nom: z.string().min(1).max(100).optional().describe("Nom interne de l'annonce, immuable ; facultatif."),
    jeton: JETON,
  }).strict(),
  annotations: ECRITURE,
  async executer({ groupe, titres, descriptions, images, logos, url_finale, bouton, nom, jeton }, env, contexte) {
    exigerEcriture(contexte);
    const compte = compteEcriture(env);
    const interne = nom?.trim();

    // Les textes : longueurs, doublons, accolades — tout est dit d'un coup.
    const nets = (liste: string[]) => liste.map((t) => t.trim().replace(/\s+/g, ' '));
    const t = nets(titres);
    const d = nets(descriptions);
    const fautes: string[] = [];
    for (const [liste, max, quoi] of [[t, LIMITES_DG.titre, 'titre'], [d, LIMITES_DG.description, 'description']] as const) {
      const vus = new Set<string>();
      for (const x of liste) {
        if (!x) { fautes.push(`- ${quoi} vide.`); continue; }
        if (longueur(x) > max) fautes.push(`- ${quoi} « ${x} » : ${longueur(x)} caractères — ${max} au plus.`);
        if (/[{}]/.test(x)) fautes.push(`- ${quoi} « ${x} » : pas d'accolades — l'insertion de mot-clé n'existe pas en Demand Gen.`);
        if (vus.has(x.toLowerCase())) fautes.push(`- ${quoi} en double : « ${x} ».`);
        vus.add(x.toLowerCase());
      }
    }
    if (!urlAdmise(url_finale)) fautes.push(`- URL finale « ${url_finale} » refusée : https://luminose.fr/… ou https://www.luminose.fr/…, sans sous-domaine.`);

    // Les images : une paysage ou une carrée au moins, vingt au plus, chacune une fois par champ.
    const parFormat: [FormatImage, string[]][] = [
      ...(['paysage', 'carre', 'portrait', 'vertical'] as const).map((f): [FormatImage, string[]] => [f, images[f] ?? []]),
      ['logo', logos],
    ];
    if ((images.paysage ?? []).length + (images.carre ?? []).length === 0) fautes.push('- images : une paysage ou une carrée au moins.');
    const nombre = parFormat.filter(([f]) => f !== 'logo').reduce((n, [, ids]) => n + ids.length, 0);
    if (nombre > LIMITES_DG.imagesMax) fautes.push(`- images : ${nombre} — ${LIMITES_DG.imagesMax} au plus en tout.`);
    for (const [f, ids] of parFormat) if (new Set(ids).size !== ids.length) fautes.push(`- ${IMAGES_DG[f].nom} : un élément en double.`);
    if (fautes.length) throw new Refus(['Annonce refusée, rien n’est parti :', ...fautes].join('\n'));

    const examen = examinerAnnonce([...t, ...d]);
    if (examen.refus.length > 0) {
      throw new Refus(`Annonce refusée par le filtre déontologique (aucune promesse de guérison, socle/cadre-deontologique.md) :\n${examen.refus.map((r) => `- ${r}`).join('\n')}`);
    }

    const g = await premiereLigne<LigneGroupeDG>(env, compte,
      'SELECT ad_group.id, ad_group.name, ad_group.status, campaign.name, campaign.advertising_channel_type FROM ad_group ' +
      `WHERE ad_group.id = ${groupe}`);
    if (!g?.adGroup || g.adGroup.status === 'REMOVED') throw new Refus(`Groupe d'annonces ${groupe} introuvable, ou supprimé.`);
    exigerDemandGen(g.campaign?.advertisingChannelType, `La campagne « ${g.campaign?.name} »`);

    // DG7 — chaque élément existe, est une image, au ratio et à la taille de son champ. Une lecture.
    const tous = [...new Set(parFormat.flatMap(([, ids]) => ids))];
    const lus = new Map((await lignes<LigneImage>(env, compte,
      'SELECT asset.id, asset.type, asset.name, asset.image_asset.full_size.width_pixels, asset.image_asset.full_size.height_pixels ' +
      `FROM asset WHERE asset.id IN (${tous.join(', ')})`)).map((l) => [String(l.asset?.id), l.asset]));
    const dimensions: string[] = [];
    for (const [f, ids] of parFormat) {
      const { ratio, min, nom: format } = IMAGES_DG[f];
      for (const id of ids) {
        const a = lus.get(id);
        if (!a) { fautes.push(`- ${format} ${id} : élément introuvable dans le compte.`); continue; }
        if (a.type !== 'IMAGE') { fautes.push(`- ${format} ${id} : élément de type ${a.type ?? 'inconnu'}, pas une image.`); continue; }
        const l = Number(a.imageAsset?.fullSize?.widthPixels);
        const h = Number(a.imageAsset?.fullSize?.heightPixels);
        if (!(l > 0 && h > 0)) { fautes.push(`- ${format} ${id} : dimensions illisibles.`); continue; }
        if (Math.abs(l / h / ratio - 1) > 0.01) fautes.push(`- ${format} ${id} : ${l}×${h}, ratio ${(l / h).toFixed(2)} — ${ratio.toFixed(2)} attendu (±1 %).`);
        else if (l < min[0] || h < min[1]) fautes.push(`- ${format} ${id} : ${l}×${h} — ${min[0]}×${min[1]} au moins.`);
        else dimensions.push(`  · ${format} ${id}${a.name ? ` « ${a.name} »` : ''} : ${l}×${h}`);
      }
    }
    if (fautes.length) throw new Refus(['Annonce refusée, rien n’est parti :', ...fautes].join('\n'));

    const libelle = await trouverLibelle(env, compte);
    const multi: Record<string, unknown> = {
      businessName: NOM_ENTREPRISE,
      headlines: t.map((text) => ({ text })),
      descriptions: d.map((text) => ({ text })),
      ...Object.fromEntries(parFormat.filter(([, ids]) => ids.length)
        .map(([f, ids]) => [IMAGES_DG[f].champ, ids.map((id) => ({ asset: `customers/${compte}/assets/${id}` }))])),
      ...(bouton ? { callToActionText: BOUTONS[bouton].texte } : {}),
    };
    const operations: Operation[] = [{ create: {
      adGroup: `customers/${compte}/adGroups/${groupe}`,
      status: 'PAUSED',
      ad: { finalUrls: [url_finale.trim()], ...(interne ? { name: interne } : {}), demandGenMultiAssetAd: multi },
      adGroupAdAssetAutomationSettings: AUTOMATISMES_DG_ANNONCE.map((a) => ({ assetAutomationType: a, assetAutomationStatus: 'OPTED_OUT' })),
    } }];

    return texte(await ecrire(env, contexte, {
      outil: 'ads_dg_annonce_creer',
      compte,
      jeton,
      preparation: {
        service: 'adGroupAds',
        operations,
        description: [
          `Annonce Demand Gen multi-élément EN PAUSE dans le groupe « ${g.adGroup.name} » (campagne « ${g.campaign?.name} »), libellé ${MARQUE}.`,
          `- Nom d'entreprise : ${NOM_ENTREPRISE}.${interne ? ` Nom interne : « ${interne} ».` : ''}`,
          `- URL finale : ${url_finale.trim()}`,
          `- Titres (${t.length}) :`, ...t.map((x) => `  · ${x}`),
          `- Descriptions (${d.length}) :`, ...d.map((x) => `  · ${x}`),
          '- Images :', ...dimensions,
          `- Bouton : ${bouton ? `« ${BOUTONS[bouton].fr} » (${bouton})` : 'choisi par Google'}.`,
          "- Ce que Google génèrerait à partir de l'annonce (images retouchées, vidéos, animations) : coupé.",
          ...(examen.avertissements.length ? ['', 'AVERTISSEMENTS — à relire avant de valider :', ...examen.avertissements.map((a) => `- ${a}`)] : []),
        ].join('\n'),
        bilan: `Annonce créée, en pause, dans le groupe « ${g.adGroup.name} ».`,
        libeller: { service: 'adGroupAdLabels', champ: 'adGroupAd', ...(libelle ? { libelle } : {}) },
      },
    }));
  },
});

export const OUTILS_DEMAND_GEN = [campagneCreer, groupeCreer, annonceCreer] as const;
