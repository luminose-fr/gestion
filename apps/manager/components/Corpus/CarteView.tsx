/**
 * La carte — comment le corpus atteint un modèle.
 *
 * POURQUOI CET ÉCRAN EST DANS L'APPLICATION, ET PAS UNE PAGE À CÔTÉ.
 *
 * Une documentation qui vit ailleurs que ce qu'elle décrit se périme sans que
 * rien ne la contredise. C'est précisément ce qu'on a passé une journée à
 * retirer des README du corpus, le 13/09/2026 : cinq blocs annonçaient encore
 * « Vide aujourd'hui » avec vingt-sept fiches en place, un README comptait deux
 * décisions quand il y en avait trois. Aucun test ne lit un README.
 *
 * CONSÉQUENCE, ET C'EST LA RÈGLE DE CE FICHIER : **aucun chiffre n'est écrit
 * ici.** Les effectifs, les tailles de profil et les poids de feuille sont lus
 * à l'exécution (`/api/corpus`, `/api/corpus/feuilles`) ; les rôles, leurs
 * personas et leurs feuilles viennent de `@luminose/editorial` ; les surfaces
 * de `./surfaces`. Cet écran ne PEUT pas annoncer un corpus qu'il n'a pas.
 *
 * Ce qui s'écrit ici, en revanche, et qui ne vit nulle part ailleurs : la prose
 * qui explique le MÉCANISME — pourquoi la feuille est préfixée en aval de
 * `buildSystemPrompt`, pourquoi le Lecteur froid ne reçoit rien, pourquoi
 * l'écart se mesure sur des empreintes. Un fait, un propriétaire.
 */
import React, { useEffect, useState } from 'react';
import { AI_ACTION_CATALOG, FEUILLE_PAR_ACTION } from '@luminose/editorial';
import {
  fetchEtatCorpus, fetchDocumentsCorpus, fetchFeuilles,
  type EtatCorpus, type ResumeFeuille,
} from '../../services/apiService';
import { SURFACES } from './surfaces';
import { BLOCS } from './sections';
import { Etiquette, CLASSES_SURTITRE, TitreSection } from '../ui';

const nb = (n: number) => n.toLocaleString('fr-FR');

/**
 * La chaîne du flux éditorial, dans l'ordre où elle se joue.
 *
 * Le champ s'appelle `id` et non `action`, et ce n'est pas une coquetterie :
 * un test parcourt les sources à la recherche d'une propriété nommée « action »
 * portant une chaîne, pour vérifier que tout libellé passé à un appel IA existe
 * au catalogue. Ces valeurs-ci sont des ids, pas des libellés — le champ
 * s'appelait « action » et faisait échouer ce test à sept reprises.
 *
 * À savoir : ce test lit du TEXTE, pas du code. Un commentaire qui cite le
 * motif le déclenche aussi — c'est arrivé à celui-ci, d'où sa formulation.
 *
 * Seul le libellé court est écrit ici : « Analyse des idées » ne tient pas dans
 * une case de 120 px. Le persona et l'attendu, eux, viennent du catalogue —
 * les recopier créerait une deuxième vérité sur qui joue quel rôle.
 */
const CHAINE: Array<{ id: string; court: string }> = [
  { id: 'ANALYZE_BATCH',             court: 'Analyse' },
  { id: 'COACH_CHAT',                court: 'Atelier' },
  { id: 'LOCK_BRIEF',                court: 'Brief' },
  { id: 'DRAFT_CONTENT',             court: 'Rédaction' },
  { id: 'COLD_READ',                 court: 'Relecture' },
  { id: 'ADJUST_CONTENT',            court: 'Ajustement' },
  { id: 'GENERATE_CARROUSEL_SLIDES', court: 'Carrousel' },
];

const personaDe = (action: string) =>
  AI_ACTION_CATALOG.find(a => a.id === action)?.persona ?? '';

/**
 * Ce que chaque statut VEUT DIRE.
 *
 * La liste, elle, vient du Worker (`/api/corpus`), qui la tient d'un seul
 * endroit : la garde qui refuse un statut inconnu au commit. Un statut ajouté
 * là-bas apparaît donc ici sans rien de plus — et l'écran signale qu'il lui
 * manque sa définition, plutôt que de le passer sous silence.
 */
const SENS_DES_STATUTS: Record<string, string> = {
  'actif': "Proposable aujourd'hui. Chargé partout.",
  'active': "La forme que prennent les décisions datées : la décision est en vigueur.",
  'suspendu': "Relançable tel quel. Exclu en rédaction, gardé en réflexion stratégique. — Le Seuil",
  'termine': "Ne se reproposera pas ; sa matière part dans repertoire/. — les ateliers archétypes",
  'candidat': "N'est pas un fait. Ne doit jamais sortir dans un contenu. — « Le Souffle des Étoiles »",
  'volontairement-absent': "Pas de règle ici, et c'est délibéré. À re-confirmer à la revue, jamais à combler.",
};

/* ── Habillage ───────────────────────────────────────────────────────── */

const Section: React.FC<{ titre: string; chapeau?: string; children: React.ReactNode }> = ({ titre, chapeau, children }) => (
  <section className="pt-8 first:pt-0 border-t first:border-t-0 border-brand-border/70 dark:border-dark-sec-border">
    <TitreSection titre={titre} />
    {chapeau && (
      <p className="mt-1 text-sm text-brand-main/60 dark:text-dark-text/60 max-w-3xl">{chapeau}</p>
    )}
    <div className="mt-4">{children}</div>
  </section>
);

const Prose: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="max-w-3xl text-sm leading-relaxed text-brand-main dark:text-dark-text space-y-3">
    {children}
  </div>
);

const Figure: React.FC<{ titre: string; legende: React.ReactNode; children: React.ReactNode }> = ({ titre, legende, children }) => (
  <figure className="m-0 mt-5 rounded-xl border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface p-4 md:p-5">
    <div className="overflow-x-auto text-brand-main dark:text-dark-text">{children}</div>
    <figcaption className="mt-4 pt-3 border-t border-brand-border dark:border-dark-sec-border text-xs leading-relaxed text-brand-main/70 dark:text-dark-text/60 max-w-3xl">
      <strong className="text-brand-main dark:text-dark-text">{titre}</strong>{' '}{legende}
    </figcaption>
  </figure>
);

const Tableau: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mt-5 overflow-x-auto">
    <table className="w-full min-w-[520px] text-sm border-collapse">{children}</table>
  </div>
);

const Th: React.FC<{ children?: React.ReactNode; droite?: boolean }> = ({ children, droite }) => (
  <th className={`pb-2 pr-4 ${CLASSES_SURTITRE} border-b border-brand-border dark:border-dark-sec-border whitespace-nowrap ${droite ? 'text-right' : 'text-left'}`}>
    {children}
  </th>
);

