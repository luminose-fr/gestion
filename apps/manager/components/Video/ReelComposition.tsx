import React from 'react';
import { AbsoluteFill, Img, Sequence, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/fonts';
import { Audio, Video } from '@remotion/media';
import type { MinutageReel, PlanDeMontage, ReelExplique, SequenceReel, SousTitre } from '@luminose/editorial';
import { DEFAULT_STYLE } from '@luminose/subtitles';
import { SceneLuminose, CoupDePoingLuminose, GAMME, FUTURA, CADRES, type ComposantImage, type FormatVideo } from './SceneLuminose';
// Importées et non écrites en chemin : voir `POLICES`.
import futuraWoff2 from '../../fonts/5313918/7a337894-f253-4a5d-a63e-0d8275cedec5.woff2';
import abrilWoff2 from '../../fonts/5197317/e95ab4d7-0b64-43c7-88ec-c70de2273848.woff2';

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
 *
 * Les fichiers passent par un `import` et non par un chemin « /fonts/… » écrit en
 * dur (corrigé le 27/10/2026) : `fonts/` n'est pas dans `public/`, et le build ne
 * les copie — sous un nom haché, dans `/assets/` — que parce que le CSS ou un
 * import les cite. Le chemin brut marchait en développement et rendait, en
 * ligne, la page d'accueil en HTML, et l'export échouait avant la première
 * image (« Invalid font data in ArrayBuffer », et sous Safari « The string did
 * not match the expected pattern »).
 */
const POLICES = [
    { family: 'Futura LT', url: futuraWoff2 },
    { family: 'Abril Display', url: abrilWoff2, style: 'italic' },
];

let polices: Promise<unknown> | null = null;
/** Un échec n'est pas retenu : sans quoi l'export resterait en échec jusqu'au rechargement de la page. */
export const chargerPolices = (): Promise<unknown> =>
    polices ??= Promise.all(POLICES.map(p => loadFont({ ...p, format: 'woff2' })))
        .catch((e) => { polices = null; throw e; });

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

/** Le coup de poing se pose en un cinquième de seconde : assez pour se voir arriver, trop peu pour être une transition. */
const CoupAnime: React.FC<{ texte: string; format: FormatVideo }> = ({ texte, format }) => {
    const image = useCurrentFrame();
    const { fps } = useVideoConfig();
    const avancee = spring({ frame: image, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.2) });
    return (
        <AbsoluteFill>
            <CoupDePoingLuminose texte={texte} largeur={CADRES[format].largeur} avancee={avancee} format={format} arrondi={0} />
        </AbsoluteFill>
    );
};

/** Les coups de poing de la vidéo, chacun à son heure. Posés en dernier : ils couvrent tout, sous-titres compris. */
const Coups: React.FC<{ data: ReelExplique; minutage: MinutageReel; format: FormatVideo }> = ({ data, minutage, format }) => (
    <>
        {(data.sequences ?? []).map((sequence, i) => {
            const m = minutage.sequences[i];
            if (sequence.plan !== 'camera' || !sequence.coup || !m?.coup) return null;
            const debut = enImages(m.debut + m.coup.debut);
            return (
                <Sequence key={`coup-${i}`} from={debut} durationInFrames={Math.max(1, enImages(m.debut + m.coup.fin) - debut)}>
                    <CoupAnime texte={sequence.coup.texte} format={format} />
                </Sequence>
            );
        })}
    </>
);

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
        <Coups data={data} minutage={minutage} format={format} />
    </AbsoluteFill>
);

// ── Le rendu final (V4) ──────────────────────────────────────────────

