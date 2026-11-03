/**
 * L'explorateur du catalogue (SPEC §5.6).
 *
 * Trois sources de LISTE, une par adaptateur (`sources-modeles.ts`) :
 * OpenRouter, Anthropic, 1min.ai. La première est aussi la RÉFÉRENCE : seule
 * elle publie des prix, et ses modèles portent les notes. Les deux autres
 * listes s'y rapprochent par le nom normalisé — leurs prix sont donc ceux
 * d'OpenRouter pour le même modèle, une indication et non une facture.
 *
 * La référence croise trois appels sortants :
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
import type { Context } from 'hono';
import type { Env } from '../env';
import { resolveApiKey } from '../keys';
import { Refus } from '../refus';
import {
  listerAnthropic,
  listerOneMin,
  listerOpenRouter,
  nombre,
  SourceMuette,
  type ModeleSource,
  type SourceCatalogue,
} from '../sources-modeles';

export const catalogue = new Hono<{ Bindings: Env }>();

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
const CACHE_PATH = '/api/models/catalogue?v=4';

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

/** Une ligne de l'explorateur, quelle que soit la source. */
interface LigneCatalogue {
  /** Le code exact pour l'adaptateur de la source. */
  id: string;
  name: string;
  contextLength: number;
  promptPrice: number | null;
  completionPrice: number | null;
  intelligence: number | null;
  coding: number | null;
  agentic: number | null;
  elo: number | null;
  ecriture: number | null;
  slop: number | null;
  suivi: number | null;
  forces: string[];
  selection: boolean;
  palier: string | null;
  palierLibelle: string | null;
  sortie: 'texte' | 'image';
  creeLe: number | null;
  /** Hors OpenRouter : le modèle OpenRouter dont viennent prix et notes. */
  reference: string | null;
}

interface ReponseCatalogue {
  source: SourceCatalogue;
  models: LigneCatalogue[];
  benchmarksAvailable: boolean;
  benchmarksReason: string | null;
  ecritureAvailable: boolean;
  ecritureReason: string | null;
  /** Hors OpenRouter : la référence a-t-elle pu être lue ? Sans elle, ni prix ni notes. */
  referenceAvailable: boolean;
  /** L'ordre de la courte liste, du moins cher au plus cher. */
  selection: string[];
  fetchedAt: number;
}

/** La référence : OpenRouter, croisé avec ses indices et les notes d'écriture. */
const construireReference = async (env: Env): Promise<ReponseCatalogue> => {
  const cle = await resolveApiKey(env, 'openrouter');
  const liste = await listerOpenRouter();

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

  const models = liste.map((m): LigneCatalogue => {
    const bench = indices.get(m.id) ?? null;
    const note = notes.get(normaliserNomModele(m.id)) ?? null;
    return {
      id: m.id,
      name: m.name,
      contextLength: m.contextLength ?? 0,
      promptPrice: m.promptPrice,
      completionPrice: m.completionPrice,
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
      palier: null,
      palierLibelle: null,
      sortie: m.sortie,
      creeLe: m.creeLe,
      reference: null,
    };
  });

  // La courte liste : la doctrine vit dans @luminose/editorial, testée à part.
  // Les modèles d'image n'ont pas de note d'écriture : ils n'y entrent jamais.
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

  return {
    source: 'openrouter',
    models,
    benchmarksAvailable: benchmarksLus,
    // Sans clé, l'écran doit pouvoir dire POURQUOI la colonne est vide.
    benchmarksReason: benchmarksLus ? null : (cle ? 'refus' : 'clé absente'),
    ecritureAvailable: ecritureLue,
    ecritureReason: ecritureRaison,
    referenceAvailable: true,
    selection: retenus.map(r => r.slug),
    fetchedAt: Date.now(),
  };
};

/**
 * La référence, gardée une heure dans le cache du Worker quand la plateforme
 * en fournit un (absent en test). Les trois onglets la lisent : sans cache,
 * passer d'une source à l'autre retaperait OpenRouter et EQ-Bench à chaque fois.
 *
 * Le TTL est celui du cache du Worker, pas celui du navigateur : la copie mise
 * de côté porte ses propres en-têtes, et la réponse servie se construit à part.
 * Une copie qui partageait les en-têtes de la réponse a déjà envoyé `max-age`
 * au navigateur : poser une clé puis rouvrir l'écran continuait d'afficher
 * « clé absente » pendant une heure.
 */
