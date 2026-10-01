/**
 * La forme commune d'un outil MCP, lecture comme écriture. À part du registre
 * (outils.ts) pour que les outils d'écriture puissent s'en servir sans
 * dépendance circulaire.
 */
import type { z } from 'zod';
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
  title: string;
  description: string;
  schema: S;
  annotations: Annotations;
  executer: (args: z.infer<S>, env: Env, contexte: Contexte) => Promise<ResultatOutil>;
};

export const outil = <S extends z.ZodObject>(o: Outil<S>) => o;

export const LECTURE: Annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