const Td: React.FC<{ children?: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <td className={`py-2 pr-4 align-top border-b border-brand-border dark:border-dark-sec-border ${className}`}>{children}</td>
);

const Mono: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="font-mono text-xs">{children}</span>
);

const Puce: React.FC<{ children: React.ReactNode; ton?: 'neutre' | 'attention' }> = ({ children, ton = 'neutre' }) => (
  <span className={`inline-block font-mono text-micro px-1.5 py-0.5 rounded-md border ${
    ton === 'attention'
      ? 'text-alerte border-alerte/30'
      : 'text-brand-main/70 border-brand-border dark:text-dark-text/70 dark:border-dark-sec-border'
  }`}>{children}</span>
);

/**
 * Une liste numérotée — à n'employer que quand l'ordre porte une information.
 * Ici il en porte une : les couches d'un prompt sont empilées dans cet ordre,
 * et une consigne de sortie placée avant le rôle ne se lirait pas pareil.
 */
const Couches: React.FC<{ items: Array<{ titre: string; texte: string; option?: boolean }> }> = ({ items }) => (
  <ol className="mt-4 space-y-0 list-none p-0 max-w-3xl">
    {items.map((c, i) => (
      <li key={c.titre} className="grid grid-cols-[1.8rem_1fr] gap-x-3 py-2 border-b border-brand-border dark:border-dark-sec-border last:border-b-0">
        <span className="font-mono text-xs tabular-nums text-brand-main/45 dark:text-dark-text/40 pt-0.5">
          {String(i + 1).padStart(2, '0')}
        </span>
        <span className="text-sm leading-relaxed text-brand-main dark:text-dark-text">
          <strong className="font-semibold">{c.titre}</strong>
          {c.option && <span className="ml-2 align-middle"><Puce>seulement si</Puce></span>}
          <span className="block text-brand-main/70 dark:text-dark-text/60">{c.texte}</span>
        </span>
      </li>
    ))}
  </ol>
);

const Points: React.FC<{ items: Array<{ titre: string; texte: string }> }> = ({ items }) => (
  <ul className="mt-4 space-y-3 list-none p-0 max-w-3xl">
    {items.map(p => (
      <li key={p.titre} className="relative pl-5 text-sm leading-relaxed text-brand-main dark:text-dark-text">
        <span className="absolute left-0 top-[0.62em] w-2.5 h-px bg-brand-main dark:bg-dark-text" />
        <strong className="font-semibold">{p.titre}</strong> {p.texte}
      </li>
    ))}
  </ul>
);

const Refus: React.FC<{ items: Array<{ titre: string; texte: string; renverse?: boolean }> }> = ({ items }) => (
  <ul className="mt-4 space-y-3 list-none p-0 max-w-3xl">
    {items.map(x => (
      <li key={x.titre} className="grid grid-cols-[1.1rem_1fr] gap-x-3 text-sm leading-relaxed text-brand-main dark:text-dark-text">
        <span className={`font-mono leading-relaxed ${x.renverse ? 'text-alerte' : 'text-brand-main/45 dark:text-dark-text/40'}`}>
          {x.renverse ? '~' : '\u00d7'}
        </span>
        <span>
          <strong className="font-semibold">{x.titre}</strong>{' '}
          <span className="text-brand-main/70 dark:text-dark-text/60">{x.texte}</span>
        </span>
      </li>
    ))}
  </ul>
);

/* ── L'écran ─────────────────────────────────────────────────────────── */

