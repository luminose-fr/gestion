import React from 'react';
import { AbsoluteFill, Img, Sequence, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/fonts';
import type { MinutageReel, ReelExplique, SequenceReel } from '@luminose/editorial';
import { SceneLuminose, GAMME, FUTURA, type ComposantImage } from './SceneLuminose';

/**
 * La composition Remotion d'un Reel expliqué (SPEC §12.4, étape V2).
 *
 * Elle ne fait qu'une chose : dire à `SceneLuminose` où en est chaque entrée à
 * l'image courante. La scène, la palette et la mise en page restent là-bas,
 * pour que le storyboard et la vidéo ne puissent pas diverger.
 */

export const FPS = 30;
export const CADRE = { largeur: 1080, hauteur: 1920 } as const;

/** Une demi-seconde après la dernière syllabe : une vidéo qui coupe sur le mot paraît tronquée. */
const QUEUE_SECONDES = 0.5;

/**
 * Les polices de la marque, les MÊMES fichiers que `index.css`. Le rendu dans
 * le navigateur dessine le texte lui-même : il faut qu'elles soient chargées
 * avant la première image, et `loadFont` retient le rendu jusque-là.
 */
const POLICES = [
    { family: 'Futura LT', url: '/fonts/5313918/7a337894-f253-4a5d-a63e-0d8275cedec5.woff2' },
    { family: 'Abril Display', url: '/fonts/5197317/e95ab4d7-0b64-43c7-88ec-c70de2273848.woff2', style: 'italic' },
];

let polices: Promise<unknown> | null = null;
export const chargerPolices = (): Promise<unknown> =>
    polices ??= Promise.all(POLICES.map(p => loadFont({ ...p, format: 'woff2' })));

export const enImages = (secondes: number): number => Math.round(secondes * FPS);

/**
 * Une scène animée. La pédagogie se pose — un ressort amorti, sans rebond ;
 * l'humour rebondit. Un élément dont le repère est introuvable entre une
 * seconde avant la fin : le storyboard a déjà dit qu'il fallait le corriger.
 */
// Des alias et non des interfaces : Remotion exige des props assignables à
// `Record<string, unknown>`, ce qu'une interface n'est pas (pas de signature d'index).
export type ProprietesScene = {
    sequence: SequenceReel;
    /** Secondes depuis le début de la scène, ou `null` (voir `minuterReel`). */
    apparitions: Array<number | null>;
    visuels?: Record<number, string>;
};

/** L'`Img` de Remotion retient le rendu jusqu'au chargement ; il ne s'écrit pas comme un `img`. */
const ImageRemotion: ComposantImage = ({ src, alt, style }) => <Img src={src ?? ''} alt={alt} style={style} />;

export const SceneAnimee: React.FC<ProprietesScene> = ({ sequence, apparitions, visuels }) => {
    const image = useCurrentFrame();
    const { fps, durationInFrames } = useVideoConfig();
    const humour = sequence.registre === 'humour';

    const ressort = (depart: number) => image < depart ? 0 : spring({
        frame: image - depart,
        fps,
        config: humour ? { damping: 9, stiffness: 140, mass: 0.7 } : { damping: 200 },
        durationInFrames: humour ? undefined : Math.round(fps * 0.45),
    });

    const elements = (sequence.elements ?? []).map((_, i) => {
        const a = apparitions[i];
        return ressort(a === null || a === undefined ? Math.max(0, durationInFrames - fps) : Math.round(a * fps));
    });

    return (
        <AbsoluteFill>
            <SceneLuminose
                sequence={sequence}
                largeur={CADRE.largeur}
                entrees={{ titre: ressort(0), elements }}
                visuels={visuels}
                Image={ImageRemotion}
                arrondi={0}
            />
        </AbsoluteFill>
    );
};

/**
 * Un passage face caméra, en attendant la prise (V3) : on lit ce qui s'y dit,
 * au rythme où ça se dira. C'est ce qui permet de juger l'alternance avant de
 * tourner.
 */
const PlanCamera: React.FC<{ sequence: SequenceReel }> = ({ sequence }) => (
    <AbsoluteFill style={{
        backgroundColor: GAMME.violetNuit,
        color: GAMME.ivoire,
        fontFamily: FUTURA,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 48,
        padding: '0 110px',
        textAlign: 'center',
    }}>
        <div style={{ fontSize: 34, letterSpacing: 6, textTransform: 'uppercase', color: GAMME.roseBrumeux }}>
            Face caméra{sequence.role ? ` · ${sequence.role}` : ''}
        </div>
        <div style={{ fontSize: 60, lineHeight: 1.3 }}>{sequence.voix}</div>
    </AbsoluteFill>
);

export type ProprietesReel = {
    data: ReelExplique;
    minutage: MinutageReel;
    /** Les visuels de chaque scène, par rang de séquence puis d'élément. */
    visuels: Record<number, Record<number, string>>;
};

export const dureeDuReel = (minutage: MinutageReel): number =>
    Math.max(1, enImages(minutage.duree + QUEUE_SECONDES));

export const dureeDeLaScene = (minutage: MinutageReel, sequence: number): number => {
    const m = minutage.sequences[sequence];
    return Math.max(1, enImages(m.fin - m.debut + QUEUE_SECONDES));
};

/** La vidéo entière, telle qu'elle se dira : chaque séquence à sa place, sans trou. */
export const CompositionReel: React.FC<ProprietesReel> = ({ data, minutage, visuels }) => (
    <AbsoluteFill style={{ backgroundColor: GAMME.ivoire }}>
        {(data.sequences ?? []).map((sequence, i) => {
            const m = minutage.sequences[i];
            if (!m) return null;
            const debut = enImages(m.debut);
            // La dernière séquence garde la queue : sans elle, la vidéo finit sur un écran vide.
            const fin = i === data.sequences.length - 1 ? enImages(m.fin + QUEUE_SECONDES) : enImages(m.fin);
            return (
                <Sequence key={i} from={debut} durationInFrames={Math.max(1, fin - debut)}>
                    {sequence.plan === 'scene'
                        ? <SceneAnimee sequence={sequence} apparitions={m.apparitions} visuels={visuels[i]} />
                        : <PlanCamera sequence={sequence} />}
                </Sequence>
            );
        })}
    </AbsoluteFill>
);
