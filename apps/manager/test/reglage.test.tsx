/**
 * @vitest-environment jsdom
 *
 * Les contrôles des réglages (retours du 28/11/2026, §2.3 et §2.4) : la règle
 * de reprise d'une valeur hors liste, le compteur, la barre, et la garde qui
 * demande confirmation avant de quitter un écran modifié.
 */
import React, { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { BarreEnregistrer, Compteur, ListeValeurs } from '../components/charte/reglage';
import { peutQuitter, useGardeQuitter } from '../lib/garde';
import { delai } from '../lib/format';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const OPTIONS = [[12, '12 heures'], [24, '1 jour'], [48, '2 jours']] as const;

describe('ListeValeurs', () => {
  it('une valeur hors liste s’affiche telle quelle, choisie, et reste dans la liste', () => {
    const changer = vi.fn();
    const { getByLabelText } = render(<ListeValeurs id="l" libelle="Délai" valeur={36} options={OPTIONS} horsListe={delai} onChange={changer} />);
    const select = getByLabelText('Délai') as HTMLSelectElement;
    expect(select.value).toBe('36');
    expect([...select.options].map((o) => o.textContent)).toEqual(['12 heures', '1 jour', '36 heures', '2 jours']);
    fireEvent.change(select, { target: { value: '48' } });
    expect(changer).toHaveBeenCalledWith(48);
  });

  it('une valeur de la liste n’ajoute rien', () => {
    const { getByLabelText } = render(<ListeValeurs id="l" libelle="Délai" valeur={24} options={OPTIONS} horsListe={delai} onChange={() => {}} />);
    expect((getByLabelText('Délai') as HTMLSelectElement).options).toHaveLength(3);
  });
});

describe('Compteur', () => {
  it('− et + restent dans leurs bornes', () => {
    const Essai = () => { const [v, setV] = useState(1); return <Compteur id="c" libelle="Personnes" valeur={v} onChange={setV} min={1} max={2} />; };
    const { getByLabelText } = render(<Essai />);
    const moins = getByLabelText('Personnes : un de moins') as HTMLButtonElement;
    expect(moins.disabled).toBe(true);
    fireEvent.click(getByLabelText('Personnes : un de plus'));
    expect((getByLabelText('Personnes') as HTMLInputElement).value).toBe('2');
    expect((getByLabelText('Personnes : un de plus') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('BarreEnregistrer', () => {
  it('absente sans modification ; compte les modifications sinon', () => {
    const { container, rerender } = render(<BarreEnregistrer modifications={0} onAnnuler={() => {}} onEnregistrer={() => {}} />);
    expect(container.textContent).toBe('');
    rerender(<BarreEnregistrer modifications={2} onAnnuler={() => {}} onEnregistrer={() => {}} />);
    expect(container.textContent).toContain('2 modifications non enregistrées');
  });
});

describe('la garde', () => {
  const Ecran: React.FC<{ modifie: boolean }> = ({ modifie }) => { useGardeQuitter(modifie); return null; };

  it('sans modification, on quitte sans question ; avec, on demande', () => {
    const confirmer = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { rerender, unmount } = render(<Ecran modifie={false} />);
    expect(peutQuitter()).toBe(true);
    expect(confirmer).not.toHaveBeenCalled();
    rerender(<Ecran modifie />);
    expect(peutQuitter()).toBe(false);
    confirmer.mockReturnValue(true);
    expect(peutQuitter()).toBe(true);
    unmount();
    confirmer.mockClear();
    expect(peutQuitter()).toBe(true);
    expect(confirmer).not.toHaveBeenCalled();
  });
});
