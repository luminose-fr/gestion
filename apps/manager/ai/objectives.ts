/**
 * Registre des objectifs de publication.
 *
 * Chaque contenu a exactement UN objectif — c'est lui qui dicte le CTA et la
 * fin du texte. L'Analyste choisit l'objectif le plus adapté à l'idée ; le
 * Rédacteur reçoit les règles CTA correspondantes au moment de la rédaction.
 *
 * Logique d'entonnoir (marketing honnête, sans forcing) :
 * - Découverte : être vu et identifié par des inconnus
 * - Considération : construire la confiance, lever les peurs et objections
 * - Décision : inviter clairement à passer à l'action
 */

import { Objectif, isObjectif } from '../types';
import { SITE_URL } from '../constants';

export interface ObjectifDefinition {
    key: Objectif;
    etape: 'Découverte' | 'Considération' | 'Décision';
    /** Guidance pour l'Analyste : quand choisir cet objectif */
    quand: string;
    /** Règles CTA injectées dans le prompt du Rédacteur */
    ctaRules: string;
}

export const OBJECTIF_REGISTRY: Record<Objectif, ObjectifDefinition> = {

    [Objectif.NOTORIETE]: {
        key: Objectif.NOTORIETE,
        etape: 'Découverte',
        quand: "L'idée parle de Florent lui-même : son parcours, sa vision du métier, une opinion assumée, sa façon d'être thérapeute. Le lecteur doit retenir QUI il est.",
        ctaRules: `Pas de vente. Le CTA installe l'identité et invite à rester : une phrase qui dit qui est Florent (psychopraticien, hypnose et respiration holotropique, Villefranche-de-Lauragais) + une invitation à suivre le compte ou à découvrir ${SITE_URL}. Direction : "Je suis Florent Jaouali, psychopraticien. J'écris chaque semaine sur ce qui se joue en cabinet."`,
    },

    [Objectif.RECADRAGE]: {
        key: Objectif.RECADRAGE,
        etape: 'Découverte',
        quand: "L'idée déloge une croyance qui maintient le lecteur dans son schéma (« il faut comprendre avant d'agir », « être fort c'est tenir », « le temps guérit »). Contenu signature de Florent : la faille qui remet en mouvement — et qui montre indirectement comment il travaille.",
        ctaRules: `Le CTA ne vend pas : il laisse le lecteur face à la croyance remuée. Une question courte qui prolonge le malaise fécond, PUIS une porte discrète mais identifiée : une phrase qui dit que Florent travaille exactement là-dessus en cabinet, avec le lien ${SITE_URL}. Le lecteur repart avec la question ET sait où frapper le jour où elle devient trop lourde.`,
    },

    [Objectif.CONFIANCE]: {
        key: Objectif.CONFIANCE,
        etape: 'Considération',
        quand: "L'idée montre concrètement comment Florent travaille : une scène de cabinet anonymisée, ce qui se passe (et ne se passe pas) en séance, son cadre, ses limites, ce qu'il ne promet pas. Pour le lecteur qui hésite déjà.",
        ctaRules: `Le CTA rassure et ouvre la porte suivante : renvoyer vers ${SITE_URL} pour découvrir comment se passe une première séance, ou inviter à poser sa question en message privé — en nommant explicitement ce qu'on peut lui demander. Ton : la porte est ouverte, personne ne tire le lecteur à l'intérieur.`,
    },

    [Objectif.EDUCATION]: {
        key: Objectif.EDUCATION,
        etape: 'Considération',
        quand: "L'idée présente ou démystifie une pratique : hypnose, respiration holotropique, méditation. Lever les peurs et idées reçues (« vais-je perdre le contrôle ? », « c'est du spectacle ? »). Le lecteur apprend quelque chose d'utile même s'il ne vient jamais.",
        ctaRules: `Le CTA prolonge l'apprentissage : renvoyer vers la page de la pratique concernée sur ${SITE_URL}, ou inviter à poser LA question qui reste, en commentaire ou en message privé. Nommer la pratique exactement. Pas de promesse de résultat — Florent ne vend pas un effet, il explique un travail.`,
    },

    [Objectif.TRAFIC]: {
        key: Objectif.TRAFIC,
        etape: 'Considération',
        quand: "Le post existe pour amener vers un contenu long : article du blog, vidéo YouTube, newsletter. Le post est une bande-annonce : UNE idée forte du contenu long, pas son résumé complet.",
        ctaRules: `Le CTA est le cœur du post : donner envie d'aller lire/regarder avec une promesse précise de ce qu'on y trouve (« L'article complet démonte les 5 idées reçues sur l'hypnose »), puis le lien en clair. Sur Instagram : « lien en bio » + adresse en clair. Ne pas tout donner dans le post — sinon plus aucune raison de cliquer.`,
    },

    [Objectif.CONVERSION]: {
        key: Objectif.CONVERSION,
        etape: 'Décision',
        quand: "L'idée invite explicitement à entamer un travail : prendre rendez-vous, demander un premier échange. Rare (environ 1 post sur 8-10) mais totalement assumé : pas de détour, pas de honte à proposer son travail.",
        ctaRules: `Le CTA est direct et concret : à qui il s'adresse (le lecteur qui s'est reconnu dans le post), le pas exact suivant (prendre rendez-vous, écrire pour un premier échange), où (cabinet à Villefranche-de-Lauragais / visio), et le lien ${SITE_URL}. Une seule action demandée. Pas de « si vous voulez, éventuellement » — la clarté est une forme de respect.`,
    },

    [Objectif.EVENEMENT]: {
        key: Objectif.EVENEMENT,
        etape: 'Décision',
        quand: "Le post promeut un stage, un atelier de groupe, un événement daté. L'information pratique est le squelette : date, lieu, places.",
        ctaRules: `Le CTA donne TOUTES les infos utiles à la décision : date, lieu, nombre de places, pour qui c'est (et pour qui ce n'est pas — le tri honnête crédibilise), comment s'inscrire, avec le lien exact. L'urgence vient des faits réels (places limitées, date), jamais d'une pression artificielle.`,
    },
};

