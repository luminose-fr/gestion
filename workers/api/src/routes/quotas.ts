/**
 * Ce que l'application consomme chez Cloudflare, face aux plafonds du plan
 * gratuit.
 *
 * L'écran existe pour une question posée le 01/09/2026, avant plusieurs
 * semaines de génération : « est-ce que je vais sortir du gratuit ? ». La
 * réponse tenait dans deux onglets du tableau de bord Cloudflare, ce qui
 * revient à ne jamais la regarder.
 *
 * Ce que cette route N'EST PAS : une facture. Elle ne dit rien de ce que
 * coûtent les modèles — ça, c'est `mesures_ia`, et c'est de loin le poste le
 * plus cher. Un article rédigé coûte quelques dizaines de centimes d'OpenRouter
 * pendant qu'il consomme trois millièmes d'un plafond Cloudflare.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { Refus } from '../refus';
import type { QuotaPoste } from '@luminose/shared';

export const quotas = new Hono<{ Bindings: Env }>();

const GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql';

/** Le Worker et la base, tels que `wrangler.toml` les nomme. */
const SCRIPT = 'gestion-luminose-worker';
const BASE_D1 = 'e9327701-3b46-4f85-9e3f-513df1488118';

/**
 * Les plafonds du plan gratuit, RELEVÉS À LA MAIN dans la documentation
 * Cloudflare le 01/09/2026.
 *
 * Ils sont écrits en dur parce qu'aucune API ne les expose. La date part donc
 * avec eux jusqu'à l'écran, et s'y affiche : un seuil sans date est un chiffre
 * qui vieillit sans prévenir, et un tableau de bord qui ment sur un plafond est
 * pire qu'un tableau de bord absent.
 *
 * Le stockage est annoncé « 5 GB » sans que la base soit précisée ; on retient
 * la lecture décimale, qui est la moins favorable des deux et donc la seule
 * qu'on puisse afficher sans risque de rassurer à tort.
 */
const RELEVE_LE = '2026-09-01';
const PLAFONDS = {
  workersRequetes: 100_000,
  d1LignesLues: 5_000_000,
  d1LignesEcrites: 100_000,
  d1Stockage: 5_000_000_000,
};

/** Le début du jour UTC : c'est à 00:00 UTC que les compteurs gratuits repartent. */
const debutDuJourUtc = (maintenant: Date) =>
  new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate()));

const somme = (groupes: any[], chemin: (g: any) => unknown): number | null => {
  const valeurs = groupes
    .map(chemin)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  // Aucun groupe exploitable : Cloudflare n'a rien dit, et « rien dit » ne se
  // rend pas en zéro sur un écran de quotas.
  return valeurs.length ? valeurs.reduce((a, b) => a + b, 0) : null;
};

const maximum = (groupes: any[], chemin: (g: any) => unknown): number | null => {
  const valeurs = groupes
    .map(chemin)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return valeurs.length ? Math.max(...valeurs) : null;
};

/**
 * DEUX requêtes, et pas une — ce que le 01/09/2026 a appris.
 *
 * La taille de la base ne vit pas dans le dataset des requêtes : elle a le
 * sien, `d1StorageAdaptiveGroups`. Réunies dans un seul appel, une erreur sur
 * l'un des deux — un champ qui change de nom, un dataset non ouvert au compte —
 * fait échouer TOUTE la requête : `unknown field "max"` a suffi à vider les
 * quatre postes d'un coup. Séparées, un poste tombe seul, et il dit pourquoi.
 *
 * Les valeurs sont interpolées plutôt que passées en variables GraphQL : les
 * datasets ne déclarent pas leurs scalaires sous les mêmes noms (`string` ici,
 * `Date` là), et une variable mal typée fait échouer la requête entière avec un
 * message qui ne désigne rien. Rien de ce qui est interpolé ne vient de
 * l'appelant — le compte sort de l'environnement, le script et la base sont des
 * constantes.
 */
const REQUETE_CONSOMMATION = (compte: string, debutIso: string, finIso: string, jour: string) => `
  query {
    viewer {
      accounts(filter: { accountTag: ${JSON.stringify(compte)} }) {
        workersInvocationsAdaptive(
          limit: 1000,
          filter: {
            scriptName: ${JSON.stringify(SCRIPT)},
            datetime_geq: ${JSON.stringify(debutIso)},
            datetime_leq: ${JSON.stringify(finIso)}
          }
        ) { sum { requests } }

        d1AnalyticsAdaptiveGroups(
          limit: 1000,
          filter: {
            databaseId: ${JSON.stringify(BASE_D1)},
            date_geq: ${JSON.stringify(jour)},
            date_leq: ${JSON.stringify(jour)}
          }
        ) { sum { rowsRead rowsWritten } }
      }
    }
  }`;

