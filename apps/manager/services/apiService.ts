/**
 * Client de l'API D1 — remplace notionService (1040 lignes).
 *
 * Il ne reste presque rien : plus d'introspection de schéma, plus de moteur
 * rich-text, plus de découpe à 2000 caractères, plus de balayage
 * d'identifiants pour détecter les suppressions. Une colonne est une colonne.
 *
 * Le jeton de session voyage en en-tête `X-Session-Token` (SPEC §7).
 */
import { WORKER_URL } from '../constants';
import { getSessionToken } from '../auth';
import type {
  Content, Serie, AIModel, Generation, CoachSession, CoachMessage,
} from '@luminose/shared';

const api = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const res = await fetch(`${WORKER_URL}/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Token': getSessionToken() ?? '',
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* réponse non-JSON */ }

  if (!res.ok) {
    // On remonte le message du serveur : c'est lui qui sait ce qui cloche.
    const detail = data?.error ?? text.slice(0, 200) ?? '';
    throw new Error(`Erreur ${res.status}${detail ? ` — ${detail}` : ''}`);
  }
  return data as T;
};

const body = (payload: unknown) => ({ body: JSON.stringify(payload) });

// ── Contenus ─────────────────────────────────────────────────────────────

/**
 * Synchronisation (SPEC §8). Avec `since`, la réponse contient AUSSI les
 * lignes supprimées : c'est ce qui permet de purger le cache local sans
 * aucune requête supplémentaire.
 */
export const fetchContents = (since?: number) =>
  api<{ items: Content[]; syncedAt: number }>(
    since === undefined ? '/contents' : `/contents?since=${since}`
  );

/** Le détail porte la session Coach assemblée ; la liste ne l'a pas. */
export const fetchContent = (id: string) =>
  api<{ content: Content; coachSession: CoachSession }>(`/contents/${id}`);

export const createContent = (input: Partial<Content>) =>
  api<{ content: Content }>('/contents', { method: 'POST', ...body(input) });

export const updateContent = (id: string, input: Partial<Content> & { analyzed?: boolean }) =>
  api<{ content: Content }>(`/contents/${id}`, { method: 'PATCH', ...body(input) });

export const deleteContent = (id: string) =>
  api<{ deleted: boolean }>(`/contents/${id}`, { method: 'DELETE' });

/** Création en lot — le plan de série. Transactionnelle côté Worker. */
export const createContentsBatch = (items: Partial<Content>[]) =>
  api<{ items: Content[] }>('/contents/batch', { method: 'POST', ...body({ items }) });

// ── Séries ───────────────────────────────────────────────────────────────

export const fetchSeries = (since?: number) =>
  api<{ items: Serie[]; syncedAt: number }>(
    since === undefined ? '/series' : `/series?since=${since}`
  );

export const fetchSerie = (id: string) =>
  api<{ serie: Serie; contents: Content[] }>(`/series/${id}`);

export const createSerie = (input: Partial<Serie>) =>
  api<{ serie: Serie }>('/series', { method: 'POST', ...body(input) });

export const updateSerie = (id: string, input: Partial<Serie>) =>
  api<{ serie: Serie }>(`/series/${id}`, { method: 'PATCH', ...body(input) });

export const deleteSerie = (id: string) =>
  api<{ deleted: boolean; detachedContents: number }>(`/series/${id}`, { method: 'DELETE' });

// ── Modèles IA ───────────────────────────────────────────────────────────

export const fetchModels = () => api<{ items: AIModel[] }>('/models');

export const createModel = (input: Partial<AIModel>) =>
  api<{ model: AIModel }>('/models', { method: 'POST', ...body(input) });

export const updateModel = (id: string, input: Partial<AIModel>) =>
  api<{ model: AIModel }>(`/models/${id}`, { method: 'PATCH', ...body(input) });

export const deleteModel = (id: string) =>
  api<{ deleted: boolean }>(`/models/${id}`, { method: 'DELETE' });

/** Marquer un défaut démarque les autres, côté Worker et dans le même batch. */
export const setModelDefault = (id: string, isDefault: boolean) =>
  updateModel(id, { isDefault });

// ── Explorateur du catalogue OpenRouter (SPEC §5.6) ──────────────────────

export interface CatalogueModel {
  id: string;
  name: string;
  contextLength: number;
  /** Prix par million de jetons, en dollars. `null` quand OpenRouter n'en publie pas. */
  promptPrice: number | null;
  completionPrice: number | null;
  /** Indices d'Artificial Analysis, quand le modèle y figure. */
  intelligence: number | null;
  coding: number | null;
  agentic: number | null;
  /** Notes d'écriture (EQ-Bench), quand le modèle y figure. */
  elo: number | null;
  ecriture: number | null;
  /** Densité de tournures d'IA. PLUS BAS EST MEILLEUR. */
  slop: number | null;
  suivi: number | null;
  /** Ce sur quoi ce modèle est RELATIVEMENT fort, en français. */
  forces: string[];
  /** Retenu dans la courte liste, et le palier de prix qui l'explique. */
  selection: boolean;
  palier: string | null;
  palierLibelle: string | null;
}

export const fetchCatalogue = () =>
  api<{
    models: CatalogueModel[];
    benchmarksAvailable: boolean;
    benchmarksReason: string | null;
    ecritureAvailable: boolean;
    ecritureReason: string | null;
    /** L'ordre de la courte liste, du moins cher au plus cher. */
    selection: string[];
    fetchedAt: number;
  }>('/models/catalogue');

// ── Clés des fournisseurs (SPEC §5.5) ────────────────────────────────────

/**
 * L'état d'un adaptateur, tel que le Worker accepte de le décrire : posée ou
 * non, d'où elle vient, et son empreinte. Jamais la clé — elle n'a aucun
 * chemin de retour vers le navigateur.
 */
export interface ProviderKeyState {
  id: string;
  label: string;
  configured: boolean;
  hint: string | null;
  source: 'base' | 'environnement' | null;
  updatedAt: number | null;
}

export const fetchProviders = () => api<{ providers: ProviderKeyState[] }>('/settings/providers');

export const setProviderKey = (id: string, apiKey: string) =>
  api<ProviderKeyState>(`/settings/providers/${id}`, { method: 'PUT', ...body({ apiKey }) });

export const deleteProviderKey = (id: string) =>
  api<ProviderKeyState>(`/settings/providers/${id}`, { method: 'DELETE' });

// ── Modèle par action ────────────────────────────────────────────────────

/** `{ DRAFT_CONTENT: '<id>' }` — les actions absentes prennent le modèle actif. */
export const fetchActionModels = () => api<{ actions: Record<string, string> }>('/settings/actions');

export const setActionModel = (action: string, modelId: string | null) =>
  api<{ action: string; modelId: string | null }>(`/settings/actions/${action}`, {
    method: 'PUT', ...body({ modelId }),
  });

// ── Sauvegarde complète (SPEC §9.4) ──────────────────────────────────────

/**
 * Le jeton de session voyage en en-tête : un simple lien ne peut donc pas
 * télécharger l'export, il faut passer par une requête puis un blob. On rend
 * le nom de fichier proposé par le Worker — daté, donc restaurable sans doute.
 */
export const fetchExport = async (): Promise<{ blob: Blob; filename: string }> => {
  const res = await fetch(`${WORKER_URL}/api/export`, {
    headers: { 'X-Session-Token': getSessionToken() ?? '' },
  });
  if (!res.ok) {
    throw new Error(`Erreur ${res.status} — la sauvegarde n'a pas pu être produite.`);
  }
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1]
    ?? `luminose-export-${new Date().toISOString().slice(0, 10)}.json`;
  return { blob: await res.blob(), filename };
};

