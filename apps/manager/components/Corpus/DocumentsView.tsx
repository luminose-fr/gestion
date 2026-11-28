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
import { ExternalLink, PenLine, Check, X, Rocket, Loader2, AlertTriangle } from 'lucide-react';
import {
  fetchDocumentsCorpus, fetchDocumentCorpus, fetchSourceCorpus, enregistrerSourceCorpus,
  fetchDeploiement, lancerDeploiement,
  type DocumentCorpus, type DocumentListe, type EtatDeploiement,
} from '../../services/apiService';
import { Bouton, Champ, Markdown } from '../ui';
import { Carte, Etiquette, FOCUS, Pastille, Secondaire } from '../charte';
import { BLOCS } from './sections';

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

/** Le statut d'une fiche, en clair ; « actif » n'a pas de pastille dans la liste (retours du 28/11, §2.7). */
const STATUTS: Record<string, string> = { actif: 'Actif', active: 'Actif', suspendu: 'suspendu', termine: 'terminé', candidat: 'candidat', 'volontairement-absent': 'volontairement absent' };
const estActif = (statut: string | null | undefined) => !statut || statut === 'actif' || statut === 'active';

/** Les profils composés qui retiennent une fiche — la règle de packages/corpus/profils.ts, lue en clair. */
const profilsDe = (bloc: string, meta: Record<string, unknown>): string[] => [
  meta.noyau === true && ['socle', 'voix'].includes(bloc) ? 'noyau' : null,
  ['socle', 'voix', 'canaux', 'repertoire', 'outils'].includes(bloc) && meta.statut !== 'candidat' ? 'complet' : null,
  bloc === 'strategie' ? 'stratégie' : null,
].filter((p): p is string => !!p);

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const revuLe = (revu: unknown) => {
  const m = /^(\d{4})-(\d{2})/.exec(String(revu ?? ''));
  return m ? `revu en ${MOIS[Number(m[2]) - 1]} ${m[1]}` : null;
};

/** Le titre est déjà dans l'en-tête : un « # Titre » identique en tête du texte ne le répète pas. */
const sansTitre = (corps: string, titre: string) => {
  const m = /^\s*#\s+(.+)\n+/.exec(corps);
  return m && m[1].trim() === titre.trim() ? corps.slice(m[0].length) : corps;
};

