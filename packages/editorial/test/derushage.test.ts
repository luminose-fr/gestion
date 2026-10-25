/**
 * Le dérushage (SPEC §12.5.2) : ce qui se coupe d'une prise réelle.
 *
 * Ce qui compte : qu'une phrase ratée puis reprise perde sa première version et
 * garde la bonne ; qu'un silence se raccourcisse sans manger de syllabe ; et
 * qu'une improvisation ne disparaisse jamais sans qu'on l'ait demandé.
 */
import { describe, it, expect } from 'vitest';
import { calerSurLaPrise, planDeMontage, voixEntiere, instantDansLaVideo, AVANCE_SOUS_TITRE, type MotPrononce } from '../src/calage';
import { coupesProposees, coupesAppliquees, estCoupee, choisir, dureeCoupee, SILENCE_MAX } from '../src/derushage';
import type { ReelExplique } from '../src/reelExplique';

const PAS = 0.4;

/**
 * Une prise dite : des morceaux de texte lus à débit régulier, et des nombres
 * pour les silences, en secondes. `dire('Bonjour à tous', 1.5, 'je reprends')`.
 */
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

const SCRIPT = 'Le corps garde la mémoire de ce que la tête a oublié. Et il parle quand on l’écoute enfin.';

describe('coupesProposees', () => {
    it('une prise dite d’un trait ne se coupe pas', () => {
        expect(coupesProposees(calerSurLaPrise(SCRIPT, dire(SCRIPT)))).toEqual([]);
    });

    it('raccourcit un silence trop long, en gardant de l’air de part et d’autre', () => {
        const prise = dire('Le corps garde la mémoire de ce que la tête a oublié.', 2, 'Et il parle quand on l’écoute enfin.');
        const [coupe] = coupesProposees(calerSurLaPrise(SCRIPT, prise));
        expect(coupe).toMatchObject({ motif: 'silence', parDefaut: true, texte: '' });
        const oublie = prise.find(m => m.mot === 'oublié.')!;
        const et = prise.find(m => m.mot === 'Et')!;
        expect(coupe.debut).toBeGreaterThan(oublie.fin);
        expect(coupe.fin).toBeLessThan(et.debut);
        // Ce qui reste du silence se respire, sans traîner.
        const reste = (et.debut - oublie.fin) - (coupe.fin - coupe.debut);
        expect(reste).toBeGreaterThan(0.3);
        expect(reste).toBeLessThan(SILENCE_MAX);
    });

    it('laisse une respiration normale', () => {
        const prise = dire('Le corps garde la mémoire de ce que la tête a oublié.', 0.5, 'Et il parle quand on l’écoute enfin.');
        expect(coupesProposees(calerSurLaPrise(SCRIPT, prise))).toEqual([]);
    });

    it('coupe la version ratée d’une phrase reprise, et garde la bonne', () => {
        const prise = dire(
            'Le corps garde la mémoire de ce que la tête a oublié.',
            0.4, 'Et il parle quand', 0.8, 'pardon je reprends', 1,
            'Et il parle quand on l’écoute enfin.',
        );
        const calage = calerSurLaPrise(SCRIPT, prise);
        const coupes = coupesProposees(calage);
        expect(coupes.map(c => c.motif)).toEqual(['reprise']);
        const [reprise] = coupes;
        expect(reprise.parDefaut).toBe(true);
        expect(reprise.texte).toBe('Et il parle quand pardon je reprends');
        // La bonne version commence au second « Et » : il est juste après la coupe.
        const secondEt = prise.filter(m => m.mot === 'Et')[1];
        expect(reprise.fin).toBeLessThan(secondEt.debut);
        expect(reprise.fin).toBeGreaterThan(secondEt.debut - 0.3);
        // Et la première phrase reste entière avant.
        const oublie = prise.find(m => m.mot === 'oublié.')!;
        expect(reprise.debut).toBeGreaterThan(oublie.fin);
    });

    it('une phrase ratée en ouverture tombe avec la tête, sans coupe à proposer', () => {
        const prise = dire('Le corps garde la mémoire de ce', 0.8, 'pardon', 1, SCRIPT);
        const calage = calerSurLaPrise(SCRIPT, prise);
        expect(coupesProposees(calage)).toEqual([]);
        // Le premier mot du script est le second « Le » : c'est là que la vidéo commence.
        expect(calage.horloge(0)).toBe(prise.filter(m => m.mot === 'Le')[1].debut);
    });

    it('coupe un bégaiement d’un mot', () => {
        const prise = dire('Le corps garde la la mémoire de ce que la tête a oublié. Et il parle quand on l’écoute enfin.');
        // Un mot répété au débit normal laisse un écart trop court pour valoir une coupe : rien à faire.
        expect(coupesProposees(calerSurLaPrise(SCRIPT, prise)).filter(c => c.motif === 'reprise').length).toBeLessThanOrEqual(1);
        const hesite = dire('Le corps garde la', 0.6, 'la mémoire de ce que la tête a oublié. Et il parle quand on l’écoute enfin.');
        const coupes = coupesProposees(calerSurLaPrise(SCRIPT, hesite));
        expect(coupes.map(c => c.motif)).toEqual(['reprise']);
    });

    it('propose une improvisation sans la couper d’office', () => {
        const prise = dire(
            'Le corps garde la mémoire de ce que la tête a oublié.',
            0.3, 'comme je le dis souvent à mes patients', 0.3,
            'Et il parle quand on l’écoute enfin.',
        );
        const coupes = coupesProposees(calerSurLaPrise(SCRIPT, prise));
        const improvisation = coupes.find(c => c.motif === 'hors-script')!;
        expect(improvisation).toMatchObject({ parDefaut: false, texte: 'comme je le dis souvent à mes patients' });
        expect(coupesAppliquees(coupes, {})).toEqual([]);
    });

    it('laisse un ou deux mots improvisés en place', () => {
        const prise = dire('Le corps garde vraiment la mémoire de ce que la tête a oublié. Et il parle quand on l’écoute enfin.');
        expect(coupesProposees(calerSurLaPrise(SCRIPT, prise))).toEqual([]);
    });

    it('ne touche ni à la tête ni à la queue : le plan de montage s’en charge', () => {
        const prise = dire('Moteur ça tourne', 2, SCRIPT, 3, 'coupez');
        expect(coupesProposees(calerSurLaPrise(SCRIPT, prise))).toEqual([]);
    });
});

