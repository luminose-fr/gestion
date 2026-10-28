import React from 'react';
import { RotateCcw, RotateCw } from 'lucide-react';
import { Bouton } from '../ui';

/**
 * Les réglages d'une prise (SPEC §12.5.7) : la rotation de l'image et la
 * synchronisation du son.
 *
 * Constaté le 26/10/2026 : une prise enregistrée dans QuickTime avec une caméra
 * et un micro USB arrivait couchée, et le son après les lèvres — deux chaînes de
 * capture, deux latences. Rien dans le fichier ne le dit : on règle en
 * regardant l'aperçu, d'une image à la fois.
 */

/** Une image de la vidéo produite : c'est le pas le plus fin que le rendu sache tenir. */
export const PAS_DU_SON = 1 / 30;

export type Rotation = 0 | 90 | 180 | 270;

const ms = (s: number) => `${Math.round(Math.abs(s) * 1000)} ms`;

export const decrireDecalage = (decalage: number): string =>
    Math.abs(decalage) < 0.005 ? 'son d’origine'
        : decalage > 0 ? `son recalé : il arrivait ${ms(decalage)} après les lèvres`
            : `son recalé : il arrivait ${ms(decalage)} avant les lèvres`;

/**
 * Ce qu'une prise horizontale devient dans le cadre vertical : la vidéo la
 * remplit (`cover`), n'en garde que le centre et l'agrandit d'autant. Constaté le
 * 28/10/2026 sur une prise 1920 × 1080 : un tiers de l'image, agrandi 1,8 fois —
 * une image adoucie, un visage qui remplit le cadre, des sous-titres posés sur
 * la bouche. Rien ne l'empêche ; mieux vaut le savoir avant d'exporter.
 * `null` pour une prise verticale, une fois pivotée.
 */
export function cadrageVertical(largeur: number | undefined, hauteur: number | undefined, rotation: Rotation): string | null {
    if (!largeur || !hauteur) return null;
    const [l, h] = rotation % 180 === 0 ? [largeur, hauteur] : [hauteur, largeur];
    if (l <= h) return null;
    const echelle = Math.max(1080 / l, 1920 / h);
    const part = 1080 / echelle / l;
    const garde = part < 0.4 ? 'le tiers central' : part < 0.6 ? 'la moitié centrale' : `${Math.round(part * 100)} % au centre`;
    const agrandie = echelle > 1.05 ? `, agrandi ${echelle.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} fois` : '';
    return `Prise horizontale : en 9:16, la vidéo n'en garde que ${garde}${agrandie}. Pour un Reel, filmez à la verticale.`;
}

export interface ReglagesPriseProps {
    decalageSon: number;
    rotation: Rotation;
    /** Les dimensions du fichier, avant rotation : de quoi dire ce que le cadre vertical en gardera. */
    largeur?: number;
    hauteur?: number;
    onRegler: (reglage: { decalageSon?: number; rotation?: Rotation }) => void;
    desactive?: boolean;
}

export const ReglagesPrise: React.FC<ReglagesPriseProps> = ({ decalageSon, rotation, largeur, hauteur, onRegler, desactive }) => {
    const horizontale = cadrageVertical(largeur, hauteur, rotation);
    // On compte en images, pas en millisecondes : six clics font 200 ms, pas 198.
    const pas = (sens: 1 | -1) => {
        const images = Math.round(decalageSon / PAS_DU_SON) + sens;
        onRegler({ decalageSon: Math.round(images * PAS_DU_SON * 1000) / 1000 });
    };
    return (
        <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-brand-main/70 dark:text-dark-text/70">Image :</span>
                <Bouton
                    taille="petit"
                    intention="secondaire"
                    disabled={desactive}
                    title="Pivoter l'image d'un quart de tour, dans le sens des aiguilles d'une montre"
                    onClick={() => onRegler({ rotation: ((rotation + 90) % 360) as Rotation })}
                >
                    <RotateCw /> Pivoter
                </Bouton>
                <span className="text-xs text-brand-main dark:text-dark-text">{rotation ? `tournée de ${rotation}°` : 'droite'}</span>
            </div>
            {horizontale && <p className="text-xs text-alerte">{horizontale}</p>}
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-brand-main/70 dark:text-dark-text/70">Son :</span>
                <Bouton taille="petit" intention="secondaire" disabled={desactive} onClick={() => pas(1)}
                    title="Le son arrive après les lèvres : l'avancer d'une image">
                    Son en retard
                </Bouton>
                <Bouton taille="petit" intention="secondaire" disabled={desactive} onClick={() => pas(-1)}
                    title="Le son arrive avant les lèvres : le retarder d'une image">
                    Son en avance
                </Bouton>
                <span className="text-xs text-brand-main dark:text-dark-text">{decrireDecalage(decalageSon)}</span>
                {Math.abs(decalageSon) >= 0.005 && (
                    <Bouton taille="petit" intention="discrete" disabled={desactive} onClick={() => onRegler({ decalageSon: 0 })}
                        title="Revenir au son tel qu'il a été enregistré">
                        <RotateCcw /> Rétablir
                    </Bouton>
                )}
            </div>
            <p className="text-xs text-brand-main/60 dark:text-dark-text/60">
                Pour régler le son, regardez dans l'aperçu un mot qui commence par p, b ou m : les lèvres doivent s'ouvrir avec
                le son. Chaque clic décale d'une image. Ces réglages se reprennent pour la prise suivante filmée au même format — même caméra, même micro.
            </p>
        </div>
    );
};

export default ReglagesPrise;
