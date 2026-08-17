/**
 * @vitest-environment jsdom
 *
 * Tests de montage des écrans.
 *
 * Ce que ces tests protègent : le 16/08/2026, un useEffect placé après le
 * `if (!isOpen) return null;` de SettingsPanel a passé typecheck ET build, a été
 * déployé, et rendait une page blanche au clic sur Réglages (React refuse un
 * nombre de hooks variable entre deux rendus). Aucun outil statique ne voit ça —
 * seul un rendu réel le voit.
 *
 * D'où la règle : tout composant doit être monté ici, et tout composant qui a un
 * retour anticipé doit être monté dans les DEUX états.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';

import SettingsPanel from '../components/SettingsPanel';
import { LoginPage } from '../components/LoginPage';
import CalendarView from '../components/CalendarView';
import SubtitleConverter from '../components/SubtitleConverter';
import PsychedelicsCalculator from '../components/PsychedelicsCalculator';
import { SocialIdeasView } from '../components/Views/SocialIdeasView';
import { SocialGridView } from '../components/Views/SocialGridView';
import { ContentStatus, DEFAULT_DISPLAY_PREFS } from '../types';
import type { AIModel, ContentItem } from '../types';

const MODELS: AIModel[] = [
  { id: 'm1', name: 'GPT-5.2 Pro', apiCode: 'gpt-5.2-pro', provider: 'OpenAI', cost: 'high', strengths: '', bestUseCases: '', textQuality: 5, isDefault: true },
];

const ITEM: ContentItem = {
  id: 'i1', title: 'Le piège chinois', status: ContentStatus.DRAFTING, platforms: [],
  body: '', scheduledDate: null, notes: '', lastEdited: new Date().toISOString(),
  createdAt: new Date().toISOString(),
};

const noop = () => {};
const asyncNoop = async () => {};

beforeEach(() => {
  vi.stubGlobal('fetch', async () => new Response('{}', { status: 200 }));
});

afterEach(() => cleanup());

describe('SettingsPanel', () => {
  const props = {
    contexts: [] as any[],
    aiModels: MODELS,
    onModelsChange: noop,
    displayPrefs: DEFAULT_DISPLAY_PREFS,
    onDisplayPrefsChange: noop,
    onClose: noop,
  };

  it('se monte fermé sans planter', () => {
    expect(() => render(<SettingsPanel {...(props as any)} isOpen={false} />)).not.toThrow();
  });

  it('se monte ouvert sans planter', () => {
    expect(() => render(<SettingsPanel {...(props as any)} isOpen={true} />)).not.toThrow();
  });

  /**
   * LE test de non-régression : c'est la transition fermé → ouvert qui plantait.
   * Un hook déclaré après le retour anticipé change le nombre de hooks entre les
   * deux rendus, et React fait tomber tout l'arbre.
   */
  it('survit à la transition fermé → ouvert (régression page blanche)', () => {
    const { rerender, container } = render(<SettingsPanel {...(props as any)} isOpen={false} />);
    expect(() => rerender(<SettingsPanel {...(props as any)} isOpen={true} />)).not.toThrow();
    expect(container.textContent).toContain('Réglages');
  });

  it('affiche le catalogue de modèles une fois ouvert', () => {
    const { container } = render(<SettingsPanel {...(props as any)} isOpen={true} />);
    expect(container.textContent).toContain('Modèles IA');
  });
});

describe('écrans autonomes', () => {
  it('LoginPage se monte', () => {
    expect(() => render(<LoginPage onLoginSuccess={noop} />)).not.toThrow();
  });

  it('CalendarView se monte, y compris sans contenu', () => {
    expect(() => render(<CalendarView items={[]} onItemClick={noop} />)).not.toThrow();
  });

  it('SubtitleConverter se monte', () => {
    expect(() => render(<SubtitleConverter aiModels={MODELS} />)).not.toThrow();
  });

  it('PsychedelicsCalculator se monte', () => {
    expect(() => render(<PsychedelicsCalculator />)).not.toThrow();
  });
});

describe('vues de contenu', () => {
  const shared = {
    searchQuery: '',
    isInitializing: false,
    onEdit: noop,
    onNavigateToIdeas: noop,
    displayPrefs: DEFAULT_DISPLAY_PREFS,
  };

  it('SocialIdeasView se monte vide et peuplée', () => {
    expect(() => render(
      <SocialIdeasView {...(shared as any)} items={[]} onSearchChange={noop} onQuickAdd={asyncNoop} onGlobalAnalyze={noop} isSyncing={false} />
    )).not.toThrow();
    cleanup();
    expect(() => render(
      <SocialIdeasView {...(shared as any)} items={[ITEM]} onSearchChange={noop} onQuickAdd={asyncNoop} onGlobalAnalyze={noop} isSyncing={false} />
    )).not.toThrow();
  });

  it('SocialGridView se monte pour chaque type de liste', () => {
    for (const type of ['drafts', 'ready', 'archive'] as const) {
      expect(() => render(<SocialGridView {...(shared as any)} items={[ITEM]} type={type} />)).not.toThrow();
      cleanup();
    }
  });
});
