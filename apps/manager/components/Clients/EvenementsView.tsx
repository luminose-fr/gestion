/**
 * Stages (SPEC §15.4 ; refonte de la console, lot 8 — maquettes Stages, Stage,
 * StageInfos). « Stages » est le mot du site ; l'adresse est `#stages`. À
 * venir, puis passés : nom, date, ville, places libres sur places totales. Un
 * stage : ses inscrits d'abord — personne, statut, paiement — avec « Inscrire
 * une personne » ; puis ses informations (le prix en euros à l'écran, en
 * centimes en base) et ses contenus HTML, repliés.
 *
 * Les places et la dernière place se décident côté route (§15.2, règle 12) :
 * l'écran affiche le refus tel qu'il est écrit (« Cette journée est complète. »).
 * La publication sur le site n'est pas d'ici.
 */
import React, { useEffect, useState } from 'react';
import { Bouton, Carte, Champ, Choix, Etiquette, Fenetre, FOCUS, Pastille, Repliable, Secondaire, TitreCarte, TitreEcran, ZoneTexte } from '../charte';
import * as Clients from '../../services/clientsService';
import type { ChampsEvenement, Evenement, EvenementDetaille, StatutInscription } from '../../types-clients';
import {
  aller, aujourdhui, centimesDepuis, dateCourte, euros, EtatLecture, heure, INSCRIPTIONS, isoDepuis, jourDe,
  messageDe, nomComplet, useAdresse, useGardeSaisie, useLecture,
} from './commun';
import { ChoixFiche, type FicheChoisie } from './ChoixFiche';

const TON: Record<string, 'succes' | 'alerte' | 'erreur' | 'neutre'> = { succes: 'succes', alerte: 'alerte', erreur: 'erreur', neutre: 'neutre' };

const TYPES = [
  { valeur: 'meditation', libelle: 'Méditation' },
  { valeur: 'hypnose', libelle: 'Hypnose' },
  { valeur: 'respiration-holotropique', libelle: 'Respiration holotropique' },
];

