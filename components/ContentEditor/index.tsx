import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Trash2, Save, CheckCircle2, AlertCircle, Lightbulb, Pencil, Video, Copy, Images } from 'lucide-react';
import { ContentItem, ContentStatus, AIModel, Verdict, TargetFormat, Profondeur, CoachSession } from '../../types';
import { STATUS_COLORS, SIGNATURE_SLIDE } from '../../constants';
import * as OneMinService from '../../services/oneMinService';
import { generateLockedBrief } from '../../services/coachService';
import { AlertModal, ConfirmModal } from '../CommonModals';
import { AI_ACTIONS } from '../../ai/actions';
import { bodyJsonToText } from '../../ai/formats';
import {
    parseDraftResponse, parseAIResponse, sanitizeSlidesResponse,
    extractJsonPayload, formatDraftContent,
    appendSignatureSlide, findSlideLengthIssues, SLIDE_TITLE_MAX, SLIDE_TEXT_MAX
} from '../../ai/executors';
import type { ColdReadReport } from './DraftView';

// Sub-components
import { EditorLayout } from './EditorLayout';
import { DraftView } from './DraftView';
import { PreviewView } from './PreviewView';

export type EditorStep = 'idea' | 'atelier' | 'brouillon' | 'slides' | 'postcourt' | 'script';

