import React, { useState, useMemo, useEffect } from 'react';
import { MessageSquare, User, Cpu, Zap, DollarSign, Send } from 'lucide-react';
import { ContextItem, AIModel, ContextUsage } from '../types';
import { INTERNAL_MODELS } from '../ai/config';
import { useEscapeClose } from './hooks/useEscapeClose';

interface AIConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (contextId: string, modelId: string) => void;
    contexts: ContextItem[];
    aiModels: AIModel[];
    actionType: 'interview' | 'draft' | 'analyze' | 'carrousel';
    onManageContexts: () => void;
    /** Labels résumant les données qui seront envoyées à l'IA */
    dataSummary?: string[];
}

export const AIConfigModal: React.FC<AIConfigModalProps> = ({
    isOpen, onClose, onConfirm, contexts, aiModels, actionType, onManageContexts, dataSummary
}) => {
    const [selectedContextId, setSelectedContextId] = useState<string>("");
    const [selectedModel, setSelectedModel] = useState<string>(INTERNAL_MODELS.FAST);

    const requiredUsage: ContextUsage = useMemo(() => {
        if (actionType === 'analyze') return ContextUsage.ANALYSTE;
        if (actionType === 'interview') return ContextUsage.INTERVIEWER;
        if (actionType === 'carrousel') return ContextUsage.ARTISTE;
        return ContextUsage.REDACTEUR;
    }, [actionType]);

    const filteredContexts = useMemo(() => {
        return contexts.filter(ctx => ctx.usage === requiredUsage);
    }, [contexts, requiredUsage]);

    // Initialisation par défaut
    useEffect(() => {
        if (!isOpen) return;
        if (filteredContexts.length === 0) {
            setSelectedContextId("");
            return;
        }
        const stillValid = filteredContexts.some(ctx => ctx.id === selectedContextId);
        if (!selectedContextId || !stillValid) {
            setSelectedContextId(filteredContexts[0].id);
        }
    }, [isOpen, filteredContexts, selectedContextId]);

    useEscapeClose(isOpen, onClose);

    // Groupement des modèles (Logique extraite)
    const groupedModels = useMemo(() => {
        const internalModel = { 
            id: 'internal-fast', 
            name: 'Gemini Flash', 
            apiCode: INTERNAL_MODELS.FAST, 
            provider: 'Google (Interne)', 
            cost: 'low', 
            isInternal: true
        };

        const all = [internalModel, ...aiModels];
        const groups: Record<string, typeof all> = {};
        
        all.forEach(m => {
            const p = m.provider ? m.provider.trim() : 'Autres';
            if (!groups[p]) groups[p] = [];
            groups[p].push(m);
        });
        
        return groups;
    }, [aiModels]);

    const getCostIndicator = (cost?: string) => {
        const c = cost ? cost.toLowerCase() : 'medium';
        let level = 2;
        if (c.includes('low') || c.includes('faible')) level = 1;
        if (c.includes('low_medium')) level = 1.5;
        if (c.includes('high') || c.includes('elevé')) level = 3;
        if (c.includes('very_high') || c.includes('très')) level = 4;

        if (level <= 1) return <span className="text-green-500 text-[10px] font-bold flex gap-0.5 items-center bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded"><DollarSign className="w-3 h-3"/> Eco</span>;
        if (level <= 1.5) return <span className="text-teal-500 text-[10px] font-bold flex gap-0.5 items-center"><DollarSign className="w-3 h-3"/>+</span>;
        if (level === 2) return <span className="text-yellow-600 dark:text-yellow-400 text-[10px] font-bold flex gap-0.5 items-center"><DollarSign className="w-3 h-3"/><DollarSign className="w-3 h-3"/></span>;
        if (level === 3) return <span className="text-orange-500 text-[10px] font-bold flex gap-0.5 items-center"><DollarSign className="w-3 h-3"/><DollarSign className="w-3 h-3"/><DollarSign className="w-3 h-3"/></span>;
        return <span className="text-red-500 text-[10px] font-bold flex gap-0.5 items-center bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded"><DollarSign className="w-3 h-3"/><DollarSign className="w-3 h-3"/><DollarSign className="w-3 h-3"/><DollarSign className="w-3 h-3"/></span>;
    };

    if (!isOpen) return null;

    const getTitle = () => {
        switch(actionType) {
            case 'interview': return "Configuration de l'Interview";
            case 'draft': return "Configuration de la Rédaction";
            case 'analyze': return "Configuration de l'Analyse";
            case 'carrousel': return "Configuration des Slides Carrousel";
            default: return "Configuration IA";
        }
    };

    return (
        <div className="fixed inset-0 z-[80] bg-white/90 dark:bg-dark-surface/90 flex items-center justify-center animate-in fade-in zoom-in duration-200 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-dark-bg rounded-xl shadow-2xl border border-brand-border dark:border-dark-sec-border w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                
                {/* HEADER */}
                <div className="p-6 border-b border-brand-border dark:border-dark-sec-border bg-brand-light/50 dark:bg-dark-bg/50 space-y-3">
                    <div>
                        <h3 className="text-xl font-bold text-brand-main dark:text-white flex items-center gap-3">
                            <MessageSquare className="w-6 h-6" />
                            {getTitle()}
                        </h3>
                        <p className="text-sm text-brand-main/60 dark:text-dark-text/60 mt-1">Sélectionnez le persona et le moteur d'intelligence artificielle.</p>
                    </div>
                    {dataSummary && dataSummary.length > 0 && (
                        <div className="flex items-start gap-2 bg-white dark:bg-dark-surface rounded-lg border border-brand-border dark:border-dark-sec-border px-4 py-2.5">
                            <Send className="w-3.5 h-3.5 text-brand-main/40 dark:text-dark-text/40 mt-0.5 flex-shrink-0" />
                            <div className="flex flex-wrap gap-1.5">
                                <span className="text-[10px] font-bold text-brand-main/40 dark:text-dark-text/40 uppercase mr-1 self-center">Données envoyées :</span>
                                {dataSummary.map((label, i) => (
                                    <span key={i} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-brand-light dark:bg-dark-bg text-brand-main/70 dark:text-dark-text/70 border border-brand-border dark:border-dark-sec-border">
                                        {label}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* BODY */}
                <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-brand-border dark:divide-dark-sec-border">
                    
                    {/* LEFT: CONTEXTS */}
                    <div className="flex flex-col h-full overflow-hidden">
                        <div className="p-4 bg-gray-50 dark:bg-dark-surface border-b border-brand-border dark:border-dark-sec-border">
                            <h4 className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-widest flex items-center gap-2">
                                <User className="w-4 h-4" /> Choisir un Persona
                            </h4>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                            {filteredContexts.map(ctx => (
                                <div 
                                    key={ctx.id}
                                    onClick={() => setSelectedContextId(ctx.id)}
                                    className={`
                                        p-4 rounded-xl cursor-pointer transition-all border
                                        ${selectedContextId === ctx.id 
                                            ? 'bg-brand-main text-white border-brand-main shadow-md transform scale-[1.02]' 
                                            : 'bg-white dark:bg-dark-surface border-brand-border dark:border-dark-sec-border text-brand-main dark:text-white hover:bg-brand-light dark:hover:bg-dark-sec-bg'}
                                    `}
                                >
                                    <div className="font-bold text-sm mb-1">{ctx.name}</div>
                                    <div className={`text-xs line-clamp-2 ${selectedContextId === ctx.id ? 'text-white/80' : 'text-brand-main/60 dark:text-dark-text/60'}`}>
                                        {ctx.description}
                                    </div>
                                </div>
                            ))}
                            {filteredContexts.length === 0 && (
                                <div className="text-center py-10 text-brand-main/40 dark:text-dark-text/40 text-sm">
                                    Aucun persona pour cet usage.
                                    <br/>
                                    <button onClick={() => { onClose(); onManageContexts(); }} className="text-brand-main underline mt-2">Créer un persona</button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* RIGHT: MODELS */}
                    <div className="flex flex-col h-full overflow-hidden bg-brand-light/30 dark:bg-dark-bg/30">
                        <div className="p-4 bg-gray-50 dark:bg-dark-surface border-b border-brand-border dark:border-dark-sec-border">
                            <h4 className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-widest flex items-center gap-2">
                                <Cpu className="w-4 h-4" /> Choisir un Modèle IA
                            </h4>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                            {Object.entries(groupedModels).map(([provider, models]) => (
                                <div key={provider}>
                                    <div className="text-[10px] font-bold text-brand-main/40 dark:text-dark-text/40 uppercase mb-2 ml-1">{provider}</div>
                                    <div className="space-y-2">
                                        {models.map((model: any) => (
                                            <div 
                                                key={model.apiCode}
                                                onClick={() => setSelectedModel(model.apiCode || "")}
                                                className={`
                                                    flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all border
                                                    ${selectedModel === model.apiCode
                                                        ? 'bg-white dark:bg-dark-surface border-brand-main shadow-sm ring-1 ring-brand-main'
                                                        : 'bg-white/50 dark:bg-dark-surface/50 border-transparent hover:bg-white dark:hover:bg-dark-surface'}
                                                `}
                                            >
                                                <div className="flex items-center gap-3">
                                                    {model.isInternal ? <Zap className="w-4 h-4 text-yellow-500 fill-yellow-500" /> : <div className="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-700"></div>}
                                                    <div>
                                                        <div className="text-sm font-semibold text-brand-main dark:text-white">{model.name}</div>
                                                        {model.isInternal && <span className="text-[10px] bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 px-1.5 py-0.5 rounded">Recommandé</span>}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    {getCostIndicator(model.cost)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* FOOTER */}
                <div className="p-4 border-t border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface flex justify-end gap-3">
                    <button 
                        onClick={onClose} 
                        className="px-6 py-2.5 text-sm font-medium text-brand-main dark:text-dark-text hover:bg-brand-light dark:hover:bg-dark-sec-bg rounded-lg transition-colors"
                    >
                        Annuler
                    </button>
                    <button 
                        onClick={() => onConfirm(selectedContextId, selectedModel)}
                        disabled={!selectedContextId} 
                        className="px-8 py-2.5 text-sm font-bold bg-brand-main text-white rounded-lg hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-brand-main/20 transition-all hover:-translate-y-0.5"
                    >
                        Valider & Lancer
                    </button>
                </div>
            </div>
        </div>
    );
};
