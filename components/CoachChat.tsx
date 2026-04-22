import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Send, Loader2, CheckCircle2, Sparkles, RefreshCw, AlertCircle, MessageCircle, ArrowRight } from 'lucide-react';
import { ContentItem, AIModel, CoachSession, CoachMessage } from '../types';
import { INTERNAL_MODELS } from '../ai/actions';
import {
    sendCoachMessage,
    createEmptySession,
    appendUserMessage,
    appendAssistantReply,
    validateSession,
    buildCoachBrief,
} from '../services/coachService';
import { renderMdText } from './ContentEditor/renderers/shared';

interface CoachChatProps {
    item: ContentItem;
    aiModels: AIModel[];
    notionContext?: string;
    /** Appelé après chaque tour (user + assistant) — le parent doit persister côté Notion */
    onSessionChange: (session: CoachSession) => void | Promise<void>;
    /** Appelé quand Florent clique "Go Éditeur" — la session est marquée validated avant appel */
    onValidate: (session: CoachSession) => void | Promise<void>;
}

export const CoachChat: React.FC<CoachChatProps> = ({
    item, aiModels, notionContext, onSessionChange, onValidate,
}) => {
    const initialSession: CoachSession = useMemo(
        () => item.coachSession || createEmptySession(item.targetFormat || null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [item.id]
    );

    const [session, setSession] = useState<CoachSession>(initialSession);
    const [input, setInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [modelId, setModelId] = useState<string>(INTERNAL_MODELS.FAST);
    // Sas de démarrage : true si on reprend une session existante, false sinon.
    // Bloque le bootstrap auto tant que Florent n'a pas confirmé le modèle.
    const [hasStarted, setHasStarted] = useState<boolean>(() => initialSession.messages.length > 0);
    const scrollRef = useRef<HTMLDivElement>(null);
    const didAutoBootstrap = useRef(false);

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
        void handleSend(buildCoachBrief(item), { isBootstrap: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasStarted]);

    const handleSend = async (textOverride?: string, opts?: { isBootstrap?: boolean }) => {
        const text = (textOverride !== undefined ? textOverride : input).trim();
        if (!text || isSending || isValidated) return;

        setError(null);
        setIsSending(true);

        // On ajoute le message user
        const sessionWithUser = appendUserMessage(session, text);
        setSession(sessionWithUser);
        if (!opts?.isBootstrap) setInput('');

        try {
            const reply = await sendCoachMessage({
                session: sessionWithUser,
                userMessage: text,
                modelId,
                notionContext,
                aiModels,
            });
            const sessionWithReply = appendAssistantReply(sessionWithUser, reply);
            setSession(sessionWithReply);
            await onSessionChange(sessionWithReply);
        } catch (e: any) {
            setError(e?.message || 'Erreur lors de l\'appel au Coach.');
            // On garde le message user mais on laisse Florent retry — on persiste la session partielle
            await onSessionChange(sessionWithUser);
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
        <div className="flex flex-col h-full bg-brand-light/30 dark:bg-dark-bg/30 rounded-xl border border-brand-border dark:border-dark-sec-border overflow-hidden">
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
                <div className="flex items-center gap-2">
                    <select
                        value={modelId}
                        onChange={e => setModelId(e.target.value)}
                        className="text-xs bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border rounded-md px-2 py-1 text-brand-main dark:text-dark-text"
                        disabled={isSending}
                        title="Modèle IA utilisé pour le Coach"
                    >
                        <option value={INTERNAL_MODELS.FAST}>Gemini Flash (défaut)</option>
                        {aiModels.map(m => (
                            <option key={m.apiCode} value={m.apiCode}>{m.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* MESSAGES */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {/* SAS DE DÉMARRAGE — choix du modèle avant le premier appel IA */}
                {!hasStarted && (
                    <div className="h-full flex items-center justify-center py-8">
                        <div className="text-center max-w-md">
                            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-brand-main/10 dark:bg-brand-main/20 flex items-center justify-center">
                                <MessageCircle className="w-6 h-6 text-brand-main dark:text-dark-text" />
                            </div>
                            <h3 className="text-base font-bold text-brand-main dark:text-white mb-2">Prêt à démarrer ?</h3>
                            <p className="text-xs text-brand-main/70 dark:text-dark-text/70 mb-5 leading-relaxed">
                                Choisissez le modèle IA dans l'en-tête ci-dessus, puis lancez la session.
                                {item.targetFormat && (
                                    <> Le Coach vous proposera une première direction calibrée au format <strong>{item.targetFormat}</strong>.</>
                                )}
                            </p>
                            <div className="text-[11px] text-brand-main/50 dark:text-dark-text/50 mb-4 px-4 py-2 rounded-md bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border inline-block">
                                Modèle choisi : <strong className="text-brand-main dark:text-dark-text">
                                    {modelId === INTERNAL_MODELS.FAST
                                        ? 'Gemini Flash (défaut)'
                                        : (aiModels.find(m => m.apiCode === modelId)?.name || modelId)}
                                </strong>
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
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`
                                max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed
                                ${msg.role === 'user'
                                    ? 'bg-brand-main text-white rounded-br-sm'
                                    : 'bg-white dark:bg-dark-surface text-brand-main dark:text-white border border-brand-border dark:border-dark-sec-border rounded-bl-sm'
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
                    <div className="flex justify-start">
                        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-sec-border rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2 text-xs text-brand-main/60 dark:text-dark-text/60">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Le Coach réfléchit...
                        </div>
                    </div>
                )}

                {error && (
                    <div className="flex justify-start">
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl rounded-bl-sm px-4 py-3 flex items-start gap-2 text-xs text-red-700 dark:text-red-300">
                            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    </div>
                )}
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

            {isValidated && (
                <div className="p-4 border-t border-brand-border dark:border-dark-sec-border bg-green-50 dark:bg-green-900/10 text-xs text-green-800 dark:text-green-300 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Session validée — prête à être transmise à l'Éditeur pour rédaction finale.
                </div>
            )}
        </div>
    );
};
