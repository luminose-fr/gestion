import React, { useRef, useState } from 'react';
import { Camera, Check, Clapperboard, ImageIcon, RotateCcw, Sparkles, Upload, Trash2, Zap } from 'lucide-react';
import {
    positionsDesReperes, positionDuCoup, motsSitues, motsNormalises, visuelDecrit, illustrationsDuReel, SEQUENCE_DES_ILLUSTRATIONS,
    MODELES_ILLUSTRATION,
    type IllustrationReel, type ReelExplique, type SequenceReel,
} from '@luminose/editorial';
import { Bouton, ControleSegmente, Etiquette } from '../ui';
import { EnCours } from '../Feedback';
import { enFichier, genererIllustration, type IllustrationProposee } from './illustrations';
import { t } from '../ContentEditor/renderers/shared';
import { SceneLuminose, CoupDePoingLuminose } from './SceneLuminose';
import type { VisuelAffiche, VisuelsReel } from './useVisuelsReel';

/**
 * Les cartes d'une scène (SPEC §12, §13.11) : ce qui se dit, chaque repère
 * souligné du numéro de l'élément qu'il fait apparaître, les visuels à produire
 * et l'endroit où les déposer, et la scène elle-même en miniature. Elles
 * vivaient dans le storyboard de l'onglet Script ; elles sont désormais
 * l'onglet Scènes du studio.
 */

interface Marque { debut: number; fin: number; numeros: Array<number | string> }

/**
 * Les empans de la voix qui font apparaître un élément — ou frapper le coup de
 * poing d'un passage face caméra —, calculés comme le contrôle les calcule.
 */
function marquesDesReperes(sequence: SequenceReel): Marque[] {
    const mots = motsSitues(sequence.voix);
    const positions = positionsDesReperes(sequence);
    const empan = (position: number, longueur: number) => {
        const premier = mots[position];
        const dernier = mots[position + longueur - 1];
        return premier && dernier ? { debut: premier.debut, fin: dernier.fin } : null;
    };
    const coup = sequence.plan === 'camera' ? positionDuCoup(sequence) : null;
    const marqueDuCoup = coup && empan(coup.position, coup.longueur);
    const brutes = [
        ...(sequence.elements ?? []).flatMap((element, j) => {
            const position = positions[j];
            const e = position === null ? null : empan(position, motsNormalises(element.apparait_sur).length);
            return e ? [{ ...e, numeros: [j + 1] as Array<number | string> }] : [];
        }),
        ...(marqueDuCoup ? [{ ...marqueDuCoup, numeros: ['coup'] as Array<number | string> }] : []),
    ].sort((a, b) => a.debut - b.debut);

    // Deux éléments sur les mêmes mots (une liaison et la carte qu'elle annonce) :
    // un seul soulignement, deux numéros.
    const fusionnees: Marque[] = [];
    for (const m of brutes) {
        const precedente = fusionnees[fusionnees.length - 1];
        if (precedente && m.debut < precedente.fin) {
            precedente.fin = Math.max(precedente.fin, m.fin);
            precedente.numeros.push(...m.numeros);
        } else fusionnees.push({ ...m });
    }
    return fusionnees;
}

const VoixAvecReperes: React.FC<{ sequence: SequenceReel }> = ({ sequence }) => {
    const voix = sequence.voix ?? '';
    const morceaux: React.ReactNode[] = [];
    let curseur = 0;
    marquesDesReperes(sequence).forEach((m, i) => {
        if (m.debut > curseur) morceaux.push(voix.slice(curseur, m.debut));
        morceaux.push(
            <span key={i} className="underline decoration-2 underline-offset-4 decoration-brand-main/40 dark:decoration-dark-text/50">
                {voix.slice(m.debut, m.fin)}
                <sup className="ml-1 text-micro font-bold text-brand-main/70 dark:text-dark-text/70">{m.numeros.join(',')}</sup>
            </span>
        );
        curseur = m.fin;
    });
    if (curseur < voix.length) morceaux.push(voix.slice(curseur));
    return <p className="text-sm leading-relaxed text-brand-main dark:text-dark-text whitespace-pre-wrap">{morceaux}</p>;
};

const Intention: React.FC<{ texte?: string | null }> = ({ texte }) =>
    t(texte) ? <p className="text-xs italic text-brand-main/60 dark:text-dark-text/60">{t(texte)}</p> : null;

/**
 * Un passage face caméra. S'il porte un coup de poing (SPEC §12.5.3), ses mots
 * sont soulignés dans la voix et il se montre en miniature, comme une scène.
 */
export const SequenceCamera: React.FC<{ sequence: SequenceReel; numero: number }> = ({ sequence, numero }) => (
    <div className="rounded-xl border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface p-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-2 min-w-0">
            <Etiquette forme="entete" avecIcone>
                <Camera /> {numero}. Face caméra{t(sequence.role) ? ` · ${t(sequence.role)}` : ''}
            </Etiquette>
            <VoixAvecReperes sequence={sequence} />
            <Intention texte={sequence.intention} />
            {sequence.coup && (
                <p className="flex items-center gap-1.5 text-xs text-brand-main/70 dark:text-dark-text/70">
                    <Zap className="size-3.5 shrink-0" /> Coup de poing : l'écran passe aux mots, le temps de les dire.
                </p>
            )}
        </div>
        {sequence.coup && (
            <div className="justify-self-center">
                <CoupDePoingLuminose texte={sequence.coup.texte} largeur={108} />
            </div>
        )}
    </div>
);

