import React, { useState, useRef, useEffect } from 'react';
import { Eye, RotateCcw, CheckCircle2, Target, Zap, Images, Copy, Check, FileText, Video, Calendar, Layers } from 'lucide-react';
import { ContentItem, ContentStatus, TargetFormat } from '../../types';
import { BodyRenderer } from './renderers/BodyRenderer';
import { ScriptVideoRenderer } from './renderers/ScriptVideoRenderer';
import { SlidesRenderer } from './renderers/SlidesRenderer';
import { DEPTH_COLORS, buildPostCourtText, copyTextToClipboard, getPostCourtDzinePrompt, getPostCourtSuggestedVisual } from './renderers/shared';
import { Bouton, Champ, Etiquette } from '../ui';

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
            <Bouton
                onClick={() => setOpen(!open)}
                taille="petit" intention="principale" ton="succes" posee>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Marquer publié
            </Bouton>
            {open && (
                <div className="absolute right-0 top-full mt-2 z-50 bg-white dark:bg-dark-bg rounded-xl border border-brand-border dark:border-dark-sec-border shadow-lg p-4 space-y-3 min-w-[220px]">
                    <label className="text-xs font-semibold text-brand-main/60 dark:text-dark-text/60 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        Date de publication
                    </label>
                    <Champ
                        type="date"
                        value={date}
                        onChange={e => setDate(e.target.value)}
                    />
                    <Bouton
                        onClick={() => { onPublish(date); setOpen(false); }}
                        className="w-full" taille="petit" intention="principale" ton="succes">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Confirmer
                    </Bouton>
                </div>
            )}
        </div>
    );
};

interface PreviewViewProps {
    item: ContentItem;
    onChangeStatus: (status: ContentStatus, scheduledDate?: string) => Promise<void>;
    /** Ouvre une série dont ce contenu est le pilier (SPEC §6.3). */
    onDecline?: () => void;
}

