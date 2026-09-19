---
name: Virements épargne centralisés
description: Règle de cohérence pour les mouvements entre compte courant et compte épargne.
---

Tous les virements entre le compte courant et l’épargne doivent passer par une opération commune qui met à jour le solde épargne et crée la transaction bancaire correspondante. Les écrans ne doivent pas reproduire cette séquence.

**Why:** Une mise à jour du seul solde épargne rend le débit du compte courant invisible dans le solde et l’historique.

**How to apply:** Lorsqu’un nouveau parcours ajoute ou retire de l’argent de l’épargne, réutiliser l’opération commune et recharger les transactions du contexte après l’exécution.