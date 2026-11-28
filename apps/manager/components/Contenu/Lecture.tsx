import React, { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import {
    getFormatDef, horlogeEstimee, minuterReel, montageDuBrouillon, parseBodyJson, texteAffiche, ecranEnClair,
    SIGNATURE_SLIDE, SLIDE_TEXT_MAX, type ProportionsImage, type ReelExplique,
} from '@luminose/editorial';
import { Bouton, Etiquette } from '../ui';
import {
    CarrouselLegende, buildPostCourtText, copyTextToClipboard, getPostCourtImagePrompt, getPostCourtSuggestedVisual,
} from '../ContentEditor/renderers/shared';
import {
    BoutonIllustrer, ChoixModeleImage, ChoixProportions, ResultatIllustration, useIllustration, useModeleImage,
} from '../ContentEditor/renderers/Illustrer';
import { BodyRenderer } from '../ContentEditor/renderers/BodyRenderer';

/**
 * Ce que la matière donne à lire, étape par étape (SPEC §13.9) : le script
 * séquence par séquence, le même en grand pour se préparer au tournage, la
 * trame d'un carrousel slide par slide, et ce qui sera publié.
 */

const secondes = (s: number) => `${Math.round(s)} s`;

/** Le montage que décrit un brouillon de vidéo, minuté au débit estimé. */
export function useScript(draft: string | null, format: string | null): { reel: ReelExplique; minutage: ReturnType<typeof minuterReel> } | null {
    return useMemo(() => {
        const data = draft ? parseBodyJson(draft) : null;
        const reel = data ? montageDuBrouillon(data, format) : null;
        if (!reel || reel.sequences.length === 0) return null;
        return { reel, minutage: minuterReel(reel, horlogeEstimee()) };
    }, [draft, format]);
}

const nature = (plan: string) => (plan === 'scene' ? 'Scène' : 'Face caméra');

// ── Le script ────────────────────────────────────────────────────────

export const LectureScript: React.FC<{ draft: string | null; format: string | null }> = ({ draft, format }) => {
    const script = useScript(draft, format);
    if (!script) return null;
    const { reel, minutage } = script;
    return (
        <div className="space-y-3">
            {reel.sequences.map((s, i) => {
                const m = minutage.sequences[i];
                return (
                    <div key={i} className="grid grid-cols-[160px_minmax(0,1fr)] gap-4 rounded-xl border border-bord bg-surface p-5">
                        <div className="space-y-1">
                            <Etiquette forme="entete">{i + 1} · {s.role || nature(s.plan)}</Etiquette>
                            <p className="text-xs text-second">{nature(s.plan)} · {Math.round(m.debut)} à {Math.round(m.fin)} s</p>
                        </div>
                        <div className="space-y-2">
                            <p className="text-sm leading-6 text-second whitespace-pre-wrap">{texteAffiche(s.voix)}</p>
                            {s.intention && <p className="text-xs italic leading-relaxed text-second">{s.intention}</p>}
                        </div>
                    </div>
                );
            })}
            {reel.accroche_pub?.voix && (
                <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-4 rounded-xl border border-dashed border-bord p-5">
                    <Etiquette forme="entete">Seconde accroche · publicité</Etiquette>
                    <p className="text-sm leading-6 text-second">{texteAffiche(reel.accroche_pub.voix)}</p>
                </div>
            )}
            <CarrouselLegende legende={reel.legende as any} />
        </div>
    );
};

// ── Le tournage ──────────────────────────────────────────────────────

/**
 * Le script en grand, pour se préparer : Florent ne le lit pas en filmant, il
 * se l'approprie avant, et parle à sa façon. Ce qui compte, c'est le fil des
 * idées, et ce qui se verra à l'écran pendant qu'il parle.
 */
export const LectureTournage: React.FC<{ draft: string | null; format: string | null }> = ({ draft, format }) => {
    const script = useScript(draft, format);
    if (!script) return null;
    const { reel, minutage } = script;
    return (
        <div className="space-y-4">
            {reel.sequences.map((s, i) => {
                const m = minutage.sequences[i];
                const aLEcran = s.plan === 'scene'
                    ? (s.elements ?? []).map(ecranEnClair)
                    : [s.coup ? `Coup de poing : ${texteAffiche(s.coup.texte)}` : 'Votre visage, face caméra.'];
                return (
                    <div key={i} className="flex flex-wrap gap-5 rounded-xl border border-bord bg-surface p-5">
                        <div className="flex-1 min-w-[280px] space-y-3">
                            <div className="flex items-center gap-3">
                                <span className="w-7 h-7 rounded-full bg-marque text-sur-marque flex items-center justify-center text-xs font-bold">{i + 1}</span>
                                <Etiquette forme="entete">{nature(s.plan)} · {s.role}</Etiquette>
                                <span className="text-xs text-second">{secondes(m.fin - m.debut)}</span>
                            </div>
                            <p className="text-lg font-semibold leading-relaxed text-texte">{texteAffiche(s.voix)}</p>
                            {s.intention && <p className="text-sm italic text-second">{s.intention}</p>}
                        </div>
                        <div className="w-full sm:w-auto sm:max-w-[300px] sm:min-w-[220px] rounded-lg bg-fond p-4 space-y-2 self-start">
                            <Etiquette>À l’écran</Etiquette>
                            <ul className="space-y-1 text-sm text-second">
                                {aLEcran.map((t, j) => <li key={j}>{t}</li>)}
                            </ul>
                        </div>
                    </div>
                );
            })}
            {reel.accroche_pub?.voix && (
                <div className="rounded-xl border border-dashed border-bord p-5 space-y-2">
                    <Etiquette forme="entete">Seconde accroche · publicité</Etiquette>
                    <p className="text-lg font-semibold leading-relaxed text-texte">{texteAffiche(reel.accroche_pub.voix)}</p>
                    <p className="text-xs text-second">À tourner dans la foulée : elle remplace la séquence 1 dans la version publicitaire.</p>
                </div>
            )}
        </div>
    );
};

// ── La trame d'un carrousel ──────────────────────────────────────────

export const TrameCarrousel: React.FC<{ draft: string }> = ({ draft }) => {
    const data = parseBodyJson(draft);
    const slides: any[] = Array.isArray(data?.slides) ? data.slides : [];
    if (slides.length === 0) return <BodyRenderer body={draft} />;
    return (
        <div className="space-y-3">
            {slides.map((s, i) => {
                const texte = typeof s.texte === 'string' ? s.texte : '';
                const trop = texte.length > SLIDE_TEXT_MAX;
                return (
                    <div key={i} className="rounded-xl border border-bord bg-surface p-5 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                            <Etiquette forme="entete">{s.numero ?? i + 1} · {s.role || s.titre || 'Slide'}</Etiquette>
                            <span className={`text-xs tabular-nums ${trop ? 'text-alerte font-semibold' : 'text-second'}`}>{texte.length} / {SLIDE_TEXT_MAX}</span>
                        </div>
                        {s.titre && s.role && <p className="text-sm font-bold text-texte">{s.titre}</p>}
                        <p className="text-sm leading-6 text-second">{texte}</p>
                    </div>
                );
            })}
            <CarrouselLegende legende={data?.legende} />
        </div>
    );
};

// ── Les vignettes des slides ─────────────────────────────────────────

const VIGNETTE = 'aspect-[4/5] rounded-lg bg-dark-surface text-white flex flex-col justify-center gap-2 p-3 overflow-hidden';

export const VignettesSlides: React.FC<{ slides: string; petites?: boolean }> = ({ slides, petites }) => {
    const data = parseBodyJson(slides);
    const liste: any[] = Array.isArray(data?.slides) ? data.slides : [];
    const tuiles = [...liste.map(s => ({ titre: s.titre ?? '', texte: s.texte ?? '' })), { titre: SIGNATURE_SLIDE.titre, texte: SIGNATURE_SLIDE.texte }];
    return (
        <div className={petites ? 'flex flex-wrap gap-2' : 'grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4'}>
            {tuiles.map((t, i) => (
                <div key={i} className={`${VIGNETTE} ${petites ? 'w-[110px]' : ''}`}>
                    <p className="font-display italic leading-tight text-sm">{t.titre}</p>
                    {!petites && <p className="text-xs leading-snug text-white/80">{t.texte}</p>}
                </div>
            ))}
        </div>
    );
};

// ── Ce qui sera publié ───────────────────────────────────────────────

/**
 * Le visuel du post, depuis son prompt (SPEC v2.37) : le prompt se copie pour
 * ChatGPT, ou s'illustre ici avec un modèle d'Illustrer, aux proportions que le
 * registre donne au format.
 */
const IllustrerPost: React.FC<{ prompt: string; format: string; proportions: readonly ProportionsImage[] }> = ({ prompt, format, proportions }) => {
    const choix = useModeleImage();
    const [cadre, setCadre] = useState<ProportionsImage>(proportions[0]);
    const illustration = useIllustration({ prompt, proportions: cadre, format, modele: choix.modele });
    return (
        <div className="space-y-3 pt-2">
            <div className="flex flex-wrap items-end gap-2">
                <ChoixModeleImage id="modele-visuel-post" choix={choix} />
                <ChoixProportions proportions={proportions} valeur={cadre} onChange={setCadre} />
                {choix.modeles.length > 0 && <BoutonIllustrer illustration={illustration} modele={choix.modele} taille="normal" />}
            </div>
            <ResultatIllustration illustration={illustration} nomFichier={`visuel-post-${cadre.replace(':', 'x')}`} alt="Le visuel proposé pour le post" />
        </div>
    );
};

const CopiePostCourt: React.FC<{ draft: string; format: string | null }> = ({ draft, format }) => {
    const [copie, setCopie] = useState<'texte' | 'prompt' | null>(null);
    const texte = buildPostCourtText(draft);
    const prompt = getPostCourtImagePrompt(draft);
    const visuel = getPostCourtSuggestedVisual(draft);
    // Le registre dit si l'image de ce format s'illustre depuis son prompt, et à quelles proportions (règle n°3).
    const image = getFormatDef(format)?.image;
    const copier = async (quoi: 'texte' | 'prompt', valeur: string) => {
        if (!(await copyTextToClipboard(valeur))) return;
        setCopie(quoi);
        setTimeout(() => setCopie(c => (c === quoi ? null : c)), 2000);
    };
    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                    <Etiquette forme="entete">Texte à copier</Etiquette>
                    <Bouton data-confirme={copie === 'texte' || undefined} aria-live="polite" taille="petit" onClick={() => copier('texte', texte)} disabled={!texte}>
                        {copie === 'texte' ? <><Check /> Copié</> : <><Copy /> Copier</>}
                    </Bouton>
                </div>
                <div className="space-y-4 text-sm leading-relaxed text-second select-text">
                    {texte.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}
                </div>
            </div>
            {prompt && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                        <Etiquette forme="entete">Prompt d’image</Etiquette>
                        <Bouton data-confirme={copie === 'prompt' || undefined} aria-live="polite" taille="petit" onClick={() => copier('prompt', prompt)}>
                            {copie === 'prompt' ? <><Check /> Copié</> : <><Copy /> Copier</>}
                        </Bouton>
                    </div>
                    <p className="text-sm leading-relaxed text-second whitespace-pre-wrap select-text">{prompt}</p>
                    {image && format && <IllustrerPost prompt={prompt} format={format} proportions={image.proportions} />}
                </div>
            )}
            {visuel && (
                <div className="space-y-2">
                    <Etiquette forme="entete">Visuel suggéré</Etiquette>
                    <p className="text-sm leading-relaxed text-second whitespace-pre-wrap">{visuel}</p>
                </div>
            )}
        </div>
    );
};

