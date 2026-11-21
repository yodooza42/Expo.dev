---
name: Diagnostic du moteur de carnet
description: Règles de timeout et de télémétrie pour diagnostiquer les blocages du rendu vidéo.
---

Ne pas traiter le watchdog natif comme la cause d’un échec : il constate seulement l’absence de progrès. Pendant une attente de photo, journaliser la photo/page que la prochaine image exige, pas seulement la photo affichée à l’instant courant. Ajouter un délai propre à cette attente, plus court que le watchdog natif, et conserver le dernier état du moteur WebView (étape, position du film, page/photo, état de MediaRecorder, attente d’accusé et tampon restant) sans enregistrer de contenu utilisateur.

**Why:** Le carnet peut s’arrêter après le transfert des photos et sans atteindre la limite vidéo ; la photo actuellement affichée peut être prête alors que la prochaine photo ou page bloque la progression. Un simple pourcentage ou une durée d’inactivité ne distingue pas une lecture de fragment bloquée, un accusé natif absent, une photo en attente ou une WebView figée.

**How to apply:** Les délais spécifiques aux opérations doivent expirer avant le watchdog de secours natif. Garder un heartbeat diagnostique distinct du signal de progrès pour qu’il n’empêche jamais un vrai blocage de finir par échouer.
