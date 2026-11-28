/**
 * Une fiche (SPEC §15.4). En tête, le nom, l'âge, le téléphone et l'e-mail,
 * qu'on touche pour appeler ou écrire. Des cartes, chacune en lecture ;
 * « Modifier » la passe en saisie, avec Enregistrer et Annuler. Puis les
 * séances, les inscriptions, et chaque questionnaire reçu. Sur ordinateur, les cartes à
 * gauche, les séances à droite.
 *
 * Une carte modifiée et non enregistrée se signale avant de quitter l'écran ;
 * après un refus, la saisie reste en place.
 */
import { Bandeau } from '../charte/bandeau';
import { duree as dureeEnClair, heureListe, jourCourt, montant as montantEnClair } from '../../lib/format';
import React, { useEffect, useState } from 'react';
import { Bouton, Carte, Champ, Etiquette, FOCUS, Pastille as PastilleCharte, Secondaire, ZoneTexte } from '../charte';
import * as Clients from '../../services/clientsService';
import type { Confiance, Fiche, Professionnel } from '../../types-clients';
import {
  aller, dateCourte, euros, EtatLecture, heure, INSCRIPTIONS, jourEnLettres, messageDe, MODES, nomComplet,
  PAIEMENTS, useGardeSaisie, useLecture,
} from './commun';

/** Les tons de l'échelle d'avant (commun.tsx) vers ceux de la charte. */
const TONS: Record<string, 'succes' | 'alerte' | 'erreur' | 'neutre'> = { succes: 'succes', alerte: 'alerte', erreur: 'erreur', neutre: 'neutre' };
import { ChampsCoordonnees, ChampsEssentiels, ChampsProvenance, ChoixProfessionnel, SAISIE_VIDE, versRoute, type SaisieFiche } from './champsFiche';
import { ChoixFiche, type FicheChoisie } from './ChoixFiche';
import { PoserRendezVous } from './PoserRendezVous';

/**
 * Une ligne « libellé : valeur » d'une carte en lecture : la valeur dans une
 * seconde colonne de 150 px, alignée à gauche (retours du 28/11, §3). Une
 * valeur vide ne s'affiche pas : la carte dit « Compléter : … » une fois.
 */
const Ligne: React.FC<{ libelle: string; valeur: React.ReactNode }> = ({ libelle, valeur }) => (
  valeur ? (
    <div className="grid grid-cols-[150px_1fr] gap-3">
      <span className="text-second">{libelle}</span>
      <span className="min-w-0 break-words">{valeur}</span>
    </div>
  ) : null
);

/** « Compléter : naissance, profession », à la place des « — ». */
const Completer: React.FC<{ manque: (string | false | null | undefined)[]; onCompleter: () => void }> = ({ manque, onCompleter }) => {
  const liste = manque.filter((m): m is string => !!m);
  if (liste.length === 0) return null;
  return (
    <div className="grid grid-cols-[150px_1fr] gap-3">
      <span />
      <Bouton taille="petit" intention="souligne" className="!h-auto min-h-8 justify-self-start !whitespace-normal !px-0 text-left" onClick={onCompleter}>Compléter : {liste.join(', ')}</Bouton>
    </div>
  );
};

/**
 * Une carte qui se lit, puis se modifie. `enregistrer` lève en cas de refus : la
 * carte reste en saisie, le message de la route sous les champs.
 */
