---
name: Anna planning nounou — horaires figés vs Travail
description: Piège à éviter — toute page qui affiche des horaires Yoann doit lire workSchedule via getWidgetSettings(), pas une copie codée en dur.
---

Le calcul des "périodes sans surveillance" (page Anna) copiait les horaires
hebdomadaires de Yoann en dur dans le fichier au lieu de lire `workSchedule`
(éditable dans l'onglet Travail, stocké via `getWidgetSettings()` /
`widgets/widgetSettings.ts`). Résultat : modifier le planning de travail
n'avait aucun effet visible ailleurs.

**Pourquoi ça arrive facilement ici** : `workSchedule` (DaySchedule[]) utilise
l'index `Date.getDay()` (0=Dimanche…6=Samedi), alors que plusieurs écrans du
projet utilisent une convention "lundi=0…dimanche=6" en interne — la
conversion `(weekdayIdx + 1) % 7` est nécessaire pour passer de l'une à
l'autre.

**Comment appliquer** : pour tout nouvel écran qui a besoin des horaires de
travail de Yoann, importer `getWidgetSettings()` (pas de constante locale), et
recharger via `useFocusEffect` (pas seulement `useEffect` au montage) pour
refléter les changements faits ailleurs sans redémarrer l'app.
