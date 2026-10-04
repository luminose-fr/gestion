/**
 * Les listes de mots-clés à exclure — décision du 03/10/2026
 * (workers/mcp/decisions/2026-10-03-listes-de-negatifs.md).
 *
 * Une liste partagée exclut les mêmes recherches de toutes les campagnes qui
 * lui sont associées : une entrée à tenir au lieu d'une par campagne. Ces
 * outils la créent, la complètent, la retirent en partie, l'associent ou la
 * dissocient — et retirent des négatifs de campagne, pour pouvoir y migrer.
 * Ils ne suppriment jamais une liste entière : cela reste dans l'interface.
 *
 * Comme les autres outils d'écriture, chacun ne fait que PRÉPARER (ecriture.ts
 * pour l'aperçu, le jeton, le journal ; google-ads.ts pour la table fermée,
 * qui demande au compte, avant tout retrait, s'il lève bien une exclusion).
 * Ce que l'aperçu lit dans le compte et dont les opérations dépendent —
 * doublons écartés, critères résolus — voyage dans le jeton (`fige`) : une
 * exécution ne dépend pas de ce qu'un appel concurrent a changé entre-temps.
 * Ce qui est devenu sans objet depuis l'aperçu s'écarte, et se dit.
 *
 * Nombre de lectures borné par outil, indépendant du volume : six au plus,
 * plus celle de la table pour un retrait.
 */
import { z } from 'zod';
import { compteEcriture, ecrire, exigerEcriture, type Preparation, type Temps } from './ecriture';
import { LIMITES_LISTES, type Operation } from './google-ads';
import { bloque, cleMotCle, type MotCle } from './negatifs';
import { outil, texte } from './outil';
import { CORRESPONDANCES, DEUX_TEMPS, JETON, exigerSearch, lignes, normaliserMotsCles, premiereLigne } from './outils-ecriture';
import { MARQUE, marquer } from './regles';
import { Refus } from './refus';
import type { Env } from './env';

const ID = z.string().regex(/^\d{1,20}$/, 'identifiant numérique');

const MOTS_CLES = z.array(z.object({
  texte: z.string().min(1).max(80).describe('Le texte exclu, sans crochets ni guillemets.'),
  correspondance: z.enum(['EXACT', 'PHRASE', 'BROAD']),
}).strict()).min(1).max(50);

const AJOUT = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
/** Un retrait d'exclusion rouvre du trafic : le client peut demander une confirmation de plus. */
const RETRAIT = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };

const QUAND_UNE_LISTE =
  "Liste ou négatif de campagne ? Une liste partagée, pour une exclusion qui vaut pour PLUSIEURS campagnes (gratuit, emploi, " +
  'formation, médicament…) : une seule entrée à tenir, appliquée à toutes les campagnes associées — et toute modification les ' +
  "touche toutes. Pour une exclusion propre à une campagne (le thème d'une autre offre), ads_negatifs_ajouter. Lister les listes : " +
  "ads_requete, SELECT shared_set.id, shared_set.name, shared_set.member_count FROM shared_set WHERE shared_set.type = 'NEGATIVE_KEYWORDS' " +
  "AND shared_set.status = 'ENABLED'.";

const AVERTIR_RETRAIT = "Un retrait peut rouvrir du trafic, donc augmenter la dépense : l'aperçu liste exactement ce qui sera retiré.";

const STATUTS: Record<string, string> = { ENABLED: 'active', PAUSED: 'en pause' };

const pluriel = (n: number, mot: string, pl: string) => `${n} ${n > 1 ? pl : mot}`;
const motsCles = (n: number) => pluriel(n, 'mot-clé', 'mots-clés');
const affiche = (m: MotCle) => `${m.texte} [${CORRESPONDANCES[m.correspondance]}]`;
const MAX_LIGNES_APERCU = 30;
const borne = (lignesApercu: string[]) => lignesApercu.length <= MAX_LIGNES_APERCU
  ? lignesApercu
  : [...lignesApercu.slice(0, MAX_LIGNES_APERCU), `- … et ${lignesApercu.length - MAX_LIGNES_APERCU} autre(s).`];

// ── Lectures ─────────────────────────────────────────────────────────────

type Campagne = { id: string; nom: string; statut: string; canal: string };
type Entree = MotCle & { id: string };

const lireMotCle = (k: { text?: string; matchType?: string } | undefined): MotCle | null =>
  k?.text && k.matchType && k.matchType in CORRESPONDANCES
    ? { texte: k.text, correspondance: k.matchType as MotCle['correspondance'] }
    : null;

