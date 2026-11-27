/**
 * Évènements (SPEC §15.4) — un espace au premier niveau depuis la décision du
 * 27/11/2026. À venir, puis passés : nom, date, ville, places libres sur places
 * totales. Un évènement : ses champs (le prix en euros à l'écran, en centimes
 * en base), ses contenus HTML en zones de texte, et ses inscrits — personne,
 * statut, mode de paiement —, avec « Inscrire une personne » et le changement
 * de statut.
 *
 * Les places et la dernière place se décident côté route (§15.2, règle 12) :
 * l'écran affiche le refus tel qu'il est écrit (« Cette journée est complète. »).
 * La publication sur le site n'est pas d'ici.
 */
import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Trash2, UserPlus } from 'lucide-react';
import { Bouton, Carte, Champ, Etiquette, TitreSection, ecran } from '../ui';
import { ConfirmModal } from '../CommonModals';
import * as Clients from '../../services/clientsService';
import type { ChampsEvenement, Evenement, EvenementDetaille, StatutInscription } from '../../types-clients';
import {
  aller, aujourdhui, Avis, centimesDepuis, CLASSES_SELECT, dateCourte, euros, EtatLecture, heure, INSCRIPTIONS, isoDepuis, jourDe,
  messageDe, nomComplet, Pastille, useAdresse, useGardeSaisie, useLecture, Vide,
} from './commun';
import { ChoixFiche, type FicheChoisie } from './ChoixFiche';

const TYPES = [
  { valeur: 'meditation', libelle: 'Méditation' },
  { valeur: 'hypnose', libelle: 'Hypnose' },
  { valeur: 'respiration-holotropique', libelle: 'Respiration holotropique' },
];

const LigneEvenement: React.FC<{ e: Evenement }> = ({ e }) => (
  <li>
    <a href={`#evenements/${encodeURIComponent(e.id)}`} className="ui-list-action flex items-center justify-between gap-3 px-4 py-3 hover:bg-survol dark:hover:bg-dark-sec-bg">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-brand-main dark:text-white truncate">{e.nom}</span>
        <span className="block text-xs text-brand-main dark:text-dark-text">{dateCourte(e.debut)}{e.ville && ` · ${e.ville}`}</span>
      </span>
      <span className="shrink-0 text-right text-xs text-brand-main dark:text-dark-text tabular-nums">
        {e.placesTotales === null
          ? (e.urlInscription ? 'Inscription ailleurs' : 'Places non fixées')
          : <><span className="text-sm font-semibold text-brand-main dark:text-white">{e.placesLibres}</span> libres sur {e.placesTotales}</>}
      </span>
    </a>
  </li>
);

export const ListeEvenements: React.FC = () => {
  const lecture = useLecture(() => Clients.listeEvenements(), []);
  if (lecture.phase !== 'prete') return <div className={ecran('liste')}><EtatLecture lecture={lecture} /></div>;
  const auj = aujourdhui();
  const tous = lecture.donnees.evenements;
  const aVenir = tous.filter((e) => jourDe(e.debut) >= auj).sort((a, b) => a.debut.localeCompare(b.debut));
  const passes = tous.filter((e) => jourDe(e.debut) < auj);
  return (
    <div className={`${ecran('liste')} space-y-4`}>
      <div className="flex justify-end">
        <Bouton taille="grand" intention="principale" posee onClick={() => aller('evenements/nouveau')}><Plus /> Nouvel évènement</Bouton>
      </div>
      {tous.length === 0 && <Vide>Aucun évènement pour l’instant.</Vide>}
      {[['À venir', aVenir], ['Passés', passes]].map(([titre, liste]) => (liste as Evenement[]).length > 0 && (
        <section key={titre as string} className="space-y-2">
          <Etiquette as="h2">{titre as string}</Etiquette>
          <Carte densite="tableau">
            <ul className="divide-y divide-brand-border dark:divide-dark-sec-border">{(liste as Evenement[]).map((e) => <LigneEvenement key={e.id} e={e} />)}</ul>
          </Carte>
        </section>
      ))}
    </div>
  );
};

/** Ce que le formulaire tient : des textes, comme les champs. */
type Saisie = {
  nom: string; type: string; date: string; heureDebut: string; dateFin: string; heureFin: string; ville: string;
  places: string; prix: string; questionnaireRequis: boolean; urlInscription: string; metaDescription: string;
  htmlPermalink: string; htmlProgramme: string; htmlPrix: string; htmlLieuAdresse: string; htmlLieuInstructions: string;
};

