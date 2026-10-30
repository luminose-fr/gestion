import React, { useRef, useState } from 'react';
import { Check, ImageIcon, RotateCcw, Sparkles, Upload, Trash2 } from 'lucide-react';
import {
    illustrationDe, visuelDecrit, illustrationsDuReel, SEQUENCE_DES_ILLUSTRATIONS, MODELES_ILLUSTRATION,
    type IllustrationReel, type ReelExplique,
} from '@luminose/editorial';
import { Bouton, ControleSegmente } from '../ui';
import { EnCours } from '../Feedback';
import { enFichier, genererIllustration, type IllustrationProposee } from './illustrations';
import { t } from '../ContentEditor/renderers/shared';
import type { VisuelAffiche, VisuelsReel } from './useVisuelsReel';

/**
 * Les visuels d'un Reel expliqué : ce qu'il faut fournir, et où le déposer.
 *
 * Ils vivaient dans des cartes de scène — la voix, ses repères soulignés, les
 * écrans en miniature —, d'abord au storyboard, puis dans l'onglet Scènes du
 * studio. Le studio a perdu ses onglets le 30/10/2026 (v2.32) : l'aperçu montre
 * déjà chaque écran à sa place, et il ne restait de ces cartes qu'une chose à
 * faire, fournir les images. Elles se listent désormais en tête du studio.
 */

/**
 * Un visuel à produire, et l'endroit où le déposer une fois produit. Le dépôt
 * est rangé chez Cloudflare (SPEC §12.4) : il se retrouve sur tout poste.
 */
const DepotVisuel: React.FC<{
    /** L'écran qui l'attend, « 3.2 » ; aucun pour une illustration du Reel, que son nom désigne. */
    numero?: string;
    nature: string;
    description: string;
    visuel?: VisuelAffiche;
    deposable: boolean;
    onDeposer: (fichier: File) => Promise<void>;
    onRetirer: () => Promise<void>;
    /** Ce qui s'ajoute sous le dépôt — la génération d'une illustration. */
    children?: React.ReactNode;
}> = ({ numero, nature, description, visuel, deposable, onDeposer, onRetirer, children }) => {
    const choix = useRef<HTMLInputElement>(null);
    const [erreur, setErreur] = useState<string | null>(null);

    const deposer = async (fichier: File | undefined) => {
        if (!fichier) return;
        if (!fichier.type.startsWith('image/')) {
            setErreur(`« ${fichier.name} » n'est pas une image.`);
            return;
        }
        setErreur(null);
        try {
            await onDeposer(fichier);
        } catch (e: any) {
            setErreur(`Dépôt impossible : ${e?.message ?? String(e)}`);
        }
    };

    return (
        <div
            className="flex items-start gap-3"
            onDragOver={deposable ? (e) => e.preventDefault() : undefined}
            onDrop={deposable ? (e) => { e.preventDefault(); void deposer(e.dataTransfer.files?.[0]); } : undefined}
        >
            {visuel ? (
                <img src={visuel.url} alt="" className="size-10 shrink-0 rounded-md object-cover border border-brand-border dark:border-dark-sec-border" />
            ) : (
                <div className="size-10 shrink-0 rounded-md border border-dashed border-brand-border dark:border-dark-sec-border flex items-center justify-center text-brand-main/40 dark:text-dark-text/40">
                    <ImageIcon className="size-4" />
                </div>
            )}
            <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs text-brand-main dark:text-dark-text line-clamp-2" title={t(description)}>
                    <span className="font-bold">{numero !== undefined ? `Écran ${numero} · ` : ''}{nature}</span> — {t(description)}
                </p>
                {visuel?.perime && (
                    <p className="text-xs text-alerte">La description a changé depuis le dépôt : cette image répondait à une autre demande.</p>
                )}
                {erreur && <p className="text-xs text-erreur">{erreur}</p>}
                {deposable && (
                    <div className="flex items-center gap-2">
                        <input ref={choix} type="file" accept="image/*" className="hidden" onChange={(e) => { void deposer(e.target.files?.[0]); e.target.value = ''; }} />
                        <Bouton taille="petit" intention="secondaire" onClick={() => choix.current?.click()}>
                            <Upload /> {visuel ? 'Remplacer' : 'Déposer'}
                        </Bouton>
                        {visuel && (
                            <Bouton taille="petit" intention="discrete" onClick={() => void onRetirer()}>
                                <Trash2 /> Retirer
                            </Bouton>
                        )}
                    </div>
                )}
                {children}
            </div>
        </div>
    );
};

