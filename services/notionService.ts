import { ContentItem, ContentStatus, Platform, ContextItem, Verdict, AIModel, TargetFormat, ContextUsage, isContextUsage, TargetOffer, isTargetOffer } from "../types";
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

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const MAX_BACKOFF_MS = 8000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseRetryAfterMs = (response: Response): number | null => {
    const header = response.headers.get("Retry-After");
    if (!header) return null;
    const seconds = Number(header);
    if (!Number.isNaN(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(header);
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
    return null;
};

const getBackoffMs = (attempt: number, retryAfterMs: number | null) => {
    if (retryAfterMs !== null) return retryAfterMs;
    const base = Math.min(1000 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
    const jitter = 0.75 + Math.random() * 0.5;
    return Math.round(base * jitter);
};

const fetchWithRetry = async (
    url: string,
    options: RequestInit,
    context: string,
    maxAttempts = MAX_RETRIES
): Promise<Response> => {
    let lastError: unknown;
    let lastResponse: Response | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) return response;

            lastResponse = response;
            if (!RETRYABLE_STATUS.has(response.status) || attempt === maxAttempts) {
                return response;
            }

            const delay = getBackoffMs(attempt, parseRetryAfterMs(response));
            await sleep(delay);
        } catch (error) {
            lastError = error;
            if (attempt === maxAttempts) {
                throw error;
            }
            const delay = getBackoffMs(attempt, null);
            await sleep(delay);
        }
    }

    if (lastResponse) return lastResponse;
    throw lastError ?? new Error(`Erreur réseau (${context})`);
};

const dataSourceCache: Record<string, string | undefined> = {};
const dataSourceInFlight: Record<string, Promise<string>> = {};

const getDataSourceId = async (dbId: string, cacheKey: string, context: string): Promise<string> => {
    if (!dbId) {
        throw new Error("Database ID manquant");
    }
    const cached = dataSourceCache[cacheKey];
    if (cached) return cached;
    if (dataSourceInFlight[cacheKey]) return dataSourceInFlight[cacheKey];

    dataSourceInFlight[cacheKey] = (async () => {
        const response = await fetchWithRetry(
            getUrl(`/databases/${dbId}`),
            { method: "GET", headers: getHeaders() },
            `${context} DB`
        );
        const dbData = await handleNotionResponse(response, `${context} DB`);
        const dataSourceId = dbData.data_sources?.[0]?.id;
        if (!dataSourceId) {
            throw new Error("Aucun data source trouvé pour ce database");
        }
        dataSourceCache[cacheKey] = dataSourceId;
        return dataSourceId;
    })();

    try {
        return await dataSourceInFlight[cacheKey];
    } finally {
        delete dataSourceInFlight[cacheKey];
    }
};

const queryDataSourceAll = async (
    dataSourceId: string,
    body: Record<string, unknown>,
    context: string
): Promise<any[]> => {
    const results: any[] = [];
    let cursor: string | null = null;
    let hasMore = true;

    while (hasMore) {
        const payload: Record<string, unknown> = {
            page_size: 100,
            ...body,
        };
        if (cursor) {
            payload.start_cursor = cursor;
        }

        const response = await fetchWithRetry(
            getUrl(`/data_sources/${dataSourceId}/query`),
            {
                method: "POST",
                headers: getHeaders(),
                body: JSON.stringify(payload),
            },
            context
        );

        const data = await handleNotionResponse(response, context);
        results.push(...(data.results || []));
        hasMore = Boolean(data.has_more);
        cursor = data.next_cursor || null;
    }

    return results;
};

// --- HELPERS D'ERREUR ---
const handleNotionResponse = async (response: Response, context: string) => {
    if (!response.ok) {
        let errorData: any = {};
        let errorMessage = `Erreur ${response.status}`;

        try {
            errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
        } catch (e: any) {
            const text = await response.text().catch(() => "");
            console.error(`Erreur brute Notion (${context}):`, text);
        }

        console.error(`Erreur structurée Notion (${context}):`, errorData);
        throw new Error(errorMessage);
    }
    return response.json();
};

// --- RICH TEXT ENGINE (Parser & Serializer) ---

/**
 * 1. SERIALIZER: Notion Rich Text Object [] -> Markdown String
 * Convertit la structure complexe de Notion en chaîne éditable par l'utilisateur.
 */