const SAISIE_VIDE: Saisie = {
  nom: '', type: 'respiration-holotropique', date: aujourdhui(), heureDebut: '10:00', dateFin: '', heureFin: '17:00', ville: '', places: '', prix: '',
  questionnaireRequis: false, urlInscription: '', metaDescription: '', htmlPermalink: '', htmlProgramme: '', htmlPrix: '', htmlLieuAdresse: '', htmlLieuInstructions: '',
};

const depuis = (e: EvenementDetaille): Saisie => ({
  nom: e.nom, type: e.type ?? '', date: jourDe(e.debut), heureDebut: heure(e.debut), dateFin: e.fin ? jourDe(e.fin) : '', heureFin: e.fin ? heure(e.fin) : '',
  ville: e.ville ?? '', places: e.placesTotales === null ? '' : String(e.placesTotales), prix: e.prixCentimes === null ? '' : String(e.prixCentimes / 100).replace('.', ','),
  questionnaireRequis: e.questionnaireRequis, urlInscription: e.urlInscription ?? '', metaDescription: e.metaDescription ?? '',
  htmlPermalink: e.htmlPermalink ?? '', htmlProgramme: e.htmlProgramme ?? '', htmlPrix: e.htmlPrix ?? '', htmlLieuAdresse: e.htmlLieuAdresse ?? '', htmlLieuInstructions: e.htmlLieuInstructions ?? '',
});

/** La saisie → ce que la route reçoit, ou la raison pour laquelle elle ne se lit pas. */
const versRoute = (s: Saisie): ChampsEvenement & { nom: string; debut: string } | string => {
  if (!s.nom.trim()) return 'Le nom est obligatoire.';
  if (!s.date) return 'La date est obligatoire.';
  const prix = s.prix.trim() ? centimesDepuis(s.prix) : null;
  if (s.prix.trim() && prix === null) return 'Le prix ne se lit pas : un nombre, en euros.';
  const places = s.places.trim() ? Number(s.places) : null;
  if (places !== null && !(Number.isInteger(places) && places >= 0)) return 'Les places : un nombre entier.';
  const texte = (v: string) => (v.trim() ? v : null);
  return {
    nom: s.nom.trim(), type: texte(s.type), debut: isoDepuis(s.date, s.heureDebut || '00:00'),
    fin: s.dateFin || s.heureFin ? isoDepuis(s.dateFin || s.date, s.heureFin || '23:59') : null,
    ville: texte(s.ville), placesTotales: places, prixCentimes: prix, questionnaireRequis: s.questionnaireRequis,
    urlInscription: texte(s.urlInscription), metaDescription: texte(s.metaDescription),
    htmlPermalink: texte(s.htmlPermalink), htmlProgramme: texte(s.htmlProgramme), htmlPrix: texte(s.htmlPrix),
    htmlLieuAdresse: texte(s.htmlLieuAdresse), htmlLieuInstructions: texte(s.htmlLieuInstructions),
  };
};