/** Ce qu'une génération a coûté, quand OpenRouter l'a dit. */
const cout = (usd: number | null) => usd === null ? '' : ` · ${usd.toLocaleString('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 3 })}`;

/**
 * Générer une illustration (v2.28) : dans le style du site, avec le modèle
 * choisi. L'image se montre d'abord ; elle ne se range que si Florent la garde.
 */
const GenerationIllustration: React.FC<{
    reel: ReelExplique;
    rang: number;
    illustration: IllustrationReel;
    modele: string;
    visuels: VisuelsReel;
    deposable: boolean;
}> = ({ reel, rang, illustration, modele, visuels, deposable }) => {
    const [enCours, setEnCours] = useState(false);
    const [proposee, setProposee] = useState<IllustrationProposee | null>(null);
    const [erreur, setErreur] = useState<string | null>(null);
    const urls = visuels.desIllustrations();
    const deja = !!urls[illustration.id];
    // La suite d'une scène se génère à partir de sa première illustration : sans elle, le lieu ne serait plus le même.
    const enAttente = illustration.depuis && !urls[illustration.depuis] ? illustration.depuis : null;

    const generer = async () => {
        setEnCours(true);
        setErreur(null);
        try {
            setProposee(await genererIllustration(reel, rang, modele, id => urls[id]));
        } catch (e: any) {
            setErreur(e?.message ?? String(e));
        } finally {
            setEnCours(false);
        }
    };
    const garder = async () => {
        if (!proposee) return;
        setEnCours(true);
        try {
            await visuels.deposer(SEQUENCE_DES_ILLUSTRATIONS, rang, await enFichier(proposee.image, illustration.id));
            setProposee(null);
        } catch (e: any) {
            setErreur(`L’image n’a pas pu être gardée : ${e?.message ?? String(e)}`);
        } finally {
            setEnCours(false);
        }
    };

    if (!deposable) return null;
    return (
        <div className="space-y-2 pt-1">
            {proposee ? (
                <div className="flex items-start gap-3">
                    <img src={proposee.image} alt={`Proposition pour « ${illustration.id} »`} className="w-32 shrink-0 rounded-lg border border-brand-border dark:border-dark-sec-border" />
                    <div className="space-y-2">
                        <p className="text-xs text-brand-main/70 dark:text-dark-text/70">{proposee.modelLabel}{cout(proposee.coutUsd)}</p>
                        <div className="flex flex-wrap items-center gap-2">
                            <Bouton taille="petit" intention="principale" disabled={enCours} onClick={() => void garder()}><Check /> Garder</Bouton>
                            <Bouton taille="petit" intention="secondaire" disabled={enCours} onClick={() => void generer()}><RotateCcw /> Refaire</Bouton>
                            <Bouton taille="petit" intention="discrete" disabled={enCours} onClick={() => setProposee(null)}>Laisser</Bouton>
                        </div>
                    </div>
                </div>
            ) : enCours ? (
                <p className="flex items-center gap-1.5 text-xs text-brand-main dark:text-dark-text">
                    <EnCours label="Génération… une demi-minute environ" taille="xs" />
                </p>
            ) : (
                <div className="flex flex-wrap items-center gap-2">
                    <Bouton taille="petit" intention="secondaire" disabled={!!enAttente} onClick={() => void generer()}
                        title={enAttente ? `Gardez d’abord « ${enAttente} » : celle-ci en est la suite` : undefined}>
                        <Sparkles /> {deja ? 'En générer une autre' : 'Générer'}
                    </Bouton>
                    {enAttente && <span className="text-xs text-brand-main/60 dark:text-dark-text/60">Après « {enAttente} », dont elle est la suite.</span>}
                </div>
            )}
            {erreur && <p className="text-xs text-erreur">{erreur}</p>}
        </div>
    );
};

