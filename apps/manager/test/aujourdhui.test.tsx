/**
 * @vitest-environment jsdom
 *
 * L'écran Aujourd'hui (refonte, lot 3) dans ses états : chargement, journée
 * avec la prochaine séance et À traiter, journée vide et rien à traiter, base
 * non reliée, erreur, réception coupée en tête.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import AujourdhuiView from '../components/Aujourdhui/AujourdhuiView';
import * as Clients from '../services/clientsService';
import type { Aujourdhui, SeanceDuJour } from '../types-clients';
import type { Reception } from '../components/charte/cadre';

if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); };
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const PORTES = { ouverte: true, commandesDuJour: 0, ordres: { prevu: 0, confieAMake: 0, echec: 0 }, alertesOuvertes: 0 };
const reception = (ouverte = true, poser = vi.fn(async () => {})): Reception => ({ portes: { ...PORTES, ouverte }, poser });

const seance = (id: string, debut: string, fin: string, champs: Partial<SeanceDuJour> = {}): SeanceDuJour => ({
  id, debut, fin, occupeJusqua: fin, dureeMin: 60, revision: 0, statut: 'prevue', etatPaiement: 'a_payer', montantCentimes: 8000,
  mode: 'sur_place', listeAttente: false, agendaEtat: 'ecrit', origine: 'console', type: { id: 't', cle: 'seance', libelle: 'Séance d’hypnose' } as any,
  libelleImporte: null, personne: { clientId: 'c', prenom: 'Camille', nom: 'Martin' }, nature: 'seance', provenance: null,
  questionnaire: null, notesEcrites: null, ...champs,
});

const ENTRETIEN = seance('e1', '2027-01-12T11:00:00+01:00', '2027-01-12T11:20:00+01:00', {
  nature: 'rencontre', dureeMin: 20, mode: 'appel', personne: { clientId: 'c2', prenom: 'Julien', nom: 'Roux' },
  type: { id: 'r', cle: 'rencontre', libelle: 'Entretien préalable' } as any,
  provenance: 'Google Ads · mot-clé : hypnose arrêt tabac', questionnaire: 'non_relu',
});

const JOUR: Aujourdhui = {
  maintenant: '2027-01-12T10:35:00+01:00', jour: '2027-01-12', lendemainMatin: null,
  journee: [seance('s1', '2027-01-12T09:00:00+01:00', '2027-01-12T10:00:00+01:00', { statut: 'realisee', notesEcrites: false }), ENTRETIEN],
  prochaine: ENTRETIEN,
  aTraiter: [{ sorte: 'clore', seance: seance('old', '2027-01-08T09:00:00+01:00', '2027-01-08T10:00:00+01:00') }],
};

describe('Aujourd’hui', () => {
  it('chargement, puis la journée : prochaine séance, provenance, états, À traiter', async () => {
    vi.spyOn(Clients, 'lireAujourdhui').mockResolvedValue(JOUR);
    const { container, getByText } = render(<AujourdhuiView reception={reception()} />);
    expect(container.textContent).toContain('Chargement de la journée');
    await waitFor(() => expect(container.textContent).toContain('Prochaine séance'));
    expect(container.textContent).toContain('dans 25 min');
    expect(container.textContent).toContain('Vient de : Google Ads · mot-clé : hypnose arrêt tabac');
    expect(container.textContent).toContain('!Questionnaire non relu');
    expect(container.textContent).toContain('!Notes à écrire');
    expect(getByText('Clore la séance restée « prévue »').closest('a')?.getAttribute('href')).toBe('#agenda/old');
    expect(container.textContent).toContain('Réception du site : ouverte');
  });

  it('journée vide, rien à traiter : deux phrases calmes, et la prochaine séance', async () => {
    const plusTard = seance('p', '2027-01-18T09:00:00+01:00', '2027-01-18T10:00:00+01:00');
    vi.spyOn(Clients, 'lireAujourdhui').mockResolvedValue({ ...JOUR, journee: [], prochaine: plusTard, aTraiter: [] });
    const { container } = render(<AujourdhuiView reception={reception()} />);
    await waitFor(() => expect(container.textContent).toContain('Pas de séance aujourd’hui.'));
    expect(container.textContent).toContain('Tout est à jour. Rien ne vous attend ici.');
    expect(container.textContent).toContain('Prochaine séance :');
    expect(container.textContent).not.toContain('PROCHAINE SÉANCE');
  });

  it('base non reliée : le dit, et mène à l’état', async () => {
    vi.spyOn(Clients, 'lireAujourdhui').mockRejectedValue(new Clients.ErreurClients("La base des clients n'est pas reliée à cet environnement.", 409));
    const { container } = render(<AujourdhuiView reception={{ portes: null, poser: vi.fn() }} />);
    await waitFor(() => expect(container.textContent).toContain('La pratique n’est pas disponible'));
  });

  it('erreur : « Réessayer » relit', async () => {
    const lire = vi.spyOn(Clients, 'lireAujourdhui').mockRejectedValueOnce(new Clients.ErreurClients('Panne.', 500)).mockResolvedValue(JOUR);
    const { container, getByText } = render(<AujourdhuiView reception={reception()} />);
    await waitFor(() => expect(container.textContent).toContain('La journée n’a pas pu être chargée.'));
    fireEvent.click(getByText('Réessayer'));
    await waitFor(() => expect(container.textContent).toContain('Prochaine séance'));
    expect(lire).toHaveBeenCalledTimes(2);
  });

  it('réception coupée : en tête, et « Rouvrir » la rouvre sans confirmation', async () => {
    vi.spyOn(Clients, 'lireAujourdhui').mockResolvedValue(JOUR);
    const poser = vi.fn(async () => {});
    const { getByRole } = render(<AujourdhuiView reception={reception(false, poser)} />);
    expect(getByRole('alert').textContent).toContain('Réception du site : coupée');
    fireEvent.click(getByRole('button', { name: 'Rouvrir' }));
    await waitFor(() => expect(poser).toHaveBeenCalledWith(true));
  });

  it('réception ouverte : « Couper » demande confirmation', async () => {
    vi.spyOn(Clients, 'lireAujourdhui').mockResolvedValue(JOUR);
    const poser = vi.fn(async () => {});
    const { getByRole, findByText } = render(<AujourdhuiView reception={reception(true, poser)} />);
    fireEvent.click(getByRole('button', { name: 'Couper' }));
    expect(poser).not.toHaveBeenCalled();
    fireEvent.click(await findByText('Couper la réception'));
    await waitFor(() => expect(poser).toHaveBeenCalledWith(false));
  });
});
