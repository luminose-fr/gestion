/**
 * Routes IA — le routage par fournisseur (SPEC §3.5, §5.3).
 *
 * Le point vérifié ici n'est pas qu'un appel « marche » : c'est que le Worker
 * choisisse l'adaptateur d'après la colonne `provider` du modèle, et jamais
 * d'après ce que le client demande. Le front ne connaît aucun fournisseur.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index';
import { createSessionToken } from '../src/auth';
import { makeEnv } from './helpers/d1';

let env: ReturnType<typeof makeEnv> & { OPENAI_API_KEY?: string };
let token: string;
let outbound: Array<{ url: string; body: any; headers: any }>;

const call = (path: string, body: unknown) =>
  app.fetch(new Request(`https://api.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Session-Token': token },
    body: JSON.stringify(body),
  }), env as any);

const json = async (r: Response) => await r.json() as any;

const stubProviders = () => {
  outbound = [];
  vi.stubGlobal('fetch', async (url: string, init: any) => {
    outbound.push({ url: String(url), body: JSON.parse(init.body), headers: init.headers });
    const payload = String(url).includes('1min.ai')
      ? { aiRecord: { aiRecordDetail: { resultObject: ['réponse 1min'] } } }
      : { choices: [{ message: { content: 'réponse openai' } }] };
    return new Response(JSON.stringify(payload), { status: 200 });
  });
};

/** Insère un modèle directement en base, avec le fournisseur voulu. */
const seedModel = async (id: string, provider: string) => {
  const ts = Date.now();
  await (env.DB as any).prepare(
    `INSERT INTO ai_models (id, name, api_code, provider, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`
  ).bind(id, `Modèle ${id}`, `code-${id}`, provider, ts, ts).run();
};

beforeEach(async () => {
  env = { ...makeEnv(), OPENAI_API_KEY: 'cle-openai' };
  token = await createSessionToken(env);
  stubProviders();
});

describe('routage par fournisseur', () => {
  it('appelle 1min.ai pour un modèle marqué onemin', async () => {
    await seedModel('m-onemin', 'onemin');
    const res = await call('/api/ai/chat', {
      modelId: 'm-onemin', system: 'SYS', messages: [{ role: 'user', content: 'Bonjour' }],
    });
    expect(res.status).toBe(200);
    expect((await json(res)).text).toBe('réponse 1min');
    expect(outbound[0].url).toContain('1min.ai');
    expect(outbound[0].headers['API-KEY']).toBe('cle-1min');
  });

  it('appelle OpenAI pour le MÊME appel si la colonne provider change', async () => {
    await seedModel('m-openai', 'openai');
    const res = await call('/api/ai/chat', {
      modelId: 'm-openai', system: 'SYS', messages: [{ role: 'user', content: 'Bonjour' }],
    });
    expect((await json(res)).text).toBe('réponse openai');
    expect(outbound[0].url).toContain('openai.com');
    expect(outbound[0].headers.Authorization).toBe('Bearer cle-openai');
  });

  it('envoie le code d’API du modèle, pas son identifiant', async () => {
    await seedModel('m-onemin', 'onemin');
    await call('/api/ai/chat', { modelId: 'm-onemin', messages: [{ role: 'user', content: 'x' }] });
    expect(outbound[0].body.model).toBe('code-m-onemin');
  });

  it('renvoie le nom du modèle, pour la signature des générations', async () => {
    await seedModel('m-onemin', 'onemin');
    const res = await call('/api/ai/chat', { modelId: 'm-onemin', messages: [{ role: 'user', content: 'x' }] });
    expect((await json(res)).modelLabel).toBe('Modèle m-onemin');
  });

  it('n’expose jamais la réponse brute du fournisseur', async () => {
    await seedModel('m-onemin', 'onemin');
    const res = await call('/api/ai/chat', { modelId: 'm-onemin', messages: [{ role: 'user', content: 'x' }] });
    expect(await json(res)).not.toHaveProperty('raw');
  });
});

