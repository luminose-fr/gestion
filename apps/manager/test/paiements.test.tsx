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
      .mockResolvedValueOnce({ seances: [{ ...SEANCE, statut: 'absent' }, { ...SEANCE, id: 's2', statut: 'realisee' }], nombre: 2, totalCentimes: 16000, inscriptions: [] })
      .mockResolvedValue({ seances: [], nombre: 0, totalCentimes: 0, inscriptions: [] });
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

  it('un stage à encaisser : « Virement » encaisse et relit', async () => {
    const stage = { id: 'ins', statut: 'retenue' as const, modePaiement: 'virement' as const, retenueJusqua: null, montantCentimes: 15000,
      stage: { id: 'ev', nom: 'Stage de breathwork', debut: '2027-03-14T10:00:00+01:00' }, personne: { clientId: 'c', prenom: 'Camille', nom: 'Martin' } };
    vi.spyOn(Clients, 'lirePaiements')
      .mockResolvedValueOnce({ seances: [], nombre: 0, totalCentimes: 0, inscriptions: [stage] })
      .mockResolvedValue({ seances: [], nombre: 0, totalCentimes: 0, inscriptions: [] });
    const encaisser = vi.spyOn(Clients, 'encaisserInscription').mockResolvedValue({ id: 'ins' });
    window.location.hash = '#paiements';
    const { container, getByText } = render(<PaiementsView />);
    await waitFor(() => expect(container.textContent).toContain('Stages à encaisser · 1'));
    fireEvent.click(getByText('Virement'));
    await waitFor(() => expect(encaisser).toHaveBeenCalledWith('ins', 'virement'));
    await waitFor(() => expect(container.textContent).not.toContain('Stages à encaisser'));
  });
});
