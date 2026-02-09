import React, { useState } from 'react';
import { X, Sparkles, Brain, AlertCircle, Loader2, Cpu, User } from 'lucide-react';
import { ContentItem, ContextItem, Verdict, Platform, AIModel, isTargetFormat } from '../types';
import * as GeminiService from '../services/geminiService';
import * as OneMinService from '../services/oneMinService';
import * as NotionService from '../services/notionService';
import { AI_ACTIONS, isOneMinModel } from '../ai/config';
import { useEscapeClose } from './hooks/useEscapeClose';

interface AnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemsToAnalyze: ContentItem[];
  contexts: ContextItem[];
  aiModels: AIModel[];
  selectedContextId: string;
  selectedModelId: string;
  onAnalysisComplete: () => void;
}

interface AnalysisResult {
  id: string;
  verdict: Verdict;
  angle: string;
  plateformes: string[];
  format_cible?: string;
  format_suggere?: string;
}

const AnalysisModal: React.FC<AnalysisModalProps> = ({ 
  isOpen, 
  onClose, 
  itemsToAnalyze, 
  contexts,
  aiModels,
  selectedContextId,
  selectedModelId,
  onAnalysisComplete
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEscapeClose(isOpen, onClose, isAnalyzing);

  if (!isOpen) return null;

  const contextName = contexts.find(c => c.id === selectedContextId)?.name || "Contexte par défaut";
  const modelName = aiModels.find(m => m.apiCode === selectedModelId)?.name || selectedModelId;

  const handleStartAnalysis = async () => {
    setIsAnalyzing(true);
    setError(null);
    setProgress("Préparation des données...");

    try {
      // 1. Préparation du System Prompt
      const actionConfig = AI_ACTIONS.ANALYZE_BATCH;
      const selectedContext = contexts.find(c => c.id === selectedContextId);
      const contextDesc = selectedContext ? selectedContext.description : "Analyse marketing standard.";
      
      const systemInstruction = actionConfig.getSystemInstruction(contextDesc);

      // 2. Préparation du User Prompt
      const contentPayload = itemsToAnalyze.map(item => ({
        id: item.id,
        titre: item.title,
        notes: item.notes
      }));
      
      setProgress(`Interrogation de l'IA (${modelName})...`);
      
      // 3. Appel API (Gemini ou 1min.AI)
      let responseText = "";
      
      if (isOneMinModel(selectedModelId, aiModels)) {
          responseText = await OneMinService.generateContent({
              model: selectedModelId,
              systemInstruction: systemInstruction,
              prompt: JSON.stringify(contentPayload)
          });
      } else {
          responseText = await GeminiService.generateContent({
              model: selectedModelId,
              systemInstruction: systemInstruction,
              prompt: JSON.stringify(contentPayload),
              generationConfig: actionConfig.generationConfig
          });
      }

      setProgress("Traitement des réponses...");

      // 4. Parsing de la réponse
      let results: AnalysisResult[] = [];
      try {
        // Nettoyage markdown json
        const cleaned = responseText.replace(/```json\s?/g, '').replace(/```\s?/g, '').trim();
        results = JSON.parse(cleaned);
      } catch (e) {
        console.error("Erreur parsing JSON IA:", responseText);
        throw new Error("L'IA a renvoyé un format invalide.");
      }

      // 5. Mise à jour de Notion
      setProgress(`Mise à jour de Notion (0/${results.length})...`);

      const signature = `\n\n_Généré par : ${modelName} - ${contextName} - le ${new Date().toLocaleString('fr-FR')}_`;

      let updateCount = 0;
      for (let idx = 0; idx < results.length; idx++) {
        const res = results[idx];
        // Match par id si disponible, sinon fallback par index (l'IA renvoie dans le même ordre)
        const originalItem = res.id
            ? itemsToAnalyze.find(i => i.id === res.id)
            : itemsToAnalyze[idx];
        if (originalItem) {
          const rawPlatforms = Array.isArray(res.plateformes) ? res.plateformes : [];
          const mappedPlatforms: Platform[] = rawPlatforms
            .map(p => p as Platform)
            .filter(p => Object.values(Platform).includes(p));

          const rawFormat = res.format_cible ?? res.format_suggere;
          const targetFormat = isTargetFormat(rawFormat) ? rawFormat : undefined;

          const updatedItem: ContentItem = {
            ...originalItem,
            verdict: res.verdict,
            strategicAngle: res.angle + signature,
            platforms: mappedPlatforms.length > 0 ? mappedPlatforms : originalItem.platforms,
            targetFormat,
            analyzed: true,
          };

          await NotionService.updateContent(updatedItem);
          updateCount++;
          setProgress(`Mise à jour de Notion (${updateCount}/${results.length})...`);
        }
      }

      if (updateCount === 0) {
        throw new Error(`Aucune idée n'a pu être mise à jour. L'IA a renvoyé ${results.length} résultats mais aucun n'a pu être associé aux idées d'origine.`);
      }

      setProgress(`Terminé ! ${updateCount}/${results.length} idées mises à jour.`);
      onAnalysisComplete();
      onClose();

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Une erreur est survenue pendant l'analyse.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div 
        className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-main/20 dark:bg-black/50 backdrop-blur-sm p-4 animate-fade-in"
        onClick={isAnalyzing ? undefined : onClose}
    >
      <div 
        className="bg-white dark:bg-dark-surface w-full max-w-lg rounded-xl shadow-2xl border border-brand-border dark:border-dark-sec-border flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-brand-border dark:border-dark-sec-border bg-brand-light/30 dark:bg-dark-bg/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-lg text-purple-600 dark:text-purple-300">
                    <Brain className="w-6 h-6" />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-brand-main dark:text-white">Analyse IA en lot</h3>
                    <p className="text-xs text-brand-main/60 dark:text-dark-text/60">Optimisez vos idées automatiquement</p>
                </div>
            </div>
            {!isAnalyzing && (
                <button onClick={onClose} className="text-brand-main/50 hover:text-brand-main dark:text-dark-text/50 dark:hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                </button>
            )}
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
            {!isAnalyzing ? (
                <>
                    <div className="bg-brand-light dark:bg-dark-bg p-4 rounded-lg border border-brand-border dark:border-dark-sec-border">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-semibold text-brand-main dark:text-white">Idées à analyser</span>
                            <span className="bg-brand-main text-white text-xs px-2 py-0.5 rounded-full font-bold">{itemsToAnalyze.length}</span>
                        </div>
                        <p className="text-xs text-brand-main/60 dark:text-dark-text/60">
                            Ces idées seront envoyées à l'IA pour évaluation, suggestion d'angle stratégique et choix des plateformes.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-sec-border rounded-lg">
                            <div className="flex items-center gap-2 mb-1 text-brand-main/50 dark:text-dark-text/50 text-[10px] uppercase font-bold">
                                <User className="w-3 h-3" /> Persona
                            </div>
                            <div className="text-sm font-semibold text-brand-main dark:text-white truncate" title={contextName}>
                                {contextName}
                            </div>
                        </div>
                        <div className="p-3 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-sec-border rounded-lg">
                            <div className="flex items-center gap-2 mb-1 text-brand-main/50 dark:text-dark-text/50 text-[10px] uppercase font-bold">
                                <Cpu className="w-3 h-3" /> Modèle
                            </div>
                            <div className="text-sm font-semibold text-brand-main dark:text-white truncate" title={modelName}>
                                {modelName}
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}
                </>
            ) : (
                <div className="py-8 flex flex-col items-center justify-center text-center">
                    <Loader2 className="w-12 h-12 text-brand-main dark:text-brand-light animate-spin mb-4" />
                    <h4 className="text-lg font-semibold text-brand-main dark:text-white mb-2">Analyse en cours...</h4>
                    <p className="text-brand-main/60 dark:text-dark-text/60 text-sm animate-pulse">{progress}</p>
                </div>
            )}
        </div>

        {/* Footer */}
        {!isAnalyzing && (
            <div className="p-6 border-t border-brand-border dark:border-dark-sec-border flex justify-end gap-3 bg-brand-light/30 dark:bg-dark-bg/30">
                <button 
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-brand-main dark:text-dark-text hover:bg-brand-border/50 dark:hover:bg-dark-sec-border/50 rounded-lg transition-colors"
                >
                    Annuler
                </button>
                <button 
                    onClick={handleStartAnalysis}
                    className="flex items-center gap-2 px-6 py-2 bg-brand-main hover:bg-brand-hover dark:bg-brand-light dark:text-brand-hover dark:hover:bg-white text-white rounded-lg font-medium shadow-lg shadow-brand-main/20 dark:shadow-none transition-all hover:-translate-y-0.5"
                >
                    <Sparkles className="w-4 h-4" />
                    Confirmer & Lancer
                </button>
            </div>
        )}
      </div>
    </div>
  );
};

export default AnalysisModal;
