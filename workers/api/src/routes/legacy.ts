/**
 * Proxy Notion — TRANSITOIRE.
 *
 * Plus aucun client : le front est passé sur /api/* en phase 5, et le proxy
 * 1min.ai a disparu en phase 6 avec l'abstraction fournisseur. Ce reste sert
 * uniquement de filet le temps que la migration soit jugée définitive
 * (SPEC §9.4 : Notion reste consultable au moins un mois).
 *
 * À supprimer ensuite, avec le secret NOTION_API_KEY.
 */
import { Hono } from 'hono';
import type { Env } from '../env';

const NOTION_VERSION = '2025-09-03';

export const legacy = new Hono<{ Bindings: Env }>();

// ── Notion ───────────────────────────────────────────────────────────────

legacy.all('/v1/*', async (c) => {
  const url = new URL(c.req.url);
  const headers = {
    Authorization: `Bearer ${c.env.NOTION_API_KEY}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };

  const method = c.req.method;
  const res = await fetch(`https://api.notion.com${url.pathname}${url.search}`, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : await c.req.text(),
  });

  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
});
