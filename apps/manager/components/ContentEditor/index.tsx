import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ContentItem, ContentStatus, AIModel, TargetFormat, CoachSession, CoachMessage } from '../../types';
import type { ResumeFil, ResumeMontage, UsageIA } from '@luminose/shared';
import { SIGNATURE_SLIDE } from '../../constants';
import * as AiService from '../../services/aiService';
import { generateLockedBrief, createEmptySession } from '../../services/coachService';
import { AlertModal, ConfirmModal } from '../CommonModals';
import { useActionIA } from '../Feedback';
import { AI_ACTIONS, AI_ACTION_CATALOG } from '@luminose/editorial';
import { getEditorTab, supportsColdRead, getFormatDef, parseBodyJson, bodyJsonToText } from '@luminose/editorial';
import {
    getFormatPromptTemplate, getObjectifCtaRules,
    buildColdReadHistorySection, buildColdReadApplyInstruction, isColdReadApplyInstruction, stripColdReadApplyPrefix,
    etapeCourante, etapesDuSelecteur, etapeDEcriture, composerLeFil, NOMS_DES_ETAPES,
    type Etape, type GenerationDuFil, type GesteDuFil, type RoleDuFil,
} from '@luminose/editorial';
import * as Api from '../../services/apiService';
import {
    parseDraftResponse, sanitizeSlidesResponse,
    extractJsonPayload, formatDraftContent,
    appendSignatureSlide, findSlideLengthIssues, SLIDE_TITLE_MAX, SLIDE_TEXT_MAX
} from '@luminose/editorial';

import { CadreContenu, PiedContenu, SelecteurEtape } from '../Contenu/CadreContenu';
import { Fil, type ZoneComposeur, type ZoneOuverture } from '../Contenu/Fil';
import { EnteteMatiere, MatiereOuverture, MatiereVide, BlocPublier, type ActionMatiere } from '../Contenu/Matiere';
import { CeQuiSeraPublie, LectureScript, LectureTournage, TrameCarrousel, VignettesSlides } from '../Contenu/Lecture';
import { useAtelier } from '../Contenu/useAtelier';
import { useEstMobile } from '../Contenu/useEstMobile';
import { BodyRenderer } from './renderers/BodyRenderer';
import { SlidesRenderer } from './renderers/SlidesRenderer';
import { Studio } from '../Contenu/Studio';
import type { OngletStudio } from '../Video/PanneauMontage';
import { MessageCircle, X } from 'lucide-react';
import { Bouton, ControleSegmente, Etiquette, type EntreeMenu } from '../ui';

/** Le rapport du Lecteur froid, tel que le journal le garde (SPEC §2.6). */
export interface ColdReadReport {
    lecture_naive: { sujet?: string; auteur?: string; action?: string; decrochage?: string | null };
    controles?: Array<{ regle: string; statut: 'OK' | 'KO'; detail?: string }>;
    problemes?: Array<{ gravite: 'Bloquant' | 'Important' | 'Détail'; localisation?: string; probleme: string; correction_proposee?: string }>;
    verdict?: 'Publiable' | 'À retoucher' | 'À revoir' | string;
}

/** L'étape affichée : celle du sélecteur (SPEC §13.9). */
export type EditorStep = Etape;

interface ContentEditorProps {
  item: ContentItem | null;
  aiModels: AIModel[];
  /** Modèle IA actif global — repli des actions sans preset. */
  activeModelId: string;
  /** Le modèle réglé pour une action donnée (Réglages → Modèles IA). */
  modelFor: (action: string) => string;
  onClose: () => void;
  /** Le libellé du retour : la liste d'où l'on vient (SPEC §13.4). */
  libelleRetour: string;
  onSave: (item: ContentItem) => Promise<void>;
  onDelete?: (item: ContentItem) => Promise<void>;
  /** « Décliner » : ce contenu devient le pilier d'une nouvelle série (SPEC §6.3). */
  onDecline?: (item: ContentItem) => void;
  /**
   * Contexte de série pour le Rédacteur (SPEC §6.4) — composé en amont par
   * @luminose/editorial. `undefined` quand le contenu n'appartient à aucune série.
   */
  serieContext?: string;
  /** Le panneau Série, à gauche du fil, quand le contenu en a une. */
  panneauSerie?: React.ReactNode;
  /** L'étape affichée, et le geste qui en change. */
  activeStep: Etape;
  onStepChange: (etape: Etape) => void;
  /** Ce que les listes savent du fil et du montage de ce contenu. */
  resumeFil?: ResumeFil | null;
  resumeMontage?: ResumeMontage | null;
  /** Le montage a changé dans le studio : le résumé, et donc l'étape, sont à relire. */
  onMontageChange?: () => void;
  /** « Demander l'ouverture à l'Analyste » : l'analyse d'une idée, à la demande. */
  onAnalyser?: () => void;
  analyseEnCours?: boolean;
}

// extractJsonPayload, parseDraftResponse, parseAIResponse → ai/executors.ts

// bodyJsonToText est maintenant centralisé dans ai/formats.ts
// Ré-exporté ici pour backward compat avec les anciens imports
export { bodyJsonToText } from '@luminose/editorial';

// parseAIResponse → ai/executors.ts

