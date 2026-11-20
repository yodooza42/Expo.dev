---
name: Diagnostic du moteur de carnet
description: Règles de timeout et de télémétrie pour diagnostiquer les blocages du rendu vidéo.
---

Ne pas traiter le watchdog natif comme la cause d’un échec : il constate seulement l’absence de progrès. Garder le dernier état du moteur WebView (étape, position du film, page/photo, état de MediaRecorder, attente d’accusé et tampon restant) dans les journaux, sans enregistrer de contenu utilisateur.

**Why:** Le carnet peut s’arrêter après le transfert des photos et sans atteindre la limite vidéo ; un simple pourcentage ou une durée d’inactivité ne distingue pas une lecture de fragment bloquée, un accusé natif absent, une photo en attente ou une WebView figée.

**How to apply:** Les délais spécifiques aux opérations doivent expirer avant le watchdog de secours natif. Garder un heartbeat diagnostique distinct du signal de progrès pour qu’il n’empêche jamais un vrai blocage de finir par échouer.
