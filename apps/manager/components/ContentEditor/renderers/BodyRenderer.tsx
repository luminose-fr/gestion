import React from 'react';
import { Pencil } from 'lucide-react';
import { getFormatDef } from '@luminose/editorial';
import { TargetFormat } from '../../../types';
import { parseBodyJson, t, Block, BlockPre, CarrouselLegende } from './shared';
import { Livrable } from './Livrable';
import { TexteLeger, LigneLegere } from './TexteLeger';

interface BodyRendererProps {
    body: string;
    /** AAAA-MM-JJ. Date de publication prévue, qui préfixe le fichier du site ; aujourd'hui à défaut. */
    datePublication?: string | null;
}

/** La date du jour à l'heure de Florent — `toISOString` donnerait la veille après 22 h en été. */
const aujourdhui = (): string => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Rendu structuré du body JSON selon le format du contenu.
 * Affiche un layout spécifique pour chaque TargetFormat
 * (Post Texte, Article, Reel/Short, Youtube, Carrousel, Prompt Image).
 */
export const BodyRenderer: React.FC<BodyRendererProps> = ({ body, datePublication }) => {
    const data = parseBodyJson(body);

    if (!data || !data.format) {
        return (
            <div className="p-6 whitespace-pre-wrap text-sm leading-relaxed text-brand-main dark:text-dark-text">
                {data?.edited_raw || body}
            </div>
        );
    }

    if (data.edited_raw) {
        return (
            <div className="p-6 space-y-3">
                <div className="flex items-center gap-2 text-micro font-bold text-amber-600 dark:text-amber-400 uppercase">
                    <Pencil className="w-3 h-3" /> Contenu édité manuellement
                </div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-brand-main dark:text-dark-text">
                    {data.edited_raw}
                </div>
            </div>
        );
    }

    const fmt = data.format;
    const isPostTexte   = fmt === TargetFormat.POST_TEXTE_COURT || fmt === "Post Texte";
    const isArticle     = fmt === TargetFormat.ARTICLE_LONG_SEO || fmt === "Article";
    const isReelShort   = fmt === TargetFormat.SCRIPT_VIDEO_REEL_SHORT || fmt === "Script Reel";
    const isYoutube     = fmt === TargetFormat.SCRIPT_VIDEO_YOUTUBE || fmt === "Script Youtube";
    const isCarrousel   = fmt === TargetFormat.CARROUSEL_SLIDE || fmt === "Carrousel";
    const isPromptImage = fmt === TargetFormat.PROMPT_IMAGE || fmt === "Prompt Image";
    const isNewsletter  = fmt === TargetFormat.NEWSLETTER || fmt === "Newsletter";

    if (isPostTexte) return (
        <div className="p-6 space-y-4">
            {data.accroche && <Block label="Accroche" color="border-pink-400">{t(data.accroche)}</Block>}
            {data.corps && <Block label="Corps" color="border-brand-main dark:border-white">{t(data.corps)}</Block>}
            {data.cta   && <Block label="CTA"   color="border-green-400">{t(data.cta)}</Block>}
            {Array.isArray(data.hashtags) && data.hashtags.filter(Boolean).length > 0 && (
                <Block label="Hashtags" color="border-blue-400">
                    <div className="flex flex-wrap gap-1.5">
                        {data.hashtags.map(t).filter(Boolean).map((tag: string, i: number) => (
                            <span key={i} className="text-xs font-semibold text-blue-600 dark:text-blue-300 bg-blue-100/70 dark:bg-blue-900/30 rounded-md px-2 py-0.5">
                                {tag}
                            </span>
                        ))}
                    </div>
                </Block>
            )}
            {data.visuel && <Block label="Visuel suggéré" color="border-amber-400">{t(data.visuel)}</Block>}
            {data.prompt_dzine && <Block label="Prompt Dzine" color="border-violet-400">{t(data.prompt_dzine)}</Block>}
        </div>
    );

    if (isArticle) {
        // Le registre dit si le format se livre ; l'écran ne nomme pas l'article (règle n°3).
        const livrable = getFormatDef(fmt)?.livrable?.(data, { date: datePublication?.slice(0, 10) || aujourdhui() }) ?? null;
        const resume: string[] = Array.isArray(data.resume) ? data.resume.map(t).filter(Boolean) : [t(data.resume)].filter(Boolean);
        const references: string[] = Array.isArray(data.references) ? data.references.map(t).filter(Boolean) : [];
        const cta = data.cta && typeof data.cta === 'object' ? data.cta : null;
        const sections: any[] = Array.isArray(data.sections) ? data.sections.filter(Boolean) : [];
        const illustrationsApres = (n: number) => (livrable?.illustrations ?? []).filter(i => i.apresSection === n);
        return (
            <div>
                {/* Le corps se lit comme l'article publié : même convertisseur que le fichier du site. */}
                <div className="p-6 space-y-4 text-sm leading-relaxed text-brand-main dark:text-dark-text">
                    {data.titre_h1    && <h2 className="text-lg font-bold text-brand-main dark:text-white">{t(data.titre_h1)}</h2>}
                    {t(data.meta_description) && <Block label="Meta description" color="border-brand-border">{t(data.meta_description)}</Block>}
                    {resume.length > 0 && (
                        <Block label="En résumé" color="border-purple-400">
                            {resume.map((p, i) => <p key={i} className={i > 0 ? 'mt-2' : ''}><LigneLegere source={p} /></p>)}
                        </Block>
                    )}
                    {t(data.introduction) && <TexteLeger source={t(data.introduction)} />}
                    {sections.map((s: any, i: number) => (
                        <div key={i} className="space-y-3">
                            {t(s.sous_titre_h2) && <h3 className="text-sm font-bold text-brand-main dark:text-white pt-2">{t(s.sous_titre_h2)}</h3>}
                            {t(s.contenu) && <TexteLeger source={t(s.contenu)} />}
                            {/* La conclusion ferme la dernière section, comme dans le fichier du site. */}
                            {i === sections.length - 1 && t(data.conclusion) && <TexteLeger source={t(data.conclusion)} />}
                            {illustrationsApres(i + 1).map((ill, j) => (
                                <div key={j} className="rounded-lg border border-dashed border-brand-border dark:border-dark-sec-border px-4 py-3 text-xs text-brand-main/60 dark:text-dark-text/60">
                                    Illustration — {ill.alt || ill.fichier}
                                </div>
                            ))}
                        </div>
                    ))}
                    {cta ? (
                        <Block label="Encadré final" color="border-green-400">
                            {t(cta.titre) && <p className="font-bold">{t(cta.titre)}</p>}
                            {t(cta.texte) && <TexteLeger source={t(cta.texte)} className="mt-2" />}
                            {t(cta.chute) && <p className="mt-3 font-bold"><LigneLegere source={t(cta.chute)} /></p>}
                        </Block>
                    ) : data.cta && <Block label="CTA" color="border-green-400">{t(data.cta)}</Block>}
                    {references.length > 0 && (
                        <Block label="Références — à vérifier avant publication" color="border-brand-border">
                            <ul className="list-disc pl-4 space-y-1">
                                {references.map((r, i) => <li key={i}><LigneLegere source={r} /></li>)}
                            </ul>
                        </Block>
                    )}
                </div>
                {livrable && <Livrable livrable={livrable} />}
            </div>
        );
    }

    if (isReelShort) return (
        <div className="p-6 space-y-4">
            {data.contrainte && <p className="text-micro font-bold text-brand-main/40 dark:text-dark-text/40 uppercase">{t(data.contrainte)}</p>}
            {(data.sections || []).map((s: any, i: number) => (
                <BlockPre key={i} label={`${t(s.timing)} ${t(s.role)}`} color={
                    i === 0 ? "border-pink-400" :
                    i === (data.sections?.length ?? 0) - 1 ? "border-green-400" :
                    "border-brand-main dark:border-white"
                }>
                    {t(s.texte)}
                    {s.intention && <p className="mt-2 text-xs italic opacity-60">{t(s.intention)}</p>}
                </BlockPre>
            ))}
        </div>
    );

    if (isYoutube) return (
        <div className="p-6 space-y-4">
            {data.intro && <Block label="Intro" color="border-pink-400">{t(data.intro)}</Block>}
            {(data.developpement || []).map((s: any, i: number) => (
                <div key={i} className="space-y-2">
                    {s.point  && <h3 className="text-sm font-bold text-brand-main dark:text-white">{t(s.point)}</h3>}
                    {s.contenu && <p className="text-sm leading-relaxed text-brand-main dark:text-dark-text">{t(s.contenu)}</p>}
                </div>
            ))}
            {data.conclusion && <Block label="Conclusion" color="border-purple-400">{t(data.conclusion)}</Block>}
        </div>
    );

    if (isCarrousel) return (
        <div className="p-6 space-y-3">
            {(data.slides || []).map((s: any, i: number) => {
                const isIllustree = s.type === 'ILLUSTRÉE' || s.type === 'IMAGE'; // IMAGE = rétrocompat ancienne trame
                const intention = s.intention_visuelle || s.visuel; // visuel = rétrocompat
                return (
                    <div key={i} className={`bg-brand-light dark:bg-dark-bg rounded-lg p-3 border ${isIllustree ? 'border-amber-300 dark:border-amber-700' : 'border-brand-border dark:border-dark-sec-border'}`}>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="w-5 h-5 rounded-full bg-pink-500 text-white text-micro font-bold flex items-center justify-center">{s.numero ?? i + 1}</span>
                            {s.titre && <span className="text-sm font-bold text-brand-main dark:text-white">{t(s.titre)}</span>}
                            {s.type && (
                                <span className={`px-1.5 py-0.5 rounded-full text-micro font-semibold ${isIllustree ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-brand-border/50 dark:bg-dark-sec-border/50 text-brand-main/70 dark:text-dark-text/70'}`}>
                                    {isIllustree ? 'Illustrée' : 'Typo'}
                                </span>
                            )}
                        </div>
                        {s.texte && <p className="text-sm text-brand-main dark:text-dark-text leading-relaxed">{t(s.texte)}</p>}
                        {intention && isIllustree && (
                            <p className="mt-2 text-xs italic text-amber-600 dark:text-amber-400 border-l-2 border-amber-300 dark:border-amber-700 pl-2">
                                Intention visuelle : {t(intention)}
                            </p>
                        )}
                    </div>
                );
            })}
            <CarrouselLegende legende={data.legende} />
        </div>
    );

    if (isPromptImage) return (
        <div className="p-6 space-y-4">
            {data.prompt  && <Block label="Prompt (EN)" color="border-amber-400">{t(data.prompt)}</Block>}
            {/* legende : objet {texte, cta, hashtags} (nouveau) ou string (ancienne trame) */}
            {typeof data.legende === 'string'
                ? data.legende && <Block label="Légende" color="border-blue-400">{t(data.legende)}</Block>
                : <CarrouselLegende legende={data.legende} />}
        </div>
    );

    if (isNewsletter) return (
        <div className="p-6 space-y-4">
            {data.objet && <Block label="Objet" color="border-blue-400">{t(data.objet)}</Block>}
            {data.accroche && <Block label="Accroche" color="border-pink-400">{t(data.accroche)}</Block>}
            {data.corps && <Block label="Corps" color="border-brand-main dark:border-white">{t(data.corps)}</Block>}
            {data.repositionnement && <Block label="Repositionnement" color="border-purple-400">{t(data.repositionnement)}</Block>}
            {data.baffe && <Block label="Baffe" color="border-pink-400">{t(data.baffe)}</Block>}
            {data.cta && <Block label="CTA" color="border-green-400">{t(data.cta)}</Block>}
        </div>
    );

    return <div className="p-6 text-sm text-brand-main dark:text-dark-text whitespace-pre-wrap">{body}</div>;
};
