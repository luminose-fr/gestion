/**
 * @vitest-environment jsdom
 *
 * Rechercher (⌘K, refonte lot 7) — NORMATIF pour ses deux règles de
 * confidentialité : depuis l'éditorial, aucune requête vers la base des
 * clients ; aucun historique d'une ouverture à l'autre.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { Recherche } from '../components/charte/Recherche';
import { NouvelleFicheView, proposerSaisie } from '../components/Clients/NouvelleFicheView';
import * as Clients from '../services/clientsService';
import { routesChargees } from './helpers/clients';

if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); };
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const ECRANS = [{ cle: 'e-agenda', nom: 'Agenda', detail: 'Pratique', agir: vi.fn() }];
const CONTENUS = [{ id: 'c1', titre: 'Émilie et la séance d’hypnose', detail: 'Idées' }];

const ouvrir = (personnes: boolean, onFiche = vi.fn(), onContenu = vi.fn()) => render(
  <Recherche ouverte onFermer={() => {}} personnes={personnes} ecrans={ECRANS}
    actions={(q) => [{ cle: 'a', nom: q ? `Nouvelle fiche « ${q} »` : 'Nouvelle fiche', agir: vi.fn() }]}
    contenus={CONTENUS} onOuvrirContenu={onContenu} onOuvrirFiche={onFiche} />,
);

describe('NORMATIF — Rechercher', () => {
  it('depuis la pratique : les personnes se cherchent, et ↵ ouvre la première', async () => {
    routesChargees();
    const chercher = vi.spyOn(Clients, 'rechercherFiches');
    const fiche = vi.fn();
    const { getByRole, container } = ouvrir(true, fiche);
    fireEvent.change(getByRole('combobox'), { target: { value: 'émi' } });
    await waitFor(() => expect(container.textContent).toContain('Personnes'));
    expect(chercher).toHaveBeenCalledWith('émi', 0);
    fireEvent.keyDown(getByRole('combobox'), { key: 'Enter' });
    expect(fiche).toHaveBeenCalledWith('fiche-1');
  });

  it('depuis l’éditorial : aucune requête vers la base des clients, et la phrase le dit', async () => {
    routesChargees();
    const chercher = vi.spyOn(Clients, 'rechercherFiches');
    const { getByRole, container } = ouvrir(false);
    fireEvent.change(getByRole('combobox'), { target: { value: 'émilie' } });
    await new Promise((r) => setTimeout(r, 400));
    expect(chercher).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('Personnes');
    expect(container.textContent).toContain('Depuis l’éditorial, la recherche ne montre aucune personne.');
    // Un contenu se trouve, accents ou non.
    expect(container.textContent).toContain('Émilie et la séance d’hypnose');
  });

  it('aucun historique : refermée puis rouverte, la saisie est vide', () => {
    const props = { onFermer: () => {}, personnes: false, ecrans: ECRANS, actions: () => [], contenus: [], onOuvrirContenu: () => {}, onOuvrirFiche: () => {} };
    const { getByRole, rerender } = render(<Recherche ouverte {...props} />);
    fireEvent.change(getByRole('combobox'), { target: { value: 'agen' } });
    rerender(<Recherche ouverte={false} {...props} />);
    rerender(<Recherche ouverte {...props} />);
    expect((getByRole('combobox') as HTMLInputElement).value).toBe('');
  });

  it('« Nouvelle fiche « … » » : le texte tapé passe dans la fiche, en mémoire, une seule fois', async () => {
    routesChargees();
    proposerSaisie('Camille Martin');
    const premiere = render(<NouvelleFicheView />);
    expect((premiere.getByLabelText('Prénom') as HTMLInputElement).value).toBe('Camille');
    expect((premiere.getByLabelText('Nom') as HTMLInputElement).value).toBe('Martin');
    cleanup();
    const seconde = render(<NouvelleFicheView />);
    expect((seconde.getByLabelText('Prénom') as HTMLInputElement).value).toBe('');
  });
});
