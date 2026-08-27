/**
 * Worker API — gestion.luminose.fr
 *
 *   /auth/login   authentification (jeton signé, §7)
 *   /api/*        l'API sur D1, seule utilisée par le front
 *   /api/export   sauvegarde JSON complète (§9.4)
 *   /api/settings clés des fournisseurs — en écriture seule (§5.5)
 *   /api/models/catalogue  explorateur OpenRouter — filtre, ne décide pas (§5.6)
 *   /api/corpus   le corpus, EN LECTURE SEULE — embarqué au déploiement, 0 requête D1
 *   /api/inbox    les captures — le SEUL store en écriture de la console
 *   /v1/*         proxy Notion résiduel — aucun client, gardé comme filet
 *
 * Aucun CORS : le front partage l'origine de cette API (SPEC §1.2).
 */
import { Hono } from 'hono';
import { ZodError } from 'zod';
import { Refus } from './refus';
import type { Env } from './env';
import { createSessionToken, verifySessionToken, getSessionSecret } from './auth';
import { contents } from './routes/contents';
import { series } from './routes/series';
import { models } from './routes/models';
import { ai } from './routes/ai';
import { exportRoute } from './routes/export';
import { settings } from './routes/settings';
import { catalogue } from './routes/catalogue';
import { corpus } from './routes/corpus';
import { inbox } from './routes/inbox';
import { legacy } from './routes/legacy';

const app = new Hono<{ Bindings: Env }>();

// Aucun CORS : le front est servi sur la MÊME origine que cette API
// (gestion.luminose.fr, route /api/* de wrangler.toml — SPEC §1.2). Il n'y a
// donc plus de liste d'origines à tenir à jour, ni de préflight. En local, le
// proxy de Vite reproduit la même situation.

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

// ── Routes ───────────────────────────────────────────────────────────────

app.route('/api/contents', contents);
app.route('/api/series', series);
app.route('/api/models', models);
// Avant /api/models pour la lisibilité seulement : aucune route de `models`
// ne capte /catalogue, il n'y a pas de GET /:id.
app.route('/api/models/catalogue', catalogue);
app.route('/api/ai', ai);
app.route('/api/export', exportRoute);
app.route('/api/settings', settings);
app.route('/api/corpus', corpus);
app.route('/api/inbox', inbox);
app.route('/', legacy);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

/**
 * Trois familles, et une seule mérite d'être journalisée.
 *
 * Une entrée invalide est une erreur du client (400), pas une panne (500) :
 * on renvoie le détail zod pour que l'appelant sache quoi corriger.
 *
 * Un `Refus` porte son propre statut et son propre message : il passe dans
 * `error`, que le front affiche, et non dans `detail`, que personne ne lit.
 * Il ne s'écrit PAS dans les journaux — « aucune clé configurée » n'est pas
 * un incident, et une ligne d'erreur qui se déclenche pour tout ne réveille
 * plus personne. C'est le même raisonnement que le point de passage unique du
 * §3.5.1, pris par l'autre bout : ne signaler que ce qui mérite un regard.
 *
 * Le reste est une vraie panne : 500, et la trace part dans les journaux.
 */
app.onError((err, c) => {
  if (err instanceof ZodError) {
    return c.json({ error: 'Entrée invalide', detail: err.issues }, 400);
  }
  if (err instanceof Refus) {
    return c.json({ error: err.message }, err.status);
  }
  console.error('Erreur non gérée :', err);
  return c.json({ error: 'Erreur interne', detail: err.message }, 500);
});

export default app;
