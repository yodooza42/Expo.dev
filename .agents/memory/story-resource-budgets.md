---
name: Ressources et vérification des stories vidéo
description: Pourquoi limiter les images décodées sur une période entière et tester les horloges du moteur ensemble.
---

Les limites de mémoire doivent porter sur les pixels décodés de toute la story, pas seulement sur le nombre de téléchargements simultanés ou la taille des images compressées.

**Why:** Une période de plusieurs dizaines de trajets multiplie les fonds satellite conservés. Des délais réseau ne protègent pas contre la disparition du moteur Android sous pression mémoire, qui peut laisser l’interface attendre un message qui n’arrivera jamais.

**How to apply:** Lors d’une évolution du rendu, vérifier ensemble les images en vol, les fonds conservés, les photos décodées et les copies de la vidéo. Garder un contrôle d’inactivité côté natif indépendant du moteur vidéo.

Les tests de durée doivent faire avancer les minuteries et les images d’animation sur la même horloge simulée.

**Why:** Une animation accélérée séparément des minuteries peut masquer un délai de préparation qui interrompt ensuite une vidéo longue pourtant valide. Les pauses photo ajoutent aussi du temps réel à la durée choisie.

**How to apply:** Couvrir les longues durées et les pauses avec cette horloge commune. Les tests simulés et l’aperçu web ne constituent pas une mesure de mémoire ni une validation du moteur Android réel.