describe('le choix de Florent', () => {
    const prise = dire(
        'Le corps garde la mémoire', 1.5, 'de ce que la tête a oublié.',
        0.3, 'comme je le dis souvent à mes patients', 0.3,
        'Et il parle quand on l’écoute enfin.',
    );
    const coupes = coupesProposees(calerSurLaPrise(SCRIPT, prise));
    const silence = coupes.find(c => c.motif === 'silence')!;
    const improvisation = coupes.find(c => c.motif === 'hors-script')!;

    it('rétablit une coupe faite d’office, et coupe une improvisation sur demande', () => {
        const choix = { [silence.cle]: false, [improvisation.cle]: true };
        expect(estCoupee(silence, choix)).toBe(false);
        expect(estCoupee(improvisation, choix)).toBe(true);
        expect(coupesAppliquees(coupes, choix)).toEqual([{ debut: improvisation.debut, fin: improvisation.fin }]);
    });

    it('retrouve sa coupe quand une nouvelle transcription en décale le bord', () => {
        const decale = { ...silence, debut: silence.debut + 0.12, cle: `s${(silence.debut + 0.12).toFixed(1)}x` };
        expect(estCoupee(decale, { [silence.cle]: false })).toBe(false);
        // Mais pas celle d'un autre motif au même endroit.
        expect(estCoupee({ ...improvisation, debut: silence.debut, cle: 'h-autre' }, { [silence.cle]: true })).toBe(false);
    });

    it('ne retient que ce qui s’écarte du défaut', () => {
        const garde = choisir({}, silence, false);
        expect(garde).toEqual({ [silence.cle]: false });
        // Revenir au défaut efface le choix, même posé sous une clé voisine.
        expect(choisir({ 's99.0': true, [`s${(silence.debut + 0.1).toFixed(1)}`]: false }, silence, true)).toEqual({ 's99.0': true });
        expect(choisir(garde, improvisation, true)).toEqual({ [silence.cle]: false, [improvisation.cle]: true });
    });

    it('fusionne ce qui se chevauche, et compte le temps gagné', () => {
        const appliquees = coupesAppliquees(
            [silence, { ...silence, cle: 'x', debut: silence.debut + 0.1, fin: silence.fin + 1 }],
            {},
        );
        expect(appliquees).toEqual([{ debut: silence.debut, fin: silence.fin + 1 }]);
        expect(dureeCoupee(appliquees)).toBeCloseTo(silence.fin + 1 - silence.debut);
    });
});