describe('refus explicites', () => {
  it('404 si le modèle n’est pas au catalogue', async () => {
    const res = await call('/api/ai/chat', { modelId: 'fantome', messages: [{ role: 'user', content: 'x' }] });
    expect(res.status).toBe(404);
  });

  /**
   * Le message doit arriver dans `error`, PAS dans `detail` — c'est `error`
   * que `aiService` affiche. Servi en 500 avec `error: 'Erreur interne'`,
   * le message le plus utile de l'application (« Renseignez-la dans
   * Réglages → Fournisseurs ») ne s'affichait jamais : Florent lisait
   * « Erreur interne » et n'avait aucun moyen de savoir quoi faire.
   *
   * Et pas un 5xx : une clé manquante n'est pas une panne. Confondre les deux
   * familles, c'est perdre le seul indicateur qui devrait réveiller quelqu'un.
   */
  it('échoue clairement si le fournisseur n’a pas de clé configurée', async () => {
    await seedModel('m-sans-cle', 'openai');
    env.OPENAI_API_KEY = undefined;
    const res = await call('/api/ai/chat', { modelId: 'm-sans-cle', messages: [{ role: 'user', content: 'x' }] });
    expect(res.status).toBe(409);
    expect((await json(res)).error).toContain('Réglages → Fournisseurs');
  });

  it('échoue clairement si la colonne provider ne correspond à aucun adaptateur', async () => {
    await seedModel('m-inconnu', 'mistral');
    const res = await call('/api/ai/chat', { modelId: 'm-inconnu', messages: [{ role: 'user', content: 'x' }] });
    expect(res.status).toBe(409);
    expect((await json(res)).error).toContain('Fournisseur inconnu');
  });

  /**
   * NORMATIF — aucun refus ne doit passer pour une panne.
   *
   * Le garde-fou porte sur les DEUX signaux à la fois : le statut hors des
   * 5xx, et le silence dans les journaux. Vérifier l'un sans l'autre laisse
   * revenir la moitié du défaut.
   */
  it('un refus ne s’écrit pas dans les journaux — NORMATIF', async () => {
    const cri = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await seedModel('m-muet', 'openai');
      env.OPENAI_API_KEY = undefined;
      const res = await call('/api/ai/chat', { modelId: 'm-muet', messages: [{ role: 'user', content: 'x' }] });
      expect(res.status).toBeLessThan(500);
      expect(cri).not.toHaveBeenCalled();
    } finally {
      cri.mockRestore();
    }
  });

  /**
   * Un fournisseur qui refuse répond 200 avec son erreur dans la charge utile.
   * Le 21/08/2026, un compte à sec ressortait en « Erreur interne » : le
   * message qui disait quoi faire restait enterré dans `detail`.
   */
  it('502 et message du fournisseur quand celui-ci refuse la requête', async () => {
    await seedModel('m-onemin', 'onemin');
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      aiRecord: {
        status: 'FAILURE',
        aiRecordDetail: { resultObject: { code: 'INSUFFICIENT_CREDITS', message: 'only has 0 credits' } },
      },
    }), { status: 200 }));

    const res = await call('/api/ai/chat', { modelId: 'm-onemin', messages: [{ role: 'user', content: 'x' }] });
    expect(res.status).toBe(502);
    expect((await json(res)).error).toContain('0 credits');
  });

  it('refuse une requête sans message', async () => {
    await seedModel('m-onemin', 'onemin');
    expect((await call('/api/ai/chat', { modelId: 'm-onemin', messages: [] })).status).toBe(400);
  });

  /**
   * Le 24/08/2026, « Appliquer les corrections » envoyait un unique tour vide —
   * toute la matière était dans le prompt système. Anthropic écarte un message
   * sans contenu, OpenRouter transmettait donc une conversation de zéro
   * message, et l'erreur revenait de trois couches plus loin, en anglais.
   */
  it('refuse un tour vide, plutôt que de le laisser partir chez le fournisseur', async () => {
    await seedModel('m-openrouter', 'openrouter');

    const res = await call('/api/ai/chat', {
      modelId: 'm-openrouter', system: 'Tout est ici.', messages: [{ role: 'user', content: '   ' }],
    });

    expect(res.status).toBe(400);
    // Et rien n'est parti : le refus est le nôtre, pas celui d'un tiers.
    expect(outbound).toHaveLength(0);
  });

  it('un tour vide passe s’il accompagne un tour qui porte du contenu', async () => {
    await seedModel('m-onemin', 'onemin');

    const res = await call('/api/ai/chat', {
      modelId: 'm-onemin',
      messages: [{ role: 'user', content: 'Une vraie question' }, { role: 'assistant', content: '' }],
    });
    expect(res.status).toBe(200);
  });

  it('exige un jeton de session', async () => {
    const res = await app.fetch(new Request('https://api.test/api/ai/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: 'm', messages: [{ role: 'user', content: 'x' }] }),
    }), env as any);
    expect(res.status).toBe(401);
  });
});

describe('test d’un code avant enregistrement', () => {
  it('sonde un code qui n’est pas encore au catalogue', async () => {
    const res = await call('/api/ai/test', { apiCode: 'gpt-5.6-sol', provider: 'onemin' });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.available).toBe(true);
    expect(body.sample).toContain('réponse 1min');
  });

  it('utilise 1min.ai par défaut', async () => {
    await call('/api/ai/test', { apiCode: 'un-code' });
    expect(outbound[0].url).toContain('1min.ai');
  });

  it('refuse un code vide', async () => {
    expect((await call('/api/ai/test', { apiCode: '' })).status).toBe(400);
  });
});
