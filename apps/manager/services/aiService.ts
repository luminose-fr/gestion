/**
 * Appels IA — le front ne connaît AUCUN fournisseur.
 *
 * Il envoie un identifiant de modèle du catalogue ; le Worker lit la colonne
 * `provider` de cette ligne et choisit l'adaptateur (SPEC §5.3). Passer un
 * modèle de 1min.ai à un accès direct ne demande donc aucune modification ici.
 *
 * Remplace oneMinService, qui portait les contorsions de 1min.ai jusque dans
 * l'application — aplatissement de l'historique compris.
 */
import { WORKER_URL } from '../constants';
import { getSessionToken } from '../auth';
import { AI_ACTION_CATALOG } from '@luminose/editorial';
import * as Activite from './activityService';
import type { ChatMessage, UsageIA } from '@luminose/shared';

/** Aucun décompte reçu : on ne l'invente pas (voir `UsageIA`). */
const USAGE_INCONNU: UsageIA = { entree: null, sortie: null, coutUsd: null };

export interface GenerateRequest {
  /** Identifiant du modèle dans le catalogue — pas son code d'API. */
  modelId: string;
  prompt: string;
  systemInstruction?: string;
  /** Historique multi-tour. L'adaptateur s'arrange du format du fournisseur. */
  history?: ChatMessage[];
  /** Demander une sortie JSON stricte, si le fournisseur sait le faire. */
  json?: boolean;
  /** Ce que Florent a demandé, en clair — « Relecture à froid ». Sert au message d'échec. */
  action?: string;
  /**
   * L'action éditoriale technique — `DRAFT_CONTENT`, `COLD_READ`…
   *
   * Elle décide de la feuille de salle que le Worker joindra au prompt.
   * Absente, l'appel est celui d'avant le corpus, à l'octet près : c'est la
   * marche arrière, et elle ne demande pas de redéployer le front.
   */
  aiAction?: string;
}

// ── Les échecs se montrent TOUS, et de la même façon ─────────────────────

/** Un appel IA qui a échoué, tel qu'il doit être annoncé. */
export interface EchecIA {
  /** Le libellé de l'action, quand l'appelant l'a donné. */
  action: string | null;
  message: string;
  /** Horodatage : deux échecs identiques restent deux événements distincts. */
  at: number;
}

const temoins = new Set<(echec: EchecIA) => void>();

/**
 * S'abonner aux échecs d'appel IA. Rend la fonction de désabonnement.
 *
 * Pourquoi le signalement vit ICI et pas chez les appelants : le 24/08/2026,
 * une « Lecture froide » a échoué faute de crédits sans qu'aucun message ne
 * s'affiche — l'appelant avalait l'erreur pour ne pas bloquer la rédaction.
 * Sept appelants qui doivent chacun penser à afficher, c'est sept occasions
 * d'oublier. Un seul passage obligé, c'est zéro.
 */
export const surEchecIA = (temoin: (echec: EchecIA) => void): (() => void) => {
  temoins.add(temoin);
  return () => { temoins.delete(temoin); };
};

/**
 * Vrai si cette erreur a DÉJÀ été annoncée par le passage obligé. Les appelants
 * s'en servent pour ne pas la montrer une seconde fois à leur façon.
 */
export const estSignalee = (e: unknown): boolean => Boolean((e as any)?.signaleeIA);

const post = async <T>(path: string, payload: unknown): Promise<T> => {
  const res = await fetch(`${WORKER_URL}/api${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Token': getSessionToken() ?? '',
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* réponse non-JSON */ }

  if (!res.ok) throw new Error(data?.error ?? `Erreur ${res.status}`);
  return data as T;
};

/**
 * Le témoin d'appel en cours se pose ICI, pour la même raison que le
 * signalement d'échec juste au-dessus (SPEC §3.5.1) : c'est le passage obligé
 * des sept appelants. Posé chez eux, il manquerait partout où le bouton qui a
 * déclenché l'appel disparaît — et l'écran ne montrerait plus rien.
 *
 * Le persona se déduit du libellé plutôt que d'être passé en paramètre : un
 * argument de plus, c'est un argument qu'un appelant oubliera.
 */
const ouvrirSuivi = (request: GenerateRequest) => {
  const label = request.action ?? 'Appel au modèle';
  const fiche = AI_ACTION_CATALOG.find(a => a.label === label);
  return Activite.ouvrir({
    nature: 'ia',
    label,
    persona: fiche?.persona ?? null,
    modele: Activite.nomDuModele(request.modelId),
    // L'estimation se mesure par action ET par modèle : le même Rédacteur met
    // dix secondes chez l'un et une minute chez l'autre.
    cle: `ia:${label}:${request.modelId}`,
  });
};

/**
 * Ce qu'un appel rend : le texte, et ce qu'il a coûté.
 *
 * Le coût voyage AVEC la réponse, et pas par un canal parallèle comme les
 * échecs : deux appels peuvent être en vol en même temps, et un « dernier
 * décompte » global s'attacherait à la mauvaise production une fois sur deux.
 */
export interface ReponseIA {
  text: string;
  usage: UsageIA;
}

export const generateContent = async (request: GenerateRequest): Promise<ReponseIA> => {
  const messages: ChatMessage[] = [
    ...(request.history ?? []),
    { role: 'user', content: request.prompt },
  ];

  const suivi = ouvrirSuivi(request);

  try {
    const { text, usage } = await post<{ text: string; modelLabel: string; usage?: UsageIA }>('/ai/chat', {
      modelId: request.modelId,
      system: request.systemInstruction,
      messages,
      json: request.json,
      action: request.aiAction,
    });
    suivi.fermer(true);
    return { text, usage: usage ?? USAGE_INCONNU };
  } catch (e: any) {
    suivi.fermer(false);
    // Marquée d'abord : l'appelant doit pouvoir savoir qu'elle est déjà annoncée,
    // même s'il la reçoit après plusieurs relances.
    if (e && typeof e === 'object') (e as any).signaleeIA = true;
    const echec: EchecIA = {
      action: request.action ?? null,
      message: e?.message || 'Erreur inconnue.',
      at: Date.now(),
    };
    // Un témoin qui jette ne doit pas empêcher les autres d'être prévenus, ni
    // remplacer l'erreur d'origine par la sienne.
    for (const temoin of temoins) {
      try { temoin(echec); } catch { /* un abonné défaillant ne masque rien */ }
    }
    throw e;
  }
};

export interface ModelTestResult {
  available: boolean;
  error?: string;
  sample?: string;
  latencyMs?: number;
}

/**
 * Sonde un code d'API avant de l'enregistrer (SPEC §5.4).
 *
 * Porte sur un CODE et non sur un modèle du catalogue : au moment du test, le
 * modèle n'existe pas encore — c'est justement ce qu'on cherche à valider.
 */
export const testModel = (apiCode: string, provider = 'onemin') =>
  Activite.suivre(
    { nature: 'ia', label: 'Test du modèle', modele: apiCode, cle: `ia:test:${provider}` },
    () => post<ModelTestResult>('/ai/test', { apiCode, provider }),
  );
