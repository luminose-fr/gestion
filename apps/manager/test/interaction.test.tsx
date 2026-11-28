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

// jsdom ne connaît pas showModal : la fenêtre de la charte (un <dialog>) s'ouvre par cette imitation.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); };
}
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

  // Les notes d'une séance : un seul texte, enregistré pendant la frappe.
  const taper = (editeur: HTMLElement, texte: string) => {
    editeur.textContent = texte;
    fireEvent.input(editeur);
  };
  const ATTENTE = { timeout: 4000 };

  it('une note : enregistrée seule après la frappe, avec la version lue', async () => {
    routesChargees();
    const ecrire = vi.spyOn(ClientsService, 'ecrireNotesSeance').mockResolvedValue({ version: 1795777200001 });
    const vue = render(<NotesDeSeance id="seance-1" />);
    await waitFor(() => expect(vue.getByRole('textbox', { name: 'Notes de la séance' })).toBeTruthy());
    taper(vue.getByRole('textbox', { name: 'Notes de la séance' }), 'Texte d’essai — saisi');
    expect(vue.container.textContent).toContain('Modifications en attente');
    expect(ecrire).not.toHaveBeenCalled();
    await waitFor(() => expect(ecrire).toHaveBeenCalledWith('seance-1', 'Texte d’essai — saisi', 1795777200000), ATTENTE);
    await waitFor(() => expect(vue.container.textContent).toContain('Enregistré'), ATTENTE);
    expect(ecrire).toHaveBeenCalledTimes(1);
  });

  it('une note neuve : le modèle de titres, rien d’enregistré sans frappe', async () => {
    routesChargees();
    vi.spyOn(ClientsService, 'lireNotesSeance').mockResolvedValue({ texte: null, version: null, importNotion: null, reponses: [] });
    const ecrire = vi.spyOn(ClientsService, 'ecrireNotesSeance').mockResolvedValue({ version: 1 });
    const vue = render(<NotesDeSeance id="seance-1" />);
    await waitFor(() => expect(vue.container.textContent).toContain('Travail personnel'));
    expect(vue.container.textContent).toContain('Idées pour la suite');
    await new Promise((r) => setTimeout(r, 1500));
    expect(ecrire).not.toHaveBeenCalled();
  });

  it('quitter l’écran pendant le délai : la note part tout de suite', async () => {
    routesChargees();
    const ecrire = vi.spyOn(ClientsService, 'ecrireNotesSeance').mockResolvedValue({ version: 2 });
    const vue = render(<NotesDeSeance id="seance-1" />);
    await waitFor(() => expect(vue.getByRole('textbox', { name: 'Notes de la séance' })).toBeTruthy());
    taper(vue.getByRole('textbox', { name: 'Notes de la séance' }), 'Texte d’essai — avant de partir');
    vue.unmount();
    expect(ecrire).toHaveBeenCalledWith('seance-1', 'Texte d’essai — avant de partir', 1795777200000);
  });

  it('une note, refus 409 : l’enregistrement s’arrête, le texte saisi reste, l’onglet est gardé', async () => {
    routesChargees();
    const ecrire = vi.spyOn(ClientsService, 'ecrireNotesSeance').mockRejectedValue(
      new ClientsService.ErreurClients("Cette note a été modifiée ailleurs. Rechargez-la avant d'enregistrer.", 409));
    const vue = render(<NotesDeSeance id="seance-1" />);
    await waitFor(() => expect(vue.getByRole('textbox', { name: 'Notes de la séance' })).toBeTruthy());
    const editeur = vue.getByRole('textbox', { name: 'Notes de la séance' });
    taper(editeur, 'Texte d’essai — à ne pas perdre');
    await waitFor(() => expect(vue.container.textContent).toContain('Cette note a été modifiée ailleurs'), ATTENTE);
    expect(vue.container.textContent).toContain('la note a changé ailleurs');
    expect(editeur.textContent).toBe('Texte d’essai — à ne pas perdre');
    const avant = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(avant);
    expect(avant.defaultPrevented).toBe(true);
    // Arrêté : une nouvelle frappe ne réécrit pas par-dessus la note d'ailleurs.
    taper(editeur, 'Texte d’essai — encore');
    await new Promise((r) => setTimeout(r, 1500));
    expect(ecrire).toHaveBeenCalledTimes(1);
  });

  it('la réponse SMS se lit sous son titre', async () => {
    const { reponseSmsDe } = await import('../components/Clients/SeanceView');
    expect(reponseSmsDe('## Séance\n\nA\n\n## Réponse SMS\n\nÀ bientôt\n\n## Autre\nB')).toBe('À bientôt');
    expect(reponseSmsDe('## Séance\n\nA')).toBe('');
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
import { routesChargeesC2b, EVENEMENT } from './helpers/clients';

describe('la console des clients — évènements', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('une journée complète : « Inscrire une personne » grisé, avec le motif', async () => {
    routesChargeesC2b();
    const vue = render(<EvenementView id="ev-1" />);
    await waitFor(() => expect(vue.container.textContent).toContain('Complet : les 2 places sont prises'));
    expect((vue.getByText('Inscrire une personne').closest('button') as HTMLButtonElement).disabled).toBe(true);
    expect(vue.queryByLabelText('Inscrire une personne')).toBeNull();
  });

  it('la dernière place prise ailleurs entre-temps : le refus s’affiche tel que la route l’écrit', async () => {
    routesChargeesC2b();
    vi.spyOn(ClientsService, 'lireEvenement').mockResolvedValue({ ...EVENEMENT, placesOccupees: 1, placesLibres: 1 });
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
