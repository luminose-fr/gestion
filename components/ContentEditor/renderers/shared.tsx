import React from 'react';
import { Profondeur } from '../../../types';

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
