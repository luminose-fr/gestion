/**
 * Stages (SPEC §15.4 ; refonte de la console, lot 8 ; retours du 28/11/2026,
 * §4 — maquettes Stages, Stage, StageInfos, StageEdition). « Stages » est le
 * mot du site ; l'adresse est `#stages`.
 *
 * Un stage a deux onglets dans le bandeau : « Inscrits », par défaut — quatre
 * tuiles, puis une ligne par personne, avec « Encaisser » et « ··· » —, et
 * « Le stage », en lecture, que « Modifier » passe en saisie. Les inscrits et
 * les réglages ne se mélangent plus.
 *
 * Les places et la dernière place se décident côté route (§15.2, règle 12) :
 * l'écran affiche le refus tel qu'il est écrit (« Cette journée est complète. »).
 * La publication sur le site n'est pas d'ici.
 */
import { Bandeau, OngletsBarre } from '../charte/bandeau';
import React, { useEffect, useState } from 'react';
import { Bouton, Carte, Champ, Choix, Etiquette, Fenetre, FOCUS, Pastille, Repliable, Secondaire, ZoneTexte } from '../charte';
import { ChampSuffixe, Compteur, ListeValeurs } from '../charte/reglage';
import { Menu } from '../ui';
import * as Clients from '../../services/clientsService';
import type { ChampsEvenement, Evenement, EvenementDetaille, InscriptionVue } from '../../types-clients';
import { heureListe, jourCourt, montant as montantEnClair } from '../../lib/format';
import {
  aller, aujourdhui, centimesDepuis, dateCourte, EtatLecture, heure, INSCRIPTIONS, isoDepuis, jourDe,
  messageDe, nomComplet, useAdresse, useGardeSaisie, useLecture,
} from './commun';
import { ChoixFiche, type FicheChoisie } from './ChoixFiche';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

const MOYENS: Record<string, string> = { especes: 'en espèces', virement: 'par virement', stripe: 'en ligne', stancer: 'en ligne' };
const TON: Record<string, 'succes' | 'alerte' | 'erreur' | 'neutre'> = { succes: 'succes', alerte: 'alerte', erreur: 'erreur', neutre: 'neutre' };

// « Breathwork holotropique », le mot du site (§4) ; la valeur stockée ne change pas.
const TYPES = [
  { valeur: 'respiration-holotropique', libelle: 'Breathwork holotropique' },
  { valeur: 'meditation', libelle: 'Méditation' },
  { valeur: 'hypnose', libelle: 'Hypnose' },
];
const libelleType = (t: string | null) => TYPES.find((x) => x.valeur === t)?.libelle ?? t ?? '—';

/** « 1 place libre », « 2 places libres » (§4). */
const placesLibres = (n: number) => `${n} place${n > 1 ? 's' : ''} libre${n > 1 ? 's' : ''}`;

/** Les jours d'un stage : ceux qu'il porte, sinon `debut`–`fin`. */
const joursDe = (e: Pick<EvenementDetaille, 'debut' | 'fin' | 'jours'>) =>
  e.jours?.length ? e.jours : [{ debut: e.debut, fin: e.fin ?? e.debut }];

/** « sam. 14 mars, 10:00 – 17:00 · dim. 15 mars, 10:00 – 16:00 ». */
const quand = (e: Pick<EvenementDetaille, 'debut' | 'fin' | 'jours'>) =>
  joursDe(e).map((j) => `${jourCourt(j.debut)}, ${heureListe(j.debut)} – ${heureListe(j.fin)}`).join(' · ');

