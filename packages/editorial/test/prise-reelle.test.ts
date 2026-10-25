/**
 * Une prise RÉELLE de Florent (25/10/2026) : 3 min 25 pour un Reel d'environ
 * 80 s — deux versions de plusieurs phrases, des hésitations, une fin
 * improvisée, et une fin de fichier où Whisper a inventé « donc ok ok ok
 * Merci. ». Les mots sont ceux qu'a rendus Whisper sur Workers AI ;
 * l'enveloppe a été mesurée sur le son, avec l'encodage du navigateur.
 *
 * Ce fichier est le garde-fou de ce qui a été corrigé sur pièces (§12.5.4) :
 * un mot qui enjambait un silence de quatre secondes, des coupes qui en
 * laissaient trois et demie, une fin étirée jusqu'à une hallucination.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calerSurLaPrise, planDeMontage, voixEntiere } from '../src/calage';
import { coupesProposees, coupesAppliquees } from '../src/derushage';
import { regionsDeParole } from '../src/enveloppe';

const prise = JSON.parse(readFileSync(join(import.meta.dirname, 'prises', 'digue.json'), 'utf8'));
const texte = voixEntiere(prise.script);
const calage = calerSurLaPrise(texte, prise.mots, prise.enveloppe);
const parole = regionsDeParole(prise.enveloppe);
const plan = planDeMontage(prise.script, { calage, duree: prise.duree }, { coupes: coupesAppliquees(coupesProposees(calage), {}) });

const premier = (mot: string, apres: number) => calage.prononces.find(p => p.ecrit.toLowerCase().startsWith(mot) && p.debut > apres)!;

describe('une vraie prise, recalée sur le son', () => {
    it('le premier mot d’une reprise commence quand la voix reprend, pas à la fin du mot d’avant', () => {
        // Whisper : « en » de 39,28 à 43,66 s, « et » de 48,82 à 52,54 s, « derrière » de 90,36 à 93,46 s.
        expect(premier('en', 39).debut).toBeGreaterThan(43.3);
        expect(premier('et', 48.5).debut).toBeGreaterThan(52.3);
        expect(premier('derrière', 90).debut).toBeGreaterThan(92.2);
    });

    it('ce que Whisper a imaginé sur le silence de fin a disparu', () => {
        expect(calage.prononces.filter(p => p.debut > 195)).toEqual([]);
    });

    it('la vidéo ne garde aucun silence de plus d’une seconde', () => {
        for (const s of plan.segments) {
            const dedans = parole.filter(r => r.fin > s.depuis && r.debut < s.jusqua);
            const bornes = [s.depuis, ...dedans.flatMap(r => [Math.max(r.debut, s.depuis), Math.min(r.fin, s.jusqua)]), s.jusqua];
            for (let i = 0; i + 1 < bornes.length; i += 2) expect(bornes[i + 1] - bornes[i]).toBeLessThan(1);
        }
    });

    it('elle s’arrête sur la dernière phrase dite, pas sur la fin du fichier', () => {
        expect(plan.segments[plan.segments.length - 1].jusqua).toBeLessThan(191);
    });

    it('aucun morceau minuscule sans un mot du script', () => {
        for (const s of plan.segments) {
            const porte = calage.prononces.some(p => p.rang !== null && (p.debut + p.fin) / 2 > s.depuis && (p.debut + p.fin) / 2 < s.jusqua);
            expect(s.jusqua - s.depuis >= 0.4 || porte).toBe(true);
        }
    });
});
