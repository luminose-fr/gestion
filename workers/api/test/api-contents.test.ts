/**
 * Routes des contenus — exécutées contre le VRAI fichier de migration, dans un
 * SQLite réel (voir helpers/d1.ts). Ces tests couvrent donc aussi le schéma.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index';
import { createSessionToken } from '../src/auth';
import { makeEnv, TestD1 } from './helpers/d1';

let env: ReturnType<typeof makeEnv>;
let token: string;

const call = (path: string, init: RequestInit = {}) =>
  app.fetch(new Request(`https://api.test${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Session-Token': token, ...(init.headers || {}) },
  }), env as any);

const post = (path: string, body: unknown) => call(path, { method: 'POST', body: JSON.stringify(body) });
const patch = (path: string, body: unknown) => call(path, { method: 'PATCH', body: JSON.stringify(body) });

const createContent = async (over: Record<string, unknown> = {}) => {
  const res = await post('/api/contents', { title: 'Le piège chinois', ...over });
  return (await res.json() as any).content;
};

beforeEach(async () => {
  env = makeEnv();
  token = await createSessionToken(env);
});

describe('authentification', () => {
  it('refuse un accès sans jeton', async () => {
    const res = await app.fetch(new Request('https://api.test/api/contents'), env as any);
    expect(res.status).toBe(401);
  });
});

describe('création', () => {
  it('crée un contenu avec les valeurs par défaut du schéma', async () => {
    const res = await post('/api/contents', { title: 'Le piège chinois' });
    expect(res.status).toBe(201);
    const { content } = await res.json() as any;
    expect(content.title).toBe('Le piège chinois');
    expect(content.status).toBe('Idée');
    expect(content.platforms).toEqual([]);
    expect(content.notes).toBe('');
    expect(content.deletedAt).toBeNull();
    expect(content.createdAt).toBeGreaterThan(0);
  });

  it('sérialise les plateformes en tableau JSON', async () => {
    const content = await createContent({ platforms: ['Instagram', 'LinkedIn'] });
    expect(content.platforms).toEqual(['Instagram', 'LinkedIn']);
  });

  it('refuse un statut inconnu', async () => {
    const res = await post('/api/contents', { title: 'x', status: 'Archivé' });
    expect(res.status).toBe(400);
    expect((await res.json() as any).error).toBe('Entrée invalide');
  });

  it('refuse un format cible inconnu', async () => {
    expect((await post('/api/contents', { title: 'x', targetFormat: 'Tweet' })).status).toBe(400);
  });

  it('refuse une date de publication mal formée', async () => {
    expect((await post('/api/contents', { title: 'x', scheduledDate: '17/08/2026' })).status).toBe(400);
  });
});

describe('mise à jour', () => {
  it('ne touche que les champs fournis', async () => {
    const created = await createContent({ notes: 'Notes initiales' });
    const res = await patch(`/api/contents/${created.id}`, { title: 'Nouveau titre' });
    const { content } = await res.json() as any;
    expect(content.title).toBe('Nouveau titre');
    expect(content.notes).toBe('Notes initiales');
  });

  it('horodate l’analyse au lieu de stocker un booléen', async () => {
    const created = await createContent();
    expect(created.analyzedAt).toBeNull();
    // L'analyse a lieu côté client : c'est lui qui fournit la date
    const at = Date.now();
    const { content } = await (await patch(`/api/contents/${created.id}`, { analyzedAt: at })).json() as any;
    expect(content.analyzedAt).toBe(at);
  });

  it('refuse une date d’analyse non numérique', async () => {
    const created = await createContent();
    expect((await patch(`/api/contents/${created.id}`, { analyzedAt: 'hier' })).status).toBe(400);
  });

  it('avance updated_at', async () => {
    const created = await createContent();
    await new Promise((r) => setTimeout(r, 2));
    const { content } = await (await patch(`/api/contents/${created.id}`, { title: 'x' })).json() as any;
    expect(content.updatedAt).toBeGreaterThan(created.updatedAt);
  });

  it('renvoie 404 sur un contenu inconnu', async () => {
    expect((await patch('/api/contents/inexistant', { title: 'x' })).status).toBe(404);
  });
});

describe('suppression logique', () => {
  it('marque la ligne au lieu de l’effacer', async () => {
    const created = await createContent();
    expect((await call(`/api/contents/${created.id}`, { method: 'DELETE' })).status).toBe(200);

    const rows = (env.DB as unknown as TestD1).query('SELECT deleted_at FROM contents WHERE id = ?', created.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].deleted_at).toBeGreaterThan(0);
  });

  it('la retire de la liste courante', async () => {
    const created = await createContent();
    await call(`/api/contents/${created.id}`, { method: 'DELETE' });
    const { items } = await (await call('/api/contents')).json() as any;
    expect(items).toHaveLength(0);
  });

  it('refuse de supprimer deux fois', async () => {
    const created = await createContent();
    await call(`/api/contents/${created.id}`, { method: 'DELETE' });
    expect((await call(`/api/contents/${created.id}`, { method: 'DELETE' })).status).toBe(404);
  });
});

describe('synchronisation incrémentale', () => {
  it('remonte les lignes supprimées, pour que le client purge son cache', async () => {
    const created = await createContent();
    const since = created.updatedAt;
    await new Promise((r) => setTimeout(r, 2));
    await call(`/api/contents/${created.id}`, { method: 'DELETE' });

    const { items } = await (await call(`/api/contents?since=${since}`)).json() as any;
    expect(items).toHaveLength(1);
    expect(items[0].deletedAt).toBeGreaterThan(0);
  });

  it('ne remonte rien quand rien n’a changé', async () => {
    const created = await createContent();
    const { items } = await (await call(`/api/contents?since=${created.updatedAt}`)).json() as any;
    expect(items).toHaveLength(0);
  });

  it('refuse un since non numérique', async () => {
    expect((await call('/api/contents?since=hier')).status).toBe(400);
  });
});

describe('création en lot', () => {
  it('crée tous les contenus d’un plan de série', async () => {
    const res = await post('/api/contents/batch', {
      items: [
        { title: 'Post 1', angle: 'La mécanique du piège' },
        { title: 'Post 2', angle: 'Pourquoi on tire plus fort' },
        { title: 'Post 3', angle: 'Lâcher pour sortir' },
      ],
    });
    expect(res.status).toBe(201);
    const { items } = await res.json() as any;
    expect(items).toHaveLength(3);
    expect(items.map((i: any) => i.angle).sort()).toContain('Lâcher pour sortir');
  });

  it('n’écrit rien si un seul élément est invalide', async () => {
    const res = await post('/api/contents/batch', {
      items: [{ title: 'Valide' }, { title: 'Invalide', status: 'Archivé' }],
    });
    expect(res.status).toBe(400);
    expect((env.DB as unknown as TestD1).query('SELECT id FROM contents')).toHaveLength(0);
  });

  it('refuse un lot vide', async () => {
    expect((await post('/api/contents/batch', { items: [] })).status).toBe(400);
  });
});

/**
 * La session Coach (SPEC §2.7).
 *
 * Ce qui compte ici : la conversation est append-only, mais l'atelier ne doit
 * pas être un aller SANS RETOUR. Un modèle qui rend du JSON illisible, une
 * rédaction qui échoue derrière, et la publication devenait intouchable.
 */