const CarteModifiable: React.FC<{
  titre: string;
  lecture: React.ReactNode;
  saisie: React.ReactNode;
  modifiee: boolean;
  enEdition: boolean;
  onModifier: () => void;
  onAnnuler: () => void;
  enregistrer: () => Promise<void>;
}> = ({ titre, lecture, saisie, modifiee, enEdition, onModifier, onAnnuler, enregistrer }) => {
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  useGardeSaisie(enEdition && modifiee);
  const valider = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnCours(true);
    setRefus(null);
    try {
      await enregistrer();
    } catch (err) {
      setRefus(messageDe(err));
    } finally {
      setEnCours(false);
    }
  };
  return (
    <Carte as="section" className="flex flex-col gap-2.5 px-5 pb-4 pt-3.5">
      <div className="flex min-h-8 items-center justify-between gap-3">
        {/* Un sur-titre, pas un titre d'élément (retours du 28/11, §3). */}
        <Etiquette as="h2">{titre}</Etiquette>
        {!enEdition && <Bouton taille="petit" intention="souligne" onClick={onModifier}>Modifier</Bouton>}
      </div>
      {enEdition ? (
        <form onSubmit={valider} className="flex flex-col gap-3">
          {saisie}
          {modifiee && <p className="text-secondaire text-sens-alerte">! Modifications non enregistrées.</p>}
          {refus && <p role="alert" className="text-secondaire font-semibold text-sens-erreur">× {refus}</p>}
          <div className="flex justify-end gap-2">
            <Bouton taille="petit" intention="souligne" onClick={() => { setRefus(null); onAnnuler(); }}>Annuler</Bouton>
            <Bouton type="submit" taille="petit" disabled={enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</Bouton>
          </div>
        </form>
      ) : lecture}
    </Carte>
  );
};

const depuisFiche = (f: Fiche): SaisieFiche => ({
  civilite: f.civilite ?? '', prenom: f.prenom, nom: f.nom, email: f.email ?? '', telephone: f.telephone ?? '',
  dateNaissance: f.dateNaissance ?? '', profession: f.profession ?? '', adresse: f.adresse ?? '', codePostal: f.codePostal ?? '',
  ville: f.ville ?? '', pays: f.pays ?? '', origine: f.origine ?? '', motCleGoogleAds: f.motCleGoogleAds ?? '',
});

const CHAMPS_IDENTITE: (keyof SaisieFiche)[] = ['civilite', 'prenom', 'nom', 'email', 'telephone', 'dateNaissance', 'profession', 'adresse', 'codePostal', 'ville', 'pays'];
const CHAMPS_PROVENANCE: (keyof SaisieFiche)[] = ['origine', 'motCleGoogleAds'];
const extrait = (s: SaisieFiche, champs: (keyof SaisieFiche)[]) => Object.fromEntries(champs.map((c) => [c, s[c]])) as Partial<SaisieFiche>;
const differe = (a: SaisieFiche, b: SaisieFiche, champs: (keyof SaisieFiche)[]) => champs.some((c) => a[c] !== b[c]);

type Carteid = 'identite' | 'provenance' | 'confiance' | 'notes';

const LIEN = `rounded-controle font-semibold text-marque ${FOCUS}`;

