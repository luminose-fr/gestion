import React from 'react';
import { TargetFormat } from '../../../types';
import { parseBodyJson, t, BlockPre } from './shared';

interface ScriptVideoRendererProps {
    raw: string;
}

/**
 * Rendu structuré du script vidéo (Reel/Short ou Youtube).
 * Utilise des blocs avec whitespace-pre-wrap pour conserver
 * les retours à la ligne du script.
 */
export const ScriptVideoRenderer: React.FC<ScriptVideoRendererProps> = ({ raw }) => {
    const data = parseBodyJson(raw);

    if (!data || !data.format) {
        return (
            <div className="p-6 whitespace-pre-wrap text-sm leading-relaxed text-brand-main dark:text-dark-text">
                {data?.edited_raw || raw}
            </div>
        );
    }

    const fmt = data.format;
    const isReelShort = fmt === TargetFormat.SCRIPT_VIDEO_REEL_SHORT || fmt === "Script Reel";
    const isYoutube   = fmt === TargetFormat.SCRIPT_VIDEO_YOUTUBE || fmt === "Script Youtube";

    if (isReelShort) return (
        <div className="p-6 space-y-4">
            {data.contrainte && <p className="text-[10px] font-bold text-amber-600/60 dark:text-amber-400/60 uppercase">{t(data.contrainte)}</p>}
            {data.hook  && <BlockPre label="Hook [0–3s]"   color="border-amber-400">{t(data.hook)}</BlockPre>}
            {data.corps && <BlockPre label="Corps [3–50s]" color="border-brand-main dark:border-white">{t(data.corps)}</BlockPre>}
            {data.cta   && <BlockPre label="CTA [50–60s]"  color="border-green-400">{t(data.cta)}</BlockPre>}
        </div>
    );

    if (isYoutube) return (
        <div className="p-6 space-y-4">
            {data.intro && <BlockPre label="Intro" color="border-amber-400">{t(data.intro)}</BlockPre>}
            {(data.developpement || []).map((s: any, i: number) => (
                <div key={i} className="space-y-2">
                    {s.point  && <h3 className="text-sm font-bold text-brand-main dark:text-white">{t(s.point)}</h3>}
                    {s.contenu && <p className="text-sm leading-relaxed text-brand-main dark:text-dark-text whitespace-pre-wrap">{t(s.contenu)}</p>}
                </div>
            ))}
            {data.conclusion && <BlockPre label="Conclusion" color="border-purple-400">{t(data.conclusion)}</BlockPre>}
        </div>
    );

    // Fallback
    return <div className="p-6 text-sm text-brand-main dark:text-dark-text whitespace-pre-wrap">{raw}</div>;
};
