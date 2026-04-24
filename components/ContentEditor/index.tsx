import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Trash2, Save, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { ContentItem, ContentStatus, ContextItem, AIModel, Verdict, TargetFormat, Profondeur, CoachSession } from '../../types';
import { STATUS_COLORS } from '../../constants';
import * as GeminiService from '../../services/geminiService';
import * as OneMinService from '../../services/oneMinService';
import { AlertModal, ConfirmModal } from '../CommonModals';
import { AI_ACTIONS, INTERNAL_MODELS, isOneMinModel } from '../../ai/actions';
import { bodyJsonToText } from '../../ai/formats';
import { parseDraftResponse, parseAIResponse, sanitizeSlidesResponse } from '../../ai/executors';
import { AIConfigModal } from '../AIConfigModal';
import { CoachChat } from '../CoachChat';

// Sub-components
import { EditorLayout } from './EditorLayout';
import { DraftView } from './DraftView';
import { PreviewView } from './PreviewView';

export type EditorStep = 'idea' | 'atelier' | 'slides' | 'postcourt' | 'script';

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
  /** Action à déclencher automatiquement à l'ouverture (ex: 'interview' après "Travailler cette idée"). */
  initialAction?: 'interview' | null;
  /** Appelé une fois l'action initiale consommée, pour éviter qu'elle ne se rejoue. */
  onInitialActionConsumed?: () => void;
}

// extractJsonPayload, parseDraftResponse, parseAIResponse → ai/executors.ts

// bodyJsonToText est maintenant centralisé dans ai/formats.ts
// Ré-exporté ici pour backward compat avec les anciens imports
export { bodyJsonToText } from '../../ai/formats';

// parseAIResponse → ai/executors.ts

