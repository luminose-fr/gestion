// Version API Notion
const NOTION_VERSION = "2025-09-03";

export default {
  async fetch(request, env) {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*', // Remplacez par votre domaine si besoin
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Gérer preflight CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // Headers Notion (avec votre clé secrète)
      const notionHeaders = {
        'Authorization': `Bearer ${env.NOTION_API_KEY}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      };

      // Router les différentes opérations
      let notionResponse;

      // ===== CONTENT DATABASE =====
      
      if (path === '/content/fetch') {
        // GET data_sources puis query
        const { contentDbId } = await request.json();
        
        // 1. Get database
        const dbRes = await fetch(`https://api.notion.com/v1/databases/${contentDbId}`, {
          headers: notionHeaders,
        });
        const dbData = await dbRes.json();
        const dataSourceId = dbData.data_sources?.[0]?.id;
        
        // 2. Query data_source
        notionResponse = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
          method: 'POST',
          headers: notionHeaders,
          body: JSON.stringify({
            sorts: [{ timestamp: "last_edited_time", direction: "descending" }]
          }),
        });
      }

      else if (path === '/content/create') {
        const { contentDbId, title, status } = await request.json();
        
        // 1. Get data_source
        const dbRes = await fetch(`https://api.notion.com/v1/databases/${contentDbId}`, {
          headers: notionHeaders,
        });
        const dbData = await dbRes.json();
        const dataSourceId = dbData.data_sources?.[0]?.id;
        
        // 2. Create page
        notionResponse = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers: notionHeaders,
          body: JSON.stringify({
            parent: { type: "data_source_id", data_source_id: dataSourceId },
            properties: {
              "Titre": { title: [{ text: { content: title } }] },
              "Statut": { select: { name: status } }
            }
          }),
        });
      }

      else if (path === '/content/update') {
        const { pageId, properties } = await request.json();
        
        notionResponse = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
          method: 'PATCH',
          headers: notionHeaders,
          body: JSON.stringify({ properties }),
        });
      }

      // ===== CONTEXT DATABASE =====
      
      else if (path === '/context/fetch') {
        const { contextDbId } = await request.json();
        
        // 1. Get database
        const dbRes = await fetch(`https://api.notion.com/v1/databases/${contextDbId}`, {
          headers: notionHeaders,
        });
        const dbData = await dbRes.json();
        const dataSourceId = dbData.data_sources?.[0]?.id;
        
        // 2. Query data_source
        notionResponse = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
          method: 'POST',
          headers: notionHeaders,
          body: JSON.stringify({}),
        });
      }

      else if (path === '/context/create') {
        const { contextDbId, name, description } = await request.json();
        
        // 1. Get data_source
        const dbRes = await fetch(`https://api.notion.com/v1/databases/${contextDbId}`, {
          headers: notionHeaders,
        });
        const dbData = await dbRes.json();
        const dataSourceId = dbData.data_sources?.[0]?.id;
        
        // 2. Create page
        notionResponse = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers: notionHeaders,
          body: JSON.stringify({
            parent: { type: "data_source_id", data_source_id: dataSourceId },
            properties: {
              "Nom": { title: [{ text: { content: name } }] },
              "Description": { rich_text: [{ text: { content: description } }] }
            }
          }),
        });
      }

      else if (path === '/context/update') {
        const { contextId, name, description } = await request.json();
        
        notionResponse = await fetch(`https://api.notion.com/v1/pages/${contextId}`, {
          method: 'PATCH',
          headers: notionHeaders,
          body: JSON.stringify({
            properties: {
              "Nom": { title: [{ text: { content: name } }] },
              "Description": { rich_text: [{ text: { content: description } }] }
            }
          }),
        });
      }

      else if (path === '/context/delete') {
        const { contextId } = await request.json();
        
        notionResponse = await fetch(`https://api.notion.com/v1/pages/${contextId}`, {
          method: 'PATCH',
          headers: notionHeaders,
          body: JSON.stringify({ archived: true }),
        });
      }

      else {
        return new Response(JSON.stringify({ error: 'Endpoint non trouvé' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Retourner la réponse Notion
      const data = await notionResponse.json();
      
      return new Response(JSON.stringify(data), {
        status: notionResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (error) {
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