export const PreviewView: React.FC<PreviewViewProps> = ({ item, onChangeStatus, onDecline }) => {

    const isReelShort = item.targetFormat === TargetFormat.SCRIPT_VIDEO_REEL_SHORT;
    const isVideoFormat = item.targetFormat === TargetFormat.SCRIPT_VIDEO_REEL_SHORT
        || item.targetFormat === TargetFormat.SCRIPT_VIDEO_YOUTUBE;
    const isCarrousel = item.targetFormat === TargetFormat.CARROUSEL_SLIDE;
    const isPostCourt = item.targetFormat === TargetFormat.POST_TEXTE_COURT;
    const usesWorkedLayout = isPostCourt || isCarrousel || isReelShort;
    const hasBody = isVideoFormat ? !!item.draft : !!item.draft;

    const [copied, setCopied] = useState(false);
    const [copiedDzine, setCopiedDzine] = useState(false);
    const postCourtText = isPostCourt ? buildPostCourtText(item.draft || "") : "";
    const dzinePrompt = isPostCourt ? getPostCourtDzinePrompt(item.draft || "") : "";
    const suggestedVisual = isPostCourt ? getPostCourtSuggestedVisual(item.draft || "") : "";

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
                    <span className="text-micro font-semibold px-2 py-0.5 rounded-full bg-brand-light dark:bg-dark-bg text-brand-main dark:text-dark-text border border-brand-border dark:border-dark-sec-border">
                        {item.targetFormat}
                    </span>
                ) : (
                    <span className="text-sm text-brand-main/45 dark:text-dark-text/45">-</span>
                )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-brand-main/45 dark:text-dark-text/45">Objectif :</span>
                {item.objectif ? (
                    <span className="text-micro font-bold px-2 py-0.5 rounded-full border bg-brand-light dark:bg-dark-bg text-brand-main dark:text-dark-text border-brand-border dark:border-dark-sec-border">
                        {item.objectif}
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
                            <span key={platform} className="text-micro px-1.5 py-0.5 bg-white dark:bg-dark-surface rounded-md border border-brand-border dark:border-dark-sec-border text-brand-main dark:text-dark-text">
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
        <div className="flex-1 overflow-y-auto bg-brand-light dark:bg-dark-bg px-4 md:px-6 py-5">
            <div className={`w-full ${usesWorkedLayout ? 'max-w-6xl' : 'max-w-3xl'} mx-auto flex flex-col gap-6`}>

                {/* ── Header avec badges + actions ── */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                            <Eye className="w-4 h-4 text-brand-main/40 dark:text-dark-text/40" />
                            <Etiquette as="h3">Aperçu</Etiquette>
                        </div>
                        {!usesWorkedLayout && item.targetFormat && (
                            <span className="text-micro font-semibold px-2 py-0.5 rounded-full bg-brand-light dark:bg-dark-bg text-brand-main dark:text-dark-text border border-brand-border dark:border-dark-sec-border">
                                {item.targetFormat}
                            </span>
                        )}
                        {!usesWorkedLayout && item.objectif && (
                            <span className="text-micro font-bold px-2 py-0.5 rounded-full border bg-brand-light dark:bg-dark-bg text-brand-main dark:text-dark-text border-brand-border dark:border-dark-sec-border">
                                <Target className="w-2.5 h-2.5 inline mr-1" />{item.objectif}
                            </span>
                        )}
                        {!usesWorkedLayout && item.depth && (
                            <span className={`px-1.5 py-0.5 rounded-full text-micro font-semibold border ${DEPTH_COLORS[item.depth] || ''}`}>
                                <Zap className="w-2.5 h-2.5 inline mr-1" />{item.depth}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Décliner : la seconde porte d'entrée des séries — celle qui
                            part d'un contenu existant plutôt que d'un thème (SPEC §6.3). */}
                        {onDecline && (
                            <Bouton
                                onClick={onDecline}
                                title="Créer une série dont ce contenu est le pilier"
                                taille="petit">
                                <Layers className="w-3.5 h-3.5" />
                                Décliner
                            </Bouton>
                        )}
                        {item.status === ContentStatus.READY && (
                            <PublishButton onPublish={(date) => onChangeStatus(ContentStatus.PUBLISHED, date)} currentDate={item.scheduledDate} />
                        )}
                        {item.status === ContentStatus.READY && (
                            <Bouton
                                onClick={() => onChangeStatus(ContentStatus.DRAFTING)}
                                taille="petit">
                                <RotateCcw className="w-3.5 h-3.5" />
                                Retour brouillon
                            </Bouton>
                        )}
                        {item.status === ContentStatus.PUBLISHED && (
                            <span className="flex items-center gap-1.5 text-xs font-bold text-succes bg-succes/10 px-3 py-1.5 rounded-full border border-succes/30">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Publié
                            </span>
                        )}
                    </div>
                </div>

                {isReelShort && (
                    <>
                        <FinalMetaHeader />

                        <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border shadow-xs overflow-hidden flex flex-col">
                            <div className="bg-brand-light dark:bg-dark-bg px-4 py-2 border-b border-brand-border dark:border-dark-sec-border flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Etiquette forme="entete" avecIcone>
                                        <Video className="w-3 h-3" /> Script
                                    </Etiquette>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                {item.draft ? (
                                    <ScriptVideoRenderer raw={item.draft} variant="table" />
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

                        <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border shadow-xs overflow-hidden flex flex-col min-h-[200px]">
                            <div className="bg-brand-light dark:bg-dark-bg px-4 py-2 border-b border-brand-border dark:border-dark-sec-border flex items-center justify-between">
                                <Etiquette forme="entete" avecIcone>
                                    <Copy className="w-3 h-3" /> Copie
                                </Etiquette>
                            </div>

                            <div className={`flex-1 overflow-y-auto custom-scrollbar p-6 grid gap-6 ${(dzinePrompt || suggestedVisual) ? 'xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]' : 'grid-cols-1'}`}>
                                <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border overflow-hidden">
                                    <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg">
                                        <Etiquette as="span" forme="entete">
                                            Texte à copier
                                        </Etiquette>
                                        <Bouton taille="petit" intention={copied ? 'principale' : 'secondaire'} ton={copied ? 'succes' : 'neutre'}
                                onClick={handleCopy}
                                disabled={!postCourtText}
                            >
                                            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                            {copied ? 'Copié !' : 'Copier'}
                                        </Bouton>
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
                                            <div className="rounded-xl border border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg p-5">
                                                <div className="flex items-center justify-between gap-4">
                                                    <div>
                                                        <Etiquette forme="entete">
                                                            Prompt Dzine
                                                        </Etiquette>
                                                    </div>
                                                    <Bouton taille="petit" intention={copiedDzine ? 'principale' : 'secondaire'} ton={copiedDzine ? 'succes' : 'neutre'}
                                onClick={handleDzineCopy}
                                disabled={!dzinePrompt}
                            >
                                                        {copiedDzine ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                                        {copiedDzine ? 'Copié' : 'Copier'}
                                                    </Bouton>
                                                </div>
                                                <div className="mt-4 rounded-xl border border-brand-border dark:border-dark-sec-border bg-white/80 dark:bg-dark-surface/50 p-4">
                                                    <p className="font-sans text-sm leading-[1.6] text-brand-main dark:text-dark-text whitespace-pre-wrap select-text">
                                                        {dzinePrompt}
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {suggestedVisual && (
                                            <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border overflow-hidden">
                                                <div className="bg-brand-light dark:bg-dark-bg px-4 py-2 border-b border-brand-border dark:border-dark-sec-border flex items-center gap-2">
                                                    <Etiquette forme="entete" avecIcone>
                                                        <FileText className="w-3 h-3" /> Visuel suggéré
                                                    </Etiquette>
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

                        <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border shadow-xs overflow-hidden flex flex-col flex-1 min-h-[500px]">
                            <div className="bg-brand-light dark:bg-dark-bg px-4 py-2 border-b border-brand-border dark:border-dark-sec-border flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Etiquette forme="entete" avecIcone>
                                        <Images className="w-3 h-3" /> Slides
                                    </Etiquette>
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
                    <div className="bg-white dark:bg-dark-surface shadow-lg border border-brand-border dark:border-dark-sec-border rounded-xl overflow-hidden">
                        {hasBody ? (
                            isVideoFormat
                                ? <ScriptVideoRenderer raw={item.draft!} />
                                : <BodyRenderer body={item.draft!} datePublication={item.scheduledDate} />
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
