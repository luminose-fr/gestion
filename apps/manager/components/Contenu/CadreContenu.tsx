import React, { useState, useRef } from 'react';
import { AlertCircle, Check, ChevronDown, ChevronLeft } from 'lucide-react';
import { NOMS_DES_ETAPES, type Etape, type EtapeDuSelecteur } from '@luminose/editorial';
import { BarreProgression, CLASSES_SURTITRE, CLASSES_TITRE_ECRAN, Etiquette, TitreEcran, type EtatSegment } from '../ui';
import { EnCours } from '../Feedback';
import { useMenuNavigation } from '../hooks/useMenuNavigation';

/**
 * Le cadre d'un contenu ouvert (SPEC §13.9) : le même à toutes les étapes et
 * pour le plan de série. Un bandeau de 80 px — retour, titre, sélecteur
 * d'étape —, la zone de travail, et un pied de 48 px qui dit si c'est
 * enregistré, ce que ça a coûté, et où l'on supprime.
 */

// ── Le sélecteur d'étape ─────────────────────────────────────────────

export interface SelecteurEtapeProps {
    lignes: EtapeDuSelecteur[];
    /** L'étape affichée, qui peut ne pas être l'étape actuelle. */
    affichee: Etape;
    onChoisir: (etape: Etape) => void;
}

/**
 * Le sélecteur SÉPARE l'état de la navigation : il remplace un fil de
 * pastilles cliquables, jugé confus. Sa largeur ne dépend ni de l'étape ni du
 * coût — rien ne bouge d'un contenu à l'autre.
 */
