/**
 * Séries, catalogue de modèles, conversation Coach et journal des générations.
 * Mêmes conditions : vraie migration, vrai SQLite.
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

const post = (p: string, b: unknown) => call(p, { method: 'POST', body: JSON.stringify(b) });
const patch = (p: string, b: unknown) => call(p, { method: 'PATCH', body: JSON.stringify(b) });
const json = async (r: Response) => await r.json() as any;

beforeEach(async () => {
  env = makeEnv();
  token = await createSessionToken(env);
});

describe('séries', () => {
  const createSerie = async (over = {}) =>
    (await json(await post('/api/series', { titre: 'Qu’est-ce qu’un psychopraticien transpersonnel ?', ...over }))).serie;

  it('crée une série', async () => {
    const serie = await createSerie({ intention: 'Faire comprendre le métier' });
    expect(serie.titre).toContain('psychopraticien');
    expect(serie.statut).toBe('en_cours');
    expect(serie.sourceContentId).toBeNull();
  });

  it('exige un titre', async () => {
    expect((await post('/api/series', { intention: 'sans titre' })).status).toBe(400);
  });

  it('renvoie la série ET ses contenus en une seule lecture', async () => {
    const serie = await createSerie();
    for (const titre of ['A', 'B']) {
      await post('/api/contents', { title: titre, serieId: serie.id, angle: `angle ${titre}` });
    }
    const { serie: found, contents } = await json(await call(`/api/series/${serie.id}`));
    expect(found.id).toBe(serie.id);
    expect(contents).toHaveLength(2);
    expect(contents.map((x: any) => x.angle).sort()).toEqual(['angle A', 'angle B']);
  });

  /**
   * Une série est une progression : elle se relit dans l'ordre où elle a été
   * pensée, pas dans celui où la base rend les lignes.
   */
  it('rend les contenus dans l’ordre de la progression', async () => {
    const serie = await createSerie();
    // Créés à l'envers exprès : c'est le rang qui doit trancher, pas l'insertion.
    for (const [titre, rang] of [['Troisième', 3], ['Premier', 1], ['Deuxième', 2]] as const) {
      await post('/api/contents', { title: titre, serieId: serie.id, seriePosition: rang });
    }
    await post('/api/contents', { title: 'Rattaché à la main', serieId: serie.id });

    const { contents } = await json(await call(`/api/series/${serie.id}`));
    expect(contents.map((c: any) => c.title))
      .toEqual(['Premier', 'Deuxième', 'Troisième', 'Rattaché à la main']);
    expect(contents[0].seriePosition).toBe(1);
    expect(contents[3].seriePosition).toBeNull();
  });

  it('refuse un rang qui ne compte pas à partir de 1', async () => {
    const serie = await createSerie();
    expect((await post('/api/contents', { title: 'x', serieId: serie.id, seriePosition: 0 })).status).toBe(400);
  });

  it('supprimer une série DÉTACHE ses contenus sans les perdre', async () => {
    const serie = await createSerie();
    await post('/api/contents', { title: 'Enfant', serieId: serie.id });

    const res = await json(await call(`/api/series/${serie.id}`, { method: 'DELETE' }));
    expect(res.detachedContents).toBe(1);

    const { items } = await json(await call('/api/contents'));
    expect(items).toHaveLength(1);
    expect(items[0].serieId).toBeNull();
  });

  /**
   * La cascade (SPEC §3.3). Ce qui est protégé ici : le DÉFAUT reste le geste
   * sûr, et le contenu pilier n'est jamais emporté — il préexiste à la série
   * qu'il a fait naître.
   */
  it('sans le demander, une suppression ne détruit rien : c’est le détachement', async () => {
    const serie = await createSerie();
    await post('/api/contents', { title: 'Enfant', serieId: serie.id, seriePosition: 1 });

    const res = await json(await call(`/api/series/${serie.id}`, { method: 'DELETE' }));
    expect(res).toMatchObject({ deleted: true, detachedContents: 1, deletedContents: 0 });

    const { items } = await json(await call('/api/contents'));
    expect(items).toHaveLength(1);
  });

  it('détacher retire AUSSI le rang — une place dans une progression disparue n’en est pas une', async () => {
    const serie = await createSerie();
    await post('/api/contents', { title: 'Enfant', serieId: serie.id, seriePosition: 1 });

    await call(`/api/series/${serie.id}?contenus=detacher`, { method: 'DELETE' });

    const { items } = await json(await call('/api/contents'));
    expect(items[0].serieId).toBeNull();
    expect(items[0].seriePosition).toBeNull();
  });

  it('« supprimer » emporte les publications avec la série', async () => {
    const serie = await createSerie();
    await post('/api/contents', { title: 'Première', serieId: serie.id, seriePosition: 1 });
    await post('/api/contents', { title: 'Deuxième', serieId: serie.id, seriePosition: 2 });

    const res = await json(await call(`/api/series/${serie.id}?contenus=supprimer`, { method: 'DELETE' }));
    expect(res).toMatchObject({ deleted: true, detachedContents: 0, deletedContents: 2 });

    const { items } = await json(await call('/api/contents'));
    expect(items).toHaveLength(0);
  });

  it('la cascade n’emporte JAMAIS le contenu pilier', async () => {
    const article = (await json(await post('/api/contents', { title: 'Article sur le stress' }))).content;
    const serie = await createSerie({ sourceContentId: article.id });
    await post('/api/contents', { title: 'Déclinaison', serieId: serie.id, seriePosition: 1 });

    const res = await json(await call(`/api/series/${serie.id}?contenus=supprimer`, { method: 'DELETE' }));
    expect(res.deletedContents).toBe(1);

    const { items } = await json(await call('/api/contents'));
    expect(items.map((i: any) => i.title)).toEqual(['Article sur le stress']);
  });

  it('ne touche pas aux publications d’une AUTRE série', async () => {
    const a = await createSerie({ titre: 'A' });
    const b = await createSerie({ titre: 'B' });
    await post('/api/contents', { title: 'Chez A', serieId: a.id });
    await post('/api/contents', { title: 'Chez B', serieId: b.id });

    await call(`/api/series/${a.id}?contenus=supprimer`, { method: 'DELETE' });

    const { items } = await json(await call('/api/contents'));
    expect(items.map((i: any) => i.title)).toEqual(['Chez B']);
  });

  it('refuse un mode de suppression inventé', async () => {
    const serie = await createSerie();
    expect((await call(`/api/series/${serie.id}?contenus=pulveriser`, { method: 'DELETE' })).status).toBe(400);
  });

  it('une série déjà supprimée reste introuvable, quel que soit le mode', async () => {
    const serie = await createSerie();
    await call(`/api/series/${serie.id}`, { method: 'DELETE' });
    expect((await call(`/api/series/${serie.id}?contenus=supprimer`, { method: 'DELETE' })).status).toBe(404);
  });

  it('déclare un contenu pilier — le cas des déclinaisons', async () => {
    const article = (await json(await post('/api/contents', { title: 'Article sur le stress' }))).content;
    const serie = await createSerie({ sourceContentId: article.id });
    expect(serie.sourceContentId).toBe(article.id);
  });
});

