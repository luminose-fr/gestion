/** @vitest-environment jsdom */
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { Menu } from '../components/ui/Menu';
import { ControleSegmente } from '../components/ui/ControleSegmente';
import { ConfirmModal } from '../components/CommonModals';
import { ErreurEcran } from '../components/ErreurEcran';

afterEach(cleanup);
describe('navigation clavier', () => {
  it('parcourt les choix disponibles et rend le focus au déclencheur avec Échap', () => {
    function Exemple() {
      const [ouvert, poser] = useState(false);
      return <Menu ouvert={ouvert} onFermer={() => poser(false)} entrees={[
        { id: 'a', libelle: 'Premier', onChoisir() {} },
        { id: 'b', libelle: 'Indisponible', desactive: true, onChoisir() {} },
        { id: 'c', libelle: 'Dernier', onChoisir() {} },
      ]}><button onClick={() => poser(true)}>Actions</button></Menu>;
    }
    const vue = render(<Exemple />);
    fireEvent.click(vue.getByText('Actions'));
    expect(document.activeElement?.textContent).toBe('Premier');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toBe('Dernier');
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(vue.queryByRole('menu')).toBeNull();
    expect(document.activeElement?.textContent).toBe('Actions');
  });
  it('garde le focus dans la confirmation et le restaure après fermeture', () => {
    function Exemple() {
      const [ouvert, poser] = useState(false);
      return <><button onClick={() => poser(true)}>Supprimer</button><ConfirmModal isOpen={ouvert} onClose={() => poser(false)} onConfirm={() => {}} title="Confirmer ?" message="Une confirmation" /></>;
    }
    const vue = render(<Exemple />);
    const declencheur = vue.getByText('Supprimer');
    declencheur.focus();
    fireEvent.click(declencheur);
    expect(vue.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement?.textContent).toBe('Annuler');
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
    expect(document.activeElement?.textContent).toBe('Confirmer');
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(document.activeElement).toBe(declencheur);
  });
});
it('une erreur de rendu propose une issue au lieu d’une page blanche', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  function Casse(): React.ReactNode { throw new Error('Rendu impossible'); }
  const vue = render(<ErreurEcran><Casse /></ErreurEcran>);
  expect(vue.getByRole('alert').textContent).toContain('Cet écran n’a pas pu s’afficher.');
  expect(vue.getByText('Recharger l’application')).toBeTruthy();
});

it('les flèches changent le filtre et sautent les choix indisponibles', () => {
  function Exemple() {
    const [valeur, poser] = useState('tout');
    return <ControleSegmente valeur={valeur} onChange={poser} libelle="Filtrer" options={[
      { valeur: 'tout', libelle: 'Tout' },
      { valeur: 'indisponible', libelle: 'Indisponible', desactive: true },
      { valeur: 'publier', libelle: 'Publier' },
    ]} />;
  }
  const vue = render(<Exemple />);
  const tout = vue.getByRole('radio', { name: 'Tout' });
  tout.focus();
  fireEvent.keyDown(tout, { key: 'ArrowRight' });
  const publier = vue.getByRole('radio', { name: 'Publier' });
  expect(document.activeElement).toBe(publier);
  expect(publier.getAttribute('aria-checked')).toBe('true');
  fireEvent.keyDown(publier, { key: 'Home' });
  expect(document.activeElement).toBe(tout);
  expect(tout.getAttribute('aria-checked')).toBe('true');
});

// ─── La console des clients (brief C2, « Les tests ») ───────────────────────

import { waitFor } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as ClientsService from '../services/clientsService';
import { FichesView } from '../components/Clients/FichesView';
import { NouvelleFicheView } from '../components/Clients/NouvelleFicheView';
import { FicheView } from '../components/Clients/FicheView';
import { NotesDeSeance, SeanceView } from '../components/Clients/SeanceView';
import { PoserRendezVous } from '../components/Clients/PoserRendezVous';
import { routesChargees, FICHE } from './helpers/clients';

