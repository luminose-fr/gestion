/**
 * Les visuels déposés sur les cartes d'un Reel expliqué (SPEC §12.4).
 *
 * Ils vivent dans le navigateur, et seulement là : la vidéo ne quitte pas le
 * poste où elle se monte, ses images non plus. Aucune n'a de raison de passer
 * par le Worker — elles ne servent qu'au rendu, qui se fait ici.
 *
 * Ce que ça coûte, dit franchement : un visuel déposé sur le Mac n'existe pas
 * sur un autre poste, et vider les données du site l'efface. Le storyboard dit
 * donc toujours ce qui reste à produire, déposé ou non.
 *
 * Base à part (`LuminoseVisuels`) plutôt qu'un magasin de plus dans
 * `LuminoseDB` : ajouter un magasin là-bas exigerait d'en monter la version, et
 * cette montée purge le cache des contenus sous la v4. Rien à gagner à lier les
 * deux.
 */

const DB_NAME = 'LuminoseVisuels';
const DB_VERSION = 1;
const STORE = 'visuels';

export interface VisuelDepose {
    /** `contenu:séquence:élément` — voir `cleVisuel`. */
    cle: string;
    contenuId: string;
    sequence: number;
    element: number;
    /**
     * La description à laquelle l'image répondait au moment du dépôt. Une
     * rédaction suivante peut changer la carte : l'écran le signale plutôt que de
     * poser une image sur une description qui n'est plus la sienne.
     */
    description: string;
    image: Blob;
    deposeLe: number;
}

/**
 * La place d'un visuel : un contenu, une séquence, un élément. Le rang suffit —
 * une nouvelle rédaction qui déplace les cartes change aussi les descriptions,
 * et c'est la description qui dit si l'image va encore.
 */
export const cleVisuel = (contenuId: string, sequence: number, element: number): string =>
    `${contenuId}:${sequence}:${element}`;

const ouvrir = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB indisponible'));
        return;
    }
    const requete = indexedDB.open(DB_NAME, DB_VERSION);
    requete.onupgradeneeded = () => {
        const db = requete.result;
        if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE, { keyPath: 'cle' }).createIndex('contenuId', 'contenuId');
        }
    };
    requete.onsuccess = () => resolve(requete.result);
    requete.onerror = () => reject(requete.error);
});

const transaction = async <T>(mode: IDBTransactionMode, travail: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await ouvrir();
    try {
        return await new Promise<T>((resolve, reject) => {
            const requete = travail(db.transaction(STORE, mode).objectStore(STORE));
            requete.onsuccess = () => resolve(requete.result);
            requete.onerror = () => reject(requete.error);
        });
    } finally {
        db.close();
    }
};

export const listerVisuels = (contenuId: string): Promise<VisuelDepose[]> =>
    transaction('readonly', store => store.index('contenuId').getAll(contenuId) as IDBRequest<VisuelDepose[]>);

export const deposerVisuel = (visuel: VisuelDepose): Promise<IDBValidKey> =>
    transaction('readwrite', store => store.put(visuel));

export const retirerVisuel = (cle: string): Promise<undefined> =>
    transaction('readwrite', store => store.delete(cle) as IDBRequest<undefined>);
