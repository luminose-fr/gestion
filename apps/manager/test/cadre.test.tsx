/**
 * @vitest-environment jsdom
 *
 * Le cadre de la refonte (lot 2) : la barre latérale à libellés et ses deux
 * groupes, son repli retenu, les entrées de la pratique grisées quand la base
 * n'est pas reliée, la ligne d'état de la réception, la barre du bas de
 * l'iPhone, la feuille « Ajouter » (fermée puis ouverte), l'écran « Plus »,
 * et la liste du second niveau.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import {
  BarreLaterale, BarreDuBas, FeuilleAjouter, EcranPlus, ListeSecondNiveau, AUJOURDHUI, PRATIQUE, EDITORIAL,
} from '../components/charte/cadre';
import type * as Api from '../services/apiService';

if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); };
}

const OUVERTE: Api.EtatDesPortes = { ouverte: true, commandesDuJour: 3, ordres: { prevu: 0, confieAMake: 0, echec: 0 }, alertesOuvertes: 0 };
const COUPEE: Api.EtatDesPortes = { ...OUVERTE, ouverte: false };

afterEach(() => { cleanup(); localStorage.clear(); });

describe('la barre latérale', () => {
  it('Aujourd’hui en tête, deux groupes à libellés dans l’ordre de la fréquence, Réglages en bas', () => {
    const { container, getByRole } = render(<BarreLaterale actif="agenda" onNaviguer={() => {}} baseReliee reception={OUVERTE} />);
    const textes = [...container.querySelectorAll('a, span[aria-disabled]')].map(a => a.textContent);
    expect(textes.slice(0, 9)).toEqual([AUJOURDHUI, ...PRATIQUE, ...EDITORIAL].map(e => e.libelle));
    expect(container.textContent).toContain('Pratique');
    expect(container.textContent).toContain('Éditorial');
    expect(getByRole('link', { name: 'Agenda' }).getAttribute('aria-current')).toBe('page');
    expect(getByRole('link', { name: 'Agenda' }).getAttribute('href')).toBe('#agenda');
    expect(getByRole('link', { name: 'Stages' }).getAttribute('href')).toBe('#stages');
    expect(container.textContent).toContain('Réception du site : ouverte');
  });

  it('un clic simple passe par l’application, avec l’entrée choisie', () => {
    const naviguer = vi.fn();
    const { getByRole } = render(<BarreLaterale actif={null} onNaviguer={naviguer} baseReliee reception={null} />);
    fireEvent.click(getByRole('link', { name: 'Clients' }));
    expect(naviguer).toHaveBeenCalledWith('clients');
  });

  it('se replie en icônes, et le retient', () => {
    const { getByRole, queryByText, unmount } = render(<BarreLaterale actif="contenus" onNaviguer={() => {}} baseReliee reception={null} />);
    fireEvent.click(getByRole('button', { name: 'Replier la barre latérale' }));
    expect(queryByText('Luminose')).toBeNull();
    // Le nom reste porté par le lien : une icône seule ne dit rien à un lecteur d'écran.
    expect(getByRole('link', { name: 'Contenus' })).toBeTruthy();
    unmount();
    const ensuite = render(<BarreLaterale actif="contenus" onNaviguer={() => {}} baseReliee reception={null} />);
    expect(ensuite.getByRole('button', { name: 'Déplier la barre latérale' })).toBeTruthy();
  });

  it('base non reliée : la pratique se grise, sauf Psychédéliques ; pas de ligne d’état', () => {
    const { container, queryByRole } = render(<BarreLaterale actif="contenus" onNaviguer={() => {}} baseReliee={false} reception={null} />);
    for (const nom of ['Aujourd’hui', 'Agenda', 'Clients', 'Paiements', 'Stages', 'Professionnels']) expect(queryByRole('link', { name: nom })).toBeNull();
    expect(queryByRole('link', { name: 'Psychédéliques' })).not.toBeNull();
    expect(container.querySelectorAll('[aria-disabled="true"]')).toHaveLength(6);
    expect(container.textContent).not.toContain('Réception du site');
  });

  it('réception coupée : la ligne le dit, avec un signe', () => {
    const { container } = render(<BarreLaterale actif="contenus" onNaviguer={() => {}} baseReliee reception={COUPEE} />);
    expect(container.textContent).toContain('! Réception du site : coupée');
  });

  it('un contenu ouvert replie la barre sans changer le choix retenu', () => {
    const { queryByRole } = render(<BarreLaterale actif="contenus" onNaviguer={() => {}} baseReliee reception={null} forcerRepliee />);
    expect(queryByRole('button', { name: /barre latérale/ })).toBeNull();
    expect(localStorage.getItem('luminose-barre-repliee')).toBeNull();
  });

  it('porte la veille des modèles sur Réglages', () => {
    const { container } = render(<BarreLaterale actif={null} onNaviguer={() => {}} baseReliee reception={null} compteReglages={2} />);
    expect([...container.querySelectorAll('a')].find(a => a.textContent?.startsWith('Réglages'))?.textContent).toBe('Réglages2');
  });
});

describe('l’iPhone', () => {
  it('la barre du bas : quatre entrées et le « + » ; sans la base, Contenus prend la première place', () => {
    const ajouter = vi.fn();
    const sansBase = render(<BarreDuBas actif="contenus" onNaviguer={() => {}} onAjouter={ajouter} baseReliee={false} />);
    expect([...sansBase.container.querySelectorAll('a')].map(a => a.textContent)).toEqual(['Contenus', 'Plus']);
    cleanup();
    const { container, getByRole } = render(<BarreDuBas actif="plus" onNaviguer={() => {}} onAjouter={ajouter} baseReliee />);
    expect([...container.querySelectorAll('a')].map(a => a.textContent)).toEqual(['Aujourd’hui', 'Agenda', 'Clients', 'Plus']);
    expect(getByRole('link', { name: 'Plus' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(getByRole('button', { name: /Ajouter/ }));
    expect(ajouter).toHaveBeenCalled();
  });

  it('la feuille « Ajouter » : fermée, rien ; ouverte, trois gestes', () => {
    const geste = vi.fn();
    const { queryByText, rerender, getByText } = render(<FeuilleAjouter ouverte={false} onFermer={() => {}} onGeste={geste} baseReliee />);
    expect(queryByText('Noter une idée')).toBeNull();
    rerender(<FeuilleAjouter ouverte onFermer={() => {}} onGeste={geste} baseReliee />);
    for (const g of ['Noter une idée', 'Nouvelle fiche', 'Poser un rendez-vous']) expect(getByText(g)).toBeTruthy();
    fireEvent.click(getByText('Nouvelle fiche'));
    expect(geste).toHaveBeenCalledWith('fiche');
  });

  it('base non reliée : seule l’idée reste possible', () => {
    const { getByText } = render(<FeuilleAjouter ouverte onFermer={() => {}} onGeste={() => {}} baseReliee={false} />);
    expect((getByText('Noter une idée').closest('button') as HTMLButtonElement).disabled).toBe(false);
    expect((getByText('Nouvelle fiche').closest('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('« Plus » : la réception en tête, puis ce que la barre du bas ne porte pas', () => {
    const { container } = render(<EcranPlus onNaviguer={() => {}} baseReliee reception={OUVERTE} />);
    const texte = container.textContent ?? '';
    expect(texte.indexOf('Réception du site : ouverte')).toBe(0);
    expect(texte).toContain('3 reçus sur 24 h');
    for (const nom of ['Stages', 'Professionnels', 'Psychédéliques', 'Contenus', 'Corpus', 'Réglages']) expect(texte).toContain(nom);
    expect([...container.querySelectorAll('a')].map(a => a.textContent)).not.toContain('Agenda');
  });

  it('« Plus », réception coupée : une alerte', () => {
    const { getByRole } = render(<EcranPlus onNaviguer={() => {}} baseReliee reception={COUPEE} />);
    expect(getByRole('alert').textContent).toContain('Réception du site : coupée');
  });
});

describe('le second niveau', () => {
  it('une liste, l’entrée active marquée, les compteurs', () => {
    const choisir = vi.fn();
    const { getByRole } = render(<ListeSecondNiveau libelle="Réglages" actif="b" onChoisir={choisir}
      entrees={[{ id: 'a', libelle: 'Alpha' }, { id: 'b', libelle: 'Bêta', compte: 2 }]} />);
    expect(getByRole('button', { name: /^Bêta/ }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(getByRole('button', { name: 'Alpha' }));
    expect(choisir).toHaveBeenCalledWith('a');
  });
});
