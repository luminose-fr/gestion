import React, { useLayoutEffect, useRef, useState } from 'react';
import {
    segmentsSurlignes, texteAffiche, schemaDe, illustrationDe, visuelDecrit, arriveesDeLaListe,
    type CadrageIllustration, type ElementScene, type SchemaEcran, type SequenceReel,
} from '@luminose/editorial';

/**
 * Une scène de Reel expliqué, à l'habillage Luminose (SPEC §12.2).
 *
 * Elle se dessine dans le cadre de la vidéo — 1080 × 1920, en pixels du cadre,
 * en styles en ligne — puis se réduit à la largeur demandée. Ce n'est pas de
 * l'interface : les échelles de DESIGN.md ne s'y appliquent pas, la palette de
 * `voix/direction-artistique.md` §1-2, si.
 *
 * Une scène montre UN écran à la fois (v2.26) : un visuel en grand, de un à
 * quatre mots, sur le fond de son ton — l'écran suivant le remplace, rien ne
 * s'empile. Décision de Florent, le 28/10/2026, devant la première vidéo
 * exportée : « beaucoup trop d'infos, et donc pas percutant ».
 *
 * Le composant ne connaît pas Remotion. Le storyboard montre un écran à l'arrêt,
 * dans son état final ; la composition animée (`ReelComposition`) lui dit quel
 * écran est en cours, où en est son entrée, et lui prête son composant d'image.
 * C'est ce qui garde Remotion hors du paquet principal.
 *
 * **Ce que le rendu dans le navigateur sait dessiner** (`@remotion/web-renderer`)
 * borne ce qu'on écrit ici : ni `radial-gradient`, ni `visibility`, ni
 * `z-index`. Le fond pointillé est donc une image SVG, et un élément pas encore
 * apparu est transparent plutôt que caché.
 */

/**
 * Les deux cadres de sortie (SPEC §12.4). Le 4:5 est le fil Meta : on y
 * RECOMPOSE la scène dans un cadre plus court, on ne recadre pas le 9:16.
 */
export type FormatVideo = '9:16' | '4:5';
export const CADRES: Record<FormatVideo, { largeur: number; hauteur: number }> = {
    '9:16': { largeur: 1080, hauteur: 1920 },
    '4:5': { largeur: 1080, hauteur: 1350 },
};

/**
 * La zone sûre. En 9:16, l'interface des Reels et des Shorts recouvre le bas de
 * l'image (légende, nom, musique) et le bord droit (les boutons) : les cartes
 * restent au-dessus des trois quarts de la hauteur, comme dans la référence.
 * Le fil, en 4:5, ne recouvre presque rien : on n'y garde qu'une marge.
 */
const ZONES: Record<FormatVideo, { haut: number; gauche: number; droite: number; bas: number }> = {
    '9:16': { haut: 170, gauche: 90, droite: 90, bas: 1440 },
    '4:5': { haut: 100, gauche: 90, droite: 90, bas: 1250 },
};

/** La gamme des illustrations du site, de la lumière à l'ombre. */
export const GAMME = {
    ivoire: '#FDEEE1',
    ivoireRose: '#FBE2D5',
    roseBrumeux: '#E9B9BB',
    mauveRose: '#C98FA5',
    mauve: '#9A688E',
    prune: '#634575',
    violetNuit: '#3C3061',
};

export const FUTURA = "'Futura LT', Futura, 'Century Gothic', sans-serif";
export const ABRIL = "'Abril Display', Georgia, serif";

