import React, { useLayoutEffect, useRef, useState } from 'react';
import { segmentsSurlignes, type ElementScene, type SequenceReel } from '@luminose/editorial';

/**
 * Une scène de Reel expliqué, à l'habillage Luminose (SPEC §12.2).
 *
 * Elle se dessine dans le cadre de la vidéo — 1080 × 1920, en pixels du cadre,
 * en styles en ligne — puis se réduit à la largeur demandée. Ce n'est pas de
 * l'interface : les échelles de DESIGN.md ne s'y appliquent pas, la palette de
 * `voix/direction-artistique.md` §1-2, si. La composition animée (étape V2)
 * reprendra ce composant tel quel, en pilotant `visibles`.
 */

const CADRE = { largeur: 1080, hauteur: 1920 };

/**
 * La zone sûre : l'interface des Reels et des Shorts recouvre le bas de l'image
 * (légende, nom, musique) et le bord droit (les boutons). Les cartes restent
 * au-dessus des trois quarts de la hauteur, comme dans la référence.
 */
const ZONE = { haut: 170, gauche: 90, droite: 90, bas: 1440 };

/** La gamme des illustrations du site, de la lumière à l'ombre. */
const GAMME = {
    ivoire: '#FDEEE1',
    ivoireRose: '#FBE2D5',
    roseBrumeux: '#E9B9BB',
    mauveRose: '#C98FA5',
    mauve: '#9A688E',
    prune: '#634575',
    violetNuit: '#3C3061',
};

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

const FUTURA = "'Futura LT', Futura, 'Century Gothic', sans-serif";
const ABRIL = "'Abril Display', Georgia, serif";

/** Le passage surligné passe en Abril italique : les deux typographies de la marque. */
const TexteSurligne: React.FC<{ texte?: string | null; accent: string; marque: string }> = ({ texte, accent, marque }) => (
    <>
        {segmentsSurlignes(texte).map((s, i) => s.surligne ? (
            <span key={i} style={{
                fontFamily: ABRIL,
                fontStyle: 'italic',
                color: accent,
                padding: '0 6px',
                background: marque === 'transparent'
                    ? 'none'
                    : `linear-gradient(transparent 60%, ${marque} 60%, ${marque} 92%, transparent 92%)`,
            }}>{s.texte}</span>
        ) : <span key={i}>{s.texte}</span>)}
    </>
);

const Visuel: React.FC<{ element: ElementScene; hauteur: number; couleur: string }> = ({ element, hauteur, couleur }) => {
    const visuel = element.visuel;
    if (!visuel) return null;
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

const Carte: React.FC<{ element: ElementScene; demi: boolean }> = ({ element, demi }) => {
    const ton = TONS[tonDe(element.ton)];
    const grande = element.taille === 'grande';
    return (
        <div style={{
            flex: demi ? '1 1 0' : undefined,
            minWidth: 0,
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
            <Visuel element={element} hauteur={grande ? 520 : 300} couleur={ton.texte} />
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
            alignSelf: 'center',
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
    <div style={{ alignSelf: 'center', fontFamily: ABRIL, fontStyle: 'italic', fontSize: 76, lineHeight: 1, color: GAMME.mauve }}>
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

export interface SceneLuminoseProps {
    sequence: SequenceReel;
    /** Largeur d'affichage, en pixels ; la hauteur suit le 9:16. */
    largeur: number;
    /** Combien d'éléments sont apparus. Par défaut tous : c'est l'état final de la scène. */
    visibles?: number;
}

export const SceneLuminose: React.FC<SceneLuminoseProps> = ({ sequence, largeur, visibles }) => {
    const contenuRef = useRef<HTMLDivElement>(null);
    const [reduction, setReduction] = useState(1);
    const elements = sequence.elements ?? [];
    const nbVisibles = visibles ?? elements.length;

    /*
     * Une scène chargée peut dépasser la zone sûre — une grande carte et trois
     * autres, par exemple. Plutôt que de couper, on la réduit d'un bloc : les
     * proportions entre les cartes, voulues par le Rédacteur, restent les mêmes.
     * La mise en page ne dépend pas de ce qui est visible : une carte qui
     * apparaît ne fait pas bouger les autres.
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
    }, [sequence]);

    const echelle = largeur / CADRE.largeur;

    return (
        <div
            role="img"
            aria-label={`Scène : ${sequence.titre ?? ''}`}
            style={{ width: largeur, height: Math.round(largeur * CADRE.hauteur / CADRE.largeur), overflow: 'hidden', borderRadius: 8, flexShrink: 0 }}
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
                backgroundImage: `radial-gradient(circle, ${GAMME.mauve}2E 3px, transparent 3.5px)`,
                backgroundSize: '54px 54px',
            }}>
                <div style={{ position: 'absolute', top: ZONE.haut, left: ZONE.gauche, right: ZONE.droite, height: ZONE.bas - ZONE.haut }}>
                    <div
                        ref={contenuRef}
                        style={{ display: 'flex', flexDirection: 'column', gap: 48, transform: `scale(${reduction})`, transformOrigin: 'top center' }}
                    >
                        <div style={{ fontSize: 86, lineHeight: 1.12, textAlign: 'center', textWrap: 'balance' } as React.CSSProperties}>
                            <TexteSurligne texte={sequence.titre} accent={GAMME.prune} marque={GAMME.roseBrumeux} />
                        </div>
                        {enLignes(elements).map((ligne, i) => (
                            <div key={i} style={{ display: 'flex', gap: 36, justifyContent: 'center' }}>
                                {ligne.map(({ element, index }) => (
                                    <div
                                        key={index}
                                        style={{
                                            visibility: index < nbVisibles ? 'visible' : 'hidden',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            flex: ligne.length > 1 ? '1 1 0' : undefined,
                                            width: ligne.length === 1 && element.type === 'carte' && element.taille === 'petite' ? '50%' : undefined,
                                            alignSelf: element.type === 'carte' ? 'stretch' : 'center',
                                            minWidth: 0,
                                            ...(ligne.length === 1 && element.type === 'carte' && element.taille !== 'petite' ? { flex: '1 1 auto' } : {}),
                                        }}
                                    >
                                        {element.type === 'carte' && <Carte element={element} demi={element.taille === 'petite'} />}
                                        {element.type === 'pastille' && <Pastille element={element} />}
                                        {element.type === 'liaison' && <Liaison element={element} />}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SceneLuminose;
