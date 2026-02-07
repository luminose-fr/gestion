import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Send, Calendar, Save, Trash2, Settings, Lock, CheckCircle2, Edit3, Eye, Loader2, ArrowRight, FileText, Info, Brain, Globe, MessageSquare, PenTool, LayoutTemplate } from 'lucide-react';
import { ContentItem, ContentStatus, Platform, ContextItem, Verdict, AIModel } from '../types';
import { STATUS_COLORS } from '../constants';
import * as GeminiService from '../services/geminiService';
import * as OneMinService from '../services/oneMinService';
import * as NotionService from '../services/notionService';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { AlertModal, ConfirmModal, CharCounter } from './CommonModals';
import { MarkdownToolbar } from './MarkdownToolbar';
import { RichTextarea } from './RichTextarea';
// Changement: Import de INTERNAL_MODELS au lieu de AI_MODELS pour la valeur par défaut
import { AI_ACTIONS, INTERNAL_MODELS, isOneMinModel } from '../ai/config';

interface EditorModalProps {
  item: ContentItem | null;
  contexts: ContextItem[];
  // Ajout de la prop aiModels
  aiModels: AIModel[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: ContentItem) => Promise<void>;
  onDelete?: (item: ContentItem) => Promise<void>;
  onManageContexts: () => void;
}

const parseAIResponse = (responseText: string, key: string): string => {
    if (!responseText) return "";
    let cleaned = responseText.replace(/```json\s?/g, '').replace(/```\s?/g, '').trim();
    try {
        const data = JSON.parse(cleaned);
        if (data[key]) return data[key];
        if (key === 'questions_interieures' && Array.isArray(data.questions_interieures)) {
            return JSON.stringify(data);
        }
    } catch (e) {
        const regex = new RegExp(`"${key}"\\s*:\\s*"([\\s\\S]*?)"\\s*[,}]`);
        const match = cleaned.match(regex);
        if (match && match[1]) {
            return match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        }
    }
    return cleaned;
};

const ModalLayout = ({ 
    children, 
    headerContent, 
    onClose 
}: React.PropsWithChildren<{ 
    headerContent: React.ReactNode, 
    onClose: () => void 
}>) => (
      <div 
        className="fixed inset-0 z-50 bg-brand-main/20 dark:bg-black/50 backdrop-blur-sm flex items-center justify-center p-0 md:p-4 animate-fade-in"
        onClick={onClose}
      >
         <div 
            className="bg-white dark:bg-dark-surface w-full h-full md:h-[90vh] md:max-w-5xl md:rounded-2xl shadow-2xl border border-brand-border dark:border-dark-sec-border flex flex-col overflow-hidden transition-colors"
            onClick={(e) => e.stopPropagation()}
         >
            <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface flex-shrink-0">
                <div className="flex-1 min-w-0">
                    {headerContent}
                </div>
                <button onClick={onClose} className="p-2 ml-2 text-brand-main/50 hover:text-brand-main dark:text-dark-text/50 dark:hover:text-white rounded-full hover:bg-brand-light dark:hover:bg-dark-sec-bg transition-colors">
                    <X className="w-6 h-6" />
                </button>
            </div>
            {children}
         </div>
      </div>
);

