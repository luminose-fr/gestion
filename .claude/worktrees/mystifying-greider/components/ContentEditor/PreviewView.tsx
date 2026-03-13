import React, { useState } from 'react';
import { Eye, RotateCcw, CheckCircle2, Target, Zap, Images, Copy, Check, FileText } from 'lucide-react';
import { ContentItem, ContentStatus, TargetFormat } from '../../types';
import { BodyRenderer } from './renderers/BodyRenderer';
import { ScriptVideoRenderer } from './renderers/ScriptVideoRenderer';
import { SlidesRenderer } from './renderers/SlidesRenderer';
import { DEPTH_COLORS, buildPostCourtText } from './renderers/shared';

interface PreviewViewProps {
    item: ContentItem;
    onChangeStatus: (status: ContentStatus) => Promise<void>;
}

export const PreviewView: React.FC<PreviewViewProps> = ({ item, onChangeStatus }) => {

    const isVideoFormat = item.targetFormat === TargetFormat.SCRIPT_VIDEO_REEL_SHORT
        || item.targetFormat === TargetFormat.SCRIPT_VIDEO_YOUTUBE;
    const isCarrousel = item.targetFormat === TargetFormat.CARROUSEL_SLIDE;
    const isPostCourt = item.targetFormat === TargetFormat.POST_TEXTE_COURT;
    const hasBody = isVideoFormat ? !!item.scriptVideo : !!item.body;

    const [copied, setCopied] = useState(false);
    const postCourtText = isPostCourt ? buildPostCourtText(item.body || "") : "";

    const handleCopy = () => {
        navigator.clipboard.writeText(postCourtText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex-1 overflow-y-auto bg-brand-light dark:bg-dark-bg p-4 md:p-8">
            <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">

                {/* ── Header avec badges + actions ── */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                            <Eye className="w-4 h-4 text-brand-main/40 dark:text-dark-text/40" />
                            <h3 className="text-xs font-bold text-brand-main/40 dark:text-dark-text/40 uppercase tracking-wider">Aperçu</h3>
                        </div>
                        {item.targetFormat && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800">
                                {item.targetFormat}
                            </span>
                        )}
                        {item.targetOffer && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-brand-light dark:bg-dark-bg text-brand-main dark:text-dark-text border-brand-border dark:border-dark-sec-border">
                                <Target className="w-2.5 h-2.5 inline mr-1" />{item.targetOffer}
                            </span>
                        )}
                        {item.depth && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${DEPTH_COLORS[item.depth] || ''}`}>
                                <Zap className="w-2.5 h-2.5 inline mr-1" />{item.depth}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {item.status === ContentStatus.READY && (
                            <>
                                <button
                                    onClick={() => onChangeStatus(ContentStatus.DRAFTING)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-main/60 hover:text-brand-main dark:text-dark-text/60 dark:hover:text-white bg-white dark:bg-dark-surface hover:bg-brand-light dark:hover:bg-dark-bg rounded-lg border border-brand-border dark:border-dark-sec-border transition-colors"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    Retour brouillon
                                </button>
                                <button
                                    onClick={() => onChangeStatus(ContentStatus.PUBLISHED)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-xs transition-colors"
                                >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Marquer publié
                                </button>
                            </>
                        )}
                        {item.status === ContentStatus.PUBLISHED && (
                            <span className="flex items-center gap-1.5 text-xs font-bold text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30 px-3 py-1.5 rounded-full border border-green-200 dark:border-green-800">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Publié
                            </span>
                        )}
                    </div>
                </div>

                {/* ── Contenu principal — même renderers que le Brouillon ── */}
                <div className="bg-white dark:bg-dark-surface shadow-xl border border-brand-border dark:border-dark-sec-border rounded-xl overflow-hidden">
                    {isPostCourt && hasBody && (
                        <div className="bg-brand-light dark:bg-dark-bg px-4 py-2.5 border-b border-brand-border dark:border-dark-sec-border flex items-center gap-2">
                            <FileText className="w-3 h-3 text-brand-main/40 dark:text-dark-text/40" />
                            <p className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase">Brouillon structuré</p>
                        </div>
                    )}
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

                {/* ── Texte prêt à copier (Post Court uniquement) ── */}
                {isPostCourt && postCourtText && (
                    <div className="bg-white dark:bg-dark-surface shadow-xl border border-brand-border dark:border-dark-sec-border rounded-xl ring-1 ring-emerald-500/20 overflow-hidden">
                        <div className="bg-emerald-50 dark:bg-emerald-900/10 px-4 py-2.5 border-b border-emerald-200 dark:border-emerald-900/50 flex items-center justify-between">
                            <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase flex items-center gap-2">
                                <Copy className="w-3 h-3" /> Texte prêt à copier
                            </p>
                            <button
                                onClick={handleCopy}
                                className={`flex items-center gap-1.5 text-[10px] font-medium px-3 py-1.5 rounded border shadow-xs transition-colors ${
                                    copied
                                        ? 'bg-emerald-600 text-white border-emerald-700'
                                        : 'bg-white dark:bg-emerald-900/30 hover:bg-emerald-50 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                }`}
                            >
                                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                {copied ? 'Copié !' : 'Copier'}
                            </button>
                        </div>
                        <div className="p-8 max-w-2xl mx-auto w-full">
                            <div className="text-sm select-text">
                                {postCourtText.split('\n\n').map((paragraph, pi) => (
                                    <p key={pi} className={`leading-relaxed text-brand-main dark:text-dark-text ${pi > 0 ? 'mt-4' : ''}`}>
                                        {paragraph}
                                    </p>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Slides DA (pour les carrousels) ── */}
                {isCarrousel && item.slides && (
                    <div className="bg-white dark:bg-dark-surface shadow-xl border border-brand-border dark:border-dark-sec-border rounded-xl overflow-hidden">
                        <div className="bg-brand-light dark:bg-dark-bg px-4 py-2.5 border-b border-brand-border dark:border-dark-sec-border flex items-center gap-2">
                            <Images className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                            <span className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase">Direction artistique</span>
                        </div>
                        <SlidesRenderer slidesRaw={item.slides} />
                    </div>
                )}
            </div>
        </div>
    );
};
