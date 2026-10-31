/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { stagePendingContent, acknowledgePendingContent, getPendingContents } from '../services/storageService';
import type { ContentItem } from '../types';

afterEach(() => localStorage.clear());
describe('les écritures en attente', () => {
  it('survivent à la relecture du stockage et ne sont pas acquittées par une réponse ancienne', () => {
    const avant = { id: 'c1', title: 'Avant' } as ContentItem;
    const apres = { ...avant, title: 'Après' };
    stagePendingContent(avant);
    stagePendingContent(apres);
    acknowledgePendingContent(avant);
    expect(getPendingContents()).toEqual([apres]);
    acknowledgePendingContent(apres);
    expect(getPendingContents()).toEqual([]);
  });
  it('ne confond pas deux contenus et tolère un stockage corrompu', () => {
    localStorage.setItem('luminose_pending_contents', '{');
    expect(getPendingContents()).toEqual([]);
    stagePendingContent({ id: 'a', title: 'A' } as ContentItem);
    stagePendingContent({ id: 'b', title: 'B' } as ContentItem);
    acknowledgePendingContent({ id: 'a', title: 'A' } as ContentItem);
    expect(getPendingContents().map(i => i.id)).toEqual(['b']);
  });
});
