import React, { useLayoutEffect, useRef, useState } from 'react';
import { segmentsSurlignes, type ElementScene, type SequenceReel } from '@luminose/editorial';

/**
 * Une scène de Reel expliqué, à l'habillage Luminose (SPEC §12.2).
 *
 * Elle se dessine dans le cadre de la vidéo — 1080 × 1920, en pixels du cadre,
 * en styles en ligne — puis se réduit à la largeur demandée. Ce n'est pas de
 * l'interface : les échelles de DESIGN.md ne s'y appliquent pas, la palette de
 * `voix/direction-artistique.md` §1-2, si.
 *
 * Le composant ne connaît pas Remotion. Le storyboard l'affiche à l'arrêt ; la
 * composition animée (`ReelComposition`) le pilote par `entrees` et lui prête
 * son composant d'image. C'est ce qui garde Remotion hors du paquet principal.
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
 * L'ombre est littéralement sombre, la lumière claire : la référence code le
 * coût en rose et la solution en vert ; ici, ce sont deux symboles que la
 * direction artistique porte déjà.
 */
const TONS: Record<Ton, { fond: string; bord: string; portee: string; texte: string; accent: string; marque: string }> = {
    ombre:   { fond: GAMME.violetNuit, bord: GAMME.violetNuit, portee: GAMME.mauve,       texte: GAMME.ivoire,     accent: GAMME.roseBrumeux, marque: 'transparent' },
    lumiere: { fond: GAMME.ivoireRose, bord: GAMME.mauveRose,  portee: GAMME.mauveRose,   texte: GAMME.violetNuit, accent: GAMME.prune,       marque: GAMME.roseBrumeux },
    neutre:  { fond: '#FFF8F1',        bord: GAMME.mauve,      portee: GAMME.roseBrumeux, texte: GAMME.violetNuit, accent: GAMME.prune,       marque: GAMME.ivoireRose },
};