const FormulaireEvenement: React.FC<{ initiale: Saisie; enregistrer: (s: Saisie) => Promise<void>; libelle: string }> = ({ initiale, enregistrer, libelle }) => {
  const [s, setS] = useState<Saisie>(initiale);
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const modifie = JSON.stringify(s) !== JSON.stringify(initiale);
  useGardeSaisie(modifie && !enCours);
  useEffect(() => { setS(initiale); }, [initiale]);
  const champ = (cle: keyof Saisie) => ({
    id: `evenement-${cle}`, value: s[cle] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setS((x) => ({ ...x, [cle]: e.target.value })),
  });
  const valider = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnCours(true);
    setRefus(null);
    try { await enregistrer(s); } catch (err) { setRefus(messageDe(err)); } finally { setEnCours(false); }
  };
  return (
    <form onSubmit={valider} className="space-y-4">
      <Carte densite="contenu" rythme>
        <Champ {...champ('nom')} label="Nom" autoFocus />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Etiquette as="label" htmlFor="evenement-type" className="mb-1">Type</Etiquette>
            <select id="evenement-type" className={CLASSES_SELECT} value={s.type} onChange={(e) => setS((x) => ({ ...x, type: e.target.value }))}>
              <option value="">—</option>
              {TYPES.map((t) => <option key={t.valeur} value={t.valeur}>{t.libelle}</option>)}
            </select>
          </div>
          <Champ {...champ('ville')} label="Ville" />
          <Champ {...champ('date')} label="Date" type="date" />
          <Champ {...champ('heureDebut')} label="Début" type="time" />
          <Champ {...champ('dateFin')} label="Date de fin (si autre jour)" type="date" />
          <Champ {...champ('heureFin')} label="Fin" type="time" />
          <Champ {...champ('places')} label="Places" type="number" min={0} aide="Vide : inscription ailleurs, ou places non fixées." />
          <Champ {...champ('prix')} label="Prix (€)" inputMode="decimal" />
        </div>
        <label className="flex items-center gap-2 text-sm text-brand-main dark:text-white">
          <input type="checkbox" checked={s.questionnaireRequis} onChange={(e) => setS((x) => ({ ...x, questionnaireRequis: e.target.checked }))} />
          Questionnaire de santé demandé
        </label>
        <Champ {...champ('urlInscription')} label="Adresse d’inscription extérieure" type="url" />
        <Champ {...champ('metaDescription')} label="Description (moteurs de recherche)" />
      </Carte>
      <Carte densite="contenu" rythme>
        <TitreSection as="h3" titre="Contenus HTML" sousTitre="Repris tels quels sur la page de l’évènement : ils ne sont pas interprétés ici." />
        <Champ {...champ('htmlPermalink')} label="Adresse de la page" />
        <Champ {...champ('htmlProgramme')} multiligne rows={6} label="Programme" />
        <Champ {...champ('htmlPrix')} multiligne rows={3} label="Prix" />
        <Champ {...champ('htmlLieuAdresse')} multiligne rows={3} label="Lieu — adresse" />
        <Champ {...champ('htmlLieuInstructions')} multiligne rows={3} label="Lieu — instructions" />
      </Carte>
      {refus && <Avis ton="erreur">{refus}</Avis>}
      <div className="flex justify-end items-center gap-3">
        {modifie && <span className="text-xs text-alerte">Modifications non enregistrées.</span>}
        <Bouton type="submit" intention="principale" posee disabled={enCours}>{enCours ? 'Enregistrement…' : libelle}</Bouton>
      </div>
    </form>
  );
};

export const NouvelEvenement: React.FC = () => (
  <div className={`${ecran('travail')} space-y-4`}>
    <TitreSection titre="Nouvel évènement" action={<Bouton intention="discrete" onClick={() => aller('evenements')}><ArrowLeft /> Évènements</Bouton>} />
    <FormulaireEvenement initiale={SAISIE_VIDE} libelle="Créer l’évènement" enregistrer={async (s) => {
      const r = versRoute(s);
      if (typeof r === 'string') throw new Error(r);
      const { id } = await Clients.creerEvenement(r);
      aller(`evenements/${encodeURIComponent(id)}`);
    }} />
  </div>
);

const STATUTS_POSSIBLES: StatutInscription[] = ['confirmee', 'annulee', 'deconseillee'];

