/**
 * Un rôle IA en entier (SPEC §5 ; refonte, lot 9) : la feuille de salle que le
 * corpus ajoute en tête, puis le prompt composé — dans l'ordre où le modèle les
 * reçoit. Lecture seule. Il vit dans Corpus → Carte, qui répond déjà à « que
 * reçoit le modèle ? » : la Carte montre le chemin, un rôle ce qu'il reçoit
 * (docs/refonte/01, §3). Extrait de SettingsSpace, qui le montre encore à
 * l'adresse d'avant.
 */
import React, { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { VOICE_RULES } from '@luminose/editorial';
import * as Api from '../../services/apiService';
import { Patience } from '../Feedback';
import { APERCUS, compterPresences, VOIX_ID } from './apercus';

interface FichePersona {
    id: string;
    /** Le rôle joué — « Rédacteur ». */
    titre: string;
    /** L'identifiant d'action, ou `null` pour un bloc partagé. */
    action: string | null;
    texte: string;
    /** Ce qui a été substitué pour l'aperçu. `null` = ce texte ne varie pas. */
    exemple: string | null;
}

const PRESENCES_VOIX = compterPresences(VOICE_RULES);

export const FICHES: FichePersona[] = [
    ...APERCUS.map(a => ({ id: a.id, titre: a.persona, action: a.id, texte: a.prompt, exemple: a.exemple })),
    { id: VOIX_ID, titre: 'Bloc partagé', action: null, texte: VOICE_RULES, exemple: null },
];

const signes = (n: number) => `${n.toLocaleString('fr-FR')} signes`;

const EnTeteGroupe: React.FC<{ titre: string; detail?: string; droite?: React.ReactNode }> = ({ titre, detail, droite }) => (
    <div className="flex items-baseline justify-between gap-3 border-b border-bord pb-1.5 mb-3">
        <span className="flex items-baseline gap-2 min-w-0">
            <span className="text-sm font-bold text-texte">{titre}</span>
            {detail && <span className="text-micro text-second truncate">{detail}</span>}
        </span>
        {droite}
    </div>
);

export const RoleIA: React.FC<{ persona: string | null }> = ({ persona }) => {
    const fiche = FICHES.find(f => f.id === persona) ?? FICHES[0];
    const [feuille, setFeuille] = useState<Api.FeuilleAction | null>(null);
    const [feuilleErreur, setFeuilleErreur] = useState<string | null>(null);

    // La feuille de salle du rôle ouvert. Le bloc partagé n'en a pas : rien ne
    // l'envoie seul, donc rien ne lui joint de corpus.
    useEffect(() => {
        const id = fiche.id;
        setFeuille(null);
        setFeuilleErreur(null);
        if (!id || id === VOIX_ID) return;
        let vivant = true;
        Api.fetchFeuilleAction(id)
            .then(f => { if (vivant) setFeuille(f); })
            .catch(e => { if (vivant) setFeuilleErreur(e instanceof Error ? e.message : String(e)); });
        return () => { vivant = false; };
    }, [fiche.id]);

    return (

    <div className="max-w-3xl animate-fade-in space-y-5">
        <div className="flex items-center gap-2 flex-wrap">
            <span className="text-micro bg-fond text-second border border-bord px-2 py-0.5 rounded-full font-bold">
                {fiche.titre}
            </span>
            {fiche.action && (
                <span className="text-micro font-mono text-second">{fiche.action}</span>
            )}
            <span className="flex items-center gap-1 text-micro text-second">
                <Eye className="w-3 h-3" /> Lecture seule · {signes(fiche.texte.length)}
            </span>
        </div>

        {/* La feuille part EN TÊTE du prompt : elle se lit donc en premier. */}
        {fiche.action && (
            <section>
                <EnTeteGroupe titre="1 · La feuille de salle" detail="ce que le corpus ajoute en tête" />
                {feuilleErreur && (
                    <p className="text-xs font-semibold text-erreur">{feuilleErreur}</p>
                )}
                {!feuilleErreur && !feuille && <Patience titre="Composition de la feuille…" aspect="ligne" />}
                {feuille?.neRecoitRien && (
                    <p className="text-sm leading-relaxed text-second bg-surface border border-bord rounded-xl p-4">
                        <span className="font-semibold text-texte">Ne reçoit rien du corpus — et c'est voulu.</span>{' '}
                        Ce rôle travaille sur ce qu'on lui donne, sans savoir d'où ça vient.
                    </p>
                )}
                {feuille && !feuille.neRecoitRien && !feuille.texte && (
                    <p className="text-sm leading-relaxed text-alerte bg-alerte/10 border border-alerte/30 rounded-xl p-4">
                        Une feuille est prévue pour ce rôle, mais aucun document du corpus ne correspond
                        aux chemins retenus — rien ne partira. À vérifier dans{' '}
                        <span className="font-mono text-xs">packages/editorial/src/contexte.ts</span>.
                    </p>
                )}
                {feuille && !!feuille.texte && (
                    <div className="bg-surface border border-bord rounded-xl overflow-hidden">
                        <div className="flex items-center gap-2 flex-wrap px-4 py-2 border-b border-bord text-micro text-second">
                            <span className="font-mono">{feuille.hash}</span>
                            <span className="text-texte/20">·</span>
                            <span>{signes(feuille.taille)}</span>
                            <span className="text-texte/20">·</span>
                            <span>{feuille.documents.length} document{feuille.documents.length > 1 ? 's' : ''}</span>
                        </div>
                        <ul className="px-4 py-3 flex flex-wrap gap-1.5">
                            {feuille.documents.map(d => (
                                <li key={d} className="text-micro font-mono bg-fond text-second px-1.5 py-0.5 rounded-md">
                                    {d}
                                </li>
                            ))}
                        </ul>
                        <details className="border-t border-bord">
                            <summary className="px-4 py-2 text-xs font-semibold text-second cursor-pointer hover:text-texte">
                                Lire le texte joint
                            </summary>
                            <pre className="whitespace-pre-wrap text-xs text-second leading-relaxed font-sans px-4 pb-4">
                                {feuille.texte}
                            </pre>
                        </details>
                    </div>
                )}
            </section>
        )}

        <section>
            <EnTeteGroupe
                titre={fiche.action ? '2 · Le prompt système' : 'Le texte'}
                detail={fiche.action ? "composé à l'appel" : `reproduit dans ${PRESENCES_VOIX} des neuf prompts`}
            />
            {fiche.exemple && (
                <p className="text-xs leading-relaxed text-second mb-2">
                    <span className="font-semibold">Aperçu.</span> {fiche.exemple}
                </p>
            )}
            <pre className="whitespace-pre-wrap text-xs text-second leading-relaxed font-sans bg-surface border border-bord rounded-xl p-4">
                {fiche.texte}
            </pre>
        </section>
    </div>
    );
};

export default RoleIA;
