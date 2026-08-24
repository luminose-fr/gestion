/**
 * L'espace Réglages.
 *
 * C'était un tiroir de 400 px empilant quatre onglets ; c'est devenu un espace
 * comme Contenus — les sections dans le panneau de gauche (rendu par la barre
 * latérale), leur contenu ici. Le gain n'est pas cosmétique : les neuf actions
 * du flux tenaient derrière un accordéon, le catalogue s'étirait en une
 * colonne, et la moitié des réglages ne se voyait qu'en faisant défiler.
 */
import React, { useEffect, useState } from 'react';
import {
    Cpu, Plus, Trash2, Save, ChevronLeft, User, Eye, CheckCircle2,
    FlaskConical, AlertCircle, Download, KeyRound, Compass, Search, RefreshCw,
} from 'lucide-react';
import { AIModel, DisplayPrefs, DEFAULT_DISPLAY_PREFS } from '../../types';
import * as Api from '../../services/apiService';
import * as AiService from '../../services/aiService';
import { ConfirmModal } from '../CommonModals';
import { EnCours, Patience } from '../Feedback';
import {
    ANALYSTE_PERSONA, COACH_PERSONA, REDACTEUR_PERSONA, ARTISTE_PERSONA, VOICE_RULES,
    AI_ACTION_CATALOG, ATTENDU_FAMILLES, ATTENDU_ORDRE, profilerModele, normaliserNomModele,
} from '@luminose/editorial';
import { SettingsSection, grouperParAdaptateur } from './sections';

interface SettingsSpaceProps {
    section: SettingsSection;
    displayPrefs: DisplayPrefs;
    onDisplayPrefsChange: (prefs: DisplayPrefs) => void;
    aiModels: AIModel[];
    onModelsChange: (models: AIModel[]) => void;
    /** Modèle IA actif global — un identifiant du catalogue, jamais un code d'API. */
    activeModelId: string;
    onActiveModelChange: (modelId: string) => void;
    actionModels: Record<string, string>;
    onActionModelsChange: (map: Record<string, string>) => void;
    /** Adaptateurs et état de leur clé, chargés par l'application. */
    providers: Api.ProviderKeyState[];
    onProvidersChange: (providers: Api.ProviderKeyState[]) => void;
}

const HARDCODED_PERSONAS = [
    { id: 'voice',    name: 'Règles de voix (transverses)',    usage: 'Partagé',          prompt: VOICE_RULES       },
    { id: 'stratege', name: 'Stratège (ex-Rédacteur en Chef)', usage: 'Analyse',          prompt: ANALYSTE_PERSONA  },
    { id: 'coach',    name: 'Coach (sparring-partner)',        usage: 'Session chat',     prompt: COACH_PERSONA     },
    { id: 'editeur',  name: 'Éditeur Littéraire & Scénariste', usage: 'Rédaction finale', prompt: REDACTEUR_PERSONA },
    { id: 'artiste',  name: 'Directeur Artistique',            usage: 'Prompts image',    prompt: ARTISTE_PERSONA   },
];

const CHAMP =
    'w-full px-3 py-2.5 bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border ' +
    'focus:border-brand-main rounded-lg text-sm text-brand-main dark:text-white outline-hidden transition-colors';

const ETIQUETTE =
    'block text-[10px] font-black text-brand-main/40 dark:text-dark-text/40 uppercase tracking-widest mb-2';

const TITRE_GROUPE =
    'text-[10px] font-black uppercase tracking-widest text-brand-main/40 dark:text-dark-text/40';

// ─── Atomes ───────────────────────────────────────────────────────────────