/** Le fond pointillé, à la taille exacte du cadre : étiré, un point deviendrait une ellipse. */
const pointilles = (format: FormatVideo) => `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CADRES[format].largeur}" height="${CADRES[format].hauteur}">`
    + '<defs><pattern id="p" width="54" height="54" patternUnits="userSpaceOnUse">'
    + `<circle cx="27" cy="27" r="3" fill="${GAMME.mauve}" fill-opacity="0.18"/></pattern></defs>`
    + '<rect width="100%" height="100%" fill="url(#p)"/></svg>',
)}`;

type Ton = 'ombre' | 'lumiere' | 'neutre';

/**
 * Le ton fait le fond de tout l'écran : passer de l'ombre à la lumière se voit
 * d'un coup — c'est la bascule, et c'est la rupture de fond de la seconde
 * référence. L'ombre est littéralement sombre, la lumière claire : deux symboles
 * que la direction artistique porte déjà.
 */
const ECRANS: Record<Ton, { fond: string; texte: string; accent: string; marque: string; trait: string; remplissage: string; pointilles: boolean }> = {
    ombre:   { fond: GAMME.violetNuit, texte: GAMME.ivoire,     accent: GAMME.roseBrumeux, marque: 'transparent',   trait: GAMME.mauve,     remplissage: GAMME.roseBrumeux, pointilles: false },
    lumiere: { fond: GAMME.ivoireRose, texte: GAMME.violetNuit, accent: GAMME.prune,       marque: GAMME.roseBrumeux, trait: GAMME.mauveRose, remplissage: GAMME.mauveRose,   pointilles: true },
    neutre:  { fond: GAMME.ivoire,     texte: GAMME.violetNuit, accent: GAMME.prune,       marque: GAMME.roseBrumeux, trait: GAMME.mauve,     remplissage: GAMME.mauve,       pointilles: true },
};
type Palette = (typeof ECRANS)[Ton];

/** Une carte d'un schéma — un terme d'une opposition, le départ d'un enchaînement. */
const CARTES: Record<'ombre' | 'lumiere', { fond: string; texte: string; bord: string; portee: string }> = {
    ombre:   { fond: GAMME.violetNuit, texte: GAMME.ivoire,     bord: GAMME.mauve,     portee: GAMME.prune },
    lumiere: { fond: GAMME.ivoireRose, texte: GAMME.violetNuit, bord: GAMME.mauveRose, portee: GAMME.mauveRose },
};

/** Le modèle écrit parfois « lumière » : un accent ne doit pas faire perdre le ton. */
const tonDe = (valeur: unknown): Ton => {
    const cle = String(valeur ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return cle === 'ombre' || cle === 'lumiere' ? cle : 'neutre';
};

/**
 * Comment un écran entre, selon le registre de la scène. `p` va de 0 à 1 et
 * peut dépasser 1 : un ressort qui rebondit, c'est l'humour. La pédagogie se
 * pose sans rebond ; l'humour arrive de travers et se redresse.
 */
function entree(p: number, registre: SequenceReel['registre']): React.CSSProperties {
    if (p >= 1 && registre !== 'humour') return {};
    if (registre === 'humour') {
        return {
            opacity: Math.min(1, Math.max(0, p * 1.6)),
            transform: `scale(${0.7 + 0.3 * p}) rotate(${(1 - p) * -6}deg)`,
        };
    }
    return { opacity: Math.max(0, p), transform: `translateY(${(1 - p) * 60}px)` };
}

/** Un composant d'image : `img` à l'arrêt, celui de Remotion dans la composition. */
export type ComposantImage = React.ComponentType<React.ImgHTMLAttributes<HTMLImageElement>>;

/** Le passage surligné passe en Abril italique : les deux typographies de la marque. */
const TexteSurligne: React.FC<{ texte?: string | null; accent: string; marque: string }> = ({ texte, accent, marque }) => (
    <>
        {segmentsSurlignes(texte).map((s, i) => s.surligne ? (
            <span key={i} style={{
                fontFamily: ABRIL,
                fontStyle: 'italic',
                // L'Abril reste en bas de casse, même dans un texte en capitales : c'est elle qui fait l'accent.
                textTransform: 'none',
                color: accent,
                padding: '0 6px',
                backgroundImage: marque === 'transparent'
                    ? 'none'
                    : `linear-gradient(transparent 60%, ${marque} 60%, ${marque} 92%, transparent 92%)`,
            }}>{s.texte}</span>
        ) : <span key={i}>{s.texte}</span>)}
    </>
);

/** Une progression qui ralentit en arrivant : ce qui monte se pose, ne cogne pas. */
const pose = (ecoule: number, depart: number, duree: number) => {
    const x = Math.min(1, Math.max(0, (ecoule - depart) / duree));
    return 1 - (1 - x) ** 3;
};

/**
 * Où regarder dans l'illustration : l'écran zoome sur la zone que la description
 * a nommée. Le zoom s'ancre au BORD de la zone — en haut, le bord haut reste en
 * place —, sans quoi un point ancré au dixième laissait filer le détail visé.
 */
const CADRAGE: Record<CadrageIllustration, { origine: string; zoom: number }> = {
    ensemble: { origine: '50% 50%', zoom: 1 },
    haut:     { origine: '50% 0%', zoom: 1.5 },
    bas:      { origine: '50% 100%', zoom: 1.5 },
    gauche:   { origine: '0% 50%', zoom: 1.5 },
    droite:   { origine: '100% 50%', zoom: 1.5 },
    centre:   { origine: '50% 50%', zoom: 1.5 },
};

/** Ce qu'un visuel attend et n'a pas encore : le storyboard le dit, la vidéo jamais. */
const Gabarit: React.FC<{ hauteur: number; couleur: string; nature: string; description?: string }> = ({ hauteur, couleur, nature, description }) => (
    <div style={{
        width: '100%', height: hauteur, borderRadius: 40, border: `5px dashed ${couleur}`, color: couleur,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22,
        padding: '0 64px', textAlign: 'center', opacity: 0.85,
    }}>
        <span style={{ fontSize: 34, letterSpacing: 4, textTransform: 'uppercase' }}>{nature}</span>
        {description && <span style={{ fontSize: 38, lineHeight: 1.3 }}>{description}</span>}
    </div>
);

/** Une image de l'écran : déposée, ou l'illustration du Reel au cadrage voulu — qui s'avance lentement. */
const ImageCadree: React.FC<{ url: string; hauteur: number; palette: Palette; cadrage?: CadrageIllustration | null; avance: number; Image: ComposantImage }> = ({ url, hauteur, palette, cadrage, avance, Image }) => {
    const { origine, zoom } = CADRAGE[cadrage && CADRAGE[cadrage] ? cadrage : 'ensemble'];
    return (
        <div style={{ width: '100%', height: hauteur, borderRadius: 40, overflow: 'hidden', border: `6px solid ${palette.trait}` }}>
            <Image
                src={url}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transform: `scale(${zoom * (1 + 0.06 * avance)})`, transformOrigin: origine }}
            />
        </div>
    );
};

const CarteDeSchema: React.FC<{ texte: string; ton: 'ombre' | 'lumiere'; style?: React.CSSProperties }> = ({ texte, ton, style }) => {
    const c = CARTES[ton];
    return (
        <div style={{
            background: c.fond, color: c.texte, border: `6px solid ${c.bord}`, borderRadius: 40, boxShadow: `12px 12px 0 ${c.portee}`,
            padding: '40px 56px', fontSize: 86, lineHeight: 1.12, textAlign: 'center', minWidth: 520, maxWidth: '100%', ...style,
        }}>
            <TexteSurligne texte={texte} accent={ton === 'ombre' ? GAMME.roseBrumeux : GAMME.prune} marque={ton === 'ombre' ? 'transparent' : GAMME.roseBrumeux} />
        </div>
    );
};

/** Une flèche vers le bas, en traits : le moteur de rendu ne dessine ni triangle en bordures ni glyphe garanti. */
const Fleche: React.FC<{ couleur: string; part: number }> = ({ couleur, part }) => (
    <div style={{ position: 'relative', width: 120, height: 170, opacity: part }}>
        <div style={{ position: 'absolute', left: 54, top: 0, width: 12, height: 160 * part, background: couleur, borderRadius: 6 }} />
        <div style={{ position: 'absolute', left: 30, top: 108, width: 12, height: 72, background: couleur, borderRadius: 6, transform: 'rotate(-40deg)', transformOrigin: '50% 100%' }} />
        <div style={{ position: 'absolute', left: 78, top: 108, width: 12, height: 72, background: couleur, borderRadius: 6, transform: 'rotate(40deg)', transformOrigin: '50% 100%' }} />
    </div>
);

/**
 * Les schémas que l'outil dessine et anime (v2.26) : rien à produire, rien à
 * déposer. En traits et en blocs plutôt qu'en SVG : c'est ce que le rendu dans
 * le navigateur sait peindre. `ecoule` vaut l'infini à l'arrêt — l'état final.
 */
const Schema: React.FC<{ schema: SchemaEcran; hauteur: number; palette: Palette; ecoule: number; duree: number }> = ({ schema, hauteur, palette, ecoule, duree }) => {
    switch (schema.schema) {
        case 'niveau': {
            const niveau = schema.de + (schema.a - schema.de) * pose(ecoule, 0.2, 1.6);
            return (
                <div style={{ width: 400, height: hauteur, border: `12px solid ${palette.trait}`, borderRadius: 56, position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${Math.max(0, Math.min(100, niveau))}%`, background: palette.remplissage }} />
                    {[25, 50, 75].map(g => (
                        <div key={g} style={{ position: 'absolute', left: 0, width: 70, bottom: `${g}%`, height: 8, background: palette.trait }} />
                    ))}
                </div>
            );
        }
        case 'compteur': {
            const valeur = schema.valeur * pose(ecoule, 0.1, 1.2);
            const entier = Number.isInteger(schema.valeur);
            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: 360, fontWeight: 700, lineHeight: 1, color: palette.texte }}>
                        {(entier ? Math.round(valeur) : valeur).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
                    </div>
                    {schema.unite && (
                        <div style={{ fontFamily: ABRIL, fontStyle: 'italic', fontSize: 120, lineHeight: 1.1, color: palette.accent }}>{texteAffiche(schema.unite)}</div>
                    )}
                </div>
            );
        }
        case 'opposition':
            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 36 }}>
                    <CarteDeSchema texte={schema.gauche} ton="ombre" />
                    <div style={{ fontFamily: ABRIL, fontStyle: 'italic', fontSize: 130, lineHeight: 1, color: palette.accent, opacity: pose(ecoule, 0.4, 0.25) }}>vs</div>
                    <CarteDeSchema texte={schema.droite} ton="lumiere" style={{ opacity: pose(ecoule, 0.7, 0.3) }} />
                </div>
            );
        case 'enchainement':
            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
                    <CarteDeSchema texte={schema.de} ton="ombre" />
                    <Fleche couleur={palette.accent} part={pose(ecoule, 0.35, 0.4)} />
                    <CarteDeSchema texte={schema.vers} ton="lumiere" style={{ opacity: pose(ecoule, 0.8, 0.3) }} />
                </div>
            );
        case 'liste': {
            const arrivees = arriveesDeLaListe((schema.items ?? []).length, duree);
            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 48, width: '100%' }}>
                    {(schema.items ?? []).map((item, k) => {
                        const arrivee = arrivees[k];
                        return (
                            <div key={k} style={{
                                position: 'relative', border: `8px solid ${palette.trait}`, borderRadius: 999, padding: '40px 64px',
                                fontSize: 100, lineHeight: 1.15, textAlign: 'center', color: palette.texte, opacity: pose(ecoule, arrivee, 0.25),
                            }}>
                                <TexteSurligne texte={item} accent={palette.accent} marque={palette.marque} />
                                {schema.barres && (
                                    <div style={{ position: 'absolute', left: 40, top: '50%', height: 10, marginTop: -5, borderRadius: 5, background: palette.accent, width: `calc(${pose(ecoule, arrivee + 0.35, 0.3) * 100}% - 80px)` }} />
                                )}
                            </div>
                        );
                    })}
                </div>
            );
        }
        default:
            return null;
    }
};