const LigneEvenement: React.FC<{ e: Evenement; premiere: boolean }> = ({ e, premiere }) => (
  <li className={premiere ? '' : 'border-t border-bord'}>
    <a href={`#stages/${encodeURIComponent(e.id)}`} className="flex flex-wrap items-center gap-4 px-4 py-3.5 outline-none hover:bg-survole focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-marque">
      <span className="min-w-64 flex-1">
        <span className="block font-semibold">{e.nom}</span>
        <Secondaire>{dateCourte(e.debut)}{e.ville && ` · ${e.ville}`}</Secondaire>
      </span>
      {e.placesTotales === null
        ? <Secondaire>{e.urlInscription ? 'Inscription ailleurs' : 'Places non fixées'}</Secondaire>
        : e.placesLibres !== null && e.placesLibres <= 0
          ? <Pastille ton="alerte" signe="×">Complet · {e.placesTotales} sur {e.placesTotales}</Pastille>
          : <Pastille signe="">{placesLibres(e.placesLibres ?? 0)} sur {e.placesTotales}</Pastille>}
    </a>
  </li>
);

export const ListeEvenements: React.FC = () => {
  const lecture = useLecture(() => Clients.listeEvenements(), []);
  const [vue, setVue] = useState<'avenir' | 'passes'>('avenir');
  if (lecture.phase !== 'prete') return <div className="mx-auto max-w-[1150px] px-4 py-5 md:px-8"><EtatLecture lecture={lecture} /></div>;
  const auj = aujourdhui();
  const tous = lecture.donnees.evenements;
  const aVenir = tous.filter((e) => jourDe(e.debut) >= auj).sort((a, b) => a.debut.localeCompare(b.debut));
  const passes = tous.filter((e) => jourDe(e.debut) < auj);
  const liste = vue === 'avenir' ? aVenir : passes;
  return (
    <div className="mx-auto flex max-w-[1150px] flex-col gap-4 px-4 py-5 font-charte text-courant text-texte md:px-8 md:py-6">
      <Bandeau
        onglets={<OngletsBarre libelle="Stages" actif={vue} onChange={setVue}
          onglets={[{ id: 'avenir', libelle: 'À venir', compte: aVenir.length }, { id: 'passes', libelle: 'Passés', compte: passes.length }]} />}
        actions={<Bouton onClick={() => aller('stages/nouveau')}>Nouveau stage</Bouton>}
      />
      {tous.length === 0 ? <Carte className="px-4 py-4"><p>Aucun stage pour l’instant.</p></Carte>
        : liste.length === 0 ? <Carte className="px-4 py-4"><p>{vue === 'avenir' ? 'Aucun stage à venir.' : 'Aucun stage passé.'}</p></Carte>
          : <Carte as="div" className="overflow-hidden"><ul>{liste.map((e, i) => <LigneEvenement key={e.id} e={e} premiere={i === 0} />)}</ul></Carte>}
    </div>
  );
};

// ─── La saisie d'un stage ───────────────────────────────────────────────────

type JourSaisi = { date: string; debut: number; fin: number };

/** Ce que le formulaire tient. Les heures en minutes depuis minuit : ce sont des listes. */
type Saisie = {
  nom: string; type: string; ville: string; jours: JourSaisi[];
  places: number | null; prix: string; questionnaireRequis: boolean; urlInscription: string; metaDescription: string;
  htmlPermalink: string; htmlProgramme: string; htmlPrix: string; htmlLieuAdresse: string; htmlLieuInstructions: string;
};

const minutes = (iso: string) => { const [h, m] = heure(iso).split(':').map(Number); return h * 60 + m; };
const enHeure = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const HEURES = Array.from({ length: 27 }, (_, i) => 8 * 60 + i * 30).map((m) => [m, enHeure(m)] as const);

const SAISIE_VIDE: Saisie = {
  nom: '', type: 'respiration-holotropique', ville: '', jours: [{ date: aujourdhui(), debut: 10 * 60, fin: 17 * 60 }],
  places: 12, prix: '', questionnaireRequis: true, urlInscription: '', metaDescription: '',
  htmlPermalink: '', htmlProgramme: '', htmlPrix: '', htmlLieuAdresse: '', htmlLieuInstructions: '',
};

