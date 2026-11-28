/**
 * @vitest-environment jsdom
 *
 * L'Agenda (refonte, lot 5) : la semaine en colonnes, les jours fermés et les
 * créneaux libres, « Ouvrir ce jour », et « Fermer des jours ».
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { PlanningView, FermerJours } from '../components/Clients/PlanningView';
import * as Clients from '../services/clientsService';
import { routesChargees, SEANCE } from './helpers/clients';

if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); };
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const JOURS = [
  { date: '2027-01-11', ferme: null, exception: false, libres: 2 },
  { date: '2027-01-12', ferme: 'exception' as const, exception: true, libres: 0 },
  { date: '2027-01-16', ferme: 'habitude' as const, exception: false, libres: 0 },
];

describe('l’Agenda', () => {
  it('la semaine : sept colonnes, les libres, les jours fermés ; « Ouvrir ce jour » retire l’exception', async () => {
    routesChargees();
    vi.spyOn(Clients, 'disponibilites').mockResolvedValue({ jours: JOURS, agendaLu: true });
    const ouvrir = vi.spyOn(Clients, 'rendreDateALaSemaine').mockResolvedValue({ date: '2027-01-12' });
    const { container, getAllByText, getByText } = render(<PlanningView vue="semaine" date="2027-01-11" />);
    await waitFor(() => expect(container.textContent).toContain(SEANCE.personne.prenom!));
    expect(container.querySelectorAll('section')).toHaveLength(7);
    expect(container.textContent).toContain('2 libres');
    expect(getAllByText('Jour fermé')).toHaveLength(2);
    // Fermé par habitude (le samedi) : pas de bouton ; fermé par exception : « Ouvrir ce jour ».
    expect(getAllByText('Ouvrir ce jour')).toHaveLength(1);
    fireEvent.click(getByText('Ouvrir ce jour'));
    await waitFor(() => expect(ouvrir).toHaveBeenCalledWith('2027-01-12'));
  });

  it('« Fermer des jours » : les séances déjà prévues se disent, puis chaque jour se ferme', async () => {
    routesChargees();
    vi.spyOn(Clients, 'seancesDeLaPeriode').mockResolvedValue({ seances: [SEANCE] });
    const poser = vi.spyOn(Clients, 'poserDate').mockResolvedValue({ date: 'x', fermee: true });
    const fait = vi.fn();
    const { getByLabelText, getByText, container } = render(<FermerJours onFermer={() => {}} onFait={fait} />);
    fireEvent.change(getByLabelText('Du'), { target: { value: '2027-01-11' } });
    fireEvent.change(getByLabelText('Au'), { target: { value: '2027-01-13' } });
    await waitFor(() => expect(container.textContent).toContain('1 séance déjà prévue'));
    expect(container.textContent).toContain('Fermer les jours ne les annule pas.');
    fireEvent.click(getByText('Fermer ces 3 jours'));
    await waitFor(() => expect(fait).toHaveBeenCalled());
    expect(poser.mock.calls).toEqual([['2027-01-11', []], ['2027-01-12', []], ['2027-01-13', []]]);
  });
});

describe('l’Agenda — semaine, mois, semaine', () => {
  it('l’aller-retour ramène à la même semaine, et le mois reste le même', async () => {
    routesChargees();
    window.location.hash = '#agenda/semaine/2027-02-01';
    const { getByRole, rerender } = render(<PlanningView vue="semaine" date="2027-02-01" />);
    for (let i = 0; i < 3; i++) {
      fireEvent.click(getByRole('tab', { name: 'Mois' }));
      expect(window.location.hash).toBe('#agenda/mois/2027-02-01');
      rerender(<PlanningView vue="mois" date="2027-02-01" />);
      fireEvent.click(getByRole('tab', { name: 'Semaine' }));
      expect(window.location.hash).toBe('#agenda/semaine/2027-02-01');
      rerender(<PlanningView vue="semaine" date="2027-02-01" />);
    }
  });
});
