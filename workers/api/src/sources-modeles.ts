/**
 * Les listes de modèles, une par adaptateur (SPEC §5.6).
 *
 * L'explorateur et la veille quotidienne (§5.7) lisent les mêmes fonctions :
 * une source décrite à deux endroits finirait par diverger, et ce serait la
 * veille — celle qu'on ne regarde pas — qui se tromperait sans bruit.
 *
 * Chaque fonction rend le code EXACT que l'adaptateur attend dans `api_code` :
 * `anthropic/claude-fable-5` chez OpenRouter, `claude-fable-5` chez Anthropic
 * et chez 1min.ai. Le rapprochement entre sources se fait ailleurs, par le nom
 * normalisé.
 */
import { ANTHROPIC_BASE_URL, ANTHROPIC_VERSION } from '@luminose/ai';
import { Refus } from './refus';

export const SOURCES_CATALOGUE = ['openrouter', 'anthropic', 'onemin'] as const;
export type SourceCatalogue = typeof SOURCES_CATALOGUE[number];

export interface ModeleSource {
  /** Le code à poser dans `api_code` pour CET adaptateur. */
  id: string;
  name: string;
  contextLength: number | null;
  /** $ par million de jetons. Seul OpenRouter les publie : il facture à l'appel. */
  promptPrice: number | null;
  completionPrice: number | null;
  sortie: 'texte' | 'image';
  /** Date de publication, quand la source la donne (Anthropic seul). */
  creeLe: number | null;
}

/**
 * Une source qui ne répond pas, ou plus dans la forme attendue. Ce n'est pas
 * une panne de l'application : le message part à l'écran, rien aux journaux.
 */
export class SourceMuette extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceMuette';
  }
}

export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

/**
 * 1min.ai ne documente aucune liste de modèles. Celle-ci est l'adresse que son
 * propre site interroge pour remplir le menu du chat : lue AU MIEUX, comme
 * EQ-Bench, et entourée de la même façon — une forme qui change vide l'onglet,
 * elle n'emporte rien d'autre.
 */
export const ONEMIN_MODELS_URL = 'https://api.1min.ai/models?feature=UNIFY_CHAT_WITH_AI';

/**
 * Cinq pages de mille. Anthropic publie quelques dizaines de modèles : la
 * borne ne sert qu'à garantir qu'un `has_more` qui ne retomberait jamais ne
 * fait pas tourner la route jusqu'au plafond du Worker.
 */
const PAGES_ANTHROPIC = 5;

export const nombre = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Prix par MILLION de jetons : l'unité dans laquelle on raisonne, pas celle de l'API. */
export const parMillion = (v: unknown): number | null => {
  const n = nombre(v);
  return n === null ? null : Math.round(n * 1_000_000 * 1000) / 1000;
};

const texte = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

/**
 * Ce que la source dit de son refus, quand elle le dit en JSON
 * (`{ error: { type, message } }` chez Anthropic et OpenRouter). Sans lui, un
 * « 400 » ne laisse rien à corriger : le code nu a déjà coûté un aller-retour
 * le 03/11/2026, sur la liste d'Anthropic. Un corps qui n'est pas du JSON — une
 * page d'erreur HTML — ne s'affiche pas.
 */
export const motifDuRefus = async (res: Response): Promise<string> => {
  try {
    const data: any = await res.json();
    const erreur = data?.error ?? data;
    const message = typeof erreur?.message === 'string' ? erreur.message.trim()
      : typeof erreur === 'string' ? erreur.trim() : '';
    const nature = typeof erreur?.type === 'string' ? erreur.type : '';
    const motif = [nature, message].filter(Boolean).join(' — ');
    // Le point final vient de la phrase qui l'enveloppe.
    return motif ? ` : ${motif.slice(0, 300).replace(/\.+$/, '')}` : '';
  } catch {
    return '';
  }
};

const lireJson = async (res: Response, source: string): Promise<any> => {
  try {
    return await res.json();
  } catch {
    throw new SourceMuette(`${source} a répondu dans un format inattendu.`);
  }
};

/**
 * OpenRouter : texte ET image. Un modèle qui sort une image — Nano Banana,
 * GPT Image — est ajoutable depuis l'explorateur comme n'importe quel autre,
 * et il arrive au catalogue avec `sortie = 'image'`. Ce qui ne sort ni l'un
 * ni l'autre (musique, voix) n'a rien à faire ici.
 */