/** Le modèle écrit parfois « lumière » : un accent ne doit pas faire perdre le ton. */
const tonDe = (valeur: unknown): Ton => {
    const cle = String(valeur ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return cle === 'ombre' || cle === 'lumiere' ? cle : 'neutre';
};

/**
 * Comment un élément entre, selon le registre de la scène. `p` va de 0 à 1 et
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
    return { opacity: Math.max(0, p), transform: `translateY(${(1 - p) * 48}px)` };
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
                color: accent,
                padding: '0 6px',
                backgroundImage: marque === 'transparent'
                    ? 'none'
                    : `linear-gradient(transparent 60%, ${marque} 60%, ${marque} 92%, transparent 92%)`,
            }}>{s.texte}</span>
        ) : <span key={i}>{s.texte}</span>)}
    </>
);

const Visuel: React.FC<{ element: ElementScene; hauteur: number; couleur: string; image?: string; Image: ComposantImage }> = ({ element, hauteur, couleur, image, Image }) => {
    const visuel = element.visuel;
    if (!visuel) return null;
    if (image) {
        return (
            <Image
                src={image}
                alt={visuel.description}
                style={{ width: '100%', height: hauteur, objectFit: 'cover', borderRadius: 28, display: 'block' }}
            />
        );
    }
    return (
        <div style={{
            height: hauteur,
            borderRadius: 28,
            border: `4px dashed ${couleur}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 18,
            padding: '0 48px',
            textAlign: 'center',
            opacity: 0.85,
        }}>
            <span style={{ fontSize: 30, letterSpacing: 4, textTransform: 'uppercase' }}>
                {visuel.nature === 'schema' ? 'Schéma' : 'Illustration'}
            </span>
            <span style={{ fontSize: 36, lineHeight: 1.3 }}>{visuel.description}</span>
        </div>
    );
};

const Carte: React.FC<{ element: ElementScene; demi: boolean; image?: string; Image: ComposantImage }> = ({ element, demi, image, Image }) => {
    const ton = TONS[tonDe(element.ton)];
    const grande = element.taille === 'grande';
    return (
        <div style={{
            background: ton.fond,
            color: ton.texte,
            border: `5px solid ${ton.bord}`,
            borderRadius: 40,
            boxShadow: `10px 10px 0 ${ton.portee}`,
            padding: demi ? '34px 30px' : '40px 48px',
            display: 'flex',
            flexDirection: 'column',
            gap: 22,
            textAlign: 'center',
        }}>
            <Visuel element={element} hauteur={grande ? 520 : 300} couleur={ton.texte} image={image} Image={Image} />
            {element.texte && (
                <div style={{ fontSize: demi ? 54 : 64, lineHeight: 1.15 }}>
                    <TexteSurligne texte={element.texte} accent={ton.accent} marque={ton.marque} />
                </div>
            )}
            {element.detail && (
                <div style={{ fontSize: demi ? 36 : 42, lineHeight: 1.25, opacity: 0.8 }}>
                    <TexteSurligne texte={element.detail} accent={ton.accent} marque={ton.marque} />
                </div>
            )}
        </div>
    );
};

const Pastille: React.FC<{ element: ElementScene }> = ({ element }) => {
    const ton = TONS[tonDe(element.ton)];
    return (
        <div style={{
            background: ton.fond,
            color: ton.texte,
            border: `4px solid ${ton.bord}`,
            borderRadius: 999,
            padding: '18px 48px',
            fontSize: 46,
            lineHeight: 1.2,
            textAlign: 'center',
        }}>
            <TexteSurligne texte={element.texte} accent={ton.accent} marque={ton.marque} />
        </div>
    );
};

const Liaison: React.FC<{ element: ElementScene }> = ({ element }) => (
    <div style={{ fontFamily: ABRIL, fontStyle: 'italic', fontSize: 76, lineHeight: 1, color: GAMME.mauve }}>
        {element.texte}
    </div>
);

/**
 * Deux petites cartes voisines partagent une ligne ; tout le reste prend la
 * largeur. Une petite carte seule garde sa demi-largeur, centrée : c'est ce que
 * le Rédacteur a demandé en la disant petite.
 */
function enLignes(elements: ElementScene[]): Array<Array<{ element: ElementScene; index: number }>> {
    const lignes: Array<Array<{ element: ElementScene; index: number }>> = [];
    elements.forEach((element, index) => {
        const derniere = lignes[lignes.length - 1];
        const petite = element.type === 'carte' && element.taille === 'petite';
        const accolable = derniere?.length === 1 && derniere[0].element.type === 'carte' && derniere[0].element.taille === 'petite';
        if (petite && accolable) derniere.push({ element, index });
        else lignes.push([{ element, index }]);
    });
    return lignes;
}

const ImageSimple: ComposantImage = (props) => <img {...props} />;

export interface SceneLuminoseProps {
    sequence: SequenceReel;
    /** Largeur d'affichage, en pixels ; la hauteur suit le 9:16. */
    largeur: number;
    /**
     * Combien d'éléments sont apparus, à l'arrêt. Par défaut tous : c'est l'état
     * final de la scène. Ignoré quand `entrees` est fourni.
     */
    visibles?: number;
    /** L'avancée de chaque entrée, de 0 à 1 (au-delà : un rebond). Fourni par la composition animée. */
    entrees?: { titre?: number; elements?: number[] };
    /** Les visuels déposés par Florent, par rang d'élément dans la scène. */
    visuels?: Record<number, string | undefined>;
    Image?: ComposantImage;
    /** Les coins arrondis de la miniature ; 0 dans la vidéo elle-même. */
    arrondi?: number;
    format?: FormatVideo;
}

export const SceneLuminose: React.FC<SceneLuminoseProps> = ({
    sequence, largeur, visibles, entrees, visuels, Image = ImageSimple, arrondi = 8, format = '9:16',
}) => {
    const CADRE = CADRES[format];
    const ZONE = ZONES[format];
    const contenuRef = useRef<HTMLDivElement>(null);
    const [reduction, setReduction] = useState(1);
    const elements = sequence.elements ?? [];
    const nbVisibles = visibles ?? elements.length;
    const avancee = (index: number) => entrees
        ? entrees.elements?.[index] ?? 0
        : index < nbVisibles ? 1 : 0;

    /*
     * Une scène chargée peut dépasser la zone sûre — une grande carte et trois
     * autres, par exemple. Plutôt que de couper, on la réduit d'un bloc : les
     * proportions entre les cartes, voulues par le Rédacteur, restent les mêmes.
     * La mise en page ne dépend pas de ce qui est apparu : une carte qui arrive
     * ne fait pas bouger les autres.
     */
    useLayoutEffect(() => {
        const contenu = contenuRef.current;
        if (!contenu) return;
        const mesurer = () => {
            const hauteur = contenu.scrollHeight;
            const disponible = ZONE.bas - ZONE.haut;
            setReduction(hauteur > disponible ? disponible / hauteur : 1);
        };
        mesurer();
        // Les polices de la marque arrivent après le premier rendu, et changent les hauteurs.
        document.fonts?.ready.then(mesurer).catch(() => undefined);
    }, [sequence, visuels, format]);

    const echelle = largeur / CADRE.largeur;

    return (
        <div
            role="img"
            aria-label={`Scène : ${sequence.titre ?? ''}`}
            style={{ width: largeur, height: Math.round(largeur * CADRE.hauteur / CADRE.largeur), overflow: 'hidden', borderRadius: arrondi, flexShrink: 0 }}
        >
            <div style={{
                width: CADRE.largeur,
                height: CADRE.hauteur,
                transform: `scale(${echelle})`,
                transformOrigin: 'top left',
                position: 'relative',
                fontFamily: FUTURA,
                color: GAMME.violetNuit,
                backgroundColor: GAMME.ivoire,
            }}>
                <Image src={pointilles(format)} alt="" style={{ position: 'absolute', top: 0, left: 0, width: CADRE.largeur, height: CADRE.hauteur }} />
                <div style={{ position: 'absolute', top: ZONE.haut, left: ZONE.gauche, right: ZONE.droite, height: ZONE.bas - ZONE.haut }}>
                    <div
                        ref={contenuRef}
                        style={{ display: 'flex', flexDirection: 'column', gap: 48, transform: `scale(${reduction})`, transformOrigin: 'top center' }}
                    >
                        <div style={{
                            fontSize: 86, lineHeight: 1.12, textAlign: 'center', textWrap: 'balance',
                            ...(entrees ? entree(entrees.titre ?? 0, 'pedagogie') : {}),
                        } as React.CSSProperties}>
                            <TexteSurligne texte={sequence.titre} accent={GAMME.prune} marque={GAMME.roseBrumeux} />
                        </div>
                        {enLignes(elements).map((ligne, i) => (
                            <div key={i} style={{ display: 'flex', gap: 36, justifyContent: 'center' }}>
                                {ligne.map(({ element, index }) => {
                                    const seule = ligne.length === 1;
                                    const carte = element.type === 'carte';
                                    const petite = carte && element.taille === 'petite';
                                    return (
                                        <div
                                            key={index}
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                flex: !seule || (carte && !petite) ? '1 1 0' : undefined,
                                                width: seule && petite ? '50%' : undefined,
                                                minWidth: 0,
                                                ...entree(avancee(index), sequence.registre),
                                            }}
                                        >
                                            {carte && <Carte element={element} demi={petite} image={visuels?.[index]} Image={Image} />}
                                            {element.type === 'pastille' && <Pastille element={element} />}
                                            {element.type === 'liaison' && <Liaison element={element} />}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SceneLuminose;
