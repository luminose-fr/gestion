/**
 * Transcription d'une prise (SPEC §12.5).
 *
 * Ce qui est vérifié : seul du son passe, la liaison absente se dit en clair
 * (409, pas « Erreur interne »), une panne de Workers AI garde son message
 * (502), et la réponse de Whisper devient des mots horodatés — y compris quand
 * un segment arrive sans ses mots.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index';
import { createSessionToken } from '../src/auth';
import { versTranscription, MODELE_TRANSCRIPTION } from '../src/routes/transcription';
import { TRANSCRIPTION_BASE64_MAX } from '@luminose/shared';
import { makeEnv } from './helpers/d1';

let env: any;
let token: string;
let appels: Array<{ modele: string; entree: any }>;

const AUDIO = 'UklGR'.padEnd(200, 'A');

const poster = (corps: unknown) =>
    app.fetch(new Request('https://api.test/api/transcription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Token': token },
        body: JSON.stringify(corps),
    }), env);

const WHISPER = {
    text: ' Vous relisez trois fois ?',
    transcription_info: { language: 'fr', duration: 2.4 },
    segments: [{
        start: 0, end: 2.4, text: ' Vous relisez trois fois ?',
        words: [
            { word: ' Vous', start: 0.1, end: 0.3 },
            { word: ' relisez', start: 0.3, end: 0.8 },
            { word: ' trois', start: 0.8, end: 1.1 },
            { word: ' fois ?', start: 1.1, end: 1.6 },
        ],
    }],
};

beforeEach(async () => {
    appels = [];
    env = {
        ...makeEnv(),
        AI: {
            run: async (modele: string, entree: any) => {
                appels.push({ modele, entree });
                return WHISPER;
            },
        },
    };
    token = await createSessionToken(env);
});

describe('POST /api/transcription', () => {
    it('rend les mots horodatés, en français, par le grand modèle', async () => {
        const res = await poster({ audio: AUDIO });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            mots: [
                { mot: 'Vous', debut: 0.1, fin: 0.3 },
                { mot: 'relisez', debut: 0.3, fin: 0.8 },
                { mot: 'trois', debut: 0.8, fin: 1.1 },
                { mot: 'fois ?', debut: 1.1, fin: 1.6 },
            ],
            texte: 'Vous relisez trois fois ?',
            duree: 2.4,
        });
        expect(appels).toEqual([{ modele: MODELE_TRANSCRIPTION, entree: { audio: AUDIO, task: 'transcribe', language: 'fr' } }]);
    });

    it('dit quoi ajouter à wrangler.toml quand la liaison manque', async () => {
        delete env.AI;
        const res = await poster({ audio: AUDIO });
        expect(res.status).toBe(409);
        expect((await res.json() as any).error).toContain('[ai] binding = "AI"');
    });

    it('garde le message de Workers AI quand il échoue', async () => {
        env.AI.run = async () => { throw new Error('daily free allocation exceeded'); };
        const res = await poster({ audio: AUDIO });
        expect(res.status).toBe(502);
        expect((await res.json() as any).error).toBe("Workers AI n'a pas transcrit le son : daily free allocation exceeded");
    });

    it('refuse ce qui n’est pas un son de taille raisonnable', async () => {
        expect((await poster({})).status).toBe(400);
        expect((await poster({ audio: 'court' })).status).toBe(400);
        expect((await poster({ audio: AUDIO, langue: 'français' })).status).toBe(400);
        const trop = await poster({ audio: 'A'.repeat(TRANSCRIPTION_BASE64_MAX + 1) });
        expect(trop.status).toBe(400);
        expect(appels).toHaveLength(0);
    });

    it('exige une session, comme tout le reste', async () => {
        const res = await app.fetch(new Request('https://api.test/api/transcription', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: AUDIO }),
        }), env);
        expect(res.status).toBe(401);
    });
});

describe('versTranscription', () => {
    it('répartit un segment sans mots sur sa durée, au prorata des lettres', () => {
        const t = versTranscription({ segments: [{ start: 2, end: 4, text: 'ab abcdef' }] });
        expect(t.mots.map(m => m.mot)).toEqual(['ab', 'abcdef']);
        expect(t.mots[0].debut).toBe(2);
        expect(t.mots[0].fin).toBeCloseTo(2.5);
        expect(t.mots[1].fin).toBeCloseTo(4);
        expect(t.duree).toBeNull();
    });

    it('écarte ce qui n’a ni mot ni instant', () => {
        const t = versTranscription({ segments: [{ start: 0, end: 1, words: [{ word: '  ', start: 0, end: 1 }, { word: 'oui', start: 'x', end: 1 }] }] });
        expect(t.mots).toEqual([]);
        expect(versTranscription(null)).toEqual({ mots: [], texte: '', duree: null });
    });
});