export const listerOpenRouter = async (): Promise<ModeleSource[]> => {
  let res: Response;
  try {
    res = await fetch(OPENROUTER_MODELS_URL, { headers: { Accept: 'application/json' } });
  } catch {
    throw new SourceMuette('OpenRouter est injoignable.');
  }
  if (!res.ok) throw new SourceMuette(`OpenRouter a refusé le catalogue (${res.status})${await motifDuRefus(res)}.`);
  const brut = await lireJson(res, 'OpenRouter');

  return ((brut?.data ?? []) as any[]).flatMap((m): ModeleSource[] => {
    const id = texte(m?.id);
    const sorties: unknown[] = m?.architecture?.output_modalities ?? [];
    if (!id) return [];
    const image = sorties.includes('image');
    if (!image && !sorties.includes('text')) return [];
    return [{
      id,
      name: texte(m.name) ?? id,
      contextLength: nombre(m.context_length),
      promptPrice: parMillion(m?.pricing?.prompt),
      completionPrice: parMillion(m?.pricing?.completion),
      sortie: image ? 'image' : 'texte',
      creeLe: nombre(m.created) === null ? null : (nombre(m.created) as number) * 1000,
    }];
  });
};

/**
 * Anthropic : la liste du compte, donc la clé. Un refus 401/403 est un défaut
 * que Florent corrige dans Réglages — un `Refus`, pas une source muette.
 */
export const listerAnthropic = async (cle: string): Promise<ModeleSource[]> => {
  const modeles: ModeleSource[] = [];
  let apres: string | null = null;
  for (let page = 0; page < PAGES_ANTHROPIC; page++) {
    const url = new URL(`${ANTHROPIC_BASE_URL}/models`);
    url.searchParams.set('limit', '1000');
    if (apres) url.searchParams.set('after_id', apres);
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: { 'x-api-key': cle, 'anthropic-version': ANTHROPIC_VERSION, Accept: 'application/json' },
      });
    } catch {
      throw new SourceMuette('Anthropic est injoignable.');
    }
    if (res.status === 401 || res.status === 403) {
      throw new Refus(
        `Anthropic refuse la clé posée (${res.status})${await motifDuRefus(res)}. Vérifiez-la dans Réglages → Fournisseurs.`,
        409,
      );
    }
    if (!res.ok) throw new SourceMuette(`Anthropic a refusé la liste des modèles (${res.status})${await motifDuRefus(res)}.`);
    const brut = await lireJson(res, 'Anthropic');
    for (const m of (brut?.data ?? []) as any[]) {
      const id = texte(m?.id);
      if (!id) continue;
      const date = texte(m.created_at) ? Date.parse(m.created_at) : NaN;
      modeles.push({
        id,
        name: texte(m.display_name) ?? id,
        contextLength: nombre(m.max_input_tokens),
        promptPrice: null,
        completionPrice: null,
        sortie: 'texte',
        creeLe: Number.isFinite(date) ? date : null,
      });
    }
    apres = brut?.has_more === true ? texte(brut.last_id) : null;
    if (!apres) break;
  }
  return modeles;
};

/**
 * 1min.ai : la forme constatée est `{ models: [{ modelId, … }] }` ; les replis
 * couvrent un tableau nu et `data`, sans rien supposer d'autre. La clé part si
 * elle est posée — à 1min.ai lui-même, son seul destinataire légitime — parce
 * qu'une liste publique aujourd'hui peut ne plus l'être demain.
 */
export const listerOneMin = async (cle: string | null): Promise<ModeleSource[]> => {
  let res: Response;
  try {
    res = await fetch(ONEMIN_MODELS_URL, {
      headers: { Accept: 'application/json', ...(cle ? { 'API-KEY': cle } : {}) },
    });
  } catch {
    throw new SourceMuette('1min.ai est injoignable.');
  }
  if (!res.ok) throw new SourceMuette(`1min.ai a refusé la liste des modèles (${res.status})${await motifDuRefus(res)}.`);
  const brut = await lireJson(res, '1min.ai');
  const items: unknown[] = Array.isArray(brut) ? brut
    : Array.isArray(brut?.models) ? brut.models
    : Array.isArray(brut?.data) ? brut.data
    : [];

  const vus = new Set<string>();
  const modeles = items.flatMap((m: any): ModeleSource[] => {
    const id = typeof m === 'string' ? texte(m) : texte(m?.modelId) ?? texte(m?.model) ?? texte(m?.id);
    if (!id || vus.has(id)) return [];
    vus.add(id);
    const objet = typeof m === 'object' && m !== null;
    return [{
      id,
      name: (objet && (texte(m.name) ?? texte(m.displayName) ?? texte(m.modelName))) || id,
      contextLength: objet ? nombre(m.contextWindow ?? m.context_length ?? m.contextLength ?? m.maxContextLength) : null,
      promptPrice: null,
      completionPrice: null,
      sortie: 'texte',
      creeLe: null,
    }];
  });
  if (!modeles.length) {
    throw new SourceMuette('1min.ai a répondu sans liste lisible : la forme de sa réponse a sans doute changé.');
  }
  return modeles;
};
