import React from 'react';
import { Pencil } from 'lucide-react';
import { TargetFormat } from '../../../types';
import { parseBodyJson, t, Block } from './shared';

interface BodyRendererProps {
    body: string;
}

/**
 * Rendu structuré du body JSON selon le format du contenu.
 * Affiche un layout spécifique pour chaque TargetFormat
 * (Post Texte, Article, Reel/Short, Youtube, Carrousel, Prompt Image).
 */
export const BodyRenderer: React.FC<BodyRendererProps> = ({ body }) => {
    const data = parseBodyJson(body);

    if (!data || !data.format) {
        return (
            <div className="p-6 whitespace-pre-wrap text-sm leading-relaxed text-brand-main dark:text-dark-text">
                {data?.edited_raw || body}
            </div>
        );
    }

    if (data.edited_raw) {
        return (
            <div className="p-6 space-y-3">
                <div className="flex items-center gap-2 text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">
                    <Pencil className="w-3 h-3" /> Contenu édité manuellement
                </div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-brand-main dark:text-dark-text">
                    {data.edited_raw}
                </div>
            </div>
        );
    }

    const fmt = data.format;
    const isPostTexte   = fmt === TargetFormat.POST_TEXTE_COURT || fmt === "Post Texte";
    const isArticle     = fmt === TargetFormat.ARTICLE_LONG_SEO || fmt === "Article";
    const isReelShort   = fmt === TargetFormat.SCRIPT_VIDEO_REEL_SHORT || fmt === "Script Reel";
    const isYoutube     = fmt === TargetFormat.SCRIPT_VIDEO_YOUTUBE || fmt === "Script Youtube";
    const isCarrousel   = fmt === TargetFormat.CARROUSEL_SLIDE || fmt === "Carrousel";
    const isPromptImage = fmt === TargetFormat.PROMPT_IMAGE || fmt === "Prompt Image";

    if (isPostTexte) return (
        <div className="p-6 space-y-4">
            {data.hook  && <Block label="Hook"  color="border-pink-400">{t(data.hook)}</Block>}
            {data.corps && <Block label="Corps" color="border-brand-main dark:border-white">{t(data.corps)}</Block>}
            {data.baffe && <Block label="Baffe" color="border-purple-400">{t(data.baffe)}</Block>}
            {data.cta   && <Block label="CTA"   color="border-green-400">{t(data.cta)}</Block>}
        </div>
    );

    if (isArticle) return (
        <div className="p-6 space-y-4">
            {data.titre_h1    && <h2 className="text-xl font-bold text-brand-main dark:text-white">{t(data.titre_h1)}</h2>}
            {data.introduction && <Block label="Introduction" color="border-blue-400">{t(data.introduction)}</Block>}
            {(data.sections || []).map((s: any, i: number) => (
                <div key={i} className="space-y-2">
                    {s.sous_titre_h2 && <h3 className="text-base font-bold text-brand-main dark:text-white">{t(s.sous_titre_h2)}</h3>}
                    {s.contenu && <p className="text-sm leading-relaxed text-brand-main dark:text-dark-text">{t(s.contenu)}</p>}
                </div>
            ))}
            {data.conclusion && <Block label="Conclusion" color="border-purple-400">{t(data.conclusion)}</Block>}
            {data.cta        && <Block label="CTA"        color="border-green-400">{t(data.cta)}</Block>}
        </div>
    );

    if (isReelShort) return (
        <div className="p-6 space-y-4">
            {data.contrainte && <p className="text-[10px] font-bold text-brand-main/40 dark:text-dark-text/40 uppercase">{t(data.contrainte)}</p>}
            {data.hook  && <Block label="Hook [0–3s]"   color="border-pink-400">{t(data.hook)}</Block>}
            {data.corps && <Block label="Corps [3–50s]" color="border-brand-main dark:border-white">{t(data.corps)}</Block>}
            {data.cta   && <Block label="CTA [50–60s]"  color="border-green-400">{t(data.cta)}</Block>}
        </div>
    );

    if (isYoutube) return (
        <div className="p-6 space-y-4">
            {data.intro && <Block label="Intro" color="border-pink-400">{t(data.intro)}</Block>}
            {(data.developpement || []).map((s: any, i: number) => (
                <div key={i} className="space-y-2">
                    {s.point  && <h3 className="text-sm font-bold text-brand-main dark:text-white">{t(s.point)}</h3>}
                    {s.contenu && <p className="text-sm leading-relaxed text-brand-main dark:text-dark-text">{t(s.contenu)}</p>}
                </div>
            ))}
            {data.conclusion && <Block label="Conclusion" color="border-purple-400">{t(data.conclusion)}</Block>}
        </div>
    );

    if (isCarrousel) return (
        <div className="p-6 space-y-3">
            {(data.slides || []).map((s: any, i: number) => (
                <div key={i} className="bg-brand-light dark:bg-dark-bg rounded-lg p-3 border border-brand-border dark:border-dark-sec-border">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="w-5 h-5 rounded-full bg-pink-500 text-white text-[10px] font-bold flex items-center justify-center">{s.numero ?? i + 1}</span>
                        {s.titre && <span className="text-sm font-bold text-brand-main dark:text-white">{t(s.titre)}</span>}
                    </div>
                    {s.texte && <p className="text-sm text-brand-main dark:text-dark-text leading-relaxed">{t(s.texte)}</p>}
                </div>
            ))}
            {data.slide_finale && (
                <div className="bg-green-50 dark:bg-green-900/10 rounded-lg p-3 border border-green-200 dark:border-green-800">
                    <p className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase mb-1">Slide finale</p>
                    {data.slide_finale.titre && <p className="text-sm font-bold text-brand-main dark:text-white">{t(data.slide_finale.titre)}</p>}
                    {data.slide_finale.texte && <p className="text-sm text-brand-main dark:text-dark-text">{t(data.slide_finale.texte)}</p>}
                </div>
            )}
        </div>
    );

    if (isPromptImage) return (
        <div className="p-6 space-y-4">
            {data.prompt  && <Block label="Prompt (EN)" color="border-amber-400">{t(data.prompt)}</Block>}
            {data.legende && <Block label="Légende"     color="border-blue-400">{t(data.legende)}</Block>}
        </div>
    );

    return <div className="p-6 text-sm text-brand-main dark:text-dark-text whitespace-pre-wrap">{body}</div>;
};
