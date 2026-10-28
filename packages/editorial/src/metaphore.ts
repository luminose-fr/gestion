/**
 * La carte de la métaphore (SPEC §13.10) : ce que représente, en clair, chaque
 * élément de l'image.
 *
 * Elle est née le 28/10/2026 d'un Reel où la digue, l'eau, les fuites et le
 * sparadrap n'avaient jamais été définis. Le Coach avait glissé une amygdale
 * « derrière la digue », le Rédacteur l'a suivi, et le Lecteur froid a dit
 * « Publiable » : il comptait les métaphores sans vérifier qu'elles se
 * lisaient. La carte voyage désormais du Coach au brief, et le Lecteur froid en
 * dresse une à l'aveugle — c'est l'écart entre les deux qui dit si l'image tient.
 */
import { motsNormalises } from './reelExplique';

/** Une ligne de la carte du brief : l'élément tel que le contenu le nomme, et ce qu'il représente. */
export interface LigneDeCarte { element: string; realite: string }

/** Ce qu'un inconnu a lu dans une image du contenu. */
export interface LigneLue { element: string; represente: string }

/** L'intention et la lecture, face à face. `null` : l'un des deux n'en dit rien. */
export interface LigneConfrontee { element: string; voulu: string | null; compris: string | null }

const texte = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const textes = (v: unknown): string[] => (Array.isArray(v) ? v.map(texte).filter(Boolean) : []);

/** La carte d'un brief verrouillé. Un brief d'avant la carte en rend une vide. */
export function carteDuBrief(brief: unknown): LigneDeCarte[] {
    const carte = (brief as any)?.metaphore?.carte;
    if (!Array.isArray(carte)) return [];
    return carte
        .map(l => ({ element: texte(l?.element), realite: texte(l?.realite) }))
        .filter(l => l.element && l.realite);
}

/** Les images que l'atelier a écartées : elles n'apparaissent nulle part. */
export const horsImageDuBrief = (brief: unknown): string[] => textes((brief as any)?.metaphore?.hors_image);

/** Ce que le Lecteur froid a lu dans chaque image. Une relecture d'avant la carte en rend une vide. */
export function carteLue(rapport: unknown): LigneLue[] {
    const carte = (rapport as any)?.lecture_naive?.carte_percue;
    if (!Array.isArray(carte)) return [];
    return carte
        .map(l => ({ element: texte(l?.element), represente: texte(l?.represente) }))
        .filter(l => l.element && l.represente);
}

// Les mots qui ne désignent rien seuls : « la digue » et « une digue fissurée »
// parlent du même élément, « la » et « une » n'y sont pour rien.
const MOTS_VIDES = new Set([
    'le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd', 'au', 'aux', 'et', 'en', 'a',
    'son', 'sa', 'ses', 'votre', 'vos', 'mon', 'ma', 'mes', 'qui', 'que', 'qu', 'on', 'ce', 'cette',
]);

/** Les mots pleins, au singulier approché : « sparadraps » retrouve « sparadrap ». */
const motsPleins = (designation: string): string[] =>
    motsNormalises(designation)
        .filter(m => !MOTS_VIDES.has(m))
        .map(m => (m.length > 3 ? m.replace(/[sx]$/, '') : m));

const memeElement = (a: string, b: string): boolean => {
    const deA = new Set(motsPleins(a));
    return motsPleins(b).some(m => m.length >= 3 && deA.has(m));
};

/**
 * Ce que l'auteur voulait dire en face de ce qu'un inconnu a compris, dans
 * l'ordre de la carte. L'appariement se fait sur les mots et ne juge pas le
 * sens : c'est Florent qui lit l'écart. Un élément que l'inconnu n'a pas relevé
 * garde `compris` à `null` — ne pas le voir est aussi une lecture ; une image
 * que la carte ignore vient en fin, `voulu` à `null` : c'est souvent elle,
 * l'image de trop.
 */
export function confronterLesCartes(voulue: LigneDeCarte[], lue: LigneLue[]): LigneConfrontee[] {
    const prises = new Set<number>();
    const lignes: LigneConfrontee[] = voulue.map(v => {
        const i = lue.findIndex((l, k) => !prises.has(k) && memeElement(v.element, l.element));
        if (i < 0) return { element: v.element, voulu: v.realite, compris: null };
        prises.add(i);
        return { element: v.element, voulu: v.realite, compris: lue[i].represente };
    });
    lue.forEach((l, k) => { if (!prises.has(k)) lignes.push({ element: l.element, voulu: null, compris: l.represente }); });
    return lignes;
}
