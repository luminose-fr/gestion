import { ContentItem, AIModel, Serie, AppSettings, DisplayPrefs, DEFAULT_DISPLAY_PREFS } from "../types";

const DB_NAME = "LuminoseDB";
/**
 * v4 — bascule Notion → D1 (SPEC §11, phase 5) : les items en cache portaient
 *      l'ancienne forme (`body`, `scriptVideo`, `analyzed`, `lastEdited` en
 *      ISO). Les lire avec le nouveau modèle donnerait un affichage
 *      silencieusement faux, d'où la purge sous ce seuil.
 * v5 — les Séries (SPEC §11, phase 7) : un store s'ajoute, aucune forme
 *      existante ne change. Rien à jeter.
 */
const DB_VERSION = 5;
const STORE_CONTENT = "content";
const STORE_MODELS = "models";
const STORE_SERIES = "series";
const STORES = [STORE_CONTENT, STORE_MODELS, STORE_SERIES];
const SYNC_PREFIX = "luminose_sync_";
const FULL_SYNC_PREFIX = "luminose_full_sync_";
const APP_SETTINGS_KEY = "luminose_app_settings";

export type SyncScope = "content" | "models" | "series";

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      // Sous la v4, le cache porte les formes d'avant la bascule : illisibles
      // par le modèle actuel, on les jette et la première synchronisation
      // repeuple depuis l'API (voir DB_VERSION).
      if (event.oldVersion < 4) {
        for (const store of STORES) {
          if (db.objectStoreNames.contains(store)) db.deleteObjectStore(store);
        }
      }
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: "id" });
      }
    };

    request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
    request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
  });
};

/**
 * Ouvre la DB, exécute une opération, puis ferme la connexion.
 * Garantit qu'on ne laisse jamais de connexion ouverte indéfiniment.
 */
const withDB = async <T>(operation: (db: IDBDatabase) => Promise<T>): Promise<T> => {
  const db = await openDB();
  try {
    return await operation(db);
  } finally {
    db.close();
  }
};

/**
 * Lecture d'un store entier. Un store absent (montée de version en cours,
 * cache jamais peuplé) rend un tableau vide : l'application démarre alors sur
 * l'API, elle ne plante pas.
 */
const readAll = <T>(store: string): Promise<T[]> =>
  withDB(db => new Promise((resolve, reject) => {
    try {
      const request = db.transaction(store, "readonly").objectStore(store).getAll();
      request.onsuccess = () => resolve((request.result || []) as T[]);
      request.onerror = () => reject(request.error);
    } catch (e) {
      console.warn(`Store ${store} introuvable, retour tableau vide`, e);
      resolve([]);
    }
  }));

/** Remplace le contenu d'un store — le cache reflète l'état serveur, pas une accumulation. */
const replaceAll = <T>(store: string, rows: T[]): Promise<void> =>
  withDB(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(store, "readwrite");
    const objectStore = transaction.objectStore(store);
    objectStore.clear();
    rows.forEach(row => objectStore.put(row));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  }));

export const getCachedContent = (): Promise<ContentItem[]> => readAll<ContentItem>(STORE_CONTENT);

export const setCachedContent = (items: ContentItem[]): Promise<void> => replaceAll(STORE_CONTENT, items);

export const updateCachedItem = (item: ContentItem): Promise<void> =>
  withDB(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_CONTENT, "readwrite");
    transaction.objectStore(STORE_CONTENT).put(item);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  }));

export const getCachedModels = (): Promise<AIModel[]> => readAll<AIModel>(STORE_MODELS);

export const setCachedModels = (models: AIModel[]): Promise<void> => replaceAll(STORE_MODELS, models);

export const getCachedSeries = (): Promise<Serie[]> => readAll<Serie>(STORE_SERIES);

export const setCachedSeries = (series: Serie[]): Promise<void> => replaceAll(STORE_SERIES, series);

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

export const getAppSettings = (): AppSettings => {
  const raw = safeGetLocalStorage(APP_SETTINGS_KEY);
  if (!raw) return { displayPrefs: { ...DEFAULT_DISPLAY_PREFS } };
  try {
    const parsed = JSON.parse(raw) as AppSettings;
    return {
      ...parsed,
      displayPrefs: { ...DEFAULT_DISPLAY_PREFS, ...(parsed.displayPrefs || {}) },
    };
  } catch {
    return { displayPrefs: { ...DEFAULT_DISPLAY_PREFS } };
  }
};

export const setAppSettings = (settings: AppSettings): void => {
  safeSetLocalStorage(APP_SETTINGS_KEY, JSON.stringify(settings));
};

export const getDisplayPrefs = (): DisplayPrefs => {
  return getAppSettings().displayPrefs || { ...DEFAULT_DISPLAY_PREFS };
};

export const setDisplayPrefs = (prefs: DisplayPrefs): void => {
  const current = getAppSettings();
  setAppSettings({ ...current, displayPrefs: prefs });
};

/** Modèle IA actif (vérité runtime côté app). undefined = pas encore choisi → seed depuis le catalogue. */
export const getActiveModelId = (): string | undefined => {
  return getAppSettings().activeModelId;
};

export const setActiveModelId = (modelId: string): void => {
  const current = getAppSettings();
  setAppSettings({ ...current, activeModelId: modelId });
};
