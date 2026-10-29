import { illustrationsDuReel, promptIllustration, MODELES_ILLUSTRATION, type ReelExplique } from '@luminose/editorial';
import * as AI from '../../services/aiService';
// L'étalon des illustrations des pages de luminose.fr (`_ai_helpers/etalon.jpg`
// du dépôt du site), réduit à 1 200 pixels : il voyage avec chaque demande.
import etalon from '../../images/etalon-illustrations.jpg';

/**
 * Une illustration du Reel, générée dans le style du site (SPEC §12.3, v2.28) :
 * l'étalon joint, et pour l'autre état d'une scène, sa première illustration —
 * c'est elle qui garde le même lieu, le même personnage, aux mêmes places.
 */

/** Une image, en URL de données : la forme qu'acceptent les modèles d'image. */
export const enDonnees = async (url: string): Promise<string> => {
    const brut = await (await fetch(url)).blob();
    // Un serveur qui ne dit pas le type d'une image la ferait refuser à la frontière : on le rétablit.
    const blob = brut.type.startsWith('image/') ? brut : new Blob([brut], { type: /\.png$/i.test(url) ? 'image/png' : 'image/jpeg' });
    return await new Promise<string>((resolu, rejete) => {
        const lecteur = new FileReader();
        lecteur.onload = () => resolu(String(lecteur.result));
        lecteur.onerror = () => rejete(lecteur.error);
        lecteur.readAsDataURL(blob);
    });
};

/** Une URL de données, en fichier à déposer : l'image gardée se range comme une image déposée. */
export const enFichier = async (donnees: string, nom: string): Promise<File> => {
    const blob = await (await fetch(donnees)).blob();
    const extension = blob.type.split('/')[1] || 'png';
    return new File([blob], `${nom}.${extension}`, { type: blob.type || 'image/png' });
};

export interface IllustrationProposee {
    image: string;
    modelLabel: string;
    coutUsd: number | null;
}

/**
 * Génère l'illustration de rang `rang`. `urlDe(id)` donne l'image déjà gardée
 * d'une illustration, pour celle qui en est la suite.
 */
export async function genererIllustration(
    reel: ReelExplique,
    rang: number,
    modele: string,
    urlDe: (id: string) => string | undefined,
): Promise<IllustrationProposee> {
    const illustrations = illustrationsDuReel(reel);
    const illustration = illustrations[rang];
    if (!illustration) throw new Error('Cette illustration n’existe plus dans le script.');
    const depuis = illustration.depuis ? illustrations.find(i => i.id === illustration.depuis) ?? null : null;
    const base = depuis ? urlDe(depuis.id) : undefined;
    if (depuis && !base) throw new Error(`Gardez d’abord « ${depuis.id} » : celle-ci en est la suite.`);
    const references = [await enDonnees(etalon), ...(base ? [await enDonnees(base)] : [])];
    const libelle = MODELES_ILLUSTRATION.find(m => m.id === modele)?.libelle ?? modele;
    const { image, modelLabel, usage } = await AI.genererIllustration({
        modele, libelle, prompt: promptIllustration(illustration, depuis), references,
    });
    return { image, modelLabel, coutUsd: usage.coutUsd };
}
