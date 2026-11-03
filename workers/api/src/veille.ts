/**
 * La veille des modèles (SPEC §5.7) : une fois par jour, et à la demande.
 *
 * Pour chaque adaptateur qui porte au moins un modèle du catalogue, lire sa
 * liste (les mêmes fonctions que l'explorateur), y chercher une version plus
 * récente de chaque lignée (`@luminose/editorial`, testé à part), et écrire
 * les propositions dans `veille_modeles`.
 *
 * Requêtes D1, bornées quel que soit le volume : 2 lectures, au plus 2 clés,
 * 1 lot d'écriture. Appels sortants : 1 par source, 5 au plus pour Anthropic.
 */
import { nouvellesVersions, type ModeleSuivi } from '@luminose/editorial';
import type { Env } from './env';
import { rowToPropositionVeille } from './db';
import { resolveApiKey } from './keys';
import { Refus } from './refus';
import {
  listerAnthropic,
  listerOneMin,
  listerOpenRouter,
  SourceMuette,
  SOURCES_CATALOGUE,
  type ModeleSource,
  type SourceCatalogue,
} from './sources-modeles';

export const CLE_ETAT_VEILLE = 'veille:etat';

export interface EtatSource {
  /** `true` : la liste a été lue. */
  lue: boolean;
  /** Pourquoi elle ne l'a pas été — à montrer tel quel. */
  raison: string | null;
  /** Combien de modèles du catalogue la veille y suivait. */
  suivis: number;
}

export interface EtatVeille {
  le: number;
  sources: Partial<Record<SourceCatalogue, EtatSource>>;
  /** Combien de propositions à voir au sortir de ce passage. */
  propositions: number;
}

export type PropositionVeille = ReturnType<typeof rowToPropositionVeille>;

export const idProposition = (provider: string, apiCode: string) => `${provider}:${apiCode}`;

const lister = async (env: Env, source: SourceCatalogue): Promise<ModeleSource[] | string> => {
  if (source === 'openrouter') return listerOpenRouter();
  const cle = await resolveApiKey(env, source);
  if (source === 'anthropic') {
    // La liste d'Anthropic est celle du compte : sans clé, rien à lire.
    if (!cle) return 'aucune clé posée';
    return listerAnthropic(cle);
  }
  return listerOneMin(cle);
};

/**
 * Un passage de veille. Ne lève pas pour une source muette : elle est notée
 * dans l'état, et les autres sources passent quand même. Seule une panne de
 * la base remonte.
 */
export const lancerVeille = async (env: Env, maintenant = Date.now()): Promise<EtatVeille> => {
  const { results: modeles } = await env.DB.prepare(
    'SELECT id, name, api_code, provider FROM ai_models WHERE deleted_at IS NULL',
  ).all<{ id: string; name: string; api_code: string; provider: string }>();
  const { results: existantes } = await env.DB.prepare(
    'SELECT provider, api_code, ignore_le FROM veille_modeles',
  ).all<{ provider: string; api_code: string; ignore_le: number | null }>();

  const sources: EtatVeille['sources'] = {};
  const trouvees: Array<{ provider: SourceCatalogue; apiCode: string; name: string; creeLe: number | null; remplace: ModeleSuivi }> = [];
  const lues: SourceCatalogue[] = [];

  for (const source of SOURCES_CATALOGUE) {
    const suivis: ModeleSuivi[] = (modeles ?? [])
      .filter(m => m.provider === source)
      .map(m => ({ id: m.id, name: m.name, apiCode: m.api_code }));
    // Rien de suivi sur cet adaptateur : ni appel, ni ligne dans l'état.
    if (!suivis.length) continue;

    try {
      const liste = await lister(env, source);
      if (typeof liste === 'string') {
        sources[source] = { lue: false, raison: liste, suivis: suivis.length };
        continue;
      }
      const ecartes = new Set((existantes ?? [])
        .filter(e => e.provider === source && e.ignore_le !== null)
        .map(e => e.api_code));
      for (const p of nouvellesVersions(suivis, liste, ecartes)) trouvees.push({ provider: source, ...p });
      sources[source] = { lue: true, raison: null, suivis: suivis.length };
      lues.push(source);
    } catch (e) {
      // Une source muette, une clé refusée : des états, pas des pannes. Le
      // reste — un défaut de code — part aux journaux, sans emporter les
      // autres sources.
      const attendu = e instanceof SourceMuette || e instanceof Refus;
      if (!attendu) console.error(`Veille des modèles — ${source} :`, e);
      sources[source] = {
        lue: false,
        raison: attendu ? (e as Error).message : 'erreur interne',
        suivis: suivis.length,
      };
    }
  }

  const etat: EtatVeille = { le: maintenant, sources, propositions: trouvees.length };
  const ids = trouvees.map(t => idProposition(t.provider, t.apiCode));

  await env.DB.batch([
    ...trouvees.map(t => env.DB.prepare(
      `INSERT INTO veille_modeles (id, provider, api_code, nom, remplace_model_id, remplace_nom, publie_le, detecte_le)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         nom = excluded.nom,
         remplace_model_id = excluded.remplace_model_id,
         remplace_nom = excluded.remplace_nom,
         publie_le = excluded.publie_le`,
    ).bind(
      idProposition(t.provider, t.apiCode), t.provider, t.apiCode, t.name,
      t.remplace.id, t.remplace.name, t.creeLe, maintenant,
    )),
    // Une proposition dépassée (une version plus récente encore, ou une lignée
    // qui n'est plus suivie) disparaît — mais seulement pour une source LUE :
    // une source muette ne dit pas que ses propositions sont fausses.
    env.DB.prepare(
      `DELETE FROM veille_modeles
       WHERE ignore_le IS NULL
         AND provider IN (SELECT value FROM json_each(?))
         AND id NOT IN (SELECT value FROM json_each(?))`,
    ).bind(JSON.stringify(lues), JSON.stringify(ids)),
    env.DB.prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).bind(CLE_ETAT_VEILLE, JSON.stringify(etat), maintenant),
  ]);

  return etat;
};

/**
 * Les propositions à voir : ni écartées, ni déjà au catalogue sur leur
 * adaptateur. « Ajouter au catalogue » n'a donc rien à effacer — la ligne
 * cesse de s'afficher dès que le modèle existe. 2 requêtes.
 */
export const lirePropositions = async (env: Env): Promise<{ propositions: PropositionVeille[]; etat: EtatVeille | null }> => {
  const [lignes, reglage] = await env.DB.batch([
    env.DB.prepare(
      `SELECT v.* FROM veille_modeles v
       WHERE v.ignore_le IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM ai_models m
           WHERE m.deleted_at IS NULL AND m.provider = v.provider AND m.api_code = v.api_code
         )
       ORDER BY COALESCE(v.publie_le, v.detecte_le) DESC, v.id`,
    ),
    env.DB.prepare('SELECT value FROM app_settings WHERE key = ?').bind(CLE_ETAT_VEILLE),
  ]);

  let etat: EtatVeille | null = null;
  const brut = (reglage.results?.[0] as any)?.value;
  if (typeof brut === 'string') {
    try {
      etat = JSON.parse(brut);
    } catch {
      etat = null;
    }
  }

  return {
    propositions: (lignes.results ?? []).map(rowToPropositionVeille),
    etat,
  };
};
