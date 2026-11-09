/**
 * La forme commune d'un outil MCP, lecture comme écriture. À part du registre
 * (outils.ts) pour que les outils d'écriture puissent s'en servir sans
 * dépendance circulaire.
 */
import type { z } from 'zod';
import type { CleDomaine } from './domaines';
import type { Contexte } from './ecriture';
import type { Env } from './env';

export type ResultatOutil = { content: { type: 'text'; text: string }[]; isError?: boolean };

export const texte = (contenu: string, isError = false): ResultatOutil =>
  ({ content: [{ type: 'text', text: contenu }], ...(isError ? { isError: true } : {}) });

/** Des indices pour le client, pas une garantie : les garanties sont dans le serveur. */
export type Annotations = {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
};

export type Outil<S extends z.ZodObject> = {
  name: string;
  /** Obligatoire : la page de consentement et le titre publié en dépendent (domaines.ts). */
  domaine: CleDomaine;
  /** Sans le domaine : `definitionsOutils()` le préfixe. */
  title: string;
  description: string;
  schema: S;
  annotations: Annotations;
  executer: (args: z.infer<S>, env: Env, contexte: Contexte) => Promise<ResultatOutil>;
};

export const outil = <S extends z.ZodObject>(o: Outil<S>) => o;

/*
 * Les annotations, à un seul endroit : la règle qui fait d'un outil un
 * destructeur se lit ici, pas dans sept fichiers qui la recopiaient.
 *
 * `openWorldHint: false` partout : chaque outil ne touche qu'une ressource de
 * Luminose — son compte, son conteneur, son dépôt, sa console —, jamais un
 * ensemble ouvert comme le Web.
 */

export const LECTURE: Annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

/**
 * Écrit sans rien effacer : crée, ajoute, met en pause, range. Un outil en
 * deux temps est une écriture dès son aperçu — c'est le même outil qui exécute
 * quand on lui rend le jeton, et le marquer en lecture laisserait Claude
 * l'appeler sans rien demander.
 */
export const ECRITURE: Annotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

/**
 * Peut effacer un texte ou une valeur, lever une exclusion, retirer un
 * élément, ou rouvrir une dépense (décision du 09/11/2026). Claude demande
 * confirmation à chaque appel d'un outil destructeur : c'est voulu.
 */
export const DESTRUCTIF: Annotations = { ...ECRITURE, destructiveHint: true };

/** Le même appel, refait, ne change plus rien : l'outil répond « rien à faire ». */
export const idempotent = (a: Annotations): Annotations => ({ ...a, idempotentHint: true });