const ContentEditor: React.FC<ContentEditorProps> = ({
    item, contexts, aiModels = [], onClose, onSave, onDelete, onManageContexts,
    activeStep, onStepChange,
    initialAction = null, onInitialActionConsumed
}) => {
  const [editedItem, setEditedItem] = useState<ContentItem | null>(null);

  // Status Flags
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Timer ref pour auto-reset du saveStatus
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Garde-fou : évite les setState sur composant démonté pendant les appels IA async
  const isMountedRef = React.useRef(true);
  React.useEffect(() => {
      isMountedRef.current = true;
      return () => {
          isMountedRef.current = false;
          if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
      };
  }, []);
  
  // Navigation & AI State
  const [showContextSelector, setShowContextSelector] = useState(false);
  const [pendingContextAction, setPendingContextAction] = useState<'interview' | 'draft' | 'analyze' | 'carrousel' | 'adjust' | null>(null);
  const [pendingAdjustmentText, setPendingAdjustmentText] = useState<string>("");

  // Session Coach (nouveau flow — remplace l'ancien Interviewer/Draft 0)
  const [showCoachChat, setShowCoachChat] = useState(false);

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
                const isVideo = item.targetFormat === TargetFormat.SCRIPT_VIDEO_REEL_SHORT
                    || item.targetFormat === TargetFormat.SCRIPT_VIDEO_YOUTUBE;
                const hasContent = isVideo
                    ? (item.scriptVideo && item.scriptVideo.trim().length > 0)
                    : (item.body && item.body.trim().length > 0);
                const hasCoachSession = !!item.coachSession && item.coachSession.messages && item.coachSession.messages.length > 0;
                if (hasContent || hasCoachSession || (item.interviewAnswers && item.interviewAnswers.length > 0)) {
                    onStepChange('atelier');
                }
            }
        } else {
            setEditedItem(prev => prev ? { ...prev, ...item } : item);
        }
    }
  }, [item, activeStep]); 

  // Auto-lancement du Coach lorsqu'on arrive via "Travailler cette idée".
  // Nouveau flow : on ouvre directement le chat Coach (plus d'AIConfigModal pour l'interview).
  useEffect(() => {
      if (initialAction === 'interview' && editedItem && editedItem.status === ContentStatus.DRAFTING) {
          setShowCoachChat(true);
          onInitialActionConsumed?.();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAction, editedItem?.id, editedItem?.status]);

  // isDirty : vrai si editedItem diffère du item Notion source
  const isDirty = !!editedItem && !!item && JSON.stringify(editedItem) !== JSON.stringify(item);

  if (!editedItem) return null;

  // --- HELPERS SAVE STATUS ---

  const triggerSaveStatus = (status: 'saved' | 'error') => {
      if (!isMountedRef.current) return;
      setSaveStatus(status);
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
      saveStatusTimerRef.current = setTimeout(() => {
          if (isMountedRef.current) setSaveStatus('idle');
      }, 2500);
  };

  const saveWithStatus = async (itemToSave: ContentItem) => {
      if (!isMountedRef.current) return;
      setSaveStatus('saving');
      setIsSaving(true);
      try {
          await onSave(itemToSave);
          triggerSaveStatus('saved');
      } catch (e) {
          triggerSaveStatus('error');
          throw e;
      } finally {
          if (isMountedRef.current) setIsSaving(false);
      }
  };

  // --- ACTIONS ---

  const handleManualSave = async () => {
      if (isSaving || !editedItem) return;
      await saveWithStatus(editedItem);
  };

  const changeStatus = async (newStatus: ContentStatus, scheduledDate?: string) => {
      if (isSaving || !editedItem) return;
      const newItem = { ...editedItem, status: newStatus };
      if (scheduledDate !== undefined) {
          newItem.scheduledDate = scheduledDate;
      }
      setEditedItem(newItem);
      await saveWithStatus(newItem);
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
      if (pendingContextAction === 'draft') await executeDrafting(contextId, modelId);
      else if (pendingContextAction === 'carrousel') await executeCarrouselSlides(contextId, modelId);
      else if (pendingContextAction === 'adjust' && pendingAdjustmentText) await executeAdjustment(pendingAdjustmentText, modelId);
  };

  // --- COACH SESSION HANDLERS (nouveau flow) ---

  /** Persiste la session Coach après chaque tour (user + assistant). */
  const handleCoachSessionChange = async (session: CoachSession) => {
      if (!isMountedRef.current || !editedItem) return;
      const newItem = { ...editedItem, coachSession: session };
      setEditedItem(newItem);
      await saveWithStatus(newItem);
  };

  /** Florent clique "Go Éditeur" : session validée → on ouvre AIConfigModal pour choisir le modèle de l'Éditeur. */
  const handleCoachValidate = async (session: CoachSession) => {
      if (!isMountedRef.current || !editedItem) return;
      const newItem = { ...editedItem, coachSession: session };
      setEditedItem(newItem);
      await saveWithStatus(newItem);
      setShowCoachChat(false);
      setPendingContextAction('draft');
      setShowContextSelector(true);
  };

  // --- AI ACTIONS EXECUTORS ---

  const executeDrafting = async (contextId: string, modelId: string) => {
      if (!isMountedRef.current) return;
      setIsGenerating(true);
      try {
          const contextItem = contextId ? contexts.find(c => c.id === contextId) : undefined;
          const actionConfig = AI_ACTIONS.DRAFT_CONTENT;
          const systemInstruction = actionConfig.getSystemInstruction(
              contextItem?.description,
              editedItem?.targetFormat || undefined
          );

          // Session Coach : passée intégralement à l'Éditeur si disponible (et validée de préférence).
          const coachSession = editedItem?.coachSession || null;
          const coachMessagesForPayload = coachSession?.messages
              ?.filter(m => m.role === 'user' || m.role === 'assistant')
              .map(m => ({ role: m.role, content: m.content }));
          // La dernière proposition assistant = matière la plus aboutie pour l'Éditeur
          const lastAssistantMsg = coachSession?.messages
              ?.filter(m => m.role === 'assistant')
              .slice(-1)[0]?.content;

          const promptPayload: Record<string, unknown> = {
              titre: editedItem?.title || "Non défini",
              format_cible: editedItem?.targetFormat || "Non défini",
              cible_offre: editedItem?.targetOffer || "Non défini",
              angle_strategique: editedItem?.strategicAngle || "Non défini",
              metaphore_suggeree: editedItem?.suggestedMetaphor || "Non défini",
              notes: editedItem?.notes || "",
          };

          if (coachMessagesForPayload && coachMessagesForPayload.length > 0) {
              promptPayload.coach_session = coachMessagesForPayload;
              promptPayload.coach_session_status = coachSession?.status || "in_progress";
              if (lastAssistantMsg) promptPayload.coach_final_direction = lastAssistantMsg;
          }

          const responseText = await callAI(modelId, systemInstruction, JSON.stringify(promptPayload), actionConfig.generationConfig);
          const finalContent = parseDraftResponse(responseText);

          const contextName = contextItem?.name || "Contexte par défaut";
          const modelName = aiModels.find(m => m.apiCode === modelId)?.name || (modelId === INTERNAL_MODELS.FAST ? "Gemini Flash" : modelId);
          const signature = `\n\n_Généré par : ${modelName} - ${contextName} - le ${new Date().toLocaleString('fr-FR')}_`;

          // Router le résultat : scriptVideo pour les formats vidéo, body sinon
          const isVideoFormat = editedItem?.targetFormat === TargetFormat.SCRIPT_VIDEO_REEL_SHORT
              || editedItem?.targetFormat === TargetFormat.SCRIPT_VIDEO_YOUTUBE;

          const newItem = isVideoFormat
              ? { ...editedItem!, scriptVideo: finalContent + signature }
              : { ...editedItem!, body: finalContent + signature };

          if (isMountedRef.current) { setEditedItem(newItem); await saveWithStatus(newItem); }
      } catch (error: any) {
          if (isMountedRef.current) setAlertInfo({ isOpen: true, title: "Erreur Rédaction", message: error.message, type: "error" });
      } finally {
          if (isMountedRef.current) { setIsGenerating(false); setPendingContextAction(null); }
      }
  };

  const executeCarrouselSlides = async (contextId: string, modelId: string) => {
      if (!isMountedRef.current) return;
      setIsGenerating(true);
      try {
          const contextItem = contextId ? contexts.find(c => c.id === contextId) : undefined;
          const actionConfig = AI_ACTIONS.GENERATE_CARROUSEL_SLIDES;
          // On passe le JSON brouillon brut (non aplati) pour que l'Artiste
          // préserve la trame : titre, texte, type, role, intention_visuelle.
          const systemInstruction = actionConfig.getSystemInstruction(
              contextItem?.description,
              editedItem?.targetOffer || "Non défini",
              editedItem?.suggestedMetaphor || "Non définie",
              editedItem?.body || "Non défini"
          );

          const responseText = await callAI(modelId, systemInstruction, "", actionConfig.generationConfig);

          const cleaned = sanitizeSlidesResponse(responseText);

          const contextName = contextItem?.name || "Contexte par défaut";
          const modelName = aiModels.find(m => m.apiCode === modelId)?.name || (modelId === INTERNAL_MODELS.FAST ? "Gemini Flash" : modelId);
          const signature = `\n\n_Généré par : ${modelName} - ${contextName} - le ${new Date().toLocaleString('fr-FR')}_`;

          const newItem = { ...editedItem!, slides: cleaned + signature };
          if (isMountedRef.current) { setEditedItem(newItem); await saveWithStatus(newItem); }
      } catch (error: any) {
          if (isMountedRef.current) setAlertInfo({ isOpen: true, title: "Erreur Slides", message: error.message, type: "error" });
      } finally {
          if (isMountedRef.current) { setIsGenerating(false); setPendingContextAction(null); }
      }
  };

  // --- ADJUSTMENT (Refinement Loop) ---

  const launchAdjustment = (adjustmentText: string) => {
      setPendingAdjustmentText(adjustmentText);
      setPendingContextAction('adjust');
      setShowContextSelector(true);
  };

  const executeAdjustment = async (adjustmentText: string, modelId: string) => {
      if (!isMountedRef.current || !adjustmentText.trim()) return;
      setIsGenerating(true);
      try {
          const actionConfig = AI_ACTIONS.ADJUST_CONTENT;
          // Determine which field contains the current content
          const isVideoFormat = editedItem?.targetFormat === TargetFormat.SCRIPT_VIDEO_REEL_SHORT
              || editedItem?.targetFormat === TargetFormat.SCRIPT_VIDEO_YOUTUBE;
          const currentContent = isVideoFormat
              ? (editedItem?.scriptVideo || "")
              : (editedItem?.body || "");

          const systemInstruction = actionConfig.getSystemInstruction(
              undefined, // pas de contexte Notion additionnel
              currentContent,
              adjustmentText
          );

          const responseText = await callAI(
              modelId,
              systemInstruction,
              "", // le contenu est déjà dans le system prompt
              actionConfig.generationConfig
          );

          const cleaned = responseText.replace(/```json\s?/g, '').replace(/```\s?/g, '').trim();
          // Resolve model name for signature
          const modelObj = aiModels.find(m => m.apiCode === modelId);
          const modelName = modelId === INTERNAL_MODELS.FAST ? "Gemini Flash" : (modelObj?.name || modelId);
          const signature = `\n\n_Ajusté par : ${modelName} — le ${new Date().toLocaleString('fr-FR')}_`;
          const finalContent = cleaned + signature;

          const newItem = isVideoFormat
              ? { ...editedItem!, scriptVideo: finalContent }
              : { ...editedItem!, body: finalContent };

          if (isMountedRef.current) {
              setEditedItem(newItem);
              await saveWithStatus(newItem);
          }
      } catch (error: any) {
          if (isMountedRef.current) setAlertInfo({ isOpen: true, title: "Erreur Ajustement", message: error.message, type: "error" });
      } finally {
          if (isMountedRef.current) setIsGenerating(false);
      }
  };

  // --- TRIGGER HANDLERS ---

  /** Nouveau flow : ouvre directement le chat Coach (plus d'AIConfigModal ici). */
  const triggerInterview = () => {
      setShowCoachChat(true);
  };

  const triggerDrafting = () => {
      setPendingContextAction('draft');
      setShowContextSelector(true);
  };

  const triggerCarrouselSlides = () => {
      setPendingContextAction('carrousel');
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

  const SaveIndicator = () => {
      if (saveStatus === 'saving') return (
          <span className="flex items-center gap-1.5 text-xs text-brand-main/60 dark:text-dark-text/60 animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Sauvegarde…
          </span>
      );
      if (saveStatus === 'saved') return (
          <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Enregistré
          </span>
      );
      if (saveStatus === 'error') return (
          <span className="flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400">
              <AlertCircle className="w-3.5 h-3.5" />
              Erreur sauvegarde
          </span>
      );
      return null;
  };

  const Header = (
      <div className="flex flex-col md:flex-row items-start md:items-center gap-4 flex-1">
          {editedItem.status === ContentStatus.DRAFTING ? (
              <input
                  type="text"
                  value={editedItem.title}
                  onChange={(e) => setEditedItem({...editedItem, title: e.target.value})}
                  className="text-lg md:text-xl font-bold text-brand-main dark:text-white bg-transparent outline-hidden w-full md:max-w-2xl font-display italic"
                  placeholder="Titre..."
              />
          ) : (
              <h2 className="text-lg md:text-xl font-bold text-brand-main dark:text-white w-full md:max-w-2xl min-w-0 truncate font-display italic">
                  {editedItem.title}
              </h2>
          )}
          <div className="flex items-center gap-3 md:ml-auto">
              <SaveIndicator />
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
      const canSave = isDirty && !isSaving;
      return (
          <>
              <button onClick={() => setConfirmDelete(true)} className="text-red-500 p-2 rounded-sm hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 text-sm font-medium mr-auto">
                  <Trash2 className="w-4 h-4" /> Supprimer
              </button>
              <button
                  onClick={handleManualSave}
                  disabled={!canSave}
                  title={!isDirty ? "Aucune modification à enregistrer" : undefined}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium text-sm ${
                      canSave
                          ? 'text-brand-main dark:text-dark-text hover:bg-brand-light dark:hover:bg-dark-bg cursor-pointer'
                          : 'text-brand-main/30 dark:text-dark-text/30 cursor-not-allowed'
                  }`}
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
                    onLaunchCarrouselSlides={triggerCarrouselSlides}
                    onLaunchAdjustment={launchAdjustment}
                    onChangeStatus={changeStatus}
                    onSave={onSave}
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
            dataSummary={(() => {
                if (!editedItem) return [];
                const action = pendingContextAction;
                if (action === 'draft') {
                    const labels = ['Titre', 'Format cible', 'Offre cible', 'Angle stratégique', 'Métaphore suggérée', 'Notes'];
                    const session = editedItem.coachSession;
                    if (session && session.messages && session.messages.length > 0) {
                        labels.push(session.status === 'validated' ? 'Session Coach (validée)' : 'Session Coach');
                    }
                    return labels;
                }
                if (action === 'carrousel') {
                    return ['Offre cible', 'Métaphore suggérée', 'Contenu rédigé'];
                }
                if (action === 'adjust') {
                    return ['Contenu actuel', 'Instruction d\'ajustement'];
                }
                return [];
            })()}
        />

        {/* Coach Chat overlay (nouveau flow — remplace l'ancienne interview à questions fermées) */}
        {showCoachChat && editedItem && (
            <div
                className="fixed inset-0 z-70 bg-white/90 dark:bg-dark-surface/90 flex items-center justify-center animate-in fade-in duration-200 p-4"
                onClick={() => setShowCoachChat(false)}
            >
                <div
                    className="relative w-full max-w-3xl h-[85vh] bg-white dark:bg-dark-bg rounded-xl shadow-2xl border border-brand-border dark:border-dark-sec-border overflow-hidden"
                    onClick={e => e.stopPropagation()}
                >
                    <button
                        onClick={() => setShowCoachChat(false)}
                        className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-white/80 dark:bg-dark-bg/80 border border-brand-border dark:border-dark-sec-border text-brand-main dark:text-dark-text hover:bg-brand-light dark:hover:bg-dark-sec-bg"
                        title="Fermer (la session est sauvegardée automatiquement)"
                    >
                        <X className="w-4 h-4" />
                    </button>
                    <CoachChat
                        item={editedItem}
                        aiModels={aiModels}
                        onSessionChange={handleCoachSessionChange}
                        onValidate={handleCoachValidate}
                    />
                </div>
            </div>
        )}
      </>
  );
};

export default ContentEditor;