const ImageSimple: ComposantImage = (props) => <img {...props} />;

/** Ce que la composition animée dit de l'écran en cours. */
export interface EcranAnime {
    ecran: number;
    /** L'avancée de son entrée, de 0 à 1 (au-delà : un rebond). */
    entree: number;
    /** Depuis combien de secondes il est là, et pour combien en tout. */
    ecoule: number;
    duree: number;
}

export interface SceneLuminoseProps {
    sequence: SequenceReel;
    /** Largeur d'affichage, en pixels ; la hauteur suit le cadre. */
    largeur: number;
    /** L'écran montré à l'arrêt, dans son état final — le premier par défaut. Ignoré quand `anime` est fourni. */
    ecran?: number;
    anime?: EcranAnime;
    /** Les images déposées carte par carte, avant la v2.26, par rang d'écran. */
    visuels?: Record<number, string | undefined>;
    /** Les illustrations du Reel, par id : leur image si elle est là, leur description pour le storyboard. */
    illustrations?: Record<string, { url?: string; description?: string } | undefined>;
    Image?: ComposantImage;
    /** Les coins arrondis de la miniature ; 0 dans la vidéo elle-même. */
    arrondi?: number;
    format?: FormatVideo;
    /**
     * Un visuel sans image montre sa description dans un cadre pointillé : c'est
     * la commande, à sa place dans le storyboard. La vidéo, elle, ne la montre
     * jamais — le 28/10/2026, trois descriptions de 45 mots sont sorties telles
     * quelles dans un export. Sans gabarit, l'écran garde son texte et perd
     * l'image qui lui manque.
     */
    gabarits?: boolean;
}