export const CeQuiSeraPublie: React.FC<{
    sorte: 'ecrit' | 'carrousel' | 'video' | 'video-sans-script';
    draft: string | null;
    slides: string | null;
    format: string | null;
    /** Le post court se copie ; les autres écrits se lisent, l'article avec son fichier du site. */
    copiable: boolean;
    datePublication?: string | null;
}> = ({ sorte, draft, slides, format, copiable, datePublication }) => {
    const script = useScript(sorte === 'video' ? draft : null, format);
    if (sorte === 'video' || sorte === 'video-sans-script') {
        return (
            <div className="flex flex-wrap gap-5 items-start">
                <div className="w-[135px] h-[240px] shrink-0 rounded-xl bg-dark-bg text-white flex items-center justify-center p-3 text-center">
                    <p className="font-display italic text-sm leading-snug">
                        {script ? texteAffiche(script.reel.sequences[0]?.voix ?? '') : 'La vidéo exportée'}
                    </p>
                </div>
                <div className="flex-1 min-w-[220px]">
                    {script?.reel.legende
                        ? <CarrouselLegende legende={script.reel.legende as any} />
                        : <p className="text-sm text-second">La vidéo part depuis le fichier exporté.</p>}
                </div>
            </div>
        );
    }
    if (sorte === 'carrousel' && slides) {
        const legende = parseBodyJson(slides)?.legende ?? parseBodyJson(draft ?? '')?.legende;
        return (
            <div className="space-y-4">
                <VignettesSlides slides={slides} petites />
                <CarrouselLegende legende={legende} />
            </div>
        );
    }
    if (!draft) return <p className="text-sm text-second">Pas de contenu rédigé.</p>;
    if (copiable) return <CopiePostCourt draft={draft} format={format} />;
    return <BodyRenderer body={draft} datePublication={datePublication ?? undefined} />;
};
