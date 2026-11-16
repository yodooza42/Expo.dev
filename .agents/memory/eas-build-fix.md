---
name: EAS build fix - yoann2 (final)
description: Historique et résolution du blocage multi-comptes Expo pour le build EAS Android de yoann2.
---

Deux comptes Expo peuvent avoir des projets distincts portant des noms ou slugs semblables. Le dépôt lié dans GitHub ne doit servir de référence qu'après confirmation du propriétaire et du Project ID affichés dans Expo.

**Why:** Un ancien build a été dirigé vers un projet Expo différent de celui relié à GitHub, malgré un nom de projet similaire.

**How to apply:** Avant de pousser ou déclencher un build GitHub, comparer `owner` et `extra.eas.projectId` dans `app.json` au projet Expo lié. Ne pas se fier au nom ou au slug seuls. Conserver le versionnement Android local (`versionCode`) pour les APK internes.