export const SceneLuminose: React.FC<SceneLuminoseProps> = ({
    sequence, largeur, ecran: ecranFixe = 0, anime, visuels, illustrations, Image = ImageSimple, arrondi = 8, format = '9:16', gabarits = true,
}) => {
    const CADRE = CADRES[format];
    const ZONE = ZONES[format];
    const contenuRef = useRef<HTMLDivElement>(null);
    const [reduction, setReduction] = useState(1);
    const elements = sequence.elements ?? [];
    const rang = Math.min(Math.max(0, anime?.ecran ?? ecranFixe), Math.max(0, elements.length - 1));
    const element: ElementScene | undefined = elements[rang];
    const palette = ECRANS[tonDe(element?.ton)];
    const ecoule = anime ? anime.ecoule : Infinity;
    const avance = anime ? Math.min(1, anime.ecoule / Math.max(anime.duree, 0.5)) : 0;

    const hauteurZone = ZONE.bas - ZONE.haut;
    const texte = texteAffiche(element?.texte);
    const liaison = element?.type === 'liaison';

    // Le visuel de l'écran : un schéma, l'illustration du Reel, ou l'image déposée d'avant la v2.26.
    const schema = schemaDe(element?.visuel);
    const illustre = illustrationDe(element?.visuel);
    const decrit = visuelDecrit(element?.visuel);
    const hauteurVisuel = Math.round(Math.min(1000, hauteurZone * (texte ? 0.62 : 0.85)));
    let visuel: React.ReactNode = null;
    if (schema) visuel = <Schema schema={schema} hauteur={Math.round(hauteurVisuel * 0.9)} palette={palette} ecoule={ecoule} duree={anime?.duree ?? 3} />;
    else if (illustre) {
        const ill = illustrations?.[illustre.illustration];
        if (ill?.url) visuel = <ImageCadree url={ill.url} hauteur={hauteurVisuel} palette={palette} cadrage={illustre.cadrage} avance={avance} Image={Image} />;
        else if (gabarits) visuel = <Gabarit hauteur={hauteurVisuel} couleur={palette.texte} nature={`Illustration « ${illustre.illustration} »${illustre.cadrage && illustre.cadrage !== 'ensemble' ? ` · ${illustre.cadrage}` : ''}`} description={ill?.description} />;
    } else if (decrit) {
        const url = visuels?.[rang];
        if (url) visuel = <ImageCadree url={url} hauteur={hauteurVisuel} palette={palette} avance={avance} Image={Image} />;
        else if (gabarits) visuel = <Gabarit hauteur={hauteurVisuel} couleur={palette.texte} nature={decrit.nature === 'schema' ? 'Schéma' : 'Illustration'} description={decrit.description} />;
    }

    /*
     * Un écran chargé peut dépasser la zone sûre — en 4:5 surtout. Plutôt que de
     * couper, on le réduit d'un bloc : les proportions voulues restent les mêmes.
     */
    useLayoutEffect(() => {
        const contenu = contenuRef.current;
        if (!contenu) return;
        const mesurer = () => {
            const hauteur = contenu.scrollHeight;
            setReduction(hauteur > hauteurZone ? hauteurZone / hauteur : 1);
        };
        mesurer();
        // Les polices de la marque arrivent après le premier rendu, et changent les hauteurs.
        document.fonts?.ready.then(mesurer).catch(() => undefined);
    }, [sequence, rang, visuels, illustrations, format, hauteurZone]);

    const echelle = largeur / CADRE.largeur;

    return (
        <div
            role="img"
            aria-label={`Scène, écran ${rang + 1} : ${texte || 'visuel'}`}
            style={{ width: largeur, height: Math.round(largeur * CADRE.hauteur / CADRE.largeur), overflow: 'hidden', borderRadius: arrondi, flexShrink: 0 }}
        >
            <div style={{
                width: CADRE.largeur,
                height: CADRE.hauteur,
                transform: `scale(${echelle})`,
                transformOrigin: 'top left',
                position: 'relative',
                fontFamily: FUTURA,
                color: palette.texte,
                backgroundColor: palette.fond,
            }}>
                {palette.pointilles && <Image src={pointilles(format)} alt="" style={{ position: 'absolute', top: 0, left: 0, width: CADRE.largeur, height: CADRE.hauteur }} />}
                <div style={{ position: 'absolute', top: ZONE.haut, left: ZONE.gauche, right: ZONE.droite, height: hauteurZone, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div
                        ref={contenuRef}
                        style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 64, width: '100%',
                            transform: `scale(${reduction})`, transformOrigin: 'center center',
                        }}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 64, width: '100%', ...(anime ? entree(anime.entree, sequence.registre) : {}) }}>
                            {visuel}
                            {texte && (
                                <div style={liaison
                                    ? { fontFamily: ABRIL, fontStyle: 'italic', fontSize: 220, lineHeight: 1, color: palette.accent }
                                    : { fontSize: visuel ? 100 : 140, lineHeight: 1.1, textAlign: 'center', textWrap: 'balance' } as React.CSSProperties}>
                                    {liaison ? texte : <TexteSurligne texte={element?.texte} accent={palette.accent} marque={palette.marque} />}
                                </div>
                            )}
                            {element?.detail && (
                                <div style={{ fontSize: 56, lineHeight: 1.25, opacity: 0.8, textAlign: 'center' }}>
                                    <TexteSurligne texte={element.detail} accent={palette.accent} marque={palette.marque} />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

/**
 * Le coup de poing (SPEC §12.5.3) : quelques mots plein écran, sur le prune de
 * la marque, le temps de les dire — puis le visage revient. Dessiné comme une
 * scène, dans le cadre puis réduit, pour que le storyboard et la vidéo le
 * montrent pareil. Il arrive en se posant (`avancee`, de 0 à 1) et repart sec :
 * c'est une rupture, pas une transition.
 */
export const CoupDePoingLuminose: React.FC<{
    texte: string;
    largeur: number;
    avancee?: number;
    format?: FormatVideo;
    arrondi?: number;
}> = ({ texte, largeur, avancee = 1, format = '9:16', arrondi = 8 }) => {
    const CADRE = CADRES[format];
    const ZONE = ZONES[format];
    const p = Math.min(1, Math.max(0, avancee));
    return (
        <div
            role="img"
            aria-label={`Coup de poing : ${texteAffiche(texte)}`}
            style={{ width: largeur, height: Math.round(largeur * CADRE.hauteur / CADRE.largeur), overflow: 'hidden', borderRadius: arrondi, flexShrink: 0 }}
        >
            <div style={{
                width: CADRE.largeur,
                height: CADRE.hauteur,
                transform: `scale(${largeur / CADRE.largeur})`,
                transformOrigin: 'top left',
                position: 'relative',
                backgroundColor: GAMME.prune,
                color: GAMME.ivoire,
                fontFamily: FUTURA,
            }}>
                <div style={{
                    position: 'absolute',
                    top: ZONE.haut,
                    left: ZONE.gauche,
                    right: ZONE.droite,
                    height: ZONE.bas - ZONE.haut,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    fontSize: 132,
                    fontWeight: 700,
                    lineHeight: 1.05,
                    letterSpacing: 2,
                    textTransform: 'uppercase',
                    textWrap: 'balance',
                    opacity: p,
                    transform: `scale(${1.12 - 0.12 * p})`,
                } as React.CSSProperties}>
                    <span><TexteSurligne texte={texte} accent={GAMME.roseBrumeux} marque="transparent" /></span>
                </div>
            </div>
        </div>
    );
};

export default SceneLuminose;
