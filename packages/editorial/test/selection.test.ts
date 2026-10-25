/**
 * Le choix des prises, phrase par phrase (SPEC §12.5.5), sur des cas faits main.
 */
import { describe, it, expect } from 'vitest';
import { phrasesDuScript, versionsDePhrase, choisirLesPrises } from '../src/selection';
import { accord } from '../src/calage';
import { motsNormalises } from '../src/reelExplique';

/** Une prise : des morceaux lus à 0,4 s le mot, des nombres pour les silences. */
const prise = (...morceaux: Array<string | number>) => {
    const jetons: Array<{ mot: string; debut: number; fin: number }> = [];
    let t = 0;
    for (const m of morceaux) {
        if (typeof m === 'number') { t += m; continue; }
        for (const mot of motsNormalises(m)) { jetons.push({ mot, debut: t, fin: t + 0.35 }); t += 0.4; }
    }
    return jetons;
};

describe('phrasesDuScript', () => {
    it('coupe aux points, pas aux points de suspension, et ne laisse pas une phrase de deux mots seule', () => {
        const phrases = phrasesDuScript('Ils viennent chercher… un meilleur sparadrap. Bon. On ne va pas faire ça.\nNouvelle séquence ici.');
        expect(phrases.map(p => p.mots.join(' '))).toEqual([
            'ils viennent chercher un meilleur sparadrap bon',
            'on ne va pas faire ca',
            'nouvelle sequence ici',
        ]);
    });
});

describe('versionsDePhrase', () => {
    it('trouve chaque version d’une phrase dite plusieurs fois', () => {
        const jetons = prise('le corps garde la mémoire', 1, 'pardon', 1, 'le corps garde la mémoire de tout');
        const versions = versionsDePhrase(motsNormalises('Le corps garde la mémoire de tout.'), jetons, accord);
        expect(versions).toHaveLength(2);
        expect(versions.map(v => jetons[v.debut].debut).sort((a, b) => a - b)).toEqual([0, 4.4]);
    });
});

describe('choisirLesPrises', () => {
    const script = 'Le corps garde la mémoire de ce que la tête oublie. Et il parle quand on l’écoute enfin.';

    it('garde la dernière bonne version, d’un seul tenant', () => {
        const jetons = prise(
            'le corps garde la mémoire de ce que la tête dépasse', 1.5,
            'le corps garde la mémoire de ce que la tête oublie', 0.5,
            'et il parle quand on l’écoute enfin',
        );
        const [premiere, seconde] = choisirLesPrises(phrasesDuScript(script), jetons, accord);
        const retenue = premiere.versions[premiere.retenue!];
        expect(jetons[retenue.debut].debut).toBeGreaterThan(5);
        expect(seconde.retenue).not.toBeNull();
    });

    it('ne prend pas une version abandonnée à mi-chemin pour la dernière', () => {
        const jetons = prise('le corps garde la mémoire de ce que la tête oublie', 1.5, 'le corps garde', 1, 'et il parle quand on l’écoute enfin');
        const [premiere] = choisirLesPrises(phrasesDuScript(script), jetons, accord);
        expect(jetons[premiere.versions[premiere.retenue!].debut].debut).toBe(0);
    });

    it('obéit au choix de Florent', () => {
        const jetons = prise('le corps garde la mémoire de ce que la tête oublie', 1.5, 'le corps garde la mémoire de ce que la tête oublie', 0.5, 'et il parle quand on l’écoute enfin');
        const [premiere] = choisirLesPrises(phrasesDuScript(script), jetons, accord, { 0: 0 });
        expect(jetons[premiere.versions[premiere.retenue!].debut].debut).toBe(0);
    });

    it('retrouve la version imposée même si son premier mot a été recalé depuis', () => {
        const jetons = prise('le corps garde la mémoire de ce que la tête oublie', 1.5, 'le corps garde la mémoire de ce que la tête oublie', 0.5, 'et il parle quand on l’écoute enfin');
        const [premiere] = choisirLesPrises(phrasesDuScript(script), jetons, accord, { 0: 1.2 });
        expect(jetons[premiere.versions[premiere.retenue!].debut].debut).toBe(0);
    });

    it('garde l’ordre : une phrase ne se prend pas avant la précédente', () => {
        const jetons = prise('et il parle quand on l’écoute enfin', 1, 'le corps garde la mémoire de ce que la tête oublie', 1, 'et il parle quand on l’écoute enfin');
        const [premiere, seconde] = choisirLesPrises(phrasesDuScript(script), jetons, accord);
        const debut = (c: typeof premiere) => jetons[c.versions[c.retenue!].debut].debut;
        expect(debut(seconde)).toBeGreaterThan(debut(premiere));
    });
});