/**
 * Un sous-titre face caméra, dans le style de l'outil Sous-titres (Futura gras,
 * blanc, ombre violette à 315°) et à sa hauteur : l'outil le pose 430 points
 * sous le centre d'un cadre vertical. La taille, elle, est celle de l'image —
 * 64 pixels du cadre, lisibles sur un téléphone.
 *
 * Le mot qui se dit passe en rose brumeux, la couleur de surlignage de la
 * marque (§12.5, v2.12), et le reste jusqu'au mot suivant. Seule la couleur
 * change : une autre police, ou une autre taille, ferait danser la ligne à
 * chaque mot.
 *
 * L'ombre est une seconde couche de texte, décalée, peinte AVANT le blanc : le
 * rendu dans le navigateur ne dessine pas `text-shadow`, et peint dans l'ordre
 * du document faute de `z-index`. Elle porte les mêmes mots, coupés pareil, pour
 * tomber exactement sous eux.
 */
const SousTitreCamera: React.FC<{ sousTitre: SousTitre; format: FormatVideo }> = ({ sousTitre, format }) => {
    const image = useCurrentFrame() + enImages(sousTitre.debut);
    const cadre = CADRES[format];
    const centre = format === '9:16' ? cadre.hauteur / 2 - DEFAULT_STYLE.positionY : cadre.hauteur * 0.74;
    const ombre = DEFAULT_STYLE.shadow;
    const angle = (ombre.angle * Math.PI) / 180;
    const dx = ombre.enabled ? ombre.distance * Math.cos(angle) : 0;
    const dy = ombre.enabled ? -ombre.distance * Math.sin(angle) : 0;
    const mots = sousTitre.mots?.length ? sousTitre.mots : [{ texte: sousTitre.texte, debut: sousTitre.debut, fin: sousTitre.fin }];
    let enCours = -1;
    mots.forEach((m, i) => { if (enImages(m.debut) <= image) enCours = i; });
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
    const ligne = (accent: string | null) => mots.map((m, i) => (
        <React.Fragment key={i}>
            {i > 0 && ' '}
            <span style={accent && i === enCours ? { color: accent } : undefined}>{m.texte}</span>
        </React.Fragment>
    ));
    return (
        <AbsoluteFill>
            {ombre.enabled && <div style={{ ...couche(ombre.color, dx, dy), opacity: ombre.opacity / 100 }}>{ligne(null)}</div>}
            <div style={couche(DEFAULT_STYLE.fontColor, 0, 0)}>{ligne(GAMME.roseBrumeux)}</div>
        </AbsoluteFill>
    );
};

/** Les réglages d'une prise (§12.5.7) : décalage du son (s, positif si le son arrive après les lèvres) et rotation (°). */
export type ReglageDePrise = { decalageSon: number; rotation: number };

export type ProprietesFinale = {
    data: ReelExplique;
    plan: PlanDeMontage;
    /** Les URL des fichiers de prise, dans ce navigateur. */
    sources: { principale?: string; accroche?: string };
    reglages?: { principale?: ReglageDePrise; accroche?: ReglageDePrise };
    visuels: Record<number, Record<number, string>>;
    format: FormatVideo;
};

export const dureeDuPlan = (plan: PlanDeMontage): number => Math.max(1, enImages(plan.duree));

/**
 * Le plan serré : assez pour qu'un raccord se lise comme un changement de plan
 * et non comme un visage qui saute, pas assez pour que l'image s'abîme — une
 * prise de téléphone en 1080 × 1920 supporte 12 % (§12.5.2).
 */
const ZOOM_SERRE = 1.12;

/**
 * Le micro-fondu d'un raccord (§12.5.4) : deux images, soixante-dix
 * millisecondes, pour que le son ne claque pas là où la coupe le tranche. Rien
 * au tout début ni à la toute fin : il n'y a pas de raccord à adoucir.
 */
const FONDU = 2;

const volumeDuMorceau = (rang: number, nombre: number, images: number) => (image: number): number => {
    const entree = rang > 0 ? Math.min(1, (image + 1) / (FONDU + 1)) : 1;
    const sortie = rang < nombre - 1 ? Math.min(1, (images - image) / (FONDU + 1)) : 1;
    return Math.max(0, Math.min(entree, sortie));
};

