/**
 * Le protocole MCP sur HTTP (Streamable HTTP), écrit à la main.
 *
 * POURQUOI À LA MAIN : le SDK officiel tire des dépendances qu'un agent ne
 * peut pas installer dans ce dépôt (CLAUDE.md), et le protocole utile ici
 * tient en cinq méthodes. Chaque requête est un POST, chaque réponse un objet
 * JSON — pas de flux SSE, rien à garder entre deux requêtes.
 *
 * DEUX ÉPOQUES, servies sur le même point d'entrée (« dual-era », spécification
 * 2026-07-28, Versioning) :
 *
 *   - moderne (2026-07-28) : sans état. Chaque requête porte sa version et les
 *     capacités du client dans `_meta`, reprises en en-têtes HTTP ; le serveur
 *     vérifie que les deux concordent. `server/discover` remplace `initialize`.
 *   - héritée (2025-03-26 à 2025-11-25) : poignée de main `initialize`. On y
 *     répond sans ouvrir de session — rien dans ces versions n'oblige le
 *     serveur à en créer une.
 *
 * Le client choisit en ouvrant : `initialize` sélectionne l'héritée, une
 * requête qui porte `_meta` la moderne. Un client récent qui tente d'abord le
 * moderne reçoit donc du moderne, et ne retombe jamais sur l'ancien.
 */
import { definitionsOutils, executerOutil, trouverOutil } from './outils';
import type { Contexte } from './ecriture';
import type { Env } from './env';

export const VERSION_MODERNE = '2026-07-28';
export const VERSIONS_HERITEES = ['2025-11-25', '2025-06-18', '2025-03-26'];
export const VERSIONS = [VERSION_MODERNE, ...VERSIONS_HERITEES];

const SERVEUR = { name: 'luminose-google-ads', title: 'Luminose — Google Ads et corpus', version: '1.1.0' };

const INSTRUCTIONS =
  "Le compte Google Ads de Luminose. Lire : ads_requete exécute du GAQL sur le compte Luminose par défaut ; " +
  "ads_lister_comptes n'est utile que pour la devise ou un diagnostic d'accès. Les montants sont en micros : diviser par 1 000 000. " +
  "Écrire : Claude prépare, Florent publie. Chaque écriture se fait en deux temps — un aperçu vérifié par Google sans rien " +
  "appliquer, puis l'exécution avec le jeton de l'aperçu, après l'accord de Florent. Rien ne s'active par ce serveur : " +
  "l'activation, donc la dépense, se fait dans l'interface Google Ads. " +
  "Le corpus de Luminose — sa source de vérité : identité, offres, voix, canaux, stratégie — se lit avec corpus_contexte " +
  "(un profil composé), corpus_index et corpus_lire (les fiches), tel que la branche main du dépôt le porte. Il s'écrit " +
  "par commit, dans les mêmes deux temps : corpus_modifier, corpus_decision_ajouter, puis corpus_deployer pour publier.";

const META_VERSION = 'io.modelcontextprotocol/protocolVersion';
const META_CAPACITES = 'io.modelcontextprotocol/clientCapabilities';
const META_SERVEUR = 'io.modelcontextprotocol/serverInfo';

// Codes JSON-RPC. Les trois derniers sont réservés par la spécification 2026-07-28.
const ERREUR_ANALYSE = -32700;
const REQUETE_INVALIDE = -32600;
const METHODE_INCONNUE = -32601;
const PARAMETRES_INVALIDES = -32602;
const ERREUR_INTERNE = -32603;
const EN_TETES_DISCORDANTS = -32020;
const VERSION_NON_PRISE_EN_CHARGE = -32022;

type Id = string | number | null;
type Message = { jsonrpc?: unknown; id?: Id; method?: unknown; params?: Record<string, unknown> };

const json = (statut: number, corps: unknown) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } });

const resultat = (id: Id, contenu: Record<string, unknown>, statut = 200) =>
  json(statut, { jsonrpc: '2.0', id, result: contenu });

const erreur = (statut: number, id: Id, code: number, message: string, data?: unknown) =>
  json(statut, { jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } });

/**
 * `Mcp-Name` peut arriver encodé (`=?base64?…?=`) quand le nom n'est pas de
 * l'ASCII sûr. Nos noms le sont, mais un client a le droit d'encoder quand même.
 */
