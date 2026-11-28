/** Les formats du §1.5 des retours du 28/11/2026 : une seule fonction par sorte. */
import { describe, it, expect } from 'vitest';
import { delai, duree, heureCreneau, heureListe, montant } from '../lib/format';

describe('les formats', () => {
  it('durées : min sous l’heure, puis h', () => {
    expect([20, 45, 60, 75, 90, 105, 120, 150].map(duree)).toEqual(['20 min', '45 min', '1 h', '1 h 15', '1 h 30', '1 h 45', '2 h', '2 h 30']);
  });
  it('heures : 9 h 30 pour un créneau, 09:30 dans une liste', () => {
    expect(heureCreneau('2027-01-11T09:30:00+01:00')).toBe('9 h 30');
    expect(heureCreneau('2027-01-11T13:00:00+01:00')).toBe('13 h');
    expect(heureListe('2027-01-11T09:30:00+01:00')).toBe('09:30');
  });
  it('délais stockés en heures', () => {
    expect(delai(72)).toBe('3 jours');
    expect(delai(168)).toBe('1 semaine');
    expect(delai(168, { retenue: true })).toBe('7 jours');
    expect(delai(720)).toBe('30 jours');
    expect(delai(12)).toBe('12 heures');
    expect(delai(36)).toBe('36 heures');
    expect(delai(4392)).toBe('6 mois');
    expect(delai(8760)).toBe('1 an');
    expect(delai(24)).toBe('1 jour');
  });
  it('montants : zéro se dit offert', () => {
    expect(montant(0)).toBe('offert');
    expect(montant(8000)).toMatch(/^80\s€$/);
  });
});