const reference = async (c: Context<{ Bindings: Env }>): Promise<ReponseCatalogue> => {
  const cacheKey = new Request(new URL(CACHE_PATH, c.req.url).toString());
  const cache = typeof caches !== 'undefined' ? (caches as any).default : null;
  if (cache) {
    const garde = await cache.match(cacheKey);
    if (garde) return await garde.json() as ReponseCatalogue;
  }

  const donnees = await construireReference(c.env);

  if (cache) {
    const pourCache = new Response(JSON.stringify(donnees), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${TTL_SECONDS}` },
    });
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
  return donnees;
};

/**
 * Rapproche une liste d'adaptateur de la référence. Le nom normalisé absorbe
 * le préfixe de fabricant, la date et les points : `claude-fable-5-20261015`
 * chez Anthropic retrouve `anthropic/claude-fable-5` chez OpenRouter. Un
 * modèle sans correspondant reste listé, sans prix ni note — absent de la
 * référence ne veut pas dire indisponible chez l'adaptateur.
 */
const croiser = (
  source: SourceCatalogue,
  liste: ModeleSource[],
  ref: ReponseCatalogue | null,
): ReponseCatalogue => {
  const parNom = new Map<string, LigneCatalogue>();
  for (const l of ref?.models ?? []) {
    const cle = normaliserNomModele(l.id);
    const deja = parNom.get(cle);
    // La variante payante d'abord : `:free` partage le nom, pas le prix.
    if (!deja || (deja.id.includes(':') && !l.id.includes(':'))) parNom.set(cle, l);
  }

  const models = liste.map((m): LigneCatalogue => {
    const r = parNom.get(normaliserNomModele(m.id)) ?? null;
    return {
      id: m.id,
      name: m.name,
      contextLength: m.contextLength ?? r?.contextLength ?? 0,
      promptPrice: r?.promptPrice ?? null,
      completionPrice: r?.completionPrice ?? null,
      intelligence: r?.intelligence ?? null,
      coding: r?.coding ?? null,
      agentic: r?.agentic ?? null,
      elo: r?.elo ?? null,
      ecriture: r?.ecriture ?? null,
      slop: r?.slop ?? null,
      suivi: r?.suivi ?? null,
      forces: r?.forces ?? [],
      selection: r?.selection ?? false,
      palier: r?.palier ?? null,
      palierLibelle: r?.palierLibelle ?? null,
      sortie: m.sortie,
      creeLe: m.creeLe,
      reference: r?.id ?? null,
    };
  });

  return {
    source,
    models,
    benchmarksAvailable: ref?.benchmarksAvailable ?? false,
    benchmarksReason: ref ? ref.benchmarksReason : 'référence muette',
    ecritureAvailable: ref?.ecritureAvailable ?? false,
    ecritureReason: ref ? ref.ecritureReason : 'référence muette',
    referenceAvailable: ref !== null,
    selection: (ref?.selection ?? []).flatMap(slug => models.filter(m => m.reference === slug).map(m => m.id)),
    fetchedAt: Date.now(),
  };
};

/** Une source muette se dit à l'écran, sans trace : ce n'est pas l'application qui est en panne. */
const servir = async (c: Context<{ Bindings: Env }>, produire: () => Promise<ReponseCatalogue>) => {
  try {
    return c.json(await produire());
  } catch (e) {
    if (e instanceof SourceMuette) return c.json({ error: e.message }, 502);
    throw e;
  }
};

/** La référence elle-même, et la liste la plus large : tout ce qu'OpenRouter route. */
catalogue.get('/', (c) => servir(c, () => reference(c)));

/** La liste du compte Anthropic : exige la clé, qui ne part qu'à Anthropic. */
catalogue.get('/anthropic', (c) => servir(c, async () => {
  const cle = await resolveApiKey(c.env, 'anthropic');
  if (!cle) {
    throw new Refus(
      "Aucune clé posée pour « anthropic » : la liste est celle de votre compte. " +
      'Renseignez-la dans Réglages → Fournisseurs.',
      409,
    );
  }
  const liste = await listerAnthropic(cle);
  return croiser('anthropic', liste, await reference(c).catch(() => null));
}));

/** La liste de 1min.ai, lue au mieux (voir `ONEMIN_MODELS_URL`). */
catalogue.get('/onemin', (c) => servir(c, async () => {
  const liste = await listerOneMin(await resolveApiKey(c.env, 'onemin'));
  return croiser('onemin', liste, await reference(c).catch(() => null));
}));