/** Une liste de mots-clés à exclure, vivante. */
const exigerListe = async (env: Env, compte: string, liste: string) => {
  const l = (await premiereLigne<{ sharedSet?: { name?: string; type?: string; status?: string } }>(env, compte,
    `SELECT shared_set.id, shared_set.name, shared_set.type, shared_set.status FROM shared_set WHERE shared_set.id = ${liste}`))?.sharedSet;
  if (!l || l.status === 'REMOVED') throw new Refus(`Liste ${liste} introuvable, ou supprimée.`);
  if (l.type !== 'NEGATIVE_KEYWORDS') throw new Refus(`« ${l.name} » n'est pas une liste de mots-clés à exclure (${l.type}).`);
  return { id: liste, nom: l.name ?? liste };
};

const entreesDe = async (env: Env, compte: string, liste: string): Promise<Entree[]> =>
  (await lignes<{ sharedCriterion?: { criterionId?: string; keyword?: { text?: string; matchType?: string } } }>(env, compte,
    'SELECT shared_criterion.criterion_id, shared_criterion.keyword.text, shared_criterion.keyword.match_type FROM shared_criterion ' +
    `WHERE shared_set.id = ${liste} AND shared_criterion.type = 'KEYWORD'`))
    .flatMap(({ sharedCriterion: c }) => {
      const m = lireMotCle(c?.keyword);
      return m && c?.criterionId ? [{ ...m, id: String(c.criterionId) }] : [];
    });

/** Les campagnes auxquelles la liste est associée — toutes, quel que soit leur type : la liste les touche toutes. */
const campagnesLiees = async (env: Env, compte: string, liste: string): Promise<Campagne[]> =>
  (await lignes<{ campaign?: { id?: string; name?: string; status?: string; advertisingChannelType?: string } }>(env, compte,
    'SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type FROM campaign_shared_set ' +
    `WHERE shared_set.id = ${liste} AND campaign_shared_set.status = 'ENABLED' AND campaign.status != 'REMOVED'`))
    // Les identifiants repartent dans d'autres requêtes : des chiffres, et rien d'autre.
    .flatMap(({ campaign: c }) => (c?.id && /^\d+$/.test(String(c.id))
      ? [{ id: String(c.id), nom: c.name ?? String(c.id), statut: c.status ?? '?', canal: c.advertisingChannelType ?? '?' }]
      : []));

/** Une campagne Search vivante — la seule qu'un outil d'écriture vise. */
const exigerCampagne = async (env: Env, compte: string, campagne: string): Promise<Campagne> => {
  const c = (await premiereLigne<{ campaign?: { name?: string; status?: string; advertisingChannelType?: string } }>(env, compte,
    `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type FROM campaign WHERE campaign.id = ${campagne}`))?.campaign;
  if (!c || c.status === 'REMOVED') throw new Refus(`Campagne ${campagne} introuvable, ou supprimée.`);
  exigerSearch(c.advertisingChannelType, `La campagne « ${c.name} »`);
  return { id: campagne, nom: c.name ?? campagne, statut: c.status ?? '?', canal: 'SEARCH' };
};

/** Les négatifs de campagne (mots-clés), pour un ensemble de campagnes, en une lecture. */
const negatifsDeCampagnes = async (env: Env, compte: string, campagnes: string[]): Promise<(Entree & { campagne: string })[]> =>
  campagnes.length === 0 ? [] : (await lignes<{ campaign?: { id?: string }; campaignCriterion?: { criterionId?: string; keyword?: { text?: string; matchType?: string } } }>(env, compte,
    'SELECT campaign.id, campaign_criterion.criterion_id, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion ' +
    `WHERE campaign.id IN (${campagnes.join(', ')}) AND campaign_criterion.type = 'KEYWORD' AND campaign_criterion.negative = TRUE ` +
    "AND campaign_criterion.status != 'REMOVED'"))
    .flatMap(({ campaign, campaignCriterion: c }) => {
      const m = lireMotCle(c?.keyword);
      return m && c?.criterionId && campaign?.id ? [{ ...m, id: String(c.criterionId), campagne: String(campaign.id) }] : [];
    });

type Positif = { texte: string; correspondance: string; statut: string; groupe: string; campagne: string };

/** Les mots-clés positifs actifs ou en pause de ces campagnes : ce qu'un négatif pourrait bloquer. */
const positifsDe = async (env: Env, compte: string, campagnes: string[]): Promise<Positif[]> =>
  campagnes.length === 0 ? [] : (await lignes<{
    campaign?: { name?: string }; adGroup?: { name?: string };
    adGroupCriterion?: { status?: string; keyword?: { text?: string; matchType?: string } };
  }>(env, compte,
    'SELECT campaign.name, ad_group.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status ' +
    `FROM ad_group_criterion WHERE campaign.id IN (${campagnes.join(', ')}) AND ad_group_criterion.type = 'KEYWORD' ` +
    "AND ad_group_criterion.negative = FALSE AND ad_group_criterion.status IN ('ENABLED', 'PAUSED') AND ad_group.status != 'REMOVED'"))
    .flatMap(({ campaign, adGroup, adGroupCriterion: k }) => (k?.keyword?.text
      ? [{
        texte: k.keyword.text, correspondance: k.keyword.matchType ?? '?', statut: k.status ?? '?',
        groupe: adGroup?.name ?? '?', campagne: campaign?.name ?? '?',
      }]
      : []));

