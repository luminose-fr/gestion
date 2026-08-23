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

import SettingsSpace from '../components/Settings/SettingsSpace';
import { SETTINGS_SECTIONS } from '../components/Settings/sections';
import { LoginPage } from '../components/LoginPage';
import CalendarView from '../components/CalendarView';
import SubtitleConverter from '../components/SubtitleConverter';
import PsychedelicsCalculator from '../components/PsychedelicsCalculator';
import { SocialIdeasView } from '../components/Views/SocialIdeasView';
import { SocialGridView } from '../components/Views/SocialGridView';
import { SeriesView } from '../components/Series/SeriesView';
import { SeriePlanView } from '../components/Series/SeriePlanView';
import { ContentStatus, DEFAULT_DISPLAY_PREFS } from '../types';
import type { AIModel, ContentItem, Serie } from '../types';

const now = Date.now();

const MODELS: AIModel[] = [
  {
    id: 'm1', name: 'GPT-5.2 Pro', apiCode: 'gpt-5.2-pro',
    provider: 'onemin', vendor: 'OpenAI', cost: 'high',
    strengths: '', bestUseCases: '', textQuality: 5, isDefault: true,
    createdAt: now, updatedAt: now, deletedAt: null,
  },
];

const ITEM: ContentItem = {
  id: 'i1', title: 'Le piège chinois', status: ContentStatus.DRAFTING, platforms: [],
  targetFormat: null, objectif: null, depth: null,
  analyzedAt: null, verdict: null, strategicAngle: null, justification: null,
  suggestedMetaphor: null, notes: '', draft: null, slides: null,
  coachStatus: null, coachFormatCible: null, coachBrief: null, coachValidatedAt: null,
  serieId: null, angle: null, scheduledDate: null, legacyJson: null,
  createdAt: now, updatedAt: now, deletedAt: null,
};

const SERIE: Serie = {
  id: 's1', titre: 'Qu’est-ce qu’un psychopraticien transpersonnel ?',
  intention: 'Faire comprendre le métier', statut: 'en_cours', sourceContentId: null,
  createdAt: now, updatedAt: now, deletedAt: null,
};

const noop = () => {};
const asyncNoop = async () => {};

beforeEach(() => {
  vi.stubGlobal('fetch', async () => new Response('{}', { status: 200 }));
});

afterEach(() => cleanup());

describe('espace Réglages', () => {
  const props = {
    displayPrefs: DEFAULT_DISPLAY_PREFS,
    onDisplayPrefsChange: noop,
    aiModels: MODELS,
    onModelsChange: noop,
    activeModelId: 'm1',
    onActiveModelChange: noop,
    actionModels: {},
    onActionModelsChange: noop,
    providers: [
      { id: 'onemin', label: '1min.ai', configured: true, hint: '…f4d9', source: 'environnement' as const, updatedAt: null },
      { id: 'openrouter', label: 'OpenRouter', configured: true, hint: '…0000', source: 'base' as const, updatedAt: 1 },
      { id: 'openai', label: 'OpenAI', configured: false, hint: null, source: null, updatedAt: null },
    ],
    onProvidersChange: noop,
  };

  /**
   * Chaque section est un état de rendu distinct — c'est la règle née de la
   * page blanche de SettingsPanel : ce qui n'est pas monté ici n'est vérifié
   * par rien.
   */
  it.each(SETTINGS_SECTIONS.map(s => s.id))('la section %s se monte', (section) => {
    expect(() => render(<SettingsSpace {...(props as any)} section={section} />)).not.toThrow();
  });

  it('range le catalogue sous ses adaptateurs', () => {
    const { container } = render(<SettingsSpace {...(props as any)} section="models" />);
    expect(container.textContent).toContain('1min.ai');
    expect(container.textContent).toContain('OpenRouter');
    // Le modèle de test est sur l'adaptateur onemin : il tombe sous son groupe,
    // et l'adaptateur sans modèle le dit plutôt que de disparaître.
    expect(container.textContent).toContain('GPT-5.2 Pro');
    // OpenRouter a une clé mais aucun modèle : il se montre, et il le dit.
    expect(container.textContent).toContain('Aucun modèle sur cet adaptateur');
  });

  it('groupe les actions par ce qu’elles demandent, et le dit', () => {
    const { container } = render(<SettingsSpace {...(props as any)} section="presets" />);
    expect(container.textContent).toContain('Ce qui compte vraiment');
    for (const famille of ['Juger', 'Recopier', 'Synthétiser', 'Porter la voix']) {
      expect(container.textContent).toContain(famille);
    }
  });

  it('les sélecteurs d’action rangent les modèles sous leur adaptateur', () => {
    const { container } = render(<SettingsSpace {...(props as any)} section="presets" />);
    const groupes = container.querySelectorAll('optgroup');
    expect(groupes.length).toBeGreaterThan(0);
    expect(Array.from(groupes).map(g => g.getAttribute('label'))).toContain('1min.ai');
  });

  /**
   * Trois adaptateurs, deux avec une clé, des modèles sur un seul : OpenRouter
   * se montre vide (il a une clé, on va lui en ajouter), OpenAI disparaît.
   * On compte le message de groupe vide — « OpenAI » apparaît aussi comme
   * FABRICANT sur une carte, ce qui ne dit rien du catalogue.
   */
  it('laisse hors du catalogue un adaptateur sans clé ni modèle', () => {
    const { container } = render(<SettingsSpace {...(props as any)} section="models" />);
    const vides = container.textContent?.match(/Aucun modèle sur cet adaptateur/g) ?? [];
    expect(vides).toHaveLength(1);
  });

  it('n’affiche jamais autre chose que l’empreinte d’une clé', () => {
    const { container } = render(<SettingsSpace {...(props as any)} section="providers" />);
    expect(container.textContent).toContain('…f4d9');
    expect(container.textContent).toContain('Aucune clé');
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

describe('séries', () => {
  it('SeriesView se monte vide et peuplée', () => {
    const { container } = render(
      <SeriesView series={[]} contents={[]} isInitializing={false} isSyncing={false} onOpen={noop} onCreate={asyncNoop} />
    );
    expect(container.textContent).toContain('Aucune série');
    cleanup();

    const populated = render(
      <SeriesView series={[SERIE]} contents={[ITEM]} isInitializing={false} isSyncing={false} onOpen={noop} onCreate={asyncNoop} />
    );
    expect(populated.container.textContent).toContain('psychopraticien');
  });

  const planProps = {
    contents: [] as ContentItem[],
    sourceContent: null,
    onBack: noop,
    onUpdate: asyncNoop,
    onDelete: asyncNoop,
    onCreateContents: asyncNoop,
    onOpenContent: noop,
    onGeneratePlan: async () => [],
  };

  it('SeriePlanView se monte avec un plan vide', () => {
    const { container } = render(<SeriePlanView {...(planProps as any)} serie={SERIE} />);
    expect(container.textContent).toContain('Plan de publication');
    expect(container.textContent).toContain('Le plan est vide');
  });

  /** Le pilier et les contenus rattachés sont deux rendus distincts du même écran. */
  it('SeriePlanView se monte avec un contenu pilier et des contenus rattachés', () => {
    const serieWithSource: Serie = { ...SERIE, sourceContentId: ITEM.id };
    const { container } = render(
      <SeriePlanView
        {...(planProps as any)}
        serie={serieWithSource}
        sourceContent={ITEM}
        contents={[{ ...ITEM, serieId: SERIE.id, angle: 'La mécanique du piège' }]}
      />
    );
    expect(container.textContent).toContain('Contenu pilier');
    expect(container.textContent).toContain('La mécanique du piège');
  });
});
