/**
 * Ce qu'ont montré les deux vidéos exportées le 30/10/2026 (« Un meilleur
 * sparadrap », la même prise transcrite par Whisper puis par Nova-3), SPEC v2.29 :
 * un appel à l'action improvisé qui ne sortait jamais, des sous-titres dits
 * deux minutes après la fin qui s'affichaient sur ses dernières images, une
 * accroche reformulée qui s'ouvrait au milieu de sa phrase, et des sous-titres
 * qui enjambaient la fin d'une phrase.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calerSurLaPrise, enBlocs, instantDansLaVideo, planDeMontage, voixEntiere, type MotPrononce } from '../src/calage';
import { coupesAppliquees, coupesProposees, passagesManuels, trancherUnPassage } from '../src/derushage';
import type { ReelExplique } from '../src/reelExplique';

const PAS = 0.4;
/** Des mots lus à débit régulier ; un nombre est une pause, en secondes. */
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

const trouver = (mots: MotPrononce[], debut: string, apres = 0) => mots.find(m => m.mot.startsWith(debut) && m.debut >= apres)!;
const duree = (mots: MotPrononce[]) => mots[mots.length - 1].fin + 2;

describe('la fin improvisée', () => {
    const data = {
        format: 'Reel expliqué',
        sequences: [
            { plan: 'camera', role: 'Chute', voix: 'C\'est savoir ouvrir la vanne.' },
            { plan: 'camera', role: 'Appel à l\'action', voix: 'Le jour où c\'est trop lourd, je travaille en cabinet.' },
        ],
    } as ReelExplique;
    // L'appel à l'action n'est jamais dit tel qu'écrit : deux essais improvisés, puis un « bon, voilà ».
    const prise = dire('C\'est savoir ouvrir la vanne.', 12,
        'Alors souvent, quand ça commence à échouer, travaillons ensemble.', 15,
        'Quand ce qui marchait ne marche plus, venez me voir au cabinet.', 1.5, 'bon voilà');
    const calage = calerSurLaPrise(voixEntiere(data), prise);
    const proposees = coupesProposees(calage);
    const principale = { calage, duree: duree(prise) };
    const monte = (choix = {}) => planDeMontage(data, principale, {
        coupes: coupesAppliquees(proposees, choix),
        retablis: passagesManuels(choix).filter(m => !m.coupe),
    });
    const dans = (plan: ReturnType<typeof monte>, mot: MotPrononce) =>
        plan.segments.some(s => (mot.debut + mot.fin) / 2 > s.depuis && (mot.debut + mot.fin) / 2 < s.jusqua);
    const essai = (debut: string, fin: string, apres: number) =>
        ({ debut: trouver(prise, debut, apres).debut - 0.15, fin: trouver(prise, fin, apres).fin + 0.2 });

    it('remplace l’appel à l’action jamais dit : la dernière tentative, pas les précédentes', () => {
        const plan = monte();
        expect(calage.finImprovisee?.debut).toBe(trouver(prise, 'Quand').debut);
        expect(dans(plan, trouver(prise, 'cabinet.'))).toBe(true);
        expect(dans(plan, trouver(prise, 'échouer'))).toBe(false);
        expect(dans(plan, trouver(prise, 'voilà'))).toBe(false);
        // La vanne, puis le dernier essai : rien des quinze secondes qui les séparent.
        expect(plan.duree).toBeLessThan(2.4 + 12 * PAS + 2);
    });

    it('est la dernière séquence, et ses sous-titres sont les siens', () => {
        const plan = monte();
        const appel = plan.minutage.sequences[1];
        expect(appel.debut).toBeLessThanOrEqual(instantDansLaVideo(plan, 'principale', trouver(prise, 'Quand').debut)!);
        const textes = plan.sousTitres.map(st => st.texte).join(' | ');
        expect(textes).toContain('cabinet.');
        expect(textes).not.toContain('échouer');
        expect(textes).not.toContain('voilà');
    });

    it('se barre d’un geste, comme tout passage', () => {
        const choix = trancherUnPassage({}, essai('Quand', 'cabinet.', 20), true, proposees);
        const plan = monte(choix);
        expect(dans(plan, trouver(prise, 'cabinet.'))).toBe(false);
        expect(Math.max(...plan.segments.map(s => s.jusqua))).toBeLessThan(trouver(prise, 'Alors').debut);
    });

    it('rétablir l’essai d’avant ne ramène pas les secondes qui l’en séparent', () => {
        const choix = trancherUnPassage({}, essai('Alors', 'ensemble.', 5), false, proposees);
        const plan = monte(choix);
        expect(dans(plan, trouver(prise, 'échouer'))).toBe(true);
        expect(dans(plan, trouver(prise, 'cabinet.'))).toBe(true);
        // Ni les douze secondes après la vanne, ni les quinze entre les deux essais.
        const milieu = (a: MotPrononce, b: MotPrononce) => (a.fin + b.debut) / 2;
        for (const t of [milieu(trouver(prise, 'vanne.'), trouver(prise, 'Alors')), milieu(trouver(prise, 'ensemble.'), trouver(prise, 'Quand'))]) {
            expect(plan.segments.some(s => t > s.depuis && t < s.jusqua)).toBe(false);
        }
    });

    it('ne s’ajoute pas quand le script a été dit jusqu’au bout', () => {
        const dite = dire('C\'est savoir ouvrir la vanne.', 1, 'Le jour où c\'est trop lourd, je travaille en cabinet.', 10,
            'Et franchement venez me voir au cabinet ça vaut le coup.');
        const calageDit = calerSurLaPrise(voixEntiere(data), dite);
        expect(calageDit.finImprovisee).toBeUndefined();
        const plan = planDeMontage(data, { calage: calageDit, duree: duree(dite) }, { coupes: coupesAppliquees(coupesProposees(calageDit), {}) });
        expect(Math.max(...plan.segments.map(s => s.jusqua))).toBeLessThan(trouver(dite, 'franchement').debut);
        // Et ce qui suit la vidéo ne s'affiche pas sur ses dernières images.
        expect(plan.sousTitres.map(st => st.texte).join(' ')).not.toMatch(/franchement|coup/);
    });
});