// ── Ce que l'aperçu montre ───────────────────────────────────────────────

const ligneCampagne = (c: Campagne) => `- « ${c.nom} » (${c.id}) — ${STATUTS[c.statut] ?? c.statut}${c.canal === 'SEARCH' ? '' : `, ${c.canal}`}`;

const decrireLiees = (liees: Campagne[]): string[] => liees.length === 0
  ? ["Campagnes liées : aucune — la liste n'exclut rien tant qu'elle n'est associée à aucune campagne (ads_liste_associer)."]
  : [`Campagnes liées (${liees.length}) — toute modification de la liste les touche toutes :`, ...liees.map(ligneCampagne)];

/**
 * L'avertissement de blocage — jamais un refus : exclure ce qu'on enchérit
 * peut être voulu (un mot-clé en pause qu'on abandonne), mais doit se voir.
 */
const avertirBlocages = (negatifs: MotCle[], positifs: Positif[]): string[] => {
  const constats = negatifs.flatMap((n) => positifs.filter((p) => bloque(n, p.texte)).map((p) =>
    `- « ${affiche(n)} » bloquerait « ${p.texte} » [${CORRESPONDANCES[p.correspondance as MotCle['correspondance']] ?? p.correspondance}] — ` +
    `${p.statut === 'ENABLED' ? 'actif' : 'en pause'}, groupe « ${p.groupe} », campagne « ${p.campagne} »`));
  return constats.length === 0 ? [] : [
    '',
    `AVERTISSEMENT — ${pluriel(constats.length, 'mot-clé positif bloqué', 'mots-clés positifs bloqués')} : la recherche qui le déclenche ` +
    "serait exclue. Rien n'est refusé ; à relire avant de valider.",
    ...borne(constats),
  ];
};

/** Les rangs, dans la demande normalisée, que l'aperçu a écartés : ce que le jeton porte. */
type Ecartes = { e: number[] };
const ecartesDuJeton = (fige: unknown): Set<number> => new Set((fige as Ecartes | undefined)?.e ?? []);

/** Les critères que l'aperçu a résolus, alignés sur la demande normalisée ; `null` : absent. */
type Resolus = { r: (string | null)[] };

// ── ads_liste_negatifs_creer ─────────────────────────────────────────────

const listeCreer = outil({
  name: 'ads_liste_negatifs_creer',
  title: 'Créer une liste de mots-clés à exclure',
  description: [
    `Crée une liste partagée de mots-clés à exclure, nommée « ${MARQUE} … » par le serveur, avec, au choix, ses premiers mots-clés ` +
    '(50 au plus). Elle naît associée à aucune campagne : elle n’exclut rien avant ads_liste_associer.',
    '',
    DEUX_TEMPS,
    '',
    QUAND_UNE_LISTE,
    '',
    `Migrer les négatifs d'une campagne vers une liste : créer la liste avec ces mots-clés, l'associer (ads_liste_associer), ` +
    `puis retirer les négatifs de campagne (ads_negatifs_retirer), dont l'aperçu dit pour chacun s'il reste exclu par une liste. ` +
    `Google admet ${LIMITES_LISTES.parCompte} listes par compte et ${LIMITES_LISTES.entreesParListe.toLocaleString('fr-FR')} mots-clés par liste.`,
  ].join('\n'),
  schema: z.object({
    nom: z.string().min(1).max(100).describe(`Le nom de la liste ; le serveur y ajoute ${MARQUE}.`),
    mots_cles: MOTS_CLES.optional().describe('Les premiers mots-clés de la liste, 50 au plus.'),
    jeton: JETON,
  }).strict(),
  annotations: AJOUT,
  async executer({ nom, mots_cles, jeton }, env, contexte) {
    exigerEcriture(contexte);
    const compte = compteEcriture(env);
    const demandes = normaliserMotsCles(mots_cles ?? []);
    const nomMarque = marquer(nom);

    const existantes = await lignes<{ sharedSet?: { name?: string; type?: string } }>(env, compte,
      "SELECT shared_set.id, shared_set.name, shared_set.type FROM shared_set WHERE shared_set.status = 'ENABLED'");
    const listes = existantes.filter((l) => l.sharedSet?.type === 'NEGATIVE_KEYWORDS').length;
    if (listes >= LIMITES_LISTES.parCompte) {
      throw new Refus(`Le compte a déjà ${listes} listes de mots-clés à exclure : Google n'en admet que ${LIMITES_LISTES.parCompte}. ` +
        'Compléter une liste existante (ads_liste_negatifs_ajouter), ou en supprimer une dans l’interface.');
    }
    if (existantes.some((l) => l.sharedSet?.name === nomMarque)) {
      throw new Refus(`Une liste « ${nomMarque} » existe déjà : la compléter (ads_liste_negatifs_ajouter), ou choisir un autre nom.`);
    }

    const tmp = `customers/${compte}/sharedSets/-1`;
    return texte(await ecrire(env, contexte, {
      outil: 'ads_liste_negatifs_creer',
      compte,
      jeton,
      preparation: {
        service: 'googleAds',
        operations: [
          { sharedSetOperation: { create: { resourceName: tmp, name: nomMarque, type: 'NEGATIVE_KEYWORDS' } } },
          ...demandes.map((m) => ({ sharedCriterionOperation: { create: { sharedSet: tmp, keyword: { text: m.texte, matchType: m.correspondance } } } })),
        ],
        description: [
          `Liste de mots-clés à exclure « ${nomMarque} » — ${motsCles(demandes.length)}${demandes.length ? ' :' : '.'}`,
          ...demandes.map((m) => `- ${affiche(m)}`),
          '',
          "Associée à aucune campagne : elle n'exclura rien avant ads_liste_associer, dont l'aperçu dira ce qu'elle bloquerait.",
          `Listes de mots-clés à exclure du compte après création : ${listes + 1} sur ${LIMITES_LISTES.parCompte}.`,
        ].join('\n'),
        bilan: `Liste « ${nomMarque} » créée, ${motsCles(demandes.length)}. Son identifiant est le dernier nombre de sharedSets/… ci-dessous ; ` +
          'elle n’exclut rien avant ads_liste_associer.',
      },
    }));
  },
});