const depuis = (e: EvenementDetaille): Saisie => ({
  nom: e.nom, type: e.type ?? '', ville: e.ville ?? '',
  jours: joursDe(e).map((j) => ({ date: jourDe(j.debut), debut: minutes(j.debut), fin: minutes(j.fin) })),
  places: e.placesTotales, prix: e.prixCentimes === null ? '' : String(e.prixCentimes / 100).replace('.', ','),
  questionnaireRequis: e.questionnaireRequis, urlInscription: e.urlInscription ?? '', metaDescription: e.metaDescription ?? '',
  htmlPermalink: e.htmlPermalink ?? '', htmlProgramme: e.htmlProgramme ?? '', htmlPrix: e.htmlPrix ?? '', htmlLieuAdresse: e.htmlLieuAdresse ?? '', htmlLieuInstructions: e.htmlLieuInstructions ?? '',
});

/** La saisie → ce que la route reçoit, ou la raison pour laquelle elle ne se lit pas. */
const versRoute = (s: Saisie): ChampsEvenement & { nom: string; debut: string } | string => {
  if (!s.nom.trim()) return 'Le nom est obligatoire.';
  if (s.jours.some((j) => !j.date)) return 'Chaque jour a besoin de sa date.';
  if (s.jours.some((j) => j.fin <= j.debut)) return 'Chaque jour doit finir après avoir commencé.';
  const prix = s.prix.trim() ? centimesDepuis(s.prix) : null;
  if (s.prix.trim() && prix === null) return 'Le prix ne se lit pas : un nombre, en euros.';
  const texte = (v: string) => (v.trim() ? v : null);
  const jours = [...s.jours].sort((a, b) => a.date.localeCompare(b.date) || a.debut - b.debut)
    .map((j) => ({ debut: isoDepuis(j.date, enHeure(j.debut)), fin: isoDepuis(j.date, enHeure(j.fin)) }));
  return {
    nom: s.nom.trim(), type: texte(s.type), debut: jours[0].debut, fin: jours[jours.length - 1].fin, jours,
    ville: texte(s.ville), placesTotales: s.places, prixCentimes: prix, questionnaireRequis: s.questionnaireRequis,
    urlInscription: texte(s.urlInscription), metaDescription: texte(s.metaDescription),
    htmlPermalink: texte(s.htmlPermalink), htmlProgramme: texte(s.htmlProgramme), htmlPrix: texte(s.htmlPrix),
    htmlLieuAdresse: texte(s.htmlLieuAdresse), htmlLieuInstructions: texte(s.htmlLieuInstructions),
  };
};

const LIBELLE = 'text-secondaire font-medium text-second';

