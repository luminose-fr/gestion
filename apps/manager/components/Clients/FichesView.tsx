/**
 * Les fiches (SPEC §15.4) : un champ de recherche large, qui a le focus à
 * l'ouverture, et la liste qui se met à jour pendant la frappe. La recherche
 * part dans le corps d'un `POST` (§15.2, règle 3) : rien de ce qu'on tape
 * n'entre dans une adresse.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Bouton, Carte, Champ, ecran } from '../ui';
import * as Clients from '../../services/clientsService';
import type { LigneFiche } from '../../types-clients';
import { aller, dateCourte, EtatLecture, lectureEchouee, Vide, type Lecture } from './commun';

const ATTENTE_FRAPPE_MS = 250;

const LigneDeFiche: React.FC<{ fiche: LigneFiche }> = ({ fiche }) => {
  const seance = fiche.prochaineSeance
    ? `Prochaine : ${dateCourte(fiche.prochaineSeance)}`
    : fiche.derniereSeance ? `Dernière : ${dateCourte(fiche.derniereSeance)}` : null;
  return (
    <li>
      <a
        href={`#clients/${encodeURIComponent(fiche.id)}`}
        className="ui-list-action flex items-center justify-between gap-3 px-4 py-3 hover:bg-survol dark:hover:bg-dark-sec-bg"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-brand-main dark:text-white truncate">{fiche.prenom} {fiche.nom}</span>
          <span className="block text-xs text-brand-main dark:text-dark-text truncate">{fiche.ville ?? 'Ville non renseignée'}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-xs font-semibold text-brand-main dark:text-white tabular-nums">
            {fiche.nbSeances} séance{fiche.nbSeances > 1 ? 's' : ''}
          </span>
          {seance && <span className="block text-xs text-brand-main dark:text-dark-text">{seance}</span>}
        </span>
      </a>
    </li>
  );
};

export const FichesView: React.FC = () => {
  const [q, setQ] = useState('');
  const [lecture, setLecture] = useState<Lecture<{ fiches: LigneFiche[]; page: number; suite: boolean }>>({ phase: 'chargement' });
  const [suiteEnCours, setSuiteEnCours] = useState(false);
  const champ = useRef<HTMLInputElement>(null);
  const demande = useRef(0);

  useEffect(() => { champ.current?.focus(); }, []);

  useEffect(() => {
    const numero = ++demande.current;
    const minuterie = setTimeout(() => {
      Clients.rechercherFiches(q, 0)
        // Seule la réponse à la dernière frappe compte : une réponse lente n'écrase pas une plus récente.
        .then((r) => { if (numero === demande.current) setLecture({ phase: 'prete', donnees: r }); })
        .catch((e) => { if (numero === demande.current) setLecture(lectureEchouee(e)); });
    }, q ? ATTENTE_FRAPPE_MS : 0);
    return () => clearTimeout(minuterie);
  }, [q]);

  const afficherLaSuite = async () => {
    if (lecture.phase !== 'prete') return;
    setSuiteEnCours(true);
    try {
      const r = await Clients.rechercherFiches(q, lecture.donnees.page + 1);
      setLecture({ phase: 'prete', donnees: { ...r, fiches: [...lecture.donnees.fiches, ...r.fiches] } });
    } catch (e) {
      setLecture(lectureEchouee(e));
    } finally {
      setSuiteEnCours(false);
    }
  };

  return (
    <div className={`${ecran('liste')} space-y-4`}>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-brand-main dark:text-dark-text pointer-events-none" />
          <Champ
            ref={champ}
            taille="grand"
            type="search"
            value={q}
            onChange={(e) => setQ((e.target as HTMLInputElement).value)}
            placeholder="Chercher un nom, un prénom, une adresse e-mail"
            aria-label="Chercher une fiche"
            className="pl-9"
          />
        </div>
        <Bouton taille="grand" intention="principale" posee onClick={() => aller('clients/nouvelle')}>
          <Plus /> Nouvelle fiche
        </Bouton>
      </div>

      {lecture.phase !== 'prete' ? <EtatLecture lecture={lecture} /> : (
        <>
          {lecture.donnees.fiches.length === 0 ? (
            <Vide>{q ? 'Aucune fiche ne répond à cette recherche.' : 'Aucune fiche pour l’instant.'}</Vide>
          ) : (
            <Carte densite="tableau">
              <ul className="divide-y divide-brand-border dark:divide-dark-sec-border">
                {lecture.donnees.fiches.map((f) => <LigneDeFiche key={f.id} fiche={f} />)}
              </ul>
            </Carte>
          )}
          {lecture.donnees.suite && (
            <div className="flex justify-center">
              <Bouton intention="secondaire" onClick={afficherLaSuite} disabled={suiteEnCours}>
                {suiteEnCours ? 'Lecture…' : 'Afficher la suite'}
              </Bouton>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default FichesView;
