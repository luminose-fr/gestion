/**
 * Une fiche (SPEC §15.4). En tête, le nom, l'âge, le téléphone et l'e-mail,
 * qu'on touche pour appeler ou écrire. Des cartes, chacune en lecture ;
 * « Modifier » la passe en saisie, avec Enregistrer et Annuler. Puis les
 * séances, les inscriptions et les questionnaires. Sur ordinateur, les cartes à
 * gauche, les séances à droite.
 *
 * Une carte modifiée et non enregistrée se signale avant de quitter l'écran ;
 * après un refus, la saisie reste en place.
 */
import React, { useEffect, useState } from 'react';
import { ArrowLeft, CalendarPlus, Mail, Pencil, Phone } from 'lucide-react';
import { Bouton, Carte, Champ, TitreSection, ecran } from '../ui';
import * as Clients from '../../services/clientsService';
import type { Confiance, Fiche, Professionnel } from '../../types-clients';
import {
  aller, Avis, dateCourte, euros, EtatLecture, heure, INSCRIPTIONS, jourEnLettres, messageDe, MODES, nomComplet,
  Pastille, PastillePaiement, PastilleStatut, useGardeSaisie, useLecture, Vide,
} from './commun';
import { ChampsCoordonnees, ChampsEssentiels, ChampsProvenance, ChoixProfessionnel, SAISIE_VIDE, versRoute, type SaisieFiche } from './champsFiche';
import { ChoixFiche, type FicheChoisie } from './ChoixFiche';
import { PoserRendezVous } from './PoserRendezVous';

