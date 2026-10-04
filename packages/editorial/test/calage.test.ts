/**
 * Le calage sur la prise (SPEC §12.5) et le plan de montage (§12.6).
 *
 * Ce qui compte ici n'est pas qu'une prise parfaite se cale — c'est qu'une
 * prise RÉELLE se cale : un mot mal transcrit, un mot sauté, une phrase
 * improvisée ne doivent pas faire glisser les cartes de toute une scène.
 */
import { describe, it, expect } from 'vitest';
import {
    aligner, calerSurLaPrise, enBlocs, planDeMontage, voixEntiere, type MotPrononce,
} from '../src/calage';
import { minuterReel, type ReelExplique } from '../src/reelExplique';

/**
 * Ce que Whisper rendrait d'un texte lu à débit régulier : des mots séparés par
 * les espaces, ponctuation collée, `pas` secondes chacun à partir de `depart`.
 */
const lire = (texte: string, depart = 0, pas = 0.4): MotPrononce[] =>
    texte.split(/\s+/).filter(Boolean).map((mot, i) => ({ mot, debut: depart + i * pas, fin: depart + i * pas + pas * 0.9 }));

const reel = (): ReelExplique => ({
    format: 'Reel expliqué',
    sequences: [
        { plan: 'camera', role: 'Accroche', voix: "Vous relisez trois fois un message avant de l'envoyer ?" },
        {
            plan: 'scene', role: 'Mécanique', registre: 'pedagogie',
            voix: 'Le perfectionnisme fonctionne comme une alarme incendie qui sonne pour une virgule.',
            titre: 'Une alarme [trop sensible]',
            elements: [
                { type: 'carte', texte: 'Une [alarme]', apparait_sur: 'une alarme incendie' },
                { type: 'carte', texte: 'Une [virgule]', apparait_sur: 'pour une virgule' },
            ],
        },
        { plan: 'camera', role: 'Appel', voix: 'Tout est sur luminose.fr, lien en bio.' },
    ],
    accroche_pub: { voix: 'Relire trois fois un message : on croit que c’est de la politesse.' },
});

describe('aligner', () => {
    it('apparie un texte dit tel quel', () => {
        expect(aligner(['a', 'b', 'c'], ['a', 'b', 'c']).map(x => x?.j)).toEqual([0, 1, 2]);
    });

    it('saute ce qui a été ajouté, et ce qui a été omis', () => {
        const a = aligner(['vous', 'relisez', 'trois', 'fois'], ['euh', 'vous', 'relisez', 'fois']);
        expect(a.map(x => x?.j ?? null)).toEqual([1, 2, null, 3]);
    });

    it('reconnaît un mot mal écrit par Whisper', () => {
        expect(aligner(['luminose'], ['luminoz'])[0]?.accord).toBe('proche');
        expect(aligner(['tout'], ['bout'])[0]?.accord).toBe('substitution');
    });
});

describe('calerSurLaPrise', () => {
    it('donne à chaque mot du script l’instant où il est dit', () => {
        const texte = voixEntiere(reel());
        const calage = calerSurLaPrise(texte, lire(texte, 1));
        expect(calage.couverture).toBe(1);
        expect(calage.horloge(0)).toBe(1);
        // « l'envoyer » : un mot pour Whisper, deux pour le script — qui se partagent sa durée.
        expect(calage.instants[9]).toBeCloseTo(calage.instants[8] + 0.36 * (1 / 8));
    });

    it('tient sur une prise réelle : mot ajouté, mot omis, mot mal écrit', () => {
        const texte = voixEntiere(reel());
        const prise = lire(texte.replace('trois fois', 'euh trois').replace('luminose.fr', 'luminoz.fr'), 0);
        const calage = calerSurLaPrise(texte, prise);
        expect(calage.couverture).toBeGreaterThan(0.9);
        // « fois », omis, prend sa place entre ses voisins.
        const fois = 3;
        expect(calage.mesures[fois]).toBe(false);
        expect(calage.instants[fois]).toBeGreaterThan(calage.instants[fois - 1]);
        expect(calage.instants[fois]).toBeLessThan(calage.instants[fois + 1]);
        // Le sous-titre écrit « luminose » comme le script, pas comme Whisper l'a entendu.
        expect(calage.motsAffiches.map(m => m.texte)).toContain('luminose.fr');
    });

    it('garde la question du script dans le sous-titre', () => {
        const texte = voixEntiere(reel());
        const calage = calerSurLaPrise(texte, lire(texte));
        // Whisper rend ici le « ? » à part : il rejoint son mot, une seule fois.
        expect(calage.motsAffiches.find(m => m.texte.includes('envoyer'))?.texte).toBe('l\'envoyer\u00A0?');
        expect(calage.motsAffiches.some(m => m.texte === '?')).toBe(false);
    });

    it('cale le minutage : les cartes tombent sur les mots dits, pas sur le débit estimé', () => {
        const data = reel();
        const texte = voixEntiere(data);
        // Florent marque une pause de deux secondes avant la scène.
        const prise = [...lire(data.sequences[0].voix, 0), ...lire(data.sequences[1].voix + ' ' + data.sequences[2].voix, 6)];
        const m = minuterReel(data, calerSurLaPrise(texte, prise).horloge);
        expect(m.sequences[1].debut).toBe(6);
        // « une alarme incendie » : mots 4 à 6 de la voix de la scène.
        expect(m.sequences[1].apparitions[0]).toBeCloseTo(4 * 0.4);
    });

    it('ne s’effondre pas sur une prise muette', () => {
        const calage = calerSurLaPrise('un deux trois', []);
        expect(calage.couverture).toBe(0);
        expect(calage.instants).toEqual([0, 0.4, 0.8]);
    });
});

