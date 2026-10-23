/**
 * Annuler une pause — décision du 23/10/2026
 * (workers/mcp/decisions/2026-10-23-reactiver.md). `ads_reactiver` remet en
 * ENABLED un groupe d'annonces, une annonce, un mot-clé ou une association
 * d'élément d'annonce que CE serveur a mis en pause (`ads_mettre_en_pause`).
 * Ce n'est pas une activation : ce qui est né en pause, ce qui a été mis en
 * pause dans l'interface, une campagne, se réactive dans l'interface.
 *
 * Comme les autres outils d'écriture, il ne fait que PRÉPARER : vérifier, lire
 * de quoi éclairer la décision, construire l'opération. Scope, aperçu, jeton,
 * journal et appel sont ecriture.ts ; la table fermée de google-ads.ts
 * revérifie journal, marque et refus de Google avant chaque envoi.
 *
 * Six lectures au plus : l'élément, le libellé « [Claude] », le journal,
 * l'historique de Google (30 jours), les métriques d'avant la pause — plus ce
 * que la table relit.
 */
import { z } from 'zod';
import { euros } from './argent';
import { aujourdhui, dateFr, decaler, heureDe, jourDe } from './dates';
import { compteEcriture, ecrire, exigerEcriture, trouverLibelle } from './ecriture';
import { TYPES_ELEMENTS, type ServiceEcriture } from './google-ads';
import { dernierChangementDeStatut } from './journal';
import { outil, texte } from './outil';
import { DEUX_TEMPS, JETON, exigerSearch, lignes, premiereLigne } from './outils-ecriture';
import { MARQUE } from './regles';
import { Refus } from './refus';

// ── Ce que l'API rend ────────────────────────────────────────────────────

type Qualite = { qualityScore?: number; creativeQualityScore?: string; postClickQualityScore?: string; searchPredictedCtr?: string };
type Ligne = {
  campaign?: { id?: string; name?: string; status?: string; advertisingChannelType?: string };
  adGroup?: { id?: string; name?: string; status?: string };
  adGroupAd?: { status?: string; labels?: string[]; policySummary?: { approvalStatus?: string } };
  adGroupCriterion?: {
    status?: string; negative?: boolean; labels?: string[]; approvalStatus?: string;
    keyword?: { text?: string; matchType?: string }; qualityInfo?: Qualite;
  };
  campaignAsset?: { status?: string; fieldType?: string };
  adGroupAsset?: { status?: string; fieldType?: string };
  metrics?: {
    impressions?: string; clicks?: string; costMicros?: string; conversions?: number;
    historicalQualityScore?: string; historicalCreativeQualityScore?: string;
    historicalLandingPageQualityScore?: string; historicalSearchPredictedCtr?: string;
  };
  changeEvent?: { changeDateTime?: string; changeResourceName?: string; clientType?: string; changedFields?: string };
};

/** Ce que l'outil retient d'un élément, quel que soit son type. */
type Element = {
  nom: string;
  statut?: string;
  canal?: string;
  campagne: { id?: string; nom?: string; statut?: string };
  groupe?: { nom?: string; statut?: string };
  /** Les libellés de l'élément ; `undefined` pour ce qui n'en porte pas (groupe, association). */
  libelles?: string[];
  /** Un groupe porte sa marque dans son nom. */
  nomMarque?: boolean;
  approbation?: string;
  qualite?: Qualite;
};

const ASSOCIATION = new RegExp(`^\\d{1,20}~\\d{1,20}~(${TYPES_ELEMENTS.join('|')})$`);
const METRIQUES = 'metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions';

type Type = 'groupe' | 'annonce' | 'mot_cle' | 'association_campagne' | 'association_groupe';

/**
 * Ce qui se réactive, et comment le lire : les mêmes types et les mêmes
 * identifiants qu'`ads_mettre_en_pause` — jamais une campagne.
 * `changement` : le type de ressource de l'historique de Google (change_event).
 */
