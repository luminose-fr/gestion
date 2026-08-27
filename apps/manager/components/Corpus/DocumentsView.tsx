/**
 * Le corpus, en lecture.
 *
 * L'écran d'état répond à « qu'est-ce qui demande une décision ». Celui-ci
 * répond à la question d'après : « pourquoi cette fiche dit ça ». Voir
 * qu'une offre est `suspendu` sans pouvoir lire le motif obligeait à sortir
 * vers GitHub — un aller-retour qui casse le fil.
 *
 * En lecture seule, et ce n'est pas une limite d'écran : le corpus est une
 * constante du bundle du Worker. On modifie dans Git, jamais ici.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, PenLine, Check, X, Rocket, Loader2 } from 'lucide-react';
import {
  fetchDocumentsCorpus, fetchDocumentCorpus, fetchSourceCorpus, enregistrerSourceCorpus,
  fetchDeploiement, lancerDeploiement,
  type DocumentCorpus, type DocumentListe,
} from '../../services/apiService';
import Markdown from './Markdown';

/**
 * Le fichier, ouvert dans l'éditeur web de GitHub.
 *
 * Le lien pointait sur l'organisation : il annonçait « modifier » et déposait
 * sur une liste de dépôts. Ici, un clic ouvre LA fiche affichée, prête à être
 * corrigée et commitée — c'est le seul chemin par lequel le corpus change.
 *
 * `chemin` est le chemin relatif à `content/`, sans l'extension : le même
 * identifiant que celui servi par l'API, d'où l'absence de conversion.
 */
const EDITEUR = (chemin: string) =>
  `https://github.com/luminose-fr/gestion/edit/main/packages/corpus/content/${chemin}.md`;

const COULEUR_STATUT: Record<string, string> = {
  actif: 'text-emerald-600 dark:text-emerald-400',
  active: 'text-emerald-600 dark:text-emerald-400',
  suspendu: 'text-amber-600 dark:text-amber-400',
  termine: 'text-brand-main/45 dark:text-dark-text/40',
  candidat: 'text-violet-600 dark:text-violet-400',
  'volontairement-absent': 'text-brand-main/45 dark:text-dark-text/40',
};

interface Props {
  /** Le bloc ouvert. `null` avant que la route l'ait résolu. */
  bloc: string | null;
}

/**
 * L'édition, en trois états et pas un de plus.
 *
 * `null` : on lit. `edition` : on écrit, et `sha` est l'empreinte lue à
 * l'ouverture — c'est elle qui fera échouer l'enregistrement si le fichier a
 * bougé sur GitHub entre-temps, plutôt que d'écraser en silence.
 * `commit` : c'est parti dans Git, et il reste à déployer — un état à part
 * entière, parce que la fiche affichée vient du bundle et ne montre donc PAS
 * encore ce qu'on vient d'écrire.
 */
interface Edition { contenu: string; initial: string; sha: string }

