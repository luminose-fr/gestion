/**
 * Qui prévenir d'un créneau libéré (SPEC §14.7.1 ; modèle de données, §3.1 et
 * §5 règle 3). Les seuils sont essayés avec deux valeurs différentes, 48 et 72,
 * pour savoir lequel a joué : avec deux 48, un test vert ne dirait rien.
 */
import { describe, it, expect } from 'vitest';
import { quiPrevenir, type SeanceEnAttente } from '../src';

const H = 3_600_000;
const MAINTENANT = Date.parse('2026-12-01T09:00:00Z');
const REGLAGES = { creneauMinH: 48, seanceMinH: 48, personnesMax: 8 };

/** Un créneau de séance (90 minutes) dans cinq jours. */
const CRENEAU = { debut: MAINTENANT + 120 * H, dureeMin: 90 };

let n = 0;
/** Une séance éligible au créneau ci-dessus, sauf ce que le cas change. */
const seance = (s: Partial<SeanceEnAttente> = {}): SeanceEnAttente => {
  n += 1;
  return {
    id: `s${String(n).padStart(2, '0')}`, personne: `p${String(n).padStart(2, '0')}`,
    debut: MAINTENANT + 400 * H, occupationMin: 90,
    reserveeLe: MAINTENANT - 1000 * H + n * H, listeAttente: true, statut: 'prevue', ...s,
  };
};

describe('quiPrevenir — le créneau', () => {
  const seances = [seance({ id: 'a' })];
  it('un créneau qui commence dans 47 h : personne', () => {
    expect(quiPrevenir({ creneau: { ...CRENEAU, debut: MAINTENANT + 47 * H }, seances, reglages: REGLAGES, maintenant: MAINTENANT })).toEqual([]);
  });
  it('dans 48 h exactement : on prévient', () => {
    expect(quiPrevenir({ creneau: { ...CRENEAU, debut: MAINTENANT + 48 * H }, seances, reglages: REGLAGES, maintenant: MAINTENANT })).toEqual(['a']);
  });
  it('c’est le seuil du créneau qui joue, pas celui de la séance (72 contre 48)', () => {
    const reglages = { ...REGLAGES, creneauMinH: 72 };
    const creneau = (h: number) => ({ ...CRENEAU, debut: MAINTENANT + h * H });
    expect(quiPrevenir({ creneau: creneau(72), seances, reglages, maintenant: MAINTENANT })).toEqual(['a']);
    expect(quiPrevenir({ creneau: creneau(72), seances, reglages, maintenant: MAINTENANT + 1 })).toEqual([]);
    expect(quiPrevenir({ creneau: creneau(60), seances, reglages, maintenant: MAINTENANT })).toEqual([]);
  });
});

describe('quiPrevenir — la séance', () => {
  /**
   * Avec deux seuils égaux, une séance à 48 h exactement ne peut pas suivre un
   * créneau qui en est lui-même à 48 h ou plus : le seuil de la séance ne se voit
   * qu'avec une valeur différente.
   */
  it('une séance au seuil exact est éligible ; une milliseconde plus tôt, non (72 contre 48)', () => {
    const reglages = { ...REGLAGES, seanceMinH: 72 };
    const seances = [
      seance({ id: 'a-72h', debut: MAINTENANT + 72 * H }),
      seance({ id: 'a-72h-moins-1ms', debut: MAINTENANT + 72 * H - 1 }),
    ];
    const creneau = { ...CRENEAU, debut: MAINTENANT + 48 * H };
    expect(quiPrevenir({ creneau, seances, reglages, maintenant: MAINTENANT })).toEqual(['a-72h']);
  });
  it.each<[string, Partial<SeanceEnAttente>]>([
    ['une séance avant le créneau', { debut: CRENEAU.debut - H }],
    ['une séance au même début que le créneau', { debut: CRENEAU.debut }],
    ['une séance annulée', { statut: 'annulee' }],
    ['une séance réalisée', { statut: 'realisee' }],
    ['une séance hors liste d’attente', { listeAttente: false }],
    ['un breathwork de 120 minutes pour un créneau de 90', { occupationMin: 120 }],
  ])('%s est écartée', (_, change) => {
    const seances = [seance({ id: 'ecartee', ...change }), seance({ id: 'gardee' })];
    expect(quiPrevenir({ creneau: CRENEAU, seances, reglages: REGLAGES, maintenant: MAINTENANT })).toEqual(['gardee']);
  });
  it('une occupation égale au créneau y tient', () => {
    const seances = [seance({ id: 'juste', occupationMin: 90 })];
    expect(quiPrevenir({ creneau: CRENEAU, seances, reglages: REGLAGES, maintenant: MAINTENANT })).toEqual(['juste']);
  });
});

