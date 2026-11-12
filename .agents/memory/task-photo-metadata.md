---
name: Dates EXIF des photos sélectionnées
description: Extraction des dates EXIF depuis les URI précises de photos déjà liées à une tâche ou sélectionnées dans un projet.
---

Lire les dates uniquement depuis les URI des photos attachées à une tâche ou explicitement choisies dans l’album d’un projet, puis depuis leurs copies protégées connues. Ne pas parcourir toute la galerie ni chercher par nom.

Lire les segments JPEG APP1 ou l’élément Exif HEIF par plages ciblées, en sautant les données d’image. Ne pas recharger le fichier complet dans un parseur généraliste.

**Why:** la sélection explicite garde le scan limité aux photos utiles ; l’extraction directe des plages de métadonnées évite les allocations mémoire des images haute résolution et ne dépend pas du chargement de pixels.

**How to apply:** conserver la lecture limitée aux URI fournies (jamais une recherche exhaustive de galerie), tester JPEG et HEIC/HEIF, et vérifier l’export Android Hermes après toute modification du parseur.
