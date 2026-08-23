/**
 * L'explorateur du catalogue (SPEC §5.6).
 *
 * Trois appels sortants croisés :
 *  - OpenRouter `/models` (public) — prix, contexte, code exact ;
 *  - OpenRouter `/benchmarks` (clé requise) — les indices d'Artificial Analysis ;
 *  - EQ-Bench Creative Writing — Elo, note d'écriture, densité de tournures d'IA.
 *
 * Les deux premiers mesurent le raisonnement, le code et la capacité d'agent :
 * aucune tâche du flux éditorial n'est là-dedans. Le troisième juge de la prose,
 * et trois de ses critères redisent mot pour mot les règles de voix. C'est lui
 * qui porte la courte liste ; les autres restent, parce qu'ils servent encore à
 * la Synthèse.
 *
 * Le résultat sert à RÉDUIRE le champ — quatre cents modèles, vingt candidats
 * défendables — jamais à décider seul.
 */
import { Hono } from 'hono';
import {
  selectionnerCourteListe,
  normaliserNomModele,
  critereEnFrancais,
  type ModeleNote,
} from '@luminose/editorial';
import type { Env } from '../env';
import { resolveApiKey } from '../keys';

export const catalogue = new Hono<{ Bindings: Env }>();

const MODELS_URL = 'https://openrouter.ai/api/v1/models';
const BENCH_URL = 'https://openrouter.ai/api/v1/benchmarks?source=artificial-analysis';

/**
 * EQ-Bench ne publie pas d'API : ce sont les fichiers que sa page de classement
 * charge. Ils sont donc lus comme une source AU MIEUX — un changement de forme
 * vide les colonnes d'écriture et n'emporte rien d'autre.
 */
const ECRITURE_CSV_URL = 'https://eqbench.com/creative_writing.js';
const ECRITURE_RADAR_URL = 'https://eqbench.com/creative_writing_chartdata.js';

/**
 * Une heure. Les quotas d'OpenRouter sont de 30 requêtes par minute et 500 par
 * jour : taper à chaque ouverture d'écran griderait le compte pour rien, et le
 * catalogue ne bouge pas d'une minute à l'autre.
 */
const TTL_SECONDS = 3600;

/** Versionnée : un déploiement qui change la forme ne doit pas servir l'ancienne une heure de plus. */
const CACHE_PATH = '/api/models/catalogue?v=3';

const nombre = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Prix par MILLION de jetons : l'unité dans laquelle on raisonne, pas celle de l'API. */
const parMillion = (v: unknown): number | null => {
  const n = nombre(v);
  return n === null ? null : Math.round(n * 1_000_000 * 1000) / 1000;
};

interface NoteEcriture {
  elo: number | null;
  ecriture: number | null;
  slop: number | null;
  suivi: number | null;
  forces: string[];
}

/**
 * Le classement vit dans un CSV enfermé dans un littéral de gabarit, au milieu
 * d'un mégaoctet de code de graphique. On n'extrait que ce littéral : 7 Ko.
 */
const lireClassement = (source: string): Map<string, NoteEcriture> => {
  const notes = new Map<string, NoteEcriture>();
  const bloc = source.match(/`([^`]*model_name[^`]*)`/);
  if (!bloc) return notes;

  const lignes = bloc[1].trim().split('\n');
  const entetes = lignes[0].split(',').map(s => s.trim());
  const col = (nom: string) => entetes.indexOf(nom);
  const iNom = col('model_name');
  const iElo = col('elo_score');
  const iEcriture = col('creative_writing_score');
  const iSlop = col('slop_score');
  if (iNom < 0) return notes;

  for (const ligne of lignes.slice(1)) {
    const champs = ligne.split(',');
    const nom = (champs[iNom] ?? '').trim();
    if (!nom) continue;
    const cle = normaliserNomModele(nom);
    // Premier arrivé : le CSV est trié, les doublons de normalisation sont
    // des variantes du même modèle.
    if (notes.has(cle)) continue;
    notes.set(cle, {
      elo: iElo < 0 ? null : nombre(champs[iElo]),
      ecriture: iEcriture < 0 ? null : nombre(champs[iEcriture]),
      slop: iSlop < 0 ? null : nombre(champs[iSlop]),
      suivi: null,
      forces: [],
    });
  }
  return notes;
};

/**
 * Le détail par critère, dans un second fichier. Il n'ajoute pas un classement
 * mais un PROFIL : sur quoi ce modèle est relativement fort. Facultatif —
 * son absence laisse la courte liste intacte.
 */
