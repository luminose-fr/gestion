/**
 * Le calcul des créneaux (SPEC §14.7.1). Ce fichier porte les valeurs de la
 * règle : les créneaux attendus sont écrits en toutes lettres, en heures de
 * Paris, et en UTC là où l'heure de Paris ne suffit pas à lever le doute.
 * Changer l'une de ces lignes, c'est changer ce qu'une personne peut réserver.
 */
import { describe, it, expect } from 'vitest';
import {
  creneauxLibres, verifierCreneau, instantDeParis, isoDeParis, jourSuivant,
  type DemandeDeCreneaux, type Horaires, type Plage, type TypeDeSeance,
} from '../src';

// ── La référence commune ─────────────────────────────────────────────────────

const OUVERT: Plage[] = [
  { debut: '09:30', fin: '11:30' },
  { debut: '13:00', fin: '16:00' },
  { debut: '16:30', fin: '19:30' },
];
const SEMAINE: Horaires = { semaine: { 1: OUVERT, 4: OUVERT }, dates: {} };

const avecDates = (dates: Horaires['dates']): Horaires => ({ semaine: SEMAINE.semaine, dates });

/** Sauf mention, la fenêtre est grande ouverte : `maintenant` vaut 0 (1970), et elle court sur un million d'heures. */
const OUVERTE = { fenetreDebutH: 0, fenetreFinH: 1_000_000 };
const RENCONTRE: TypeDeSeance = { dureeMin: 20, margeApresMin: 0, pasMin: 30, ...OUVERTE };
const SEANCE: TypeDeSeance = { dureeMin: 90, margeApresMin: 0, pasMin: 90, ...OUVERTE };
const ENFANT: TypeDeSeance = { dureeMin: 60, margeApresMin: 0, pasMin: 60, ...OUVERTE };
const BREATHWORK: TypeDeSeance = { dureeMin: 105, margeApresMin: 15, pasMin: 60, ...OUVERTE };

/** Les fenêtres réelles (modèle de données, §3.1). */
const SEANCE_EN_LIGNE: TypeDeSeance = { ...SEANCE, fenetreDebutH: 504, fenetreFinH: 4392 };
const RENCONTRE_EN_LIGNE: TypeDeSeance = { ...RENCONTRE, fenetreDebutH: 12, fenetreFinH: 4392 };

const JEUDI = '2026-12-17';
const p = instantDeParis;
const occ = (jour: string, debut: string, fin: string) => ({ debut: p(jour, debut), fin: p(jour, fin) });

const demande = (d: Partial<DemandeDeCreneaux> & { type: TypeDeSeance }): DemandeDeCreneaux => ({
  horaires: SEMAINE, occupations: [], maintenant: 0, du: JEUDI, au: JEUDI, ...d,
});

/** L'heure de Paris d'un instant, `'HH:MM'` ; le jour se vérifie à part quand il compte. */
const hm = (t: number): string => isoDeParis(t).slice(11, 16);
const heures = (d: DemandeDeCreneaux): string[] => creneauxLibres(d).map(hm);
const utc = (d: DemandeDeCreneaux): string[] => creneauxLibres(d).map((t) => new Date(t).toISOString());

