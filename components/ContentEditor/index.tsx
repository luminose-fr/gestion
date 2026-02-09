import React, { useState, useEffect } from 'react';
import { Loader2, Trash2, Save } from 'lucide-react';
import { ContentItem, ContentStatus, ContextItem, AIModel, Verdict, TargetFormat, isTargetFormat } from '../../types';
import { STATUS_COLORS } from '../../constants';
import * as GeminiService from '../../services/geminiService';
import * as OneMinService from '../../services/oneMinService';
import { AlertModal, ConfirmModal } from '../CommonModals';
import { AI_ACTIONS, INTERNAL_MODELS, isOneMinModel } from '../../ai/config';
import { AIConfigModal } from '../AIConfigModal';

// Sub-components
import { EditorLayout } from './EditorLayout';
import { DraftView } from './DraftView';
import { PreviewView } from './PreviewView';

export type EditorStep = 'idea' | 'interview' | 'content';

interface ContentEditorProps {
  item: ContentItem | null;
  contexts: ContextItem[];
  aiModels: AIModel[];
  onClose: () => void;
  onSave: (item: ContentItem) => Promise<void>;
  onDelete?: (item: ContentItem) => Promise<void>;
  onManageContexts: () => void;
  // Navigation Props
  activeStep: EditorStep;
  onStepChange: (step: EditorStep) => void;
}

const extractJsonPayload = (responseText: string): string => {
    if (!responseText) return "";
    let cleaned = responseText.replace(/```json\s?/g, '').replace(/```\s?/g, '').trim();
    cleaned = cleaned.replace(/^json\s*/i, '').trim();

    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
    return cleaned;
};

const formatDraftContent = (format: TargetFormat, data: any): string => {
    const text = (value: any) => typeof value === 'string' ? value.trim() : "";
    const out: string[] = [];

    switch (format) {
        case TargetFormat.POST_TEXTE_COURT: {
            const hook = text(data.hook);
            const corps = text(data.corps);
            const baffe = text(data.baffe);
            const cta = text(data.cta);
            if (hook) out.push(`**Hook**\n${hook}`);
            if (corps) out.push(`**Corps**\n${corps}`);
            if (baffe) out.push(`**Baffe**\n${baffe}`);
            if (cta) out.push(`**CTA**\n${cta}`);
            return out.join("\n\n");
        }
        case TargetFormat.ARTICLE_LONG_SEO: {
            const titre = text(data.titre_h1);
            const intro = text(data.introduction);
            if (titre) out.push(`# ${titre}`);
            if (intro) out.push(intro);
            const sections = Array.isArray(data.sections) ? data.sections : [];
            sections.forEach((section: any) => {
                const h2 = text(section?.sous_titre_h2 || section?.titre || section?.point);
                const contenu = text(section?.contenu);
                if (h2) out.push(`## ${h2}`);
                if (contenu) out.push(contenu);
            });
            const conclusion = text(data.conclusion);
            if (conclusion) out.push(`## Conclusion\n${conclusion}`);
            const cta = text(data.cta);
            if (cta) out.push(`**CTA**\n${cta}`);
            return out.join("\n\n");
        }
        case TargetFormat.SCRIPT_VIDEO_REEL_SHORT: {
            const contrainte = text(data.contrainte);
            const hook = text(data.hook);
            const corps = text(data.corps);
            const cta = text(data.cta);
            if (contrainte) out.push(`**Contrainte**\n${contrainte}`);
            if (hook) out.push(`**Hook**\n${hook}`);
            if (corps) out.push(`**Corps**\n${corps}`);
            if (cta) out.push(`**CTA**\n${cta}`);
            return out.join("\n\n");
        }
        case TargetFormat.SCRIPT_VIDEO_YOUTUBE: {
            const intro = text(data.intro);
            if (intro) out.push(`**Intro**\n${intro}`);
            const dev = Array.isArray(data.developpement) ? data.developpement : [];
            dev.forEach((section: any, idx: number) => {
                const point = text(section?.point) || `Point ${idx + 1}`;
                const contenu = text(section?.contenu);
                out.push(`**${point}**`);
                if (contenu) out.push(contenu);
            });
            const conclusion = text(data.conclusion);
            if (conclusion) out.push(`**Conclusion**\n${conclusion}`);
            return out.join("\n\n");
        }
        case TargetFormat.CARROUSEL_SLIDE: {
            const slides = Array.isArray(data.slides) ? data.slides : [];
            slides.forEach((slide: any, idx: number) => {
                const numero = slide?.numero ?? idx + 1;
                const titre = text(slide?.titre);
                const texte = text(slide?.texte);
                const visuel = text(slide?.visuel);
                const header = titre ? `### Slide ${numero} — ${titre}` : `### Slide ${numero}`;
                out.push(header);
                if (texte) out.push(texte);
                if (visuel) out.push(`*Visuel :* ${visuel}`);
            });
            const finale = data.slide_finale || {};
            const finalTitre = text(finale.titre);
            const finalTexte = text(finale.texte);
            if (finalTitre || finalTexte) {
                out.push(`### Slide finale${finalTitre ? ` — ${finalTitre}` : ""}`);
                if (finalTexte) out.push(finalTexte);
            }
            return out.join("\n\n");
        }
        case TargetFormat.PROMPT_IMAGE: {
            const prompt = text(data.prompt);
            const legende = text(data.legende);
            if (prompt) out.push(`**Prompt (EN)**\n${prompt}`);
            if (legende) out.push(`**Légende**\n${legende}`);
            return out.join("\n\n");
        }
        default:
            return "";
    }
};