describe('quiPrevenir — le plafond et l’ordre', () => {
  it('dix personnes éligibles : les huit plus anciennes réservations, dans l’ordre', () => {
    const seances = Array.from({ length: 10 }, (_, i) => seance({ id: `r${i}`, personne: `p${i}`, reserveeLe: MAINTENANT - (10 - i) * H }));
    // Données dans le désordre : l'ordre rendu ne doit rien à celui reçu.
    expect(quiPrevenir({ creneau: CRENEAU, seances: [...seances].reverse(), reglages: REGLAGES, maintenant: MAINTENANT }))
      .toEqual(['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7']);
  });
  it('une personne qui a deux séances éligibles ne prend qu’une place sur huit : la plus ancienne', () => {
    const seances = [
      seance({ id: 'emilie-2', personne: 'emilie', reserveeLe: MAINTENANT - 5 * H }),
      seance({ id: 'emilie-1', personne: 'emilie', reserveeLe: MAINTENANT - 20 * H }),
      ...Array.from({ length: 8 }, (_, i) => seance({ id: `r${i}`, personne: `p${i}`, reserveeLe: MAINTENANT - (10 - i) * H })),
    ];
    expect(quiPrevenir({ creneau: CRENEAU, seances, reglages: REGLAGES, maintenant: MAINTENANT }))
      .toEqual(['emilie-1', 'r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
  });
  it('la séance écartée d’une personne ne lui fait pas perdre l’autre', () => {
    const seances = [
      seance({ id: 'ancienne-annulee', personne: 'emilie', reserveeLe: MAINTENANT - 20 * H, statut: 'annulee' }),
      seance({ id: 'recente', personne: 'emilie', reserveeLe: MAINTENANT - 5 * H }),
    ];
    expect(quiPrevenir({ creneau: CRENEAU, seances, reglages: REGLAGES, maintenant: MAINTENANT })).toEqual(['recente']);
  });
  it('deux séances sans fiche prennent deux places', () => {
    const seances = [
      seance({ id: 'x1', personne: null, reserveeLe: MAINTENANT - 3 * H }),
      seance({ id: 'x2', personne: null, reserveeLe: MAINTENANT - 2 * H }),
    ];
    expect(quiPrevenir({ creneau: CRENEAU, seances, reglages: { ...REGLAGES, personnesMax: 2 }, maintenant: MAINTENANT }))
      .toEqual(['x1', 'x2']);
  });
  it('deux réservations au même instant : l’ordre suit l’identifiant, quel que soit l’ordre reçu', () => {
    const a = seance({ id: 'b-seance', reserveeLe: MAINTENANT - 4 * H });
    const b = seance({ id: 'a-seance', reserveeLe: MAINTENANT - 4 * H });
    expect(quiPrevenir({ creneau: CRENEAU, seances: [a, b], reglages: REGLAGES, maintenant: MAINTENANT })).toEqual(['a-seance', 'b-seance']);
    expect(quiPrevenir({ creneau: CRENEAU, seances: [b, a], reglages: REGLAGES, maintenant: MAINTENANT })).toEqual(['a-seance', 'b-seance']);
  });
});
