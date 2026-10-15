---
name: Mise en page des WebViews invisibles
description: Le conteneur Android des moteurs de rendu invisibles peut occuper de la place malgré le style de la vue interne.
---

Garder les WebViews invisibles de génération de médias entièrement hors du flux, dans un hôte absolu borné et non interactif. Contraindre aussi leur conteneur natif.

**Why:** Sur Android, react-native-webview ajoute un conteneur avec `flex: 1`, distinct de la vue ciblée par `style`. Masquer ou positionner uniquement la vue interne peut réserver une grande zone vide et réduire silencieusement le défilement des statistiques. Le rendu web ne reproduit pas forcément ce comportement natif.

**How to apply:** Lors de l’ajout ou de la modification d’un moteur de rendu invisible, vérifier son hôte et son `containerStyle`, pas seulement son opacité. Garder le moteur monté pour ses messages et exports, sans lui permettre de prendre de l’espace ni d’intercepter les gestes.
