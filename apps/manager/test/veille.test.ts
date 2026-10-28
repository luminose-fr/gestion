/**
 * Un rendu figé rend la main (SPEC §12.4.1) : le 27/10/2026, un export bloqué
 * dans l'encodeur de Safari restait à 0 %, et « Annuler » n'y faisait rien.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { sousVeille } from '../components/Video/veille';

const jamais = () => new Promise<never>(() => undefined);
const fige = new Error('figé');

afterEach(() => { vi.useRealTimers(); });

describe('sousVeille', () => {
    it('rend la main dès l’annulation, même à un rendu qui ne finira jamais', async () => {
        const controle = new AbortController();
        const rendu = sousVeille(jamais, controle, 60_000, fige);
        controle.abort();
        await expect(rendu).rejects.toThrow();
        expect(controle.signal.reason).not.toBe(fige);
    });

    it('annule, avec son erreur, un rendu sans signe de vie depuis le délai', async () => {
        vi.useFakeTimers();
        const controle = new AbortController();
        const rendu = sousVeille(jamais, controle, 60_000, fige);
        const attendu = expect(rendu).rejects.toBe(fige);
        await vi.advanceTimersByTimeAsync(66_000);
        await attendu;
        expect(controle.signal.reason).toBe(fige);
    });

    it('laisse aller au bout un rendu lent qui avance', async () => {
        vi.useFakeTimers();
        const controle = new AbortController();
        const rendu = sousVeille(async (signeDeVie) => {
            for (let i = 0; i < 10; i++) {
                await new Promise(r => setTimeout(r, 30_000));
                signeDeVie();
            }
            return 'vidéo';
        }, controle, 60_000, fige);
        await vi.advanceTimersByTimeAsync(310_000);
        await expect(rendu).resolves.toBe('vidéo');
        expect(controle.signal.aborted).toBe(false);
    });
});
