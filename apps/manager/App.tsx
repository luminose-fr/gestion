import React, { useState, useEffect, useMemo, useRef } from 'react';
import { RefreshCw, LogOut, AlertCircle, Menu, Cpu, ChevronDown } from 'lucide-react';
import { ContentItem, ContentStatus, AIModel, Serie, Verdict, Platform, DisplayPrefs, isObjectif, isProfondeur } from './types';
import * as Api from './services/apiService';
import * as StorageService from './services/storageService';
import {
  AI_ACTIONS, VIDEO_DIRECTE, bodyJsonToText, buildSerieContextSection,
  etapeCourante, dernierFait, resumerLeFait, momentDuFait,
  type EtapeCourante, type PlanSeriesEntry, type SerieSibling,
} from '@luminose/editorial';
import type { ResumeFils, ResumeMontages } from '@luminose/shared';
import * as AiService from './services/aiService';
import * as Activite from './services/activityService';
import { generateSeriePlan } from './services/seriesService';

import SettingsSpace from './components/Settings/SettingsSpace';
import { PERSONAS_NAV, personaParId, cheminPersona } from './components/Settings/apercus';
import CorpusSpace from './components/Corpus/CorpusSpace';
import { BLOCS, CorpusSection, isBloc, isCorpusSection, corpusSectionLabel, corpusSectionSousTitre } from './components/Corpus/sections';
import { fetchDocumentsCorpus, fetchInbox } from './services/apiService';
import {
  SettingsSection, isSettingsSection, settingsSectionLabel, settingsSectionSousTitre,
  grouperParAdaptateur,
} from './components/Settings/sections';
import ContentEditor, { EditorStep } from './components/ContentEditor';
import { IdeaModal } from './components/IdeaModal'; 
import AnalysisModal from './components/AnalysisModal';
import { LoginPage } from './components/LoginPage';
import { isAuthenticated, logout } from './auth';
import { AlertModal } from './components/CommonModals';
import { BandeauActivite, EnCours, FiletActivite, Patience } from './components/Feedback';
import PsychedelicsCalculator from './components/PsychedelicsCalculator';
import RdvView from './components/Clients/RdvView';
import { ecran, TitreEcran } from './components/ui';

// Components refactorisés
import { Sidebar } from './components/Layout/Sidebar';
import { MobileSubTabs } from './components/Layout/MobileSubTabs';
import type { ModeSuppressionSerie } from '@luminose/shared';
import { SeriePlanView } from './components/Series/SeriePlanView';
import { ConversationsView, type FiltreGeste, type DernierMot } from './components/Contenus/ConversationsView';
import { IdeesView } from './components/Contenus/IdeesView';
import { PubliesView, type VuePublies } from './components/Contenus/PubliesView';
import { REDIRECTIONS, estListe, libelleDeListe, listeDuContenu, type ListeContenus } from './components/Contenus/listes';

type SpaceView = 'social' | 'clients' | 'psychedelics' | 'corpus' | 'settings';
/** Les trois listes, et `series` : l'adresse d'un plan de série (SPEC §13). */
type SocialTab = ListeContenus | 'series';

/**
 * L'étape de l'éditeur où un contenu s'ouvre, d'après la règle d'arrivée
 * (SPEC §13.4). L'éditeur garde ses onglets jusqu'à la phase F3 : on traduit
 * l'étape calculée dans son vocabulaire.
 */
const ongletDeLEditeur = (etape: EtapeCourante['etape']): EditorStep => {
    switch (etape) {
        case 'ouverture': return 'idea';
        case 'atelier': return 'atelier';
        case 'brouillon': return 'brouillon';
        case 'slides': return 'slides';
        case 'script': case 'tournage': case 'montage': case 'publication': return 'script';
        default: return 'idea';
    }
};

const getSpaceHash = (space: SpaceView) => {
    if (space === 'psychedelics') return 'psychedeliques';
    if (space === 'corpus') return 'corpus';
    if (space === 'settings') return 'reglages';
    return space;
};

const getHashState = () => {
    const [chemin, requete = ''] = window.location.hash.replace('#', '').split('?');
    const parts = chemin.split('/');
    const vuePublies: VuePublies = new URLSearchParams(requete).get('vue') === 'calendrier' ? 'calendrier' : 'liste';
    
    let space: SpaceView = 'social';
    if (parts[0] === 'clients') space = 'clients';
    if (parts[0] === 'psychedelics' || parts[0] === 'psychedeliques') space = 'psychedelics';
    if (parts[0] === 'corpus') space = 'corpus';
    if (parts[0] === 'settings' || parts[0] === 'reglages') space = 'settings';
    
    let tab: SocialTab = 'conversations';
    if (parts[1] && (estListe(parts[1]) || parts[1] === 'series')) {
        tab = parts[1] as SocialTab;
    }

    // Sur Réglages, le deuxième segment nomme la section — même place que
    // l'onglet de Contenus, pour que l'URL reste lisible. Un troisième segment
    // nomme le rôle ouvert sous Personas, comme le bloc sous Documents :
    // une destination, pas un filtre — elle survit au rechargement.
    const settingsSection: SettingsSection =
        space === 'settings' && parts[1] && isSettingsSection(parts[1]) ? parts[1] : 'display';
    const settingsPersona: string | null =
        settingsSection === 'personas'
            ? (personaParId(parts[2])?.id ?? PERSONAS_NAV[0].id)
            : null;

    /**
     * Sur Corpus, deux segments : la section, puis le bloc quand on lit des
     * documents — `#corpus/documents/socle`. Le bloc est une destination, pas
     * un filtre : il doit survivre à un rechargement et se partager par URL.
     */
    const corpusSection: CorpusSection =
        space === 'corpus' && parts[1] && isCorpusSection(parts[1]) ? parts[1] : 'etat';

    const corpusBloc: string | null =
        corpusSection === 'documents' && parts[2] && isBloc(parts[2]) ? parts[2] : null;

    /**
     * Sur l'onglet Séries, l'URL porte DEUX identifiants :
     * `#social/series/<serie>/<contenu>/<etape>`.
     *
     * C'est ce qui permet de travailler une publication sans quitter sa série :
     * la route se souvient d'où l'on vient, et « retour » ramène au plan plutôt
     * qu'à la boîte à idées.
     */
    const surSeries = space === 'social' && tab === 'series';
    const segment = (i: number) => (parts[i] && parts[i].trim() !== '' ? parts[i] : null);

    const serieId = surSeries ? segment(2) : null;
    const itemId = surSeries ? segment(3) : segment(2);
    const etapeIndex = surSeries ? 4 : 3;
    
    let step: EditorStep = 'idea';
    const LEGACY_STEP_MAP: Record<string, EditorStep> = {
        'interview': 'atelier', 'content': 'atelier',
    };
    const brut = parts[etapeIndex];
    if (brut) {
        if (['idea', 'atelier', 'brouillon', 'slides', 'postcourt', 'script'].includes(brut)) {
            step = brut as EditorStep;
        } else if (LEGACY_STEP_MAP[brut]) {
            step = LEGACY_STEP_MAP[brut];
        }
    }

    return { space, tab, settingsSection, settingsPersona, corpusSection, corpusBloc, serieId, itemId, step, vuePublies };
};

/**
 * L'adresse qui remplace une adresse d'avant la v2.19 (SPEC §13), ou `null`.
 * Un favori, un onglet resté ouvert : aucun ne doit tomber sur un écran vide.
 */
