/**
 * Les outils d'écriture — lot 1 du cadrage du 01/10/2026 : ce qui RÉDUIT la
 * dépense. Exclure des recherches, mettre en pause.
 *
 * Chaque outil ne fait que PRÉPARER : vérifier l'entrée et l'entité visée
 * (lecture GAQL), puis construire les opérations exactes. Le reste — scope,
 * aperçu, jeton, plafond, journal, appel — est ecriture.ts, commun à tous, et la
 * forme permise de chaque opération est la table fermée de google-ads.ts.
 *
 * Le Search seulement : Performance Max est hors périmètre (cadrage §2).
 */
import { z } from 'zod';
import { compteEcriture, ecrire, exigerEcriture } from './ecriture';
import { connexionPour, rechercher, type Operation, type ServiceEcriture } from './google-ads';
import { outil, texte } from './outil';
import { Refus } from './refus';
import type { Env } from './env';

export const JETON = z.string().optional()
  .describe("Le jeton rendu par l'aperçu. Absent : aperçu seulement, rien n'est modifié.");

export const DEUX_TEMPS =
  'Deux temps, toujours. 1) Appeler SANS jeton : Google vérifie sans rien appliquer, et l’outil rend un aperçu et un jeton. ' +
  "2) Montrer l'aperçu à Florent ; s'il valide, rappeler avec les MÊMES arguments et le jeton. Un jeton vaut dix minutes, " +
  'une fois, et seulement pour le contenu de son aperçu.';

export const CORRESPONDANCES = { EXACT: 'exact', PHRASE: 'expression exacte', BROAD: 'requête large' } as const;
export type Correspondance = keyof typeof CORRESPONDANCES;

export const lignes = async <T>(env: Env, compte: string, requete: string): Promise<T[]> =>
  ((await rechercher(env, compte, requete, connexionPour(env, compte))).results ?? []) as T[];

export const premiereLigne = async <T>(env: Env, compte: string, requete: string): Promise<T | undefined> =>
  (await lignes<T>(env, compte, requete))[0];

/** Ni campagne supprimée, ni autre chose que du Search. */
export const exigerSearch = (canal: string | undefined, quoi: string) => {
  if (canal !== 'SEARCH') {
    throw new Refus(`${quoi} n'est pas une campagne Search (${canal ?? 'type inconnu'}) : ce serveur n'écrit que dans le Search.`);
  }
};

// ── ads_negatifs_ajouter ─────────────────────────────────────────────────

/**
 * Google : 80 caractères et dix mots au plus. Les crochets et guillemets de la
 * syntaxe de l'interface n'ont rien à faire dans le texte — la correspondance
 * se choisit à côté.
 */