const FormulaireEvenement: React.FC<{
  initiale: Saisie; enregistrer: (s: Saisie) => Promise<void>; libelle: string;
  /** Les places ne descendent pas sous les inscrits. */
  inscrits?: number; onAnnuler?: () => void; onSupprimer?: () => void;
}> = ({ initiale, enregistrer, libelle, inscrits = 0, onAnnuler, onSupprimer }) => {
  const [s, setS] = useState<Saisie>(initiale);
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const modifie = JSON.stringify(s) !== JSON.stringify(initiale);
  useGardeSaisie(modifie && !enCours);
  useEffect(() => { setS(initiale); }, [initiale]);
  const poser = <K extends keyof Saisie>(cle: K, v: Saisie[K]) => setS((x) => ({ ...x, [cle]: v }));
  const champ = (cle: keyof Saisie) => ({
    id: `evenement-${cle}`, value: s[cle] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => poser(cle, e.target.value as never),
  });
  const jour = (i: number, j: Partial<JourSaisi>) => poser('jours', s.jours.map((x, k) => (k === i ? { ...x, ...j } : x)));
  const valider = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnCours(true);
    setRefus(null);
    try { await enregistrer(s); } catch (err) { setRefus(messageDe(err)); } finally { setEnCours(false); }
  };
  return (
    <form onSubmit={valider}>
      <Carte className="flex flex-col gap-5 p-5">
        <Champ {...champ('nom')} label="Nom" autoFocus={!initiale.nom} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Choix id="evenement-type" label="Type" value={s.type} onChange={(e) => poser('type', e.target.value)}>
            <option value="">—</option>
            {TYPES.map((t) => <option key={t.valeur} value={t.valeur}>{t.libelle}</option>)}
          </Choix>
          <Champ {...champ('ville')} label="Ville" />
        </div>

        {/* « Quand » : une ligne par jour, chacun avec ses heures (§4). */}
        <fieldset className="flex flex-col gap-1.5">
          <legend className={cx(LIBELLE, 'pb-1.5')}>Quand</legend>
          {s.jours.map((j, i) => (
            <div key={i} className="flex min-h-11 flex-wrap items-center gap-2">
              <Champ id={`evenement-jour-${i}`} label={`Jour ${i + 1}`} masquerLabel type="date" className="w-44" value={j.date} onChange={(e) => jour(i, { date: e.target.value })} />
              de <ListeValeurs id={`evenement-debut-${i}`} libelle={`Début, jour ${i + 1}`} valeur={j.debut} options={HEURES} horsListe={enHeure} onChange={(v) => jour(i, { debut: v })} />
              à <ListeValeurs id={`evenement-fin-${i}`} libelle={`Fin, jour ${i + 1}`} valeur={j.fin} options={HEURES} horsListe={enHeure} onChange={(v) => jour(i, { fin: v })} />
              {s.jours.length > 1 && <Bouton taille="petit" intention="souligne" onClick={() => poser('jours', s.jours.filter((_, k) => k !== i))}>Retirer ce jour</Bouton>}
            </div>
          ))}
          <Bouton taille="petit" intention="souligne" className="self-start !px-0" onClick={() => {
            const dernier = s.jours[s.jours.length - 1];
            const lendemain = dernier.date ? new Date(Date.parse(`${dernier.date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : '';
            poser('jours', [...s.jours, { date: lendemain, debut: dernier.debut, fin: dernier.fin }]);
          }}>+ Ajouter un jour</Bouton>
        </fieldset>

        <div className="flex flex-wrap items-end gap-6">
          {s.places !== null && (
            <div className="flex flex-col gap-1"><label htmlFor="evenement-places" className={LIBELLE}>Places</label>
              <Compteur id="evenement-places" libelle="Places" valeur={s.places} min={Math.max(1, inscrits)} max={500} onChange={(v) => poser('places', v)} /></div>
          )}
          <div className="flex flex-col gap-1"><label htmlFor="evenement-prix" className={LIBELLE}>Prix par personne</label>
            <ChampSuffixe {...champ('prix')} suffixe="€" inputMode="decimal" /></div>
          {inscrits > 0 && s.places !== null && <Secondaire className="pb-2.5">{inscrits} inscrit{inscrits > 1 ? 's' : ''} : pas moins de {inscrits} places.</Secondaire>}
        </div>

        <label className="flex min-h-11 items-center gap-2.5 md:min-h-10">
          <input type="checkbox" className="size-[18px] accent-[var(--marque)]" checked={s.questionnaireRequis} onChange={(e) => poser('questionnaireRequis', e.target.checked)} />
          Questionnaire de santé demandé à l’inscription
        </label>

        <ZoneTexte {...champ('metaDescription')} rows={3}
          label={`Description pour les moteurs de recherche · ${s.metaDescription.length} / 160 signes`} />

        <Repliable titre="Inscriptions prises ailleurs" resume="adresse d’inscription extérieure, places non fixées">
          <div className="flex flex-col gap-3 pl-5">
            <Champ {...champ('urlInscription')} label="Adresse d’inscription extérieure" type="url" placeholder="https://" />
            <label className="flex min-h-10 items-center gap-2.5">
              <input type="checkbox" className="size-[18px] accent-[var(--marque)]" checked={s.places === null}
                onChange={(e) => poser('places', e.target.checked ? null : Math.max(12, inscrits))} />
              Places non fixées
            </label>
          </div>
        </Repliable>
        <Repliable titre="Contenus de la page du site" resume="repris tels quels, sans être interprétés ici">
          <div className="flex flex-col gap-3 pl-5">
            <Champ {...champ('htmlPermalink')} label="Adresse de la page" />
            <ZoneTexte {...champ('htmlProgramme')} rows={6} label="Programme" />
            <ZoneTexte {...champ('htmlPrix')} rows={3} label="Prix" />
            <ZoneTexte {...champ('htmlLieuAdresse')} rows={3} label="Lieu — adresse" />
            <ZoneTexte {...champ('htmlLieuInstructions')} rows={3} label="Lieu — instructions" />
          </div>
        </Repliable>

        {refus && <p role="alert" className="text-secondaire font-semibold text-sens-erreur">× {refus}</p>}
        <div className="flex flex-wrap items-center gap-2 border-t border-bord pt-4">
          {onSupprimer && <Bouton intention="souligne" className="!text-sens-erreur" onClick={onSupprimer}>Supprimer le stage…</Bouton>}
          <span className="flex-1" />
          {modifie && <span className="text-secondaire text-sens-alerte">! Modifications non enregistrées.</span>}
          {onAnnuler && <Bouton intention="borde" onClick={onAnnuler} disabled={enCours}>Annuler</Bouton>}
          <Bouton type="submit" disabled={enCours}>{enCours ? 'Enregistrement…' : libelle}</Bouton>
        </div>
      </Carte>
    </form>
  );
};

export const NouvelEvenement: React.FC = () => (
  <div className="mx-auto flex max-w-[770px] flex-col gap-4 px-4 py-5 font-charte text-courant text-texte md:px-8 md:py-6">
    <Bandeau fil={{ libelle: 'Stages', href: '#stages' }} titre="Nouveau stage" />
    <FormulaireEvenement initiale={SAISIE_VIDE} libelle="Créer le stage" enregistrer={async (s) => {
      const r = versRoute(s);
      if (typeof r === 'string') throw new Error(r);
      const { id } = await Clients.creerEvenement(r);
      aller(`stages/${encodeURIComponent(id)}`);
    }} />
  </div>
);

// ─── Un stage ───────────────────────────────────────────────────────────────

const active = (i: InscriptionVue) => i.statut !== 'annulee' && i.statut !== 'expiree' && i.statut !== 'deconseillee';
const payee = (i: InscriptionVue) => !!i.paiement || i.statut === 'payee';

/** Ce qu'on lit sous le nom : comment c'est payé, ou ce qui reste à faire. */
const detailPaiement = (i: InscriptionVue, prix: number | null) => {
  if (i.paiement) return `Payé ${MOYENS[i.paiement.moyen] ?? i.paiement.moyen}${i.paiement.le ? ` le ${dateCourte(i.paiement.le)}` : ''}`;
  if (i.statut === 'retenue') return `${i.modePaiement === 'carte' ? 'Par carte' : 'Par virement'}${i.retenueJusqua ? ` · retenue jusqu’au ${dateCourte(i.retenueJusqua)}` : ''}`;
  if (i.statut === 'confirmee') return `Confirmée${i.origine === 'console' ? ' par vous' : ''}${(prix ?? 0) > 0 ? ' · à encaisser' : ''}`;
  return INSCRIPTIONS[i.statut].libelle;
};

/** UNE pastille de statut (§4) : payée l'emporte. */
const PastilleStatut: React.FC<{ i: InscriptionVue }> = ({ i }) =>
  payee(i) ? <Pastille ton="succes">Payée</Pastille>
    : i.statut === 'retenue' ? <Pastille ton="alerte">Place retenue</Pastille>
      : <Pastille ton={TON[INSCRIPTIONS[i.statut].ton]}>{INSCRIPTIONS[i.statut].libelle}</Pastille>;

const Tuile: React.FC<{ valeur: number; nom: string; alerte?: boolean }> = ({ valeur, nom, alerte }) => (
  <Carte className="flex flex-col gap-0.5 px-4 py-3">
    <span className={cx('font-titre text-ecran-tel font-medium tabular-nums', alerte ? 'text-sens-alerte' : 'text-texte')}>{valeur}</span>
    <Secondaire>{nom}</Secondaire>
  </Carte>
);

const LigneLecture: React.FC<{ nom: string; valeur: React.ReactNode }> = ({ nom, valeur }) => (
  <div className="grid gap-1 sm:grid-cols-[170px_1fr] sm:gap-3"><span className="text-second">{nom}</span><span className="min-w-0 break-words">{valeur}</span></div>
);

export const EvenementView: React.FC<{ id: string }> = ({ id }) => {
  const lecture = useLecture(() => Clients.lireEvenement(id), [id]);
  const [vue, setVue] = useState<'inscrits' | 'stage'>('inscrits');
  const [edition, setEdition] = useState(false);
  const [inscrireOuvert, setInscrireOuvert] = useState(false);
  const [personne, setPersonne] = useState<FicheChoisie | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [refusInscription, setRefusInscription] = useState<string | null>(null);
  const [supprimer, setSupprimer] = useState(false);
  const [refusSuppression, setRefusSuppression] = useState<string | null>(null);
  const initiale = React.useMemo(() => (lecture.phase === 'prete' ? depuis(lecture.donnees) : null), [lecture.phase === 'prete' ? lecture.donnees : null]);

  if (lecture.phase !== 'prete' || !initiale) return <div className="mx-auto max-w-[1150px] px-4 py-5 md:px-8"><EtatLecture lecture={lecture} /></div>;
  const e = lecture.donnees;
  const complet = e.placesTotales !== null && e.placesLibres !== null && e.placesLibres <= 0;
  const actives = e.inscriptions.filter(active);

  const agir = async (geste: () => Promise<unknown>) => {
    setMenu(null);
    setRefusInscription(null);
    try { await geste(); await lecture.recharger(); }
    // « Cette journée est complète. » : une place ne se reprend que si elle est libre (règle 12).
    catch (err) { setRefusInscription(messageDe(err)); }
  };

  const inscrire = async () => {
    if (!personne) return;
    setRefusInscription(null);
    try {
      await Clients.inscrire(id, personne.id);
      setPersonne(null);
      setInscrireOuvert(false);
      await lecture.recharger();
    } catch (err) {
      setRefusInscription(messageDe(err));
    }
  };

  const retenues = actives.filter((i) => i.statut === 'retenue' && !payee(i)).length;
  const aRelire = actives.filter((i) => i.questionnaire?.etat === 'non_relu').length;
  const pasRecu = e.questionnaireRequis ? actives.filter((i) => !i.questionnaire).length : 0;
  const aEncaisser = actives.filter((i) => !payee(i) && (e.prixCentimes ?? 0) > 0).length;
  const motifComplet = `Complet : ${e.placesTotales === 1 ? 'la place est prise' : `les ${e.placesTotales} places sont prises`}. Une place se libère quand un inscrit passe à « annulée ».`;
  const basculer = (cle: string) => setMenu(menu === cle ? null : cle);

  return (
    <div className="mx-auto flex max-w-[1150px] flex-col gap-4 px-4 py-5 font-charte text-courant text-texte md:px-8 md:py-6">
      <Bandeau fil={{ libelle: 'Stages', href: '#stages' }} titre={e.nom}
        onglets={<OngletsBarre libelle="Vues du stage" actif={vue} onChange={(v) => { setVue(v); setEdition(false); }}
          onglets={[{ id: 'inscrits', libelle: 'Inscrits', compte: actives.length }, { id: 'stage', libelle: 'Le stage' }]} />}
        actions={vue === 'inscrits'
          ? <Bouton onClick={() => setInscrireOuvert(true)} disabled={complet} aria-describedby={complet ? 'inscrire-complet' : undefined}>Inscrire une personne</Bouton>
          : !edition && <Bouton intention="borde" onClick={() => setEdition(true)}>Modifier</Bouton>} />

      {vue === 'inscrits' && (
        <>
          <Secondaire>
            {quand(e)}{e.ville && ` · ${e.ville}`}{e.prixCentimes !== null && ` · ${montantEnClair(e.prixCentimes)} par personne`}
          </Secondaire>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tuile valeur={actives.length} nom={e.placesTotales === null ? 'inscrits' : `inscrit${actives.length > 1 ? 's' : ''} sur ${e.placesTotales} places`} />
            <Tuile valeur={retenues} nom="places retenues, non payées" alerte={retenues > 0} />
            {e.questionnaireRequis ? <>
              <Tuile valeur={aRelire} nom={`questionnaire${aRelire > 1 ? 's' : ''} à relire`} alerte={aRelire > 0} />
              <Tuile valeur={pasRecu} nom="questionnaire pas reçu" />
            </> : <Tuile valeur={aEncaisser} nom="à encaisser" alerte={aEncaisser > 0} />}
          </div>
          {complet && <Secondaire id="inscrire-complet">{motifComplet}</Secondaire>}
          {refusInscription && !inscrireOuvert && <p role="alert" className="text-secondaire font-semibold text-sens-erreur">× {refusInscription}</p>}

          <Carte as="section" aria-label="Inscrits">
            {e.inscriptions.length === 0 ? <p className="px-5 py-4 text-second">Aucun inscrit.</p> : (
              <ul>
                {e.inscriptions.map((i, rang) => {
                  const encaissable = !payee(i) && (i.statut === 'retenue' || i.statut === 'confirmee') && (e.prixCentimes ?? 0) > 0;
                  const nom = nomComplet(i.personne);
                  const autres = [
                    i.statut !== 'confirmee' && !payee(i) ? { id: 'confirmer', libelle: 'Confirmer l’inscription', onChoisir: () => void agir(() => Clients.changerStatutInscription(i.id, 'confirmee')) } : null,
                    i.statut !== 'deconseillee' ? { id: 'deconseiller', libelle: 'Marquer déconseillée', onChoisir: () => void agir(() => Clients.changerStatutInscription(i.id, 'deconseillee')) } : null,
                    i.statut !== 'annulee' ? { id: 'desinscrire', libelle: 'Désinscrire', ton: 'erreur' as const, onChoisir: () => void agir(() => Clients.changerStatutInscription(i.id, 'annulee')) } : null,
                  ].filter((x): x is NonNullable<typeof x> => !!x);
                  return (
                    <li key={i.id} className={cx('flex flex-wrap items-center gap-4 py-2.5 pl-5 pr-3', rang > 0 && 'border-t border-bord')}>
                      <span className="flex min-w-60 flex-1 flex-col">
                        {i.personne.clientId
                          ? <a className={cx('self-start rounded-controle font-semibold text-texte hover:text-marque', FOCUS)} href={`#clients/${encodeURIComponent(i.personne.clientId)}`}>{nom}</a>
                          : <span className="font-semibold">{nom} <Pastille ton="alerte">À rattacher</Pastille></span>}
                        <Secondaire>{detailPaiement(i, e.prixCentimes)}</Secondaire>
                      </span>
                      <span className="w-32"><PastilleStatut i={i} /></span>
                      <span className="w-32">
                        {i.questionnaire
                          ? <a href={`#clients/questionnaire/${encodeURIComponent(i.questionnaire.id)}`} className={cx('rounded-full', FOCUS)}>
                              <Pastille ton={i.questionnaire.etat === 'relu' ? 'succes' : 'alerte'}>{i.questionnaire.etat === 'relu' ? 'Relu' : 'Non relu'}</Pastille>
                            </a>
                          : e.questionnaireRequis && active(i) ? <Pastille signe="">Pas reçu</Pastille> : null}
                      </span>
                      <span className="flex w-40 justify-end gap-1">
                        {encaissable && (
                          <Menu ouvert={menu === `${i.id}:encaisser`} onFermer={() => setMenu(null)} largeur={260}
                            entrees={[
                              { id: 'especes', libelle: 'En espèces', onChoisir: () => void agir(() => Clients.encaisserInscription(i.id, 'especes')) },
                              { id: 'virement', libelle: 'Par virement', onChoisir: () => void agir(() => Clients.encaisserInscription(i.id, 'virement')) },
                            ]}>
                            <Bouton taille="petit" intention="borde" aria-haspopup="menu" aria-expanded={menu === `${i.id}:encaisser`}
                              onClick={() => basculer(`${i.id}:encaisser`)}>Encaisser</Bouton>
                          </Menu>
                        )}
                        <Menu ouvert={menu === `${i.id}:autres`} onFermer={() => setMenu(null)} largeur={260} entrees={autres}>
                          <Bouton taille="petit" intention="souligne" aria-label={`Autres actions pour ${nom}`} aria-haspopup="menu" aria-expanded={menu === `${i.id}:autres`}
                            onClick={() => basculer(`${i.id}:autres`)}>···</Bouton>
                        </Menu>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Carte>
          <Secondaire>« Encaisser » enregistre un paiement en espèces ou par virement. « ··· » : changer le statut, désinscrire. Une place retenue se libère seule à son échéance.</Secondaire>
        </>
      )}

      {vue === 'stage' && (
        <div className="flex max-w-[770px] flex-col gap-4">
          {refusSuppression && <p role="alert" className="text-secondaire font-semibold text-sens-erreur">× {refusSuppression}</p>}
          {edition ? (
            <FormulaireEvenement initiale={initiale} libelle="Enregistrer" inscrits={e.placesOccupees ?? actives.length}
              onAnnuler={() => setEdition(false)}
              onSupprimer={() => setSupprimer(true)}
              enregistrer={async (s) => {
                const r = versRoute(s);
                if (typeof r === 'string') throw new Error(r);
                await Clients.modifierEvenement(id, r);
                await lecture.recharger();
                setEdition(false);
              }} />
          ) : <>
            <Carte as="section" className="flex flex-col gap-2.5 px-5 pb-4 pt-3.5">
              <Etiquette as="h2">Le stage</Etiquette>
              <LigneLecture nom="Type" valeur={libelleType(e.type)} />
              <LigneLecture nom="Ville" valeur={e.ville ?? '—'} />
              <LigneLecture nom="Quand" valeur={quand(e)} />
            </Carte>
            <Carte as="section" className="flex flex-col gap-2.5 px-5 pb-4 pt-3.5">
              <Etiquette as="h2">Inscriptions</Etiquette>
              <LigneLecture nom="Places" valeur={e.placesTotales === null ? 'non fixées' : `${e.placesTotales} · ${(e.placesLibres ?? 0) > 0 ? placesLibres(e.placesLibres ?? 0) : 'complet'}`} />
              <LigneLecture nom="Prix" valeur={e.prixCentimes === null ? '—' : `${montantEnClair(e.prixCentimes)}${e.prixCentimes ? ' par personne' : ''}`} />
              <LigneLecture nom="Questionnaire de santé" valeur={e.questionnaireRequis ? 'demandé à l’inscription' : 'non demandé'} />
              <LigneLecture nom="Inscription ailleurs" valeur={e.urlInscription ? <a className={cx('rounded-controle font-semibold text-marque', FOCUS)} href={e.urlInscription} target="_blank" rel="noreferrer">{e.urlInscription}</a> : 'non'} />
            </Carte>
            <Carte as="section" className="flex flex-col gap-2.5 px-5 pb-4 pt-3.5">
              <Etiquette as="h2">Pour les moteurs de recherche</Etiquette>
              <LigneLecture nom="Description" valeur={e.metaDescription ?? '—'} />
            </Carte>
            <Secondaire>Le texte de la page du site est repris tel quel de luminose.fr : il se modifie là-bas.</Secondaire>
          </>}
        </div>
      )}

      <Fenetre ouverte={inscrireOuvert} titre="Inscrire une personne" onFermer={() => { setInscrireOuvert(false); setRefusInscription(null); }}
        actions={<>
          <Bouton intention="souligne" onClick={() => { setInscrireOuvert(false); setRefusInscription(null); }}>Annuler</Bouton>
          <Bouton onClick={() => void inscrire()} disabled={!personne}>Inscrire</Bouton>
        </>}>
        <div className="flex flex-col gap-3">
          <ChoixFiche id="inscrire-personne" label="Personne" valeur={personne} onChange={setPersonne} autoFocus />
          {refusInscription && <p role="alert" className="text-secondaire font-semibold text-sens-erreur">× {refusInscription}</p>}
        </div>
      </Fenetre>

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
