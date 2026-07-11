---
name: Foreground service GPS démarré depuis un widget Android
description: Contraintes Android 12+ pour démarrer/mettre à jour le foreground service expo-location depuis un widget (fenêtre d'exemption ~10 s, patch in-place)
---

## Règle 1 — Démarrer le FGS dans les ~10 s après l'appui widget
Android 12+ interdit à une app en arrière-plan de démarrer un foreground service,
SAUF pendant une courte fenêtre d'exemption (~10 s) après une interaction utilisateur
(appui sur un bouton de widget). Tout `await` long (ex : `getCurrentPositionAsync`
avec timeout 10 s) placé AVANT `startLocationUpdatesAsync` consomme la fenêtre →
`ForegroundServiceStartNotAllowedException` (souvent avalée par un `.catch(() => {})`)
→ pas de notification, pas de GPS, distance 0.0 km.
**Comment appliquer :** dans un handler de widget, démarrer le service EN PREMIER,
récupérer la position/faire le travail lent APRÈS.

## Règle 2 — Ne jamais stop/start pour changer les options
`Location.startLocationUpdatesAsync` sur une tâche déjà enregistrée patche les
options en place (Android fait `startForeground(mêmeId, notif)` → mise à jour sans
flicker, pas de re-création). Un `stopLocationUpdatesAsync` + `startLocationUpdatesAsync`
détruit le service et retombe sous la restriction de la règle 1.
**Comment appliquer :** pour changer fréquence GPS ou texte de notification
(pause/reprise/mise à jour distance), appeler directement `startLocationUpdatesAsync`
avec les nouvelles options.

## Règle 3 — Déclaration app de navigation
`android:appCategory="maps"` sur `<application>` (via config plugin
`withAndroidManifest`) : One UI/Samsung traite les apps "maps" comme Waze —
moins de kill batterie du FGS GPS. Complémentaire : `activityType:
AutomotiveNavigation` + `pausesUpdatesAutomatically: false` dans les options
expo-location, et exemption d'optimisation batterie côté utilisateur.