const DocumentsView: React.FC<Props> = ({ bloc }) => {
  const [liste, setListe] = useState<DocumentListe[] | null>(null);
  const [ouvert, setOuvert] = useState<DocumentCorpus | null>(null);
  const [chargement, setChargement] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const [edition, setEdition] = useState<Edition | null>(null);
  const [message, setMessage] = useState('');
  const [occupe, setOccupe] = useState<'ouverture' | 'enregistrement' | 'deploiement' | null>(null);
  const [commit, setCommit] = useState<string | null>(null);
  const [depotOuvert, setDepotOuvert] = useState<boolean | null>(null);

  useEffect(() => {
    fetchDocumentsCorpus()
      .then((r) => setListe(r.documents))
      .catch((e) => setErreur(e?.message ?? 'Liste injoignable.'));
  }, []);

  const docs = useMemo(
    () => (liste ?? []).filter((d) => !bloc || d.bloc === bloc),
    [liste, bloc],
  );

  /**
   * Changer de bloc referme la fiche ouverte. Laisser afficher un document de
   * `socle/` alors que le panneau dit `canaux/` ferait mentir la navigation —
   * et c'est exactement le genre d'écart que cet écran existe pour traquer.
   */
  useEffect(() => { setOuvert(null); }, [bloc]);

  // Le jeton GitHub est facultatif : sans lui, la console lit le corpus et ne
  // l'écrit pas. On demande une fois, et on cache le bouton plutôt que de le
  // laisser échouer au clic.
  useEffect(() => {
    fetchDeploiement()
      .then((d) => setDepotOuvert(d.configure))
      .catch(() => setDepotOuvert(false));
  }, []);

  /** Changer de fiche abandonne l'édition en cours — et le dit avant. */
  const quitterEdition = () => { setEdition(null); setMessage(''); setCommit(null); };

  const ouvrirEdition = async () => {
    if (!ouvert) return;
    setOccupe('ouverture');
    setErreur(null);
    try {
      // Depuis GitHub, jamais depuis la fiche affichée : celle-ci vient du
      // bundle, donc du dernier déploiement.
      const src = await fetchSourceCorpus(ouvert.chemin);
      setEdition({ contenu: src.contenu, initial: src.contenu, sha: src.sha });
      setCommit(null);
    } catch (e: any) {
      setErreur(e?.message ?? 'Source injoignable.');
    } finally {
      setOccupe(null);
    }
  };

  const enregistrer = async () => {
    if (!ouvert || !edition) return;
    setOccupe('enregistrement');
    setErreur(null);
    try {
      const r = await enregistrerSourceCorpus(ouvert.chemin, edition.contenu, edition.sha, message);
      // On garde le texte écrit à l'écran : la fiche du bundle porte encore
      // l'ancienne version, et la remettre ferait croire que rien n'a pris.
      setEdition({ ...edition, initial: edition.contenu, sha: r.sha });
      setCommit(r.commit.slice(0, 7));
      setMessage('');
    } catch (e: any) {
      setErreur(e?.message ?? "L'enregistrement a échoué.");
    } finally {
      setOccupe(null);
    }
  };

  const deployer = async () => {
    setOccupe('deploiement');
    setErreur(null);
    try {
      // `api` seul : une correction de corpus ne touche pas le front.
      await lancerDeploiement('api');
      setCommit(null);
      quitterEdition();
    } catch (e: any) {
      setErreur(e?.message ?? 'Le déploiement n\'a pas démarré.');
    } finally {
      setOccupe(null);
    }
  };

  const modifie = !!edition && edition.contenu !== edition.initial;

  const ouvrir = async (chemin: string) => {
    if (modifie && !window.confirm('Des modifications non enregistrées seront perdues. Continuer ?')) return;
    quitterEdition();
    setChargement(chemin);
    try {
      setOuvert(await fetchDocumentCorpus(chemin));
      setErreur(null);
    } catch (e: any) {
      setErreur(e?.message ?? 'Document injoignable.');
    } finally {
      setChargement(null);
    }
  };

  if (erreur && !liste) return <p className="text-sm text-red-600 dark:text-red-400">Échec — {erreur}</p>;
  if (!liste) return <p className="text-sm text-brand-main/60 dark:text-dark-text/60">Lecture des documents…</p>;

  return (
    /*
      La colonne de gauche fait 210 px — la largeur des deux panneaux de
      navigation qui la précèdent. Quatre niveaux côte à côte qui ne font pas
      la même largeur se lisent comme une hiérarchie qui n'existe pas.
    */
    <div className="grid gap-5 lg:grid-cols-[210px_1fr]">
      <nav>
        {docs.length === 0 ? (
          <p className="text-sm text-brand-main/50 dark:text-dark-text/45">
            Ce bloc est vide — il se remplira quand un cas d'usage l'exigera.
          </p>
        ) : (
          /*
            Pas d'en-tête ici : le panneau précédent montre déjà le bloc
            sélectionné et son compte. Le répéter à 20 px de distance ne dit
            rien de plus et pousse la liste vers le bas.
          */
          <ul className="space-y-0.5">
            {docs.map((d) => (
              <li key={d.chemin}>
                <button
                  onClick={() => void ouvrir(d.chemin)}
                  /* La colonne tronque : le titre entier reste lisible au survol. */
                  title={d.titre}
                  className={`w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors ${
                    ouvert?.chemin === d.chemin
                      ? 'bg-brand-main text-white dark:bg-white dark:text-brand-main'
                      : 'hover:bg-brand-light dark:hover:bg-dark-sec-bg text-brand-main dark:text-dark-text'
                  }`}
                >
                  <span className="block truncate">{d.titre}</span>
                  <span className={`block text-[10px] font-mono ${
                    ouvert?.chemin === d.chemin ? 'opacity-70' : COULEUR_STATUT[d.statut ?? ''] ?? 'text-brand-main/40 dark:text-dark-text/35'
                  }`}>
                    {d.statut ?? d.type ?? '—'}
                    {chargement === d.chemin && ' · ouverture…'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>

      <article className="bg-white dark:bg-dark-surface rounded-xl border border-brand-light dark:border-dark-sec-bg p-4 md:p-6 min-h-[20rem]">
        {erreur && <p className="text-sm text-red-600 dark:text-red-400 mb-3">Échec — {erreur}</p>}
        {!ouvert ? (
          <p className="text-sm text-brand-main/50 dark:text-dark-text/50">
            Choisissez un document. Le corpus est en lecture seule ici — il se modifie dans Git,
            et le déploiement le republie.
          </p>
        ) : (
          <>
            <header className="mb-4 pb-3 border-b border-brand-light dark:border-dark-sec-bg">
              <p className="font-mono text-[11px] text-brand-main/50 dark:text-dark-text/45">{ouvert.chemin}.md</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] font-mono">
                {Object.entries(ouvert.meta)
                  .filter(([, v]) => v !== null && v !== undefined && v !== '')
                  .map(([k, v]) => (
                    <span key={k} className="text-brand-main/60 dark:text-dark-text/50">
                      {k}: <span className={k === 'statut' ? COULEUR_STATUT[String(v)] ?? '' : 'text-brand-main dark:text-dark-text'}>
                        {Array.isArray(v) ? v.join(', ') : String(v)}
                      </span>
                    </span>
                  ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2.5">
                {depotOuvert && !edition && (
                  <button
                    onClick={() => void ouvrirEdition()}
                    disabled={occupe === 'ouverture'}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-brand-main text-white hover:opacity-90 disabled:opacity-40 dark:bg-white dark:text-brand-main"
                  >
                    {occupe === 'ouverture'
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Lecture…</>
                      : <><PenLine className="w-3.5 h-3.5" /> Modifier</>}
                  </button>
                )}
                <a
                  href={EDITEUR(ouvert.chemin)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-brand-main/55 hover:text-brand-main dark:text-dark-text/50 dark:hover:text-white"
                >
                  <ExternalLink className="w-3 h-3" /> {depotOuvert ? 'ou sur GitHub' : 'Modifier sur GitHub'}
                </a>
                {/*
                  Dit à voix haute ce que la mécanique impose : le corpus est
                  une constante du bundle du Worker, donc une correction
                  commitée ne se voit ici qu'au déploiement suivant. Sans cette
                  ligne, on corrige, on revient, on ne voit rien, et on conclut
                  que c'est cassé.
                */}
                {!edition && (
                  <span className="text-[11px] text-brand-main/40 dark:text-dark-text/35">
                    une correction n'entre dans les prompts qu'au déploiement
                  </span>
                )}
              </div>
            </header>

            {!edition ? (
              <Markdown texte={ouvert.corps} />
            ) : (
              <div className="space-y-3">
                {/*
                  Le fichier ENTIER, frontmatter compris : c'est là que vit
                  `statut`, et « Le Seuil repasse actif » est précisément le
                  genre de correction qu'on vient faire.
                */}
                <textarea
                  value={edition.contenu}
                  onChange={(e) => setEdition({ ...edition, contenu: e.target.value })}
                  spellCheck={false}
                  rows={26}
                  className="w-full font-mono text-xs leading-relaxed p-3 rounded-lg border border-brand-light dark:border-dark-sec-bg bg-brand-light/40 dark:bg-dark-bg text-brand-main dark:text-dark-text resize-y outline-hidden focus:border-brand-main dark:focus:border-white"
                />

                {commit ? (
                  /* Commité, pas déployé — l'état que rien n'annonçait avant. */
                  <div className="rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 p-3 space-y-2">
                    <p className="text-sm text-emerald-900 dark:text-emerald-200">
                      <Check className="w-3.5 h-3.5 inline -mt-0.5" />{' '}
                      Commité (<span className="font-mono text-xs">{commit}</span>).{' '}
                      <strong>Les prompts reçoivent encore l'ancienne version</strong> tant que le Worker n'est pas redéployé.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => void deployer()}
                        disabled={occupe === 'deploiement'}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-brand-main text-white hover:opacity-90 disabled:opacity-40 dark:bg-white dark:text-brand-main"
                      >
                        {occupe === 'deploiement'
                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Lancement…</>
                          : <><Rocket className="w-3.5 h-3.5" /> Déployer maintenant</>}
                      </button>
                      <button
                        onClick={quitterEdition}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold text-brand-main/60 hover:text-brand-main dark:text-dark-text/50 dark:hover:text-white"
                      >
                        Plus tard
                      </button>
                    </div>
                    <p className="text-[11px] text-emerald-800/70 dark:text-emerald-300/60">
                      « Plus tard » est légitime : on groupe plusieurs corrections, puis on déploie une fois.
                      Corpus → État dira que la source a de l'avance.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={`Message de commit — défaut : « Corpus : ${ouvert.chemin} »`}
                      className="flex-1 min-w-[16rem] text-xs p-2 rounded-lg border border-brand-light dark:border-dark-sec-bg bg-transparent text-brand-main dark:text-dark-text placeholder:text-brand-main/35 dark:placeholder:text-dark-text/30"
                    />
                    <button
                      onClick={() => void enregistrer()}
                      disabled={!modifie || occupe === 'enregistrement'}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-brand-main text-white hover:opacity-90 disabled:opacity-40 dark:bg-white dark:text-brand-main"
                    >
                      {occupe === 'enregistrement'
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Envoi…</>
                        : <><Check className="w-3.5 h-3.5" /> Enregistrer</>}
                    </button>
                    <button
                      onClick={quitterEdition}
                      title="Abandonner les modifications"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-brand-main/50 hover:text-brand-main dark:text-dark-text/40 dark:hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" /> Annuler
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </article>
    </div>
  );
};

export default DocumentsView;
