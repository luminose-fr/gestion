/**
 * Le cache local des prises d'un Reel expliqué (SPEC §12.4, v2.8).
 *
 * Les prises vivent chez Cloudflare (R2) ; ce cache évite d'en retélécharger
 * des centaines de mégaoctets à chaque ouverture du storyboard. Il n'est qu'un
 * cache : le vider ne perd rien, la prise se retélécharge.
 *
 * La clé est l'objet R2 (`r2Cle`), neuf à chaque dépôt : un fichier en cache
 * sous la bonne clé est forcément la bonne version, sans rien comparer. Une
 * seule version gardée par place (contenu, rôle) — la précédente part quand la
 * suivante arrive, sinon le cache grossirait d'une prise à chaque
 * remplacement.
 *
 * Base à part (`LuminoseMontageCache`) plutôt qu'un magasin de plus dans
 * `LuminoseDB` : en ajouter un là-bas exigerait d'en monter la version, et
 * cette montée purge le cache des contenus sous la v4.
 */

const DB_NAME = 'LuminoseMontageCache';
const DB_VERSION = 1;
const PRISES = 'prises';

interface PriseEnCache {
    r2Cle: string;
    /** `contenu:rôle`. */
    place: string;
    fichier: Blob;
    misEnCacheLe: number;
}

export const placeDe = (contenuId: string, role: string): string => `${contenuId}:${role}`;

const ouvrir = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB indisponible'));
        return;
    }
    const requete = indexedDB.open(DB_NAME, DB_VERSION);
    requete.onupgradeneeded = () => {
        const db = requete.result;
        if (!db.objectStoreNames.contains(PRISES)) {
            db.createObjectStore(PRISES, { keyPath: 'r2Cle' }).createIndex('place', 'place');
        }
    };
    requete.onsuccess = () => resolve(requete.result);
    requete.onerror = () => reject(requete.error);
});

const avecLaBase = async <T>(travail: (db: IDBDatabase) => Promise<T>): Promise<T> => {
    const db = await ouvrir();
    try {
        return await travail(db);
    } finally {
        db.close();
    }
};

const attendre = <T>(requete: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
    requete.onsuccess = () => resolve(requete.result);
    requete.onerror = () => reject(requete.error);
});

/** Le fichier en cache pour cet objet R2, ou `undefined`. Un cache illisible vaut un cache vide. */
export const lireEnCache = async (r2Cle: string): Promise<Blob | undefined> => {
    try {
        return await avecLaBase(async db =>
            (await attendre(db.transaction(PRISES).objectStore(PRISES).get(r2Cle)) as PriseEnCache | undefined)?.fichier);
    } catch {
        return undefined;
    }
};

/** Met une prise en cache, et oublie les versions précédentes de la même place. */
export const mettreEnCache = async (r2Cle: string, place: string, fichier: Blob): Promise<void> => {
    try {
        await avecLaBase(db => new Promise<void>((resolve, reject) => {
            const tx = db.transaction(PRISES, 'readwrite');
            const store = tx.objectStore(PRISES);
            const anciennes = store.index('place').getAllKeys(place);
            anciennes.onsuccess = () => {
                for (const cle of anciennes.result) if (cle !== r2Cle) store.delete(cle);
                store.put({ r2Cle, place, fichier, misEnCacheLe: Date.now() } satisfies PriseEnCache);
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        }));
    } catch {
        /* un cache qui refuse d'écrire coûte un téléchargement de plus, rien d'autre */
    }
};

/** Oublie tout ce qui est en cache pour une place : la prise a été retirée. */
export const oublier = async (place: string): Promise<void> => {
    try {
        await avecLaBase(db => new Promise<void>((resolve, reject) => {
            const tx = db.transaction(PRISES, 'readwrite');
            const store = tx.objectStore(PRISES);
            const cles = store.index('place').getAllKeys(place);
            cles.onsuccess = () => { for (const cle of cles.result) store.delete(cle); };
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        }));
    } catch {
        /* rien à oublier dans un cache qu'on ne peut pas ouvrir */
    }
};
