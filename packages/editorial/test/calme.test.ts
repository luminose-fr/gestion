/**
 * Le calme (SPEC v2.30). Le 30/10/2026, devant la vidéo exportée, Florent : « Le
 * rythme est un peu trop rapide. Ça fait beaucoup de trucs qui s'animent à
 * l'écran et c'est confus à suivre. » Ses choix : plus d'air dans la voix, pas de
 * visage éclair entre deux scènes, moins de mouvements, des fonds en deux temps.
 */
import { describe, it, expect } from 'vitest';
import { calerSurLaPrise, ecransEstimes, planDeMontage, voixEntiere, type MotPrononce } from '../src/calage';
import { coupesProposees } from '../src/derushage';
import {
    arriveesDeLaListe, enDeuxTemps, sansVisageEclair, tempsDeLaSequence, VISAGE_MIN,
    type MinutageReel, type ReelExplique,
} from '../src/reelExplique';

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

const scene = (voix: string, ton = 'ombre') => ({
    plan: 'scene' as const, role: 'Scène', registre: 'pedagogie' as const, voix,
    elements: [{ texte: 'Un [mot]', ton: ton as 'ombre', apparait_sur: voix.split(' ').slice(0, 2).join(' ') }],
});
const camera = (voix: string) => ({ plan: 'camera' as const, role: 'Face', voix });

describe('pas de visage éclair', () => {
    const data = {
        format: 'Reel expliqué',
        sequences: [camera('Ouverture.'), scene('La colère part pour un détail.'), camera('Le dimanche soir.'), scene('Vous courez partout.')],
    } as ReelExplique;
    const minutage = (face: number): MinutageReel => ({
        duree: 20,
        sequences: [
            { debut: 0, fin: 3, apparitions: [] },
            { debut: 3, fin: 7, apparitions: [0] },
            { debut: 7, fin: 7 + face, apparitions: [] },
            { debut: 7 + face, fin: 20, apparitions: [0] },
        ],
    });

    it('un passage face caméra trop court entre deux scènes laisse la scène d’avant à l’écran', () => {
        const m = sansVisageEclair(data, minutage(1.5));
        expect(m.sequences[1]).toMatchObject({ debut: 3, fin: 8.5 });
        expect(m.sequences[2].fin - m.sequences[2].debut).toBe(0);
        expect(m.sequences[3].debut).toBe(8.5);
    });

    it('le visage reste quand il a le temps d’être vu, ou qu’il porte un coup de poing', () => {
        expect(sansVisageEclair(data, minutage(VISAGE_MIN + 0.5)).sequences[2]).toMatchObject({ debut: 7, fin: 10 });
        const avecCoup = { ...data, sequences: data.sequences.map((s, i) => i === 2 ? { ...s, coup: { texte: 'Le [dimanche]', apparait_sur: 'dimanche soir' } } : s) } as ReelExplique;
        const m = minutage(1.5);
        m.sequences[2].coup = { debut: 0.2, fin: 1.4 };
        expect(sansVisageEclair(avecCoup, m).sequences[2]).toMatchObject({ debut: 7, fin: 8.5 });
    });

    it('ni l’ouverture ni la fin, qui ne sont pas entre deux scènes', () => {
        const court: MinutageReel = { duree: 6, sequences: [{ debut: 0, fin: 1, apparitions: [] }, { debut: 1, fin: 6, apparitions: [0] }] };
        expect(sansVisageEclair({ ...data, sequences: data.sequences.slice(0, 2) } as ReelExplique, court)).toEqual(court);
    });

    it('dans la vidéo, ses mots ne s’écrivent pas : la scène les recouvre, comme les siens', () => {
        const prise = dire(...data.sequences.map(s => s.voix));
        const plan = planDeMontage(data, { calage: calerSurLaPrise(voixEntiere(data), prise), duree: 20 });
        expect(plan.minutage.sequences[2].fin - plan.minutage.sequences[2].debut).toBe(0);
        expect(plan.sousTitres.map(st => st.texte).join(' ')).not.toMatch(/dimanche/);
    });
});

describe('les fonds en deux temps', () => {
    const data = {
        format: 'Reel expliqué',
        sequences: [
            camera('Ouverture.'),
            scene('Elle fuit de partout.', 'neutre'),
            scene('Elle pousse fort.', 'ombre'),
            camera('Je vais vous décevoir.'),
            { ...scene('Ici on ouvre une vanne.', 'lumière'), elements: [
                { texte: 'Pas des [fuites]', ton: 'lumière' as unknown as 'lumiere', apparait_sur: 'Ici on' },
                { texte: 'Le niveau [baisse]', ton: 'ombre' as const, apparait_sur: 'une vanne' },
            ] },
            camera('Voilà.'),
        ],
    } as ReelExplique;

    it('sombre jusqu’au premier écran de lumière, clair ensuite, quel que soit le ton écrit', () => {
        const tons = enDeuxTemps(data).sequences.flatMap(s => (s.elements ?? []).map(e => e.ton));
        expect(tons).toEqual(['ombre', 'ombre', 'lumiere', 'lumiere']);
        // La copie dit encore où tombe la bascule : le storyboard et la vidéo la dessinent.
        expect(tempsDeLaSequence(enDeuxTemps(data), 3)).toBe('sombre');
        expect(tempsDeLaSequence(enDeuxTemps(data), 5)).toBe('clair');
    });

    it('les coups de poing suivent : sombres avant la bascule, clairs après', () => {
        expect(tempsDeLaSequence(data, 3)).toBe('sombre');
        expect(tempsDeLaSequence(data, 5)).toBe('clair');
    });

    it('sans écran de lumière, pas de bascule : clair de bout en bout', () => {
        const sansLumiere = { ...data, sequences: data.sequences.slice(0, 4) } as ReelExplique;
        expect(enDeuxTemps(sansLumiere).sequences.flatMap(s => (s.elements ?? []).map(e => e.ton))).toEqual(['lumiere', 'lumiere']);
        expect(tempsDeLaSequence(sansLumiere, 3)).toBe('clair');
    });
});

