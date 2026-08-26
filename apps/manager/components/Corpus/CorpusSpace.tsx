/**
 * L'espace Corpus — le poste de pilotage du socle Luminose.
 *
 * Trois vues, et l'ordre encode une priorité : **l'état d'abord**, parce que
 * c'est ce qui demande une décision ; les documents ensuite, pour savoir
 * pourquoi une fiche dit ce qu'elle dit ; l'inbox en dernier, parce qu'on y
 * vient quand on a quelque chose à déposer.
 *
 * Une seule des trois écrit quoi que ce soit — l'inbox. Le corpus est une
 * constante du bundle du Worker : l'application ne PEUT pas le modifier, et
 * ce n'est pas une discipline mais une propriété.
 */
import React, { useEffect, useState } from 'react';
import { BookOpen, Gauge, Inbox } from 'lucide-react';
import { fetchInbox } from '../../services/apiService';
import EtatView from './EtatView';
import DocumentsView from './DocumentsView';
import InboxView from './InboxView';

type Vue = 'etat' | 'documents' | 'inbox';

const VUES: Array<{ id: Vue; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'etat', label: 'État', icon: Gauge },
  { id: 'documents', label: 'Documents', icon: BookOpen },
  { id: 'inbox', label: 'Inbox', icon: Inbox },
];

const CorpusSpace: React.FC = () => {
  const [vue, setVue] = useState<Vue>('etat');
  const [enAttente, setEnAttente] = useState<number | null>(null);

  // Le compteur vit ici et non dans l'onglet : une capture en attente doit se
  // voir depuis l'état, sinon l'inbox se remplit sans que personne y retourne.
  useEffect(() => {
    fetchInbox().then((r) => setEnAttente(r.enAttente)).catch(() => setEnAttente(null));
  }, [vue]);

  return (
    <div className="space-y-4">
      <nav className="flex gap-1 border-b border-brand-light dark:border-dark-sec-bg">
        {VUES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setVue(id)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              vue === id
                ? 'border-brand-main text-brand-main dark:border-white dark:text-white'
                : 'border-transparent text-brand-main/50 hover:text-brand-main dark:text-dark-text/50 dark:hover:text-white'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {id === 'inbox' && !!enAttente && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums bg-amber-500/15 text-amber-700 dark:text-amber-400">
                {enAttente}
              </span>
            )}
          </button>
        ))}
      </nav>

      {vue === 'etat' && <EtatView />}
      {vue === 'documents' && <DocumentsView />}
      {vue === 'inbox' && <InboxView />}
    </div>
  );
};

export default CorpusSpace;
