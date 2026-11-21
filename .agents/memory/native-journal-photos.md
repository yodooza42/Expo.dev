---
name: Photos du carnet natif
description: Résolution des références photo et cohérence des décomptes dans l’export Kotlin du carnet.
---

Les projets peuvent stocker des références `y2p:` stables qui ne sont pas des URI de fichier lisibles par Android. Avant l’export Kotlin, résoudre chaque photo par les candidats de la photothèque (URI de catalogue et copies de récupération) et garder ces URI alternatives jusqu’au décodage natif.

Le décompte de sélection inclut les photos des étapes et les photos Avant/Après supplémentaires, mais une comparaison qui réutilise une photo déjà dans la chronologie ne constitue pas une nouvelle photo sélectionnée. Garder cette règle identique côté TypeScript et Kotlin sans supprimer la scène comparatif du film.

**Why:** Le moteur natif contourne le flux de préparation WebView qui résout déjà les références et peut présenter une photo plusieurs fois dans le film sans augmenter la sélection unique.

**How to apply:** Pour tout nouveau moteur natif ou toute modification de comptage, tester une référence de catalogue, une URI récupérable et un Avant/Après partageant des photos avec la chronologie.
