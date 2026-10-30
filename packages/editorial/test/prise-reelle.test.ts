/**
 * Une prise RÉELLE de Florent (25/10/2026) : 3 min 25 pour un Reel d'environ
 * 80 s — deux versions de plusieurs phrases, des hésitations, une fin
 * improvisée, et une fin de fichier où Whisper a inventé « donc ok ok ok
 * Merci. ». Les mots sont ceux qu'a rendus Whisper sur Workers AI ;
 * l'enveloppe a été mesurée sur le son, avec l'encodage du navigateur.
 *
 * Ce fichier est le garde-fou de ce qui a été corrigé sur pièces : un mot qui
 * enjambait un silence de quatre secondes, des coupes qui en laissaient trois
 * et demie, une fin étirée jusqu'à une hallucination (§12.5.4) ; des phrases
 * commencées dans une version et finies dans une autre (§12.5.5).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calerSurLaPrise, planDeMontage, voixEntiere, momentsFiges } from '../src/calage';
import { verifierReelExplique, VISAGE_MIN } from '../src/reelExplique';
import { coupesProposees, coupesAppliquees } from '../src/derushage';
import { regionsDeParole } from '../src/enveloppe';
import { scriptDepuisLaTranscription } from '../src/directe';

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

describe('une vraie prise, choisie phrase par phrase (§12.5.5)', () => {
    const dans = (t: number) => plan.segments.some(s => t > s.depuis && t < s.jusqua);
    const phraseDuRang = (rang: number) => calage.phrases.findIndex(c => rang >= c.phrase.debut && rang < c.phrase.fin);

    it('aucune coupe ne joint deux versions au milieu d’une phrase', () => {
        for (let k = 0; k + 1 < plan.segments.length; k++) {
            const fin = plan.segments[k].jusqua;
            const debut = plan.segments[k + 1].depuis;
            const avant = [...calage.prononces].reverse().find(p => p.rang !== null && p.fin <= fin + 0.05);
            const apres = calage.prononces.find(p => p.rang !== null && p.debut >= debut - 0.05);
            if (!avant || !apres || phraseDuRang(avant.rang!) !== phraseDuRang(apres.rang!)) continue;
            // Même phrase des deux côtés : seule une pause a pu être retirée, pas un mot.
            expect(calage.prononces.filter(p => (p.debut + p.fin) / 2 > fin && (p.debut + p.fin) / 2 < debut)).toEqual([]);
        }
    });

    it('une phrase refaite garde sa dernière bonne version : « ne dépasse pas » est parti', () => {
        expect(dans(premier('dépasse', 85).debut)).toBe(false);
        expect(dans(premier('derrière', 91).debut + 0.05)).toBe(true);
    });

    it('la vidéo s’ouvre sur « apprenez-moi » de la seconde version, sans la fin de « plaît »', () => {
        expect(plan.segments[0].depuis).toBeGreaterThanOrEqual(premier('plaît', 15).fin);
        expect(plan.segments[0].depuis).toBeLessThanOrEqual(premier('apprenez', 15).debut);
    });

    it('une version maigre ne fait pas couper une phrase bien dite : « c’est un meilleur sparadrap » reste entier', () => {
        expect(dans(premier('c', 53).debut + 0.02)).toBe(true);
    });

    it('la fin improvisée, refaite autrement, n’est pas gardée en plus de la première', () => {
        expect(dans(premier('travaille', 171).debut + 0.05)).toBe(true);
        expect(plan.segments.every(s => s.jusqua < 180)).toBe(true);
    });
});

describe('une version imposée sur la vraie prise', () => {
    it('garder la première version de « Derrière la digue » garde la tentative entière', () => {
        const avecChoix = calerSurLaPrise(texte, prise.mots, prise.enveloppe, { prises: { 9: 74.42 } });
        const retenue = (s: number) => avecChoix.prononces[avecChoix.phrases[s].versions[avecChoix.phrases[s].retenue!].debut].debut;
        expect(avecChoix.phrases[9].phrase.mots.slice(0, 3)).toEqual(['derriere', 'la', 'digue']);
        expect(retenue(9)).toBeLessThan(80);
        // La suite de la même tentative, sans pause : elle vient avec.
        expect(retenue(10)).toBeLessThan(86);
        expect(retenue(11)).toBeLessThan(91);
    });
});

describe('la même prise, montée sans script (§12.7)', () => {
    const sansScript = scriptDepuisLaTranscription(prise.mots, prise.enveloppe);
    const calageDirect = calerSurLaPrise(voixEntiere(sansScript), prise.mots, prise.enveloppe);
    const planDirect = planDeMontage(sansScript, { calage: calageDirect, duree: prise.duree },
        { coupes: coupesAppliquees(coupesProposees(calageDirect), {}) });
    const dansDirect = (mot: string, apres: number) => {
        const m = calageDirect.prononces.find(p => p.ecrit.toLowerCase().startsWith(mot) && p.debut > apres)!;
        return planDirect.segments.some(s => (m.debut + m.fin) / 2 > s.depuis && (m.debut + m.fin) / 2 < s.jusqua);
    };

    it('les phrases redites ne gardent que leur dernière version', () => {
        // « En séance… » : la première version (34 s) part, la seconde (43 s) reste.
        expect(dansDirect('en', 34)).toBe(false);
        expect(dansDirect('en', 43)).toBe(true);
        // « Derrière la digue… » : la version avec « dépasse » part.
        expect(dansDirect('dépasse', 85)).toBe(false);
    });

    it('ce qui précède une tentative ratée, sans avoir été refait, reste', () => {
        // « la boule au ventre… les larmes… » précédait sans pause la version ratée de « Derrière la digue ».
        expect(dansDirect('boule', 60)).toBe(true);
        expect(dansDirect('larmes', 60)).toBe(true);
    });

    it('sans script, la vidéo reste de la longueur de celle montée avec', () => {
        expect(planDirect.duree).toBeLessThan(plan.duree + 12);
    });
});

/**
 * Une seconde prise réelle (28/10/2026, « Un meilleur sparadrap ») : dite
 * presque mot pour mot, mais Whisper y rend chaque élision en deux mots —
 * « c », puis « 'est ». Les sous-titres de la vidéo exportée écrivaient
 * « c est », et coupaient un bloc sur trois entre les deux.
 */
