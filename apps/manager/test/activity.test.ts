/**
 * Le registre d'activité — la logique qui décide de ce que la barre montre.
 *
 * Ce qui est protégé ici : une barre qui atteint 100 % avant la réponse est un
 * mensonge qu'on ne peut plus rattraper, et une estimation tirée d'un échec
 * ferait filer la suivante.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Tache } from '../services/activityService';

const memoire = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: (k: string) => memoire.get(k) ?? null,
  setItem: (k: string, v: string) => { memoire.set(k, v); },
  removeItem: (k: string) => { memoire.delete(k); },
  clear: () => memoire.clear(),
});

const Activite = await import('../services/activityService');

const tache = (champs: Partial<Tache>): Tache => ({
  id: 1, nature: 'ia', label: 'Rédaction', persona: null, modele: null,
  debut: 0, estimation: null, part: null, etape: null, ...champs,
});

beforeEach(() => {
  memoire.clear();
  for (const t of Activite.tachesEnCours()) void t;
});

describe('ce que la barre montre', () => {
  it('sans estimation, elle n’annonce rien plutôt que d’inventer', () => {
    expect(Activite.partEstimee(tache({ debut: 0 }), 5_000)).toBeNull();
  });

  it('une progression réelle passe avant toute estimation', () => {
    expect(Activite.partEstimee(tache({ part: 0.25, estimation: 1_000, debut: 0 }), 9_999)).toBe(0.25);
  });

  it('elle vaut environ 80 % à l’échéance attendue, et n’atteint JAMAIS 100 %', () => {
    const t = tache({ estimation: 10_000, debut: 0 });
    expect(Activite.partEstimee(t, 10_000)).toBeCloseTo(0.8, 2);
    // Dix fois le temps prévu : toujours pas arrivée.
    expect(Activite.partEstimee(t, 100_000)!).toBeLessThan(1);
    expect(Activite.partEstimee(t, 100_000)!).toBeGreaterThan(0.99);
  });

  it('elle monte, sans jamais redescendre', () => {
    const t = tache({ estimation: 4_000, debut: 0 });
    let precedente = -1;
    for (let ms = 0; ms <= 30_000; ms += 500) {
      const part = Activite.partEstimee(t, ms)!;
      expect(part).toBeGreaterThanOrEqual(precedente);
      precedente = part;
    }
  });

  it('« plus long que d’habitude » ne se dit que quand on a une habitude', () => {
    expect(Activite.traineEnLongueur(tache({ estimation: null, debut: 0 }), 600_000)).toBe(false);
    expect(Activite.traineEnLongueur(tache({ estimation: 10_000, debut: 0 }), 20_000)).toBe(false);
    expect(Activite.traineEnLongueur(tache({ estimation: 10_000, debut: 0 }), 30_000)).toBe(true);
  });
});

describe('la mémoire des durées', () => {
  const mesurer = (cle: string, duree: number) => {
    const debut = Date.now();
    const suivi = Activite.ouvrir({ cle });
    // On triche sur l'horloge plutôt que d'attendre : seule compte la durée écrite.
    vi.setSystemTime(debut + duree);
    suivi.fermer(true);
    vi.setSystemTime(debut);
  };

  beforeEach(() => { vi.useFakeTimers(); });

  it('une mesure isolée n’est pas une habitude', () => {
    mesurer('ia:Rédaction:m1', 12_000);
    expect(Activite.estimationPour('ia:Rédaction:m1')).toBeNull();
  });

  it('deux mesures suffisent, et c’est la médiane qui sert', () => {
    mesurer('ia:Rédaction:m1', 10_000);
    mesurer('ia:Rédaction:m1', 20_000);
    expect(Activite.estimationPour('ia:Rédaction:m1')).toBe(15_000);
  });

  it('un échec ne laisse aucune trace — sa durée ne dit rien de celle d’un succès', () => {
    mesurer('ia:Rédaction:m1', 10_000);
    const suivi = Activite.ouvrir({ cle: 'ia:Rédaction:m1' });
    suivi.fermer(false);
    mesurer('ia:Rédaction:m1', 10_000);
    // Trois fermetures, deux mesures : l'échec n'a pas compté.
    expect(Activite.estimationPour('ia:Rédaction:m1')).toBe(10_000);
  });

  it('deux fermetures pour un seul appel ne comptent qu’une fois', () => {
    const debut = Date.now();
    const suivi = Activite.ouvrir({ cle: 'ia:Rédaction:m1' });
    vi.setSystemTime(debut + 8_000);
    suivi.fermer(true);
    suivi.fermer(true);
    vi.setSystemTime(debut);
    expect(Activite.tachesEnCours()).toHaveLength(0);
    expect(Activite.estimationPour('ia:Rédaction:m1')).toBeNull();
  });

  it('l’estimation est prise à l’ouverture, pas au premier rendu', () => {
    mesurer('ia:Rédaction:m1', 10_000);
    mesurer('ia:Rédaction:m1', 10_000);
    const suivi = Activite.ouvrir({ label: 'Rédaction', cle: 'ia:Rédaction:m1' });
    const ouvertes = Activite.tachesEnCours();
    expect(ouvertes[ouvertes.length - 1]?.estimation).toBe(10_000);
    suivi.fermer(false);
  });
});

describe('nommer les modèles', () => {
  it('rend le nom du catalogue, et se rabat sur l’identifiant', () => {
    Activite.enregistrerModeles([{ id: 'm1', name: 'GPT-5.2 Pro' }]);
    expect(Activite.nomDuModele('m1')).toBe('GPT-5.2 Pro');
    expect(Activite.nomDuModele('inconnu')).toBe('inconnu');
    expect(Activite.nomDuModele(null)).toBeNull();
  });
});
