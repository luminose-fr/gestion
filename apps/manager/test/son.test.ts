/**
 * L'enveloppe d'un WAV (SPEC §12.5.4) : le volume, par pas de dix millisecondes,
 * lu dans l'en-tête plutôt que supposé.
 */
import { describe, it, expect } from 'vitest';
import { lireNiveaux } from '@luminose/editorial';
import { enveloppeDuWav } from '../components/Video/son';

/** Un WAV mono 16 kHz, 16 bits : `plages` = [durée en secondes, amplitude de 0 à 1]. */
function wav(plages: Array<[number, number]>): ArrayBuffer {
    const echantillons: number[] = [];
    for (const [duree, amplitude] of plages) {
        for (let i = 0; i < duree * 16000; i++) echantillons.push(Math.round(amplitude * 32767 * (i % 2 ? 1 : -1)));
    }
    const buffer = new ArrayBuffer(44 + echantillons.length * 2);
    const v = new DataView(buffer);
    const ecrire = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    ecrire(0, 'RIFF'); v.setUint32(4, 36 + echantillons.length * 2, true); ecrire(8, 'WAVE');
    ecrire(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    ecrire(36, 'data'); v.setUint32(40, echantillons.length * 2, true);
    echantillons.forEach((e, i) => v.setInt16(44 + i * 2, e, true));
    return buffer;
}

describe('enveloppeDuWav', () => {
    it('mesure le volume toutes les dix millisecondes', () => {
        const e = enveloppeDuWav(wav([[0.5, 0.001], [0.5, 0.1]]));
        expect(e.pas).toBe(0.01);
        const db = lireNiveaux(e);
        expect(db).toHaveLength(100);
        expect(db[10]).toBe(-60);
        expect(db[80]).toBe(-20);
    });

    it('refuse ce qui n’est pas un WAV', () => {
        expect(() => enveloppeDuWav(new ArrayBuffer(20))).toThrow('WAV');
    });
});