const LigneEvenement: React.FC<{ e: Evenement; premiere: boolean }> = ({ e, premiere }) => (
  <li className={premiere ? '' : 'border-t border-bord'}>
    <a href={`#stages/${encodeURIComponent(e.id)}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-survole outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-marque">
      <span className="min-w-0">
        <span className="block truncate font-semibold">{e.nom}</span>
        <span className="block text-secondaire text-second">{dateCourte(e.debut)}{e.ville && ` · ${e.ville}`}</span>
      </span>
      <span className="flex-none text-right text-secondaire text-second tabular-nums">
        {e.placesTotales === null
          ? (e.urlInscription ? 'Inscription ailleurs' : 'Places non fixées')
          : e.placesLibres !== null && e.placesLibres <= 0
            ? <Pastille ton="neutre" signe="●">Complet</Pastille>
            : <><span className="font-semibold text-texte">{e.placesLibres}</span> libres sur {e.placesTotales}</>}
      </span>
    </a>
  </li>
);

export const ListeEvenements: React.FC = () => {
  const lecture = useLecture(() => Clients.listeEvenements(), []);
  const [vue, setVue] = useState<'avenir' | 'passes'>('avenir');
  if (lecture.phase !== 'prete') return <div className="mx-auto max-w-[960px] px-4 py-5 md:px-8"><EtatLecture lecture={lecture} /></div>;
  const auj = aujourdhui();
  const tous = lecture.donnees.evenements;
  const aVenir = tous.filter((e) => jourDe(e.debut) >= auj).sort((a, b) => a.debut.localeCompare(b.debut));
  const passes = tous.filter((e) => jourDe(e.debut) < auj);
  const liste = vue === 'avenir' ? aVenir : passes;
  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-4 px-4 py-5 font-charte text-courant text-texte md:px-8 md:py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex gap-1" role="tablist" aria-label="Stages">
          {([['avenir', `À venir · ${aVenir.length}`], ['passes', `Passés · ${passes.length}`]] as const).map(([id, libelle]) => (
            <Bouton key={id} role="tab" aria-selected={vue === id} taille="petit" intention={vue === id ? 'plein' : 'borde'} onClick={() => setVue(id)}>{libelle}</Bouton>
          ))}
        </div>
        <Bouton onClick={() => aller('stages/nouveau')}>Nouveau stage</Bouton>
      </div>
      {tous.length === 0 ? <Carte className="px-4 py-4"><p>Aucun stage pour l’instant.</p></Carte>
        : liste.length === 0 ? <Carte className="px-4 py-4"><p>{vue === 'avenir' ? 'Aucun stage à venir.' : 'Aucun stage passé.'}</p></Carte>
          : <Carte as="div" className="overflow-hidden"><ul>{liste.map((e, i) => <LigneEvenement key={e.id} e={e} premiere={i === 0} />)}</ul></Carte>}
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
    <form onSubmit={valider} className="flex flex-col gap-4">
      <Carte className="flex flex-col gap-3 px-4 py-4">
        <Champ {...champ('nom')} label="Nom" autoFocus={!initiale.nom} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Choix id="evenement-type" label="Type" value={s.type} onChange={(e) => setS((x) => ({ ...x, type: e.target.value }))}>
            <option value="">—</option>
            {TYPES.map((t) => <option key={t.valeur} value={t.valeur}>{t.libelle}</option>)}
          </Choix>
          <Champ {...champ('ville')} label="Ville" />
          <Champ {...champ('date')} label="Date" type="date" />
          <Champ {...champ('heureDebut')} label="Début" type="time" />
          <Champ {...champ('dateFin')} label="Date de fin (si autre jour)" type="date" />
          <Champ {...champ('heureFin')} label="Fin" type="time" />
          <Champ {...champ('places')} label="Places" type="number" min={0} aide="Vide : inscription ailleurs, ou places non fixées." />
          <Champ {...champ('prix')} label="Prix (€)" inputMode="decimal" />
        </div>
        <label className="flex min-h-11 items-center gap-2 md:min-h-10">
          <input type="checkbox" className="size-4 accent-[var(--marque)]" checked={s.questionnaireRequis} onChange={(e) => setS((x) => ({ ...x, questionnaireRequis: e.target.checked }))} />
          Questionnaire de santé demandé
        </label>
        <Champ {...champ('urlInscription')} label="Adresse d’inscription extérieure" type="url" />
        <Champ {...champ('metaDescription')} label="Description (moteurs de recherche)" />
      </Carte>
      <Carte className="px-4 py-3">
        <Repliable titre="Contenus de la page du site" resume="repris tels quels, sans être interprétés ici">
          <div className="flex flex-col gap-3">
            <Champ {...champ('htmlPermalink')} label="Adresse de la page" />
            <ZoneTexte {...champ('htmlProgramme')} rows={6} label="Programme" />
            <ZoneTexte {...champ('htmlPrix')} rows={3} label="Prix" />
            <ZoneTexte {...champ('htmlLieuAdresse')} rows={3} label="Lieu — adresse" />
            <ZoneTexte {...champ('htmlLieuInstructions')} rows={3} label="Lieu — instructions" />
          </div>
        </Repliable>
      </Carte>
      {refus && <p role="alert" className="text-secondaire font-semibold text-sens-erreur">× {refus}</p>}
      <div className="flex items-center justify-end gap-3">
        {modifie && <span className="text-secondaire text-sens-alerte">! Modifications non enregistrées.</span>}
        <Bouton type="submit" disabled={enCours}>{enCours ? 'Enregistrement…' : libelle}</Bouton>
      </div>
    </form>
  );
};

export const NouvelEvenement: React.FC = () => (
  <div className="mx-auto flex max-w-[960px] flex-col gap-4 px-4 py-5 font-charte text-courant text-texte md:px-8 md:py-6">
    <a href="#stages" className={`self-start rounded-controle text-secondaire text-second hover:text-texte ${FOCUS}`}>‹ Stages</a>
    <FormulaireEvenement initiale={SAISIE_VIDE} libelle="Créer le stage" enregistrer={async (s) => {
      const r = versRoute(s);
      if (typeof r === 'string') throw new Error(r);
      const { id } = await Clients.creerEvenement(r);
      aller(`stages/${encodeURIComponent(id)}`);
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

  if (lecture.phase !== 'prete' || !initiale) return <div className="mx-auto max-w-[1180px] px-4 py-5 md:px-8"><EtatLecture lecture={lecture} /></div>;
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

  const inscrits = e.inscriptions.filter((i) => i.statut !== 'annulee' && i.statut !== 'expiree').length;

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-4 py-5 font-charte text-courant text-texte md:px-8 md:py-6">
      <div className="flex items-center justify-between gap-3">
        <a href="#stages" className={`rounded-controle text-secondaire text-second hover:text-texte ${FOCUS}`}>‹ Stages</a>
        <Bouton taille="petit" intention="souligne" onClick={() => setSupprimer(true)} disabled={e.inscriptions.length > 0}
          title={e.inscriptions.length > 0 ? 'Un stage qui a des inscrits ne se supprime pas.' : undefined}>
          Supprimer
        </Bouton>
      </div>
      <header>
        <TitreEcran>{e.nom}</TitreEcran>
        <p className="mt-1 text-second">
          <span className="inline-block first-letter:uppercase">{dateCourte(e.debut)}</span>{e.ville && ` · ${e.ville}`}
          {' · '}{e.placesTotales === null ? 'places non fixées' : `${inscrits} inscrit${inscrits > 1 ? 's' : ''} sur ${e.placesTotales}`}
          {e.prixCentimes !== null && ` · ${euros(e.prixCentimes)}`}
        </p>
      </header>
      {refusSuppression && <p role="alert" className="text-secondaire font-semibold text-sens-erreur">× {refusSuppression}</p>}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Carte as="section" className="overflow-hidden">
          <div className="flex items-baseline justify-between gap-3 px-4 py-3">
            <TitreCarte>Inscrits</TitreCarte>
            <Secondaire>{e.placesTotales === null ? 'Places non fixées' : `${e.placesLibres} places libres sur ${e.placesTotales}`}</Secondaire>
          </div>
          {e.inscriptions.length === 0 ? <p className="border-t border-bord px-4 py-3 text-second">Aucun inscrit.</p> : (
            <ul>
              {e.inscriptions.map((i) => (
                <li key={i.id} className="flex flex-col gap-1.5 border-t border-bord px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    {i.personne.clientId
                      ? <a className={`font-semibold underline underline-offset-[3px] hover:text-marque ${FOCUS}`} href={`#clients/${encodeURIComponent(i.personne.clientId)}`}>{nomComplet(i.personne)}</a>
                      : <span>{nomComplet(i.personne)} <Pastille ton="alerte">À rattacher</Pastille></span>}
                    <Pastille ton={TON[INSCRIPTIONS[i.statut].ton]}>{INSCRIPTIONS[i.statut].libelle}</Pastille>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-secondaire text-second">
                      {i.modePaiement === 'carte' ? 'Par carte' : i.modePaiement === 'virement' ? 'Par virement' : 'Sans paiement en ligne'}
                      {i.retenueJusqua && ` · retenue jusqu’au ${dateCourte(i.retenueJusqua)}`}
                    </span>
                    <Choix id={`statut-${i.id}`} label={`Statut de ${nomComplet(i.personne)}`} masquerLabel className="w-44"
                      value={STATUTS_POSSIBLES.includes(i.statut) ? i.statut : ''}
                      onChange={(ev) => void changerStatut(i.id, ev.target.value as StatutInscription)}>
                      {!STATUTS_POSSIBLES.includes(i.statut) && <option value="">{INSCRIPTIONS[i.statut].libelle}</option>}
                      {STATUTS_POSSIBLES.map((st) => <option key={st} value={st}>{INSCRIPTIONS[st].libelle}</option>)}
                    </Choix>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-2 border-t border-bord px-4 py-3">
            {complet ? (
              // Complet : l'inscription est grisée et dit pourquoi, au lieu d'attendre le refus de la route.
              <>
                <Bouton taille="petit" intention="borde" className="self-start" disabled aria-describedby="inscrire-complet">Inscrire une personne</Bouton>
                <Secondaire id="inscrire-complet">
                  Complet : {e.placesTotales === 1 ? 'la place est prise' : `les ${e.placesTotales} places sont prises`}. Une place se libère quand un inscrit passe à « annulée ».
                </Secondaire>
              </>
            ) : (
              <>
                <ChoixFiche id="inscrire-personne" label="Inscrire une personne" valeur={personne} onChange={setPersonne} />
                {personne && <Bouton taille="petit" className="self-end" onClick={inscrire}>Inscrire</Bouton>}
              </>
            )}
            {refusInscription && <p role="alert" className="text-secondaire font-semibold text-sens-erreur">× {refusInscription}</p>}
          </div>
        </Carte>

        <section aria-label="Informations du stage" className="flex flex-col gap-2">
          <Etiquette as="h2">Informations du stage</Etiquette>
          <FormulaireEvenement initiale={initiale} libelle="Enregistrer" enregistrer={async (s) => {
            const r = versRoute(s);
            if (typeof r === 'string') throw new Error(r);
            await Clients.modifierEvenement(id, r);
            await lecture.recharger();
          }} />
        </section>
      </div>

      <Fenetre ouverte={supprimer} titre="Supprimer ce stage ?" onFermer={() => setSupprimer(false)}
        actions={<>
          <Bouton intention="souligne" onClick={() => setSupprimer(false)}>Garder le stage</Bouton>
          <Bouton onClick={() => { setSupprimer(false); void Clients.supprimerEvenement(id).then(() => aller('stages')).catch((err) => setRefusSuppression(messageDe(err))); }}>Supprimer</Bouton>
        </>}>
        <p>Il disparaît des listes. Un stage qui a des inscrits ne se supprime pas.</p>
      </Fenetre>
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
