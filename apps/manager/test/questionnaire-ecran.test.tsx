/**
 * @vitest-environment jsdom
 *
 * L'écran d'un questionnaire de santé (refonte, lot 8) : les contre-indications
 * en tête, « Marquer relu », « À revoir avec la personne ».
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { QuestionnaireView } from '../components/Clients/QuestionnaireView';
import * as Clients from '../services/clientsService';
import type { QuestionnaireSante } from '../types-clients';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const Q: QuestionnaireSante = {
  id: 'q', recuLe: '2026-11-20T10:00:00+01:00', contexte: 'groupe', version: 'complet', clientId: 'c', seanceId: null, evenementId: 'ev',
  personne: { prenom: 'Camille', nom: 'Martin' },
  questions: [
    { cle: 'cardio', libelle: 'Antécédents cardiovasculaires', reponse: 'Oui, une arythmie', aRegarder: true },
    { cle: 'epi', libelle: 'Épilepsie', reponse: 'Non', aRegarder: false },
  ],
  informations: '', reluLe: null, aRevoir: false, aRapprocher: false,
};

describe('un questionnaire de santé', () => {
  it('les contre-indications en tête ; « Marquer relu » enregistre, puis relit', async () => {
    vi.spyOn(Clients, 'lireQuestionnaireSante').mockResolvedValueOnce(Q).mockResolvedValue({ ...Q, reluLe: '2026-11-28T10:00:00+01:00' });
    const relu = vi.spyOn(Clients, 'marquerQuestionnaireRelu').mockResolvedValue({ id: 'q' });
    const { container, getByText, queryByText } = render(<QuestionnaireView id="q" />);
    await waitFor(() => expect(container.textContent).toContain('1 à regarder'));
    expect(container.textContent).toContain('! Antécédents cardiovasculaires');
    expect(container.textContent).toContain('Reçu le');
    fireEvent.click(getByText('Marquer relu'));
    await waitFor(() => expect(relu).toHaveBeenCalledWith('q'));
    await waitFor(() => expect(container.textContent).toContain('Relu le'));
    expect(queryByText('Marquer relu')).toBeNull();
  });

  it('« À revoir avec la personne »', async () => {
    vi.spyOn(Clients, 'lireQuestionnaireSante').mockResolvedValue(Q);
    const aRevoir = vi.spyOn(Clients, 'marquerQuestionnaireARevoir').mockResolvedValue({ id: 'q' });
    const { getByText } = render(<QuestionnaireView id="q" />);
    await waitFor(() => expect(getByText('À revoir avec la personne')).toBeTruthy());
    fireEvent.click(getByText('À revoir avec la personne'));
    await waitFor(() => expect(aRevoir).toHaveBeenCalledWith('q'));
  });
});
