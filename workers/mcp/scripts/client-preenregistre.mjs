#!/usr/bin/env node
/**
 * REPLI — seulement si claude.ai n'arrive pas à se connecter par CIMD.
 *
 *   node workers/mcp/scripts/client-preenregistre.mjs
 *
 * Fabrique un client préenregistré avec `createClient()` de la bibliothèque —
 * c'est elle qui écrit l'enregistrement, on ne devine pas son format — puis
 * affiche la commande qui le pose dans OAUTH_KV. Ce script n'écrit rien : il
 * travaille sur un KV en mémoire, et la seule écriture réelle est la commande
 * wrangler, lancée depuis la VM.
 *
 * Client PUBLIC (`none`) : aucun secret à transporter. Dans Claude, on saisit
 * l'identifiant affiché dans les paramètres avancés du connecteur, et on
 * laisse le secret vide. CIMD reste actif à côté, pour Claude Code.
 *
 * Node 22.15 ou plus (module.registerHooks). Aucun `npm install` : la
 * bibliothèque est du JavaScript pur, déjà dans node_modules.
 */
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';

// La bibliothèque importe `cloudflare:workers`, qui n'existe que dans workerd.
// Elle ne s'en sert que pour reconnaître des classes ; un substitut suffit.
registerHooks({
  resolve: (specifier, context, nextResolve) => (specifier === 'cloudflare:workers'
    ? { url: 'data:text/javascript,export class WorkerEntrypoint {}', shortCircuit: true }
    : nextResolve(specifier, context)),
});
// Le drapeau de wrangler.toml, tel que workerd l'exposerait : sans lui, la
// bibliothèque avertit, à tort ici, que CIMD est désactivé.
globalThis.Cloudflare = { compatibilityFlags: { global_fetch_strictly_public: true } };

const { getOAuthApi } = await import('@cloudflare/workers-oauth-provider');

// La ressource s'écrit à un seul endroit, src/index.ts : on l'y lit.
const RESSOURCE = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
  .match(/export const RESSOURCE = '([^']+)'/)?.[1];
if (!RESSOURCE) {
  console.error('RESSOURCE introuvable dans src/index.ts.');
  process.exit(1);
}

const ecrit = [];
const kv = {
  async get() { return null; },
  async put(cle, valeur) { ecrit.push({ cle, valeur }); },
  async delete() {},
  async list() { return { keys: [], list_complete: true }; },
};

const inutile = { fetch: () => new Response(null, { status: 404 }) };
const oauth = getOAuthApi({
  apiRoute: '/mcp',
  apiHandler: inutile,
  defaultHandler: inutile,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  resourceMetadata: { resource: RESSOURCE },
  clientIdMetadataDocumentEnabled: true,
}, { OAUTH_KV: kv });

const client = await oauth.createClient({
  clientName: 'Claude',
  redirectUris: ['https://claude.ai/api/mcp/auth_callback'],
  tokenEndpointAuthMethod: 'none',
});

const [{ cle, valeur }] = ecrit;
if (valeur.includes("'")) {
  console.error('Enregistrement inattendu (apostrophe) : commande à écrire à la main.');
  process.exit(1);
}

console.log(
  `Identifiant du client : ${client.clientId}\n\n` +
  'Depuis la VM, dans workers/mcp :\n\n' +
  `  npx wrangler kv key put --binding OAUTH_KV --remote '${cle}' '${valeur}'\n\n` +
  "Puis dans Claude : retirer le connecteur, le rajouter avec l'URL " +
  `${RESSOURCE}, et dans les paramètres avancés,\n` +
  `OAuth Client ID = ${client.clientId}, secret laissé vide.`,
);
