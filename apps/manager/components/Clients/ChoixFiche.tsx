/**
 * Choisir une fiche : la même recherche que l'écran Fiches, en petit. Sert à
 * « venu par une personne », au couple, et à poser un rendez-vous hors d'une
 * fiche. La saisie part dans le corps d'un `POST`, jamais dans une adresse.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Bouton, Champ } from '../charte';
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
      <div className="font-charte">
        <p className="mb-1 text-secondaire font-semibold">{label}</p>
        <div className="flex h-11 items-center justify-between gap-2 rounded-controle border border-bord bg-bas px-3 md:h-10">
          <span className="truncate font-semibold">{valeur.prenom} {valeur.nom}</span>
          <Bouton taille="petit" intention="souligne" onClick={() => onChange(null)} aria-label={`Retirer ${valeur.prenom} ${valeur.nom}`}>Retirer</Bouton>
        </div>
      </div>
    );
  }

  return (
    <div className="font-charte">
      <Champ
        id={id}
        label={label}
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Chercher une fiche"
        autoComplete="off"
      />
      {erreur && <p className="mt-1 text-secondaire text-sens-erreur">{erreur}</p>}
      {resultats.length > 0 && (
        <ul className="mt-1 overflow-hidden rounded-controle border border-bord bg-surface">
          {resultats.map((f, i) => (
            <li key={f.id} className={i ? 'border-t border-bord' : ''}>
              <button
                type="button"
                onClick={() => { onChange({ id: f.id, prenom: f.prenom, nom: f.nom }); setQ(''); }}
                className="w-full px-3 py-2 text-left hover:bg-survole outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-marque"
              >
                {f.prenom} {f.nom}
                {f.ville && <span className="text-secondaire text-second"> · {f.ville}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ChoixFiche;
