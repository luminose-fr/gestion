/**
 * Clés des fournisseurs — l'invariant est le silence.
 *
 * Ce qui est vérifié ici n'est pas qu'on puisse poser une clé : c'est qu'on ne
 * puisse JAMAIS la relire. Une seule route qui renvoie la valeur, et la règle 1
 * de CLAUDE.md tombe — sans que rien ne casse, ce qui est bien pire.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index';
import { createSessionToken } from '../src/auth';
import { makeEnv, TestD1 } from './helpers/d1';

let env: ReturnType<typeof makeEnv> & { OPENROUTER_API_KEY?: string };
let token: string;

const call = (path: string, init: RequestInit = {}) =>
  app.fetch(new Request(`https://api.test${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Session-Token': token, ...(init.headers || {}) },
  }), env as any);

const put = (p: string, b: unknown) => call(p, { method: 'PUT', body: JSON.stringify(b) });
const post = (p: string, b: unknown) => call(p, { method: 'POST', body: JSON.stringify(b) });
const json = async (r: Response) => await r.json() as any;

const CLE = 'sk-or-v1-0123456789abcdef';

const seedModel = async (id: string, provider: string) => {
  const ts = Date.now();
  await (env.DB as any).prepare(
    `INSERT INTO ai_models (id, name, api_code, provider, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`
  ).bind(id, `Modèle ${id}`, `code-${id}`, provider, ts, ts).run();
};

beforeEach(async () => {
  env = makeEnv();
  token = await createSessionToken(env);
});

describe('clés des fournisseurs', () => {
  it('liste les adaptateurs connus, sans clé posée', async () => {
    // makeEnv fournit ONE_MIN_API_KEY : 1min est donc déjà servi par l'environnement.
    const { providers } = await json(await call('/api/settings/providers'));
    expect(providers.map((p: any) => p.id).sort()).toEqual(['onemin', 'openai', 'openrouter']);

    const openrouter = providers.find((p: any) => p.id === 'openrouter');
    expect(openrouter).toMatchObject({ configured: false, hint: null, source: null });
  });

  it('pose une clé et n’en rend que l’empreinte', async () => {
    const res = await put('/api/settings/providers/openrouter', { apiKey: CLE });
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body).toMatchObject({ id: 'openrouter', configured: true, source: 'base' });
    expect(body.hint).toBe('…cdef');
    expect(JSON.stringify(body)).not.toContain(CLE);
  });

  /** LE test : aucune route de lecture ne doit rendre la valeur. */
  it('ne renvoie JAMAIS la clé, ni dans la liste ni dans l’export', async () => {
    await put('/api/settings/providers/openrouter', { apiKey: CLE });

    const liste = JSON.stringify(await json(await call('/api/settings/providers')));
    expect(liste).not.toContain(CLE);

    const sauvegarde = JSON.stringify(await json(await call('/api/export')));
    expect(sauvegarde).not.toContain(CLE);
    expect(sauvegarde).not.toContain('provider_key');
  });

  it('la base l’emporte sur la variable d’environnement', async () => {
    await put('/api/settings/providers/onemin', { apiKey: 'cle-posee-a-la-main' });
    const { providers } = await json(await call('/api/settings/providers'));
    expect(providers.find((p: any) => p.id === 'onemin')).toMatchObject({ source: 'base', hint: '…main' });
  });

  it('effacer la clé fait retomber sur l’environnement quand il y en a un', async () => {
    await put('/api/settings/providers/onemin', { apiKey: 'cle-posee-a-la-main' });
    const res = await json(await call('/api/settings/providers/onemin', { method: 'DELETE' }));
    // ONE_MIN_API_KEY existe dans makeEnv : couper la clé de base ne coupe pas l'accès.
    expect(res).toMatchObject({ configured: true, source: 'environnement' });

    expect((env.DB as unknown as TestD1).query("SELECT key FROM app_settings WHERE key LIKE 'provider_key:%'"))
      .toHaveLength(0);
  });

  it('refuse une clé trop courte pour en être une', async () => {
    expect((await put('/api/settings/providers/openrouter', { apiKey: 'x' })).status).toBe(400);
  });

  it('refuse un adaptateur qui n’existe pas', async () => {
    expect((await put('/api/settings/providers/mistral', { apiKey: CLE })).status).toBe(404);
  });

  it('exige un jeton de session', async () => {
    const res = await app.fetch(new Request('https://api.test/api/settings/providers'), env as any);
    expect(res.status).toBe(401);
  });
});

describe('la clé posée est celle qui part au fournisseur', () => {
  it('sert un appel sur un adaptateur sans variable d’environnement', async () => {
    const calls: any[] = [];
    vi.stubGlobal('fetch', async (url: string, init: any) => {
      calls.push({ url: String(url), headers: init.headers });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'réponse' } }] }), { status: 200 });
    });

    await seedModel('m-or', 'openrouter');
    // Sans clé : refus explicite, pas un appel qui échoue plus loin.
    expect((await post('/api/ai/chat', { modelId: 'm-or', messages: [{ role: 'user', content: 'x' }] })).status).toBe(500);

    await put('/api/settings/providers/openrouter', { apiKey: CLE });
    const res = await post('/api/ai/chat', { modelId: 'm-or', messages: [{ role: 'user', content: 'x' }] });

    expect(res.status).toBe(200);
    expect(calls[0].url).toContain('openrouter.ai');
    expect(calls[0].headers.Authorization).toBe(`Bearer ${CLE}`);
  });
});

