import React from 'react';
import { Profondeur, TargetFormat } from '../../../types';

// ── Helpers partagés entre les renderers ──

/** Parse un JSON "sale" (avec trailing text après le dernier }) */
export const parseBodyJson = (raw: string): any | null => {
    if (!raw) return null;
    try {
        const lastBrace = raw.lastIndexOf('}');
        const cleaned = lastBrace !== -1 ? raw.slice(0, lastBrace + 1) : raw;
        return JSON.parse(cleaned);
    } catch {
        return null;
    }
};

/** Raccourci pour trimmer une valeur quelconque en string */
export const t = (v: any): string => (typeof v === 'string' ? v.trim() : "");

/** Copie du texte avec fallback pour les environnements où Clipboard API échoue. */
export const copyTextToClipboard = async (text: string): Promise<boolean> => {
    if (!text) return false;

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // Fallback ci-dessous.
    }

    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        return copied;
    } catch {
        return false;
    }
};

/** Bloc structuré avec border-left colorée — utilisé par tous les renderers */
export const Block = ({ label, color, children }: { label: string; color: string; children: React.ReactNode }) => (
    <div className={`rounded-lg border-l-4 ${color} bg-brand-light dark:bg-dark-bg p-4`}>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-2 opacity-60">{label}</p>
        <div className="text-sm leading-relaxed text-brand-main dark:text-dark-text">{children}</div>
    </div>
);

/** Bloc identique mais avec whitespace-pre-wrap (pour le script vidéo) */
export const BlockPre = ({ label, color, children }: { label: string; color: string; children: React.ReactNode }) => (
    <div className={`rounded-lg border-l-4 ${color} bg-brand-light dark:bg-dark-bg p-4`}>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-2 opacity-60">{label}</p>
        <div className="text-sm leading-relaxed text-brand-main dark:text-dark-text whitespace-pre-wrap">{children}</div>
    </div>
);

/** Rendu inline du markdown **gras** */
export const renderMdText = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={index} className="font-bold">{part.slice(2, -2)}</strong>;
        }
        return <React.Fragment key={index}>{part}</React.Fragment>;
    });
};

/** Couleurs par profondeur */
export const DEPTH_COLORS: Record<string, string> = {
    [Profondeur.DIRECT]:   'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    [Profondeur.LEGERE]:   'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    [Profondeur.COMPLETE]: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
};

// ── Post Court : conversion en texte Unicode bold pour copie réseaux sociaux ──

const BOLD_MAP: Record<string, string> = {
    A:'𝗔',B:'𝗕',C:'𝗖',D:'𝗗',E:'𝗘',F:'𝗙',G:'𝗚',H:'𝗛',I:'𝗜',J:'𝗝',K:'𝗞',L:'𝗟',M:'𝗠',
    N:'𝗡',O:'𝗢',P:'𝗣',Q:'𝗤',R:'𝗥',S:'𝗦',T:'𝗧',U:'𝗨',V:'𝗩',W:'𝗪',X:'𝗫',Y:'𝗬',Z:'𝗭',
    a:'𝗮',b:'𝗯',c:'𝗰',d:'𝗱',e:'𝗲',f:'𝗳',g:'𝗴',h:'𝗵',i:'𝗶',j:'𝗷',k:'𝗸',l:'𝗹',m:'𝗺',
    n:'𝗻',o:'𝗼',p:'𝗽',q:'𝗾',r:'𝗿',s:'𝘀',t:'𝘁',u:'𝘂',v:'𝘃',w:'𝘄',x:'𝘅',y:'𝘆',z:'𝘇',
    '0':'𝟬','1':'𝟭','2':'𝟮','3':'𝟯','4':'𝟰','5':'𝟱','6':'𝟲','7':'𝟳','8':'𝟴','9':'𝟵',
};

const toBoldUnicode = (text: string): string =>
    text.split('').map(c => BOLD_MAP[c] ?? c).join('');

/** Construit le texte « prêt à copier » d'un Post Court (accroche/cta en bold Unicode) */
export const buildPostCourtText = (body: string): string => {
    if (!body) return "";
    try {
        const lastBrace = body.lastIndexOf('}');
        const cleaned = lastBrace !== -1 ? body.slice(0, lastBrace + 1) : body;
        const data = JSON.parse(cleaned);
        if (data.edited_raw) return data.edited_raw;
        const fmt = data.format;
        const isPostTexte = fmt === TargetFormat.POST_TEXTE_COURT || fmt === "Post Texte";
        if (!isPostTexte) return "";
        const v = (val: any) => (typeof val === 'string' ? val.trim() : "");
        const parts: string[] = [];
        if (data.accroche) parts.push(toBoldUnicode(v(data.accroche)));
        if (data.corps) parts.push(v(data.corps));
        if (data.cta)   parts.push(toBoldUnicode(v(data.cta)));
        return parts.filter(Boolean).join("\n\n");
    } catch {
        return body;
    }
};

/** Extrait le prompt Dzine d'un Post Texte structuré. */
export const getPostCourtDzinePrompt = (body: string): string => {
    if (!body) return "";
    try {
        const lastBrace = body.lastIndexOf('}');
        const cleaned = lastBrace !== -1 ? body.slice(0, lastBrace + 1) : body;
        const data = JSON.parse(cleaned);
        const fmt = data.format;
        const isPostTexte = fmt === TargetFormat.POST_TEXTE_COURT || fmt === "Post Texte";
        if (!isPostTexte) return "";
        return t(data.prompt_dzine);
    } catch {
        return "";
    }
};

/** Extrait le visuel suggéré d'un Post Texte structuré. */
export const getPostCourtSuggestedVisual = (body: string): string => {
    if (!body) return "";
    try {
        const lastBrace = body.lastIndexOf('}');
        const cleaned = lastBrace !== -1 ? body.slice(0, lastBrace + 1) : body;
        const data = JSON.parse(cleaned);
        const fmt = data.format;
        const isPostTexte = fmt === TargetFormat.POST_TEXTE_COURT || fmt === "Post Texte";
        if (!isPostTexte) return "";
        return t(data.visuel);
    } catch {
        return "";
    }
};

/** Construit le texte « prêt à copier » d'une Newsletter */
export const buildNewsletterText = (body: string): string => {
    if (!body) return "";
    try {
        const lastBrace = body.lastIndexOf('}');
        const cleaned = lastBrace !== -1 ? body.slice(0, lastBrace + 1) : body;
        const data = JSON.parse(cleaned);
        if (data.edited_raw) return data.edited_raw;
        const fmt = data.format;
        const isNewsletter = fmt === TargetFormat.NEWSLETTER || fmt === "Newsletter";
        if (!isNewsletter) return "";
        const v = (val: any) => (typeof val === 'string' ? val.trim() : "");
        const parts: string[] = [];
        if (data.accroche) parts.push(v(data.accroche));
        if (data.corps) parts.push(v(data.corps));
        if (data.repositionnement) parts.push(v(data.repositionnement));
        if (data.baffe) parts.push(v(data.baffe));
        if (data.cta) parts.push(v(data.cta));
        return parts.filter(Boolean).join("\n\n");
    } catch {
        return body;
    }
};