interface ContentEditorProps {
  item: ContentItem | null;
  aiModels: AIModel[];
  /** Modèle IA actif global — utilisé par toutes les actions (plus de modale de choix). */
  activeModelId: string;
  onClose: () => void;
  onSave: (item: ContentItem) => Promise<void>;
  onDelete?: (item: ContentItem) => Promise<void>;
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
    item, aiModels = [], activeModelId, onClose, onSave, onDelete,
    activeStep, onStepChange,
    initialAction = null, onInitialActionConsumed
}) => {
  const [editedItem, setEditedItem] = useState<ContentItem | null>(null);

  // Status Flags
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Rapport du Lecteur Froid (relecture "yeux d'un inconnu") — éphémère, non persisté
  const [coldRead, setColdRead] = useState<ColdReadReport | null>(null);

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
  
  const [alertInfo, setAlertInfo] = useState<{ isOpen: boolean, title: string, message: string, type: 'error' | 'success' | 'info' }>({
      isOpen: false, title: '', message: '', type: 'info'
  });

  // Sync internal state & Smart Redirect Logic
  useEffect(() => {
    if (item) {
        if (!editedItem || item.id !== editedItem.id) {
            setEditedItem({ ...item });
            setIsGenerating(false);
            setColdRead(null);

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

  // Navigation auto vers l'Atelier lorsqu'on arrive via "Travailler cette idée".
  // Le Coach affichera son sas "Prêt à démarrer ?" pour que Florent confirme le modèle AVANT tout appel IA.
  useEffect(() => {
      if (initialAction === 'interview' && editedItem && editedItem.status === ContentStatus.DRAFTING) {
          onStepChange('atelier');
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

  const callAI = async (model: string, systemInstruction: string, prompt: string, _config?: any) => {
      return await OneMinService.generateContent({
          model: model,
          systemInstruction: systemInstruction,
          prompt: prompt
      });
  };

  // --- COACH SESSION HANDLERS (nouveau flow) ---

  /** Persiste la session Coach après chaque tour (user + assistant). */
  const handleCoachSessionChange = async (session: CoachSession) => {
      if (!isMountedRef.current || !editedItem) return;
      const newItem = { ...editedItem, coachSession: session };
      setEditedItem(newItem);
      await saveWithStatus(newItem);
  };

  /**
   * Florent clique "Go Éditeur" : session validée → le Verrouilleur condense
   * l'atelier en un brief verrouillé (dernière version validée + interdits),
   * puis la rédaction démarre à partir de CE brief (plus de session brute).
   * Si le verrouillage échoue, on retombe sur le mode legacy (session brute).
   */
  const handleCoachValidate = async (session: CoachSession) => {
      if (!isMountedRef.current || !editedItem) return;
      setIsGenerating(true);
      let sessionWithBrief = session;
      try {
          const brief = await generateLockedBrief({
              item: editedItem,
              session,
              modelId: activeModelId,
          });
          sessionWithBrief = { ...session, brief };
      } catch (e) {
          console.warn('Verrouillage du brief impossible — fallback session brute.', e);
      }
      if (!isMountedRef.current) return;
      const newItem = { ...editedItem, coachSession: sessionWithBrief };
      setEditedItem(newItem);
      await saveWithStatus(newItem);
      await executeDrafting(newItem);
  };

  // --- AI ACTIONS EXECUTORS (modèle actif global, plus de contexte) ---

  /**
   * Relecture "Lecteur Froid" : le contenu final est relu par un persona en
   * contexte vierge (ni notes, ni atelier, ni brief) qui répond en inconnu.
   * Échec silencieux : la relecture ne bloque jamais la rédaction.
   */
  const executeColdRead = async (item: ContentItem) => {
      const fmt = item.targetFormat;
      const coldReadFormats = [TargetFormat.POST_TEXTE_COURT, TargetFormat.CARROUSEL_SLIDE, TargetFormat.SCRIPT_VIDEO_REEL_SHORT];
      if (!fmt || !coldReadFormats.includes(fmt)) return;
      try {
          const isVideo = fmt === TargetFormat.SCRIPT_VIDEO_REEL_SHORT;
          const raw = isVideo ? (item.scriptVideo || "") : (item.body || "");
          const lastBrace = raw.lastIndexOf('}');
          const data = JSON.parse(lastBrace !== -1 ? raw.slice(0, lastBrace + 1) : raw);
          const plain = formatDraftContent(fmt, data);
          if (!plain.trim()) return;

          const actionConfig = AI_ACTIONS.COLD_READ;
          const systemInstruction = actionConfig.getSystemInstruction(
              undefined,
              fmt,
              item.objectif || "Non défini",
              plain
          );
          const responseText = await callAI(activeModelId, systemInstruction, "Relis ce contenu.", actionConfig.generationConfig);
          const report = JSON.parse(extractJsonPayload(responseText));
          if (isMountedRef.current && report && report.lecture_naive) {
              setColdRead(report as ColdReadReport);
          }
      } catch (e) {
          console.warn('Lecture froide indisponible :', e);
      }
  };

  const triggerColdRead = () => {
      if (!editedItem) return;
      void (async () => {
          setIsGenerating(true);
          setColdRead(null);
          try { await executeColdRead(editedItem); }
          finally { if (isMountedRef.current) setIsGenerating(false); }
      })();
  };

  /**
   * Pour un carrousel : ajoute la slide Signature (texte fixe, côté code) puis
   * vérifie les longueurs titre/texte. En cas de dépassement, une passe
   * d'ajustement automatique et ciblée est demandée au Rédacteur.
   */
  const enforceCarrouselConstraints = async (content: string): Promise<string> => {
      let result = appendSignatureSlide(content, SIGNATURE_SLIDE);
      const issues = findSlideLengthIssues(result);
      if (issues.length === 0) return result;

      const detail = issues
          .map(i => `slide ${i.numero} — ${i.champ} : ${i.longueur} caractères (max ${i.max})`)
          .join(' ; ');
      const instruction = `Raccourcis UNIQUEMENT les éléments suivants pour respecter les limites (titre ≤ ${SLIDE_TITLE_MAX} caractères, texte ≤ ${SLIDE_TEXT_MAX} caractères, espaces compris), sans perdre le sens ni la voix : ${detail}. Ne modifie rien d'autre. La slide "Signature" reste strictement identique.`;

      try {
          const adjustConfig = AI_ACTIONS.ADJUST_CONTENT;
          const systemInstruction = adjustConfig.getSystemInstruction(undefined, result, instruction);
          const responseText = await callAI(activeModelId, systemInstruction, "", adjustConfig.generationConfig);
          const adjusted = parseDraftResponse(responseText);
          // On garde la version ajustée même si un léger dépassement subsiste (une seule passe)
          result = appendSignatureSlide(adjusted, SIGNATURE_SLIDE);
      } catch (e) {
          console.warn('Ajustement automatique des longueurs impossible — trame conservée telle quelle.', e);
      }
      return result;
  };

  const executeDrafting = async (itemArg?: ContentItem) => {
      if (!isMountedRef.current) return;
      const base = itemArg ?? editedItem;
      if (!base) return;
      setIsGenerating(true);
      setColdRead(null);
      try {
          const actionConfig = AI_ACTIONS.DRAFT_CONTENT;
          const systemInstruction = actionConfig.getSystemInstruction(
              undefined,
              base.targetFormat || undefined,
              base.objectif || undefined
          );

          const promptPayload: Record<string, unknown> = {
              titre: base.title || "Non défini",
              format_cible: base.targetFormat || "Non défini",
              objectif: base.objectif || "Non défini",
              angle_strategique: base.strategicAngle || "Non défini",
              metaphore_suggeree: base.suggestedMetaphor || "Non défini",
              notes: base.notes || "",
          };

          // Matière : brief verrouillé en priorité, sinon session brute (legacy)
          const coachSession = base.coachSession || null;
          const lockedBrief = coachSession?.brief || null;
          if (lockedBrief) {
              try {
                  promptPayload.brief_verrouille = JSON.parse(lockedBrief);
              } catch {
                  promptPayload.brief_verrouille = lockedBrief;
              }
          } else {
              const coachMessagesForPayload = coachSession?.messages
                  ?.filter(m => m.role === 'user' || m.role === 'assistant')
                  .map(m => ({ role: m.role, content: m.content }));
              const lastAssistantMsg = coachSession?.messages
                  ?.filter(m => m.role === 'assistant')
                  .slice(-1)[0]?.content;
              if (coachMessagesForPayload && coachMessagesForPayload.length > 0) {
                  promptPayload.coach_session = coachMessagesForPayload;
                  promptPayload.coach_session_status = coachSession?.status || "in_progress";
                  if (lastAssistantMsg) promptPayload.coach_final_direction = lastAssistantMsg;
              }
          }

          const responseText = await callAI(activeModelId, systemInstruction, JSON.stringify(promptPayload), actionConfig.generationConfig);
          let finalContent = parseDraftResponse(responseText);

          // Carrousel : slide Signature (code) + contrôle déterministe des longueurs
          const isCarrousel = base.targetFormat === TargetFormat.CARROUSEL_SLIDE;
          if (isCarrousel) {
              finalContent = await enforceCarrouselConstraints(finalContent);
          }

          const modelName = aiModels.find(m => m.apiCode === activeModelId)?.name || activeModelId;
          const signature = `\n\n_Généré par : ${modelName} - le ${new Date().toLocaleString('fr-FR')}_`;

          // Router le résultat : scriptVideo pour les formats vidéo, body sinon
          const isVideoFormat = base.targetFormat === TargetFormat.SCRIPT_VIDEO_REEL_SHORT
              || base.targetFormat === TargetFormat.SCRIPT_VIDEO_YOUTUBE;

          const newItem = isVideoFormat
              ? { ...base, scriptVideo: finalContent + signature }
              : { ...base, body: finalContent + signature };

          if (isMountedRef.current) {
              setEditedItem(newItem);
              await saveWithStatus(newItem);
              // Auto-navigation post-rédaction :
              // - Vidéo → Script (affichage rendu)
              // - PostTexteCourt → Copie (texte formaté pour copier-coller)
              // - Carrousel → Brouillon (relecture de la trame avant de cliquer "Générer les Slides")
              // - Autres → Brouillon
              const nextStep: EditorStep =
                  isVideoFormat   ? 'script'
                  : base.targetFormat === TargetFormat.POST_TEXTE_COURT ? 'postcourt'
                                  : 'brouillon';
              onStepChange(nextStep);

              // Relecture "Lecteur Froid" (non bloquante) sur le contenu fraîchement rédigé
              await executeColdRead(newItem);
          }
      } catch (error: any) {
          if (isMountedRef.current) setAlertInfo({ isOpen: true, title: "Erreur Rédaction", message: error.message, type: "error" });
      } finally {
          if (isMountedRef.current) setIsGenerating(false);
      }
  };

  const executeCarrouselSlides = async () => {
      if (!isMountedRef.current) return;
      setIsGenerating(true);
      try {
          const actionConfig = AI_ACTIONS.GENERATE_CARROUSEL_SLIDES;
          // On passe le JSON brouillon brut (non aplati) pour que l'Artiste
          // préserve la trame : titre, texte, type, role, intention_visuelle.
          const systemInstruction = actionConfig.getSystemInstruction(
              undefined,
              editedItem?.suggestedMetaphor || "Non définie",
              editedItem?.body || "Non défini"
          );

          const responseText = await callAI(activeModelId, systemInstruction, "", actionConfig.generationConfig);

          const cleaned = sanitizeSlidesResponse(responseText);

          const modelName = aiModels.find(m => m.apiCode === activeModelId)?.name || activeModelId;
          const signature = `\n\n_Généré par : ${modelName} - le ${new Date().toLocaleString('fr-FR')}_`;

          const newItem = { ...editedItem!, slides: cleaned + signature };
          if (isMountedRef.current) { setEditedItem(newItem); await saveWithStatus(newItem); }
      } catch (error: any) {
          if (isMountedRef.current) setAlertInfo({ isOpen: true, title: "Erreur Slides", message: error.message, type: "error" });
      } finally {
          if (isMountedRef.current) setIsGenerating(false);
      }
  };

  // --- ADJUSTMENT (Refinement Loop) ---

  const launchAdjustment = (adjustmentText: string) => {
      void executeAdjustment(adjustmentText);
  };

  const executeAdjustment = async (adjustmentText: string) => {
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
              activeModelId,
              systemInstruction,
              "", // le contenu est déjà dans le system prompt
              actionConfig.generationConfig
          );

          const cleaned = responseText.replace(/```json\s?/g, '').replace(/```\s?/g, '').trim();
          // Resolve model name for signature
          const modelObj = aiModels.find(m => m.apiCode === activeModelId);
          const modelName = modelObj?.name || activeModelId;
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

  // --- ADJUSTMENT DES PROMPTS DZINE (Slides) ---

  const launchPromptsAdjustment = (instruction: string, slideNumero: number | null) => {
      if (!instruction.trim()) return;
      void executePromptsAdjustment(instruction.trim(), slideNumero);
  };

  const executePromptsAdjustment = async (instruction: string, slideNumero: number | null) => {
      if (!isMountedRef.current || !editedItem?.slides) return;
      setIsGenerating(true);
      try {
          const actionConfig = AI_ACTIONS.ADJUST_DZINE_PROMPTS;
          const systemInstruction = actionConfig.getSystemInstruction(
              undefined,
              editedItem.slides,
              instruction,
              slideNumero
          );

          const responseText = await callAI(
              activeModelId,
              systemInstruction,
              "", // les inputs sont déjà dans le system prompt
              actionConfig.generationConfig
          );

          const cleaned = sanitizeSlidesResponse(responseText);
          const modelObj = aiModels.find(m => m.apiCode === activeModelId);
          const modelName = modelObj?.name || activeModelId;
          const signature = `\n\n_Prompts ajustés (${slideNumero === null ? 'tous' : `slide ${slideNumero}`}) par : ${modelName} - le ${new Date().toLocaleString('fr-FR')}_`;

          const newItem = { ...editedItem, slides: cleaned + signature };
          if (isMountedRef.current) {
              setEditedItem(newItem);
              await saveWithStatus(newItem);
          }
      } catch (error: any) {
          if (isMountedRef.current) setAlertInfo({ isOpen: true, title: "Erreur Ajustement Prompts", message: error.message, type: "error" });
      } finally {
          if (isMountedRef.current) setIsGenerating(false);
      }
  };

  // --- TRIGGER HANDLERS (exécution directe avec le modèle actif) ---

  const triggerDrafting = () => { void executeDrafting(); };

  const triggerCarrouselSlides = () => { void executeCarrouselSlides(); };

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

  // ── Onglets dynamiques — TOUJOURS visibles selon le format (pas de gating sur le contenu) ──
  const _isVideoFmt = editedItem.targetFormat === TargetFormat.SCRIPT_VIDEO_REEL_SHORT
      || editedItem.targetFormat === TargetFormat.SCRIPT_VIDEO_YOUTUBE;
  const _isPostCourt = editedItem.targetFormat === TargetFormat.POST_TEXTE_COURT;
  const _isCarrousel = editedItem.targetFormat === TargetFormat.CARROUSEL_SLIDE;
  // Brouillon (trame textuelle) : pour tous les formats sauf vidéo (le Script affiche déjà la trame).
  // Pour Carrousel : le Brouillon est l'étape narrative intermédiaire avant la génération des Slides.
  const _showBrouillon = !!editedItem.targetFormat && !_isVideoFmt;

  const steps: Array<{ id: EditorStep; label: string; icon: React.ComponentType<{ className?: string }> }> = editedItem.status === ContentStatus.DRAFTING
      ? [
          { id: 'idea',    label: 'Idée',    icon: Lightbulb },
          { id: 'atelier', label: 'Atelier', icon: Pencil    },
          ...(_showBrouillon
              ? [{ id: 'brouillon' as EditorStep, label: 'Brouillon', icon: Pencil }]
              : []),
          ...(_isVideoFmt
              ? [{ id: 'script' as EditorStep, label: 'Script', icon: Video }]
              : []),
          ...(_isPostCourt
              ? [{ id: 'postcourt' as EditorStep, label: 'Copie', icon: Copy }]
              : []),
          ...(_isCarrousel
              ? [{ id: 'slides' as EditorStep, label: 'Slides', icon: Images }]
              : []),
      ]
      : [];

  const showStepTabs = steps.length > 1;

  const StepTabsDesktop = showStepTabs ? (
      <div className="hidden md:inline-flex items-center gap-1 bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border rounded-xl p-1">
          {steps.map(step => {
              const isActive = activeStep === step.id;
              const Icon = step.icon;
              return (
                  <button
                      key={step.id}
                      onClick={() => onStepChange(step.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                          isActive
                              ? 'bg-white dark:bg-dark-surface text-brand-main dark:text-white shadow-sm'
                              : 'text-brand-main/50 dark:text-dark-text/50 hover:text-brand-main dark:hover:text-white'
                      }`}
                  >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{step.label}</span>
                  </button>
              );
          })}
      </div>
  ) : null;

  const StepTabsMobile = showStepTabs ? (
      <div
          className="md:hidden flex items-center gap-1 px-3 py-2 bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-sec-border overflow-x-auto scrollbar-hide"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
      >
          {steps.map(step => {
              const isActive = activeStep === step.id;
              const Icon = step.icon;
              return (
                  <button
                      key={step.id}
                      onClick={() => onStepChange(step.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                          isActive
                              ? 'bg-brand-main text-white shadow-sm dark:bg-white dark:text-brand-main'
                              : 'text-brand-main/60 dark:text-dark-text/60 hover:bg-brand-light dark:hover:bg-dark-sec-bg'
                      }`}
                  >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{step.label}</span>
                  </button>
              );
          })}
      </div>
  ) : null;

  const Header = (
      <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex-1 min-w-0">
              {editedItem.status === ContentStatus.DRAFTING ? (
                  <input
                      type="text"
                      value={editedItem.title}
                      onChange={(e) => setEditedItem({...editedItem, title: e.target.value})}
                      className="font-semibold text-sm text-brand-main dark:text-white bg-transparent outline-hidden w-full truncate"
                      placeholder="Titre..."
                  />
              ) : (
                  <p className="font-semibold text-sm text-brand-main dark:text-white truncate">
                      {editedItem.title}
                  </p>
              )}
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {editedItem.platforms?.slice(0, 2).map(p => (
                      <span
                          key={p}
                          className="inline-flex items-center rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-brand-light text-brand-main/70 border-brand-border dark:bg-dark-bg dark:text-dark-text dark:border-dark-sec-border"
                      >
                          {p}
                      </span>
                  ))}
                  {editedItem.targetFormat && (
                      <span className="inline-flex items-center rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-900/20 dark:text-pink-300 dark:border-pink-800/50">
                          {editedItem.targetFormat}
                      </span>
                  )}
              </div>
          </div>

          {StepTabsDesktop}

          <div className="flex items-center gap-2 shrink-0">
              <SaveIndicator />
              {editedItem.verdict && (
                  <div className={`hidden lg:block px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${getVerdictColor(editedItem.verdict)}`}>
                      {editedItem.verdict}
                  </div>
              )}
              <div className={`hidden lg:block px-2.5 py-0.5 rounded-full border text-xs font-medium ${STATUS_COLORS[editedItem.status]}`}>
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
        <EditorLayout
            onClose={onClose}
            headerContent={Header}
            subHeaderContent={StepTabsMobile}
            footerContent={getFooterContent()}
        >
            {editedItem.status === ContentStatus.DRAFTING && (
                <DraftView
                    item={editedItem}
                    onChange={setEditedItem}
                    onLaunchDrafting={triggerDrafting}
                    onLaunchCarrouselSlides={triggerCarrouselSlides}
                    onLaunchAdjustment={launchAdjustment}
                    onLaunchPromptsAdjustment={launchPromptsAdjustment}
                    onChangeStatus={changeStatus}
                    onSave={onSave}
                    isGenerating={isGenerating}
                    aiModels={aiModels}
                    activeModelId={activeModelId}
                    onCoachSessionChange={handleCoachSessionChange}
                    onCoachValidate={handleCoachValidate}
                    activeTab={activeStep}
                    onTabChange={onStepChange}
                    coldRead={coldRead}
                    onDismissColdRead={() => setColdRead(null)}
                    onRunColdRead={triggerColdRead}
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
      </>
  );
};

export default ContentEditor;
