import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Trash2, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { ContentItem, ContentStatus, ContextItem, AIModel, Verdict, TargetFormat, isTargetFormat, Profondeur } from '../../types';
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

export type EditorStep = 'idea' | 'interview' | 'content' | 'slides' | 'postcourt';

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

// Retourne le JSON brut validé (string) — c'est ce qu'on stocke dans body
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
    // Accepte les clés longues (enum) ET les clés courtes retournées par le nouveau prompt
    const SHORT_FORMAT_KEYS = ["Post Texte", "Article", "Script Reel", "Script Youtube", "Carrousel", "Prompt Image"];
    if (!isTargetFormat(formatValue) && !SHORT_FORMAT_KEYS.includes(formatValue)) {
        throw new Error(`Format de sortie invalide : "${formatValue}". Vérifie la valeur du champ 'format'.`);
    }

    return cleaned;
};

// Extrait un texte lisible depuis un body JSON (pour recherche, ContentCard, contexte IA)
export const bodyJsonToText = (body: string): string => {
    if (!body) return "";
    try {
        const lastBrace = body.lastIndexOf('}');
        const cleaned = lastBrace !== -1 ? body.slice(0, lastBrace + 1) : body;
        const data = JSON.parse(cleaned);

        // Si édition manuelle libre
        if (data.edited_raw) return data.edited_raw;

        const t = (v: any) => (typeof v === 'string' ? v.trim() : "");
        const out: string[] = [];

        const fmt = data.format;
        const isPostTexte = fmt === TargetFormat.POST_TEXTE_COURT || fmt === "Post Texte";
        const isArticle = fmt === TargetFormat.ARTICLE_LONG_SEO || fmt === "Article";
        const isReelShort = fmt === TargetFormat.SCRIPT_VIDEO_REEL_SHORT || fmt === "Script Reel";
        const isYoutube = fmt === TargetFormat.SCRIPT_VIDEO_YOUTUBE || fmt === "Script Youtube";
        const isCarrousel = fmt === TargetFormat.CARROUSEL_SLIDE || fmt === "Carrousel";
        const isPromptImage = fmt === TargetFormat.PROMPT_IMAGE || fmt === "Prompt Image";

        if (isPostTexte) {
            if (data.hook) out.push(t(data.hook));
            if (data.corps) out.push(t(data.corps));
            if (data.baffe) out.push(t(data.baffe));
            if (data.cta) out.push(t(data.cta));
        } else if (isArticle) {
            if (data.titre_h1) out.push(t(data.titre_h1));
            if (data.introduction) out.push(t(data.introduction));
            (data.sections || []).forEach((s: any) => {
                if (s.sous_titre_h2) out.push(t(s.sous_titre_h2));
                if (s.contenu) out.push(t(s.contenu));
            });
            if (data.conclusion) out.push(t(data.conclusion));
        } else if (isReelShort) {
            if (data.hook) out.push(t(data.hook));
            if (data.corps) out.push(t(data.corps));
            if (data.cta) out.push(t(data.cta));
        } else if (isYoutube) {
            if (data.intro) out.push(t(data.intro));
            (data.developpement || []).forEach((s: any) => {
                if (s.contenu) out.push(t(s.contenu));
            });
            if (data.conclusion) out.push(t(data.conclusion));
        } else if (isCarrousel) {
            (data.slides || []).forEach((s: any) => {
                if (s.titre) out.push(t(s.titre));
                if (s.texte) out.push(t(s.texte));
            });
        } else if (isPromptImage) {
            if (data.prompt) out.push(t(data.prompt));
            if (data.legende) out.push(t(data.legende));
        } else {
            return body;
        }
        return out.filter(Boolean).join(" ");
    } catch {
        // Pas du JSON → texte brut (ancien contenu ou édition manuelle)
        return body;
    }
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
  const [pendingContextAction, setPendingContextAction] = useState<'interview' | 'draft' | 'analyze' | 'carrousel' | null>(null);

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

  const changeStatus = async (newStatus: ContentStatus) => {
      if (isSaving || !editedItem) return;
      const newItem = { ...editedItem, status: newStatus };
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
      if (pendingContextAction === 'interview') await executeInterview(contextId, modelId);
      else if (pendingContextAction === 'draft') await executeDrafting(contextId, modelId);
      else if (pendingContextAction === 'carrousel') await executeCarrouselSlides(contextId, modelId);
  };

  // --- AI ACTIONS EXECUTORS ---

  const executeInterview = async (contextId: string, modelId: string) => {
      if (!isMountedRef.current) return;
      setIsGenerating(true);
      try {
          const contextItem = contexts.find(c => c.id === contextId);
          const actionConfig = AI_ACTIONS.GENERATE_INTERVIEW;
          const profondeur = editedItem?.depth || Profondeur.COMPLETE;
          const systemInstruction = actionConfig.getSystemInstruction(contextItem?.description || "Journaliste.", profondeur);

          const promptPayload = {
              titre: editedItem?.title,
              notes: editedItem?.notes,
              angle_strategique: editedItem?.strategicAngle || "",
              plateformes: editedItem?.platforms,
              profondeur,
          };

          const responseText = await callAI(modelId, systemInstruction, JSON.stringify(promptPayload), actionConfig.generationConfig);

          const cleanedJson = responseText.replace(/```json\s?/g, '').replace(/```\s?/g, '').trim();
          let formattedQuestions = "";
          try {
              const data = JSON.parse(cleanedJson);

              // Cas Direct : skip
              if (data.skip === true) {
                  formattedQuestions = `_${data.raison || "Profondeur Direct : interview non nécessaire."}_`;
              }
              // Nouveau format : axe_cheval_de_troie / axe_gardien_du_seuil / axe_mecanique_invisible
              else if (data.axe_cheval_de_troie || data.axe_gardien_du_seuil || data.axe_mecanique_invisible) {
                  const axes = [
                      { label: "Axe cheval de troie", key: "axe_cheval_de_troie" },
                      { label: "Axe gardien du seuil", key: "axe_gardien_du_seuil" },
                      { label: "Axe mécanique invisible", key: "axe_mecanique_invisible" },
                  ];
                  formattedQuestions = axes
                      .filter(({ key }) => Array.isArray(data[key]) && data[key].length > 0)
                      .map(({ label, key }) => {
                          const questions = data[key].map((q: string) => `- ${q}`).join('\n');
                          return `**${label}**\n${questions}`;
                      })
                      .join('\n\n');
              }
              // Ancien format (rétrocompatibilité)
              else if (Array.isArray(data.questions_interieures)) {
                  formattedQuestions = data.questions_interieures.map((block: any) => {
                      const questions = Array.isArray(block.questions) ? block.questions.map((q: string) => `- ${q}`).join('\n') : `- ${block.questions}`;
                      return `**Angle : ${block.angle || "Angle"}**\n${questions}`;
                  }).join('\n\n');
              } else {
                  formattedQuestions = JSON.stringify(data, null, 2);
              }
          } catch (e) { formattedQuestions = cleanedJson; }

          const contextName = contextItem?.name || "Contexte par défaut";
          const modelName = aiModels.find(m => m.apiCode === modelId)?.name || (modelId === INTERNAL_MODELS.FAST ? "Gemini Flash" : modelId);
          const signature = `\n\n_Généré par : ${modelName} - ${contextName} - le ${new Date().toLocaleString('fr-FR')}_`;

          const newItem = { ...editedItem!, interviewQuestions: formattedQuestions + signature };
          if (isMountedRef.current) { setEditedItem(newItem); await saveWithStatus(newItem); }
      } catch (error: any) {
          if (isMountedRef.current) setAlertInfo({ isOpen: true, title: "Erreur IA", message: error.message, type: "error" });
      } finally {
          if (isMountedRef.current) { setIsGenerating(false); setPendingContextAction(null); }
      }
  };

  const executeDrafting = async (contextId: string, modelId: string) => {
      if (!isMountedRef.current) return;
      setIsGenerating(true);
      try {
          const contextItem = contexts.find(c => c.id === contextId) || contexts[0];
          const actionConfig = AI_ACTIONS.DRAFT_CONTENT;
          const systemInstruction = actionConfig.getSystemInstruction(
              contextItem?.description || "Rédacteur."
          );

          const isDirect = editedItem?.depth === Profondeur.DIRECT;
          const promptPayload = {
              titre: editedItem?.title || "Non défini",
              format_cible: editedItem?.targetFormat || "Non défini",
              cible_offre: editedItem?.targetOffer || "Non défini",
              angle_strategique: editedItem?.strategicAngle || "Non défini",
              metaphore_suggeree: editedItem?.suggestedMetaphor || "Non défini",
              contenu_source: isDirect
                  ? (editedItem?.notes || "Non défini")
                  : (editedItem?.interviewAnswers || editedItem?.notes || "Non défini"),
          };

          const responseText = await callAI(modelId, systemInstruction, JSON.stringify(promptPayload), actionConfig.generationConfig);
          const finalContent = parseDraftResponse(responseText);

          const contextName = contextItem?.name || "Contexte par défaut";
          const modelName = aiModels.find(m => m.apiCode === modelId)?.name || (modelId === INTERNAL_MODELS.FAST ? "Gemini Flash" : modelId);
          const signature = `\n\n_Généré par : ${modelName} - ${contextName} - le ${new Date().toLocaleString('fr-FR')}_`;

          const newItem = { ...editedItem!, body: finalContent + signature };
          if (isMountedRef.current) { setEditedItem(newItem); await saveWithStatus(newItem); onStepChange('content'); }
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
          const contextItem = contexts.find(c => c.id === contextId) || contexts[0];
          const actionConfig = AI_ACTIONS.GENERATE_CARROUSEL_SLIDES;
          const systemInstruction = actionConfig.getSystemInstruction(
              contextItem?.description || "Directeur artistique.",
              editedItem?.targetOffer || "Non défini",
              editedItem?.suggestedMetaphor || "Non définie",
              bodyJsonToText(editedItem?.body || "")  || "Non défini"
          );

          const responseText = await callAI(modelId, systemInstruction, "", actionConfig.generationConfig);

          const cleaned = extractJsonPayload(responseText);
          if (!cleaned) throw new Error("Réponse IA vide ou invalide.");

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

  // --- TRIGGER HANDLERS ---

  const triggerInterview = () => {
      setPendingContextAction('interview');
      setShowContextSelector(true);
  };

  const triggerDrafting = () => {
      const isDirect = editedItem?.depth === Profondeur.DIRECT;
      if (!isDirect && !editedItem?.interviewAnswers) {
          setAlertInfo({ isOpen: true, title: "Réponses manquantes", message: "Veuillez répondre aux questions d'interview, ou passer en profondeur Direct.", type: "error" });
          return;
      }
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
                  className="text-lg md:text-xl font-bold text-brand-main dark:text-white bg-transparent outline-none w-full md:max-w-2xl"
                  placeholder="Titre..."
              />
          ) : (
              <h2 className="text-lg md:text-xl font-bold text-brand-main dark:text-white flex items-center gap-2 truncate">
                  <span className="truncate">{editedItem.title}</span>
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
              <button onClick={() => setConfirmDelete(true)} className="text-red-500 p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 text-sm font-medium mr-auto">
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
        />
      </>
  );
};

export default ContentEditor;
