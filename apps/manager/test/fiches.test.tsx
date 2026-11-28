/**
 * @vitest-environment jsdom
 *
 * Clients (refonte, lot 6) : la provenance en tête de la fiche, l'absence non
 * réglée en rouge, la liste et son raccourci « / », « Poser un rendez-vous »
 * depuis une ligne.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { FicheView } from '../components/Clients/FicheView';
import { FichesView } from '../components/Clients/FichesView';
import * as Clients from '../services/clientsService';
import { routesChargees, FICHE } from './helpers/clients';

if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); };
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('la fiche', () => {
  it('la provenance en tête', async () => {
    routesChargees();
    vi.spyOn(Clients, 'lireFiche').mockResolvedValue({ ...FICHE, origine: 'Publicité - Google', motCleGoogleAds: 'hypnose arrêt tabac' });
    const { container } = render(<FicheView id="fiche-1" />);
    await waitFor(() => expect(container.textContent).toContain('Provenance : Publicité - Google · mot-clé : hypnose arrêt tabac'));
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('une absence non réglée : un bandeau rouge, avec la date et le montant', async () => {
    routesChargees();
    vi.spyOn(Clients, 'lireFiche').mockResolvedValue({ ...FICHE, seances: [{ ...FICHE.seances[0], statut: 'absent', etatPaiement: 'a_payer' }] });
    const { getByRole } = render(<FicheView id="fiche-1" />);
    await waitFor(() => expect(getByRole('alert').textContent).toContain('Une absence n’est pas réglée : à régulariser avant toute nouvelle séance.'));
    expect(getByRole('alert').textContent).toMatch(/80\s€/);
  });
});

describe('la liste des fiches', () => {
  it('le focus dans la recherche ; « / » y ramène ; « Poser un rendez-vous » depuis une ligne', async () => {
    routesChargees();
    const { container, getByLabelText, getByRole } = render(<FichesView />);
    const champ = getByLabelText('Chercher une fiche');
    expect(document.activeElement).toBe(champ);
    await waitFor(() => expect(container.textContent).toContain('Émilie Martin'));
    const lien = container.querySelector('a') as HTMLAnchorElement;
    lien.focus();
    fireEvent.keyDown(lien, { key: '/' });
    expect(document.activeElement).toBe(champ);
    fireEvent.click(getByRole('button', { name: 'Poser un rendez-vous pour Émilie Martin' }));
    await waitFor(() => expect(container.textContent).toContain('Personne : Émilie Martin'));
  });
});
