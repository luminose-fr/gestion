import {
    ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Output, WavOutputFormat,
} from 'mediabunny';
import { encoderNiveaux, type Enveloppe } from '@luminose/editorial';

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
 * part jamais. Avec lui, son enveloppe (§12.5.4) : c'est elle qui dira où l'on
 * parle vraiment, là où Whisper étire ses mots sur les silences.
 */
export async function extraireLeSon(
    fichier: Blob,
    avancer: (part: number) => void = () => undefined,
): Promise<{ audio: string; enveloppe: Enveloppe }> {
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
        return { audio: enBase64(buffer), enveloppe: enveloppeDuWav(buffer) };
    } finally {
        input.dispose();
    }
}

/** Le pas de l'enveloppe : dix millisecondes, plus fin qu'une syllabe, assez gros pour rester léger. */
const PAS = 0.01;

/**
 * Le volume d'un WAV, en décibels, par pas de dix millisecondes (§12.5.4). On
 * lit l'en-tête plutôt que de le supposer : Mediabunny choisit le format des
 * échantillons, et un entier 16 bits n'est pas un flottant 32 bits. Seul le
 * premier canal compte — le son est extrait en mono.
 */
export function enveloppeDuWav(buffer: ArrayBuffer): Enveloppe {
    const vue = new DataView(buffer);
    const balise = (o: number) => String.fromCharCode(vue.getUint8(o), vue.getUint8(o + 1), vue.getUint8(o + 2), vue.getUint8(o + 3));
    if (vue.byteLength < 12 || !['RIFF', 'RF64'].includes(balise(0)) || balise(8) !== 'WAVE') {
        throw new Error("le son extrait n'est pas un WAV lisible.");
    }
    let format = 1, canaux = 1, frequence = 16_000, bits = 16, debut = -1, taille = 0;
    for (let o = 12; o + 8 <= vue.byteLength;) {
        const id = balise(o);
        const longueur = vue.getUint32(o + 4, true);
        if (id === 'fmt ') {
            format = vue.getUint16(o + 8, true);
            canaux = vue.getUint16(o + 10, true);
            frequence = vue.getUint32(o + 12, true);
            bits = vue.getUint16(o + 22, true);
            // WAVE_FORMAT_EXTENSIBLE : le vrai format est dans la sous-structure.
            if (format === 0xFFFE && longueur >= 26) format = vue.getUint16(o + 32, true);
        } else if (id === 'data') {
            debut = o + 8;
            // RF64, ou un WAV écrit d'un trait : la longueur peut manquer ; on lit jusqu'au bout.
            taille = longueur === 0xFFFFFFFF || debut + longueur > vue.byteLength ? vue.byteLength - debut : longueur;
            break;
        }
        o += 8 + longueur + (longueur % 2);
    }
    if (debut < 0) throw new Error("le son extrait n'a pas de données.");
    const octets = bits / 8;
    const parTrame = canaux * octets;
    const echantillon = (i: number): number => {
        const o = debut + i * parTrame;
        if (format === 3) return bits === 64 ? vue.getFloat64(o, true) : vue.getFloat32(o, true);
        if (bits === 16) return vue.getInt16(o, true) / 32768;
        if (bits === 8) return (vue.getUint8(o) - 128) / 128;
        if (bits === 24) return ((vue.getInt8(o + 2) << 16) | (vue.getUint8(o + 1) << 8) | vue.getUint8(o)) / 8388608;
        return vue.getInt32(o, true) / 2147483648;
    };
    const parPas = Math.max(1, Math.round(frequence * PAS));
    const nombre = Math.floor(Math.floor(taille / parTrame) / parPas);
    const decibels = new Float32Array(nombre);
    for (let k = 0; k < nombre; k++) {
        let somme = 0;
        for (let i = k * parPas; i < (k + 1) * parPas; i++) {
            const v = echantillon(i);
            somme += v * v;
        }
        decibels[k] = 20 * Math.log10(Math.sqrt(somme / parPas) + 1e-9);
    }
    return { pas: PAS, niveaux: encoderNiveaux(decibels) };
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
