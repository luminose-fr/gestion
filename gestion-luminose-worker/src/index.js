const NOTION_VERSION = "2025-09-03";

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Notion-Version',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // LOG 1: Requête reçue
      console.log('=== REQUÊTE REÇUE ===');
      console.log('Path:', path);
      console.log('Method:', request.method);

      // LOG 2: Vérifier la clé API
      console.log('=== CLÉ API ===');
      console.log('Clé présente:', !!env.NOTION_API_KEY);
      console.log('Longueur clé:', env.NOTION_API_KEY?.length);
      console.log('Début clé:', env.NOTION_API_KEY?.substring(0, 10) + '...');

      const notionHeaders = {
        'Authorization': `Bearer ${env.NOTION_API_KEY}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      };

      const notionPath = path.replace(/^\/v1/, '/v1');
      const notionUrl = `https://api.notion.com${notionPath}`;

      // LOG 3: URL et headers envoyés à Notion
      console.log('=== ENVOI À NOTION ===');
      console.log('URL:', notionUrl);
      console.log('Headers:', JSON.stringify(notionHeaders, null, 2));

      let notionResponse;
      let requestBody = null;

      if (request.method === 'GET') {
        notionResponse = await fetch(notionUrl, {
          method: 'GET',
          headers: notionHeaders,
        });
      } else if (request.method === 'POST' || request.method === 'PATCH') {
        requestBody = await request.text();
        
        // LOG 4: Body de la requête
        console.log('=== BODY ENVOYÉ ===');
        console.log(requestBody);
        
        notionResponse = await fetch(notionUrl, {
          method: request.method,
          headers: notionHeaders,
          body: requestBody,
        });
      } else {
        return new Response('Method not allowed', { 
          status: 405,
          headers: corsHeaders 
        });
      }

      // LOG 5: Réponse de Notion
      console.log('=== RÉPONSE NOTION ===');
      console.log('Status:', notionResponse.status);
      console.log('Headers:', JSON.stringify([...notionResponse.headers.entries()], null, 2));

      const data = await notionResponse.text();
      
      // LOG 6: Body de la réponse
      console.log('=== BODY RÉPONSE ===');
      console.log(data);

      return new Response(data, {
        status: notionResponse.status,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        },
      });

    } catch (error) {
      console.error('=== ERREUR WORKER ===', error);
      return new Response(JSON.stringify({ 
        error: error.message,
        stack: error.stack 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};