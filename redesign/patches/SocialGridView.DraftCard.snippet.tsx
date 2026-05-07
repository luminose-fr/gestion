// ─────────────────────────────────────────────────────────────────────────────
// PATCH pour components/Views/SocialGridView.tsx
//
// 1) Ajouter ces imports en haut du fichier :
//    import { Sparkles } from 'lucide-react';
//    import { ContentItem, TargetFormat, Verdict, DisplayPrefs, DEFAULT_DISPLAY_PREFS } from '../../types';
//
// 2) Remplacer entièrement le composant DraftCard par celui-ci :
// ─────────────────────────────────────────────────────────────────────────────

const VERDICT_STRIPE: Record<Verdict, string> = {
    [Verdict.VALID]:       'bg-emerald-500',
    [Verdict.TOO_BLAND]:   'bg-amber-500',
    [Verdict.NEEDS_WORK]:  'bg-red-500',
};

const DraftCard: React.FC<{
    item: ContentItem;
    onClick: (item: ContentItem) => void;
    highlight: string;
    prefs: DisplayPrefs;
}> = ({ item, onClick, highlight, prefs }) => {
    const stripeColor = item.verdict ? VERDICT_STRIPE[item.verdict] : 'bg-brand-border dark:bg-dark-sec-border';
    const showStripe  = prefs.showVerdictStripe && !!item.verdict;

    return (
        <div
            onClick={() => onClick(item)}
            className="group relative bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border hover:border-brand-main/40 hover:shadow-lg hover:shadow-brand-main/5 cursor-pointer transition-all duration-150 flex overflow-hidden"
        >
            {/* Verdict stripe */}
            {showStripe && (
                <div className={`w-1 shrink-0 ${stripeColor}`} aria-hidden="true" />
            )}

            <div className="flex-1 p-4 flex flex-col min-w-0">
                {/* Title */}
                <h4 className="font-semibold text-brand-main dark:text-white leading-snug line-clamp-2 mb-1.5">
                    {getHighlightedText(item.title || 'Brouillon sans titre', highlight)}
                </h4>

                {/* Strategic angle (if analyzed) */}
                {item.strategicAngle && (
                    <p className="flex items-start gap-1.5 text-xs text-brand-main/80 dark:text-brand-light/80 italic leading-relaxed mb-2 line-clamp-2">
                        <Sparkles className="w-3 h-3 mt-0.5 shrink-0 not-italic" />
                        <span>{item.strategicAngle}</span>
                    </p>
                )}

                {/* Body preview */}
                <p className="text-xs text-brand-main/60 dark:text-dark-text/60 line-clamp-3 flex-1 mb-3 leading-relaxed">
                    {getHighlightedText(getPreviewText(item), highlight)}
                </p>

                {/* Meta row */}
                <div className="flex items-center justify-between gap-2 flex-wrap mt-auto">
                    <div className="flex gap-1.5 flex-wrap">
                        {prefs.showPlatforms && (item.platforms || []).slice(0, 2).map(p => (
                            <span
                                key={p}
                                className="inline-flex items-center rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-brand-light text-brand-main/70 border-brand-border dark:bg-dark-bg dark:text-dark-text dark:border-dark-sec-border"
                            >
                                {p}
                            </span>
                        ))}
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                        {prefs.showDepth && item.depth && (
                            <span className="inline-flex items-center rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800/50">
                                {item.depth}
                            </span>
                        )}
                        {item.targetFormat && (
                            <span className="inline-flex items-center rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-900/20 dark:text-pink-300 dark:border-pink-800/50">
                                {item.targetFormat}
                            </span>
                        )}
                        {prefs.showOffer && item.targetOffer && (
                            <span className="inline-flex items-center rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-brand-light text-brand-main border-brand-main/20 dark:bg-dark-bg dark:text-dark-text dark:border-dark-sec-border">
                                {item.targetOffer}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
