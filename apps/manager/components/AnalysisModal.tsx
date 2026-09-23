import React, { useState, useRef, useEffect } from 'react';
import { X, Sparkles, Brain, AlertCircle, Cpu } from 'lucide-react';
import { ContentItem, Verdict, Platform, AIModel, isObjectif, isProfondeur } from '../types';
import * as AiService from '../services/aiService';
import { AI_ACTIONS } from '@luminose/editorial';
import * as Api from '../services/apiService';
import type { UsageIA } from '@luminose/shared';
import { useEscapeClose } from './hooks/useEscapeClose';
import { Patience } from './Feedback';
import { Bouton, Etiquette, TitreSection } from './ui';

interface AnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemsToAnalyze: ContentItem[];
  aiModels: AIModel[];
  selectedModelId: string;
  onAnalysisComplete: () => void;
}

/** Objet renvoyé par le Stratège — cf. OUTPUT_RULES.ANALYZE_BATCH */
interface AnalysisResult {
  id: string;
  verdict: Verdict;
  angle_strategique?: string;
  /** Ancien nom du champ, encore accepté en lecture */
  angle?: string;
  plateformes: string[];
  justification?: string;
  objectif?: string;
  metaphore_suggeree?: string | null;
  titre?: string;
  profondeur?: string;
}

/**
 * La part d'un appel groupé qui revient à une idée.
 *
 * L'analyse en lot est le seul endroit où un appel produit plusieurs lignes de
 * journal. Sans partage, additionner les coûts par contenu donnerait N fois la
 * facture du lot — un total faux d'un facteur N, et faux dans le sens qui
 * inquiète.
 */
export const partager = (usage: UsageIA, parts: number) => {
    const n = Math.max(1, parts);
    const diviser = (v: number | null) => (v === null ? null : v / n);
    return {
        promptTokens: usage.entree === null ? null : Math.round(usage.entree / n),
        completionTokens: usage.sortie === null ? null : Math.round(usage.sortie / n),
        costUsd: diviser(usage.coutUsd),
    };
};

