/**
 * La veille des modèles (SPEC §5.7), vue de Réglages → Modèles IA.
 *
 * Le passage quotidien vient du déclencheur planifié (`scheduled`, dans
 * index.ts) ; ces routes le montrent, le relancent à la demande, et écartent
 * une proposition.
 */
import { Hono } from 'hono';
import { VeilleIgnorerSchema } from '@luminose/shared';
import type { Env } from '../env';
import { Refus } from '../refus';
import { lancerVeille, lirePropositions } from '../veille';

export const veille = new Hono<{ Bindings: Env }>();

/** 2 requêtes. */
veille.get('/', async (c) => c.json(await lirePropositions(c.env)));

/**
 * « Vérifier maintenant ». Le même passage que celui de la nuit — pas une
 * version allégée qui finirait par ne plus dire la même chose.
 */
veille.post('/lancer', async (c) => {
  await lancerVeille(c.env);
  return c.json(await lirePropositions(c.env));
});

/** L'identifiant voyage dans le corps : il contient des `/` et des `:`. */
veille.post('/ignorer', async (c) => {
  const { id } = VeilleIgnorerSchema.parse(await c.req.json());
  const r = await c.env.DB
    .prepare('UPDATE veille_modeles SET ignore_le = ? WHERE id = ? AND ignore_le IS NULL')
    .bind(Date.now(), id).run();
  if (!r.meta?.changes) throw new Refus('Cette proposition n’existe plus : la liste a changé depuis.', 404);
  return c.json({ ok: true });
});