const parseDraftResponse = (responseText: string): string => {
    const cleaned = extractJsonPayload(responseText);
    if (!cleaned) throw new Error("Réponse IA vide ou invalide.");

    let data: any;
    try {
        data = JSON.parse(cleaned);
    } catch (e) {
        throw new Error("La réponse IA n'est pas un JSON valide.");
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error("Format de réponse invalide (objet JSON attendu).");
    }

    const formatValue = data.format;
    if (!isTargetFormat(formatValue)) {
        throw new Error("Format de sortie invalide. Vérifie la valeur du champ 'format'.");
    }

    const formatted = formatDraftContent(formatValue, data);
    if (!formatted) {
        throw new Error("Impossible de formater la réponse IA.");
    }
    return formatted;
};

const parseAIResponse = (responseText: string, key: string): string => {
    if (!responseText) return "";
    let cleaned = responseText.replace(/```json\s?/g, '').replace(/```\s?/g, '').trim();
    try {
        const data = JSON.parse(cleaned);
        if (key === 'ROOT') {
            if (typeof data === 'string') return data;
            return JSON.stringify(data, null, 2);
        }
        if (data[key]) {
            if (typeof data[key] === 'object') return JSON.stringify(data[key]);
            return String(data[key]);
        }
        if (Array.isArray(data) && key === 'ROOT') return JSON.stringify(data);
        
    } catch (e) {
        const regex = new RegExp(`"${key}"\\s*:\\s*"([\\s\\S]*?)"\\s*[,}]`);
        const match = cleaned.match(regex);
        if (match && match[1]) {
            return match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        }
    }
    return cleaned;
};

