import React from 'react';
import { Images } from 'lucide-react';

interface SlidesRendererProps {
    slidesRaw: string;
}

const parseSlidesJson = (raw: string): { direction_globale: any; slides: any[] } | null => {
    try {
        const lastBrace = raw.lastIndexOf('}');
        const cleaned = lastBrace !== -1 ? raw.slice(0, lastBrace + 1) : raw;
        return JSON.parse(cleaned);
    } catch {
        return null;
    }
};

/**
 * Rendu structuré de la direction artistique des slides carrousel.
 * Affiche la direction globale (style, palette, éclairage, ambiance)
 * puis chaque slide avec son texte, prompt Dzine, indication typo et composition.
 */
export const SlidesRenderer: React.FC<SlidesRendererProps> = ({ slidesRaw }) => {
    const parsed = parseSlidesJson(slidesRaw);

    if (!parsed) {
        return (
            <pre className="p-6 text-sm font-mono text-brand-main dark:text-dark-text whitespace-pre-wrap leading-relaxed">
                {slidesRaw}
            </pre>
        );
    }

    const { direction_globale: dg, slides: slideList } = parsed;

    return (
        <div className="p-6 space-y-8">
            {dg && (
                <div className="bg-violet-50 dark:bg-violet-900/10 rounded-xl border border-violet-200 dark:border-violet-800/50 p-5">
                    <h3 className="text-xs font-bold text-violet-700 dark:text-violet-300 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Images className="w-3.5 h-3.5" /> Direction globale
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { label: 'Style',     value: dg.style },
                            { label: 'Palette',   value: dg.palette },
                            { label: 'Éclairage', value: dg.eclairage },
                            { label: 'Ambiance',  value: dg.ambiance },
                        ].map(({ label, value }) => value && (
                            <div key={label} className="bg-white dark:bg-dark-surface rounded-lg p-3 border border-violet-100 dark:border-violet-900/40">
                                <p className="text-[10px] font-bold text-violet-500 dark:text-violet-400 uppercase mb-1">{label}</p>
                                <p className="text-sm text-brand-main dark:text-dark-text leading-relaxed">{value}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <div className="space-y-4">
                {Array.isArray(slideList) && slideList.map((slide: any) => (
                    <div key={slide.numero} className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg">
                            <span className="w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                                {slide.numero}
                            </span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${slide.type === 'ILLUSTRÉE' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'}`}>
                                {slide.type}
                            </span>
                            {slide.titre && (
                                <span className="text-sm font-bold text-brand-main dark:text-white truncate">{slide.titre}</span>
                            )}
                        </div>
                        <div className="p-4 space-y-3">
                            {slide.texte && (
                                <div className="bg-brand-light dark:bg-dark-bg rounded-lg p-3 border-l-4 border-violet-400">
                                    <p className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase mb-1">Texte slide</p>
                                    <p className="text-sm text-brand-main dark:text-dark-text leading-relaxed">{slide.texte}</p>
                                </div>
                            )}
                            {slide.prompt_dzine && (
                                <div>
                                    <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase mb-1">Prompt Dzine</p>
                                    <p className="text-sm text-brand-main dark:text-dark-text leading-relaxed italic">{slide.prompt_dzine}</p>
                                </div>
                            )}
                            {slide.indication_typo && (
                                <div>
                                    <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase mb-1">Indication Typo</p>
                                    <p className="text-sm text-brand-main dark:text-dark-text leading-relaxed">{slide.indication_typo}</p>
                                </div>
                            )}
                            {slide.note_composition && (
                                <div className="border-t border-brand-border dark:border-dark-sec-border pt-3">
                                    <p className="text-[10px] font-bold text-brand-main/40 dark:text-dark-text/40 uppercase mb-1">Composition</p>
                                    <p className="text-sm text-brand-main/70 dark:text-dark-text/70 leading-relaxed">{slide.note_composition}</p>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
