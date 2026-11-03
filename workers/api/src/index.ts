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
 *   /api/rdv      prise de rendez-vous Calendly pour un invité (§SMS sans confirmation)
 *
 * Aucun CORS : le front partage l'origine de cette API (SPEC §1.2).
 */
import { Hono } from 'hono';
import { z, ZodError } from 'zod';
import { Refus } from './refus';
import type { Contexte, Env } from './env';
import { createSessionToken, verifySessionToken, getSessionSecret, sessionDe, cookieSession, empreinteSession, expirationSession } from './auth';
import { routeOuverteAuMcp, verifierJetonMcp } from './acces-mcp';
import { contents } from './routes/contents';
import { series } from './routes/series';
import { models } from './routes/models';
import { ai } from './routes/ai';
import { exportRoute } from './routes/export';
import { settings } from './routes/settings';
import { catalogue } from './routes/catalogue';
import { corpus } from './routes/corpus';
import { inbox } from './routes/inbox';
import { mesures } from './routes/mesures';
import { quotas } from './routes/quotas';
import { rdv } from './routes/rdv';
import { transcription } from './routes/transcription';
import { montage } from './routes/montage';
import { veille } from './routes/veille';
import { lancerVeille } from './veille';

const app = new Hono<Contexte>();

// Aucun CORS : le front est servi sur la MÊME origine que cette API
// (gestion.luminose.fr, route /api/* de wrangler.toml — SPEC §1.2). Il n'y a
// donc plus de liste d'origines à tenir à jour, ni de préflight. En local, le
// proxy de Vite reproduit la même situation.

// ── Authentification ─────────────────────────────────────────────────────

// Les cookies exigent une vérification d'origine, y compris à la connexion (CSRF).
app.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('Origin');
    if (c.req.header('Sec-Fetch-Site') === 'cross-site' ||
        (origin && origin !== new URL(c.req.url).origin && origin !== 'https://gestion.luminose.fr')) {
      return c.json({ error: 'Origine refusée' }, 403);
    }
  }
  await next();
});

const LoginSchema = z.object({ username: z.string().min(1).max(200), password: z.string().min(1).max(1024) });
app.post('/auth/login', async (c) => {
  if (!c.env.AUTH_USERNAME || !c.env.AUTH_PASSWORD || !getSessionSecret(c.env)) {
    return c.json({ error: 'Authentification non configurée.' }, 503);
  }
  const fenetre = 15 * 60 * 1000;
  const debut = Math.floor(Date.now() / fenetre) * fenetre;
  const cle = await empreinteSession(`${c.req.header('CF-Connecting-IP') ?? 'local'}:${debut}`);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM login_attempts WHERE expires_at <= ?').bind(Date.now()),
    c.env.DB.prepare('INSERT INTO login_attempts (key, attempts, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1').bind(cle, debut + fenetre),
  ]);
  const compteur = await c.env.DB.prepare('SELECT attempts FROM login_attempts WHERE key = ?').bind(cle).first<{ attempts: number }>();
  if ((compteur?.attempts ?? 0) > 20) {
    c.header('Retry-After', String(Math.ceil((debut + fenetre - Date.now()) / 1000)));
    return c.json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' }, 429);
  }
  const input = LoginSchema.safeParse(await c.req.json());
  if (!input.success) return c.json({ error: 'Identifiants incorrects' }, 401);
  // Les deux condensats ont la même longueur ; la comparaison ne dépend pas du premier écart.
  const fourni = await empreinteSession(JSON.stringify([input.data.username, input.data.password]));
  const attendu = await empreinteSession(JSON.stringify([c.env.AUTH_USERNAME, c.env.AUTH_PASSWORD]));
  let ecart = 0;
  for (let i = 0; i < attendu.length; i++) ecart |= fourni.charCodeAt(i) ^ attendu.charCodeAt(i);
  if (ecart) return c.json({ error: 'Identifiants incorrects' }, 401);
  const sessionToken = await createSessionToken(c.env);
  c.header('Set-Cookie', cookieSession(c.req.url, sessionToken));
  // Le champ est conservé pour les anciens clients pendant la bascule ; le nouveau front ne le stocke plus.
  return c.json({ success: true, sessionToken });
});

