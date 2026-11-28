import React from 'react';
import { ListOrdered } from 'lucide-react';
import type { EtapeCourante } from '@luminose/editorial';
import { ContentItem, ContentStatus, Serie } from '../../types';
import { BarreProgression, CLASSES_SURTITRE, Etiquette } from '../ui';

/**
 * Le panneau Série (SPEC §13.12) : à gauche d'une publication, d'où qu'on
 * l'ouvre. Le plan d'abord, puis chaque publication dans l'ordre de la série,
 * avec sa barre et son étape : on passe de l'une à l'autre sans repasser par
 * une liste, et chacune s'ouvre sur SON étape courante.
 */
export interface PanneauSerieProps {
    serie: Serie;
    /** Les publications, dans l'ordre du plan. */
    publications: ContentItem[];
    etapes: Record<string, EtapeCourante>;
    /** La publication ouverte ; `null` : le plan. */
    active: string | null;
    onPlan: () => void;
    onOuvrir: (item: ContentItem) => void;
}

export const PanneauSerie: React.FC<PanneauSerieProps> = ({ serie, publications, etapes, active, onPlan, onOuvrir }) => (
    // Sur téléphone, le panneau s'efface : la place manque, et le plan reste à un clic du retour.
    <nav aria-label={`Série ${serie.titre}`} className="hidden md:block w-[272px] shrink-0 min-h-0 overflow-y-auto border-r border-bord bg-fond/60 px-3 py-4 space-y-1">
        <div className="px-2 pb-3 space-y-1">
            <Etiquette>Série</Etiquette>
            <p className="text-sm font-bold text-texte leading-snug">{serie.titre}</p>
        </div>
        <button
            type="button"
            onClick={onPlan}
            aria-current={active === null ? 'page' : undefined}
            className={`w-full h-12 flex items-center gap-3 px-3 rounded-[10px] text-sm font-semibold transition-colors ${
                active === null
                    ? 'bg-surface border border-bord shadow-xs text-texte'
                    : 'text-second hover:bg-surface'
            }`}
        >
            <ListOrdered className="w-4 h-4 shrink-0" /> Plan de la série
        </button>
        {publications.map((item, i) => {
            const etape = etapes[item.id];
            const ici = item.id === active;
            return (
                <button
                    key={item.id}
                    type="button"
                    onClick={() => onOuvrir(item)}
                    aria-current={ici ? 'page' : undefined}
                    className={`w-full flex items-start gap-3 px-3 py-2 rounded-[10px] text-left transition-colors ${
                        ici
                            ? 'bg-surface border border-bord shadow-xs'
                            : 'border border-transparent hover:bg-surface'
                    }`}
                >
                    <span className={`w-[26px] h-[26px] shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                        ici ? 'bg-marque text-sur-marque' : 'border border-bord text-second'
                    }`}>
                        {item.seriePosition ?? i + 1}
                    </span>
                    <span className="flex-1 min-w-0 space-y-1">
                        <span className="block text-sm font-semibold text-texte truncate">{item.title || 'Sans titre'}</span>
                        {etape && <BarreProgression segments={etape.progression.segments} complet={etape.progression.complet} fine />}
                        <span className={`block text-xs truncate ${etape?.progression.complet ? 'text-succes' : 'text-second'}`}>{etape?.libelle}</span>
                    </span>
                </button>
            );
        })}
    </nav>
);

/**
 * À la place du sélecteur d'étape, sur un plan de série : où en est la série.
 * Un segment par publication — publiée, commencée, à venir. Il ne se clique
 * pas : c'est un état, pas une navigation.
 */
export const AvancementSerie: React.FC<{ publications: ContentItem[]; etapes: Record<string, EtapeCourante> }> = ({ publications, etapes }) => {
    const publiees = publications.filter(p => p.status === ContentStatus.PUBLISHED).length;
    return (
        <div className="w-full md:w-[320px] h-[52px] shrink-0 flex flex-col justify-center gap-1.5 px-3 rounded-[10px] border border-bord bg-fond">
            <span className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-bold text-texte">Avancement</span>
                <span className={CLASSES_SURTITRE}>{publiees} sur {publications.length} publiée{publiees > 1 ? 's' : ''}</span>
            </span>
            <span className="flex gap-[3px]">
                {publications.length === 0 && <span className="flex-1 h-[5px] rounded-full bg-bord" />}
                {publications.map(p => {
                    const faits = etapes[p.id]?.progression.segments.filter(s => s === 'fait').length ?? 0;
                    const couleur = p.status === ContentStatus.PUBLISHED ? 'bg-succes'
                        : faits > 0 ? 'bg-marque/45 ' : 'bg-bord';
                    return <span key={p.id} className={`flex-1 h-[5px] rounded-full ${couleur}`} />;
                })}
            </span>
        </div>
    );
};
