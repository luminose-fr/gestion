import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Trash2, Save, CheckCircle2, AlertCircle, Lightbulb, Pencil, Video, Copy, Images, Undo2, X, Layers, ChevronLeft, ChevronRight } from 'lucide-react';
import { ContentItem, ContentStatus, AIModel, Verdict, TargetFormat, Profondeur, CoachSession, CoachMessage } from '../../types';
import { STATUS_COLORS, SIGNATURE_SLIDE } from '../../constants';
import * as AiService from '../../services/aiService';
import { generateLockedBrief, createEmptySession } from '../../services/coachService';
import { AlertModal, ConfirmModal } from '../CommonModals';
import { AI_ACTIONS, AI_ACTION_CATALOG } from '@luminose/editorial';
import { bodyJsonToText, getEditorTab, supportsColdRead } from '@luminose/editorial';
import * as Api from '../../services/apiService';
import {
    parseDraftResponse, parseAIResponse, sanitizeSlidesResponse,
    extractJsonPayload, formatDraftContent,
    appendSignatureSlide, findSlideLengthIssues, SLIDE_TITLE_MAX, SLIDE_TEXT_MAX
} from '@luminose/editorial';
import type { ColdReadReport } from './DraftView';

// Sub-components
import { EditorLayout } from './EditorLayout';
import { DraftView } from './DraftView';
import { PreviewView } from './PreviewView';

export type EditorStep = 'idea' | 'atelier' | 'brouillon' | 'slides' | 'postcourt' | 'script';