describe('catalogue de modèles', () => {
  const createModel = async (over = {}) =>
    (await json(await post('/api/models', { name: 'GPT-5.6 Sol', apiCode: 'gpt-5.6-sol', ...over }))).model;

  it('route par défaut vers l’adaptateur 1min', async () => {
    const model = await createModel({ vendor: 'OpenAI' });
    expect(model.provider).toBe('onemin');
    expect(model.vendor).toBe('OpenAI');
  });

  it('distingue l’adaptateur du fabricant', async () => {
    const model = await createModel({ provider: 'openai', vendor: 'OpenAI' });
    expect(model.provider).toBe('openai');
  });

  it('n’admet qu’un seul modèle par défaut', async () => {
    const a = await createModel({ name: 'A', apiCode: 'a', isDefault: true });
    const b = await createModel({ name: 'B', apiCode: 'b', isDefault: true });

    const { items } = await json(await call('/api/models'));
    const defaults = items.filter((m: any) => m.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(b.id);
    expect(a.id).not.toBe(b.id);
  });

  it('refuse une qualité hors de l’échelle 1-5', async () => {
    expect((await post('/api/models', { name: 'x', apiCode: 'y', textQuality: 9 })).status).toBe(400);
  });

  it('exige un code API', async () => {
    expect((await post('/api/models', { name: 'Sans code' })).status).toBe(400);
  });
});

describe('conversation Coach', () => {
  const withContent = async () =>
    (await json(await post('/api/contents', { title: 'Sujet' }))).content;

  it('ajoute les messages un par un, sans réécrire la conversation', async () => {
    const content = await withContent();
    await post(`/api/contents/${content.id}/coach/messages`, { role: 'user', content: 'Bonjour' });
    await post(`/api/contents/${content.id}/coach/messages`, {
      role: 'assistant', content: 'Une première direction', quickReplies: ['Oui', 'Autrement'], readyForEditor: true,
    });

    const { coachSession } = await json(await call(`/api/contents/${content.id}`));
    expect(coachSession.messages).toHaveLength(2);
    expect(coachSession.messages[0].role).toBe('user');
    expect(coachSession.messages[1].quickReplies).toEqual(['Oui', 'Autrement']);
    expect(coachSession.messages[1].readyForEditor).toBe(true);
  });

  it('horodate la validation de la session', async () => {
    const content = await withContent();
    await patch(`/api/contents/${content.id}/coach`, { status: 'validated', brief: 'Le brief figé' });

    const { coachSession } = await json(await call(`/api/contents/${content.id}`));
    expect(coachSession.status).toBe('validated');
    expect(coachSession.brief).toBe('Le brief figé');
    expect(coachSession.validatedAt).toBeGreaterThan(0);
  });

  /**
   * Un tour écrit le message de Florent puis celui de l'assistant, parfois
   * dans la même milliseconde : sans départage par `rowid`, l'ordre de la
   * conversation devient indéterminé et le Verrouilleur relit un dialogue
   * mélangé.
   */
  it('rend les messages dans leur ordre d’écriture', async () => {
    const content = await withContent();
    for (const [role, texte] of [['user', 'un'], ['assistant', 'deux'], ['user', 'trois'], ['assistant', 'quatre']] as const) {
      await post(`/api/contents/${content.id}/coach/messages`, { role, content: texte });
    }

    const { coachSession } = await json(await call(`/api/contents/${content.id}`));
    expect(coachSession.messages.map((m: any) => m.content)).toEqual(['un', 'deux', 'trois', 'quatre']);
  });

  it('supprimer le contenu emporte ses messages', async () => {
    const content = await withContent();
    await post(`/api/contents/${content.id}/coach/messages`, { role: 'user', content: 'x' });
    // La suppression étant LOGIQUE, les messages restent — c'est voulu :
    // un contenu restauré doit retrouver sa conversation.
    await call(`/api/contents/${content.id}`, { method: 'DELETE' });
    expect((env.DB as unknown as TestD1).query('SELECT id FROM coach_messages')).toHaveLength(1);
  });
});

describe('journal des générations', () => {
  const withContent = async () =>
    (await json(await post('/api/contents', { title: 'Sujet' }))).content;

  it('journalise et applique en un seul geste', async () => {
    const content = await withContent();
    const payload = JSON.stringify({ format: 'Post Texte', accroche: 'A' });

    await post(`/api/contents/${content.id}/generations`, {
      kind: 'draft', target: 'draft', modelLabel: 'GPT-5.6 Sol', payload, apply: true,
    });

    const { content: updated } = await json(await call(`/api/contents/${content.id}`));
    // La colonne porte du JSON PUR : plus de signature collée derrière (SPEC §2.6)
    expect(updated.draft).toBe(payload);
    expect(() => JSON.parse(updated.draft)).not.toThrow();

    const { generations } = await json(await call(`/api/contents/${content.id}/generations`));
    expect(generations).toHaveLength(1);
    expect(generations[0].modelLabel).toBe('GPT-5.6 Sol');
  });

  it('journalise sans appliquer quand apply est absent', async () => {
    const content = await withContent();
    await post(`/api/contents/${content.id}/generations`, {
      kind: 'cold_read', modelLabel: 'Fable 5', payload: '{"corrections":[]}',
    });
    const { content: updated } = await json(await call(`/api/contents/${content.id}`));
    expect(updated.draft).toBeNull();
  });

  it('permet de revenir à une génération antérieure', async () => {
    const content = await withContent();
    const v1 = JSON.stringify({ format: 'Post Texte', accroche: 'Version 1' });
    const v2 = JSON.stringify({ format: 'Post Texte', accroche: 'Version 2' });

    const first = await json(await post(`/api/contents/${content.id}/generations`, {
      kind: 'draft', target: 'draft', modelLabel: 'M1', payload: v1, apply: true,
    }));
    await post(`/api/contents/${content.id}/generations`, {
      kind: 'adjustment', target: 'draft', modelLabel: 'M1', payload: v2, apply: true,
    });

    expect((await json(await call(`/api/contents/${content.id}`))).content.draft).toBe(v2);

    await post(`/api/contents/${content.id}/generations/${first.generation.id}/revert`, {});
    expect((await json(await call(`/api/contents/${content.id}`))).content.draft).toBe(v1);
  });

  it('le retour AJOUTE une ligne au lieu de rembobiner le journal', async () => {
    const content = await withContent();
    const first = await json(await post(`/api/contents/${content.id}/generations`, {
      kind: 'draft', target: 'draft', modelLabel: 'M1', payload: '{"a":1}', apply: true,
    }));
    await post(`/api/contents/${content.id}/generations/${first.generation.id}/revert`, {});

    const { generations } = await json(await call(`/api/contents/${content.id}/generations`));
    expect(generations).toHaveLength(2);
    expect(generations[0].instruction).toContain('Retour à la génération');
  });

  it('filtre par nature', async () => {
    const content = await withContent();
    await post(`/api/contents/${content.id}/generations`, { kind: 'draft', modelLabel: 'M', payload: '{}' });
    await post(`/api/contents/${content.id}/generations`, { kind: 'analysis', modelLabel: 'M', payload: '{}' });

    const { generations } = await json(await call(`/api/contents/${content.id}/generations?kind=analysis`));
    expect(generations).toHaveLength(1);
    expect(generations[0].kind).toBe('analysis');
  });

  it('refuse une nature inconnue', async () => {
    const content = await withContent();
    const res = await post(`/api/contents/${content.id}/generations`, {
      kind: 'brainstorm', modelLabel: 'M', payload: '{}',
    });
    expect(res.status).toBe(400);
  });
});
