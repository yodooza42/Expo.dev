---
name: EAS build fix - yoann2 (final)
description: Historique et résolution du blocage multi-comptes Expo pour le build EAS Android de yoann2.
---

**Résolu** : le compte réellement utilisable pour builder yoann2 est `yo3007s-team`, projet `yoann-20` (ID `123f87a4-0fe7-4f38-9f47-659eb26fd300`).

L'autre compte `yo1907cjeicjebfs-team` avait aussi un projet nommé `yoann-20` (ID `80f5b084-24ba-42e5-8377-5c6b055e4538`) — deux comptes Expo distincts, chacun avec son propre projet portant le même nom, ce qui a causé une confusion prolongée (12+ tokens testés, tous authentifiant vers le mauvais compte).

**Cause racine** : un secret EXPO_TOKEN périmé (pointant vers yo1907cjeicjebfs-team) restait actif malgré la soumission répétée de nouveaux tokens — `eas whoami` continuait de renvoyer le même compte tant que l'utilisateur n'avait pas explicitement supprimé l'ancien secret du même nom. Un `eas whoami` qui renvoie systématiquement le même compte malgré des tokens "différents" soumis doit faire suspecter un ancien secret encore actif, pas une erreur de copier-coller côté utilisateur.

**Comment appliquer** : avant de tester un nouveau token EXPO_TOKEN qui semble ignoré, demander à l'utilisateur de vérifier qu'aucun ancien secret du même nom ne subsiste, puis revérifier `eas whoami` avant de toucher à `app.json` (champs `owner` + `expo.extra.eas.projectId`).
