import { ContentItem, ContextItem } from "../types";

const DB_NAME = "LuminoseDB";
const DB_VERSION = 1;
const STORE_CONTENT = "content";
const STORE_CONTEXTS = "contexts";

// Helper pour ouvrir la base de données
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
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
};

// --- CONTENT OPERATIONS ---

export const getCachedContent = async (): Promise<ContentItem[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_CONTENT, "readonly");
    const store = transaction.objectStore(STORE_CONTENT);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

export const setCachedContent = async (items: ContentItem[]): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_CONTENT, "readwrite");
    const store = transaction.objectStore(STORE_CONTENT);
    
    // On efface tout pour éviter les fantômes (items supprimés dans Notion)
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

// --- CONTEXT OPERATIONS ---

export const getCachedContexts = async (): Promise<ContextItem[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_CONTEXTS, "readonly");
    const store = transaction.objectStore(STORE_CONTEXTS);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
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
