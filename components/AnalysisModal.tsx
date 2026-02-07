import React, { useState } from 'react';
import { X, Sparkles, Brain, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { ContentItem, ContextItem, Verdict, Platform } from '../types';
import * as GeminiService from '../services/geminiService';
import * as NotionService from '../services/notionService';
import { AI_ACTIONS } from '../ai/config';

interface AnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemsToAnalyze: ContentItem[];
  contexts: ContextItem[];
  onAnalysisComplete: () => void;
}

interface AnalysisResult {
  id: string;
  verdict: Verdict;
  angle: string;
  plateformes: string[];
}

const AnalysisModal: React.FC<AnalysisModalProps> = ({ 
  isOpen, 
  onClose, 
  itemsToAnalyze, 
  contexts,
  onAnalysisComplete
}) => {
  const [selectedContextId, setSelectedContextId] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleStartAnalysis = async () => {
    if (!selectedContextId) {
      setError("Veuillez sélectionner un contexte IA.");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setProgress("Préparation des données...");

    try {
      // 1. Préparation du System Prompt via la config centralisée
      const actionConfig = AI_ACTIONS.ANALYZE_BATCH;
      
      const selectedContext = contexts.find(c => c.id === selectedContextId);
      const contextDesc = selectedContext ? selectedContext.description : "Analyse marketing standard.";
      
      const systemInstruction = actionConfig.getSystemInstruction(contextDesc);

      // 2. Préparation du User Prompt (JSON des idées)
      const contentPayload = itemsToAnalyze.map(item => ({
        id: item.id,
        titre: item.title,
        notes: item.notes
      }));
      
      setProgress("Interrogation de Gemini...");
      
      // 3. Appel API Gemini
      const responseText = await GeminiService.generateContent({
        model: actionConfig.model,
        systemInstruction: systemInstruction,
        prompt: JSON.stringify(contentPayload),
        generationConfig: actionConfig.generationConfig
      });

      setProgress("Traitement des réponses...");

      // 4. Parsing de la réponse
      let results: AnalysisResult[] = [];
      try {
        results = JSON.parse(responseText);
      } catch (e) {
        console.error("Erreur parsing JSON Gemini:", responseText);
        throw new Error("L'IA a renvoyé un format invalide.");
      }

      // 5. Mise à jour de Notion (Séquentiel pour éviter de surcharger le rate limit si besoin, ou Promise.all)
      setProgress(`Mise à jour de Notion (0/${results.length})...`);
      
      let updateCount = 0;
      for (const res of results) {
        const originalItem = itemsToAnalyze.find(i => i.id === res.id);
        if (originalItem) {
          // Mapping des plateformes strings vers l'enum Platform
          const mappedPlatforms: Platform[] = res.plateformes
            .map(p => p as Platform)
            .filter(p => Object.values(Platform).includes(p));

          const updatedItem: ContentItem = {
            ...originalItem,
            verdict: res.verdict,
            strategicAngle: res.angle,
            platforms: mappedPlatforms.length > 0 ? mappedPlatforms : originalItem.platforms,
            analyzed: true,
          };

          await NotionService.updateContent(updatedItem);
          updateCount++;
          setProgress(`Mise à jour de Notion (${updateCount}/${results.length})...`);
        }
      }

      setProgress("Terminé !");
      onAnalysisComplete(); // Rafraichir les données dans App
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
                            Ces idées seront envoyées à Gemini pour évaluation, suggestion d'angle stratégique et choix des plateformes.
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-brand-main dark:text-white mb-2">
                            Choisir le Contexte (Persona)
                        </label>
                        <select 
                            value={selectedContextId}
                            onChange={(e) => setSelectedContextId(e.target.value)}
                            className="w-full p-3 rounded-lg border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface text-brand-main dark:text-white outline-none focus:ring-2 focus:ring-brand-main dark:focus:ring-brand-light transition-shadow"
                        >
                            <option value="">-- Sélectionner --</option>
                            {contexts.map(ctx => (
                                <option key={ctx.id} value={ctx.id}>{ctx.name}</option>
                            ))}
                        </select>
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
                    disabled={!selectedContextId || itemsToAnalyze.length === 0}
                    className="flex items-center gap-2 px-6 py-2 bg-brand-main hover:bg-brand-hover dark:bg-brand-light dark:text-brand-hover dark:hover:bg-white text-white rounded-lg font-medium shadow-lg shadow-brand-main/20 dark:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Sparkles className="w-4 h-4" />
                    Lancer l'analyse
                </button>
            </div>
        )}
      </div>
    </div>
  );
};

export default AnalysisModal;