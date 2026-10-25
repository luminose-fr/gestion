/**
 * Transcription d'une prise vidéo, mot à mot (SPEC §12.5).
 *
 * Seul le SON arrive ici, extrait dans le navigateur : la vidéo ne quitte pas
 * le poste où elle se monte (§12.4). Workers AI le transcrit avec Whisper, et
 * la route rend les mots avec leurs instants — de quoi poser chaque carte d'une
 * scène sur le mot prononcé, et sous-titrer les passages face caméra.
 *
 * Deux moteurs (SPEC §12.5.6) : Whisper par défaut, Deepgram Nova-3 sur
 * demande — dix fois plus cher en neurones, réputé plus juste sur les instants.
 *
 * Pas de clé : Workers AI passe par une liaison du Worker (`AI`, dans
 * wrangler.toml), pas par un fournisseur du catalogue. Rien à poser dans
 * Réglages, rien qui puisse fuiter.
 *
 * 0 requête D1 ; un appel à Workers AI.
 */
import { Hono } from 'hono';
import { TranscriptionRequestSchema, type MoteurTranscription, type MotTranscrit, type Transcription } from '@luminose/shared';
import type { Env } from '../env';
import { Refus } from '../refus';

export const transcription = new Hono<{ Bindings: Env }>();

/** Le grand modèle, en version rapide : le français demande mieux que le modèle de base. */
export const MODELE_TRANSCRIPTION = '@cf/openai/whisper-large-v3-turbo';
export const MODELE_NOVA = '@cf/deepgram/nova-3';

const fini = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/**
 * La réponse de Whisper ramenée à des mots. Les segments portent d'ordinaire
 * leurs mots horodatés ; un segment qui n'en porte pas voit son texte réparti
 * sur sa durée, au prorata des lettres — une approximation, mais qui laisse le
 * calage retrouver ses repères plutôt que de perdre tout un passage.
 */
export function versTranscription(sortie: any): Transcription {
    const mots: MotTranscrit[] = [];
    for (const segment of Array.isArray(sortie?.segments) ? sortie.segments : []) {
        const horodates = (Array.isArray(segment?.words) ? segment.words : [])
            .filter((w: any) => typeof w?.word === 'string' && w.word.trim() && fini(w.start) && fini(w.end));
        if (horodates.length > 0) {
            for (const w of horodates) mots.push({ mot: w.word.trim(), debut: w.start, fin: w.end });
            continue;
        }
        const texte = typeof segment?.text === 'string' ? segment.text.trim() : '';
        if (!texte || !fini(segment?.start) || !fini(segment?.end)) continue;
        const morceaux: string[] = texte.split(/\s+/).filter(Boolean);
        const lettres = morceaux.reduce((n, m) => n + m.length, 0) || 1;
        let curseur = segment.start;
        for (const m of morceaux) {
            const duree = (segment.end - segment.start) * (m.length / lettres);
            mots.push({ mot: m, debut: curseur, fin: curseur + duree });
            curseur += duree;
        }
    }
    return {
        mots,
        texte: typeof sortie?.text === 'string' ? sortie.text.trim() : mots.map(m => m.mot).join(' '),
        duree: fini(sortie?.transcription_info?.duration) ? sortie.transcription_info.duration : null,
        moteur: 'whisper',
    };
}

/**
 * La réponse de Nova-3 ramenée à des mots : `results.channels[0].alternatives[0]`.
 * Avec la ponctuation demandée, chaque mot porte aussi sa forme ponctuée — celle
 * qu'on garde : le sous-titre lit « vous ? », pas « vous ».
 */
export function versTranscriptionNova(sortie: any): Transcription {
    const resultats = sortie?.results ?? sortie?.result?.results;
    const alternative = resultats?.channels?.[0]?.alternatives?.[0];
    const mots: MotTranscrit[] = (Array.isArray(alternative?.words) ? alternative.words : [])
        .map((w: any) => ({ mot: String(w?.punctuated_word ?? w?.word ?? '').trim(), debut: w?.start, fin: w?.end }))
        .filter((m: MotTranscrit) => m.mot && fini(m.debut) && fini(m.fin));
    const duree = sortie?.metadata?.duration ?? sortie?.result?.metadata?.duration;
    return {
        mots,
        texte: typeof alternative?.transcript === 'string' ? alternative.transcript.trim() : mots.map(m => m.mot).join(' '),
        duree: fini(duree) ? duree : null,
        moteur: 'nova-3',
    };
}

/** Le WAV arrive en base64 : Nova-3 le veut en flux d'octets. */
const enFlux = (base64: string): ReadableStream => {
    const binaire = atob(base64);
    const octets = new Uint8Array(binaire.length);
    for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
    return new Blob([octets]).stream();
};

/** Un moteur, un appel. Les deux rendent la même forme : le reste de la chaîne ne sait pas qui a transcrit. */
async function transcrireAvec(ai: Ai, moteur: MoteurTranscription, audio: string, langue: string): Promise<Transcription> {
    if (moteur === 'nova-3') {
        const sortie = await (ai as any).run(MODELE_NOVA, {
            audio: { body: enFlux(audio), contentType: 'audio/wav' },
            language: langue,
            punctuate: true,
        });
        return versTranscriptionNova(sortie);
    }
    const sortie = await ai.run(MODELE_TRANSCRIPTION, { audio, task: 'transcribe', language: langue });
    return versTranscription(sortie);
}

transcription.post('/', async (c) => {
    const input = TranscriptionRequestSchema.parse(await c.req.json());

    // Une liaison absente se corrige dans la configuration, pas dans la
    // requête : 409, et le message dit où.
    if (!c.env.AI) {
        throw new Refus(
            'La transcription passe par Workers AI, et la liaison « AI » manque à ce Worker : '
            + 'ajoutez [ai] binding = "AI" à workers/api/wrangler.toml, puis redéployez.',
            409,
        );
    }

    try {
        return c.json(await transcrireAvec(c.env.AI, input.moteur, input.audio, input.langue));
    } catch (e: any) {
        // Comme pour /api/ai/chat : une panne du fournisseur n'est pas une panne
        // du Worker. 502, et son message EN CLAIR — un quota épuisé se corrige,
        // « Erreur interne » ne se corrige pas.
        const qui = input.moteur === 'nova-3' ? 'Nova-3 (Workers AI)' : 'Workers AI';
        return c.json({ error: `${qui} n'a pas transcrit le son : ${e?.message ?? String(e)}` }, 502);
    }
});
