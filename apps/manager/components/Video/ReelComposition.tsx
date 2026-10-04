import React from 'react';
import { AbsoluteFill, Img, Sequence, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/fonts';
import { Video } from '@remotion/media';
import type { MinutageReel, PlanDeMontage, ReelExplique, SequenceReel } from '@luminose/editorial';
import { DEFAULT_STYLE } from '@luminose/subtitles';
import { SceneLuminose, GAMME, FUTURA, CADRES, type ComposantImage, type FormatVideo } from './SceneLuminose';

/**
 * La composition Remotion d'un Reel expliqué (SPEC §12.4, étape V2).
 *
 * Elle ne fait qu'une chose : dire à `SceneLuminose` où en est chaque entrée à
 * l'image courante. La scène, la palette et la mise en page restent là-bas,
 * pour que le storyboard et la vidéo ne puissent pas diverger.
 */

export const FPS = 30;
export const CADRE = CADRES['9:16'];

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
    format?: FormatVideo;
};

/** L'`Img` de Remotion retient le rendu jusqu'au chargement ; il ne s'écrit pas comme un `img`. */
const ImageRemotion: ComposantImage = ({ src, alt, style }) => <Img src={src ?? ''} alt={alt} style={style} />;

export const SceneAnimee: React.FC<ProprietesScene> = ({ sequence, apparitions, visuels, format = '9:16' }) => {
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
                largeur={CADRES[format].largeur}
                entrees={{ titre: ressort(0), elements }}
                visuels={visuels}
                Image={ImageRemotion}
                arrondi={0}
                format={format}
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
    format?: FormatVideo;
};

export const dureeDuReel = (minutage: MinutageReel): number =>
    Math.max(1, enImages(minutage.duree + QUEUE_SECONDES));

export const dureeDeLaScene = (minutage: MinutageReel, sequence: number): number => {
    const m = minutage.sequences[sequence];
    return Math.max(1, enImages(m.fin - m.debut + QUEUE_SECONDES));
};

/** La vidéo entière, telle qu'elle se dira : chaque séquence à sa place, sans trou. */
export const CompositionReel: React.FC<ProprietesReel> = ({ data, minutage, visuels, format = '9:16' }) => (
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
                        ? <SceneAnimee sequence={sequence} apparitions={m.apparitions} visuels={visuels[i]} format={format} />
                        : <PlanCamera sequence={sequence} />}
                </Sequence>
            );
        })}
    </AbsoluteFill>
);

// ── Le rendu final (V4) ──────────────────────────────────────────────

/**
 * Un sous-titre face caméra, dans le style de l'outil Sous-titres (Futura gras,
 * blanc, ombre violette à 315°) et à sa hauteur : l'outil le pose 430 points
 * sous le centre d'un cadre vertical. La taille, elle, est celle de l'image —
 * 64 pixels du cadre, lisibles sur un téléphone.
 *
 * L'ombre est une seconde couche de texte, décalée, peinte AVANT le blanc : le
 * rendu dans le navigateur ne dessine pas `text-shadow`, et peint dans l'ordre
 * du document faute de `z-index`.
 */
const SousTitreCamera: React.FC<{ texte: string; format: FormatVideo }> = ({ texte, format }) => {
    const cadre = CADRES[format];
    const centre = format === '9:16' ? cadre.hauteur / 2 - DEFAULT_STYLE.positionY : cadre.hauteur * 0.74;
    const ombre = DEFAULT_STYLE.shadow;
    const angle = (ombre.angle * Math.PI) / 180;
    const dx = ombre.enabled ? ombre.distance * Math.cos(angle) : 0;
    const dy = ombre.enabled ? -ombre.distance * Math.sin(angle) : 0;
    const couche = (couleur: string, x: number, y: number): React.CSSProperties => ({
        position: 'absolute',
        left: 90 + x,
        right: 90 - x,
        top: centre - 80 + y,
        textAlign: 'center',
        fontFamily: FUTURA,
        fontWeight: DEFAULT_STYLE.bold ? 700 : 400,
        fontSize: 64,
        lineHeight: 1.2,
        color: couleur,
    });
    return (
        <AbsoluteFill>
            {ombre.enabled && <div style={{ ...couche(ombre.color, dx, dy), opacity: ombre.opacity / 100 }}>{texte}</div>}
            <div style={couche(DEFAULT_STYLE.fontColor, 0, 0)}>{texte}</div>
        </AbsoluteFill>
    );
};

export type ProprietesFinale = {
    data: ReelExplique;
    plan: PlanDeMontage;
    /** Les URL des fichiers de prise, dans ce navigateur. */
    sources: { principale?: string; accroche?: string };
    visuels: Record<number, Record<number, string>>;
    format: FormatVideo;
};

export const dureeDuPlan = (plan: PlanDeMontage): number => Math.max(1, enImages(plan.duree));

/**
 * La vidéo publiée : la prise, coupée comme le plan le dit ; par-dessus, chaque
 * scène à son heure ; et les sous-titres sur les passages face caméra. La voix
 * vient de la prise et ne s'interrompt jamais — une scène couvre l'image, pas
 * le son.
 */
export const CompositionFinale: React.FC<ProprietesFinale> = ({ data, plan, sources, visuels, format }) => (
    <AbsoluteFill style={{ backgroundColor: GAMME.violetNuit }}>
        {plan.segments.map((segment, i) => {
            const src = sources[segment.source];
            if (!src) return null;
            return (
                <Sequence key={`prise-${i}`} from={enImages(segment.a)} durationInFrames={Math.max(1, enImages(segment.jusqua - segment.depuis))}>
                    <Video src={src} trimBefore={enImages(segment.depuis)} objectFit="cover" style={{ width: '100%', height: '100%' }} />
                </Sequence>
            );
        })}
        {(data.sequences ?? []).map((sequence, i) => {
            const m = plan.minutage.sequences[i];
            if (sequence.plan !== 'scene' || !m) return null;
            const debut = enImages(m.debut);
            return (
                <Sequence key={`scene-${i}`} from={debut} durationInFrames={Math.max(1, enImages(m.fin) - debut)}>
                    <SceneAnimee sequence={sequence} apparitions={m.apparitions} visuels={visuels[i]} format={format} />
                </Sequence>
            );
        })}
        {plan.sousTitres.map((st, i) => (
            <Sequence key={`st-${i}`} from={enImages(st.debut)} durationInFrames={Math.max(1, enImages(st.fin - st.debut))}>
                <SousTitreCamera texte={st.texte} format={format} />
            </Sequence>
        ))}
    </AbsoluteFill>
);
