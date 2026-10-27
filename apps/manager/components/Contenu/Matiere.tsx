import React, { useState } from 'react';
import { Layers, MoreHorizontal } from 'lucide-react';
import { Bouton, CLASSES_CHAMP, Champ, Etiquette, Menu, type EntreeMenu } from '../ui';
import { EnCours } from '../Feedback';
import { RichTextarea } from '../RichTextarea';
import { TARGET_FORMAT_VALUES } from '../../types';

/**
 * La matière : ce que le fil produit, sur fond blanc, à droite (SPEC §13.9).
 *
 * Son en-tête porte UNE action principale, toujours au même endroit, et un
 * « ⋯ » pour le reste. Une action indisponible reste visible à 40 %, avec sa
 * raison en info-bulle : elle dit ce qui manque au lieu de disparaître.
 */

export interface ActionMatiere {
    libelle: string;
    onClick: () => void;
    desactive?: boolean;
    raison?: string;
    enCours?: boolean;
    libelleEnCours?: string;
    icone?: React.ReactNode;
}

export const EnteteMatiere: React.FC<{
    nom: string;
    sousTitre?: string | null;
    principale?: ActionMatiere | null;
    autres?: EntreeMenu[];
}> = ({ nom, sousTitre, principale, autres = [] }) => {
    const [menu, setMenu] = useState(false);
    return (
        <div className="h-[60px] shrink-0 flex items-center gap-3 px-7 border-b border-brand-border dark:border-dark-sec-border">
            <div className="flex-1 min-w-0 flex items-baseline gap-2">
                <span className="text-sm font-bold text-brand-main dark:text-white">{nom}</span>
                {sousTitre && <span className="text-xs text-brand-main/60 dark:text-dark-text/60 truncate">{sousTitre}</span>}
            </div>
            {principale && (
                <span title={principale.desactive ? principale.raison : undefined}>
                    <Bouton taille="grand" intention="principale" posee disabled={principale.desactive || principale.enCours} onClick={principale.onClick}>
                        {principale.enCours ? <EnCours label={principale.libelleEnCours ?? principale.libelle} /> : <>{principale.icone}{principale.libelle}</>}
                    </Bouton>
                </span>
            )}
            {autres.length > 0 && (
                <Menu ouvert={menu} onFermer={() => setMenu(false)} entrees={autres} largeur={260}>
                    <Bouton taille="grand" className="w-10 px-0" aria-label="Autres actions" title="Autres actions" onClick={() => setMenu(m => !m)}>
                        <MoreHorizontal />
                    </Bouton>
                </Menu>
            )}
        </div>
    );
};

/** Un état vide, en pointillé : ce qui viendra ici, et d'où. */
export const MatiereVide: React.FC<{ titre: string; texte: string }> = ({ titre, texte }) => (
    <div className="rounded-xl border border-dashed border-brand-border dark:border-dark-sec-border p-6 text-center space-y-1">
        <p className="text-sm font-semibold text-brand-main dark:text-white">{titre}</p>
        <p className="text-xs text-brand-main/70 dark:text-dark-text/70 text-balance">{texte}</p>
    </div>
);

/**
 * L'ouverture : les notes et le format, modifiables jusqu'à l'ouverture de
 * l'atelier — ensuite, le Coach a calibré sa conversation sur ce format.
 */
export const MatiereOuverture: React.FC<{
    notes: string;
    onNotes: (notes: string) => void;
    format: string | null;
    onFormat: (format: string) => void;
    verrouille: boolean;
    vide: { titre: string; texte: string };
}> = ({ notes, onNotes, format, onFormat, verrouille, vide }) => (
    <div className="max-w-3xl space-y-4">
        <div className="rounded-xl border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface p-5 space-y-4">
            <div>
                <Etiquette className="mb-1">Notes</Etiquette>
                <div className="rounded-lg border border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg focus-within:border-brand-main dark:focus-within:border-white transition-colors">
                    <RichTextarea value={notes} onChange={onNotes} className="w-full min-h-[140px] p-3 text-sm" placeholder="Vos notes brutes, ce que vous voulez dire, ce qui vous a fait penser à ce sujet…" />
                </div>
            </div>
            <div>
                <Etiquette as="label" htmlFor="format-ouverture" className="mb-1">Format</Etiquette>
                <select
                    id="format-ouverture"
                    value={format ?? ''}
                    disabled={verrouille}
                    onChange={(e) => onFormat(e.target.value)}
                    className={`${CLASSES_CHAMP} h-11 w-auto min-w-[240px] cursor-pointer`}
                >
                    {!format && <option value="">Choisir un format…</option>}
                    {TARGET_FORMAT_VALUES.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <p className="mt-1 text-xs text-brand-main/60 dark:text-dark-text/60">
                    {verrouille ? 'L’atelier est ouvert : le format ne change plus.' : 'Modifiable jusqu’à l’ouverture de l’atelier.'}
                </p>
            </div>
        </div>
        <MatiereVide {...vide} />
    </div>
);

/**
 * Le bloc « Publier » : les plateformes, la date, le geste — et, une fois
 * publié, la porte des séries, parce qu'un contenu qui a marché peut devenir
 * le pilier de la suite.
 */
export const BlocPublier: React.FC<{
    plateformes: string[];
    publie: boolean;
    libellePublication: string | null;
    dateInitiale: string | null;
    onPublier: (date: string) => void;
    onRepasserEnEcriture: () => void;
    onDecliner?: () => void;
    occupe?: boolean;
}> = ({ plateformes, publie, libellePublication, dateInitiale, onPublier, onRepasserEnEcriture, onDecliner, occupe }) => {
    const [date, setDate] = useState(() => (dateInitiale ? dateInitiale.slice(0, 10) : new Date().toISOString().slice(0, 10)));
    return (
        <div className="w-full max-w-[340px] rounded-xl border border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg p-5 space-y-4 self-start">
            <Etiquette forme="entete">Publier</Etiquette>
            {plateformes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {plateformes.map(p => <Etiquette key={p} as="span" forme="pastille">{p}</Etiquette>)}
                </div>
            )}
            {publie ? (
                <p className="text-sm font-semibold text-succes">{libellePublication}</p>
            ) : (
                <>
                    <Champ label="Publié le" id="date-publication" type="date" taille="grand" value={date} onChange={(e) => setDate((e.target as HTMLInputElement).value)} />
                    <Bouton taille="grand" intention="principale" ton="succes" className="w-full" disabled={!date || occupe} onClick={() => onPublier(date)}>
                        Marquer publié
                    </Bouton>
                </>
            )}
            <Bouton taille="petit" intention="discrete" disabled={occupe} onClick={onRepasserEnEcriture}>Repasser en écriture</Bouton>
            {onDecliner && (
                <div className="pt-3 border-t border-brand-border dark:border-dark-sec-border space-y-2">
                    <p className="text-xs text-brand-main/70 dark:text-dark-text/70">Ce contenu peut devenir le pilier d’une série.</p>
                    <Bouton taille="grand" onClick={onDecliner}><Layers /> Décliner en série</Bouton>
                </div>
            )}
        </div>
    );
};