export const EvenementView: React.FC<{ id: string }> = ({ id }) => {
  const lecture = useLecture(() => Clients.lireEvenement(id), [id]);
  const [personne, setPersonne] = useState<FicheChoisie | null>(null);
  const [refusInscription, setRefusInscription] = useState<string | null>(null);
  const [supprimer, setSupprimer] = useState(false);
  const [refusSuppression, setRefusSuppression] = useState<string | null>(null);
  const initiale = React.useMemo(() => (lecture.phase === 'prete' ? depuis(lecture.donnees) : null), [lecture.phase === 'prete' ? lecture.donnees : null]);

  if (lecture.phase !== 'prete' || !initiale) return <div className={ecran('liste')}><EtatLecture lecture={lecture} /></div>;
  const e = lecture.donnees;
  const complet = e.placesTotales !== null && e.placesLibres !== null && e.placesLibres <= 0;

  const inscrire = async () => {
    if (!personne) return;
    setRefusInscription(null);
    try {
      await Clients.inscrire(id, personne.id);
      setPersonne(null);
      await lecture.recharger();
    } catch (err) {
      setRefusInscription(messageDe(err));
    }
  };

  const changerStatut = async (inscriptionId: string, statut: StatutInscription) => {
    setRefusInscription(null);
    try {
      await Clients.changerStatutInscription(inscriptionId, statut as 'annulee' | 'deconseillee' | 'confirmee');
      await lecture.recharger();
    } catch (err) {
      // « Cette journée est complète. » : une place ne se reprend que si elle est libre (règle 12).
      setRefusInscription(messageDe(err));
    }
  };

  return (
    <div className={`${ecran('liste')} space-y-4`}>
      <div className="flex items-center justify-between gap-3">
        <Bouton taille="petit" intention="discrete" onClick={() => aller('evenements')}><ArrowLeft /> Évènements</Bouton>
        <Bouton taille="petit" intention="secondaire" ton="erreur" onClick={() => setSupprimer(true)} disabled={e.inscriptions.length > 0}
          title={e.inscriptions.length > 0 ? 'Un évènement qui a des inscrits ne se supprime pas.' : undefined}>
          <Trash2 /> Supprimer
        </Bouton>
      </div>
      {refusSuppression && <Avis ton="erreur">{refusSuppression}</Avis>}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start">
        <FormulaireEvenement initiale={initiale} libelle="Enregistrer" enregistrer={async (s) => {
          const r = versRoute(s);
          if (typeof r === 'string') throw new Error(r);
          await Clients.modifierEvenement(id, r);
          await lecture.recharger();
        }} />
        <Carte densite="contenu" rythme>
          <TitreSection
            as="h3"
            titre="Inscrits"
            sousTitre={e.placesTotales === null ? 'Places non fixées' : `${e.placesLibres} places libres sur ${e.placesTotales} — ${euros(e.prixCentimes)}`}
          />
          {e.inscriptions.length === 0 ? <Vide>Aucun inscrit.</Vide> : (
            <ul className="divide-y divide-brand-border dark:divide-dark-sec-border">
              {e.inscriptions.map((i) => (
                <li key={i.id} className="py-2 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    {i.personne.clientId
                      ? <a className="text-sm font-semibold text-brand-main dark:text-white underline hover:no-underline" href={`#clients/${encodeURIComponent(i.personne.clientId)}`}>{nomComplet(i.personne)}</a>
                      : <span className="text-sm text-brand-main dark:text-white">{nomComplet(i.personne)} <span className="text-xs text-alerte">· à rapprocher</span></span>}
                    <Pastille libelle={INSCRIPTIONS[i.statut].libelle} ton={INSCRIPTIONS[i.statut].ton} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-brand-main dark:text-dark-text">
                      {i.modePaiement === 'carte' ? 'Par carte' : i.modePaiement === 'virement' ? 'Par virement' : 'Sans paiement en ligne'}
                      {i.retenueJusqua && ` · retenue jusqu’au ${dateCourte(i.retenueJusqua)}`}
                    </span>
                    <select aria-label={`Statut de ${nomComplet(i.personne)}`} className={`${CLASSES_SELECT} w-auto`} value={STATUTS_POSSIBLES.includes(i.statut) ? i.statut : ''}
                      onChange={(ev) => void changerStatut(i.id, ev.target.value as StatutInscription)}>
                      {!STATUTS_POSSIBLES.includes(i.statut) && <option value="">{INSCRIPTIONS[i.statut].libelle}</option>}
                      {STATUTS_POSSIBLES.map((st) => <option key={st} value={st}>{INSCRIPTIONS[st].libelle}</option>)}
                    </select>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {complet ? (
            // Complet : l'inscription est grisée et dit pourquoi, au lieu d'attendre le refus de la route.
            <div className="space-y-1">
              <Bouton taille="petit" intention="secondaire" disabled aria-describedby="inscrire-complet"><UserPlus /> Inscrire une personne</Bouton>
              <p id="inscrire-complet" className="text-xs text-brand-main dark:text-dark-text">
                Complet : {e.placesTotales === 1 ? 'la place est prise' : `les ${e.placesTotales} places sont prises`}. Une place se libère quand un inscrit passe à « annulée ».
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <ChoixFiche id="inscrire-personne" label="Inscrire une personne" valeur={personne} onChange={setPersonne} />
              {personne && <div className="flex justify-end"><Bouton taille="petit" intention="principale" onClick={inscrire}><UserPlus /> Inscrire</Bouton></div>}
            </div>
          )}
          {refusInscription && <Avis ton="erreur">{refusInscription}</Avis>}
        </Carte>
      </div>
      <ConfirmModal
        isOpen={supprimer}
        onClose={() => setSupprimer(false)}
        onConfirm={() => void Clients.supprimerEvenement(id).then(() => aller('evenements')).catch((err) => setRefusSuppression(messageDe(err)))}
        title="Supprimer cet évènement ?"
        message="Il disparaît des listes. Un évènement qui a des inscrits ne se supprime pas."
        confirmLabel="Supprimer"
        isDestructive
      />
    </div>
  );
};

export const EspaceEvenements: React.FC = () => {
  const [premier] = useAdresse();
  if (!premier) return <ListeEvenements />;
  if (premier === 'nouveau') return <NouvelEvenement />;
  return <EvenementView key={premier} id={decodeURIComponent(premier)} />;
};

export default EspaceEvenements;
