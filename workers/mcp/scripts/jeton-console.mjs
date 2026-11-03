#!/usr/bin/env node
/**
 * Fabriquer, une fois, le jeton du serveur MCP auprès de la console — et son
 * empreinte, la seule chose que la console en garde (décision du 03/11/2026,
 * workers/mcp/decisions/2026-11-03-contenus.md ; SPEC §7).
 *
 *   node workers/mcp/scripts/jeton-console.mjs
 *
 * Deux secrets, un par Worker :
 *   - CONSOLE_JETON, dans workers/mcp : le jeton lui-même ;
 *   - MCP_JETON_EMPREINTE, dans workers/api : son SHA-256, en hexadécimal.
 * La console ne connaît donc jamais le jeton : une fuite de sa configuration
 * ne donne pas l'accès. Le refaire, c'est révoquer l'ancien.
 *
 * N'ÉCRIT RIEN SUR DISQUE et n'appelle rien : il affiche les deux valeurs et
 * les commandes qui les posent. Node seul, aucune dépendance. Les commandes
 * `wrangler` se lancent depuis la VM (CLAUDE.md).
 */
import { createHash, randomBytes } from 'node:crypto';

const jeton = randomBytes(32).toString('base64url');
const empreinte = createHash('sha256').update(jeton).digest('hex');

console.log(`
Jeton du serveur MCP (secret CONSOLE_JETON, Worker MCP) :
  ${jeton}

Son empreinte (secret MCP_JETON_EMPREINTE, Worker de la console) :
  ${empreinte}

Depuis la VM, à la racine du dépôt — la valeur est demandée par wrangler, la coller :
  cd workers/mcp && npx wrangler secret put CONSOLE_JETON && cd ../..
  cd workers/api && npx wrangler secret put MCP_JETON_EMPREINTE && cd ../..

Puis déployer les deux Workers : ./scripts/deploy.sh api, puis ./scripts/deploy.sh mcp.
Les deux valeurs vont ensemble : refaire le jeton sans reposer l'empreinte ferme les contenus au serveur MCP.
`);
