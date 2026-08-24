import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Send, CheckCircle2, Sparkles, RefreshCw, AlertCircle, MessageCircle, ArrowRight, Brain, RotateCcw, Undo2 } from 'lucide-react';
import { ContentItem, AIModel, CoachSession, CoachMessage, TargetFormat } from '../types';
import {
    sendCoachMessage,
    createEmptySession,
    buildUserMessage,
    buildAssistantMessage,
    withMessage,
    validateSession,
    buildCoachBrief,
} from '../services/coachService';
import { renderMdText } from './ContentEditor/renderers/shared';
import { ConfirmModal } from './CommonModals';
import { Barre, EnCours } from './Feedback';

interface CoachChatProps {
    item: ContentItem;
    aiModels: AIModel[];
    /** Modèle IA actif global — utilisé pour tous les tours du Coach. */
    modelId: string;
    /**
     * Session chargée par le parent. Elle ne voyage plus dans l'item : la liste
     * ne porte pas les messages, seul le détail les assemble (SPEC §3.2).
     */
    session: CoachSession;
    /** Contexte de série (SPEC §6.4) — ce que l'atelier doit savoir de la progression. */
    contexteSerie?: string | null;
    /**
     * Appelé pour CHAQUE message, dès qu'il existe (SPEC §2.7). Le parent
     * l'ajoute à la conversation stockée : un message écrit ne se perd plus,
     * même si le tour suivant échoue.
     */
    onAppendMessage: (message: CoachMessage) => void | Promise<void>;
    /** Appelé quand Florent clique "Go Éditeur" — la session est marquée validated avant appel */
    onValidate: (session: CoachSession) => void | Promise<void>;
    /**
     * Rouvre une session validée. L'atelier était un aller sans retour : une
     * fois validé, plus un mot ne pouvait être envoyé, et une rédaction qui
     * échouait laissait la publication intouchable.
     */
    onReopen: () => void | Promise<void>;
    /** Jette la conversation et repart de zéro. Confirmé, et réversible en base. */
    onReset: () => void | Promise<void>;
}

