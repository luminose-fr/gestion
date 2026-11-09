/**
 * Worker MCP — mcp.luminose.fr
 *
 *   /mcp                                     le serveur MCP (POST), derrière un jeton porteur
 *   /.well-known/oauth-protected-resource/…  RFC 9728    ┐
 *   /.well-known/oauth-authorization-server  RFC 8414    ├ @cloudflare/workers-oauth-provider
 *   /token                                   codes, jetons, rotation, révocation ┘
 *   /authorize  /callback                    identification et consentement (autorisation.ts)
 *
 * Couche A : Claude → ce Worker (OAuth, Google en amont, une adresse admise).
 * Couche B : ce Worker → Google Ads (refresh token en secret, lecture seule).
 * Indépendantes : aucune ne transporte les jetons de l'autre.
 *
 * CLIENTS : Client ID Metadata Documents seulement. Claude se présente par
 * l'URL de son document ; pas d'enregistrement dynamique (déprécié par MCP
 * 2026-07-28). Repli prévu si CIMD échoue avec claude.ai : un client
 * préenregistré (scripts/client-preenregistre.mjs), rien d'autre.
 */
import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import { OPTIONS } from './options';
import type { Env } from './env';

// Aucun autre export ici : workerd en ferait un point d'entrée (voir options.ts).
export default new OAuthProvider<Env>(OPTIONS);
