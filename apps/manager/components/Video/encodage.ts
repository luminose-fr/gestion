import { CustomVideoEncoder, EncodedPacket, registerEncoder, type VideoSample } from 'mediabunny';

/**
 * L'encodage H.264 de l'export, là où le navigateur le bloque (SPEC §12.4.1).
 *
 * Constaté le 27/10/2026 dans Safari 27.0.1 : un `VideoEncoder` H.264 en profil
 * Main ou High, en mode `latencyMode: 'quality'`, ne rend JAMAIS une image —
 * ni sortie, ni erreur, et `flush()` ne se résout pas. Le profil Baseline et le
 * mode `'realtime'` rendent tout. Remotion impose `'quality'` et Mediabunny
 * choisit le profil High : l'export restait à 0 %, sans un mot.
 *
 * La parade ne vise pas Safari par son nom : cinq images d'essai, en mode
 * qualité, au premier export. Si elles ne sortent pas, l'encodeur ci-dessous
 * prend la main pour le H.264 et encode en temps réel. Un navigateur qui les
 * rend garde le chemin de Mediabunny, éprouvé ; un Safari corrigé aussi.
 */

/** Une image H.264 sort en quelques dizaines de millisecondes : trois secondes, c'est qu'elle ne sortira pas. */
const DELAI_DE_LA_SONDE = 3000;

/** Au-delà, l'encodeur natif accumule des images que plus rien ne retient. */
const FILE_MAXIMALE = 4;

const attendre = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Une seule image passe : c'est à partir de la deuxième que Safari ne rend plus rien. */
const IMAGES_DE_LA_SONDE = 5;

/** Vrai si le mode qualité encode quelques images, jusqu'au bout, dans ce navigateur. */
export async function leModeQualiteRend(largeur: number, hauteur: number, delai = DELAI_DE_LA_SONDE): Promise<boolean> {
    const config: VideoEncoderConfig = { codec: 'avc1.640028', width: largeur, height: hauteur, bitrate: 5_000_000, framerate: 30 };
    // Non pris en charge : il n'y a rien à contourner, et Mediabunny dira lui-même ce qui manque.
    if (!(await VideoEncoder.isConfigSupported(config)).supported) return true;
    let rendues = 0;
    const encodeur = new VideoEncoder({ output: () => { rendues++; }, error: () => undefined });
    try {
        encodeur.configure(config);
        const toile = new OffscreenCanvas(largeur, hauteur);
        const ctx = toile.getContext('2d')!;
        for (let i = 0; i < IMAGES_DE_LA_SONDE; i++) {
            ctx.fillStyle = `hsl(${i * 60} 50% 50%)`;
            ctx.fillRect(0, 0, largeur, hauteur);
            const image = new VideoFrame(toile, { timestamp: Math.round(i * 1e6 / 30) });
            encodeur.encode(image, { keyFrame: i === 0 });
            image.close();
        }
        await Promise.race([encodeur.flush().catch(() => undefined), attendre(delai)]);
        return rendues === IMAGES_DE_LA_SONDE;
    } finally {
        if (encodeur.state !== 'closed') encodeur.close();
    }
}

/** Le H.264 de Mediabunny, à ceci près qu'il encode en temps réel. */
export class EncodeurTempsReel extends CustomVideoEncoder {
    private encodeur: VideoEncoder | null = null;

    /**
     * Le réglage par quantificateur, que Mediabunny essaie avant le débit quand on
     * lui en laisse le choix, est inconnu de Safari : sa configuration lève une
     * TypeError. Il passe donc son tour, et Mediabunny en vient au débit.
     */
    static override supports(codec: string, config: VideoEncoderConfig): boolean {
        return codec === 'avc' && config.bitrateMode !== 'quantizer';
    }

    init() {
        this.encodeur = new VideoEncoder({
            output: (morceau, meta) => this.onPacket(EncodedPacket.fromEncodedChunk(morceau), meta),
            error: e => this.onError(e),
        });
        this.encodeur.configure({ ...this.config, latencyMode: 'realtime' });
    }

    async encode(echantillon: VideoSample, options: VideoEncoderEncodeOptions) {
        const encodeur = this.encodeur!;
        const image = echantillon.toVideoFrame();
        encodeur.encode(image, options);
        image.close();
        // L'événement `dequeue` est le signal ; le minuteur, la garantie qu'on ne l'attend pas pour rien.
        while (encodeur.encodeQueueSize > FILE_MAXIMALE) {
            await new Promise<void>(resolve => {
                encodeur.addEventListener('dequeue', () => resolve(), { once: true });
                setTimeout(resolve, 50);
            });
        }
    }

    flush() {
        return this.encodeur!.flush();
    }

    close() {
        if (this.encodeur && this.encodeur.state !== 'closed') this.encodeur.close();
    }
}

let preparation: Promise<void> | null = null;

/**
 * À appeler avant le premier rendu. La sonde ne passe qu'une fois par page :
 * un navigateur ne change pas d'encodeur en cours de route.
 */
export const preparerEncodage = (largeur: number, hauteur: number): Promise<void> =>
    preparation ??= leModeQualiteRend(largeur, hauteur)
        .then((rend) => { if (!rend) registerEncoder(EncodeurTempsReel); })
        // Une sonde qui échoue ne tranche rien : l'export suit son chemin ordinaire, et dira ce qui ne va pas.
        .catch(() => undefined);