interface ContentEditorProps {
  item: ContentItem | null;
  aiModels: AIModel[];
  /** Modèle IA actif global — repli des actions sans preset. */
  activeModelId: string;
  /** Le modèle réglé pour une action donnée (Réglages → Modèles IA). */
  modelFor: (action: string) => string;
  onClose: () => void;
  onSave: (item: ContentItem) => Promise<void>;
  onDelete?: (item: ContentItem) => Promise<void>;
  /** « Décliner » : ce contenu devient le pilier d'une nouvelle série (SPEC §6.3). */
  onDecline?: (item: ContentItem) => void;
  /**
   * Contexte de série pour le Rédacteur (SPEC §6.4) — composé en amont par
   * @luminose/editorial. `undefined` quand le contenu n'appartient à aucune série.
   */
  serieContext?: string;
  /**
   * La place de ce contenu dans sa série, quand il est ouvert depuis elle.
   * Sans ça, on travaillait une publication comme une idée isolée — et on
   * repassait par le plan à chaque fois pour savoir où l'on en était.
   */
  serieNav?: {
      titre: string;
      position: number | null;
      total: number;
      precedent: ContentItem | null;
      suivant: ContentItem | null;
  } | null;
  onOpenSerie?: () => void;
  onOpenSerieContent?: (item: ContentItem) => void;
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
export { bodyJsonToText } from '@luminose/editorial';

// parseAIResponse → ai/executors.ts

const ContentEditor: React.FC<ContentEditorProps> = ({
    item, aiModels = [], activeModelId, modelFor, onClose, onSave, onDelete, onDecline, serieContext,
    serieNav, onOpenSerie, onOpenSerieContent,
    activeStep, onStepChange,
    initialAction = null, onInitialActionConsumed
}) => {
  const [editedItem, setEditedItem] = useState<ContentItem | null>(null);

  // Status Flags
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Dernière génération IA : permet de revenir à la version précédente.
  // Une génération écrase intégralement le champ cible — sans ça, un
  // ajustement raté fait disparaître définitivement le texte d'avant.
  const [lastGeneration, setLastGeneration] = useState<{
      field: 'draft' | 'slides';
      previousValue: string;
      label: string;
  } | null>(null);

  // Le brouillon a été régénéré/ajusté après la production des slides :
  // ce qui s'affiche dans l'onglet Slides ne correspond plus au texte courant.
  const [slidesStale, setSlidesStale] = useState(false);

  /**
   * Session Coach du contenu ouvert.
   *
   * Elle ne voyage plus dans l'item : la liste ne porte pas les messages, seul
   * le détail les assemble (SPEC §3.2). On la charge donc à l'ouverture, et on
   * la garde en état le temps de la session d'édition.
   */
  const [coachSessionState, setCoachSessionState] = useState<CoachSession | null>(null);

  useEffect(() => {
      if (!item?.id) { setCoachSessionState(null); return; }
      let annule = false;
      Api.fetchContent(item.id)
          .then(({ coachSession }) => { if (!annule) setCoachSessionState(coachSession); })
          .catch((e) => console.error('Chargement de la session Coach :', e));
      return () => { annule = true; };
  }, [item?.id]);

  const [confirmDelete, setConfirmDelete] = useState(false);

  /**
   * Rapport du Lecteur Froid. Il EST journalisé (`kind: 'cold_read'`) depuis
   * toujours — mais rien ne le relisait, et le commentaire d'origine affirmait
   * ici « éphémère, non persisté ». Fermer le panneau, ou le voir disparaître
   * sur un échec, revenait donc à perdre un rapport qui était en base.
   *
   * `provenance` accompagne le rapport restauré : une relecture d'hier ne doit
   * pas se faire passer pour un jugement du texte d'aujourd'hui.
   */
  const [coldRead, setColdRead] = useState<ColdReadReport | null>(null);
  const [coldReadMeta, setColdReadMeta] = useState<{ at: number; modelLabel: string } | null>(null);

  /**
   * La dernière relecture à froid, reprise du journal à l'ouverture. Une seule
   * ligne demandée : c'est la seule production IA qui ne vise aucune colonne du
   * contenu, donc la seule qui n'avait aucun chemin de retour à l'écran.
   */
  useEffect(() => {
      if (!item?.id) { setColdRead(null); setColdReadMeta(null); return; }
      let annule = false;
      setColdRead(null);
      setColdReadMeta(null);
      Api.fetchGenerations(item.id, 'cold_read', 1)
          .then(({ generations }) => {
              const derniere = generations?.[0];
              if (annule || !derniere) return;
              try {
                  const rapport = JSON.parse(derniere.payload);
                  if (rapport?.lecture_naive) {
                      setColdRead(rapport as ColdReadReport);
                      setColdReadMeta({ at: derniere.createdAt, modelLabel: derniere.modelLabel });
                  }
              } catch {
                  // Un rapport illisible en base ne doit pas empêcher d'ouvrir le contenu.
              }
          })
          .catch((e) => console.warn('Dernière relecture à froid non relue :', e));
      return () => { annule = true; };
  }, [item?.id]);

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
            setColdReadMeta(null);
            setLastGeneration(null);
            setSlidesStale(false);
            setSaveError(null);

            if (activeStep === 'idea') {
                const hasContent = (item.draft || "").trim().length > 0;
                // La session n'est plus dans l'item : son état suffit à savoir
                // qu'un travail a commencé, sans charger les messages.
                const hasCoachSession = !!item.coachStatus;
                if (hasContent || hasCoachSession || item.legacyJson) {
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

  /**
   * L'appel IA en cours, s'il y en a un.
   *
   * Sans ça, un aller-retour avec le fournisseur est INVISIBLE dès que le bouton
   * qui l'a déclenché disparaît — c'est exactement ce qui se passe au « Go
   * Éditeur » : la validation retire le bouton, la rédaction part, et l'écran
   * ne montre plus rien. « Il ne s'est rien passé » était une lecture correcte
   * de ce que l'écran affichait.
   */
  const [appelIA, setAppelIA] = useState<{ label: string; persona: string; modele: string; debut: number } | null>(null);
  const [secondesIA, setSecondesIA] = useState(0);
  /** Compteur de profondeur : deux appels enchaînés ne doivent pas s'éteindre l'un l'autre. */
  const appelsEnCours = React.useRef(0);

  useEffect(() => {
      if (!appelIA) { setSecondesIA(0); return; }
      // Le temps écoulé est le seul signal qui distingue « ça travaille » de
      // « c'est bloqué ». Il vaut la seconde d'intervalle.
      setSecondesIA(0);
      const t = setInterval(() => setSecondesIA(Math.round((Date.now() - appelIA.debut) / 1000)), 1000);
      return () => clearInterval(t);
  }, [appelIA]);

  // isDirty : vrai si editedItem diffère du item Notion source
  const isDirty = !!editedItem && !!item && JSON.stringify(editedItem) !== JSON.stringify(item);

  if (!editedItem) return null;

  // --- HELPERS SAVE STATUS ---

  /**
   * "Enregistré" s'efface après quelques secondes ; une erreur reste
   * affichée jusqu'à la prochaine tentative — sinon elle passe inaperçue
   * et Florent croit son travail sauvegardé.
   */
  const triggerSaveStatus = (status: 'saved' | 'error') => {
      if (!isMountedRef.current) return;
      setSaveStatus(status);
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
      if (status === 'saved') {
          saveStatusTimerRef.current = setTimeout(() => {
              if (isMountedRef.current) setSaveStatus('idle');
          }, 2500);
      }
  };

  /** Retourne true si Notion a bien accepté l'écriture. Ne lève jamais. */
  const saveWithStatus = async (itemToSave: ContentItem): Promise<boolean> => {
      if (!isMountedRef.current) return false;
      setSaveStatus('saving');
      setSaveError(null);
      setIsSaving(true);
      try {
          await onSave(itemToSave);
          triggerSaveStatus('saved');
          return true;
      } catch (e: any) {
          if (isMountedRef.current) setSaveError(e?.message || "Notion a refusé l'enregistrement.");
          triggerSaveStatus('error');
          return false;
      } finally {
          if (isMountedRef.current) setIsSaving(false);
      }
  };

  /** Rejoue la dernière sauvegarde en échec. */
  const retrySave = async () => {
      if (isSaving || !editedItem) return;
      await saveWithStatus(editedItem);
  };

  /**
   * Revient à la version qui précédait la dernière génération.
   *
   * L'annulation passe par le JOURNAL (SPEC §2.6) : elle ajoute une ligne dont
   * la charge reprend celle visée, plutôt que d'effacer. Elle survit donc à la
   * fermeture de l'éditeur — et annuler l'annulation reste possible.
   *
   * Repli sur la valeur gardée en mémoire quand le journal ne porte rien
   * d'antérieur : les contenus d'avant la bascule n'ont pas d'historique.
   */
  const undoLastGeneration = async () => {
      if (!lastGeneration || !editedItem || isGenerating || isSaving) return;
      const field = lastGeneration.field;

      try {
          const { generations } = await Api.fetchGenerations(editedItem.id);
          // [0] est celle qu'on vient d'écrire ; [1] est celle d'avant.
          const precedente = generations.filter(g => g.target === field)[1];
          if (precedente) {
              await Api.revertGeneration(editedItem.id, precedente.id);
              const restored = { ...editedItem, [field]: precedente.payload };
              setEditedItem(restored);
              setLastGeneration(null);
              await saveWithStatus(restored);
              return;
          }
      } catch (e) {
          console.warn('Retour par le journal impossible — repli sur la version en mémoire.', e);
      }

      const restored = { ...editedItem, [field]: lastGeneration.previousValue };
      setEditedItem(restored);
      setLastGeneration(null);
      await saveWithStatus(restored);
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

  // --- JOURNAL DES PRODUCTIONS IA (SPEC §2.6) ---

  /**
   * Nom du modèle, figé au moment de l'écriture : si le modèle disparaît du
   * catalogue, la provenance lui survit (SPEC §2.6).
   */
  const modelLabel = (modelId: string) =>
      aiModels.find(m => m.id === modelId)?.name || modelId || 'Modèle inconnu';

  /**
   * Écrit une production dans le journal, et la colonne visée avec elle —
   * les deux dans le même batch côté Worker. C'est ce qui remplace la
   * signature markdown collée derrière le JSON : la colonne redevient du JSON
   * pur, la provenance vit dans sa propre ligne.
   */
  const journalise = async (input: {
      kind: 'analysis' | 'draft' | 'slides' | 'cold_read' | 'adjustment' | 'brief';
      target?: 'draft' | 'slides' | null;
      payload: string;
      instruction?: string | null;
      /** Le modèle QUI A PRODUIT — pas le modèle actif, qui peut être un autre. */
      modelId: string;
  }): Promise<void> => {
      if (!editedItem) return;
      try {
          await Api.recordGeneration(editedItem.id, {
              kind: input.kind,
              target: input.target ?? null,
              modelId: input.modelId || null,
              modelLabel: modelLabel(input.modelId),
              instruction: input.instruction ?? null,
              payload: input.payload,
              apply: !!input.target,
          });
      } catch (e: any) {
          // La production n'est pas perdue pour autant : l'enregistrement
          // ordinaire qui suit écrit la colonne. Seule la trace manque, et
          // l'erreur le dit plutôt que de passer inaperçue.
          if (isMountedRef.current) setSaveError(e?.message || "La production n'a pas pu être journalisée.");
          triggerSaveStatus('error');
      }
  };

  // --- AI LOGIC HELPERS ---

  /**
   * Le tour utilisateur des actions dont TOUTE la matière est dans le prompt
   * système. Il ne peut pas être vide : Anthropic écarte un message sans
   * contenu, et OpenRouter transmet alors une conversation de zéro message —
   * « messages: at least one message is required ». 1min.ai ne l'avait jamais
   * signalé parce qu'il aplatit tout en un prompt unique.
   *
   * Ces phrases ne portent aucune consigne : elles nomment la tâche, comme le
   * « Relis ce contenu. » du Lecteur froid le faisait déjà.
   */
  const TOUR_UTILISATEUR = {
      ADJUST_CONTENT: 'Applique l’ajustement demandé.',
      GENERATE_CARROUSEL_SLIDES: 'Produis les slides.',
      ADJUST_DZINE_PROMPTS: 'Ajuste les prompts d’image.',
  } as const;

  /**
   * Le point de passage UNIQUE de tous les appels IA de l'éditeur — et donc le
   * seul endroit où poser le témoin qui les rend visibles. L'action est passée
   * explicitement : sans elle le bandeau ne pourrait dire que « ça travaille »,
   * ce qui n'est pas ce qu'on veut savoir.
   */
  const callAI = async (
      action: keyof typeof AI_ACTIONS,
      model: string,
      systemInstruction: string,
      prompt: string,
      _config?: any,
  ) => {
      const fiche = AI_ACTION_CATALOG.find(a => a.id === action);
      appelsEnCours.current += 1;
      setAppelIA({
          label: fiche?.label ?? String(action),
          persona: fiche?.persona ?? '',
          modele: modelLabel(model),
          debut: Date.now(),
      });
      try {
          return await AiService.generateContent({
              modelId: model,
              systemInstruction: systemInstruction,
              prompt: prompt,
              // Le libellé voyage avec l'appel : c'est lui qui titre le message
              // d'échec, et « Échec — Relecture à froid » vaut mieux qu'« Erreur ».
              action: fiche?.label ?? String(action),
          });
      } finally {
          appelsEnCours.current -= 1;
          if (appelsEnCours.current <= 0) {
              appelsEnCours.current = 0;
              setAppelIA(null);
          }
      }
  };

  // --- CONVERSATION COACH (SPEC §2.7) ---

  /**
   * Un message de plus dans la conversation. L'écriture est un INSERT, pas la
   * réécriture d'un blob : un échec au mauvais moment ne peut plus emporter
   * les messages précédents.
   *
   * La vue locale est mise à jour d'abord — la conversation ne doit pas
   * attendre le réseau pour s'afficher.
   */
  const handleCoachMessage = async (message: CoachMessage) => {
      if (!isMountedRef.current || !editedItem) return;

      const premierMessage = (coachSessionState?.messages.length ?? 0) === 0;
      setCoachSessionState(prev => {
          const base = prev ?? createEmptySession(editedItem.targetFormat as TargetFormat | null);
          return { ...base, messages: [...base.messages, message] };
      });

      try {
          await Api.appendCoachMessage(editedItem.id, {
              role: message.role,
              content: message.content,
              raw: message.raw,
              quickReplies: message.quickReplies,
              readyForEditor: message.readyForEditor,
          });
          // Le format cible pour lequel la session est calibrée n'a de sens
          // qu'une fois : au premier message (SPEC §2.7).
          if (premierMessage) {
              await Api.updateCoach(editedItem.id, {
                  status: 'in_progress',
                  formatCible: editedItem.targetFormat,
              });
          }
          triggerSaveStatus('saved');
      } catch (e: any) {
          if (isMountedRef.current) setSaveError(e?.message || "Le message n'a pas pu être enregistré.");
          triggerSaveStatus('error');
      }
  };

  /**
   * Rouvre une session validée. Le seul effet est de rendre l'atelier
   * utilisable à nouveau : ni la conversation ni le brouillon ne bougent.
   *
   * Cette porte manquait, et son absence coûtait cher : validé une fois, le
   * chat était en lecture seule pour toujours, et une rédaction qui échouait
   * derrière laissait la publication sans aucune action possible.
   */
  const handleCoachReopen = async () => {
      if (!isMountedRef.current || !editedItem) return;
      setCoachSessionState(prev => (prev ? { ...prev, status: 'in_progress', validatedAt: null } : prev));
      try {
          await Api.updateCoach(editedItem.id, { status: 'in_progress' });
          triggerSaveStatus('saved');
      } catch (e: any) {
          if (isMountedRef.current) setSaveError(e?.message || "La session n'a pas pu être rouverte.");
          triggerSaveStatus('error');
      }
  };

  /**
   * Réinitialise la session : la conversation sort de la vue et l'état repart
   * à zéro. Le brouillon n'est PAS touché — on jette l'atelier, pas le travail
   * qui en est sorti.
   */
  const handleCoachReset = async () => {
      if (!isMountedRef.current || !editedItem) return;
      await Api.resetCoach(editedItem.id);
      if (!isMountedRef.current) return;
      setCoachSessionState(createEmptySession(editedItem.targetFormat as TargetFormat | null));
      triggerSaveStatus('saved');
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
      let brief: string | null = null;
      try {
          brief = await generateLockedBrief({
              item: editedItem,
              session,
              modelId: modelFor('LOCK_BRIEF'),
              contexteSerie: serieContext,
          });
      } catch (e) {
          console.warn('Verrouillage du brief impossible — fallback session brute.', e);
      }
      if (!isMountedRef.current) return;

      const validated: CoachSession = {
          ...session,
          status: 'validated',
          validatedAt: Date.now(),
          brief: brief ?? session.brief,
      };
      setCoachSessionState(validated);

      try {
          await Api.updateCoach(editedItem.id, { status: 'validated', brief: validated.brief });
          if (brief) await journalise({ kind: 'brief', payload: brief, modelId: modelFor('LOCK_BRIEF') });
          triggerSaveStatus('saved');
      } catch (e: any) {
          if (isMountedRef.current) setSaveError(e?.message || "La validation n'a pas pu être enregistrée.");
          triggerSaveStatus('error');
      }

      // La session est passée explicitement : `coachSessionState` vient d'être
      // posé dans ce même tour de rendu, il serait encore périmé ici.
      await executeDrafting(editedItem, validated);
  };

  // --- AI ACTIONS EXECUTORS (modèle actif global, plus de contexte) ---

  /**
   * Relecture "Lecteur Froid" : le contenu final est relu par un persona en
   * contexte vierge (ni notes, ni atelier, ni brief) qui répond en inconnu.
   * Échec silencieux : la relecture ne bloque jamais la rédaction.
   */
  const executeColdRead = async (item: ContentItem) => {
      const fmt = item.targetFormat;
      if (!fmt || !supportsColdRead(fmt as TargetFormat)) return;
      try {
          const raw = item.draft || "";
          const lastBrace = raw.lastIndexOf('}');
          const data = JSON.parse(lastBrace !== -1 ? raw.slice(0, lastBrace + 1) : raw);
          const plain = formatDraftContent(fmt as TargetFormat, data);
          if (!plain.trim()) return;

          const actionConfig = AI_ACTIONS.COLD_READ;
          const systemInstruction = actionConfig.getSystemInstruction(
              undefined,
              fmt,
              item.objectif || "Non défini",
              plain
          );
          const modeleRelecture = modelFor('COLD_READ');
          const responseText = await callAI('COLD_READ', modeleRelecture, systemInstruction, "Relis ce contenu.", actionConfig.generationConfig);
          const report = JSON.parse(extractJsonPayload(responseText));
          if (isMountedRef.current && report && report.lecture_naive) {
              setColdRead(report as ColdReadReport);
              setColdReadMeta({ at: Date.now(), modelLabel: modelLabel(modeleRelecture) });
              // Journalisée sans être appliquée : une relecture ne vise aucune
              // colonne, mais c'est un fait daté qu'on veut pouvoir relire.
              Api.recordGeneration(item.id, {
                  kind: 'cold_read', modelId: modeleRelecture || null, modelLabel: modelLabel(modeleRelecture),
                  payload: JSON.stringify(report),
              }).catch((e) => {
                  // Sans cette ligne en base, le rapport ne survit pas à la
                  // fermeture du panneau : c'est exactement la perte qu'on répare.
                  console.warn('Relecture non journalisée :', e);
                  if (isMountedRef.current) setSaveError(
                      "La relecture à froid n'a pas pu être enregistrée : elle disparaîtra en quittant ce contenu."
                  );
                  triggerSaveStatus('error');
              });
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
          setColdReadMeta(null);
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
          const responseText = await callAI('ADJUST_CONTENT', modelFor('ADJUST_CONTENT'), systemInstruction, TOUR_UTILISATEUR.ADJUST_CONTENT, adjustConfig.generationConfig);
          const adjusted = parseDraftResponse(responseText);
          // On garde la version ajustée même si un léger dépassement subsiste (une seule passe)
          result = appendSignatureSlide(adjusted, SIGNATURE_SLIDE);
      } catch (e) {
          console.warn('Ajustement automatique des longueurs impossible — trame conservée telle quelle.', e);
      }
      return result;
  };

  const executeDrafting = async (itemArg?: ContentItem, sessionArg?: CoachSession | null) => {
      if (!isMountedRef.current) return;
      const base = itemArg ?? editedItem;
      if (!base) return;
      setIsGenerating(true);
      // Une rédaction neuve périme la relecture : elle jugeait le texte d'avant.
      setColdRead(null);
      setColdReadMeta(null);
      try {
          const actionConfig = AI_ACTIONS.DRAFT_CONTENT;
          // Le contexte de série n'arrive qu'au moment de rédiger : c'est là
          // que l'anti-répétition compte (SPEC §6.4).
          const systemInstruction = actionConfig.getSystemInstruction(
              undefined,
              base.targetFormat || undefined,
              base.objectif || undefined,
              serieContext
          );

          const promptPayload: Record<string, unknown> = {
              titre: base.title || "Non défini",
              format_cible: base.targetFormat || "Non défini",
              objectif: base.objectif || "Non défini",
              angle_strategique: base.strategicAngle || "Non défini",
              metaphore_suggeree: base.suggestedMetaphor || "Non défini",
              notes: base.notes || "",
          };

          // L'angle propre du contenu dans sa série : c'est SON territoire,
          // celui que le plan lui a attribué.
          if (base.angle) promptPayload.angle_dans_la_serie = base.angle;

          // Matière : brief verrouillé en priorité, sinon session brute (legacy)
          // Chargée à l'ouverture de l'éditeur (SPEC §3.2)
          const coachSession = sessionArg ?? coachSessionState;
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

          const modeleRedaction = modelFor('DRAFT_CONTENT');
          const responseText = await callAI('DRAFT_CONTENT', modeleRedaction, systemInstruction, JSON.stringify(promptPayload), actionConfig.generationConfig);
          let finalContent = parseDraftResponse(responseText);

          // Carrousel : slide Signature (code) + contrôle déterministe des longueurs
          const isCarrousel = base.targetFormat === TargetFormat.CARROUSEL_SLIDE;
          if (isCarrousel) {
              finalContent = await enforceCarrouselConstraints(finalContent);
          }

          // Une seule destination, quel que soit le format (SPEC §2.5), et du
          // JSON PUR : la provenance part au journal, pas dans la colonne.
          const previousValue = base.draft || "";
          const newItem = { ...base, draft: finalContent };

          if (isMountedRef.current) {
              setEditedItem(newItem);
              if (previousValue) setLastGeneration({ field: 'draft', previousValue, label: `Rédaction régénérée par ${modelLabel(modeleRedaction)}` });
              // Le brouillon a changé : les slides déjà produites ne collent plus
              if (base.slides) setSlidesStale(true);
              await journalise({ kind: 'draft', target: 'draft', payload: finalContent, modelId: modeleRedaction });
              await saveWithStatus(newItem);
              // Où atterrir après la rédaction : déclaré par format dans le registre
              onStepChange(getEditorTab(base.targetFormat as TargetFormat));

              // Relecture "Lecteur Froid" (non bloquante) sur le contenu fraîchement rédigé
              await executeColdRead(newItem);
          }
      } catch (error: any) {
          // L'échec d'appel est déjà annoncé par le passage obligé ; ici on ne
          // rattrape que ce qui a cassé APRÈS la réponse — un parsing, une écriture.
          if (isMountedRef.current && !AiService.estSignalee(error)) setAlertInfo({ isOpen: true, title: "Rédaction impossible", message: error.message, type: "error" });
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
              editedItem?.draft || "Non défini"
          );

          const modeleSlides = modelFor('GENERATE_CARROUSEL_SLIDES');
          const responseText = await callAI('GENERATE_CARROUSEL_SLIDES', modeleSlides, systemInstruction, TOUR_UTILISATEUR.GENERATE_CARROUSEL_SLIDES, actionConfig.generationConfig);

          const cleaned = sanitizeSlidesResponse(responseText);

          const previousValue = editedItem?.slides || "";
          const newItem = { ...editedItem!, slides: cleaned };
          if (isMountedRef.current) {
              setEditedItem(newItem);
              if (previousValue) setLastGeneration({ field: 'slides', previousValue, label: `Slides régénérées par ${modelLabel(modeleSlides)}` });
              setSlidesStale(false);
              await journalise({ kind: 'slides', target: 'slides', payload: cleaned, modelId: modeleSlides });
              await saveWithStatus(newItem);
          }
      } catch (error: any) {
          if (isMountedRef.current && !AiService.estSignalee(error)) setAlertInfo({ isOpen: true, title: "Slides impossibles", message: error.message, type: "error" });
      } finally {
          if (isMountedRef.current) setIsGenerating(false);
      }
  };

  /**
   * Champ réellement affiché dans l'onglet courant — c'est celui que
   * "Ajuster" doit modifier. Sans ce routage, ajuster un carrousel
   * réécrivait le brouillon et laissait les slides inchangées.
   */
  const getAdjustmentField = (): 'draft' | 'slides' =>
      activeStep === 'slides' && editedItem?.slides ? 'slides' : 'draft';

  // --- ADJUSTMENT (Refinement Loop) ---

  /** Rend le verdict de l'ajustement : l'appelant doit pouvoir décider APRÈS. */
  const launchAdjustment = (adjustmentText: string): Promise<boolean> =>
      executeAdjustment(adjustmentText);

  const executeAdjustment = async (adjustmentText: string): Promise<boolean> => {
      if (!isMountedRef.current || !adjustmentText.trim()) return false;
      setIsGenerating(true);
      try {
          const actionConfig = AI_ACTIONS.ADJUST_CONTENT;
          // On ajuste ce que Florent a sous les yeux, pas un champ deviné :
          // l'onglet Slides affiche `slides`, pas `body`.
          const targetField = getAdjustmentField();
          const currentContent = editedItem?.[targetField] || "";

          const systemInstruction = actionConfig.getSystemInstruction(
              undefined, // pas de contexte Notion additionnel
              currentContent,
              adjustmentText
          );

          const modeleAjustement = modelFor('ADJUST_CONTENT');
          const responseText = await callAI(
              'ADJUST_CONTENT',
              modeleAjustement,
              systemInstruction,
              TOUR_UTILISATEUR.ADJUST_CONTENT,
              actionConfig.generationConfig
          );

          // Sur les slides on valide la structure : plutôt lever une erreur que
          // remplacer un carrousel correct par une réponse illisible.
          const cleaned = targetField === 'slides'
              ? sanitizeSlidesResponse(responseText)
              : responseText.replace(/```json\s?/g, '').replace(/```\s?/g, '').trim();

          const previousValue = currentContent;
          const newItem = { ...editedItem!, [targetField]: cleaned };

          if (isMountedRef.current) {
              setEditedItem(newItem);
              if (previousValue) setLastGeneration({ field: targetField, previousValue, label: `Ajustement appliqué par ${modelLabel(modeleAjustement)}` });
              // Ajuster le brouillon périme les slides ; ajuster les slides les remet à jour
              if (targetField === 'slides') setSlidesStale(false);
              else if (editedItem?.slides) setSlidesStale(true);
              // L'instruction fait partie du fait daté : sans elle, on relit un
              // texte modifié sans savoir ce qu'on avait demandé.
              await journalise({ kind: 'adjustment', target: targetField, payload: cleaned, instruction: adjustmentText, modelId: modeleAjustement });
              await saveWithStatus(newItem);
          }
          return true;
      } catch (error: any) {
          if (isMountedRef.current && !AiService.estSignalee(error)) setAlertInfo({ isOpen: true, title: "Ajustement impossible", message: error.message, type: "error" });
          return false;
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

          const modelePrompts = modelFor('ADJUST_DZINE_PROMPTS');
          const responseText = await callAI(
              'ADJUST_DZINE_PROMPTS',
              modelePrompts,
              systemInstruction,
              TOUR_UTILISATEUR.ADJUST_DZINE_PROMPTS,
              actionConfig.generationConfig
          );

          const cleaned = sanitizeSlidesResponse(responseText);
          const cible = slideNumero === null ? 'toutes les slides' : `la slide ${slideNumero}`;

          const newItem = { ...editedItem, slides: cleaned };
          if (isMountedRef.current) {
              setEditedItem(newItem);
              await journalise({
                  kind: 'adjustment', target: 'slides', payload: cleaned,
                  instruction: `Prompts d'image, ${cible} : ${instruction}`,
                  modelId: modelePrompts,
              });
              await saveWithStatus(newItem);
          }
      } catch (error: any) {
          if (isMountedRef.current && !AiService.estSignalee(error)) setAlertInfo({ isOpen: true, title: "Ajustement des prompts impossible", message: error.message, type: "error" });
      } finally {
          if (isMountedRef.current) setIsGenerating(false);
      }
  };

  // --- TRIGGER HANDLERS (exécution directe avec le modèle actif) ---

  const triggerDrafting = () => { void executeDrafting(); };

  const triggerCarrouselSlides = () => { void executeCarrouselSlides(); };

  // --- UI HELPERS ---

  const getVerdictColor = (verdict?: string | null) => {
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
          <span className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-medium">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Non enregistré
              <button
                  onClick={retrySave}
                  disabled={isSaving}
                  className="underline font-bold hover:text-red-800 dark:hover:text-red-200 disabled:opacity-50"
              >
                  Réessayer
              </button>
          </span>
      );
      return null;
  };

  /** Situe la publication dans sa série, et permet d'enchaîner sans repasser par le plan. */
  const SerieBanner = serieNav ? (
      <div className="flex items-center gap-3 flex-wrap px-4 md:px-6 py-2 bg-violet-50 dark:bg-violet-900/20 border-b border-violet-200 dark:border-violet-800/50 text-xs text-violet-900 dark:text-violet-100">
          <button
              onClick={onOpenSerie}
              className="flex items-center gap-1.5 font-bold hover:underline shrink-0"
              title="Revenir au plan de la série"
          >
              <Layers className="w-3.5 h-3.5" />
              {serieNav.titre}
          </button>
          {serieNav.position !== null && (
              <span className="text-violet-700/80 dark:text-violet-200/70 shrink-0">
                  publication {serieNav.position} sur {serieNav.total}
              </span>
          )}
          <div className="ml-auto flex items-center gap-1 shrink-0">
              <button
                  onClick={() => serieNav.precedent && onOpenSerieContent?.(serieNav.precedent)}
                  disabled={!serieNav.precedent}
                  title={serieNav.precedent ? `Précédente : ${serieNav.precedent.title}` : 'Première de la série'}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg font-medium hover:bg-violet-100 dark:hover:bg-violet-900/40 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                  <ChevronLeft className="w-3.5 h-3.5" /> Précédente
              </button>
              <button
                  onClick={() => serieNav.suivant && onOpenSerieContent?.(serieNav.suivant)}
                  disabled={!serieNav.suivant}
                  title={serieNav.suivant ? `Suivante : ${serieNav.suivant.title}` : 'Dernière de la série'}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg font-medium hover:bg-violet-100 dark:hover:bg-violet-900/40 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                  Suivante <ChevronRight className="w-3.5 h-3.5" />
              </button>
          </div>
      </div>
  ) : null;

  /** Bandeau sous l'en-tête : appel IA en cours, échec de sauvegarde, annulation de génération. */
  const EditorBanner = (SerieBanner || appelIA || saveStatus === 'error' || lastGeneration) ? (
      <div className="flex flex-col">
          {SerieBanner}
          {/* Le témoin d'appel IA. Il nomme l'action, le persona et le MODÈLE :
              savoir qu'« il se passe quelque chose » ne suffit pas quand on
              vient de changer de fournisseur et qu'on doute de son choix. */}
          {appelIA && (
              <div className="flex items-center gap-3 flex-wrap px-4 md:px-6 py-2 bg-brand-light dark:bg-dark-sec-bg border-b border-brand-border dark:border-dark-sec-border text-xs text-brand-main dark:text-dark-text">
                  <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                  <span className="flex-1 min-w-0">
                      <strong className="font-bold">{appelIA.label}</strong>
                      {appelIA.persona ? ` — ${appelIA.persona}` : ''}
                      <span className="text-brand-main/60 dark:text-dark-text/60"> · {appelIA.modele}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-brand-main/60 dark:text-dark-text/60">
                      {secondesIA} s
                  </span>
              </div>
          )}
          {saveStatus === 'error' && (
              <div className="flex items-center gap-3 flex-wrap px-4 md:px-6 py-2 bg-red-50 dark:bg-red-900/25 border-b border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-200">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="flex-1 min-w-0">
                      <strong className="font-bold">Ce contenu n'est pas enregistré dans Notion</strong>
                      {saveError ? ` (${saveError})` : ''}. Il n'existe que sur cet appareil.
                  </span>
                  <button
                      onClick={retrySave}
                      disabled={isSaving}
                      className="shrink-0 underline font-bold hover:text-red-950 dark:hover:text-white disabled:opacity-50"
                  >
                      {isSaving ? 'Enregistrement…' : 'Réessayer'}
                  </button>
              </div>
          )}
          {lastGeneration && (
              <div className="flex items-center gap-3 flex-wrap px-4 md:px-6 py-2 bg-blue-50 dark:bg-blue-900/25 border-b border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-200">
                  <Undo2 className="w-4 h-4 shrink-0" />
                  <span className="flex-1 min-w-0">{lastGeneration.label} — la version précédente est encore récupérable.</span>
                  <button
                      onClick={undoLastGeneration}
                      disabled={isGenerating || isSaving}
                      className="shrink-0 underline font-bold hover:text-blue-950 dark:hover:text-white disabled:opacity-50"
                  >
                      Revenir à la version précédente
                  </button>
                  <button
                      onClick={() => setLastGeneration(null)}
                      className="shrink-0 text-blue-500 hover:text-blue-800 dark:hover:text-blue-100"
                      title="Masquer"
                  >
                      <X className="w-3.5 h-3.5" />
                  </button>
              </div>
          )}
      </div>
  ) : null;

  // ── Onglets dynamiques — TOUJOURS visibles selon le format (pas de gating sur le contenu) ──
  const _isVideoFmt = getEditorTab(editedItem.targetFormat as TargetFormat) === 'script';
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
            bannerContent={EditorBanner}
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
                    slidesStale={slidesStale}
                    coachSession={coachSessionState}
                    serieContext={serieContext}
                    onChangeStatus={changeStatus}
                    onSave={onSave}
                    isGenerating={isGenerating}
                    aiModels={aiModels}
                    activeModelId={modelFor('COACH_CHAT')}
                    onCoachMessage={handleCoachMessage}
                    onCoachValidate={handleCoachValidate}
                    onCoachReopen={handleCoachReopen}
                    onCoachReset={handleCoachReset}
                    activeTab={activeStep}
                    onTabChange={onStepChange}
                    coldRead={coldRead}
                    coldReadMeta={coldReadMeta}
                    onDismissColdRead={() => { setColdRead(null); setColdReadMeta(null); }}
                    onRunColdRead={triggerColdRead}
                />
            )}

            {(editedItem.status === ContentStatus.READY || editedItem.status === ContentStatus.PUBLISHED) && (
                <PreviewView 
                    item={editedItem}
                    onChangeStatus={changeStatus}
                    onDecline={onDecline ? () => onDecline(editedItem) : undefined}
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