const ENTITES: Record<Type, {
  service: ServiceEcriture; forme: RegExp; exemple: string; changement: string;
  requete: (p: string[]) => string; lire: (l: Ligne) => Element; metriques: (p: string[], periode: string) => string;
}> = {
  groupe: {
    service: 'adGroups', forme: /^\d{1,20}$/, exemple: 'ad_group.id', changement: 'AD_GROUP',
    requete: ([g]) =>
      'SELECT ad_group.id, ad_group.name, ad_group.status, campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type ' +
      `FROM ad_group WHERE ad_group.id = ${g}`,
    lire: (l) => ({
      nom: `le groupe « ${l.adGroup?.name} »`, statut: l.adGroup?.status, canal: l.campaign?.advertisingChannelType,
      campagne: { id: l.campaign?.id, nom: l.campaign?.name, statut: l.campaign?.status },
      nomMarque: Boolean(l.adGroup?.name?.startsWith(`${MARQUE} `)),
    }),
    metriques: ([g], periode) => `SELECT ad_group.id, ${METRIQUES} FROM ad_group WHERE ad_group.id = ${g} AND ${periode}`,
  },
  annonce: {
    service: 'adGroupAds', forme: /^\d{1,20}~\d{1,20}$/, exemple: 'ad_group.id~ad_group_ad.ad.id', changement: 'AD_GROUP_AD',
    requete: ([g, a]) =>
      'SELECT ad_group.id, ad_group_ad.ad.id, ad_group_ad.status, ad_group_ad.labels, ad_group_ad.policy_summary.approval_status, ' +
      'ad_group.name, ad_group.status, campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type ' +
      `FROM ad_group_ad WHERE ad_group.id = ${g} AND ad_group_ad.ad.id = ${a}`,
    lire: (l) => ({
      nom: `une annonce du groupe « ${l.adGroup?.name} »`, statut: l.adGroupAd?.status, canal: l.campaign?.advertisingChannelType,
      campagne: { id: l.campaign?.id, nom: l.campaign?.name, statut: l.campaign?.status },
      groupe: { nom: l.adGroup?.name, statut: l.adGroup?.status },
      libelles: l.adGroupAd?.labels ?? [], approbation: l.adGroupAd?.policySummary?.approvalStatus,
    }),
    metriques: ([g, a], periode) =>
      `SELECT ad_group.id, ad_group_ad.ad.id, ${METRIQUES} FROM ad_group_ad WHERE ad_group.id = ${g} AND ad_group_ad.ad.id = ${a} AND ${periode}`,
  },
  mot_cle: {
    service: 'adGroupCriteria', forme: /^\d{1,20}~\d{1,20}$/, exemple: 'ad_group.id~ad_group_criterion.criterion_id', changement: 'AD_GROUP_CRITERION',
    requete: ([g, c]) =>
      'SELECT ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.type, ad_group_criterion.status, ad_group_criterion.negative, ' +
      'ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.labels, ad_group_criterion.approval_status, ' +
      'ad_group_criterion.quality_info.quality_score, ad_group_criterion.quality_info.creative_quality_score, ' +
      'ad_group_criterion.quality_info.post_click_quality_score, ad_group_criterion.quality_info.search_predicted_ctr, ' +
      'ad_group.name, ad_group.status, campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type ' +
      `FROM ad_group_criterion WHERE ad_group.id = ${g} AND ad_group_criterion.criterion_id = ${c} AND ad_group_criterion.type = 'KEYWORD'`,
    lire: (l) => ({
      nom: `le mot-clé « ${l.adGroupCriterion?.keyword?.text} » [${l.adGroupCriterion?.keyword?.matchType}] du groupe « ${l.adGroup?.name} »`,
      statut: l.adGroupCriterion?.negative ? 'NEGATIF' : l.adGroupCriterion?.status, canal: l.campaign?.advertisingChannelType,
      campagne: { id: l.campaign?.id, nom: l.campaign?.name, statut: l.campaign?.status },
      groupe: { nom: l.adGroup?.name, statut: l.adGroup?.status },
      libelles: l.adGroupCriterion?.labels ?? [], approbation: l.adGroupCriterion?.approvalStatus, qualite: l.adGroupCriterion?.qualityInfo,
    }),
    // Les niveaux de qualité historiques ne se lisent que sur une période non découpée par jour (test/gaql.ts).
    metriques: ([g, c], periode) =>
      `SELECT ad_group.id, ad_group_criterion.criterion_id, ${METRIQUES}, metrics.historical_quality_score, ` +
      'metrics.historical_creative_quality_score, metrics.historical_landing_page_quality_score, metrics.historical_search_predicted_ctr ' +
      `FROM keyword_view WHERE ad_group.id = ${g} AND ad_group_criterion.criterion_id = ${c} AND ${periode}`,
  },
  association_campagne: {
    service: 'campaignAssets', forme: ASSOCIATION, exemple: 'campaign.id~asset.id~TYPE', changement: 'CAMPAIGN_ASSET',
    requete: ([c, a, t]) =>
      'SELECT campaign.id, asset.id, campaign_asset.field_type, campaign_asset.status, campaign.name, campaign.status, campaign.advertising_channel_type ' +
      `FROM campaign_asset WHERE campaign.id = ${c} AND asset.id = ${a} AND campaign_asset.field_type = '${t}'`,
    lire: (l) => ({
      nom: `l'association ${l.campaignAsset?.fieldType} de l'élément à la campagne « ${l.campaign?.name} »`,
      statut: l.campaignAsset?.status, canal: l.campaign?.advertisingChannelType,
      campagne: { id: l.campaign?.id, nom: l.campaign?.name, statut: l.campaign?.status },
    }),
    metriques: ([c, a, t], periode) =>
      `SELECT campaign.id, asset.id, campaign_asset.field_type, ${METRIQUES} FROM campaign_asset ` +
      `WHERE campaign.id = ${c} AND asset.id = ${a} AND campaign_asset.field_type = '${t}' AND ${periode}`,
  },
  association_groupe: {
    service: 'adGroupAssets', forme: ASSOCIATION, exemple: 'ad_group.id~asset.id~TYPE', changement: 'AD_GROUP_ASSET',
    requete: ([g, a, t]) =>
      'SELECT ad_group.id, asset.id, ad_group_asset.field_type, ad_group_asset.status, ad_group.name, ad_group.status, ' +
      'campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type ' +
      `FROM ad_group_asset WHERE ad_group.id = ${g} AND asset.id = ${a} AND ad_group_asset.field_type = '${t}'`,
    lire: (l) => ({
      nom: `l'association ${l.adGroupAsset?.fieldType} de l'élément au groupe « ${l.adGroup?.name} »`,
      statut: l.adGroupAsset?.status, canal: l.campaign?.advertisingChannelType,
      campagne: { id: l.campaign?.id, nom: l.campaign?.name, statut: l.campaign?.status },
      groupe: { nom: l.adGroup?.name, statut: l.adGroup?.status },
    }),
    metriques: ([g, a, t], periode) =>
      `SELECT ad_group.id, asset.id, ad_group_asset.field_type, ${METRIQUES} FROM ad_group_asset ` +
      `WHERE ad_group.id = ${g} AND asset.id = ${a} AND ad_group_asset.field_type = '${t}' AND ${periode}`,
  },
};