const AnalysisModal: React.FC<AnalysisModalProps> = ({
  isOpen,
  onClose,
  itemsToAnalyze,
  aiModels,
  selectedModelId,
  onAnalysisComplete
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState<string>("");
  /**
   * L'analyse en lot est la SEULE opération de l'application qui sache où elle
   * en est : un appel au modèle, puis une écriture par idée. Sa barre porte donc
   * un vrai chiffre, là où les autres ne peuvent qu'estimer.
   */
  const [part, setPart] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Garde-fou : évite les setState sur composant démonté pendant l'analyse async
  const isMountedRef = useRef(true);
  useEffect(() => {
      isMountedRef.current = true;
      return () => { isMountedRef.current = false; };
  }, []);

  useEscapeClose(isOpen, onClose, isAnalyzing);

  if (!isOpen) return null;

  const modelName = aiModels.find(m => m.id === selectedModelId)?.name || selectedModelId;

  const handleStartAnalysis = async () => {
    if (!isMountedRef.current) return;
    setIsAnalyzing(true);
    setError(null);
    setPart(null);
    setProgress("Préparation des données…");

    try {
      // 1. Préparation du System Prompt
      const actionConfig = AI_ACTIONS.ANALYZE_BATCH;
      const systemInstruction = actionConfig.getSystemInstruction();

      // 2. Préparation du User Prompt
      const contentPayload = itemsToAnalyze.map(item => ({
        id: item.id,
        titre: item.title,
        notes: item.notes,
        format_cible: item.targetFormat || "Non précisé",
      }));
      
      // Pendant l'appel au modèle, la barre BALAIE : on ne sait rien de son
      // avancement, et l'immobiliser à 8 % pour tout le temps long de l'opération
      // aurait été pire que de l'avouer. Elle se remplit ensuite, à l'écriture,
      // où l'on compte vraiment. Le bandeau du haut, lui, donne l'estimation.
      if (isMountedRef.current) setProgress(`Interrogation de l'IA (${modelName})…`);

      // 3. Appel API 1min.AI
      const { text: responseText, usage } = await AiService.generateContent({
          modelId: selectedModelId,
          systemInstruction: systemInstruction,
          prompt: JSON.stringify(contentPayload),
          action: 'Analyse des idées',
          aiAction: 'ANALYZE_BATCH',
      });

      if (isMountedRef.current) { setPart(0.5); setProgress("Traitement des réponses…"); }

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

      // 5. Enregistrement
      if (isMountedRef.current) setProgress(`Enregistrement (0/${results.length})…`);

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

          // Le format cible est choisi par l'utilisateur et ne doit pas être écrasé par l'IA
          const objectif = isObjectif(res.objectif) ? res.objectif : undefined;
          const justification = typeof res.justification === 'string' ? res.justification : undefined;
          const suggestedMetaphor = typeof res.metaphore_suggeree === 'string' ? res.metaphore_suggeree : undefined;
          const suggestedTitle = typeof res.titre === 'string' ? res.titre : undefined;
          const depth = isProfondeur(res.profondeur) ? res.profondeur : undefined;

          const rawAngle = (res.angle_strategique ?? res.angle ?? "");
          const angleWithTitle = suggestedTitle
            ? `**Titre suggéré :** ${suggestedTitle}\n\n${rawAngle}`
            : rawAngle;

          const updatedItem: ContentItem = {
            ...originalItem,
            // Le titre initial n'est PAS remplacé — le titre suggéré est visible dans le bloc Analyse IA
            verdict: res.verdict,
            // Plus de signature collée derrière le texte (SPEC §2.6).
            strategicAngle: angleWithTitle,
            platforms: mappedPlatforms.length > 0 ? mappedPlatforms : originalItem.platforms,
            // targetFormat non modifié : contrôlé par l'utilisateur dans IdeaModal
            objectif: objectif || originalItem.objectif,
            justification: justification ?? originalItem.justification,
            suggestedMetaphor: suggestedMetaphor ?? originalItem.suggestedMetaphor,
            depth: depth ?? originalItem.depth,
            analyzedAt: Date.now(),
          };

          await Api.updateContent(updatedItem.id, updatedItem);
          // Une ligne de journal par idée analysée : la provenance sort de la
          // charge utile, elle ne disparaît pas avec elle (SPEC §2.6).
          await Api.recordGeneration(updatedItem.id, {
              kind: 'analysis', modelId: selectedModelId, modelLabel: modelName, payload: JSON.stringify(res),
              // UN appel a servi N idées : son coût se DIVISE entre elles, sinon
              // chacune porterait la facture du lot et le total serait faux N fois.
              ...partager(usage, results.length),
          }).catch(e => console.warn('Analyse non journalisée :', e));
          updateCount++;
          if (isMountedRef.current) {
              setPart(0.5 + 0.5 * (updateCount / Math.max(1, results.length)));
              setProgress(`Enregistrement (${updateCount}/${results.length})…`);
          }
        }
      }

      if (updateCount === 0) {
        throw new Error(`Aucune idée n'a pu être mise à jour. L'IA a renvoyé ${results.length} résultats mais aucun n'a pu être associé aux idées d'origine.`);
      }

      if (isMountedRef.current) {
        setPart(1);
        setProgress(`Terminé ! ${updateCount}/${results.length} idées mises à jour.`);
        onAnalysisComplete();
        onClose();
      }
    } catch (err: any) {
      console.error(err);
      // Un échec d'appel est déjà annoncé une fois, en haut : le répéter ici en
      // ferait deux présentations pour un seul fait.
      if (isMountedRef.current && !AiService.estSignalee(err)) {
          setError(err.message || "Une erreur est survenue pendant l'analyse.");
      }
    } finally {
      if (isMountedRef.current) setIsAnalyzing(false);
    }
  };

  return (
    <div 
        className="fixed inset-0 z-60 flex items-center justify-center bg-brand-main/20 dark:bg-black/50 backdrop-blur-xs p-4 animate-fade-in"
        onClick={isAnalyzing ? undefined : onClose}
    >
      <div 
        className="bg-white dark:bg-dark-surface w-full max-w-lg rounded-xl shadow-lg border border-brand-border dark:border-dark-sec-border flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-brand-border dark:border-dark-sec-border bg-brand-light/30 dark:bg-dark-bg/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="bg-brand-light dark:bg-dark-bg p-2 rounded-lg text-brand-main dark:text-dark-text">
                    <Brain className="w-6 h-6" />
                </div>
                <TitreSection as="h3" titre="Analyse IA en lot" sousTitre="Optimisez vos idées automatiquement" />
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

                    <div className="grid grid-cols-1 gap-4">
                        <div className="p-3 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-sec-border rounded-lg">
                            <Etiquette as="div" avecIcone className="mb-1">
                                <Cpu className="w-3 h-3" /> Modèle
                            </Etiquette>
                            <div className="text-sm font-semibold text-brand-main dark:text-white truncate" title={modelName}>
                                {modelName}
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-erreur text-sm bg-erreur/10 p-3 rounded-lg">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            {error}
                        </div>
                    )}
                </>
            ) : (
                <Patience
                    titre={itemsToAnalyze.length > 1
                        ? `Analyse de ${itemsToAnalyze.length} idées`
                        : "Analyse d'une idée"}
                    detail={progress}
                    part={part}
                />
            )}
        </div>

        {/* Footer */}
        {!isAnalyzing && (
            <div className="p-6 border-t border-brand-border dark:border-dark-sec-border flex justify-end gap-3 bg-brand-light/30 dark:bg-dark-bg/30">
                <Bouton
                    onClick={onClose}
                    intention="discrete">
                    Annuler
                </Bouton>
                <Bouton
                    onClick={handleStartAnalysis}
                    intention="principale" posee>
                    <Sparkles className="w-4 h-4" />
                    Confirmer & Lancer
                </Bouton>
            </div>
        )}
      </div>
    </div>
  );
};

export default AnalysisModal;
