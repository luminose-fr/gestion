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
import { ExternalLink } from 'lucide-react';
import { fetchDocumentsCorpus, fetchDocumentCorpus, type DocumentCorpus, type DocumentListe } from '../../services/apiService';
import Markdown from './Markdown';

const DEPOT = 'https://github.com/luminose-fr';

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

const DocumentsView: React.FC<Props> = ({ bloc }) => {
  const [liste, setListe] = useState<DocumentListe[] | null>(null);
  const [ouvert, setOuvert] = useState<DocumentCorpus | null>(null);
  const [chargement, setChargement] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

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

  const ouvrir = async (chemin: string) => {
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
              <a
                href={`${DEPOT}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-[11px] text-brand-main/50 hover:text-brand-main dark:text-dark-text/45 dark:hover:text-white"
              >
                <ExternalLink className="w-3 h-3" /> modifier dans le dépôt
              </a>
            </header>
            <Markdown texte={ouvert.corps} />
          </>
        )}
      </article>
    </div>
  );
};

export default DocumentsView;
