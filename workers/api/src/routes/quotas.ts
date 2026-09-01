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
 * Une seule requête réseau, deux jeux de données.
 *
 * Les valeurs sont interpolées plutôt que passées en variables GraphQL : les
 * deux datasets ne déclarent pas leurs scalaires sous les mêmes noms
 * (`string` ici, `Date` là), et une variable mal typée fait échouer toute la
 * requête avec un message qui ne désigne rien. Rien de ce qui est interpolé ne
 * vient de l'appelant — le compte sort de l'environnement, le script et la
 * base sont des constantes.
 */
const requete = (compte: string, debutIso: string, finIso: string, jour: string) => `
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
        ) {
          sum { rowsRead rowsWritten }
          max { databaseSizeBytes }
        }
      }
    }
  }`;

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

  let charge: any;
  try {
    const res = await fetch(GRAPHQL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: requete(compte, debut.toISOString(), maintenant.toISOString(), jour) }),
    });
    charge = await res.json();
    if (!res.ok) throw new Error(`Cloudflare a répondu ${res.status}`);
  } catch (e: any) {
    // Une panne de Cloudflare n'est pas une panne du Worker : 502, message en
    // clair, même règle que pour les fournisseurs d'IA.
    return c.json({ error: e?.message ?? 'Cloudflare n’a pas répondu.' }, 502);
  }

  // L'API GraphQL rend 200 avec un tableau `errors` — un échec qui se présente
  // comme un succès. Sans cette lecture, l'écran afficherait des tirets partout
  // en laissant croire à une consommation nulle.
  const plainte = Array.isArray(charge?.errors) && charge.errors.length
    ? String(charge.errors[0]?.message ?? 'Requête refusée par Cloudflare')
    : null;
  if (plainte) return c.json({ error: `Cloudflare : ${plainte}` }, 502);

  const compteCf = charge?.data?.viewer?.accounts?.[0] ?? {};
  const workers: any[] = compteCf.workersInvocationsAdaptive ?? [];
  const d1: any[] = compteCf.d1AnalyticsAdaptiveGroups ?? [];

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
      valeur: maximum(d1, g => g?.max?.databaseSizeBytes),
      seuil: PLAFONDS.d1Stockage, unite: 'octets', periode: 'total',
    },
  ];

  return c.json({ postes, depuis: debut.toISOString(), seuilsReleves: RELEVE_LE });
});
