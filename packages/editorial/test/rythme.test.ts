/**
 * Le rythme (SPEC §12.5.3) : un recadrage aux phrases d'un long passage face
 * caméra, et l'alerte quand l'image reste figée.
 *
 * Ce qui compte : qu'un raccord recadre toujours — c'est lui qui cache le saut
 * du visage — et qu'une phrase ne recadre que si le plan a assez duré.
 */
import { describe, it, expect } from 'vitest';
import {
    calerSurLaPrise, cadrer, debutsDePhrases, momentsFiges, planDeMontage, voixEntiere,
    PLAN_MIN, FIGE_MAX, type MotPrononce,
} from '../src/calage';
import { minuterReel, horlogeEstimee, type ReelExplique } from '../src/reelExplique';

const reel = (): ReelExplique => ({
    format: 'Reel expliqué',
    sequences: [
        { plan: 'camera', role: 'Accroche', voix: 'Vous relisez trois fois un message ?' },
        {
            plan: 'scene', role: 'Mécanique', registre: 'pedagogie', titre: 'Une [alarme]',
            voix: 'Le perfectionnisme fonctionne comme une alarme incendie qui sonne pour une virgule.',
            elements: [{ type: 'carte', texte: 'Une [alarme]', apparait_sur: 'une alarme incendie' }],
        },
        {
            plan: 'camera', role: 'Bascule',
            voix: "Ce n'est pas un défaut de caractère. C'est une protection qui en fait trop. Elle vous a protégé, un jour. Aujourd'hui, elle vous épuise.",
            coup: { texte: 'Pas un [défaut]', apparait_sur: 'pas un défaut' },
        },
        { plan: 'camera', role: 'Appel', voix: 'Tout est sur luminose.fr, lien en bio.' },
    ],
});

describe('debutsDePhrases', () => {
    it('donne le rang du mot qui ouvre chaque phrase, la première exceptée', () => {
        expect(debutsDePhrases('Une phrase. Puis une autre ? Et la fin…  Encore.')).toEqual([2, 5, 8]);
        // Le point d'une adresse ne ferme pas une phrase.
        expect(debutsDePhrases('Tout est sur luminose.fr, lien en bio.')).toEqual([]);
        expect(debutsDePhrases('Sans ponctuation finale')).toEqual([]);
    });
});

describe('cadrer', () => {
    const data = reel();
    const m = minuterReel(data, horlogeEstimee(150));
    const phrases = debutsDePhrases(voixEntiere(data)).map(r => horlogeEstimee(150)(r));

    it('recadre aux phrases d’un passage face caméra, une fois le plan assez long', () => {
        const cadrages = cadrer(data, m, phrases, []);
        expect(cadrages[0]).toEqual({ a: 0, serre: false });
        const bascule = m.sequences[2];
        const changements = cadrages.slice(1).map(c => c.a);
        expect(changements.length).toBeGreaterThan(0);
        // Jamais sous une scène, jamais au premier mot d'un passage : le visage revient de lui-même.
        changements.forEach(a => expect(a > bascule.debut && a < bascule.fin).toBe(true));
        changements.forEach((a, i) => expect(a - (i ? changements[i - 1] : 0)).toBeGreaterThanOrEqual(PLAN_MIN));
        expect(cadrages.map(c => c.serre)).toEqual(cadrages.map((_, i) => i % 2 === 1));
    });

    it('recadre toujours à un raccord, et pas une phrase juste avant', () => {
        const bascule = m.sequences[2];
        const phrase = phrases.find(a => a > bascule.debut + PLAN_MIN)!;
        const cadrages = cadrer(data, m, phrases, [phrase + 0.5]);
        expect(cadrages.map(c => c.a)).toContain(phrase + 0.5);
        expect(cadrages.map(c => c.a)).not.toContain(phrase);
    });
});

describe('momentsFiges', () => {
    it('signale un passage où rien ne bouge plus de cinq secondes', () => {
        const data = reel();
        delete data.sequences[2].coup;
        const m = minuterReel(data, horlogeEstimee(150));
        const figes = momentsFiges(data, m, []);
        // La bascule face caméra dure ~9 s sans rien : elle est figée.
        expect(figes.some(f => f.sequence === 2 && f.fin - f.debut > FIGE_MAX)).toBe(true);
    });

    it('un coup de poing et des recadrages la remettent en mouvement', () => {
        const data = reel();
        const m = minuterReel(data, horlogeEstimee(150));
        const phrases = debutsDePhrases(voixEntiere(data)).map(r => horlogeEstimee(150)(r));
        expect(momentsFiges(data, m, cadrer(data, m, phrases, []))).toEqual([]);
    });
});

describe('planDeMontage, rythme', () => {
    const data = reel();
    const texte = voixEntiere(data);
    const prise: MotPrononce[] = texte.split(/\s+/).map((mot, i) => ({ mot, debut: 1 + i * 0.4, fin: 1 + i * 0.4 + 0.35 }));
    const calage = calerSurLaPrise(texte, prise);

    it('le coup de poing passe dans le temps de la vidéo, avec sa séquence', () => {
        const plan = planDeMontage(data, { calage, duree: 40 });
        const brut = minuterReel(data, calage.horloge);
        expect(plan.minutage.sequences[2].coup).toEqual({
            debut: expect.closeTo(brut.sequences[2].coup!.debut, 5),
            fin: expect.closeTo(brut.sequences[2].coup!.fin, 5),
        });
    });

    it('le cadre change aux phrases de la prise, pas seulement aux raccords', () => {
        const plan = planDeMontage(data, { calage, duree: 40 });
        expect(plan.segments).toHaveLength(1);
        expect(plan.cadrages.length).toBeGreaterThan(1);
    });
});
