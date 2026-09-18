---
name: Capture des maquettes de stories
description: Limites des captures automatiques d’un renderer canvas animé dans une iframe isolée.
---

Une capture automatique ne garantit pas que la story animée dans une iframe interne a atteint son premier dessin ou son état final. Une image noire ou un tracé partiel ne prouvent donc pas à eux seuls un défaut du renderer.

**Why:** Lors d’une comparaison visuelle, le même renderer valide a été capturé en cours d’animation puis avant son dessin, tandis qu’un aperçu final plus léger donnait la référence attendue.

**How to apply:** Comparer les directions sur un état représentatif déterministe avec les mêmes données d’exemple. Garder toute adaptation du temps ou de l’enregistrement dans l’aperçu isolé, jamais dans le générateur de l’application.