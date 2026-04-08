import React, { useState, useRef, useEffect } from 'react';
import { Eye, RotateCcw, CheckCircle2, Target, Zap, Images, Copy, Check, FileText, Video, Calendar } from 'lucide-react';
import { ContentItem, ContentStatus, TargetFormat } from '../../types';
import { BodyRenderer } from './renderers/BodyRenderer';
import { ScriptVideoRenderer } from './renderers/ScriptVideoRenderer';
import { SlidesRenderer } from './renderers/SlidesRenderer';
import { DEPTH_COLORS, buildPostCourtText, copyTextToClipboard, getPostCourtDzinePrompt, getPostCourtSuggestedVisual } from './renderers/shared';

// ── Publish button with date picker popover ────────────────────────

const PublishButton: React.FC<{ onPublish: (date: string) => void; currentDate: string | null }> = ({ onPublish, currentDate }) => {
    const [open, setOpen] = useState(false);
    const [date, setDate] = useState(() => {
        if (currentDate) return currentDate.slice(0, 10);
        return new Date().toISOString().slice(0, 10);
    });
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-xs transition-colors"
            >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Marquer publié
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-2 z-50 bg-white dark:bg-dark-bg rounded-xl border border-brand-border dark:border-dark-sec-border shadow-xl p-4 space-y-3 min-w-[220px]">
                    <label className="text-xs font-medium text-brand-main/60 dark:text-dark-text/60 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        Date de publication
                    </label>
                    <input
                        type="date"
                        value={date}
                        onChange={e => setDate(e.target.value)}
                        className="w-full text-sm bg-brand-light dark:bg-dark-surface border border-brand-border dark:border-dark-sec-border rounded-lg px-3 py-2 text-brand-main dark:text-white"
                    />
                    <button
                        onClick={() => { onPublish(date); setOpen(false); }}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                    >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Confirmer
                    </button>
                </div>
            )}
        </div>
    );
};

interface PreviewViewProps {
    item: ContentItem;
    onChangeStatus: (status: ContentStatus, scheduledDate?: string) => Promise<void>;
}

