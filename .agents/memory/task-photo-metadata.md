---
name: Dates des photos de tâches
description: Source de vérité pour la récupération des dates EXIF des photos attachées aux tâches.
---

Pour dater les photos déjà attachées à une tâche, lire leurs métadonnées depuis les fichiers protégés eux-mêmes et essayer les autres copies connues en secours. Ne pas balayer toute la galerie ni faire de correspondance par nom pour cette opération.

**Why:** le registre de la tâche contient déjà les photos concernées, et leurs copies protégées préservent les octets ; scanner la galerie entière est plus lent et examine des images hors sujet.

**How to apply:** toute récupération de dates pour répartir les photos entre sous-tâches doit rester limitée aux URI de la tâche et laisser les dates absentes non assignées.

Pour React Native/Hermes, importer `exifr/dist/lite.esm.mjs` plutôt que le point d’entrée `exifr` : l’entrée principale sélectionne le bundle full UMD, dont l’import dynamique non littéral échoue à la compilation Hermes.

**Why:** l’étape Gradle `createBundleReleaseJsAndAssets` échoue avec « Invalid expression encountered » sur cet import dynamique.

**How to apply:** si le bundle EXIF change, vérifier l’export Android avec Hermes activé ; lite gère JPEG et HEIC et couvre les dates EXIF utilisées ici.
