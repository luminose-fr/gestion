/**
 * Le journal des écritures (V7) et le plafond de volume (V9) — seul endroit où
 * le Worker parle à sa base. snake_case dedans, camelCase dehors (CLAUDE.md).
 *
 * Trois requêtes par écriture, jamais plus : compter, ouvrir, clore.
 */
import { Refus } from './refus';
import type { Env } from './env';

const JOUR_MS = 24 * 60 * 60 * 1000;

export type Ouverture = {
  outil: string;
  compte: string;
  auteur: string;
  contenu: unknown;
  jetonEmpreinte: string;
};

/** V9 : les écritures des 24 dernières heures, quelle que soit leur issue — une boucle qui échoue reste une boucle. */
export const ecrituresDuJour = async (env: Env): Promise<number> => {
  const ligne = await env.DB
    .prepare('SELECT COUNT(*) AS n FROM ads_ecritures WHERE created_at > ?')
    .bind(Date.now() - JOUR_MS)
    .first<{ n: number }>();
  return Number(ligne?.n ?? 0);
};

/**
 * La ligne `en_cours`, écrite AVANT l'appel à Google. Rend son numéro.
 *
 * Un jeton déjà présenté viole l'unicité de `jeton_empreinte` : c'est un refus
 * (refaire un aperçu), pas une panne. Toute autre erreur remonte telle quelle —
 * l'appelant n'appellera pas Google.
 */
export const ouvrir = async (env: Env, o: Ouverture): Promise<number> => {
  try {
    const resultat = await env.DB
      .prepare('INSERT INTO ads_ecritures (created_at, outil, compte, auteur, contenu, jeton_empreinte) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(Date.now(), o.outil, o.compte, o.auteur, JSON.stringify(o.contenu), o.jetonEmpreinte)
      .run();
    return Number(resultat.meta.last_row_id);
  } catch (erreur) {
    if (/UNIQUE constraint failed/i.test(String(erreur))) {
      throw new Refus("Ce jeton d'aperçu a déjà servi : refaites un aperçu (appel sans jeton).");
    }
    throw erreur;
  }
};

export const clore = async (
  env: Env,
  id: number,
  issue: 'ok' | 'erreur',
  detail: { ressources?: string[]; erreur?: string },
): Promise<void> => {
  await env.DB
    .prepare('UPDATE ads_ecritures SET issue = ?, ressources = ?, erreur = ?, closed_at = ? WHERE id = ?')
    .bind(issue, detail.ressources ? JSON.stringify(detail.ressources) : null, detail.erreur ?? null, Date.now(), id)
    .run();
};