const ToggleSwitch: React.FC<{
    label: string;
    description?: string;
    value: boolean;
    onChange: (value: boolean) => void;
}> = ({ label, description, value, onChange }) => (
    <div className="flex items-center justify-between gap-4 px-4 py-3 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-sec-border rounded-xl">
        <div className="min-w-0">
            <p className="text-sm font-medium text-brand-main dark:text-white">{label}</p>
            {description && (
                <p className="text-xs text-brand-main/50 dark:text-dark-text/50 mt-0.5 leading-snug">{description}</p>
            )}
        </div>
        <button
            type="button"
            role="switch"
            aria-checked={value}
            onClick={() => onChange(!value)}
            className={`relative shrink-0 w-10 h-[22px] rounded-full transition-colors duration-200 ${
                value ? 'bg-brand-main dark:bg-white' : 'bg-brand-border dark:bg-dark-sec-border'
            }`}
        >
            <span className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white dark:bg-brand-main shadow-sm transition-transform duration-200 ${
                value ? 'translate-x-[18px]' : 'translate-x-0'
            }`} />
        </button>
    </div>
);

/** En-tête de groupe : un titre, ce qu'il regroupe, et un filet. */
const EnTeteGroupe: React.FC<{ titre: string; detail?: string; droite?: React.ReactNode }> = ({ titre, detail, droite }) => (
    <div className="flex items-baseline justify-between gap-3 border-b border-brand-border dark:border-dark-sec-border pb-1.5 mb-3">
        <span className="flex items-baseline gap-2 min-w-0">
            <span className="text-[13px] font-bold text-brand-main dark:text-white">{titre}</span>
            {detail && <span className="text-[11px] text-brand-main/50 dark:text-dark-text/50 truncate">{detail}</span>}
        </span>
        {droite}
    </div>
);

// ─── Composant ────────────────────────────────────────────────────────────

export const SettingsSpace: React.FC<SettingsSpaceProps> = ({
    section, displayPrefs, onDisplayPrefsChange,
    aiModels, onModelsChange, activeModelId, onActiveModelChange,
    actionModels, onActionModelsChange, providers, onProvidersChange,
}) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);

    const [isSaving, setIsSaving] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    // Sans ça, un refus du Worker ne laissait qu'un console.error : le bouton
    // semblait ne rien faire et Florent croyait le modèle enregistré.
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);

    /** Ce que Florent est en train de taper. Se vide dès que c'est envoyé — une clé ne traîne pas. */
    const [saisies, setSaisies] = useState<Record<string, string>>({});
    const [providerBusy, setProviderBusy] = useState<string | null>(null);
    const [providerError, setProviderError] = useState<string | null>(null);

    const [presetBusy, setPresetBusy] = useState<string | null>(null);

    const [isExporting, setIsExporting] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);

    const [editModel, setEditModel] = useState<Partial<AIModel>>({
        name: '', apiCode: '', cost: 'medium', provider: 'onemin', vendor: '', strengths: '', bestUseCases: '', textQuality: 3,
    });

    /**
     * L'explorateur du catalogue. Il sert à RÉDUIRE le champ — quatre cents
     * modèles, vingt candidats — jamais à décider. Il s'ouvre sur la courte
     * liste, parce qu'une liste qu'on ne lit pas ne réduit rien.
     */
    const [exploring, setExploring] = useState(false);
    const [catalogue, setCatalogue] = useState<Api.CatalogueModel[] | null>(null);
    const [catalogueEtat, setCatalogueEtat] = useState<{
        benchmarks: boolean; raison: string | null;
        ecriture: boolean; ecritureRaison: string | null;
    }>({ benchmarks: false, raison: null, ecriture: false, ecritureRaison: null });
    const [catalogueErreur, setCatalogueErreur] = useState<string | null>(null);
    const [catalogueCharge, setCatalogueCharge] = useState(false);
    const [recherche, setRecherche] = useState('');
    const [vueCatalogue, setVueCatalogue] = useState<'selection' | 'tout'>('selection');
    /** L'identifiant du modèle en cours de rafraîchissement, pour ne pas doubler le clic. */
    const [majEnCours, setMajEnCours] = useState<string | null>(null);
    const [tri, setTri] = useState<'prix' | 'ecriture' | 'slop' | 'intelligence' | 'nom'>('prix');

    const [testApiCode, setTestApiCode] = useState('');
    /** Le testeur sonde un adaptateur précis : « claude-opus-4-7 » chez 1min.ai
     *  et « anthropic/claude-opus-4.7 » chez OpenRouter ne sont pas le même code. */
    const [testProvider, setTestProvider] = useState('onemin');
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [testResult, setTestResult] = useState<AiService.ModelTestResult | null>(null);

    const prefs = { ...DEFAULT_DISPLAY_PREFS, ...displayPrefs };
    const setPref = <K extends keyof DisplayPrefs>(key: K, value: DisplayPrefs[K]) => {
        onDisplayPrefsChange({ ...prefs, [key]: value });
    };

    // Changer de section referme les vues de détail : rester dans l'éditeur
    // d'un modèle en arrivant sur les Personas n'aurait aucun sens.
    useEffect(() => {
        setEditingId(null);
        setIsCreating(false);
        setSelectedPersonaId(null);
        setExploring(false);
        setSaveError(null);
        setSaveSuccess(false);
    }, [section]);

    // Échap quitte la vue de détail — il n'y a plus de tiroir à fermer.
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (isSaving || isDeleting || deleteId) return;
            if (editingId || isCreating || selectedPersonaId || exploring) backToList();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [editingId, isCreating, selectedPersonaId, exploring, isSaving, isDeleting, deleteId]);

    // Le badge « Enregistré » s'efface tout seul.
    useEffect(() => {
        if (!saveSuccess) return;
        const timer = setTimeout(() => setSaveSuccess(false), 2500);
        return () => clearTimeout(timer);
    }, [saveSuccess]);

    // ── Handlers ──────────────────────────────────────────────────────────

    const describeError = (e: unknown) =>
        e instanceof Error ? e.message : typeof e === 'string' ? e : 'Erreur inconnue';

    const backToList = () => {
        setEditingId(null);
        setIsCreating(false);
        setSelectedPersonaId(null);
        setExploring(false);
        setSaveError(null);
        setSaveSuccess(false);
    };

    const handleSaveKey = async (id: string) => {
        const cle = (saisies[id] ?? '').trim();
        if (!cle || providerBusy) return;
        setProviderBusy(id);
        setProviderError(null);
        try {
            const etat = await Api.setProviderKey(id, cle);
            onProvidersChange(providers.map(p => (p.id === etat.id ? { ...p, ...etat } : p)));
            setSaisies(prev => ({ ...prev, [id]: '' }));
        } catch (e: any) {
            setProviderError(e?.message || "La clé n'a pas pu être enregistrée.");
        } finally {
            setProviderBusy(null);
        }
    };

    const handleDeleteKey = async (id: string) => {
        if (providerBusy) return;
        setProviderBusy(id);
        setProviderError(null);
        try {
            await Api.deleteProviderKey(id);
            // On relit plutôt que de deviner : effacer la clé de base peut
            // faire réapparaître celle de l'environnement, avec son empreinte.
            const { providers: frais } = await Api.fetchProviders();
            onProvidersChange(frais ?? []);
        } catch (e: any) {
            setProviderError(e?.message || "La clé n'a pas pu être effacée.");
        } finally {
            setProviderBusy(null);
        }
    };

    const handleActionModel = async (action: string, modelId: string) => {
        setPresetBusy(action);
        setSaveError(null);
        try {
            await Api.setActionModel(action, modelId || null);
            const suite = { ...actionModels };
            if (modelId) suite[action] = modelId; else delete suite[action];
            onActionModelsChange(suite);
        } catch (e) {
            setSaveError(describeError(e));
        } finally {
            setPresetBusy(null);
        }
    };

    /**
     * Le navigateur ne sait pas poser d'en-tête sur un clic de lien : on
     * récupère la sauvegarde, puis on la fait descendre depuis un blob.
     */
    const handleExport = async () => {
        if (isExporting) return;
        setIsExporting(true);
        setExportError(null);
        try {
            const { blob, filename } = await Api.fetchExport();
            const url = URL.createObjectURL(blob);
            const lien = document.createElement('a');
            lien.href = url;
            lien.download = filename;
            lien.click();
            URL.revokeObjectURL(url);
        } catch (e: any) {
            setExportError(e?.message || "La sauvegarde n'a pas pu être téléchargée.");
        } finally {
            setIsExporting(false);
        }
    };

    const ouvrirExplorateur = async () => {
        setExploring(true);
        if (catalogue || catalogueCharge) return;
        setCatalogueCharge(true);
        setCatalogueErreur(null);
        try {
            const { models, benchmarksAvailable, benchmarksReason, ecritureAvailable, ecritureReason } = await Api.fetchCatalogue();
            setCatalogue(models ?? []);
            setCatalogueEtat({
                benchmarks: benchmarksAvailable, raison: benchmarksReason,
                ecriture: ecritureAvailable, ecritureRaison: ecritureReason,
            });
            // Sans notes d'écriture, la courte liste est vide : montrer un écran
            // vide serait une panne muette. On bascule sur le catalogue entier.
            if (!ecritureAvailable) setVueCatalogue('tout');
        } catch (e: any) {
            setCatalogueErreur(e?.message || "Le catalogue n'a pas pu être lu.");
        } finally {
            setCatalogueCharge(false);
        }
    };

    /** Le fabricant se lit dans le préfixe du code OpenRouter : `anthropic/claude-…`. */
    const VENDEURS: Record<string, string> = {
        'anthropic': 'Anthropic', 'openai': 'OpenAI', 'google': 'Google', 'meta-llama': 'Meta',
        'mistralai': 'Mistral', 'deepseek': 'DeepSeek', 'x-ai': 'xAI', 'qwen': 'Alibaba',
        'z-ai': 'Z.ai', 'moonshotai': 'Moonshot', 'cohere': 'Cohere', 'nvidia': 'NVIDIA',
        'microsoft': 'Microsoft', 'amazon': 'Amazon', 'perplexity': 'Perplexity',
    };
    const vendeurDepuisCode = (code: string): string => {
        const prefixe = code.split('/')[0] ?? '';
        return VENDEURS[prefixe] ?? (prefixe ? prefixe.charAt(0).toUpperCase() + prefixe.slice(1) : '');
    };

    /**
     * Le coût, la qualité de rédaction et les forces ne se tapent plus de
     * mémoire : les mesures existent, elles écrivent ces trois champs. La
     * doctrine vit dans @luminose/editorial, testée à part.
     */
    const profilDepuisCatalogue = (m: Api.CatalogueModel, avecPrix = true) => profilerModele(
        {
            slug: m.id,
            prixSortie: m.completionPrice,
            prixIn: m.promptPrice,
            elo: m.elo,
            ecriture: m.ecriture,
            slop: m.slop,
            suivi: m.suivi,
            forces: m.forces ?? [],
        },
        {
            // La date compte : ces chiffres vieillissent, et un champ rempli
            // sans date se lit comme une vérité intemporelle.
            releveLe: new Date().toLocaleDateString('fr-FR'),
            familles: ATTENDU_FAMILLES,
            actions: AI_ACTION_CATALOG,
            avecPrix,
        },
    );

    /**
     * Le même modèle porte deux codes selon l'adaptateur : `claude-fable-5` chez
     * 1min.ai, `anthropic/claude-fable-5` chez OpenRouter. Sans normalisation,
     * « Actualiser » n'apparaîtrait que sur les modèles OpenRouter — c'est-à-dire
     * presque aucun de ceux déjà posés.
     */
    const modeleCorrespondant = (slug: string): AIModel | undefined => {
        const cle = normaliserNomModele(slug);
        return aiModels.find(x => normaliserNomModele(x.apiCode) === cle);
    };

    const ajouterDepuisCatalogue = (m: Api.CatalogueModel) => {
        const profil = profilDepuisCatalogue(m);
        setEditModel({
            name: m.name,
            apiCode: m.id,
            provider: 'openrouter',
            vendor: vendeurDepuisCode(m.id),
            cost: profil.cost,
            textQuality: profil.textQuality ?? 3,
            strengths: profil.strengths,
            bestUseCases: '',
        });
        setExploring(false);
        setIsCreating(true);
        setEditingId(null);
    };

    /**
     * Rafraîchit un modèle DÉJÀ au catalogue. Sans ça, la fonctionnalité ne
     * servirait qu'aux modèles à venir : les sept déjà posés garderaient leurs
     * valeurs saisies de mémoire.
     *
     * Ne touche que les trois champs mesurés — le nom, le code et l'adaptateur
     * appartiennent à Florent.
     */
    const rafraichirDepuisCatalogue = async (m: Api.CatalogueModel) => {
        const existant = modeleCorrespondant(m.id);
        if (!existant || majEnCours === m.id) return;
        setMajEnCours(m.id);
        try {
            // Le prix ne suit que si le modèle est appelé PAR OpenRouter. Ailleurs,
            // « Coût / Crédits » reste ce que Florent a posé : c'est sa facture.
            const memeFournisseur = existant.provider === 'openrouter';
            const profil = profilDepuisCatalogue(m, memeFournisseur);
            const { model } = await Api.updateModel(existant.id, {
                ...(profil.cost !== null ? { cost: profil.cost } : {}),
                textQuality: profil.textQuality ?? existant.textQuality,
                strengths: profil.strengths,
            });
            onModelsChange(aiModels.map(x => (x.id === model.id ? model : x)));
        } catch (e: any) {
            setCatalogueErreur(e?.message || "Le modèle n'a pas pu être mis à jour.");
        } finally {
            setMajEnCours(null);
        }
    };

    const handleEditModel = (model: AIModel) => {
        setEditingId(model.id);
        setEditModel(model);
        setIsCreating(false);
    };

    const handleCreateModel = (provider?: string) => {
        setEditingId(null);
        setIsCreating(true);
        setEditModel({
            name: '', apiCode: '', cost: 'medium', provider: provider ?? 'onemin',
            vendor: '', strengths: '', bestUseCases: '', textQuality: 3,
        });
    };

    // Devine le FABRICANT à partir du préfixe du code API — jamais l'adaptateur.
    const guessProvider = (apiCode: string): string => {
        const c = apiCode.toLowerCase();
        if (c.startsWith('claude') || c.includes('anthropic')) return 'Anthropic';
        if (c.startsWith('gpt-') || c.startsWith('o1') || c.startsWith('o3') || c.startsWith('o4')) return 'OpenAI';
        if (c.startsWith('gemini') || c.includes('google')) return 'Google';
        if (c.startsWith('mistral') || c.startsWith('codestral')) return 'Mistral';
        if (c.startsWith('deepseek')) return 'DeepSeek';
        if (c.startsWith('grok')) return 'xAI';
        if (c.startsWith('llama')) return 'Meta';
        if (c.startsWith('command') || c.includes('cohere')) return 'Cohere';
        if (c.startsWith('qwen')) return 'Alibaba';
        if (c.startsWith('glm') || c.includes('z-ai')) return 'Z.ai';
        return '';
    };

    const handleTestModel = async () => {
        const code = testApiCode.trim();
        if (!code || testStatus === 'testing') return;
        setTestStatus('testing');
        setTestResult(null);
        const result = await AiService.testModel(code, testProvider);
        setTestResult(result);
        setTestStatus(result.available ? 'success' : 'error');
    };

    const handlePrefillFromTest = () => {
        const code = testApiCode.trim();
        if (!code) return;
        setEditModel({
            name: code,
            apiCode: code,
            provider: testProvider,
            vendor: guessProvider(code),
            cost: 'medium',
            textQuality: 3,
            strengths: '',
            bestUseCases: '',
        });
        setIsCreating(true);
        setEditingId(null);
        setTestApiCode('');
        setTestStatus('idle');
        setTestResult(null);
    };

    const handleSaveModel = async () => {
        if (!(editModel.apiCode || '').trim()) {
            setSaveError("Le code API est obligatoire (sans lui le modèle est inutilisable).");
            return;
        }

        setIsSaving(true);
        setSaveError(null);
        setSaveSuccess(false);
        try {
            if (isCreating) {
                const { model: newModel } = await Api.createModel(editModel);
                onModelsChange([...aiModels, newModel]);
                setEditingId(newModel.id);
                setIsCreating(false);
            } else if (editingId) {
                const updatedModel = { ...editModel, id: editingId } as AIModel;
                await Api.updateModel(editingId, editModel);
                onModelsChange(aiModels.map(m => (m.id === editingId ? updatedModel : m)));
            }
            setSaveSuccess(true);
        } catch (e) {
            console.error(e);
            setSaveError(describeError(e));
        } finally { setIsSaving(false); }
    };

    const handleConfirmDelete = async () => {
        if (!deleteId) return;
        setIsDeleting(true);
        setSaveError(null);
        try {
            await Api.deleteModel(deleteId);
            onModelsChange(aiModels.filter(m => m.id !== deleteId));
            if (editingId === deleteId) backToList();
        } catch (e) {
            console.error(e);
            setSaveError(describeError(e));
        } finally { setIsDeleting(false); setDeleteId(null); }
    };

    // ── Vues de détail ────────────────────────────────────────────────────

    const isInModelEditor = section === 'models' && (isCreating || !!editingId);
    const isInExplorer = section === 'models' && exploring && !isInModelEditor;
    const isInPersonaView = section === 'personas' && !!selectedPersonaId;

    const groupes = grouperParAdaptateur(aiModels, providers);
    const persona = HARDCODED_PERSONAS.find(p => p.id === selectedPersonaId);

    const FilAriane: React.FC<{ label: string }> = ({ label }) => (
        <button
            onClick={backToList}
            className="flex items-center gap-1 text-xs font-medium text-brand-main/60 dark:text-dark-text/60 hover:text-brand-main dark:hover:text-white transition-colors mb-4"
        >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Retour</span>
            <span className="text-brand-main/30 dark:text-dark-text/30 mx-1">/</span>
            <span className="text-brand-main dark:text-white font-semibold truncate">{label}</span>
        </button>
    );

    /** Le menu d'un modèle, rangé sous son adaptateur (SPEC §5.3). */
    const SelecteurModele: React.FC<{
        value: string;
        onChange: (id: string) => void;
        disabled?: boolean;
        vide: string;
    }> = ({ value, onChange, disabled, vide }) => (
        <select
            value={value}
            disabled={disabled}
            onChange={e => onChange(e.target.value)}
            className={`${CHAMP} py-1.5 text-xs cursor-pointer disabled:opacity-50`}
        >
            <option value="">{vide}</option>
            {groupes.filter(g => g.models.length > 0).map(g => (
                <optgroup key={g.id} label={g.label}>
                    {g.models.map(m => (
                        <option key={m.id} value={m.id}>{m.name} · {m.apiCode}</option>
                    ))}
                </optgroup>
            ))}
        </select>
    );

    return (
        <div className="flex-1 overflow-y-auto">
            <div className="px-4 md:px-6 py-5 max-w-6xl">

                {/* ─── AFFICHAGE ─── */}
                {section === 'display' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start animate-fade-in">
                        <div className="space-y-2">
                            <p className={`${TITRE_GROUPE} mb-3`}>Espace Contenus</p>
                            <ToggleSwitch
                                label="Bande verdict colorée"
                                description="Trait coloré à gauche de chaque idée"
                                value={prefs.showVerdictStripe}
                                onChange={v => setPref('showVerdictStripe', v)}
                            />
                            <ToggleSwitch
                                label="Plateformes"
                                description="Badges LinkedIn, Instagram, etc."
                                value={prefs.showPlatforms}
                                onChange={v => setPref('showPlatforms', v)}
                            />
                            <ToggleSwitch
                                label="Niveau d'analyse"
                                description="Direct, Légère, Complète"
                                value={prefs.showDepth}
                                onChange={v => setPref('showDepth', v)}
                            />
                            <ToggleSwitch
                                label="Objectif"
                                description="Notoriété, Recadrage, Conversion..."
                                value={prefs.showObjectif}
                                onChange={v => setPref('showObjectif', v)}
                            />
                        </div>

                        <div>
                            <p className={`${TITRE_GROUPE} mb-3`}>Aperçu</p>
                            <div className="rounded-xl border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface overflow-hidden flex">
                                {prefs.showVerdictStripe && <div className="w-1 bg-emerald-500 shrink-0" />}
                                <div className="p-3.5 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                        <span className="inline-flex items-center rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/50">
                                            Valide
                                        </span>
                                        <span className="inline-flex items-center rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-900/20 dark:text-pink-300 dark:border-pink-800/50">
                                            Post Texte (Court)
                                        </span>
                                        {prefs.showObjectif && (
                                            <span className="inline-flex items-center rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-brand-light text-brand-main border-brand-main/20 dark:bg-dark-bg dark:text-dark-text dark:border-dark-sec-border">
                                                Éducation pratique
                                            </span>
                                        )}
                                        {prefs.showDepth && (
                                            <span className="inline-flex items-center rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-brand-light text-brand-main/70 border-brand-border dark:bg-dark-bg dark:text-dark-text dark:border-dark-sec-border">
                                                Légère
                                            </span>
                                        )}
                                    </div>
                                    <p className="font-semibold text-sm text-brand-main dark:text-white">
                                        Non, vous n'allez pas perdre le contrôle
                                    </p>
                                    <p className="mt-1 text-xs leading-5 text-brand-main/60 dark:text-dark-text/60">
                                        La peur de lâcher prise, et ce que le cadre de la séance rend possible.
                                    </p>
                                    {prefs.showPlatforms && (
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {['LinkedIn', 'Facebook'].map(p => (
                                                <span key={p} className="inline-flex items-center rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-brand-light text-brand-main/70 border-brand-border dark:bg-dark-bg dark:text-dark-text dark:border-dark-sec-border">
                                                    {p}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <p className="mt-2.5 px-1 text-[11px] leading-relaxed text-brand-main/50 dark:text-dark-text/50">
                                L'aperçu suit les réglages : c'est la ligne telle qu'elle apparaîtra dans la boîte à idées.
                            </p>
                        </div>
                    </div>
                )}

                {/* ─── MODÈLES IA — catalogue ─── */}
                {section === 'models' && !isInModelEditor && !isInExplorer && (
                    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start animate-fade-in">
                        <div className="space-y-6">
                            <p className="text-sm leading-relaxed text-brand-main/70 dark:text-dark-text/70 max-w-2xl">
                                Rangés par adaptateur — celui qui reçoit l'appel. Un même modèle peut être joignable
                                chez plusieurs d'entre eux, avec un code différent et un prix différent.
                            </p>

                            {groupes.map(groupe => {
                                const cle = providers.find(p => p.id === groupe.id);
                                // Un adaptateur sans clé ET sans modèle n'est pas un choix
                                // qu'on hésite à faire : c'est du bruit. Il reste dans
                                // « Clés des fournisseurs », qui est sa place.
                                if (!cle?.configured && groupe.models.length === 0) return null;
                                return (
                                    <div key={groupe.id}>
                                        <EnTeteGroupe
                                            titre={groupe.label}
                                            detail={groupe.models.length === 0
                                                ? 'aucun modèle'
                                                : `${groupe.models.length} modèle${groupe.models.length > 1 ? 's' : ''}`}
                                            droite={
                                                <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                                    cle?.configured
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/50'
                                                        : 'bg-brand-light text-brand-main/60 border-brand-border dark:bg-dark-bg dark:text-dark-text/60 dark:border-dark-sec-border'
                                                }`}>
                                                    {cle?.configured ? cle.hint : 'Aucune clé'}
                                                </span>
                                            }
                                        />

                                        {groupe.models.length === 0 ? (
                                            <p className="text-xs italic text-brand-main/45 dark:text-dark-text/45 leading-relaxed">
                                                Aucun modèle sur cet adaptateur. Posez sa clé, puis testez un code avant de l'enregistrer.
                                            </p>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {groupe.models.map(m => {
                                                    // L'actif se reconnaît à son IDENTIFIANT : comparer le code
                                                    // d'API laissait le badge éteint et écrivait un code là où
                                                    // l'application attend un id.
                                                    const isActive = m.id === activeModelId;
                                                    return (
                                                        <div
                                                            key={m.id}
                                                            className={`p-3.5 rounded-xl border transition-all ${
                                                                isActive
                                                                    ? 'bg-brand-light dark:bg-dark-bg border-brand-main dark:border-white'
                                                                    : 'bg-white dark:bg-dark-surface border-brand-border dark:border-dark-sec-border'
                                                            }`}
                                                        >
                                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                                <h3 className="font-semibold text-sm text-brand-main dark:text-white truncate">{m.name}</h3>
                                                                {m.vendor && (
                                                                    <span className="shrink-0 text-[10px] bg-brand-light dark:bg-dark-sec-bg text-brand-main dark:text-dark-text border border-brand-border dark:border-dark-sec-border px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
                                                                        {m.vendor}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-xs text-brand-main/60 dark:text-dark-text/60 font-mono truncate opacity-70 mb-2">{m.apiCode}</p>
                                                            <div className="flex items-center gap-2">
                                                                {isActive ? (
                                                                    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg bg-brand-main text-white dark:bg-white dark:text-brand-main">
                                                                        <CheckCircle2 className="w-3 h-3" />
                                                                        Défaut
                                                                    </span>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => onActiveModelChange(m.id)}
                                                                        className="text-[10px] font-semibold px-2 py-1 rounded-lg border border-brand-border dark:border-dark-sec-border text-brand-main/70 dark:text-dark-text/70 hover:border-brand-main hover:text-brand-main dark:hover:text-white transition-colors"
                                                                    >
                                                                        Définir par défaut
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={() => handleEditModel(m)}
                                                                    className="text-[10px] font-semibold px-2 py-1 rounded-lg border border-brand-border dark:border-dark-sec-border text-brand-main/70 dark:text-dark-text/70 hover:border-brand-main hover:text-brand-main dark:hover:text-white transition-colors ml-auto"
                                                                >
                                                                    Modifier
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <button
                                    onClick={() => handleCreateModel()}
                                    className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-brand-border dark:border-dark-sec-border text-brand-main/60 dark:text-dark-text/60 hover:border-brand-main hover:text-brand-main dark:hover:text-white text-sm font-bold transition-all"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    Ajouter un modèle
                                </button>
                                <button
                                    onClick={ouvrirExplorateur}
                                    className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-brand-border dark:border-dark-sec-border text-brand-main/60 dark:text-dark-text/60 hover:border-brand-main hover:text-brand-main dark:hover:text-white text-sm font-bold transition-all"
                                >
                                    <Compass className="w-3.5 h-3.5" />
                                    Explorer le catalogue OpenRouter
                                </button>
                            </div>

                            <p className="text-[11px] text-brand-main/50 dark:text-dark-text/50 leading-relaxed px-1">
                                Le modèle marqué <strong>« Défaut »</strong> sert aux actions qui n'ont pas de réglage
                                propre. Modifiable aussi depuis le sélecteur en haut de l'application.
                            </p>
                        </div>

                        {/* Testeur */}
                        <div className="rounded-xl border border-brand-border dark:border-dark-sec-border bg-brand-light/40 dark:bg-dark-bg/40 p-3.5 space-y-2.5">
                            <p className={`${TITRE_GROUPE} flex items-center gap-1.5`}>
                                <FlaskConical className="w-3 h-3" />
                                Tester un code API
                            </p>
                            <p className="text-[11px] text-brand-main/50 dark:text-dark-text/50 leading-relaxed">
                                Vérifie si un modèle répond, chez l'adaptateur choisi. Requête mini, ~1 token de coût.
                            </p>
                            <select
                                value={testProvider}
                                onChange={e => { setTestProvider(e.target.value); setTestStatus('idle'); setTestResult(null); }}
                                className={`${CHAMP} py-1.5 text-xs font-semibold cursor-pointer bg-white dark:bg-dark-surface`}
                            >
                                {providers.map(p => (
                                    <option key={p.id} value={p.id}>{p.label}</option>
                                ))}
                            </select>
                            <div className="flex items-stretch gap-1.5">
                                <input
                                    type="text"
                                    value={testApiCode}
                                    onChange={e => {
                                        setTestApiCode(e.target.value);
                                        if (testStatus !== 'idle' && testStatus !== 'testing') {
                                            setTestStatus('idle');
                                            setTestResult(null);
                                        }
                                    }}
                                    onKeyDown={e => { if (e.key === 'Enter' && testApiCode.trim()) handleTestModel(); }}
                                    placeholder="ex : anthropic/claude-opus-4.7"
                                    disabled={testStatus === 'testing'}
                                    className={`${CHAMP} flex-1 min-w-0 py-1.5 font-mono text-xs bg-white dark:bg-dark-surface placeholder-brand-main/30`}
                                />
                                <button
                                    onClick={handleTestModel}
                                    disabled={!testApiCode.trim() || testStatus === 'testing'}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-main hover:bg-brand-hover dark:bg-white dark:text-brand-main dark:hover:bg-brand-light text-white text-xs font-bold rounded-lg shadow-sm transition-colors disabled:opacity-40 whitespace-nowrap"
                                >
                                    {testStatus === 'testing'
                                        ? <EnCours label="Test…" />
                                        : <><FlaskConical className="w-3.5 h-3.5" /> Tester</>}
                                </button>
                            </div>

                            {testStatus === 'success' && testResult && (
                                <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-900/20 p-2.5 space-y-2">
                                    <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                                        Disponible
                                        {typeof testResult.latencyMs === 'number' && (
                                            <span className="ml-1.5 font-normal opacity-70">· {testResult.latencyMs} ms</span>
                                        )}
                                    </p>
                                    {testResult.sample && (
                                        <p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 break-words">« {testResult.sample} »</p>
                                    )}
                                    <button
                                        onClick={handlePrefillFromTest}
                                        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
                                    >
                                        Pré-remplir et créer le modèle
                                    </button>
                                </div>
                            )}

                            {testStatus === 'error' && testResult && (
                                <div className="rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 p-2.5 flex items-start gap-2">
                                    <AlertCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-red-700 dark:text-red-300">
                                            Indisponible
                                            {typeof testResult.latencyMs === 'number' && (
                                                <span className="ml-1.5 font-normal opacity-70">· {testResult.latencyMs} ms</span>
                                            )}
                                        </p>
                                        {testResult.error && (
                                            <p className="text-[11px] text-red-700/80 dark:text-red-300/80 mt-0.5 break-words">{testResult.error}</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ─── MODÈLES IA — explorateur du catalogue ─── */}
                {isInExplorer && (() => {
                    const dejaLa = new Set(aiModels.map(m => normaliserNomModele(m.apiCode)));
                    const terme = recherche.trim().toLowerCase();
                    const tous = catalogue ?? [];
                    // Tolérant à une réponse d'une version antérieure (cache, proxy) :
                    // un champ manquant vide la sélection, il ne casse pas l'écran.
                    const courteListe = tous.filter(m => m.selection === true);
                    const base = vueCatalogue === 'selection' && courteListe.length ? courteListe : tous;
                    const filtres = base.filter(m =>
                        !terme || m.id.toLowerCase().includes(terme) || m.name.toLowerCase().includes(terme)
                    );
                    const trie = [...filtres].sort((a, b) => {
                        if (tri === 'nom') return a.name.localeCompare(b.name, 'fr');
                        if (tri === 'prix') return (a.completionPrice ?? 1e9) - (b.completionPrice ?? 1e9);
                        if (tri === 'ecriture') return (b.ecriture ?? -1) - (a.ecriture ?? -1);
                        // Le slop est le seul axe où le plus bas gagne ; les non mesurés en fin de liste.
                        if (tri === 'slop') return (a.slop ?? 1e9) - (b.slop ?? 1e9);
                        return (b.intelligence ?? -1) - (a.intelligence ?? -1);
                    });
                    // La courte liste tient à l'écran ; le catalogue entier, non.
                    const PLAFOND = vueCatalogue === 'selection' ? trie.length : 60;
                    const visibles = trie.slice(0, PLAFOND);
                    const prix = (v: number | null) => (v === null ? '—' : v === 0 ? 'gratuit' : `${v.toFixed(2)}`);
                    const note = (v: number | null, chiffres = 1) =>
                        v === null ? null : v.toFixed(chiffres);

                    const ONGLET = (actif: boolean) =>
                        `px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                            actif
                                ? 'bg-brand-main text-white shadow-sm shadow-brand-main/25 dark:bg-white dark:text-brand-main'
                                : 'text-brand-main/60 dark:text-dark-text/60 hover:bg-brand-light dark:hover:bg-dark-sec-bg'
                        }`;
                    const TH = 'px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-brand-main/55 dark:text-dark-text/55 whitespace-nowrap';

                    return (
                        <div className="animate-fade-in">
                            <FilAriane label="Catalogue des modèles" />

                            <p className="text-sm leading-relaxed text-brand-main/70 dark:text-dark-text/70 max-w-3xl mb-1">
                                Deux sources croisées : OpenRouter pour le prix, le contexte et les indices
                                d'Artificial Analysis ; EQ-Bench pour la qualité d'écriture.
                            </p>
                            <p className="text-xs leading-relaxed text-brand-main/50 dark:text-dark-text/50 max-w-3xl mb-4">
                                Les indices d'Artificial Analysis mesurent le raisonnement, le code et la capacité
                                d'agent — aucune tâche de votre flux. EQ-Bench juge de la prose, en anglais et sur
                                de la fiction : c'est un indice de votre voix, pas une mesure. Ils réduisent le
                                champ ; le modèle qui écrit le mieux votre français se décide en le lisant.
                            </p>

                            {catalogueErreur && (
                                <p className="text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-1.5 mb-3">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {catalogueErreur}
                                </p>
                            )}

                            {catalogue && !catalogueEtat.ecriture && (
                                <p className="text-xs text-brand-main/50 dark:text-dark-text/50 mb-3">
                                    Notes d'écriture indisponibles ({catalogueEtat.ecritureRaison ?? 'raison inconnue'}) :
                                    EQ-Bench n'est pas une API publiée, sa forme peut changer sans préavis. La sélection
                                    en dépend — le catalogue entier reste lisible.
                                </p>
                            )}
                            {catalogue && !catalogueEtat.benchmarks && (
                                <p className="text-xs text-brand-main/50 dark:text-dark-text/50 mb-3">
                                    {catalogueEtat.raison === 'clé absente'
                                        ? "Indices d'Artificial Analysis indisponibles : aucune clé OpenRouter posée."
                                        : "Indices d'Artificial Analysis indisponibles : OpenRouter a refusé la requête (quota, sans doute)."}
                                </p>
                            )}

                            {catalogue && catalogueEtat.ecriture && (
                                <div className="flex items-center gap-1 p-1 mb-3 rounded-xl bg-brand-light dark:bg-dark-bg w-fit">
                                    <button onClick={() => { setVueCatalogue('selection'); setTri('prix'); }} className={ONGLET(vueCatalogue === 'selection')}>
                                        La sélection · {courteListe.length}
                                    </button>
                                    <button onClick={() => setVueCatalogue('tout')} className={ONGLET(vueCatalogue === 'tout')}>
                                        Tout le catalogue · {tous.length}
                                    </button>
                                </div>
                            )}

                            {vueCatalogue === 'selection' && courteListe.length > 0 && (
                                <p className="text-xs leading-relaxed text-brand-main/60 dark:text-dark-text/60 max-w-3xl mb-3 pl-3 border-l-2 border-brand-border dark:border-dark-sec-border">
                                    Vous n'utiliserez jamais quarante modèles. Cette liste garde, par palier de prix,
                                    ceux qui écrivent le mieux — au plus trois par fabricant, une seule variante par
                                    modèle, et rien qui soit battu sur tous les tableaux par moins cher que lui.
                                    Chaque ligne répond donc à une question que les autres ne posent pas.
                                </p>
                            )}

                            <div className="flex flex-col sm:flex-row gap-2 mb-3">
                                <div className="relative flex-1 min-w-0">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-main/40 dark:text-dark-text/40" />
                                    <input
                                        type="text"
                                        value={recherche}
                                        onChange={e => setRecherche(e.target.value)}
                                        placeholder="Chercher un modèle ou un fabricant…"
                                        className={`${CHAMP} pl-9 py-2`}
                                    />
                                </div>
                                <select
                                    value={tri}
                                    onChange={e => setTri(e.target.value as any)}
                                    className={`${CHAMP} sm:w-60 py-2 cursor-pointer`}
                                >
                                    <option value="prix">Trier par prix de sortie</option>
                                    <option value="ecriture">Trier par note d'écriture</option>
                                    <option value="slop">Trier par tournures d'IA</option>
                                    <option value="intelligence">Trier par indice d'intelligence</option>
                                    <option value="nom">Trier par nom</option>
                                </select>
                            </div>

                            {catalogueCharge && (
                                <Patience
                                    titre="Lecture du catalogue"
                                    detail="OpenRouter, puis les notes d'écriture"
                                />
                            )}

                            {catalogue && (
                                <>
                                    <div className="rounded-xl border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface overflow-hidden">
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full text-sm">
                                                <thead className="bg-brand-light dark:bg-dark-bg border-b border-brand-border dark:border-dark-sec-border">
                                                    <tr>
                                                        <th className={`${TH} text-left min-w-[17rem]`}>Modèle</th>
                                                        <th className={`${TH} text-right`}>Entrée → sortie $/M</th>
                                                        <th className={`${TH} text-right`}>Contexte</th>
                                                        <th className={`${TH} text-right`}>Écriture</th>
                                                        <th className={`${TH} text-right`}>Tournures d'IA</th>
                                                        <th className={`${TH} text-right`}>Consignes</th>
                                                        <th className={`${TH} text-right`}>Intelligence</th>
                                                        <th className="w-24 px-3 py-2" aria-hidden="true" />
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-brand-border dark:divide-dark-sec-border">
                                                    {visibles.map(m => (
                                                        <tr key={m.id} className="hover:bg-brand-light/40 dark:hover:bg-dark-bg/40 transition-colors">
                                                            <td className="px-3 py-2">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <p className="font-semibold text-[13px] text-brand-main dark:text-white">{m.name}</p>
                                                                    {m.palierLibelle && vueCatalogue === 'tout' && (
                                                                        <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-brand-main/10 text-brand-main dark:bg-white/15 dark:text-white whitespace-nowrap">
                                                                            sélection · {m.palierLibelle}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="font-mono text-[11px] text-brand-main/50 dark:text-dark-text/50">{m.id}</p>
                                                                {(m.forces ?? []).length > 0 && (
                                                                    <p className="text-[10px] text-brand-main/45 dark:text-dark-text/45 mt-0.5">
                                                                        Fort en : {(m.forces ?? []).join(', ')}
                                                                    </p>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2 text-right whitespace-nowrap text-xs text-brand-main/70 dark:text-dark-text/70">
                                                                {m.completionPrice === 0 && m.promptPrice === 0
                                                                    ? 'gratuit'
                                                                    : `${prix(m.promptPrice)} → ${prix(m.completionPrice)}`}
                                                            </td>
                                                            <td className="px-3 py-2 text-right whitespace-nowrap text-xs text-brand-main/70 dark:text-dark-text/70">
                                                                {m.contextLength ? `${Math.round(m.contextLength / 1000)}k` : '—'}
                                                            </td>
                                                            <td className="px-3 py-2 text-right whitespace-nowrap">
                                                                {note(m.ecriture, 2) === null ? (
                                                                    <span className="text-xs text-brand-main/30 dark:text-dark-text/30">—</span>
                                                                ) : (
                                                                    <span className="text-xs font-bold text-brand-main dark:text-white">{note(m.ecriture, 2)}</span>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2 text-right whitespace-nowrap">
                                                                {m.slop === null ? (
                                                                    <span className="text-xs text-brand-main/30 dark:text-dark-text/30">—</span>
                                                                ) : (
                                                                    <span className={`text-xs font-bold ${
                                                                        m.slop <= 13 ? 'text-emerald-700 dark:text-emerald-300'
                                                                            : m.slop <= 22 ? 'text-brand-main dark:text-white'
                                                                            : 'text-amber-700 dark:text-amber-400'
                                                                    }`}>
                                                                        {note(m.slop)}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2 text-right whitespace-nowrap text-xs text-brand-main/70 dark:text-dark-text/70">
                                                                {note(m.suivi, 1) ?? '—'}
                                                            </td>
                                                            <td className="px-3 py-2 text-right whitespace-nowrap">
                                                                {m.intelligence === null ? (
                                                                    <span className="text-xs text-brand-main/30 dark:text-dark-text/30">—</span>
                                                                ) : (
                                                                    <span className="text-xs text-brand-main/70 dark:text-dark-text/70">{m.intelligence.toFixed(1)}</span>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2 text-right">
                                                                {dejaLa.has(normaliserNomModele(m.id)) ? (
                                                                    <button
                                                                        onClick={() => void rafraichirDepuisCatalogue(m)}
                                                                        disabled={majEnCours === m.id}
                                                                        title="Réécrire coût, qualité de rédaction et forces d'après les mesures"
                                                                        className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors whitespace-nowrap disabled:opacity-40 inline-flex items-center gap-1.5"
                                                                    >
                                                                        {majEnCours === m.id
                                                                            ? <EnCours label="Mise à jour…" taille="xs" />
                                                                            : <><RefreshCw className="w-3 h-3" /> Actualiser</>}
                                                                    </button>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => ajouterDepuisCatalogue(m)}
                                                                        className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-brand-border dark:border-dark-sec-border text-brand-main/70 dark:text-dark-text/70 hover:border-brand-main hover:text-brand-main dark:hover:text-white transition-colors whitespace-nowrap"
                                                                    >
                                                                        Ajouter
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Une colonne dont on ignore le sens ne sert à rien. */}
                                    <p className="mt-2.5 px-1 text-[11px] leading-relaxed text-brand-main/50 dark:text-dark-text/50 max-w-3xl">
                                        <strong className="font-semibold">Écriture</strong> et <strong className="font-semibold">Consignes</strong> : sur 20, plus haut est meilleur.{' '}
                                        <strong className="font-semibold">Tournures d'IA</strong> : densité des formules toutes faites — <em>plus bas est meilleur</em>, et c'est
                                        la colonne la plus parlante pour la voix.
                                    </p>

                                    {/* Aucun plafond silencieux : ce qui n'est pas montré est annoncé. */}
                                    <p className="mt-1 px-1 text-[11px] text-brand-main/50 dark:text-dark-text/50">
                                        {trie.length > PLAFOND
                                            ? `${PLAFOND} modèles affichés sur ${trie.length} correspondants — affinez la recherche.`
                                            : `${trie.length} modèle${trie.length > 1 ? 's' : ''} affiché${trie.length > 1 ? 's' : ''}.`}
                                    </p>
                                </>
                            )}
                        </div>
                    );
                })()}

                {/* ─── MODÈLES IA — éditeur ─── */}
                {isInModelEditor && (
                    <div className="max-w-2xl animate-fade-in">
                        <FilAriane label={isCreating ? 'Nouveau modèle' : 'Modifier le modèle'} />

                        <div className="space-y-4">
                            {editingId && (
                                <div className="flex justify-end">
                                    <button
                                        onClick={() => setDeleteId(editingId)}
                                        className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1 rounded-lg transition-colors"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Supprimer
                                    </button>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className={ETIQUETTE}>Nom commercial</label>
                                    <input
                                        type="text"
                                        value={editModel.name || ''}
                                        onChange={e => setEditModel({ ...editModel, name: e.target.value })}
                                        className={`${CHAMP} font-semibold placeholder-brand-main/30`}
                                        placeholder="Ex : GPT-5.2 Pro"
                                    />
                                </div>

                                <div>
                                    <label className={ETIQUETTE}>Code API</label>
                                    <input
                                        type="text"
                                        value={editModel.apiCode || ''}
                                        onChange={e => setEditModel({ ...editModel, apiCode: e.target.value })}
                                        className={`${CHAMP} font-mono text-xs`}
                                        placeholder="ex : anthropic/claude-opus-4.7"
                                    />
                                </div>

                                {/*
                                    Deux notions distinctes (SPEC §5.3), longtemps confondues dans ce
                                    formulaire : l'ADAPTATEUR décide par où passe l'appel, le FABRICANT
                                    ne sert qu'à l'affichage.
                                */}
                                <div>
                                    <label className={ETIQUETTE}>Adaptateur</label>
                                    <select
                                        value={editModel.provider || 'onemin'}
                                        onChange={e => setEditModel({ ...editModel, provider: e.target.value })}
                                        className={`${CHAMP} cursor-pointer`}
                                    >
                                        {providers.map(p => (
                                            <option key={p.id} value={p.id}>{p.label}</option>
                                        ))}
                                        {/* Une valeur héritée qui ne correspond à aucun adaptateur connu
                                            reste visible plutôt que d'être remplacée en silence. */}
                                        {editModel.provider && !providers.some(p => p.id === editModel.provider) && (
                                            <option value={editModel.provider}>{editModel.provider} (inconnu)</option>
                                        )}
                                    </select>
                                    <p className="mt-1.5 text-[11px] text-brand-main/50 dark:text-dark-text/50">
                                        Par où passe l'appel. Sa clé se pose dans « Clés des fournisseurs ».
                                    </p>
                                </div>

                                <div>
                                    <label className={ETIQUETTE}>Fabricant</label>
                                    <input
                                        type="text"
                                        value={editModel.vendor || ''}
                                        onChange={e => setEditModel({ ...editModel, vendor: e.target.value })}
                                        className={CHAMP}
                                        placeholder="ex : Anthropic"
                                    />
                                </div>

                                <div>
                                    <label className={ETIQUETTE}>Coût / Crédits</label>
                                    <select
                                        value={editModel.cost || 'medium'}
                                        onChange={e => setEditModel({ ...editModel, cost: e.target.value as any })}
                                        className={`${CHAMP} cursor-pointer`}
                                    >
                                        <option value="low">Faible</option>
                                        <option value="low_medium">Moyen-faible</option>
                                        <option value="medium">Moyen</option>
                                        <option value="high">Élevé</option>
                                        <option value="very_high">Très élevé (Premium)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className={ETIQUETTE}>Qualité rédaction (1-5)</label>
                                    <div className="flex gap-1.5 p-2 bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border rounded-lg">
                                        {[1, 2, 3, 4, 5].map(v => (
                                            <button
                                                key={v}
                                                onClick={() => setEditModel({ ...editModel, textQuality: v })}
                                                className={`flex-1 h-8 rounded-md text-sm font-bold transition-all ${
                                                    editModel.textQuality === v
                                                        ? 'bg-brand-main text-white shadow-sm'
                                                        : 'hover:bg-brand-border dark:hover:bg-dark-sec-border text-brand-main dark:text-white'
                                                }`}
                                            >
                                                {v}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className={ETIQUETTE}>Forces &amp; cas d'usage</label>
                                <textarea
                                    value={editModel.strengths || ''}
                                    onChange={e => setEditModel({ ...editModel, strengths: e.target.value })}
                                    /* Assez haut pour le profil rempli depuis le catalogue : mesures,
                                       prix, familles et date tiennent sans qu'on ait à faire défiler. */
                                    className={`${CHAMP} resize-y min-h-[200px] leading-relaxed`}
                                    placeholder="Ex : Excelle dans la structure longue et l'analyse…"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-2">
                                {saveError && (
                                    <div className="flex items-start gap-2 flex-1 min-w-0 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                        <span className="min-w-0 break-words">
                                            <strong className="font-bold">Échec de l'enregistrement.</strong> {saveError}
                                        </span>
                                    </div>
                                )}
                                {!saveError && saveSuccess && (
                                    <div className="flex items-center gap-2 flex-1 min-w-0 text-xs text-green-700 dark:text-green-300">
                                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                        <span>Enregistré.</span>
                                    </div>
                                )}
                                <button
                                    onClick={handleSaveModel}
                                    disabled={isSaving || !(editModel.name || '').trim()}
                                    className="flex items-center gap-2 bg-brand-main hover:bg-brand-hover dark:bg-white dark:text-brand-main dark:hover:bg-brand-light text-white px-5 py-2 rounded-lg text-sm font-semibold shadow-sm shadow-brand-main/25 transition-colors disabled:opacity-40"
                                >
                                    {isSaving
                                        ? <EnCours label={isCreating ? 'Création…' : 'Enregistrement…'} />
                                        : <><Save className="w-3.5 h-3.5" /> {isCreating ? 'Créer' : 'Enregistrer'}</>}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ─── MODÈLE PAR ACTION ─── */}
                {section === 'presets' && (
                    <div className="space-y-6 animate-fade-in">
                        <p className="text-sm leading-relaxed text-brand-main/70 dark:text-dark-text/70 max-w-3xl">
                            Chaque action peut avoir son modèle. Sans réglage, elle prend celui du sélecteur en haut
                            de l'application. Les actions sont rangées par ce qu'elles demandent — les classements
                            publics, eux, mesurent la capacité à coder et à raisonner, ce qu'aucune de ces tâches
                            ne réclame.
                        </p>

                        {saveError && (
                            <p className="text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {saveError}
                            </p>
                        )}

                        {/*
                            Le conseil est rendu PAR FAMILLE et PAR ACTION, pas en préambule :
                            il doit être sous les yeux au moment où le menu s'ouvre, sinon il
                            ne sert qu'une fois, à la première lecture.
                        */}
                        {ATTENDU_ORDRE.map(attendu => {
                            const famille = ATTENDU_FAMILLES[attendu];
                            const actions = AI_ACTION_CATALOG.filter(a => a.attendu === attendu);
                            if (!famille || actions.length === 0) return null;
                            return (
                                <div key={attendu}>
                                    <div className="border-l-2 border-brand-main dark:border-white pl-3.5 py-0.5 mb-3">
                                        <p className="text-[13px] font-bold text-brand-main dark:text-white">{famille.titre}</p>
                                        <p className="text-xs leading-relaxed text-brand-main/60 dark:text-dark-text/60 mt-0.5">
                                            {famille.demande}
                                        </p>
                                        <p className="text-xs leading-relaxed text-brand-main dark:text-white mt-1 font-medium">
                                            → {famille.choix}
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                        {actions.map(action => (
                                            <div
                                                key={action.id}
                                                className="p-3.5 rounded-xl border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface flex flex-col gap-2.5"
                                            >
                                                <div className="flex items-baseline justify-between gap-2">
                                                    <span className="text-[13px] font-bold text-brand-main dark:text-white">{action.label}</span>
                                                    <span className="text-[10px] text-brand-main/40 dark:text-dark-text/40 whitespace-nowrap">{action.persona}</span>
                                                </div>
                                                <p className="text-[11px] leading-relaxed text-brand-main/50 dark:text-dark-text/50 flex-1">
                                                    {action.pourChoisir}
                                                </p>
                                                <SelecteurModele
                                                    value={actionModels[action.id] ?? ''}
                                                    disabled={presetBusy === action.id}
                                                    onChange={id => handleActionModel(action.id, id)}
                                                    vide="— Modèle actif —"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ─── CLÉS DES FOURNISSEURS ─── */}
                {section === 'providers' && (
                    <div className="space-y-4 animate-fade-in max-w-5xl">
                        <p className="text-sm leading-relaxed text-brand-main/70 dark:text-dark-text/70 max-w-2xl">
                            Une clé posée ici part au Worker et n'en revient jamais : l'application n'en affiche que
                            les quatre derniers caractères. Pour la remplacer, saisissez-en une nouvelle — il n'y a
                            rien à relire.
                        </p>

                        {providerError && (
                            <p className="text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {providerError}
                            </p>
                        )}

                        {providers.length === 0 && !providerError && (
                            <Patience titre="Lecture des adaptateurs" />
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            {providers.map(p => (
                                <div key={p.id} className="rounded-xl border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface p-3.5 space-y-2.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <h3 className="font-semibold text-sm text-brand-main dark:text-white">{p.label}</h3>
                                        {p.configured ? (
                                            <span className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/50">
                                                <CheckCircle2 className="w-3 h-3" />
                                                {p.hint}
                                            </span>
                                        ) : (
                                            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-brand-light text-brand-main/60 border border-brand-border dark:bg-dark-bg dark:text-dark-text/60 dark:border-dark-sec-border">
                                                Aucune clé
                                            </span>
                                        )}
                                    </div>

                                    {p.source === 'environnement' && (
                                        <p className="text-[11px] text-brand-main/50 dark:text-dark-text/50 leading-relaxed">
                                            Clé héritée des secrets du Worker. En saisir une ici la remplacera.
                                        </p>
                                    )}

                                    <div className="flex items-center gap-2">
                                        <input
                                            type="password"
                                            autoComplete="off"
                                            spellCheck={false}
                                            value={saisies[p.id] ?? ''}
                                            onChange={e => setSaisies(prev => ({ ...prev, [p.id]: e.target.value }))}
                                            placeholder={p.configured ? 'Nouvelle clé…' : "Clé d'API…"}
                                            className={`${CHAMP} flex-1 min-w-0 py-2 font-mono text-xs`}
                                        />
                                        <button
                                            onClick={() => handleSaveKey(p.id)}
                                            disabled={!(saisies[p.id] ?? '').trim() || providerBusy === p.id}
                                            className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-brand-main hover:bg-brand-hover dark:bg-white dark:text-brand-main text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-40"
                                        >
                                            {providerBusy === p.id
                                                ? <EnCours label="Pose…" />
                                                : <><Save className="w-3.5 h-3.5" /> Poser</>}
                                        </button>
                                    </div>

                                    {p.source === 'base' && (
                                        <button
                                            onClick={() => handleDeleteKey(p.id)}
                                            disabled={providerBusy === p.id}
                                            className="text-[11px] font-medium text-red-500 hover:underline disabled:opacity-40"
                                        >
                                            Effacer la clé enregistrée
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ─── PERSONAS ─── */}
                {section === 'personas' && !isInPersonaView && (
                    <div className="space-y-4 animate-fade-in max-w-5xl">
                        <p className="text-sm leading-relaxed text-brand-main/70 dark:text-dark-text/70 max-w-2xl">
                            Les personas sont écrits dans le code — ils font partie de la méthode, pas des réglages.
                            Ils sont ici en lecture, pour vérifier ce que le modèle reçoit vraiment.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {HARDCODED_PERSONAS.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => setSelectedPersonaId(p.id)}
                                    className="text-left p-4 rounded-xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-sec-border hover:border-brand-main dark:hover:border-white hover:shadow-sm transition-all"
                                >
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <h3 className="font-semibold text-sm text-brand-main dark:text-white truncate">{p.name}</h3>
                                        <span className="shrink-0 text-[10px] bg-brand-light dark:bg-dark-bg text-brand-main dark:text-dark-text border border-brand-border dark:border-dark-sec-border px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
                                            {p.usage}
                                        </span>
                                    </div>
                                    <p className="text-xs text-brand-main/50 dark:text-dark-text/50 leading-relaxed line-clamp-2">
                                        {p.prompt.split('\n').find(l => l.trim() && !l.endsWith(':')) ?? ''}
                                    </p>
                                    <p className="text-[11px] text-brand-main/40 dark:text-dark-text/40 flex items-center gap-1 mt-2">
                                        <Eye className="w-3 h-3" /> {p.prompt.length.toLocaleString('fr-FR')} signes · lecture seule
                                    </p>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {isInPersonaView && persona && (
                    <div className="max-w-3xl animate-fade-in">
                        <FilAriane label={persona.name} />
                        <div className="flex items-center gap-2 flex-wrap mb-3">
                            <span className="text-[10px] bg-brand-light dark:bg-dark-bg text-brand-main dark:text-dark-text border border-brand-border dark:border-dark-sec-border px-2 py-0.5 rounded-full font-bold">
                                {persona.usage}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-brand-main/50 dark:text-dark-text/50">
                                <Eye className="w-3 h-3" /> Lecture seule
                            </span>
                        </div>
                        <pre className="whitespace-pre-wrap text-xs text-brand-main dark:text-dark-text leading-relaxed font-sans bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-sec-border rounded-xl p-4">
                            {persona.prompt}
                        </pre>
                    </div>
                )}

                {/* ─── SAUVEGARDE ─── */}
                {section === 'backup' && (
                    <div className="max-w-2xl animate-fade-in">
                        <div className="rounded-xl border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface p-5 space-y-3">
                            <p className="text-sm leading-relaxed text-brand-main/75 dark:text-dark-text/75">
                                Un fichier JSON de toutes vos données — contenus, séries, modèles, conversations et
                                productions IA, suppressions comprises. Le filet de Cloudflare ne remonte qu'à sept
                                jours ; celui-ci ne s'efface pas.
                            </p>
                            {exportError && (
                                <p className="text-xs font-medium text-red-600 dark:text-red-400">{exportError}</p>
                            )}
                            <button
                                onClick={handleExport}
                                disabled={isExporting}
                                className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg hover:bg-white dark:hover:bg-dark-surface text-xs font-semibold text-brand-main dark:text-white transition-colors disabled:opacity-50"
                            >
                                {isExporting
                                    ? <EnCours label="Préparation…" />
                                    : <><Download className="w-3.5 h-3.5" /> Télécharger une sauvegarde</>}
                            </button>
                            <p className="text-[11px] text-brand-main/45 dark:text-dark-text/45">
                                Les clés des fournisseurs en sont exclues.
                            </p>
                        </div>
                    </div>
                )}
            </div>

            <ConfirmModal
                isOpen={!!deleteId}
                onClose={() => setDeleteId(null)}
                onConfirm={handleConfirmDelete}
                title="Confirmer la suppression ?"
                message="Cette action est irréversible."
                isDestructive={true}
                isLoading={isDeleting}
            />
        </div>
    );
};

export default SettingsSpace;
