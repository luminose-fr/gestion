/**
 * Le moteur vient d'être extrait d'un composant React où table des facteurs,
 * calcul et affichage étaient mêlés. Ces tests figent le comportement d'avant
 * extraction : les repères commentés dans la source d'origine (« 70 kg → 12.6 g »)
 * servent de vérité.
 */
import { describe, it, expect } from 'vitest';
import {
  computeDoses, getAvailableForms, getMushroomVariant,
  DOSE_LEVELS, SUBSTANCES, MUSHROOM_FAMILIES, SAFETY_DATA,
  type MushroomFamily,
} from '../src/index';

const at = (r: { level: string; amount: number }[], level: string) =>
  r.find(x => x.level === level)!.amount;

describe('champignons', () => {
  it('reprend les repères d’origine pour les truffes fraîches à 70 kg', () => {
    const { results } = computeDoses('Champignons', 70, getMushroomVariant('Truffes', 'Frais'));
    expect(at(results, 'Micro-dose')).toBe(0.7);
    expect(at(results, 'Normal')).toBe(12.6);
    expect(at(results, 'Héroïque')).toBe(35);
  });

  it('applique le ratio frais/sec de 3 sur les truffes', () => {
    const frais = computeDoses('Champignons', 70, getMushroomVariant('Truffes', 'Frais')).results;
    const sec = computeDoses('Champignons', 70, getMushroomVariant('Truffes', 'Sec')).results;
    expect(at(frais, 'Normal') / at(sec, 'Normal')).toBeCloseTo(3, 5);
  });

  it('rend le copelandia sec nettement plus concentré que le cubensis sec', () => {
    const cope = computeDoses('Champignons', 70, getMushroomVariant('Copelandia', 'Sec')).results;
    const cube = computeDoses('Champignons', 70, getMushroomVariant('Cubensis', 'Sec')).results;
    expect(at(cope, 'Normal')).toBeLessThan(at(cube, 'Normal'));
  });

  it('est proportionnel au poids', () => {
    const v = getMushroomVariant('Cubensis', 'Sec');
    expect(at(computeDoses('Champignons', 100, v).results, 'Normal'))
      .toBeCloseTo(at(computeDoses('Champignons', 50, v).results, 'Normal') * 2, 5);
  });

  it('arrondit à deux décimales', () => {
    const { results } = computeDoses('Champignons', 73, getMushroomVariant('Cubensis', 'Sec'));
    for (const r of results) expect(r.amount).toBe(Math.round(r.amount * 100) / 100);
  });
});

describe('LSD', () => {
  it('ne dépend pas du poids — ce sont des paliers fixes', () => {
    const a = computeDoses('LSD', 50, getMushroomVariant('Cubensis', 'Sec')).results;
    const b = computeDoses('LSD', 110, getMushroomVariant('Cubensis', 'Sec')).results;
    expect(a).toEqual(b);
    expect(at(a, 'Normal')).toBe(80);
  });
});

describe('MDMA', () => {
  const v = getMushroomVariant('Cubensis', 'Sec');

  it('applique 1,5 mg/kg en dessous du plafond', () => {
    expect(at(computeDoses('MDMA', 70, v).results, 'Normal')).toBe(105);
  });

  it('plafonne à 120 mg, quel que soit le poids', () => {
    for (const kg of [90, 120, 200]) {
      expect(at(computeDoses('MDMA', kg, v).results, 'Normal')).toBe(120);
    }
  });

  it('signale le plafonnement dans la description', () => {
    const normal = computeDoses('MDMA', 200, v).results.find(r => r.level === 'Normal')!;
    expect(normal.description).toContain('Plafonné');
  });
});

describe('complétude', () => {
  it('chaque substance a ses données de sécurité', () => {
    for (const s of SUBSTANCES) {
      expect(SAFETY_DATA[s].effects.length).toBeGreaterThan(0);
      expect(SAFETY_DATA[s].advice).toBeTruthy();
      expect(SAFETY_DATA[s].duration).toBeTruthy();
    }
  });

  it('chaque famille de champignon a au moins une forme', () => {
    for (const f of MUSHROOM_FAMILIES as readonly MushroomFamily[]) {
      expect(getAvailableForms(f).length).toBeGreaterThan(0);
    }
  });

  it('champignons et LSD couvrent les cinq paliers', () => {
    const v = getMushroomVariant('Cubensis', 'Sec');
    for (const s of ['Champignons', 'LSD'] as const) {
      expect(computeDoses(s, 70, v).results.map(r => r.level)).toEqual([...DOSE_LEVELS]);
    }
  });
});