// ── Dire en français ─────────────────────────────────────────────────────

const STATUTS: Record<string, string> = { ENABLED: 'active', PAUSED: 'en pause', REMOVED: 'supprimée' };
const statut = (s?: string) => STATUTS[s ?? ''] ?? s ?? 'statut inconnu';

const NIVEAUX: Record<string, string> = {
  ABOVE_AVERAGE: 'au-dessus de la moyenne', AVERAGE: 'dans la moyenne', BELOW_AVERAGE: 'en dessous de la moyenne', UNKNOWN: 'inconnu',
};
const niveau = (n?: string) => NIVEAUX[n ?? ''] ?? n ?? 'non communiqué';

/** Qui a changé le statut en dernier, selon l'historique de Google. */
const CLIENTS: Record<string, string> = {
  GOOGLE_ADS_WEB_CLIENT: "l'interface Google Ads",
  GOOGLE_ADS_EDITOR: 'Google Ads Editor',
  GOOGLE_ADS_MOBILE_APP: "l'application mobile Google Ads",
  GOOGLE_ADS_AUTOMATED_RULE: 'une règle automatique',
  GOOGLE_ADS_SCRIPTS: 'un script Google Ads',
  GOOGLE_ADS_BULK_UPLOAD: 'un import groupé',
  GOOGLE_ADS_RECOMMENDATIONS: 'une recommandation de Google appliquée',
};

