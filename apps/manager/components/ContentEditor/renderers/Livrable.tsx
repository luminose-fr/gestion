import React, { useState } from 'react';
import { Check, Copy, Download, TriangleAlert } from 'lucide-react';
import type { LivrableArticle } from '@luminose/editorial';
import { Bouton, Carte, Etiquette } from '../../ui';
import { copyTextToClipboard } from './shared';

/**
 * Ce qu'un contenu livre pour être publié hors de l'application : le fichier
 * du site, les prompts de ses illustrations, les posts qui l'annoncent.
 *
 * Tout ici se copie ou se télécharge — c'est la dernière étape avant de quitter
 * l'application, et la seule question qu'on s'y pose est « qu'est-ce que je
 * colle, et où ».
 */

const BoutonCopier: React.FC<{ texte: string; titre?: string }> = ({ texte, titre }) => {
    const [copie, setCopie] = useState(false);
    const copier = async () => {
        if (!(await copyTextToClipboard(texte))) return;
        setCopie(true);
        window.setTimeout(() => setCopie(false), 2000);
    };
    return (
        <Bouton taille="petit" intention={copie ? 'principale' : 'secondaire'} ton={copie ? 'succes' : 'neutre'}
            onClick={copier} disabled={!texte} title={titre}>
            {copie ? <Check /> : <Copy />}
            {copie ? 'Copié' : 'Copier'}
        </Bouton>
    );
};

/** Le navigateur enregistre le fichier sous son nom exact : il n'y a plus qu'à le glisser dans `_posts/`. */
const telecharger = (nom: string, contenu: string) => {
    const url = URL.createObjectURL(new Blob([contenu], { type: 'text/html;charset=utf-8' }));
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = nom;
    lien.click();
    URL.revokeObjectURL(url);
};

export const Livrable: React.FC<{ livrable: LivrableArticle }> = ({ livrable }) => {
    const { fichier, url, illustrations, posts, avertissements } = livrable;

    return (
        <div className="p-6 space-y-4 border-t border-brand-border dark:border-dark-sec-border">
            <Etiquette as="h3" forme="entete">Publication</Etiquette>

            <Carte densite="contenu" rythme>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <Etiquette forme="entete">Fichier du site</Etiquette>
                    <div className="flex items-center gap-2">
                        <BoutonCopier texte={fichier.contenu} titre="Copier le code HTML du fichier" />
                        <Bouton taille="petit" onClick={() => telecharger(fichier.nom, fichier.contenu)}>
                            <Download /> Télécharger
                        </Bouton>
                    </div>
                </div>
                <p className="text-sm font-mono text-brand-main dark:text-dark-text break-all select-text">
                    _posts/{fichier.nom}
                </p>
                <p className="text-xs text-brand-main/60 dark:text-dark-text/60 break-all select-text">
                    En ligne à {url}
                </p>
                {avertissements.length > 0 && (
                    <ul className="rounded-lg border border-alerte/30 bg-alerte/10 p-3 space-y-1">
                        {avertissements.map((a, i) => (
                            <li key={i} className="flex gap-2 text-xs text-alerte">
                                <TriangleAlert className="size-3.5 shrink-0 mt-px" /> {a}
                            </li>
                        ))}
                    </ul>
                )}
                <details className="group">
                    <summary className="text-xs font-semibold text-brand-main/70 dark:text-dark-text/70 cursor-pointer select-none">
                        Voir le code
                    </summary>
                    <pre className="mt-2 max-h-96 overflow-auto custom-scrollbar rounded-lg border border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg p-3 text-xs font-mono text-brand-main dark:text-dark-text whitespace-pre select-text">
                        {fichier.contenu}
                    </pre>
                </details>
            </Carte>

            {illustrations.length > 0 && (
                <Carte densite="contenu" rythme>
                    <Etiquette forme="entete">Illustrations</Etiquette>
                    {illustrations.map((illustration, i) => (
                        <div key={i} className="rounded-lg border border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg p-4 space-y-2">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <Etiquette>
                                    {illustration.apresSection === null
                                        ? 'Image principale — aussi celle du post'
                                        : `Après la section ${illustration.apresSection}`}
                                </Etiquette>
                                <BoutonCopier texte={illustration.prompt} titre="Copier le prompt" />
                            </div>
                            <p className="text-sm leading-relaxed text-brand-main dark:text-dark-text whitespace-pre-wrap select-text">
                                {illustration.prompt}
                            </p>
                            {/* Le site lit le .jpg et sa variante @2x : les deux noms, pour ne pas avoir à les deviner. */}
                            <p className="text-xs font-mono text-brand-main/60 dark:text-dark-text/60 break-all">
                                /images/blog/{illustration.fichier}.jpg · {illustration.fichier}@2x.jpg
                            </p>
                        </div>
                    ))}
                </Carte>
            )}

            {posts.length > 0 && (
                <Carte densite="contenu" rythme>
                    <Etiquette forme="entete">Post d’accompagnement</Etiquette>
                    <div className="grid gap-3 xl:grid-cols-2">
                        {posts.map(post => (
                            <div key={post.plateforme} className="rounded-lg border border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg p-4 space-y-2">
                                <div className="flex items-center justify-between gap-3">
                                    <Etiquette>{post.plateforme}</Etiquette>
                                    <BoutonCopier texte={post.texte} titre={`Copier le post ${post.plateforme}`} />
                                </div>
                                <p className="text-sm leading-relaxed text-brand-main dark:text-dark-text whitespace-pre-wrap break-words select-text">
                                    {post.texte}
                                </p>
                            </div>
                        ))}
                    </div>
                </Carte>
            )}
        </div>
    );
};
