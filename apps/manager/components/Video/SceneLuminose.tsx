import React, { useLayoutEffect, useRef, useState } from 'react';
import {
    NOM, TITRE, SITE_URL,
    segmentsSurlignes, texteAffiche, schemaDe, illustrationDe, visuelDecrit, arriveesDeLaListe, tonDeLEcran,
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

/** Une couleur de la gamme, voilée. */
const voile = (hex: string, opacite: number) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${opacite})`;
};
/** Le violet nuit, assombri : le haut du ciel sombre, pour que la profondeur vienne du dégradé et non de la saturation. */
const NUIT_PROFONDE = '#2F2650';

const svg = (contenu: string) => `data:image/svg+xml;utf8,${encodeURIComponent(contenu)}`;
const brumes = new Map<string, string>();

/**
 * Le fond Brume (v2.31, décision de Florent du 30/10/2026 devant trois pistes :
 * « La piste brume est très bien ! ») : l'atmosphère des illustrations des pages
 * du site — un ciel en dégradé, un halo, deux lignes de collines au bas du
 * cadre, un grain léger —, dans leur gamme. Il remplace le fond uni et ses
 * pointillés. Une image SVG : le rendu dans le navigateur ne peint ni
 * `radial-gradient` ni filtre CSS, mais il peint une image, et l'image porte
 * son dégradé radial et son grain. Une par temps et par format, calculée une fois.
 */
export function fondBrume(format: FormatVideo, clair: boolean): string {
    const cle = `${format}:${clair}`;
    const deja = brumes.get(cle);
    if (deja) return deja;
    const { largeur: L, hauteur: H } = CADRES[format];
    // Les collines gardent leur hauteur réelle d'un format à l'autre : le 4:5 est plus court.
    const k = H / 1920;
    const y = (depuisLeBas: number) => Math.round(H - depuisLeBas * k);
    const x = (sur1080: number) => Math.round(sur1080 * L / 1080);
    const ciel = clair
        ? [[0, GAMME.ivoire], [0.55, GAMME.ivoireRose], [1, GAMME.roseBrumeux]]
        : [[0, NUIT_PROFONDE], [0.6, GAMME.violetNuit], [1, GAMME.prune]];
    const halo = clair ? { couleur: GAMME.ivoire, opacite: 0.9, y: y(770) } : { couleur: GAMME.mauveRose, opacite: 0.38, y: y(670) };
    const [loin, pres] = clair
        ? [[GAMME.mauveRose, 0.45], [GAMME.mauve, 0.35]]
        : [[GAMME.prune, 0.85], [NUIT_PROFONDE, 0.9]];
    const image = svg(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}" viewBox="0 0 ${L} ${H}">`
        + '<defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1">'
        + ciel.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')
        + `</linearGradient><radialGradient id="h" cx="${L / 2}" cy="${halo.y}" r="${Math.round(760 * k)}" gradientUnits="userSpaceOnUse">`
        + `<stop offset="0" stop-color="${halo.couleur}" stop-opacity="${halo.opacite}"/><stop offset="1" stop-color="${halo.couleur}" stop-opacity="0"/></radialGradient>`
        // Le grain sur une tuile de 256 px, répétée : calculé une fois, pas sur tout le cadre.
        + '<filter id="g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>'
        + '<feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0.07"/></feComponentTransfer></filter>'
        + '<pattern id="t" width="256" height="256" patternUnits="userSpaceOnUse"><rect width="256" height="256" filter="url(#g)"/></pattern></defs>'
        + `<rect width="${L}" height="${H}" fill="url(#c)"/><rect width="${L}" height="${H}" fill="url(#h)"/>`
        + `<path d="M0 ${y(420)} C ${x(220)} ${y(500)} ${x(380)} ${y(450)} ${x(560)} ${y(480)} C ${x(760)} ${y(515)} ${x(900)} ${y(460)} ${L} ${y(500)} L${L} ${H} L0 ${H}Z" fill="${loin[0]}" fill-opacity="${loin[1]}"/>`
        + `<path d="M0 ${y(300)} C ${x(260)} ${y(360)} ${x(420)} ${y(280)} ${x(640)} ${y(320)} C ${x(820)} ${y(350)} ${x(960)} ${y(310)} ${L} ${y(330)} L${L} ${H} L0 ${H}Z" fill="${pres[0]}" fill-opacity="${pres[1]}"/>`
        + `<rect width="${L}" height="${H}" fill="url(#t)"/></svg>`,
    );
    brumes.set(cle, image);
    return image;
}

