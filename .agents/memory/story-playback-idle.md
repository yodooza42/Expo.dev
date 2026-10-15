---
name: Pauses dans les stories de trajet
description: Règle produit pour raccourcir les immobilités prolongées dans les stories d’un trajet.
---

Dans une story de trajet individuel, raccourcir les longues périodes où la distance GPS ne progresse presque pas afin que le marqueur ne reste pas immobile pendant une grande partie de la vidéo. Garder la durée, les heures et la distance réelles intactes dans les données du trajet et ses statistiques.

Les légendes de pause se saisissent au lancement de chaque story et ne sont pas enregistrées avec le trajet.

Permettre de ne pas afficher les pauses dans la story, sans rétablir les longues attentes : masquer les cartes de pause et leurs messages, mais conserver la compression du temps de lecture.

**Why:** L’utilisateur souhaite pouvoir choisir de ne pas afficher les pauses lors de la génération.

**Why:** Une immobilité réelle peut être correcte dans les mesures, mais sa durée proportionnelle rend l’animation de la story inutilement statique.

**How to apply:** Transformer uniquement l’axe temporel de lecture de la story. Ne pas modifier les points GPS, les horodatages du trajet, les kilomètres enregistrés ni les statistiques affichées. Garder les légendes éphémères à l’export de la story.
