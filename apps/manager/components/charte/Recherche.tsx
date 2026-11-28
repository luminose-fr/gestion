/**
 * Rechercher (⌘K) — refonte de la console, lot 7 (docs/refonte/01, §3, « Les
 * actions de partout » ; maquettes Recherche et RechercheEditorial).
 *
 * Aller à un écran, lancer une action, trouver une personne ou un contenu.
 *
 * Deux règles de confidentialité, qui sont des contraintes et pas des choix
 * d'affichage :
 * - **Les personnes ne se cherchent que depuis la pratique.** Ouverte depuis
 *   l'éditorial (Contenus, Corpus), la recherche n'interroge pas la base des
 *   clients du tout : aucune requête ne part. Depuis Aujourd'hui, les écrans et
 *   les contenus des deux métiers sont proposés (02, T15) — la règle protège
 *   les noms, pas la navigation.
 * - **Aucun historique.** Rien n'est gardé d'une ouverture à l'autre, ni en
 *   mémoire, ni dans le navigateur ; la saisie s'efface à la fermeture.
 */
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import * as Clients from '../../services/clientsService';
import type { LigneFiche } from '../../types-clients';
import { Etiquette, Secondaire } from './index';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export type Resultat = { cle: string; nom: string; detail?: string; agir: () => void };
export type ContenuCherchable = { id: string; titre: string; detail: string };