const notionToMarkdown = (property: any): string => {
    if (!property) return "";
    
    // Notion renvoie parfois { rich_text: [...] } ou { title: [...] }
    const contentArray = property.rich_text || property.title || [];
    
    if (!Array.isArray(contentArray)) return "";

    return contentArray.map((chunk: any) => {
        let text = chunk.plain_text || "";
        const { annotations } = chunk;

        if (!text) return "";

        // Gestion des liens
        if (chunk.text && chunk.text.link) {
            return `[${text}](${chunk.text.link.url})`;
        }

        // Gestion des styles (Ordre : Code > Gras > Italique > Barré)
        if (annotations) {
            if (annotations.code) text = `\`${text}\``;
            if (annotations.bold) text = `**${text}**`;
            if (annotations.italic) text = `_${text}_`;
            if (annotations.strikethrough) text = `~${text}~`;
        }
        return text;
    }).join("");
};

/**
 * 2. PARSER: Markdown String -> Notion Rich Text Object []
 * Découpe la chaîne, identifie les balises Markdown, génère les objets annotés
 * ET respecte la limite de 2000 caractères par bloc.
 */
const markdownToNotion = (text: string): any[] => {
    if (!text) return [];

    const parts: any[] = [];
    // Regex simplifiée pour tokeniser : Gras (**), Italique (_), Code (`), Barré (~), Liens [txt](url)
    // Capture les délimiteurs pour le traitement
    const regex = /(\*\*.+?\*\*)|(_.+?_)|(`.+?`)|(~.+?~)|(\[.+?\]\(.+?\))/g;
    
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
        // Ajouter le texte brut avant le match
        if (match.index > lastIndex) {
            parts.push(createRawTextObject(text.substring(lastIndex, match.index)));
        }

        const fullMatch = match[0];
        
        if (fullMatch.startsWith('**')) {
            parts.push(createStyledTextObject(fullMatch.slice(2, -2), { bold: true }));
        } else if (fullMatch.startsWith('_')) {
            parts.push(createStyledTextObject(fullMatch.slice(1, -1), { italic: true }));
        } else if (fullMatch.startsWith('`')) {
            parts.push(createStyledTextObject(fullMatch.slice(1, -1), { code: true }));
        } else if (fullMatch.startsWith('~')) {
            parts.push(createStyledTextObject(fullMatch.slice(1, -1), { strikethrough: true }));
        } else if (fullMatch.startsWith('[')) {
            const linkMatch = fullMatch.match(/^\[(.+?)\]\((.+?)\)$/);
            if (linkMatch) {
                parts.push(createLinkObject(linkMatch[1], linkMatch[2]));
            } else {
                parts.push(createRawTextObject(fullMatch)); // Fallback si parsing lien échoue
            }
        }

        lastIndex = regex.lastIndex;
    }

    // Ajouter le reste du texte
    if (lastIndex < text.length) {
        parts.push(createRawTextObject(text.substring(lastIndex)));
    }

    // Post-traitement : Découpage des blocs > 2000 chars + limite Notion (100 segments)
    return enforceRichTextLimit(splitChunksToLimit(parts));
};

// --- Helpers pour le Parser ---

const createRawTextObject = (content: string) => ({
    type: "text",
    text: { content }
});

const createStyledTextObject = (content: string, annotations: any) => ({
    type: "text",
    text: { content },
    annotations
});

const createLinkObject = (content: string, url: string) => ({
    type: "text",
    text: { content, link: { url } }
});

const splitChunksToLimit = (chunks: any[]) => {
    const LIMIT = 2000;
    const result: any[] = [];

    for (const chunk of chunks) {
        const content = chunk.text.content;
        
        if (content.length <= LIMIT) {
            result.push(chunk);
            continue;
        }

        // Si le chunk est trop long, on le découpe en gardant ses annotations/liens
        let i = 0;
        while (i < content.length) {
            const slice = content.substring(i, i + LIMIT);
            
            const newChunk: any = {
                type: "text",
                text: { 
                    content: slice,
                },
                annotations: chunk.annotations
            };

            if (chunk.text.link) {
                newChunk.text.link = chunk.text.link;
            }

            result.push(newChunk);
            i += LIMIT;
        }
    }
    return result;
};