export const SelecteurEtape: React.FC<SelecteurEtapeProps> = ({ lignes, affichee, onChoisir }) => {
    const [ouvert, setOuvert] = useState(false);
    const racine = useRef<HTMLDivElement>(null);
    useMenuNavigation(ouvert, racine, () => setOuvert(false));
    const rang = Math.max(0, lignes.findIndex(l => l.etape === affichee));
    const actuel = lignes.findIndex(l => l.actuelle);
    const segments: EtatSegment[] = lignes.map((l, i) => (l.faite ? 'fait' : i === actuel ? 'encours' : 'avenir'));

    return (
        <div ref={racine} className="relative shrink-0 w-full md:w-auto">
            <button
                type="button"
                onClick={() => setOuvert(o => !o)}
                aria-expanded={ouvert}
                aria-haspopup="menu"
                className="ui-action w-full md:w-[320px] h-[52px] flex items-center gap-3 px-3 rounded-[10px] border border-bord bg-fond text-left hover:border-brand-main/40"
            >
                <span className="flex-1 min-w-0 space-y-1">
                    <span className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-bold text-texte truncate">{NOMS_DES_ETAPES[affichee]}</span>
                        <span className={`${CLASSES_SURTITRE} shrink-0`}>
                            Étape {rang + 1} sur {lignes.length}
                        </span>
                    </span>
                    <BarreProgression segments={segments} fine />
                </span>
                <ChevronDown className={`w-4 h-4 shrink-0 text-second transition-transform ${ouvert ? 'rotate-180' : ''}`} />
            </button>
            {ouvert && (
                <>
                    {/* Un clic dehors referme : le voile ne se voit pas, il attrape. */}
                    <div className="fixed inset-0 z-20" onClick={() => setOuvert(false)} />
                    <div role="menu" className="ui-popover absolute right-0 z-30 mt-1 w-[320px] max-w-[calc(100vw-2rem)] rounded-xl border border-bord bg-surface shadow-lg p-1"
>
                        <Etiquette className="px-3 pt-2 pb-1">Aller à une étape</Etiquette>
                        {lignes.map((l, i) => (
                            <button
                                key={l.etape}
                                type="button"
                                role="menuitem"
                                disabled={l.verrouillee}
                                title={l.raison ?? undefined}
                                onClick={() => { onChoisir(l.etape); setOuvert(false); }}
                                className={`ui-action w-full h-11 flex items-center gap-3 px-3 rounded-lg text-left disabled:opacity-40 disabled:cursor-not-allowed ${
                                    l.etape === affichee ? 'bg-fond' : 'hover:bg-survole'
                                }`}
                            >
                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-micro font-bold shrink-0 ${
                                    l.faite ? 'bg-succes text-white dark:text-dark-bg'
                                        : l.actuelle ? 'bg-marque text-sur-marque'
                                            : 'border border-bord text-second'
                                }`}>
                                    {l.faite ? <Check className="w-3.5 h-3.5" /> : i + 1}
                                </span>
                                <span className="flex-1 min-w-0">
                                    <span className="block text-sm font-semibold text-texte truncate">{l.nom}</span>
                                    {l.actuelle && <span className="block text-micro text-second">étape actuelle</span>}
                                </span>
                                {l.statut && <span className="text-xs text-second shrink-0">{l.statut}</span>}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

// ── Le pied ──────────────────────────────────────────────────────────

export interface PiedContenuProps {
    etat: 'idle' | 'saving' | 'saved' | 'error';
    erreur?: string | null;
    onReessayer?: () => void;
    /** « ≥ 0,33 $ », déjà mis en forme ; rien quand aucun appel n'est chiffré. */
    cout?: { libelle: string; detail: string } | null;
    libelleSupprimer?: string;
    onSupprimer?: () => void;
}

/**
 * Plus de bouton « Enregistrer » : ce qu'on écrit part tout seul. Le pied dit
 * seulement que c'est fait — et, quand ça échoue, il le dit en rouge et offre
 * de réessayer, sans quoi Florent croirait son travail sauvegardé.
 */
export const PiedContenu: React.FC<PiedContenuProps> = ({ etat, erreur, onReessayer, cout, libelleSupprimer = 'Supprimer ce contenu', onSupprimer }) => (
    <div className="h-12 shrink-0 flex items-center gap-4 px-4 md:px-8 border-t border-bord bg-surface">
        <span aria-live="polite" aria-atomic="true" className="min-w-0 md:min-w-[220px] flex items-center gap-4 text-xs whitespace-nowrap">
            {etat === 'saving' ? <EnCours label="Enregistrement…" taille="xs" />
                : etat === 'error' ? (
                    <span className="flex items-center gap-1.5 font-semibold text-erreur" title={erreur ?? undefined}>
                        <AlertCircle className="w-3.5 h-3.5" /> Non enregistré
                        {onReessayer && <button type="button" onClick={onReessayer} className="underline hover:no-underline">Réessayer</button>}
                    </span>
                ) : (
                    <span className="ui-feedback flex items-center gap-1.5 text-succes" data-confirme={etat === 'saved' || undefined}><Check className="w-3.5 h-3.5" /> Enregistré<span className="hidden md:inline"> automatiquement</span></span>
                )}
            {cout && <span className="hidden sm:inline text-second tabular-nums" title={cout.detail}>Coût IA {cout.libelle}</span>}
        </span>
        <span className="flex-1" />
        {onSupprimer && (
            <button type="button" onClick={onSupprimer} className="text-xs font-semibold text-erreur hover:underline whitespace-nowrap">{libelleSupprimer}</button>
        )}
    </div>
);

// ── Le cadre ─────────────────────────────────────────────────────────

export interface CadreContenuProps {
    /** Le libellé du retour : la liste d'où l'on vient. */
    retour: { libelle: string; onClick: () => void };
    titre: string;
    /** Modifiable : le titre s'écrit dans le bandeau. */
    onTitre?: (titre: string) => void;
    pastilles: string[];
    /** Le sélecteur d'étape, ou, sur un plan de série, son avancement. */
    selecteur: React.ReactNode;
    /** Au studio, le bouton du fil. */
    actionDroite?: React.ReactNode;
    /** Le panneau Série, quand le contenu appartient à une série. */
    panneauSerie?: React.ReactNode;
    /** Une alerte sous le bandeau — un échec qu'il faut voir. */
    bandeau?: React.ReactNode;
    pied: React.ReactNode;
    children: React.ReactNode;
}

export const CadreContenu: React.FC<CadreContenuProps> = ({
    retour, titre, onTitre, pastilles, selecteur, actionDroite, panneauSerie, bandeau, pied, children,
}) => (
    <div className="w-full h-full flex flex-col bg-fond">
        {/* Sur téléphone, le bandeau passe sur deux lignes : le titre, puis le sélecteur en pleine largeur. */}
        <div className="md:h-20 shrink-0 flex flex-wrap md:flex-nowrap items-center gap-x-4 gap-y-2 px-4 md:px-8 py-3 md:py-0 border-b border-bord bg-surface">
            <button type="button" onClick={retour.onClick}
                className="h-10 shrink-0 inline-flex items-center gap-1.5 px-2 rounded-lg text-sm font-semibold text-second hover:text-texte hover:bg-survole transition-colors">
                <ChevronLeft className="w-4 h-4" /> {retour.libelle}
            </button>
            <div className="flex-1 min-w-0 space-y-1">
                {onTitre ? (
                    <input
                        value={titre}
                        onChange={(e) => onTitre(e.target.value)}
                        aria-label="Titre du contenu"
                        placeholder="Sans titre"
                        className={`w-full bg-transparent outline-hidden truncate placeholder-brand-main/40 ${CLASSES_TITRE_ECRAN('contenu')}`}
                    />
                ) : (
                    <TitreEcran taille="contenu" as="h1">{titre || 'Sans titre'}</TitreEcran>
                )}
                <div className="flex items-center gap-1.5 flex-wrap">
                    {pastilles.map(p => <Etiquette key={p} as="span" forme="pastille">{p}</Etiquette>)}
                </div>
            </div>
            {selecteur}
            {actionDroite}
        </div>
        {bandeau}
        <div className="flex-1 min-h-0 flex">
            {panneauSerie}
            <div className="flex-1 min-w-0 flex flex-col">{children}</div>
        </div>
        {pied}
    </div>
);

export default CadreContenu;
