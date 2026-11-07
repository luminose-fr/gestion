/**
 * Le serveur MCP, appelant de cette API (SPEC §7, v2.34).
 *
 * Il ne partage ni la base ni le secret de session de la console : il présente
 * son propre jeton, en `Authorization: Bearer`, et ce Worker n'en garde que
 * l'empreinte (`MCP_JETON_EMPREINTE`, SHA-256 en hexadécimal). Une fuite de la
 * configuration de ce Worker ne donne donc pas le jeton.
 *
 * Le jeton n'ouvre qu'une liste fermée de routes : les contenus et les séries,
 * en lecture, en création et en modification de fiche — jamais une suppression,
 * ni les réglages, l'IA, l'export ou le montage. Sur ces routes, il n'écrit que
 * ce que Florent a accordé le 03/11/2026 : la fiche d'un contenu, son brouillon
 * par le journal des générations, et le regroupement d'idées en série — et, le
 * 07/11/2026, le déplacement d'un contenu entre séries et l'ordre d'une série.
 *
 * FACULTATIF, comme les jetons de env.ts : sans empreinte posée, un porteur est
 * refusé et la console fonctionne à l'identique.
 */
import { Refus } from './refus';
import type { Env } from './env';

/** La provenance de ce que le serveur MCP écrit au journal des générations. */
export const LIBELLE_MCP = 'Claude (MCP)';
/** Le brouillon en place, versé au journal avant d'être remplacé, quand il n'y figurait pas. */
export const LIBELLE_EN_PLACE = 'Version en place';

/** Ce que le jeton du serveur MCP ouvre — méthode et chemin. Rien d'autre. */
const ROUTES_MCP: [string, RegExp][] = [
  ['GET', /^\/api\/contents$/],
  ['GET', /^\/api\/contents\/[^/]+$/],
  ['GET', /^\/api\/contents\/[^/]+\/generations$/],
  ['POST', /^\/api\/contents$/],
  ['PATCH', /^\/api\/contents\/[^/]+$/],
  ['POST', /^\/api\/contents\/[^/]+\/generations$/],
  ['GET', /^\/api\/series$/],
  ['GET', /^\/api\/series\/[^/]+$/],
  ['POST', /^\/api\/series\/regrouper$/],
  ['POST', /^\/api\/contents\/[^/]+\/deplacer$/],
  ['POST', /^\/api\/series\/[^/]+\/reordonner$/],
];

export const routeOuverteAuMcp = (methode: string, chemin: string): boolean =>
  ROUTES_MCP.some(([m, motif]) => m === methode && motif.test(chemin));

/** La fiche d'un contenu : ce que le serveur MCP peut poser à la création et modifier ensuite. */
export const CHAMPS_FICHE = ['title', 'notes', 'status', 'targetFormat', 'objectif', 'platforms', 'scheduledDate', 'angle'] as const;

/**
 * Refuse tout champ hors de la fiche. Le brouillon passe par le journal des
 * générations, pour rester annulable ; la série, par le regroupement et le
 * déplacement ; le reste — analyse, slides, atelier — appartient aux actions
 * de la console.
 */
export const exigerFiche = (entree: Record<string, unknown>): void => {
  const hors = Object.keys(entree).filter((k) => !(CHAMPS_FICHE as readonly string[]).includes(k));
  if (hors.length > 0) {
    throw new Refus(
      `Le serveur MCP n'écrit que la fiche d'un contenu (${CHAMPS_FICHE.join(', ')}) : ${hors.join(', ')} refusé. ` +
      'Le brouillon passe par le journal des générations.',
      403,
    );
  }
};

const encoder = new TextEncoder();
const hexadecimal = (octets: ArrayBuffer) => [...new Uint8Array(octets)].map((o) => o.toString(16).padStart(2, '0')).join('');

/** Deux chaînes de même longueur comparées sans s'arrêter à la première différence. */
const egales = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

export type VerdictMcp = { valide: true } | { valide: false; erreur: string };

export const verifierJetonMcp = async (jeton: string, env: Pick<Env, 'MCP_JETON_EMPREINTE'>): Promise<VerdictMcp> => {
  const attendue = env.MCP_JETON_EMPREINTE?.trim().toLowerCase();
  if (!attendue) return { valide: false, erreur: 'accès du serveur MCP non configuré (MCP_JETON_EMPREINTE absent)' };
  if (!jeton) return { valide: false, erreur: 'jeton du serveur MCP manquant' };
  const presentee = hexadecimal(await crypto.subtle.digest('SHA-256', encoder.encode(jeton)));
  return egales(presentee, attendue) ? { valide: true } : { valide: false, erreur: 'jeton du serveur MCP invalide' };
};
