import React from 'react';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format, isSameMonth, isSameDay, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ContentItem, ContentStatus } from '../types';
import { STATUS_COLORS } from '../constants';

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
    <div className="h-full flex flex-col bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 transition-colors">
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-800">
        <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100 capitalize">
          {format(currentMonth, 'MMMM yyyy', { locale: fr })}
        </h2>
        <div className="flex gap-2">
            <button 
                onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                className="p-1 px-3 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-md text-sm font-medium text-gray-700 dark:text-slate-300 transition-colors"
            >
                ←
            </button>
            <button 
                onClick={() => setCurrentMonth(today)}
                className="p-1 px-3 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900/50 rounded-md text-sm font-medium transition-colors"
            >
                Aujourd'hui
            </button>
            <button 
                onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                className="p-1 px-3 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-md text-sm font-medium text-gray-700 dark:text-slate-300 transition-colors"
            >
                →
            </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950">
        {weekDays.map(day => (
          <div key={day} className="py-2 text-center text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
            {day}
          </div>
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
                min-h-[100px] border-b border-r border-gray-200 dark:border-slate-800 p-2 relative transition-colors
                ${!isSelectedMonth ? 'bg-gray-50/50 dark:bg-slate-950/50 text-gray-400 dark:text-slate-600' : 'bg-white dark:bg-slate-900'}
                ${isToday ? 'bg-blue-50/30 dark:bg-blue-900/20' : ''}
              `}
            >
              <div className={`
                text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full transition-colors
                ${isToday ? 'bg-brand-600 text-white' : 'text-gray-700 dark:text-slate-300'}
              `}>
                {format(day, dateFormat)}
              </div>
              
              <div className="space-y-1 overflow-y-auto max-h-[80px] custom-scrollbar">
                {dayItems.map(item => (
                    <div 
                        key={item.id}
                        onClick={() => onItemClick(item)}
                        className={`
                            text-[10px] p-1 rounded border truncate cursor-pointer hover:opacity-80 transition-colors
                            ${STATUS_COLORS[item.status]}
                        `}
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
  );
};

export default CalendarView;