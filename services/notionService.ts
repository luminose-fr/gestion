import { ContentItem, ContentStatus, Platform, Verdict, AIModel, TargetFormat, Objectif, isObjectif, Profondeur, isProfondeur, CoachSession } from "../types";
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
const dataSourceInFlight: Record<string, Promise<string> | undefined> = {};

const getDataSourceId = async (dbId: string, cacheKey: string, context: string): Promise<string> => {
    if (!dbId) {
        throw new Error("Database ID manquant");
    }
    const cached = dataSourceCache[cacheKey];
    if (cached) return cached;

    const inFlight = dataSourceInFlight[cacheKey];
    if (inFlight) return inFlight;

    const pending = (async () => {
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

    dataSourceInFlight[cacheKey] = pending;
    try {
        return await pending;
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

/**
 * Sérialise un texte brut (typiquement du JSON) en Rich Text Notion
 * sans interpréter les marqueurs markdown. Utilisé pour Coach Session
 * où on veut stocker du JSON pur sans que `**` ou `_` soient convertis
 * en gras/italique au round-trip.
 */
const rawTextToNotion = (text: string): any[] => {
    if (!text) return [];
    const chunks = splitChunksToLimit([createRawTextObject(text)]);
    return enforceRichTextLimit(chunks);
};

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


// --- INTROSPECTION DU SCHÉMA NOTION ---

/**
 * Normalise un nom de propriété Notion pour comparer de façon tolérante.
 * Accents, apostrophes (droite ou typographique), espaces, casse et
 * ponctuation sont ignorés : "Coût / Crédits", "Cout" et "cout credits"
 * donnent la même clé. Évite les écarts silencieux entre le code et Notion.
 */
const normalizePropName = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

interface ResolvedProp {
  /** Nom exact tel qu'il existe dans Notion */
  name: string;
  type: string;
  /** Objet brut : définition de schéma (data source) ou valeur (page) */
  raw: any;
}

/**
 * Retrouve une propriété dans un objet `properties` (schéma de data source
 * OU propriétés d'une page) à partir d'une liste d'alias.
 */
const findProp = (
  properties: Record<string, any> | undefined,
  aliases: string[]
): ResolvedProp | undefined => {
  if (!properties) return undefined;

  // Notion indexe `properties` par nom de colonne, mais chaque entrée porte
  // aussi son `name` : on indexe les deux par sécurité.
  const index = new Map<string, { key: string; raw: any }>();
  for (const [key, raw] of Object.entries(properties)) {
    index.set(normalizePropName(key), { key, raw });
    const declaredName = (raw as any)?.name;
    if (typeof declaredName === "string" && declaredName) {
      index.set(normalizePropName(declaredName), { key: declaredName, raw });
    }
  }

  for (const alias of aliases) {
    const hit = index.get(normalizePropName(alias));
    if (hit) {
      return { name: hit.key, type: hit.raw?.type, raw: hit.raw };
    }
  }
  return undefined;
};

const schemaCache: Record<string, Record<string, any>> = {};
const schemaInFlight: Record<string, Promise<Record<string, any>> | undefined> = {};

/**
 * Récupère (et met en cache) le schéma des propriétés d'un data source.
 * Depuis l'API 2025-09-03, les propriétés vivent sur le data source,
 * plus sur la database.
 */
const getDataSourceProperties = async (
  dataSourceId: string,
  cacheKey: string,
  context: string
): Promise<Record<string, any>> => {
  const cached = schemaCache[cacheKey];
  if (cached) return cached;

  const inFlight = schemaInFlight[cacheKey];
  if (inFlight) return inFlight;

  const pending = (async () => {
    const response = await fetchWithRetry(
      getUrl(`/data_sources/${dataSourceId}`),
      { method: "GET", headers: getHeaders() },
      `${context} Schema`
    );
    const data = await handleNotionResponse(response, `${context} Schema`);
    const properties = data.properties || {};
    schemaCache[cacheKey] = properties;
    return properties;
  })();

  schemaInFlight[cacheKey] = pending;
  try {
    return await pending;
  } finally {
    delete schemaInFlight[cacheKey];
  }
};

/**
 * Sérialise une valeur applicative selon le TYPE RÉEL de la propriété Notion.
 * Notion rejette la requête entière (400) dès qu'un type ne correspond pas :
 * on s'aligne donc sur le schéma au lieu de deviner (select vs rich_text…).
 * Retourne `undefined` si la propriété n'est pas inscriptible.
 */
const buildPropertyValue = (prop: ResolvedProp, value: unknown): any | undefined => {
  const asText = value === null || value === undefined ? "" : String(value);

  const matchOption = (options: any[]): string | undefined => {
    const target = normalizePropName(asText);
    return options.find((o: any) => normalizePropName(o?.name || "") === target)?.name;
  };

  switch (prop.type) {
    case "title":
      return { title: markdownToNotion(asText) };
    case "rich_text":
      return { rich_text: markdownToNotion(asText) };
    case "select":
      // Notion crée l'option à la volée si elle n'existe pas encore
      return asText
        ? { select: { name: matchOption(prop.raw?.select?.options || []) || asText } }
        : { select: null };
    case "status": {
      // Contrairement à select, une option de status ne peut pas être créée via l'API
      if (!asText) return undefined;
      const existing = matchOption(prop.raw?.status?.options || []);
      if (!existing) {
        console.warn(`Option de statut inconnue pour "${prop.name}": ${asText} (ignorée)`);
        return undefined;
      }
      return { status: { name: existing } };
    }
    case "multi_select":
      return {
        multi_select: asText
          ? [{ name: matchOption(prop.raw?.multi_select?.options || []) || asText }]
          : []
      };
    case "number": {
      const num = typeof value === "number" ? value : Number(asText);
      return { number: Number.isFinite(num) && asText !== "" ? num : null };
    }
    case "url":
      return { url: asText || null };
    case "checkbox":
      return { checkbox: Boolean(value) };
    default:
      // formula, rollup, created_time, etc. : non inscriptibles
      return undefined;
  }
};

/**
 * Construit un payload `properties` en ne conservant que les champs
 * réellement présents dans le schéma Notion. Une colonne absente est
 * ignorée (avec un warning) au lieu de faire échouer toute la requête.
 */
const buildPropertiesFromSchema = (
  schema: Record<string, any>,
  fields: Array<{ aliases: string[]; value: unknown }>,
  context: string
): Record<string, any> => {
  const properties: Record<string, any> = {};

  for (const field of fields) {
    const prop = findProp(schema, field.aliases);
    if (!prop) {
      console.warn(`[${context}] Colonne Notion introuvable, ignorée : "${field.aliases[0]}"`);
      continue;
    }

    const payload = buildPropertyValue(prop, field.value);
    if (payload === undefined) {
      console.warn(`[${context}] Colonne "${prop.name}" non inscriptible (${prop.type}), ignorée`);
      continue;
    }

    properties[prop.name] = payload;
  }

  return properties;
};

/** Lit une propriété de page Notion en texte, quel que soit son type. */
const propToText = (prop: any): string => {
  if (!prop) return "";
  switch (prop.type) {
    case "title":
    case "rich_text":
      return notionToMarkdown(prop);
    case "select":
      return prop.select?.name || "";
    case "status":
      return prop.status?.name || "";
    case "multi_select":
      return (prop.multi_select || []).map((o: any) => o?.name).filter(Boolean).join(", ");
    case "number":
      return prop.number === null || prop.number === undefined ? "" : String(prop.number);
    case "url":
      return prop.url || "";
    case "formula":
      return prop.formula?.string ?? (typeof prop.formula?.number === "number" ? String(prop.formula.number) : "");
    default:
      return notionToMarkdown(prop);
  }
};

/** Lit une propriété de page Notion en nombre, quel que soit son type. */
const propToNumber = (prop: any): number | undefined => {
  if (!prop) return undefined;
  if (typeof prop.number === "number") return prop.number;
  const text = propToText(prop);
  if (!text) return undefined;
  const num = Number(text);
  return Number.isFinite(num) ? num : undefined;
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
  const objectifValue = props["Objectif"]?.select?.name;
  const objectif = isObjectif(objectifValue) ? (objectifValue as Objectif) : undefined;
  const justification = notionToMarkdown(props["Justification"]);
  const suggestedMetaphor = notionToMarkdown(props["Métaphore Suggérée"]);
  const strategicAngle = notionToMarkdown(props["Angle stratégique"]);
  const depthValue = props["Profondeur"]?.select?.name;
  const depth = isProfondeur(depthValue) ? (depthValue as Profondeur) : undefined;
  const interviewAnswers = notionToMarkdown(props["Réponses interview"]);
  const interviewQuestions = notionToMarkdown(props["Questions interview"]);
  const slides = notionToMarkdown(props["Slides"]);
  const postCourt = notionToMarkdown(props["Post Court"]);
  const scriptVideo = notionToMarkdown(props["Script vidéo"]);

  // Coach Session : stockée en JSON sérialisé dans un Rich Text
  const coachSessionRaw = notionToMarkdown(props["Coach Session"]);
  let coachSession: CoachSession | null = null;
  if (coachSessionRaw && coachSessionRaw.trim()) {
    try {
      const parsed = JSON.parse(coachSessionRaw);
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.messages)) {
        coachSession = parsed as CoachSession;
      }
    } catch {
      // JSON corrompu → on ignore, on laisse null (Florent pourra redémarrer une session)
      coachSession = null;
    }
  }

  return {
    id: page.id,
    title,
    status,
    platforms,
    body,
    scheduledDate,
    notes,
    lastEdited: page.last_edited_time,
    createdAt: page.created_time || page.last_edited_time,
    analyzed,
    verdict,
    targetFormat,
    objectif,
    justification,
    suggestedMetaphor,
    strategicAngle,
    depth,
    coachSession,
    interviewAnswers,
    interviewQuestions,
    slides,
    postCourt,
    scriptVideo
  };
};


/**
 * Colonnes de la base Notion « Modèles IA ».
 * Plusieurs alias par champ : le nom exact (accent, apostrophe typographique,
 * variante FR/EN) est résolu au runtime contre le schéma réel, ce qui évite
 * les échecs silencieux quand la colonne a été renommée dans Notion.
 */
const MODEL_FIELDS = {
    name: ["Nom", "Name", "Modèle", "Model", "Titre"],
    apiCode: ["Code API", "Code API 1min.AI", "API Code", "Code", "Modèle API"],
    provider: ["Fournisseur", "Provider", "Éditeur"],
    cost: ["Cout", "Coût", "Coût / Crédits", "Cost", "Crédits"],
    strengths: ["Forces", "Strengths", "Points forts"],
    bestUseCases: ["Cas d'usage", "Use cases", "Best use cases"],
    textQuality: ["Qualité Rédaction", "Qualité", "Text quality"],
    isDefault: ["Défaut", "Par défaut", "Default"],
};

const mapNotionPageToModel = (page: any): AIModel => {
    const read = (aliases: string[]) => findProp(page.properties, aliases)?.raw;

    return {
        id: page.id,
        name: propToText(read(MODEL_FIELDS.name)) || "Modèle sans nom",
        apiCode: propToText(read(MODEL_FIELDS.apiCode)),
        provider: propToText(read(MODEL_FIELDS.provider)),
        // Colonne vide côté Notion → fallback "medium"
        cost: (propToText(read(MODEL_FIELDS.cost)) || "medium") as AIModel["cost"],
        strengths: propToText(read(MODEL_FIELDS.strengths)),
        bestUseCases: propToText(read(MODEL_FIELDS.bestUseCases)),
        textQuality: propToNumber(read(MODEL_FIELDS.textQuality)) ?? 3,
        isDefault: read(MODEL_FIELDS.isDefault)?.checkbox === true,
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

export const createContent = async (title: string, notes?: string, targetFormat?: string | null): Promise<ContentItem> => {
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

        if (targetFormat) {
            properties["Format cible"] = { select: { name: targetFormat } };
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
        }, "createContent Page");

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

    if (item.objectif !== undefined) {
        // ⚠️ Nécessite une propriété "Objectif" (type Sélection) dans la base Notion.
        properties["Objectif"] = item.objectif ? { select: { name: item.objectif } } : { select: null };
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

    if (item.coachSession !== undefined) {
        const serialized = item.coachSession ? JSON.stringify(item.coachSession) : "";
        properties["Coach Session"] = {
            rich_text: rawTextToNotion(serialized)
        };
    }

    if (item.depth !== undefined) {
        properties["Profondeur"] = item.depth ? { select: { name: item.depth } } : { select: null };
    }

    if (item.slides !== undefined) {
        properties["Slides"] = {
            rich_text: markdownToNotion(item.slides || "")
        };
    }

    if (item.postCourt !== undefined) {
        properties["Post Court"] = {
            rich_text: markdownToNotion(item.postCourt || "")
        };
    }

    if (item.scriptVideo !== undefined) {
        properties["Script vidéo"] = {
            rich_text: markdownToNotion(item.scriptVideo || "")
        };
    }

    const response = await fetchWithRetry(getUrl(`/pages/${item.id}`), {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({ properties })
    }, "updateContent");

    await handleNotionResponse(response, "updateContent");
};

export const deleteContent = async (id: string): Promise<void> => {
    const response = await fetchWithRetry(getUrl(`/pages/${id}`), {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({
            archived: true
        })
    }, "deleteContent");
    await handleNotionResponse(response, "deleteContent");
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

/**
 * Construit le payload `properties` d'un modèle à partir du schéma réel
 * de la base Notion (noms ET types des colonnes lus au runtime).
 */
const buildModelProperties = async (
    model: Partial<AIModel>,
    context: string,
    fields?: Array<{ aliases: string[]; value: unknown }>
) => {
    const dataSourceId = await getDataSourceId(CONFIG.NOTION_MODELS_DB_ID, "models", context);
    const schema = await getDataSourceProperties(dataSourceId, "models", context);

    const properties = buildPropertiesFromSchema(schema, fields ?? [
        { aliases: MODEL_FIELDS.name, value: model.name || "" },
        { aliases: MODEL_FIELDS.apiCode, value: model.apiCode || "" },
        { aliases: MODEL_FIELDS.provider, value: model.provider || "" },
        { aliases: MODEL_FIELDS.cost, value: model.cost || "medium" },
        { aliases: MODEL_FIELDS.strengths, value: model.strengths || "" },
        { aliases: MODEL_FIELDS.bestUseCases, value: model.bestUseCases || "" },
        { aliases: MODEL_FIELDS.textQuality, value: model.textQuality ?? 3 },
    ], context);

    if (Object.keys(properties).length === 0) {
        throw new Error(
            "Aucune colonne reconnue dans la base Notion « Modèles IA ». " +
            "Vérifiez les noms de colonnes (Nom, Code API, Fournisseur, Cout, Forces, Cas d'usage, Qualité Rédaction)."
        );
    }

    return { dataSourceId, properties };
};

export const createModel = async (model: Partial<AIModel>): Promise<AIModel> => {
    const { dataSourceId, properties } = await buildModelProperties(model, "createModel");

    const response = await fetchWithRetry(
        getUrl("/pages"),
        {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({
                parent: {
                    type: "data_source_id",
                    data_source_id: dataSourceId
                },
                properties
            })
        },
        "createModel Page"
    );

    const page = await handleNotionResponse(response, "createModel Page");
    return mapNotionPageToModel(page);
};

export const updateModel = async (model: AIModel): Promise<void> => {
    const { properties } = await buildModelProperties(model, "updateModel");

    const response = await fetchWithRetry(
        getUrl(`/pages/${model.id}`),
        {
            method: "PATCH",
            headers: getHeaders(),
            body: JSON.stringify({ properties })
        },
        "updateModel"
    );
    await handleNotionResponse(response, "updateModel");
};

/** Met à jour uniquement la case « Défaut » d'un modèle. */
export const setModelDefault = async (pageId: string, isDefault: boolean): Promise<void> => {
    const { properties } = await buildModelProperties({}, "setModelDefault", [
        { aliases: MODEL_FIELDS.isDefault, value: isDefault },
    ]);

    const response = await fetchWithRetry(
        getUrl(`/pages/${pageId}`),
        {
            method: "PATCH",
            headers: getHeaders(),
            body: JSON.stringify({ properties })
        },
        "setModelDefault"
    );
    await handleNotionResponse(response, "setModelDefault");
};

export const deleteModel = async (id: string): Promise<void> => {
    const response = await fetchWithRetry(getUrl(`/pages/${id}`), {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({
            archived: true
        })
    }, "deleteModel");
    await handleNotionResponse(response, "deleteModel");
};
