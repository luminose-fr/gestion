/**
 * La vidéo directe (SPEC §12.7) : un Script Reel se monte face caméra de bout
 * en bout, et sans script, la transcription sert de texte.
 */
import { describe, it, expect } from 'vitest';
import { montageDuBrouillon, avecAnimations, VIDEO_DIRECTE, estMontable } from '../src/formats';
import { scriptDepuisLaTranscription } from '../src/directe';
import { calerSurLaPrise, planDeMontage, voixEntiere, type MotPrononce } from '../src/calage';
import { coupesProposees, coupesAppliquees } from '../src/derushage';

const dire = (...morceaux: Array<string | number>): MotPrononce[] => {
    const mots: MotPrononce[] = [];
    let t = 1;
    for (const m of morceaux) {
        if (typeof m === 'number') { t += m; continue; }
        for (const mot of m.split(/\s+/).filter(Boolean)) { mots.push({ mot, debut: t, fin: t + 0.35 }); t += 0.4; }
    }
    return mots;
};

describe('montageDuBrouillon', () => {
    it('un Script Reel se monte en passages face caméra, sans animation', () => {
        const data = montageDuBrouillon({
            format: 'Script Reel',
            sections: [
                { timing: '[0-3s]', role: 'Accroche', texte: 'Suis-je le bon thérapeute pour vous ?', intention: 'Regard caméra.' },
                { timing: '[3-15s]', role: 'Constat', texte: '' },
                { timing: '[15-45s]', role: 'Bascule', texte: 'En cabinet, je vois souvent…' },
            ],
        })!;
        expect(data.sequences).toEqual([
            { plan: 'camera', role: 'Accroche', voix: 'Suis-je le bon thérapeute pour vous ?', intention: 'Regard caméra.' },
            { plan: 'camera', role: 'Bascule', voix: 'En cabinet, je vois souvent…', intention: null },
        ]);
        expect(avecAnimations(data)).toBe(false);
    });

    it('un Reel expliqué garde ses scènes ; un format qui ne se monte pas ne donne rien', () => {
        const reel = { format: 'Reel expliqué', sequences: [{ plan: 'scene', role: 'x', voix: 'y' }] };
        expect(montageDuBrouillon(reel)).toBe(reel);
        expect(avecAnimations(montageDuBrouillon(reel))).toBe(true);
        expect(montageDuBrouillon({ format: 'Carrousel', slides: [] })).toBeNull();
        expect(montageDuBrouillon(null)).toBeNull();
    });

    it('la vidéo directe sans script est un Script Reel sans section, que le registre sait monter', () => {
        expect(estMontable(VIDEO_DIRECTE.format)).toBe(true);
        expect(montageDuBrouillon(JSON.parse(VIDEO_DIRECTE.brouillon()))?.sequences).toEqual([]);
    });
});

describe('scriptDepuisLaTranscription', () => {
    it('découpe en phrases, retire les hésitations, et ne garde que la dernière version d’une phrase redite', () => {
        const script = scriptDepuisLaTranscription(dire(
            'Suis-je le bon thérapeute', 0.8, 'euh', 0.5,
            'Suis-je le bon thérapeute pour vous ?', 0.3,
            'Ça dépend de ce que vous venez chercher.',
        ));
        expect(script.sequences).toHaveLength(1);
        expect(script.sequences[0].voix).toBe('Suis-je le bon thérapeute pour vous ? Ça dépend de ce que vous venez chercher.');
    });

    it('un rappel lointain n’est pas une redite', () => {
        const script = scriptDepuisLaTranscription(dire('Le corps garde la mémoire.', 30, 'Le corps garde la mémoire.'));
        expect(script.sequences[0].voix).toBe('Le corps garde la mémoire. Le corps garde la mémoire.');
    });

    it('une transcription vide ne donne rien à monter', () => {
        expect(scriptDepuisLaTranscription([]).sequences).toEqual([]);
    });
});

describe('une vidéo directe, de la prise à la vidéo', () => {
    const prise = dire(
        'Suis-je le bon thérapeute', 0.9, 'pardon', 0.6,
        'Suis-je le bon thérapeute pour vous ?', 0.4, 'euh', 0.4,
        'Ça dépend de ce que vous venez chercher.', 2,
        'Lien en bio.',
    );
    const data = scriptDepuisLaTranscription(prise);
    const calage = calerSurLaPrise(voixEntiere(data), prise);
    const coupes = coupesProposees(calage);
    const plan = planDeMontage(data, { calage, duree: 30 }, { coupes: coupesAppliquees(coupes, {}) });
    const dans = (mot: string, n = 0) => {
        const m = prise.filter(x => x.mot.startsWith(mot))[n];
        return plan.segments.some(s => (m.debut + m.fin) / 2 > s.depuis && (m.debut + m.fin) / 2 < s.jusqua);
    };

    it('la première version et « pardon » partent, la seconde reste', () => {
        expect(dans('Suis-je', 0)).toBe(false);
        expect(dans('pardon')).toBe(false);
        expect(dans('Suis-je', 1)).toBe(true);
    });

    it('l’hésitation et le long silence partent', () => {
        expect(coupes.map(c => c.motif)).toContain('hesitation');
        expect(dans('euh')).toBe(false);
        expect(coupes.some(c => c.motif === 'silence' && c.fin - c.debut > 1)).toBe(true);
    });

    it('tout est face caméra : sous-titres du début à la fin', () => {
        expect(plan.sousTitres[0].texte.startsWith('Suis-je')).toBe(true);
        expect(plan.sousTitres[plan.sousTitres.length - 1].texte).toContain('bio');
    });
});