const EditorModal: React.FC<EditorModalProps> = ({ item, contexts, aiModels = [], isOpen, onClose, onSave, onDelete, onManageContexts }) => {
  const [editedItem, setEditedItem] = useState<ContentItem | null>(null);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [showContextSelector, setShowContextSelector] = useState(false);
  const [selectedContextId, setSelectedContextId] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>(INTERNAL_MODELS.FAST);
  const [pendingContextAction, setPendingContextAction] = useState<'interview' | 'draft' | null>(null);

  const [draftTab, setDraftTab] = useState<'interview' | 'content'>('interview');

  const [alertInfo, setAlertInfo] = useState<{ isOpen: boolean, title: string, message: string, type: 'error' | 'success' | 'info' }>({
      isOpen: false, title: '', message: '', type: 'info'
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (isOpen && item) {
        if (!editedItem || item.id !== editedItem.id) {
            setEditedItem({ ...item });
            setShowContextSelector(false);
            setIsGenerating(false);
            setSelectedContextId(""); 
            setPendingContextAction(null);
            if (item.body && item.body.trim().length > 0) {
                setDraftTab('content');
            } else {
                setDraftTab('interview');
            }
        } else {
            setEditedItem(prev => prev ? { ...prev, ...item } : item);
        }
    }
  }, [item, isOpen]);

  if (!isOpen || !editedItem) return null;

  const isIdea = editedItem.status === ContentStatus.IDEA;
  const isDrafting = editedItem.status === ContentStatus.DRAFTING;

  const changeStatus = async (newStatus: ContentStatus) => {
      if (isSaving) return;
      setIsSaving(true);
      const newItem = { ...editedItem, status: newStatus };
      setEditedItem(newItem);
      await onSave(newItem);
      setIsSaving(false);
      if (newStatus === ContentStatus.READY || newStatus === ContentStatus.PUBLISHED) {
          onClose();
      }
  };

  const handleManualSave = async () => {
      if (isSaving) return;
      setIsSaving(true);
      await onSave(editedItem);
      setIsSaving(false);
  };

  const handleDelete = async () => {
      if (onDelete && editedItem) {
          await onDelete(editedItem);
      }
      onClose();
  };

  const handleContextConfirm = async () => {
      if (!selectedContextId) {
          setAlertInfo({ isOpen: true, title: "Attention", message: "Veuillez choisir un contexte.", type: "error" });
          return;
      }
      
      if (pendingContextAction === 'interview') {
          await handleLaunchInterview();
      } else if (pendingContextAction === 'draft') {
          await handleLaunchDrafting();
      }
  };

  const callAI = async (model: string, systemInstruction: string, prompt: string, config: any) => {
      // isOneMinModel utilise maintenant la liste dynamique
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

  const handleOpenInterviewer = () => {
      setPendingContextAction('interview');
      setSelectedModel(INTERNAL_MODELS.FAST);
      setShowContextSelector(true);
  };

  const handleLaunchInterview = async () => {
      setIsGenerating(true);
      setShowContextSelector(false);

      try {
          const contextItem = contexts.find(c => c.id === selectedContextId);
          const contextDesc = contextItem ? contextItem.description : "Journaliste standard.";
          
          const actionConfig = AI_ACTIONS.GENERATE_INTERVIEW;
          const systemInstruction = actionConfig.getSystemInstruction(contextDesc);

          const promptPayload = [{
              titre: editedItem.title,
              notes: editedItem.notes,
              angle_strategique: editedItem.strategicAngle || "",
              plateformes: editedItem.platforms
          }];

          const responseText = await callAI(
              selectedModel,
              systemInstruction,
              JSON.stringify(promptPayload),
              actionConfig.generationConfig
          );

          // Extraction robuste des questions
          const interviewDataRaw = parseAIResponse(responseText, 'questions_interieures');
          let formattedQuestions = "";

          try {
              const data = JSON.parse(interviewDataRaw);
              if (data.questions_interieures && Array.isArray(data.questions_interieures)) {
                  formattedQuestions = data.questions_interieures.map((block: any) => {
                      const questionsList = block.questions.map((q: string) => `- ${q}`).join('\n');
                      return `**Angle : ${block.angle}**\n${questionsList}`;
                  }).join('\n\n');
              } else {
                  formattedQuestions = responseText; 
              }
          } catch (e) {
              formattedQuestions = responseText;
          }

          const newItem = { ...editedItem, interviewQuestions: formattedQuestions };
          setEditedItem(newItem);
          await onSave(newItem);

      } catch (error: any) {
          console.error(error);
          setAlertInfo({ isOpen: true, title: "Erreur IA", message: error.message || "Erreur lors de la génération.", type: "error" });
      } finally {
          setIsGenerating(false);
          setPendingContextAction(null);
      }
  };

  const handleOpenDrafting = () => {
      if (!editedItem.interviewAnswers) {
          setAlertInfo({ isOpen: true, title: "Réponses manquantes", message: "Veuillez répondre aux questions avant de générer le brouillon.", type: "error" });
          return;
      }
      setPendingContextAction('draft');
      setSelectedModel(INTERNAL_MODELS.SMART);
      setShowContextSelector(true);
  };

  const handleLaunchDrafting = async () => {
      setIsGenerating(true);
      setShowContextSelector(false);

      try {
          const contextItem = contexts.find(c => c.id === selectedContextId) || contexts[0];
          const contextDesc = contextItem ? contextItem.description : "Expert marketing.";
          const platformsStr = editedItem.platforms.length > 0 ? editedItem.platforms.join(", ") : "Réseaux Sociaux";

          const actionConfig = AI_ACTIONS.DRAFT_CONTENT;
          const systemInstruction = actionConfig.getSystemInstruction(contextDesc, platformsStr);

          const promptPayload = {
              titre: editedItem.title,
              angle_strategique: editedItem.strategicAngle || "Non défini",
              plateformes: editedItem.platforms || [],
              notes_initiales: editedItem.notes || "",
              reponses_interview: editedItem.interviewAnswers || ""
          };

          const responseText = await callAI(
              selectedModel,
              systemInstruction,
              JSON.stringify(promptPayload),
              actionConfig.generationConfig
          );

          // Extraction robuste du contenu final (éjecte le JSON et garde le markdown de draft_final)
          const finalContent = parseAIResponse(responseText, 'draft_final');

          const newItem = { ...editedItem, body: finalContent };
          setEditedItem(newItem);
          await onSave(newItem);
          setDraftTab('content');

      } catch (error: any) {
          console.error(error);
          setAlertInfo({ isOpen: true, title: "Erreur Rédaction", message: error.message, type: "error" });
      } finally {
          setIsGenerating(false);
          setPendingContextAction(null);
      }
  };

  const getVerdictColor = (verdict?: Verdict) => {
      switch (verdict) {
          case Verdict.VALID: return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800';
          case Verdict.TOO_BLAND: return 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800';
          case Verdict.NEEDS_WORK: return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800';
          default: return 'bg-gray-100 text-gray-600';
      }
  };

  const renderReadOnlyText = (text: string) => {
      const parts = text.split(/(\*\*.*?\*\*)/g);
      return parts.map((part, index) => {
          if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={index} className="font-bold text-purple-900 dark:text-purple-100">{part.slice(2, -2)}</strong>;
          }
          return part;
      });
  };

  const renderCommonOverlays = () => (
      <>
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
            message="Cette action est irréversible."
            isDestructive={true}
            confirmLabel="Supprimer"
         />

         {showContextSelector && (
             <div className="fixed inset-0 z-[60] bg-white/90 dark:bg-dark-surface/90 flex items-center justify-center animate-in fade-in zoom-in duration-200">
                 <div className="bg-white dark:bg-dark-bg p-6 rounded-xl shadow-xl border border-brand-border dark:border-dark-sec-border w-full max-w-sm" onClick={e => e.stopPropagation()}>
                     <h3 className="text-lg font-bold text-brand-main dark:text-white mb-4 flex items-center gap-2">
                         <MessageSquare className="w-5 h-5" />
                         {pendingContextAction === 'interview' ? "Choisir l'Interviewer" : "Choisir le Rédacteur"}
                     </h3>
                     <div className="space-y-4">
                         <div>
                             <label className="block text-xs font-semibold text-brand-main/50 dark:text-dark-text/50 mb-1">Persona</label>
                             <select 
                                value={selectedContextId}
                                onChange={(e) => setSelectedContextId(e.target.value)}
                                className="w-full p-2 rounded-lg border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface text-brand-main dark:text-white outline-none focus:ring-2 focus:ring-brand-main"
                             >
                                 <option value="">-- Sélectionner --</option>
                                 {contexts.map(ctx => <option key={ctx.id} value={ctx.id}>{ctx.name}</option>)}
                             </select>
                         </div>
                         
                         <div>
                             <label className="block text-xs font-semibold text-brand-main/50 dark:text-dark-text/50 mb-1">Modèle IA</label>
                             <select 
                                value={selectedModel}
                                onChange={(e) => setSelectedModel(e.target.value)}
                                className="w-full p-2 rounded-lg border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface text-brand-main dark:text-white outline-none focus:ring-2 focus:ring-brand-main"
                             >
                                 <optgroup label="Modèles Internes (Gemini)">
                                    <option value={INTERNAL_MODELS.FAST}>Gemini Flash (Rapide)</option>
                                    <option value={INTERNAL_MODELS.SMART}>Gemini Pro (Intelligent)</option>
                                 </optgroup>
                                 
                                 {/* Rendu dynamique des modèles */}
                                 {aiModels.length > 0 && (
                                     <optgroup label="Modèles Personnalisés (1min.AI)">
                                         {aiModels.map(m => (
                                             <option key={m.id} value={m.apiCode}>{m.name}</option>
                                         ))}
                                     </optgroup>
                                 )}
                             </select>
                         </div>

                         <div className="flex gap-2 justify-end pt-2">
                             <button onClick={() => setShowContextSelector(false)} className="px-4 py-2 text-sm text-brand-main dark:text-dark-text hover:bg-brand-light dark:hover:bg-dark-sec-bg rounded-lg">Annuler</button>
                             <button 
                                onClick={handleContextConfirm}
                                disabled={!selectedContextId}
                                className="px-4 py-2 text-sm bg-brand-main text-white rounded-lg hover:bg-brand-hover disabled:opacity-50"
                             >
                                 Valider
                             </button>
                         </div>
                     </div>
                 </div>
             </div>
         )}
      </>
  );

  if (isIdea) {
      return (
        <>
        <div 
            className="fixed inset-0 z-50 bg-brand-main/20 dark:bg-black/50 backdrop-blur-sm flex items-center justify-center p-0 md:p-4 animate-fade-in"
            onClick={onClose}
        >
             <div 
                className="bg-white dark:bg-dark-surface w-full h-full md:h-auto md:max-w-2xl md:rounded-2xl shadow-2xl border border-brand-border dark:border-dark-sec-border flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
             >
                <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border dark:border-dark-sec-border">
                    <div className={`px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[ContentStatus.IDEA]}`}>IDÉE</div>
                    <button onClick={onClose} className="p-2 -mr-2 text-brand-main/50 hover:text-brand-main dark:text-dark-text/50 dark:hover:text-white rounded-full hover:bg-brand-light dark:hover:bg-dark-sec-bg transition-colors"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-8 space-y-8 flex-1 overflow-y-auto">
                    <div>
                        <label className="block text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider mb-2">Titre de l'idée</label>
                        <input 
                            type="text" 
                            value={editedItem.title}
                            onChange={(e) => setEditedItem({...editedItem, title: e.target.value})}
                            className="w-full text-2xl font-bold text-brand-main dark:text-white bg-transparent border-b-2 border-brand-border dark:border-dark-sec-border focus:border-brand-main outline-none py-2"
                            placeholder="Titre..."
                            autoFocus
                        />
                    </div>

                    <div className="flex flex-col border border-brand-border dark:border-dark-sec-border rounded-xl overflow-hidden bg-brand-light dark:bg-dark-bg focus-within:ring-2 focus-within:ring-brand-main transition-shadow">
                         <div className="bg-brand-light dark:bg-dark-bg p-2 flex justify-between items-center border-b border-brand-border dark:border-dark-sec-border">
                             <label className="block text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase">Notes</label>
                         </div>
                         <MarkdownToolbar />
                         <RichTextarea 
                            value={editedItem.notes}
                            onChange={(val) => setEditedItem({...editedItem, notes: val})}
                            className="w-full h-40 p-4"
                            placeholder="Détaillez votre idée, vos sources, vos inspirations..."
                         />
                         <div className="p-2 flex justify-end">
                            <CharCounter current={editedItem.notes.length} max={10000} />
                         </div>
                    </div>

                    {editedItem.analyzed && (
                        <div className="bg-purple-50 dark:bg-purple-900/20 p-5 rounded-xl border border-purple-100 dark:border-purple-800 space-y-4">
                            <div className="flex items-center justify-between border-b border-purple-200 dark:border-purple-800/50 pb-3">
                                <span className="text-xs font-bold text-purple-800 dark:text-purple-300 uppercase flex items-center gap-2">
                                    <Brain className="w-4 h-4" /> 
                                    ANALYSE IA
                                </span>
                                {editedItem.verdict && (
                                    <span className={`text-[10px] px-2 py-1 rounded-full border ${getVerdictColor(editedItem.verdict)}`}>
                                        {editedItem.verdict}
                                    </span>
                                )}
                            </div>
                            
                            <div>
                                <p className="text-xs font-semibold text-purple-900 dark:text-purple-100 mb-2 uppercase tracking-wide opacity-70">Angle Stratégique</p>
                                <div className="text-sm leading-relaxed text-purple-900 dark:text-purple-100 whitespace-pre-wrap">
                                    {renderReadOnlyText(editedItem.strategicAngle || "Aucune analyse disponible.")}
                                </div>
                            </div>

                            <div>
                                <p className="text-xs font-semibold text-purple-900 dark:text-purple-100 mb-2 uppercase tracking-wide opacity-70 flex items-center gap-1">
                                    <Globe className="w-3 h-3" />
                                    Plateformes envisagées
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {editedItem.platforms.length > 0 ? (
                                        editedItem.platforms.map((p, i) => (
                                            <span key={i} className="px-3 py-1 bg-white dark:bg-purple-900/40 text-purple-800 dark:text-purple-200 rounded-lg text-xs font-bold border border-purple-200 dark:border-purple-800 shadow-sm">
                                                {p}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-xs text-purple-800/50 italic">Aucune plateforme définie</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 bg-brand-light dark:bg-dark-bg border-t border-brand-border flex justify-between items-center">
                     <button onClick={() => setConfirmDelete(true)} className="text-red-500 p-2 rounded hover:bg-red-50"><Trash2 className="w-5 h-5" /></button>
                     <div className="flex gap-3">
                        <button 
                            onClick={async () => { await handleManualSave(); onClose(); }} 
                            disabled={isSaving} 
                            className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium disabled:opacity-50"
                        >
                            {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                            Enregistrer
                        </button>
                        <button 
                            onClick={() => changeStatus(ContentStatus.DRAFTING)} 
                            disabled={isSaving} 
                            className="px-6 py-2 bg-brand-main text-white rounded-lg font-medium shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Travailler <ArrowRight className="w-4 h-4" /></>}
                        </button>
                     </div>
                </div>
             </div>
        </div>
        {renderCommonOverlays()}
        </>
      );
  }

  if (isDrafting) {
      const hasGeneratedContent = !!editedItem.body && editedItem.body.trim().length > 0;

      return (
        <>
        <ModalLayout
            onClose={onClose}
            headerContent={
                <div className="flex flex-col md:flex-row items-start md:items-center gap-4 flex-1">
                    <input 
                        type="text" 
                        value={editedItem.title}
                        onChange={(e) => setEditedItem({...editedItem, title: e.target.value})}
                        className="text-lg md:text-xl font-bold text-brand-main dark:text-white bg-transparent outline-none w-full md:max-w-2xl"
                        placeholder="Titre du post..."
                    />
                    <div className="flex items-center gap-2 md:ml-auto">
                        <div className={`hidden md:block px-3 py-1 mr-2 rounded-full border text-sm font-medium ${STATUS_COLORS[ContentStatus.DRAFTING]}`}>BROUILLON</div>
                        <button onClick={handleManualSave} disabled={isSaving} className="flex items-center gap-2 border px-3 py-2 rounded-lg text-sm font-medium">{isSaving && <Loader2 className="w-3 h-3 animate-spin"/>} Enregistrer</button>
                    </div>
                </div>
            }
        >
            <div className="flex-1 overflow-y-auto bg-brand-light dark:bg-dark-bg p-6 md:p-10">
                <div className="max-w-5xl mx-auto space-y-8">
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border overflow-hidden focus-within:ring-2 focus-within:ring-brand-main transition-shadow h-full flex flex-col max-h-60">
                            <div className="bg-brand-light dark:bg-dark-bg p-3 border-b border-brand-border dark:border-dark-sec-border">
                                <p className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase flex items-center gap-2">
                                    <FileText className="w-3 h-3"/> Notes
                                </p>
                            </div>
                            <RichTextarea 
                                value={editedItem.notes}
                                onChange={(val) => setEditedItem({...editedItem, notes: val})}
                                className="w-full flex-1 p-3 text-sm"
                                placeholder="Vos notes..."
                            />
                        </div>

                        <div className="bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-100 dark:border-purple-900/50 p-4 shadow-sm flex flex-col h-full max-h-60">
                            <h3 className="text-xs font-bold text-purple-800 dark:text-purple-300 uppercase mb-3 flex items-center gap-2"><Brain className="w-4 h-4"/> Analyse Stratégique</h3>
                            <div className="flex-1 text-sm text-purple-900 dark:text-purple-100/80 leading-relaxed overflow-y-auto custom-scrollbar">
                                {editedItem.strategicAngle ? (
                                    <>
                                        <p className="font-semibold mb-2">Angle suggéré :</p>
                                        <div className="whitespace-pre-wrap">{renderReadOnlyText(editedItem.strategicAngle)}</div>
                                        {editedItem.platforms.length > 0 && (
                                            <div className="mt-4 pt-4 border-t border-purple-200 dark:border-purple-800/50">
                                                <p className="text-xs font-bold mb-2">Canaux :</p>
                                                <div className="flex gap-2 flex-wrap">
                                                    {editedItem.platforms.map(p => <span key={p} className="px-2 py-0.5 bg-white dark:bg-purple-800/50 rounded text-xs border border-purple-200 dark:border-purple-800">{p}</span>)}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <p className="italic opacity-70">Aucune analyse disponible pour ce contenu.</p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="w-full h-px bg-brand-border dark:border-dark-sec-border"></div>

                    <div className="flex flex-col min-h-[500px]">
                        <div className="flex items-center gap-1 border-b border-brand-border dark:border-dark-sec-border mb-6">
                            <button 
                                onClick={() => setDraftTab('interview')}
                                className={`px-6 py-3 text-sm font-bold flex items-center gap-2 transition-all relative top-[1px] border-b-2 
                                    ${draftTab === 'interview' 
                                        ? 'text-brand-main dark:text-white border-brand-main' 
                                        : 'text-brand-main/50 dark:text-dark-text/50 border-transparent hover:text-brand-main/80'}`}
                            >
                                <MessageSquare className="w-4 h-4" />
                                Interview
                            </button>
                            <button 
                                onClick={() => setDraftTab('content')}
                                disabled={!hasGeneratedContent}
                                className={`px-6 py-3 text-sm font-bold flex items-center gap-2 transition-all relative top-[1px] border-b-2 disabled:opacity-30 disabled:cursor-not-allowed
                                    ${draftTab === 'content' 
                                        ? 'text-pink-600 dark:text-pink-300 border-pink-600 dark:border-pink-300' 
                                        : 'text-brand-main/50 dark:text-dark-text/50 border-transparent hover:text-pink-600/80'}`}
                            >
                                <LayoutTemplate className="w-4 h-4" />
                                Contenu Rédigé
                            </button>
                        </div>

                        {draftTab === 'interview' && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="space-y-3">
                                    <h4 className="text-sm font-bold text-brand-main dark:text-white uppercase tracking-wider">1. Questions de l'IA</h4>
                                    {!editedItem.interviewQuestions ? (
                                        <div className="bg-white dark:bg-dark-surface p-8 rounded-xl border border-dashed border-brand-border dark:border-dark-sec-border flex flex-col items-center justify-center text-center">
                                            <p className="text-brand-main/60 dark:text-dark-text/60 mb-6 max-w-md">
                                                L'IA peut agir comme un journaliste pour vous poser les bonnes questions et faire émerger le meilleur contenu de vos notes.
                                            </p>
                                            <button 
                                                onClick={handleOpenInterviewer}
                                                disabled={isGenerating}
                                                className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-md transition-all disabled:opacity-50"
                                            >
                                                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                                                Envoyer à l'interviewer
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="bg-blue-50 dark:bg-blue-900/10 p-6 rounded-xl border border-blue-100 dark:border-blue-900/30">
                                            <div className="prose prose-sm dark:prose-invert max-w-none text-blue-900 dark:text-blue-100 whitespace-pre-wrap">
                                                {renderReadOnlyText(editedItem.interviewQuestions)}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-3 pb-10">
                                    <h4 className="text-sm font-bold text-brand-main dark:text-white uppercase tracking-wider">2. Vos Réponses</h4>
                                    <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border overflow-hidden focus-within:ring-2 focus-within:ring-pink-500 transition-shadow">
                                        <div className="bg-brand-light dark:bg-dark-bg p-2 border-b border-brand-border dark:border-dark-sec-border">
                                            <MarkdownToolbar />
                                        </div>
                                        <RichTextarea 
                                            value={editedItem.interviewAnswers || ""} 
                                            onChange={(val) => setEditedItem({...editedItem, interviewAnswers: val})} 
                                            className="w-full min-h-[200px] p-4"
                                            placeholder="Répondez aux questions ici..."
                                        />
                                    </div>
                                    <div className="flex justify-end gap-3 pt-4">
                                        <button 
                                            onClick={handleManualSave}
                                            disabled={isSaving}
                                            className="flex items-center gap-2 px-4 py-2 border border-brand-border dark:border-dark-sec-border text-brand-main dark:text-dark-text rounded-lg hover:bg-brand-light dark:hover:bg-dark-sec-bg transition-colors text-sm font-medium"
                                        >
                                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                            Sauvegarder
                                        </button>
                                        <button 
                                            onClick={handleOpenDrafting}
                                            disabled={isGenerating || !editedItem.interviewAnswers}
                                            className="flex items-center gap-2 px-6 py-3 bg-pink-600 hover:bg-pink-700 text-white rounded-lg font-medium shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                            Envoyer et rédiger le contenu
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {draftTab === 'content' && (
                            <div className="flex flex-col flex-1 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-10">
                                <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border shadow-md ring-1 ring-pink-500/20 overflow-hidden flex flex-col flex-1 h-full min-h-[500px]">
                                    <div className="bg-brand-light dark:bg-dark-bg p-3 border-b border-brand-border dark:border-dark-sec-border flex justify-between items-center">
                                        <p className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase">Éditeur Final</p>
                                    </div>
                                    <div className="flex-1 flex flex-col">
                                        <MarkdownToolbar />
                                        <RichTextarea 
                                            value={editedItem.body || ""}
                                            onChange={(val) => setEditedItem({...editedItem, body: val})}
                                            className="w-full flex-1 p-6 text-lg leading-relaxed"
                                            placeholder="Le contenu généré apparaîtra ici..."
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                </div>
            </div>

            <div className="p-4 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-sec-border flex justify-between items-center">
                 <button onClick={() => setConfirmDelete(true)} className="text-red-500 p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 text-sm font-medium">
                    <Trash2 className="w-4 h-4" /> Supprimer
                 </button>
                 
                 <div className="flex items-center gap-3">
                     <div className="text-xs text-brand-main/40 dark:text-dark-text/40 italic mr-2 hidden md:block">
                        {editedItem.lastEdited ? `Modifié le ${format(parseISO(editedItem.lastEdited), 'dd/MM/yyyy à HH:mm', {locale: fr})}` : ''}
                     </div>
                     <button 
                        onClick={() => changeStatus(ContentStatus.READY)} 
                        disabled={isSaving || !hasGeneratedContent} 
                        className="flex items-center gap-2 bg-green-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-700 transition-all"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4" /> Valider pour publication</>}
                    </button>
                 </div>
            </div>
        </ModalLayout>
        {renderCommonOverlays()}
        </>
      );
  }

  return (
        <>
        <ModalLayout 
            onClose={onClose}
            headerContent={
                <div className="flex items-center gap-4">
                     <h2 className="text-lg md:text-xl font-bold text-brand-main dark:text-white flex items-center gap-2 truncate">
                        <Lock className="w-5 h-5 text-gray-400" />
                        <span className="truncate">{editedItem.title}</span>
                     </h2>
                     <div className={`hidden md:block px-3 py-1 rounded-full border text-sm font-medium ${STATUS_COLORS[editedItem.status]}`}>
                        {editedItem.status}
                    </div>
                </div>
            }
        >
             <div className="flex-1 overflow-y-auto bg-brand-light dark:bg-dark-bg p-4 md:p-8 flex justify-center">
                 <div className="w-full max-w-4xl flex flex-col md:flex-row gap-8">
                     <div className="flex-1 bg-white dark:bg-dark-surface shadow-xl border border-brand-border dark:border-dark-sec-border rounded-xl p-6 md:p-8 space-y-6">
                        <div className="flex items-center gap-2 mb-6">
                            <Eye className="w-5 h-5 text-brand-main/50 dark:text-dark-text/50" />
                            <h3 className="text-sm font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider">Aperçu</h3>
                        </div>
                        <div className="prose dark:prose-invert max-w-none whitespace-pre-wrap">{editedItem.body}</div>
                     </div>
                     <div className="w-full md:w-72 space-y-4">
                        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-sec-border rounded-xl p-5 shadow-sm">
                            <button 
                                onClick={() => changeStatus(ContentStatus.DRAFTING)} 
                                disabled={isSaving}
                                className="w-full bg-white border border-brand-border text-brand-main px-4 py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-brand-light dark:bg-transparent dark:text-white dark:border-white/20 dark:hover:bg-white/5 transition-colors"
                            >
                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Modifier (Brouillon)"}
                            </button>
                        </div>
                     </div>
                 </div>
             </div>
        </ModalLayout>
        {renderCommonOverlays()}
        </>
  );
};

export default EditorModal;