describe('une accroche reformulée', () => {
    const data = {
        format: 'Reel expliqué',
        sequences: [
            { plan: 'camera', role: 'Accroche', voix: '« Je veux mieux contrôler mes émotions. » En première séance, je l\'entends souvent.' },
            { plan: 'camera', role: 'Constat', voix: 'Imaginez une digue.' },
        ],
    } as ReelExplique;
    // Deux formulations, la seconde retenue : la plus récente des bonnes versions.
    const prise = dire('Je veux gérer mes émotions, s\'il vous plaît.', 8,
        'Bonjour, moi ce que je voudrais, c\'est mieux gérer mes émotions. En première séance, je l\'entends souvent.', 1,
        'Imaginez une digue.');
    const calage = calerSurLaPrise(voixEntiere(data), prise);
    const plan = planDeMontage(data, { calage, duree: duree(prise) }, { coupes: coupesAppliquees(coupesProposees(calage), {}) });

    it('s’ouvre au début de sa phrase, pas au premier mot qui répond au script', () => {
        const bonjour = trouver(prise, 'Bonjour');
        expect(plan.segments[0].depuis).toBeLessThanOrEqual(bonjour.debut);
        expect(plan.segments[0].depuis).toBeGreaterThan(trouver(prise, 'plaît').fin);
        expect(plan.sousTitres[0].texte.startsWith('Bonjour')).toBe(true);
        expect(plan.minutage.sequences[0].debut).toBeLessThanOrEqual(plan.sousTitres[0].debut + 0.15);
    });

    it('sans rien garder de l’autre formulation', () => {
        expect(plan.sousTitres.map(st => st.texte).join(' ')).not.toContain('plaît');
    });

    it('une phrase qui en enchaîne une autre ne lui prête pas sa fin', () => {
        // « …tous les trous, c'est apprendre » : la reformulation suit la phrase d'avant sans respirer.
        const suite = {
            format: 'Reel expliqué',
            sequences: [{ plan: 'camera', role: 'Chute', voix: 'Ce n\'est pas tenir la digue plus fort. C\'est savoir ouvrir la vanne.' }],
        } as ReelExplique;
        const dite = dire('Ce n\'est pas avoir une digue plus forte en rebouchant tous les trous c\'est apprendre à ouvrir les vannes.');
        expect(calerSurLaPrise(voixEntiere(suite), dite).prononces.some(p => p.amorce)).toBe(false);
    });
});

