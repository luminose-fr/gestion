import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyTextToClipboard } from './shared';

interface SlidesRendererProps {
    slidesRaw: string;
}

const parseSlidesJson = (raw: string): { slides: any[] } | null => {
    try {
        const lastBrace = raw.lastIndexOf('}');
        const cleaned = lastBrace !== -1 ? raw.slice(0, lastBrace + 1) : raw;
        return JSON.parse(cleaned);
    } catch {
        return null;
    }
};

/**
 * Rendu structuré des slides carrousel.
 * Affiche chaque slide avec son texte et son prompt Dzine.
 */
export const SlidesRenderer: React.FC<SlidesRendererProps> = ({ slidesRaw }) => {
    const parsed = parseSlidesJson(slidesRaw);
    const [copiedSlide, setCopiedSlide] = useState<number | null>(null);

    const handleCopyPrompt = async (slideNumber: number, prompt: string) => {
        const copied = await copyTextToClipboard(prompt);
        if (copied) {
            setCopiedSlide(slideNumber);
            window.setTimeout(() => {
                setCopiedSlide((current) => (current === slideNumber ? null : current));
            }, 2000);
        }
    };

    if (!parsed) {
        return (
            <pre className="p-6 text-sm font-mono text-brand-main dark:text-dark-text whitespace-pre-wrap leading-relaxed">
                {slidesRaw}
            </pre>
        );
    }

    const { slides: slideList } = parsed;

    return (
        <div className="p-6 space-y-8">
            <div className="space-y-8">
                {Array.isArray(slideList) && slideList.map((slide: any) => (
                    <div key={slide.numero} className="flex flex-col xl:flex-row gap-6 items-start">
                        <div className="w-full max-w-[560px] shrink-0">
                            <div className={`aspect-square rounded-xl border overflow-hidden shadow-[0_18px_50px_-28px_rgba(56,21,75,0.55)] ${
                                slide.type === 'ILLUSTRÉE'
                                    ? 'bg-white dark:bg-dark-surface border-violet-200 dark:border-violet-900/50'
                                    : 'bg-brand-light dark:bg-dark-bg border-brand-border dark:border-dark-sec-border'
                            }`}>
                                {slide.type === 'ILLUSTRÉE' ? (
                                    <div className="flex h-full flex-col">
                                        <div className="relative flex-1 min-h-0 overflow-hidden bg-linear-to-br from-[#f4e7ef] via-[#efe3f8] to-[#d9c4ec] dark:from-[#3f2258] dark:via-[#4f2d6f] dark:to-[#2a163c]">
                                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.55),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(97,99,165,0.24),transparent_46%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(229,199,205,0.14),transparent_46%)]" />
                                            <div className="absolute left-5 right-5 top-5 flex items-center justify-between gap-3">
                                                <span className="inline-flex items-center rounded-full bg-white/90 dark:bg-dark-surface/85 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-violet-700 dark:text-violet-200 shadow-sm">
                                                    Slide {slide.numero}
                                                </span>
                                                <span className="inline-flex items-center rounded-full border border-white/60 bg-white/50 dark:border-violet-200/10 dark:bg-dark-surface/30 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-violet-700 dark:text-violet-200 backdrop-blur-sm">
                                                    Illustrée
                                                </span>
                                            </div>
                                            <div className="absolute bottom-5 right-5 rounded-xl border border-white/50 bg-white/60 dark:border-violet-200/10 dark:bg-dark-surface/35 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-violet-700 dark:text-violet-200 backdrop-blur-sm">
                                                Zone illustration
                                            </div>
                                        </div>
                                        <div className="border-t border-violet-100 dark:border-violet-900/40 bg-white/95 dark:bg-dark-surface/95 px-7 py-6">
                                            {slide.titre && (
                                                <h3 className="font-display italic text-[20px] leading-[1.08] text-brand-main dark:text-white">
                                                    {slide.titre}
                                                </h3>
                                            )}
                                            {slide.texte && (
                                                <p className="mt-4 font-sans text-[13px] leading-[1.55] text-brand-main/85 dark:text-dark-text">
                                                    {slide.texte}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex h-full flex-col bg-[linear-gradient(145deg,#fffdfd_0%,#f8f2fb_48%,#f4e9f5_100%)] dark:bg-[linear-gradient(145deg,#241432_0%,#2f1a44_50%,#39204e_100%)] p-7">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="inline-flex items-center rounded-full bg-violet-600 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white">
                                                Slide {slide.numero}
                                            </span>
                                            <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
                                                Texte
                                            </span>
                                        </div>
                                        <div className="flex flex-1 flex-col justify-center">
                                            {slide.titre && (
                                                <h3 className="font-display italic text-[20px] leading-[1.08] text-brand-main dark:text-white">
                                                    {slide.titre}
                                                </h3>
                                            )}
                                            {slide.texte && (
                                                <p className="mt-5 font-sans text-[13px] leading-[1.6] text-brand-main/85 dark:text-dark-text">
                                                    {slide.texte}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {slide.type === 'ILLUSTRÉE' && slide.prompt_dzine ? (
                            <div className="w-full xl:flex-1 min-w-0">
                                <div className="h-full rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-900/10 p-5">
                                    <div className="flex items-center justify-between gap-4">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                                                Prompt Dzine
                                            </p>
                                            <p className="mt-1 text-xs text-amber-700/70 dark:text-amber-200/70">
                                                Slide illustrée
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => handleCopyPrompt(slide.numero, slide.prompt_dzine)}
                                            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                                                copiedSlide === slide.numero
                                                    ? 'border-emerald-700 bg-emerald-600 text-white'
                                                    : 'border-amber-300 bg-white text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/30'
                                            }`}
                                        >
                                            {copiedSlide === slide.numero ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                            {copiedSlide === slide.numero ? 'Copié' : 'Copier'}
                                        </button>
                                    </div>
                                    <div className="mt-4 rounded-xl border border-amber-100 dark:border-amber-900/30 bg-white/80 dark:bg-dark-surface/50 p-4">
                                        <p className="font-sans text-[13px] leading-[1.6] text-brand-main dark:text-dark-text whitespace-pre-wrap">
                                            {slide.prompt_dzine}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="hidden xl:block xl:flex-1" />
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
