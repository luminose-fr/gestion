import { ContentItem, ContentStatus, Platform, ContextItem, Verdict } from "../types";
import { CONFIG } from "../config";
import { WORKER_URL } from "../constants";
import { getSessionToken } from "../auth";

// Version API Notion actuelle
const NOTION_VERSION = "2025-09-03";

// Headers sans la clé API (gérée par le Worker)
const getHeaders = () => ({
  "Notion-Version": NOTION_VERSION,
  "Content-Type": "application/json",
  "X-Session-Token": getSessionToken() || "",
});

// Le Worker proxifie les requêtes vers Notion
const getUrl = (endpoint: string) => `${WORKER_URL}/v1${endpoint}`;

// --- HELPERS D'ERREUR ---
const handleNotionResponse = async (response: Response, context: string) => {
    if (!response.ok) {
        let errorData: any = {};
        let errorMessage = `Erreur ${response.status}`;

        try {
            errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
            
            // Gestion spécifique des erreurs de validation Notion (limite caractères, etc.)
            if (errorData.code === 'validation_error') {
                if (errorMessage.includes('length should be ≤ `2000`')) {
                    throw new Error("Le texte dépasse la limite de 2000 caractères imposée par Notion. Veuillez raccourcir le contenu.");
                }
            }
        } catch (e: any) {
            // Si le parsing JSON échoue ou si c'est une autre erreur
            if (e.message && e.message.includes("limite de 2000 caractères")) throw e;
            const text = await response.text().catch(() => "");
            console.error(`Erreur brute Notion (${context}):`, text);
        }

        console.error(`Erreur structurée Notion (${context}):`, errorData);
        throw new Error(errorMessage);
    }
    return response.json();
};

// --- HELPERS DE PARSING ---

const getPlainText = (property: any): string => {
  if (!property) return "";
  
  const contentArray = property.rich_text || property.title;
  
  if (Array.isArray(contentArray)) {
    return contentArray.map((chunk: any) => chunk.plain_text || "").join("");
  }
  return "";
};

// --- CONTENT DATABASE ---

const mapNotionPageToItem = (page: any): ContentItem => {
  const props = page.properties;
  
  const title = getPlainText(props["Titre"]) || "Sans titre";
  
  const statusValue = props["Statut"]?.select?.name || props["Statut"]?.status?.name;
  const status = (statusValue as ContentStatus) || ContentStatus.IDEA;

  const platforms = props["Plateforme"]?.multi_select?.map((p: any) => p.name as Platform) || [];
  
  const body = getPlainText(props["Contenu"]);
  const scheduledDate = props["Date de publication"]?.date?.start || null;
  const notes = getPlainText(props["Notes"]);

  // Nouveaux champs Analyse
  const analyzed = props["Analysé"]?.checkbox || false;
  const verdictValue = props["Verdict"]?.select?.name;
  const verdict = (verdictValue as Verdict) || undefined;
  const strategicAngle = getPlainText(props["Angle stratégique"]);

  return {
    id: page.id,
    title,
    status,
    platforms,
    body,
    scheduledDate,
    notes,
    lastEdited: page.last_edited_time,
    analyzed,
    verdict,
    strategicAngle
  };
};

export const fetchContent = async (): Promise<ContentItem[]> => {
  if (!CONFIG.NOTION_CONTENT_DB_ID) {
     throw new Error("Database ID manquant");
  }

  try {
    // Étape 1: Récupérer les data_sources du database
    const dbResponse = await fetch(getUrl(`/databases/${CONFIG.NOTION_CONTENT_DB_ID}`), {
      method: "GET",
      headers: getHeaders(),
    });
    
    const dbData = await handleNotionResponse(dbResponse, "fetchContent DB");
    const dataSourceId = dbData.data_sources?.[0]?.id;
    
    if (!dataSourceId) {
        throw new Error("Aucun data source trouvé pour ce database");
    }

    // Étape 2: Query le data_source
    const response = await fetch(getUrl(`/data_sources/${dataSourceId}/query`), {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        sorts: [
          {
            timestamp: "last_edited_time",
            direction: "descending",
          },
        ],
      }),
    });

    const data = await handleNotionResponse(response, "fetchContent Query");
    return data.results.map(mapNotionPageToItem);

  } catch (error: any) {
    console.error("EXCEPTION fetchContent:", error);
    throw error;
  }
};

export const createContent = async (title: string): Promise<ContentItem> => {
    try {
        // Étape 1: Récupérer le data_source_id
        const dbResponse = await fetch(getUrl(`/databases/${CONFIG.NOTION_CONTENT_DB_ID}`), {
            method: "GET",
            headers: getHeaders(),
        });
        const dbData = await handleNotionResponse(dbResponse, "createContent DB");
        const dataSourceId = dbData.data_sources?.[0]?.id;
        
        if (!dataSourceId) {
            throw new Error("Aucun data source trouvé");
        }

        // Étape 2: Créer la page avec data_source_id
        const response = await fetch(getUrl("/pages"), {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({
                parent: { 
                    type: "data_source_id",
                    data_source_id: dataSourceId 
                },
                properties: {
                    "Titre": {
                        title: [
                            { text: { content: title } }
                        ]
                    },
                    "Statut": {
                        select: { name: ContentStatus.IDEA }
                    }
                }
            })
        });

        const page = await handleNotionResponse(response, "createContent Page");
        return mapNotionPageToItem(page);
    } catch (e) {
        console.error(e);
        throw e;
    }
};