/**
 * Section "objectifs" injectée dans le persona de l'Analyste :
 * la liste des 7 objectifs, quand les choisir, et le repère d'équilibre éditorial.
 */
export const buildObjectifsPromptSection = (): string => {
    const lines = Object.values(OBJECTIF_REGISTRY).map(def =>
        `• ${def.key} (${def.etape}) — ${def.quand}`
    );
    return `
LES 7 OBJECTIFS DE PUBLICATION (tu en choisis exactement UN par idée — c'est lui qui dictera le CTA) :
${lines.join('\n')}

ÉQUILIBRE ÉDITORIAL (repère, pas dogme) : sur 10 publications, viser environ 2 Notoriété, 3 Recadrage de croyance, 2 Confiance / Preuve, 2 Éducation pratique ou Trafic contenu long, 1 Conversion séance ou Promotion événement. Tu choisis l'objectif qui sert le mieux L'IDÉE reçue — pas celui qui manque au quota.
    `.trim();
};

/**
 * Règles CTA injectées dans le prompt du Rédacteur pour l'objectif donné.
 */
export const getObjectifCtaRules = (objectif: string | null | undefined): string => {
    const def = isObjectif(objectif) ? OBJECTIF_REGISTRY[objectif] : undefined;
    if (!def) {
        return `OBJECTIF DU CONTENU : non défini.\nRÈGLES CTA : un seul appel à l'action, sobre et concret — le lecteur sait qui est l'auteur et quel est le pas suivant.`;
    }
    return `
OBJECTIF DU CONTENU : ${def.key} (étape ${def.etape}).
RÈGLES CTA POUR CET OBJECTIF (le CTA final les suit à la lettre) :
${def.ctaRules}
RÈGLE TRANSVERSE : un CTA dit toujours au lecteur à qui il s'adresse et quel est le pas concret suivant. Une seule action demandée par contenu.
    `.trim();
};
