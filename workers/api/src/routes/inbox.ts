/**
 * L'inbox — le seul store en écriture de la console.
 *
 * Le corpus est une constante du bundle : l'application ne peut pas l'écrire.
 * L'inbox, elle, doit l'être — c'est par là qu'une décision prise en
 * conversation revient. **Le sens reste unique** : une capture ne devient
 * vraie qu'en repassant par un commit, et rien ici n'entre dans un profil de
 * contexte.
 *
 * Budget : 1 requête par route (SPEC §3.6).
 */
import { Hono } from 'hono';
import { CaptureSchema, IntegrationSchema } from '@luminose/shared';
import type { Env } from '../env';
import { now } from '../db';

export const inbox = new Hono<{ Bindings: Env }>();

interface Ligne {
  id: string;
  decide: string;
  remplace: string | null;
  source: string | null;
  created_at: number;
  integrated_at: number | null;
  integration: string | null;
}

const rendre = (r: any) => ({
  id: String(r.id),
  decide: String(r.decide),
  remplace: (r.remplace as string | null) ?? null,
  source: (r.source as string | null) ?? null,
  createdAt: r.created_at as number,
  integratedAt: (r.integrated_at as number | null) ?? null,
  integration: (r.integration as string | null) ?? null,
});

/**
 * 1 requête. Tout, en attente comme intégré — l'écran sépare.
 *
 * Le plafond n'est pas cosmétique : une capture peut faire 4 000 caractères, et
 * l'historique n'a pas vocation à traverser le réseau en entier à chaque
 * ouverture d'écran.
 */
inbox.get('/', async (c) => {
  const limite = Math.min(Number(c.req.query('limit') ?? 100) || 100, 200);
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM inbox WHERE deleted_at IS NULL
     ORDER BY (integrated_at IS NOT NULL), created_at DESC LIMIT ?`,
  ).bind(limite).all();

  const captures = (results as unknown as Ligne[]).map(rendre);
  return c.json({
    captures,
    enAttente: captures.filter((x) => x.integratedAt === null).length,
  });
});

/** 1 requête. Capturer — quelques secondes, aucune décision de rangement. */
inbox.post('/', async (c) => {
  const capture = CaptureSchema.parse(await c.req.json());
  const id = crypto.randomUUID();
  const ts = now();

  await c.env.DB.prepare(
    'INSERT INTO inbox (id, decide, remplace, source, created_at) VALUES (?, ?, ?, ?, ?)',
  ).bind(id, capture.decide, capture.remplace, capture.source, ts).run();

  return c.json({
    capture: { id, ...capture, createdAt: ts, integratedAt: null, integration: null },
  }, 201);
});

/**
 * 1 requête. Marquer intégrée, en disant OÙ.
 *
 * `integration` est obligatoire : une capture marquée intégrée sans destination
 * romprait la chaîne qui permet de remonter d'un fichier du corpus jusqu'aux
 * mots d'origine. C'est tout l'intérêt de ne jamais supprimer une capture.
 */
inbox.patch('/:id', async (c) => {
  const { integration } = IntegrationSchema.parse(await c.req.json());
  const { results } = await c.env.DB.prepare(
    `UPDATE inbox SET integrated_at = ?, integration = ?
     WHERE id = ? AND deleted_at IS NULL RETURNING *`,
  ).bind(now(), integration, c.req.param('id')).all();

  const ligne = (results as unknown as Ligne[])[0];
  if (!ligne) return c.json({ error: 'Capture introuvable.' }, 404);
  return c.json({ capture: rendre(ligne) });
});

/**
 * 1 requête. Suppression logique, pour une capture saisie deux fois ou à côté
 * de la plaque. Une capture qu'on regrette n'est pas une capture qu'on efface.
 */
inbox.delete('/:id', async (c) => {
  const { meta } = await c.env.DB.prepare(
    'UPDATE inbox SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL',
  ).bind(now(), c.req.param('id')).run();

  if (!meta.changes) return c.json({ error: 'Capture introuvable.' }, 404);
  return c.json({ ok: true });
});
