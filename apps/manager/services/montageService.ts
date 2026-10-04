/**
 * Ce que le montage d'un Reel expliqué garde dans le navigateur (SPEC §12.4) :
 * les visuels déposés sur les cartes, et les prises vidéo avec leur
 * transcription.
 *
 * Ils vivent ici, et seulement ici : la vidéo ne quitte pas le poste où elle se
 * monte, ses images non plus. Seul le SON d'une prise part, une fois, pour être
 * transcrit (§12.5) ; la transcription revient et se range à côté de la prise.
 *
 * Ce que ça coûte, dit franchement : ce qui est déposé sur le Mac n'existe pas
 * sur un autre poste, et vider les données du site l'efface. Une prise pèse ce
 * que pèse la vidéo — l'écran propose de la retirer une fois la vidéo exportée.
 *
 * Base à part (`LuminoseMontage`) plutôt que des magasins de plus dans
 * `LuminoseDB` : en ajouter là-bas exigerait d'en monter la version, et cette
 * montée purge le cache des contenus sous la v4. Rien à gagner à lier les deux.
 */
import type { Transcription } from '@luminose/shared';

const DB_NAME = 'LuminoseMontage';
const DB_VERSION = 1;
const VISUELS = 'visuels';
const PRISES = 'prises';
/**
 * Le fichier d'une prise vit à part de ses métadonnées : corriger un repère
 * réécrit la ligne de la prise, et il ne faut pas que ce soit des centaines de
 * mégaoctets à chaque clic.
 */
const FICHIERS = 'fichiers';

// ── Les visuels ──────────────────────────────────────────────────────

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

// ── Les prises ───────────────────────────────────────────────────────

/** La prise principale, et la seconde accroche tournée pour la publicité. */
export type RolePrise = 'principale' | 'accroche';

export interface PriseDeposee {
    /** `contenu:rôle`. */
    cle: string;
    contenuId: string;
    role: RolePrise;
    nom: string;
    /** En secondes ; largeur et hauteur en pixels affichés. */
    duree: number;
    largeur: number;
    hauteur: number;
    transcription: Transcription | null;
    transcriteLe: number | null;
    /**
     * Les repères corrigés à la main, en secondes dans la prise, par
     * `séquence:élément`. Ils survivent à une nouvelle transcription : c'est
     * Florent qui a vu la vidéo.
     */
    reperes: Record<string, number>;
    deposeeLe: number;
}

export const clePrise = (contenuId: string, role: RolePrise): string => `${contenuId}:${role}`;

// ── La base ──────────────────────────────────────────────────────────

const ouvrir = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB indisponible'));
        return;
    }
    const requete = indexedDB.open(DB_NAME, DB_VERSION);
    requete.onupgradeneeded = () => {
        const db = requete.result;
        for (const magasin of [VISUELS, PRISES]) {
            if (!db.objectStoreNames.contains(magasin)) {
                db.createObjectStore(magasin, { keyPath: 'cle' }).createIndex('contenuId', 'contenuId');
            }
        }
        if (!db.objectStoreNames.contains(FICHIERS)) db.createObjectStore(FICHIERS);
    };
    requete.onsuccess = () => resolve(requete.result);
    requete.onerror = () => reject(requete.error);
});

const transaction = async <T>(magasin: string, mode: IDBTransactionMode, travail: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await ouvrir();
    try {
        return await new Promise<T>((resolve, reject) => {
            const requete = travail(db.transaction(magasin, mode).objectStore(magasin));
            requete.onsuccess = () => resolve(requete.result);
            requete.onerror = () => reject(requete.error);
        });
    } finally {
        db.close();
    }
};

export const listerVisuels = (contenuId: string): Promise<VisuelDepose[]> =>
    transaction(VISUELS, 'readonly', store => store.index('contenuId').getAll(contenuId) as IDBRequest<VisuelDepose[]>);

export const deposerVisuel = (visuel: VisuelDepose): Promise<IDBValidKey> =>
    transaction(VISUELS, 'readwrite', store => store.put(visuel));

export const retirerVisuel = (cle: string): Promise<undefined> =>
    transaction(VISUELS, 'readwrite', store => store.delete(cle) as IDBRequest<undefined>);

export const listerPrises = (contenuId: string): Promise<PriseDeposee[]> =>
    transaction(PRISES, 'readonly', store => store.index('contenuId').getAll(contenuId) as IDBRequest<PriseDeposee[]>);

export const lireFichierDePrise = (cle: string): Promise<Blob | undefined> =>
    transaction(FICHIERS, 'readonly', store => store.get(cle) as IDBRequest<Blob | undefined>);

/** Les métadonnées seules — une transcription, un repère corrigé. */
export const enregistrerPrise = (prise: PriseDeposee): Promise<IDBValidKey> =>
    transaction(PRISES, 'readwrite', store => store.put(prise));

/** Une prise neuve : son fichier et ses métadonnées, ensemble ou pas du tout. */
export const deposerPrise = async (prise: PriseDeposee, fichier: Blob): Promise<void> => {
    const db = await ouvrir();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction([PRISES, FICHIERS], 'readwrite');
            tx.objectStore(FICHIERS).put(fichier, prise.cle);
            tx.objectStore(PRISES).put(prise);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error ?? new Error('Enregistrement de la prise interrompu'));
        });
    } finally {
        db.close();
    }
};

export const retirerPrise = async (cle: string): Promise<void> => {
    const db = await ouvrir();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction([PRISES, FICHIERS], 'readwrite');
            tx.objectStore(FICHIERS).delete(cle);
            tx.objectStore(PRISES).delete(cle);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
};
