---
name: Dates des photos de tâches
description: Extraction des dates EXIF depuis les photos déjà attachées à une tâche.
---

Lire les dates uniquement depuis les URI des photos attachées à la tâche, puis depuis leurs copies protégées connues. Ne pas parcourir toute la galerie ni chercher par nom.

Lire les segments JPEG APP1 ou l’élément Exif HEIF par plages ciblées, en sautant les données d’image. Ne pas recharger le fichier complet dans un parseur généraliste.

**Why:** la tâche connaît déjà ses photos ; l’extraction directe des plages de métadonnées évite les allocations mémoire des images haute résolution et ne dépend pas du chargement de pixels.

**How to apply:** conserver la lecture limitée aux URI fournies, tester JPEG et HEIC/HEIF, et vérifier l’export Android Hermes après toute modification du parseur.
