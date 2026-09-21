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
 */
import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Check, MessageSquare, RefreshCw, TriangleAlert } from 'lucide-react';
import { fetchRdvTypes, fetchRdvCreneaux, creerRdv } from '../../services/apiService';
import type { RdvType, RdvCreneau, RdvConfirme } from '@luminose/shared';

/** La fenêtre interrogée d'un coup. Sept jours : c'est le plafond de Calendly. */
const FENETRE = 7;

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
  return {
    // Notion peut envoyer le nom complet d'un bloc ou les deux champs séparés.
    nom: champ('nomComplet', 'name') || [prenom, nom].filter(Boolean).join(' '),
    email: champ('email', 'mail'),
    telephone: champ('tel', 'telephone', 'phone', 'mobile'),
  };
};

const JOUR = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const HEURE = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Les créneaux regroupés par journée locale, dans l'ordre. */
const parJour = (creneaux: RdvCreneau[]) => {
  const groupes = new Map<string, { date: Date; heures: Date[] }>();
  for (const c of creneaux) {
    const d = new Date(c.debut);
    const cle = d.toLocaleDateString('fr-FR');
    if (!groupes.has(cle)) groupes.set(cle, { date: d, heures: [] });
    groupes.get(cle)!.heures.push(d);
  }
  return [...groupes.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
};

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
  const [typeUri, setTypeUri] = useState<string>('');
  const [semaine, setSemaine] = useState(0);
  const [creneaux, setCreneaux] = useState<RdvCreneau[] | null>(null);
  const [chargement, setChargement] = useState(false);
  const [envoi, setEnvoi] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirme, setConfirme] = useState<RdvConfirme | null>(null);

  const type = types?.find((t) => t.uri === typeUri) ?? null;

  useEffect(() => {
    fetchRdvTypes()
      .then((r) => { setTypes(r.types); setErreur(null); })
      .catch((e) => { setTypes([]); setErreur(e?.message ?? 'Calendly injoignable.'); });
  }, []);

  useEffect(() => {
    if (!typeUri) { setCreneaux(null); return; }
    let abandonne = false;
    setChargement(true);
    const debut = new Date(Date.now() + semaine * FENETRE * 24 * 3600_000).toISOString();
    fetchRdvCreneaux(typeUri, debut, FENETRE)
      .then((r) => { if (!abandonne) { setCreneaux(r.creneaux); setErreur(null); } })
      .catch((e) => { if (!abandonne) { setCreneaux([]); setErreur(e?.message ?? 'Créneaux indisponibles.'); } })
      .finally(() => { if (!abandonne) setChargement(false); });
    return () => { abandonne = true; };
  }, [typeUri, semaine]);

  const pret = Boolean(typeUri && nom.trim() && email.trim());

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
        lieu: type.lieu,
      });
      setConfirme(r.rdv);
    } catch (e: any) {
      setErreur(e?.message ?? 'La création a échoué.');
      // Un créneau peut avoir été pris entre l'affichage et le clic : on
      // rafraîchit plutôt que de laisser cliquer une seconde fois dans le vide.
      setSemaine((s) => s);
      fetchRdvCreneaux(type.uri, new Date(Date.now() + semaine * FENETRE * 24 * 3600_000).toISOString(), FENETRE)
        .then((x) => setCreneaux(x.creneaux))
        .catch(() => { /* l'erreur affichée est déjà la bonne */ });
    } finally {
      setEnvoi(null);
    }
  };

  if (confirme) {
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6">
        <section className="bg-white dark:bg-dark-surface rounded-xl border border-brand-light dark:border-dark-sec-bg p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-brand-main dark:text-white">
            <Check className="w-4 h-4" /> Rendez-vous posé
          </h2>
          <p className="text-sm text-brand-main/70 dark:text-dark-text/70 mt-2">
            {confirme.nom} — {JOUR.format(new Date(confirme.debut))} à {HEURE.format(new Date(confirme.debut))}
          </p>
          <p className="text-xs mt-3 inline-flex items-center gap-1.5 text-brand-main/60 dark:text-dark-text/60">
            <MessageSquare className="w-3.5 h-3.5" />
            {confirme.telephone
              ? <>Rappels SMS au {confirme.telephone}, sans confirmation à demander.</>
              : <>Aucun numéro retenu par Calendly : il n’y aura pas de rappel SMS.</>}
          </p>
          <div className="flex gap-3 mt-4 text-xs">
            {confirme.annulation && (
              <a href={confirme.annulation} target="_blank" rel="noreferrer" className="underline text-brand-main/70 dark:text-dark-text/70">Annuler</a>
            )}
            {confirme.report && (
              <a href={confirme.report} target="_blank" rel="noreferrer" className="underline text-brand-main/70 dark:text-dark-text/70">Reprogrammer</a>
            )}
          </div>
          <button
            onClick={() => { setConfirme(null); setSemaine(0); }}
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
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-brand-main/60 dark:text-dark-text/50 mb-2">
          Le rendez-vous
        </h2>
        {types === null ? (
          <p className="text-sm text-brand-main/60 dark:text-dark-text/60">Lecture des types d’événements…</p>
        ) : (
          <select
            value={typeUri}
            onChange={(e) => { setTypeUri(e.target.value); setSemaine(0); }}
            className={champClasses}
          >
            <option value="">Choisir un type d’événement…</option>
            {types.map((t) => (
              <option key={t.uri} value={t.uri}>{t.nom} — {t.duree} min{t.secret ? ' (masqué)' : ''}</option>
            ))}
          </select>
        )}

        {erreur && (
          <p className="mt-3 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
            <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />{erreur}
          </p>
        )}

        {typeUri && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => setSemaine((s) => Math.max(0, s - 1))}
                disabled={semaine === 0 || chargement}
                className="text-xs underline text-brand-main/70 dark:text-dark-text/70 disabled:opacity-30 disabled:no-underline"
              >
                Sept jours avant
              </button>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-brand-main/50 dark:text-dark-text/45">
                {chargement ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CalendarClock className="w-3 h-3" />}
                {semaine === 0 ? 'Sept prochains jours' : `Semaine +${semaine}`}
              </span>
              <button
                onClick={() => setSemaine((s) => s + 1)}
                disabled={chargement}
                className="text-xs underline text-brand-main/70 dark:text-dark-text/70 disabled:opacity-30"
              >
                Sept jours après
              </button>
            </div>

            {!chargement && creneaux && creneaux.length === 0 && (
              <p className="text-sm text-brand-main/55 dark:text-dark-text/50">
                Aucun créneau libre sur cette fenêtre.
              </p>
            )}

            <div className="space-y-3">
              {parJour(creneaux ?? []).map((groupe) => (
                <div key={groupe.date.toISOString()}>
                  <p className="text-xs font-semibold text-brand-main dark:text-dark-text mb-1.5 first-letter:uppercase">
                    {JOUR.format(groupe.date)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {groupe.heures.map((h) => {
                      const iso = h.toISOString();
                      return (
                        <button
                          key={iso}
                          onClick={() => poser(iso)}
                          disabled={!pret || envoi !== null}
                          title={pret ? undefined : 'Renseignez d’abord le nom et l’e-mail.'}
                          className="px-3 py-1.5 rounded-lg text-sm border border-brand-light dark:border-dark-sec-bg text-brand-main dark:text-dark-text hover:bg-brand-main hover:text-white dark:hover:bg-white dark:hover:text-brand-main disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-brand-main"
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
        )}
      </section>
    </div>
  );
};

export default RdvView;