describe('enBlocs', () => {
    const m = (texte: string, debut: number, fin = debut + 0.3) => ({ texte, debut, fin });

    it('coupe à quatre mots, à une fin de phrase et à un silence', () => {
        const blocs = enBlocs([
            m('Vous', 0), m('relisez', 0.4), m('trois', 0.8), m('fois', 1.2), m('un', 1.6), m('message ?', 2),
            m('Après', 3.5),
        ]);
        expect(blocs.map(b => b.texte)).toEqual(['Vous relisez trois fois', 'un message ?', 'Après']);
    });

    it('tient un bloc jusqu’au suivant quand l’écart est court', () => {
        const [a, b] = enBlocs([m('a', 0), m('b', 0.3), m('c', 0.6), m('d', 0.9), m('e', 1.3)]);
        expect(a.fin).toBe(b.debut);
    });
});

describe('planDeMontage', () => {
    const data = reel();
    const texte = voixEntiere(data);
    const principale = { calage: calerSurLaPrise(texte, lire(texte, 1.5)), duree: 30 };

    it('organique : la prise sans ses silences, les sous-titres sur la caméra seulement', () => {
        const plan = planDeMontage(data, principale);
        expect(plan.segments).toEqual([{ source: 'principale', depuis: 1.2, jusqua: expect.any(Number), a: 0 }]);
        expect(plan.minutage.sequences[0].debut).toBeCloseTo(0.3);
        expect(plan.duree).toBeCloseTo(plan.segments[0].jusqua - 1.2);
        const scene = plan.minutage.sequences[1];
        expect(plan.sousTitres.length).toBeGreaterThan(0);
        expect(plan.sousTitres.every(s => (s.debut + s.fin) / 2 < scene.debut || (s.debut + s.fin) / 2 >= scene.fin)).toBe(true);
    });

    it('un repère corrigé à la main l’emporte sur le calage', () => {
        const brut = planDeMontage(data, principale);
        const corrige = planDeMontage(data, principale, { reperes: { '1:0': 12 } });
        expect(corrige.minutage.sequences[1].apparitions[0]).toBeCloseTo(12 - 1.2 - corrige.minutage.sequences[1].debut);
        expect(corrige.minutage.sequences[1].apparitions[1]).toBe(brut.minutage.sequences[1].apparitions[1]);
    });

    it('publicité : la seconde accroche, puis la prise reprise à la séquence 2', () => {
        const accroche = { calage: calerSurLaPrise(data.accroche_pub!.voix, lire(data.accroche_pub!.voix, 2)), duree: 10 };
        const organique = planDeMontage(data, principale);
        const pub = planDeMontage(data, principale, { accroche });
        expect(pub.segments.map(s => s.source)).toEqual(['accroche', 'principale']);
        const longueur = pub.segments[0].jusqua - pub.segments[0].depuis;
        expect(pub.segments[1].a).toBeCloseTo(longueur);
        expect(pub.minutage.sequences[0]).toEqual({ debut: 0, fin: longueur, apparitions: [] });
        expect(pub.minutage.sequences[1].debut).toBeCloseTo(longueur);
        // Les cartes de la scène restent sur leurs mots : même écart au premier mot de la scène.
        const motScene = (p: typeof pub, prise: number) => p.minutage.sequences[1].debut + p.minutage.sequences[1].apparitions[0]! - prise;
        expect(motScene(pub, pub.segments[1].a - pub.segments[1].depuis))
            .toBeCloseTo(motScene(organique, -organique.segments[0].depuis));
        // L'accroche publicitaire est sous-titrée, elle aussi.
        expect(pub.sousTitres[0].texte.startsWith('Relire')).toBe(true);
    });
});
