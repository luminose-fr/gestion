/**
 * L'explorateur du catalogue OpenRouter (SPEC §5.6).
 *
 * Deux appels sortants croisés : `/models` (public) donne le prix, le contexte
 * et le code exact ; `/benchmarks` (clé requise) donne les indices d'Artificial
 * Analysis. Le résultat sert à REDUIRE le champ — passer de quatre cents
 * modèles à une dizaine de candidats défendables — jamais à décider seul.
 *
 * Ce que ces indices mesurent : raisonnement, code, capacité d'agent. Aucune
 * des tâches du flux éditorial n'est là-dedans (§5.6) : ils filtrent, ils ne
 * choisissent pas.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { resolveApiKey } from '../keys';

export const catalogue = new Hono<{ Bindings: Env }>();

const MODELS_URL = 'https://openrouter.ai/api/v1/models';
const BENCH_URL = 'https://openrouter.ai/api/v1/benchmarks?source=artificial-analysis';

/**
 * Une heure. Les quotas d'OpenRouter sont de 30 requêtes par minute et 500 par
 * jour : taper à chaque ouverture d'écran griderait le compte pour rien, et le
 * catalogue ne bouge pas d'une minute à l'autre.
 */
const TTL_SECONDS = 3600;

const nombre = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Prix par MILLION de jetons : l'unité dans laquelle on raisonne, pas celle de l'API. */
const parMillion = (v: unknown): number | null => {
  const n = nombre(v);
  return n === null ? null : Math.round(n * 1_000_000 * 1000) / 1000;
};

catalogue.get('/', async (c) => {
  const cle = await resolveApiKey(c.env, 'openrouter');

  // Le cache d'exécution quand la plateforme en fournit un (absent en test).
  const cacheKey = new Request(new URL('/api/models/catalogue', c.req.url).toString());
  const cache = typeof caches !== 'undefined' ? (caches as any).default : null;
  if (cache) {
    const garde = await cache.match(cacheKey);
    if (garde) return garde;
  }

  const reponseModeles = await fetch(MODELS_URL, { headers: { Accept: 'application/json' } });
  if (!reponseModeles.ok) {
    return c.json({ error: `OpenRouter a refusé le catalogue (${reponseModeles.status}).` }, 502);
  }
  const brut = await reponseModeles.json() as any;

  // Les indices ne sont disponibles qu'avec une clé ; sans elle, le catalogue
  // reste utile — prix et contexte suffisent à écarter beaucoup de candidats.
  const indices = new Map<string, { intelligence: number | null; coding: number | null; agentic: number | null }>();
  let benchmarksLus = false;
  if (cle) {
    try {
      const res = await fetch(BENCH_URL, { headers: { Authorization: `Bearer ${cle}`, Accept: 'application/json' } });
      if (res.ok) {
        const data = await res.json() as any;
        for (const item of (data?.data ?? []) as any[]) {
          if (!item?.model_permaslug) continue;
          indices.set(String(item.model_permaslug), {
            intelligence: nombre(item.intelligence_index),
            coding: nombre(item.coding_index),
            agentic: nombre(item.agentic_index),
          });
        }
        benchmarksLus = true;
      }
    } catch {
      // Un refus côté benchmarks ne doit pas emporter le catalogue entier.
      benchmarksLus = false;
    }
  }

  const models = ((brut?.data ?? []) as any[])
    .filter(m => (m?.architecture?.output_modalities ?? []).includes('text'))
    .map(m => {
      const bench = indices.get(String(m.id)) ?? null;
      return {
        id: String(m.id),
        name: String(m.name ?? m.id),
        contextLength: nombre(m.context_length) ?? 0,
        promptPrice: parMillion(m?.pricing?.prompt),
        completionPrice: parMillion(m?.pricing?.completion),
        intelligence: bench?.intelligence ?? null,
        coding: bench?.coding ?? null,
        agentic: bench?.agentic ?? null,
      };
    });

  const reponse = c.json({
    models,
    benchmarksAvailable: benchmarksLus,
    // Sans clé, l'écran doit pouvoir dire POURQUOI la colonne est vide.
    benchmarksReason: benchmarksLus ? null : (cle ? 'refus' : 'clé absente'),
    fetchedAt: Date.now(),
  });

  if (cache) {
    const copie = reponse.clone();
    copie.headers.set('Cache-Control', `max-age=${TTL_SECONDS}`);
    c.executionCtx?.waitUntil?.(cache.put(cacheKey, copie));
  }
  return reponse;
});
