/**
 * Les outils exposés à Claude, et leur registre.
 *
 * LIRE : les deux outils du serveur officiel de Google (googleads/google-ads-mcp)
 * — son périmètre, pas son code : il passe par gRPC, qui ne tourne pas dans un
 * Worker. ÉCRIRE : outils-ecriture.ts, lot par lot (cadrage du 01/10/2026),
 * outils-creation.ts (02/10/2026), outils-listes.ts (03/10/2026),
 * outils-elements.ts (04/10/2026), outils-demand-gen.ts (07/10/2026).
 * LE CORPUS : outils-corpus.ts (03/10/2026) — lire main, écrire par commit.
 * TAG MANAGER : outils-gtm.ts (08/10/2026) — lire le conteneur du site, rien d'autre.
 *
 * Le vocabulaire évite « action » dans les noms, les champs et les schémas :
 * dans ce dépôt, le mot désigne une action IA du catalogue.
 */
import { z } from 'zod';
import { Refus } from './refus';
import {
  ErreurAds, comptesAutorises, connexionPour, estUnCompte, listerAccessibles, normaliserCompte, rechercher,
  type ReponseRecherche,
} from './google-ads';
import { LECTURE, outil, texte, type ResultatOutil } from './outil';
import { OUTILS_ECRITURE } from './outils-ecriture';
import { OUTILS_CREATION } from './outils-creation';
import { OUTILS_LISTES } from './outils-listes';
import { OUTILS_ELEMENTS } from './outils-elements';
import { OUTILS_DEMAND_GEN } from './outils-demand-gen';
import { OUTILS_GTM } from './outils-gtm';
import { OUTILS_CORPUS } from './outils-corpus';
import type { Contexte } from './ecriture';
import type { Env } from './env';

export const MAX_LIGNES = 200;
export const MAX_CARACTERES = 50_000;

/** Au-delà, `ads_lister_comptes` ferait une requête par compte sans borne. */
const MAX_COMPTES = 10;

// ── ads_lister_comptes ───────────────────────────────────────────────────

const REQUETE_COMPTE =
  'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager, customer.test_account FROM customer LIMIT 1';

type LigneCompte = {
  customer?: { descriptiveName?: string; currencyCode?: string; timeZone?: string; manager?: boolean; testAccount?: boolean };
};

const listerComptes = outil({
  name: 'ads_lister_comptes',
  title: 'Comptes Google Ads',
  description:
    "Liste les comptes Google Ads visibles par le compte Google de Luminose : identifiant, nom, devise, fuseau horaire, " +
    "et si ads_requete accepte de l'interroger (champ `autorise`). Lecture seule.\n\n" +
    "Inutile avant une requête sur le compte Luminose, qui est le compte par défaut d'ads_requete. " +
    "Utile pour connaître la devise, ou pour diagnostiquer un accès.",
  schema: z.object({}).strict(),
  annotations: LECTURE,
  async executer(_args, env) {
    const accessibles = await listerAccessibles(env);
    const autorises = comptesAutorises(env);

    // Les comptes autorisés sont toujours listés, même s'ils ne sont visibles
    // qu'à travers un compte administrateur : c'est eux qu'on veut voir.
    const ids = [...new Set([...autorises, ...accessibles])].slice(0, MAX_COMPTES);

    const comptes = await Promise.all(ids.map(async (id) => {
      const direct = accessibles.includes(id);
      const fiche = { id, autorise: autorises.includes(id), acces: direct ? 'direct' : 'via compte administrateur' };
      try {
        const reponse = await rechercher(env, id, REQUETE_COMPTE, direct ? undefined : connexionPour(env, id));
        const c = (reponse.results?.[0] as LigneCompte | undefined)?.customer ?? {};
        return {
          ...fiche,
          nom: c.descriptiveName ?? null,
          devise: c.currencyCode ?? null,
          fuseau: c.timeZone ?? null,
          administrateur: Boolean(c.manager),
          test: Boolean(c.testAccount),
        };
      } catch (e) {
        // Un compte fermé ou inaccessible ne doit pas masquer les autres.
        if (e instanceof ErreurAds) {
          const conseil = direct || connexionPour(env, id) ? '' :
            " Si l'accès passe par un compte administrateur, posez GOOGLE_ADS_LOGIN_CUSTOMER_ID.";
          return { ...fiche, erreur: e.message.split('\n')[0] + conseil };
        }
        throw e;
      }
    }));

    return texte(JSON.stringify({ compte_par_defaut: autorises[0] ?? null, comptes }, null, 2));
  },
});

// ── ads_requete ──────────────────────────────────────────────────────────

/** La requête doit commencer par SELECT — le point d'entrée ne modifie rien, mais l'intention se lit ici. */
export const estUneLecture = (requete: string): boolean => /^\s*select\s/i.test(requete);

/**
 * Coupe la réponse aux plafonds, et le dit en tête : un modèle qui croit avoir
 * tout lu tirera des conclusions sur des totaux faux.
 */
export const mettreEnForme = (compte: string, reponse: ReponseRecherche): string => {
  const recues = reponse.results ?? [];
  const gardees: string[] = [];
  let taille = 2;
  for (const ligne of recues.slice(0, MAX_LIGNES)) {
    const json = JSON.stringify(ligne);
    if (taille + json.length + 1 > MAX_CARACTERES) break;
    gardees.push(json);
    taille += json.length + 1;
  }

  const tronquee = gardees.length < recues.length || Boolean(reponse.nextPageToken);
  const entete = tronquee
    ? `RÉPONSE TRONQUÉE — ${gardees.length} ligne(s) affichée(s) sur ${recues.length} reçue(s)` +
      `${reponse.nextPageToken ? ", et l'API annonce d'autres pages" : ''}` +
      ` (plafonds : ${MAX_LIGNES} lignes, 50 000 caractères). Les totaux calculés sur ces lignes sont partiels. ` +
      'Affinez la requête : ORDER BY … LIMIT, WHERE plus étroit, moins de champs, ou agrégez FROM customer.'
    : `${gardees.length} ligne(s) — compte ${compte}.`;

  return `${entete}\n\n[${gardees.join(',')}]`;
};