const ContentEditor: React.FC<ContentEditorProps> = ({ 
    item, contexts, aiModels = [], onClose, onSave, onDelete, onManageContexts,
    activeStep, onStepChange
}) => {
  const [editedItem, setEditedItem] = useState<ContentItem | null>(null);
  
  // Status Flags
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  
  // Navigation & AI State
  const [showContextSelector, setShowContextSelector] = useState(false);
  const [pendingContextAction, setPendingContextAction] = useState<'interview' | 'draft' | 'analyze' | null>(null);

  const [alertInfo, setAlertInfo] = useState<{ isOpen: boolean, title: string, message: string, type: 'error' | 'success' | 'info' }>({
      isOpen: false, title: '', message: '', type: 'info'
  });

  // Sync internal state & Smart Redirect Logic
  useEffect(() => {
    if (item) {
        if (!editedItem || item.id !== editedItem.id) {
            setEditedItem({ ...item });
            setIsGenerating(false);
            setShowContextSelector(false);

            if (activeStep === 'idea') {
                if (item.body && item.body.trim().length > 0) {
                    onStepChange('content');
                } else if (item.interviewAnswers && item.interviewAnswers.length > 0) {
                    onStepChange('interview');
                }
            }
        } else {
            setEditedItem(prev => prev ? { ...prev, ...item } : item);
        }
    }
  }, [item, activeStep]); 

  if (!editedItem) return null;

  // --- ACTIONS ---

  const handleManualSave = async () => {
      if (isSaving || !editedItem) return;
      setIsSaving(true);
      await onSave(editedItem);
      setIsSaving(false);
  };

  const changeStatus = async (newStatus: ContentStatus) => {
      if (isSaving || !editedItem) return;
      setIsSaving(true);
      const newItem = { ...editedItem, status: newStatus };
      setEditedItem(newItem);
      await onSave(newItem);
      setIsSaving(false);
  };

  const handleDelete = async () => {
      if (onDelete && editedItem) {
          await onDelete(editedItem);
      }
      onClose(); 
  };

  // --- AI LOGIC HELPERS ---

  const callAI = async (model: string, systemInstruction: string, prompt: string, config: any) => {
      if (isOneMinModel(model, aiModels)) {
          return await OneMinService.generateContent({
              model: model,
              systemInstruction: systemInstruction,
              prompt: prompt
          });
      } else {
          return await GeminiService.generateContent({
              model: model,
              systemInstruction: systemInstruction,
              prompt: prompt,
              generationConfig: config
          });
      }
  };

  const handleContextConfirm = async (contextId: string, modelId: string) => {
      setShowContextSelector(false);
      if (pendingContextAction === 'interview') await executeInterview(contextId, modelId);
      else if (pendingContextAction === 'draft') await executeDrafting(contextId, modelId);
  };

  // --- AI ACTIONS EXECUTORS ---

  const executeInterview = async (contextId: string, modelId: string) => {
      setIsGenerating(true);
      try {
          const contextItem = contexts.find(c => c.id === contextId);
          const actionConfig = AI_ACTIONS.GENERATE_INTERVIEW;
          const systemInstruction = actionConfig.getSystemInstruction(contextItem?.description || "Journaliste.");

          const promptPayload = [{
              titre: editedItem?.title,
              notes: editedItem?.notes,
              angle_strategique: editedItem?.strategicAngle || "",
              plateformes: editedItem?.platforms
          }];

          const responseText = await callAI(modelId, systemInstruction, JSON.stringify(promptPayload), actionConfig.generationConfig);
          
          const cleanedJson = responseText.replace(/```json\s?/g, '').replace(/```\s?/g, '').trim();
          let formattedQuestions = "";
          try {
              const data = JSON.parse(cleanedJson);
              const qList = data.questions_interieures;
              if (Array.isArray(qList)) {
                  formattedQuestions = qList.map((block: any) => {
                      const questions = Array.isArray(block.questions) ? block.questions.map((q: string) => `- ${q}`).join('\n') : `- ${block.questions}`;
                      return `**Angle : ${block.angle || "Angle"}**\n${questions}`;
                  }).join('\n\n');
              } else {
                  formattedQuestions = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
              }
          } catch (e) { formattedQuestions = cleanedJson; }

          const contextName = contextItem?.name || "Contexte par défaut";
          const modelName = aiModels.find(m => m.apiCode === modelId)?.name || (modelId === INTERNAL_MODELS.FAST ? "Gemini Flash" : modelId);
          const signature = `\n\n_Généré par : ${modelName} - ${contextName} - le ${new Date().toLocaleString('fr-FR')}_`;

          const newItem = { ...editedItem!, interviewQuestions: formattedQuestions + signature };
          setEditedItem(newItem);
          await onSave(newItem);
      } catch (error: any) {
          setAlertInfo({ isOpen: true, title: "Erreur IA", message: error.message, type: "error" });
      } finally {
          setIsGenerating(false);
          setPendingContextAction(null);
      }
  };

  const executeDrafting = async (contextId: string, modelId: string) => {
      setIsGenerating(true);
      try {
          const contextItem = contexts.find(c => c.id === contextId) || contexts[0];
          const actionConfig = AI_ACTIONS.DRAFT_CONTENT;
          const systemInstruction = actionConfig.getSystemInstruction(
              contextItem?.description || "Rédacteur."
          );

          const promptPayload = {
              titre: editedItem?.title || "Non défini",
              format_cible: editedItem?.targetFormat || "Non défini",
              cible_offre: editedItem?.targetOffer || "Non défini",
              angle_strategique: editedItem?.strategicAngle || "Non défini",
              metaphore_suggeree: editedItem?.suggestedMetaphor || "Non défini",
              reponses_interview: editedItem?.interviewAnswers || "Non défini"
          };

          const responseText = await callAI(modelId, systemInstruction, JSON.stringify(promptPayload), actionConfig.generationConfig);
          const finalContent = parseDraftResponse(responseText);

          const contextName = contextItem?.name || "Contexte par défaut";
          const modelName = aiModels.find(m => m.apiCode === modelId)?.name || (modelId === INTERNAL_MODELS.FAST ? "Gemini Flash" : modelId);
          const signature = `\n\n_Généré par : ${modelName} - ${contextName} - le ${new Date().toLocaleString('fr-FR')}_`;

          const newItem = { ...editedItem!, body: finalContent + signature };
          setEditedItem(newItem);
          await onSave(newItem);
          onStepChange('content'); 
      } catch (error: any) {
          setAlertInfo({ isOpen: true, title: "Erreur Rédaction", message: error.message, type: "error" });
      } finally {
          setIsGenerating(false);
          setPendingContextAction(null);
      }
  };

  // --- TRIGGER HANDLERS ---

  const triggerInterview = () => {
      setPendingContextAction('interview');
      setShowContextSelector(true);
  };

  const triggerDrafting = () => {
      if (!editedItem?.interviewAnswers) {
          setAlertInfo({ isOpen: true, title: "Réponses manquantes", message: "Veuillez répondre aux questions.", type: "error" });
          return;
      }
      setPendingContextAction('draft');
      setShowContextSelector(true);
  };

  // --- UI HELPERS ---

  const getVerdictColor = (verdict?: Verdict) => {
      switch (verdict) {
          case Verdict.VALID: return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800';
          case Verdict.TOO_BLAND: return 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800';
          case Verdict.NEEDS_WORK: return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800';
          default: return 'bg-gray-100 text-gray-600 border-gray-200';
      }
  };

  const Header = (
      <div className="flex flex-col md:flex-row items-start md:items-center gap-4 flex-1">
          {editedItem.status === ContentStatus.DRAFTING ? (
              <input 
                  type="text" 
                  value={editedItem.title}
                  onChange={(e) => setEditedItem({...editedItem, title: e.target.value})}
                  className="text-lg md:text-xl font-bold text-brand-main dark:text-white bg-transparent outline-none w-full md:max-w-2xl"
                  placeholder="Titre..."
              />
          ) : (
              <h2 className="text-lg md:text-xl font-bold text-brand-main dark:text-white flex items-center gap-2 truncate">
                  <span className="truncate">{editedItem.title}</span>
              </h2>
          )}
          <div className="flex items-center gap-2 md:ml-auto">
              {editedItem.verdict && (
                  <div className={`hidden md:block px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-wider ${getVerdictColor(editedItem.verdict)}`}>
                      {editedItem.verdict}
                  </div>
              )}
              <div className={`hidden md:block px-3 py-1 rounded-full border text-sm font-medium ${STATUS_COLORS[editedItem.status]}`}>
                  {editedItem.status}
              </div>
          </div>
      </div>
  );

  const getFooterContent = () => {
      return (
          <>
                <button onClick={() => setConfirmDelete(true)} className="text-red-500 p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 text-sm font-medium mr-auto">
                    <Trash2 className="w-4 h-4" /> Supprimer
                </button>
                <button 
                    onClick={handleManualSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-2 text-brand-main dark:text-dark-text hover:bg-brand-light dark:hover:bg-dark-bg rounded-lg transition-colors font-medium text-sm"
                >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Enregistrer
                </button>
          </>
      );
  };

  return (
      <>
        <EditorLayout onClose={onClose} headerContent={Header} footerContent={getFooterContent()}>
            {editedItem.status === ContentStatus.DRAFTING && (
                <DraftView 
                    item={editedItem}
                    onChange={setEditedItem}
                    onLaunchInterview={triggerInterview}
                    onLaunchDrafting={triggerDrafting}
                    onChangeStatus={changeStatus}
                    isGenerating={isGenerating}
                    activeTab={activeStep}
                    onTabChange={onStepChange}
                />
            )}

            {(editedItem.status === ContentStatus.READY || editedItem.status === ContentStatus.PUBLISHED) && (
                <PreviewView 
                    item={editedItem}
                    onChangeStatus={changeStatus}
                />
            )}
        </EditorLayout>

        <AlertModal 
            isOpen={alertInfo.isOpen} 
            onClose={() => setAlertInfo({ ...alertInfo, isOpen: false })}
            title={alertInfo.title}
            message={alertInfo.message}
            type={alertInfo.type}
        />
        
        <ConfirmModal 
            isOpen={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            onConfirm={handleDelete}
            title="Supprimer ?"
            message="Action irréversible (archive Notion)."
            isDestructive={true}
            confirmLabel="Supprimer"
        />

        <AIConfigModal 
            isOpen={showContextSelector}
            onClose={() => setShowContextSelector(false)}
            onConfirm={handleContextConfirm}
            contexts={contexts}
            aiModels={aiModels}
            actionType={pendingContextAction || 'draft'}
            onManageContexts={onManageContexts}
        />
      </>
  );
};

export default ContentEditor;
