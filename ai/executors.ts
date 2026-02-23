/**
 * ai/executors.ts — Logique pure d'extraction et parsing des réponses IA.
 *
 * Ces fonctions ne dépendent d'aucun état React.
 * Elles sont appelées par les exécuteurs async de ContentEditor/index.tsx.
 */

import { TargetFormat, isTargetFormat } from '../types';

// ── Extraction JSON ──

/** Extrait un objet JSON nettoyé depuis une réponse IA brute */
export const extractJsonPayload = (responseText: string): string => {
    if (!responseText) return "";
    let cleaned = responseText.replace(/```json\s?/g, '').replace(/```\s?/g, '').trim();
    cleaned = cleaned.replace(/^json\s*/i, '').trim();

    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
    return cleaned;
};

// ── Clés courtes acceptées (retournées par le nouveau prompt) ──

const SHORT_FORMAT_KEYS = ["Post Texte", "Article", "Script Reel", "Script Youtube", "Carrousel", "Prompt Image"];

/**
 * Parse et valide la réponse IA de rédaction (draft).
 * Retourne le JSON brut nettoyé — c'est ce qu'on stocke dans body/scriptVideo.
 */
export const parseDraftResponse = (responseText: string): string => {
    const cleaned = extractJsonPayload(responseText);
    if (!cleaned) throw new Error("Réponse IA vide ou invalide.");

    let data: any;
    try {
        data = JSON.parse(cleaned);
    } catch {
        throw new Error("La réponse IA n'est pas un JSON valide.");
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error("Format de réponse invalide (objet JSON attendu).");
    }

    const formatValue = data.format;
    if (!isTargetFormat(formatValue) && !SHORT_FORMAT_KEYS.includes(formatValue)) {
        throw new Error(`Format de sortie invalide : "${formatValue}". Vérifie la valeur du champ 'format'.`);
    }

    return cleaned;
};

/**
 * Extrait une clé spécifique depuis une réponse IA JSON.
 * Tente d'abord un JSON.parse, puis un regex en fallback.
 */
export const parseAIResponse = (responseText: string, key: string): string => {
    if (!responseText) return "";
    const cleaned = responseText.replace(/```json\s?/g, '').replace(/```\s?/g, '').trim();
    try {
        const data = JSON.parse(cleaned);
        if (key === 'ROOT') {
            if (typeof data === 'string') return data;
            return JSON.stringify(data, null, 2);
        }
        if (data[key]) {
            if (typeof data[key] === 'object') return JSON.stringify(data[key]);
            return String(data[key]);
        }
        if (Array.isArray(data) && key === 'ROOT') return JSON.stringify(data);
    } catch {
        const regex = new RegExp(`"${key}"\\s*:\\s*"([\\s\\S]*?)"\\s*[,}]`);
        const match = cleaned.match(regex);
        if (match && match[1]) {
            return match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        }
    }
    return cleaned;
};

// ── Formatage texte (pour preview plain-text) ──

const text = (value: any): string => (typeof value === 'string' ? value.trim() : "");

/**
 * Convertit les données JSON d'un draft en texte lisible (markdown-ish).
 * Utilisé pour l'édition manuelle du body.
 */
export const formatDraftContent = (format: TargetFormat, data: any): string => {
    const out: string[] = [];

    switch (format) {
        case TargetFormat.POST_TEXTE_COURT: {
            if (data.hook)  out.push(`**Hook**\n${text(data.hook)}`);
            if (data.corps) out.push(`**Corps**\n${text(data.corps)}`);
            if (data.baffe) out.push(`**Baffe**\n${text(data.baffe)}`);
            if (data.cta)   out.push(`**CTA**\n${text(data.cta)}`);
            return out.join("\n\n");
        }
        case TargetFormat.ARTICLE_LONG_SEO: {
            if (data.titre_h1)    out.push(`# ${text(data.titre_h1)}`);
            if (data.introduction) out.push(text(data.introduction));
            const sections = Array.isArray(data.sections) ? data.sections : [];
            sections.forEach((section: any) => {
                const h2 = text(section?.sous_titre_h2 || section?.titre || section?.point);
                const contenu = text(section?.contenu);
                if (h2) out.push(`## ${h2}`);
                if (contenu) out.push(contenu);
            });
            if (data.conclusion) out.push(`## Conclusion\n${text(data.conclusion)}`);
            if (data.cta) out.push(`**CTA**\n${text(data.cta)}`);
            return out.join("\n\n");
        }
        case TargetFormat.SCRIPT_VIDEO_REEL_SHORT: {
            if (data.contrainte) out.push(`**Contrainte**\n${text(data.contrainte)}`);
            if (data.hook)  out.push(`**Hook**\n${text(data.hook)}`);
            if (data.corps) out.push(`**Corps**\n${text(data.corps)}`);
            if (data.cta)   out.push(`**CTA**\n${text(data.cta)}`);
            return out.join("\n\n");
        }
        case TargetFormat.SCRIPT_VIDEO_YOUTUBE: {
            if (data.intro) out.push(`**Intro**\n${text(data.intro)}`);
            const dev = Array.isArray(data.developpement) ? data.developpement : [];
            dev.forEach((section: any, idx: number) => {
                const point = text(section?.point) || `Point ${idx + 1}`;
                const contenu = text(section?.contenu);
                out.push(`**${point}**`);
                if (contenu) out.push(contenu);
            });
            if (data.conclusion) out.push(`**Conclusion**\n${text(data.conclusion)}`);
            return out.join("\n\n");
        }
        case TargetFormat.CARROUSEL_SLIDE: {
            const slides = Array.isArray(data.slides) ? data.slides : [];
            slides.forEach((slide: any, idx: number) => {
                const numero = slide?.numero ?? idx + 1;
                const titre = text(slide?.titre);
                const texte = text(slide?.texte);
                const visuel = text(slide?.visuel);
                const header = titre ? `### Slide ${numero} — ${titre}` : `### Slide ${numero}`;
                out.push(header);
                if (texte) out.push(texte);
                if (visuel) out.push(`*Visuel :* ${visuel}`);
            });
            const finale = data.slide_finale || {};
            const finalTitre = text(finale.titre);
            const finalTexte = text(finale.texte);
            if (finalTitre || finalTexte) {
                out.push(`### Slide finale${finalTitre ? ` — ${finalTitre}` : ""}`);
                if (finalTexte) out.push(finalTexte);
            }
            return out.join("\n\n");
        }
        case TargetFormat.PROMPT_IMAGE: {
            if (data.prompt)  out.push(`**Prompt (EN)**\n${text(data.prompt)}`);
            if (data.legende) out.push(`**Légende**\n${text(data.legende)}`);
            return out.join("\n\n");
        }
        default:
            return "";
    }
};