const B_RENCONTRE = ['09:30', '10:00', '10:30', '11:00', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:30', '17:00', '17:30', '18:00', '18:30', '19:00'];
const A_SEANCE = ['09:30', '13:00', '14:30', '16:30', '18:00'];

// ── Les cas, nommés comme dans le brief, et rejoués par la propriété du bas ──

const CAS: Record<string, DemandeDeCreneaux> = {
  A: demande({ type: SEANCE }),
  B: demande({ type: RENCONTRE }),
  C: demande({ type: BREATHWORK }),
  D: demande({ type: ENFANT }),
  E1: demande({ type: SEANCE, occupations: [occ(JEUDI, '13:00', '14:30')] }),
  E2: demande({ type: RENCONTRE, occupations: [occ(JEUDI, '13:00', '14:30')] }),
  F1: demande({ type: SEANCE, occupations: [occ(JEUDI, '13:00', '15:00')] }),
  F2: demande({ type: BREATHWORK, occupations: [occ(JEUDI, '18:30', '20:00')] }),
  F3: demande({ type: BREATHWORK, occupations: [occ(JEUDI, '19:20', '19:40')] }),
  G: demande({ type: SEANCE, occupations: [occ(JEUDI, '10:00', '10:15')] }),
  H1: demande({ type: SEANCE, horaires: avecDates({ '2026-12-24': [] }), du: '2026-12-24', au: '2026-12-24' }),
  H2s: demande({ type: SEANCE, horaires: avecDates({ '2026-12-22': [{ debut: '10:00', fin: '12:00' }] }), du: '2026-12-22', au: '2026-12-22' }),
  H2r: demande({ type: RENCONTRE, horaires: avecDates({ '2026-12-22': [{ debut: '10:00', fin: '12:00' }] }), du: '2026-12-22', au: '2026-12-22' }),
  H3: demande({ type: SEANCE, horaires: avecDates({ [JEUDI]: [{ debut: '14:00', fin: '15:30' }] }) }),
  N: demande({ type: SEANCE, du: '2026-12-14', au: JEUDI }),
  I1: demande({ type: SEANCE_EN_LIGNE, maintenant: p('2026-11-26', '10:00') }),
  I2: demande({ type: SEANCE_EN_LIGNE, maintenant: p('2026-11-26', '09:40') }),
  I3: demande({ type: SEANCE_EN_LIGNE, maintenant: p('2026-11-26', '09:40'), toleranceMin: 15 }),
  I4: demande({ type: SEANCE_EN_LIGNE, maintenant: p('2026-11-26', '09:46'), toleranceMin: 15 }),
  I5: demande({ type: RENCONTRE_EN_LIGNE, maintenant: p('2026-11-26', '08:00'), du: '2026-11-26', au: '2026-11-30' }),
  I6: demande({ type: RENCONTRE_EN_LIGNE, maintenant: p('2026-11-25', '22:15'), du: '2026-11-26', au: '2026-11-26' }),
  I7: demande({ type: SEANCE_EN_LIGNE, maintenant: p('2026-11-26', '10:00'), horaires: avecDates({ '2027-05-28': OUVERT }), du: '2027-05-28', au: '2027-05-28' }),
  I8: demande({ type: SEANCE_EN_LIGNE, maintenant: p('2026-11-26', '09:30') }),
  I8b: demande({ type: SEANCE_EN_LIGNE, maintenant: p('2026-11-26', '09:30') + 1 }),
  I9: demande({ type: SEANCE_EN_LIGNE, maintenant: p('2026-11-25', '08:30'), du: '2027-05-27', au: '2027-05-27' }),
  I9b: demande({ type: SEANCE_EN_LIGNE, maintenant: p('2026-11-25', '08:30') - 1, du: '2027-05-27', au: '2027-05-27' }),
  I9c: demande({ type: SEANCE_EN_LIGNE, maintenant: p('2026-11-25', '08:30') - 1, du: '2027-05-27', au: '2027-05-27', toleranceMin: 15 }),
  K1: demande({ type: RENCONTRE, horaires: avecDates({ '2027-03-28': [{ debut: '01:30', fin: '04:30' }] }), du: '2027-03-28', au: '2027-03-28' }),
  K2: demande({ type: RENCONTRE, horaires: avecDates({ '2027-10-31': [{ debut: '01:30', fin: '04:30' }] }), du: '2027-10-31', au: '2027-10-31' }),
  K3: demande({ type: RENCONTRE, horaires: avecDates({ '2027-03-21': [{ debut: '01:30', fin: '04:30' }] }), du: '2027-03-21', au: '2027-03-21' }),
  K4: demande({ type: RENCONTRE, horaires: avecDates({ '2027-03-28': [{ debut: '02:30', fin: '03:00' }] }), du: '2027-03-28', au: '2027-03-28' }),
};

describe('creneauxLibres — un jour libre, par type', () => {
  it('A. séance : cinq créneaux, en UTC comme à Paris', () => {
    expect(heures(CAS.A)).toEqual(A_SEANCE);
    expect(utc(CAS.A)).toEqual([
      '2026-12-17T08:30:00.000Z', '2026-12-17T12:00:00.000Z', '2026-12-17T13:30:00.000Z',
      '2026-12-17T15:30:00.000Z', '2026-12-17T17:00:00.000Z',
    ]);
  });
  it('B. rencontre : seize créneaux', () => {
    expect(heures(CAS.B)).toEqual(B_RENCONTRE);
    expect(heures(CAS.B)).toHaveLength(16);
  });
  it('C. breathwork : la marge doit tenir dans la plage, et 105 + 15 y tombe juste', () => {
    expect(heures(CAS.C)).toEqual(['09:30', '13:00', '14:00', '16:30', '17:30']);
  });
  it('D. séance enfant', () => {
    expect(heures(CAS.D)).toEqual(['09:30', '10:30', '13:00', '14:00', '15:00', '16:30', '17:30', '18:30']);
  });
});

describe('creneauxLibres — les occupations', () => {
  it('E1. une séance prévue 13:00–14:30 : 14:30 la touche sans la chevaucher', () => {
    expect(heures(CAS.E1)).toEqual(['09:30', '14:30', '16:30', '18:00']);
  });
  it('E2. la même occupation, pour une rencontre', () => {
    expect(heures(CAS.E2)).toEqual(['09:30', '10:00', '10:30', '11:00', '14:30', '15:00', '15:30',
      '16:30', '17:00', '17:30', '18:00', '18:30', '19:00']);
  });
  it('F1. un breathwork prévu à 13:00 occupe jusqu’à 15:00 : la marge de l’autre bloque 14:30', () => {
    expect(heures(CAS.F1)).toEqual(['09:30', '16:30', '18:00']);
  });
  it('F2. breathwork, occupation 18:30–20:00 : 16:30 finit, marge comprise, à 18:30', () => {
    expect(heures(CAS.F2)).toEqual(['09:30', '13:00', '14:00', '16:30']);
  });
  it('F3. breathwork, agenda 19:20–19:40 : sa propre marge fait tomber 17:30', () => {
    expect(heures(CAS.F3)).toEqual(['09:30', '13:00', '14:00', '16:30']);
  });
  it('G. séance, agenda 10:00–10:15', () => {
    expect(heures(CAS.G)).toEqual(['13:00', '14:30', '16:30', '18:00']);
  });
  it('des occupations qui se recouvrent, ou en désordre, ne changent rien', () => {
    const d = demande({ type: SEANCE, occupations: [occ(JEUDI, '14:00', '15:00'), occ(JEUDI, '13:00', '14:30'), occ(JEUDI, '13:30', '14:00')] });
    expect(heures(d)).toEqual(['09:30', '16:30', '18:00']);
  });
});

describe('creneauxLibres — les dates', () => {
  it('H1. un jeudi fermé par une liste vide', () => {
    expect(creneauxLibres(CAS.H1)).toEqual([]);
  });
  it('H2. un mardi ouvert de 10:00 à 12:00', () => {
    expect(heures(CAS.H2s)).toEqual(['10:00']);
    expect(heures(CAS.H2r)).toEqual(['10:00', '10:30', '11:00', '11:30']);
  });
  it('H3. un jeudi remplacé par 14:00–15:30 : la semaine type ne s’ajoute pas', () => {
    expect(heures(CAS.H3)).toEqual(['14:00']);
  });
  it('N. du lundi 14 au jeudi 17 : dix créneaux, triés', () => {
    expect(utc(CAS.N)).toEqual([
      '2026-12-14T08:30:00.000Z', '2026-12-14T12:00:00.000Z', '2026-12-14T13:30:00.000Z',
      '2026-12-14T15:30:00.000Z', '2026-12-14T17:00:00.000Z',
      '2026-12-17T08:30:00.000Z', '2026-12-17T12:00:00.000Z', '2026-12-17T13:30:00.000Z',
      '2026-12-17T15:30:00.000Z', '2026-12-17T17:00:00.000Z',
    ]);
  });
  it('des plages données dans le désordre rendent une liste triée', () => {
    const d = demande({ type: SEANCE, horaires: avecDates({ [JEUDI]: [...OUVERT].reverse() }) });
    expect(heures(d)).toEqual(A_SEANCE);
  });
  it('du après au : rien', () => {
    expect(creneauxLibres(demande({ type: SEANCE, du: '2026-12-18', au: JEUDI }))).toEqual([]);
  });
});

describe('creneauxLibres — la fenêtre', () => {
  it('I1. maintenant le 26/11 à 10:00 : la fenêtre s’ouvre le 17/12 à 10:00', () => {
    expect(heures(CAS.I1)).toEqual(['13:00', '14:30', '16:30', '18:00']);
  });
  it('I2. maintenant 09:40, sans tolérance', () => {
    expect(heures(CAS.I2)).toEqual(['13:00', '14:30', '16:30', '18:00']);
  });
  it('I3. le même instant, avec la tolérance de réservation', () => {
    expect(heures(CAS.I3)).toEqual(['09:30', '13:00', '14:30', '16:30', '18:00']);
  });
  it('I4. maintenant 09:46 : quinze minutes ne suffisent plus', () => {
    expect(heures(CAS.I4)).toEqual(['13:00', '14:30', '16:30', '18:00']);
  });
  it('I5. rencontre, maintenant jeudi 26/11 08:00 : rien le 26, les seize du lundi 30', () => {
    const libres = creneauxLibres(CAS.I5);
    expect(libres.map((t) => isoDeParis(t).slice(0, 10)).every((j) => j === '2026-11-30')).toBe(true);
    expect(libres.map(hm)).toEqual(B_RENCONTRE);
  });
  it('I6. rencontre, maintenant mercredi 25/11 22:15 : la fenêtre s’ouvre le 26 à 10:15', () => {
    expect(heures(CAS.I6)).toEqual(['10:30', '11:00', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
      '16:30', '17:00', '17:30', '18:00', '18:30', '19:00']);
  });
  it('I7. la fenêtre se ferme le vendredi 28/05/2027 à 11:00, heure d’été', () => {
    expect(utc(CAS.I7)).toEqual(['2027-05-28T07:30:00.000Z']);
  });
  it('I8. borne basse exacte : comprise ; une milliseconde plus tard, 09:30 n’y est plus', () => {
    expect(heures(CAS.I8)).toEqual(A_SEANCE);
    expect(heures(CAS.I8b)).toEqual(['13:00', '14:30', '16:30', '18:00']);
  });
  it('I9. borne haute exacte : comprise ; une milliseconde plus tôt, rien, même avec la tolérance', () => {
    expect(utc(CAS.I9)).toEqual(['2027-05-27T07:30:00.000Z']);
    expect(creneauxLibres(CAS.I9b)).toEqual([]);
    expect(creneauxLibres(CAS.I9c)).toEqual([]);
  });
});

describe('creneauxLibres — les changements d’heure', () => {
  it.each([
    ['2027-03-25', '2027-03-25T08:30:00.000Z'],
    ['2027-03-29', '2027-03-29T07:30:00.000Z'],
    ['2027-10-28', '2027-10-28T07:30:00.000Z'],
    ['2027-11-01', '2027-11-01T08:30:00.000Z'],
    ['2026-10-22', '2026-10-22T07:30:00.000Z'],
    ['2026-10-26', '2026-10-26T08:30:00.000Z'],
  ])('J. le créneau de 09:30, le %s → %s', (jour, attendu) => {
    expect(utc(demande({ type: SEANCE, du: jour, au: jour }))[0]).toBe(attendu);
  });
  it('K1. dimanche 28/03/2027, 01:30–04:30 : la plage ne dure que deux heures', () => {
    expect(utc(CAS.K1)).toEqual([
      '2027-03-28T00:30:00.000Z', '2027-03-28T01:00:00.000Z', '2027-03-28T01:30:00.000Z', '2027-03-28T02:00:00.000Z',
    ]);
    expect(heures(CAS.K1)).toEqual(['01:30', '03:00', '03:30', '04:00']);
  });
  it('K2. dimanche 31/10/2027, 01:30–04:30 : la plage dure quatre heures', () => {
    expect(utc(CAS.K2)).toEqual([
      '2027-10-30T23:30:00.000Z', '2027-10-31T00:00:00.000Z', '2027-10-31T00:30:00.000Z', '2027-10-31T01:00:00.000Z',
      '2027-10-31T01:30:00.000Z', '2027-10-31T02:00:00.000Z', '2027-10-31T02:30:00.000Z', '2027-10-31T03:00:00.000Z',
    ]);
  });
  it('K3. dimanche 21/03/2027, jour ordinaire : six créneaux', () => {
    expect(heures(CAS.K3)).toEqual(['01:30', '02:00', '02:30', '03:00', '03:30', '04:00']);
  });
  it('K4. dimanche 28/03/2027, 02:30–03:00 : la plage s’inverse ; aucun créneau, aucune erreur', () => {
    expect(creneauxLibres(CAS.K4)).toEqual([]);
  });
});

describe('verifierCreneau', () => {
  it('sur E1 : 14:30 libre, 13:00 pris, 13:15 hors de la grille', () => {
    expect(verifierCreneau({ ...CAS.E1, debut: p(JEUDI, '14:30') })).toBe('libre');
    expect(verifierCreneau({ ...CAS.E1, debut: p(JEUDI, '13:00') })).toBe('creneau_pris');
    expect(verifierCreneau({ ...CAS.E1, debut: p(JEUDI, '13:15') })).toBe('hors_fenetre');
  });
  it('sur I2 : 09:30 hors fenêtre, et libre avec la tolérance de I3', () => {
    expect(verifierCreneau({ ...CAS.I2, debut: p(JEUDI, '09:30') })).toBe('hors_fenetre');
    expect(verifierCreneau({ ...CAS.I3, debut: p(JEUDI, '09:30') })).toBe('libre');
  });
  it('un début dans la grille mais un jour fermé : hors fenêtre', () => {
    expect(verifierCreneau({ ...CAS.H1, debut: p('2026-12-24', '09:30') })).toBe('hors_fenetre');
  });
  it('une occupation hors fenêtre ne passe pas devant : hors fenêtre d’abord', () => {
    const d = { ...CAS.I2, occupations: [occ(JEUDI, '09:30', '11:00')] };
    expect(verifierCreneau({ ...d, debut: p(JEUDI, '09:30') })).toBe('hors_fenetre');
  });

  /**
   * La propriété de §14.7 : « la même fonction sert à afficher et à réserver ».
   * Toutes les cinq minutes de chaque cas, un début est `libre` si et seulement
   * si `creneauxLibres` le rend — à tolérance égale, puis avec celle de la réservation.
   */
  it.each(Object.keys(CAS))('%s : libre si et seulement si creneauxLibres le rend', (nom) => {
    for (const toleranceMin of [CAS[nom].toleranceMin ?? 0, 15]) {
      const d = { ...CAS[nom], toleranceMin };
      const libres = new Set(creneauxLibres(d));
      const fin = p(jourSuivant(d.au < d.du ? d.du : d.au), '00:00');
      const ecarts: string[] = [];
      for (let t = p(d.du, '00:00'); t < fin; t += 5 * 60_000) {
        if ((verifierCreneau({ ...d, debut: t }) === 'libre') !== libres.has(t)) ecarts.push(isoDeParis(t));
      }
      expect(ecarts).toEqual([]);
    }
  });
});
