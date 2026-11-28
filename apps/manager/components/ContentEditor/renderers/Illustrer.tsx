import React, { useState } from 'react';
import { Download, RotateCcw, Sparkles } from 'lucide-react';
import type { ProportionsImage } from '@luminose/editorial';
import { Bouton, CLASSES_CHAMP, ControleSegmente, Etiquette } from '../../ui';
import { EnCours } from '../../Feedback';
import { useCatalogueImage } from '../../../services/catalogueModeles';
import * as AI from '../../../services/aiService';

/**
 * Illustrer depuis le prompt d'image d'un brouillon (SPEC v2.37).
 *
 * Florent génère ses visuels de deux façons : dans ChatGPT, où il colle le
 * prompt, ou ici, avec un modèle d'Illustrer. Le prompt part TEL QUEL, comme il
 * partirait dans ChatGPT : ni étalon ni consigne ajoutée. Les réseaux n'ont pas
 * de charte (`direction-artistique.md` §4) — l'étalon du site est un choix fait
 * pour le Reel, pas une règle à étendre en douce —, et deux chemins qui ne
 * reçoivent pas le même prompt finiraient par ne pas rendre la même image.
 *
 * L'image se montre, puis se télécharge : un post se publie hors de
 * l'application, rien n'est rangé. Refaire en demande une autre.
 */

export interface ModeleImage { id: string; libelle: string }

/** Les modèles d'image du catalogue, et celui retenu : le choix de l'écran, sinon le réglage de la famille Illustrer. */
export const useModeleImage = () => {
    const catalogue = useCatalogueImage();
    const [choisi, setChoisi] = useState<string | null>(null);
    const retenu = catalogue.modeles.find(m => m.id === choisi) ?? catalogue.modeles.find(m => m.id === catalogue.defaut) ?? null;
    return {
        modeles: catalogue.modeles,
        modele: retenu ? { id: retenu.id, libelle: retenu.name } as ModeleImage : null,
        choisir: setChoisi,
    };
};
export type ModelesImage = ReturnType<typeof useModeleImage>;

/**
 * Le menu des modèles d'image. Un seul modèle au catalogue : rien à choisir,
 * son nom s'affiche à côté de l'image. Aucun : la marche à suivre.
 */