describe('planDeMontage, prise dérushée', () => {
    const data: ReelExplique = {
        format: 'Reel expliqué',
        sequences: [
            { plan: 'camera', role: 'Accroche', voix: 'Le corps garde la mémoire de ce que la tête a oublié.' },
            {
                plan: 'scene', role: 'Mécanique', registre: 'pedagogie', titre: 'Le corps [parle]',
                voix: 'Et il parle quand on l’écoute enfin.',
                elements: [{ type: 'carte', texte: 'Il [parle]', apparait_sur: 'il parle' }],
            },
            { plan: 'camera', role: 'Appel', voix: 'Le lien est en bio.' },
        ],
    };
    const texte = voixEntiere(data);
    const prise = dire(
        'Le corps garde la mémoire de ce que la tête a oublié.', 2,
        'Et il parle quand on l’écoute', 0.6, 'parle quand on', 0.4,
        'enfin.', 0.4, 'Le lien est en bio.',
    );
    const calage = calerSurLaPrise(texte, prise);
    const principale = { calage, duree: 40 };
    const coupes = coupesAppliquees(coupesProposees(calage), {});
    const brut = planDeMontage(data, principale);
    const plan = planDeMontage(data, principale, { coupes });

    it('monte la prise en morceaux, sans les coupes, et dure d’autant moins', () => {
        expect(coupes.length).toBeGreaterThan(0);
        expect(plan.segments.length).toBe(brut.segments.length + coupes.length);
        plan.segments.forEach((s, i) => {
            if (i > 0) expect(s.a).toBeCloseTo(plan.segments[i - 1].a + plan.segments[i - 1].jusqua - plan.segments[i - 1].depuis);
            expect(coupes.some(c => s.depuis < c.fin && s.jusqua > c.debut)).toBe(false);
        });
        expect(plan.duree).toBeCloseTo(brut.duree - dureeCoupee(coupes));
    });

    it('les cartes restent sur leurs mots', () => {
        const il = calage.prononces.filter(p => p.mot === 'il').pop()!;
        const scene = plan.minutage.sequences[1];
        expect(scene.debut + scene.apparitions[0]!).toBeCloseTo(instantDansLaVideo(plan, 'principale', il.debut)!);
    });

    it('les mots coupés quittent les sous-titres', () => {
        const dits = plan.sousTitres.map(s => s.texte).join(' ');
        expect(dits).not.toMatch(/on parle quand on/);
        expect(plan.sousTitres.every(s => s.fin > s.debut)).toBe(true);
    });

    it('chaque mot d’un sous-titre passe, lui aussi, dans le temps de la vidéo', () => {
        const lien = plan.sousTitres.flatMap(s => s.mots).find(m => m.texte === 'lien')!;
        const dit = prise.find(m => m.mot === 'lien')!;
        // Un dixième de seconde en avance sur la voix (§12.5.4).
        expect(lien.debut).toBeCloseTo(instantDansLaVideo(plan, 'principale', dit.debut)! - AVANCE_SOUS_TITRE);
        // Un bloc rogné au bord d'une scène garde ses mots : ceux qui se disaient
        // sous la scène sont déjà dits quand il apparaît, et ne s'éclairent plus.
        const tous = plan.sousTitres.flatMap(s => s.mots.map(m => m.debut));
        expect(tous.every((t, i) => t >= 0 && t <= plan.duree && (i === 0 || t >= tous[i - 1]))).toBe(true);
    });

    it('le cadre change à chaque raccord', () => {
        expect(plan.cadrages.map(c => c.a)).toEqual(plan.segments.map(s => s.a));
        expect(plan.cadrages.map(c => c.serre)).toEqual(plan.segments.map((_, i) => i % 2 === 1));
    });

    it('un instant coupé tombe au raccord', () => {
        const coupe = coupes[0];
        const milieu = (coupe.debut + coupe.fin) / 2;
        expect(instantDansLaVideo(plan, 'principale', milieu)).toBeCloseTo(instantDansLaVideo(plan, 'principale', coupe.fin)!);
        expect(instantDansLaVideo(plan, 'accroche', milieu)).toBeNull();
    });
});
