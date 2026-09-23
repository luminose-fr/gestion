import React from 'react';
import { X, AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useEscapeClose } from './hooks/useEscapeClose';
import { EnCours } from './Feedback';
import { Bouton, CLASSES_TITRE } from './ui';

// --- TYPES ---
interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: 'error' | 'success' | 'info';
}

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
  autoClose?: boolean;
}

// --- COMPONENTS ---

export const AlertModal: React.FC<AlertModalProps> = ({ isOpen, onClose, title, message, type = 'info' }) => {
  useEscapeClose(isOpen, onClose);
  if (!isOpen) return null;

  const getIcon = () => {
    switch(type) {
      case 'error': return <AlertCircle className="w-6 h-6 text-erreur" />;
      case 'success': return <CheckCircle2 className="w-6 h-6 text-succes" />;
      default: return <AlertCircle className="w-6 h-6 text-brand-main" />;
    }
  };

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-dark-surface w-full max-w-sm rounded-xl shadow-lg border border-brand-border dark:border-dark-sec-border p-6 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-brand-main/60 hover:text-brand-main dark:hover:text-dark-text">
          <X className="w-5 h-5" />
        </button>
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 p-3 bg-brand-light dark:bg-dark-bg rounded-full">
            {getIcon()}
          </div>
          <h3 className={`${CLASSES_TITRE} mb-2`}>{title}</h3>
          <p className="text-sm text-brand-main/70 dark:text-dark-text/70 mb-6">{message}</p>
          <Bouton onClick={onClose} intention="principale" className="w-full">
            Compris
          </Bouton>
        </div>
      </div>
    </div>
  );
};

export const ConfirmModal: React.FC<ConfirmModalProps> = ({ 
  isOpen, onClose, onConfirm, title, message, confirmLabel = "Confirmer", isDestructive = false, isLoading = false, autoClose = true
}) => {
  useEscapeClose(isOpen, onClose, isLoading);
  if (!isOpen) return null;

  const handleConfirm = () => {
      onConfirm();
      if (autoClose) {
          onClose();
      }
  };

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in" onClick={isLoading ? undefined : onClose}>
      <div className="bg-white dark:bg-dark-surface w-full max-w-sm rounded-xl shadow-lg border border-brand-border dark:border-dark-sec-border p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4 text-brand-main dark:text-white">
          <AlertTriangle className={`w-6 h-6 ${isDestructive ? 'text-erreur' : 'text-alerte'}`} />
          <h3 className={CLASSES_TITRE}>{title}</h3>
        </div>
        <p className="text-sm text-brand-main/70 dark:text-dark-text/70 mb-6 leading-relaxed">
          {message}
        </p>
        <div className="flex justify-end gap-3">
          <Bouton
            onClick={onClose}
            disabled={isLoading}
            intention="discrete">
            Annuler
          </Bouton>
          <Bouton
            onClick={handleConfirm}
            disabled={isLoading}
            intention="principale"
            ton={isDestructive ? 'erreur' : 'neutre'}
            posee
          >
            {/* Le libellé RESTE : « ... » effaçait le seul mot qui disait
                ce qu'on était en train de confirmer. */}
            {isLoading ? <EnCours label={`${confirmLabel}…`} taille="md" /> : confirmLabel}
          </Bouton>
        </div>
      </div>
    </div>
  );
};

// --- HELPER CHAR COUNTER ---
export const CharCounter: React.FC<{ current: number, max: number }> = ({ current, max }) => {
  const isClose = current > max * 0.9;
  const isOver = current > max;
  
  return (
    <div className={`text-micro text-right mt-1 font-semibold transition-colors ${
      isOver ? 'text-erreur' : isClose ? 'text-brand-main/60' : 'text-brand-main/60'
    }`}>
      {current}/{max}
    </div>
  );
};