const COULEUR_STATUT: Record<string, string> = {
  actif: 'text-succes',
  active: 'text-succes',
  suspendu: 'text-alerte',
  termine: 'text-second',
  candidat: 'text-texte',
  'volontairement-absent': 'text-second',
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
  const [ecart, setEcart] = useState<EtatDeploiement['ecart']>(null);

  useEffect(() => {
    fetchDocumentsCorpus()
      .then((r) => setListe(r.documents))
      .catch((e) => setErreur(e?.message ?? 'Liste injoignable.'));
  }, []);

  /** Les six blocs, dans l'ordre, chacun avec ses fiches : une seule liste dans l'écran (retours du 28/11, §2.7). */
  const blocs = useMemo(
    () => BLOCS.map((b) => ({ ...b, docs: (liste ?? []).filter((d) => d.bloc === b.id) })),
    [liste],
  );

  /**
   * L'adresse dit le bloc ; la fiche ouverte est la première de ce bloc, tant
   * qu'aucune fiche de ce bloc n'est déjà ouverte. Sans bloc, la première du corpus.
   */
  useEffect(() => {
    if (!liste?.length || (ouvert && (!bloc || ouvert.bloc === bloc))) return;
    const premiere = liste.find((d) => d.bloc === bloc) ?? liste[0];
    void ouvrir(premiere.chemin);
  }, [liste, bloc]);

  // Le jeton GitHub est facultatif : sans lui, la console lit le corpus et ne
  // l'écrit pas. On demande une fois, et on cache le bouton plutôt que de le
  // laisser échouer au clic.
  /**
   * Le même appel sert deux choses : savoir si le dépôt est ouvert en écriture,
   * et savoir CE QUI diffère entre le dépôt et ce que le Worker sert.
   *
   * L'écart était déjà dans la réponse et se perdait ici — d'où une fiche qui
   * s'affichait dans sa version servie, périmée, sans que rien ne le dise dès
   * lors qu'on avait rafraîchi la page. L'encart vert ne connaît que le commit
   * qu'on vient de faire ; il ne survit pas à un rechargement.
   */
  const relireDeploiement = () =>
    fetchDeploiement()
      .then((d) => { setDepotOuvert(d.configure); setEcart(d.ecart); })
      .catch(() => { setDepotOuvert(false); setEcart(null); });

  useEffect(() => { void relireDeploiement(); }, []);

  /**
   * Cette fiche-ci est-elle en retard sur le dépôt ?
   *
   * `comparable` faux veut dire « on ne sait pas » : on n'affiche alors rien de
   * particulier, plutôt qu'un silence qui vaudrait acquittement.
   */
  const retardDeLaFiche = ecart?.comparable
    ? ecart.differents.find((d) => d.chemin === ouvert?.chemin)
    : undefined;

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
      // L'écart date de l'ouverture de l'écran : sans cette relecture, revenir
      // en lecture après « Plus tard » n'afficherait aucun retard, alors qu'on
      // vient soi-même de le créer.
      void relireDeploiement();
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

  if (erreur && !liste) return <p className="text-secondaire text-sens-erreur">× {erreur}</p>;
  if (!liste) return <Secondaire>Lecture des documents…</Secondaire>;

  const fiche = ouvert ? liste.find((d) => d.chemin === ouvert.chemin) : undefined;
  const profils = ouvert ? profilsDe(ouvert.bloc, ouvert.meta) : [];
  const statut = ouvert ? String(ouvert.meta.statut ?? '') : '';

  return (
    <div className="flex flex-col gap-6 font-charte md:flex-row md:items-start md:gap-10">
      <nav aria-label="Documents du corpus" className="flex flex-none flex-col gap-0.5 md:w-64">
        {blocs.map((b) => (
          <React.Fragment key={b.id}>
            <Etiquette as="h2" className="flex whitespace-nowrap px-3 pb-1.5 pt-4 first:pt-0"><span className="flex-1">{b.label}</span><span>{b.docs.length}</span></Etiquette>
            {b.docs.length === 0 && <Secondaire className="px-3">Vide pour l’instant.</Secondaire>}
            {b.docs.map((d) => {
              const choisi = ouvert?.chemin === d.chemin;
              return (
                <button key={d.chemin} type="button" aria-current={choisi ? 'page' : undefined} title={d.titre}
                  onClick={() => {
                    // L'adresse suit le bloc sans relancer la route : la fiche choisie reste ouverte.
                    if (d.bloc !== bloc) window.history.replaceState(null, '', `#corpus/documents/${d.bloc}`);
                    void ouvrir(d.chemin);
                  }}
                  className={`flex min-h-9 items-center gap-2 rounded-controle px-3 py-1.5 text-left text-courant ${FOCUS} ${choisi ? 'bg-actif font-semibold text-marque' : 'font-medium text-texte hover:bg-survole'}`}>
                  <span className="min-w-0 flex-1">{d.titre}{chargement === d.chemin && <span className="text-second"> · ouverture…</span>}</span>
                  {!estActif(d.statut) && <Pastille>{STATUTS[d.statut ?? ''] ?? d.statut}</Pastille>}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </nav>

      <article className="flex min-w-0 max-w-[770px] flex-1 flex-col gap-4 md:pt-2">
        {erreur && <p role="alert" className="text-secondaire font-semibold text-sens-erreur">× {erreur}</p>}
        {!ouvert ? (
          <Secondaire>Choisissez un document.</Secondaire>
        ) : (
          <>
            <header className="flex flex-col gap-1.5">
              <Etiquette>{BLOCS.find((b) => b.id === ouvert.bloc)?.label ?? ouvert.bloc}</Etiquette>
              <h2 className="font-titre text-ecran-tel font-medium text-texte">{ouvert.titre}</h2>
              <div className="flex flex-wrap items-center gap-2">
                {statut && <Pastille ton={estActif(statut) ? 'succes' : 'alerte'}>{estActif(statut) ? '✓ Actif' : STATUTS[statut] ?? statut}</Pastille>}
                <Secondaire>
                  {[profils.length ? `Dans ${profils.length > 1 ? 'les profils' : 'le profil'} ${profils.join(' et ')}` : 'Dans aucun profil composé',
                    fiche ? `${fiche.taille.toLocaleString('fr-FR')} signes` : null, revuLe(ouvert.meta.revu)].filter(Boolean).join(' · ')}
                </Secondaire>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {depotOuvert && !edition && (
                  <Bouton onClick={() => void ouvrirEdition()} disabled={occupe === 'ouverture'} taille="petit" intention="secondaire">
                    {occupe === 'ouverture' ? <><Loader2 className="size-3.5 animate-spin" /> Lecture…</> : <><PenLine className="size-3.5" /> Modifier</>}
                  </Bouton>
                )}
                <a href={EDITEUR(ouvert.chemin)} target="_blank" rel="noreferrer"
                  className={`inline-flex items-center gap-1 rounded-controle text-secondaire font-semibold text-marque ${FOCUS}`}>
                  <ExternalLink className="size-3" /> {depotOuvert ? 'ou sur GitHub' : 'Modifier sur GitHub'}
                </a>
              </div>
            </header>

            {!edition && retardDeLaFiche && (
              /*
                Ce qu'on lit ici vient du bundle — donc de ce que les prompts
                reçoivent. Le dépôt, lui, a déjà autre chose.
              */
              <div className="flex flex-col gap-2 rounded-carte border border-sens-alerte bg-sens-alerte-fond p-3">
                <p className="text-sens-alerte">
                  <AlertTriangle className="-mt-0.5 inline size-3.5" />{' '}
                  {retardDeLaFiche.etat === 'supprime'
                    ? <>Cette fiche <strong>n'existe plus dans le dépôt</strong>, mais le Worker la sert encore.</>
                    : <>Le dépôt porte une version plus récente. <strong>Ce que vous lisez ici est celle que reçoivent les prompts.</strong></>}
                </p>
                <Bouton onClick={() => void deployer()} disabled={occupe === 'deploiement'} taille="petit" intention="principale" className="self-start">
                  {occupe === 'deploiement' ? <><Loader2 className="size-3.5 animate-spin" /> Lancement…</> : <><Rocket className="size-3.5" /> Déployer maintenant</>}
                </Bouton>
              </div>
            )}

            {!edition ? (
              <Carte className="px-6 pb-6 pt-5"><Markdown texte={sansTitre(ouvert.corps, ouvert.titre)} /></Carte>
            ) : (
              <div className="flex flex-col gap-3">
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
                  className="w-full resize-y rounded-controle border border-champ-bord bg-champ-fond p-3 font-mono text-secondaire text-texte outline-hidden focus:border-marque"
                />
                {commit ? (
                  /* Commité, pas déployé — l'état que rien n'annonçait avant. */
                  <div className="flex flex-col gap-2 rounded-carte border border-sens-succes bg-sens-succes-fond p-3">
                    <p className="text-sens-succes">
                      <Check className="-mt-0.5 inline size-3.5" />{' '}
                      Commité (<span className="font-mono">{commit}</span>).{' '}
                      <strong>Les prompts reçoivent encore l'ancienne version</strong> tant que le Worker n'est pas redéployé.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Bouton onClick={() => void deployer()} disabled={occupe === 'deploiement'} taille="petit" intention="principale">
                        {occupe === 'deploiement' ? <><Loader2 className="size-3.5 animate-spin" /> Lancement…</> : <><Rocket className="size-3.5" /> Déployer maintenant</>}
                      </Bouton>
                      <Bouton onClick={quitterEdition} taille="petit" intention="discrete">Plus tard</Bouton>
                    </div>
                    <Secondaire>« Plus tard » est légitime : on groupe plusieurs corrections, puis on déploie une fois. Corpus → État dira que la source a de l'avance.</Secondaire>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Champ value={message} onChange={(e) => setMessage(e.target.value)}
                      placeholder={`Message de commit — défaut : « Corpus : ${ouvert.chemin} »`} className="min-w-64 flex-1" />
                    <Bouton onClick={() => void enregistrer()} disabled={!modifie || occupe === 'enregistrement'} taille="petit" intention="principale">
                      {occupe === 'enregistrement' ? <><Loader2 className="size-3.5 animate-spin" /> Envoi…</> : <><Check className="size-3.5" /> Enregistrer</>}
                    </Bouton>
                    <Bouton onClick={quitterEdition} title="Abandonner les modifications" taille="petit" intention="discrete"><X className="size-3.5" /> Annuler</Bouton>
                  </div>
                )}
              </div>
            )}
            <Secondaire>
              Le corpus se modifie dans Git, et le déploiement le republie : une correction n'entre dans les prompts qu'au déploiement.
              L’onglet État dit ensuite quelles surfaces sont à recoller.
            </Secondaire>
          </>
        )}
      </article>
    </div>
  );
};

export default DocumentsView;