/** Sans accents, en minuscules : « Séance » se trouve en tapant « seance ». */
const plier = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export const Recherche: React.FC<{
  ouverte: boolean;
  onFermer: () => void;
  /** Depuis la pratique : les personnes se cherchent. Depuis l'éditorial : jamais. */
  personnes: boolean;
  /** Les écrans et les actions, déjà filtrés selon le métier où l'on est. */
  ecrans: Resultat[];
  actions: (q: string) => Resultat[];
  contenus: ContenuCherchable[];
  onOuvrirContenu: (id: string) => void;
  onOuvrirFiche: (id: string) => void;
}> = ({ ouverte, onFermer, personnes, ecrans, actions, contenus, onOuvrirContenu, onOuvrirFiche }) => {
  const ref = useRef<HTMLDialogElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const titre = useId();
  const [q, setQ] = useState('');
  const [fiches, setFiches] = useState<LigneFiche[]>([]);
  const [actif, setActif] = useState(0);
  const demande = useRef(0);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (ouverte && !d.open) { d.showModal?.(); setTimeout(() => champ.current?.focus(), 0); }
    if (!ouverte && d.open) d.close?.();
    // Aucun historique : chaque ouverture repart de rien.
    if (!ouverte) { setQ(''); setFiches([]); setActif(0); }
  }, [ouverte]);

  useEffect(() => {
    const t = q.trim();
    if (!personnes || t.length < 2) { setFiches([]); return; }
    const numero = ++demande.current;
    const minuterie = setTimeout(() => {
      Clients.rechercherFiches(t, 0)
        .then((r) => { if (numero === demande.current) setFiches(r.fiches.slice(0, 5)); })
        .catch(() => { if (numero === demande.current) setFiches([]); });
    }, 200);
    return () => clearTimeout(minuterie);
  }, [q, personnes]);

  const groupes = useMemo(() => {
    const t = plier(q.trim());
    const correspond = (r: { nom: string; detail?: string }) => !t || plier(`${r.nom} ${r.detail ?? ''}`).includes(t);
    const g: { nom: string; items: Resultat[] }[] = [];
    if (personnes && fiches.length) {
      g.push({ nom: 'Personnes', items: fiches.map((f) => ({
        cle: `fiche-${f.id}`, nom: `${f.prenom} ${f.nom}`, detail: f.ville ?? undefined, agir: () => onOuvrirFiche(f.id),
      })) });
    }
    const a = actions(q.trim()).filter(correspond);
    if (a.length) g.push({ nom: 'Actions', items: a });
    const e = ecrans.filter(correspond);
    if (e.length) g.push({ nom: 'Écrans', items: e });
    if (t.length >= 2) {
      const c = contenus.filter((x) => plier(x.titre).includes(t)).slice(0, 6);
      if (c.length) g.push({ nom: 'Contenus', items: c.map((x) => ({ cle: `contenu-${x.id}`, nom: x.titre, detail: x.detail, agir: () => onOuvrirContenu(x.id) })) });
    }
    return g;
  }, [q, fiches, personnes, ecrans, actions, contenus, onOuvrirContenu, onOuvrirFiche]);

  const tous = groupes.flatMap((g) => g.items);
  useEffect(() => { setActif(0); }, [q]);

  const choisir = (r: Resultat | undefined) => {
    if (!r) return;
    onFermer();
    r.agir();
  };

  const touche = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActif((i) => Math.min(tous.length - 1, i + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActif((i) => Math.max(0, i - 1)); }
    if (e.key === 'Enter') { e.preventDefault(); choisir(tous[actif]); }
  };

  let rang = -1;
  return (
    <dialog ref={ref} aria-labelledby={titre} onClose={onFermer} onCancel={(e) => { e.preventDefault(); onFermer(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}
      className="mx-auto mt-[10vh] mb-auto h-fit max-h-[75vh] w-[calc(100%-2rem)] max-w-[640px] overflow-hidden rounded-carte border border-bord bg-surface p-0 text-texte shadow-fenetre backdrop:bg-voile">
      {ouverte && (
        <div className="flex max-h-[75vh] flex-col font-charte text-courant">
          <div className="flex items-center gap-3 border-b border-bord px-4">
            <label id={titre} htmlFor="recherche-champ" className="sr-only">Rechercher</label>
            <input ref={champ} id="recherche-champ" type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={touche}
              role="combobox" aria-expanded={tous.length > 0} aria-controls="recherche-liste" aria-activedescendant={tous[actif] ? `recherche-${tous[actif].cle}` : undefined}
              placeholder={personnes ? 'Un écran, une action, une personne, un contenu' : 'Un écran, une action, un contenu'}
              autoComplete="off" className="h-14 min-w-0 flex-1 bg-transparent text-champ-tel outline-none placeholder:text-second" />
            <kbd className="rounded-controle border border-bord px-1.5 text-etiquette text-second">esc</kbd>
          </div>
          <div id="recherche-liste" role="listbox" aria-label="Résultats" className="flex-1 overflow-y-auto py-2">
            {groupes.map((g) => (
              <div key={g.nom} role="group" aria-label={g.nom} className="pb-1">
                <Etiquette className="px-4 pb-1 pt-2">{g.nom}</Etiquette>
                {g.items.map((r) => {
                  rang += 1;
                  const i = rang;
                  return (
                    <div key={r.cle} id={`recherche-${r.cle}`} role="option" aria-selected={i === actif}
                      onMouseMove={() => setActif(i)} onClick={() => choisir(r)}
                      className={cx('mx-2 flex cursor-pointer items-center gap-3 rounded-controle px-3 py-2', i === actif && 'bg-actif')}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{r.nom}</span>
                        {r.detail && <span className="block truncate text-secondaire text-second">{r.detail}</span>}
                      </span>
                      {i === actif && <span aria-hidden="true" className="text-secondaire text-second">↵</span>}
                    </div>
                  );
                })}
              </div>
            ))}
            {tous.length === 0 && <p className="px-4 py-3 text-second">Rien ne répond à « {q} ».</p>}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-bord px-4 py-2">
            {!personnes && <Secondaire>Depuis l’éditorial, la recherche ne montre aucune personne.</Secondaire>}
            <Secondaire className="ml-auto">↑ ↓ parcourir · ↵ ouvrir · Aucun historique n’est conservé</Secondaire>
          </div>
        </div>
      )}
    </dialog>
  );
};
