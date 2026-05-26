const NOTION_VERSION = "2025-09-03";

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Notion-Version, X-Session-Token',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // ===== ROUTE DE LOGIN =====
    if (path === '/auth/login') {
      const { username, password } = await request.json();

      if (username === env.AUTH_USERNAME && password === env.AUTH_PASSWORD) {
        const sessionToken = crypto.randomUUID();
        
        const tokenData = btoa(JSON.stringify({
          token: sessionToken,
          expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24h
        }));

        return new Response(JSON.stringify({ 
          success: true,
          sessionToken: tokenData
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

    // ===== HELPER: VÉRIFIER LE TOKEN =====
    const verifySessionToken = (sessionToken) => {
      if (!sessionToken) {
        return { valid: false, error: 'Token manquant' };
      }

      try {
        const tokenData = JSON.parse(atob(sessionToken));
        if (Date.now() > tokenData.expiresAt) {
          return { valid: false, error: 'Session expirée' };
        }
        return { valid: true };
      } catch (e) {
        return { valid: false, error: 'Token invalide' };
      }
    };

    // ===== ROUTES 1MIN.AI =====
    if (path.startsWith('/1min/')) {
      const sessionToken = request.headers.get('X-Session-Token');
      const tokenCheck = verifySessionToken(sessionToken);
      
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
      const tokenCheck = verifySessionToken(sessionToken);
      
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