export const PreviewView: React.FC<PreviewViewProps> = ({ item, onChangeStatus }) => {

    const isReelShort = item.targetFormat === TargetFormat.SCRIPT_VIDEO_REEL_SHORT;
    const isVideoFormat = item.targetFormat === TargetFormat.SCRIPT_VIDEO_REEL_SHORT
        || item.targetFormat === TargetFormat.SCRIPT_VIDEO_YOUTUBE;
    const isCarrousel = item.targetFormat === TargetFormat.CARROUSEL_SLIDE;
    const isPostCourt = item.targetFormat === TargetFormat.POST_TEXTE_COURT;
    const usesWorkedLayout = isPostCourt || isCarrousel || isReelShort;
    const hasBody = isVideoFormat ? !!item.scriptVideo : !!item.body;

    const [copied, setCopied] = useState(false);
    const [copiedDzine, setCopiedDzine] = useState(false);
    const postCourtText = isPostCourt ? buildPostCourtText(item.body || "") : "";
    const dzinePrompt = isPostCourt ? getPostCourtDzinePrompt(item.body || "") : "";
    const suggestedVisual = isPostCourt ? getPostCourtSuggestedVisual(item.body || "") : "";

    const handleCopy = async () => {
        const copied = await copyTextToClipboard(postCourtText);
        if (!copied) return;
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDzineCopy = async () => {
        const copied = await copyTextToClipboard(dzinePrompt);
        if (!copied) return;
        setCopiedDzine(true);
        setTimeout(() => setCopiedDzine(false), 2000);
    };

    const renderPostCourt = (text: string) => {
        return text.split('\n\n').map((paragraph, pi) => (
            <p key={pi} className={`leading-relaxed text-brand-main dark:text-dark-text ${pi > 0 ? 'mt-4' : ''}`}>
                {paragraph}
            </p>
        ));
    };

    const FinalMetaHeader = () => (
        <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-brand-main/45 dark:text-dark-text/45">Format :</span>
                {item.targetFormat ? (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800">
                        {item.targetFormat}
                    </span>
                ) : (
                    <span className="text-sm text-brand-main/45 dark:text-dark-text/45">-</span>
                )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-brand-main/45 dark:text-dark-text/45">Offre :</span>
                {item.targetOffer ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-brand-light dark:bg-dark-bg text-brand-main dark:text-dark-text border-brand-border dark:border-dark-sec-border">
                        {item.targetOffer}
                    </span>
                ) : (
                    <span className="text-sm text-brand-main/45 dark:text-dark-text/45">-</span>
                )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-brand-main/45 dark:text-dark-text/45">Plateformes :</span>
                {item.platforms.length > 0 ? (
                    <div className="flex gap-1 flex-wrap">
                        {item.platforms.map((platform) => (
                            <span key={platform} className="text-[10px] px-1.5 py-0.5 bg-white dark:bg-dark-surface rounded-sm border border-brand-border dark:border-dark-sec-border text-brand-main dark:text-dark-text">
                                {platform}
                            </span>
                        ))}
                    </div>
                ) : (
                    <span className="text-sm text-brand-main/45 dark:text-dark-text/45">-</span>
                )}
            </div>
        </div>
    );

    return (
        <div className="flex-1 overflow-y-auto bg-brand-light dark:bg-dark-bg p-4 md:p-8">
            <div className={`w-full ${usesWorkedLayout ? 'max-w-6xl' : 'max-w-4xl'} mx-auto flex flex-col gap-6`}>

                {/* ── Header avec badges + actions ── */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                            <Eye className="w-4 h-4 text-brand-main/40 dark:text-dark-text/40" />
                            <h3 className="text-xs font-bold text-brand-main/40 dark:text-dark-text/40 uppercase tracking-wider">Aperçu</h3>
                        </div>
                        {!usesWorkedLayout && item.targetFormat && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800">
                                {item.targetFormat}
                            </span>
                        )}
                        {!usesWorkedLayout && item.targetOffer && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-brand-light dark:bg-dark-bg text-brand-main dark:text-dark-text border-brand-border dark:border-dark-sec-border">
                                <Target className="w-2.5 h-2.5 inline mr-1" />{item.targetOffer}
                            </span>
                        )}
                        {!usesWorkedLayout && item.depth && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${DEPTH_COLORS[item.depth] || ''}`}>
                                <Zap className="w-2.5 h-2.5 inline mr-1" />{item.depth}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {item.status === ContentStatus.READY && (
                            <PublishButton onPublish={(date) => onChangeStatus(ContentStatus.PUBLISHED, date)} currentDate={item.scheduledDate} />
                        )}
                        {item.status === ContentStatus.READY && (
                            <button
                                onClick={() => onChangeStatus(ContentStatus.DRAFTING)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-main/60 hover:text-brand-main dark:text-dark-text/60 dark:hover:text-white bg-white dark:bg-dark-surface hover:bg-brand-light dark:hover:bg-dark-bg rounded-lg border border-brand-border dark:border-dark-sec-border transition-colors"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Retour brouillon
                            </button>
                        )}
                        {item.status === ContentStatus.PUBLISHED && (
                            <span className="flex items-center gap-1.5 text-xs font-bold text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30 px-3 py-1.5 rounded-full border border-green-200 dark:border-green-800">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Publié
                            </span>
                        )}
                    </div>
                </div>

                {isReelShort && (
                    <>
                        <FinalMetaHeader />

                        <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border shadow-md ring-1 ring-amber-500/20 overflow-hidden flex flex-col">
                            <div className="bg-brand-light dark:bg-dark-bg px-4 py-2.5 border-b border-brand-border dark:border-dark-sec-border flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase flex items-center gap-2">
                                        <Video className="w-3 h-3" /> Script
                                    </p>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                {item.scriptVideo ? (
                                    <ScriptVideoRenderer raw={item.scriptVideo} variant="table" />
                                ) : (
                                    <div className="p-8 text-center text-brand-main/40 dark:text-dark-text/40 italic">
                                        Pas de script disponible.
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}

                {isPostCourt && (
                    <>
                        <FinalMetaHeader />

                        <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border shadow-md ring-1 ring-emerald-500/20 overflow-hidden flex flex-col min-h-[200px]">
                            <div className="bg-brand-light dark:bg-dark-bg px-4 py-2.5 border-b border-brand-border dark:border-dark-sec-border flex items-center justify-between">
                                <p className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase flex items-center gap-2">
                                    <Copy className="w-3 h-3" /> Copie
                                </p>
                            </div>

                            <div className={`flex-1 overflow-y-auto custom-scrollbar p-6 grid gap-6 ${(dzinePrompt || suggestedVisual) ? 'xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]' : 'grid-cols-1'}`}>
                                <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border overflow-hidden">
                                    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg">
                                        <span className="inline-flex items-center rounded-full bg-violet-600 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white">
                                            Texte à copier
                                        </span>
                                        <button
                                            onClick={handleCopy}
                                            disabled={!postCourtText}
                                            className={`flex items-center gap-1.5 text-[10px] font-medium px-3 py-1.5 rounded border shadow-xs transition-colors disabled:opacity-40 ${
                                                copied
                                                    ? 'bg-emerald-600 text-white border-emerald-700'
                                                    : 'bg-white dark:bg-emerald-900/30 hover:bg-emerald-50 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                            }`}
                                        >
                                            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                            {copied ? 'Copié !' : 'Copier'}
                                        </button>
                                    </div>
                                    <div className="p-6">
                                        {postCourtText ? (
                                            <div className="text-sm select-text">
                                                {renderPostCourt(postCourtText)}
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center text-center gap-3 opacity-50 py-8">
                                                <Copy className="w-8 h-8" />
                                                <p className="text-sm">Aucune copie finale disponible.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {(dzinePrompt || suggestedVisual) && (
                                    <div className="space-y-4">
                                        {dzinePrompt && (
                                            <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-900/10 p-5">
                                                <div className="flex items-center justify-between gap-4">
                                                    <div>
                                                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                                                            Prompt Dzine
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={handleDzineCopy}
                                                        disabled={!dzinePrompt}
                                                        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                                                            copiedDzine
                                                                ? 'border-emerald-700 bg-emerald-600 text-white'
                                                                : 'border-amber-300 bg-white text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/30'
                                                        }`}
                                                    >
                                                        {copiedDzine ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                                        {copiedDzine ? 'Copié' : 'Copier'}
                                                    </button>
                                                </div>
                                                <div className="mt-4 rounded-xl border border-amber-100 dark:border-amber-900/30 bg-white/80 dark:bg-dark-surface/50 p-4">
                                                    <p className="font-sans text-[13px] leading-[1.6] text-brand-main dark:text-dark-text whitespace-pre-wrap select-text">
                                                        {dzinePrompt}
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {suggestedVisual && (
                                            <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border overflow-hidden">
                                                <div className="bg-amber-50 dark:bg-amber-900/10 px-4 py-2.5 border-b border-amber-200 dark:border-amber-900/50 flex items-center gap-2">
                                                    <p className="text-xs font-bold text-amber-700 dark:text-amber-300 uppercase flex items-center gap-2">
                                                        <FileText className="w-3 h-3" /> Visuel suggéré
                                                    </p>
                                                </div>
                                                <div className="p-6">
                                                    <p className="text-sm leading-relaxed text-brand-main dark:text-dark-text whitespace-pre-wrap">
                                                        {suggestedVisual}
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}

                {isCarrousel && (
                    <>
                        <FinalMetaHeader />

                        <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border shadow-md ring-1 ring-violet-500/20 overflow-hidden flex flex-col flex-1 min-h-[500px]">
                            <div className="bg-brand-light dark:bg-dark-bg px-4 py-2.5 border-b border-brand-border dark:border-dark-sec-border flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase flex items-center gap-2">
                                        <Images className="w-3 h-3" /> Slides
                                    </p>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                {item.slides ? (
                                    <SlidesRenderer slidesRaw={item.slides} />
                                ) : (
                                    <div className="p-8 text-center text-brand-main/40 dark:text-dark-text/40 italic">
                                        Pas de slides disponibles.
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}

                {!usesWorkedLayout && (
                    <div className="bg-white dark:bg-dark-surface shadow-xl border border-brand-border dark:border-dark-sec-border rounded-xl overflow-hidden">
                        {hasBody ? (
                            isVideoFormat
                                ? <ScriptVideoRenderer raw={item.scriptVideo!} />
                                : <BodyRenderer body={item.body!} />
                        ) : (
                            <div className="p-8 text-center text-brand-main/40 dark:text-dark-text/40 italic">
                                Pas de contenu rédigé.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
