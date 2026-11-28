/**
 * @vitest-environment jsdom
 *
 * Rattacher (refonte, lot 8) : les fiches semblables proposées d'emblée, le
 * geste qui rattache, et aucune réponse de santé à l'écran.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { RattacherView } from '../components/Clients/RattacherView';
import * as Clients from '../services/clientsService';
import { routesChargees, SEANCE } from './helpers/clients';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Rattacher', () => {
  it('une réservation sans fiche : la fiche semblable proposée, « Rattacher à cette fiche » ; puis la liste se relit', async () => {
    routesChargees();
    const lire = vi.spyOn(Clients, 'lireARattacher')
      .mockResolvedValueOnce({ seances: [{ ...SEANCE, personne: { clientId: null, prenom: 'Émilie', nom: 'Martin' }, email: 'e@example.org', telephone: null }], sante: [] })
      .mockResolvedValue({ seances: [], sante: [] });
    vi.spyOn(Clients, 'fichesSemblables').mockResolvedValue({ fiches: [{ id: 'fiche-1', prenom: 'Émilie', nom: 'Martin', ville: 'Ville d’essai' }] });
    const rattacher = vi.spyOn(Clients, 'rattacherSeance').mockResolvedValue({ id: SEANCE.id });
    const { container, findByText } = render(<RattacherView />);
    await waitFor(() => expect(container.textContent).toContain('Reçue au nom de Émilie Martin'));
    fireEvent.click(await findByText('Rattacher à cette fiche'));
    await waitFor(() => expect(rattacher).toHaveBeenCalledWith(SEANCE.id, 'fiche-1'));
    await waitFor(() => expect(container.textContent).toContain('Rien à rattacher.'));
    expect(lire).toHaveBeenCalledTimes(2);
  });
});
