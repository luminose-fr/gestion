/**
 * Lire un export de Notion — le schéma d'abord (SPEC §14.9.1, tâche 3).
 *
 * Une fonction pure : export → valeurs. **La lecture est guidée par le schéma
 * exporté** : le type d'une propriété se lit dans le schéma, jamais sur une
 * page. Avant toute transformation, le schéma est confronté aux propriétés
 * attendues (correspondance.ts) : une propriété attendue absente, ou d'un type
 * que l'outil ne sait pas lire, arrête tout, en la nommant. Une propriété en
 * plus est listée, pas bloquante.
 *
 * Les textes se lisent BRUTS : jamais réinterprétés, jamais nettoyés.
 */
import { ATTENDUES, NON_REPRISES, type Nature } from './correspondance.ts';

export type NomBase = keyof typeof ATTENDUES;
export const BASES: NomBase[] = ['clients', 'seances', 'evenements', 'professionnels'];

/** Un bloc du corps d'une page : son type, son texte brut, ses liens, sa date de création, ses enfants. */
export type Bloc = {
  id: string;
  type: string;
  created_time: string;
  has_children?: boolean;
  children?: Bloc[];
  [cle: string]: unknown;
};

export type Page = {
  id: string;
  created_time: string;
  last_edited_time: string;
  archived?: boolean;
  in_trash?: boolean;
  properties: Record<string, Record<string, unknown>>;
  /** Le corps, pour les Clients et les Séances. */
  blocs?: Bloc[];
};

/** Le schéma d'une base, tel que `GET /v1/databases/:id` le rend : le nom et le type de chaque propriété. */
export type Schema = Record<string, { type: string; [cle: string]: unknown }>;

export type Export = {
  version: 1;
  exporteLe: string;
  bases: Record<NomBase, { id: string; schema: Schema; pages: Page[] }>;
};

export type Valeur = string | number | boolean | string[] | null;

/** Les types Notion que l'outil sait lire. */
export const TYPES_LISIBLES = [
  'title', 'rich_text', 'number', 'select', 'status', 'multi_select', 'date', 'checkbox',
  'email', 'phone_number', 'url', 'relation', 'formula', 'rollup',
] as const;

export class SchemaInvalide extends Error {
  readonly manquantes: string[];
  readonly illisibles: string[];
  constructor(manquantes: string[], illisibles: string[]) {
    super([
      ...manquantes.map((m) => `propriété attendue absente : ${m}`),
      ...illisibles.map((m) => `type que l'outil ne sait pas lire : ${m}`),
    ].join('\n'));
    this.manquantes = manquantes;
    this.illisibles = illisibles;
    this.name = 'SchemaInvalide';
  }
}

/**
 * Confronte les quatre schémas aux propriétés attendues. Lève `SchemaInvalide`
 * — rien n'est transformé, rien n'est écrit — ou rend les propriétés en plus.
 */
export const verifierSchemas = (exp: Export): { enPlus: string[] } => {
  const manquantes: string[] = [];
  const illisibles: string[] = [];
  const enPlus: string[] = [];
  for (const base of BASES) {
    const schema = exp.bases[base]?.schema ?? {};
    const attendues = ATTENDUES[base].map((a) => a.nom);
    for (const nom of attendues) {
      if (!(nom in schema)) manquantes.push(`${base} › ${nom}`);
      else if (!(TYPES_LISIBLES as readonly string[]).includes(schema[nom].type)) illisibles.push(`${base} › ${nom} (${schema[nom].type})`);
    }
    for (const nom of Object.keys(schema)) {
      if (!attendues.includes(nom) && !NON_REPRISES[base].includes(nom)) enPlus.push(`${base} › ${nom}`);
    }
  }
  if (manquantes.length || illisibles.length) throw new SchemaInvalide(manquantes, illisibles);
  return { enPlus };
};

/** Le texte brut d'une liste de morceaux de texte enrichi. */
export const texteBrut = (morceaux: unknown): string =>
  Array.isArray(morceaux) ? morceaux.map((m: any) => m?.plain_text ?? '').join('') : '';

