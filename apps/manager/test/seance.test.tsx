/**
 * @vitest-environment jsdom
 *
 * L'écran d'une séance selon le moment (refonte, lot 4) : avant, entretien
 * préalable, après — et la fenêtre unique pour poser et déplacer.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { SeanceView } from '../components/Clients/SeanceView';
import { PoserRendezVous } from '../components/Clients/PoserRendezVous';
import * as Clients from '../services/clientsService';
import { routesChargees, SEANCE, SEANCE_DETAILLEE } from './helpers/clients';

if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); };
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** Une séance à venir, dans un an : jamais « passée » pendant que la suite tourne. */
const AVENIR = { debut: '2099-01-11T09:30:00+01:00', fin: '2099-01-11T11:00:00+01:00' };
const PASSEE = { debut: '2020-01-13T09:30:00+01:00', fin: '2020-01-13T11:00:00+01:00' };

describe('une séance, selon le moment', () => {
  it('avant : Déplacer, Autres actions, pas de « Terminer »', async () => {
    routesChargees();
    vi.spyOn(Clients, 'lireSeance').mockResolvedValue({ ...SEANCE_DETAILLEE, ...AVENIR, questionnaire: 'relu' });
    const { container, getByText, queryByText } = render(<SeanceView id="seance-1" />);
    await waitFor(() => expect(container.textContent).toContain('Histoire du rendez-vous'));
    expect(getByText('Déplacer')).toBeTruthy();
    expect(getByText('Autres actions')).toBeTruthy();
    expect(queryByText('Trois gestes, dans l’ordre. Chacun s’ouvre quand le précédent est fait.')).toBeNull();
    expect(container.textContent).toContain('✓Relu');
  });

  it('entretien préalable : la provenance en tête, « Compléter la fiche »', async () => {
    routesChargees();
    vi.spyOn(Clients, 'lireSeance').mockResolvedValue({ ...SEANCE_DETAILLEE, ...AVENIR, nature: 'rencontre', provenance: 'Google Ads · mot-clé : hypnose arrêt tabac' });
    const { container, getByText } = render(<SeanceView id="seance-1" />);
    await waitFor(() => expect(container.textContent).toContain('D’où vient la personne'));
    expect(container.textContent).toContain('Google Ads · mot-clé : hypnose arrêt tabac');
    expect(getByText('Compléter la fiche').getAttribute('href')).toBe('#clients/fiche-1');
  });

  it('après : « Terminer la séance » en trois gestes, dans l’ordre', async () => {
    routesChargees();
    const modifier = vi.spyOn(Clients, 'modifierSeance').mockResolvedValue({ id: 'seance-1' });
    vi.spyOn(Clients, 'lireSeance').mockResolvedValue({ ...SEANCE_DETAILLEE, ...PASSEE });
    const { container, getAllByText, getByText } = render(<SeanceView id="seance-1" />);
    await waitFor(() => expect(container.textContent).toContain('Trois gestes, dans l’ordre.'));
    expect(container.textContent).toContain('Passée, restée « prévue »');
    expect(getAllByText('Poser le suivant').pop()!.closest('button')!.disabled).toBe(true);
    fireEvent.click(getByText('Séance réalisée'));
    await waitFor(() => expect(modifier).toHaveBeenCalledWith('seance-1', { statut: 'realisee' }));
  });

  it('une absence non réglée se voit en rouge, comme une dette', async () => {
    routesChargees();
    vi.spyOn(Clients, 'lireSeance').mockResolvedValue({ ...SEANCE_DETAILLEE, ...PASSEE, statut: 'absent', etatPaiement: 'a_payer' });
    const { container } = render(<SeanceView id="seance-1" />);
    await waitFor(() => expect(container.textContent).toContain('×À régulariser avant toute nouvelle séance'));
  });

  it('la dernière fois : repliée, ses notes ne se lisent qu’à l’ouverture', async () => {
    routesChargees();
    vi.spyOn(Clients, 'lireSeance').mockResolvedValue({ ...SEANCE_DETAILLEE, ...AVENIR, precedente: { id: 'avant', debut: '2027-01-04T09:30:00+01:00' } });
    const notes = vi.spyOn(Clients, 'lireNotesSeance');
    const { container } = render(<SeanceView id="seance-1" />);
    await waitFor(() => expect(container.textContent).toContain('La dernière fois'));
    expect(notes).not.toHaveBeenCalledWith('avant');
  });
});

describe('la fenêtre des rendez-vous', () => {
  it('déplacer : la personne et le type fixés, la révision lue part avec la demande', async () => {
    routesChargees();
    const deplacer = vi.spyOn(Clients, 'deplacerSeance').mockResolvedValue({ id: 'seance-1' });
    const pose = vi.fn();
    const { getByText, getByLabelText, container } = render(<PoserRendezVous deplacer={{ ...SEANCE, revision: 3 }} onFermer={() => {}} onPose={pose} />);
    expect(container.textContent).toContain('Déplacer le rendez-vous');
    expect(container.querySelector('#rdv-type')).toBeNull();
    await waitFor(() => expect(getByText('14 h')).toBeTruthy());
    fireEvent.click(getByText('14 h'));
    fireEvent.click(getByText('Déplacer ici'));
    await waitFor(() => expect(deplacer).toHaveBeenCalledWith('seance-1', '2027-01-11T14:00:00+01:00', 3));
    // Les heures se lisent sans la séance déplacée : elle ne s'occupe pas elle-même.
    expect(Clients.creneauxLibres).toHaveBeenCalledWith('type-seance', '2027-01-01', '2027-01-31', 'seance-1');
    expect(getByLabelText(/, 2 heures libres$/)).toBeTruthy();
    expect(pose).toHaveBeenCalledWith('seance-1');
  });

  it('un chevauchement refusé dit avec qui, et la fenêtre reste ouverte', async () => {
    routesChargees();
    vi.spyOn(Clients, 'deplacerSeance').mockRejectedValue(new Clients.ErreurClients('Ce créneau chevauche le rendez-vous de Léo Martin, de 14 h à 15 h 30.', 409));
    const { getByText, getByRole } = render(<PoserRendezVous deplacer={SEANCE} onFermer={() => {}} onPose={() => {}} />);
    await waitFor(() => expect(getByText('14 h')).toBeTruthy());
    fireEvent.click(getByText('14 h'));
    fireEvent.click(getByText('Déplacer ici'));
    await waitFor(() => expect(getByRole('alert').textContent).toContain('Léo Martin, de 14 h à 15 h 30'));
  });

  it('« Autre heure… » pose hors des heures libres (Florent peut le faire, le site non)', async () => {
    routesChargees();
    const poser = vi.spyOn(Clients, 'poserRendezVous').mockResolvedValue({ id: 'nouvelle' });
    const { getByText, getByLabelText } = render(<PoserRendezVous fiche={{ id: 'fiche-1', prenom: 'Émilie', nom: 'Martin' }} date="2027-01-11" onFermer={() => {}} onPose={() => {}} />);
    await waitFor(() => expect(getByText('14 h')).toBeTruthy());
    fireEvent.click(getByText('Autre heure…'));
    fireEvent.change(getByLabelText('Heure'), { target: { value: '19:15' } });
    fireEvent.click(getByText('Poser à cette heure'));
    await waitFor(() => expect(poser).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'fiche-1', debut: '2027-01-11T19:15:00+01:00' })));
  });
});