const adresseRemplacee = (): string | null => {
    const [chemin] = window.location.hash.replace('#', '').split('?');
    const parts = chemin.split('/');
    if (parts[0] === 'videos') return 'social/conversations';
    if (parts[0] !== 'social') return null;
    if (!parts[1]) return 'social/conversations';
    if (parts[1] === 'series' && !parts[2]) return 'social/conversations';
    const cible = REDIRECTIONS[parts[1]];
    if (!cible) return null;
    // Un contenu ouvert garde son identifiant et son étape : seule la liste change.
    return parts[2] ? `social/${cible.split('?')[0]}/${parts.slice(2).join('/')}` : `social/${cible}`;
};

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [items, setItems] = useState<ContentItem[]>([]);
  const [aiModels, setAiModels] = useState<AIModel[]>([]);
  const [series, setSeries] = useState<Serie[]>([]);
  /** Modèle affecté à chaque action ; une action absente prend le modèle actif. */
  const [actionModels, setActionModels] = useState<Record<string, string>>({});
  
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSingleAnalyzing, setIsSingleAnalyzing] = useState(false); 
  const [error, setError] = useState<string | null>(null);
  
  const [currentSpace, setCurrentSpace] = useState<SpaceView>('social');
  const [currentSocialTab, setCurrentSocialTab] = useState<SocialTab>('conversations');
  const [currentCorpusSection, setCurrentCorpusSection] = useState<CorpusSection>('etat');
  const [currentCorpusBloc, setCurrentCorpusBloc] = useState<string | null>(null);
  /** Pastilles du panneau Corpus. Chargées à la première ouverture de l'espace,
   *  pas au démarrage : personne ne paie deux requêtes pour un espace qu'il
   *  n'ouvrira peut-être pas de la journée. */
  const [corpusCounts, setCorpusCounts] = useState<{ inbox?: number; parBloc?: Record<string, number> }>({});
  const [currentSettingsSection, setCurrentSettingsSection] = useState<SettingsSection>('display');
  const [currentSettingsPersona, setCurrentSettingsPersona] = useState<string | null>(null);
  
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingSerieId, setEditingSerieId] = useState<string | null>(null);
  const [currentEditorStep, setCurrentEditorStep] = useState<EditorStep>('idea');
  const [pendingEditorAction, setPendingEditorAction] = useState<'interview' | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  /** Le geste que la liste Conversations isole ; la vue des Publiés vit dans l'adresse. */
  const [filtreGeste, setFiltreGeste] = useState<FiltreGeste>('tout');
  const [vuePublies, setVuePublies] = useState<VuePublies>('liste');
  /** « + Nouveau → Idée » : Idées s'ouvre le champ d'ajout en main. */
  const [ideeEnAvant, setIdeeEnAvant] = useState(false);

  /**
   * Ce que les listes savent du fil et du montage de chaque contenu, sans
   * l'ouvrir (SPEC §13.7) : c'est de là que l'étape se calcule. Lus avec la
   * synchronisation, et relus en quittant un contenu — c'est là qu'ils ont pu
   * changer. `null` tant qu'ils ne sont pas arrivés : la liste s'affiche quand
   * même, sans étape fine.
   */
  const [fils, setFils] = useState<ResumeFils | null>(null);
  const [montages, setMontages] = useState<ResumeMontages | null>(null);
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  /** Adaptateurs et état de leur clé — l'écriture seule fait que seule l'empreinte revient (SPEC §5.5). */
  const [providers, setProviders] = useState<Api.ProviderKeyState[]>([]);

  const [displayPrefs, setDisplayPrefsState] = useState<DisplayPrefs>(() => StorageService.getDisplayPrefs());

  const handleDisplayPrefsChange = (prefs: DisplayPrefs) => {
      setDisplayPrefsState(prefs);
      StorageService.setDisplayPrefs(prefs);
  };

  // Modèle IA actif — vérité runtime localStorage, seedé depuis le modèle « Défaut » du catalogue.
  const [activeModelId, setActiveModelIdState] = useState<string>(
      () => StorageService.getActiveModelId() || ''
  );

  // State for Batch Analysis Execution Modal
  const [batchAnalysisState, setBatchAnalysisState] = useState<{
      isOpen: boolean;
      modelId: string;
      /** Les idées à préparer : trois à la fois, les plus récentes (SPEC §13). */
      ids: string[];
  }>({ isOpen: false, modelId: '', ids: [] });

  const [alertInfo, setAlertInfo] = useState<{ isOpen: boolean, title: string, message: string, type: 'error' | 'success' | 'info' }>({
      isOpen: false, title: '', message: '', type: 'info'
  });

  /**
   * Le registre d'activité ne connaît que des identifiants : on lui prête le
   * catalogue pour qu'il puisse NOMMER le modèle dans le bandeau — c'est la
   * moitié de l'information quand on doute de son fournisseur (SPEC §3.5.1).
   */
  useEffect(() => { Activite.enregistrerModeles(aiModels); }, [aiModels]);

  /**
   * Tout échec d'appel IA s'annonce ici, quelle que soit sa provenance : le
   * service qui les porte tous prévient, et l'application montre. Un écran qui
   * dépendrait de la vigilance de chaque appelant finirait par en oublier un —
   * c'est ce qui a rendu une « Lecture froide » muette le 24/08/2026.
   */
  useEffect(() => AiService.surEchecIA(echec => {
      setAlertInfo({
          isOpen: true,
          title: echec.action ? `Échec — ${echec.action}` : 'Échec de l’appel au modèle',
          message: echec.message,
          type: 'error',
      });
  }), []);

  // Contenus dont l'écriture serveur a échoué : ils n'existent qu'en local.
  // Le ref porte la version à réémettre (toujours à jour, même dans une closure
  // de sync périmée) ; le state ne sert qu'à l'affichage du bandeau.
  const unsavedItemsRef = useRef<Map<string, ContentItem>>(new Map());
  const [unsavedIds, setUnsavedIds] = useState<string[]>([]);
  const [isRetryingUnsaved, setIsRetryingUnsaved] = useState(false);

  const syncUnsavedState = () => setUnsavedIds(Array.from(unsavedItemsRef.current.keys()));

  const markItemSaved = (id: string) => {
      if (unsavedItemsRef.current.delete(id)) syncUnsavedState();
  };

  const markItemUnsaved = (item: ContentItem) => {
      unsavedItemsRef.current.set(item.id, item);
      syncUnsavedState();
  };

  // Garde-fou navigateur : on ne quitte pas la page sur du travail non enregistré
  useEffect(() => {
      if (unsavedIds.length === 0) return;
      const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
      window.addEventListener('beforeunload', handler);
      return () => window.removeEventListener('beforeunload', handler);
  }, [unsavedIds.length]);

  const mergeById = <T extends { id: string }>(current: T[], updates: T[]): T[] => {
      if (updates.length === 0) return current;
      const map = new Map(current.map(item => [item.id, item]));
      updates.forEach(item => map.set(item.id, item));
      return Array.from(map.values());
  };

  const sortByLastEditedDesc = (list: ContentItem[]): ContentItem[] =>
      [...list].sort((a, b) => b.updatedAt - a.updatedAt);

  const sortByUpdatedDesc = (list: Serie[]): Serie[] =>
      [...list].sort((a, b) => b.updatedAt - a.updatedAt);

  /**
   * Le modèle d'une action : son preset, à condition que ce modèle existe
   * encore au catalogue — sinon le modèle actif. Un preset qui pointe vers un
   * modèle supprimé ne doit pas faire échouer l'action au moment de l'appel.
   */
  const modelFor = (action: string): string => {
      const preset = actionModels[action];
      return preset && aiModels.some(m => m.id === preset) ? preset : activeModelId;
  };

  useEffect(() => {
      const handleHashChange = () => {
          // Une adresse d'avant la v2.19 est remplacée sans entrée d'historique :
          // « retour » ne doit pas y ramener.
          const remplacee = adresseRemplacee();
          if (remplacee) {
              window.history.replaceState(null, '', `#${remplacee}`);
          }
          const { space, tab, settingsSection, settingsPersona, corpusSection, corpusBloc, serieId, itemId, step, vuePublies } = getHashState();
          setCurrentSpace(space);
          if (space === 'corpus') {
              setCurrentCorpusSection(corpusSection);
              setCurrentCorpusBloc(corpusBloc);
          }
          if (space === 'social') {
              setCurrentSocialTab(tab);
              setVuePublies(vuePublies);
          }
          if (space === 'settings') {
              setCurrentSettingsSection(settingsSection);
              setCurrentSettingsPersona(settingsPersona);
          }
          setEditingItemId(itemId);
          setEditingSerieId(serieId);
          setCurrentEditorStep(step);
      };
      
      handleHashChange();

      window.addEventListener('hashchange', handleHashChange);
      return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  /** Séries : `#social/series/<serie>[/<contenu>[/<etape>]]`. */
  const updateSerieRoute = (serieId: string, contentId?: string | null, step: EditorStep = 'idea') => {
      const hash = contentId
          ? `social/series/${serieId}/${contentId}/${step}`
          : `social/series/${serieId}`;
      if (window.location.hash !== `#${hash}`) window.location.hash = hash;
  };

  /**
   * Réglages : `#reglages/<section>`, et `#reglages/personas/<role>`.
   *
   * Ouvrir Personas sans rôle retombe sur le premier — comme Documents sans
   * bloc. Un écran de vérification qui s'ouvre vide oblige à un clic pour ne
   * rien apprendre.
   */
  const updateSettingsRoute = (section: SettingsSection, persona?: string | null) => {
      let hash = `reglages/${section}`;
      if (section === 'personas') {
          hash += `/${cheminPersona(persona ?? currentSettingsPersona ?? PERSONAS_NAV[0].id)}`;
      }
      if (window.location.hash !== `#${hash}`) window.location.hash = hash;
  };

  /** `#social/publies?vue=calendrier` : la vue des Publiés se partage et survit au rechargement. */
  const poserVuePublies = (vue: VuePublies) => {
      const hash = vue === 'calendrier' ? 'social/publies?vue=calendrier' : 'social/publies';
      if (window.location.hash !== `#${hash}`) window.location.hash = hash;
  };

  /**
   * `#corpus/documents/socle`. Ouvrir Documents sans bloc retombe sur le
   * premier : un écran de documents sans document est une impasse, pas un état.
   */
  const updateCorpusRoute = (section: CorpusSection, bloc?: string | null) => {
      let hash = `corpus/${section}`;
      if (section === 'documents') hash += `/${bloc ?? currentCorpusBloc ?? BLOCS[0].id}`;
      if (window.location.hash !== `#${hash}`) window.location.hash = hash;
  };

  const updateRoute = (space: SpaceView, tab: SocialTab, itemId: string | null = null, step: EditorStep = 'idea') => {
      if (space === 'corpus') return updateCorpusRoute(currentCorpusSection, currentCorpusBloc);
      let hash = `${getSpaceHash(space)}`;
      if (space === 'social') {
          hash += `/${tab}`;
          if (itemId) {
              hash += `/${itemId}`;
              hash += `/${step}`;
          }
      }
      if (window.location.hash !== `#${hash}`) {
          window.location.hash = hash;
      }
  };

  const editingItem = editingItemId ? items.find(i => i.id === editingItemId) || null : null;

  // Sur l'onglet Séries, le troisième segment de l'URL désigne la série
  // ouverte ; le quatrième, la publication qu'on y travaille.
  const editingSerie = editingSerieId ? series.find(s => s.id === editingSerieId) || null : null;

  useEffect(() => {
    setAuthenticated(isAuthenticated());
    setCheckingAuth(false);
  }, []);

  // Les pastilles du panneau Corpus. Rechargées à chaque changement de section :
  // capturer puis revenir sur l'état doit faire bouger le compteur, sinon la
  // pastille ment jusqu'au prochain rechargement de page.
  useEffect(() => {
    if (currentSpace !== 'corpus' || !authenticated) return;
    void Promise.all([fetchDocumentsCorpus(), fetchInbox()])
      .then(([docs, inbox]) => {
        const parBloc: Record<string, number> = {};
        for (const d of docs.documents) parBloc[d.bloc] = (parBloc[d.bloc] ?? 0) + 1;
        setCorpusCounts({ inbox: inbox.enAttente, parBloc });
      })
      .catch(() => setCorpusCounts({}));
  }, [currentSpace, currentCorpusSection, authenticated]);

  const initData = async () => {
      let cachedItems: ContentItem[] = [];
      let cachedModels: AIModel[] = [];
      let cachedSeries: Serie[] = [];
      try {
          [cachedItems, cachedModels, cachedSeries] = await Promise.all([
              StorageService.getCachedContent(),
              StorageService.getCachedModels(),
              StorageService.getCachedSeries()
          ]);

          if (cachedItems.length > 0) setItems(cachedItems);
          if (cachedModels.length > 0) setAiModels(cachedModels);
          if (cachedSeries.length > 0) setSeries(cachedSeries);

      } catch (e) {
          console.error("Erreur lecture cache:", e);
      } finally {
          setIsInitializing(false);
          synchroniser(false, { items: cachedItems, models: cachedModels, series: cachedSeries });
      }
  };

  /** Le fil et le montage de chaque contenu, d'où se calcule son étape (SPEC §13.1). */
  const lireLesEtapes = async () => {
      const [f, m] = await Promise.all([
          Api.fetchResumeFils().catch((e) => { console.warn('Fils non lus :', e); return null; }),
          Api.fetchResumeMontages().catch((e) => { console.warn('Montages non lus :', e); return null; }),
      ]);
      if (f) setFils(f);
      if (m) setMontages(m);
  };

  const synchroniser = async (
      forceFullSync = false,
      baseCache?: { items?: ContentItem[]; models?: AIModel[]; series?: Serie[] }
  ) => {
    if (isSyncing) return;
    setIsSyncing(true);
    setError(null);

    // La synchronisation se NOMME dans le bandeau au lieu de poser un voile sur
    // l'écran : elle ne réclame rien de Florent, donc elle ne doit rien lui
    // interdire — surtout celle qui part toute seule au démarrage.
    const suivi = Activite.ouvrir({ label: 'Synchronisation', cle: 'app:sync' });
    let abouti = false;

    try {
        // Synchronisation incrémentale (SPEC §8). Il n'y a plus de sync
        // complète périodique ni de balayage d'identifiants : la suppression
        // étant logique, elle remonte comme une modification ordinaire.
        // Un marqueur hérité de l'ère Notion est une date ISO : Number() en fait
        // NaN, donc 0, donc une synchronisation complète. C'est le comportement
        // voulu au premier lancement après la bascule.
        const lastSync = Number(StorageService.getLastSync("content")) || 0;
        const since = forceFullSync || !lastSync ? undefined : lastSync;
        const lastSerieSync = Number(StorageService.getLastSync("series")) || 0;
        const sinceSeries = forceFullSync || !lastSerieSync ? undefined : lastSerieSync;

        const [contentRes, modelRes, serieRes, actionRes, providerRes] = await Promise.all([
            Api.fetchContents(since),
            Api.fetchModels(),
            Api.fetchSeries(sinceSeries),
            Api.fetchActionModels(),
            Api.fetchProviders(),
        ]);
        // Le fil et le montage suivent, sans retenir les listes : sans eux,
        // chaque ligne s'affiche quand même, avec une étape moins fine.
        void lireLesEtapes();

        const baseItems = since ? (baseCache?.items ?? items) : [];

        // Un contenu non enregistré porte du travail qui n'existe nulle part
        // ailleurs : la version serveur ne doit jamais l'écraser.
        const unsaved = unsavedItemsRef.current;
        const merged = (since ? mergeById(baseItems, contentRes.items) : contentRes.items)
            .map(item => unsaved.get(item.id) ?? item);

        // Les lignes supprimées remontent avec un deletedAt : on les retire du
        // cache, sauf si elles portent du travail non enregistré.
        const alive = merged.filter(item => !item.deletedAt || unsaved.has(item.id));

        // Une série supprimée remonte comme une modification ordinaire, avec
        // son deletedAt : on la retire du cache au passage (SPEC §8).
        const baseSeries = sinceSeries ? (baseCache?.series ?? series) : [];
        const nextSeries = sortByUpdatedDesc(
            (sinceSeries ? mergeById(baseSeries, serieRes.items) : serieRes.items)
                .filter(serie => !serie.deletedAt)
        );

        const nextItems = sortByLastEditedDesc(alive);
        const nextModels = modelRes.items;

        setItems(nextItems);
        setAiModels(nextModels);
        setSeries(nextSeries);
        setActionModels(actionRes.actions ?? {});
        setProviders(providerRes.providers ?? []);

        await Promise.all([
            StorageService.setCachedContent(nextItems),
            StorageService.setCachedModels(nextModels),
            StorageService.setCachedSeries(nextSeries),
        ]);

        StorageService.setLastSync("content", String(contentRes.syncedAt));
        StorageService.setLastSync("series", String(serieRes.syncedAt));
        abouti = true;

    } catch (err: any) {
        console.error("Sync Error:", err);
        let msg = err.message || "Impossible de synchroniser.";
        setError(msg);
    } finally {
        suivi.fermer(abouti);
        setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (authenticated) {
      initData();
    }
  }, [authenticated]);

  useEffect(() => {
      setSearchQuery("");
      setIsMobileMenuOpen(false);
      // Le champ d'ajout ne prend la main que pour l'arrivée depuis « + Nouveau → Idée ».
      if (currentSocialTab !== 'ideas') setIdeeEnAvant(false);
  }, [currentSocialTab]);

  const handleLoginSuccess = () => {
    setAuthenticated(true);
  };

  const handleLogout = () => {
    logout();
    setAuthenticated(false);
    setItems([]);
    setAiModels([]);
    setSeries([]);
    setIsInitializing(true);
  };

  const handleModelsChange = (newModels: AIModel[]) => {
      setAiModels(newModels);
      StorageService.setCachedModels(newModels);
  };

  // Seed du modèle actif depuis le « Défaut » du catalogue, tant que l'utilisateur n'a pas choisi explicitement.
  useEffect(() => {
      if (aiModels.length === 0) return;

      // Un réglage hérité contient un CODE d'API, plus un identifiant : il ne
      // correspond à aucun modèle et l'appel IA échouerait en 404. On repart
      // alors du modèle « Défaut », comme au premier lancement.
      const stored = StorageService.getActiveModelId();
      if (stored && aiModels.some(m => m.id === stored)) return;

      const def = aiModels.find(m => m.isDefault) || aiModels[0];
      if (def) handleActiveModelChange(def.id);
  }, [aiModels]);

  const handleActiveModelChange = (modelId: string) => {
      setActiveModelIdState(modelId);
      StorageService.setActiveModelId(modelId);
      // Write-back best-effort : la case « Défaut » du catalogue suit le choix.
      const chosen = aiModels.find(m => m.id === modelId);
      // Marquer un défaut démarque les autres côté Worker, dans le même batch :
      // plus besoin de démarquer les précédents un par un.
      if (chosen) Api.setModelDefault(chosen.id, true).catch(console.error);
      // Reflète l'état localement
      setAiModels(prev => prev.map(m => ({ ...m, isDefault: m.id === modelId })));
  };

  const handleQuickAddIdea = async (title: string, notes: string, targetFormat?: string | null) => {
    setIsSyncing(true);
    try {
        const { content: newItem } = await Api.createContent({
            title, notes, targetFormat: targetFormat ?? null,
        });
        const newItems = [newItem, ...items];
        setItems(newItems);
        await StorageService.setCachedContent(newItems);
    } catch (e: any) {
        setAlertInfo({
            isOpen: true,
            title: "Création impossible",
            message: e.message || "Erreur lors de la création.",
            type: 'error'
        });
        throw e; // Permet à la vue de savoir qu'il y a eu une erreur
    } finally {
        setIsSyncing(false);
    }
  };

  /**
   * Une vidéo directe sans script (SPEC §12.7) : un contenu en Brouillon dont le
   * format et le brouillon vide viennent du registre, ouvert sur son montage.
   */
  const creerVideoDirecte = async (titre: string): Promise<void> => {
    try {
        const { content } = await Api.createContent({
            title: titre,
            status: ContentStatus.DRAFTING,
            targetFormat: VIDEO_DIRECTE.format,
            draft: VIDEO_DIRECTE.brouillon(),
        });
        const suite = [content, ...items];
        setItems(suite);
        await StorageService.setCachedContent(suite);
        // Une vidéo sans script n'a qu'à recevoir sa prise : elle s'ouvre sur son montage.
        ouvrirContenu(content, 'conversations');
    } catch (e: any) {
        setAlertInfo({ isOpen: true, title: 'Création impossible', message: e?.message || 'La vidéo n’a pas pu être créée.', type: 'error' });
        throw e;
    }
  };

  /** L'étape d'un contenu, calculée — ou, faute du fil et du montage, déduite du contenu seul. */
  const etapeDe = (item: ContentItem): EtapeCourante =>
      etapes[item.id] ?? etapeCourante({ contenu: item });

  /**
   * Un contenu s'ouvre sur son étape courante, d'où qu'on vienne (SPEC §13.4) :
   * la liste d'où l'on part ne décide que du retour.
   */
  const ouvrirContenu = (item: ContentItem, depuis?: ListeContenus) => {
      const onglet = ongletDeLEditeur(etapeDe(item).etape);
      if (depuis === undefined && item.serieId && currentSocialTab === 'series') updateSerieRoute(item.serieId, item.id, onglet);
      else updateRoute('social', depuis ?? listeDuContenu(item), item.id, onglet);
  };

  /** Fermer un contenu ouvert depuis sa série ramène au plan, pas à la liste. */
  const handleCloseEditor = () => {
      if (editingSerieId) updateSerieRoute(editingSerieId);
      else updateRoute(currentSpace, currentSocialTab, null, 'idea');
      // Ce qu'on vient de faire dans le contenu a pu changer son étape.
      void lireLesEtapes();
  };

  const handleStepChange = (newStep: EditorStep) => {
      if (!editingItemId) return;
      if (editingSerieId) updateSerieRoute(editingSerieId, editingItemId, newStep);
      else updateRoute(currentSpace, currentSocialTab, editingItemId, newStep);
  };

  /**
   * « Préparer 3 idées » remplace « Analyser tout » (SPEC §13) : l'Analyste
   * prépare l'ouverture des trois idées les plus récentes qui ne le sont pas.
   * Trois, parce qu'on prépare ce qu'on va ouvrir bientôt, pas une réserve.
   */
  const preparerIdees = () => {
      const ids = items
          .filter(i => i.status === ContentStatus.IDEA && !i.analyzedAt)
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 3)
          .map(i => i.id);
      if (ids.length === 0) return;
      setBatchAnalysisState({ isOpen: true, modelId: modelFor('ANALYZE_BATCH'), ids });
  };

  const handleAnalysisComplete = () => {
      synchroniser(); 
  };

  /**
   * Écriture optimiste : l'UI et le cache passent en premier, le serveur ensuite.
   * En cas d'échec on NE revient PAS en arrière (ce serait effacer la frappe
   * de Florent) : l'item est marqué non sauvegardé, ce qui le protège de la
   * synchronisation et déclenche le bandeau de rattrapage.
   *
   * L'erreur est propagée : c'est ce qui permet à l'éditeur d'afficher
   * "Erreur sauvegarde" au lieu d'un "Enregistré" mensonger.
   */
  const handleUpdateItem = async (updatedItem: ContentItem): Promise<void> => {
    setItems(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
    StorageService.updateCachedItem(updatedItem).catch(console.error);

    try {
      await Api.updateContent(updatedItem.id, updatedItem);
      markItemSaved(updatedItem.id);
    } catch (error: any) {
      console.error("Erreur d'enregistrement :", error);
      markItemUnsaved(updatedItem);
      throw error;
    }
  };

  /** Réémet vers le serveur tous les contenus restés en échec. */
  const retryUnsavedItems = async () => {
    if (isRetryingUnsaved) return;
    setIsRetryingUnsaved(true);
    let lastError: string | null = null;

    for (const item of Array.from(unsavedItemsRef.current.values())) {
        try {
            await Api.updateContent(item.id, item);
            unsavedItemsRef.current.delete(item.id);
        } catch (e: any) {
            lastError = e?.message || "Erreur inconnue";
        }
    }

    syncUnsavedState();
    setIsRetryingUnsaved(false);

    if (unsavedItemsRef.current.size === 0) {
        setAlertInfo({
            isOpen: true,
            title: "Sauvegarde réussie",
            message: "Tous les contenus en attente ont été enregistrés.",
            type: 'success'
        });
    } else if (lastError) {
        setAlertInfo({
            isOpen: true,
            title: "L'enregistrement échoue toujours",
            message: lastError,
            type: 'error'
        });
    }
  };

  const handleTransformToDraft = async (
    updatedItem: ContentItem,
    options?: { launchInterview?: boolean }
  ): Promise<void> => {
    // Sauvegarder l'item avec le nouveau statut DRAFTING.
    // Si le serveur refuse, on reste sur place : le bandeau explique pourquoi.
    try {
        await handleUpdateItem(updatedItem);
    } catch {
        return;
    }
    // Indiquer à ContentEditor qu'il doit lancer l'interview dès l'ouverture
    if (options?.launchInterview) {
        setPendingEditorAction('interview');
    }
    // Naviguer vers l'éditeur — dans sa série quand le contenu en vient : on
    // ne quitte pas une série pour travailler l'une de ses publications.
    if (updatedItem.serieId) updateSerieRoute(updatedItem.serieId, updatedItem.id, 'idea');
    else updateRoute('social', 'conversations', updatedItem.id, 'idea');
  };

  const handleDeleteItem = async (itemToDelete: ContentItem): Promise<void> => {
      const newItems = items.filter(i => i.id !== itemToDelete.id);
      setItems(newItems);
      if (editingSerieId) updateSerieRoute(editingSerieId);
      else updateRoute(currentSpace, currentSocialTab, null, 'idea');
      
      StorageService.setCachedContent(newItems).catch(console.error);

      try {
          await Api.deleteContent(itemToDelete.id);
          setAlertInfo({
              isOpen: true,
              title: "Suppression réussie",
              message: "L'élément a été supprimé.",
              type: 'success'
          });
      } catch (error: any) {
          console.error("Erreur à la suppression :", error);
          setError("Impossible de supprimer ce contenu. " + error.message);
      }
  };

  // --- SÉRIES (SPEC §6) ---

  const persistSeries = (next: Serie[]) => {
      const sorted = sortByUpdatedDesc(next);
      setSeries(sorted);
      StorageService.setCachedSeries(sorted).catch(console.error);
  };

  /**
   * Crée la série et ouvre son écran de plan dans la foulée : créer une série
   * vide n'a aucun intérêt en soi, ce qu'on veut c'est la remplir.
   * L'erreur est propagée pour que le formulaire garde la saisie.
   */
  const handleCreateSerie = async (input: {
      titre: string; intention?: string | null; sourceContentId?: string | null;
  }): Promise<Serie> => {
      try {
          const { serie } = await Api.createSerie(input);
          persistSeries([serie, ...series]);
          updateSerieRoute(serie.id);
          return serie;
      } catch (e: any) {
          setAlertInfo({
              isOpen: true,
              title: "Création impossible",
              message: e.message || "La série n'a pas pu être créée.",
              type: 'error'
          });
          throw e;
      }
  };

  const handleUpdateSerie = async (id: string, patch: Partial<Serie>): Promise<void> => {
      try {
          const { serie } = await Api.updateSerie(id, patch);
          persistSeries(series.map(s => (s.id === id ? serie : s)));
      } catch (e: any) {
          setAlertInfo({
              isOpen: true,
              title: "Enregistrement impossible",
              message: e.message || "La série n'a pas pu être mise à jour.",
              type: 'error'
          });
      }
  };

  /** La série disparaît, ses contenus survivent — détachés (SPEC §3.3). */
  /**
   * `mode` décide du sort des publications (SPEC §3.3) : détachées, elles
   * perdent leur rattachement et leur rang ; supprimées, elles quittent la
   * liste avec la série. Le cache local suit le même sort dans la foulée —
   * sinon la série disparaît de l'écran mais ses publications y restent
   * jusqu'à la synchronisation suivante.
   */
  const handleDeleteSerie = async (serie: Serie, mode: ModeSuppressionSerie): Promise<void> => {
      try {
          await Api.deleteSerie(serie.id, mode);
          persistSeries(series.filter(s => s.id !== serie.id));
          const suivants = mode === 'supprimer'
              ? items.filter(i => i.serieId !== serie.id)
              : items.map(i => (i.serieId === serie.id ? { ...i, serieId: null, seriePosition: null } : i));
          setItems(suivants);
          StorageService.setCachedContent(suivants).catch(console.error);
          updateRoute('social', 'conversations');
      } catch (e: any) {
          setAlertInfo({
              isOpen: true,
              title: "Suppression impossible",
              message: e.message || "La série n'a pas pu être supprimée.",
              type: 'error'
          });
      }
  };

  /**
   * Le plan devient des contenus, en une seule écriture transactionnelle
   * (SPEC §6.3). L'erreur remonte à l'écran de plan, qui garde le tableau
   * intact : rien n'est perdu si le lot est refusé.
   */
  const handleCreateSeriePlan = async (serieId: string, entries: PlanSeriesEntry[]): Promise<void> => {
      const ts = Date.now();
      const { items: created } = await Api.createContentsBatch(entries.map((entry, index) => ({
          title: entry.titre,
          // L'angle du plan est celui de CE contenu dans la série.
          angle: entry.angle || null,
          // La matière produite par l'Éclateur devient les notes : c'est ce que
          // Florent aurait écrit à la main, et ce sur quoi l'Atelier mordra.
          notes: entry.notes || '',
          targetFormat: entry.format,
          objectif: entry.objectif,
          justification: entry.justification || null,
          serieId,
          // Le rang fait la progression : la série se relit dans cet ordre.
          seriePosition: index + 1,
          // L'Éclateur EST l'Analyste de la série : il a décidé angle, format et
          // objectif en voyant l'ensemble. Les repasser un par un à l'Analyste
          // casserait l'équilibre qu'il vient de construire — ils arrivent donc
          // analysés, et « Analyser tout » ne les reprend pas.
          analyzedAt: ts,
          /**
           * Directement en Brouillon, pas en Idée.
           *
           * L'étape Idée sert à décider ce qu'on fait d'une intuition : format,
           * angle, objectif, et faut-il l'analyser. Pour une publication de
           * série, TOUT cela est déjà tranché — par l'Éclateur, en voyant
           * l'ensemble, et le format est désormais exigé avant création. Il ne
           * reste rien à y faire : c'était une étape de passage, pas de travail.
           */
          status: ContentStatus.DRAFTING,
      })));
      const next = sortByLastEditedDesc([...created, ...items]);
      setItems(next);
      await StorageService.setCachedContent(next);
  };

  /** L'Éclateur : un plan proposé, jamais créé — c'est le tableau qui décide (SPEC §6.2). */
  const handleGenerateSeriePlan = (serie: Serie) =>
      (nombreSouhaite: number, dejaPrevus: SerieSibling[]): Promise<PlanSeriesEntry[]> =>
          generateSeriePlan({
              serie,
              sourceContent: serie.sourceContentId
                  ? items.find(i => i.id === serie.sourceContentId) || null
                  : null,
              dejaPrevus,
              modelId: modelFor('PLAN_SERIES'),
              nombreSouhaite,
          });

  /** « Décliner » depuis un contenu Prêt ou Publié : il devient le pilier. */
  const handleDeclineContent = (item: ContentItem) => {
      void handleCreateSerie({
          titre: item.title || 'Nouvelle série',
          intention: null,
          sourceContentId: item.id,
      }).catch(() => { /* alerte déjà affichée */ });
  };

  /** Ouvrir une publication depuis sa série y reste : c'est le même travail. */
  const handleOpenSerieContent = (item: ContentItem) => {
      const onglet = ongletDeLEditeur(etapeDe(item).etape);
      if (item.serieId) updateSerieRoute(item.serieId, item.id, onglet);
      else updateRoute('social', listeDuContenu(item), item.id, onglet);
  };

  // --- AI ANALYSIS FLOW (sans modale — modèle actif global) ---

  const triggerSingleAnalysis = (item: ContentItem) => {
      void performSingleAnalysis(modelFor('ANALYZE_BATCH'), item.id);
  };

  const performSingleAnalysis = async (modelId: string, itemId?: string) => {
      const itemToAnalyze = items.find(i => i.id === itemId);
      if (!itemToAnalyze) return;

      setIsSingleAnalyzing(true);
      try {
          const actionConfig = AI_ACTIONS.ANALYZE_BATCH;
          const systemInstruction = actionConfig.getSystemInstruction();

          const contentPayload = [{
              id: itemToAnalyze.id,
              titre: itemToAnalyze.title,
              notes: itemToAnalyze.notes,
              format_cible: itemToAnalyze.targetFormat || "Non précisé",
          }];
          
          const { text: responseText, usage } = await AiService.generateContent({
              modelId: modelId,
              systemInstruction: systemInstruction,
              prompt: JSON.stringify(contentPayload),
              action: 'Analyse des idées',
              aiAction: 'ANALYZE_BATCH',
          });

          let results: any[] = [];
          try {
              results = JSON.parse(responseText);
          } catch(e) {
              const cleaned = responseText.replace(/```json\s?/g, '').replace(/```\s?/g, '').trim();
              results = JSON.parse(cleaned);
          }
          
          if (Array.isArray(results) && results.length > 0) {
              const res = results[0];
              const rawPlatforms = Array.isArray(res.plateformes) ? res.plateformes : [];
              const mappedPlatforms: Platform[] = rawPlatforms
                .map((p: string) => p as Platform)
                .filter((p: any) => Object.values(Platform).includes(p));

              // Le format cible est choisi par l'utilisateur et ne doit pas être écrasé par l'IA.
              // L'objectif d'une publication de série non plus : il vient du plan,
              // décidé en voyant l'ensemble — l'Analyste, lui, ne voit qu'une idée.
              const objectif = itemToAnalyze.serieId
                  ? undefined
                  : (isObjectif(res.objectif) ? res.objectif : undefined);
              const justification = typeof res.justification === 'string' ? res.justification : undefined;
              const suggestedMetaphor = typeof res.metaphore_suggeree === 'string' ? res.metaphore_suggeree : undefined;
              const suggestedTitle = typeof res.titre === 'string' ? res.titre : undefined;
              const depth = isProfondeur(res.profondeur) ? res.profondeur : undefined;

              const modelName = aiModels.find(m => m.id === modelId)?.name || modelId;

              const rawAngle = (res.angle_strategique ?? res.angle ?? "");
              const angleWithTitle = suggestedTitle
                  ? `**Titre suggéré :** ${suggestedTitle}\n\n${rawAngle}`
                  : rawAngle;

              const updatedItem: ContentItem = {
                  ...itemToAnalyze,
                  // Le titre initial n'est PAS remplacé — le titre suggéré est visible dans le bloc Analyse IA
                  verdict: res.verdict,
                  // Plus de signature collée derrière le texte : la provenance
                  // part au journal des productions (SPEC §2.6).
                  strategicAngle: angleWithTitle,
                  platforms: mappedPlatforms.length > 0 ? mappedPlatforms : itemToAnalyze.platforms,
                  // targetFormat non modifié : contrôlé par l'utilisateur dans IdeaModal
                  objectif: objectif || itemToAnalyze.objectif,
                  justification: justification ?? itemToAnalyze.justification,
                  suggestedMetaphor: suggestedMetaphor ?? itemToAnalyze.suggestedMetaphor,
                  depth: depth ?? itemToAnalyze.depth,
                  analyzedAt: Date.now(),
              };
              await handleUpdateItem(updatedItem);

              // L'analyse ne vise aucune colonne en particulier — elle en
              // remplit plusieurs : journalisée sans être appliquée.
              Api.recordGeneration(itemToAnalyze.id, {
                  kind: 'analysis', modelId, modelLabel: modelName, payload: JSON.stringify(res),
                  promptTokens: usage.entree, completionTokens: usage.sortie, costUsd: usage.coutUsd,
              }).catch(e => console.warn('Analyse non journalisée :', e));
          }
      } catch (error: any) {
          // Déjà annoncé si l'appel lui-même a échoué : ne reste ici que ce qui
          // casse APRÈS la réponse — un parsing, une écriture.
          if (!AiService.estSignalee(error)) setAlertInfo({ isOpen: true, title: "Analyse impossible", message: error.message, type: "error" });
      } finally {
          setIsSingleAnalyzing(false);
      }
  };

  // ── Hooks dérivés — TOUJOURS avant tout return conditionnel ──────────────

  const filteredItems = useMemo(() => items.filter(item =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    bodyJsonToText(item.draft || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.notes.toLowerCase().includes(searchQuery.toLowerCase())
  ), [items, searchQuery]);

  /**
   * Ce que le Rédacteur reçoit EN PLUS quand le contenu ouvert appartient à
   * une série (SPEC §6.4) : le thème, l'intention, le texte du pilier, et les
   * angles des frères — jamais leur texte.
   */
  /**
   * De quoi situer la publication ouverte dans sa série, pour l'éditeur : son
   * rang, le total, et ses voisines. C'est ce qui permet d'enchaîner sans
   * repasser par le plan.
   */
  const editorSerieNav = useMemo(() => {
      if (!editingItem?.serieId || !editingSerieId) return null;
      const serie = series.find(s => s.id === editingSerieId);
      if (!serie) return null;

      const fratrie = items
          .filter(i => i.serieId === serie.id)
          .sort((a, b) => (a.seriePosition ?? 9999) - (b.seriePosition ?? 9999));
      const index = fratrie.findIndex(i => i.id === editingItem.id);

      return {
          titre: serie.titre,
          // Le RANG du plan fait foi, pas la place dans ce qui existe déjà :
          // une série se compte comme elle a été pensée, même à moitié créée.
          position: editingItem.seriePosition ?? (index >= 0 ? index + 1 : null),
          total: fratrie.length,
          precedent: index > 0 ? fratrie[index - 1] : null,
          suivant: index >= 0 && index < fratrie.length - 1 ? fratrie[index + 1] : null,
      };
  }, [editingItem, editingSerieId, series, items]);

  const editorSerieContext = useMemo(() => {
      if (!editingItem?.serieId) return undefined;
      const serie = series.find(s => s.id === editingItem.serieId);
      if (!serie) return undefined;

      // Un pilier qui serait le contenu ouvert lui-même ne s'auto-alimente pas.
      const source = serie.sourceContentId && serie.sourceContentId !== editingItem.id
          ? items.find(i => i.id === serie.sourceContentId) || null
          : null;

      return buildSerieContextSection({
          titre: serie.titre,
          intention: serie.intention,
          sourceText: source ? (bodyJsonToText(source.draft || '') || source.notes) : null,
          position: editingItem.seriePosition,
          titreCourant: editingItem.title,
          freres: items
              .filter(i => i.serieId === serie.id && i.id !== editingItem.id)
              .map(i => ({ titre: i.title, angle: i.angle, position: i.seriePosition })),
      });
  }, [editingItem, series, items]);

  /**
   * L'étape de chaque contenu (SPEC §13.1) : un calcul, servi à toutes les
   * listes, au plan de série et à l'ouverture — ils ne peuvent plus se
   * contredire.
   */
  const etapes = useMemo(() => {
      const parId: Record<string, EtapeCourante> = {};
      for (const item of items) {
          const fil = fils?.contenus[item.id];
          parId[item.id] = etapeCourante({
              contenu: item,
              session: fil ? { messages: fil.messages, tours: fil.tours } : null,
              relecture: fil?.relecture ?? null,
              brouillonLe: fil?.brouillonLe ?? null,
              montage: montages?.contenus[item.id] ?? null,
          });
      }
      return parId;
  }, [items, fils, montages]);

  /** Ce qui s'est dit ou fait en dernier, par contenu : la seconde ligne de Conversations. */
  const derniers = useMemo(() => {
      const parId: Record<string, DernierMot | null> = {};
      const maintenant = Date.now();
      for (const item of items) {
          if (item.status === ContentStatus.IDEA || item.status === ContentStatus.PUBLISHED) continue;
          const fait = dernierFait(fils?.contenus[item.id]?.dernier ?? null, montages?.contenus[item.id] ?? null);
          parId[item.id] = fait
              ? { ...resumerLeFait(fait, etapes[item.id]?.sorte ?? 'ecrit'), moment: momentDuFait(fait.le, maintenant) }
              : null;
      }
      return parId;
  }, [items, fils, montages, etapes]);

  const ideaItems = useMemo(() => filteredItems.filter(i => i.status === ContentStatus.IDEA), [filteredItems]);
  const conversationItems = useMemo(
      () => filteredItems.filter(i => i.status !== ContentStatus.IDEA && i.status !== ContentStatus.PUBLISHED),
      [filteredItems],
  );
  const publishedItems = useMemo(() => filteredItems.filter(i => i.status === ContentStatus.PUBLISHED), [filteredItems]);

  const counts = useMemo(() => ({
      conversations: items.filter(i => i.status !== ContentStatus.IDEA && i.status !== ContentStatus.PUBLISHED).length,
      ideas: items.filter(i => i.status === ContentStatus.IDEA).length,
      publies: items.filter(i => i.status === ContentStatus.PUBLISHED).length,
  }), [items]);

  // ── Returns conditionnels (après tous les hooks) ──────────────────────────

  if (checkingAuth) {
    return (
      <div className="h-screen flex items-center justify-center bg-brand-light dark:bg-dark-bg">
        <Patience titre="Vérification de la session" />
      </div>
    );
  }

  if (!authenticated) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  const isEditorTakeover = currentSpace === 'social' && !!editingItem && editingItem.status !== ContentStatus.IDEA;

  return (
    <div className="flex h-screen bg-brand-light dark:bg-dark-bg text-brand-main dark:text-dark-text font-sans transition-colors duration-200 overflow-hidden border-t border-brand-border dark:border-dark-sec-border">

      <Sidebar
          currentSpace={currentSpace}
          currentSocialTab={currentSocialTab === 'series' ? 'conversations' : currentSocialTab}
          currentSettingsSection={currentSettingsSection}
          currentSettingsPersona={currentSettingsPersona}
          currentCorpusSection={currentCorpusSection}
          currentCorpusBloc={currentCorpusBloc}
          onNavigate={(space, tab) => updateRoute(space, tab)}
          onNavigateSettings={updateSettingsRoute}
          onNavigateCorpus={updateCorpusRoute}
          counts={counts}
          corpusCounts={corpusCounts}
          isMobileOpen={isMobileMenuOpen}
          onMobileClose={() => setIsMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">

        {/*
            Le voile bloquant de la synchronisation a disparu : il masquait tout
            l'écran pour une opération que personne n'attend — celle du démarrage
            partait toute seule — et il n'apprenait rien de plus que le bandeau.
            Ne reste que la première lecture, où il n'y a de toute façon rien à
            afficher derrière.
        */}
        {isInitializing && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-brand-light dark:bg-dark-bg">
                <Patience titre="Chargement de vos contenus" detail="Cache local, puis synchronisation" />
            </div>
        )}

        {/* 64 px, à la hauteur de l'en-tête du panneau : les deux bordures basses se prolongent. */}
        <header className="relative h-16 px-4 md:px-8 flex items-center justify-between border-b border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface shrink-0 z-20">
            <div className="flex items-center gap-3 min-w-0">
              <button
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="md:hidden p-2 -ml-1 rounded-lg text-brand-main/60 dark:text-dark-text/60 hover:bg-brand-light dark:hover:bg-dark-sec-bg transition-colors"
              >
                  <Menu className="w-5 h-5" />
              </button>

              <TitreEcran>
                  {currentSpace === 'social' && (currentSocialTab === 'series'
                      ? (editingSerie ? `Série · ${editingSerie.titre}` : 'Série')
                      : libelleDeListe(currentSocialTab))}
                  {currentSpace === 'clients' && 'Clients'}
                  {currentSpace === 'psychedelics' && 'Psychédéliques'}
                  {currentSpace === 'corpus' && corpusSectionLabel(currentCorpusSection, currentCorpusBloc)}
                  {currentSpace === 'settings' && settingsSectionLabel(currentSettingsSection)}
              </TitreEcran>
              {currentSpace === 'corpus' && (
                  <p className="hidden lg:block text-xs text-brand-main/50 dark:text-dark-text/50 truncate">
                      {corpusSectionSousTitre(currentCorpusSection, currentCorpusBloc)}
                  </p>
              )}
              {currentSpace === 'settings' && (
                  <p className="hidden lg:block text-xs text-brand-main/50 dark:text-dark-text/50 truncate">
                      {settingsSectionSousTitre(currentSettingsSection)}
                  </p>
              )}
            </div>

            <div className="flex items-center gap-1.5">
                 {/* Sélecteur global du modèle IA — utilisé par toutes les actions */}
                 <div className="relative flex items-center">
                     <Cpu className="w-[13px] h-[13px] absolute left-2 text-brand-main/40 dark:text-dark-text/40 pointer-events-none" />
                     <select
                        value={activeModelId}
                        onChange={(e) => handleActiveModelChange(e.target.value)}
                        title="Modèle IA utilisé par toutes les actions"
                        className="appearance-none pl-6 pr-6 py-1.5 max-w-[180px] truncate rounded-lg border border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg text-xs font-semibold text-brand-main dark:text-white outline-hidden focus:border-brand-main dark:focus:border-white transition-colors cursor-pointer"
                     >
                        {aiModels.length === 0 && <option value="">Aucun modèle configuré</option>}
                        {/* Groupé par adaptateur : le même modèle peut être joignable
                            par deux chemins, et le nom seul ne les distingue pas. */}
                        {grouperParAdaptateur(aiModels, providers)
                            .filter(g => g.models.length > 0)
                            .map(g => (
                                <optgroup key={g.id} label={g.label}>
                                    {g.models.map(m => (
                                        <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                </optgroup>
                            ))}
                     </select>
                     <ChevronDown className="w-3 h-3 absolute right-2 text-brand-main/40 dark:text-dark-text/40 pointer-events-none" />
                 </div>

                 {/* L'icône tourne, pas le bouton : `disabled:animate-spin` faisait
                     pivoter la zone cliquable entière, halo de survol compris. */}
                 <button
                    onClick={() => synchroniser(true)}
                    disabled={isSyncing}
                    className="p-2 rounded-lg text-brand-main/60 dark:text-dark-text/60 hover:bg-brand-light dark:hover:bg-dark-sec-bg hover:text-brand-main dark:hover:text-white transition-colors disabled:opacity-60"
                    title={isSyncing ? 'Synchronisation en cours…' : 'Synchroniser'}
                 >
                     <RefreshCw className={`w-[14px] h-[14px] ${isSyncing ? 'animate-spin' : ''}`} />
                 </button>
                 <button
                    onClick={handleLogout}
                    className="p-2 rounded-lg text-brand-main/60 dark:text-dark-text/60 hover:bg-erreur/10 hover:text-erreur transition-colors"
                    title="Déconnexion"
                 >
                     <LogOut className="w-[14px] h-[14px]" />
                 </button>
            </div>

            {/* Le filet court sur la bordure basse de l'en-tête : toujours au même
                endroit, quel que soit l'écran ouvert, et sans rien pousser. */}
            <FiletActivite />
        </header>

        {/* Le bandeau des appels en cours vit ici, dans la coque : un appel lancé
            depuis l'atelier reste visible quand on revient à la liste (SPEC §3.5.1). */}
        <BandeauActivite />

        {(currentSpace === 'settings' || currentSpace === 'corpus' || (currentSpace === 'social' && !isEditorTakeover)) && (
          <MobileSubTabs
              space={currentSpace === 'settings' ? 'settings' : currentSpace === 'corpus' ? 'corpus' : 'social'}
              currentTab={currentSocialTab === 'series' ? 'conversations' : currentSocialTab}
              currentSettingsSection={currentSettingsSection}
              currentSettingsPersona={currentSettingsPersona}
              currentCorpusSection={currentCorpusSection}
              currentCorpusBloc={currentCorpusBloc}
              onNavigate={(tab) => updateRoute('social', tab)}
              onNavigateSettings={updateSettingsRoute}
              onNavigateCorpus={updateCorpusRoute}
              counts={counts}
          />
        )}

        {error && (
          <div className="bg-erreur/10 border-b border-erreur/30 px-4 py-2 text-center text-xs shrink-0 animate-fade-in">
              <span className="text-erreur flex items-center justify-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      {error}
                  </div>
                  <button onClick={() => synchroniser()} className="underline font-bold hover:no-underline ml-2">Réessayer</button>
              </span>
          </div>
        )}

        {/* Travail non enregistré : bandeau persistant tant que le serveur n'a pas accepté */}
        {unsavedIds.length > 0 && (
          <div className="bg-alerte/10 border-b border-alerte/30 px-4 py-2 text-xs shrink-0 animate-fade-in">
              <div className="text-alerte flex items-center justify-center gap-3 flex-wrap">
                  <span className="flex items-center gap-2 font-semibold">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {unsavedIds.length === 1
                          ? "1 contenu n'a pas pu être enregistré — il n'existe que sur cet appareil."
                          : `${unsavedIds.length} contenus n'ont pas pu être enregistrés — ils n'existent que sur cet appareil.`}
                  </span>
                  <button
                      onClick={retryUnsavedItems}
                      disabled={isRetryingUnsaved}
                      className="inline-flex items-center gap-1.5 underline font-bold hover:no-underline disabled:opacity-40 disabled:no-underline"
                  >
                      {isRetryingUnsaved
                          ? <EnCours label="Enregistrement…" taille="xs" />
                          : "Réessayer maintenant"}
                  </button>
              </div>
          </div>
        )}

        {currentSpace === 'clients' && (
            <main className="flex-1 overflow-y-auto">
                <RdvView />
            </main>
        )}

        {currentSpace === 'settings' && (
            <SettingsSpace
                section={currentSettingsSection}
                persona={currentSettingsPersona}
                displayPrefs={displayPrefs}
                onDisplayPrefsChange={handleDisplayPrefsChange}
                aiModels={aiModels}
                onModelsChange={handleModelsChange}
                activeModelId={activeModelId}
                onActiveModelChange={handleActiveModelChange}
                actionModels={actionModels}
                onActionModelsChange={setActionModels}
                providers={providers}
                onProvidersChange={setProviders}
            />
        )}

        {currentSpace === 'corpus' && (
            <main className="flex-1 overflow-y-auto">
                <div className={ecran('liste')}>
                    <CorpusSpace section={currentCorpusSection} bloc={currentCorpusBloc} />
                </div>
            </main>
        )}

        {currentSpace === 'psychedelics' && (
            <main className="flex-1 overflow-y-auto">
                <div className={ecran('liste')}>
                    <p className="text-xs text-brand-main/50 dark:text-dark-text/50 mb-4">
                        Calculateur de repères de dosage et aide à la réduction des risques
                    </p>
                    <PsychedelicsCalculator />
                </div>
            </main>
        )}

        {currentSpace === 'social' && (
            <main className="flex-1 overflow-hidden relative flex flex-col">

                {editingItem && editingItem.status !== ContentStatus.IDEA ? (
                    <ContentEditor
                        item={editingItem}
                        aiModels={aiModels}
                        activeModelId={activeModelId}
                        onClose={handleCloseEditor}
                        onSave={handleUpdateItem}
                        onDelete={handleDeleteItem}
                        onDecline={handleDeclineContent}
                        modelFor={modelFor}
                        serieContext={editorSerieContext}
                        serieNav={editorSerieNav}
                        onOpenSerie={() => editingSerieId && updateSerieRoute(editingSerieId)}
                        onOpenSerieContent={handleOpenSerieContent}
                        activeStep={currentEditorStep}
                        onStepChange={handleStepChange}
                        initialAction={pendingEditorAction}
                        onInitialActionConsumed={() => setPendingEditorAction(null)}
                    />
                ) : (
                    <div className="flex-1 overflow-y-auto">
                        <div className={ecran('liste')}>

                            {currentSocialTab === 'conversations' && (
                                <ConversationsView
                                    items={conversationItems}
                                    tous={items}
                                    series={series}
                                    etapes={etapes}
                                    derniers={derniers}
                                    searchQuery={searchQuery}
                                    onSearchChange={setSearchQuery}
                                    filtre={filtreGeste}
                                    onFiltre={setFiltreGeste}
                                    onOuvrir={(item) => ouvrirContenu(item, 'conversations')}
                                    onOuvrirPlan={(serie) => updateSerieRoute(serie.id)}
                                    onNouvelleIdee={() => { setIdeeEnAvant(true); updateRoute('social', 'ideas'); }}
                                    onCreerSerie={async (titre) => { await handleCreateSerie({ titre, intention: null }); }}
                                    onCreerVideoDirecte={creerVideoDirecte}
                                    isInitializing={isInitializing}
                                />
                            )}

                            {currentSocialTab === 'ideas' && (
                                <IdeesView
                                    items={ideaItems}
                                    searchQuery={searchQuery}
                                    onSearchChange={setSearchQuery}
                                    onOuvrir={(item) => ouvrirContenu(item, 'ideas')}
                                    onAjouter={async (titre, format) => { await handleQuickAddIdea(titre, '', format); }}
                                    onPreparer={preparerIdees}
                                    ajoutEnAvant={ideeEnAvant}
                                    isSyncing={isSyncing}
                                    isInitializing={isInitializing}
                                />
                            )}

                            {currentSocialTab === 'publies' && (
                                <PubliesView
                                    items={publishedItems}
                                    etapes={etapes}
                                    vue={vuePublies}
                                    onVue={poserVuePublies}
                                    searchQuery={searchQuery}
                                    onSearchChange={setSearchQuery}
                                    onOuvrir={(item) => ouvrirContenu(item, 'publies')}
                                    isInitializing={isInitializing}
                                />
                            )}

                            {currentSocialTab === 'series' && editingSerie && (
                                <SeriePlanView
                                    serie={editingSerie}
                                    contents={items.filter(i => i.serieId === editingSerie.id)}
                                    sourceContent={
                                        editingSerie.sourceContentId
                                            ? items.find(i => i.id === editingSerie.sourceContentId) || null
                                            : null
                                    }
                                    onBack={() => updateRoute('social', 'conversations')}
                                    onUpdate={(patch) => handleUpdateSerie(editingSerie.id, patch)}
                                    onDelete={(mode) => handleDeleteSerie(editingSerie, mode)}
                                    onCreateContents={(entries) => handleCreateSeriePlan(editingSerie.id, entries)}
                                    onOpenContent={handleOpenSerieContent}
                                    onGeneratePlan={handleGenerateSeriePlan(editingSerie)}
                                />
                            )}

                        </div>
                    </div>
                )}

                {editingItem && editingItem.status === ContentStatus.IDEA && (
                    <IdeaModal
                        item={editingItem}
                        onClose={handleCloseEditor}
                        onChange={handleUpdateItem}
                        onDelete={handleDeleteItem}
                        onTransformToDraft={handleTransformToDraft}
                        onAnalyze={() => triggerSingleAnalysis(editingItem)}
                        isReanalyzing={isSingleAnalyzing}
                    />
                )}

                <AnalysisModal
                    isOpen={batchAnalysisState.isOpen}
                    onClose={() => setBatchAnalysisState({ ...batchAnalysisState, isOpen: false })}
                    itemsToAnalyze={items.filter(i => batchAnalysisState.ids.includes(i.id))}
                    aiModels={aiModels}
                    selectedModelId={batchAnalysisState.modelId}
                    onAnalysisComplete={handleAnalysisComplete}
                />

                <AlertModal
                    isOpen={alertInfo.isOpen}
                    onClose={() => setAlertInfo({ ...alertInfo, isOpen: false })}
                    title={alertInfo.title}
                    message={alertInfo.message}
                    type={alertInfo.type}
                />
            </main>
        )}
      </div>

    </div>
  );
}

export default App;
