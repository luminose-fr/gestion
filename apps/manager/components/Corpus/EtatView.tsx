/**
 * L'état du corpus — ce qui demande une décision.
 *
 * **L'écran ne montre pas une arborescence de fichiers.** GitHub le fait déjà,
 * et mieux. Il s'ouvre sur ce qui demande une décision : ce qui a dérivé, ce
 * qui arrive à échéance, ce qui attend une re-confirmation.
 *
 * Il ne peut rien écrire dans le corpus : celui-ci est embarqué dans le bundle
 * du Worker au déploiement. Ce n'est pas une discipline, c'est une propriété —
 * Git reste le seul endroit où le corpus change.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, RefreshCw, FileText, Rocket, Loader2, ExternalLink } from 'lucide-react';
import { copyTextToClipboard } from '../ContentEditor/renderers/shared';
import {
  fetchEtatCorpus, fetchContexte, fetchPoses, setPose,
  fetchDeploiement, lancerDeploiement,
  type EtatCorpus, type PoseSurface, type EtatDeploiement,
} from '../../services/apiService';
import { SURFACES } from './surfaces';

const NON_PROPOSABLE = ['suspendu', 'termine', 'candidat'];

const ETIQUETTE_DEPLOIEMENT: Record<string, { mot: string; classe: string }> = {
  en_attente: { mot: 'en attente', classe: 'text-brand-main/70 dark:text-dark-text/60' },
  en_cours:   { mot: 'en cours',   classe: 'text-brand-main/70 dark:text-dark-text/60' },
  reussi:     { mot: 'réussi',     classe: 'text-emerald-600 dark:text-emerald-400' },
  echoue:     { mot: 'échoué',     classe: 'text-red-600 dark:text-red-400' },
};

const Carte: React.FC<{ titre: string; children: React.ReactNode }> = ({ titre, children }) => (
  <section className="bg-white dark:bg-dark-surface rounded-xl border border-brand-light dark:border-dark-sec-bg p-4 md:p-5">
    <h2 className="text-[11px] font-bold uppercase tracking-wider text-brand-main/60 dark:text-dark-text/50 mb-3">
      {titre}
    </h2>
    {children}
  </section>
);

const EtatView: React.FC = () => {
  const [etat, setEtat] = useState<EtatCorpus | null>(null);
  const [poses, setPoses] = useState<Record<string, PoseSurface>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [copie, setCopie] = useState<string | null>(null);
  const [deploiement, setDeploiement] = useState<EtatDeploiement | null>(null);
  const [lancement, setLancement] = useState(false);

  const recharger = useCallback(async () => {
    try {
      const [e, p] = await Promise.all([fetchEtatCorpus(), fetchPoses()]);
      setEtat(e);
      setPoses(p.poses ?? {});
      setErreur(null);
      // À part, et sans `await` bloquant : le dépôt peut être injoignable ou
      // sans jeton, et ça ne doit pas empêcher l'écran de s'afficher.
      fetchDeploiement().then(setDeploiement).catch(() => setDeploiement(null));
    } catch (err: any) {
      setErreur(err?.message ?? 'Le corpus est injoignable.');
    }
  }, []);

  useEffect(() => { void recharger(); }, [recharger]);

  /**
   * Copier, puis enregistrer la pose — dans cet ordre, et seulement si la copie
   * a abouti. Enregistrer d'abord ferait apparaître à jour une surface où rien
   * n'a été collé, et c'est précisément le mensonge que cet écran existe pour
   * empêcher.
   */
  const copierEtPoser = async (surfaceId: string, profil: string) => {
    setEnCours(surfaceId);
    try {
      const ctx = await fetchContexte(profil);
      // Le repli de l'app plutôt que `navigator.clipboard` nu : sur une origine
      // non sécurisée l'API échoue en silence, et une copie qu'on croit faite
      // est pire qu'une copie refusée.
      if (!(await copyTextToClipboard(ctx.texte))) {
        throw new Error('Le presse-papier a refusé la copie — rien n’a été enregistré.');
      }
      const { pose } = await setPose(surfaceId, profil, ctx.hash);
      setPoses((p) => ({ ...p, [surfaceId]: pose }));
      setCopie(surfaceId);
      setTimeout(() => setCopie((c) => (c === surfaceId ? null : c)), 2500);
    } catch (err: any) {
      setErreur(err?.message ?? 'La copie a échoué — rien n’a été enregistré.');
    } finally {
      setEnCours(null);
    }
  };

  if (erreur && !etat) {
    return (
      <div>
        <p className="text-sm text-red-600 dark:text-red-400">Échec — {erreur}</p>
      </div>
    );
  }

  if (!etat) {
    return <div className="text-sm text-brand-main/60 dark:text-dark-text/60">Lecture du corpus…</div>;
  }

  const hashCourant = (profil: string) => etat.profils.find((p) => p.profil === profil)?.hash ?? '';

  /** Un déploiement est en vol : le bouton doit attendre plutôt qu'en empiler un second. */
  const enVol = deploiement?.etat?.statut === 'en_cours' || deploiement?.etat?.statut === 'en_attente';

  /**
   * Un commit postérieur au dernier lancement n'est pas servi.
   *
   * Approximation assumée : un commit poussé PENDANT un déploiement sera
   * signalé « en avance » alors qu'il est peut-être passé. Se tromper dans ce
   * sens fait proposer un déploiement de trop ; se tromper dans l'autre
   * laisserait croire qu'une correction est en ligne alors qu'elle ne l'est pas.
   */
  const sourceEnAvance = Boolean(
    deploiement?.source?.date &&
    deploiement?.etat?.lance_le &&
    deploiement.source.date > deploiement.etat.lance_le,
  );

  const deployer = async () => {
    setLancement(true);
    setErreur(null);
    try {
      await lancerDeploiement('api');
      // On rafraîchit tout de suite pour que le bouton passe en « en cours »
      // sans attendre un clic de plus.
      setDeploiement(await fetchDeploiement());
    } catch (e: any) {
      setErreur(e?.message ?? "Le déploiement n'a pas démarré.");
    } finally {
      setLancement(false);
    }
  };
  const arretees = etat.offres.filter((o) => NON_PROPOSABLE.includes(o.statut));
  const derives = SURFACES.filter(
    (s) => !s.automatique && poses[s.id]?.hash !== hashCourant(s.profil),
  ).length;

  return (
    <div className="space-y-4 md:space-y-5 max-w-5xl">
      {erreur && (
        <p className="text-sm text-red-600 dark:text-red-400">Échec — {erreur}</p>
      )}

      {/*
        Le déploiement, et l'écart avec la source.

        C'est la même question que les « poses » de ChatGPT et Gemini plus bas,
        tournée vers la maison : ce que le Worker sert est-il ce que le dépôt
        contient ? Sans elle, on corrige une fiche, on revient, on lit
        l'ancienne version et on croit que c'est cassé.
      */}
      {deploiement?.configure && (
        <Carte titre="Déploiement">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {sourceEnAvance ? (
              <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4 inline -mt-0.5" /> La source a de l'avance sur ce qui est servi.
              </span>
            ) : (
              <span className="text-sm text-brand-main/70 dark:text-dark-text/60">
                {deploiement.etat?.statut === 'reussi'
                  ? 'Ce qui est servi correspond au dépôt.'
                  : 'Aucun écart connu.'}
              </span>
            )}

            {deploiement.etat?.statut && (
              <span className="text-xs text-brand-main/55 dark:text-dark-text/50">
                Dernier déploiement : <strong className={ETIQUETTE_DEPLOIEMENT[deploiement.etat.statut].classe}>
                  {ETIQUETTE_DEPLOIEMENT[deploiement.etat.statut].mot}
                </strong>
                {deploiement.etat.lance_le ? ` · ${new Date(deploiement.etat.lance_le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}
                {deploiement.etat.lien && (
                  <> · <a href={deploiement.etat.lien} target="_blank" rel="noreferrer" className="underline hover:text-brand-main dark:hover:text-white">
                    <ExternalLink className="w-3 h-3 inline -mt-0.5" /> le journal
                  </a></>
                )}
              </span>
            )}

            <button
              onClick={() => void deployer()}
              disabled={lancement || enVol}
              className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-brand-main text-white hover:opacity-90 disabled:opacity-40 dark:bg-white dark:text-brand-main"
            >
              {lancement || enVol
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {enVol ? 'En cours…' : 'Lancement…'}</>
                : <><Rocket className="w-3.5 h-3.5" /> Déployer</>}
            </button>
          </div>
          <p className="text-[11px] text-brand-main/45 dark:text-dark-text/40 mt-2.5 leading-relaxed">
            Tests et typecheck tournent d'abord ; comptez deux minutes. Seul le Worker repart —
            une correction du corpus ne touche pas le front. « Actualiser » rafraîchit l'état.
          </p>
        </Carte>
      )}

      {/* Ce qui demande une décision, avant tout le reste. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="font-semibold text-brand-main dark:text-white">
          {etat.documents} documents
        </span>
        <span className="text-brand-main/60 dark:text-dark-text/60">
          {etat.blocs.length} blocs · relevé du {etat.date}
        </span>
        {derives > 0 && (
          <span className="font-semibold text-amber-600 dark:text-amber-400">
            {derives} surface{derives > 1 ? 's' : ''} à recoller
          </span>
        )}
        {etat.aRevoir.length > 0 && (
          <span className="font-semibold text-amber-600 dark:text-amber-400">
            {etat.aRevoir.length} décision{etat.aRevoir.length > 1 ? 's' : ''} à revoir
          </span>
        )}
        <button
          onClick={() => void recharger()}
          className="ml-auto inline-flex items-center gap-1.5 text-xs text-brand-main/70 hover:text-brand-main dark:text-dark-text/60 dark:hover:text-white"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Actualiser
        </button>
      </div>

      <Carte titre="Ce que portent mes IA">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-brand-main/50 dark:text-dark-text/40">
                <th className="text-left font-semibold pb-2 pr-3">Surface</th>
                <th className="text-left font-semibold pb-2 pr-3">Profil</th>
                <th className="text-left font-semibold pb-2 pr-3">Posée</th>
                <th className="text-left font-semibold pb-2 pr-3">Courante</th>
                <th className="text-left font-semibold pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {SURFACES.map((s) => {
                const pose = poses[s.id];
                const courant = hashCourant(s.profil);
                const aJour = pose?.hash === courant;
                return (
                  <tr key={s.id} className="border-t border-brand-light dark:border-dark-sec-bg align-top">
                    <td className="py-2.5 pr-3">
                      <div className="font-medium text-brand-main dark:text-white">{s.nom}</div>
                      <div className="text-xs text-brand-main/50 dark:text-dark-text/50 max-w-md">{s.note}</div>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-brand-main/70 dark:text-dark-text/60">{s.profil}</td>
                    <td className="py-2.5 pr-3 font-mono text-xs tabular-nums text-brand-main/70 dark:text-dark-text/60">
                      {pose?.hash ?? '—'}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs tabular-nums text-brand-main/70 dark:text-dark-text/60">
                      {courant}
                    </td>
                    <td className="py-2.5">
                      {s.automatique ? (
                        <span className="text-xs text-brand-main/45 dark:text-dark-text/40">automatique</span>
                      ) : aJour ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                          <Check className="w-3.5 h-3.5" /> à jour
                        </span>
                      ) : (
                        <button
                          onClick={() => void copierEtPoser(s.id, s.profil)}
                          disabled={enCours === s.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-brand-main text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-brand-main"
                        >
                          {copie === s.id ? (
                            <><Check className="w-3.5 h-3.5" /> copié</>
                          ) : enCours === s.id ? (
                            <>Composition…</>
                          ) : (
                            <><Copy className="w-3.5 h-3.5" /> {pose ? 'Recoller' : 'Copier'}</>
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-brand-main/50 dark:text-dark-text/50 mt-3">
          Le texte est copié dans le presse-papier, puis la version est enregistrée. Si la copie
          échoue, rien n’est enregistré : une surface ne peut pas passer pour à jour sans l’être.
        </p>
      </Carte>

      <Carte titre="Les trois profils">
        <div className="grid gap-3 sm:grid-cols-3">
          {etat.profils.map((p) => (
            <div key={p.profil} className="rounded-lg border border-brand-light dark:border-dark-sec-bg p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-xs font-semibold text-brand-main dark:text-white">{p.profil}</span>
                <span className="font-mono text-[11px] tabular-nums text-brand-main/50 dark:text-dark-text/50">{p.hash}</span>
              </div>
              <p className="text-xs text-brand-main/60 dark:text-dark-text/55 mt-1.5">{p.intention}</p>
              <p className="text-[11px] tabular-nums text-brand-main/45 dark:text-dark-text/40 mt-2">
                {p.taille.toLocaleString('fr-FR')} car. · {p.documents} doc.
                {p.plafond !== null && ` · plafond ${p.plafond.toLocaleString('fr-FR')}`}
              </p>
              {p.depasse && (
                <p className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 mt-1.5">
                  <AlertTriangle className="w-3 h-3" /> dépasse son plafond
                </p>
              )}
            </div>
          ))}
        </div>
      </Carte>

      {arretees.length > 0 && (
        <Carte titre="Offres qui ne doivent pas être proposées">
          <ul className="text-sm space-y-1.5">
            {arretees.map((o) => (
              <li key={o.chemin} className="flex items-center gap-2">
                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-brand-light dark:bg-dark-sec-bg text-brand-main dark:text-dark-text">
                  {o.statut}
                </span>
                <span className="text-brand-main dark:text-dark-text">{o.titre}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-brand-main/50 dark:text-dark-text/50 mt-3">
            Ce tableau est dérivé du frontmatter et injecté dans les trois profils, avec la mention
            « NE PAS PROPOSER ». Changer un statut dans le corpus suffit — aucun texte à réécrire.
          </p>
        </Carte>
      )}

      {(etat.aRevoir.length > 0 || etat.absencesDeliberees.length > 0) && (
        <Carte titre="Échéances">
          {etat.aRevoir.map((d) => (
            <div key={d.chemin} className="flex items-baseline gap-2 text-sm py-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 translate-y-0.5" />
              <span className="text-brand-main dark:text-dark-text">{d.titre}</span>
              <span className="font-mono text-[11px] text-brand-main/50 dark:text-dark-text/50">
                à revoir depuis {d.review_at}
              </span>
            </div>
          ))}
          {etat.absencesDeliberees.map((a) => (
            <div key={a.chemin} className="flex items-baseline gap-2 text-sm py-1">
              <FileText className="w-3.5 h-3.5 text-brand-main/40 shrink-0 translate-y-0.5" />
              <span className="font-mono text-xs text-brand-main/70 dark:text-dark-text/60">{a.chemin}</span>
              <span className="text-xs text-brand-main/50 dark:text-dark-text/50">
                absence délibérée, confirmée en {a.revu} — à re-confirmer, jamais à combler
              </span>
            </div>
          ))}
        </Carte>
      )}
    </div>
  );
};

export default EtatView;