/**
 * Les visuels à fournir (v2.32) : les illustrations de la métaphore (v2.26),
 * décrites une fois pour tout le Reel et montrées par plusieurs écrans, puis
 * les images décrites écran par écran d'avant la v2.26. Une illustration se
 * génère dans le style des pages du site (v2.28), ou se dépose ; une image se
 * dépose.
 */
export const VisuelsAFournir: React.FC<{ reel: ReelExplique; visuels: VisuelsReel; deposable: boolean }> = ({ reel, visuels, deposable }) => {
    const illustrations = illustrationsDuReel(reel);
    const [modele, setModele] = useState(MODELES_ILLUSTRATION[0].id);
    const sequences = reel.sequences ?? [];
    // Les écrans qui montrent chaque illustration : c'est par eux que Florent la reconnaît.
    const ecransDe = (id: string) => sequences.flatMap((s, i) => (s.elements ?? []).some(e => illustrationDe(e.visuel)?.illustration === id) ? [i + 1] : []);
    const decrits = sequences.flatMap((s, i) => (s.elements ?? []).flatMap((e, j) => {
        const decrit = visuelDecrit(e.visuel);
        return decrit?.description ? [{ sequence: i, element: j, decrit }] : [];
    }));
    if (illustrations.length === 0 && decrits.length === 0) return null;
    return (
        <div className="space-y-3">
            {deposable && illustrations.length > 0 && (
                <ControleSegmente<string> libelle="Modèle des illustrations" valeur={modele} onChange={setModele}
                    options={MODELES_ILLUSTRATION.map(m => ({ valeur: m.id, libelle: m.libelle }))} />
            )}
            {illustrations.map((ill, k) => {
                const ecrans = ecransDe(ill.id);
                const ou = ecrans.length === 0 ? '' : ecrans.length === 1 ? `, écran ${ecrans[0]}` : `, écrans ${ecrans.slice(0, -1).join(', ')} et ${ecrans[ecrans.length - 1]}`;
                return (
                    <DepotVisuel
                        key={ill.id}
                        nature={`${ill.depuis ? `Illustration « ${ill.id} », suite de « ${ill.depuis} »` : `Illustration « ${ill.id} »`}${ou}`}
                        description={ill.description}
                        visuel={visuels.visuel(SEQUENCE_DES_ILLUSTRATIONS, k)}
                        deposable={deposable}
                        onDeposer={(fichier) => visuels.deposer(SEQUENCE_DES_ILLUSTRATIONS, k, fichier)}
                        onRetirer={() => visuels.retirer(SEQUENCE_DES_ILLUSTRATIONS, k)}
                    >
                        <GenerationIllustration reel={reel} rang={k} illustration={ill} modele={modele} visuels={visuels} deposable={deposable} />
                    </DepotVisuel>
                );
            })}
            {decrits.map(({ sequence, element, decrit }) => (
                <DepotVisuel
                    key={`${sequence}:${element}`}
                    numero={`${sequence + 1}.${element + 1}`}
                    nature={decrit.nature === 'schema' ? 'Schéma' : 'Illustration'}
                    description={decrit.description}
                    visuel={visuels.visuel(sequence, element)}
                    deposable={deposable}
                    onDeposer={(fichier) => visuels.deposer(sequence, element, fichier)}
                    onRetirer={() => visuels.retirer(sequence, element)}
                />
            ))}
        </div>
    );
};
