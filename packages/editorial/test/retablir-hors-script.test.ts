/**
 * Rétablir hors du script (SPEC §12.5.5), après l'essai du 27/10/2026 : la fin
 * d'une prise, dite après la dernière phrase, était barrée et ne revenait pas.
 */
import { describe, it, expect } from 'vitest';
import { calerSurLaPrise, planDeMontage, voixEntiere, type MotPrononce } from '../src/calage';
import { coupesAppliquees, coupesProposees, passagesManuels, trancherUnPassage } from '../src/derushage';
import type { ReelExplique } from '../src/reelExplique';

const PAS = 0.4;
function dire(...morceaux: Array<string | number>): MotPrononce[] {
    const mots: MotPrononce[] = [];
    let t = 1;
    for (const m of morceaux) {
        if (typeof m === 'number') { t += m; continue; }
        for (const mot of m.split(/\s+/).filter(Boolean)) {
            mots.push({ mot, debut: t, fin: t + PAS * 0.9 });
            t += PAS;
        }
    }
    return mots;
}

describe('planDeMontage, passage rétabli hors du script', () => {
    const data: ReelExplique = {
        format: 'Script Reel',
        sequences: [{ plan: 'camera', role: 'Accroche', voix: 'Vous ne savez pas si je suis le bon thérapeute pour vous.' }],
    } as ReelExplique;
    const prise = dire('Vous ne savez pas si je suis le bon thérapeute pour vous.', 0.3, 'cet entretien est gratuit merci beaucoup');
    const calage = calerSurLaPrise(voixEntiere(data), prise);
    const principale = { calage, duree: prise[prise.length - 1].fin + 1 };
    const proposees = coupesProposees(calage);
    const queue = prise.slice(-6);
    const passage = { debut: queue[0].debut - 0.15, fin: queue[queue.length - 1].fin + 0.2 };

    it('sans rien rétablir, la fin improvisée n’est pas montée', () => {
        const plan = planDeMontage(data, principale, { coupes: coupesAppliquees(proposees, {}) });
        const fin = Math.max(...plan.segments.map(s => s.jusqua));
        expect(fin).toBeLessThan(queue[0].debut);
    });

    it('rétablie, elle l’est, jusqu’au dernier mot', () => {
        const choix = trancherUnPassage({}, passage, false, proposees);
        const retablis = passagesManuels(choix).filter(m => !m.coupe);
        const plan = planDeMontage(data, principale, { coupes: coupesAppliquees(proposees, choix), retablis });
        const fin = Math.max(...plan.segments.map(s => s.jusqua));
        expect(fin).toBeGreaterThanOrEqual(queue[queue.length - 1].fin);
        expect(fin).toBeLessThanOrEqual(principale.duree);
    });

    it('se ravise d’un clic : recouper ce qu’on vient de rétablir le recoupe', () => {
        const retabli = trancherUnPassage({}, passage, false, proposees);
        // La même sélection, coupée : l'air pris autour des mots est plus étroit que celui rendu.
        const recoupe = { debut: queue[0].debut - 0.05, fin: queue[queue.length - 1].fin + 0.1 };
        const choix = trancherUnPassage(retabli, recoupe, true, proposees);
        const plan = planDeMontage(data, principale, {
            coupes: coupesAppliquees(proposees, choix),
            retablis: passagesManuels(choix).filter(m => !m.coupe),
        });
        expect(Math.max(...plan.segments.map(s => s.jusqua))).toBeLessThan(queue[0].debut);
    });

    it('recouper le milieu d’un passage rétabli garde ses deux bouts', () => {
        const retabli = trancherUnPassage({}, { debut: 10, fin: 14 }, false, []);
        const choix = trancherUnPassage(retabli, { debut: 11, fin: 12 }, true, []);
        expect(passagesManuels(choix).map(m => [m.debut, m.fin, m.coupe])).toEqual([
            [10, 11, false], [11, 12, true], [12, 14, false],
        ]);
    });
});
