/**
 * Les journaux des écritures (V7) et leur plafond de volume (V9) — seul
 * endroit où le Worker parle à sa base. snake_case dedans, camelCase dehors
 * (CLAUDE.md).
 *
 * Trois journaux, une seule forme : `ads_ecritures` pour Google Ads,
 * `corpus_ecritures` pour le dépôt (migration 0002), `gtm_ecritures` pour Tag
 * Manager (migration 0003). Seule la colonne qui nomme la cible diffère — le
 * compte, le dépôt, ou le conteneur.
 *
 * Trois requêtes par écriture, jamais plus : compter, ouvrir, clore.
 */
import { Refus } from './refus';
import type { Env } from './env';

const JOUR_MS = 24 * 60 * 60 * 1000;

/** Une liste fermée : ces noms entrent dans le SQL, rien d'autre ne le peut. */
const JOURNAUX = {
  ads: { table: 'ads_ecritures', cible: 'compte' },
  corpus: { table: 'corpus_ecritures', cible: 'depot' },
  gtm: { table: 'gtm_ecritures', cible: 'conteneur' },
} as const;

export type Journal = keyof typeof JOURNAUX;

export type Ouverture = {
  outil: string;
  /** Le compte Google Ads, le dépôt, ou le conteneur Tag Manager. */
  cible: string;
  auteur: string;
  contenu: unknown;
  jetonEmpreinte: string;
};

/** V9 : les écritures des 24 dernières heures, quelle que soit leur issue — une boucle qui échoue reste une boucle. */
export const ecrituresDuJour = async (env: Env, journal: Journal): Promise<number> => {
  const ligne = await env.DB
    .prepare(`SELECT COUNT(*) AS n FROM ${JOURNAUX[journal].table} WHERE created_at > ?`)
    .bind(Date.now() - JOUR_MS)
    .first<{ n: number }>();
  return Number(ligne?.n ?? 0);
};

/**
 * La ligne `en_cours`, écrite AVANT l'appel au fournisseur. Rend son numéro.
 *
 * Un jeton déjà présenté viole l'unicité de `jeton_empreinte` : c'est un refus
 * (refaire un aperçu), pas une panne. Toute autre erreur remonte telle quelle —
 * l'appelant n'appellera pas le fournisseur.
 */
export const ouvrir = async (env: Env, journal: Journal, o: Ouverture): Promise<number> => {
  const { table, cible } = JOURNAUX[journal];
  try {
    const resultat = await env.DB
      .prepare(`INSERT INTO ${table} (created_at, outil, ${cible}, auteur, contenu, jeton_empreinte) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(Date.now(), o.outil, o.cible, o.auteur, JSON.stringify(o.contenu), o.jetonEmpreinte)
      .run();
    return Number(resultat.meta.last_row_id);
  } catch (erreur) {
    if (/UNIQUE constraint failed/i.test(String(erreur))) {
      throw new Refus("Ce jeton d'aperçu a déjà servi : refaites un aperçu (appel sans jeton).");
    }
    throw erreur;
  }
};

/**
 * La dernière fois que CE serveur a mis en pause ou réactivé `ressource`, avec
 * succès. C'est ce qui dit si une pause est la sienne : `ads_reactiver` n'annule
 * que la pause la plus récente, et seulement si elle vient d'ici. Une requête.
 */
export const dernierChangementDeStatut = async (
  env: Env,
  compte: string,
  ressource: string,
): Promise<{ id: number; outil: string; createdAt: number } | null> => {
  const ligne = await env.DB
    .prepare("SELECT id, outil, created_at FROM ads_ecritures WHERE compte = ? AND issue = 'ok' " +
      "AND outil IN ('ads_mettre_en_pause', 'ads_reactiver') AND json_extract(contenu, '$.operations[0].update.resourceName') = ? " +
      'ORDER BY id DESC LIMIT 1')
    .bind(compte, ressource)
    .first<{ id: number; outil: string; created_at: number }>();
  return ligne ? { id: Number(ligne.id), outil: ligne.outil, createdAt: Number(ligne.created_at) } : null;
};

export const clore = async (
  env: Env,
  journal: Journal,
  id: number,
  issue: 'ok' | 'erreur',
  detail: { ressources?: string[]; erreur?: string },
): Promise<void> => {
  await env.DB
    .prepare(`UPDATE ${JOURNAUX[journal].table} SET issue = ?, ressources = ?, erreur = ?, closed_at = ? WHERE id = ?`)
    .bind(issue, detail.ressources ? JSON.stringify(detail.ressources) : null, detail.erreur ?? null, Date.now(), id)
    .run();
};
