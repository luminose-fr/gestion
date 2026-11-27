/**
 * Choisir une fiche : la même recherche que l'écran Fiches, en petit. Sert à
 * « venu par une personne », au couple, et à poser un rendez-vous hors d'une
 * fiche. La saisie part dans le corps d'un `POST`, jamais dans une adresse.
 */
import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Bouton, Champ, Etiquette } from '../ui';
import * as Clients from '../../services/clientsService';
import type { LigneFiche } from '../../types-clients';

export type FicheChoisie = { id: string; prenom: string; nom: string };

export const ChoixFiche: React.FC<{
  valeur: FicheChoisie | null;
  onChange: (fiche: FicheChoisie | null) => void;
  label: string;
  id: string;
  /** Une fiche à ne pas proposer : celle qu'on modifie, pour qu'elle ne se désigne pas elle-même. */
  sauf?: string;
  autoFocus?: boolean;
}> = ({ valeur, onChange, label, id, sauf, autoFocus }) => {
  const [q, setQ] = useState('');
  const [resultats, setResultats] = useState<LigneFiche[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const demande = useRef(0);

  useEffect(() => {
    if (!q.trim()) { setResultats([]); return; }
    const numero = ++demande.current;
    const minuterie = setTimeout(() => {
      Clients.rechercherFiches(q, 0)
        .then((r) => { if (numero === demande.current) { setResultats(r.fiches.filter((f) => f.id !== sauf).slice(0, 8)); setErreur(null); } })
        .catch((e) => { if (numero === demande.current) setErreur(e instanceof Error ? e.message : String(e)); });
    }, 250);
    return () => clearTimeout(minuterie);
  }, [q, sauf]);

  if (valeur) {
    return (
      <div>
        <Etiquette className="mb-1">{label}</Etiquette>
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg">
          <span className="text-sm font-semibold text-brand-main dark:text-white truncate">{valeur.prenom} {valeur.nom}</span>
          <Bouton taille="petit" intention="discrete" onClick={() => onChange(null)} aria-label={`Retirer ${valeur.prenom} ${valeur.nom}`}>
            <X /> Retirer
          </Bouton>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Champ
        id={id}
        label={label}
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => setQ((e.target as HTMLInputElement).value)}
        placeholder="Chercher une fiche"
        autoComplete="off"
      />
      {erreur && <p className="mt-1 text-xs text-erreur">{erreur}</p>}
      {resultats.length > 0 && (
        <ul className="mt-1 rounded-lg border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface divide-y divide-brand-border dark:divide-dark-sec-border">
          {resultats.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => { onChange({ id: f.id, prenom: f.prenom, nom: f.nom }); setQ(''); }}
                className="ui-list-action w-full text-left px-3 py-2 text-sm text-brand-main dark:text-white hover:bg-survol dark:hover:bg-dark-sec-bg"
              >
                {f.prenom} {f.nom}
                {f.ville && <span className="text-xs text-brand-main dark:text-dark-text"> · {f.ville}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ChoixFiche;
