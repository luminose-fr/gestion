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
    await waitFor(() => expect(container.textContent).toContain('Venue par Publicité - Google · mot-clé : hypnose arrêt tabac'));
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('les séances se lisent par leur date, sous « À venir » puis « Passées » ; un champ vide se complète (retours du 28/11, §3)', async () => {
    routesChargees();
    const passee = { ...FICHE.seances[0], id: 'passee', numero: 6, statut: 'realisee' as const, etatPaiement: 'payee' as const, debut: '2026-11-23T08:30:00.000Z' };
    const avenir = { ...FICHE.seances[0], id: 'avenir', numero: 7, statut: 'prevue' as const, debut: '2099-12-07T08:30:00.000Z' };
    vi.spyOn(Clients, 'lireFiche').mockResolvedValue({ ...FICHE, profession: null, seances: [passee, avenir] });
    const { container } = render(<FicheView id="fiche-1" />);
    await waitFor(() => expect(container.textContent).toContain('lun. 23 nov. · 09:30'));
    const texte = container.textContent ?? '';
    expect(texte.indexOf('À venir')).toBeLessThan(texte.indexOf('Passées'));
    expect(texte.indexOf('Passées')).toBeLessThan(texte.indexOf('lun. 23 nov.'));
    expect(texte).not.toMatch(/Séance [67]/);
    expect(texte).toContain('Compléter : ');
    expect(texte).toContain('profession');
    expect(texte).not.toContain('—');
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