/** Une ligne « libellé : valeur » d'une carte en lecture. */
const Ligne: React.FC<{ libelle: string; valeur: React.ReactNode }> = ({ libelle, valeur }) => (
  <div className="flex justify-between gap-3 text-sm">
    <span className="text-brand-main dark:text-dark-text">{libelle}</span>
    <span className="text-right font-semibold text-brand-main dark:text-white min-w-0 break-words">{valeur || '—'}</span>
  </div>
);

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
    <Carte densite="contenu" rythme>
      <TitreSection
        as="h3"
        titre={titre}
        action={!enEdition && <Bouton taille="petit" intention="secondaire" onClick={onModifier}><Pencil /> Modifier</Bouton>}
      />
      {enEdition ? (
        <form onSubmit={valider} className="space-y-3">
          {saisie}
          {modifiee && <p className="text-xs text-alerte">Modifications non enregistrées.</p>}
          {refus && <Avis ton="erreur">{refus}</Avis>}
          <div className="flex justify-end gap-2">
            <Bouton type="button" taille="petit" intention="discrete" onClick={() => { setRefus(null); onAnnuler(); }}>Annuler</Bouton>
            <Bouton type="submit" taille="petit" intention="principale" disabled={enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</Bouton>
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

  if (!fiche) return <div className={ecran('liste')}><EtatLecture lecture={lecture} /></div>;

  const origine = depuisFiche(fiche);
  const changer = (champ: keyof SaisieFiche, valeur: string) => setSaisie((s) => ({ ...s, [champ]: valeur }));
  const terminer = async () => { setEdition(null); await lecture.recharger(); };
  const annuler = () => { setEdition(null); setSaisie(origine); setViaPro(fiche.viaProfessionnel?.id ?? ''); setViaClient(fiche.viaClient); setCouple(fiche.couple); };

  const confianceDe = (c: Confiance | null) => ({
    civilite: c?.civilite ?? '', prenom: c?.prenom ?? '', nom: c?.nom ?? '', telephone: c?.telephone ?? '', email: c?.email ?? '',
  });

  return (
    <div className={`${ecran('liste')} space-y-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Bouton taille="petit" intention="discrete" onClick={() => aller('clients')}><ArrowLeft /> Fiches</Bouton>
          <h2 className="mt-2 text-lg font-bold text-brand-main dark:text-white">
            {nomComplet(fiche)}{fiche.age !== null && <span className="font-normal"> · {fiche.age} ans</span>}
          </h2>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {fiche.telephone && <a className="inline-flex items-center gap-1.5 text-brand-main dark:text-dark-text underline hover:no-underline" href={`tel:${fiche.telephone.replace(/\s/g, '')}`}><Phone className="size-4" />{fiche.telephone}</a>}
            {fiche.email && <a className="inline-flex items-center gap-1.5 text-brand-main dark:text-dark-text underline hover:no-underline" href={`mailto:${fiche.email}`}><Mail className="size-4" />{fiche.email}</a>}
          </div>
        </div>
        <Bouton intention="principale" posee onClick={() => setRdvOuvert(true)}><CalendarPlus /> Poser un rendez-vous</Bouton>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <div className="space-y-4">
          <CarteModifiable
            titre="Identité et coordonnées"
            enEdition={edition === 'identite'}
            modifiee={differe(saisie, origine, CHAMPS_IDENTITE)}
            onModifier={() => setEdition('identite')}
            onAnnuler={annuler}
            enregistrer={async () => { await Clients.modifierFiche(id, versRoute(extrait(saisie, CHAMPS_IDENTITE)) as never); await terminer(); }}
            saisie={<><ChampsEssentiels saisie={saisie} changer={changer} prefixe="fiche" focus /><ChampsCoordonnees saisie={saisie} changer={changer} prefixe="fiche" /></>}
            lecture={(
              <div className="space-y-1.5">
                <Ligne libelle="Civilité" valeur={fiche.civilite} />
                <Ligne libelle="Date de naissance" valeur={fiche.dateNaissance ? dateCourte(`${fiche.dateNaissance}T12:00:00Z`) : null} />
                <Ligne libelle="Profession" valeur={fiche.profession} />
                <Ligne libelle="Adresse" valeur={[fiche.adresse, [fiche.codePostal, fiche.ville].filter(Boolean).join(' '), fiche.pays].filter(Boolean).join(', ')} />
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
              <div className="space-y-1.5">
                <Ligne libelle="Origine" valeur={fiche.origine} />
                <Ligne libelle="Mot-clé" valeur={fiche.motCleGoogleAds} />
                <Ligne libelle="Venu par un professionnel" valeur={fiche.viaProfessionnel?.nom} />
                <Ligne libelle="Venu par" valeur={fiche.viaClient && <a className="underline hover:no-underline" href={`#clients/${fiche.viaClient.id}`}>{nomComplet(fiche.viaClient)}</a>} />
                <Ligne libelle="Couple" valeur={fiche.couple && <a className="underline hover:no-underline" href={`#clients/${fiche.couple.id}`}>{nomComplet(fiche.couple)}</a>} />
                <Ligne libelle="A recommandé" valeur={fiche.aRecommande.length ? fiche.aRecommande.map((r, i) => (
                  <React.Fragment key={r.id}>{i > 0 && ', '}<a className="underline hover:no-underline" href={`#clients/${r.id}`}>{nomComplet(r)}</a></React.Fragment>
                )) : null} />
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
                    value={saisieConfiance[c]} onChange={(e) => setSaisieConfiance((s) => ({ ...s, [c]: (e.target as HTMLInputElement).value }))} />
                ))}
              </div>
            )}
            lecture={confiance ? (
              <div className="space-y-1.5">
                <Ligne libelle="Nom" valeur={[confiance.civilite, confiance.prenom, confiance.nom].filter(Boolean).join(' ')} />
                <Ligne libelle="Téléphone" valeur={confiance.telephone} />
                <Ligne libelle="E-mail" valeur={confiance.email} />
              </div>
            ) : <p className="text-sm text-brand-main dark:text-dark-text">Aucune personne de confiance.</p>}
          />

          <CarteModifiable
            titre="Notes"
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
            saisie={<Champ multiligne id="fiche-note" label="Note" rows={8} value={saisieNote} autoFocus onChange={(e) => setSaisieNote((e.target as HTMLTextAreaElement).value)} />}
            lecture={note?.texte ? <p className="text-sm text-brand-main dark:text-white whitespace-pre-wrap">{note.texte}</p> : <p className="text-sm text-brand-main dark:text-dark-text">Aucune note.</p>}
          />
        </div>

        <div className="space-y-4">
          <Carte densite="contenu" rythme>
            <TitreSection as="h3" titre="Séances" action={<Bouton taille="petit" intention="secondaire" onClick={() => setRdvOuvert(true)}><CalendarPlus /> Poser un rendez-vous</Bouton>} />
            {fiche.seances.length === 0 ? <Vide>Aucune séance.</Vide> : (
              <ul className="divide-y divide-brand-border dark:divide-dark-sec-border">
                {fiche.seances.map((s) => (
                  <li key={s.id}>
                    <a href={`#seances/${encodeURIComponent(s.id)}`} className="ui-list-action block py-2 hover:bg-survol dark:hover:bg-dark-sec-bg rounded-lg px-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-brand-main dark:text-white">
                          {s.numero !== null && <span className="tabular-nums">Séance {s.numero} · </span>}
                          {jourEnLettres(s.debut)}, {heure(s.debut)}
                        </span>
                        <span className="text-xs text-brand-main dark:text-dark-text tabular-nums">{euros(s.montantCentimes)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-brand-main dark:text-dark-text">{s.type?.libelle ?? s.libelleImporte ?? 'Type inconnu'}{s.mode && ` · ${MODES[s.mode]}`}</span>
                        <PastilleStatut statut={s.statut} />
                        <PastillePaiement etat={s.etatPaiement} />
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Carte>

          <Carte densite="contenu" rythme>
            <TitreSection as="h3" titre="Inscriptions" />
            {fiche.inscriptions.length === 0 ? <Vide>Aucune inscription.</Vide> : (
              <ul className="divide-y divide-brand-border dark:divide-dark-sec-border">
                {fiche.inscriptions.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                    <a className="text-sm text-brand-main dark:text-white underline hover:no-underline" href={`#evenements/${encodeURIComponent(i.evenement.id)}`}>
                      {i.evenement.nom} · {dateCourte(i.evenement.debut)}
                    </a>
                    <Pastille libelle={INSCRIPTIONS[i.statut].libelle} ton={INSCRIPTIONS[i.statut].ton} />
                  </li>
                ))}
              </ul>
            )}
          </Carte>

          <Carte densite="contenu" rythme>
            <TitreSection as="h3" titre="Questionnaires" />
            {fiche.listeQuestionnaires.length === 0 ? <Vide>Aucun questionnaire.</Vide> : (
              <ul className="divide-y divide-brand-border dark:divide-dark-sec-border">
                {fiche.listeQuestionnaires.map((q) => (
                  <li key={q.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="text-sm text-brand-main dark:text-white">
                      {dateCourte(q.date)}{q.version && <span className="text-xs text-brand-main dark:text-dark-text"> · {q.version === 'complet' ? 'Complet' : 'Suivi'}</span>}
                    </span>
                    <span className="flex gap-1.5">
                      <Pastille libelle={q.relu ? 'Relu' : 'Non relu'} ton={q.relu ? 'succes' : 'alerte'} />
                      {q.aRevoir && <Pastille libelle="À revoir" ton="erreur" />}
                    </span>
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
          onPose={(seanceId) => { setRdvOuvert(false); aller(`seances/${encodeURIComponent(seanceId)}`); }}
        />
      )}
    </div>
  );
};

export default FicheView;
