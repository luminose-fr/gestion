import { ContentItem, ContextItem, AIModel } from "../types";

const DB_NAME = "LuminoseDB";
const DB_VERSION = 3; // Incrémenté pour forcer la mise à jour du schéma (création de 'models')
const STORE_CONTENT = "content";
const STORE_CONTEXTS = "contexts";
const STORE_MODELS = "models";
const SYNC_PREFIX = "luminose_sync_";
const FULL_SYNC_PREFIX = "luminose_full_sync_";

export type SyncScope = "content" | "contexts" | "models";

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_CONTENT)) {
        db.createObjectStore(STORE_CONTENT, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_CONTEXTS)) {
        db.createObjectStore(STORE_CONTEXTS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_MODELS)) {
        db.createObjectStore(STORE_MODELS, { keyPath: "id" });
      }
    };

    request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
    request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
  });
};

export const getCachedContent = async (): Promise<ContentItem[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_CONTENT, "readonly");
      const store = transaction.objectStore(STORE_CONTENT);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    } catch (e) {
      // Fallback si le store n'existe pas encore (cas rare après upgrade)
      resolve([]);
    }
  });
};

export const setCachedContent = async (items: ContentItem[]): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_CONTENT, "readwrite");
    const store = transaction.objectStore(STORE_CONTENT);
    store.clear();
    items.forEach(item => store.put(item));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const updateCachedItem = async (item: ContentItem): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_CONTENT, "readwrite");
        const store = transaction.objectStore(STORE_CONTENT);
        store.put(item);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
};

export const getCachedContexts = async (): Promise<ContextItem[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_CONTEXTS, "readonly");
      const store = transaction.objectStore(STORE_CONTEXTS);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    } catch (e) {
      resolve([]);
    }
  });
};

export const setCachedContexts = async (contexts: ContextItem[]): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_CONTEXTS, "readwrite");
    const store = transaction.objectStore(STORE_CONTEXTS);
    store.clear();
    contexts.forEach(ctx => store.put(ctx));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const getCachedModels = async (): Promise<AIModel[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_MODELS, "readonly");
      const store = transaction.objectStore(STORE_MODELS);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    } catch (e) {
      // Evite le crash si le store n'est pas encore prêt
      console.warn("Store models introuvable, retour tableau vide", e);
      resolve([]);
    }
  });
};

export const setCachedModels = async (models: AIModel[]): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_MODELS, "readwrite");
    const store = transaction.objectStore(STORE_MODELS);
    store.clear();
    models.forEach(m => store.put(m));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

const safeGetLocalStorage = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.warn("LocalStorage inaccessible:", e);
    return null;
  }
};

const safeSetLocalStorage = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn("LocalStorage inaccessible:", e);
  }
};

export const getLastSync = (scope: SyncScope): string | null => {
  return safeGetLocalStorage(`${SYNC_PREFIX}${scope}`);
};

export const setLastSync = (scope: SyncScope, isoDate: string): void => {
  safeSetLocalStorage(`${SYNC_PREFIX}${scope}`, isoDate);
};

export const getLastFullSync = (scope: SyncScope): string | null => {
  return safeGetLocalStorage(`${FULL_SYNC_PREFIX}${scope}`);
};

export const setLastFullSync = (scope: SyncScope, isoDate: string): void => {
  safeSetLocalStorage(`${FULL_SYNC_PREFIX}${scope}`, isoDate);
};
