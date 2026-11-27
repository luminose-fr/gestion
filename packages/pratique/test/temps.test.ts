/**
 * Le temps de Paris (SPEC §14.7.1). Les instants attendus sont écrits en toutes
 * lettres, en UTC : un test qui les recalculerait avec la fonction testée ne
 * prouverait rien.
 */
import { describe, it, expect } from 'vitest';
import { instantDeParis, instantDepuisIso, isoDeParis, jourDeLaSemaine, jourDeParis, jourSuivant } from '../src';

const z = (instant: number): string => new Date(instant).toISOString();

describe('instantDeParis', () => {
  it.each([
    ['2026-12-17', '09:30', '2026-12-17T08:30:00.000Z'],
    ['2027-07-01', '09:30', '2027-07-01T07:30:00.000Z'],
    ['2026-12-17', '00:00', '2026-12-16T23:00:00.000Z'],
    ['2026-12-31', '23:59', '2026-12-31T22:59:00.000Z'],
    // Veille et lendemain des changements d'heure de 2027.
    ['2027-03-27', '02:30', '2027-03-27T01:30:00.000Z'],
    ['2027-03-29', '02:30', '2027-03-29T00:30:00.000Z'],
    ['2027-10-30', '02:30', '2027-10-30T00:30:00.000Z'],
    ['2027-11-01', '02:30', '2027-11-01T01:30:00.000Z'],
  ])('%s %s → %s', (date, heure, attendu) => {
    expect(z(instantDeParis(date, heure))).toBe(attendu);
  });

  it('une heure qui n’existe pas se lit avec le décalage d’avant le changement', () => {
    expect(z(instantDeParis('2027-03-28', '02:30'))).toBe('2027-03-28T01:30:00.000Z');
    expect(z(instantDeParis('2027-03-28', '02:00'))).toBe('2027-03-28T01:00:00.000Z');
    // Autour du trou, rien ne bouge.
    expect(z(instantDeParis('2027-03-28', '01:59'))).toBe('2027-03-28T00:59:00.000Z');
    expect(z(instantDeParis('2027-03-28', '03:00'))).toBe('2027-03-28T01:00:00.000Z');
  });

  it('une heure qui existe deux fois désigne sa première occurrence', () => {
    expect(z(instantDeParis('2027-10-31', '02:30'))).toBe('2027-10-31T00:30:00.000Z');
    expect(z(instantDeParis('2027-10-31', '02:00'))).toBe('2027-10-31T00:00:00.000Z');
    expect(z(instantDeParis('2027-10-31', '01:59'))).toBe('2027-10-30T23:59:00.000Z');
    expect(z(instantDeParis('2027-10-31', '03:00'))).toBe('2027-10-31T02:00:00.000Z');
  });

  it('refuse une date ou une heure mal formée : c’est une faute de l’appelant', () => {
    expect(() => instantDeParis('2026-02-30', '09:30')).toThrow(RangeError);
    expect(() => instantDeParis('17/12/2026', '09:30')).toThrow(RangeError);
    expect(() => instantDeParis('2026-12-17', '9:30')).toThrow(RangeError);
    expect(() => instantDeParis('2026-12-17', '24:00')).toThrow(RangeError);
  });
});

describe('isoDeParis', () => {
  it.each([
    ['2026-12-17T08:30:00Z', '2026-12-17T09:30:00+01:00'],
    ['2027-07-01T07:30:00Z', '2027-07-01T09:30:00+02:00'],
    ['2026-12-16T23:00:00Z', '2026-12-17T00:00:00+01:00'],
    // La nuit du passage à l'heure d'hiver : la même heure murale, deux décalages.
    ['2027-10-31T00:30:00Z', '2027-10-31T02:30:00+02:00'],
    ['2027-10-31T01:30:00Z', '2027-10-31T02:30:00+01:00'],
    ['2027-03-28T01:00:00Z', '2027-03-28T03:00:00+02:00'],
  ])('%s → %s', (utc, attendu) => {
    expect(isoDeParis(Date.parse(utc))).toBe(attendu);
  });

  it('se relit avec instantDepuisIso', () => {
    const t = Date.parse('2027-10-31T01:30:00Z');
    expect(instantDepuisIso(isoDeParis(t))).toBe(t);
  });
});

describe('jourDeParis', () => {
  it('suit Paris, pas UTC', () => {
    expect(jourDeParis(Date.parse('2026-12-16T23:00:00Z'))).toBe('2026-12-17');
    expect(jourDeParis(Date.parse('2026-12-16T22:59:59.999Z'))).toBe('2026-12-16');
    expect(jourDeParis(Date.parse('2027-10-30T23:30:00Z'))).toBe('2027-10-31');
  });
});

describe('jourDeLaSemaine', () => {
  it.each([
    ['2026-12-14', 1],
    ['2026-12-17', 4],
    ['2026-12-20', 7],
    ['2027-03-28', 7],
    ['2027-05-28', 5],
  ])('%s → %i', (date, attendu) => {
    expect(jourDeLaSemaine(date)).toBe(attendu);
  });
});

describe('jourSuivant', () => {
  it('passe les mois, les années et les changements d’heure', () => {
    expect(jourSuivant('2026-12-31')).toBe('2027-01-01');
    expect(jourSuivant('2028-02-28')).toBe('2028-02-29');
    expect(jourSuivant('2027-03-28')).toBe('2027-03-29');
  });
});

describe('instantDepuisIso', () => {
  it.each([
    ['2026-12-17T09:30:00+01:00', '2026-12-17T08:30:00.000Z'],
    ['2026-12-17T08:30:00Z', '2026-12-17T08:30:00.000Z'],
    ['2026-12-17T09:30+01:00', '2026-12-17T08:30:00.000Z'],
    ['2026-12-17T09:30:00.250+01:00', '2026-12-17T08:30:00.250Z'],
    ['2026-12-17T03:30:00-05:00', '2026-12-17T08:30:00.000Z'],
  ])('%s → %s', (texte, attendu) => {
    expect(z(instantDepuisIso(texte)!)).toBe(attendu);
  });

  it.each([
    '2026-12-17T09:30:00',     // sans décalage : de quel fuseau parle-t-il ?
    '2026-12-17',
    '2026-02-30T09:30:00+01:00',
    '2026-12-17T25:00:00+01:00',
    '2026-12-17T09:30:00+0100',
    'demain 9 h 30',
    '',
  ])('%j → null', (texte) => {
    expect(instantDepuisIso(texte)).toBeNull();
  });
});