export const FicheView: React.FC<{ id: string }> = ({ id }) => {
  const lecture = useLecture(() => Clients.lireFiche(id), [id]);
  const [edition, setEdition] = useState<Carteid | null>(null);
  const [saisie, setSaisie] = useState<SaisieFiche>(SAISIE_VIDE);
  const [viaPro, setViaPro] = useState('');
  const [viaClient, setViaClient] = useState<FicheChoisie | null>(null);
  const [couple, setCouple] = useState<FicheChoisie | null>(null);
  const [professionnels, setProfessionnels] = useState<Pick<Professionnel, 'id' | 'nom'>[]>([]);
  const [confiance, setConfiance] = useState<Confiance | null>(null);
  const [saisieConfiance, setSaisieConfiance] = useState({ civilite: '', prenom: '', nom: '', telephone: '', email: '' });
  const [note, setNote] = useState<{ texte: string; version: number | null } | null>(null);
  const [saisieNote, setSaisieNote] = useState('');
  const [rdvOuvert, setRdvOuvert] = useState(false);
  const [toutesLesSeances, setToutesLesSeances] = useState(false);

  const fiche = lecture.phase === 'prete' ? lecture.donnees : null;

  // La note et la personne de confiance ont leurs routes (règle 4) : lues à part, après la fiche.
  useEffect(() => {
    if (!fiche) return;
    setSaisie(depuisFiche(fiche));
    setViaPro(fiche.viaProfessionnel?.id ?? '');
    setViaClient(fiche.viaClient);
    setCouple(fiche.couple);
  }, [fiche]);
  useEffect(() => {
    let vivant = true;
    Clients.lireConfiance(id).then((r) => { if (vivant) setConfiance(r.confiance); }).catch(() => {});
    Clients.lireNoteFiche(id).then((n) => { if (vivant) { setNote(n); setSaisieNote(n.texte); } }).catch(() => {});
    Clients.listeProfessionnels().then((r) => { if (vivant) setProfessionnels(r.professionnels); }).catch(() => {});
    return () => { vivant = false; };
  }, [id]);

  if (!fiche) return <div className="mx-auto max-w-[1180px] px-4 py-5 md:px-8"><EtatLecture lecture={lecture} /></div>;

  const origine = depuisFiche(fiche);
  const changer = (champ: keyof SaisieFiche, valeur: string) => setSaisie((s) => ({ ...s, [champ]: valeur }));
  const terminer = async () => { setEdition(null); await lecture.recharger(); };
  const annuler = () => { setEdition(null); setSaisie(origine); setViaPro(fiche.viaProfessionnel?.id ?? ''); setViaClient(fiche.viaClient); setCouple(fiche.couple); };

  const confianceDe = (c: Confiance | null) => ({
    civilite: c?.civilite ?? '', prenom: c?.prenom ?? '', nom: c?.nom ?? '', telephone: c?.telephone ?? '', email: c?.email ?? '',
  });

  // Une absence non réglée : Florent ne reprend pas la personne tant qu'elle n'est pas régularisée
  // (décision du 28/11/2026). Elle se voit en tête de la fiche, en rouge.
  const dettes = fiche.seances.filter((x) => x.statut === 'absent' && (x.etatPaiement === 'a_payer' || x.etatPaiement === 'attente_especes'));
  const provenance = [fiche.origine, fiche.motCleGoogleAds ? `mot-clé : ${fiche.motCleGoogleAds}` : null].filter(Boolean).join(' · ');
  const realisees = fiche.seances.filter((x) => x.statut === 'realisee').length;
  const aVenir = fiche.seances.filter((x) => x.statut === 'prevue' && Date.parse(x.debut) > Date.now()).length;
  // « À venir » puis « Passées » (§3), chacune de la plus tardive à la plus ancienne, comme la maquette.
  const parDateDecroissante = (a: { debut: string }, b: { debut: string }) => Date.parse(b.debut) - Date.parse(a.debut);
  const seancesAVenir = fiche.seances.filter((x) => x.statut === 'prevue' && Date.parse(x.debut) > Date.now()).sort(parDateDecroissante);
  const passees = fiche.seances.filter((x) => !seancesAVenir.includes(x)).sort(parDateDecroissante);
  const passeesVues = toutesLesSeances ? passees : passees.slice(0, 5);

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-4 py-5 font-charte text-courant text-texte md:px-8 md:py-6">
      <Bandeau fil={{ libelle: 'Clients', href: '#clients' }} titre={nomComplet(fiche)}
        actions={<Bouton onClick={() => setRdvOuvert(true)}>Poser un rendez-vous</Bouton>} />
      {/* L'âge, le téléphone et l'e-mail sur une ligne, sans « · » : des liens de la marque, sans soulignement (§3). */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {fiche.age !== null && <span>{fiche.age} ans</span>}
        {fiche.telephone && <a className={`rounded-controle font-semibold text-marque ${FOCUS}`} href={`tel:${fiche.telephone.replace(/\s/g, '')}`}>{fiche.telephone}</a>}
        {fiche.email && <a className={`rounded-controle font-semibold text-marque ${FOCUS}`} href={`mailto:${fiche.email}`}>{fiche.email}</a>}
        <Secondaire>{provenance ? `Venue par ${provenance}` : 'Provenance inconnue'}</Secondaire>
      </div>

      {dettes.length > 0 && (
        <Carte as="div" role="alert" className="!border-sens-erreur !bg-sens-erreur-fond px-4 py-3 text-sens-erreur">
          <p className="font-semibold">× {dettes.length === 1 ? 'Une absence n’est pas réglée' : `${dettes.length} absences ne sont pas réglées`} : à régulariser avant toute nouvelle séance.</p>
          <p className="text-secondaire">{dettes.map((x) => `${jourEnLettres(x.debut)} (${montantEnClair(x.montantCentimes)})`).join(' · ')}</p>
        </Carte>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <CarteModifiable
            titre="Identité et coordonnées"
            enEdition={edition === 'identite'}
            modifiee={differe(saisie, origine, CHAMPS_IDENTITE)}
            onModifier={() => setEdition('identite')}
            onAnnuler={annuler}
            enregistrer={async () => { await Clients.modifierFiche(id, versRoute(extrait(saisie, CHAMPS_IDENTITE)) as never); await terminer(); }}
            saisie={<><ChampsEssentiels saisie={saisie} changer={changer} prefixe="fiche" focus /><ChampsCoordonnees saisie={saisie} changer={changer} prefixe="fiche" /></>}
            lecture={(
              <div className="flex flex-col gap-2.5">
                <Ligne libelle="Civilité" valeur={fiche.civilite} />
                <Ligne libelle="Date de naissance" valeur={fiche.dateNaissance ? dateCourte(`${fiche.dateNaissance}T12:00:00Z`) : null} />
                <Ligne libelle="Profession" valeur={fiche.profession} />
                <Ligne libelle="Adresse" valeur={[fiche.adresse, [fiche.codePostal, fiche.ville].filter(Boolean).join(' '), fiche.pays].filter(Boolean).join(', ')} />
                <Completer onCompleter={() => setEdition('identite')} manque={[
                  !fiche.civilite && 'civilité', !fiche.dateNaissance && 'naissance', !fiche.profession && 'profession',
                  !(fiche.adresse || fiche.ville) && 'adresse',
                ]} />
              </div>
            )}
          />

          <CarteModifiable
            titre="Provenance et liens"
            enEdition={edition === 'provenance'}
            modifiee={differe(saisie, origine, CHAMPS_PROVENANCE) || viaPro !== (fiche.viaProfessionnel?.id ?? '') || viaClient?.id !== fiche.viaClient?.id || couple?.id !== fiche.couple?.id}
            onModifier={() => setEdition('provenance')}
            onAnnuler={annuler}
            enregistrer={async () => {
              await Clients.modifierFiche(id, {
                ...(versRoute(extrait(saisie, CHAMPS_PROVENANCE)) as object),
                viaProfessionnelId: viaPro || null, viaClientId: viaClient?.id ?? null, coupleClientId: couple?.id ?? null,
              });
              await terminer();
            }}
            saisie={(
              <>
                <ChampsProvenance saisie={saisie} changer={changer} prefixe="fiche" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <ChoixProfessionnel id="fiche-via-pro" valeur={viaPro} onChange={setViaPro} professionnels={professionnels} />
                  <ChoixFiche id="fiche-via-client" label="Venu par une personne" valeur={viaClient} onChange={setViaClient} sauf={id} />
                  <ChoixFiche id="fiche-couple" label="Couple" valeur={couple} onChange={setCouple} sauf={id} />
                </div>
              </>
            )}
            lecture={(
              <div className="flex flex-col gap-2.5">
                <Ligne libelle="Origine" valeur={fiche.origine} />
                <Ligne libelle="Mot-clé" valeur={fiche.motCleGoogleAds} />
                <Ligne libelle="Venu par un professionnel" valeur={fiche.viaProfessionnel?.nom} />
                <Ligne libelle="Venu par" valeur={fiche.viaClient && <a className={LIEN} href={`#clients/${fiche.viaClient.id}`}>{nomComplet(fiche.viaClient)}</a>} />
                <Ligne libelle="Couple" valeur={fiche.couple && <a className={LIEN} href={`#clients/${fiche.couple.id}`}>{nomComplet(fiche.couple)}</a>} />
                <Ligne libelle="A recommandé" valeur={fiche.aRecommande.length ? fiche.aRecommande.map((r, i) => (
                  <React.Fragment key={r.id}>{i > 0 && ', '}<a className={LIEN} href={`#clients/${r.id}`}>{nomComplet(r)}</a></React.Fragment>
                )) : null} />
                <Completer onCompleter={() => setEdition('provenance')} manque={[!fiche.origine && 'origine']} />
              </div>
            )}
          />

          <CarteModifiable
            titre="Personne de confiance"
            enEdition={edition === 'confiance'}
            modifiee={JSON.stringify(saisieConfiance) !== JSON.stringify(confianceDe(confiance))}
            onModifier={() => { setSaisieConfiance(confianceDe(confiance)); setEdition('confiance'); }}
            onAnnuler={() => { setSaisieConfiance(confianceDe(confiance)); setEdition(null); }}
            enregistrer={async () => {
              const v = Object.fromEntries(Object.entries(saisieConfiance).map(([k, x]) => [k, x.trim() || null])) as Omit<Confiance, 'misAJourLe'>;
              await Clients.ecrireConfiance(id, v);
              setConfiance((await Clients.lireConfiance(id)).confiance);
              setEdition(null);
            }}
            saisie={(
              <div className="grid gap-3 sm:grid-cols-2">
                {(['civilite', 'prenom', 'nom', 'telephone', 'email'] as const).map((c, i) => (
                  <Champ key={c} id={`confiance-${c}`} autoFocus={i === 0}
                    label={{ civilite: 'Civilité', prenom: 'Prénom', nom: 'Nom', telephone: 'Téléphone', email: 'E-mail' }[c]}
                    value={saisieConfiance[c]} onChange={(e) => setSaisieConfiance((s) => ({ ...s, [c]: e.target.value }))} />
                ))}
              </div>
            )}
            lecture={confiance ? (
              <div className="flex flex-col gap-2.5">
                <Ligne libelle="Nom" valeur={[confiance.civilite, confiance.prenom, confiance.nom].filter(Boolean).join(' ')} />
                <Ligne libelle="Téléphone" valeur={confiance.telephone} />
                <Ligne libelle="E-mail" valeur={confiance.email} />
              </div>
            ) : <Bouton taille="petit" intention="souligne" className="self-start !px-0" onClick={() => { setSaisieConfiance(confianceDe(confiance)); setEdition('confiance'); }}>Compléter : la personne de confiance</Bouton>}
          />

          <CarteModifiable
            titre="Notes de la fiche"
            enEdition={edition === 'notes'}
            modifiee={saisieNote !== (note?.texte ?? '')}
            onModifier={() => setEdition('notes')}
            onAnnuler={() => { setSaisieNote(note?.texte ?? ''); setEdition(null); }}
            enregistrer={async () => {
              // La version lue part avec le texte : si la note a changé ailleurs, la route refuse (409) et le texte reste.
              const { version } = await Clients.ecrireNoteFiche(id, saisieNote, note?.version ?? null);
              setNote({ texte: saisieNote, version });
              setEdition(null);
            }}
            saisie={<ZoneTexte id="fiche-note" label="Note" rows={8} value={saisieNote} autoFocus onChange={(e) => setSaisieNote(e.target.value)} />}
            lecture={note?.texte ? <p className="whitespace-pre-wrap">{note.texte}</p> : <Secondaire>Aucune note.</Secondaire>}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Carte as="section" className="overflow-hidden">
            <div className="flex items-baseline justify-between gap-3 px-5 pb-1.5 pt-3.5">
              <Etiquette as="h2">Séances</Etiquette>
              <Secondaire>{realisees} réalisée{realisees > 1 ? 's' : ''} · {aVenir} à venir</Secondaire>
            </div>
            {fiche.seances.length === 0 ? <Secondaire className="px-5 pb-3">Aucune séance.</Secondaire> : (
              [{ nom: 'À venir', seances: seancesAVenir }, { nom: 'Passées', seances: passeesVues }].filter((g) => g.seances.length > 0).map((g) => (
                <div key={g.nom}>
                  <p className="px-5 pb-1 pt-2.5 text-secondaire font-medium text-second">{g.nom}</p>
                  <ul>
                    {g.seances.map((x) => (
                      <li key={x.id}>
                        {/* Une séance se lit par sa date ; plus de « Séance 6 » dans le titre (§3). */}
                        <a href={`#agenda/${encodeURIComponent(x.id)}`} className="flex items-center gap-3 px-5 py-2 outline-none hover:bg-survole focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-marque">
                          <span className="flex min-w-38 flex-1 flex-col">
                            <span className="whitespace-nowrap font-semibold tabular-nums">{jourCourt(x.debut)} · {heureListe(x.debut)}</span>
                            <Secondaire className="truncate">{[x.type?.libelle ?? x.libelleImporte ?? 'Type inconnu', x.mode && MODES[x.mode].toLowerCase(), dureeEnClair(x.dureeMin)].filter(Boolean).join(' · ')}</Secondaire>
                          </span>
                          <span className="flex min-w-0 flex-wrap justify-end gap-1.5">
                            {x.statut === 'realisee' ? <PastilleCharte ton="succes">Réalisée</PastilleCharte>
                              : x.statut === 'annulee' ? <PastilleCharte signe="×">Annulée</PastilleCharte>
                                : x.statut === 'absent' ? <PastilleCharte ton="erreur">Absente</PastilleCharte>
                                  : <PastilleCharte signe="○">Prévue</PastilleCharte>}
                            {x.etatPaiement === 'payee' ? <PastilleCharte ton="succes">Payée</PastilleCharte>
                              : x.etatPaiement === 'offerte' || x.etatPaiement === 'annulee' || x.statut === 'annulee' || (x.statut === 'prevue' && Date.parse(x.debut) > Date.now()) ? null
                                : <PastilleCharte ton={x.statut === 'absent' ? 'erreur' : 'alerte'}>{PAIEMENTS[x.etatPaiement].libelle}</PastilleCharte>}
                          </span>
                          <Secondaire className="w-14 flex-none text-right tabular-nums">{x.etatPaiement === 'offerte' ? 'offerte' : montantEnClair(x.montantCentimes)}</Secondaire>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
            {passees.length > 5 && !toutesLesSeances && (
              <div className="border-t border-bord px-3 py-2">
                <Bouton taille="petit" intention="souligne" onClick={() => setToutesLesSeances(true)}>Voir les {passees.length - 5} séances plus anciennes</Bouton>
              </div>
            )}
          </Carte>

          <Carte as="section" className="overflow-hidden">
            <div className="px-5 pb-1.5 pt-3.5"><Etiquette as="h2">Stages</Etiquette></div>
            {fiche.inscriptions.length === 0 ? <Secondaire className="px-5 pb-3">Aucune inscription.</Secondaire> : (
              <ul className="pb-1.5">
                {fiche.inscriptions.map((i) => (
                  <li key={i.id}>
                    <a className="flex items-center gap-3 px-5 py-2 outline-none hover:bg-survole focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-marque" href={`#stages/${encodeURIComponent(i.evenement.id)}`}>
                      <span className="flex min-w-0 flex-1 flex-col"><span className="font-semibold">{i.evenement.nom}</span><Secondaire>{jourEnLettres(i.evenement.debut)}</Secondaire></span>
                      <PastilleCharte ton={TONS[INSCRIPTIONS[i.statut].ton]}>{INSCRIPTIONS[i.statut].libelle}</PastilleCharte>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Carte>

          <Carte as="section" className="overflow-hidden">
            <div className="px-5 pb-1.5 pt-3.5"><Etiquette as="h2">Questionnaires de santé</Etiquette></div>
            {fiche.listeQuestionnaires.length === 0 ? <Secondaire className="px-5 pb-3">Aucun questionnaire.</Secondaire> : (
              <ul className="pb-1.5">
                {fiche.listeQuestionnaires.map((q) => (
                  <li key={q.id}>
                    <a href={`#clients/questionnaire/${encodeURIComponent(q.id)}`} className="flex items-center gap-3 px-5 py-2 outline-none hover:bg-survole focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-marque">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-semibold">Reçu le {dateCourte(q.date)}</span>
                        {q.version && <Secondaire>version {q.version === 'complet' ? 'complète' : 'de suivi'}</Secondaire>}
                      </span>
                      <span className="flex gap-1.5">
                        <PastilleCharte ton={q.relu ? 'succes' : 'alerte'}>{q.relu ? 'Relu' : 'Non relu'}</PastilleCharte>
                        {q.aRevoir && <PastilleCharte ton="erreur">À revoir</PastilleCharte>}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Carte>
        </div>
      </div>

      {rdvOuvert && (
        <PoserRendezVous
          fiche={{ id: fiche.id, prenom: fiche.prenom, nom: fiche.nom }}
          onFermer={() => setRdvOuvert(false)}
          onPose={(seanceId) => { setRdvOuvert(false); aller(`agenda/${encodeURIComponent(seanceId)}`); }}
        />
      )}
    </div>
  );
};

export default FicheView;
