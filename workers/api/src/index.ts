/**
 * Worker API — gestion.luminose.fr
 *
 * Sert simultanément, le temps de la migration (SPEC §11) :
 *   /auth/login   authentification (jeton signé, §7)
 *   /api/*        la nouvelle API sur D1
 *   /v1/*, /1min/* les proxys de l'ère Notion, que le front appelle encore
 *
 * CORS : maintenu tant que le front vit sur GitHub Pages. Il disparaîtra en
 * phase 5 avec le passage à l'origine unique (SPEC §1.2).
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ZodError } from 'zod';
import type { Env } from './env';
import { createSessionToken, verifySessionToken, getSessionSecret } from './auth';
import { contents } from './routes/contents';
import { series } from './routes/series';
import { models } from './routes/models';
import { legacy } from './routes/legacy';

const ALLOWED_ORIGINS = [
  'https://gestion.luminose.fr',
  'http://localhost:7860',
  'http://127.0.0.1:7860',
];

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors({
  origin: (origin) => (ALLOWED_ORIGINS.includes(origin) ? origin : null),
  allowHeaders: ['Content-Type', 'Notion-Version', 'X-Session-Token'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// ── Authentification ─────────────────────────────────────────────────────

app.post('/auth/login', async (c) => {
  const { username, password } = await c.req.json<{ username?: string; password?: string }>();

  if (username !== c.env.AUTH_USERNAME || password !== c.env.AUTH_PASSWORD) {
    return c.json({ error: 'Identifiants incorrects' }, 401);
  }
  if (!getSessionSecret(c.env)) {
    return c.json({
      error: 'Worker mal configuré : définissez le secret SESSION_SECRET (npx wrangler secret put SESSION_SECRET).',
    }, 500);
  }

  return c.json({ success: true, sessionToken: await createSessionToken(c.env) });
});

/** Toute route hors /auth/login exige un jeton valide. */
const requireSession = async (c: any, next: () => Promise<void>) => {
  const check = await verifySessionToken(c.req.header('X-Session-Token') ?? null, c.env);
  if (!check.valid) return c.json({ error: `Non authentifié - ${check.error}` }, 401);
  await next();
};

app.use('/api/*', requireSession);
app.use('/v1/*', requireSession);
app.use('/1min/*', requireSession);

// ── Routes ───────────────────────────────────────────────────────────────

app.route('/api/contents', contents);
app.route('/api/series', series);
app.route('/api/models', models);
app.route('/', legacy);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

/**
 * Une entrée invalide est une erreur du client (400), pas une panne (500) :
 * on renvoie le détail zod pour que l'appelant sache quoi corriger.
 */
app.onError((err, c) => {
  if (err instanceof ZodError) {
    return c.json({ error: 'Entrée invalide', detail: err.issues }, 400);
  }
  console.error('Erreur non gérée :', err);
  return c.json({ error: 'Erreur interne', detail: err.message }, 500);
});

export default app;