/** La crête de l'eau, 60 px de haut : une vague douce et sa ligne de surface. Le corps de l'eau est un dégradé CSS sous elle. */
const crete = (format: FormatVideo, couleur: string) => {
    const L = CADRES[format].largeur;
    const vague = `M0 30 C ${L / 6} 8 ${L / 3} 52 ${L / 2} 30 C ${2 * L / 3} 8 ${5 * L / 6} 52 ${L} 30`;
    return svg(`<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="60" viewBox="0 0 ${L} 60">`
        + `<path d="${vague} L${L} 60 L0 60Z" fill="${couleur}" fill-opacity="0.92"/>`
        + `<path d="${vague}" fill="none" stroke="${GAMME.ivoire}" stroke-opacity="0.7" stroke-width="5"/></svg>`);
};

/** Le niveau d'où l'eau est partie, en pointillé : un trait plein ou pointillé en CSS ne se peint pas à coup sûr dans l'export. */
const trace = (format: FormatVideo, couleur: string) => {
    const L = CADRES[format].largeur;
    return svg(`<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="6" viewBox="0 0 ${L} 6">`
        + `<line x1="90" x2="${L - 90}" y1="3" y2="3" stroke="${couleur}" stroke-opacity="0.5" stroke-width="3" stroke-dasharray="14 16"/></svg>`);
};

type Ton = 'ombre' | 'lumiere' | 'neutre';

/**
 * Le ton fait le fond de tout l'écran : passer de l'ombre à la lumière se voit
 * d'un coup — c'est la bascule. Depuis la v2.30, les fonds vont en deux temps
 * (`enDeuxTemps`), et depuis la v2.31 ce sont des fonds Brume (`fondBrume`) : le
 * ciel du soir avant la bascule, le matin après. `fond` n'est plus que la
 * couleur d'attente, le temps que l'image arrive.
 */
const ECRANS: Record<Ton, { clair: boolean; fond: string; texte: string; accent: string; etiquette: string; trait: string; eau: [string, string] }> = {
    ombre:   { clair: false, fond: GAMME.violetNuit, texte: GAMME.ivoire,     accent: GAMME.roseBrumeux, etiquette: GAMME.mauveRose, trait: GAMME.mauveRose, eau: [GAMME.roseBrumeux, GAMME.mauve] },
    lumiere: { clair: true,  fond: GAMME.ivoire,     texte: GAMME.violetNuit, accent: GAMME.prune,       etiquette: GAMME.mauve,     trait: GAMME.mauve,     eau: [GAMME.mauveRose, GAMME.mauve] },
    neutre:  { clair: true,  fond: GAMME.ivoire,     texte: GAMME.violetNuit, accent: GAMME.prune,       etiquette: GAMME.mauve,     trait: GAMME.mauve,     eau: [GAMME.mauveRose, GAMME.mauve] },
};
type Palette = (typeof ECRANS)[Ton];

/** Une carte d'un schéma — un terme d'une opposition, le départ d'un enchaînement. */
const CARTES: Record<'ombre' | 'lumiere', { fond: string; texte: string; bord: string }> = {
    ombre:   { fond: GAMME.violetNuit, texte: GAMME.ivoire,     bord: GAMME.mauve },
    lumiere: { fond: GAMME.ivoire,     texte: GAMME.violetNuit, bord: GAMME.mauveRose },
};

/**
 * Comment un écran entre : il se pose, sans rebond, quel que soit le registre
 * (v2.30). L'humour arrivait de travers et rebondissait ; le 30/10/2026, Florent
 * a trouvé la vidéo confuse, « beaucoup de trucs qui s'animent à l'écran ». Le
 * registre reste dans le script ; il ne change plus l'entrée.
 */
function entree(p: number): React.CSSProperties {
    if (p >= 1) return {};
    return { opacity: Math.max(0, p), transform: `translateY(${(1 - p) * 60}px)` };
}

/** Un composant d'image : `img` à l'arrêt, celui de Remotion dans la composition. */
export type ComposantImage = React.ComponentType<React.ImgHTMLAttributes<HTMLImageElement>>;

/**
 * Le passage surligné passe en Abril italique : les deux typographies de la
 * marque. Depuis la v2.31 (Brume), il grandit (`grandeur`, en em) plutôt que de
 * porter une barre de surlignage.
 */
