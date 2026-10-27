/**
 * L'encodage H.264 de l'export là où le navigateur le bloque (SPEC §12.4.1) :
 * Safari 27 ne rend aucune image en mode qualité, et l'export restait à 0 %.
 * WebCodecs n'existe pas sous Node : l'encodeur est simulé, avec le défaut
 * constaté le 27/10/2026 — Main et High en mode qualité ne rendent rien.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { EncodeurTempsReel, leModeQualiteRend } from '../components/Video/encodage';

const configures: VideoEncoderConfig[] = [];
let bogue = false;

class FauxEncodeur {
    static isConfigSupported = async () => ({ supported: true });
    state = 'unconfigured';
    encodeQueueSize = 0;
    private pend = false;
    constructor(private init: { output: () => void }) {}
    configure(config: VideoEncoderConfig) {
        configures.push(config);
        this.state = 'configured';
        this.pend = bogue && (config.latencyMode ?? 'quality') === 'quality' && !config.codec.startsWith('avc1.42');
    }
    encode() { if (!this.pend) this.init.output(); }
    flush() { return this.pend ? new Promise<void>(() => undefined) : Promise.resolve(); }
    close() { this.state = 'closed'; }
    addEventListener() {}
}

const simuler = () => {
    vi.stubGlobal('VideoEncoder', FauxEncodeur);
    vi.stubGlobal('OffscreenCanvas', class { getContext() { return { fillRect() {}, fillStyle: '' }; } });
    vi.stubGlobal('VideoFrame', class { close() {} });
};

afterEach(() => {
    vi.unstubAllGlobals();
    configures.length = 0;
    bogue = false;
});

describe('la sonde du mode qualité', () => {
    it('laisse son chemin à un navigateur qui rend ses images', async () => {
        simuler();
        expect(await leModeQualiteRend(1080, 1920, 20)).toBe(true);
    });

    it('repère celui qui ne les rend pas, sans attendre plus que le délai', async () => {
        simuler();
        bogue = true;
        expect(await leModeQualiteRend(1080, 1920, 20)).toBe(false);
    });
});

describe('l’encodeur de remplacement', () => {
    it('encode le H.264 en temps réel, et rien d’autre', () => {
        simuler();
        expect(EncodeurTempsReel.supports('avc', { codec: 'avc1.640028', width: 1080, height: 1920, bitrateMode: 'variable' })).toBe(true);
        expect(EncodeurTempsReel.supports('hevc', { codec: 'hev1.1.6.L120.B0', width: 1080, height: 1920 })).toBe(false);
        // Safari ne connaît pas le quantificateur : Mediabunny doit en venir au débit.
        expect(EncodeurTempsReel.supports('avc', { codec: 'avc1.640028', width: 1080, height: 1920, bitrateMode: 'quantizer' })).toBe(false);

        const encodeur = Object.assign(new EncodeurTempsReel(), {
            config: { codec: 'avc1.640028', width: 1080, height: 1920, bitrate: 8_000_000, latencyMode: 'quality' },
            onPacket: () => undefined,
            onError: () => undefined,
        });
        encodeur.init();
        expect(configures[configures.length - 1]).toEqual({ codec: 'avc1.640028', width: 1080, height: 1920, bitrate: 8_000_000, latencyMode: 'realtime' });
    });
});
