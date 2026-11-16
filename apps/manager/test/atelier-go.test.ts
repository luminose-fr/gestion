/**
 * @vitest-environment jsdom
 *
 * Le « Go » de l'atelier.
 *
 * Le 16/11/2026, sur « Vous n'êtes pas organisé, vous êtes en poste de
 * garde », « Go, passe à l'Éditeur » — la réponse rapide que le prompt du
 * Coach lui fait proposer — est parti au Coach comme un message ordinaire :
 * la conversation a continué, rien n'est passé au Rédacteur. L'écran posait
 * pourtant son propre « Go », au libellé identique, qui lui validait.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { estUnGo, useAtelier } from '../components/Contenu/useAtelier';
import { buildAssistantMessage, createEmptySession, withMessage } from '../services/coachService';

describe('estUnGo', () => {
  it.each([
    'go', 'Go', 'GO !', 'go.',
    "Go, passe à l'Éditeur", 'Go, passe à l’Éditeur', "go passe à l'éditeur !",
    'Go, on passe au Rédacteur',
  ])('« %s » valide', (texte) => expect(estUnGo(texte)).toBe(true));

  it.each([
    "go, mais change l'accroche", 'Gorge serrée, oui', 'good', 'On y go demain',
  ])('« %s » reste un message au Coach', (texte) => expect(estUnGo(texte)).toBe(false));
});

describe('useAtelier', () => {
  const avecDernierMessage = (quickReplies: string[], readyForEditor: boolean) =>
    withMessage(createEmptySession(null), buildAssistantMessage('c1', {
      message: 'La direction tient.', quickReplies, readyForEditor, raw: '',
    }));

  const monter = (session = avecDernierMessage([], false)) => {
    const onValider = vi.fn();
    const onMessage = vi.fn();
    const { result } = renderHook(() => useAtelier({
      item: { id: 'c1' } as any, session, modelId: 'm', aiModels: [], onMessage, onValider,
    }));
    return { result, onValider, onMessage };
  };

  it('retire le « Go » du Coach de ses réponses rapides, et met le vrai en avant', () => {
    const { result } = monter(avecDernierMessage(["Go, passe à l'Éditeur", 'Garde la scène de 3h'], false));
    expect(result.current.reponsesRapides).toEqual(['Garde la scène de 3h']);
    expect(result.current.pretPourLeRedacteur).toBe(true);
  });

  it('« Go, passe à l’Éditeur » envoyé au composeur valide, sans parler au Coach', async () => {
    const { result, onValider, onMessage } = monter();
    await act(() => result.current.envoyer("Go, passe à l'Éditeur"));
    expect(onValider).toHaveBeenCalledOnce();
    expect(onMessage).not.toHaveBeenCalled();
  });
});
