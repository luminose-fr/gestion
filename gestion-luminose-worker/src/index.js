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

      // Vérifier les credentials
      if (username === env.AUTH_USERNAME && password === env.AUTH_PASSWORD) {
        // Générer un token de session aléatoire
        const sessionToken = crypto.randomUUID();
        
        // Stocker en KV avec expiration 24h (ou utiliser un simple hash si pas de KV)
        // Option simple sans KV : retourner juste un token hashé
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

    // ===== VÉRIFIER LE TOKEN POUR LES ROUTES NOTION =====
    if (path.startsWith('/v1/')) {
      const sessionToken = request.headers.get('X-Session-Token');
      
      if (!sessionToken) {
        return new Response(JSON.stringify({ 
          error: 'Non authentifié - Token manquant' 
        }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Vérifier la validité du token
      try {
        const tokenData = JSON.parse(atob(sessionToken));
        if (Date.now() > tokenData.expiresAt) {
          return new Response(JSON.stringify({ 
            error: 'Session expirée' 
          }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch (e) {
        return new Response(JSON.stringify({ 
          error: 'Token invalide' 
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