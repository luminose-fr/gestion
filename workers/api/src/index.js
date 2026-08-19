const NOTION_VERSION = "2025-09-03";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Origines autorisées à appeler ce proxy depuis un navigateur.
 * Une origine absente de cette liste ne reçoit pas d'en-tête
 * Access-Control-Allow-Origin : le navigateur bloque la réponse.
 */
const ALLOWED_ORIGINS = [
  'https://gestion.luminose.fr',
  'http://localhost:7860',
  'http://127.0.0.1:7860',
];

const buildCorsHeaders = (request) => {
  const origin = request.headers.get('Origin');
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Notion-Version, X-Session-Token',
    'Vary': 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
};

// ===== TOKEN DE SESSION SIGNÉ (HMAC-SHA256) =====
//
// Format : "<payload base64>.<signature base64>"
// Le payload reste lisible côté client (le front y lit expiresAt), mais
// il n'est plus falsifiable : sans le secret, impossible de produire une
// signature valide. Un token fabriqué à la main est rejeté.

const encoder = new TextEncoder();

/**
 * Clé de signature. SESSION_SECRET est le réglage recommandé ;
 * AUTH_PASSWORD sert de repli pour qu'un déploiement sans le nouveau
 * secret ne casse pas la connexion (changer le mot de passe invalide
 * alors les sessions en cours, ce qui est le comportement souhaitable).
 */
const getSessionSecret = (env) => env.SESSION_SECRET || env.AUTH_PASSWORD || '';

const bytesToBase64 = (bytes) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const base64ToBytes = (value) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

const importSigningKey = (secret) =>
  crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );

const createSessionToken = async (env) => {
  const payloadB64 = btoa(JSON.stringify({
    token: crypto.randomUUID(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  }));
  const key = await importSigningKey(getSessionSecret(env));
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64));
  return `${payloadB64}.${bytesToBase64(new Uint8Array(signature))}`;
};

const verifySessionToken = async (sessionToken, env) => {
  const secret = getSessionSecret(env);
  if (!secret) {
    return { valid: false, error: 'Worker mal configuré : aucun secret de signature' };
  }
  if (!sessionToken) {
    return { valid: false, error: 'Token manquant' };
  }

  const separator = sessionToken.lastIndexOf('.');
  if (separator <= 0) {
    return { valid: false, error: 'Token invalide' };
  }

  const payloadB64 = sessionToken.slice(0, separator);
  const signatureB64 = sessionToken.slice(separator + 1);

  let signatureBytes;
  try {
    signatureBytes = base64ToBytes(signatureB64);
  } catch (e) {
    return { valid: false, error: 'Token invalide' };
  }

  // crypto.subtle.verify compare en temps constant
  const key = await importSigningKey(secret);
  const isSignatureValid = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    encoder.encode(payloadB64)
  );
  if (!isSignatureValid) {
    return { valid: false, error: 'Signature invalide' };
  }

  try {
    const tokenData = JSON.parse(atob(payloadB64));
    if (Date.now() > tokenData.expiresAt) {
      return { valid: false, error: 'Session expirée' };
    }
    return { valid: true };
  } catch (e) {
    return { valid: false, error: 'Token invalide' };
  }
};

export default {
  async fetch(request, env) {
    const corsHeaders = buildCorsHeaders(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // ===== ROUTE DE LOGIN =====
    if (path === '/auth/login') {
      const { username, password } = await request.json();

      if (username === env.AUTH_USERNAME && password === env.AUTH_PASSWORD) {
        if (!getSessionSecret(env)) {
          return new Response(JSON.stringify({
            error: "Worker mal configuré : définissez le secret SESSION_SECRET (npx wrangler secret put SESSION_SECRET)."
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ 
          success: true,
          sessionToken: await createSessionToken(env)
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ 
        error: 'Identifiants incorrects' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ===== ROUTES 1MIN.AI =====
    if (path.startsWith('/1min/')) {
      const sessionToken = request.headers.get('X-Session-Token');
      const tokenCheck = await verifySessionToken(sessionToken, env);
      
      if (!tokenCheck.valid) {
        return new Response(JSON.stringify({ 
          error: `Non authentifié - ${tokenCheck.error}` 
        }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const oneMinHeaders = {
        'API-KEY': env.ONE_MIN_API_KEY,
        'Content-Type': 'application/json'
      };

      try {
        // 1. Créer une conversation (optionnel, pour multi-turn)
        if (path === '/1min/create-conversation') {
          const body = await request.json();
          if (!body.type) body.type = "UNIFY_CHAT_WITH_AI";

          const response = await fetch('https://api.1min.ai/api/conversations', {
            method: 'POST',
            headers: oneMinHeaders,
            body: JSON.stringify(body)
          });

          const data = await response.json();
          return new Response(JSON.stringify(data), {
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // 2. Chat with AI (nouvelle API unifiée)
        if (path === '/1min/chat' || path === '/1min/send-message') {
          const body = await request.json();

          const response = await fetch('https://api.1min.ai/api/chat-with-ai', {
            method: 'POST',
            headers: oneMinHeaders,
            body: JSON.stringify(body)
          });

          const responseText = await response.text();

          // Vérifier que la réponse est bien du JSON avant de la renvoyer
          try {
            JSON.parse(responseText);
          } catch (e) {
            console.error('1min.AI chat: réponse non-JSON reçue (status ' + response.status + '):', responseText.substring(0, 500));
            return new Response(JSON.stringify({
              error: 'L\'API 1min.AI a renvoyé une réponse invalide (non-JSON).',
              status: response.status,
              preview: responseText.substring(0, 200)
            }), {
              status: 502,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          return new Response(responseText, {
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

      } catch (error) {
        console.error('1min.AI Proxy Error:', error);
        return new Response(JSON.stringify({ 
          error: 'Erreur proxy 1min.AI',
          details: error.message 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ===== ROUTES NOTION =====
    if (path.startsWith('/v1/')) {
      const sessionToken = request.headers.get('X-Session-Token');
      const tokenCheck = await verifySessionToken(sessionToken, env);
      
      if (!tokenCheck.valid) {
        return new Response(JSON.stringify({ 
          error: `Non authentifié - ${tokenCheck.error}` 
        }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Token valide, continuer vers Notion
      const notionHeaders = {
        'Authorization': `Bearer ${env.NOTION_API_KEY}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      };

      const notionPath = path.replace(/^\/v1/, '/v1');
      const notionUrl = `https://api.notion.com${notionPath}`;

      let notionResponse;

      if (request.method === 'GET') {
        notionResponse = await fetch(notionUrl, {
          method: 'GET',
          headers: notionHeaders,
        });
      } else if (request.method === 'POST' || request.method === 'PATCH') {
        const body = await request.text();
        notionResponse = await fetch(notionUrl, {
          method: request.method,
          headers: notionHeaders,
          body: body,
        });
      }

      const data = await notionResponse.text();
      
      return new Response(data, {
        status: notionResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404, headers: corsHeaders });
  },
};