const enrichirParCritere = (source: string, notes: Map<string, NoteEcriture>): void => {
  const bloc = source.match(/const\s+chartData\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
  if (!bloc) return;
  let data: any;
  try {
    data = JSON.parse(bloc[1]);
  } catch {
    return;
  }
  for (const [nom, valeur] of Object.entries(data ?? {})) {
    const note = notes.get(normaliserNomModele(nom));
    if (!note) continue;
    const radar = (valeur as any)?.absoluteRadar;
    if (radar?.labels && radar?.values) {
      const i = radar.labels.indexOf('Instruction Following');
      if (i >= 0) note.suivi = nombre(radar.values[i]);
    }
    const forces = (valeur as any)?.strengths;
    if (Array.isArray(forces)) {
      note.forces = forces.slice(0, 2)
        .map((f: any) => critereEnFrancais(String(f?.criterion ?? '')))
        .filter(Boolean);
    }
  }
};

catalogue.get('/', async (c) => {
  const cle = await resolveApiKey(c.env, 'openrouter');

  // Le cache d'exécution quand la plateforme en fournit un (absent en test).
  const cacheKey = new Request(new URL(CACHE_PATH, c.req.url).toString());
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

  // EQ-Bench : source publique, sans clé, et sans contrat. On l'entoure.
  const notes = new Map<string, NoteEcriture>();
  let ecritureLue = false;
  let ecritureRaison: string | null = 'source muette';
  try {
    const res = await fetch(ECRITURE_CSV_URL, { headers: { Accept: 'text/plain' } });
    if (res.ok) {
      for (const [k, v] of lireClassement(await res.text())) notes.set(k, v);
      ecritureLue = notes.size > 0;
      if (!ecritureLue) ecritureRaison = 'format inattendu';
    } else {
      ecritureRaison = `refus (${res.status})`;
    }
  } catch {
    ecritureRaison = 'injoignable';
  }
  if (ecritureLue) {
    ecritureRaison = null;
    try {
      const res = await fetch(ECRITURE_RADAR_URL, { headers: { Accept: 'text/plain' } });
      if (res.ok) enrichirParCritere(await res.text(), notes);
    } catch {
      // Le profil par critère est un bonus : son absence ne retire rien.
    }
  }

  const models = ((brut?.data ?? []) as any[])
    .filter(m => (m?.architecture?.output_modalities ?? []).includes('text'))
    .map(m => {
      const id = String(m.id);
      const bench = indices.get(id) ?? null;
      const note = notes.get(normaliserNomModele(id)) ?? null;
      return {
        id,
        name: String(m.name ?? id),
        contextLength: nombre(m.context_length) ?? 0,
        promptPrice: parMillion(m?.pricing?.prompt),
        completionPrice: parMillion(m?.pricing?.completion),
        intelligence: bench?.intelligence ?? null,
        coding: bench?.coding ?? null,
        agentic: bench?.agentic ?? null,
        elo: note?.elo ?? null,
        ecriture: note?.ecriture ?? null,
        slop: note?.slop ?? null,
        suivi: note?.suivi ?? null,
        forces: note?.forces ?? [],
        // Renseignés juste après, quand la sélection est connue.
        selection: false,
        palier: null as string | null,
        palierLibelle: null as string | null,
      };
    });

  // La courte liste : la doctrine vit dans @luminose/editorial, testée à part.
  const retenus = selectionnerCourteListe(models.map<ModeleNote>(m => ({
    slug: m.id,
    prixSortie: m.completionPrice,
    elo: m.elo,
    ecriture: m.ecriture,
    slop: m.slop,
  })));
  const parSlug = new Map(models.map(m => [m.id, m]));
  for (const r of retenus) {
    const m = parSlug.get(r.slug);
    if (!m) continue;
    m.selection = true;
    m.palier = r.palier;
    m.palierLibelle = r.palierLibelle;
  }

  const reponse = c.json({
    models,
    benchmarksAvailable: benchmarksLus,
    // Sans clé, l'écran doit pouvoir dire POURQUOI la colonne est vide.
    benchmarksReason: benchmarksLus ? null : (cle ? 'refus' : 'clé absente'),
    ecritureAvailable: ecritureLue,
    ecritureReason: ecritureRaison,
    /** L'ordre de la courte liste, du moins cher au plus cher. */
    selection: retenus.map(r => r.slug),
    fetchedAt: Date.now(),
  });

  if (cache) {
    // `clone()` partage la liste d'en-têtes : y poser Cache-Control l'envoyait
    // AUSSI au navigateur, qui gardait alors le catalogue une heure. Poser une
    // clé puis rouvrir l'écran continuait d'afficher « clé absente ». Le TTL
    // est celui du cache du Worker, pas celui du client — d'où une copie avec
    // ses propres en-têtes.
    const pourCache = new Response(reponse.clone().body, {
      status: reponse.status,
      headers: new Headers(reponse.headers),
    });
    pourCache.headers.set('Cache-Control', `max-age=${TTL_SECONDS}`);

    const enregistrement = cache.put(cacheKey, pourCache);
    // `executionCtx` LÈVE quand la plateforme n'en fournit pas — l'optionnel ne
    // protège pas d'un getter qui jette. Sans ce filet, le cache ne se
    // remplissait jamais hors Workers, et chaque ouverture d'écran repartait
    // taper les trois sources.
    try {
      c.executionCtx.waitUntil(enregistrement);
    } catch {
      await enregistrement;
    }
  }
  return reponse;
});
