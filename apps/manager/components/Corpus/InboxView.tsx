/**
 * L'inbox — capturer sans ranger.
 *
 * Le rangement n'est pas le geste de la capture. Au moment où une décision se
 * prend, on pense à autre chose ; demander « quel bloc, quel statut, ça
 * supersède quoi ? » à cet instant est exactement la friction qui tue le
 * mécanisme. Trois champs, et l'écran le dit.
 *
 * **Une capture ne change rien** tant qu'elle n'est pas intégrée : elle
 * n'entre dans aucun profil de contexte, aucun prompt. C'est ce qui permet d'y
 * déposer une idée dont on n'est pas sûr.
 */
import React, { useEffect, useState } from 'react';
import { Check, Inbox as InboxIcon, Trash2 } from 'lucide-react';
import {
  fetchInbox, capturer, integrerCapture, supprimerCapture, type CaptureInbox,
} from '../../services/apiService';

const jour = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });

const InboxView: React.FC = () => {
  const [captures, setCaptures] = useState<CaptureInbox[] | null>(null);
  const [decide, setDecide] = useState('');
  const [remplace, setRemplace] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [integration, setIntegration] = useState<Record<string, string>>({});

  const recharger = () =>
    fetchInbox()
      .then((r) => { setCaptures(r.captures); setErreur(null); })
      .catch((e) => setErreur(e?.message ?? 'Inbox injoignable.'));

  useEffect(() => { void recharger(); }, []);

  const envoyer = async () => {
    if (!decide.trim()) return;
    setEnvoi(true);
    try {
      // `remplace` vide part à null : « je ne sais pas » n'est pas « rien ».
      await capturer(decide.trim(), remplace.trim() || null, 'Console');
      setDecide(''); setRemplace('');
      await recharger();
    } catch (e: any) {
      setErreur(e?.message ?? 'La capture a échoué.');
    } finally {
      setEnvoi(false);
    }
  };

  const marquer = async (id: string) => {
    const dest = integration[id]?.trim();
    if (!dest) return;
    try {
      await integrerCapture(id, dest);
      setIntegration((m) => ({ ...m, [id]: '' }));
      await recharger();
    } catch (e: any) {
      setErreur(e?.message ?? "L'intégration a échoué.");
    }
  };

  const jeter = async (id: string) => {
    try { await supprimerCapture(id); await recharger(); }
    catch (e: any) { setErreur(e?.message ?? 'Suppression impossible.'); }
  };

  if (!captures && !erreur) return <p className="text-sm text-brand-main/60 dark:text-dark-text/60">Lecture de l'inbox…</p>;

  const attente = (captures ?? []).filter((c) => c.integratedAt === null);
  const integrees = (captures ?? []).filter((c) => c.integratedAt !== null);

  return (
    <div className="space-y-5 max-w-3xl">
      {erreur && <p className="text-sm text-red-600 dark:text-red-400">Échec — {erreur}</p>}

      <section className="bg-white dark:bg-dark-surface rounded-xl border border-brand-light dark:border-dark-sec-bg p-4 md:p-5">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-brand-main/60 dark:text-dark-text/50 mb-1">
          Capturer
        </h2>
        <p className="text-xs text-brand-main/55 dark:text-dark-text/50 mb-3">
          Trois champs, quelques secondes. Rien n'entre dans le corpus tant que ce n'est pas intégré.
        </p>
        <label className="block text-xs font-semibold text-brand-main dark:text-dark-text mb-1">
          Ce qui a été décidé, dans mes mots
        </label>
        <textarea
          value={decide}
          onChange={(e) => setDecide(e.target.value)}
          rows={3}
          className="w-full text-sm p-2.5 rounded-lg border border-brand-light dark:border-dark-sec-bg bg-transparent text-brand-main dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-brand-main/30"
        />
        <label className="block text-xs font-semibold text-brand-main dark:text-dark-text mt-3 mb-1">
          Ce que ça rend faux
        </label>
        <input
          value={remplace}
          onChange={(e) => setRemplace(e.target.value)}
          placeholder="Laisser vide si je ne sais pas — c'est une réponse acceptable"
          className="w-full text-sm p-2.5 rounded-lg border border-brand-light dark:border-dark-sec-bg bg-transparent text-brand-main dark:text-dark-text placeholder:text-brand-main/35 dark:placeholder:text-dark-text/30 focus:outline-none focus:ring-2 focus:ring-brand-main/30"
        />
        <p className="text-[11px] text-brand-main/45 dark:text-dark-text/40 mt-1.5">
          Vide veut dire « je ne sais pas », jamais « rien ». Ce champ coûte cinq secondes
          maintenant et une heure d'archéologie plus tard s'il manque.
        </p>
        <button
          onClick={() => void envoyer()}
          disabled={!decide.trim() || envoi}
          className="mt-3 px-3 py-1.5 rounded-lg text-sm font-semibold bg-brand-main text-white hover:opacity-90 disabled:opacity-40 dark:bg-white dark:text-brand-main"
        >
          {envoi ? 'Capture…' : 'Capturer'}
        </button>
      </section>

      <section>
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-brand-main/60 dark:text-dark-text/50 mb-2">
          En attente — {attente.length}
        </h2>
        {/*
          « Intégrer » est le mot qui prête à confusion : il a l'air d'un
          bouton qui range la capture dans le corpus, alors que c'est une case
          qu'on coche APRÈS être allé éditer le markdown. Sans cette ligne, on
          croit que le bouton fait le travail, et le corpus ne change jamais.
        */}
        {attente.length > 0 && (
          <p className="text-xs text-brand-main/55 dark:text-dark-text/50 mb-2 leading-relaxed">
            Intégrer, c'est aller corriger le markdown dans le dépôt, commiter, déployer —
            puis revenir cocher ici en disant où c'est parti. Le bouton ne range rien tout
            seul : il ferme la boucle entre tes mots d'origine et le fichier qui les porte.
          </p>
        )}
        {attente.length === 0 ? (
          <p className="inline-flex items-center gap-2 text-sm text-brand-main/50 dark:text-dark-text/45">
            <InboxIcon className="w-4 h-4" /> Rien en attente.
          </p>
        ) : (
          <ul className="space-y-2">
            {attente.map((c) => (
              <li key={c.id} className="bg-white dark:bg-dark-surface rounded-xl border border-brand-light dark:border-dark-sec-bg p-3.5">
                <p className="text-sm text-brand-main dark:text-dark-text">{c.decide}</p>
                <p className="text-xs mt-1.5 text-brand-main/55 dark:text-dark-text/50">
                  <span className="font-semibold">Remplace :</span>{' '}
                  {c.remplace ?? <em className="opacity-70">je ne sais pas</em>}
                </p>
                <p className="text-[11px] font-mono text-brand-main/40 dark:text-dark-text/35 mt-1">
                  {jour(c.createdAt)}{c.source ? ` · ${c.source}` : ''}
                </p>
                <div className="flex flex-wrap gap-2 mt-2.5">
                  <input
                    value={integration[c.id] ?? ''}
                    onChange={(e) => setIntegration((m) => ({ ...m, [c.id]: e.target.value }))}
                    placeholder="Où est-ce parti ? chemins, commit"
                    className="flex-1 min-w-[14rem] text-xs p-2 rounded-lg border border-brand-light dark:border-dark-sec-bg bg-transparent text-brand-main dark:text-dark-text placeholder:text-brand-main/35 dark:placeholder:text-dark-text/30"
                  />
                  <button
                    onClick={() => void marquer(c.id)}
                    disabled={!integration[c.id]?.trim()}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-brand-main text-white hover:opacity-90 disabled:opacity-40 dark:bg-white dark:text-brand-main"
                  >
                    <Check className="w-3.5 h-3.5" /> Intégrée
                  </button>
                  <button
                    onClick={() => void jeter(c.id)}
                    title="Capture saisie deux fois ou à côté de la plaque"
                    className="px-2 py-1 rounded-lg text-brand-main/40 hover:text-red-600 dark:text-dark-text/35 dark:hover:text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {integrees.length > 0 && (
        <section>
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-brand-main/60 dark:text-dark-text/50 mb-2">
            Intégrées — {integrees.length}
          </h2>
          <p className="text-xs text-brand-main/50 dark:text-dark-text/45 mb-2">
            Jamais supprimées : chacune porte ce qui l'a absorbée. La chaîne se remonte — le
            fichier, le commit, la capture, les mots d'origine.
          </p>
          <ul className="space-y-1.5">
            {integrees.map((c) => (
              <li key={c.id} className="text-xs border-l-2 border-brand-light dark:border-dark-sec-bg pl-3 py-1">
                <p className="text-brand-main/75 dark:text-dark-text/70">{c.decide}</p>
                <p className="font-mono text-[10px] text-brand-main/40 dark:text-dark-text/35 mt-0.5">
                  {jour(c.createdAt)} → {c.integration}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

export default InboxView;
