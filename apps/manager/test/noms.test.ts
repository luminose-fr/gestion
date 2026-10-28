/**
 * Les fichiers exportés portent le titre du contenu (SPEC §12.4.1) :
 * « reel-9x16.mp4 » ne disait pas de quelle vidéo il s'agissait.
 */
import { describe, it, expect } from 'vitest';
import { nomDeScene, nomDeVideo } from '../components/Video/noms';

const TITRE = 'Vingt minutes pour vérifier que je vaux le coup';

describe('les noms des fichiers exportés', () => {
    it('commencent par le titre, sans accent ni ponctuation', () => {
        expect(nomDeVideo(TITRE, '9:16', false)).toBe('vingt-minutes-pour-verifier-que-je-vaux-le-coup-9x16.mp4');
        expect(nomDeVideo(TITRE, '4:5', true)).toBe('vingt-minutes-pour-verifier-que-je-vaux-le-coup-4x5-pub.mp4');
        expect(nomDeScene(TITRE, 2, 'Mécanique')).toBe('vingt-minutes-pour-verifier-que-je-vaux-le-coup-scene-2-mecanique.mp4');
    });

    it('coupent un long titre entre deux mots', () => {
        const nom = nomDeVideo("Ne cherchez pas quelqu'un qui a les réponses. Cherchez quelqu'un qui tient la porte.", '9:16', false);
        expect(nom).toBe('ne-cherchez-pas-quelqu-un-qui-a-les-reponses-cherchez-quelqu-9x16.mp4');
        expect(nom.length - '-9x16.mp4'.length).toBeLessThanOrEqual(60);
    });

    it('retombent sur l’ancien nom sans titre', () => {
        expect(nomDeVideo('', '9:16', false)).toBe('reel-9x16.mp4');
        expect(nomDeScene(undefined, 1, 'Accroche')).toBe('scene-1-accroche.mp4');
    });
});
