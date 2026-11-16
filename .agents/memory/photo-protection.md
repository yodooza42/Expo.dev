---
name: Stockage durable Yoann2.0
description: Règles validées par l'utilisateur pour le dossier Yoann2.0 (photos, sauvegardes, restauration, changement de téléphone).
---

Le dossier Yoann2.0 du téléphone est la seule source de vérité : après une réinstallation ou un changement de téléphone, l'utilisateur copie ce dossier, le choisit à nouveau dans l'app et tout doit fonctionner. Ce fonctionnement couvre aussi les photos des trajets.

**Why:** l'utilisateur a perdu des liens photo lors de réinstallations et a demandé une refonte complète du stockage (novembre 2026).

**How to apply:**
- Copies locales uniquement, pas de cloud, masquées de la galerie (`.nomedia`). Ne jamais modifier les originaux, leurs dates ni leurs EXIF.
- Rien n'est déplacé ni supprimé sans confirmation explicite. Seule exception validée : la Corbeille est vidée 30 jours après la mise à la corbeille confirmée.
- Ne pas toucher aux anciens dossiers (`Photos/<Projet>`, `Sauvegarde`). Les anciens liens photo ne sont pas migrés : l'utilisateur remet ses photos à la main.
- Retirer une photo d'une tâche ne supprime jamais le fichier ; le bilan propose ensuite la corbeille.
- Les trajets qui ont des photos ou des souvenirs ne sont jamais purgés automatiquement, sinon leurs photos deviendraient orphelines.
- Toujours dire les limites : Android redemande l'accès au dossier après une réinstallation ou sur un nouveau téléphone ; une copie externe régulière (PC, clé USB) reste conseillée.

SAF : une réécriture doit supprimer puis recréer le fichier ; `getInfoAsync` sur content:// n'indique pas les dossiers ; les destinations de `copyAsync` doivent être en file:// ; seul le fournisseur `com.android.externalstorage.documents` est accepté (ses ids de document sont des chemins).