describe('la console des clients', () => {
  afterEach(() => { vi.restoreAllMocks(); window.location.hash = ''; });

  it('chercher une fiche : la requête part en POST, la saisie dans le corps', async () => {
    const appels: { url: string; init: RequestInit }[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      appels.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ fiches: [], page: 0, suite: false }), { status: 200 });
    });
    const vue = render(<FichesView />);
    fireEvent.change(vue.getByLabelText('Chercher une fiche'), { target: { value: 'Émilie' } });
    await waitFor(() => expect(appels.some((a) => String(a.init.body).includes('Émilie'))).toBe(true));
    const recherche = appels.find((a) => String(a.init.body).includes('Émilie'))!;
    expect(recherche.init.method).toBe('POST');
    expect(recherche.url).not.toContain('mili');
  });

  it('créer une fiche : la fiche semblable s’affiche, avec « Ouvrir cette fiche »', async () => {
    routesChargees();
    vi.spyOn(ClientsService, 'fichesSemblables').mockResolvedValue({ fiches: [{ id: 'fiche-1', prenom: 'Émilie', nom: 'Martin', ville: null }] });
    const creer = vi.spyOn(ClientsService, 'creerFiche').mockResolvedValue({ id: 'nouvelle-1' });
    const vue = render(<NouvelleFicheView />);
    expect(document.activeElement).toBe(vue.getByLabelText('Prénom'));
    fireEvent.change(vue.getByLabelText('Prénom'), { target: { value: 'Émilie' } });
    fireEvent.change(vue.getByLabelText('Nom'), { target: { value: 'Martin' } });
    await waitFor(() => expect(vue.getByText('Ouvrir cette fiche')).toBeTruthy());
    fireEvent.click(vue.getByText('Enregistrer'));
    await waitFor(() => expect(creer).toHaveBeenCalled());
    expect(creer.mock.calls[0][0]).toMatchObject({ prenom: 'Émilie', nom: 'Martin' });
    await waitFor(() => expect(window.location.hash).toBe('#clients/nouvelle-1'));
  });

  it('modifier une carte puis annuler : rien ne part, la lecture revient', async () => {
    routesChargees();
    const modifier = vi.spyOn(ClientsService, 'modifierFiche').mockResolvedValue({ id: 'fiche-1' });
    const vue = render(<FicheView id="fiche-1" />);
    await waitFor(() => expect(vue.container.textContent).toContain('Identité et coordonnées'));
    fireEvent.click(vue.getAllByText('Modifier')[0]);
    fireEvent.change(vue.getByLabelText('Profession'), { target: { value: 'Texte d’essai' } });
    expect(vue.container.textContent).toContain('Modifications non enregistrées');
    fireEvent.click(vue.getByText('Annuler'));
    expect(vue.queryByLabelText('Profession')).toBeNull();
    expect(modifier).not.toHaveBeenCalled();
  });

  it('écrire une note, refus 409 : le texte saisi est toujours là', async () => {
    routesChargees();
    vi.spyOn(ClientsService, 'ecrireNotesSeance').mockRejectedValue(
      new ClientsService.ErreurClients("Cette note a été modifiée ailleurs. Rechargez-la avant d'enregistrer.", 409));
    const vue = render(<NotesDeSeance id="seance-1" />);
    await waitFor(() => expect(vue.getByLabelText('Séance')).toBeTruthy());
    fireEvent.change(vue.getByLabelText('Séance'), { target: { value: 'Texte d’essai — à ne pas perdre' } });
    expect(vue.container.textContent).toContain('Un texte n’est pas enregistré');
    fireEvent.click(vue.getAllByText('Enregistrer')[0]);
    await waitFor(() => expect(vue.container.textContent).toContain('Cette note a été modifiée ailleurs'));
    expect((vue.getByLabelText('Séance') as HTMLTextAreaElement).value).toBe('Texte d’essai — à ne pas perdre');
  });

  it('changer un statut : réalisée passe par une modification, annulée par sa décision', async () => {
    routesChargees();
    const modifier = vi.spyOn(ClientsService, 'modifierSeance').mockResolvedValue({ id: 'seance-1' });
    const annuler = vi.spyOn(ClientsService, 'annulerSeance').mockResolvedValue({ id: 'seance-1', fait: true });
    const vue = render(<SeanceView id="seance-1" />);
    await waitFor(() => expect(vue.getByLabelText('Statut')).toBeTruthy());
    fireEvent.change(vue.getByLabelText('Statut'), { target: { value: 'realisee' } });
    await waitFor(() => expect(modifier).toHaveBeenCalledWith('seance-1', { statut: 'realisee' }));
    fireEvent.change(vue.getByLabelText('Statut'), { target: { value: 'annulee' } });
    fireEvent.click(vue.getAllByText('Annuler la séance').pop()!);
    await waitFor(() => expect(annuler).toHaveBeenCalledWith('seance-1'));
  });

  it('poser un rendez-vous refusé pour chevauchement : le message s’affiche, la fenêtre reste ouverte', async () => {
    routesChargees();
    vi.spyOn(ClientsService, 'poserRendezVous').mockRejectedValue(new ClientsService.ErreurClients('Ce créneau chevauche un autre rendez-vous.', 409));
    const pose = vi.fn();
    const vue = render(<PoserRendezVous fiche={{ id: FICHE.id, prenom: FICHE.prenom, nom: FICHE.nom }} date="2027-01-11" onFermer={() => {}} onPose={pose} />);
    await waitFor(() => expect(vue.getByText(/Séance — 90 min/)).toBeTruthy());
    fireEvent.click(vue.getByText('Poser le rendez-vous'));
    await waitFor(() => expect(vue.container.textContent).toContain('Ce créneau chevauche un autre rendez-vous.'));
    expect(pose).not.toHaveBeenCalled();
    expect(vue.getByRole('dialog')).toBeTruthy();
  });
});

