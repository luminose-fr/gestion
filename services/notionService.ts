import { ContentItem, ContentStatus, Platform, ContextItem } from "../types";
import { CONFIG } from "../config";
import { WORKER_URL } from "../constants";

// Version API Notion actuelle
const NOTION_VERSION = "2025-09-03";

// Headers sans la clé API (gérée par le Worker)
const getHeaders = () => ({
  "Notion-Version": NOTION_VERSION,
  "Content-Type": "application/json",
});

// Le Worker proxifie les requêtes vers Notion
const getUrl = (endpoint: string) => `${WORKER_URL}/v1${endpoint}`;

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

  return {
    id: page.id,
    title,
    status,
    platforms,
    body,
    scheduledDate,
    notes,
    lastEdited: page.last_edited_time,
  };
};

export const fetchContent = async (): Promise<ContentItem[]> => {
  console.log("Tentative de connexion via Worker...");
  
  if (!CONFIG.NOTION_CONTENT_DB_ID) {
     throw new Error("Database ID manquant");
  }

  try {
    // Étape 1: Récupérer les data_sources du database
    const dbResponse = await fetch(getUrl(`/databases/${CONFIG.NOTION_CONTENT_DB_ID}`), {
      method: "GET",
      headers: getHeaders(),
    });

    if (!dbResponse.ok) {
        const errorText = await dbResponse.text();
        console.error("Erreur récupération database:", dbResponse.status, errorText);
        throw new Error(`Erreur ${dbResponse.status}: ${errorText}`);
    }

    const dbData = await dbResponse.json();
    
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

    if (!response.ok) {
        const errorText = await response.text();
        console.error("Erreur Worker/Notion (Content):", response.status, errorText);
        throw new Error(`Erreur ${response.status}: ${errorText}`);
    }

    const data = await response.json();
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

        if (!dbResponse.ok) {
            const err = await dbResponse.text();
            console.error("Erreur Get Database:", err);
            throw new Error("Impossible de récupérer le database");
        }

        const dbData = await dbResponse.json();
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

        if (!response.ok) {
             const err = await response.text();
             console.error("Erreur Create:", err);
             throw new Error("Impossible de créer la page Notion");
        }

        const page = await response.json();
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
            rich_text: item.body ? [{ text: { content: item.body } }] : [] 
        };
    }
    
    if (item.notes !== undefined) {
        properties["Notes"] = { 
            rich_text: item.notes ? [{ text: { content: item.notes } }] : [] 
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

    const response = await fetch(getUrl(`/pages/${item.id}`), {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({ properties })
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("Erreur Update Notion:", errorText);
        throw new Error(`Erreur lors de la mise à jour: ${errorText}`);
    }
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
        // Étape 1: Récupérer les data_sources
        const dbResponse = await fetch(getUrl(`/databases/${CONFIG.NOTION_CONTEXT_DB_ID}`), {
            method: "GET",
            headers: getHeaders(),
        });

        if (!dbResponse.ok) {
             console.error("Erreur fetchContexts database:", dbResponse.status);
             return [];
        }

        const dbData = await dbResponse.json();
        const dataSourceId = dbData.data_sources?.[0]?.id;
        
        if (!dataSourceId) {
            console.error("Aucun data source trouvé pour Context DB");
            return [];
        }

        // Étape 2: Query le data_source
        const response = await fetch(getUrl(`/data_sources/${dataSourceId}/query`), {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({})
        });

        if (!response.ok) {
             console.error("Erreur query data_source:", response.status);
             return [];
        }
        const data = await response.json();
        return data.results.map(mapNotionPageToContext);
    } catch (error) {
        console.error("Erreur fetchContexts:", error);
        return [];
    }
};

export const createContext = async (name: string, description: string): Promise<ContextItem> => {
    // Étape 1: Récupérer le data_source_id
    const dbResponse = await fetch(getUrl(`/databases/${CONFIG.NOTION_CONTEXT_DB_ID}`), {
        method: "GET",
        headers: getHeaders(),
    });

    if (!dbResponse.ok) {
        const err = await dbResponse.text();
        console.error("Erreur Get Database (Context):", err);
        throw new Error("Impossible de récupérer le database");
    }

    const dbData = await dbResponse.json();
    const dataSourceId = dbData.data_sources?.[0]?.id;
    
    if (!dataSourceId) {
        throw new Error("Aucun data source trouvé pour Context DB");
    }

    // Étape 2: Créer la page
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
                "Description": { rich_text: [{ text: { content: description } }] }
            }
        })
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error("Erreur createContext:", errorText);
        throw new Error("Impossible de créer le contexte");
    }
    
    const page = await response.json();
    return mapNotionPageToContext(page);
};

export const updateContext = async (context: ContextItem): Promise<void> => {
    const response = await fetch(getUrl(`/pages/${context.id}`), {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({
            properties: {
                "Nom": { title: [{ text: { content: context.name } }] },
                "Description": { rich_text: [{ text: { content: context.description } }] }
            }
        })
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error("Erreur updateContext:", errorText);
        throw new Error("Impossible de mettre à jour le contexte");
    }
};

export const deleteContext = async (id: string): Promise<void> => {
    const response = await fetch(getUrl(`/pages/${id}`), {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({
            archived: true
        })
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error("Erreur deleteContext:", errorText);
        throw new Error("Impossible de supprimer le contexte");
    }
};