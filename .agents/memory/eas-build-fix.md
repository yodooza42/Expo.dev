---
name: EAS build fix - yoann2 (final)
description: Historique et résolution du blocage multi-comptes Expo pour le build EAS Android de yoann2.
---

Deux comptes Expo peuvent avoir des projets distincts portant des noms ou slugs semblables. Le dépôt lié dans GitHub ne doit servir de référence qu'après confirmation du propriétaire et du Project ID affichés dans Expo.

**Why:** Un ancien build a été dirigé vers un projet Expo différent de celui relié à GitHub, malgré un nom de projet similaire.

**How to apply:** Avant de pousser ou déclencher un build GitHub, comparer `owner` et `extra.eas.projectId` dans `app.json` au projet Expo lié. Ne pas se fier au nom ou au slug seuls. Conserver le versionnement Android local (`versionCode`) pour les APK internes.

## Reproductibilité des installations

Conserver la même version exacte de pnpm en local et dans les profils de build, indépendamment de l’image cloud. Garder une autorisation explicite des scripts des dépendances nécessaires, sans désactiver globalement leur contrôle.

**Why:** Un lockfile ne fige pas les règles de sécurité du gestionnaire de paquets : les versions majeures de pnpm changent les paramètres d’autorisation des scripts.

**How to apply:** Aligner la version déclarée à la racine et celle des profils cloud ; vérifier les installations avec le lockfile figé avant de modifier les autorisations.
