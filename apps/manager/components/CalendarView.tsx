import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format, isSameMonth, isSameDay, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ContentItem } from '../types';
import { Bouton, Etiquette, TitreSection } from './ui';

/**
 * Le calendrier des Publiés (SPEC §13) : ce qui est sorti, et ce qui est
 * programmé. Chaque publication est une puce qu'on ouvre.
 */
interface CalendarViewProps {
  items: ContentItem[];
  onItemClick: (item: ContentItem) => void;
}

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const CalendarView: React.FC<CalendarViewProps> = ({ items, onItemClick }) => {
  const today = new Date();
  const [mois, setMois] = React.useState(today);

  const debut = startOfMonth(mois);
  const jours = eachDayOfInterval({
    start: startOfWeek(debut, { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(debut), { weekStartsOn: 1 }),
  });

  const duJour = (jour: Date) => items.filter(item => !!item.scheduledDate && isSameDay(parseISO(item.scheduledDate), jour));

  return (
    <div className="flex flex-col bg-white dark:bg-dark-surface rounded-xl shadow-xs border border-brand-border dark:border-dark-sec-border overflow-hidden">
      <TitreSection
        className="p-4 border-b border-brand-border dark:border-dark-sec-border capitalize"
        titre={format(mois, 'MMMM yyyy', { locale: fr })}
        action={<>
          <Bouton taille="grand" className="w-10 px-0" title="Mois précédent" aria-label="Mois précédent"
            onClick={() => setMois(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}>
            <ChevronLeft />
          </Bouton>
          <Bouton taille="grand" onClick={() => setMois(today)}>Aujourd'hui</Bouton>
          <Bouton taille="grand" className="w-10 px-0" title="Mois suivant" aria-label="Mois suivant"
            onClick={() => setMois(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}>
            <ChevronRight />
          </Bouton>
        </>}
      />
      <div className="overflow-x-auto">
        {/* Une largeur minimale : sur téléphone, le calendrier défile plutôt que de s'écraser. */}
        <div className="min-w-[800px]">
          <div className="grid grid-cols-7 border-b border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg">
            {JOURS.map(jour => <Etiquette as="div" className="py-2 text-center" key={jour}>{jour}</Etiquette>)}
          </div>
          <div className="grid grid-cols-7">
            {jours.map(jour => {
              const publications = duJour(jour);
              const duMois = isSameMonth(jour, debut);
              const aujourdhui = isSameDay(jour, today);
              return (
                <div
                  key={jour.toString()}
                  className={`min-h-[104px] border-b border-r border-brand-border dark:border-dark-sec-border p-2 space-y-1 ${
                    duMois ? 'bg-white dark:bg-dark-surface' : 'bg-brand-light/50 dark:bg-dark-bg/50'
                  }`}
                >
                  <div className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                    aujourdhui ? 'bg-brand-main text-white dark:bg-white dark:text-brand-main'
                      : duMois ? 'text-brand-main dark:text-dark-text' : 'text-brand-main/30 dark:text-dark-text/30'
                  }`}>
                    {format(jour, 'd')}
                  </div>
                  {publications.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onItemClick(item)}
                      title={item.title}
                      className="block w-full text-left truncate rounded-full px-2 py-0.5 text-micro font-semibold bg-succes/10 text-succes hover:bg-succes/20 transition-colors"
                    >
                      {item.title || 'Sans titre'}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarView;