const qualite = (e: Element, m: Ligne['metrics']): string => {
  const q = e.qualite;
  if (q?.qualityScore) {
    return `- Niveau de qualité actuel : ${q.qualityScore}/10 — taux de clics attendu ${niveau(q.searchPredictedCtr)}, ` +
      `pertinence de l'annonce ${niveau(q.creativeQualityScore)}, expérience sur la page de destination ${niveau(q.postClickQualityScore)}.`;
  }
  if (m?.historicalQualityScore) {
    return `- Niveau de qualité sur les 30 jours précédant la pause : ${m.historicalQualityScore}/10 — taux de clics attendu ` +
      `${niveau(m.historicalSearchPredictedCtr)}, pertinence de l'annonce ${niveau(m.historicalCreativeQualityScore)}, ` +
      `expérience sur la page de destination ${niveau(m.historicalLandingPageQualityScore)}.`;
  }
  return '- Niveau de qualité : non communiqué par Google — ni aujourd\'hui (en pause), ni sur les 30 jours précédant la pause.';
};

const RESTE = 'Toute autre réactivation — ce qui est né en pause, ce qui a été mis en pause dans l\'interface, une campagne — ' +
  'se fait dans l\'interface Google Ads, par Florent.';

// ── ads_reactiver ────────────────────────────────────────────────────────