export const ChoixModeleImage: React.FC<{ id: string; choix: ModelesImage }> = ({ id, choix }) => {
    if (choix.modeles.length === 0) {
        return (
            <p className="text-xs text-second">
                Aucun modèle d’image au catalogue : en ajouter un dans Réglages → Modèles IA, sortie « Image ».
            </p>
        );
    }
    if (choix.modeles.length === 1) return null;
    return (
        <div className="w-full md:w-64">
            <Etiquette as="label" htmlFor={id} className="mb-1">Modèle d’image</Etiquette>
            <select id={id} value={choix.modele?.id ?? ''} onChange={e => choix.choisir(e.target.value)}
                className={`${CLASSES_CHAMP} cursor-pointer`}>
                {choix.modeles.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
        </div>
    );
};

/** Les proportions, quand le format en propose plusieurs (le Post Texte : 1:1 ou 4:5). */
export const ChoixProportions: React.FC<{
    proportions: readonly ProportionsImage[];
    valeur: ProportionsImage;
    onChange: (p: ProportionsImage) => void;
}> = ({ proportions, valeur, onChange }) => proportions.length < 2 ? null : (
    <ControleSegmente<ProportionsImage>
        libelle="Proportions de l’image"
        valeur={valeur}
        onChange={onChange}
        options={proportions.map(p => ({ valeur: p, libelle: p }))}
    />
);

interface Proposee { image: string; modelLabel: string; coutUsd: number | null; proportions: ProportionsImage }

export interface Illustration {
    proposee: Proposee | null;
    enCours: boolean;
    erreur: string | null;
    /** Rien sans modèle : le bouton est alors désactivé. */
    illustrer: () => void;
    laisser: () => void;
}

/** Une génération depuis un prompt : l'état d'une proposition, de sa demande à son téléchargement. */
export const useIllustration = (demande: {
    prompt: string;
    proportions: ProportionsImage;
    /** Le format du contenu, pour la mesure (`mesures_ia`). */
    format: string;
    modele: ModeleImage | null;
}): Illustration => {
    const [enCours, setEnCours] = useState(false);
    const [proposee, setProposee] = useState<Proposee | null>(null);
    const [erreur, setErreur] = useState<string | null>(null);

    const illustrer = async () => {
        const { prompt, proportions, format, modele } = demande;
        if (!modele || enCours) return;
        setEnCours(true);
        setErreur(null);
        try {
            const { image, modelLabel, usage } = await AI.genererIllustration({
                modelId: modele.id, libelle: modele.libelle, prompt, references: [], proportions, format,
            });
            setProposee({ image, modelLabel, coutUsd: usage.coutUsd, proportions });
        } catch (e: any) {
            setErreur(e?.message ?? String(e));
        } finally {
            setEnCours(false);
        }
    };

    return { proposee, enCours, erreur, illustrer: () => void illustrer(), laisser: () => setProposee(null) };
};

/** Le bouton qui lance la génération. */
export const BoutonIllustrer: React.FC<{ illustration: Illustration; modele: ModeleImage | null; taille?: 'petit' | 'normal' }> = ({
    illustration, modele, taille = 'petit',
}) => (
    <Bouton taille={taille} intention="secondaire" disabled={!modele || illustration.enCours} onClick={illustration.illustrer}
        title={modele ? `Générer l’image avec ${modele.libelle}, depuis ce prompt` : 'Aucun modèle d’image au catalogue'}>
        <Sparkles /> Illustrer
    </Bouton>
);

/** Ce qu'une génération a coûté, quand OpenRouter l'a dit. */
const cout = (usd: number | null) => usd === null ? '' : ` · ${usd.toLocaleString('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 3 })}`;

/** Le navigateur enregistre l'image sous un nom qui dit d'où elle vient. */
const telecharger = async (donnees: string, nom: string) => {
    const blob = await (await fetch(donnees)).blob();
    const url = URL.createObjectURL(blob);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = `${nom}.${blob.type.split('/')[1] || 'png'}`;
    lien.click();
    URL.revokeObjectURL(url);
};

/** L'image proposée, l'attente ou l'échec. Rien tant qu'on n'a rien demandé. */
export const ResultatIllustration: React.FC<{ illustration: Illustration; nomFichier: string; alt: string }> = ({
    illustration, nomFichier, alt,
}) => {
    const { proposee, enCours, erreur } = illustration;
    if (!proposee && !enCours && !erreur) return null;
    return (
        <div className="space-y-2">
            {proposee && (
                <div className="flex flex-wrap items-start gap-3">
                    <img src={proposee.image} alt={alt} className="w-40 shrink-0 rounded-lg border border-bord" />
                    <div className="space-y-2">
                        <p className="text-xs text-second">{proposee.modelLabel} · {proposee.proportions}{cout(proposee.coutUsd)}</p>
                        <div className="flex flex-wrap items-center gap-2">
                            <Bouton taille="petit" intention="principale" disabled={enCours} onClick={() => void telecharger(proposee.image, nomFichier)}>
                                <Download /> Télécharger
                            </Bouton>
                            <Bouton taille="petit" intention="secondaire" disabled={enCours} onClick={illustration.illustrer}>
                                <RotateCcw /> Refaire
                            </Bouton>
                            <Bouton taille="petit" intention="discrete" disabled={enCours} onClick={illustration.laisser}>Laisser</Bouton>
                        </div>
                    </div>
                </div>
            )}
            {enCours && (
                <p className="flex items-center gap-1.5 text-xs text-second">
                    <EnCours label="Génération… une demi-minute environ" taille="xs" />
                </p>
            )}
            {erreur && <p className="text-xs text-erreur">{erreur}</p>}
        </div>
    );
};
