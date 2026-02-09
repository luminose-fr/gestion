import React from 'react';
import { X, AlertCircle, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { useEscapeClose } from './hooks/useEscapeClose';

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
      case 'error': return <AlertCircle className="w-6 h-6 text-red-500" />;
      case 'success': return <CheckCircle2 className="w-6 h-6 text-green-500" />;
      default: return <AlertCircle className="w-6 h-6 text-brand-main" />;
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-dark-surface w-full max-w-sm rounded-xl shadow-2xl border border-brand-border dark:border-dark-sec-border p-6 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <X className="w-5 h-5" />
        </button>
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 p-3 bg-brand-light dark:bg-dark-bg rounded-full">
            {getIcon()}
          </div>
          <h3 className="text-lg font-bold text-brand-main dark:text-white mb-2">{title}</h3>
          <p className="text-sm text-brand-main/70 dark:text-dark-text/70 mb-6">{message}</p>
          <button 
            onClick={onClose}
            className="w-full py-2.5 bg-brand-main hover:bg-brand-hover text-white rounded-lg font-medium transition-colors"
          >
            Compris
          </button>
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
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in" onClick={isLoading ? undefined : onClose}>
      <div className="bg-white dark:bg-dark-surface w-full max-w-sm rounded-xl shadow-2xl border border-brand-border dark:border-dark-sec-border p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4 text-brand-main dark:text-white">
          <AlertTriangle className={`w-6 h-6 ${isDestructive ? 'text-red-500' : 'text-yellow-500'}`} />
          <h3 className="text-lg font-bold">{title}</h3>
        </div>
        <p className="text-sm text-brand-main/70 dark:text-dark-text/70 mb-6 leading-relaxed">
          {message}
        </p>
        <div className="flex justify-end gap-3">
          <button 
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-brand-main dark:text-dark-text hover:bg-brand-light dark:hover:bg-dark-bg rounded-lg transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          <button 
            onClick={handleConfirm}
            disabled={isLoading}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors shadow-sm flex items-center gap-2
              ${isDestructive 
                ? 'bg-red-500 hover:bg-red-600' 
                : 'bg-brand-main hover:bg-brand-hover'}
              ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}
            `}
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isLoading ? '...' : confirmLabel}
          </button>
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
    <div className={`text-[10px] text-right mt-1 font-medium transition-colors ${
      isOver ? 'text-red-500' : isClose ? 'text-orange-500' : 'text-gray-400'
    }`}>
      {current}/{max}
    </div>
  );
};
