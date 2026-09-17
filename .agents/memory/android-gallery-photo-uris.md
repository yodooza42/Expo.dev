---
name: Android gallery photo URIs
description: Android shared-storage photo paths can lose read access during Story generation.
---

Les photos attachées à un trajet doivent être copiées dans le stockage privé de l’application dès leur sélection. Les anciens chemins `/storage/emulated/0/...` peuvent être réparés en recherchant l’asset MediaLibrary par identifiant, nom et date, puis en copiant une URI lisible.

**Why:** Android scoped storage peut laisser une miniature visible dans la galerie tout en refusant l’ouverture directe du chemin partagé avec `EACCES`.

**How to apply:** Ne pas considérer une URI galerie comme permanente ; conserver l’`assetId` quand il existe et prévoir une résolution MediaLibrary avant toute génération vidéo ou lecture différée.