const requeteGaql = outil({
  name: 'ads_requete',
  title: 'Requête GAQL (lecture seule)',
  description: [
    "Exécute une requête GAQL (Google Ads Query Language) en LECTURE sur le compte Google Ads de Luminose et renvoie les lignes en JSON. " +
    "Seules les requêtes SELECT sont acceptées : ce serveur ne peut rien modifier.",
    '',
    'À savoir :',
    '- Les montants sont en micros de la devise du compte : metrics.cost_micros / 1 000 000 = euros. metrics.cost_per_conversion aussi.',
    '- Les champs s\'écrivent en snake_case dans la requête (metrics.cost_micros) et reviennent en camelCase (costMicros).',
    "- Périodes : segments.date DURING LAST_7_DAYS | LAST_30_DAYS | THIS_MONTH | LAST_MONTH, ou segments.date BETWEEN '2026-09-01' AND '2026-09-30'.",
    `- La réponse est plafonnée à ${MAX_LIGNES} lignes et 50 000 caractères ; au-delà elle est tronquée et le dit. Préférer ORDER BY … LIMIT.`,
    "- Une erreur de l'API revient avec son code (par exemple queryError.UNRECOGNIZED_FIELD) : corriger la requête et réessayer.",
    '',
    'Exemples :',
    '',
    'Campagnes sur 30 jours :',
    "SELECT campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date DURING LAST_30_DAYS AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC",
    '',
    'Termes de recherche :',
    'SELECT search_term_view.search_term, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE segments.date DURING LAST_30_DAYS ORDER BY metrics.impressions DESC LIMIT 50',
    '',
    'Conversions par jour :',
    'SELECT segments.date, metrics.conversions, metrics.conversions_value, metrics.cost_micros FROM customer WHERE segments.date DURING LAST_30_DAYS ORDER BY segments.date',
    '',
    'Coût par conversion du mois dernier :',
    'SELECT metrics.cost_micros, metrics.conversions, metrics.cost_per_conversion FROM customer WHERE segments.date DURING LAST_MONTH',
  ].join('\n'),
  schema: z.object({
    requete: z.string().min(1).max(20_000)
      .describe('Requête GAQL commençant par SELECT.'),
    compte: z.string().optional()
      .describe('Identifiant du compte, dix chiffres (tirets permis). Par défaut : le compte Luminose.'),
  }).strict(),
  annotations: LECTURE,
  async executer({ requete, compte }, env) {
    if (!estUneLecture(requete)) {
      throw new Refus('Requête refusée : seules les lectures GAQL sont acceptées, et elles commencent par SELECT.');
    }

    const autorises = comptesAutorises(env);
    const brut = compte ?? env.GOOGLE_ADS_CUSTOMER_ID;
    if (!brut) {
      throw new Refus('Aucun compte par défaut : GOOGLE_ADS_CUSTOMER_ID n\'est pas posé sur le Worker MCP (voir workers/mcp/README.md).', 503);
    }
    const cible = normaliserCompte(brut);
    if (!estUnCompte(cible)) {
      throw new Refus(`« ${brut} » n'est pas un identifiant de compte Google Ads (dix chiffres, tirets permis).`);
    }
    if (!autorises.includes(cible)) {
      throw new Refus(`Le compte ${cible} est hors de la liste d'autorisation de ce serveur (${autorises.join(', ') || 'vide'}).`, 403);
    }

    const reponse = await rechercher(env, cible, requete.trim(), connexionPour(env, cible));
    return texte(mettreEnForme(cible, reponse));
  },
});

// ── Registre ─────────────────────────────────────────────────────────────

const OUTILS = [listerComptes, requeteGaql, ...OUTILS_ECRITURE, ...OUTILS_CREATION, ...OUTILS_LISTES, ...OUTILS_ELEMENTS, ...OUTILS_DEMAND_GEN, ...OUTILS_GTM, ...OUTILS_CORPUS] as const;

/**
 * Ce que `tools/list` publie. L'ordre est stable : le client peut le mettre en
 * cache. Les outils d'écriture y figurent même sans le scope `ads:ecrire` : ils
 * refusent alors à l'appel, en disant comment l'obtenir — un outil absent ne
 * s'explique pas.
 */
export const definitionsOutils = () => OUTILS.map(({ name, title, description, schema, annotations }) => {
  const { $schema: _dialecte, ...inputSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
  return { name, title, description, inputSchema, annotations };
});

export const trouverOutil = (nom: unknown) => OUTILS.find((o) => o.name === nom);

/**
 * Exécute un outil connu. Une entrée invalide, un refus ou une erreur de l'API
 * reviennent au modèle avec `isError` — ce sont des erreurs qu'il peut
 * corriger. Tout le reste remonte : c'est une panne.
 */
export const executerOutil = async (
  o: NonNullable<ReturnType<typeof trouverOutil>>,
  args: unknown,
  env: Env,
  contexte: Contexte,
): Promise<ResultatOutil> => {
  const analyse = o.schema.safeParse(args ?? {});
  if (!analyse.success) return texte(`Arguments invalides pour ${o.name} :\n${z.prettifyError(analyse.error)}`, true);
  try {
    return await o.executer(analyse.data as never, env, contexte);
  } catch (e) {
    if (e instanceof Refus) return texte(e.message, true);
    if (e instanceof ErreurAds) return texte(e.message, true);
    throw e;
  }
};