/**
 * Toute route hors /auth/login exige un jeton valide : celui de la session —
 * cookie, ou en-tête pendant la bascule —, ou celui du serveur MCP, qui n'ouvre
 * que sa liste fermée de routes (acces-mcp.ts). Les routes savent ensuite qui
 * les appelle, et le serveur MCP n'y écrit que ce qui lui est accordé.
 */
const requireSession = async (c: any, next: () => Promise<void>) => {
  const porteur = c.req.header('Authorization');
  if (porteur?.startsWith('Bearer ')) {
    const verdict = await verifierJetonMcp(porteur.slice('Bearer '.length).trim(), c.env);
    if (!verdict.valide) return c.json({ error: `Non authentifié - ${verdict.erreur}` }, 401);
    if (!routeOuverteAuMcp(c.req.method, new URL(c.req.url).pathname)) {
      return c.json({ error: 'Route fermée au serveur MCP : il ne lit et n’écrit que les contenus et les séries.' }, 403);
    }
    c.set('appelant', 'mcp');
    return next();
  }

  const jeton = sessionDe(c.req.raw);
  const check = await verifySessionToken(jeton, c.env);
  if (!check.valid) return c.json({ error: `Non authentifié - ${check.error}` }, 401);
  const revoquee = await c.env.DB.prepare('SELECT 1 FROM auth_revocations WHERE token_hash = ? AND expires_at > ?')
    .bind(await empreinteSession(jeton!), Date.now()).first();
  if (revoquee) return c.json({ error: 'Session révoquée' }, 401);
  c.set('appelant', 'console');
  await next();
};

app.use('/api/*', requireSession);
app.use('/v1/*', requireSession);
app.use('/auth/session', requireSession);
app.use('/auth/logout', requireSession);
app.get('/auth/session', (c) => {
  c.header('Set-Cookie', cookieSession(c.req.url, sessionDe(c.req.raw)!));
  return c.json({ authenticated: true });
});
app.post('/auth/logout', async (c) => {
  const jeton = sessionDe(c.req.raw)!;
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM auth_revocations WHERE expires_at <= ?').bind(Date.now()),
    c.env.DB.prepare('INSERT OR IGNORE INTO auth_revocations (token_hash, expires_at) VALUES (?, ?)')
      .bind(await empreinteSession(jeton), expirationSession(jeton)),
  ]);
  c.header('Set-Cookie', cookieSession(c.req.url, '', 0));
  return c.json({ success: true });
});

// ── Routes ───────────────────────────────────────────────────────────────

app.route('/api/contents', contents);
app.route('/api/series', series);
app.route('/api/models', models);
// Avant /api/models pour la lisibilité seulement : aucune route de `models`
// ne capte /catalogue, il n'y a pas de GET /:id.
app.route('/api/models/catalogue', catalogue);
// Même remarque : `models` n'a ni GET /:id ni POST /:id/… — rien ne capte /veille.
app.route('/api/models/veille', veille);
app.route('/api/ai', ai);
app.route('/api/export', exportRoute);
app.route('/api/settings', settings);
app.route('/api/corpus', corpus);
app.route('/api/inbox', inbox);
app.route('/api/mesures', mesures);
app.route('/api/quotas', quotas);
app.route('/api/rdv', rdv);
app.route('/api/transcription', transcription);
app.route('/api/montage', montage);

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
  if (err instanceof SyntaxError) return c.json({ error: 'JSON invalide' }, 400);
  if (err instanceof ZodError) {
    return c.json({ error: 'Entrée invalide', detail: err.issues }, 400);
  }
  if (err instanceof Refus) {
    return c.json({ error: err.message }, err.status);
  }
  console.error('Erreur non gérée :', err);
  return c.json({ error: 'Erreur interne', }, 500);
});

/**
 * Le Worker : l'application, et le passage planifié de la veille des modèles
 * (`[triggers]` dans wrangler.toml, SPEC §5.7). `waitUntil` : le passage lit
 * trois sources lentes, et la plateforme ne doit pas couper avant l'écriture.
 */
export default {
  fetch: app.fetch,
  scheduled: (_evenement: ScheduledController, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(lancerVeille(env).then(() => undefined));
  },
};
