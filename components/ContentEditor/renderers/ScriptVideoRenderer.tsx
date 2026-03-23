import React from 'react';
import { TargetFormat } from '../../../types';
import { parseBodyJson, t, BlockPre } from './shared';

interface ScriptVideoRendererProps {
    raw: string;
    variant?: 'default' | 'table';
}

/**
 * Rendu structuré du script vidéo (Reel/Short ou Youtube).
 * Utilise des blocs avec whitespace-pre-wrap pour conserver
 * les retours à la ligne du script.
 */
export const ScriptVideoRenderer: React.FC<ScriptVideoRendererProps> = ({ raw, variant = 'default' }) => {
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

    if (isReelShort) {
        if (variant === 'table') {
            return (
                <div className="p-6 overflow-x-auto">
                    <div className="min-w-[840px] space-y-3">
                        {(data.sections || []).map((s: any, i: number) => (
                            <div
                                key={i}
                                className="grid grid-cols-[160px_minmax(0,1.4fr)_minmax(0,1fr)] gap-4 rounded-xl border border-brand-border dark:border-dark-sec-border bg-brand-light/60 dark:bg-dark-bg/40 p-4"
                            >
                                <div className="text-sm font-medium text-brand-main dark:text-white whitespace-pre-wrap">
                                    {[t(s.timing), t(s.role)].filter(Boolean).join(' - ')}
                                </div>
                                <div className="text-sm leading-relaxed text-brand-main dark:text-dark-text whitespace-pre-wrap">
                                    {t(s.texte)}
                                </div>
                                <div className="text-sm leading-relaxed text-brand-main/75 dark:text-dark-text/75 whitespace-pre-wrap">
                                    {t(s.intention)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        return (
            <div className="p-6 space-y-4">
                {data.contrainte && <p className="text-[10px] font-bold text-amber-600/60 dark:text-amber-400/60 uppercase">{t(data.contrainte)}</p>}
                {(data.sections || []).map((s: any, i: number) => (
                    <BlockPre key={i} label={`${t(s.timing)} ${t(s.role)}`} color={
                        i === 0 ? "border-amber-400" :
                        i === (data.sections?.length ?? 0) - 1 ? "border-green-400" :
                        "border-brand-main dark:border-white"
                    }>
                        {t(s.texte)}
                        {s.intention && <p className="mt-2 text-xs italic opacity-60">{t(s.intention)}</p>}
                    </BlockPre>
                ))}
            </div>
        );
    }

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