// ── ads_liste_negatifs_ajouter ───────────────────────────────────────────

const listeAjouter = outil({
  name: 'ads_liste_negatifs_ajouter',
  title: 'Ajouter des mots-clés à une liste à exclure',
  description: [
    "Ajoute des mots-clés à une liste partagée de mots-clés à exclure : les recherches qui y correspondent ne déclencheront plus " +
    "d'annonce dans AUCUNE des campagnes associées. Actifs dès l'exécution. 50 au plus par appel. Correspondance : EXACT (la " +
    'recherche exacte), PHRASE (la recherche contient l’expression), BROAD (la recherche contient tous les mots).',
    '',
    DEUX_TEMPS,
    '',
    QUAND_UNE_LISTE,
    '',
    "L'aperçu liste les campagnes associées et leur statut ; il signale et écarte les doublons (déjà dans la liste, ou déjà exclus " +
    'au niveau campagne sur toutes les campagnes liées) ; il avertit quand un mot-clé exclu bloquerait un mot-clé positif, actif ou ' +
    "en pause, d'une campagne liée — sans refuser. Google n'étend pas les négatifs aux variantes proches : « psy » n'exclut pas « psys ».",
  ].join('\n'),
  schema: z.object({
    liste: ID.describe('Identifiant de la liste (shared_set.id).'),
    mots_cles: MOTS_CLES,
    jeton: JETON,
  }).strict(),
  annotations: AJOUT,
  async executer({ liste, mots_cles, jeton }, env, contexte) {
    exigerEcriture(contexte);
    const compte = compteEcriture(env);
    const demandes = normaliserMotsCles(mots_cles);
    const l = await exigerListe(env, compte, liste);

    return texte(await ecrire(env, contexte, {
      outil: 'ads_liste_negatifs_ajouter',
      compte,
      jeton,
      preparation: async (temps: Temps): Promise<Preparation> => {
        const [entrees, liees] = await Promise.all([entreesDe(env, compte, liste), campagnesLiees(env, compte, liste)]);
        const negatifs = await negatifsDeCampagnes(env, compte, liees.map((c) => c.id));

        const dansListe = new Set(entrees.map(cleMotCle));
        const parCampagne = new Map<string, Set<string>>();
        for (const n of negatifs) parCampagne.set(n.campagne, (parCampagne.get(n.campagne) ?? new Set()).add(cleMotCle(n)));
        /** Un doublon s'écarte ; un négatif de campagne sur une partie seulement des campagnes liées se signale, et s'ajoute pour les autres. */
        const examen = (m: MotCle): { doublon?: string; note?: string } => {
          if (dansListe.has(cleMotCle(m))) return { doublon: 'déjà dans la liste' };
          const couvrent = liees.filter((c) => parCampagne.get(c.id)?.has(cleMotCle(m)));
          if (couvrent.length > 0 && couvrent.length === liees.length) {
            return { doublon: `déjà exclu au niveau campagne sur ${liees.length > 1 ? 'toutes les campagnes liées' : `« ${liees[0].nom} »`}` };
          }
          return couvrent.length ? { note: `déjà exclu au niveau campagne sur ${couvrent.map((c) => `« ${c.nom} »`).join(', ')} ; ajouté pour les autres` } : {};
        };

        const ecartes = temps.execution ? ecartesDuJeton(temps.fige) : new Set(demandes.flatMap((m, i) => (examen(m).doublon ? [i] : [])));
        const retenus = demandes.filter((_, i) => !ecartes.has(i));
        const operations: Operation[] = retenus.map((m) => ({ create: {
          sharedSet: `customers/${compte}/sharedSets/${liste}`,
          keyword: { text: m.texte, matchType: m.correspondance },
        } }));
        const doublons = demandes.filter((_, i) => ecartes.has(i));

        if (temps.execution) {
          // Un doublon apparu depuis l'aperçu — un appel concurrent sur la même liste — s'écarte au lieu de faire échouer le tout.
          const sansObjet = retenus.flatMap((m, rang) => {
            const { doublon } = examen(m);
            return doublon ? [{ rang, raison: `${affiche(m)} — ${doublon}` }] : [];
          });
          const n = retenus.length - sansObjet.length;
          return {
            service: 'sharedCriteria', operations, demande: demandes, sansObjet, description: '',
            bilan: `${pluriel(n, 'mot-clé ajouté', 'mots-clés ajoutés')} à la liste « ${l.nom} », pour ${pluriel(liees.length, 'campagne liée', 'campagnes liées')}.`,
          };
        }

        if (retenus.length === 0) {
          throw new Refus([`Rien à ajouter à la liste « ${l.nom} » : tous les mots-clés sont des doublons.`, ...doublons.map((m) => `- ${affiche(m)} — ${examen(m).doublon}`)].join('\n'));
        }
        if (entrees.length + retenus.length > LIMITES_LISTES.entreesParListe) {
          throw new Refus(`La liste « ${l.nom} » compte ${entrees.length} mots-clés : en ajouter ${retenus.length} dépasserait les ` +
            `${LIMITES_LISTES.entreesParListe.toLocaleString('fr-FR')} que Google admet par liste. Rien n'est parti.`);
        }
        const positifs = await positifsDe(env, compte, liees.map((c) => c.id));
        return {
          service: 'sharedCriteria',
          operations,
          demande: demandes,
          ...(doublons.length ? { fige: { e: [...ecartes].sort((a, b) => a - b) } satisfies Ecartes } : {}),
          description: [
            `Liste « ${l.nom} » (${liste}) — ${pluriel(retenus.length, 'mot-clé exclu', 'mots-clés exclus')} de plus, actifs dès l'exécution :`,
            ...retenus.map((m) => `- ${affiche(m)}${examen(m).note ? ` — ${examen(m).note}` : ''}`),
            '',
            ...decrireLiees(liees),
            ...(doublons.length
              ? ['', `DOUBLONS — signalés, et écartés à l'exécution (${doublons.length}) :`, ...doublons.map((m) => `- ${affiche(m)} — ${examen(m).doublon}`)]
              : []),
            '',
            `Taille de la liste après ajout : ${entrees.length + retenus.length} sur ${LIMITES_LISTES.entreesParListe.toLocaleString('fr-FR')}.`,
            ...avertirBlocages(retenus, positifs),
          ].join('\n'),
          bilan: '',
        };
      },
    }));
  },
});