/**
 * Une image tournée d'un quart de tour garde le cadre plein : la boîte qu'on
 * tourne a les dimensions du cadre inversées, puis la vidéo la remplit
 * (`cover`). Une caméra montée à la verticale livre souvent une image couchée,
 * sans rien dans le fichier pour le dire (§12.5.7).
 */
const Pivot: React.FC<{ rotation: number; children: React.ReactNode }> = ({ rotation, children }) => {
    const { width, height } = useVideoConfig();
    if (!rotation) return <AbsoluteFill>{children}</AbsoluteFill>;
    const quart = rotation % 180 !== 0;
    return (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: quart ? height : width, height: quart ? width : height, flexShrink: 0, transform: `rotate(${rotation}deg)` }}>
                {children}
            </div>
        </AbsoluteFill>
    );
};

/**
 * La prise, au cadre que le plan dit à cet instant. Le zoom part d'un point
 * placé au tiers haut, où se trouve le visage dans un cadrage vertical : centré,
 * il couperait le haut de la tête.
 */
const PriseCadree: React.FC<{ cadrages: PlanDeMontage['cadrages']; children: React.ReactNode }> = ({ cadrages, children }) => {
    const image = useCurrentFrame();
    let serre = false;
    for (const c of cadrages ?? []) {
        if (enImages(c.a) > image) break;
        serre = c.serre;
    }
    return (
        <AbsoluteFill style={serre ? { transform: `scale(${ZOOM_SERRE})`, transformOrigin: '50% 35%' } : undefined}>
            {children}
        </AbsoluteFill>
    );
};

/**
 * La vidéo publiée : la prise, coupée comme le plan le dit ; par-dessus, chaque
 * scène à son heure ; et les sous-titres sur les passages face caméra. La voix
 * vient de la prise et ne s'interrompt jamais — une scène couvre l'image, pas
 * le son.
 */
export const CompositionFinale: React.FC<ProprietesFinale> = ({ data, plan, sources, reglages, visuels, format }) => (
    <AbsoluteFill style={{ backgroundColor: GAMME.violetNuit }}>
        <PriseCadree cadrages={plan.cadrages}>
            {plan.segments.map((segment, i) => {
                const src = sources[segment.source];
                if (!src) return null;
                // Bord à bord : chaque morceau commence à l'image où finit le précédent,
                // sans quoi l'arrondi laisserait une image noire ou deux voix superposées.
                const debut = enImages(segment.a);
                const fin = enImages(segment.a + segment.jusqua - segment.depuis);
                const images = Math.max(1, fin - debut);
                const reglage = reglages?.[segment.source];
                const decalage = reglage?.decalageSon ?? 0;
                const volume = volumeDuMorceau(i, plan.segments.length, images);
                // Le temps du montage est celui du SON : les mots, donc les coupes, en
                // viennent. Un son en retard sur les lèvres se corrige en avançant
                // l'image d'autant, le son restant où il est (§12.5.7).
                return (
                    <Sequence key={`prise-${i}`} from={debut} durationInFrames={images}>
                        <Pivot rotation={reglage?.rotation ?? 0}>
                            {decalage === 0 ? (
                                <Video src={src} trimBefore={enImages(segment.depuis)} volume={volume} objectFit="cover" style={{ width: '100%', height: '100%' }} />
                            ) : (
                                <>
                                    <Video src={src} muted trimBefore={enImages(Math.max(0, segment.depuis - decalage))} objectFit="cover" style={{ width: '100%', height: '100%' }} />
                                    <Audio src={src} trimBefore={enImages(segment.depuis)} volume={volume} />
                                </>
                            )}
                        </Pivot>
                    </Sequence>
                );
            })}
        </PriseCadree>
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
                <SousTitreCamera sousTitre={st} format={format} />
            </Sequence>
        ))}
        <Coups data={data} minutage={plan.minutage} format={format} />
    </AbsoluteFill>
);