/**
 * Un visuel à produire, et l'endroit où le déposer une fois produit. Le dépôt
 * est rangé chez Cloudflare (SPEC §12.4) : il se retrouve sur tout poste.
 */
const DepotVisuel: React.FC<{
    /** Le numéro de l'écran qui l'attend ; aucun pour une illustration du Reel, que son nom désigne. */
    numero?: number;
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
                <p className="text-xs text-brand-main dark:text-dark-text">
                    {numero !== undefined && <span className="font-bold">{numero}. </span>}{nature} — {t(description)}
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

/** Les illustrations sous la forme qu'attend la scène : l'image si elle est là, la description pour le gabarit. */
export const illustrationsAffichees = (reel: ReelExplique, visuels: VisuelsReel) => {
    const urls = visuels.desIllustrations();
    return Object.fromEntries(illustrationsDuReel(reel).map(ill => [ill.id, { url: urls[ill.id], description: ill.description }]));
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
 * Les illustrations de la métaphore (v2.26) : décrites une fois pour tout le
 * Reel, montrées par plusieurs écrans. Elles se génèrent dans le style des
 * pages du site (v2.28), ou se déposent.
 */
export const IllustrationsDuReel: React.FC<{ reel: ReelExplique; visuels: VisuelsReel; deposable: boolean }> = ({ reel, visuels, deposable }) => {
    const illustrations = illustrationsDuReel(reel);
    const [modele, setModele] = useState(MODELES_ILLUSTRATION[0].id);
    if (illustrations.length === 0) return null;
    return (
        <div className="rounded-xl border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface p-4 space-y-3">
            <Etiquette forme="entete" avecIcone><ImageIcon /> Illustrations de la métaphore</Etiquette>
            <p className="text-xs text-brand-main/70 dark:text-dark-text/70">
                Une image pour tout le Reel : chaque écran la montre au cadrage qu'il lui faut. Elle se génère dans le style des
                illustrations des pages du site, ou se dépose.
            </p>
            {deposable && (
                <ControleSegmente<string> libelle="Modèle" valeur={modele} onChange={setModele}
                    options={MODELES_ILLUSTRATION.map(m => ({ valeur: m.id, libelle: m.libelle }))} />
            )}
            {illustrations.map((ill, k) => (
                <DepotVisuel
                    key={ill.id}
                    nature={ill.depuis ? `Illustration « ${ill.id} », suite de « ${ill.depuis} »` : `Illustration « ${ill.id} »`}
                    description={ill.description}
                    visuel={visuels.visuel(SEQUENCE_DES_ILLUSTRATIONS, k)}
                    deposable={deposable}
                    onDeposer={(fichier) => visuels.deposer(SEQUENCE_DES_ILLUSTRATIONS, k, fichier)}
                    onRetirer={() => visuels.retirer(SEQUENCE_DES_ILLUSTRATIONS, k)}
                >
                    <GenerationIllustration reel={reel} rang={k} illustration={ill} modele={modele} visuels={visuels} deposable={deposable} />
                </DepotVisuel>
            ))}
        </div>
    );
};

export const SequenceScene: React.FC<{ reel: ReelExplique; sequence: SequenceReel; numero: number; visuels: VisuelsReel; deposable: boolean }> = ({ reel, sequence, numero, visuels, deposable }) => {
    const rang = numero - 1;
    const elements = sequence.elements ?? [];
    // Les images décrites écran par écran, d'avant la v2.26 : elles se déposent encore ici.
    const aProduire = elements
        .map((element, j) => ({ decrit: visuelDecrit(element.visuel), numero: j + 1 }))
        .filter(({ decrit }) => decrit?.description);
    const registre = sequence.registre === 'humour' ? 'humour' : sequence.registre === 'pedagogie' ? 'pédagogie' : null;
    const illustrations = illustrationsAffichees(reel, visuels);
    return (
        <div className="rounded-xl border border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg p-4 space-y-4">
            <div className="space-y-2 min-w-0">
                <Etiquette forme="entete" avecIcone>
                    <Clapperboard /> {numero}. Scène{t(sequence.role) ? ` · ${t(sequence.role)}` : ''}{registre ? ` · ${registre}` : ''}
                </Etiquette>
                <VoixAvecReperes sequence={sequence} />
                <Intention texte={sequence.intention} />
                {aProduire.length > 0 && (
                    <div className="space-y-2 pt-1">
                        <Etiquette avecIcone><ImageIcon /> À produire</Etiquette>
                        {aProduire.map(({ decrit, numero: n }) => (
                            <DepotVisuel
                                key={n}
                                numero={n}
                                nature={decrit!.nature === 'schema' ? 'Schéma' : 'Illustration'}
                                description={decrit!.description}
                                visuel={visuels.visuel(rang, n - 1)}
                                deposable={deposable}
                                onDeposer={(fichier) => visuels.deposer(rang, n - 1, fichier)}
                                onRetirer={() => visuels.retirer(rang, n - 1)}
                            />
                        ))}
                    </div>
                )}
            </div>
            {/* Les écrans de la scène, dans l'ordre où ils se remplacent ; le numéro est celui des repères soulignés. */}
            <ol className="flex flex-wrap gap-3">
                {elements.map((_, j) => (
                    <li key={j} className="space-y-1">
                        <SceneLuminose sequence={sequence} ecran={j} largeur={120} visuels={visuels.deLaScene(rang)} illustrations={illustrations} />
                        <p className="text-xs text-center font-bold text-brand-main/70 dark:text-dark-text/70">{j + 1}</p>
                    </li>
                ))}
            </ol>
        </div>
    );
};