export const CoachChat: React.FC<CoachChatProps> = ({
    item, aiModels, modelId, contexteSerie, session: initialSession,
    onAppendMessage, onValidate, onReopen, onReset,
}) => {
    const [session, setSession] = useState<CoachSession>(initialSession);
    const [input, setInput] = useState('');

    /**
     * La session est chargée par le parent APRÈS le montage : `useState` a donc
     * capturé une session vide, et le chat affichait « Prêt à démarrer ? » sur
     * une conversation existante. On adopte la session dès qu'elle arrive.
     *
     * Le garde sur `messages.length` évite d'écraser une conversation en cours
     * par la version encore vide du parent.
     */
    useEffect(() => {
        if (initialSession.messages.length === 0) return;
        setSession(prev => (prev.messages.length === 0 ? initialSession : prev));
        setHasStarted(true);
    }, [initialSession]);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Sas de démarrage : true UNIQUEMENT si on reprend une session existante (messages déjà présents).
    // Sinon, on bloque le bootstrap tant que Florent n'a pas confirmé le modèle.
    const [hasStarted, setHasStarted] = useState<boolean>(
        () => initialSession.messages.length > 0
    );
    const scrollRef = useRef<HTMLDivElement>(null);
    const didAutoBootstrap = useRef(false);
    const [confirmReset, setConfirmReset] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    const isValidated = session.status === 'validated';

    // Auto-scroll vers le bas à chaque nouveau message
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [session.messages.length]);

    // Dernier message assistant — pour savoir s'il faut afficher quick replies / Go Éditeur
    const lastAssistant: CoachMessage | null = useMemo(() => {
        for (let i = session.messages.length - 1; i >= 0; i--) {
            if (session.messages[i].role === 'assistant') return session.messages[i];
        }
        return null;
    }, [session.messages]);

    // Bootstrap : si la session est vide, on lance automatiquement le premier tour
    // en envoyant le brief comme premier message user — MAIS uniquement après que
    // Florent a cliqué "Démarrer" (pour qu'il puisse choisir son modèle en amont).
    useEffect(() => {
        if (!hasStarted) return;
        if (didAutoBootstrap.current) return;
        if (session.messages.length > 0) return;
        if (isValidated) return;
        didAutoBootstrap.current = true;
        void handleSend(buildCoachBrief(item, contexteSerie), { isBootstrap: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasStarted]);

    const handleSend = async (textOverride?: string, opts?: { isBootstrap?: boolean }) => {
        const text = (textOverride !== undefined ? textOverride : input).trim();
        if (!text || isSending || isValidated) return;

        setError(null);
        setIsSending(true);

        // Le message de Florent est écrit AVANT l'appel au Coach : s'il échoue,
        // ce que Florent a tapé est déjà en sécurité (SPEC §2.7).
        const userMessage = buildUserMessage(item.id, text);
        const sessionWithUser = withMessage(session, userMessage);
        setSession(sessionWithUser);
        if (!opts?.isBootstrap) setInput('');
        void onAppendMessage(userMessage);

        try {
            const reply = await sendCoachMessage({
                session: sessionWithUser,
                userMessage: text,
                modelId,
                contexteAdditionnel: contexteSerie || undefined,
                aiModels,
            });
            const assistantMessage = buildAssistantMessage(item.id, reply);
            setSession(withMessage(sessionWithUser, assistantMessage));
            await onAppendMessage(assistantMessage);
        } catch (e: any) {
            setError(e?.message || 'Erreur lors de l\'appel au Coach.');
        } finally {
            setIsSending(false);
        }
    };

    const handleQuickReply = (text: string) => {
        // Pré-remplit le champ (Florent peut éditer avant envoi), per spec #1
        setInput(text);
    };

    const handleValidate = async () => {
        if (isValidated) return;
        const validated = validateSession(session);
        setSession(validated);
        await onValidate(validated);
    };

    const handleReopen = async () => {
        if (!isValidated || isResetting) return;
        // La vue repasse en écriture tout de suite : le parent persiste, mais
        // l'atelier n'a pas à attendre le réseau pour redevenir utilisable.
        setSession(prev => ({ ...prev, status: 'in_progress', validatedAt: null }));
        await onReopen();
    };

    const handleReset = async () => {
        if (isResetting) return;
        setIsResetting(true);
        setError(null);
        try {
            await onReset();
            // Le parent renverra une session vide, mais l'effet d'adoption
            // ignore les sessions vides pour ne pas écraser une conversation en
            // cours : la vue locale doit donc se vider elle-même.
            setSession(createEmptySession(item.targetFormat as TargetFormat | null));
            didAutoBootstrap.current = false;
            setHasStarted(false);
            setInput('');
        } catch (e: any) {
            setError(e?.message || "La session n'a pas pu être réinitialisée.");
        } finally {
            setIsResetting(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void handleSend();
        }
    };

    const handleRegenerate = async () => {
        // Dernier message user = à renvoyer au Coach après retrait de la dernière réponse assistant
        if (session.messages.length === 0 || isSending) return;
        // On retire le dernier message assistant (s'il existe) pour laisser le Coach reformuler
        const newMessages = [...session.messages];
        if (newMessages[newMessages.length - 1]?.role === 'assistant') {
            newMessages.pop();
        }
        const lastUser = [...newMessages].reverse().find(m => m.role === 'user');
        if (!lastUser) return;
        // Retrait LOCAL seulement : la conversation stockée est append-only,
        // et la proposition écartée y reste — suivie de la demande de
        // reformulation, ce qui est exactement ce qui s'est passé.
        const rolledBack = { ...session, messages: newMessages };
        setSession(rolledBack);
        // On renvoie le dernier user avec une consigne implicite de reformuler
        await handleSend(lastUser.content + '\n\n(Reformule ta proposition différemment.)', { isBootstrap: true });
    };

    // Affichage : on masque le tout premier message user (le brief système auto-généré)
    const visibleMessages = useMemo(() => {
        if (session.messages.length === 0) return [];
        const first = session.messages[0];
        // Le tout premier user = brief système (auto-généré par buildCoachBrief)
        const firstIsBootstrap = first.role === 'user' && first.content.startsWith('TITRE :');
        return firstIsBootstrap ? session.messages.slice(1) : session.messages;
    }, [session.messages]);

    return (
        <div className="flex flex-col h-full bg-brand-light/30 dark:bg-dark-bg/30 overflow-hidden">
            {/* HEADER */}
            <div className="p-4 border-b border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-brand-main dark:text-dark-text" />
                    <h4 className="text-sm font-bold text-brand-main dark:text-white">Session Coach</h4>
                    {item.targetFormat && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-light dark:bg-dark-bg text-brand-main/70 dark:text-dark-text/70 border border-brand-border dark:border-dark-sec-border">
                            {item.targetFormat}
                        </span>
                    )}
                    {isValidated && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Validée
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {isValidated && (
                        <button
                            onClick={handleReopen}
                            disabled={isResetting}
                            className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-brand-border dark:border-dark-sec-border text-brand-main/70 dark:text-dark-text/70 hover:border-brand-main hover:text-brand-main dark:hover:text-white transition-colors whitespace-nowrap disabled:opacity-40 flex items-center gap-1.5"
                            title="Repasser la session en cours pour continuer la conversation"
                        >
                            <Undo2 className="w-3 h-3" />
                            Rouvrir
                        </button>
                    )}
                    {session.messages.length > 0 && (
                        <button
                            onClick={() => setConfirmReset(true)}
                            disabled={isResetting}
                            className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-transparent text-red-600/80 dark:text-red-400/80 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-200 dark:hover:border-red-800 transition-colors whitespace-nowrap disabled:opacity-40 flex items-center gap-1.5"
                            title="Jeter cette conversation et repartir de zéro"
                        >
                            {isResetting
                                ? <EnCours label="Réinitialisation…" taille="xs" />
                                : <><RotateCcw className="w-3 h-3" /> Réinitialiser</>}
                        </button>
                    )}
                    <span className="text-[10px] font-medium text-brand-main/50 dark:text-dark-text/50 whitespace-nowrap">
                        {aiModels.find(m => m.id === modelId)?.name || modelId}
                    </span>
                </div>
            </div>

            <ConfirmModal
                isOpen={confirmReset}
                onClose={() => setConfirmReset(false)}
                onConfirm={() => { void handleReset(); }}
                title="Réinitialiser la session ?"
                message="La conversation disparaît de l'atelier et le Coach repartira de zéro. Le brouillon déjà rédigé, lui, n'est pas touché."
                isDestructive
                confirmLabel="Réinitialiser"
            />

            {/* MESSAGES */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
                <div className="max-w-2xl mx-auto space-y-3">
                {/* SAS DE DÉMARRAGE — choix du modèle avant le premier appel IA */}
                {!hasStarted && (
                    <div className="h-full flex items-center justify-center py-8">
                        <div className="text-center max-w-md">
                            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-brand-main/10 dark:bg-brand-main/20 flex items-center justify-center">
                                <MessageCircle className="w-6 h-6 text-brand-main dark:text-dark-text" />
                            </div>
                            <h3 className="text-base font-bold text-brand-main dark:text-white mb-2">Prêt à démarrer ?</h3>
                            <p className="text-xs text-brand-main/70 dark:text-dark-text/70 mb-5 leading-relaxed">
                                Lancez la session quand vous le souhaitez.
                                {item.targetFormat && (
                                    <> Le Coach vous proposera une première direction calibrée au format <strong>{item.targetFormat}</strong>.</>
                                )}
                            </p>
                            <div className="text-[11px] text-brand-main/50 dark:text-dark-text/50 mb-4 px-4 py-2 rounded-md bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border inline-block">
                                Modèle : <strong className="text-brand-main dark:text-dark-text">
                                    {aiModels.find(m => m.id === modelId)?.name || modelId}
                                </strong>
                                <span className="text-brand-main/40 dark:text-dark-text/40"> · modifiable en haut de l'app</span>
                            </div>
                            <div>
                                <button
                                    onClick={() => setHasStarted(true)}
                                    className="px-5 py-2.5 bg-brand-main text-white rounded-lg hover:bg-brand-hover font-bold text-sm inline-flex items-center gap-2 shadow-sm"
                                >
                                    <Sparkles className="w-4 h-4" />
                                    Démarrer la session
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {hasStarted && visibleMessages.length === 0 && !isSending && (
                    <div className="text-center py-8 text-brand-main/40 dark:text-dark-text/40 text-xs">
                        Le Coach va démarrer la conversation...
                    </div>
                )}

                {visibleMessages.map((msg, idx) => (
                    <div
                        key={idx}
                        className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                    >
                        {msg.role === 'assistant' && (
                            <div className="w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0 mt-0.5">
                                <Brain className="w-3 h-3 text-violet-600 dark:text-violet-300" />
                            </div>
                        )}
                        <div
                            className={`
                                max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed
                                ${msg.role === 'user'
                                    ? 'bg-brand-main text-white rounded-tr-sm'
                                    : 'bg-white dark:bg-dark-surface text-brand-main dark:text-white border border-brand-border dark:border-dark-sec-border rounded-tl-sm'
                                }
                            `}
                        >
                            {msg.role === 'assistant' ? (
                                <div className="whitespace-pre-wrap">
                                    {msg.content.split('\n').map((line, li) => (
                                        <React.Fragment key={li}>
                                            {renderMdText(line)}
                                            {li < msg.content.split('\n').length - 1 && <br />}
                                        </React.Fragment>
                                    ))}
                                </div>
                            ) : (
                                <div className="whitespace-pre-wrap">{msg.content}</div>
                            )}
                        </div>
                    </div>
                ))}

                {isSending && (
                    <div className="flex gap-3">
                        <div className="w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0 mt-0.5">
                            <Brain className="w-3 h-3 text-violet-600 dark:text-violet-300" />
                        </div>
                        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-sec-border rounded-2xl rounded-tl-sm px-4 py-3 min-w-44 text-xs text-brand-main/60 dark:text-dark-text/60">
                            <div className="flex items-center gap-2">
                                <EnCours label="Le Coach réfléchit…" />
                            </div>
                            {/* La bulle d'attente porte sa propre barre : c'est là que
                                le regard est posé, pas en haut de l'écran. */}
                            <Barre part={null} epaisseur={2} className="mt-2" libelle="Réponse du Coach" />
                        </div>
                    </div>
                )}

                {error && (
                    <div className="flex gap-3">
                        <div className="w-7 h-7 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0 mt-0.5">
                            <AlertCircle className="w-3 h-3 text-red-600 dark:text-red-300" />
                        </div>
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl rounded-tl-sm px-4 py-3 flex items-start gap-2 text-xs text-red-700 dark:text-red-300">
                            <span>{error}</span>
                        </div>
                    </div>
                )}
                </div>
            </div>

            {/* GO ÉDITEUR (visible si ready ou toujours cliquable par Florent) */}
            {!isValidated && lastAssistant && (
                <div className={`px-4 py-2 border-t border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface flex items-center justify-between gap-3 ${lastAssistant.readyForEditor ? 'bg-green-50 dark:bg-green-900/10' : ''}`}>
                    <div className="text-[11px] text-brand-main/60 dark:text-dark-text/60">
                        {lastAssistant.readyForEditor
                            ? 'Le Coach pense que la direction est prête. Vous validez ?'
                            : 'Vous pouvez valider à tout moment.'}
                    </div>
                    <button
                        onClick={handleValidate}
                        disabled={isSending}
                        className={`
                            flex items-center gap-2 px-4 py-1.5 text-xs font-bold rounded-lg transition-all shadow-sm
                            ${lastAssistant.readyForEditor
                                ? 'bg-green-600 text-white hover:bg-green-700 shadow-green-600/20'
                                : 'bg-brand-main text-white hover:bg-brand-hover shadow-brand-main/20'
                            }
                            disabled:opacity-40 disabled:cursor-not-allowed
                        `}
                    >
                        <ArrowRight className="w-3.5 h-3.5" />
                        Go Éditeur
                    </button>
                </div>
            )}

            {/* QUICK REPLIES */}
            {!isValidated && lastAssistant && lastAssistant.quickReplies && lastAssistant.quickReplies.length > 0 && (
                <div className="px-4 pt-3 flex flex-wrap gap-2 border-t border-brand-border dark:border-dark-sec-border bg-brand-light/40 dark:bg-dark-bg/40">
                    {lastAssistant.quickReplies.map((qr, i) => (
                        <button
                            key={i}
                            onClick={() => handleQuickReply(qr)}
                            disabled={isSending}
                            className="text-xs px-3 py-1.5 rounded-full bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-sec-border text-brand-main dark:text-dark-text hover:border-brand-main hover:bg-brand-main hover:text-white transition-all disabled:opacity-40"
                            title="Cliquer pour pré-remplir le champ de saisie"
                        >
                            {qr}
                        </button>
                    ))}
                </div>
            )}

            {/* INPUT */}
            {!isValidated && hasStarted && (
                <div className="p-3 border-t border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface">
                    <div className="flex items-end gap-2">
                        <textarea
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Votre réponse... (⌘+Entrée pour envoyer)"
                            rows={2}
                            disabled={isSending}
                            className="flex-1 resize-none text-sm bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border rounded-lg px-3 py-2 text-brand-main dark:text-white placeholder-brand-main/40 dark:placeholder-dark-text/40 focus:outline-hidden focus:ring-2 focus:ring-brand-main/30 disabled:opacity-40"
                        />
                        <div className="flex flex-col gap-1">
                            <button
                                onClick={() => void handleSend()}
                                disabled={isSending || !input.trim()}
                                className="p-2.5 bg-brand-main text-white rounded-lg hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                                title="Envoyer (⌘+Entrée)"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => void handleRegenerate()}
                                disabled={isSending || session.messages.length < 2}
                                className="p-2.5 bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border text-brand-main dark:text-dark-text rounded-lg hover:border-brand-main disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                title="Faire reformuler la dernière proposition du Coach"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Une session validée ne se referme plus sur elle-même : le chemin
                du retour est écrit là où l'on constate qu'il manque. */}
            {isValidated && (
                <div className="p-4 border-t border-brand-border dark:border-dark-sec-border bg-green-50 dark:bg-green-900/10 text-xs text-green-800 dark:text-green-300 flex items-center justify-between gap-3 flex-wrap">
                    <span className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 shrink-0" />
                        Session validée et transmise au Rédacteur. La rédaction se trouve dans les autres onglets.
                    </span>
                    <button
                        onClick={handleReopen}
                        disabled={isResetting}
                        className="font-bold underline underline-offset-2 hover:no-underline whitespace-nowrap disabled:opacity-40"
                    >
                        Rien n'est arrivé ? Rouvrir la session
                    </button>
                </div>
            )}
        </div>
    );
};
