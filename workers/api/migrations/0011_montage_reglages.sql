-- Les réglages d'une prise (SPEC §12.5.7) : la rotation de l'image et la
-- synchronisation du son.
--
-- Constaté le 26/10/2026 sur une prise de Florent, enregistrée dans QuickTime
-- sur le Mac : l'image vient d'une caméra montée à la verticale, livrée
-- couchée (3840 × 2160, sans indication de rotation), et le son d'un micro USB
-- — deux chaînes de capture, deux latences : les lèvres précèdent le son.
-- Ni l'un ni l'autre ne se lit dans le fichier ; Florent les règle en regardant.
--
-- `decalage_son` : en secondes, positif quand le son de la prise arrive APRÈS
-- les lèvres ; l'image est alors avancée d'autant. `rotation` : 0, 90, 180 ou
-- 270 degrés, dans le sens des aiguilles d'une montre.
--
-- Une prise neuve reprend les réglages de la plus récente : le même micro et
-- la même caméra donnent le même décalage d'une vidéo à l'autre.
ALTER TABLE montage_prises ADD COLUMN decalage_son REAL NOT NULL DEFAULT 0;
ALTER TABLE montage_prises ADD COLUMN rotation INTEGER NOT NULL DEFAULT 0;