const CarteView: React.FC = () => {
  const [etat, setEtat] = useState<EtatCorpus | null>(null);
  const [parBloc, setParBloc] = useState<Record<string, number>>({});
  const [feuilles, setFeuilles] = useState<Record<string, ResumeFeuille>>({});
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [e, d] = await Promise.all([fetchEtatCorpus(), fetchDocumentsCorpus()]);
        setEtat(e);
        const compte: Record<string, number> = {};
        for (const doc of d.documents) compte[doc.bloc] = (compte[doc.bloc] ?? 0) + 1;
        setParBloc(compte);
        setErreur(null);
      } catch (err: any) {
        setErreur(err?.message ?? 'Le corpus est injoignable.');
      }
    })();
    // À part et sans bloquer : cette route est plus récente que l'écran, et une
    // version du Worker qui ne la sert pas encore ne doit pas vider la page.
    fetchFeuilles()
      .then(r => setFeuilles(Object.fromEntries(r.feuilles.map(f => [f.action, f]))))
      .catch(() => setFeuilles({}));
  }, []);

  if (erreur && !etat) {
    return <p className="text-sm text-erreur">Échec — {erreur}</p>;
  }
  if (!etat) {
    return <div className="text-sm text-brand-main/60 dark:text-dark-text/60">Lecture du corpus…</div>;
  }

  const profil = (id: string) => etat.profils.find(p => p.profil === id);
  const taille = (id: string) => profil(id)?.taille ?? 0;
  const poids = (action: string) => feuilles[action];

  return (
    <div className="space-y-8 pb-6">

      {/* ── Le propos, et les chiffres du jour ── */}
      <div>
        <p className="max-w-3xl text-sm leading-relaxed text-brand-main dark:text-dark-text">
          Le corpus est une seule copie modifiable — {nb(etat.documents)} fiches markdown dans
          le dépôt. Cette page dit par quels chemins elles atteignent un modèle, et ce qui les
          empêche de diverger. <strong>Aucun chiffre n'y est recopié :</strong> tout ce qui est
          compté ci-dessous est lu à l'ouverture de l'écran.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs text-brand-main/70 dark:text-dark-text/60">
          <span><strong className="text-brand-main dark:text-dark-text">{nb(etat.documents)}</strong> fiches</span>
          <span><strong className="text-brand-main dark:text-dark-text">{etat.blocs.length}</strong> blocs</span>
          <span><strong className="text-brand-main dark:text-dark-text">{etat.profils.length}</strong> profils</span>
          <span><strong className="text-brand-main dark:text-dark-text">{AI_ACTION_CATALOG.length}</strong> actions éditoriales</span>
          <span>au {new Date(etat.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
      </div>

      {/* ══════ LA SOURCE ══════ */}
      <Section titre="La source" chapeau="Un dossier de markdown dans le dépôt. Rien d'autre n'est modifiable : tout le reste en est dérivé.">
        <Prose>
          <p>
            Les fiches vivent dans <Mono>packages/corpus/content/</Mono>. Chaque fiche porte un
            frontmatter — <Mono>type</Mono>, <Mono>statut</Mono>, <Mono>revu</Mono>,{' '}
            <Mono>expose</Mono>, <Mono>noyau</Mono> — et ce frontmatter décide seul de ce qui
            entre dans quel contexte. Le tableau des offres servi en tête de chaque pack en est
            dérivé : personne ne le recopie, donc personne ne peut oublier de le mettre à jour.
          </p>
          <p>
            Les <Mono>README.md</Mono> des blocs, eux, ne sont <em>pas</em> chargés. Ce sont des
            notes pour un humain. Une règle qui doit atteindre un modèle n'a rien à y faire —
            elle va dans une fiche.
          </p>
        </Prose>

        <Tableau>
          <thead>
            <tr>
              <Th>Bloc</Th>
              <Th droite>Fiches</Th>
              <Th>Ce qu'il porte</Th>
            </tr>
          </thead>
          <tbody>
            {BLOCS.map(b => (
              <tr key={b.id}>
                <Td className="font-semibold whitespace-nowrap text-brand-main dark:text-white">{b.label}</Td>
                <Td className="font-mono text-xs tabular-nums text-right text-brand-main/70 dark:text-dark-text/70">
                  {parBloc[b.id] ?? 0}
                </Td>
                <Td className="text-brand-main/70 dark:text-dark-text/60">{b.sousTitre}</Td>
              </tr>
            ))}
          </tbody>
        </Tableau>

        <h3 className="mt-8 text-sm font-bold text-brand-main dark:text-white">Le vocabulaire des statuts</h3>
        <Prose>
          <p>
            Le <Mono>statut</Mono> d'une fiche décide si elle entre dans un contexte et si l'offre
            qu'elle porte peut être proposée. Le Worker refuse au commit tout statut hors de cette
            liste : un <Mono>actiff</Mono> mal tapé rendrait Le Seuil proposable sans que rien ne
            l'annonce.
          </p>
        </Prose>

        <Tableau>
          <thead>
            <tr>
              <Th>Statut</Th>
              <Th>Ce qu'il veut dire</Th>
            </tr>
          </thead>
          <tbody>
            {(etat.statuts ?? Object.keys(SENS_DES_STATUTS)).map(s => (
              <tr key={s}>
                <Td className="whitespace-nowrap"><Mono>{s}</Mono></Td>
                <Td className="text-brand-main/70 dark:text-dark-text/60">
                  {SENS_DES_STATUTS[s] ?? (
                    <span className="text-alerte">
                      Statut connu du Worker mais pas décrit ici — ajouter sa définition.
                    </span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Tableau>

        <div className="mt-4 max-w-3xl text-sm leading-relaxed text-brand-main dark:text-dark-text">
          <p>
            Le dernier est le moins évident et le plus utile : sans lui, une IA qui lit le corpus
            comble le vide en inventant une charte, et l'incohérence revient là où il y avait une
            liberté assumée.
          </p>
        </div>

        <Figure
          titre="Une source, trois chemins de distribution."
          legende={<>
            Le troisième explique pourquoi les feuilles de salle nomment{' '}
            <Mono>voix/direction-artistique</Mono> et non le bloc <Mono>voix/</Mono> entier :
            les personas portent déjà les règles de voix par la voie basse. Servir le bloc en
            plus enverrait les mêmes ~3 900 caractères deux fois dans le même appel. Un test
            NORMATIF interdit qu'une feuille les nomme.
          </>}
        >
          <svg viewBox="0 0 980 420" className="block w-full min-w-[680px] h-auto" role="img"
               aria-label="Le dossier content alimente trois chemins parallèles : composer produit les trois profils collés ou synchronisés sur les surfaces externes ; composerFeuille produit une feuille de salle préfixée au prompt à chaque appel ; embarquer engendre voice.ts importé par les personas.">
            <defs>
              <marker id="carte-fl1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
              </marker>
            </defs>

            <rect x="16" y="40" width="170" height="340" rx="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <text x="101" y="76" textAnchor="middle" fontSize="11" fontWeight="700" letterSpacing="1.6" fill="currentColor">LA SOURCE</text>
            <line x1="40" y1="90" x2="162" y2="90" stroke="currentColor" strokeWidth="1" opacity="0.28" />
            <text x="101" y="116" textAnchor="middle" fontSize="11.5" fontFamily="monospace" fill="currentColor">content/</text>
            {BLOCS.map((b, i) => (
              <text key={b.id} x="101" y={150 + i * 22} textAnchor="middle" fontSize="11" fontFamily="monospace" fill="currentColor" opacity="0.62">
                {b.id}/ · {parBloc[b.id] ?? 0}
              </text>
            ))}
            <line x1="40" y1="292" x2="162" y2="292" stroke="currentColor" strokeWidth="1" opacity="0.28" />
            <text x="101" y="318" textAnchor="middle" fontSize="13" fontWeight="600" fill="currentColor">{nb(etat.documents)} fiches</text>
            <text x="101" y="342" textAnchor="middle" fontSize="11.5" fill="currentColor" opacity="0.6">la seule copie</text>
            <text x="101" y="358" textAnchor="middle" fontSize="11.5" fill="currentColor" opacity="0.6">modifiable</text>

            {/* voie 1 — les profils */}
            <line x1="186" y1="80" x2="310" y2="80" stroke="currentColor" strokeWidth="1.4" markerEnd="url(#carte-fl1)" />
            <text x="251" y="70" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="currentColor">composer()</text>
            <rect x="316" y="36" width="200" height="88" rx="7" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.55" />
            <text x="416" y="66" textAnchor="middle" fontSize="14" fontWeight="600" fill="currentColor">{etat.profils.length} profils</text>
            <text x="416" y="88" textAnchor="middle" fontSize="10.5" fontFamily="monospace" fill="currentColor" opacity="0.66">noyau {nb(taille('noyau'))} · complet {nb(taille('complet'))}</text>
            <text x="416" y="104" textAnchor="middle" fontSize="10.5" fontFamily="monospace" fill="currentColor" opacity="0.66">stratégie {nb(taille('strategie'))} car.</text>
            <line x1="516" y1="80" x2="610" y2="80" stroke="currentColor" strokeWidth="1.4" markerEnd="url(#carte-fl1)" />
            <text x="563" y="70" textAnchor="middle" fontSize="10.5" fontFamily="monospace" fill="currentColor">collé</text>
            <rect x="616" y="36" width="348" height="88" rx="7" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.55" />
            <text x="790" y="68" textAnchor="middle" fontSize="14" fontWeight="600" fill="currentColor">Projet Claude · Gem Gemini · GPT</text>
            <text x="790" y="92" textAnchor="middle" fontSize="12" fill="currentColor" opacity="0.66">un pack entier, posé à la main</text>
            <text x="790" y="110" textAnchor="middle" fontSize="12" fill="currentColor" opacity="0.66">ou synchronisé depuis GitHub</text>

            {/* voie 2 — les feuilles */}
            <line x1="186" y1="210" x2="310" y2="210" stroke="currentColor" strokeWidth="1.4" markerEnd="url(#carte-fl1)" />
            <text x="251" y="200" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="currentColor">composerFeuille()</text>
            <rect x="316" y="166" width="200" height="88" rx="7" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.55" />
            <text x="416" y="196" textAnchor="middle" fontSize="14" fontWeight="600" fill="currentColor">Feuille de salle</text>
            <text x="416" y="219" textAnchor="middle" fontSize="11.5" fill="currentColor" opacity="0.66">une sélection fine de chemins,</text>
            <text x="416" y="235" textAnchor="middle" fontSize="11.5" fill="currentColor" opacity="0.66">propre à l'action appelée</text>
            <line x1="516" y1="210" x2="610" y2="210" stroke="currentColor" strokeWidth="1.4" markerEnd="url(#carte-fl1)" />
            <text x="563" y="200" textAnchor="middle" fontSize="10.5" fontFamily="monospace" fill="currentColor">préfixée</text>
            <rect x="616" y="166" width="348" height="88" rx="7" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.55" />
            <text x="790" y="196" textAnchor="middle" fontSize="14" fontWeight="600" fill="currentColor">Les appels IA de cette console</text>
            <text x="790" y="220" textAnchor="middle" fontSize="12" fill="currentColor" opacity="0.66">en tête du prompt système, dans le</text>
            <text x="790" y="238" textAnchor="middle" fontSize="12" fill="currentColor" opacity="0.66">Worker — jamais dans la composition</text>

            {/* voie 3 — le code engendré */}
            <line x1="186" y1="340" x2="310" y2="340" stroke="currentColor" strokeWidth="1.4" markerEnd="url(#carte-fl1)" />
            <text x="251" y="330" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="currentColor">embarquer</text>
            <rect x="316" y="296" width="200" height="88" rx="7" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.55" />
            <text x="416" y="326" textAnchor="middle" fontSize="14" fontWeight="600" fontFamily="monospace" fill="currentColor">voice.ts</text>
            <text x="416" y="349" textAnchor="middle" fontSize="11.5" fill="currentColor" opacity="0.66">engendré au build, gitignoré,</text>
            <text x="416" y="365" textAnchor="middle" fontSize="11.5" fill="currentColor" opacity="0.66">jamais édité à la main</text>
            <line x1="516" y1="340" x2="610" y2="340" stroke="currentColor" strokeWidth="1.4" markerEnd="url(#carte-fl1)" />
            <text x="563" y="330" textAnchor="middle" fontSize="10.5" fontFamily="monospace" fill="currentColor">importé</text>
            <rect x="616" y="296" width="348" height="88" rx="7" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.55" />
            <text x="790" y="326" textAnchor="middle" fontSize="14" fontWeight="600" fill="currentColor">Les personas</text>
            <text x="790" y="350" textAnchor="middle" fontSize="12" fill="currentColor" opacity="0.66">VOICE_RULES entre dans chaque prompt</text>
            <text x="790" y="368" textAnchor="middle" fontSize="12" fill="currentColor" opacity="0.66">système, quel que soit le rôle</text>
          </svg>
        </Figure>
      </Section>

      {/* ══════ LES DESTINATIONS ══════ */}
      <Section titre="Les destinations" chapeau="Les surfaces qui portent un contexte Luminose. Deux seulement demandent un geste.">
        <Prose>
          <p>
            Chaque pack composé porte un hash de son <em>contenu</em> — pas de sa date.{' '}
            <strong>Corpus → État</strong> compare le hash posé sur une surface au hash courant :
            c'est ce qui rend visible qu'un Gem est resté sur une version d'il y a trois semaines.
          </p>
          <p>
            <strong>Un GPT et un Gem comptent chacun pour deux dépôts.</strong> Leur champ
            d'instructions est plafonné — le profil complet, 35 000 caractères, n'y entre pas —
            et ils ont à côté un espace de fichiers de connaissance. Le montage qui marche est
            donc : le <Mono>noyau</Mono> collé dans les instructions, le <Mono>complet</Mono>
            importé en fichier. Les deux se périment séparément, d'où une ligne pour chacun.
          </p>
          <p>
            Le fichier descend en <Mono>.txt</Mono> et non en <Mono>.md</Mono> : la liste des
            types acceptés par un Gem — TXT, DOC, DOCX, PDF, RTF, Google Docs — ne comprend pas
            le markdown. Le contenu, lui, reste du markdown, qu'un modèle lit sans peine. Et un
            fichier importé <strong>ne se met pas à jour tout seul</strong> : à chaque
            changement du corpus, il faut le retélécharger et remplacer l'ancien.
          </p>
        </Prose>

        <Tableau>
          <thead>
            <tr>
              <Th>Surface</Th>
              <Th>Reçoit</Th>
              <Th>Comment</Th>
            </tr>
          </thead>
          <tbody>
            {SURFACES.map(s => (
              <tr key={s.id}>
                <Td className="font-semibold text-brand-main dark:text-white">{s.nom}</Td>
                <Td><Mono>{s.profil}</Mono></Td>
                <Td className="text-brand-main/70 dark:text-dark-text/60">
                  {s.automatique
                    ? <><Puce>automatique</Puce> {s.note}</>
                    : <><Puce ton="attention">{s.geste === 'telecharger' ? 'fichier à importer' : 'à coller'}</Puce> {s.note}</>}
                </Td>
              </tr>
            ))}
          </tbody>
        </Tableau>
      </Section>

      {/* ══════ LE FLUX ÉDITORIAL ══════ */}
      <Section titre="Le flux éditorial" chapeau="Une décision par rôle sur ce qu'il a le droit de savoir.">
        <Prose>
          <p>
            Donner tout le corpus à tous les rôles noierait la consigne : les deux prompts les
            plus lourds du flux approchent déjà 17 000 caractères. Chaque action reçoit donc une{' '}
            <strong>feuille de salle</strong> — une sélection de chemins, pas un bloc entier.
          </p>
          <p>
            Elle est préfixée au prompt dans le Worker, <strong>en aval</strong> de{' '}
            <Mono>buildSystemPrompt()</Mono>. Si elle entrait dans la composition, les dix-neuf
            fixtures golden changeraient à chaque retouche du corpus : ajouter une ligne à une
            fiche ferait bouger dix-neuf fichiers de référence, et « la revue du diff de fixture
            EST la revue du changement » deviendrait du bruit qu'on valide sans lire.
          </p>
        </Prose>

        <h3 className="mt-8 text-sm font-bold text-brand-main dark:text-white">L'anatomie d'un appel</h3>
        <Prose>
          <p>
            Un appel se compose toujours dans le même ordre : le rôle d'abord, les circonstances
            ensuite, la forme de la réponse en dernier. C'est <Mono>buildSystemPrompt()</Mono> qui
            assemble, et c'est ce résultat-là que la fixture golden photographie.
          </p>
        </Prose>

        <Couches items={[
          { titre: 'Le rôle', texte: 'Le persona, figé dans le code — jamais recomposé.' },
          { titre: 'La grille du format', texte: 'Rédaction et ajustement seulement : longueurs, bascules, rôle de chaque partie.', option: true },
          { titre: 'Les règles de CTA', texte: "Celles que l'objectif commande." },
          { titre: 'Le contexte de série', texte: "Seulement si la publication appartient à une série. Anciennement « contexte additionnel », un fourre-tout qui ne transportait qu'une chose — l'étiquette envoyée au modèle, elle, n'a pas changé.", option: true },
          { titre: 'La forme de la réponse', texte: "Le JSON attendu, propre à l'action." },
          { titre: 'La feuille de salle', texte: "Ajoutée en dernier et AILLEURS : dans le Worker, en tête du prompt déjà composé. C'est ce qui la met hors du champ de la fixture." },
        ]} />

        <Prose>
          <p className="mt-4">
            La dernière couche est <strong>facultative</strong> : sans elle, l'appel est celui
            d'avant à l'octet près. On peut donc couper un rôle à la fois — une ligne dans la
            table — sans rien redéployer du front. Ça compte, parce qu'un prompt ne tombe pas en
            panne : il rend un texte un peu moins bon, ce qui est bien plus difficile à voir.
          </p>
        </Prose>

        <Figure
          titre="Qui reçoit le corpus, et qui n'en reçoit rien."
          legende={<>
            Le Lecteur froid lit « avec les yeux d'un inconnu » : lui donner le positionnement le
            rendrait moins inconnu, donc moins utile. Mais l'inverse a un prix — privé de source,
            un rôle s'en fabrique une. C'est arrivé à l'Artiste, qui portait sa propre copie de
            la charte et a peint des mois durant aux couleurs du Seuil, une offre suspendue.
          </>}
        >
          <svg viewBox="0 0 980 360" className="block w-full min-w-[680px] h-auto" role="img"
               aria-label="Le corpus, en barre au sommet, descend vers six des sept étapes du flux éditorial avec le poids de chaque feuille. La relecture à froid ne reçoit aucune ligne : elle est volontairement privée de contexte. La relecture et l'ajustement forment une boucle qui tourne tant que le verdict n'est pas publiable ; le carrousel est une branche, pas une suite.">
            <defs>
              <marker id="carte-fl2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
              </marker>
            </defs>

            <rect x="16" y="18" width="948" height="40" rx="6" fill="currentColor" opacity="0.07" />
            <rect x="16" y="18" width="948" height="40" rx="6" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.5" />
            <text x="490" y="43" textAnchor="middle" fontSize="13" fontWeight="600" fill="currentColor">le corpus, servi par feuille de salle</text>

            {CHAINE.map((e, i) => {
              const x = 16 + i * 138;
              const cx = x + 60;
              const f = poids(e.id);
              const rien = FEUILLE_PAR_ACTION[e.id] === null;
              return (
                <g key={e.id}>
                  {rien ? (
                    <>
                      <text x={cx} y="88" textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor">rien</text>
                      <text x={cx} y="106" textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.7">et c'est voulu</text>
                      <line x1={cx} y1="120" x2={cx} y2="186" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 5" opacity="0.4" />
                      <circle cx={cx} cy="58" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.55" />
                    </>
                  ) : (
                    <>
                      <line x1={cx} y1="58" x2={cx} y2="192" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#carte-fl2)" />
                      <text x={cx} y="92" textAnchor="middle" fontSize="11.5" fontFamily="monospace" fill="currentColor">
                        {f ? nb(f.taille) : '…'}
                      </text>
                      {/* L'unité n'a de sens qu'avec un nombre : « — car. » se lirait comme une mesure. */}
                      {f && <text x={cx} y="108" textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.6">car.</text>}
                    </>
                  )}
                  <rect x={x} y="196" width="120" height="62" rx="6" fill="none" stroke="currentColor"
                        strokeWidth={e.id === 'DRAFT_CONTENT' ? 2.2 : 1.4}
                        strokeDasharray={rien ? '5 4' : undefined} />
                  <text x={cx} y="222" textAnchor="middle" fontSize="13" fontWeight="600" fill="currentColor">{e.court}</text>
                  <text x={cx} y="240" textAnchor="middle" fontSize="10.5" fill="currentColor" opacity="0.62">{personaDe(e.id)}</text>
                  {i < CHAINE.length - 1 && (
                    <line x1={x + 120} y1="227" x2={x + 132} y2="227" stroke="currentColor" strokeWidth="1.2"
                          opacity="0.5" strokeDasharray={i === 5 ? '4 3' : undefined} markerEnd="url(#carte-fl2)" />
                  )}
                </g>
              );
            })}

            {/*
              LA BOUCLE. Le Lecteur froid JUGE et ne produit aucune version du
              texte ; l'Ajustement corrige, puis on relit. Dessiner ces deux-là
              en file laisserait croire qu'on relit une fois et qu'on passe à la
              suite — c'est l'erreur de la première version de ce schéma.
            */}
            <path d="M 766 258 L 766 292 L 628 292 L 628 264" fill="none" stroke="currentColor"
                  strokeWidth="1.2" opacity="0.5" markerEnd="url(#carte-fl2)" />
            <text x="697" y="286" textAnchor="middle" fontSize="10.5" fill="currentColor" opacity="0.7">
              puis on relit, tant que le verdict n'est pas « publiable »
            </text>

            <text x="904" y="278" textAnchor="middle" fontSize="10.5" fill="currentColor" opacity="0.7">une branche,</text>
            <text x="904" y="292" textAnchor="middle" fontSize="10.5" fill="currentColor" opacity="0.7">pas une suite</text>

            <text x="490" y="328" textAnchor="middle" fontSize="11.5" fill="currentColor" opacity="0.7">
              Le trait épais marque l'action où se disent le tarif, le titre et l'appel à l'action.
            </text>
            <text x="490" y="348" textAnchor="middle" fontSize="11.5" fill="currentColor" opacity="0.7">
              L'Éclateur, hors chaîne, décide en une fois pour toute une série — et reçoit seul le bloc stratégie.
            </text>
          </svg>
        </Figure>

        <Tableau>
          <thead>
            <tr>
              <Th>Action</Th>
              <Th>Persona</Th>
              <Th>Attendu</Th>
              <Th>Reçoit</Th>
              <Th droite>Feuille</Th>
            </tr>
          </thead>
          <tbody>
            {AI_ACTION_CATALOG.map(a => {
              const chemins = FEUILLE_PAR_ACTION[a.id];
              const f = poids(a.id);
              return (
                <tr key={a.id}>
                  <Td><Mono>{a.id}</Mono></Td>
                  <Td className="whitespace-nowrap text-brand-main dark:text-white">{a.persona}</Td>
                  <Td className="text-brand-main/70 dark:text-dark-text/60">{a.attendu}</Td>
                  <Td>
                    {chemins === null
                      ? <Puce ton="attention">rien — décision</Puce>
                      : <span className="font-mono text-xs text-brand-main/70 dark:text-dark-text/70">{chemins.join(' · ')}</span>}
                  </Td>
                  <Td className="font-mono text-xs tabular-nums text-right whitespace-nowrap text-brand-main/70 dark:text-dark-text/70">
                    {chemins === null ? '—' : f ? nb(f.taille) : '…'}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Tableau>
        <div className="mt-6 max-w-3xl rounded-lg border-l-2 border-brand-main dark:border-dark-text bg-brand-light dark:bg-dark-sec-bg px-4 py-3">
          <Etiquette forme="entete" className="mb-1.5">
            Où voir ce qui part vraiment
          </Etiquette>
          <p className="text-sm leading-relaxed text-brand-main dark:text-dark-text">
            <strong>Réglages → Personas.</strong> Chaque rôle y montre sa feuille de salle en
            premier — demandée au Worker, jamais recomposée dans le navigateur, sans quoi l'écran
            de vérification pourrait montrer autre chose que ce qui est envoyé — puis le prompt
            composé qui suit.
          </p>
        </div>
      </Section>

      {/* ══════ LE FLUX DE MISE À JOUR ══════ */}
      <Section titre="Le flux de mise à jour" chapeau="Deux façons d'écrire, une seule copie modifiable, et une comparaison d'empreintes pour savoir si le service a pris le changement.">
        <Prose>
          <p>
            Le corpus servi par le Worker est une <em>constante du bundle</em> : l'application ne
            peut pas écrire ce qu'elle sert. Quand on modifie une fiche depuis cette console,
            l'écriture part vers <strong>Git</strong> par l'API GitHub — jamais vers le bundle.
            Une copie modifiable et un instantané servi ; pas deux entrepôts.
          </p>
          <p>
            Conséquence à connaître : <strong>ce qu'on donne à éditer se lit sur GitHub, jamais
            dans le bundle.</strong> Le bundle est la photo du dernier déploiement ; éditer la
            photo écraserait sans le voir tout commit intervenu depuis.
          </p>
          <p>
            Autre conséquence, côté coût : lire une fiche ne coûte <strong>aucune requête D1</strong>.
            Le budget des cinquante par invocation n'est pas entamé par le corpus. Et chaque fiche
            porte un lien « ou sur GitHub » : pour éditer à la main, voir l'historique, ou régler
            un conflit.
          </p>
        </Prose>

        <div className="mt-5 max-w-3xl rounded-lg border-l-2 border-alerte bg-alerte/10 px-4 py-3">
          <Etiquette forme="entete" ton="alerte" className="mb-1.5">
            Le piège
          </Etiquette>
          <p className="text-sm leading-relaxed text-brand-main dark:text-dark-text">
            <strong>Enregistrer ne déploie pas.</strong> Corriger une fiche puis relancer une
            rédaction dans la foulée, c'est envoyer l'ancienne version au modèle. L'écran le dit
            après l'enregistrement ; si vous avez choisi « plus tard », c'est à vous de revenir.
            <strong> Corpus → État</strong> le rappelle et nomme les fiches concernées.
          </p>
        </div>

        <h3 className="mt-8 text-sm font-bold text-brand-main dark:text-white">L'inbox est une salle d'attente, pas un chemin</h3>
        <Prose>
          <p>
            Le mot « intégrer » laisse croire que le bouton range la capture dans le corpus. Il ne
            range rien : il se coche <em>après</em> la modification, et sert à garder le fil entre
            les mots d'origine et le fichier qui les porte. Si vous savez quelle ligne changer et
            que vous êtes devant l'écran, l'inbox n'apporte rien — allez droit à la fiche.
          </p>
          <p>
            Ce qu'elle sert vraiment : ne pas perdre une décision prise au milieu d'autre chose, ou
            dont les ricochets demandent du temps.
          </p>
        </Prose>

        <h3 className="mt-8 text-sm font-bold text-brand-main dark:text-white">Intégrer, ce n'est pas écrire : c'est réviser l'impact</h3>
        <Prose>
          <p>
            « À partir d'aujourd'hui ma cible principale devient X » ne touche pas un fichier. Ça
            touche l'audience dans le socle, la décision qui supersède la précédente, la fiche
            LinkedIn dont la cible n'est peut-être plus la bonne, et les campagnes Ads en cours.
          </p>
          <p>
            <strong>Si l'audience change et que la fiche LinkedIn ne bouge pas, la divergence n'a
            pas disparu : elle a déménagé à l'intérieur du corpus.</strong> Ce serait le pire
            résultat possible de tout ce chantier — le travail fait, et le même problème, mieux
            rangé. C'est précisément là qu'une IA qui lit <em>tout</em> le corpus sert à quelque
            chose : elle sort la liste de ce qui devient douteux, vous tranchez, elle écrit.
          </p>
        </Prose>

        <Figure
          titre="De l'écriture au service, et la boucle qui vérifie."
          legende={<>
            L'écart se mesure sur l'empreinte blob de git — <Mono>sha1("blob &lt;octets&gt;\0" + contenu)</Mono>{' '}
            — celle-là même que rend l'API GitHub dans un arbre : une seule requête, aucune ligne
            téléchargée. Avant le 01/09/2026, l'écran comparait la date du dernier commit à celle
            du dernier run Actions, un compteur aveugle à <Mono>npm run deploy</Mono> — qui est
            justement la voie normale.
          </>}
        >
          <svg viewBox="0 0 980 700" className="block w-full min-w-[680px] h-auto" role="img"
               aria-label="Deux points d'écriture, la console et le dépôt local, convergent vers la branche main. Trois déclencheurs lancent le même workflow, qui exécute deploy.sh : tests, embarquement du corpus, migrations, déploiement du Worker. Le Worker compare ensuite les empreintes de son bundle à l'arbre GitHub pour signaler tout écart.">
            <defs>
              <marker id="carte-fl3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
              </marker>
            </defs>

            <rect x="90" y="24" width="360" height="76" rx="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <text x="270" y="52" textAnchor="middle" fontSize="14" fontWeight="600" fill="currentColor">Cette console — Corpus → une fiche</text>
            <text x="270" y="76" textAnchor="middle" fontSize="10.5" fontFamily="monospace" fill="currentColor" opacity="0.68">PUT /api/corpus/source</text>

            <rect x="530" y="24" width="360" height="76" rx="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <text x="710" y="52" textAnchor="middle" fontSize="14" fontWeight="600" fill="currentColor">Dépôt — MacBook ou VM Ubuntu</text>
            <text x="710" y="76" textAnchor="middle" fontSize="10.5" fontFamily="monospace" fill="currentColor" opacity="0.68">git commit &amp;&amp; git push</text>

            <line x1="270" y1="100" x2="352" y2="148" stroke="currentColor" strokeWidth="1.4" markerEnd="url(#carte-fl3)" />
            <text x="266" y="128" textAnchor="middle" fontSize="10" fontFamily="monospace" fill="currentColor" opacity="0.8">commit par l'API GitHub</text>
            <line x1="710" y1="100" x2="628" y2="148" stroke="currentColor" strokeWidth="1.4" markerEnd="url(#carte-fl3)" />
            <text x="716" y="128" textAnchor="middle" fontSize="10" fontFamily="monospace" fill="currentColor" opacity="0.8">push</text>

            <rect x="290" y="150" width="400" height="58" rx="7" fill="currentColor" opacity="0.07" />
            <rect x="290" y="150" width="400" height="58" rx="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <text x="490" y="175" textAnchor="middle" fontSize="13" fontWeight="600" fontFamily="monospace" fill="currentColor">luminose-fr/gestion · main</text>
            <text x="490" y="196" textAnchor="middle" fontSize="11.5" fill="currentColor" opacity="0.72">la seule copie modifiable, versionnée</text>

            <text x="490" y="238" textAnchor="middle" fontSize="12" fill="currentColor" opacity="0.75">trois façons de lancer le même workflow</text>
            <line x1="420" y1="208" x2="215" y2="256" stroke="currentColor" strokeWidth="1.2" opacity="0.55" markerEnd="url(#carte-fl3)" />
            <line x1="490" y1="208" x2="490" y2="256" stroke="currentColor" strokeWidth="1.2" opacity="0.55" markerEnd="url(#carte-fl3)" />
            <line x1="560" y1="208" x2="765" y2="256" stroke="currentColor" strokeWidth="1.2" opacity="0.55" markerEnd="url(#carte-fl3)" />

            <rect x="90" y="260" width="250" height="48" rx="6" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.62" />
            <text x="215" y="290" textAnchor="middle" fontSize="12.5" fill="currentColor">Bouton Corpus → État</text>
            <rect x="365" y="260" width="250" height="48" rx="6" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.62" />
            <text x="490" y="290" textAnchor="middle" fontSize="11.5" fontFamily="monospace" fill="currentColor">npm run deploy · VM</text>
            <rect x="640" y="260" width="250" height="48" rx="6" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.62" />
            <text x="765" y="290" textAnchor="middle" fontSize="12.5" fill="currentColor">Actions → Run workflow</text>

            <line x1="215" y1="308" x2="420" y2="352" stroke="currentColor" strokeWidth="1.2" opacity="0.55" markerEnd="url(#carte-fl3)" />
            <line x1="490" y1="308" x2="490" y2="352" stroke="currentColor" strokeWidth="1.2" opacity="0.55" markerEnd="url(#carte-fl3)" />
            <line x1="765" y1="308" x2="560" y2="352" stroke="currentColor" strokeWidth="1.2" opacity="0.55" markerEnd="url(#carte-fl3)" />

            <rect x="250" y="356" width="480" height="94" rx="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <text x="490" y="382" textAnchor="middle" fontSize="13" fontWeight="600" fontFamily="monospace" fill="currentColor">scripts/deploy.sh</text>
            <text x="490" y="406" textAnchor="middle" fontSize="11.5" fill="currentColor" opacity="0.72">tests et typecheck bloquants → embarquer → migrations D1</text>
            <text x="490" y="424" textAnchor="middle" fontSize="11.5" fill="currentColor" opacity="0.72">→ wrangler deploy (Worker) → Pages (front)</text>
            <text x="490" y="442" textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.55">un seul script : le workflow l'appelle, il ne le réécrit pas</text>

            <line x1="490" y1="450" x2="490" y2="492" stroke="currentColor" strokeWidth="1.4" markerEnd="url(#carte-fl3)" />
            <text x="502" y="476" fontSize="10" fontFamily="monospace" fill="currentColor" opacity="0.8">corpus embarqué</text>

            <rect x="250" y="496" width="480" height="84" rx="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <text x="490" y="522" textAnchor="middle" fontSize="14" fontWeight="600" fill="currentColor">Worker Cloudflare</text>
            <text x="490" y="545" textAnchor="middle" fontSize="10.5" fontFamily="monospace" fill="currentColor" opacity="0.68">src/genere/corpus.ts — gitignoré</text>
            <text x="490" y="565" textAnchor="middle" fontSize="11.5" fill="currentColor" opacity="0.72">une constante : l'application ne peut pas écrire ce qu'elle sert</text>

            <line x1="490" y1="580" x2="490" y2="622" stroke="currentColor" strokeWidth="1.4" markerEnd="url(#carte-fl3)" />
            <text x="502" y="606" fontSize="10" fontFamily="monospace" fill="currentColor" opacity="0.8">un appel à l'arbre GitHub</text>

            <rect x="150" y="626" width="680" height="60" rx="7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="6 4" />
            <text x="490" y="652" textAnchor="middle" fontSize="13" fontWeight="600" fill="currentColor">Écart — les empreintes du bundle contre celles du dépôt</text>
            <text x="490" y="674" textAnchor="middle" fontSize="11.5" fill="currentColor" opacity="0.72">l'écran nomme les fiches qui diffèrent, au lieu de rendre un booléen approximatif</text>
          </svg>
        </Figure>
      </Section>

      {/* ══════ LES PRINCIPES ══════ */}
      <Section titre="Les principes" chapeau="Les règles de départ. Les garde-fous ci-dessous ne font que les rendre vérifiables par une machine.">
        <Points items={[
          { titre: "Rien ne s'édite dans une IA.", texte: "Une correction écrite dans une conversation ChatGPT est perdue. La conversation propose, on porte dans le corpus, on redéploie. Sens unique." },
          { titre: "L'état dans le fichier, le pourquoi dans une décision datée.", texte: "Git donne la chronologie, mais aucun modèle ne lit git log. La fiche porte son statut et se réécrit librement ; la décision porte le motif et n'est jamais réécrite — elle est supersédée par une plus récente qui la cite." },
          { titre: "Une capture ne change rien tant qu'elle n'est pas intégrée.", texte: "On peut donc déposer une idée dont on n'est pas sûr, et une note bâclée ne peut pas casser un prompt de production." },
          { titre: "Le corpus sait dire « pas de règle, et c'est voulu ».", texte: "Une absence déclarée et datée vaut mieux qu'un trou, qu'un modèle comblera toujours." },
          { titre: "Ce qui n'a besoin de rien ne charge rien.", texte: "Transcription, sous-titrage, automatisation : zéro contexte Luminose. Une absence de besoin est une information, pas un oubli." },
          { titre: "Une fonctionnalité en plus ne peut pas emporter celles d'avant.", texte: "Sans jeton GitHub, le corpus se lit comme avant et seuls les boutons d'écriture se taisent. Une mesure qui échoue ne fait échouer aucun appel. Des tests le vérifient, route par route." },
        ]} />
      </Section>

      {/* ══════ LES GARDE-FOUS ══════ */}
      <Section titre="Les garde-fous" chapeau="Ce qui empêche les copies de diverger sans que personne ne s'en aperçoive.">
        <Points items={[
          { titre: '19 fixtures golden.', texte: "Toute modification d'un prompt fait échouer la suite tant que la fixture n'est pas régénérée. La revue du diff de fixture EST la revue du changement." },
          { titre: 'Concordance avec FLUX-EDITORIAL.md.', texte: "Le document reproduit les personas et les règles de voix mot pour mot ; un test compare. Une divergence silencieuse est pire que pas de document du tout — on y croit." },
          { titre: 'Aucune feuille ne sert les règles de voix.', texte: "Les personas les portent déjà. Un test NORMATIF refuse qu'une feuille nomme voix/regles-de-voix, sans quoi ~3 900 caractères partiraient deux fois par rédaction." },
          { titre: 'La règle de lecture ouvre le bloc stratégie.', texte: "La composition ordonne par chemin ; un test vérifie que a-lire-d-abord précède la première décision. Un renommage « plus descriptif » la ferait glisser en silence." },
          { titre: 'Le tableau des offres est dérivé du frontmatter.', texte: "Jamais recopié, donc jamais oublié — et présent dans les trois profils, parce que proposer une offre arrêtée est l'erreur la plus coûteuse qu'une IA puisse commettre ici." },
          { titre: "Ce qu'on refuse de commiter.", texte: "Le parseur de frontmatter est tolérant par conception : un statut mal tapé ne fait échouer aucun test, la fiche part simplement dans les prompts amputée de son statut — et « actiff » rendrait Le Seuil proposable. Le Worker vérifie donc avant l'entrée dans l'histoire du dépôt : frontmatter présent, corps non vide, titre, statut connu." },
          { titre: 'Les README sont ignorés par le chargeur.', texte: "Et un test le vérifie. Corollaire : une règle écrite dans un README ne protège personne." },
          { titre: 'Le jeton GitHub est facultatif.', texte: "Absent, tout ce qui lit le corpus fonctionne à l'identique ; seuls les boutons d'écriture se taisent. Une fonctionnalité en plus ne doit jamais pouvoir emporter celles d'avant." },
        ]} />
      </Section>

      {/* ══════ CE QU'ON NE FAIT PAS ══════ */}
      <Section titre="Ce qu'on ne fait pas, et pourquoi" chapeau="Des portes fermées volontairement. Les rouvrir demande de reprendre l'argument, pas de l'ignorer.">
        <Refus items={[
          { titre: 'Pas de RAG ni de base vectorielle.', texte: "Le corpus entier tient dans une fenêtre de contexte. Ça résoudrait un problème qui n'existe pas — et une base mal rangée avec des embeddings reste mal rangée, mais répond avec assurance." },
          { titre: 'Pas de synchronisation automatique des GPT et des Gems.', texte: "Ce n'est pas possible côté plateforme. On recolle un pack daté, et le hash dit s'il est périmé." },
          { titre: "Pas de « consulte systématiquement cette URL » dans les consignes ChatGPT ou Gemini.", texte: "La navigation est un appel d'outil que le modèle décide de faire ou non. On remplacerait quatre vérités par une vérité intermittente." },
          { titre: 'Pas de serveur MCP en premier.', texte: "Il ne couvre ni Gemini grand public, ni OpenRouter, ni 1min.ai — la moitié du parc ne verrait rien. Il servira à écrire depuis une conversation, pas à lire un socle stable : un bloc de contexte fait ça mieux." },
          { titre: "Pas d'arborescence à huit dossiers.", texte: "Six blocs, chacun justifié par un cas d'usage qui le charge et un cas d'usage qui doit l'ignorer." },
          { titre: 'Pas de corpus dans packages/editorial.', texte: "Rythmes différents : ajouter un témoignage y deviendrait une revue de fixture golden. Le sens de la dépendance est l'inverse — c'est le corpus qui engendre voice.ts." },
          { titre: "Pas d'édition du corpus depuis l'application — RENVERSÉ le 30/08/2026.", renverse: true,
            texte: "La règle disait « deux copies modifiables, c'est la maladie réinstallée dans le remède ». Elle a été relue : ce qui compte est « une seule copie modifiable », pas « l'application ne parle jamais à Git ». L'application écrit dans Git — copie unique, versionnée — et toujours pas dans le bundle qu'elle sert. La lecture stricte coûtait un aller-retour par correction." },
        ]} />
      </Section>

      {/* ══════ CE QUI RESTE OUVERT ══════ */}
      <Section titre="Ce qui reste ouvert" chapeau="Des manques connus. Les nommer vaut mieux que les découvrir dans un contenu publié.">
        <Points items={[
          { titre: "YouTube n'a pas de fiche de canal.", texte: "Des scripts vidéo courts et longs se produisent ici, et rien ne dit à quoi ils doivent obéir : le modèle invente ses contraintes, en silence. C'est un manque, pas une absence délibérée — à ne pas confondre avec les illustrations réseaux sociaux, où l'absence est écrite et assumée." },
          { titre: "Pas d'exemples validés, ni de contre-exemples.", texte: "Les règles de voix décrivent ; un post réussi et un post raté montreraient. C'est la matière la plus efficace pour un modèle, et la seule que Florent est seul à pouvoir choisir." },
          { titre: 'Les modules du répertoire attendent.', texte: "Report délibéré : la matière des 9 ateliers animés se dépouillera quand la forme du futur format de groupe sera décidée, pas avant. Trier contre un format connu vaut dix fois mieux qu'indexer dans l'abstrait." },
          { titre: 'Les budgets de raisonnement par format ne sont pas réglés.', texte: "Réglages → Mesures enregistre durée, jetons et coût à chaque appel ; quelques semaines de production diront où plafonner." },
          { titre: 'La feuille du Rédacteur double son prompt.', texte: "Le poste discutable est canaux : il reçoit toutes les fiches de canal alors qu'il écrit pour un seul, et le format cible est connu à l'appel. Le jour où ça pèse, c'est là qu'il faut couper — et nulle part ailleurs." },
          { titre: "Le hash du corpus n'est pas figé dans les générations.", texte: "model_label l'est déjà, pour survivre à la suppression d'un modèle. Faire pareil avec le hash du corpus rendrait « pourquoi ce contenu dit-il ça ? » répondable des mois plus tard. Proposé le 26/08, jamais fait." },
          { titre: 'Les URLs en texte brut du corpus.', texte: "Le plus petit dénominateur commun, servi depuis le même bundle et découpé par exposition : public pour les offres et le positionnement, privé pour la stratégie et les objections. En complément d'un pack collé, jamais à sa place." },
          { titre: "Le serveur MCP, pour l'écriture.", texte: "Créer une idée ou rattacher une déclinaison depuis une conversation. Volontairement le dernier de la liste ; le point dur n'est pas le protocole, c'est OAuth." },
        ]} />
      </Section>

    </div>
  );
};

export default CarteView;
