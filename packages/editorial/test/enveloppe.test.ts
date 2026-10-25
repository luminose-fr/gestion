/**
 * L'enveloppe sonore (SPEC §12.5.4) : où l'on parle, et ce que ça corrige dans
 * les mots de Whisper.
 */
import { describe, it, expect } from 'vitest';
import { encoderNiveaux, lireNiveaux, regionsDeParole, recalerSurLeSon, creuxLePlusProche, type Enveloppe } from '../src/enveloppe';

/** Une enveloppe à 10 ms faite de plages : [durée en secondes, niveau en dB]. */
const enveloppe = (...plages: Array<[number, number]>): Enveloppe => {
    const db: number[] = [];
    for (const [duree, niveau] of plages) for (let i = 0; i < Math.round(duree * 100); i++) db.push(niveau);
    return { pas: 0.01, niveaux: encoderNiveaux(db) };
};

describe('l’encodage', () => {
    it('garde le décibel entier, borné entre −90 et 0', () => {
        expect(lireNiveaux({ pas: 0.01, niveaux: encoderNiveaux([-21.4, -62.6, 3, -120, NaN]) })).toEqual([-21, -63, 0, -90, -90]);
    });
});

describe('regionsDeParole', () => {
    it('trouve la voix, comble une syllabe qui s’éteint, ignore un claquement', () => {
        const e = enveloppe([1, -60], [0.5, -20], [0.1, -60], [0.5, -20], [1, -60], [0.05, -15], [1, -60], [0.8, -22], [0.5, -60]);
        const r = regionsDeParole(e);
        expect(r).toHaveLength(2);
        expect(r[0].debut).toBeCloseTo(1);
        expect(r[0].fin).toBeCloseTo(2.1);
        // Le claquement de 3,1 s n'a pas compté : la seconde voix commence à 4,15 s.
        expect(r[1].debut).toBeCloseTo(4.15);
        expect(r[1].fin).toBeCloseTo(4.95);
    });

    it('sans contraste, tout est parole : on ne coupe pas à l’aveugle', () => {
        expect(regionsDeParole(enveloppe([2, -30]))).toEqual([{ debut: 0, fin: 2 }]);
    });
});

describe('recalerSurLeSon', () => {
    // Une phrase de 1 à 3 s, un silence de 3 à 6,5 s, une reprise de 6,5 à 8 s.
    const regions = regionsDeParole(enveloppe([1, -60], [2, -20], [3.5, -60], [1.5, -20], [2, -60]));
    const mot = (mot: string, debut: number, fin: number) => ({ mot, debut, fin });

    it('un mot qui commence dans un silence commence à la reprise de la voix', () => {
        const [m] = recalerSurLeSon([mot('en', 3.05, 6.8)], regions);
        expect(m.debut).toBeCloseTo(6.5);
        expect(m.fin).toBe(6.8);
    });

    it('un mot qui enjambe un silence, même parti de la voix, commence après lui', () => {
        const [m] = recalerSurLeSon([mot('et', 2.97, 6.55)], regions);
        expect(m.debut).toBeCloseTo(6.5);
    });

    it('un mot qui finit dans un silence finit quand la voix s’arrête', () => {
        const [m] = recalerSurLeSon([mot('retenir', 2.6, 3.4)], regions);
        expect(m.debut).toBe(2.6);
        expect(m.fin).toBeCloseTo(3);
    });

    it('un mot posé loin de toute voix est retiré : Whisper l’a imaginé', () => {
        const recales = recalerSurLeSon([mot('fin', 7.5, 7.9), mot('Merci.', 9, 9.6)], regions);
        expect(recales.map(m => m.mot)).toEqual(['fin']);
    });

    it('au milieu d’une phrase, rien ne bouge', () => {
        expect(recalerSurLeSon([mot('corps', 1.5, 1.8)], regions)).toEqual([mot('corps', 1.5, 1.8)]);
    });
});

describe('creuxLePlusProche', () => {
    it('trouve le point le plus silencieux près de l’instant visé', () => {
        const e = enveloppe([1, -20], [0.03, -45], [1, -20]);
        expect(creuxLePlusProche(e, 0.95, 0.1)).toBeCloseTo(1);
        expect(creuxLePlusProche(undefined, 0.95)).toBe(0.95);
    });
});