describe('moins de mouvements', () => {
    it('les lignes d’une liste arrivent ensemble, avec leur écran', () => {
        expect(arriveesDeLaListe(3, 4)).toEqual([0, 0, 0]);
    });
});

describe('plus d’air dans la voix', () => {
    const data = { format: 'Reel expliqué', sequences: [camera('Une phrase ici. Une autre phrase là.')] } as ReelExplique;
    const prise = dire('Une phrase ici.', 2, 'Une autre', 2, 'phrase là.');
    const calage = calerSurLaPrise(voixEntiere(data), prise);
    const silences = coupesProposees(calage).filter(c => c.motif === 'silence');
    const mot = (debut: string, apres = 0) => prise.find(m => m.mot.startsWith(debut) && m.debut >= apres)!;

    it('entre deux phrases, il reste 0,6 s de silence', () => {
        const entre = silences.find(c => c.debut > mot('ici').fin && c.fin < mot('Une', 3).debut)!;
        expect(entre.debut - mot('ici').fin + mot('Une', 3).debut - entre.fin).toBeCloseTo(0.6);
    });

    it('au milieu d’une phrase, 0,35 s comme avant', () => {
        const dedans = silences.find(c => c.debut > mot('autre').fin)!;
        expect(dedans.debut - mot('autre').fin + mot('phrase', 5).debut - dedans.fin).toBeCloseTo(0.35);
    });
});

/**
 * La prise fait foi (v2.30). Florent : « entre le script proposé et ce que je
 * réalise en vidéo, il y aura forcément des différences, car j'ajuste pour que
 * ça colle à moi et à mon style parlé. »
 */
describe('la prise fait foi', () => {
    it('le sous-titre écrit le mot comme il a été dit quand seule la flexion change', () => {
        const data = { format: 'Reel expliqué', sequences: [camera('C\'est savoir ouvrir la vanne. Rendez-vous sur luminose.fr')] } as ReelExplique;
        const calage = calerSurLaPrise(voixEntiere(data), dire('C\'est apprendre à ouvrir les vannes. Rendez-vous sur luminoz.fr'));
        const affiches = calage.motsAffiches.map(m => m.texte);
        expect(affiches).toContain('vannes.');
        // Une faute d'oreille, elle, prend l'orthographe du script.
        expect(affiches).toContain('luminose.fr');
    });

    it('une improvisation redite peu après, autrement, est un premier jet : elle se coupe', () => {
        const data = { format: 'Reel expliqué', sequences: [camera('Je vais vous décevoir. Ici on ouvre une vanne.')] } as ReelExplique;
        const prise = dire('Je vais vous décevoir.', 1, 'franchement le cabinet sert surtout à souffler', 2,
            'bon disons que le cabinet sert à souffler un peu', 1, 'Ici on ouvre une vanne.');
        const coupes = coupesProposees(calerSurLaPrise(voixEntiere(data), prise));
        const premierJet = prise.find(m => m.mot === 'franchement')!;
        const coupe = coupes.find(c => c.debut <= premierJet.debut && c.fin >= premierJet.fin)!;
        expect(coupe.motif).toBe('reprise');
        expect(coupe.parDefaut).toBe(true);
        // La version d'après, elle, reste proposée et gardée.
        const garde = prise.find(m => m.mot === 'disons')!;
        expect(coupes.some(c => c.parDefaut && c.debut <= garde.debut && c.fin >= garde.fin)).toBe(false);
    });

    it('les écrans à vérifier sont ceux dont aucun mot du repère n’a été dit', () => {
        const data = {
            format: 'Reel expliqué',
            sequences: [
                camera('Ouverture.'),
                { ...scene('L eau retenue ne disparaît pas. Elle s accumule. Elle pousse.'), elements: [
                    { texte: 'L\'eau', apparait_sur: 'L eau retenue' },
                    { texte: 'Elle [s\'accumule]', apparait_sur: 'Elle s accumule' },
                    { texte: 'Elle [pousse]', apparait_sur: 'Elle pousse' },
                ] },
            ],
        } as ReelExplique;
        // « Elle s'accumule » dit tel quel ; « Elle pousse » remplacé par « ça déborde ».
        const calage = calerSurLaPrise(voixEntiere(data), dire('Ouverture. L eau retenue elle disparaît pas. Elle s accumule. Ça déborde.'));
        expect(ecransEstimes(data, calage)).toEqual([{ sequence: 1, element: 2 }]);
    });
});