const reactiver = outil({
  name: 'ads_reactiver',
  title: 'Annuler une pause faite par ce serveur (pas une activation)',
  description: [
    'ANNULE UNE MISE EN PAUSE faite par CE serveur avec ads_mettre_en_pause : remet en ENABLED un groupe d\'annonces, une annonce, ' +
    'un mot-clé ou l\'association d\'un élément d\'annonce du Search, quand le journal des écritures du serveur garde cette pause. ' +
    'Ce n\'est PAS une activation. Jamais une campagne. ' + RESTE,
    '',
    'Refusé : une pause absente du journal du serveur, ou faite dans l\'interface ; un élément qui porte encore la marque ' +
    `${MARQUE} (nom ou libellé) — il n'a pas été relu ; une annonce ou un mot-clé refusé par Google.`,
    '',
    'L\'aperçu dit l\'élément, son groupe, sa campagne et leur état — réactiver dans une campagne en pause ne dépense rien —, ' +
    'la date de la pause et son numéro au journal, ce que l\'élément a fait sur les 30 jours précédant la pause, et pour un ' +
    'mot-clé son niveau de qualité.',
    '',
    DEUX_TEMPS,
    '',
    'Mêmes types et mêmes identifiants que ads_mettre_en_pause : groupe = ad_group.id ; annonce = "ad_group.id~ad_group_ad.ad.id" ; ' +
    'mot_cle = "ad_group.id~ad_group_criterion.criterion_id" ; association_campagne = "campaign.id~asset.id~TYPE" ; ' +
    `association_groupe = "ad_group.id~asset.id~TYPE", TYPE parmi ${TYPES_ELEMENTS.join(', ')}.`,
  ].join('\n'),
  schema: z.object({
    type: z.enum(['groupe', 'annonce', 'mot_cle', 'association_campagne', 'association_groupe'])
      .describe('Jamais une campagne : sa réactivation se fait dans l’interface.'),
    identifiant: z.string().max(70).describe('Voir la description de l’outil pour la forme selon le type.'),
    jeton: JETON,
  }).strict(),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async executer({ type, identifiant, jeton }, env, contexte) {
    exigerEcriture(contexte);
    const compte = compteEcriture(env);

    const entite = ENTITES[type];
    if (!entite.forme.test(identifiant)) {
      throw new Refus(`Identifiant « ${identifiant} » invalide pour ${type} : attendu ${entite.exemple}.`);
    }
    const p = identifiant.split('~');
    const ligne = await premiereLigne<Ligne>(env, compte, entite.requete(p));
    if (!ligne) throw new Refus(`${type} ${identifiant} introuvable dans le compte.`);
    const e = entite.lire(ligne);
    exigerSearch(e.canal, `La campagne de ${e.nom}`);
    if (e.statut === 'NEGATIF') throw new Refus(`${e.nom} est un mot-clé négatif : il ne se met pas en pause, il ne se réactive pas ici.`);
    if (e.statut === 'REMOVED') throw new Refus(`${e.nom} est supprimé : rien à réactiver.`);
    if (e.statut === 'ENABLED') throw new Refus(`${e.nom} n'est pas en pause : rien à annuler.`);
    if (e.statut !== 'PAUSED') throw new Refus(`${e.nom} est dans un état inattendu (${e.statut ?? 'inconnu'}) : rien n'est parti.`);

    // Règle 2 — la marque : ce qui la porte encore n'a pas été relu.
    const libelle = e.libelles ? await trouverLibelle(env, compte) : undefined;
    if (e.nomMarque || (libelle && e.libelles?.includes(libelle))) {
      throw new Refus(`${e.nom} porte encore la marque ${MARQUE} (${e.nomMarque ? 'dans son nom' : 'en libellé'}) : il n'a pas été relu. ` +
        'Le relire et retirer la marque dans l\'interface Google Ads ; l\'y activer, ou revenir ensuite ici.');
    }
    // Règle 4 — ce que Google a refusé ne se réactive pas.
    if (e.approbation === 'DISAPPROVED') {
      throw new Refus(`${e.nom} est refusé par Google (DISAPPROVED) : le réactiver ne le ferait pas diffuser. Le corriger d'abord.`);
    }

    // Règle 1 — la pause est-elle celle de ce serveur ? Le journal, puis l'historique de Google.
    const ressource = `customers/${compte}/${entite.service}/${identifiant}`;
    const pause = await dernierChangementDeStatut(env, compte, ressource);
    if (!pause) {
      throw new Refus(`${e.nom} n'a jamais été mis en pause par ce serveur : sa pause n'est pas dans le journal des écritures. ` +
        'Une pause faite dans l\'interface Google Ads se lève dans l\'interface. ' + RESTE);
    }
    if (pause.outil !== 'ads_mettre_en_pause') {
      throw new Refus(`La dernière pause de ${e.nom} par ce serveur a déjà été annulée (écriture n° ${pause.id} du journal) : ` +
        'la pause actuelle vient d\'ailleurs — de l\'interface Google Ads, sans doute. ' + RESTE);
    }
    const historique = await lignes<Ligne>(env, compte,
      'SELECT change_event.change_date_time, change_event.change_resource_name, change_event.change_resource_type, change_event.client_type, ' +
      'change_event.changed_fields, change_event.campaign FROM change_event ' +
      `WHERE change_event.change_date_time >= '${decaler(aujourdhui(), -29)}' AND change_event.change_date_time <= '${aujourdhui()} 23:59:59' ` +
      `AND change_event.change_resource_type = '${entite.changement}' AND change_event.campaign = 'customers/${compte}/campaigns/${e.campagne.id}' ` +
      'ORDER BY change_event.change_date_time DESC LIMIT 1000');
    // Le plus récent changement de statut que Google connaisse (30 jours) : s'il ne vient pas de l'API, la pause n'est plus la nôtre.
    const dernier = historique.map((l) => l.changeEvent ?? {})
      .find((c) => c.changeResourceName === ressource && (c.changedFields ?? '').split(',').includes('status'));
    if (dernier && dernier.clientType !== 'GOOGLE_ADS_API') {
      throw new Refus(`Le dernier changement de statut de ${e.nom} vient de ${CLIENTS[dernier.clientType ?? ''] ?? dernier.clientType} ` +
        `(${dernier.changeDateTime?.slice(0, 16)}), après la pause de ce serveur (écriture n° ${pause.id}) : la pause actuelle n'est pas la sienne. ` + RESTE);
    }

    // Ce que l'élément faisait avant sa pause : les 30 jours qui la précèdent.
    const jour = jourDe(pause.createdAt);
    const [debut, fin] = [decaler(jour, -30), decaler(jour, -1)];
    const m = (await lignes<Ligne>(env, compte, entite.metriques(p, `segments.date BETWEEN '${debut}' AND '${fin}'`)))
      .reduce<NonNullable<Ligne['metrics']>>((t, l) => ({
        ...l.metrics, ...t,
        impressions: String(Number(t.impressions ?? 0) + Number(l.metrics?.impressions ?? 0)),
        clicks: String(Number(t.clicks ?? 0) + Number(l.metrics?.clicks ?? 0)),
        costMicros: String(Number(t.costMicros ?? 0) + Number(l.metrics?.costMicros ?? 0)),
        conversions: Number(t.conversions ?? 0) + Number(l.metrics?.conversions ?? 0),
      }), {});

    const enPause = e.campagne.statut !== 'ENABLED' ? 'campagne' : e.groupe && e.groupe.statut !== 'ENABLED' ? 'groupe' : undefined;
    const effet = enPause === 'campagne'
      ? `La campagne est ${statut(e.campagne.statut)} : réactiver ne dépense rien tant qu'elle le reste.`
      : enPause === 'groupe'
        ? `Le groupe est ${statut(e.groupe?.statut)} : rien ne diffusera tant qu'il le reste.`
        : 'La campagne est active : l\'élément diffusera dès l\'exécution, et dépensera.';

    return texte(await ecrire(env, contexte, {
      outil: 'ads_reactiver',
      compte,
      jeton,
      preparation: {
        service: entite.service,
        operations: [{ updateMask: 'status', update: { resourceName: ressource, status: 'ENABLED' } }],
        description: [
          `ANNULER UNE PAUSE — ${e.nom} (${identifiant}) repasse en ENABLED (« Activé »). Ce n'est pas une activation : ` +
          'cela annule la pause que ce serveur a faite.',
          `- Mis en pause par ce serveur le ${dateFr(jour)} à ${heureDe(pause.createdAt)} — écriture n° ${pause.id} du journal.`,
          `- ${e.groupe ? `Groupe « ${e.groupe.nom} » : ${statut(e.groupe.statut)}. ` : ''}Campagne « ${e.campagne.nom} » : ${statut(e.campagne.statut)}. ${effet}`,
          `- Sur les 30 jours précédant la pause (du ${dateFr(debut)} au ${dateFr(fin)}) : ${Number(m.impressions ?? 0)} impressions, ` +
          `${Number(m.clicks ?? 0)} clics, ${euros(Number(m.costMicros ?? 0))}, ${Number(m.conversions ?? 0).toLocaleString('fr-FR')} conversions.`,
          ...(type === 'mot_cle' ? [qualite(e, m)] : []),
          '',
          RESTE,
        ].join('\n'),
        bilan: `Pause annulée : ${e.nom} est de nouveau ENABLED.`,
      },
    }));
  },
});

export const OUTILS_REACTIVER = [reactiver] as const;