describe('les sous-titres et les débuts de phrase du script', () => {
    const m = (texte: string, debut: number, fin = debut + 0.3) => ({ texte, debut, fin });

    it('un bloc ne franchit pas un début de phrase, ponctué ou non — sauf un mot seul qui l’amorce', () => {
        const blocs = enBlocs([
            m('s\'il', 0), m('vous', 0.3), m('plaît', 0.6), { ...m('En', 1.2), ouvre: true }, m('première', 1.5), m('séance', 1.8),
            m('en', 3), m('rebouchant', 3.3), m('tous', 3.6), m('les', 3.9), m('trous', 4.2), { ...m('C\'est', 4.5), ouvre: true }, m('apprendre', 4.8),
            m('et', 6), { ...m('Ce', 6.25), ouvre: true }, m('n\'est', 6.5), m('plus', 6.8),
        ]);
        expect(blocs.map(b => b.texte)).toEqual([
            's\'il vous plaît', 'En première séance', 'en rebouchant tous', 'les trous', 'C\'est apprendre', 'et Ce n\'est plus',
        ]);
    });
});

/**
 * La prise elle-même (5 min 53). Ses mots ne sont pas ceux de Workers AI
 * (voir la note du fichier) : ce qui se vérifie ici tient à la forme de la
 * prise — cinq essais d'appel à l'action, deux accroches —, pas aux centièmes.
 */
describe('la prise du 30/10/2026', () => {
    const prise = JSON.parse(readFileSync(join(import.meta.dirname, 'prises', 'sparadrap-30-10.json'), 'utf8'));
    const calage = calerSurLaPrise(voixEntiere(prise.script), prise.mots, prise.enveloppe);
    const proposees = coupesProposees(calage);
    const plan = planDeMontage(prise.script, { calage, duree: prise.duree }, { coupes: coupesAppliquees(proposees, {}) });
    const dans = (t: number) => plan.segments.some(s => t > s.depuis && t < s.jusqua);
    const dit = (debut: string, apres: number) => calage.prononces.find(p => p.ecrit.toLowerCase().startsWith(debut) && p.debut > apres)!;
    const textes = plan.sousTitres.map(st => st.texte);

    it('finit sur le dernier essai de l’appel à l’action, et sur lui seul', () => {
        expect(calage.phrases[calage.phrases.length - 1].retenue).toBeNull();
        expect(calage.finImprovisee!.debut).toBeGreaterThan(331);
        expect(dans(dit('cabinet', 340).debut + 0.05)).toBe(true);
        for (const t of [216, 250, 278, 300]) expect(dans(t)).toBe(false);
        expect(plan.duree).toBeLessThan(85);
        expect(textes[textes.length - 1]).toMatch(/cabinet/);
    });

    it('barrée, la vidéo s’arrête sur la vanne, sans un mot d’après en sous-titre', () => {
        const fin = calage.finImprovisee!;
        const choix = trancherUnPassage({}, { debut: fin.debut - 0.15, fin: fin.fin + 0.2 }, true, proposees);
        const sans = planDeMontage(prise.script, { calage, duree: prise.duree }, { coupes: coupesAppliquees(proposees, choix) });
        expect(Math.max(...sans.segments.map(s => s.jusqua))).toBeLessThan(192);
        expect(sans.sousTitres.map(st => st.texte).join(' ')).not.toMatch(/fatigant|autrement|travaillant/);
    });

    it('aucun sous-titre n’enjambe une fin de phrase ni l’arrivée d’une scène', () => {
        for (const t of textes) {
            expect(t).not.toMatch(/trous C'est|plaît En|donc Au/);
            // « Au lieu de fuir » ouvre une scène : sur la scène, l'écran ne transcrit pas.
            expect(t).not.toMatch(/\blieu\b/);
        }
    });
});
