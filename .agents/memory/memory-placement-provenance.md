---
name: Provenance des placements de souvenirs
description: Règle conservatrice pour les anciens placements dont le mode de correction est inconnu.
---

Lors d’un changement de tracé, une ancienne ancre sans provenance de placement doit être conservée géographiquement plutôt que recalculée à partir de l’heure de prise.

**Why:** Les anciennes photos pouvaient être déplacées manuellement sans enregistrer ce choix. Leur date fiable ne prouve donc pas que leur position actuelle est automatique ; la privilégier risquerait d’annuler une correction de l’utilisateur.

**How to apply:** Réserver le recalcul temporel aux placements explicitement automatiques ou aux photos sans position préalable. Pour les positions manuelles ou historiques ambiguës, retrouver une ancre sur le nouveau tracé sans modifier les coordonnées conservées ni l’heure de prise.

Si une ancienne photo sans provenance et son souvenir lié ont des ancres différentes, privilégier l’ancre de la photo, même lorsque le souvenir est déjà marqué manuel.

**Why:** Historiquement, le déplacement depuis la carte ne changeait que la photo, tandis que le questionnaire synchronisait photo et souvenir. Une divergence issue de ce parcours représente donc la correction ultérieure depuis la carte.

**How to apply:** Remapper les deux objets depuis cette correction ultérieure, puis enregistrer leur position commune pour que les recalculs suivants ne rétablissent pas l’ancienne position.

Les coordonnées géographiques d’un souvenir et son ancre de lecture sur le tracé simplifié sont indépendantes.

**Why:** Une longue portion droite peut être simplifiée en deux extrémités. Assimiler les coordonnées à celles de l’ancre déplace alors un souvenir pris au milieu, même lorsque les GPS bruts indiquent sa position exacte.

**How to apply:** Conserver les coordonnées du GPS brut correspondant à l’heure fiable, ou les coordonnées antérieures fiables si ce GPS n’est plus disponible. Utiliser la même position pour les marqueurs, la prévisualisation et l’affichage des photos dans les stories ; réserver l’index de tracé à l’ancrage de lecture.
