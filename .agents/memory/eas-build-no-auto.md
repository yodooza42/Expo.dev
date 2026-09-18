---
name: EAS build — ne jamais lancer sans autorisation
description: Règle absolue — ne déclencher aucun build EAS sans demande explicite de l'utilisateur.
---

## Règle

Ne **jamais** lancer un build EAS (ni créer/redémarrer un workflow de build) sans que l'utilisateur le demande mot pour mot.

**Why:** Les quotas EAS sont limités et précieux (account `yo13juills-team` a un quota mensuel). Lancer des builds de façon proactive ou "pour tester" brûle du quota inutilement et frustre l'utilisateur.

**How to apply:** Même si du code vient d'être modifié et qu'un build semble logique, attendre une instruction explicite du type "lance le build", "fais un build", "EAS build", etc. Ne pas interpréter une demande de code ou de vérification comme une autorisation de builder.
