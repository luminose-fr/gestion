/**
 * notionService — écriture du contenu.
 *
 * Les champs body / slides / postCourt / scriptVideo contiennent du JSON.
 * Ils doivent traverser Notion sans être réinterprétés : `markdownToNotion`
 * découpe le texte sur `**`, `_`, backticks, `~` et `[texte](url)`, ce qui n'a
 * aucun sens sur du JSON et n'offre aucune garantie sur des marqueurs
 * déséquilibrés. `rawTextToNotion` existe pour ça.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Notion from '../services/notionService';
import { CONFIG } from '../config';
import { ContentStatus } from '../types';
import type { ContentItem } from '../types';

let calls: Array<{ url: string; method: string; body: any }>;

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  calls = [];
  vi.stubGlobal('localStorage', { getItem: () => 'jeton', setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal('fetch', async (url: string, options: any = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined });
    return json({ id: 'page-1', properties: {} });
  });
});

/** Reconstitue le texte que Notion stockera à partir des segments rich_text envoyés. */
const richTextToPlain = (segments: any[]): string =>
  segments.map(s => s.text.content).join('');

const baseItem = (over: Partial<ContentItem>): ContentItem => ({
  id: 'page-1', title: 'Titre', status: ContentStatus.DRAFTING, platforms: [],
  body: '', scheduledDate: null, notes: '', lastEdited: '', createdAt: '',
  ...over,
});

describe('champs JSON', () => {
  // Du JSON qui contient exactement les marqueurs que le parseur markdown mange
  const TRICKY = JSON.stringify({
    format: 'Post Texte',
    accroche: 'Un **choc** et un _doute_',
    corps: 'Underscores nus : intention_visuelle et prompt_dzine. Un lien [ici](https://luminose.fr).',
    cta: 'Tilde ~ isolé et backtick ` orphelin',
  });

  it.each([
    ['body', 'Contenu'],
    ['slides', 'Slides'],
    ['postCourt', 'Post Court'],
    ['scriptVideo', 'Script vidéo'],
  ])('%s traverse Notion sans altération', async (field, column) => {
    await Notion.updateContent(baseItem({ [field]: TRICKY } as any));

    const patch = calls.find(c => c.method === 'PATCH')!;
    const segments = patch.body.properties[column].rich_text;
    expect(richTextToPlain(segments)).toBe(TRICKY);
  });

  it('n’applique aucune annotation de style sur du JSON', async () => {
    await Notion.updateContent(baseItem({ body: TRICKY }));
    const segments = calls.find(c => c.method === 'PATCH')!.body.properties['Contenu'].rich_text;
    expect(segments.some((s: any) => s.annotations)).toBe(false);
  });

  it('découpe toujours en segments de 2000 caractères maximum', async () => {
    const long = JSON.stringify({ format: 'Post Texte', corps: 'x'.repeat(5000) });
    await Notion.updateContent(baseItem({ body: long }));
    const segments = calls.find(c => c.method === 'PATCH')!.body.properties['Contenu'].rich_text;
    expect(segments.every((s: any) => s.text.content.length <= 2000)).toBe(true);
    expect(richTextToPlain(segments)).toBe(long);
  });

  it('conserve le markdown dans les champs réellement rédigés', async () => {
    // Notes et Angle stratégique sont du texte humain : le markdown y garde son sens
    await Notion.updateContent(baseItem({ notes: 'Un **gras** volontaire' }));
    const segments = calls.find(c => c.method === 'PATCH')!.body.properties['Notes'].rich_text;
    expect(segments.some((s: any) => s.annotations?.bold)).toBe(true);
  });
});

describe('fetchLiveContentIds', () => {
  it('ne renvoie que les pages encore vivantes', async () => {
    CONFIG.NOTION_CONTENT_DB_ID = 'db-content';
    vi.stubGlobal('fetch', async (url: string) => {
      if (String(url).includes('/v1/databases/')) return json({ data_sources: [{ id: 'ds' }] });
      return json({
        results: [
          { id: 'vivant-1', archived: false, in_trash: false },
          { id: 'archive', archived: true, in_trash: false },
          { id: 'corbeille', archived: false, in_trash: true },
          { id: 'vivant-2', archived: false, in_trash: false },
        ],
        has_more: false,
      });
    });

    const ids = await Notion.fetchLiveContentIds();
    expect([...ids].sort()).toEqual(['vivant-1', 'vivant-2']);
  });
});
