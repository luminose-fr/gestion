/**
 * Ce que les appels au modèle consomment, action par action (migration 0006).
 *
 * Pourquoi cette route existe alors que la même question se répond en SQL :
 * parce qu'elle se pose au MAUVAIS moment pour un terminal. « Quel budget de
 * réflexion pour un carrousel ? » se demande en changeant de modèle, dans
 * l'écran des Réglages — pas sur la VM, dans un `wrangler d1 execute` qu'il
 * faut retrouver. Une mesure qu'on ne peut pas consulter là où l'on décide
 * finit par ne plus être consultée du tout.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { rowToMesureSynthese } from '../db';

export const mesures = new Hono<{ Bindings: Env }>();

/**
 * 1 requête. Le regroupement est borné par construction — neuf actions, huit
 * formats, une poignée de modèles ; la borne à 200 lignes est là pour le jour
 * où l'une de ces trois hypothèses cessera d'être vraie.
 *
 * **Les moyennes ne portent que sur les appels réussis.** Un échec compte dans
 * `echecs`, et nulle part ailleurs : un refus rendu en trois secondes ferait
 * passer un modèle lent pour un modèle rapide, et une panne survenue au bout
 * de cinq minutes ferait l'inverse. Les deux mensonges valent mieux séparés.
 */
mesures.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT action, format, model_label, provider,
            COUNT(*)                                         AS appels,
            SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END)          AS echecs,
            AVG(CASE WHEN ok = 1 THEN prompt_tokens END)     AS entree_moy,
            AVG(CASE WHEN ok = 1 THEN completion_tokens END) AS sortie_moy,
            MAX(CASE WHEN ok = 1 THEN completion_tokens END) AS sortie_max,
            AVG(CASE WHEN ok = 1 THEN duree_ms END)          AS duree_moy,
            MAX(CASE WHEN ok = 1 THEN duree_ms END)          AS duree_max,
            AVG(feuille_car)                                 AS feuille_moy,
            SUM(cost_usd)                                    AS cout_total,
            MAX(created_at)                                  AS dernier
     FROM mesures_ia
     GROUP BY action, format, model_label, provider
     ORDER BY sortie_moy IS NULL, sortie_moy DESC
     LIMIT 200`
  ).all();

  return c.json({ mesures: results.map(rowToMesureSynthese) });
});