describe('NORMATIF — rien de la base des clients dans le navigateur (§15.2, règle 5)', () => {
  it('ni localStorage, ni sessionStorage, ni indexedDB, ni caches dans les écrans des clients et leur service', () => {
    const racine = join(import.meta.dirname, '..');
    const fichiers = [join(racine, 'services', 'clientsService.ts')];
    const parcourir = (d: string) => {
      for (const n of readdirSync(d)) {
        const c = join(d, n);
        if (statSync(c).isDirectory()) parcourir(c);
        else if (/\.tsx?$/.test(n)) fichiers.push(c);
      }
    };
    parcourir(join(racine, 'components', 'Clients'));
    expect(fichiers.length).toBeGreaterThan(5);
    const fautifs = fichiers.filter((f) => /\b(localStorage|sessionStorage|indexedDB)\b|\bcaches\./.test(readFileSync(f, 'utf8').replace(/^\s*(\*|\/\/).*$/gm, '')));
    expect(fautifs).toEqual([]);
  });
});

import { EvenementView } from '../components/Clients/EvenementsView';
import { routesChargeesC2b } from './helpers/clients';

describe('la console des clients — évènements', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('inscrire une personne à une journée complète : le refus s’affiche tel que la route l’écrit', async () => {
    routesChargeesC2b();
    vi.spyOn(ClientsService, 'rechercherFiches').mockResolvedValue({ fiches: [{ id: 'fiche-2', prenom: 'Ève', nom: 'Dupont', ville: null, nbSeances: 0, derniereSeance: null, prochaineSeance: null }], page: 0, suite: false });
    const inscrire = vi.spyOn(ClientsService, 'inscrire').mockRejectedValue(new ClientsService.ErreurClients('Cette journée est complète.', 409));
    const vue = render(<EvenementView id="ev-1" />);
    await waitFor(() => expect(vue.getByLabelText('Inscrire une personne')).toBeTruthy());
    fireEvent.change(vue.getByLabelText('Inscrire une personne'), { target: { value: 'Ève' } });
    await waitFor(() => expect(vue.getByText('Ève Dupont')).toBeTruthy());
    fireEvent.click(vue.getByText('Ève Dupont'));
    fireEvent.click(vue.getByText('Inscrire'));
    await waitFor(() => expect(vue.container.textContent).toContain('Cette journée est complète.'));
    expect(inscrire).toHaveBeenCalledWith('ev-1', 'fiche-2');
  });
});