/** La valeur d'une propriété, lue par son type Notion — celui du schéma. */
const lireBrut = (type: string, prop: Record<string, unknown> | undefined): Valeur => {
  if (!prop) return null;
  const v = prop[type] as any;
  switch (type) {
    case 'title':
    case 'rich_text': return texteBrut(v);
    case 'number': return typeof v === 'number' ? v : null;
    case 'select':
    case 'status': return v?.name ?? null;
    case 'multi_select': return Array.isArray(v) ? v.map((o: any) => String(o.name)) : [];
    case 'date': return v?.start ?? null;
    case 'checkbox': return v === true;
    case 'email':
    case 'phone_number':
    case 'url': return typeof v === 'string' ? v : null;
    case 'relation': return Array.isArray(v) ? v.map((r: any) => String(r.id)) : [];
    case 'formula':
    case 'rollup': {
      // Une formule ou un agrégat porte sa valeur sous son propre type.
      const t = v?.type;
      if (t === 'number') return typeof v.number === 'number' ? v.number : null;
      if (t === 'string') return v.string ?? null;
      if (t === 'boolean') return v.boolean === true;
      if (t === 'date') return v.date?.start ?? null;
      if (t === 'array') return Array.isArray(v.array) ? v.array.map((x: any) => lireBrut(x.type, x)).flat().map(String) : [];
      return null;
    }
    default: return null;
  }
};

/** La date de fin d'une propriété date, s'il y en a une. */
export const finDeDate = (page: Page, nom: string): string | null =>
  ((page.properties[nom] as any)?.date?.end as string | undefined) ?? null;

/** Ramène une valeur à la nature attendue par la transformation. Les textes ne sont jamais retouchés. */
const versNature = (v: Valeur, nature: Nature): Valeur => {
  if (v === null) return null;
  switch (nature) {
    case 'texte': return Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? (v === '' ? null : v) : String(v);
    case 'nombre': return typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
    case 'booleen': return v === true;
    case 'choix': return Array.isArray(v) ? v[0] ?? null : typeof v === 'string' && v !== '' ? v : null;
    case 'date': return typeof v === 'string' ? v : null;
    case 'liste':
    case 'relation': return Array.isArray(v) ? v : typeof v === 'string' && v !== '' ? [v] : [];
  }
};

/** Un lecteur pour une base : `lire(page, nom)` rend la valeur de la propriété, à sa nature. */
export const lecteur = (exp: Export, base: NomBase) => {
  const schema = exp.bases[base].schema;
  const natures = Object.fromEntries(ATTENDUES[base].map((a) => [a.nom, a.nature]));
  return (page: Page, nom: string): Valeur => {
    const type = schema[nom]?.type;
    if (!type) return null;
    return versNature(lireBrut(type, page.properties[nom]), natures[nom] ?? 'texte');
  };
};

/** Le texte brut d'un bloc et, à la suite, celui de ses enfants. */
export const texteDuBloc = (bloc: Bloc): string => texteBrut((bloc[bloc.type] as any)?.rich_text);

/** Les liens (adresses) d'un bloc : ceux des morceaux de texte, et l'adresse d'un bloc de fichier ou de signet. */
export const liensDuBloc = (bloc: Bloc): string[] => {
  const contenu = bloc[bloc.type] as any;
  const liens: string[] = [];
  for (const m of (contenu?.rich_text ?? []) as any[]) {
    if (m?.href) liens.push(String(m.href));
    for (const motif of String(m?.plain_text ?? '').matchAll(/https?:\/\/\S+/g)) liens.push(motif[0]);
  }
  if (typeof contenu?.url === 'string') liens.push(contenu.url);
  if (typeof contenu?.external?.url === 'string') liens.push(contenu.external.url);
  return [...new Set(liens)];
};

/** Les blocs du corps, à plat, dans l'ordre : chaque bloc, puis ses enfants. */
export const blocsAPlat = (blocs: Bloc[] = []): Bloc[] => blocs.flatMap((b) => [b, ...blocsAPlat(b.children)]);

/** Le corps entier, en texte brut : un bloc par ligne, dans l'ordre. */
export const corpsEnTexte = (blocs: Bloc[] = []): string => blocsAPlat(blocs).map(texteDuBloc).join('\n');
