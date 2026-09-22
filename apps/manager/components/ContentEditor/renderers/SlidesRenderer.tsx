import React, { useState } from 'react';
import { Check, Copy, Wand2, X, Send } from 'lucide-react';
import { EnCours } from '../../Feedback';
import { copyTextToClipboard, CarrouselLegende } from './shared';
import { Bouton, Champ } from '../../ui';

interface SlidesRendererProps {
    slidesRaw: string;
    /** Si fourni, ajoute la possibilité d'ajuster les prompts (globaux ou par slide). */
    onAdjustPrompts?: (instruction: string, slideNumero: number | null) => void;
    /** Désactive les boutons "Ajuster" pendant un appel IA en cours. */
    isAdjusting?: boolean;
}

const parseSlidesJson = (raw: string): { slides: any[]; legende?: any } | null => {
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
 * Permet l'ajustement des prompts via IA, en global ou pour une slide précise.
 */
export const SlidesRenderer: React.FC<SlidesRendererProps> = ({ slidesRaw, onAdjustPrompts, isAdjusting }) => {
    const parsed = parseSlidesJson(slidesRaw);
    const [copiedSlide, setCopiedSlide] = useState<number | null>(null);

    // ── Form d'ajustement (état local) ──
    const [adjustTarget, setAdjustTarget] = useState<number | 'all' | null>(null);
    const [adjustText, setAdjustText] = useState('');

    const handleCopyPrompt = async (slideNumber: number, prompt: string) => {
        const copied = await copyTextToClipboard(prompt);
        if (copied) {
            setCopiedSlide(slideNumber);
            window.setTimeout(() => {
                setCopiedSlide((current) => (current === slideNumber ? null : current));
            }, 2000);
        }
    };

    const closeAdjustForm = () => {
        setAdjustTarget(null);
        setAdjustText('');
    };

    const submitAdjustment = () => {
        if (!onAdjustPrompts || !adjustText.trim() || adjustTarget === null) return;
        const slideNumero = adjustTarget === 'all' ? null : adjustTarget;
        onAdjustPrompts(adjustText.trim(), slideNumero);
        closeAdjustForm();
    };

    if (!parsed) {
        return (
            <pre className="p-6 text-sm font-mono text-brand-main dark:text-dark-text whitespace-pre-wrap leading-relaxed">
                {slidesRaw}
            </pre>
        );
    }

    const { slides: slideList } = parsed;
    const canAdjust = !!onAdjustPrompts;
    const adjustOpen = adjustTarget !== null;

    return (
        <div className="p-6 space-y-6">

            {/* ── Toolbar : bouton global "Ajuster les prompts" ── */}
            {canAdjust && (
                <div className="flex justify-end">
                    <Bouton
                        onClick={() => { setAdjustTarget('all'); setAdjustText(''); }}
                        disabled={isAdjusting}
                        taille="petit"
                        title="Ajuster tous les prompts d'image en une seule passe IA">
                        <Wand2 className="w-3.5 h-3.5" />
                        Ajuster tous les prompts
                    </Bouton>
                </div>
            )}

            {/* ── Form d'ajustement (sticky, visible si adjustOpen) ── */}
            {adjustOpen && (
                <div className="sticky top-0 z-10 -mx-2 px-2">
                    <div className="rounded-xl border border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg backdrop-blur-sm p-4 shadow-xs animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <div className="flex items-center gap-2">
                                <Wand2 className="w-3.5 h-3.5 text-brand-main dark:text-dark-text" />
                                <p className="text-micro font-bold uppercase tracking-wider text-brand-main dark:text-dark-text">
                                    Ajuster {adjustTarget === 'all' ? 'tous les prompts' : `le prompt de la slide ${adjustTarget}`}
                                </p>
                            </div>
                            <button
                                onClick={closeAdjustForm}
                                className="p-1 rounded-md text-brand-main/60 dark:text-dark-text/60 hover:bg-brand-light dark:hover:bg-dark-bg transition-colors"
                                title="Annuler"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 items-stretch">
                            <Champ multiligne
                                value={adjustText}
                                onChange={(e) => setAdjustText(e.target.value)}
                                placeholder={adjustTarget === 'all'
                                    ? "Ex : palette plus chaude, style éditorial photo argentique, supprime les visages…"
                                    : "Ex : plus épuré, composition centrée, moins de personnages…"}
                                className="flex-1 resize-none leading-relaxed"
                                rows={2}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && adjustText.trim()) {
                                        submitAdjustment();
                                    }
                                    if (e.key === 'Escape') closeAdjustForm();
                                }}
                                autoFocus
                                disabled={isAdjusting}
                            />
                            <Bouton
                                onClick={submitAdjustment}
                                disabled={!adjustText.trim() || isAdjusting}
                                className="self-end sm:self-stretch shrink-0" taille="petit" intention="principale" posee>
                                {isAdjusting
                                    ? <EnCours label="Ajustement…" />
                                    : <><Send className="w-3.5 h-3.5" /> Envoyer</>}
                            </Bouton>
                        </div>
                        <p className="text-micro text-brand-main/70 dark:text-dark-text/70 mt-1.5">
                            ⌘+Entrée pour envoyer · Échap pour annuler
                        </p>
                    </div>
                </div>
            )}

            {/* ── Slides ── */}
            <div className="space-y-8">
                {Array.isArray(slideList) && slideList.map((slide: any) => (
                    <div key={slide.numero} className="flex flex-col xl:flex-row gap-6 items-start">
                        <div className="w-full max-w-[560px] shrink-0">
                            <div className={`aspect-square rounded-xl border overflow-hidden shadow-lg ${
                                slide.type === 'ILLUSTRÉE'
                                    ? 'bg-white dark:bg-dark-surface border-brand-border dark:border-dark-sec-border'
                                    : 'bg-brand-light dark:bg-dark-bg border-brand-border dark:border-dark-sec-border'
                            }`}>
                                {slide.type === 'ILLUSTRÉE' ? (
                                    <div className="flex h-full flex-col">
                                        <div className="relative flex-1 min-h-0 overflow-hidden bg-linear-to-br from-[#f4e7ef] via-[#efe3f8] to-[#d9c4ec] dark:from-[#3f2258] dark:via-[#4f2d6f] dark:to-[#2a163c]">
                                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.55),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(97,99,165,0.24),transparent_46%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(229,199,205,0.14),transparent_46%)]" />
                                            <div className="absolute left-5 right-5 top-5 flex items-center justify-between gap-3">
                                                <span className="inline-flex items-center rounded-full bg-white/90 dark:bg-dark-surface/85 px-3 py-1 text-micro font-bold uppercase tracking-wider text-brand-main dark:text-dark-text shadow-xs">
                                                    Slide {slide.numero}
                                                </span>
                                                <span className="inline-flex items-center rounded-full border border-white/60 bg-white/50 dark:border-dark-sec-border dark:bg-dark-surface/30 px-3 py-1 text-micro font-bold uppercase tracking-wider text-brand-main dark:text-dark-text backdrop-blur-sm">
                                                    Illustrée
                                                </span>
                                            </div>
                                            <div className="absolute bottom-5 right-5 rounded-xl border border-white/50 bg-white/60 dark:border-dark-sec-border dark:bg-dark-surface/35 px-4 py-2 text-micro font-bold uppercase tracking-wider text-brand-main dark:text-dark-text backdrop-blur-sm">
                                                Zone illustration
                                            </div>
                                        </div>
                                        <div className="border-t border-brand-border dark:border-dark-sec-border bg-white/95 dark:bg-dark-surface/95 px-6 py-6">
                                            {slide.titre && (
                                                <h3 className="font-display italic text-lg leading-[1.08] text-brand-main dark:text-white">
                                                    {slide.titre}
                                                </h3>
                                            )}
                                            {slide.texte && (
                                                <p className="mt-4 font-sans text-sm leading-[1.55] text-brand-main/85 dark:text-dark-text">
                                                    {slide.texte}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex h-full flex-col bg-[linear-gradient(145deg,#fffdfd_0%,#f8f2fb_48%,#f4e9f5_100%)] dark:bg-[linear-gradient(145deg,#241432_0%,#2f1a44_50%,#39204e_100%)] p-6">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="inline-flex items-center rounded-full bg-brand-main px-3 py-1 text-micro font-bold uppercase tracking-wider text-white">
                                                Slide {slide.numero}
                                            </span>
                                            <span className="inline-flex items-center rounded-full border border-brand-border bg-brand-light px-3 py-1 text-micro font-bold uppercase tracking-wider text-brand-main dark:border-dark-sec-border dark:bg-dark-bg dark:text-dark-text">
                                                Texte
                                            </span>
                                        </div>
                                        <div className="flex flex-1 flex-col justify-center">
                                            {slide.titre && (
                                                <h3 className="font-display italic text-lg leading-[1.08] text-brand-main dark:text-white">
                                                    {slide.titre}
                                                </h3>
                                            )}
                                            {slide.texte && (
                                                <p className="mt-5 font-sans text-sm leading-[1.6] text-brand-main/85 dark:text-dark-text">
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
                                <div className="h-full rounded-xl border border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg p-5">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <div>
                                            <p className="text-micro font-bold uppercase tracking-wider text-brand-main dark:text-dark-text">
                                                Prompt Dzine
                                            </p>
                                            <p className="mt-1 text-xs text-brand-main/70 dark:text-dark-text/70">
                                                Slide illustrée
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            {canAdjust && (
                                                <Bouton
                                                    onClick={() => { setAdjustTarget(slide.numero); setAdjustText(''); }}
                                                    disabled={isAdjusting}
                                                    taille="petit"
                                                    title={`Ajuster le prompt de la slide ${slide.numero}`}>
                                                    <Wand2 className="h-3.5 w-3.5" />
                                                    Ajuster
                                                </Bouton>
                                            )}
                                            <Bouton taille="petit" intention={copiedSlide === slide.numero ? 'principale' : 'secondaire'} ton={copiedSlide === slide.numero ? 'succes' : 'neutre'}
                                    onClick={() => handleCopyPrompt(slide.numero, slide.prompt_dzine)}
                                >
                                                {copiedSlide === slide.numero ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                                {copiedSlide === slide.numero ? 'Copié' : 'Copier'}
                                            </Bouton>
                                        </div>
                                    </div>
                                    <div className="mt-4 rounded-xl border border-brand-border dark:border-dark-sec-border bg-white/80 dark:bg-dark-surface/50 p-4">
                                        <p className="font-sans text-sm leading-[1.6] text-brand-main dark:text-dark-text whitespace-pre-wrap">
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

            {/* ── Légende de publication ── */}
            <CarrouselLegende legende={parsed.legende} />
        </div>
    );
};
