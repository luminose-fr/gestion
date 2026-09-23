import React from 'react';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format, isSameMonth, isSameDay, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ContentItem, ContentStatus } from '../types';
import { STATUS_COLORS } from '../constants';
import { Bouton, Etiquette, TitreSection } from './ui';

interface CalendarViewProps {
  items: ContentItem[];
  onItemClick: (item: ContentItem) => void;
}

const CalendarView: React.FC<CalendarViewProps> = ({ items, onItemClick }) => {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = React.useState(today);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const dateFormat = "d";
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  const getItemsForDay = (day: Date) => {
    return items.filter(item => {
      if (!item.scheduledDate) return false;
      return isSameDay(parseISO(item.scheduledDate), day);
    });
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-dark-surface rounded-xl shadow-xs border border-brand-border dark:border-dark-sec-border transition-colors">
      <TitreSection
                className="p-4 border-b border-brand-border dark:border-dark-sec-border shrink-0 capitalize"
                titre={format(currentMonth, 'MMMM yyyy', { locale: fr })}
                action={<>
                    <Bouton taille="petit"
                        onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                    >
                        ←
                    </Bouton>
                    <Bouton taille="petit"
                        onClick={() => setCurrentMonth(today)}
                    >
                        Aujourd'hui
                    </Bouton>
                    <Bouton taille="petit"
                        onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                    >
                        →
                    </Bouton>
                </>}
            />

      <div className="flex-1 overflow-auto">
          {/* Min-width ensures it triggers scroll on mobile instead of squashing */}
          <div className="min-w-[800px] h-full flex flex-col">
              <div className="grid grid-cols-7 border-b border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg">
                {weekDays.map(day => (
                  <Etiquette as="div" className="py-2 text-center" key={day}>
                    {day}
                  </Etiquette>
                ))}
              </div>

              <div className="flex-1 grid grid-cols-7 grid-rows-5 lg:grid-rows-6">
                {days.map((day, dayIdx) => {
                  const dayItems = getItemsForDay(day);
                  const isSelectedMonth = isSameMonth(day, monthStart);
                  const isToday = isSameDay(day, today);

                  return (
                    <div
                      key={day.toString()}
                      className={`
                        min-h-[100px] border-b border-r border-brand-border dark:border-dark-sec-border p-2 relative transition-colors
                        ${!isSelectedMonth ? 'bg-brand-light/50 dark:bg-dark-bg/50 text-brand-main/30 dark:text-dark-text/30' : 'bg-white dark:bg-dark-surface'} ${isToday ? 'bg-brand-light dark:bg-dark-sec-bg' : ''} `}
                    >
                      <div className={`
                        text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full transition-colors
                        ${isToday ? 'bg-brand-main text-white dark:bg-brand-light dark:text-brand-hover' : 'text-brand-main dark:text-dark-text'} `}>
                        {format(day, dateFormat)}
                      </div>
                      
                      <div className="space-y-1 overflow-y-auto max-h-[80px] custom-scrollbar">
                        {dayItems.map(item => (
                            <div 
                                key={item.id}
                                onClick={() => onItemClick(item)}
                                className={`
                                    text-micro p-1 rounded-md border truncate cursor-pointer hover:opacity-80 transition-colors
                                    ${STATUS_COLORS[item.status]} `}
                                title={item.title}
                            >
                                {item.title}
                            </div>
                        ))}
                      </div>
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