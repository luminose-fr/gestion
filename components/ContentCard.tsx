import React from 'react';
import { Calendar, FileText, CheckCircle2 } from 'lucide-react';
import { ContentItem, Platform, ContentStatus } from '../types';
import { STATUS_COLORS } from '../constants';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

interface ContentCardProps {
  item: ContentItem;
  onClick: (item: ContentItem) => void;
  highlight?: string; // New optional prop
}

const ContentCard: React.FC<ContentCardProps> = ({ item, onClick, highlight }) => {
  const formattedDate = item.scheduledDate 
    ? format(parseISO(item.scheduledDate), 'd MMM', { locale: fr }) 
    : null;

  // Highlight helper
  const getHighlightedText = (text: string, highlightTerm?: string) => {
    if (!highlightTerm || !highlightTerm.trim()) return text;
    
    const parts = text.split(new RegExp(`(${highlightTerm})`, 'gi'));
    return parts.map((part, i) => 
        part.toLowerCase() === highlightTerm.toLowerCase() ? (
            <span key={i} className="bg-yellow-200 dark:bg-yellow-900/50 text-gray-900 dark:text-white font-medium rounded px-0.5">{part}</span>
        ) : part
    );
  };

  return (
    <div 
      onClick={() => onClick(item)}
      className={`
        bg-white dark:bg-slate-900 rounded-lg p-4 shadow-sm border border-gray-100 dark:border-slate-800 cursor-pointer 
        hover:shadow-md hover:border-brand-200 dark:hover:border-brand-700 transition-all duration-200 group
      `}
    >
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-semibold text-gray-800 dark:text-slate-100 line-clamp-2 leading-tight group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
          {getHighlightedText(item.title || "Nouvelle idée", highlight)}
        </h4>
      </div>

      <p className="text-xs text-gray-500 dark:text-slate-400 mb-3 line-clamp-2 min-h-[1.5em]">
        {getHighlightedText(item.body || "Pas de contenu...", highlight)}
      </p>

      <div className="flex items-center justify-between mt-auto">
        <div className="flex items-center gap-2 overflow-hidden">
          {item.platforms.length > 0 ? (
             <div className="flex flex-wrap gap-1">
                 {item.platforms.slice(0, 2).map((p, i) => (
                    <span key={i} className="text-[10px] uppercase font-bold text-gray-400 dark:text-slate-500 bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                        {p}
                    </span>
                 ))}
                 {item.platforms.length > 2 && (
                    <span className="text-[10px] text-gray-400 px-1">+{item.platforms.length - 2}</span>
                 )}
             </div>
          ) : (
            <div className="flex items-center text-xs font-medium">
                {item.status === ContentStatus.READY ? (
                    <div className="text-green-600 dark:text-green-400 flex items-center">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Prêt
                    </div>
                ) : (
                    <div className="text-gray-400 dark:text-slate-500 flex items-center">
                        <FileText className="w-3 h-3 mr-1" />
                        Brouillon
                    </div>
                )}
            </div>
          )}
        </div>

        {formattedDate && (
          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-800 px-2 py-1 rounded-md">
            <Calendar className="w-3 h-3" />
            <span>{formattedDate}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContentCard;