/**
 * Poser un rendez-vous pour un invité, depuis une fiche Notion.
 *
 * Le but tient en une phrase : **que l'invité reçoive les SMS de rappel sans
 * avoir à confirmer son numéro**. Depuis quelques mois, Calendly demande cette
 * confirmation à qui réserve lui-même ; quand le rendez-vous est posé pour
 * quelqu'un — au téléphone, en fin de séance — personne n'est là pour
 * répondre, et les rappels ne partent jamais. La Scheduling API, elle, accepte
 * un numéro fourni par le compte.
 *
 * L'écran s'ouvre donc déjà rempli, depuis un lien de la fiche client :
 *
 *   https://gestion.luminose.fr/?prenom=Marie&nom=Durand
 *     &email=marie@exemple.fr&tel=0612345678#clients
 *
 * Les paramètres vivent dans la query string et non dans le hash, parce que le
 * hash porte déjà la navigation de l'application. Ils sont lus une seule fois,
 * au montage : une fois l'écran ouvert, c'est la saisie qui fait foi — sans
 * quoi un rechargement effacerait une correction.
 *
 * Tout est visible d'un coup — types en boutons radio, trois mois de créneaux
 * à la suite. C'est un écran qu'on utilise le téléphone à l'oreille : chaque
 * repli, chaque liste déroulante y coûte une hésitation devant quelqu'un.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Check, MessageSquare, RefreshCw, Settings2, TriangleAlert, Video } from 'lucide-react';
import {
  fetchRdvTypes, fetchRdvCreneaux, creerRdv, fetchRdvSelection, enregistrerRdvSelection,
} from '../../services/apiService';
import type { RdvType, RdvCreneau, RdvConfirme, RdvQuestion } from '@luminose/shared';

/** Trois mois, d'un seul tenant : le Worker découpe, l'écran ne le sait pas. */
const JOURS = 92;

const KINDS_AVEC_TEXTE = ['custom', 'physical', 'ask_invitee', 'outbound_call'];

/** Le vocabulaire de Calendly, dans celui du produit. */
const NOM_DU_LIEU: Record<string, string> = {
  google_conference: 'Google Meet',
  zoom_conference: 'Zoom',
  microsoft_teams_conference: 'Teams',
  custom: 'Lieu indiqué',
  physical: 'Adresse',
  outbound_call: 'J’appelle l’invité',
  inbound_call: 'L’invité m’appelle',
  ask_invitee: 'À demander à l’invité',
};

/**
 * Le « + » d'un numéro international, rendu à sa place.
 *
 * Dans une query string, `+` VEUT DIRE espace : c'est la règle des formulaires
 * HTML, et `URLSearchParams` l'applique. Un lien Notion portant
 * `tel=+33 6 37…` arrive donc dans le champ sous la forme ` 33 6 37…`, amputé
 * du seul caractère qui disait que le numéro est international.
 *
 * Plutôt que d'exiger `%2B` dans chaque lien — une discipline qu'on oublie une
 * fois sur deux — on regarde la chaîne BRUTE : si la valeur y commence par un
 * `+`, on le remet. Les espaces encodés de la même façon, eux, restent des
 * espaces : c'est ce qui distingue ce rattrapage d'un décodage refait à la main.
 */
const plusInitial = (noms: string[]): boolean => {
  for (const n of noms) {
    const m = new RegExp(`[?&]${n}=([^&#]*)`).exec(window.location.search);
    if (m?.[1]?.startsWith('+')) return true;
  }
  return false;
};

const lireParametres = () => {
  const p = new URLSearchParams(window.location.search);
  const champ = (...noms: string[]) => {
    for (const n of noms) {
      const v = p.get(n);
      if (v && v.trim()) return v.trim();
    }
    return '';
  };
  const prenom = champ('prenom', 'firstname', 'first_name');
  const nom = champ('nom', 'lastname', 'last_name');
  const NOMS_TEL = ['tel', 'telephone', 'phone', 'mobile'];
  const telephone = champ(...NOMS_TEL);
  return {
    // Notion peut envoyer le nom complet d'un bloc ou les deux champs séparés.
    nom: champ('nomComplet', 'name') || [prenom, nom].filter(Boolean).join(' '),
    email: champ('email', 'mail'),
    telephone: telephone && plusInitial(NOMS_TEL) ? `+${telephone}` : telephone,
  };
};

const MOIS = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const JOUR = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const HEURE = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Les créneaux regroupés par journée, les journées par mois — dans l'ordre. */
const parMois = (creneaux: RdvCreneau[]) => {
  const jours = new Map<string, { date: Date; heures: Date[] }>();
  for (const c of creneaux) {
    const d = new Date(c.debut);
    const cle = d.toLocaleDateString('fr-FR');
    if (!jours.has(cle)) jours.set(cle, { date: d, heures: [] });
    jours.get(cle)!.heures.push(d);
  }
  const ordonnes = [...jours.values()].sort((a, b) => a.date.getTime() - b.date.getTime());

  const mois = new Map<string, { titre: string; jours: typeof ordonnes }>();
  for (const j of ordonnes) {
    const cle = `${j.date.getFullYear()}-${j.date.getMonth()}`;
    if (!mois.has(cle)) mois.set(cle, { titre: MOIS.format(j.date), jours: [] });
    mois.get(cle)!.jours.push(j);
  }
  return [...mois.values()];
};

/**
 * Ce qu'une question vaut au départ.
 *
 * Une question à choix unique qui n'a qu'une seule réponse possible — les
 * conditions d'annulation — se coche d'elle-même : la faire cliquer serait
 * demander d'approuver à la place de l'invité un texte qu'il a déjà accepté
 * ailleurs, et ralentir le seul moment où l'écran doit être rapide.
 */
const reponseInitiale = (q: RdvQuestion): string[] =>
  q.type === 'single_select' && q.choix.length === 1 ? [q.choix[0]] : [];

const champClasses =
  'w-full text-sm p-2.5 rounded-lg border border-brand-light dark:border-dark-sec-bg bg-transparent ' +
  'text-brand-main dark:text-dark-text placeholder:text-brand-main/35 dark:placeholder:text-dark-text/30 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-main/30';

