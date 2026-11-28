/**
 * @vitest-environment jsdom
 *
 * Paiements (refonte, lot 8) : le total en tête, l'absence en rouge, « Marquer payé ».
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { PaiementsView } from '../components/Paiements/PaiementsView';
import * as Clients from '../services/clientsService';
import { SEANCE } from './helpers/clients';

afterEach(() => { cleanup(); vi.restoreAllMocks(); window.location.hash = ''; });

describe('Paiements', () => {
  it('à encaisser : le total, l’absence en rouge, « Marquer payé » enregistre puis relit', async () => {
    const lire = vi.spyOn(Clients, 'lirePaiements')
      .mockResolvedValueOnce({ seances: [{ ...SEANCE, statut: 'absent' }, { ...SEANCE, id: 's2', statut: 'realisee' }], nombre: 2, totalCentimes: 16000 })
      .mockResolvedValue({ seances: [], nombre: 0, totalCentimes: 0 });
    const payer = vi.spyOn(Clients, 'modifierSeance').mockResolvedValue({ id: 'seance-1' });
    window.location.hash = '#paiements';
    const { container, getAllByText } = render(<PaiementsView />);
    await waitFor(() => expect(container.textContent).toContain('Reste à encaisser'));
    expect(container.textContent).toMatch(/160\s€/);
    expect(container.textContent).toContain('×Absente');
    fireEvent.click(getAllByText('Marquer payé')[0]);
    await waitFor(() => expect(payer).toHaveBeenCalledWith('seance-1', { etatPaiement: 'payee' }));
    await waitFor(() => expect(container.textContent).toContain('Tout est encaissé.'));
    expect(lire).toHaveBeenCalledWith('a_encaisser');
  });
});
