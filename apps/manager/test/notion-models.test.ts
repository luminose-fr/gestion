/**
 * notionService — sauvegarde des modèles IA.
 *
 * Ce que ces tests protègent : createModel/updateModel envoyaient autrefois des
 * noms ET des types de colonnes devinés. Une seule divergence avec le schéma
 * Notion faisait rejeter toute la requête en 400, et l'échec était avalé.
 * Le schéma ci-dessous est volontairement piégeux (accent sur « Coût »,
 * apostrophe typographique, Fournisseur en select, colonne calculée).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CONFIG } from '../config';
import * as Notion from '../services/notionService';

const SCHEMA = {
  "Nom": { id: 'title', name: 'Nom', type: 'title', title: {} },
  "Code API": { id: 'a', name: 'Code API', type: 'rich_text', rich_text: {} },
  "Fournisseur": { id: 'b', name: 'Fournisseur', type: 'select', select: { options: [{ name: 'OpenAI' }] } },
  "Coût": { id: 'c', name: 'Coût', type: 'select', select: { options: [{ name: 'low' }, { name: 'high' }] } },
  "Forces": { id: 'd', name: 'Forces', type: 'rich_text', rich_text: {} },
  "Cas d’usage": { id: 'e', name: 'Cas d’usage', type: 'rich_text', rich_text: {} },
  "Qualité Rédaction": { id: 'f', name: 'Qualité Rédaction', type: 'number', number: {} },
  "Défaut": { id: 'g', name: 'Défaut', type: 'checkbox', checkbox: {} },
  // Colonne calculée : ne doit jamais être écrite
  "Dernière MAJ": { id: 'h', name: 'Dernière MAJ', type: 'last_edited_time', last_edited_time: {} },
};

const PAGE = {
  id: 'page-1',
  properties: {
    "Nom": { type: 'title', title: [{ plain_text: 'GPT-5.2 Pro' }] },
    "Code API": { type: 'rich_text', rich_text: [{ plain_text: 'gpt-5.2-pro' }] },
    "Fournisseur": { type: 'select', select: { name: 'OpenAI' } },
    "Coût": { type: 'select', select: { name: 'high' } },
    "Forces": { type: 'rich_text', rich_text: [{ plain_text: 'Structure longue' }] },
    "Cas d’usage": { type: 'rich_text', rich_text: [] },
    "Qualité Rédaction": { type: 'number', number: 5 },
    "Défaut": { type: 'checkbox', checkbox: true },
  },
};

const MODEL = {
  id: 'page-1', name: 'GPT-5.2 Pro', apiCode: 'gpt-5.2-pro', provider: 'OpenAI',
  cost: 'high' as const, strengths: 'Structure longue', bestUseCases: '', textQuality: 5,
};

let calls: Array<{ url: string; method: string; body: any }>;

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const stubNotion = (pageResponse: () => Response) => {
  vi.stubGlobal('fetch', async (url: string, options: any = {}) => {
    const method = options.method || 'GET';
    calls.push({ url: String(url), method, body: options.body ? JSON.parse(options.body) : undefined });
    if (String(url).includes('/v1/databases/')) return json({ data_sources: [{ id: 'ds-1' }] });
    if (String(url).endsWith('/data_sources/ds-1')) return json({ object: 'data_source', id: 'ds-1', properties: SCHEMA });
    return pageResponse();
  });
};

beforeEach(() => {
  calls = [];
  CONFIG.NOTION_MODELS_DB_ID = 'db-models-123';
  vi.stubGlobal('localStorage', { getItem: () => 'jeton', setItem: () => {}, removeItem: () => {} });
  stubNotion(() => json(PAGE));
});

describe('createModel', () => {
  it('écrit chaque colonne selon son type réel dans Notion', async () => {
    await Notion.createModel(MODEL);
    const props = calls.find(c => c.method === 'POST' && c.url.endsWith('/pages'))!.body.properties;

    expect(Array.isArray(props['Nom'].title)).toBe(true);
    expect(Array.isArray(props['Code API'].rich_text)).toBe(true);
    // Fournisseur est un select dans ce schéma, pas un rich_text
    expect(props['Fournisseur'].select.name).toBe('OpenAI');
    expect(props['Qualité Rédaction'].number).toBe(5);
  });

  it('retrouve les colonnes malgré accent et apostrophe typographique', async () => {
    await Notion.createModel(MODEL);
    const props = calls.find(c => c.method === 'POST' && c.url.endsWith('/pages'))!.body.properties;
    expect(props['Coût'].select.name).toBe('high');
    expect(props).toHaveProperty('Cas d’usage');
  });

  it('n’écrit jamais dans une colonne calculée', async () => {
    await Notion.createModel(MODEL);
    const props = calls.find(c => c.method === 'POST' && c.url.endsWith('/pages'))!.body.properties;
    expect(props).not.toHaveProperty('Dernière MAJ');
  });

  it('rattache la page au data source', async () => {
    await Notion.createModel(MODEL);
    const body = calls.find(c => c.method === 'POST' && c.url.endsWith('/pages'))!.body;
    expect(body.parent.data_source_id).toBe('ds-1');
  });
});

describe('mapNotionPageToModel (via la page renvoyée)', () => {
  it('relit les valeurs quel que soit le type de colonne', async () => {
    const created = await Notion.createModel(MODEL);
    expect(created.name).toBe('GPT-5.2 Pro');
    expect(created.provider).toBe('OpenAI');   // select
    expect(created.cost).toBe('high');          // select accentué
    expect(created.textQuality).toBe(5);        // number
    expect(created.isDefault).toBe(true);       // checkbox
  });
});

describe('updateModel', () => {
  it('patche la bonne page et réutilise le schéma en cache', async () => {
    await Notion.createModel(MODEL);
    calls = [];
    await Notion.updateModel(MODEL);

    const patch = calls.find(c => c.method === 'PATCH')!;
    expect(patch.url).toMatch(/\/pages\/page-1$/);
    expect(patch.body.properties['Fournisseur'].select.name).toBe('OpenAI');
    // Le schéma ne doit pas être rechargé à chaque écriture
    expect(calls.some(c => c.url.endsWith('/data_sources/ds-1'))).toBe(false);
  });

  it('propage l’erreur Notion au lieu de l’avaler', async () => {
    stubNotion(() => json({ message: 'Coût is not a property that exists' }, 400));
    await expect(Notion.updateModel(MODEL)).rejects.toThrow('Coût is not a property that exists');
  });
});
