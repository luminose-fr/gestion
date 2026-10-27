import { useMemo, useState } from 'react';
import type { AIModel, CoachMessage, CoachSession, ContentItem } from '../../types';
import {
    sendCoachMessage, buildUserMessage, buildAssistantMessage, withMessage, validateSession, buildCoachBrief,
} from '../../services/coachService';

/**
 * L'atelier du Coach, sans son écran (SPEC §13.10) : il parle désormais dans le
 * fil, et c'est le composeur qui lui écrit. La conversation reste celle du
 * §2.7 — un message écrit est en sécurité avant même que le Coach réponde.
 */
export interface Atelier {
    enCours: boolean;
    erreur: string | null;
    /** Le premier tour : le brief que l'outil compose à partir de l'idée. */
    ouvrir: () => Promise<void>;
    envoyer: (texte: string) => Promise<void>;
    /** « Go » : la direction est validée, le Verrouilleur puis le Rédacteur prennent la main. */
    valider: () => Promise<void>;
    /** Ce que le Coach propose de répondre, au plus deux (SPEC §13.10). */
    reponsesRapides: string[];
    /** Le Coach dit que la direction tient : « Go » est mis en avant. */
    pretPourLeRedacteur: boolean;
}

/** « Go », seul : valider la direction plutôt que l'envoyer au Coach. */
export const estUnGo = (texte: string) => /^go\s*!?\.?$/i.test(texte.trim());

export function useAtelier({
    item, session, modelId, aiModels, contexteSerie, onMessage, onValider,
}: {
    /** `null` le temps que le contenu arrive : l'atelier ne fait alors rien. */
    item: ContentItem | null;
    session: CoachSession;
    modelId: string;
    aiModels: AIModel[];
    contexteSerie?: string | null;
    onMessage: (message: CoachMessage) => void | Promise<void>;
    onValider: (session: CoachSession) => void | Promise<void>;
}): Atelier {
    const [enCours, setEnCours] = useState(false);
    const [erreur, setErreur] = useState<string | null>(null);

    const dernier = useMemo(
        () => [...session.messages].reverse().find(m => m.role === 'assistant') ?? null,
        [session.messages],
    );

    const tour = async (texte: string) => {
        if (!item || !texte.trim() || enCours) return;
        setErreur(null);
        setEnCours(true);
        // Le message de Florent part AVANT l'appel au Coach : s'il échoue, ce
        // qui a été tapé est déjà en sécurité (SPEC §2.7).
        const message = buildUserMessage(item.id, texte.trim());
        const avecLui = withMessage(session, message);
        void onMessage(message);
        try {
            const reponse = await sendCoachMessage({
                session: avecLui, userMessage: texte.trim(), modelId,
                serieContext: contexteSerie || undefined, aiModels,
            });
            await onMessage(buildAssistantMessage(item.id, reponse));
        } catch (e: any) {
            setErreur(e?.message || 'Le Coach n’a pas répondu.');
        } finally {
            setEnCours(false);
        }
    };

    return {
        enCours,
        erreur,
        ouvrir: () => (item ? tour(buildCoachBrief(item, contexteSerie)) : Promise.resolve()),
        envoyer: (texte) => (estUnGo(texte) ? Promise.resolve(onValider(validateSession(session))).then(() => {}) : tour(texte)),
        valider: async () => { await onValider(validateSession(session)); },
        reponsesRapides: (dernier?.quickReplies ?? []).slice(0, 2),
        pretPourLeRedacteur: !!dernier?.readyForEditor,
    };
}
