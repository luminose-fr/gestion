/**
 * @vitest-environment jsdom
 *
 * La charte de la refonte (lot 1) : la planche se monte, le thème se pose sur
 * `<html>` et se retient, les onglets se suivent au clavier, et la fenêtre se
 * monte fermée puis ouverte (CLAUDE.md : les deux états).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React, { useState } from 'react';
import PageComposants from '../components/charte/PageComposants';
import { Fenetre, Onglets, Pastille, poserTheme, lireTheme } from '../components/charte';

// jsdom ne connaît pas showModal : on l'imite, juste assez pour suivre `open`.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); };
}

afterEach(() => { cleanup(); localStorage.clear(); document.documentElement.removeAttribute('data-theme'); });

describe('charte', () => {
  it('monte la planche et change de thème', () => {
    const { getByRole } = render(<PageComposants />);
    fireEvent.click(getByRole('radio', { name: 'Sombre' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(lireTheme()).toBe('sombre');
    fireEvent.click(getByRole('radio', { name: 'Système' }));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(lireTheme()).toBe('systeme');
  });

  it('le thème clair se pose explicitement', () => {
    poserTheme('clair');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('une pastille porte toujours un signe', () => {
    const { container } = render(<Pastille ton="alerte">À encaisser</Pastille>);
    expect(container.textContent).toBe('!À encaisser');
  });

  it('les onglets se suivent aux flèches et bouclent', () => {
    const Essai = () => {
      const [a, setA] = useState<'x' | 'y' | 'z'>('x');
      return <Onglets libelle="essai" actif={a} onChange={setA} onglets={[{ id: 'x', libelle: 'X' }, { id: 'y', libelle: 'Y' }, { id: 'z', libelle: 'Z' }]} />;
    };
    const { getByRole } = render(<Essai />);
    fireEvent.keyDown(getByRole('tab', { name: 'X' }), { key: 'ArrowLeft' });
    expect(getByRole('tab', { name: 'Z' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(getByRole('tab', { name: 'Z' }), { key: 'Home' });
    expect(getByRole('tab', { name: 'X' }).getAttribute('aria-selected')).toBe('true');
  });

  it('la fenêtre se monte fermée puis ouverte', () => {
    const { rerender, queryByText, container } = render(<Fenetre ouverte={false} titre="Titre" onFermer={() => {}}>Corps</Fenetre>);
    expect(queryByText('Corps')).toBeNull();
    rerender(<Fenetre ouverte titre="Titre" onFermer={() => {}}>Corps</Fenetre>);
    expect(queryByText('Corps')).not.toBeNull();
    expect(container.querySelector('dialog')?.hasAttribute('open')).toBe(true);
  });
});