describe('les élisions d’une vraie prise', () => {
    const sparadrap = JSON.parse(readFileSync(join(import.meta.dirname, 'prises', 'sparadrap.json'), 'utf8'));
    const calageS = calerSurLaPrise(voixEntiere(sparadrap.script), sparadrap.mots);
    const planS = planDeMontage(sparadrap.script, { calage: calageS, duree: sparadrap.duree },
        { coupes: coupesAppliquees(coupesProposees(calageS), {}) });
    const affiches = calageS.motsAffiches.map(m => m.texte);

    it('se recollent, dans l’orthographe du script comme hors de lui', () => {
        for (const mot of ['c\'est', 'n\'est', 'd\'une', 'l\'autre', 'qu\'on', 'l\'eau', 's\'accumule', 'n\'importe', 'voulez-vous']) {
            expect(affiches).toContain(mot);
        }
        // « là que je travaille au cabinet » n'est pas dans le script : Whisper seul y écrit « c », « 'est ».
        expect(affiches.filter(t => t.toLowerCase() === 'c\'est').length).toBe(5);
    });

    it('aucun sous-titre ne commence ni ne finit au milieu d’une élision', () => {
        for (const st of planS.sousTitres) {
            expect(st.texte).not.toMatch(/(^|\s)(c|n|d|l|s|qu)$/i);
            expect(st.texte).not.toMatch(/^['’-]|(^|\s)(c|n|d|l|s|qu)\s/i);
        }
    });

    it('un mot recollé s’éclaire d’un bloc, du début de « c » à la fin de « ’est »', () => {
        const cest = calageS.motsAffiches.find(m => m.texte === 'c\'est' && m.debut > 25)!;
        expect([cest.debut, cest.fin]).toEqual([25.28, 25.66]);
    });

    it('sans script aussi, le texte de référence ne garde pas d’élision détachée', () => {
        const voix = scriptDepuisLaTranscription(sparadrap.mots).sequences[0].voix;
        expect(voix).toContain('ce qu\'on me demande, c\'est un meilleur');
        expect(voix).not.toMatch(/\s['’]/);
        expect(voix).toContain('voulez-vous');
    });
});

/**
 * La même prise, montée écran par écran (v2.26) : le texte n'a pas changé d'un
 * mot, seules les séquences sont redécoupées — la prise déjà tournée se recale
 * telle quelle. Ce que Florent reprochait à la première vidéo : « beaucoup trop
 * d'infos, donc pas percutant ».
 */
describe('une vraie prise, un écran à la fois', () => {
    const sparadrap = JSON.parse(readFileSync(join(import.meta.dirname, 'prises', 'sparadrap.json'), 'utf8'));
    const ecrans = sparadrap.scriptEcrans;
    const calageE = calerSurLaPrise(voixEntiere(ecrans), sparadrap.mots);
    const planE = planDeMontage(ecrans, { calage: calageE, duree: sparadrap.duree }, { coupes: coupesAppliquees(coupesProposees(calageE), {}) });

    it('le script tient, et dit mot pour mot ce que disait le premier', () => {
        expect(verifierReelExplique(ecrans)).toEqual([]);
        const dit = (d: any) => d.sequences.map((s: any) => s.voix).join(' ').replace(/\s+/g, ' ');
        expect(dit(ecrans)).toBe(dit(sparadrap.script));
    });

    it('aucune scène ne dure plus de six secondes, et l’image ne fige jamais', () => {
        planE.minutage.sequences.forEach((m, i) => {
            // Une scène qui recouvre un visage éclair (v2.30) le porte en plus de son temps.
            const eclair = planE.minutage.sequences[i + 1];
            const recouvre = eclair && ecrans.sequences[i + 1]?.plan === 'camera' && eclair.fin === eclair.debut ? VISAGE_MIN : 0;
            if (ecrans.sequences[i].plan === 'scene') expect(m.fin - m.debut).toBeLessThan(6 + recouvre);
        });
        expect(momentsFiges(ecrans, planE.minutage, planE.cadrages)).toEqual([]);
    });
});