describe('session Coach', () => {
  const ajouteMessage = (id: string, role: string, content: string) =>
    post(`/api/contents/${id}/coach/messages`, { role, content });

  const lire = async (id: string) => (await (await call(`/api/contents/${id}`)).json() as any);

  it('rouvre une session validée sans toucher à la conversation', async () => {
    const c = await createContent();
    await ajouteMessage(c.id, 'user', 'Je veux parler du piège chinois.');
    await ajouteMessage(c.id, 'assistant', 'Voici une direction.');
    await patch(`/api/contents/${c.id}/coach`, { status: 'validated', brief: '{"structure":[]}' });

    let vue = await lire(c.id);
    expect(vue.coachSession.status).toBe('validated');
    expect(vue.coachSession.validatedAt).toBeTruthy();

    await patch(`/api/contents/${c.id}/coach`, { status: 'in_progress' });

    vue = await lire(c.id);
    expect(vue.coachSession.status).toBe('in_progress');
    expect(vue.coachSession.validatedAt).toBeNull();
    expect(vue.coachSession.messages).toHaveLength(2);
  });

  it('réinitialise : la conversation sort de la vue et l’état repart à zéro', async () => {
    const c = await createContent({ targetFormat: 'Post Texte (Court)' });
    await ajouteMessage(c.id, 'user', 'Premier tour.');
    await ajouteMessage(c.id, 'assistant', '{"message":"…"} du JSON illisible');
    await patch(`/api/contents/${c.id}/coach`, { status: 'validated', formatCible: 'Post Texte (Court)', brief: '{"structure":[]}' });

    const res = await call(`/api/contents/${c.id}/coach`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ reset: true, messages: 2 });

    const vue = await lire(c.id);
    expect(vue.coachSession.messages).toHaveLength(0);
    expect(vue.coachSession.status).toBeNull();
    expect(vue.coachSession.brief).toBeNull();
    expect(vue.coachSession.validatedAt).toBeNull();
    expect(vue.coachSession.formatCible).toBeNull();
  });

  /** Le motif même de la réinitialisation est de vouloir relire ce qui s'est passé. */
  it('ne détruit pas les messages : ils sont marqués, pas effacés', async () => {
    const c = await createContent();
    await ajouteMessage(c.id, 'user', 'Ce que j’ai écrit doit survivre.');
    await call(`/api/contents/${c.id}/coach`, { method: 'DELETE' });

    const lignes = (env.DB as unknown as TestD1).query('SELECT content, deleted_at FROM coach_messages');
    expect(lignes).toHaveLength(1);
    expect((lignes[0] as any).content).toBe('Ce que j’ai écrit doit survivre.');
    expect((lignes[0] as any).deleted_at).toBeTruthy();
  });

  it('le brouillon n’est pas touché — on jette l’atelier, pas ce qui en est sorti', async () => {
    const c = await createContent();
    await patch(`/api/contents/${c.id}`, { draft: '{"body":"un brouillon rédigé"}' });
    await ajouteMessage(c.id, 'assistant', 'Direction.');

    await call(`/api/contents/${c.id}/coach`, { method: 'DELETE' });

    const vue = await lire(c.id);
    expect(vue.content.draft).toBe('{"body":"un brouillon rédigé"}');
  });

  it('une seconde réinitialisation ne compte pas les messages déjà retirés', async () => {
    const c = await createContent();
    await ajouteMessage(c.id, 'user', 'Un tour.');
    await call(`/api/contents/${c.id}/coach`, { method: 'DELETE' });

    const res = await call(`/api/contents/${c.id}/coach`, { method: 'DELETE' });
    expect(await res.json()).toMatchObject({ reset: true, messages: 0 });
  });

  it('404 sur un contenu inconnu', async () => {
    const res = await call('/api/contents/inexistant/coach', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('exige un jeton de session', async () => {
    const c = await createContent();
    const res = await app.fetch(
      new Request(`https://api.test/api/contents/${c.id}/coach`, { method: 'DELETE' }), env as any);
    expect(res.status).toBe(401);
  });
});
