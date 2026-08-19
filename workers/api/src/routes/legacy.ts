/**
 * Proxys de l'ère Notion — TRANSITOIRES.
 *
 * Le front continue de les appeler jusqu'à la bascule (phase 5). Ils sont
 * portés ici tels quels, sans amélioration : leur seule vertu est de ne rien
 * changer pendant qu'on construit à côté. Ce fichier est destiné à être
 * supprimé en fin de phase 5.
 */
import { Hono } from 'hono';
import type { Env } from '../env';

const NOTION_VERSION = '2025-09-03';

export const legacy = new Hono<{ Bindings: Env }>();

// ── 1min.ai ──────────────────────────────────────────────────────────────

legacy.post('/1min/create-conversation', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  if (!body.type) body.type = 'UNIFY_CHAT_WITH_AI';

  const res = await fetch('https://api.1min.ai/api/conversations', {
    method: 'POST',
    headers: { 'API-KEY': c.env.ONE_MIN_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return c.json(await res.json(), res.status as 200);
});

const chat = async (c: any) => {
  const res = await fetch('https://api.1min.ai/api/chat-with-ai', {
    method: 'POST',
    headers: { 'API-KEY': c.env.ONE_MIN_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(await c.req.json()),
  });

  const text = await res.text();
  // 1min.ai renvoie parfois du HTML d'erreur : on le détecte ici plutôt que de
  // laisser le front planter sur un JSON.parse.
  try {
    JSON.parse(text);
  } catch {
    console.error(`1min.AI chat: réponse non-JSON (status ${res.status}):`, text.slice(0, 500));
    return c.json({
      error: "L'API 1min.AI a renvoyé une réponse invalide (non-JSON).",
      status: res.status,
      preview: text.slice(0, 200),
    }, 502);
  }

  return new Response(text, { status: res.status, headers: { 'Content-Type': 'application/json' } });
};

legacy.post('/1min/chat', chat);
legacy.post('/1min/send-message', chat);

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
