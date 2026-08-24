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
 * Le journal des productions (SPEC §2.6).
 *
 * Ce qui compte ici : la relecture à froid est la SEULE production IA qui ne
 * vise aucune colonne du contenu. Le journal est donc son unique domicile — et
 * la route doit savoir en rendre une seule ligne sans tout charger.
 */
describe('journal des productions', () => {
  const journalise = (id: string, kind: string, payload: string) =>
    post(`/api/contents/${id}/generations`, {
      kind, modelId: 'm1', modelLabel: 'Claude Fable 5', payload,
    });

  it('rend la dernière relecture à froid, et elle seule', async () => {
    const c = await createContent();
    await journalise(c.id, 'cold_read', '{"lecture_naive":{"sujet":"ancienne"}}');
    await journalise(c.id, 'draft', '{"body":"un brouillon"}');
    await journalise(c.id, 'cold_read', '{"lecture_naive":{"sujet":"la plus récente"}}');

    const res = await call(`/api/contents/${c.id}/generations?kind=cold_read&limit=1`);
    const { generations } = await res.json() as any;

    expect(generations).toHaveLength(1);
    expect(generations[0].payload).toContain('la plus récente');
    expect(generations[0].modelLabel).toBe('Claude Fable 5');
  });

  /** Un payload est un brouillon entier : sans borne, trente lignes font des centaines de Ko. */
  it('borne ce qu’elle rend, et plafonne ce qu’on lui demande', async () => {
    const c = await createContent();
    for (let i = 0; i < 5; i++) await journalise(c.id, 'draft', `{"n":${i}}`);

    const deux = await (await call(`/api/contents/${c.id}/generations?limit=2`)).json() as any;
    expect(deux.generations).toHaveLength(2);

    // Une demande absurde retombe sur le plafond, pas sur une erreur.
    const enorme = await (await call(`/api/contents/${c.id}/generations?limit=99999`)).json() as any;
    expect(enorme.generations).toHaveLength(5);

    // Et une demande invalide retombe sur la valeur par défaut.
    const bancale = await (await call(`/api/contents/${c.id}/generations?limit=abc`)).json() as any;
    expect(bancale.generations).toHaveLength(5);
  });

  it('sans borne demandée, rend du plus récent au plus ancien', async () => {
    const c = await createContent();
    await journalise(c.id, 'draft', '{"n":1}');
    await journalise(c.id, 'draft', '{"n":2}');

    const { generations } = await (await call(`/api/contents/${c.id}/generations`)).json() as any;
    expect(generations[0].payload).toContain('"n":2');
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

/**
 * Ce qu'un contenu a coûté (SPEC §2.6).
 *
 * Ce qui est protégé ici : `null` et `0` ne veulent PAS dire la même chose. Un
 * fournisseur muet n'est pas un fournisseur gratuit, et un total qui ignorerait
 * la différence ferait croire à une facture nulle là où on ne sait rien.
 */
describe('coût IA d’un contenu', () => {
  const lire = async (r: Response) => await r.json() as any;
  const creer = () => createContent();

  const journaliser = (id: string, extra: Record<string, unknown>) =>
    post(`/api/contents/${id}/generations`, {
      kind: 'draft', modelLabel: 'Claude Fable 5', payload: '{}', ...extra,
    });

  it('sans aucun appel, il n’y a rien à additionner', async () => {
    const content = await creer();
    const { cout } = await lire(await call(`/api/contents/${content.id}`));
    expect(cout).toEqual({ appels: 0, tokensEntree: null, tokensSortie: null, usd: null, appelsSansPrix: 0 });
  });

  it('additionne les jetons et le prix de chaque appel', async () => {
    const content = await creer();
    await journaliser(content.id, { promptTokens: 1000, completionTokens: 200, costUsd: 0.012 });
    await journaliser(content.id, { promptTokens: 500, completionTokens: 100, costUsd: 0.006 });

    const { cout } = await lire(await call(`/api/contents/${content.id}`));
    expect(cout.appels).toBe(2);
    expect(cout.tokensEntree).toBe(1500);
    expect(cout.tokensSortie).toBe(300);
    expect(cout.usd).toBeCloseTo(0.018, 6);
    expect(cout.appelsSansPrix).toBe(0);
  });

  /**
   * Le cas 1min.ai : il ne déclare aucun décompte. Le total reste vrai pour ce
   * qu'il couvre, et dit combien d'appels lui échappent.
   */
  it('compte les appels dont le prix est inconnu, sans les compter pour zéro', async () => {
    const content = await creer();
    await journaliser(content.id, { promptTokens: 1000, completionTokens: 200, costUsd: 0.012 });
    await journaliser(content.id, {}); // fournisseur muet

    const { cout } = await lire(await call(`/api/contents/${content.id}`));
    expect(cout.appels).toBe(2);
    expect(cout.usd).toBeCloseTo(0.012, 6);
    expect(cout.appelsSansPrix).toBe(1);
  });

  it('un contenu ne porte que SES appels', async () => {
    const a = await creer();
    const b = await creer();
    await journaliser(a.id, { promptTokens: 100, completionTokens: 10, costUsd: 0.001 });
    await journaliser(b.id, { promptTokens: 900, completionTokens: 90, costUsd: 0.009 });

    const { cout } = await lire(await call(`/api/contents/${a.id}`));
    expect(cout.usd).toBeCloseTo(0.001, 6);
  });

  it('le décompte revient tel qu’il a été posé', async () => {
    const content = await creer();
    await journaliser(content.id, { promptTokens: 1234, completionTokens: 567, costUsd: 0.0432 });

    const { generations } = await lire(await call(`/api/contents/${content.id}/generations`));
    expect(generations[0]).toMatchObject({ promptTokens: 1234, completionTokens: 567, costUsd: 0.0432 });
  });

  it('sans décompte, les colonnes restent nulles — pas à zéro', async () => {
    const content = await creer();
    await journaliser(content.id, {});
    const { generations } = await lire(await call(`/api/contents/${content.id}/generations`));
    expect(generations[0]).toMatchObject({ promptTokens: null, completionTokens: null, costUsd: null });
  });

  it('refuse un décompte négatif', async () => {
    const content = await creer();
    expect((await journaliser(content.id, { promptTokens: -5 })).status).toBe(400);
  });
});
