import React from 'react';
import { Eye, RotateCcw, CheckCircle2, Pencil } from 'lucide-react';
import { ContentItem, ContentStatus, TargetFormat } from '../../types';
import { bodyJsonToText } from './index';

interface PreviewViewProps {
    item: ContentItem;
    onChangeStatus: (status: ContentStatus) => Promise<void>;
}

export const PreviewView: React.FC<PreviewViewProps> = ({ item, onChangeStatus }) => {
    const renderBody = (body: string) => {
        const text = bodyJsonToText(body);
        if (!text) return <span className="italic opacity-50">Pas de contenu rédigé.</span>;

        // Texte brut / édition manuelle → rendu direct
        try {
            const lastBrace = body.lastIndexOf('}');
            const cleaned = lastBrace !== -1 ? body.slice(0, lastBrace + 1) : body;
            JSON.parse(cleaned);
        } catch {
            return <span className="whitespace-pre-wrap">{body}</span>;
        }

        return <span className="whitespace-pre-wrap leading-relaxed">{text}</span>;
    };

    return (
        <div className="flex-1 overflow-y-auto bg-brand-light dark:bg-dark-bg p-4 md:p-8 flex justify-center">
            <div className="w-full max-w-4xl flex flex-col gap-8">
                
                {/* Aperçu du contenu */}
                <div className="flex-1 bg-white dark:bg-dark-surface shadow-xl border border-brand-border dark:border-dark-sec-border rounded-xl p-6 md:p-8 space-y-6">
                    <div className="flex items-center justify-between gap-2 mb-6 border-b border-brand-border dark:border-dark-sec-border pb-4">
                        <div className="flex items-center gap-2">
                             <Eye className="w-5 h-5 text-brand-main/50 dark:text-dark-text/50" />
                             <h3 className="text-sm font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider">Aperçu Publication</h3>
                        </div>
                        
                        {/* Status Actions */}
                        <div className="flex items-center gap-2">
                            {item.status === ContentStatus.READY && (
                                <>
                                    <button 
                                        onClick={() => onChangeStatus(ContentStatus.DRAFTING)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-main/60 hover:text-brand-main dark:text-dark-text/60 dark:hover:text-white bg-brand-light dark:bg-dark-bg hover:bg-brand-border/50 dark:hover:bg-dark-sec-border/50 rounded-lg transition-colors"
                                    >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                        Retour brouillon
                                    </button>
                                    <button 
                                        onClick={() => onChangeStatus(ContentStatus.PUBLISHED)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-sm transition-colors"
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

                    <div className="prose dark:prose-invert max-w-none leading-relaxed text-lg">
                        {(item.targetFormat === TargetFormat.SCRIPT_VIDEO_REEL_SHORT || item.targetFormat === TargetFormat.SCRIPT_VIDEO_YOUTUBE)
                            ? renderBody(item.scriptVideo || item.body)
                            : renderBody(item.body)
                        }
                    </div>
                </div>
            </div>
        </div>
    );
};