const ContentEditor: React.FC<ContentEditorProps> = ({
    item, aiModels = [], activeModelId, modelFor, onClose, libelleRetour, onSave, onDelete, onDecline, serieContext,
    panneauSerie, activeStep, onStepChange, resumeFil, resumeMontage, onMontageChange, onAnalyser, analyseEnCours,
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

  /**
   * Ce que ce contenu a coûté en IA (SPEC §2.6). Il arrive avec le détail —
   * une agrégation de plus dans une route qui en faisait déjà deux, plutôt
   * qu'un aller-retour dédié.
   */
  const [cout, setCout] = useState<Api.CoutContenu | null>(null);

  /**
   * Le fil (SPEC §13.10) : le journal des productions et les gestes datés. Ils
   * arrivent avec l'ouverture, et le journal se relit après chaque production —
   * c'est lui que le fil rend lisible.
   */
  const [journal, setJournal] = useState<GenerationDuFil[]>([]);
  const [gestes, setGestes] = useState<GesteDuFil[]>([]);

  const relireLeJournal = async (contentId: string) => {
      try {
          const { generations } = await Api.fetchGenerations(contentId, undefined, 50);
          if (isMountedRef.current) setJournal((generations ?? []).map(g => ({
              id: g.id, kind: g.kind, target: g.target ?? null, instruction: g.instruction ?? null,
              payload: g.payload, createdAt: g.createdAt,
          })));
      } catch (e) {
          console.warn('Journal non relu :', e);
      }
  };

  useEffect(() => {
      if (!item?.id) { setCoachSessionState(null); setCout(null); setJournal([]); setGestes([]); return; }
      let annule = false;
      // On VIDE avant de charger. Sans ça, entre le changement de contenu et la
      // réponse du serveur, l'atelier affiche la session du contenu précédent —
      // et tout ce qu'on y écrit part sur le nouveau.
      setCoachSessionState(null);
      setCout(null);
      setJournal([]);
      setGestes([]);
      Api.fetchContent(item.id)
          .then(({ coachSession, cout, gestes }) => {
              if (annule) return;
              setCoachSessionState(coachSession);
              setCout(cout ?? null);
              setGestes(gestes ?? []);
          })
          .catch((e) => console.error('Chargement de la session Coach :', e));
      void relireLeJournal(item.id);
      return () => { annule = true; };
  }, [item?.id]);

  const [confirmDelete, setConfirmDelete] = useState(false);
  /** Jeter l'atelier se confirme : c'est au moment où il s'est mal passé qu'on voudra peut-être le relire (SPEC §2.7). */
  const [confirmReset, setConfirmReset] = useState(false);

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

  // L'étape ne se choisit plus ici : elle arrive calculée par l'application,
  // d'où qu'on vienne (SPEC §13.4). L'éditeur ne fait que suivre le contenu.
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
            setEditionManuelle(null);
            setVersLeCoach(false);
        } else {
            setEditedItem(prev => prev ? { ...prev, ...item } : item);
        }
    }
  }, [item]);

  /** La retouche à la main d'un brouillon : le texte en cours, ou `null`. */
  const [editionManuelle, setEditionManuelle] = useState<string | null>(null);
  /** Avec un brouillon, le composeur parle au Rédacteur ; « Parler au Coach » rouvre l'atelier. */
  const [versLeCoach, setVersLeCoach] = useState(false);
  /** Au studio, le fil se replie derrière un bouton du bandeau (SPEC §13.11). */
  const [filOuvert, setFilOuvert] = useState(false);
  /** « Déposer la prise », depuis le Tournage, ouvre le studio sur l'onglet Prise. */
  const [ongletDEntree, setOngletDEntree] = useState<OngletStudio | undefined>(undefined);
  /**
   * Sur téléphone, le contenu se lit en deux onglets (SPEC §13.13). `null` :
   * celui de l'étape — le fil, sauf au Tournage, qui se lit en plein écran.
   */
  const [vueMobile, setVueMobile] = useState<'fil' | 'matiere' | null>(null);
  const mobile = useEstMobile();

  /*
   * Le témoin d'appel IA ne vit plus ici.
   *
   * Il était posé dans `callAI`, seul passage des appels DE L'ÉDITEUR — ce qui
   * laissait muets ceux de l'Analyste, de l'Éclateur et du découpage de
   * sous-titres. Il est descendu dans `aiService.generateContent`, par où
   * passent les sept appelants, et remonte dans la coque de l'application :
   * un appel reste donc visible même quand on quitte l'écran qui l'a lancé
   * (SPEC §3.5.1). Voir `services/activityService.ts`.
   */

  // isDirty : vrai si editedItem diffère de l'item source
  const isDirty = !!editedItem && !!item && JSON.stringify(editedItem) !== JSON.stringify(item);

  /**
   * Plus de bouton « Enregistrer » (SPEC §13.9) : ce qu'on tape — titre, notes,
   * format — part tout seul, une seconde après la dernière frappe. Les
   * productions de l'IA, elles, s'enregistrent déjà en arrivant.
   */
  useEffect(() => {
      if (!isDirty || isGenerating || isSaving || !editedItem) return;
      const minuteur = setTimeout(() => { void saveWithStatus(editedItem); }, 1000);
      return () => clearTimeout(minuteur);
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editedItem, isDirty, isGenerating, isSaving]);

  const atelier = useAtelier({
      item: editedItem,
      session: coachSessionState ?? createEmptySession((editedItem?.targetFormat ?? null) as TargetFormat | null),
      modelId: modelFor('COACH_CHAT'),
      aiModels,
      contexteSerie: serieContext,
      onMessage: (m) => handleCoachMessage(m),
      onValider: (session) => handleCoachValidate(session),
  });

  const actionIA = useActionIA();

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

  /** Retourne true si le serveur a bien accepté l'écriture. Ne lève jamais. */
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
          if (isMountedRef.current) setSaveError(e?.message || "Le serveur a refusé l'enregistrement.");
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
   * « Revenir à la version précédente », depuis le fil (SPEC §13.10) : la
   * dernière écriture du brouillon ou des slides cède la place à celle d'avant.
   * Comme l'annulation d'avant, elle passe par le journal et AJOUTE une ligne —
   * annuler l'annulation reste possible.
   */
  const revenirALaVersionPrecedente = async () => {
      if (!editedItem || isGenerating || isSaving) return;
      const ecritures = journal
          .filter(g => g.target === 'draft' || g.target === 'slides')
          .sort((a, b) => b.createdAt - a.createdAt);
      const derniere = ecritures[0];
      const precedente = derniere && ecritures.find(g => g.target === derniere.target && g.id !== derniere.id);
      if (!derniere || !precedente) return;
      try {
          await Api.revertGeneration(editedItem.id, precedente.id);
          const restored = { ...editedItem, [derniere.target as 'draft' | 'slides']: precedente.payload };
          setEditedItem(restored);
          setLastGeneration(null);
          await saveWithStatus(restored);
          void relireLeJournal(editedItem.id);
      } catch (e: any) {
          setAlertInfo({ isOpen: true, title: 'Retour impossible', message: e?.message || 'La version précédente n’a pas pu être reprise.', type: 'error' });
      }
  };

  const changeStatus = async (newStatus: ContentStatus, scheduledDate?: string): Promise<boolean> => {
      if (isSaving || !editedItem) return false;
      const avant = editedItem.status;
      const newItem = { ...editedItem, status: newStatus };
      if (scheduledDate !== undefined) {
          newItem.scheduledDate = scheduledDate;
      }
      setEditedItem(newItem);
      const ok = await saveWithStatus(newItem);
      // Le Worker date le geste (SPEC §13.6) ; le fil l'affiche sans attendre de le relire.
      if (ok && avant !== newStatus && isMountedRef.current) {
          setGestes(prev => [...prev, { statut: newStatus, avant, le: Date.now() }]);
      }
      return ok;
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
      /** Ce que l'appel a coûté. Absent pour une reprise, qui ne consomme rien. */
      usage?: UsageIA;
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
              promptTokens: input.usage?.entree ?? null,
              completionTokens: input.usage?.sortie ?? null,
              costUsd: input.usage?.coutUsd ?? null,
              apply: !!input.target,
          });
          void relireLeJournal(editedItem.id);
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
   * Le point de passage unique des appels IA de l'éditeur. Il ne sert plus qu'à
   * une chose : traduire l'identifiant d'action en LIBELLÉ. C'est ce libellé qui
   * titre le bandeau d'attente et le message d'échec — « Échec — Relecture à
   * froid » vaut mieux qu'« Erreur ». Le témoin, lui, se pose dans le service.
   */
  const callAI = async (
      action: keyof typeof AI_ACTIONS,
      model: string,
      systemInstruction: string,
      prompt: string,
      _config?: any,
  ) => {
      const fiche = AI_ACTION_CATALOG.find(a => a.id === action);
      return AiService.generateContent({
          modelId: model,
          systemInstruction: systemInstruction,
          prompt: prompt,
          action: fiche?.label ?? String(action),
          // L'identifiant technique, en plus du libellé : c'est lui qui décide
          // de la feuille de salle jointe au prompt côté Worker.
          aiAction: String(action),
          // Posé ici plutôt que chez les six appelants de `callAI`, pour la
          // raison habituelle : six endroits, six occasions de l'oublier.
          format: editedItem?.targetFormat ?? undefined,
      });
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
      let usageBrief: UsageIA | undefined;
      try {
          const verrou = await generateLockedBrief({
              item: editedItem,
              session,
              modelId: modelFor('LOCK_BRIEF'),
              contexteSerie: serieContext,
          });
          brief = verrou.brief;
          usageBrief = verrou.usage;
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
          if (brief) await journalise({ usage: usageBrief, kind: 'brief', payload: brief, modelId: modelFor('LOCK_BRIEF') });
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
  /**
   * Ce que les passes précédentes ont déjà obtenu, repris du journal.
   *
   * Sans ça, le Lecteur froid condamne à la passe N+1 la phrase qu'il a dictée
   * à la passe N — deux fois de suite le 24/08/2026 (voir coldRead.ts). Un
   * échec de lecture ne bloque pas la relecture : elle repart sans mémoire,
   * c'est-à-dire comme avant.
   */
  const lireHistoriqueRelectures = async (contentId: string): Promise<string> => {
      try {
          // Le journal rend le plus récent d'abord. On remonte le temps et on
          // S'ARRÊTE À LA DERNIÈRE RÉDACTION : au-delà, les corrections parlent
          // d'un texte qui n'existe plus — les annoncer comme présentes serait
          // faux, exactement pour la raison qui périme le rapport à l'écran.
          const { generations } = await Api.fetchGenerations(contentId, undefined, 12);
          const passes: string[] = [];
          for (const g of generations) {
              if (g.kind === 'draft') break;
              if (g.kind === 'adjustment' && isColdReadApplyInstruction(g.instruction)) {
                  passes.push(stripColdReadApplyPrefix(g.instruction ?? ''));
              }
          }
          return buildColdReadHistorySection(passes.reverse());
      } catch (e) {
          console.warn('Historique des relectures illisible — relecture sans mémoire.', e);
          return '';
      }
  };

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
          const historique = await lireHistoriqueRelectures(item.id);
          const systemInstruction = actionConfig.getSystemInstruction(
              fmt,
              item.objectif || "Non défini",
              plain,
              historique,
          );
          const modeleRelecture = modelFor('COLD_READ');
          const { text: responseText, usage } = await callAI('COLD_READ', modeleRelecture, systemInstruction, "Relis ce contenu.", actionConfig.generationConfig);
          const report = JSON.parse(extractJsonPayload(responseText));
          if (isMountedRef.current && report && report.lecture_naive) {
              setColdRead(report as ColdReadReport);
              setColdReadMeta({ at: Date.now(), modelLabel: modelLabel(modeleRelecture) });
              // Journalisée sans être appliquée : une relecture ne vise aucune
              // colonne, mais c'est un fait daté qu'on veut pouvoir relire.
              Api.recordGeneration(item.id, {
                  kind: 'cold_read', modelId: modeleRelecture || null, modelLabel: modelLabel(modeleRelecture),
                  payload: JSON.stringify(report),
                  promptTokens: usage.entree, completionTokens: usage.sortie, costUsd: usage.coutUsd,
              }).then(() => relireLeJournal(item.id)).catch((e) => {
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
   *
   * `sanitize` dépend du champ visé : la trame passe par `parseDraftResponse`,
   * les slides par `sanitizeSlidesResponse`, qui protège `prompt_dzine`.
   */
  const enforceCarrouselConstraints = async (
      content: string,
      sanitize: (raw: string) => string = parseDraftResponse,
  ): Promise<string> => {
      let result = appendSignatureSlide(content, SIGNATURE_SLIDE);
      const issues = findSlideLengthIssues(result);
      if (issues.length === 0) return result;

      const detail = issues
          .map(i => `slide ${i.numero} — ${i.champ} : ${i.longueur} caractères (max ${i.max})`)
          .join(' ; ');
      const instruction = `Raccourcis UNIQUEMENT les éléments suivants pour respecter les limites (titre ≤ ${SLIDE_TITLE_MAX} caractères, texte ≤ ${SLIDE_TEXT_MAX} caractères, espaces compris), sans perdre le sens ni la voix : ${detail}. Ne modifie rien d'autre. La slide "Signature" reste strictement identique.`;

      try {
          const adjustConfig = AI_ACTIONS.ADJUST_CONTENT;
          const systemInstruction = adjustConfig.getSystemInstruction(
              result, instruction,
              getFormatPromptTemplate(editedItem?.targetFormat as TargetFormat),
              getObjectifCtaRules(editedItem?.objectif),
          );
          const { text: responseText } = await callAI('ADJUST_CONTENT', modelFor('ADJUST_CONTENT'), systemInstruction, TOUR_UTILISATEUR.ADJUST_CONTENT, adjustConfig.generationConfig);
          const adjusted = sanitize(responseText);
          // On garde la version ajustée même si un léger dépassement subsiste (une seule passe)
          result = appendSignatureSlide(adjusted, SIGNATURE_SLIDE);
      } catch (e) {
          console.warn('Ajustement automatique des longueurs impossible — trame conservée telle quelle.', e);
      }
      return result;
  };

  /**
   * Ce qui se compte, compté par le code puis corrigé en UNE passe (SPEC §3.5.2
   * point 4, §12.3). Le format déclare ses contrôles au registre : l'éditeur ne
   * sait pas lequel il traite, et un format qui n'en déclare pas passe tel quel.
   *
   * Comme pour le carrousel, la version ajustée est gardée même s'il subsiste un
   * écart : l'écran du format affiche ce qui reste, et une seconde passe se
   * paierait sans garantie de faire mieux.
   */
  const appliquerControlesDuFormat = async (
      content: string,
      item: ContentItem,
      sanitize: (raw: string) => string = parseDraftResponse,
  ): Promise<string> => {
      const controler = getFormatDef(item.targetFormat)?.controler;
      if (!controler) return content;
      const corrections = controler(parseBodyJson(content));
      if (corrections.length === 0) return content;

      const instruction = `Corrige UNIQUEMENT les points suivants, relevés par le contrôle automatique du format, sans perdre le sens ni la voix : ${corrections.join(' ; ')}. Ne modifie rien d'autre.`;
      try {
          const adjustConfig = AI_ACTIONS.ADJUST_CONTENT;
          const systemInstruction = adjustConfig.getSystemInstruction(
              content, instruction,
              getFormatPromptTemplate(item.targetFormat as TargetFormat),
              getObjectifCtaRules(item.objectif),
          );
          const { text: responseText } = await callAI('ADJUST_CONTENT', modelFor('ADJUST_CONTENT'), systemInstruction, TOUR_UTILISATEUR.ADJUST_CONTENT, adjustConfig.generationConfig);
          return sanitize(responseText);
      } catch (e) {
          console.warn('Correction automatique du format impossible — trame conservée telle quelle.', e);
          return content;
      }
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
          const { text: responseText, usage } = await callAI('DRAFT_CONTENT', modeleRedaction, systemInstruction, JSON.stringify(promptPayload), actionConfig.generationConfig);
          let finalContent = parseDraftResponse(responseText);

          // Carrousel : slide Signature (code) + contrôle déterministe des longueurs
          const isCarrousel = base.targetFormat === TargetFormat.CARROUSEL_SLIDE;
          if (isCarrousel) {
              finalContent = await enforceCarrouselConstraints(finalContent);
          } else {
              finalContent = await appliquerControlesDuFormat(finalContent, base);
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
              await journalise({ usage, kind: 'draft', target: 'draft', payload: finalContent, modelId: modeleRedaction });
              await saveWithStatus(newItem);
              // L'écran passe à l'étape d'écriture une fois le brouillon arrivé (SPEC §13.10).
              onStepChange(etapeDEcriture(etapeCourante({ contenu: newItem }).sorte));

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
              editedItem?.suggestedMetaphor || "Non définie",
              editedItem?.draft || "Non défini"
          );

          const modeleSlides = modelFor('GENERATE_CARROUSEL_SLIDES');
          const { text: responseText, usage } = await callAI('GENERATE_CARROUSEL_SLIDES', modeleSlides, systemInstruction, TOUR_UTILISATEUR.GENERATE_CARROUSEL_SLIDES, actionConfig.generationConfig);

          const cleaned = sanitizeSlidesResponse(responseText);

          const previousValue = editedItem?.slides || "";
          const newItem = { ...editedItem!, slides: cleaned };
          if (isMountedRef.current) {
              setEditedItem(newItem);
              if (previousValue) setLastGeneration({ field: 'slides', previousValue, label: `Slides régénérées par ${modelLabel(modeleSlides)}` });
              setSlidesStale(false);
              await journalise({ usage, kind: 'slides', target: 'slides', payload: cleaned, modelId: modeleSlides });
              await saveWithStatus(newItem);
              onStepChange('slides');
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

          // La grille du format et les règles CTA voyagent avec la retouche : sans
          // elles, le Rédacteur réécrivait une slide en ignorant les limites qui
          // avaient gouverné sa propre production (SPEC §3.5.2).
          const systemInstruction = actionConfig.getSystemInstruction(
              currentContent,
              adjustmentText,
              getFormatPromptTemplate(editedItem?.targetFormat as TargetFormat),
              getObjectifCtaRules(editedItem?.objectif),
          );

          const modeleAjustement = modelFor('ADJUST_CONTENT');
          const { text: responseText, usage } = await callAI(
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

          // Le garde-fou déterministe des longueurs ne tournait QU'APRÈS une
          // rédaction complète : une retouche pouvait donc repasser une slide
          // au-dessus de la limite sans que rien ne le voie, et c'est la
          // relecture suivante qui le découvrait — « slide 6 = 141 caractères,
          // dépassement de 1 », le 24/08/2026. Il tourne ici aussi.
          const applied = editedItem?.targetFormat === TargetFormat.CARROUSEL_SLIDE
              ? await enforceCarrouselConstraints(
                    cleaned,
                    targetField === 'slides' ? sanitizeSlidesResponse : parseDraftResponse,
                )
              : targetField === 'draft' && editedItem
                  ? await appliquerControlesDuFormat(cleaned, editedItem)
                  : cleaned;

          const previousValue = currentContent;
          const newItem = { ...editedItem!, [targetField]: applied };

          if (isMountedRef.current) {
              setEditedItem(newItem);
              if (previousValue) setLastGeneration({ field: targetField, previousValue, label: `Ajustement appliqué par ${modelLabel(modeleAjustement)}` });
              // Ajuster le brouillon périme les slides ; ajuster les slides les remet à jour
              if (targetField === 'slides') setSlidesStale(false);
              else if (editedItem?.slides) setSlidesStale(true);
              // L'instruction fait partie du fait daté : sans elle, on relit un
              // texte modifié sans savoir ce qu'on avait demandé.
              await journalise({ usage, kind: 'adjustment', target: targetField, payload: applied, instruction: adjustmentText, modelId: modeleAjustement });
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
              editedItem.slides,
              instruction,
              slideNumero
          );

          const modelePrompts = modelFor('ADJUST_DZINE_PROMPTS');
          const { text: responseText, usage } = await callAI(
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
                  usage,
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

  // --- LE CADRE (SPEC §13.9) ---

  /*
   * L'éditeur en sait plus que les listes sur le contenu ouvert : la
   * conversation est chargée, le journal relu après chaque production. Il
   * calcule donc l'étape avec ce qu'il a de plus frais, et ne prend aux listes
   * que le montage.
   */
  const relectures = journal.filter(g => g.kind === 'cold_read').sort((a, b) => b.createdAt - a.createdAt);
  const lireRelecture = (g: GenerationDuFil) => {
      try {
          const r = JSON.parse(g.payload);
          const ko = Array.isArray(r?.controles) ? r.controles.filter((c: any) => c?.statut === 'KO').length : 0;
          return { verdict: typeof r?.verdict === 'string' ? r.verdict : null, points: (Array.isArray(r?.problemes) ? r.problemes.length : 0) + ko, le: g.createdAt };
      } catch {
          return { verdict: null, points: 0, le: g.createdAt };
      }
  };
  const ecrituresDuBrouillon = journal.filter(g => g.target === 'draft').map(g => g.createdAt);
  const messagesCoach = coachSessionState?.messages ?? [];
  const entree = {
      contenu: editedItem,
      session: coachSessionState
          ? { messages: messagesCoach.length, tours: messagesCoach.filter(m => m.role === 'assistant').length }
          : resumeFil ? { messages: resumeFil.messages, tours: resumeFil.tours } : null,
      relecture: relectures[0] ? lireRelecture(relectures[0]) : resumeFil?.relecture ?? null,
      brouillonLe: ecrituresDuBrouillon.length ? Math.max(...ecrituresDuBrouillon) : resumeFil?.brouillonLe ?? null,
      montage: resumeMontage ?? null,
  };
  const courante = etapeCourante(entree);
  const lignes = etapesDuSelecteur(entree);
  const sorte = courante.sorte;
  const video = sorte === 'video' || sorte === 'video-sans-script';
  // Une adresse qui demande une étape absente ou verrouillée retombe sur l'étape courante.
  const affichee: Etape = lignes.some(l => l.etape === activeStep && !l.verrouillee) ? activeStep : courante.etape;
  const ligneAffichee = lignes.find(l => l.etape === affichee);

  const pret = editedItem.status === ContentStatus.READY || editedItem.status === ContentStatus.PUBLISHED;
  const aUnBrouillon = !!editedItem.draft?.trim();
  const relisible = supportsColdRead(editedItem.targetFormat as TargetFormat);
  const relectureCourante = entree.relecture && (entree.brouillonLe === null || entree.relecture.le >= entree.brouillonLe) ? entree.relecture : null;
  const pointsRelecture = relectureCourante && relectureCourante.verdict !== 'Publiable' ? Math.max(relectureCourante.points, 1) : 0;
  const controles = video && aUnBrouillon ? (getFormatDef(editedItem.targetFormat)?.controler?.(parseBodyJson(editedItem.draft!)) ?? []) : [];
  const occupe = isGenerating || atelier.enCours || isSaving;
  const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

  // --- LE FIL (SPEC §13.10) ---

  const elements = composerLeFil({
      sorte,
      analyse: editedItem,
      generations: journal,
      coach: messagesCoach.map(m => ({ role: m.role, content: m.content, createdAt: m.createdAt })),
      atelierValide: coachSessionState?.status === 'validated',
      gestes,
      montage: resumeMontage ?? null,
      controles,
  });

  const attente: RoleDuFil | null = atelier.enCours
      ? 'Coach'
      : (isGenerating || analyseEnCours) && actionIA
          ? ((AI_ACTION_CATALOG.find(a => a.label === actionIA)?.persona as RoleDuFil | undefined) ?? null)
          : null;

  /** Une idée qu'on ouvre quitte Idées pour Conversations : elle devient un contenu en chantier. */
  const mettreEnChantier = async (): Promise<ContentItem | null> => {
      if (editedItem.status !== ContentStatus.IDEA) return editedItem;
      return (await changeStatus(ContentStatus.DRAFTING)) ? { ...editedItem, status: ContentStatus.DRAFTING } : null;
  };

  const ouvrirAtelier = async () => {
      if (!(await mettreEnChantier())) return;
      onStepChange('atelier');
      await atelier.ouvrir();
  };

  const redigerSansAtelier = async () => {
      const enChantier = await mettreEnChantier();
      if (enChantier) await executeDrafting(enChantier);
  };

  const envoyerAuCoach = async (texte: string) => {
      // Une session validée se rouvre d'elle-même quand on lui reparle (SPEC §2.7).
      if (coachSessionState?.status === 'validated') await handleCoachReopen();
      await atelier.envoyer(texte);
  };

  const versLeRedacteur = aUnBrouillon && !versLeCoach;
  const toursCoach = messagesCoach.filter(m => m.role === 'assistant').length;
  const zone: ZoneOuverture | ZoneComposeur | null =
      messagesCoach.length === 0 && !aUnBrouillon && affichee === 'ouverture'
          ? {
              type: 'ouverture',
              onOuvrirAtelier: () => void ouvrirAtelier(),
              onRedigerSansAtelier: () => void redigerSansAtelier(),
              onDemanderAnalyse: !editedItem.analyzedAt && onAnalyser ? onAnalyser : undefined,
              occupe: occupe || !!analyseEnCours,
          }
          : versLeRedacteur
              ? {
                  type: 'composeur', destinataire: 'redacteur',
                  onEnvoyer: (t) => void launchAdjustment(t),
                  autre: { libelle: 'Parler au Coach', onChoisir: () => setVersLeCoach(true) },
                  desactive: isGenerating,
              }
              : {
                  type: 'composeur', destinataire: 'coach',
                  onEnvoyer: (t) => void envoyerAuCoach(t),
                  reponses: [
                      ...(coachSessionState?.status === 'validated' && !aUnBrouillon
                          ? [{ libelle: 'Relancer la rédaction', onChoisir: () => void executeDrafting() }]
                          : atelier.pretPourLeRedacteur || toursCoach >= 2
                              ? [{ libelle: 'Go, passe à l’Éditeur', onChoisir: () => void atelier.valider() }]
                              : []),
                      ...atelier.reponsesRapides.map(r => ({ libelle: r, onChoisir: () => void envoyerAuCoach(r) })),
                  ].slice(0, 2),
                  autre: aUnBrouillon ? { libelle: 'Revenir au Rédacteur', onChoisir: () => setVersLeCoach(false) } : undefined,
                  desactive: atelier.enCours || isGenerating,
                  erreur: atelier.erreur,
                  rappel: atelier.rappel
                      ? { questions: atelier.rappel, onRepondre: atelier.repondre, onPasser: () => void atelier.passerSansRepondre() }
                      : undefined,
              };

  const corrigerLeFormat = (points: string[]) => void launchAdjustment(
      `Corrige UNIQUEMENT les points suivants, relevés par le contrôle automatique du format, sans perdre le sens ni la voix : ${points.join(' ; ')}. Ne modifie rien d'autre.`,
  );

  // --- LA MATIÈRE ---

  const repasserEnEcriture = async () => {
      if (await changeStatus(ContentStatus.DRAFTING)) onStepChange(etapeDEcriture(sorte));
  };

  const regenerer: EntreeMenu = { id: 'regenerer', libelle: 'Régénérer', onChoisir: () => triggerDrafting(), desactive: occupe };
  const relire: EntreeMenu[] = relisible && aUnBrouillon
      ? [{ id: 'relire', libelle: 'Relire à froid', onChoisir: () => triggerColdRead(), desactive: occupe }] : [];
  const enEcriture: EntreeMenu[] = pret ? [{ id: 'ecriture', libelle: 'Repasser en écriture', onChoisir: () => void repasserEnEcriture(), desactive: occupe }] : [];
  // Le texte d'un écrit se retouche à la main ; un script se reprend par le Rédacteur.
  const aLaMain: EntreeMenu[] = aUnBrouillon && !video
      ? [{ id: 'main', libelle: 'Modifier à la main', onChoisir: () => setEditionManuelle(bodyJsonToText(editedItem.draft || '')) }] : [];

  const enregistrerLaRetouche = () => {
      if (editionManuelle === null) return;
      const data = parseBodyJson(editedItem.draft || '');
      const draft = data && data.format ? JSON.stringify({ ...data, edited_raw: editionManuelle }) : editionManuelle;
      setEditedItem({ ...editedItem, draft });
      setEditionManuelle(null);
  };

  const bonAPublier: ActionMatiere = {
      libelle: 'Bon à publier',
      onClick: () => void (async () => { if (await changeStatus(ContentStatus.READY)) onStepChange('publication'); })(),
      desactive: pointsRelecture > 0 || occupe,
      raison: pointsRelecture > 0 ? `${pluriel(pointsRelecture, 'point')} ${pointsRelecture > 1 ? 'sont' : 'est'} à corriger d’abord.` : undefined,
  };

  const vide = {
      titre: sorte === 'video' ? 'Pas encore de script' : sorte === 'carrousel' ? 'Pas encore de brouillon ni de slides' : 'Pas encore de brouillon',
      texte: sorte === 'video'
          ? 'Le Coach vous interroge, puis le Rédacteur écrit le script, séquence par séquence.'
          : 'Le Coach vous interroge pour trouver l’angle ; « Go » passe la main au Rédacteur, qui écrit ici.',
  };

  const brouillon = editedItem.draft || '';
  const lectureDuBrouillon = () => sorte === 'carrousel'
      ? <TrameCarrousel draft={brouillon} />
      : <div className="max-w-[680px]"><BodyRenderer body={brouillon} datePublication={editedItem.scheduledDate} /></div>;

  let entete: React.ReactNode;
  let corps: React.ReactNode;

  if (editionManuelle !== null) {
      entete = <EnteteMatiere nom="Brouillon" sousTitre="retouche à la main"
          principale={{ libelle: 'Enregistrer la retouche', onClick: enregistrerLaRetouche }}
          autres={[{ id: 'annuler', libelle: 'Annuler la retouche', onChoisir: () => setEditionManuelle(null) }]} />;
      corps = (
          <textarea
              value={editionManuelle}
              onChange={(e) => setEditionManuelle(e.target.value)}
              aria-label="Retouche du brouillon"
              className="w-full h-full min-h-[480px] p-4 rounded-xl border border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg text-sm leading-relaxed text-brand-main dark:text-dark-text font-mono outline-hidden focus:border-brand-main dark:focus:border-white"
          />
      );
  } else switch (affichee) {
      case 'ouverture':
          entete = <EnteteMatiere nom="Ouverture" sousTitre={ligneAffichee?.statut === 'préparée' ? 'préparée par l’Analyste' : 'notes et format'} />;
          corps = (
              <MatiereOuverture
                  notes={editedItem.notes}
                  onNotes={(notes) => setEditedItem({ ...editedItem, notes })}
                  format={editedItem.targetFormat}
                  onFormat={(f) => setEditedItem({ ...editedItem, targetFormat: (f || null) as any })}
                  verrouille={messagesCoach.length > 0 || aUnBrouillon}
                  vide={vide}
              />
          );
          break;
      case 'atelier':
          entete = <EnteteMatiere nom="Atelier" sousTitre={ligneAffichee?.statut}
              autres={messagesCoach.length > 0 ? [{ id: 'reinitialiser', libelle: 'Réinitialiser l’atelier', ton: 'erreur', onChoisir: () => setConfirmReset(true), desactive: occupe }] : []} />;
          corps = aUnBrouillon
              ? (video ? <LectureScript draft={brouillon} format={editedItem.targetFormat} /> : lectureDuBrouillon())
              : <MatiereVide titre="L’atelier se tient dans le fil" texte="Répondez au Coach à gauche. Quand la direction tient, « Go » passe la main au Rédacteur, et le brouillon s’écrit ici." />;
          break;
      case 'brouillon':
          entete = <EnteteMatiere nom="Brouillon" sousTitre={ligneAffichee?.statut}
              principale={pret ? null : sorte === 'carrousel'
                  ? { libelle: 'Produire les slides', onClick: () => triggerCarrouselSlides(), desactive: occupe, enCours: actionIA === 'Slides du carrousel', libelleEnCours: 'Production…' }
                  : bonAPublier}
              autres={[...relire, regenerer, ...aLaMain, ...enEcriture]} />;
          corps = lectureDuBrouillon();
          break;
      case 'slides':
          entete = <EnteteMatiere nom="Slides" sousTitre={slidesStale ? 'le brouillon a changé depuis' : ligneAffichee?.statut}
              principale={pret ? null : bonAPublier}
              autres={[{ id: 'reproduire', libelle: 'Reproduire les slides', onChoisir: () => triggerCarrouselSlides(), desactive: occupe }, ...enEcriture]} />;
          corps = (
              <div className="space-y-6">
                  {slidesStale && (
                      <p className="text-xs text-alerte">Le brouillon a changé depuis la production de ces slides : elles ne le reflètent plus. « Reproduire les slides » les refait.</p>
                  )}
                  <VignettesSlides slides={editedItem.slides || ''} />
                  <SlidesRenderer slidesRaw={editedItem.slides || ''} onAdjustPrompts={launchPromptsAdjustment} isAdjusting={isGenerating} />
              </div>
          );
          break;
      case 'script':
          entete = <EnteteMatiere nom="Script" sousTitre={ligneAffichee?.statut}
              principale={pret || sorte === 'video-sans-script' ? null : {
                  libelle: 'Marquer prête à tourner',
                  onClick: () => void (async () => { if (await changeStatus(ContentStatus.READY)) onStepChange('tournage'); })(),
                  desactive: controles.length > 0 || occupe,
                  raison: controles.length > 0 ? `${pluriel(controles.length, 'point')} ${controles.length > 1 ? 'sont' : 'est'} à corriger d’abord.` : undefined,
              }}
              autres={[...relire, regenerer, ...enEcriture]} />;
          corps = sorte === 'video-sans-script'
              ? <MatiereVide titre="Vidéo directe, sans script" texte="Sa transcription servira de texte : déposez la prise à l’étape Montage." />
              : <LectureScript draft={brouillon} format={editedItem.targetFormat} />;
          break;
      case 'tournage':
          entete = <EnteteMatiere nom="Tournage" sousTitre="le script, pour se l’approprier avant de filmer"
              principale={{ libelle: 'Déposer la prise', onClick: () => { setOngletDEntree('prise'); onStepChange('montage'); } }}
              autres={enEcriture} />;
          corps = <LectureTournage draft={brouillon} format={editedItem.targetFormat} />;
          break;
      case 'montage':
          // Seulement sur téléphone : le studio demande un grand écran.
          entete = <EnteteMatiere nom="Montage" sousTitre={ligneAffichee?.statut} />;
          corps = (
              <MatiereVide
                  titre="Le montage se fait sur un ordinateur"
                  texte={resumeMontage?.dernierExport
                      ? `Dernière vidéo exportée le ${new Date(resumeMontage.dernierExport.le).toLocaleDateString('fr-FR')}, en ${resumeMontage.dernierExport.format}. L’aperçu, les coupes et l’export demandent un grand écran.`
                      : 'L’aperçu, les coupes et l’export demandent un grand écran. Ici, l’étape se lit ; elle se travaille sur l’ordinateur.'}
              />
          );
          break;
      case 'publication':
          entete = <EnteteMatiere nom="Publication" sousTitre={ligneAffichee?.statut} />;
          corps = (
              <div className="flex flex-wrap gap-6 items-start">
                  <div className="flex-1 min-w-[320px] space-y-3">
                      <Etiquette>Ce qui sera publié</Etiquette>
                      <CeQuiSeraPublie sorte={sorte} draft={editedItem.draft} slides={editedItem.slides} format={editedItem.targetFormat}
                          copiable={getEditorTab(editedItem.targetFormat as TargetFormat) === 'postcourt'} datePublication={editedItem.scheduledDate} />
                  </div>
                  <BlocPublier
                      plateformes={editedItem.platforms}
                      publie={editedItem.status === ContentStatus.PUBLISHED}
                      libellePublication={ligneAffichee?.statut ?? null}
                      dateInitiale={editedItem.scheduledDate}
                      onPublier={(date) => void changeStatus(ContentStatus.PUBLISHED, date)}
                      onRepasserEnEcriture={() => void repasserEnEcriture()}
                      onDecliner={onDecline ? () => onDecline(editedItem) : undefined}
                      occupe={occupe}
                  />
              </div>
          );
          break;
  }

  // --- LE PIED ---

  const coutAffiche = cout && cout.usd !== null ? (() => {
      const montant = cout.usd < 0.01 && cout.usd > 0 ? '< 0,01 $' : `${cout.usd.toFixed(2).replace('.', ',')} $`;
      const partiel = cout.appelsSansPrix > 0;
      return {
          libelle: partiel ? `≥ ${montant}` : montant,
          detail: `${cout.appels} appel${cout.appels > 1 ? 's' : ''} IA${partiel ? ` — ${cout.appelsSansPrix} sans prix déclaré, le total est donc un minimum` : ''}`,
      };
  })() : null;

  // Au montage, le studio prend toute la largeur ; le fil se replie derrière un bouton.
  const auMontage = affichee === 'montage' && editionManuelle === null && !mobile;
  const vue = vueMobile ?? (affichee === 'tournage' || affichee === 'publication' ? 'matiere' : 'fil');

  const leFil = (entete?: React.ReactNode) => (
      <Fil
          elements={elements}
          attente={attente}
          zone={zone}
          occupe={occupe}
          entete={entete}
          onAppliquer={(corrections) => void launchAdjustment(buildColdReadApplyInstruction(corrections))}
          onCorrigerLeFormat={corrigerLeFormat}
          onRevenir={() => void revenirALaVersionPrecedente()}
      />
  );

  return (
      <>
        <CadreContenu
            retour={{ libelle: libelleRetour, onClick: onClose }}
            titre={editedItem.title}
            onTitre={(title) => setEditedItem({ ...editedItem, title })}
            pastilles={[getFormatDef(editedItem.targetFormat)?.shortKey, editedItem.objectif, ...editedItem.platforms].filter(Boolean) as string[]}
            selecteur={<SelecteurEtape lignes={lignes} affichee={affichee} onChoisir={(e) => { setEditionManuelle(null); setVueMobile(null); onStepChange(e); }} />}
            bandeau={auMontage ? undefined : (
                <div className="md:hidden px-4 py-2 border-b border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface">
                    <ControleSegmente<'fil' | 'matiere'> libelle="Afficher" valeur={vue} onChange={setVueMobile}
                        options={[{ valeur: 'fil', libelle: 'Le fil' }, { valeur: 'matiere', libelle: NOMS_DES_ETAPES[affichee] }]} />
                </div>
            )}
            panneauSerie={auMontage ? undefined : panneauSerie}
            actionDroite={auMontage ? (
                <Bouton taille="grand" onClick={() => setFilOuvert(o => !o)} aria-expanded={filOuvert}>
                    <MessageCircle /> Le fil
                    <span className="text-micro font-bold tabular-nums text-brand-main/60 dark:text-dark-text/60">{elements.length}</span>
                </Bouton>
            ) : undefined}
            pied={<PiedContenu etat={saveStatus} erreur={saveError} onReessayer={retrySave} cout={coutAffiche} onSupprimer={onDelete ? () => setConfirmDelete(true) : undefined} />}
        >
            {auMontage ? (
                <div className="relative flex-1 min-h-0 flex flex-col">
                    {aUnBrouillon
                        ? <Studio contentId={editedItem.id} draft={brouillon} format={editedItem.targetFormat} titre={editedItem.title} onMontageChange={onMontageChange}
                            dernierExport={resumeMontage?.dernierExport ?? null} ongletInitial={ongletDEntree} />
                        : <div className="p-7"><MatiereVide titre="Pas encore de script" texte="Le montage suit le script : il s’écrit d’abord à l’atelier." /></div>}
                    {filOuvert && (
                        <div className="absolute inset-y-0 right-0 z-30 w-[440px] max-w-full shadow-lg border-l border-brand-border dark:border-dark-sec-border">
                            {leFil(
                                <div className="h-[60px] shrink-0 flex items-center gap-2 px-5 border-b border-brand-border dark:border-dark-sec-border">
                                    <MessageCircle className="w-4 h-4 text-brand-main dark:text-dark-text" />
                                    <span className="text-sm font-bold text-brand-main dark:text-white">Le fil</span>
                                    <span className="flex-1 text-xs text-brand-main/60 dark:text-dark-text/60">ce qui s’est dit et fait</span>
                                    <Bouton taille="grand" intention="discrete" className="w-10 px-0 no-underline" aria-label="Fermer le fil" onClick={() => setFilOuvert(false)}>
                                        <X />
                                    </Bouton>
                                </div>,
                            )}
                        </div>
                    )}
                </div>
            ) : (
                <div className={`flex-1 min-h-0 grid grid-cols-1 ${panneauSerie ? 'md:grid-cols-[380px_minmax(0,1fr)]' : 'md:grid-cols-[440px_minmax(0,1fr)]'}`}>
                    <div className={`min-h-0 border-r border-brand-border dark:border-dark-sec-border ${vue === 'fil' ? 'block' : 'hidden'} md:block`}>
                        {leFil()}
                    </div>
                    <div className={`min-h-0 flex-col bg-white dark:bg-dark-surface ${vue === 'matiere' ? 'flex' : 'hidden'} md:flex`}>
                        {entete}
                        <div className="flex-1 overflow-y-auto p-4 md:p-7">{corps}</div>
                    </div>
                </div>
            )}
        </CadreContenu>

        <AlertModal
            isOpen={alertInfo.isOpen}
            onClose={() => setAlertInfo({ ...alertInfo, isOpen: false })}
            title={alertInfo.title}
            message={alertInfo.message}
            type={alertInfo.type}
        />

        <ConfirmModal
            isOpen={confirmReset}
            onClose={() => setConfirmReset(false)}
            onConfirm={() => { setConfirmReset(false); void handleCoachReset(); }}
            title="Réinitialiser l’atelier ?"
            message="La conversation avec le Coach quitte l’écran et l’atelier repart de zéro. Le brouillon n’est pas touché, et la conversation reste en base."
            isDestructive={true}
            confirmLabel="Réinitialiser"
        />

        <ConfirmModal
            isOpen={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            onConfirm={handleDelete}
            title="Supprimer ce contenu ?"
            message="Il disparaît de l'application avec son brouillon et sa session Coach. Aucun écran ne permet de le rétablir — seule une sauvegarde le contient encore."
            isDestructive={true}
            confirmLabel="Supprimer"
        />
      </>
  );
};

export default ContentEditor;
