---
name: EAS Build — yoann2 compte et commande
description: Compte EAS actif, projectId, commande exacte pour lancer un build Android depuis Replit.
---

## Compte actif (juillet 2026+)

- **Owner** : `yoluran2307s-team`
- **ProjectId** : `6b473886-5625-4512-aad4-c933c55218ef`
- **Slug** : `yoann-20`
- **Profile** : `production`

**Why:** `yo1907cjeicjebfs-team` a épuisé son quota free en juillet 2026 (reset 1er août). `yoluran2307s-team` est le nouveau compte de build.

## Commande exacte

```sh
cd /home/runner/workspace/artifacts/yoann2 && \
GIT_OPTIONAL_LOCKS=0 EXPO_TOKEN=<token_inline> \
/home/runner/workspace/.config/npm/node_global/bin/eas build \
--platform android --profile production --non-interactive 2>&1 | grep -m1 "See logs"
```

**How to apply:** Le token doit être passé **inline** dans la commande (pas dans app.json, pas via les secrets Replit — les secrets Replit donnent toujours `yo1907cjeicjebfs-team` car c'est le token mémorisé là-bas). Demander le token à l'utilisateur avant de lancer.

## Anciens comptes (ne plus utiliser)

- `yo1907cjeicjebfs-team` — quota épuisé juillet 2026, reset 1er août
- `yoaxel`, `yoann42s-team` — projets sur des comptes inaccessibles via les secrets Replit