const decoderEntete = (valeur: string | null): string | null => {
  const encode = valeur?.match(/^=\?base64\?(.*)\?=$/);
  if (!encode) return valeur;
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(encode[1]), (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
};

const appelOutil = async (id: Id, params: Record<string, unknown>, env: Env, contexte: Contexte, moderne: boolean) => {
  const o = trouverOutil(params.name);
  if (!o) return erreur(200, id, PARAMETRES_INVALIDES, `Outil inconnu : ${String(params.name)}`);
  try {
    const sortie = await executerOutil(o, params.arguments, env, contexte);
    return resultat(id, moderne ? { resultType: 'complete', ...sortie, _meta: { [META_SERVEUR]: SERVEUR } } : sortie);
  } catch (e) {
    console.error(`Outil ${o.name} :`, e);
    return erreur(500, id, ERREUR_INTERNE, 'Erreur interne du serveur MCP');
  }
};

// ── Époque moderne ───────────────────────────────────────────────────────

const servirModerne = async (requete: Request, id: Id, methode: string, params: Record<string, unknown>, env: Env, contexte: Contexte) => {
  const meta = (params._meta ?? {}) as Record<string, unknown>;
  const version = meta[META_VERSION];

  if (typeof version !== 'string') {
    return erreur(400, id, PARAMETRES_INVALIDES, `_meta["${META_VERSION}"] manquant`);
  }
  const enTeteVersion = requete.headers.get('MCP-Protocol-Version');
  if (enTeteVersion !== version) {
    return erreur(400, id, EN_TETES_DISCORDANTS, `En-tête MCP-Protocol-Version (${enTeteVersion ?? 'absent'}) différent du corps (${version})`);
  }
  if (version !== VERSION_MODERNE) {
    return erreur(400, id, VERSION_NON_PRISE_EN_CHARGE, 'Unsupported protocol version', { supported: VERSIONS, requested: version });
  }
  if (meta[META_CAPACITES] === undefined) {
    return erreur(400, id, PARAMETRES_INVALIDES, `_meta["${META_CAPACITES}"] manquant`);
  }
  const enTeteMethode = requete.headers.get('Mcp-Method');
  if (enTeteMethode !== methode) {
    return erreur(400, id, EN_TETES_DISCORDANTS, `En-tête Mcp-Method (${enTeteMethode ?? 'absent'}) différent du corps (${methode})`);
  }
  if (methode === 'tools/call') {
    const enTeteNom = decoderEntete(requete.headers.get('Mcp-Name'));
    if (enTeteNom !== params.name) {
      return erreur(400, id, EN_TETES_DISCORDANTS, `En-tête Mcp-Name (${enTeteNom ?? 'absent'}) différent du corps (${String(params.name)})`);
    }
  }

  const complet = (contenu: Record<string, unknown>) =>
    resultat(id, { resultType: 'complete', ...contenu, _meta: { [META_SERVEUR]: SERVEUR } });

  switch (methode) {
    case 'server/discover':
      return complet({ supportedVersions: VERSIONS, capabilities: { tools: {} }, instructions: INSTRUCTIONS });
    case 'tools/list':
      return complet({ tools: definitionsOutils() });
    case 'tools/call':
      return appelOutil(id, params, env, contexte, true);
    case 'ping':
      return complet({});
    default:
      return erreur(404, id, METHODE_INCONNUE, `Méthode inconnue : ${methode}`);
  }
};

// ── Époque héritée ───────────────────────────────────────────────────────

const servirHeritee = async (id: Id, methode: string, params: Record<string, unknown>, env: Env, contexte: Contexte) => {
  switch (methode) {
    case 'initialize': {
      const demandee = params.protocolVersion;
      const version = typeof demandee === 'string' && VERSIONS_HERITEES.includes(demandee) ? demandee : VERSIONS_HERITEES[0];
      return resultat(id, {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVEUR,
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return resultat(id, {});
    case 'tools/list':
      return resultat(id, { tools: definitionsOutils() });
    case 'tools/call':
      return appelOutil(id, params, env, contexte, false);
    default:
      return erreur(200, id, METHODE_INCONNUE, `Méthode inconnue : ${methode}`);
  }
};

// ── Point d'entrée ───────────────────────────────────────────────────────

/** Un POST sur /mcp, une fois le jeton vérifié. `contexte` : qui appelle, avec quels scopes. */
export const traiterMcp = async (requete: Request, env: Env, contexte: Contexte): Promise<Response> => {
  let message: Message;
  try {
    message = await requete.json();
  } catch {
    return erreur(400, null, ERREUR_ANALYSE, 'Corps JSON illisible');
  }
  if (Array.isArray(message)) {
    return erreur(400, null, REQUETE_INVALIDE, 'Les lots JSON-RPC ne sont pas pris en charge : un message par requête.');
  }
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return erreur(400, message?.id ?? null, REQUETE_INVALIDE, 'Message JSON-RPC 2.0 invalide');
  }

  // Une notification n'appelle pas de réponse : 202, corps vide — dans les
  // deux époques (`notifications/initialized` pour l'héritée).
  if (!('id' in message)) return new Response(null, { status: 202 });
  const id = message.id ?? null;
  if (id === null || (typeof id !== 'string' && typeof id !== 'number')) {
    return erreur(400, null, REQUETE_INVALIDE, 'Identifiant de requête absent ou invalide');
  }

  const params = (message.params && typeof message.params === 'object' ? message.params : {}) as Record<string, unknown>;
  const versionCorps = (params._meta as Record<string, unknown> | undefined)?.[META_VERSION];
  const versionEnTete = requete.headers.get('MCP-Protocol-Version');

  // Moderne dès que le corps porte sa version, ou que l'en-tête annonce une
  // version qui n'est pas héritée (il faudra alors que le corps la porte aussi).
  // Sans l'un ni l'autre, c'est un client de 2025-03-26, qui ne connaissait
  // pas l'en-tête : la spécification permet de le servir comme tel.
  const moderne = message.method !== 'initialize' &&
    (versionCorps !== undefined || (versionEnTete !== null && !VERSIONS_HERITEES.includes(versionEnTete)));

  return moderne
    ? servirModerne(requete, id, message.method, params, env, contexte)
    : servirHeritee(id, message.method, params, env, contexte);
};
