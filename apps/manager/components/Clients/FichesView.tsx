/**
 * Clients — les fiches (SPEC §15.4 ; refonte de la console, lot 6, maquettes
 * Clients et TelClients). Un champ de recherche large, qui a le focus à
 * l'ouverture (« / » y ramène), et la liste qui se met à jour pendant la
 * frappe. La recherche part dans le corps d'un `POST` (§15.2, règle 3) : rien
 * de ce qu'on tape n'entre dans une adresse. « Nouvelle fiche » est l'action
 * principale ; au survol ou au focus d'une ligne, « Poser un rendez-vous ».
 *
 * La liste ne montre ni notes, ni réponses de santé, ni personne de confiance.
 */
import { Bandeau } from '../charte/bandeau';
import React, { useEffect, useRef, useState } from 'react';
import { Bouton, Carte, Champ, Secondaire } from '../charte';
import * as Clients from '../../services/clientsService';
import type { LigneFiche } from '../../types-clients';
import { aller, dateCourte, EtatLecture, lectureEchouee, type Lecture } from './commun';
import { PoserRendezVous } from './PoserRendezVous';
import type { FicheChoisie } from './ChoixFiche';

const ATTENTE_FRAPPE_MS = 250;

const LigneDeFiche: React.FC<{ fiche: LigneFiche; premiere: boolean; onPoser: (f: FicheChoisie) => void }> = ({ fiche, premiere, onPoser }) => {
  const seance = fiche.prochaineSeance
    ? `Prochaine : ${dateCourte(fiche.prochaineSeance)}`
    : fiche.derniereSeance ? `Dernière : ${dateCourte(fiche.derniereSeance)}` : null;
  return (
    <li className={`group relative flex items-center ${premiere ? '' : 'border-t border-bord'} hover:bg-survole focus-within:bg-survole`}>
      <a href={`#clients/${encodeURIComponent(fiche.id)}`}
        className="flex min-w-0 flex-1 items-center gap-4 px-4 py-2.5 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-marque">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{fiche.prenom} {fiche.nom}</span>
          <span className="block truncate text-secondaire text-second">{fiche.ville ?? 'Ville non renseignée'}</span>
        </span>
        <span className="flex-none text-right">
          <span className="block text-secondaire font-semibold tabular-nums">{fiche.nbSeances} séance{fiche.nbSeances > 1 ? 's' : ''}</span>
          {seance && <span className="block text-secondaire text-second">{seance}</span>}
        </span>
      </a>
      {/* Visible au survol et au focus sur le Mac ; toujours là au doigt, où le survol n'existe pas. */}
      <Bouton taille="petit" intention="borde" className="mr-3 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 md:focus-visible:opacity-100"
        onClick={() => onPoser({ id: fiche.id, prenom: fiche.prenom, nom: fiche.nom })}
        aria-label={`Poser un rendez-vous pour ${fiche.prenom} ${fiche.nom}`}>
        Poser un rendez-vous
      </Bouton>
    </li>
  );
};

export const FichesView: React.FC = () => {
  const [q, setQ] = useState('');
  const [lecture, setLecture] = useState<Lecture<{ fiches: LigneFiche[]; page: number; suite: boolean }>>({ phase: 'chargement' });
  const [suiteEnCours, setSuiteEnCours] = useState(false);
  const [rdv, setRdv] = useState<FicheChoisie | null>(null);
  const champ = useRef<HTMLInputElement>(null);
  const demande = useRef(0);

  useEffect(() => { champ.current?.focus(); }, []);

  // « / » ramène à la recherche, sauf quand on écrit déjà quelque part.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const cible = e.target;
      if (e.key !== '/' || e.metaKey || e.ctrlKey) return;
      if (cible instanceof Element && cible.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      champ.current?.focus();
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, []);

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
    <div className="mx-auto flex max-w-[960px] flex-col gap-4 px-4 py-5 font-charte text-courant text-texte md:px-8 md:py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Champ
          ref={champ}
          className="flex-1"
          label="Chercher une fiche"
          masquerLabel
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nom, e-mail ou téléphone · / pour y revenir"
        />
        <Bandeau actions={<Bouton onClick={() => aller('clients/nouvelle')}>Nouvelle fiche</Bouton>} />
      </div>

      {lecture.phase !== 'prete' ? <EtatLecture lecture={lecture} /> : (
        <>
          {lecture.donnees.fiches.length === 0 ? (
            <Carte className="px-4 py-4"><p>{q ? 'Aucune fiche ne répond à cette recherche.' : 'Aucune fiche pour l’instant.'}</p></Carte>
          ) : (
            <Carte as="div" className="overflow-hidden">
              <ul>{lecture.donnees.fiches.map((f, i) => <LigneDeFiche key={f.id} fiche={f} premiere={i === 0} onPoser={setRdv} />)}</ul>
            </Carte>
          )}
          {lecture.donnees.suite && (
            <div className="flex justify-center">
              <Bouton intention="borde" onClick={afficherLaSuite} disabled={suiteEnCours}>{suiteEnCours ? 'Lecture…' : 'Afficher la suite'}</Bouton>
            </div>
          )}
          {lecture.donnees.fiches.length > 0 && (
            <Secondaire>{lecture.donnees.fiches.length}{lecture.donnees.suite ? ' premières' : ''} personne{lecture.donnees.fiches.length > 1 ? 's' : ''}. La liste ne montre ni notes, ni réponses de santé.</Secondaire>
          )}
        </>
      )}

      {rdv && (
        <PoserRendezVous fiche={rdv} onFermer={() => setRdv(null)}
          onPose={(id) => { setRdv(null); aller(`agenda/${encodeURIComponent(id)}`); }} />
      )}
    </div>
  );
};

export default FichesView;
