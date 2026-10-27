/**
 * Le montage par le texte se lit séquence par séquence (SPEC §12.5.5, v2.21) :
 * chaque mot dit est rangé dans la séquence du script à laquelle il appartient.
 */
import { describe, it, expect } from 'vitest';
import { calerSurLaPrise, sequenceDeChaqueJeton, voixEntiere, type MotPrononce } from '../src/calage';
import { compterMots, type ReelExplique } from '../src/reelExplique';

function dire(...morceaux: Array<string | number>): MotPrononce[] {
    const mots: MotPrononce[] = [];
    let t = 1;
    for (const m of morceaux) {
        if (typeof m === 'number') { t += m; continue; }
        for (const mot of m.split(/\s+/).filter(Boolean)) {
            mots.push({ mot, debut: t, fin: t + 0.3 });
            t += 0.4;
        }
    }
    return mots;
}

const data = {
    format: 'Reel expliqué',
    sequences: [
        { plan: 'camera', role: 'Accroche', voix: 'On croit que plaire à tout le monde est une vertu.' },
        { plan: 'camera', role: 'Constat', voix: 'Alors on dit oui à des gens qu’on n’aime pas tant que ça.' },
    ],
} as ReelExplique;
const parSequence = data.sequences.map(s => compterMots(s.voix));

/** Le mot tel qu'il s'affiche, et sa séquence. */
const ranges = (prise: MotPrononce[]) => {
    const calage = calerSurLaPrise(voixEntiere(data), prise);
    const sequences = sequenceDeChaqueJeton(calage, parSequence);
    return calage.prononces.map((p, j) => [p.ecrit, sequences[j]] as const);
};

describe('sequenceDeChaqueJeton', () => {
    it('range chaque mot du script dans sa séquence, et ce qui est hors script avec le plus proche', () => {
        const mots = ranges(dire(
            'euh', 0.6,
            'On croit que plaire à tout le monde est une vertu.', 0.2,
            'vraiment', 1.5,
            'bon', 0.2,
            'Alors on dit oui à des gens qu’on n’aime pas tant que ça.',
        ));
        expect(mots[0]).toEqual(['euh', 0]);
        expect(mots.find(([m]) => m === 'vertu.')).toEqual(['vertu.', 0]);
        // Dit dans l'élan de la phrase : il la prolonge.
        expect(mots.find(([m]) => m === 'vraiment')).toEqual(['vraiment', 0]);
        // Dit juste avant la suivante : il la prépare.
        expect(mots.find(([m]) => m === 'bon')).toEqual(['bon', 1]);
        expect(mots.find(([m]) => m === 'Alors')).toEqual(['Alors', 1]);
    });

    it('range une reprise écartée avec la séquence de sa phrase', () => {
        const mots = ranges(dire(
            'On croit que plaire à tout le monde est une vertu.', 0.4,
            'Alors on dit oui à des gens', 1.5,
            'Alors on dit oui à des gens qu’on n’aime pas tant que ça.', 0.4,
            'merci',
        ));
        // Les deux « Alors » : la reprise écartée, puis la version retenue.
        expect(mots.filter(([m]) => m === 'Alors')).toEqual([['Alors', 1], ['Alors', 1]]);
        // Ce qui suit la dernière phrase reste avec la dernière séquence.
        expect(mots[mots.length - 1]).toEqual(['merci', 1]);
    });

    it('met tout dans la séquence unique d’une seconde accroche', () => {
        const calage = calerSurLaPrise('Relire trois fois un message.', dire('euh', 'Relire trois fois un message.', 'voilà'));
        expect(new Set(sequenceDeChaqueJeton(calage, [5]))).toEqual(new Set([0]));
    });
});