// ── ads_liste_negatifs_retirer ───────────────────────────────────────────

const listeRetirer = outil({
  name: 'ads_liste_negatifs_retirer',
  title: "Retirer des mots-clés d'une liste à exclure",
  description: [
    "Retire des mots-clés d'une liste partagée de mots-clés à exclure, désignés par leur texte et leur correspondance : le serveur " +
    'retrouve lui-même les entrées. 50 au plus par appel. Les recherches correspondantes pourront de nouveau déclencher des annonces ' +
    'dans TOUTES les campagnes associées.',
    '',
    AVERTIR_RETRAIT,
    '',
    DEUX_TEMPS,
    '',
    "Un mot-clé absent de la liste est signalé et ignoré. La liste elle-même ne se supprime pas par ce serveur : dans l'interface.",
  ].join('\n'),
  schema: z.object({
    liste: ID.describe('Identifiant de la liste (shared_set.id).'),
    mots_cles: MOTS_CLES,
    jeton: JETON,
  }).strict(),
  annotations: RETRAIT,
  async executer({ liste, mots_cles, jeton }, env, contexte) {
    exigerEcriture(contexte);
    const compte = compteEcriture(env);
    const demandes = normaliserMotsCles(mots_cles);
    const l = await exigerListe(env, compte, liste);

    return texte(await ecrire(env, contexte, {
      outil: 'ads_liste_negatifs_retirer',
      compte,
      jeton,
      preparation: async (temps: Temps): Promise<Preparation> => {
        const entrees = await entreesDe(env, compte, liste);
        const parCle = new Map(entrees.map((e) => [cleMotCle(e), e.id]));
        const resolus = temps.execution
          ? (temps.fige as Resolus | undefined)?.r ?? []
          : demandes.map((m) => parCle.get(cleMotCle(m)) ?? null);
        const retires = demandes.flatMap((m, i) => (resolus[i] ? [{ ...m, id: resolus[i]! }] : []));
        const operations: Operation[] = retires.map((e) => ({ remove: `customers/${compte}/sharedCriteria/${liste}~${e.id}` }));

        if (temps.execution) {
          const presents = new Set(entrees.map((e) => e.id));
          const sansObjet = retires.flatMap((e, rang) => (presents.has(e.id) ? [] : [{ rang, raison: `${affiche(e)} — déjà retiré de la liste` }]));
          return {
            service: 'sharedCriteria', operations, demande: demandes, sansObjet, description: '',
            bilan: `${pluriel(retires.length - sansObjet.length, 'mot-clé retiré', 'mots-clés retirés')} de la liste « ${l.nom} ».`,
          };
        }

        const absents = demandes.filter((_, i) => !resolus[i]);
        if (retires.length === 0) {
          throw new Refus([`Aucun de ces mots-clés n'est dans la liste « ${l.nom} » : rien à retirer.`, ...absents.map((m) => `- ${affiche(m)}`)].join('\n'));
        }
        const liees = await campagnesLiees(env, compte, liste);
        return {
          service: 'sharedCriteria',
          operations,
          demande: demandes,
          fige: { r: resolus } satisfies Resolus,
          description: [
            `RETRAIT — ${AVERTIR_RETRAIT}`,
            '',
            `Liste « ${l.nom} » (${liste}) — ${pluriel(retires.length, 'mot-clé retiré', 'mots-clés retirés')} ; ces recherches ne seront plus exclues :`,
            ...retires.map((e) => `- ${affiche(e)}`),
            '',
            ...decrireLiees(liees),
            ...(absents.length ? ['', `Absents de la liste — ignorés (${absents.length}) :`, ...absents.map((m) => `- ${affiche(m)}`)] : []),
          ].join('\n'),
          bilan: '',
        };
      },
    }));
  },
});