const enforceRichTextLimit = (chunks: any[]) => {
    const MAX_ITEMS = 100;
    if (chunks.length <= MAX_ITEMS) return chunks;

    console.warn("Rich text trop long (>100 segments). Fallback en texte brut.");
    const fullText = chunks.map((chunk) => chunk?.text?.content || "").join("");
    const LIMIT = 2000;
    const maxLength = MAX_ITEMS * LIMIT;
    const truncated = fullText.length > maxLength ? fullText.slice(0, maxLength) : fullText;

    const result: any[] = [];
    for (let i = 0; i < truncated.length; i += LIMIT) {
        result.push(createRawTextObject(truncated.substring(i, i + LIMIT)));
    }
    return result;
};


// --- MAPPERS BASE DE DONNÉES ---

const mapNotionPageToItem = (page: any): ContentItem => {
  const props = page.properties;
  
  const title = notionToMarkdown(props["Titre"]) || "Sans titre";
  const statusValue = props["Statut"]?.select?.name || props["Statut"]?.status?.name;
  const status = (statusValue as ContentStatus) || ContentStatus.IDEA;
  const platforms = props["Plateforme"]?.multi_select?.map((p: any) => p.name as Platform) || [];
  const body = notionToMarkdown(props["Contenu"]);
  const scheduledDate = props["Date de publication"]?.date?.start || null;
  const notes = notionToMarkdown(props["Notes"]);
  const analyzed = props["Analysé"]?.checkbox || false;
  const verdictValue = props["Verdict"]?.select?.name;
  const verdict = (verdictValue as Verdict) || undefined;
  const targetFormatValue = props["Format cible"]?.select?.name;
  const targetFormat = (targetFormatValue as TargetFormat) || undefined;
  const targetOfferValue = props["Cible Offre"]?.select?.name;
  const targetOffer = isTargetOffer(targetOfferValue) ? (targetOfferValue as TargetOffer) : undefined;
  const justification = notionToMarkdown(props["Justification"]);
  const suggestedMetaphor = notionToMarkdown(props["Métaphore Suggérée"]);
  const strategicAngle = notionToMarkdown(props["Angle stratégique"]);
  const interviewAnswers = notionToMarkdown(props["Réponses interview"]);
  const interviewQuestions = notionToMarkdown(props["Questions interview"]);

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
    targetFormat,
    targetOffer,
    justification,
    suggestedMetaphor,
    strategicAngle,
    interviewAnswers,
    interviewQuestions
  };
};

const mapNotionPageToContext = (page: any): ContextItem => {
  const props = page.properties;
  const usageValue = props["Usage"]?.select?.name;
  const usage = isContextUsage(usageValue) ? (usageValue as ContextUsage) : undefined;
  return {
    id: page.id,
    name: notionToMarkdown(props["Nom"]) || "Contexte sans nom",
    description: notionToMarkdown(props["Description"]) || "",
    usage,
  };
};

const mapNotionPageToModel = (page: any): AIModel => {
    const props = page.properties;
    
    // Mapping strict sur la propriété "Cout"
    // Si la propriété est vide dans Notion, select est null, on fallback sur "medium"
    const costValue = props["Cout"]?.select?.name || "medium";

    return {
        id: page.id,
        name: notionToMarkdown(props["Nom"]) || "Modèle sans nom",
        apiCode: notionToMarkdown(props["Code API"]) || "",
        // Fournisseur est un champ Rich Text (Texte)
        provider: notionToMarkdown(props["Fournisseur"]) || "", 
        cost: costValue as any,
        strengths: notionToMarkdown(props["Forces"]) || "",
        bestUseCases: notionToMarkdown(props["Cas d'usage"]) || "",
        textQuality: props["Qualité Rédaction"]?.number || 3
    };
};

// --- API CALLS (CONTENT) ---

export const fetchContent = async (since?: string): Promise<ContentItem[]> => {
  if (!CONFIG.NOTION_CONTENT_DB_ID) {
     throw new Error("Database ID manquant");
  }

  try {
    const dataSourceId = await getDataSourceId(
        CONFIG.NOTION_CONTENT_DB_ID,
        "content",
        "fetchContent"
    );

    const queryBody: Record<string, unknown> = {
        sorts: [
            {
                timestamp: "last_edited_time",
                direction: "descending",
            },
        ],
    };

    if (since) {
        queryBody.filter = {
            timestamp: "last_edited_time",
            last_edited_time: { after: since }
        };
    }

    const results = await queryDataSourceAll(
        dataSourceId,
        queryBody,
        "fetchContent Query"
    );

    return results
        .filter((page: any) => !page.archived && !page.in_trash)
        .map(mapNotionPageToItem);

  } catch (error: any) {
    console.error("EXCEPTION fetchContent:", error);
    throw error;
  }
};