export const updateContent = async (item: ContentItem): Promise<void> => {
    const properties: any = {
        "Titre": { title: [{ text: { content: item.title } }] },
    };

    if (item.body !== undefined) {
        properties["Contenu"] = { 
            rich_text: item.body ? [{ text: { content: item.body.substring(0, 2000) } }] : [] 
        };
    }
    
    if (item.notes !== undefined) {
        properties["Notes"] = { 
            rich_text: item.notes ? [{ text: { content: item.notes.substring(0, 2000) } }] : [] 
        };
    }
    
    if (item.status) {
        properties["Statut"] = { select: { name: item.status } };
    }

    if (item.scheduledDate !== undefined) {
        properties["Date de publication"] = item.scheduledDate ? { date: { start: item.scheduledDate } } : { date: null };
    }
    
    if (item.platforms) {
        properties["Plateforme"] = { 
            multi_select: item.platforms.map(p => ({ name: p })) 
        };
    }

    // Mise à jour des champs d'analyse si présents
    if (item.analyzed !== undefined) {
        properties["Analysé"] = { checkbox: item.analyzed };
    }
    
    if (item.verdict) {
        properties["Verdict"] = { select: { name: item.verdict } };
    }
    
    if (item.strategicAngle !== undefined) {
        properties["Angle stratégique"] = { 
            rich_text: [{ text: { content: item.strategicAngle.substring(0, 2000) } }] 
        };
    }

    const response = await fetch(getUrl(`/pages/${item.id}`), {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({ properties })
    });

    await handleNotionResponse(response, "updateContent");
};

export const deleteContent = async (id: string): Promise<void> => {
    const response = await fetch(getUrl(`/pages/${id}`), {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({
            archived: true
        })
    });
    await handleNotionResponse(response, "deleteContent");
};

// --- CONTEXT DATABASE ---

const mapNotionPageToContext = (page: any): ContextItem => {
  const props = page.properties;
  return {
    id: page.id,
    name: getPlainText(props["Nom"]) || "Contexte sans nom",
    description: getPlainText(props["Description"]) || "",
  };
};

export const fetchContexts = async (): Promise<ContextItem[]> => {
    try {
        const dbResponse = await fetch(getUrl(`/databases/${CONFIG.NOTION_CONTEXT_DB_ID}`), {
            method: "GET",
            headers: getHeaders(),
        });
        
        // On ne throw pas ici pour ne pas bloquer l'app si les contextes échouent
        if (!dbResponse.ok) return [];

        const dbData = await dbResponse.json();
        const dataSourceId = dbData.data_sources?.[0]?.id;
        
        if (!dataSourceId) return [];

        const response = await fetch(getUrl(`/data_sources/${dataSourceId}/query`), {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({})
        });

        if (!response.ok) return [];
        
        const data = await response.json();
        return data.results.map(mapNotionPageToContext);
    } catch (error) {
        console.error("Erreur fetchContexts:", error);
        return [];
    }
};

export const createContext = async (name: string, description: string): Promise<ContextItem> => {
    const dbResponse = await fetch(getUrl(`/databases/${CONFIG.NOTION_CONTEXT_DB_ID}`), {
        method: "GET",
        headers: getHeaders(),
    });
    const dbData = await handleNotionResponse(dbResponse, "createContext DB");
    const dataSourceId = dbData.data_sources?.[0]?.id;
    
    if (!dataSourceId) throw new Error("Aucun data source trouvé pour Context DB");

    const response = await fetch(getUrl("/pages"), {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
            parent: { 
                type: "data_source_id",
                data_source_id: dataSourceId 
            },
            properties: {
                "Nom": { title: [{ text: { content: name } }] },
                "Description": { rich_text: [{ text: { content: description.substring(0, 2000) } }] }
            }
        })
    });
    
    const page = await handleNotionResponse(response, "createContext Page");
    return mapNotionPageToContext(page);
};

export const updateContext = async (context: ContextItem): Promise<void> => {
    const response = await fetch(getUrl(`/pages/${context.id}`), {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({
            properties: {
                "Nom": { title: [{ text: { content: context.name } }] },
                "Description": { rich_text: [{ text: { content: context.description.substring(0, 2000) } }] }
            }
        })
    });
    await handleNotionResponse(response, "updateContext");
};

export const deleteContext = async (id: string): Promise<void> => {
    const response = await fetch(getUrl(`/pages/${id}`), {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({
            archived: true
        })
    });
    await handleNotionResponse(response, "deleteContext");
};