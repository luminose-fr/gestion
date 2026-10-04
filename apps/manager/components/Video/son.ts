import {
    ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Output, WavOutputFormat,
} from 'mediabunny';

/**
 * Lire une prise et en extraire le son, dans le navigateur (SPEC §12.5).
 *
 * Mediabunny lit le conteneur par morceaux : une prise de plusieurs centaines de
 * mégaoctets ne se charge jamais en entier en mémoire, et le .mov que Final Cut
 * exporte se lit comme un .mp4. C'est la même bibliothèque qu'utilise le rendu
 * de Remotion — rien de plus à faire entrer dans le navigateur.
 */

export interface Metadonnees {
    /** En secondes. */
    duree: number;
    largeur: number;
    hauteur: number;
}

/**
 * Ce qu'il faut savoir d'une prise avant de la garder : sa durée, son cadre,
 * et qu'elle se décode ICI. Le rendu se fait dans ce navigateur : une prise
 * qu'il ne sait pas décoder doit être refusée au dépôt, pas à l'export.
 */
export async function lireLaPrise(fichier: Blob): Promise<Metadonnees> {
    const input = new Input({ source: new BlobSource(fichier), formats: ALL_FORMATS });
    try {
        const video = await input.getPrimaryVideoTrack();
        if (!video) throw new Error("ce fichier n'a pas de piste vidéo.");
        if (!(await input.getPrimaryAudioTrack())) throw new Error("ce fichier n'a pas de son : sans voix, rien à caler.");
        if (!(await video.canDecode())) {
            throw new Error(`ce navigateur ne sait pas décoder cette vidéo (${video.codec ?? 'codec inconnu'}) : exportez-la en H.264 depuis Final Cut.`);
        }
        return { duree: await input.computeDuration(), largeur: video.displayWidth, hauteur: video.displayHeight };
    } finally {
        input.dispose();
    }
}

/** Assez pour Whisper, qui travaille en 16 kHz mono : au-delà, on enverrait du poids pour rien. */
const FREQUENCE = 16_000;

/**
 * Le son de la prise, en WAV mono 16 kHz, encodé en base64 pour la route de
 * transcription. Une minute pèse environ deux mégaoctets — la vidéo, elle, ne
 * part jamais.
 */
export async function extraireLeSon(fichier: Blob, avancer: (part: number) => void = () => undefined): Promise<string> {
    const input = new Input({ source: new BlobSource(fichier), formats: ALL_FORMATS });
    try {
        const output = new Output({ format: new WavOutputFormat(), target: new BufferTarget() });
        const conversion = await Conversion.init({
            input,
            output,
            video: { discard: true },
            audio: { numberOfChannels: 1, sampleRate: FREQUENCE },
        });
        if (!conversion.isValid) {
            const raisons = conversion.discardedTracks.map(d => d.reason).join(', ');
            throw new Error(`le son de la prise ne s'extrait pas (${raisons || 'aucune piste son'}).`);
        }
        conversion.onProgress = avancer;
        await conversion.execute();
        const buffer = output.target.buffer;
        if (!buffer) throw new Error("l'extraction du son n'a rien produit.");
        return enBase64(buffer);
    } finally {
        input.dispose();
    }
}

/** Par tranches : `String.fromCharCode(...octets)` sur deux mégaoctets d'un coup ferait déborder la pile. */
function enBase64(buffer: ArrayBuffer): string {
    const octets = new Uint8Array(buffer);
    const TRANCHE = 0x8000;
    let binaire = '';
    for (let i = 0; i < octets.length; i += TRANCHE) {
        binaire += String.fromCharCode(...octets.subarray(i, i + TRANCHE));
    }
    return btoa(binaire);
}