describe('modèle par action', () => {
  const creerModele = async (nom: string) =>
    (await json(await post('/api/models', { name: nom, apiCode: `code-${nom}` }))).model;

  it('sans réglage, aucune action n’est affectée', async () => {
    const { actions } = await json(await call('/api/settings/actions'));
    expect(actions).toEqual({});
  });

  it('affecte un modèle à une action et le relit', async () => {
    const modele = await creerModele('Rédacteur premium');
    const res = await put('/api/settings/actions/DRAFT_CONTENT', { modelId: modele.id });
    expect(res.status).toBe(200);

    const { actions } = await json(await call('/api/settings/actions'));
    expect(actions).toEqual({ DRAFT_CONTENT: modele.id });
  });

  /** Un preset qui pointe vers un modèle absent échouerait au moment de rédiger. */
  it('refuse un modèle qui n’est pas au catalogue', async () => {
    expect((await put('/api/settings/actions/DRAFT_CONTENT', { modelId: 'fantome' })).status).toBe(404);
  });

  it('refuse une action inconnue', async () => {
    const modele = await creerModele('M');
    expect((await put('/api/settings/actions/RESUMER_TOUT', { modelId: modele.id })).status).toBe(404);
  });

  it('null remet l’action sur le modèle actif', async () => {
    const modele = await creerModele('M');
    await put('/api/settings/actions/COLD_READ', { modelId: modele.id });
    await put('/api/settings/actions/COLD_READ', { modelId: null });

    const { actions } = await json(await call('/api/settings/actions'));
    expect(actions.COLD_READ).toBeUndefined();
  });

  /** L'ancien Intervieweur n'a plus d'écran : il n'a pas à être réglable. */
  it('ne connaît pas les actions retirées du flux', async () => {
    const modele = await creerModele('M');
    expect((await put('/api/settings/actions/GENERATE_INTERVIEW', { modelId: modele.id })).status).toBe(404);
  });

  it('les presets voyagent dans la sauvegarde, contrairement aux clés', async () => {
    const modele = await creerModele('M');
    await put('/api/settings/actions/DRAFT_CONTENT', { modelId: modele.id });
    await put('/api/settings/providers/openrouter', { apiKey: CLE });

    const sauvegarde = await json(await call('/api/export'));
    const cles = sauvegarde.settings.map((s: any) => s.key);
    expect(cles).toContain('action_model:DRAFT_CONTENT');
    expect(cles.some((k: string) => k.startsWith('provider_key:'))).toBe(false);
  });
});

/**
 * Le tri des listes vit sur le compte, pas dans le navigateur (SPEC §3.7).
 *
 * Ce qui est protégé ici : un réglage illisible ou périmé ne doit JAMAIS
 * empêcher les autres listes de retrouver le leur. Une liste sans réglage
 * repart sur son défaut ; c'est le front qui le connaît, pas le Worker.
 */
describe('tri et filtre retenus par les listes', () => {
  it('sans réglage, aucune liste n’a de tri', async () => {
    const res = await call('/api/settings/vues');
    expect(res.status).toBe(200);
    expect((await json(res)).vues).toEqual({});
  });

  it('pose un tri et le relit tel quel', async () => {
    const pose = await put('/api/settings/vues/ideas', { tri: 'createdAt', sens: 'desc', filtre: 'TO_ANALYZE' });
    expect(pose.status).toBe(200);

    const { vues } = await json(await call('/api/settings/vues'));
    expect(vues.ideas).toEqual({ tri: 'createdAt', sens: 'desc', filtre: 'TO_ANALYZE' });
  });

  it('le filtre est facultatif — une liste qui n’en a pas rend null', async () => {
    await put('/api/settings/vues/series', { tri: 'statut', sens: 'asc' });
    const { vues } = await json(await call('/api/settings/vues'));
    expect(vues.series).toEqual({ tri: 'statut', sens: 'asc', filtre: null });
  });

  it('chaque liste garde le sien', async () => {
    await put('/api/settings/vues/ideas', { tri: 'contenu', sens: 'asc' });
    await put('/api/settings/vues/drafts', { tri: 'format', sens: 'desc' });
    const { vues } = await json(await call('/api/settings/vues'));
    expect(vues.ideas.tri).toBe('contenu');
    expect(vues.drafts.tri).toBe('format');
  });

  it('refuse une liste inconnue', async () => {
    const res = await put('/api/settings/vues/inconnue', { tri: 'contenu', sens: 'asc' });
    expect(res.status).toBe(404);
  });

  it('refuse un sens qui n’en est pas un', async () => {
    const res = await put('/api/settings/vues/ideas', { tri: 'contenu', sens: 'diagonal' });
    expect(res.status).toBe(400);
  });

  /**
   * La colonne n'est PAS validée contre une énumération : elle appartient à
   * l'écran et bouge avec lui. Le Worker n'en garde que la forme, le front
   * retombe sur son défaut s'il ne la connaît plus.
   */
  it('accepte une colonne que le Worker ne connaît pas', async () => {
    const res = await put('/api/settings/vues/ideas', { tri: 'colonneDeDemain', sens: 'asc' });
    expect(res.status).toBe(200);
  });

  it('une valeur illisible en base n’emporte pas les autres listes', async () => {
    await put('/api/settings/vues/ideas', { tri: 'contenu', sens: 'asc' });
    await (env.DB as any).prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES ('vue:series', 'ceci n''est pas du JSON', 1)"
    ).run();

    const { vues } = await json(await call('/api/settings/vues'));
    expect(vues.series).toBeUndefined();
    expect(vues.ideas.tri).toBe('contenu');
  });

  it('exige un jeton de session', async () => {
    const res = await app.fetch(new Request('https://api.test/api/settings/vues'), env as any);
    expect(res.status).toBe(401);
  });
});