export const normaliserMotCle = (brut: string): string => {
  const texteNormal = brut.trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr');
  if (/[[\]"+]/.test(texteNormal)) {
    throw new Refus(`« ${brut} » : sans crochets, guillemets ni « + » — la correspondance se choisit dans le champ correspondance.`);
  }
  if (texteNormal.split(' ').length > 10) throw new Refus(`« ${brut} » : dix mots au plus.`);
  return texteNormal;
};

/**
 * Normalisés, dédoublonnés, triés : le même ensemble donne la même empreinte,
 * quel que soit l'ordre dans lequel le modèle le renvoie.
 */
export const normaliserMotsCles = (mots: { texte: string; correspondance: Correspondance }[]) => {
  const uniques = new Map<string, { texte: string; correspondance: Correspondance }>();
  for (const m of mots) {
    const t = normaliserMotCle(m.texte);
    uniques.set(`${t}\u0000${m.correspondance}`, { texte: t, correspondance: m.correspondance });
  }
  return [...uniques.values()].sort((a, b) => a.texte.localeCompare(b.texte, 'fr') || a.correspondance.localeCompare(b.correspondance));
};

type LigneCampagne = { campaign?: { id?: string; name?: string; status?: string; advertisingChannelType?: string } };

const negatifsAjouter = outil({
  name: 'ads_negatifs_ajouter',
  title: 'Exclure des recherches (mots-clés négatifs)',
  description: [
    "Ajoute des mots-clés NÉGATIFS à une campagne Search : les recherches qui y correspondent ne déclencheront plus d'annonce. " +
    "Réduit la dépense, n'en crée jamais. Les négatifs sont actifs dès l'exécution.",
    '',
    DEUX_TEMPS,
    '',
    "Usage type : lire les termes de recherche (ads_requete, FROM search_term_view), puis exclure ceux qui ne correspondent pas à l'offre. " +
    'Correspondance : EXACT (la recherche exacte), PHRASE (la recherche contient l’expression), BROAD (la recherche contient tous les mots). ' +
    '50 mots-clés au plus par appel.',
    '',
    "Négatif de campagne ou liste ? Le négatif de campagne, pour une exclusion propre à CETTE campagne (le thème d'une autre offre, " +
    "par exemple). Une exclusion qui vaut pour plusieurs campagnes (gratuit, emploi, formation, médicament…) va dans une liste de " +
    'négatifs partagée : ads_liste_negatifs_ajouter (ou ads_liste_negatifs_creer), une seule entrée à tenir pour toutes les campagnes associées. ' +
    'Lister les listes existantes : ads_requete, SELECT shared_set.id, shared_set.name, shared_set.member_count FROM shared_set ' +
    "WHERE shared_set.type = 'NEGATIVE_KEYWORDS' AND shared_set.status = 'ENABLED'.",
  ].join('\n'),
  schema: z.object({
    campagne: z.string().regex(/^\d{1,20}$/, 'identifiant numérique de campagne (campaign.id)')
      .describe('Identifiant de la campagne (campaign.id).'),
    mots_cles: z.array(z.object({
      texte: z.string().min(1).max(80).describe('Le texte exclu, sans crochets ni guillemets.'),
      correspondance: z.enum(['EXACT', 'PHRASE', 'BROAD']),
    }).strict()).min(1).max(50),
    jeton: JETON,
  }).strict(),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  async executer({ campagne, mots_cles, jeton }, env, contexte) {
    exigerEcriture(contexte);
    const compte = compteEcriture(env);

    const liste = normaliserMotsCles(mots_cles);

    const ligne = await premiereLigne<LigneCampagne>(env, compte,
      `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type FROM campaign WHERE campaign.id = ${campagne}`);
    const c = ligne?.campaign;
    if (!c || c.status === 'REMOVED') throw new Refus(`Campagne ${campagne} introuvable, ou supprimée.`);
    exigerSearch(c.advertisingChannelType, `La campagne « ${c.name} »`);

    const operations: Operation[] = liste.map((m) => ({
      create: {
        campaign: `customers/${compte}/campaigns/${campagne}`,
        negative: true,
        keyword: { text: m.texte, matchType: m.correspondance },
      },
    }));
    const n = liste.length;
    const pluriel = n > 1 ? 's' : '';

    return texte(await ecrire(env, contexte, {
      outil: 'ads_negatifs_ajouter',
      compte,
      jeton,
      preparation: {
        service: 'campaignCriteria',
        operations,
        description: [
          `Campagne « ${c.name} » (${campagne}) — ${n} mot${pluriel}-clé${pluriel} négatif${pluriel}, actif${pluriel} dès l'exécution :`,
          ...liste.map((m) => `- ${m.texte} [${CORRESPONDANCES[m.correspondance]}]`),
        ].join('\n'),
        bilan: `${n} mot${pluriel}-clé${pluriel} négatif${pluriel} ajouté${pluriel} à la campagne « ${c.name} ».`,
      },
    }));
  },
});

// ── ads_mettre_en_pause ──────────────────────────────────────────────────

type Statut = { statut?: string; canal?: string; negatif?: boolean; nom: string };

type Ligne = {
  campaign?: { name?: string; status?: string; advertisingChannelType?: string };
  adGroup?: { name?: string; status?: string };
  adGroupAd?: { status?: string };
  adGroupCriterion?: { status?: string; negative?: boolean; keyword?: { text?: string; matchType?: string } };
};

/**
 * Ce qu'on peut mettre en pause, et comment le lire avant. Les identifiants
 * composés (`groupe~annonce`, `groupe~critère`) sont ceux des noms de
 * ressource de Google ; leur forme est vérifiée avant d'entrer dans une requête.
 */
const ENTITES: Record<string, { service: ServiceEcriture; forme: RegExp; exemple: string; requete: (p: string[]) => string; lire: (l: Ligne) => Statut }> = {
  campagne: {
    service: 'campaigns',
    forme: /^\d{1,20}$/,
    exemple: 'campaign.id',
    requete: ([id]) => `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type FROM campaign WHERE campaign.id = ${id}`,
    lire: (l) => ({ statut: l.campaign?.status, canal: l.campaign?.advertisingChannelType, nom: `la campagne « ${l.campaign?.name} »` }),
  },
  groupe: {
    service: 'adGroups',
    forme: /^\d{1,20}$/,
    exemple: 'ad_group.id',
    requete: ([id]) => `SELECT ad_group.id, ad_group.name, ad_group.status, campaign.name, campaign.advertising_channel_type FROM ad_group WHERE ad_group.id = ${id}`,
    lire: (l) => ({ statut: l.adGroup?.status, canal: l.campaign?.advertisingChannelType, nom: `le groupe « ${l.adGroup?.name} » (campagne « ${l.campaign?.name} »)` }),
  },
  annonce: {
    service: 'adGroupAds',
    forme: /^\d{1,20}~\d{1,20}$/,
    exemple: 'ad_group.id~ad_group_ad.ad.id',
    requete: ([groupe, annonce]) =>
      'SELECT ad_group.id, ad_group_ad.ad.id, ad_group_ad.status, ad_group.name, campaign.name, campaign.advertising_channel_type FROM ad_group_ad ' +
      `WHERE ad_group.id = ${groupe} AND ad_group_ad.ad.id = ${annonce}`,
    lire: (l) => ({ statut: l.adGroupAd?.status, canal: l.campaign?.advertisingChannelType, nom: `une annonce du groupe « ${l.adGroup?.name} » (campagne « ${l.campaign?.name} »)` }),
  },
  mot_cle: {
    service: 'adGroupCriteria',
    forme: /^\d{1,20}~\d{1,20}$/,
    exemple: 'ad_group.id~ad_group_criterion.criterion_id',
    requete: ([groupe, critere]) =>
      'SELECT ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.type, ad_group_criterion.status, ad_group_criterion.negative, ' +
      'ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group.name, campaign.name, campaign.advertising_channel_type FROM ad_group_criterion ' +
      `WHERE ad_group.id = ${groupe} AND ad_group_criterion.criterion_id = ${critere} AND ad_group_criterion.type = 'KEYWORD'`,
    lire: (l) => ({
      statut: l.adGroupCriterion?.status,
      canal: l.campaign?.advertisingChannelType,
      negatif: l.adGroupCriterion?.negative,
      nom: `le mot-clé « ${l.adGroupCriterion?.keyword?.text} » [${CORRESPONDANCES[l.adGroupCriterion?.keyword?.matchType as Correspondance] ?? l.adGroupCriterion?.keyword?.matchType}] ` +
        `du groupe « ${l.adGroup?.name} »`,
    }),
  },
};

const mettreEnPause = outil({
  name: 'ads_mettre_en_pause',
  title: 'Mettre en pause',
  description: [
    "Met en pause une campagne, un groupe d'annonces, une annonce ou un mot-clé du Search. Ce qui est en pause ne dépense plus. " +
    "Ce serveur ne réactive jamais rien : la réactivation se fait dans l'interface Google Ads, par Florent.",
    '',
    DEUX_TEMPS,
    '',
    'Identifiants : campagne = campaign.id ; groupe = ad_group.id ; annonce = "ad_group.id~ad_group_ad.ad.id" ; ' +
    'mot_cle = "ad_group.id~ad_group_criterion.criterion_id" (à lire avec ads_requete). ' +
    "Un mot-clé négatif ne se met pas en pause : ce serait rouvrir du trafic.",
  ].join('\n'),
  schema: z.object({
    type: z.enum(['campagne', 'groupe', 'annonce', 'mot_cle']),
    identifiant: z.string().max(45).describe('Voir la description de l’outil pour la forme selon le type.'),
    jeton: JETON,
  }).strict(),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async executer({ type, identifiant, jeton }, env, contexte) {
    exigerEcriture(contexte);
    const compte = compteEcriture(env);

    const entite = ENTITES[type];
    if (!entite.forme.test(identifiant)) {
      throw new Refus(`Identifiant « ${identifiant} » invalide pour ${type} : attendu ${entite.exemple}, en chiffres.`);
    }
    const ligne = await premiereLigne<Ligne>(env, compte, entite.requete(identifiant.split('~')));
    if (!ligne) throw new Refus(`${type} ${identifiant} introuvable dans le compte.`);
    const e = entite.lire(ligne);
    exigerSearch(e.canal, `La campagne de ${e.nom}`);
    // Mettre en pause une exclusion la lèverait : du trafic, donc de la dépense, en plus.
    if (e.negatif) throw new Refus(`${e.nom} est un mot-clé négatif : le mettre en pause rouvrirait du trafic. Refusé.`);
    if (e.statut === 'REMOVED') throw new Refus(`${e.nom} est supprimé.`);
    if (e.statut === 'PAUSED') throw new Refus(`${e.nom} est déjà en pause : rien à faire.`);

    return texte(await ecrire(env, contexte, {
      outil: 'ads_mettre_en_pause',
      compte,
      jeton,
      preparation: {
        service: entite.service,
        operations: [{ updateMask: 'status', update: { resourceName: `customers/${compte}/${entite.service}/${identifiant}`, status: 'PAUSED' } }],
        description: `Mettre en pause ${e.nom} (${identifiant}), aujourd'hui ${e.statut ?? 'statut inconnu'}. ` +
          "Ce qui est en pause ne dépense plus ; la réactivation se fera dans l'interface Google Ads.",
        bilan: `En pause : ${e.nom}.`,
      },
    }));
  },
});

export const OUTILS_ECRITURE = [negatifsAjouter, mettreEnPause] as const;