const TexteSurligne: React.FC<{ texte?: string | null; accent: string; marque?: string; grandeur?: number }> = ({ texte, accent, marque = 'transparent', grandeur }) => (
    <>
        {segmentsSurlignes(texte).map((s, i) => s.surligne ? (
            <span key={i} style={{
                fontFamily: ABRIL,
                fontStyle: 'italic',
                // L'Abril reste en bas de casse, même dans un texte en capitales : c'est elle qui fait l'accent.
                textTransform: 'none',
                color: accent,
                padding: '0 6px',
                ...(grandeur ? { fontSize: `${grandeur}em` } : {}),
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
            background: c.fond, color: c.texte, border: `6px solid ${c.bord}`, borderRadius: 40,
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
        case 'niveau':
            // L'eau monte dans le paysage, sur tout le cadre (v2.31) : c'est la scène qui la dessine.
            return null;
        case 'compteur': {
            const valeur = schema.valeur * pose(ecoule, 0.1, 1.2);
            const entier = Number.isInteger(schema.valeur);
            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: 360, lineHeight: 1, color: palette.texte }}>
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
            /*
             * Une ligne par terme, sans cadre (v2.31) : l'étiquette en capitales,
             * le mot en Abril, un filet court entre deux. « Colère : un [détail] »
             * se lit étiquette « Colère », mot « un détail » ; sans deux-points,
             * la ligne entière est le mot.
             */
            const arrivees = arriveesDeLaListe((schema.items ?? []).length, duree);
            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', textAlign: 'center' }}>
                    {(schema.items ?? []).map((item, k) => {
                        const deuxPoints = item.indexOf(' : ');
                        const etiquette = deuxPoints > 0 ? item.slice(0, deuxPoints) : null;
                        const mot = texteAffiche(deuxPoints > 0 ? item.slice(deuxPoints + 3) : item);
                        return (
                            <React.Fragment key={k}>
                                {k > 0 && <div style={{ width: 120, height: 3, background: palette.trait, opacity: 0.6, margin: '64px 0' }} />}
                                <div style={{ position: 'relative', opacity: pose(ecoule, arrivees[k], 0.25) }}>
                                    {etiquette && (
                                        <div style={{ fontSize: 46, letterSpacing: 12, textTransform: 'uppercase', color: palette.etiquette }}>{texteAffiche(etiquette)}</div>
                                    )}
                                    <div style={{ fontFamily: ABRIL, fontStyle: 'italic', fontSize: etiquette ? 150 : 130, lineHeight: 1.1, color: palette.accent }}>{mot}</div>
                                    {schema.barres && (
                                        <div style={{ position: 'absolute', left: -20, bottom: '30%', height: 8, borderRadius: 4, background: palette.texte, width: `calc(${pose(ecoule, arrivees[k] + 0.35, 0.3) * 100}% + 40px)` }} />
                                    )}
                                </div>
                            </React.Fragment>
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
    const palette = ECRANS[tonDeLEcran(element?.ton)];
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
    // Le niveau ne se pose pas au centre : l'eau monte sur tout le cadre (v2.31).
    const niveau = schema?.schema === 'niveau' ? schema : null;
    let visuel: React.ReactNode = null;
    if (schema && !niveau) visuel = <Schema schema={schema} hauteur={Math.round(hauteurVisuel * 0.9)} palette={palette} ecoule={ecoule} duree={anime?.duree ?? 3} />;
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

    /*
     * L'eau du niveau (v2.31) : elle monte dans le paysage, du bas du cadre vers
     * le texte, qui se tient alors en haut de la zone sûre. Un trait pointillé
     * garde le niveau d'où elle part. La crête est une image ; le corps, un
     * dégradé CSS qui la prolonge : seule leur position change d'une image à
     * l'autre.
     */
    const k = CADRE.hauteur / 1920;
    const fondDeLEau = CADRE.hauteur - Math.round(160 * k);
    const plafond = ZONE.haut + Math.round(520 * k);
    const hauteurDeLEau = (pourcent: number) => fondDeLEau - (Math.max(0, Math.min(100, pourcent)) / 100) * (fondDeLEau - plafond);
    const surface = niveau ? hauteurDeLEau(niveau.de + (niveau.a - niveau.de) * pose(ecoule, 0.2, 1.6)) : 0;

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
                <Image src={fondBrume(format, palette.clair)} alt="" style={{ position: 'absolute', top: 0, left: 0, width: CADRE.largeur, height: CADRE.hauteur }} />
                {niveau && (
                    <>
                        <Image src={trace(format, palette.clair ? GAMME.mauve : GAMME.ivoire)} alt="" style={{ position: 'absolute', left: 0, top: hauteurDeLEau(niveau.de) - 3, width: CADRE.largeur, height: 6 }} />
                        <Image src={crete(format, palette.eau[0])} alt="" style={{ position: 'absolute', left: 0, top: surface - 30, width: CADRE.largeur, height: 60 }} />
                        <div style={{ position: 'absolute', left: 0, right: 0, top: surface + 30, bottom: 0, backgroundImage: `linear-gradient(${voile(palette.eau[0], 0.92)}, ${voile(palette.eau[1], 0.95)})` }} />
                    </>
                )}
                <div style={{
                    position: 'absolute', top: ZONE.haut, left: ZONE.gauche, right: ZONE.droite, height: hauteurZone, display: 'flex', justifyContent: 'center',
                    ...(niveau ? { alignItems: 'flex-start', paddingTop: Math.round(130 * k), boxSizing: 'border-box' } : { alignItems: 'center' }),
                }}>
                    <div
                        ref={contenuRef}
                        style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 64, width: '100%',
                            transform: `scale(${reduction})`, transformOrigin: 'center center',
                        }}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 64, width: '100%', ...(anime ? entree(anime.entree) : {}) }}>
                            {visuel}
                            {texte && (
                                <div style={liaison
                                    ? { fontFamily: ABRIL, fontStyle: 'italic', fontSize: 220, lineHeight: 1, color: palette.accent }
                                    : { fontSize: visuel ? 92 : 112, lineHeight: 1.15, textAlign: 'center', textWrap: 'balance' } as React.CSSProperties}>
                                    {liaison ? texte : <TexteSurligne texte={element?.texte} accent={palette.accent} grandeur={1.4} />}
                                </div>
                            )}
                            {element?.detail && (
                                <div style={{ fontSize: 56, lineHeight: 1.25, opacity: 0.8, textAlign: 'center' }}>
                                    <TexteSurligne texte={element.detail} accent={palette.accent} />
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
 * Le coup de poing (SPEC §12.5.3) : quelques mots plein écran, le temps de les
 * dire — puis le visage revient. Dessiné comme une scène, dans le cadre puis
 * réduit, pour que le storyboard et la vidéo le montrent pareil. Il arrive en se
 * posant (`avancee`, de 0 à 1) et repart sec : c'est une rupture, pas une
 * transition. Son fond suit les deux temps de la vidéo (v2.30), en Brume
 * (v2.31) ; les mots ordinaires y sont une ligne de capitales espacées, le
 * passage entre crochets un mot en Abril, aussi grand que la largeur le permet.
 */
export const CoupDePoingLuminose: React.FC<{
    texte: string;
    largeur: number;
    avancee?: number;
    format?: FormatVideo;
    arrondi?: number;
    /** Après la bascule : le temps clair. */
    clair?: boolean;
    Image?: ComposantImage;
}> = ({ texte, largeur, avancee = 1, format = '9:16', arrondi = 8, clair = false, Image = ImageSimple }) => {
    const CADRE = CADRES[format];
    const ZONE = ZONES[format];
    const p = Math.min(1, Math.max(0, avancee));
    const segments = segmentsSurlignes(texte).map(x => ({ ...x, texte: x.texte.trim() })).filter(x => x.texte);
    const accent = clair ? GAMME.prune : GAMME.roseBrumeux;
    const sansAccent = !segments.some(x => x.surligne);
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
                backgroundColor: clair ? GAMME.ivoire : GAMME.violetNuit,
                color: clair ? GAMME.violetNuit : GAMME.ivoire,
                fontFamily: FUTURA,
            }}>
                <Image src={fondBrume(format, clair)} alt="" style={{ position: 'absolute', top: 0, left: 0, width: CADRE.largeur, height: CADRE.hauteur }} />
                <div style={{
                    position: 'absolute',
                    top: ZONE.haut,
                    left: ZONE.gauche,
                    right: ZONE.droite,
                    height: ZONE.bas - ZONE.haut,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    textAlign: 'center',
                    opacity: p,
                    transform: `scale(${1.12 - 0.12 * p})`,
                }}>
                    {segments.map((x, i) => x.surligne ? (
                        // Aussi grand que la largeur le permet : l'Abril italique fait à peu près une demi-hauteur par lettre.
                        <div key={i} style={{ fontFamily: ABRIL, fontStyle: 'italic', fontSize: Math.min(230, Math.floor(880 / (x.texte.length * 0.48))), lineHeight: 1.05, color: accent }}>{x.texte}</div>
                    ) : (
                        <div key={i} style={{ fontSize: sansAccent ? 120 : 64, letterSpacing: sansAccent ? 4 : 16, lineHeight: 1.2, textTransform: 'uppercase', textWrap: 'balance' } as React.CSSProperties}>{x.texte}</div>
                    ))}
                </div>
            </div>
        </div>
    );
};

/** L'adresse telle qu'on la lit et qu'on la tape : « luminose.fr ». */
const ADRESSE = SITE_URL.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
const TITRE_AFFICHE = `${TITRE.charAt(0).toUpperCase()}${TITRE.slice(1)}`;

/**
 * Le bandeau de signature (v2.27) : le nom et le titre, en haut de l'accroche —
 * le bas du cadre appartient aux sous-titres et à l'interface des Reels. Il
 * glisse en entrant et en sortant (`presence`, de 0 à 1).
 */
export const BandeauSignature: React.FC<{ largeur: number; presence?: number; format?: FormatVideo; arrondi?: number }> = ({ largeur, presence = 1, format = '9:16', arrondi = 8 }) => {
    const CADRE = CADRES[format];
    const ZONE = ZONES[format];
    const p = Math.min(1, Math.max(0, presence));
    return (
        <div style={{ width: largeur, height: Math.round(largeur * CADRE.hauteur / CADRE.largeur), overflow: 'hidden', borderRadius: arrondi, flexShrink: 0, position: 'relative' }}>
            <div style={{ width: CADRE.largeur, height: CADRE.hauteur, transform: `scale(${largeur / CADRE.largeur})`, transformOrigin: 'top left', position: 'relative', fontFamily: FUTURA }}>
                <div style={{
                    position: 'absolute', top: ZONE.haut + 20, left: ZONE.gauche, display: 'flex', alignItems: 'stretch',
                    opacity: p, transform: `translateX(${(1 - p) * -60}px)`,
                }}>
                    <div style={{ width: 14, background: GAMME.prune, borderRadius: 7 }} />
                    <div style={{ background: GAMME.ivoire, borderRadius: 24, padding: '24px 40px', marginLeft: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.1, color: GAMME.violetNuit }}>{NOM}</span>
                        <span style={{ fontFamily: ABRIL, fontStyle: 'italic', fontSize: 44, lineHeight: 1.2, color: GAMME.prune }}>{TITRE_AFFICHE}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

/** Le carton final (v2.27) : qui parlait, et où le retrouver — après le dernier mot, sur l'ivoire de la marque. */
export const CartonFinal: React.FC<{ largeur: number; presence?: number; format?: FormatVideo; arrondi?: number; Image?: ComposantImage }> = ({ largeur, presence = 1, format = '9:16', arrondi = 8, Image = ImageSimple }) => {
    const CADRE = CADRES[format];
    const ZONE = ZONES[format];
    const p = Math.min(1, Math.max(0, presence));
    return (
        <div
            role="img"
            aria-label={`${NOM}, ${TITRE} — ${ADRESSE}`}
            style={{ width: largeur, height: Math.round(largeur * CADRE.hauteur / CADRE.largeur), overflow: 'hidden', borderRadius: arrondi, flexShrink: 0 }}
        >
            <div style={{ width: CADRE.largeur, height: CADRE.hauteur, transform: `scale(${largeur / CADRE.largeur})`, transformOrigin: 'top left', position: 'relative', fontFamily: FUTURA, backgroundColor: GAMME.ivoire, color: GAMME.violetNuit }}>
                <Image src={fondBrume(format, true)} alt="" style={{ position: 'absolute', top: 0, left: 0, width: CADRE.largeur, height: CADRE.hauteur }} />
                <div style={{
                    position: 'absolute', top: ZONE.haut, left: ZONE.gauche, right: ZONE.droite, height: ZONE.bas - ZONE.haut,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, textAlign: 'center',
                    opacity: p, transform: `translateY(${(1 - p) * 40}px)`,
                }}>
                    <span style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.1 }}>{NOM}</span>
                    <span style={{ fontFamily: ABRIL, fontStyle: 'italic', fontSize: 58, lineHeight: 1.2, color: GAMME.prune }}>{TITRE_AFFICHE}</span>
                    <span style={{
                        marginTop: 80, fontSize: 120, fontWeight: 700, lineHeight: 1.1, color: GAMME.prune, padding: '0 12px',
                        backgroundImage: `linear-gradient(transparent 62%, ${GAMME.roseBrumeux} 62%, ${GAMME.roseBrumeux} 92%, transparent 92%)`,
                    }}>{ADRESSE}</span>
                </div>
            </div>
        </div>
    );
};

export default SceneLuminose;