// ── ads_liste_associer ───────────────────────────────────────────────────

const listeAssocier = outil({
  name: 'ads_liste_associer',
  title: 'Associer une liste à exclure à une campagne',
  description: [
    "Associe une liste partagée de mots-clés à exclure à une campagne Search : la campagne exclut aussitôt tous les mots-clés de la " +
    "liste. N'active rien.",
    '',
    DEUX_TEMPS,
    '',
    "L'aperçu liste les campagnes déjà associées ; il signale les entrées de la liste que la campagne exclut déjà au niveau campagne " +
    '(pour terminer une migration : ads_negatifs_retirer ensuite), et avertit quand une entrée bloquerait un mot-clé positif, actif ' +
    'ou en pause, de la campagne — sans refuser.',
  ].join('\n'),
  schema: z.object({
    liste: ID.describe('Identifiant de la liste (shared_set.id).'),
    campagne: ID.describe('Identifiant de la campagne (campaign.id).'),
    jeton: JETON,
  }).strict(),
  annotations: AJOUT,
  async executer({ liste, campagne, jeton }, env, contexte) {
    exigerEcriture(contexte);
    const compte = compteEcriture(env);
    const [l, c] = await Promise.all([exigerListe(env, compte, liste), exigerCampagne(env, compte, campagne)]);
    const liees = await campagnesLiees(env, compte, liste);
    if (liees.some((x) => x.id === campagne)) throw new Refus(`La liste « ${l.nom} » est déjà associée à la campagne « ${c.nom} » : rien à faire.`);

    const [entrees, negatifs, positifs] = jeton
      ? [[], [], []]
      : await Promise.all([entreesDe(env, compte, liste), negatifsDeCampagnes(env, compte, [campagne]), positifsDe(env, compte, [campagne])]);
    const auNiveauCampagne = new Set(negatifs.map(cleMotCle));
    const redondants = entrees.filter((e) => auNiveauCampagne.has(cleMotCle(e)));

    return texte(await ecrire(env, contexte, {
      outil: 'ads_liste_associer',
      compte,
      jeton,
      preparation: {
        service: 'campaignSharedSets',
        operations: [{ create: { campaign: `customers/${compte}/campaigns/${campagne}`, sharedSet: `customers/${compte}/sharedSets/${liste}` } }],
        description: [
          `Associer la liste « ${l.nom} » (${liste}, ${motsCles(entrees.length)}) à la campagne « ${c.nom} » (${campagne}, ` +
          `${STATUTS[c.statut] ?? c.statut}) : la campagne exclura ces mots-clés dès l'exécution. Rien ne s'active.`,
          '',
          ...decrireLiees(liees),
          ...(redondants.length
            ? ['', `DOUBLONS — ${pluriel(redondants.length, 'entrée déjà exclue', 'entrées déjà exclues')} au niveau campagne sur « ${c.nom} » ` +
              '(sans effet de plus ; pour finir de migrer vers la liste : ads_negatifs_retirer, après l’association) :',
              ...borne(redondants.map((e) => `- ${affiche(e)}`))]
            : []),
          ...avertirBlocages(entrees, positifs),
        ].join('\n'),
        bilan: `Liste « ${l.nom} » associée à la campagne « ${c.nom} ».`,
      },
    }));
  },
});