// ── Conversation Coach (SPEC §2.7) ───────────────────────────────────────

export const appendCoachMessage = (
  contentId: string,
  message: Pick<CoachMessage, 'role' | 'content'> & Partial<Pick<CoachMessage, 'raw' | 'quickReplies' | 'readyForEditor'>>
) => api<{ message: CoachMessage }>(`/contents/${contentId}/coach/messages`, { method: 'POST', ...body(message) });

export const updateCoach = (
  contentId: string,
  input: { status?: 'in_progress' | 'validated' | null; formatCible?: string | null; brief?: string | null }
) => api<{ updated: boolean }>(`/contents/${contentId}/coach`, { method: 'PATCH', ...body(input) });

/**
 * Réinitialise la session : la conversation sort de la vue, l'état repart à
 * zéro. Les messages ne sont pas détruits côté base — la session qu'on jette
 * est justement celle qu'on voudra peut-être relire.
 */
export const resetCoach = (contentId: string) =>
  api<{ reset: boolean; messages: number }>(`/contents/${contentId}/coach`, { method: 'DELETE' });

// ── Journal des générations (SPEC §2.6) ──────────────────────────────────

export const fetchGenerations = (contentId: string, kind?: string) =>
  api<{ generations: Generation[] }>(
    `/contents/${contentId}/generations${kind ? `?kind=${kind}` : ''}`
  );

/**
 * Journalise une production IA. Avec `apply`, écrit aussi la colonne visée —
 * les deux dans le même batch, pour qu'un contenu ne puisse jamais porter une
 * valeur dont la provenance manque.
 */
export const recordGeneration = (contentId: string, input: {
  kind: Generation['kind'];
  target?: 'draft' | 'slides' | null;
  modelId?: string | null;
  modelLabel: string;
  instruction?: string | null;
  payload: string;
  apply?: boolean;
}) => api<{ generation: Generation }>(`/contents/${contentId}/generations`, { method: 'POST', ...body(input) });

export const revertGeneration = (contentId: string, generationId: string) =>
  api<{ reverted: boolean }>(`/contents/${contentId}/generations/${generationId}/revert`, {
    method: 'POST', ...body({}),
  });