export const createContent = async (title: string, notes?: string): Promise<ContentItem> => {
    try {
        const dataSourceId = await getDataSourceId(
            CONFIG.NOTION_CONTENT_DB_ID,
            "content",
            "createContent"
        );

        const properties: any = {
            "Titre": {
                title: markdownToNotion(title) // Utilisation du parser
            },
            "Statut": {
                select: { name: ContentStatus.IDEA }
            }
        };

        if (notes) {
            properties["Notes"] = {
                rich_text: markdownToNotion(notes)
            };
        }

        const response = await fetchWithRetry(getUrl("/pages"), {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({
                parent: { 
                    type: "data_source_id",
                    data_source_id: dataSourceId 
                },
                properties: properties
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
        "Titre": { title: markdownToNotion(item.title) },
    };

    if (item.body !== undefined) {
        properties["Contenu"] = { 
            rich_text: markdownToNotion(item.body)
        };
    }
    
    if (item.notes !== undefined) {
        properties["Notes"] = { 
            rich_text: markdownToNotion(item.notes)
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

    if (item.analyzed !== undefined) {
        properties["Analysé"] = { checkbox: item.analyzed };
    }
    
    if (item.verdict) {
        properties["Verdict"] = { select: { name: item.verdict } };
    }

    if (item.targetFormat !== undefined) {
        properties["Format cible"] = item.targetFormat ? { select: { name: item.targetFormat } } : { select: null };
    }

    if (item.targetOffer !== undefined) {
        properties["Cible Offre"] = item.targetOffer ? { select: { name: item.targetOffer } } : { select: null };
    }

    if (item.justification !== undefined) {
        properties["Justification"] = {
            rich_text: markdownToNotion(item.justification || "")
        };
    }

    if (item.suggestedMetaphor !== undefined) {
        properties["Métaphore Suggérée"] = {
            rich_text: markdownToNotion(item.suggestedMetaphor || "")
        };
    }
    
    if (item.strategicAngle !== undefined) {
        properties["Angle stratégique"] = { 
            rich_text: markdownToNotion(item.strategicAngle || "")
        };
    }

    if (item.interviewAnswers !== undefined) {
        properties["Réponses interview"] = { 
            rich_text: markdownToNotion(item.interviewAnswers || "")
        };
    }

    if (item.interviewQuestions !== undefined) {
        properties["Questions interview"] = { 
            rich_text: markdownToNotion(item.interviewQuestions || "")
        };
    }

    const response = await fetchWithRetry(getUrl(`/pages/${item.id}`), {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({ properties })
    });

    await handleNotionResponse(response, "updateContent");
};

export const deleteContent = async (id: string): Promise<void> => {
    const response = await fetchWithRetry(getUrl(`/pages/${id}`), {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({
            archived: true
        })
    });
    await handleNotionResponse(response, "deleteContent");
};

// --- API CALLS (CONTEXT) ---

export const fetchContexts = async (since?: string): Promise<ContextItem[]> => {
    try {
        if (!CONFIG.NOTION_CONTEXT_DB_ID) {
            console.warn("NOTION_CONTEXT_DB_ID manquant");
            return [];
        }

        const dataSourceId = await getDataSourceId(
            CONFIG.NOTION_CONTEXT_DB_ID,
            "contexts",
            "fetchContexts"
        );

        const queryBody: Record<string, unknown> = {};
        if (since) {
            queryBody.filter = {
                timestamp: "last_edited_time",
                last_edited_time: { after: since }
            };
        }

        const results = await queryDataSourceAll(dataSourceId, queryBody, "fetchContexts Query");
        return results
            .filter((page: any) => !page.archived && !page.in_trash)
            .map(mapNotionPageToContext);
    } catch (error) {
        console.error("Erreur fetchContexts:", error);
        return [];
    }
};

export const createContext = async (name: string, description: string, usage?: ContextUsage): Promise<ContextItem> => {
    const dataSourceId = await getDataSourceId(
        CONFIG.NOTION_CONTEXT_DB_ID,
        "contexts",
        "createContext"
    );

    const properties: any = {
        "Nom": { title: markdownToNotion(name) },
        "Description": {
            rich_text: markdownToNotion(description)
        }
    };

    if (usage) {
        properties["Usage"] = { select: { name: usage } };
    }

    const response = await fetchWithRetry(getUrl("/pages"), {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
            parent: { 
                type: "data_source_id",
                data_source_id: dataSourceId 
            },
            properties
        })
    });
    
    const page = await handleNotionResponse(response, "createContext Page");
    return mapNotionPageToContext(page);
};

export const updateContext = async (context: ContextItem): Promise<void> => {
    const properties: any = {
        "Nom": { title: markdownToNotion(context.name) },
        "Description": {
            rich_text: markdownToNotion(context.description)
        }
    };

    if (context.usage !== undefined) {
        properties["Usage"] = context.usage ? { select: { name: context.usage } } : { select: null };
    }

    const response = await fetchWithRetry(getUrl(`/pages/${context.id}`), {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({
            properties
        })
    });
    await handleNotionResponse(response, "updateContext");
};

export const deleteContext = async (id: string): Promise<void> => {
    const response = await fetchWithRetry(getUrl(`/pages/${id}`), {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({
            archived: true
        })
    });
    await handleNotionResponse(response, "deleteContext");
};

// --- API CALLS (MODELS) ---

export const fetchModels = async (since?: string): Promise<AIModel[]> => {
    if (!CONFIG.NOTION_MODELS_DB_ID) {
        console.warn("NOTION_MODELS_DB_ID manquant");
        return [];
    }

    try {
        const dataSourceId = await getDataSourceId(
            CONFIG.NOTION_MODELS_DB_ID,
            "models",
            "fetchModels"
        );

        const queryBody: Record<string, unknown> = {};
        if (since) {
            queryBody.filter = {
                timestamp: "last_edited_time",
                last_edited_time: { after: since }
            };
        }

        const results = await queryDataSourceAll(dataSourceId, queryBody, "fetchModels Query");
        return results
            .filter((page: any) => !page.archived && !page.in_trash)
            .map(mapNotionPageToModel);
    } catch (error) {
        console.error("Erreur fetchModels:", error);
        return [];
    }
};

export const createModel = async (model: Partial<AIModel>): Promise<AIModel> => {
    const dataSourceId = await getDataSourceId(
        CONFIG.NOTION_MODELS_DB_ID,
        "models",
        "createModel"
    );

    const response = await fetchWithRetry(getUrl("/pages"), {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
            parent: { 
                type: "data_source_id",
                data_source_id: dataSourceId 
            },
            properties: {
                "Nom": { title: markdownToNotion(model.name || "") },
                "Code API": { rich_text: markdownToNotion(model.apiCode || "") },
                // Fournisseur est un champ Rich Text (Texte)
                "Fournisseur": { rich_text: markdownToNotion(model.provider || "Autre") },
                "Cout": { select: { name: model.cost || "medium" } },
                "Forces": { rich_text: markdownToNotion(model.strengths || "") },
                "Cas d'usage": { rich_text: markdownToNotion(model.bestUseCases || "") },
                "Qualité Rédaction": { number: model.textQuality || 3 }
            }
        })
    });
    
    const page = await handleNotionResponse(response, "createModel Page");
    return mapNotionPageToModel(page);
};

export const updateModel = async (model: AIModel): Promise<void> => {
    const response = await fetchWithRetry(getUrl(`/pages/${model.id}`), {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({
            properties: {
                "Nom": { title: markdownToNotion(model.name) },
                "Code API": { rich_text: markdownToNotion(model.apiCode) },
                // Fournisseur est un champ Rich Text (Texte)
                "Fournisseur": { rich_text: markdownToNotion(model.provider) },
                "Cout": { select: { name: model.cost } },
                "Forces": { rich_text: markdownToNotion(model.strengths) },
                "Cas d'usage": { rich_text: markdownToNotion(model.bestUseCases) },
                "Qualité Rédaction": { number: model.textQuality }
            }
        })
    });
    await handleNotionResponse(response, "updateModel");
};

export const deleteModel = async (id: string): Promise<void> => {
    const response = await fetchWithRetry(getUrl(`/pages/${id}`), {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({
            archived: true
        })
    });
    await handleNotionResponse(response, "deleteModel");
};
