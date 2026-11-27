/**
 * Exporter — lire les quatre bases de Notion par son API, et écrire UN fichier
 * d'export (SPEC §14.9.1, tâche 2) : pour chaque base, son schéma (le nom et le
 * type réel de chaque propriété, les options des listes) et toutes ses pages,
 * propriétés brutes ; pour les Clients et les Séances, le corps de chaque page
 * (ses blocs, avec leur date de création).
 *
 * - La clé n'est ni affichée, ni journalisée, ni écrite : elle ne vit que dans
 *   l'en-tête des requêtes, et aucun message d'erreur ne la recopie.
 * - Pagination complète ; la limite de débit de Notion est respectée (une
 *   requête toutes les ~350 ms, et l'attente que demande un 429).
 * - **Une erreur arrête tout, sans fichier partiel** : l'export s'écrit d'abord
 *   à côté, puis prend son nom en une fois.
 *
 * Cette commande n'est pas lancée par une session : Florent la lance, sur son
 * poste. Les tests la font tourner contre un Notion simulé (`fetch` remplacé).
 */
import { renameSync, rmSync, writeFileSync } from 'node:fs';
import { cheminPrive } from './prive.ts';
import { BASES, type Bloc, type Export, type NomBase, type Page, type Schema } from './lire.ts';

export const API = 'https://api.notion.com/v1';
export const VERSION_NOTION = '2022-06-28';
/** Les bases dont le corps des pages est exporté. */
const AVEC_CORPS: NomBase[] = ['clients', 'seances'];

export type Options = {
  cle: string;
  bases: Record<NomBase, string>;
  fetch?: typeof fetch;
  /** L'attente entre deux requêtes, et après un 429 : remplaçable pour les tests. */
  attendre?: (ms: number) => Promise<void>;
  intervalleMs?: number;
};

export class ErreurNotion extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurNotion';
  }
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Un client de l'API de Notion, avec la limite de débit et les reprises après un 429. */
const client = (o: Options) => {
  const f = o.fetch ?? fetch;
  const attendre = o.attendre ?? dormir;
  const intervalle = o.intervalleMs ?? 350;
  let premiere = true;
  return async (methode: 'GET' | 'POST', chemin: string, corps?: unknown, quoi = 'une requête'): Promise<any> => {
    for (let essai = 0; essai < 6; essai++) {
      if (!premiere) await attendre(intervalle);
      premiere = false;
      let res: Response;
      try {
        res = await f(`${API}${chemin}`, {
          method: methode,
          headers: { Authorization: `Bearer ${o.cle}`, 'Notion-Version': VERSION_NOTION, 'Content-Type': 'application/json' },
          body: corps === undefined ? undefined : JSON.stringify(corps),
        });
      } catch {
        // Le message d'une erreur réseau peut citer la requête : il n'est pas recopié.
        throw new ErreurNotion(`Notion est injoignable (${quoi}). Rien n'a été écrit.`);
      }
      if (res.status === 429) {
        const apres = Number(res.headers.get('Retry-After') ?? '1');
        await attendre((Number.isFinite(apres) && apres > 0 ? apres : 1) * 1000);
        continue;
      }
      if (!res.ok) throw new ErreurNotion(`Notion a répondu ${res.status} (${quoi}). Rien n'a été écrit.`);
      return res.json();
    }
    throw new ErreurNotion(`Notion limite encore le débit après six tentatives (${quoi}). Rien n'a été écrit.`);
  };
};

/** Toutes les pages d'une liste paginée de Notion. */
const toutes = async (lire: (curseur?: string) => Promise<any>): Promise<any[]> => {
  const resultats: any[] = [];
  let curseur: string | undefined;
  do {
    const r = await lire(curseur);
    resultats.push(...(r.results ?? []));
    curseur = r.has_more ? r.next_cursor : undefined;
  } while (curseur);
  return resultats;
};

/** Le corps d'une page, ou d'un bloc : ses enfants, et les leurs. */
const corps = async (appel: ReturnType<typeof client>, id: string, base: NomBase): Promise<Bloc[]> => {
  const blocs: Bloc[] = await toutes((curseur) =>
    appel('GET', `/blocks/${id}/children?page_size=100${curseur ? `&start_cursor=${encodeURIComponent(curseur)}` : ''}`, undefined, `le corps d'une page de ${base}`));
  for (const b of blocs) if (b.has_children) b.children = await corps(appel, b.id, base);
  return blocs;
};

/** L'export entier, en mémoire. Rien n'est écrit ici. */
export const lireNotion = async (o: Options, maintenant: string): Promise<Export> => {
  const appel = client(o);
  const bases = {} as Export['bases'];
  for (const base of BASES) {
    const id = o.bases[base];
    if (!id) throw new ErreurNotion(`L'identifiant de la base ${base} manque dans la configuration.`);
    const description = await appel('GET', `/databases/${id}`, undefined, `le schéma de ${base}`);
    const schema: Schema = description.properties ?? {};
    const pages: Page[] = await toutes((curseur) =>
      appel('POST', `/databases/${id}/query`, { page_size: 100, ...(curseur ? { start_cursor: curseur } : {}) }, `les pages de ${base}`));
    if (AVEC_CORPS.includes(base)) for (const p of pages) p.blocs = await corps(appel, p.id, base);
    bases[base] = {
      id,
      schema,
      pages: pages.map((p) => ({
        id: p.id, created_time: p.created_time, last_edited_time: p.last_edited_time,
        archived: p.archived, in_trash: p.in_trash, properties: p.properties, ...(p.blocs ? { blocs: p.blocs } : {}),
      })),
    };
  }
  return { version: 1, exporteLe: maintenant, bases };
};

/**
 * Exporter vers le dossier privé : tout, ou rien. Le fichier s'écrit à côté,
 * puis prend son nom ; une erreur avant ne laisse aucun fichier.
 */
export const exporter = async (o: Options, dossier: string, maintenant: string, nom = 'export.json'): Promise<string> => {
  const final = cheminPrive(dossier, nom);
  const temporaire = cheminPrive(dossier, `.${nom}.partiel`);
  try {
    const exp = await lireNotion(o, maintenant);
    writeFileSync(temporaire, JSON.stringify(exp), { mode: 0o600 });
    renameSync(temporaire, final);
    return final;
  } catch (err) {
    rmSync(temporaire, { force: true });
    throw err;
  }
};
