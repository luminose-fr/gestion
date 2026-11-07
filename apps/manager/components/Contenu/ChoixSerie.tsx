import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Bouton, CLASSES_CHAMP, Champ, Etiquette } from '../ui';
import { EnCours } from '../Feedback';

/**
 * La série d'un contenu, sur sa fiche (SPEC §3.3, v2.36) : en changer, l'en
 * sortir, ou le placer à un autre rang de la sienne.
 *
 * Ce n'est pas un champ qui s'enregistre tout seul comme les notes : c'est un
 * geste, daté dans le fil, qui renumérote deux séries. Il part donc sur un
 * bouton, et la réponse dit ce qui a été fait.
 */

/** Une série qu'on peut choisir, avec ses publications dans l'ordre. */
export interface SerieAuChoix {
    id: string;
    titre: string;
    terminee: boolean;
    publications: { id: string; titre: string }[];
}

export interface CibleDeplacement {
    serieId: string | null;
    position?: number;
    angle?: string | null;
}

export interface ChoixSerieProps {
    contenu: { id: string; serieId: string | null; angle: string | null; publie: boolean };
    series: SerieAuChoix[];
    /** Rend la phrase du geste laissé au fil, ou `null` si seul l'angle a changé. */
    onDeplacer: (cible: CibleDeplacement) => Promise<string | null>;
}

export const ChoixSerie: React.FC<ChoixSerieProps> = ({ contenu, series, onDeplacer }) => {
    const actuelle = series.find(s => s.id === contenu.serieId) ?? null;
    const rangActuel = actuelle ? actuelle.publications.findIndex(p => p.id === contenu.id) + 1 || null : null;

    const [serieId, setSerieId] = useState(contenu.serieId ?? '');
    /** `null` : en dernier. */
    const [position, setPosition] = useState<number | null>(rangActuel);
    const [angle, setAngle] = useState(contenu.angle ?? '');
    const [enCours, setEnCours] = useState(false);
    const [erreur, setErreur] = useState<string | null>(null);
    const [fait, setFait] = useState<string | null>(null);

    // Après un déplacement — d'ici, du plan, ou du serveur MCP —, le formulaire repart de ce qui est.
    useEffect(() => {
        setSerieId(contenu.serieId ?? '');
        setPosition(rangActuel);
        setAngle(contenu.angle ?? '');
    }, [contenu.id, contenu.serieId, rangActuel, contenu.angle]);

    const choisie = series.find(s => s.id === serieId) ?? null;
    const autres = choisie ? choisie.publications.filter(p => p.id !== contenu.id) : [];
    const dernier = autres.length + 1;
    const rang = position === null || position > dernier ? dernier : position;

    const vers = serieId || null;
    const memeSerie = vers === (contenu.serieId ?? null);
    const changePlace = !memeSerie || (vers !== null && rang !== rangActuel);
    const changeAngle = angle !== (contenu.angle ?? '');
    const bloque = contenu.publie || enCours;

    const libelle = vers === null && contenu.serieId ? 'Sortir de la série' : changePlace ? 'Déplacer' : 'Enregistrer l’angle';

    const choisirSerie = (id: string) => {
        setSerieId(id);
        // Revenir à sa série remet son rang ; une autre série l'accueille en dernier.
        setPosition(id === contenu.serieId ? rangActuel : null);
        setErreur(null);
        setFait(null);
    };

    const valider = async () => {
        setEnCours(true);
        setErreur(null);
        setFait(null);
        try {
            const phrase = await onDeplacer({
                serieId: vers,
                ...(vers !== null ? { position: rang } : {}),
                ...(changeAngle ? { angle: angle.trim() || null } : {}),
            });
            setFait(phrase ?? 'Angle enregistré.');
        } catch (e: any) {
            setErreur(e?.message || 'Le déplacement a échoué.');
        } finally {
            setEnCours(false);
        }
    };

    return (
        <div className="rounded-xl border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface p-5 space-y-4">
            <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[240px]">
                    <Etiquette as="label" htmlFor="serie-du-contenu" className="mb-1">Série</Etiquette>
                    <select
                        id="serie-du-contenu"
                        value={serieId}
                        disabled={bloque}
                        onChange={(e) => choisirSerie(e.target.value)}
                        className={`${CLASSES_CHAMP} h-11 cursor-pointer`}
                    >
                        <option value="">Aucune série</option>
                        {series.map(s => (
                            <option key={s.id} value={s.id}>{s.titre}{s.terminee ? ' (terminée)' : ''}</option>
                        ))}
                    </select>
                </div>
                {vers !== null && (
                    <div className="min-w-[240px]">
                        <Etiquette as="label" htmlFor="position-du-contenu" className="mb-1">Position</Etiquette>
                        <select
                            id="position-du-contenu"
                            value={rang}
                            disabled={bloque}
                            onChange={(e) => { setPosition(Number(e.target.value)); setFait(null); }}
                            className={`${CLASSES_CHAMP} h-11 cursor-pointer`}
                        >
                            {Array.from({ length: dernier }, (_, i) => i + 1).map(n => (
                                <option key={n} value={n}>
                                    {n === dernier ? `n° ${n} · en dernier` : `n° ${n} · avant « ${autres[n - 1].titre} »`}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {(vers !== null || contenu.serieId) && (
                <Champ multiligne
                    id="angle-dans-la-serie"
                    label="Angle dans la série"
                    aide="L’angle est relatif à la série : revoyez-le s’il en change."
                    value={angle}
                    disabled={bloque}
                    onChange={(e) => { setAngle(e.target.value); setFait(null); }}
                    placeholder="Ce que CE contenu traite, et que les autres de la série ne traitent pas"
                    className="h-16 resize-none"
                />
            )}

            {contenu.publie ? (
                <p className="text-xs text-brand-main dark:text-dark-text">
                    Publié : sa série fait partie de l’historique de publication, il ne se déplace plus.
                </p>
            ) : (
                <div className="flex flex-wrap items-center gap-3">
                    <Bouton taille="grand" disabled={bloque || (!changePlace && !changeAngle)} onClick={() => void valider()}>
                        {enCours ? <EnCours label="Déplacement…" /> : libelle}
                    </Bouton>
                    {erreur && <p role="alert" className="text-xs font-semibold text-erreur">{erreur}</p>}
                    {fait && (
                        <p role="status" className="ui-feedback flex items-center gap-1.5 text-xs font-semibold text-succes" data-confirme>
                            <Check className="size-3.5 shrink-0" /> {fait}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

export default ChoixSerie;
