import React from 'react';
import { Calendar, FileText, CheckCircle2, LayoutTemplate } from 'lucide-react';
import { ContentItem, ContentStatus, TargetFormat } from '../types';
import { bodyJsonToText } from '@luminose/editorial';
import { STATUS_COLORS } from '../constants';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Carte, Etiquette } from './ui';

interface ContentCardProps {
  item: ContentItem;
  onClick: (item: ContentItem) => void;
  highlight?: string;
}

const ContentCard: React.FC<ContentCardProps> = ({ item, onClick, highlight }) => {
  const formattedDate = item.scheduledDate 
    ? format(parseISO(item.scheduledDate), 'd MMM', { locale: fr }) 
    : null;

  // Highlight helper
  const getHighlightedText = (text: string, highlightTerm?: string) => {
    if (!highlightTerm || !highlightTerm.trim()) return text;
    
    const escaped = highlightTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    return parts.map((part, i) => 
        part.toLowerCase() === highlightTerm.toLowerCase() ? (
            <span key={i} className="bg-yellow-200 dark:bg-yellow-900/50 text-gray-900 dark:text-white font-semibold rounded-md px-0.5">{part}</span>
        ) : part
    );
  };

  /*
    Plus d'ombre au survol : `shadow-md` est hors échelle. Le survol se lit à la
    bordure, qui passe à la marque — c'est ce que font les lignes de tableau.
  */
  return (
    <Carte
      densite="liste"
      posee
      onClick={() => onClick(item)}
      className="cursor-pointer hover:border-brand-main dark:hover:border-white transition-colors duration-200 group"
    >
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-semibold text-brand-main dark:text-white line-clamp-2 leading-tight group-hover:text-brand-hover dark:group-hover:text-brand-light transition-colors">
          {getHighlightedText(item.title || "Nouvelle idée", highlight)}
        </h4>
      </div>

      <p className="text-xs text-brand-main/60 dark:text-dark-text/60 mb-3 line-clamp-2 min-h-[1.5em]">
        {getHighlightedText(
            bodyJsonToText(item.draft || "") || "Pas de contenu...", highlight)}
      </p>

      <div className="flex items-center justify-between mt-auto gap-2">
        <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
          {item.platforms.length > 0 ? (
             <div className="flex flex-wrap gap-1">
                 {item.platforms.slice(0, 2).map((p, i) => (
                    <Etiquette as="span" forme="pastille" key={i}>
                        {p}
                    </Etiquette>
                 ))}
                 {item.platforms.length > 2 && (
                    <span className="text-micro text-brand-main/40 dark:text-dark-text/40 px-1">+{item.platforms.length - 2}</span>
                 )}
             </div>
          ) : (
            <div className="flex items-center text-xs font-semibold">
                {item.status === ContentStatus.READY ? (
                    <div className="text-succes flex items-center">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Prêt
                    </div>
                ) : (
                    <div className="text-brand-main/40 dark:text-dark-text/40 flex items-center">
                        <FileText className="w-3 h-3 mr-1" />
                        Brouillon
                    </div>
                )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {item.targetFormat && (
            <Etiquette as="span" forme="pastille">
              <LayoutTemplate />{item.targetFormat}
            </Etiquette>
          )}
          {formattedDate && (
            <div className="flex items-center gap-1 text-xs text-brand-main/60 dark:text-dark-text/60 bg-brand-light dark:bg-dark-bg px-2 py-1 rounded-md">
              <Calendar className="w-3 h-3" />
              <span>{formattedDate}</span>
            </div>
          )}
        </div>
      </div>
    </Carte>
  );
};

export default ContentCard;