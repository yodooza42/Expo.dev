---
name: EAS build fix - yoann2 (final)
description: Historique et résolution du blocage multi-comptes Expo pour le build EAS Android de yoann2.
---

**État actuel** : le projet Expo relié au build GitHub de yoann2 utilise l'ID `123f87a4-0fe7-4f38-9f47-659eb26fd300` sous l'organisation `yo3007s-team`. `app.json` doit utiliser cet ID et cet owner.

L'ancien ID `e83ed211-253b-4ab4-a344-ddd7e0ab049c` provoque l'erreur `eas.projectId does not match the current project id` avec le projet GitHub actuel.

L'autre compte `yo1907cjeicjebfs-team` avait aussi un projet nommé `yoann-20` (ID `80f5b084-24ba-42e5-8377-5c6b055e4538`) — deux comptes Expo distincts, chacun avec son propre projet portant le même nom, ce qui a causé une confusion prolongée (12+ tokens testés, tous authentifiant vers le mauvais compte).

**Cause racine** : un secret EXPO_TOKEN périmé (pointant vers yo1907cjeicjebfs-team) restait actif malgré la soumission répétée de nouveaux tokens — `eas whoami` continuait de renvoyer le même compte tant que l'utilisateur n'avait pas explicitement supprimé l'ancien secret du même nom. Un `eas whoami` qui renvoie systématiquement le même compte malgré des tokens "différents" soumis doit faire suspecter un ancien secret encore actif, pas une erreur de copier-coller côté utilisateur.

**Comment appliquer** : pour un build depuis GitHub, vérifier que `expo.extra.eas.projectId` correspond au projet sélectionné dans expo.dev avant de relancer le build. Les champs `owner` et `projectId` doivent viser le même projet Expo.

Le projet utilise `cli.appVersionSource: "local"` afin que la version et le `versionCode` déclarés dans `app.json` restent la source de vérité pour les APK internes.

**Pourquoi :** les builds quotidiens doivent conserver le versionnement explicitement déclaré dans le dépôt plutôt que dépendre d'un compteur EAS distant.
