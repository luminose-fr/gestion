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
