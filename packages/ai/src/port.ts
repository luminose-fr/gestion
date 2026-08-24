/**
 * Le port des fournisseurs d'IA (SPEC §5.2).
 *
 * Volontairement ÉTROIT : pas de streaming, pas d'outils, pas de multimodal.
 * Le produit n'en a pas besoin, et chaque capacité ajoutée ici est une
 * capacité à réimplémenter pour chaque fournisseur.
 *
 * Le contrat est celui d'une conversation normale — un system prompt et une
 * suite de messages. Les fournisseurs qui ne savent pas faire (1min.ai n'a
 * qu'un prompt unique) s'en arrangent DANS leur adaptateur ; l'appelant ne
 * connaît jamais ces contorsions.
 */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  /** Identifiant du modèle, opaque et propre au fournisseur. */
  model: string;
  system?: string;
  messages: ChatMessage[];
  /** Demander une sortie JSON stricte, quand le fournisseur sait le faire. */
  json?: boolean;
}

/**
 * Ce que l'appel a consommé, tel que le fournisseur le déclare.
 *
 * Jumeau structurel de `UsageIA` dans `@luminose/shared` : cette forme traverse
 * la frontière jusqu'au front, qui n'a pas le droit d'importer ce package
 * (SPEC §1.1). Les deux se modifient ensemble.
 *
 * Tout est NULLABLE, et le restera : les fournisseurs ne comptent pas tous, et
 * aucun ne compte pareil. 1min.ai ne rend rien ; une API OpenAI rend des jetons
 * sans prix ; OpenRouter rend les deux quand on le lui demande. `null` veut dire
 * « on ne sait pas » — jamais « zéro ». Confondre les deux ferait passer un
 * fournisseur muet pour un fournisseur gratuit.
 */
export interface UsageIA {
  /** Jetons reçus par le modèle. */
  entree: number | null;
  /** Jetons produits par le modèle. */
  sortie: number | null;
  /** Coût en dollars, quand le fournisseur le chiffre lui-même. */
  coutUsd: number | null;
}

export interface ChatResult {
  text: string;
  usage: UsageIA;
  /** Réponse brute du fournisseur — pour le diagnostic, jamais pour la logique. */
  raw?: unknown;
}

/** Un nombre du fournisseur, ou `null` — jamais `0` par défaut. */
export const nombreOuNull = (valeur: unknown): number | null =>
  typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : null;

/** Aucun décompte : le fournisseur n'en donne pas. */
export const USAGE_INCONNU: UsageIA = { entree: null, sortie: null, coutUsd: null };

export interface TestResult {
  available: boolean;
  error?: string;
  /** Début de la réponse — la preuve que le modèle a réellement répondu. */
  sample?: string;
  latencyMs?: number;
}

export interface AIProvider {
  /** Clé de routage, stockée dans `ai_models.provider` (SPEC §5.3). */
  readonly id: string;
  chat(req: ChatRequest): Promise<ChatResult>;
  /** Vérifie qu'un code modèle est accepté et répond, au coût le plus bas. */
  test(model: string): Promise<TestResult>;
}

/** Ce dont un adaptateur a besoin pour joindre son fournisseur. */
export interface ProviderConfig {
  apiKey: string;
  /** Surcharge de l'URL de base — utile pour les API compatibles OpenAI. */
  baseUrl?: string;
  /** Délai avant la seconde tentative. Zéro en test, pour ne pas attendre. */
  repriseDelaiMs?: number;
}

// ── Reprise sur échec passager ───────────────────────────────────────────

/**
 * Les codes qui valent une seconde tentative : le fournisseur est encombré ou
 * en panne un instant, pas en désaccord avec la requête.
 *
 * Tout le reste — 401, 402, 404, 422 — est un refus MOTIVÉ : réessayer ne
 * changerait rien et ferait perdre du temps sur un message déjà clair.
 */
export const STATUTS_PASSAGERS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

/** Une erreur de fournisseur, avec ce qu'on sait de sa nature. */
export class ErreurFournisseur extends Error {
  constructor(message: string, readonly passagere: boolean) {
    super(message);
    this.name = 'ErreurFournisseur';
  }
}

/**
 * UNE seule reprise, et pas davantage.
 *
 * Pourquoi elle existe : le 23/08/2026, un « Go Éditeur » a échoué puis
 * fonctionné à l'identique la fois suivante. Aucune reprise n'existait nulle
 * part, donc un 429 ou un 502 d'une seconde faisait échouer toute une action
 * éditoriale.
 *
 * Pourquoi une seule : un appel de rédaction dure déjà des dizaines de
 * secondes, et une génération peut avoir abouti côté fournisseur avant que sa
 * réponse se perde — chaque tentative supplémentaire est facturée. Deux essais
 * couvrent le hoquet ; au-delà, c'est une panne, et mieux vaut le dire.
 *
 * Une erreur qui n'est pas une `ErreurFournisseur` vient du transport (fetch
 * qui jette, connexion coupée) : passagère par nature.
 */
export const avecUneReprise = async <T>(tenter: () => Promise<T>, delaiMs = 700): Promise<T> => {
  try {
    return await tenter();
  } catch (e) {
    const passagere = e instanceof ErreurFournisseur ? e.passagere : true;
    if (!passagere) throw e;
    if (delaiMs > 0) await new Promise(resoudre => setTimeout(resoudre, delaiMs));
    return await tenter();
  }
};

/** Retire les clôtures markdown qu'un modèle ajoute parfois autour du JSON. */
export const stripCodeFences = (text: string): string =>
  text.replace(/```json\s?/g, '').replace(/```\s?/g, '').trim();