// ── ads_liste_dissocier ──────────────────────────────────────────────────

const listeDissocier = outil({
  name: 'ads_liste_dissocier',
  title: "Dissocier une liste à exclure d'une campagne",
  description: [
    "Dissocie une liste partagée de mots-clés à exclure d'une campagne Search : la campagne cesse d'exclure les mots-clés de la " +
    'liste. La liste et ses autres associations restent.',
    '',
    AVERTIR_RETRAIT,
    '',
    DEUX_TEMPS,
  ].join('\n'),
  schema: z.object({
    liste: ID.describe('Identifiant de la liste (shared_set.id).'),
    campagne: ID.describe('Identifiant de la campagne (campaign.id).'),
    jeton: JETON,
  }).strict(),
  annotations: RETRAIT,
  async executer({ liste, campagne, jeton }, env, contexte) {
    exigerEcriture(contexte);
    const compte = compteEcriture(env);
    const [l, c] = await Promise.all([exigerListe(env, compte, liste), exigerCampagne(env, compte, campagne)]);
    const liees = await campagnesLiees(env, compte, liste);
    if (!liees.some((x) => x.id === campagne)) throw new Refus(`La liste « ${l.nom} » n'est pas associée à la campagne « ${c.nom} » : rien à faire.`);
    const entrees = jeton ? [] : await entreesDe(env, compte, liste);
    const restantes = liees.filter((x) => x.id !== campagne);

    return texte(await ecrire(env, contexte, {
      outil: 'ads_liste_dissocier',
      compte,
      jeton,
      preparation: {
        service: 'campaignSharedSets',
        operations: [{ remove: `customers/${compte}/campaignSharedSets/${campagne}~${liste}` }],
        description: [
          `RETRAIT — ${AVERTIR_RETRAIT}`,
          '',
          `Dissocier la liste « ${l.nom} » (${liste}) de la campagne « ${c.nom} » (${campagne}, ${STATUTS[c.statut] ?? c.statut}). ` +
          `La campagne n'exclura plus ces ${motsCles(entrees.length)}${entrees.length ? ' :' : '.'}`,
          ...borne(entrees.map((e) => `- ${affiche(e)}`)),
          '',
          ...(restantes.length
            ? [`Restent associées (${restantes.length}) :`, ...restantes.map(ligneCampagne)]
            : ['La liste ne sera plus associée à aucune campagne.']),
        ].join('\n'),
        bilan: `Liste « ${l.nom} » dissociée de la campagne « ${c.nom} ».`,
      },
    }));
  },
});

// ── ads_negatifs_retirer ─────────────────────────────────────────────────

/** Les listes de négatifs associées à une campagne, et leurs entrées : ce qui exclura encore après un retrait. */
const exclusParListes = async (env: Env, compte: string, campagne: string): Promise<Map<string, string[]>> => {
  const listes = await lignes<{ sharedSet?: { id?: string; name?: string } }>(env, compte,
    `SELECT shared_set.id, shared_set.name FROM campaign_shared_set WHERE campaign.id = ${campagne} ` +
    "AND campaign_shared_set.status = 'ENABLED' AND shared_set.type = 'NEGATIVE_KEYWORDS' AND shared_set.status = 'ENABLED'");
  const ids = listes.map((x) => String(x.sharedSet?.id ?? '')).filter((id) => /^\d+$/.test(id));
  const parCle = new Map<string, string[]>();
  if (ids.length === 0) return parCle;
  const noms = new Map(listes.map((x) => [String(x.sharedSet?.id), x.sharedSet?.name ?? '?']));
  for (const { sharedSet, sharedCriterion } of await lignes<{ sharedSet?: { id?: string }; sharedCriterion?: { keyword?: { text?: string; matchType?: string } } }>(env, compte,
    `SELECT shared_set.id, shared_criterion.keyword.text, shared_criterion.keyword.match_type FROM shared_criterion WHERE shared_set.id IN (${ids.join(', ')}) ` +
    "AND shared_criterion.type = 'KEYWORD'")) {
    const m = lireMotCle(sharedCriterion?.keyword);
    if (m) parCle.set(cleMotCle(m), [...(parCle.get(cleMotCle(m)) ?? []), noms.get(String(sharedSet?.id)) ?? '?']);
  }
  return parCle;
};

