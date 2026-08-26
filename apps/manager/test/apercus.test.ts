/**
 * L'écran Personas doit montrer ce qui part — sinon il rassure à tort.
 *
 * Deux dérives le guettent, et une seule est visible à l'œil : qu'une action
 * ajoutée au flux n'ait pas d'aperçu écrit (elle tombe dans le `default` et
 * s'affiche vide), et que l'aperçu montre un persona nu là où le modèle reçoit
 * un prompt composé. Ces tests tiennent les deux.
 */
import { describe, it, expect } from 'vitest';
import { AI_ACTION_CATALOG, VOICE_RULES } from '@luminose/editorial';
import { APERCUS, compterPresences } from '../components/Settings/apercus';

describe('les aperçus de l\'écran Personas', () => {
    it('couvrent tout le catalogue, dans le même ordre', () => {
        expect(APERCUS.map(a => a.id)).toEqual(AI_ACTION_CATALOG.map(a => a.id));
    });

    it('rendent tous un prompt non vide — sinon un cas manque', () => {
        const vides = APERCUS.filter(a => !a.prompt.trim()).map(a => a.id);
        expect(vides).toEqual([]);
    });

    it('montrent un prompt COMPOSÉ, pas un persona nu', () => {
        // Le plus court des neuf dépasse déjà largement un persona seul ;
        // si l'un retombe sous ce seuil, c'est que la composition a sauté.
        const courts = APERCUS.filter(a => a.prompt.length < 1500).map(a => `${a.id} (${a.prompt.length})`);
        expect(courts).toEqual([]);
    });

    it('nomment ce qui a été substitué dès que le prompt varie', () => {
        // Les deux prompts fixes n'ont rien à déclarer ; tous les autres, si.
        const FIXES = ['ANALYZE_BATCH', 'PLAN_SERIES'];
        const muets = APERCUS.filter(a => !FIXES.includes(a.id) && !a.exemple).map(a => a.id);
        expect(muets).toEqual([]);
        for (const id of FIXES) {
            expect(APERCUS.find(a => a.id === id)!.exemple).toBeNull();
        }
    });

    it('ne laissent fuir aucun exemple dans un prompt fixe', () => {
        const analyste = APERCUS.find(a => a.id === 'ANALYZE_BATCH')!;
        expect(analyste.prompt).not.toContain('Raccourcis');
        expect(analyste.prompt).not.toContain('le texte à relire prend place ici');
    });
});

describe('les règles de voix', () => {
    it('sont bien un bloc partagé, pas la propriété d\'un rôle', () => {
        const n = compterPresences(VOICE_RULES);
        expect(n).toBeGreaterThan(1);
        expect(n).toBeLessThanOrEqual(APERCUS.length);
    });
});
