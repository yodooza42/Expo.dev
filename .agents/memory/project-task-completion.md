---
name: Dates de fin des projets et tâches
description: Règle utilisateur distinguant échéance et date réelle de fin pour la chronologie.
---

Les projets et les tâches doivent permettre de corriger leur date réelle de fin, tout en gardant « marquer terminé = date du jour » par défaut.

Quand toutes les sous-tâches datées d’une tâche terminée le sont, sa date de fin devient la date la plus récente de ses sous-tâches. Quand toutes les tâches datées d’un projet terminé le sont, sa date de fin devient la plus récente de ses tâches. Si une date enfant manque ou est invalide, ne pas deviner.

**Why:** l’utilisateur oublie parfois de marquer un élément terminé le jour même et souhaite le replacer à la bonne date dans la chronologie. Il a explicitement confirmé que cela concerne les projets et les tâches.

**How to apply:** distinguer la date limite de la date réelle de fin. Les modifications ordinaires ne doivent pas réinitialiser une date de fin corrigée ; corriger une tâche récurrente déjà terminée ne doit pas créer une autre occurrence. Ne pas inventer la fin d’un ancien projet à partir de sa dernière modification.

Quand toutes les sous-tâches d’une tâche ou toutes les tâches d’un projet sont terminées, mais que leur parent ne l’est pas, proposer en haut de l’accueil de marquer ce parent terminé. « Plus tard » mémorise le report pour cet état précis des enfants.

**Why:** l’utilisateur veut que les parents oubliés soient faciles à clôturer, sans perdre les dates de fin réelles déjà calculées.

**How to apply:** accepter la proposition via les fonctions habituelles de mise à jour du statut afin que les dates des enfants alimentent la date du parent ; reproposer après un changement pertinent des enfants.