const negatifsRetirer = outil({
  name: 'ads_negatifs_retirer',
  title: 'Retirer des mots-clés négatifs de campagne',
  description: [
    "Retire des mots-clés NÉGATIFS d'une campagne Search, désignés par leur texte et leur correspondance : le serveur retrouve " +
    'lui-même les critères. 50 au plus par appel. Seuls des négatifs de mots-clés se retirent : ni ciblage, ni mot-clé positif.',
    '',
    AVERTIR_RETRAIT,
    '',
    DEUX_TEMPS,
    '',
    "Sert surtout à migrer des négatifs de campagne vers une liste partagée : la liste d'abord (ads_liste_negatifs_creer ou " +
    "ads_liste_negatifs_ajouter, puis ads_liste_associer), le retrait ensuite. L'aperçu dit, pour chaque négatif retiré, s'il reste " +
    'exclu par une liste associée à la campagne, ou si ce trafic se rouvre.',
  ].join('\n'),
  schema: z.object({
    campagne: ID.describe('Identifiant de la campagne (campaign.id).'),
    mots_cles: MOTS_CLES,
    jeton: JETON,
  }).strict(),
  annotations: RETRAIT,
  async executer({ campagne, mots_cles, jeton }, env, contexte) {
    exigerEcriture(contexte);
    const compte = compteEcriture(env);
    const demandes = normaliserMotsCles(mots_cles);
    const c = await exigerCampagne(env, compte, campagne);

    return texte(await ecrire(env, contexte, {
      outil: 'ads_negatifs_retirer',
      compte,
      jeton,
      preparation: async (temps: Temps): Promise<Preparation> => {
        const negatifs = await negatifsDeCampagnes(env, compte, [campagne]);
        const parCle = new Map(negatifs.map((n) => [cleMotCle(n), n.id]));
        const resolus = temps.execution
          ? (temps.fige as Resolus | undefined)?.r ?? []
          : demandes.map((m) => parCle.get(cleMotCle(m)) ?? null);
        const retires = demandes.flatMap((m, i) => (resolus[i] ? [{ ...m, id: resolus[i]! }] : []));
        const operations: Operation[] = retires.map((n) => ({ remove: `customers/${compte}/campaignCriteria/${campagne}~${n.id}` }));

        if (temps.execution) {
          const presents = new Set(negatifs.map((n) => n.id));
          const sansObjet = retires.flatMap((n, rang) => (presents.has(n.id) ? [] : [{ rang, raison: `${affiche(n)} — déjà retiré de la campagne` }]));
          return {
            service: 'campaignCriteria', operations, demande: demandes, sansObjet, description: '',
            bilan: `${pluriel(retires.length - sansObjet.length, 'négatif retiré', 'négatifs retirés')} de la campagne « ${c.nom} ».`,
          };
        }

        const absents = demandes.filter((_, i) => !resolus[i]);
        if (retires.length === 0) {
          throw new Refus([`Aucun de ces mots-clés n'est un négatif de la campagne « ${c.nom} » : rien à retirer.`, ...absents.map((m) => `- ${affiche(m)}`)].join('\n'));
        }
        const listes = await exclusParListes(env, compte, campagne);
        const rouverts = retires.filter((n) => !listes.has(cleMotCle(n))).length;
        return {
          service: 'campaignCriteria',
          operations,
          demande: demandes,
          fige: { r: resolus } satisfies Resolus,
          description: [
            `RETRAIT — ${AVERTIR_RETRAIT}`,
            '',
            `Campagne « ${c.nom} » (${campagne}) — ${pluriel(retires.length, 'négatif retiré', 'négatifs retirés')} :`,
            ...retires.map((n) => {
              const par = listes.get(cleMotCle(n));
              return `- ${affiche(n)} — ${par ? `reste exclu par la liste ${par.map((x) => `« ${x} »`).join(', ')}` : "n'est plus exclu : ce trafic se rouvre"}`;
            }),
            ...(rouverts ? ['', `${pluriel(rouverts, 'recherche', 'recherches')} de nouveau ouverte${rouverts > 1 ? 's' : ''} aux annonces de la campagne.`] : []),
            ...(absents.length ? ['', `Absents des négatifs de la campagne — ignorés (${absents.length}) :`, ...absents.map((m) => `- ${affiche(m)}`)] : []),
          ].join('\n'),
          bilan: '',
        };
      },
    }));
  },
});

export const OUTILS_LISTES = [listeCreer, listeAjouter, listeRetirer, listeAssocier, listeDissocier, negatifsRetirer] as const;
