/**
 * Le Reel expliqué de référence des tests (v2.26), partagé : le contrôle, les
 * étapes et le rendu jugent le même script.
 */
import type { ReelExplique } from '../src/reelExplique';

/**
 * Un script qui tient (v2.26) : 115 mots, 46 s estimées, trois scènes courtes,
 * un écran à la fois, une illustration et son autre état, deux schémas.
 */
export const reelValide = (): ReelExplique => ({
    format: 'Reel expliqué',
    illustrations: [
        { id: 'alarme', description: "En haut, un détecteur de fumée au plafond d'un salon ; en bas, une seule bougie d'anniversaire allumée sur une table. Lumière chaude, aucun texte." },
        { id: 'reglee', depuis: 'alarme', description: 'La même pièce : en haut, le détecteur a son bouton tourné vers le minimum ; en bas, la bougie brûle en paix.' },
    ],
    sequences: [
        { plan: 'camera', role: 'Accroche', voix: "Vous relisez trois fois un message avant de l'envoyer ?", intention: 'Regard caméra, sourcil levé.' },
        { plan: 'camera', role: 'Ancrage', voix: "En séance, je l'entends presque chaque semaine. Et ce n'est pas de la politesse : c'est un système d'alarme qui s'est réglé trop fort." },
        {
            plan: 'scene', role: 'Mécanique', registre: 'pedagogie',
            voix: "Le perfectionnisme, c'est une alarme incendie. Enfant, une erreur coûtait cher.",
            elements: [
                { texte: null, ton: 'neutre', visuel: { illustration: 'alarme', cadrage: 'ensemble' }, apparait_sur: 'Le perfectionnisme' },
                { texte: 'Erreur = [danger]', ton: 'ombre', visuel: null, apparait_sur: 'une erreur coûtait cher' },
            ],
        },
        { plan: 'camera', role: 'Relance', voix: "Aujourd'hui, elle sonne pour une virgule." },
        {
            plan: 'scene', role: 'Prix', registre: 'pedagogie',
            voix: "Et chaque fois qu'elle sonne, vous payez : la tension monte, la fatigue reste.",
            elements: [
                { texte: 'Le [prix]', ton: 'ombre', visuel: { schema: 'niveau', de: 20, a: 90 }, apparait_sur: 'Et chaque fois' },
                { texte: null, ton: 'ombre', visuel: { schema: 'liste', items: ['Tension', 'Fatigue'] }, apparait_sur: 'la tension monte' },
            ],
        },
        {
            plan: 'scene', role: 'Bascule', registre: 'humour',
            voix: 'Un détecteur qui hurle pour une bougie, vous ne le jetez pas : vous le réglez.',
            elements: [
                { texte: null, ton: 'neutre', visuel: { illustration: 'alarme', cadrage: 'haut' }, apparait_sur: 'Un détecteur qui hurle' },
                { texte: 'On le [règle]', ton: 'lumiere', visuel: { illustration: 'reglee' }, apparait_sur: 'vous le réglez' },
            ],
        },
        { plan: 'camera', role: "Appel à l'action", voix: "C'est ce travail-là qu'on fait en séance : baisser le volume, sans couper le son. Si ça vous parle, tout est sur luminose.fr, lien en bio." },
    ],
    accroche_pub: { voix: "Relire trois fois un message avant de l'envoyer : on croit que c'est de la politesse." },
    legende: { texte: 'Trois relectures pour un message de deux lignes.', cta: 'Lien en bio → luminose.fr', hashtags: ['#perfectionnisme'] },
});