const REQUETE_STOCKAGE = (compte: string, jour: string) => `
  query {
    viewer {
      accounts(filter: { accountTag: ${JSON.stringify(compte)} }) {
        d1StorageAdaptiveGroups(
          limit: 100,
          filter: {
            databaseId: ${JSON.stringify(BASE_D1)},
            date_geq: ${JSON.stringify(jour)},
            date_leq: ${JSON.stringify(jour)}
          }
        ) { max { databaseSizeBytes } }
      }
    }
  }`;

/**
 * Un appel à l'API GraphQL, dont l'échec est une VALEUR et non une exception.
 *
 * Le piège que ça referme : l'API sert ses refus en 200, avec un tableau
 * `errors` à côté d'un `data` vide. Traité comme un succès, ça donne un écran
 * de zéros — c'est-à-dire, sur un tableau de quotas, exactement le contraire
 * de la vérité.
 */
const interroger = async (
  jeton: string,
  query: string,
): Promise<{ compte: any; erreur: string | null }> => {
  try {
    const res = await fetch(GRAPHQL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const charge: any = await res.json().catch(() => null);
    if (!res.ok) return { compte: null, erreur: `Cloudflare a répondu ${res.status}` };
    if (Array.isArray(charge?.errors) && charge.errors.length) {
      return { compte: null, erreur: String(charge.errors[0]?.message ?? 'requête refusée') };
    }
    return { compte: charge?.data?.viewer?.accounts?.[0] ?? {}, erreur: null };
  } catch (e: any) {
    return { compte: null, erreur: e?.message ?? 'Cloudflare n’a pas répondu.' };
  }
};

quotas.get('/', async (c) => {
  const jeton = c.env.CLOUDFLARE_ANALYTICS_TOKEN;
  const compte = c.env.CLOUDFLARE_ACCOUNT_ID;

  // Deux refus distincts : « pose le jeton » et « pose l'identifiant de compte »
  // ne se corrigent pas au même endroit, et un message qui les mélange oblige à
  // chercher les deux.
  if (!jeton) {
    throw new Refus(
      'Aucun jeton d’analytics Cloudflare. Posez-le en secret : ' +
      'npx wrangler secret put CLOUDFLARE_ANALYTICS_TOKEN (portée « Account Analytics: Read »).',
      409,
    );
  }
  if (!compte) {
    throw new Refus(
      'Identifiant de compte Cloudflare absent. Posez-le en secret : ' +
      'npx wrangler secret put CLOUDFLARE_ACCOUNT_ID.',
      409,
    );
  }

  const maintenant = new Date();
  const debut = debutDuJourUtc(maintenant);
  const jour = debut.toISOString().slice(0, 10);

  // Les deux appels partent ensemble : ils ne dépendent pas l'un de l'autre, et
  // l'écran attend déjà une seconde de trop.
  const [consommation, stockage] = await Promise.all([
    interroger(jeton, REQUETE_CONSOMMATION(compte, debut.toISOString(), maintenant.toISOString(), jour)),
    interroger(jeton, REQUETE_STOCKAGE(compte, jour)),
  ]);

  // La consommation, elle, est indispensable : sans elle il n'y a pas d'écran.
  if (consommation.erreur) return c.json({ error: `Cloudflare : ${consommation.erreur}` }, 502);

  const workers: any[] = consommation.compte?.workersInvocationsAdaptive ?? [];
  const d1: any[] = consommation.compte?.d1AnalyticsAdaptiveGroups ?? [];
  const tailles: any[] = stockage.compte?.d1StorageAdaptiveGroups ?? [];

  const postes: QuotaPoste[] = [
    {
      id: 'workers-requetes', service: 'Workers', libelle: 'Requêtes',
      valeur: somme(workers, g => g?.sum?.requests),
      seuil: PLAFONDS.workersRequetes, unite: 'requetes', periode: 'jour',
    },
    {
      id: 'd1-lignes-lues', service: 'D1', libelle: 'Lignes lues',
      valeur: somme(d1, g => g?.sum?.rowsRead),
      seuil: PLAFONDS.d1LignesLues, unite: 'lignes', periode: 'jour',
    },
    {
      id: 'd1-lignes-ecrites', service: 'D1', libelle: 'Lignes écrites',
      valeur: somme(d1, g => g?.sum?.rowsWritten),
      seuil: PLAFONDS.d1LignesEcrites, unite: 'lignes', periode: 'jour',
    },
    {
      id: 'd1-stockage', service: 'D1', libelle: 'Stockage',
      valeur: stockage.erreur ? null : maximum(tailles, g => g?.max?.databaseSizeBytes),
      seuil: PLAFONDS.d1Stockage, unite: 'octets', periode: 'total',
      // Le message part jusqu'à l'écran : un poste muet doit dire ce qui lui
      // manque, sinon il se lit comme un poste à zéro.
      note: stockage.erreur ? `Cloudflare : ${stockage.erreur}` : null,
    },
  ];

  return c.json({ postes, depuis: debut.toISOString(), seuilsReleves: RELEVE_LE });
});