const RdvView: React.FC = () => {
  const initial = useMemo(lireParametres, []);

  const [nom, setNom] = useState(initial.nom);
  const [email, setEmail] = useState(initial.email);
  const [telephone, setTelephone] = useState(initial.telephone);

  const [types, setTypes] = useState<RdvType[] | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [reglage, setReglage] = useState(false);
  const [typeUri, setTypeUri] = useState<string>('');
  const [lieuKind, setLieuKind] = useState('');
  const [lieuTexte, setLieuTexte] = useState('');
  const [reponses, setReponses] = useState<Record<number, string[]>>({});
  const [libre, setLibre] = useState(false);

  const [creneaux, setCreneaux] = useState<RdvCreneau[] | null>(null);
  const [chargement, setChargement] = useState(false);
  const [envoi, setEnvoi] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirme, setConfirme] = useState<RdvConfirme | null>(null);

  const type = types?.find((t) => t.uri === typeUri) ?? null;
  const lieu = type?.lieux.find((l) => l.kind === lieuKind) ?? null;

  /** Une sélection vide veut dire « tous » : un déploiement neuf doit montrer quelque chose. */
  const affiches = useMemo(
    () => (types ?? []).filter((t) => selection.length === 0 || selection.includes(t.uri)),
    [types, selection],
  );

  useEffect(() => {
    Promise.all([fetchRdvTypes(), fetchRdvSelection().catch(() => ({ types: [] }))])
      .then(([t, s]) => { setTypes(t.types); setSelection(s.types); setErreur(null); })
      .catch((e) => { setTypes([]); setErreur(e?.message ?? 'Calendly injoignable.'); });
  }, []);

  // Le lieu et le formulaire suivent le type : Calendly exige les deux à la
  // création, et il les exige tels que CE type les déclare.
  useEffect(() => {
    const premier = type?.lieux[0] ?? null;
    setLieuKind(premier?.kind ?? '');
    setLieuTexte(premier?.texte ?? '');
    setReponses(Object.fromEntries((type?.questions ?? []).map((q) => [q.position, reponseInitiale(q)])));
  }, [typeUri]);

  useEffect(() => { setLieuTexte(lieu?.texte ?? ''); }, [lieuKind]);

  useEffect(() => {
    if (!typeUri) { setCreneaux(null); return; }
    let abandonne = false;
    setChargement(true);
    fetchRdvCreneaux(typeUri, JOURS, libre)
      .then((r) => { if (!abandonne) { setCreneaux(r.creneaux); setErreur(null); } })
      .catch((e) => { if (!abandonne) { setCreneaux([]); setErreur(e?.message ?? 'Créneaux indisponibles.'); } })
      .finally(() => { if (!abandonne) setChargement(false); });
    return () => { abandonne = true; };
  }, [typeUri, libre]);

  const lieuManquant = Boolean(lieuKind && KINDS_AVEC_TEXTE.includes(lieuKind) && !lieuTexte.trim());
  const questionsManquantes = (type?.questions ?? [])
    .filter((q) => q.requis && !(reponses[q.position] ?? []).join('').trim());
  const pret = Boolean(
    typeUri && nom.trim() && email.trim() && !lieuManquant && questionsManquantes.length === 0,
  );

  const recharger = () => {
    if (!typeUri) return;
    fetchRdvCreneaux(typeUri, JOURS, libre)
      .then((x) => setCreneaux(x.creneaux))
      .catch(() => { /* l'erreur affichée est déjà la bonne */ });
  };

  const poser = async (debut: string) => {
    if (!pret || !type) return;
    setEnvoi(debut);
    setErreur(null);
    try {
      const r = await creerRdv({
        type: type.uri,
        debut,
        nom: nom.trim(),
        email: email.trim(),
        telephone: telephone.trim() || null,
        lieu: lieuKind ? { kind: lieuKind, texte: lieuTexte.trim() } : null,
        reponses: type.questions.map((q) => ({
          question: q.nom,
          answer: (reponses[q.position] ?? []).join(', '),
          position: q.position,
        })),
      });
      setConfirme(r.rdv);
    } catch (e: any) {
      setErreur(e?.message ?? 'La création a échoué.');
      // Un créneau peut avoir été pris entre l'affichage et le clic : on
      // rafraîchit plutôt que de laisser cliquer une seconde fois dans le vide.
      recharger();
    } finally {
      setEnvoi(null);
    }
  };

  const repondre = (q: RdvQuestion, valeur: string, multiple: boolean) =>
    setReponses((r) => {
      const avant = r[q.position] ?? [];
      if (!multiple) return { ...r, [q.position]: valeur ? [valeur] : [] };
      return {
        ...r,
        [q.position]: avant.includes(valeur) ? avant.filter((x) => x !== valeur) : [...avant, valeur],
      };
    });

  const basculerSelection = (uri: string) =>
    setSelection((s) => (s.includes(uri) ? s.filter((x) => x !== uri) : [...s, uri]));

  if (confirme) {
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6">
        <section className="bg-white dark:bg-dark-surface rounded-xl border border-brand-light dark:border-dark-sec-bg p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-brand-main dark:text-white">
            <Check className="w-4 h-4" /> Rendez-vous posé
          </h2>
          <p className="text-sm text-brand-main/70 dark:text-dark-text/70 mt-2 first-letter:uppercase">
            {confirme.nom} — {JOUR.format(new Date(confirme.debut))} à {HEURE.format(new Date(confirme.debut))}
          </p>
          <p className="text-xs mt-3 inline-flex items-center gap-1.5 text-brand-main/60 dark:text-dark-text/60">
            <MessageSquare className="w-3.5 h-3.5" />
            {confirme.telephone
              ? <>Rappels SMS au {confirme.telephone}, sans confirmation à demander.</>
              : <>Aucun numéro retenu par Calendly : il n’y aura pas de rappel SMS.</>}
          </p>
          {confirme.lieu && (
            <p className="text-xs mt-2 inline-flex items-center gap-1.5 text-brand-main/60 dark:text-dark-text/60">
              <Video className="w-3.5 h-3.5" />
              {confirme.lieu.texte.startsWith('http')
                ? <a href={confirme.lieu.texte} target="_blank" rel="noreferrer" className="underline">{confirme.lieu.texte}</a>
                : <>{NOM_DU_LIEU[confirme.lieu.type] ?? confirme.lieu.type} — {confirme.lieu.texte || 'lien en cours de création'}</>}
            </p>
          )}
          <div className="flex gap-3 mt-4 text-xs">
            {confirme.annulation && (
              <a href={confirme.annulation} target="_blank" rel="noreferrer" className="underline text-brand-main/70 dark:text-dark-text/70">Annuler</a>
            )}
            {confirme.report && (
              <a href={confirme.report} target="_blank" rel="noreferrer" className="underline text-brand-main/70 dark:text-dark-text/70">Reprogrammer</a>
            )}
          </div>
          <button
            onClick={() => { setConfirme(null); recharger(); }}
            className="mt-5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-brand-main text-white hover:opacity-90 dark:bg-white dark:text-brand-main"
          >
            Poser un autre rendez-vous
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-4">
      <section className="bg-white dark:bg-dark-surface rounded-xl border border-brand-light dark:border-dark-sec-bg p-4 md:p-5">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-brand-main/60 dark:text-dark-text/50 mb-1">
          L’invité
        </h2>
        <p className="text-xs text-brand-main/55 dark:text-dark-text/50 mb-3">
          Le numéro sert aux rappels SMS. En le renseignant, vous attestez de l’accord de la personne —
          c’est exactement ce que demande Calendly quand vous réservez pour elle.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom et prénom" className={champClasses} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Adresse e-mail" className={champClasses} />
          <input value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="06 12 34 56 78" className={champClasses} />
        </div>
      </section>

      <section className="bg-white dark:bg-dark-surface rounded-xl border border-brand-light dark:border-dark-sec-bg p-4 md:p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-brand-main/60 dark:text-dark-text/50">
            Le rendez-vous
          </h2>
          {types && types.length > 0 && (
            <button
              onClick={() => setReglage((r) => !r)}
              className="inline-flex items-center gap-1.5 text-[11px] text-brand-main/60 dark:text-dark-text/60 hover:underline"
            >
              <Settings2 className="w-3.5 h-3.5" />
              {reglage ? 'Terminer' : 'Types affichés'}
            </button>
          )}
        </div>

        {types === null ? (
          <p className="text-sm text-brand-main/60 dark:text-dark-text/60">Lecture des types d’événements…</p>
        ) : reglage ? (
          <div>
            <p className="text-xs text-brand-main/55 dark:text-dark-text/50 mb-2">
              Cochez ce qui doit apparaître ici. Rien de coché : tout s’affiche.
            </p>
            <div className="grid gap-1.5 md:grid-cols-2">
              {types.map((t) => (
                <label key={t.uri} className="flex items-center gap-2 text-sm text-brand-main dark:text-dark-text">
                  <input
                    type="checkbox"
                    checked={selection.includes(t.uri)}
                    onChange={() => basculerSelection(t.uri)}
                    className="accent-brand-main"
                  />
                  {t.nom} <span className="text-xs text-brand-main/45 dark:text-dark-text/40">{t.duree} min</span>
                </label>
              ))}
            </div>
            <button
              onClick={() => { void enregistrerRdvSelection(selection).catch((e) => setErreur(e?.message ?? null)); setReglage(false); }}
              className="mt-3 px-3 py-1.5 rounded-lg text-sm font-semibold bg-brand-main text-white hover:opacity-90 dark:bg-white dark:text-brand-main"
            >
              Enregistrer
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {affiches.map((t) => (
              <label
                key={t.uri}
                className={`cursor-pointer px-3 py-2 rounded-lg text-sm border transition-colors ${
                  typeUri === t.uri
                    ? 'bg-brand-main text-white border-brand-main dark:bg-white dark:text-brand-main dark:border-white'
                    : 'border-brand-light dark:border-dark-sec-bg text-brand-main dark:text-dark-text hover:border-brand-main/40'
                }`}
              >
                <input
                  type="radio"
                  name="type-rdv"
                  className="sr-only"
                  checked={typeUri === t.uri}
                  onChange={() => setTypeUri(t.uri)}
                />
                {t.nom}
                <span className={typeUri === t.uri ? 'opacity-70 ml-1.5 text-xs' : 'ml-1.5 text-xs text-brand-main/45 dark:text-dark-text/40'}>
                  {t.duree} min
                </span>
              </label>
            ))}
          </div>
        )}

        {type && !reglage && (type.lieux.length > 1 || KINDS_AVEC_TEXTE.includes(lieuKind)) && (
          <div className="mt-3">
            <label className="block text-xs font-semibold text-brand-main dark:text-dark-text mb-1">
              Lieu
            </label>
            {type.lieux.length > 1 && (
              <div className="flex flex-wrap gap-3 mb-2">
                {type.lieux.map((l) => (
                  <label key={l.kind} className="inline-flex items-center gap-1.5 text-sm text-brand-main dark:text-dark-text">
                    <input
                      type="radio"
                      name="lieu-rdv"
                      checked={lieuKind === l.kind}
                      onChange={() => setLieuKind(l.kind)}
                      className="accent-brand-main"
                    />
                    {NOM_DU_LIEU[l.kind] ?? l.kind}
                  </label>
                ))}
              </div>
            )}
            {KINDS_AVEC_TEXTE.includes(lieuKind) && (
              <input
                value={lieuTexte}
                onChange={(e) => setLieuTexte(e.target.value)}
                placeholder="Adresse, ou numéro à appeler"
                className={champClasses}
              />
            )}
          </div>
        )}

        {type && !reglage && type.questions.length > 0 && (
          <div className="mt-4 space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-main/60 dark:text-dark-text/50">
              Formulaire de l’invité
            </p>
            {type.questions.map((q) => {
              const valeur = reponses[q.position] ?? [];
              const multiple = q.type === 'multi_select';
              return (
                <div key={q.position}>
                  <label className="block text-xs font-semibold text-brand-main dark:text-dark-text mb-1">
                    {q.nom}
                    {!q.requis && <span className="font-normal text-brand-main/45 dark:text-dark-text/40"> — facultatif</span>}
                  </label>
                  {q.choix.length > 0 ? (
                    <div className="space-y-1">
                      {q.choix.map((choix) => (
                        <label key={choix} className="flex items-start gap-2 text-sm text-brand-main dark:text-dark-text">
                          <input
                            type={multiple ? 'checkbox' : 'radio'}
                            name={`q-${q.position}`}
                            checked={valeur.includes(choix)}
                            onChange={() => repondre(q, choix, multiple)}
                            className="accent-brand-main mt-0.5"
                          />
                          <span className="leading-snug">{choix}</span>
                        </label>
                      ))}
                    </div>
                  ) : q.type === 'text' ? (
                    <textarea
                      rows={2}
                      value={valeur[0] ?? ''}
                      onChange={(e) => repondre(q, e.target.value, false)}
                      className={champClasses}
                    />
                  ) : (
                    <input
                      value={valeur[0] ?? ''}
                      onChange={(e) => repondre(q, e.target.value, false)}
                      className={champClasses}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {erreur && (
          <p className="mt-3 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
            <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />{erreur}
          </p>
        )}

        {typeUri && !reglage && (
          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <label className="inline-flex items-center gap-2 text-xs text-brand-main/70 dark:text-dark-text/70">
                <input type="checkbox" checked={libre} onChange={(e) => setLibre(e.target.checked)} className="accent-brand-main" />
                Ignorer le délai minimum et l’horizon de réservation
              </label>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-brand-main/50 dark:text-dark-text/45">
                {chargement ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CalendarClock className="w-3 h-3" />}
                trois mois
              </span>
            </div>

            {libre && (
              <p className="text-[11px] text-brand-main/50 dark:text-dark-text/45 mb-3 leading-relaxed">
                Créneaux recomposés depuis le planning de disponibilité par défaut et les plages déjà occupées :
                ni délai de 48 h, ni limite à 21 jours. Les tampons et les règles propres à un type d’événement
                ne sont pas appliqués — Calendly reste seul juge au moment de poser le rendez-vous.
              </p>
            )}

            {questionsManquantes.length > 0 && (
              <p className="text-[11px] text-brand-main/50 dark:text-dark-text/45 mb-3">
                À renseigner avant de choisir une heure : {questionsManquantes.map((q) => q.nom).join(' · ')}
              </p>
            )}

            {!chargement && creneaux && creneaux.length === 0 && (
              <p className="text-sm text-brand-main/55 dark:text-dark-text/50">
                Aucun créneau libre sur les trois prochains mois.
              </p>
            )}

            <div className="space-y-5">
              {parMois(creneaux ?? []).map((mois) => (
                <div key={mois.titre}>
                  <p className="sticky top-0 bg-white dark:bg-dark-surface py-1 text-[11px] font-bold uppercase tracking-wider text-brand-main/45 dark:text-dark-text/40 first-letter:uppercase">
                    {mois.titre}
                  </p>
                  <div className="space-y-2.5 mt-1">
                    {mois.jours.map((groupe) => (
                      <div key={groupe.date.toISOString()} className="md:flex md:gap-3">
                        <p className="md:w-48 md:shrink-0 text-xs font-semibold text-brand-main dark:text-dark-text mb-1 md:mb-0 md:pt-2 first-letter:uppercase">
                          {JOUR.format(groupe.date)}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {groupe.heures.map((h) => {
                            const iso = h.toISOString();
                            return (
                              <button
                                key={iso}
                                onClick={() => poser(iso)}
                                disabled={!pret || envoi !== null}
                                title={pret ? undefined : 'Renseignez le nom, l’e-mail, le lieu et le formulaire.'}
                                className="px-2.5 py-1.5 rounded-lg text-sm border border-brand-light dark:border-dark-sec-bg text-brand-main dark:text-dark-text hover:bg-brand-main hover:text-white dark:hover:bg-white dark:hover:text-brand-main disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-brand-main"
                              >
                                {envoi === iso ? 'Création…' : HEURE.format(h)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default RdvView;
