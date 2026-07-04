import type { Appointment, Category, Expense, Project, Task } from '@/types';

export const SEED_VERSION = 'v2_real';

export const SEED_PROJECTS: Project[] = [
  {
    "id": "1781336161191yxe7htoso",
    "name": "Aménagement garage",
    "description": "Optimiser le rangement",
    "category": "Maison",
    "photos": [],
    "startDate": "2025-02-13T23:00:00.000Z",
    "dueDate": "2026-08-12T22:00:00.000Z",
    "budget": 2500,
    "spent": 1699,
    "priority": "high",
    "status": "inprogress",
    "archived": false,
    "createdAt": "2026-06-13T07:36:01.191Z",
    "updatedAt": "2026-06-14T14:12:06.876Z"
  },
  {
    "id": "1781336161191q2zfpbndi",
    "name": "Pergola / Terrasse",
    "description": "Construction et aménagement de la pergola du jardin.",
    "category": "Jardin",
    "photos": [],
    "startDate": "2026-06-12T22:00:00.000Z",
    "dueDate": "2026-09-12T22:00:00.000Z",
    "budget": 1000,
    "spent": 669,
    "priority": "medium",
    "status": "todo",
    "archived": false,
    "createdAt": "2026-06-13T07:36:01.191Z",
    "updatedAt": "2026-06-14T13:58:16.394Z"
  },
  {
    "id": "178134208709197ly3y9pi",
    "name": "Entretien moto",
    "description": "",
    "category": "Véhicule",
    "photos": [],
    "startDate": "2025-12-11T23:00:00.000Z",
    "dueDate": "2027-06-14T22:00:00.000Z",
    "budget": 500,
    "spent": 17,
    "priority": "medium",
    "status": "todo",
    "archived": false,
    "createdAt": "2026-06-13T09:14:47.091Z",
    "updatedAt": "2026-06-15T00:19:49.813Z"
  },
  {
    "id": "1781343806366wzfhmpjne",
    "name": "Chambre parentale",
    "description": "",
    "category": "Maison",
    "photos": [],
    "startDate": "2025-02-12T23:00:00.000Z",
    "dueDate": "2026-08-19T22:00:00.000Z",
    "budget": 1700,
    "spent": 1635,
    "priority": "high",
    "status": "todo",
    "archived": false,
    "createdAt": "2026-06-13T09:43:26.366Z",
    "updatedAt": "2026-06-15T00:08:22.818Z"
  },
  {
    "id": "1781368433019a40b5dw3j",
    "name": "Entrée jardin",
    "description": "",
    "category": "Jardin",
    "photos": [],
    "startDate": "2025-12-31T23:00:00.000Z",
    "dueDate": "2026-12-31T23:00:00.000Z",
    "budget": 250,
    "spent": 10,
    "priority": "medium",
    "status": "todo",
    "archived": false,
    "createdAt": "2026-06-13T16:33:53.019Z",
    "updatedAt": "2026-06-14T17:52:31.503Z"
  },
  {
    "id": "1781368947223h7k8duc3e",
    "name": "Entretien Doblo",
    "description": "",
    "category": "Véhicule",
    "photos": [],
    "startDate": "2025-12-31T23:00:00.000Z",
    "dueDate": "2026-12-31T23:00:00.000Z",
    "budget": 1000,
    "spent": 180,
    "priority": "high",
    "status": "todo",
    "archived": false,
    "createdAt": "2026-06-13T16:42:27.223Z",
    "updatedAt": "2026-06-14T14:10:59.971Z"
  },
  {
    "id": "1781440976555y9l9axymk",
    "name": "Yoann v30",
    "description": "Upgrade de vie, Santé, Apprentissage.....",
    "category": "Personnel",
    "photos": [],
    "startDate": "2026-04-09T22:00:00.000Z",
    "dueDate": "2027-04-09T22:00:00.000Z",
    "budget": 5000,
    "spent": 0,
    "priority": "high",
    "status": "todo",
    "archived": false,
    "createdAt": "2026-06-14T12:42:56.555Z",
    "updatedAt": "2026-06-14T12:42:56.555Z"
  },
  {
    "id": "17814593768275efrwudu1",
    "name": "Toiture & Gouttières",
    "description": "Refaire les descentes et colliers\nVoir pour anti-mousse",
    "category": "Jardin",
    "photos": [],
    "startDate": "2026-05-31T22:00:00.000Z",
    "dueDate": "2026-08-19T22:00:00.000Z",
    "budget": 200,
    "spent": 0,
    "priority": "medium",
    "status": "todo",
    "archived": false,
    "createdAt": "2026-06-14T17:49:36.827Z",
    "updatedAt": "2026-06-14T17:49:36.827Z"
  },
  {
    "id": "1781459849044dp48j62m1",
    "name": "Chambre Anna",
    "description": "",
    "category": "Maison",
    "photos": [],
    "startDate": "2025-11-19T23:00:00.000Z",
    "dueDate": "2026-11-19T23:00:00.000Z",
    "budget": 1000,
    "spent": 250,
    "priority": "medium",
    "status": "todo",
    "archived": false,
    "createdAt": "2026-06-14T17:57:29.044Z",
    "updatedAt": "2026-06-14T17:59:57.375Z"
  },
  {
    "id": "17814606950269dmx3xwp9",
    "name": "Portails & Clôtures",
    "description": "",
    "category": "Jardin",
    "photos": [],
    "startDate": "2025-02-13T23:00:00.000Z",
    "dueDate": "2027-02-13T23:00:00.000Z",
    "budget": 0,
    "spent": 250,
    "priority": "medium",
    "status": "todo",
    "archived": false,
    "createdAt": "2026-06-14T18:11:35.026Z",
    "updatedAt": "2026-06-14T18:15:55.792Z"
  },
  {
    "id": "1781461079383453gi536l",
    "name": "Outillé",
    "description": "",
    "category": "Personnel",
    "photos": [],
    "startDate": "2019-12-31T23:00:00.000Z",
    "dueDate": "2029-12-31T23:00:00.000Z",
    "budget": 10000,
    "spent": 2270,
    "priority": "low",
    "status": "inprogress",
    "archived": false,
    "createdAt": "2026-06-14T18:17:59.383Z",
    "updatedAt": "2026-06-14T18:47:51.956Z"
  }
];

export const SEED_TASKS: Task[] = [
  {
    "id": "1781375455442ybuyfe6aa",
    "projectId": "1781336161191yxe7htoso",
    "title": "Changement chauffe-eau",
    "description": "Refaire tout de A à Z car ancien propriétaire avait tout fait a l'envers...\nChauffe eau qui tient que sur une seule patte, support pas centré et j'en passe..",
    "notes": "",
    "photos": [],
    "dueDate": "2025-01-31T23:00:00.000Z",
    "priority": "critical",
    "importance": 3,
    "urgency": 3,
    "status": "done",
    "createdAt": "2026-06-13T18:30:55.442Z",
    "eisenhower": "do_now"
  },
  {
    "id": "1781377234084p7p9k48nn",
    "projectId": "1781336161191q2zfpbndi",
    "title": "Retirer les anciennes dalles",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2026-03-31T22:00:00.000Z",
    "priority": "medium",
    "importance": 3,
    "urgency": 2,
    "status": "done",
    "createdAt": "2026-06-13T19:00:34.084Z",
    "eisenhower": "do_now"
  },
  {
    "id": "1781377336534y2hehmrnl",
    "projectId": "1781336161191q2zfpbndi",
    "title": "Décaisser la terre",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2026-04-04T22:00:00.000Z",
    "priority": "medium",
    "importance": 3,
    "urgency": 3,
    "status": "done",
    "createdAt": "2026-06-13T19:02:16.534Z",
    "eisenhower": "do_now"
  },
  {
    "id": "1781377456251s56u6jyr0",
    "projectId": "1781336161191q2zfpbndi",
    "title": "Remblayer",
    "description": "Ajouter gravats, puis calcaire",
    "notes": "",
    "photos": [],
    "dueDate": "2026-04-09T22:00:00.000Z",
    "priority": "medium",
    "importance": 3,
    "urgency": 3,
    "status": "done",
    "createdAt": "2026-06-13T19:04:16.251Z",
    "eisenhower": "do_now"
  },
  {
    "id": "1781377551914rpc8uilkh",
    "projectId": "1781336161191q2zfpbndi",
    "title": "Création structure pergola",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2026-04-19T22:00:00.000Z",
    "priority": "medium",
    "importance": 3,
    "urgency": 3,
    "status": "done",
    "createdAt": "2026-06-13T19:05:51.914Z",
    "eisenhower": "do_now"
  },
  {
    "id": "17813782538620e39p7mdc",
    "projectId": "1781336161191q2zfpbndi",
    "title": "Création prise extérieure",
    "description": "Passage d'un câble sous terrain long des bordures béton du robinet extérieur vers pergola",
    "notes": "",
    "photos": [],
    "dueDate": "2026-04-09T22:00:00.000Z",
    "priority": "medium",
    "importance": 3,
    "urgency": 3,
    "status": "done",
    "createdAt": "2026-06-13T19:17:33.862Z",
    "eisenhower": "do_now"
  },
  {
    "id": "1781378560379h9pkl5y0j",
    "projectId": "1781336161191yxe7htoso",
    "title": "Création 2 meubles \"Trofast\"",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2025-08-29T22:00:00.000Z",
    "priority": "medium",
    "importance": 3,
    "urgency": 3,
    "status": "done",
    "createdAt": "2026-06-13T19:22:40.379Z",
    "eisenhower": "do_now"
  },
  {
    "id": "1781381503716ibw1l34vx",
    "projectId": "1781336161191yxe7htoso",
    "title": "Bloc LL / SL et LV",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2026-06-09T22:00:00.000Z",
    "priority": "medium",
    "importance": 3,
    "urgency": 3,
    "status": "done",
    "createdAt": "2026-06-13T20:11:43.717Z",
    "eisenhower": "do_now"
  },
  {
    "id": "1781383669732e6yzpbwah",
    "projectId": "178134208709197ly3y9pi",
    "title": "Nettoyage chaine + Retendre + Graissage",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2026-06-14T22:00:00.000Z",
    "priority": "high",
    "importance": 5,
    "urgency": 3,
    "status": "done",
    "createdAt": "2026-06-13T20:47:49.732Z",
    "eisenhower": "do_now"
  },
  {
    "id": "178138370591826omsyfog",
    "projectId": "178134208709197ly3y9pi",
    "title": "Vidange",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2026-06-14T22:00:00.000Z",
    "priority": "high",
    "importance": 5,
    "urgency": 3,
    "status": "done",
    "createdAt": "2026-06-13T20:48:25.918Z",
    "eisenhower": "do_now"
  },
  {
    "id": "17813837894312v1nx5wyn",
    "projectId": "178134208709197ly3y9pi",
    "title": "Changement pneus",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2026-07-09T22:00:00.000Z",
    "priority": "medium",
    "importance": 5,
    "urgency": 2,
    "status": "idea",
    "createdAt": "2026-06-13T20:49:49.431Z",
    "eisenhower": "do_now"
  },
  {
    "id": "1781383825842nujyown5z",
    "projectId": "1781368947223h7k8duc3e",
    "title": "Changement pneus avant",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2026-06-14T22:00:00.000Z",
    "priority": "high",
    "importance": 5,
    "urgency": 5,
    "status": "done",
    "createdAt": "2026-06-13T20:50:25.842Z",
    "eisenhower": "do_now"
  },
  {
    "id": "1781383885123yi7oieeuf",
    "projectId": "1781368947223h7k8duc3e",
    "title": "Parallélisme avant",
    "description": "~60€",
    "notes": "",
    "photos": [],
    "dueDate": "2026-07-09T22:00:00.000Z",
    "priority": "high",
    "importance": 5,
    "urgency": 3,
    "status": "todo",
    "createdAt": "2026-06-13T20:51:25.123Z",
    "eisenhower": "do_now"
  },
  {
    "id": "1781383927933v372mi4yn",
    "projectId": "1781368947223h7k8duc3e",
    "title": "Frein avant",
    "description": "Plaquettes + Disques + Purge liquide",
    "notes": "~200€",
    "photos": [],
    "dueDate": "2026-07-09T22:00:00.000Z",
    "priority": "high",
    "importance": 5,
    "urgency": 3,
    "status": "todo",
    "createdAt": "2026-06-13T20:52:07.933Z",
    "eisenhower": "do_now"
  },
  {
    "id": "178138397330656if76bl1",
    "projectId": "1781368947223h7k8duc3e",
    "title": "Portière Avant-Gauche",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2026-07-19T22:00:00.000Z",
    "priority": "low",
    "importance": 2,
    "urgency": 3,
    "status": "todo",
    "createdAt": "2026-06-13T20:52:53.306Z",
    "eisenhower": "do_now"
  },
  {
    "id": "1781384054270wlve6mevx",
    "projectId": "1781343806366wzfhmpjne",
    "title": "Penderie Marie",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2026-06-30T22:00:00.000Z",
    "priority": "medium",
    "importance": 5,
    "urgency": 2,
    "status": "inprogress",
    "createdAt": "2026-06-13T20:54:14.270Z",
    "eisenhower": "do_now"
  },
  {
    "id": "1781384331372tffl9c07n",
    "projectId": "1781343806366wzfhmpjne",
    "title": "Penderie Yo",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2026-06-30T22:00:00.000Z",
    "priority": "medium",
    "importance": 3,
    "urgency": 2,
    "status": "done",
    "createdAt": "2026-06-13T20:58:51.372Z",
    "eisenhower": "do_now"
  },
  {
    "id": "1781385164409gpbndxdqx",
    "projectId": "1781343806366wzfhmpjne",
    "title": "Peinture",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2026-06-30T22:00:00.000Z",
    "priority": "medium",
    "importance": 3,
    "urgency": 2,
    "status": "inprogress",
    "createdAt": "2026-06-13T21:12:44.409Z",
    "eisenhower": "do_now"
  },
  {
    "id": "178138539379451j1w1rkf",
    "projectId": "1781368433019a40b5dw3j",
    "title": "Arracher et évacuer Canna côté entrée",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2026-03-31T22:00:00.000Z",
    "priority": "medium",
    "importance": 3,
    "urgency": 2,
    "status": "done",
    "createdAt": "2026-06-13T21:16:33.794Z",
    "eisenhower": "do_now"
  },
  {
    "id": "1781385457243g2x7n08ih",
    "projectId": "1781368433019a40b5dw3j",
    "title": "Enlever bordures béton et évacuer",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2026-03-31T22:00:00.000Z",
    "priority": "medium",
    "importance": 3,
    "urgency": 2,
    "status": "done",
    "createdAt": "2026-06-13T21:17:37.243Z",
    "eisenhower": "do_now"
  },
  {
    "id": "1781385680780vz4pm8va4",
    "projectId": "1781368433019a40b5dw3j",
    "title": "Remplacer graviers par terre carossable",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2026-03-31T22:00:00.000Z",
    "priority": "medium",
    "importance": 3,
    "urgency": 3,
    "status": "done",
    "createdAt": "2026-06-13T21:21:20.780Z",
    "eisenhower": "do_now"
  },
  {
    "id": "1781385744947n6faz0sha",
    "projectId": "1781368433019a40b5dw3j",
    "title": "Remblayer avec terre",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2026-07-31T22:00:00.000Z",
    "priority": "medium",
    "importance": 3,
    "urgency": 2,
    "status": "idea",
    "createdAt": "2026-06-13T21:22:24.947Z",
    "eisenhower": "do_now"
  },
  {
    "id": "1781387941398z58wsml59",
    "projectId": "1781336161191yxe7htoso",
    "title": "Étagère suspendue (mur cuisine)",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2026-02-28T23:00:00.000Z",
    "priority": "high",
    "importance": 5,
    "urgency": 3,
    "status": "done",
    "createdAt": "2026-06-13T21:59:01.398Z",
    "eisenhower": "do_now"
  },
  {
    "id": "1781392472275r19njq1dq",
    "projectId": "1781336161191yxe7htoso",
    "title": "Étagère (mur salon)",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2026-03-19T23:00:00.000Z",
    "priority": "medium",
    "importance": 3,
    "urgency": 3,
    "status": "done",
    "createdAt": "2026-06-13T23:14:32.275Z",
    "eisenhower": "do_now"
  },
  {
    "id": "1781424197260jnrr6y4nz",
    "projectId": "1781336161191yxe7htoso",
    "title": "Création compteur auxiliaire",
    "description": "Objectifs de base:\nFaire prises pour : LL/SL/LV\nRaccorder portail extérieur et faire prises extérieur",
    "notes": "",
    "photos": [],
    "dueDate": "2025-04-09T22:00:00.000Z",
    "priority": "medium",
    "importance": 3,
    "urgency": 2,
    "status": "done",
    "createdAt": "2026-06-14T08:03:17.260Z",
    "eisenhower": "do_now"
  },
  {
    "id": "17814411361221lhk7f6ib",
    "projectId": "1781440976555y9l9axymk",
    "title": "Changement lunettes",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2026-08-31T22:00:00.000Z",
    "priority": "medium",
    "importance": 3,
    "urgency": 2,
    "status": "todo",
    "createdAt": "2026-06-14T12:45:36.122Z",
    "eisenhower": "do_now"
  },
  {
    "id": "1781459432520on902i6fx",
    "projectId": "17814593768275efrwudu1",
    "title": "Gouttières",
    "description": "Descentes de toit et colliers",
    "notes": "",
    "photos": [],
    "dueDate": "2026-08-19T22:00:00.000Z",
    "priority": "medium",
    "importance": 3,
    "urgency": 2,
    "status": "todo",
    "createdAt": "2026-06-14T17:50:32.520Z",
    "eisenhower": "do_now"
  },
  {
    "id": "1781459463910vv17epicb",
    "projectId": "17814593768275efrwudu1",
    "title": "Anti-mousse toiture",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2026-08-19T22:00:00.000Z",
    "priority": "low",
    "importance": 3,
    "urgency": 2,
    "status": "idea",
    "createdAt": "2026-06-14T17:51:03.910Z",
    "eisenhower": "do_now"
  },
  {
    "id": "1781459731828k5jm4jfp1",
    "projectId": "1781368947223h7k8duc3e",
    "title": "Vidange Doblo",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2026-08-09T22:00:00.000Z",
    "priority": "medium",
    "importance": 3,
    "urgency": 2,
    "status": "idea",
    "createdAt": "2026-06-14T17:55:31.828Z",
    "eisenhower": "do_now"
  },
  {
    "id": "1781459917548uyr5f9d8y",
    "projectId": "1781459849044dp48j62m1",
    "title": "Penderie Anna",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2026-11-19T23:00:00.000Z",
    "priority": "low",
    "importance": 3,
    "urgency": 2,
    "status": "inprogress",
    "createdAt": "2026-06-14T17:58:37.548Z",
    "eisenhower": "do_now"
  },
  {
    "id": "1781460746601t1yac1uex",
    "projectId": "17814606950269dmx3xwp9",
    "title": "Brancher moteur portail",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2027-02-13T23:00:00.000Z",
    "priority": "medium",
    "importance": 3,
    "urgency": 2,
    "status": "waiting",
    "createdAt": "2026-06-14T18:12:26.601Z",
    "eisenhower": "do_now"
  },
  {
    "id": "1781460779025qizv2vzo5",
    "projectId": "17814606950269dmx3xwp9",
    "title": "Faire accès câblage et longrine",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2027-02-13T23:00:00.000Z",
    "priority": "medium",
    "importance": 3,
    "urgency": 2,
    "status": "done",
    "createdAt": "2026-06-14T18:12:59.025Z",
    "eisenhower": "do_now"
  },
  {
    "id": "1781461127296c5g6qksj4",
    "projectId": "1781461079383453gi536l",
    "title": "Outillage manuel",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2029-12-31T23:00:00.000Z",
    "priority": "low",
    "importance": 2,
    "urgency": 2,
    "status": "done",
    "createdAt": "2026-06-14T18:18:47.296Z",
    "eisenhower": "do_now"
  },
  {
    "id": "1781462574273pjic2xmap",
    "projectId": "1781461079383453gi536l",
    "title": "Outillage électrique",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2029-12-31T23:00:00.000Z",
    "priority": "low",
    "importance": 2,
    "urgency": 2,
    "status": "done",
    "createdAt": "2026-06-14T18:42:54.273Z",
    "eisenhower": "do_now"
  },
  {
    "id": "1781462603710159hcr43i",
    "projectId": "1781461079383453gi536l",
    "title": "Outillage motorisé",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2029-12-31T23:00:00.000Z",
    "priority": "low",
    "importance": 2,
    "urgency": 2,
    "status": "done",
    "createdAt": "2026-06-14T18:43:23.710Z",
    "eisenhower": "do_now"
  },
  {
    "projectId": "1781440976555y9l9axymk",
    "title": "Yoann 2.0",
    "description": "",
    "notes": "",
    "photos": [],
    "dueDate": "2026-11-30T23:00:00.000Z",
    "priority": "low",
    "importance": 3,
    "urgency": 2,
    "status": "todo",
    "id": "mr6iv7ybdwqufbxim",
    "createdAt": "2026-07-04T15:33:39.971Z",
    "eisenhower": "do_now"
  }
];

export const SEED_EXPENSES: Expense[] = [
  {
    "id": "1781375501348xxzl811tr",
    "projectId": "1781336161191yxe7htoso",
    "taskId": "1781375455442ybuyfe6aa",
    "name": "Chauffe-eau",
    "amount": 350,
    "date": "2026-03-12T23:00:00.000Z",
    "category": "Électroménager"
  },
  {
    "id": "1781381264310rlikq7aqr",
    "projectId": "1781336161191yxe7htoso",
    "taskId": "1781378560379h9pkl5y0j",
    "name": "Planches meuble bac",
    "amount": 202,
    "date": "2025-08-29T22:00:00.000Z",
    "category": "Mobilier"
  },
  {
    "id": "1781381373161u1sz6tkij",
    "projectId": "1781336161191yxe7htoso",
    "taskId": "1781378560379h9pkl5y0j",
    "name": "Affleureuse",
    "amount": 79,
    "date": "2026-06-12T22:00:00.000Z",
    "category": "Outillage",
    "description": "Affleureuse AE850 Fartool"
  },
  {
    "id": "17813814220089xt6ln5sr",
    "projectId": "1781336161191yxe7htoso",
    "taskId": "1781378560379h9pkl5y0j",
    "name": "Tasseau bois",
    "amount": 48,
    "date": "2026-06-12T22:00:00.000Z",
    "category": "Mobilier"
  },
  {
    "id": "1781382222501e51qjlzmo",
    "projectId": "1781336161191yxe7htoso",
    "taskId": "1781381503716ibw1l34vx",
    "name": "Tubes et colliers",
    "amount": 50,
    "date": "2026-06-12T22:00:00.000Z",
    "category": "Matériaux"
  },
  {
    "id": "17813837167774j1ax0b15",
    "projectId": "178134208709197ly3y9pi",
    "taskId": "178138370591826omsyfog",
    "name": "Huile",
    "amount": 17,
    "date": "2026-06-12T22:00:00.000Z",
    "category": "Transport"
  },
  {
    "id": "1781384519753ymd8uqbo5",
    "projectId": "1781343806366wzfhmpjne",
    "taskId": "1781384331372tffl9c07n",
    "name": "Penderie Ikea",
    "amount": 345,
    "date": "2026-04-04T22:00:00.000Z",
    "category": "Mobilier"
  },
  {
    "id": "1781384622642fii7k98p0",
    "projectId": "1781343806366wzfhmpjne",
    "taskId": "1781384054270wlve6mevx",
    "name": "Double penderie Ikea",
    "amount": 825,
    "date": "2026-04-04T22:00:00.000Z",
    "category": "Mobilier"
  },
  {
    "id": "1781385180878bwsolhetm",
    "projectId": "1781343806366wzfhmpjne",
    "taskId": "1781385164409gpbndxdqx",
    "name": "Peinture sous couche",
    "amount": 115,
    "date": "2026-03-09T23:00:00.000Z",
    "category": "Matériaux"
  },
  {
    "id": "178138519770696ub4qv79",
    "projectId": "1781343806366wzfhmpjne",
    "taskId": "1781385164409gpbndxdqx",
    "name": "Peinture couleur",
    "amount": 100,
    "date": "2026-05-14T22:00:00.000Z",
    "category": "Matériaux"
  },
  {
    "id": "17813856944543hnrybxln",
    "projectId": "1781368433019a40b5dw3j",
    "taskId": "1781385680780vz4pm8va4",
    "name": "Calcaire",
    "amount": 10,
    "date": "2026-06-12T22:00:00.000Z",
    "category": "Matériaux"
  },
  {
    "id": "1781386416397aym87rr0n",
    "projectId": "1781336161191q2zfpbndi",
    "taskId": "1781377456251s56u6jyr0",
    "name": "Calcaire",
    "amount": 25,
    "date": "2026-06-12T22:00:00.000Z",
    "category": "Matériaux"
  },
  {
    "id": "1781393913900p7w6jmc7f",
    "projectId": "1781336161191yxe7htoso",
    "taskId": "1781392472275r19njq1dq",
    "name": "Étagère",
    "amount": 120,
    "date": "2026-03-13T23:00:00.000Z",
    "category": "Mobilier"
  },
  {
    "id": "1781393958534xqabxjmyx",
    "projectId": "1781336161191yxe7htoso",
    "taskId": "1781392472275r19njq1dq",
    "name": "Porte coulissante",
    "amount": 1,
    "date": "2026-03-13T23:00:00.000Z",
    "category": "Mobilier"
  },
  {
    "id": "1781425880833mbwl359fp",
    "projectId": "1781336161191yxe7htoso",
    "taskId": "1781378560379h9pkl5y0j",
    "name": "Bac Trofast",
    "amount": 184,
    "date": "2025-04-13T22:00:00.000Z",
    "category": "Mobilier"
  },
  {
    "id": "17814260446833mjtyygo0",
    "projectId": "1781368947223h7k8duc3e",
    "taskId": "1781383825842nujyown5z",
    "name": "Pneus Avant",
    "amount": 180,
    "date": "2026-06-11T22:00:00.000Z",
    "category": "Transport"
  },
  {
    "id": "1781441295110yr65clzi6",
    "projectId": "1781336161191yxe7htoso",
    "name": "Aspirateur",
    "amount": 200,
    "date": "2026-05-15T22:00:00.000Z",
    "category": "Électroménager",
    "description": "Karsher WD6PS V-30/8/35/T"
  },
  {
    "id": "17814420869944n276yb3b",
    "projectId": "1781336161191q2zfpbndi",
    "name": "Brouette",
    "amount": 100,
    "date": "2026-04-13T22:00:00.000Z",
    "category": "Outillage"
  },
  {
    "id": "1781442160265mfsl652jy",
    "projectId": "1781336161191q2zfpbndi",
    "taskId": "1781377551914rpc8uilkh",
    "name": "Poteaux bois",
    "amount": 234,
    "date": "2026-04-14T22:00:00.000Z",
    "category": "Matériaux"
  },
  {
    "id": "1781442207920wmlubsjor",
    "projectId": "1781336161191q2zfpbndi",
    "taskId": "1781377551914rpc8uilkh",
    "name": "Structure métallique + piquets",
    "amount": 240,
    "date": "2026-04-13T22:00:00.000Z",
    "category": "Matériaux"
  },
  {
    "id": "1781442277283d09mil099",
    "projectId": "1781336161191q2zfpbndi",
    "taskId": "17813782538620e39p7mdc",
    "name": "Câble + Prises + Gaine",
    "amount": 70,
    "date": "2026-03-13T23:00:00.000Z",
    "category": "Matériaux"
  },
  {
    "id": "1781443429098vmy5jnbn9",
    "projectId": "1781336161191yxe7htoso",
    "taskId": "1781381503716ibw1l34vx",
    "name": "Lave vaisselle",
    "amount": 465,
    "date": "2025-09-09T22:00:00.000Z",
    "category": "Électroménager",
    "description": "Whirpool WSFO3T223P"
  },
  {
    "id": "1781459935548t98dzahf8",
    "projectId": "1781459849044dp48j62m1",
    "taskId": "1781459917548uyr5f9d8y",
    "name": "Penderie Anna",
    "amount": 250,
    "date": "2026-04-17T22:00:00.000Z",
    "category": "Mobilier"
  },
  {
    "id": "1781460885254ymfqjtrqy",
    "projectId": "17814606950269dmx3xwp9",
    "taskId": "1781460779025qizv2vzo5",
    "name": "Disqueuse Makita",
    "amount": 250,
    "date": "2025-03-19T23:00:00.000Z",
    "category": "Outillage",
    "description": "Makita GA9040SKD1 2600w Ø230"
  },
  {
    "id": "17814611795111r5aiguq7",
    "projectId": "1781461079383453gi536l",
    "taskId": "1781461127296c5g6qksj4",
    "name": "Pelle carré",
    "amount": 42,
    "date": "2023-03-06T23:00:00.000Z",
    "category": "Outillage"
  },
  {
    "id": "1781461206516f386hxro8",
    "projectId": "1781461079383453gi536l",
    "taskId": "1781461127296c5g6qksj4",
    "name": "Fourche",
    "amount": 47,
    "date": "2023-03-06T23:00:00.000Z",
    "category": "Outillage"
  },
  {
    "id": "1781461271019ad83siw9e",
    "projectId": "1781461079383453gi536l",
    "taskId": "1781461127296c5g6qksj4",
    "name": "Marteau coffreur",
    "amount": 30,
    "date": "2026-03-06T23:00:00.000Z",
    "category": "Outillage"
  },
  {
    "id": "1781461303241mxo1m1tnw",
    "projectId": "1781461079383453gi536l",
    "taskId": "1781461127296c5g6qksj4",
    "name": "Pioche",
    "amount": 65,
    "date": "2023-03-06T23:00:00.000Z",
    "category": "Outillage"
  },
  {
    "id": "17814625118972iyskbaza",
    "projectId": "1781461079383453gi536l",
    "taskId": "1781461127296c5g6qksj4",
    "name": "Barre à mine",
    "amount": 36,
    "date": "2023-03-06T23:00:00.000Z",
    "category": "Outillage"
  },
  {
    "id": "17814626598778aqazroh1",
    "projectId": "1781461079383453gi536l",
    "taskId": "1781462603710159hcr43i",
    "name": "Souffleur BG56",
    "amount": 250,
    "date": "2025-01-09T23:00:00.000Z",
    "category": "Outillage"
  },
  {
    "id": "1781462691542o1d0ht02f",
    "projectId": "1781461079383453gi536l",
    "taskId": "1781462603710159hcr43i",
    "name": "Débroussailleuse fs131",
    "amount": 800,
    "date": "2022-03-14T23:00:00.000Z",
    "category": "Outillage"
  },
  {
    "id": "1781462709885ar5irt7un",
    "projectId": "1781461079383453gi536l",
    "taskId": "1781462603710159hcr43i",
    "name": "Tondeuse débroussailleuse",
    "amount": 500,
    "date": "2022-01-13T23:00:00.000Z",
    "category": "Outillage"
  },
  {
    "id": "178146272910732k9sq808",
    "projectId": "1781461079383453gi536l",
    "taskId": "1781462603710159hcr43i",
    "name": "Tarriere",
    "amount": 200,
    "date": "2025-03-13T23:00:00.000Z",
    "category": "Outillage",
    "description": "Chez volt"
  },
  {
    "id": "1781462817898fno3dp5cq",
    "projectId": "1781461079383453gi536l",
    "taskId": "1781462603710159hcr43i",
    "name": "Élagueuse ms194t",
    "amount": 300,
    "date": "2022-06-13T22:00:00.000Z",
    "category": "Outillage",
    "description": "Chez Cédric"
  }
];

export const SEED_CATEGORIES: Category[] = [
  {
    "id": "cat_garage",
    "name": "Garage"
  },
  {
    "id": "cat_maison",
    "name": "Maison"
  },
  {
    "id": "cat_jardin",
    "name": "Jardin"
  },
  {
    "id": "cat_vehicule",
    "name": "Véhicule"
  },
  {
    "id": "cat_admin",
    "name": "Administratif"
  },
  {
    "id": "cat_perso",
    "name": "Personnel"
  },
  {
    "id": "1781386273132c83ju2tuf",
    "name": "Chiens"
  }
];

export const SEED_EXPENSE_CATEGORIES: Category[] = [
  {
    "id": "ecat_outillage",
    "name": "Outillage"
  },
  {
    "id": "ecat_electromenager",
    "name": "Électroménager"
  },
  {
    "id": "ecat_mobilier",
    "name": "Mobilier"
  },
  {
    "id": "ecat_materiaux",
    "name": "Matériaux"
  },
  {
    "id": "ecat_transport",
    "name": "Transport"
  },
  {
    "id": "ecat_divers",
    "name": "Divers"
  },
  {
    "id": "1781458989596nquqw0god",
    "name": "Chiens"
  }
];

export const SEED_APPOINTMENTS: Appointment[] = [
  {
    "id": "1781382270163sww8vdrtv",
    "title": "Puéricultrice",
    "description": "",
    "location": "Mairie Montguyon",
    "date": "2026-06-22T22:00:00.000Z",
    "time": "16:30",
    "category": "Rendez-vous",
    "createdAt": "2026-06-13T20:24:30.163Z"
  },
  {
    "id": "1781382378839wlc5dlptl",
    "title": "Médecin Anna",
    "description": "",
    "location": "Cabinet Pettes",
    "date": "2026-07-29T22:00:00.000Z",
    "time": "16:00",
    "category": "Rendez-vous",
    "createdAt": "2026-06-13T20:26:18.839Z"
  },
  {
    "id": "1781423714542ohw0r8qfd",
    "title": "Bank w/ mom",
    "description": "",
    "location": "",
    "date": "2026-06-26T22:00:00.000Z",
    "time": "",
    "category": "Rendez-vous",
    "createdAt": "2026-06-14T07:55:14.543Z"
  }
];

// Raw AsyncStorage strings for non-AppContext data
export const SEED_BANK_TRANSACTIONS = "[{\"type\":\"expense\",\"amount\":384,\"label\":\"Rbt Maman\",\"category\":\"Transport\",\"date\":\"2026-07-03T22:00:00.000Z\",\"id\":\"mr6izbrlc97ewgfky\"},{\"type\":\"expense\",\"amount\":53,\"label\":\"Tabac\",\"category\":\"Autre\",\"date\":\"2026-07-01T22:00:00.000Z\",\"id\":\"mr6iynl0w1e727iju\"},{\"type\":\"expense\",\"amount\":52.59,\"label\":\"Replit\",\"category\":\"Mat\u00e9riaux / Projet\",\"date\":\"2026-07-03T22:00:00.000Z\",\"note\":\"Yoann v30 \u00b7 Yoann 2.0\",\"id\":\"mr6iucmtjnlaqwi2h\"},{\"type\":\"expense\",\"amount\":30,\"label\":\"Caf\u00e9 Boulot\",\"category\":\"Restauration\",\"date\":\"2026-01-31T23:00:00.000Z\",\"id\":\"mr6in40kvrng6jhly\"},{\"type\":\"income\",\"amount\":2217,\"label\":\"Salaire F\u00e9vrier\",\"category\":\"Salaire\",\"date\":\"2026-03-05T23:00:00.000Z\",\"id\":\"mr6im7gi20f5i2std\"},{\"type\":\"expense\",\"amount\":12.14,\"label\":\"Spotify\",\"category\":\"Abonnements\",\"date\":\"2026-03-10T23:00:00.000Z\",\"id\":\"mr6ijonb1cpympwcp\"},{\"type\":\"income\",\"amount\":1831,\"label\":\"CPAM Arr\u00eat de travail / Cong\u00e9 pat\",\"category\":\"Salaire\",\"date\":\"2026-04-25T22:00:00.000Z\",\"id\":\"mr6ij3ibwauhz6icr\"},{\"type\":\"income\",\"amount\":100,\"label\":\"Vente attelage Dacia\",\"category\":\"Autre revenu\",\"date\":\"2026-03-26T23:00:00.000Z\",\"id\":\"mr6iib5fgyoqq58p5\"},{\"type\":\"expense\",\"amount\":333,\"label\":\"Rbt Moto maman\",\"category\":\"Transport\",\"date\":\"2026-03-28T23:00:00.000Z\",\"id\":\"mr6ig5xr3bez0t8m5\"},{\"type\":\"expense\",\"amount\":666,\"label\":\"Rbt Moto maman\",\"category\":\"Transport\",\"date\":\"2026-04-06T22:00:00.000Z\",\"id\":\"mr6ifpputcjtol1k0\"},{\"type\":\"income\",\"amount\":859,\"label\":\"CPAM Cong\u00e9 pat\",\"category\":\"Salaire\",\"date\":\"2026-04-06T22:00:00.000Z\",\"id\":\"mr6ie51nptrgy1noz\"},{\"type\":\"expense\",\"amount\":12.14,\"label\":\"Spotify\",\"category\":\"Abonnements\",\"date\":\"2026-04-12T22:00:00.000Z\",\"id\":\"mr6idhd3w7b5lt4b9\"},{\"type\":\"expense\",\"amount\":10,\"label\":\"Caf\u00e9 Boulot\",\"category\":\"Restauration\",\"date\":\"2026-04-19T22:00:00.000Z\",\"id\":\"mr6i97oxjs993twa0\"},{\"type\":\"expense\",\"amount\":38,\"label\":\"Mini Courses\",\"category\":\"Alimentation\",\"date\":\"2026-04-23T22:00:00.000Z\",\"id\":\"mr6i8o4jj7h7tslv8\"},{\"type\":\"expense\",\"amount\":18,\"label\":\"Sandwich Boulot\",\"category\":\"Alimentation\",\"date\":\"2026-04-27T22:00:00.000Z\",\"id\":\"mr6i7wa4x9ymdk33d\"},{\"type\":\"expense\",\"amount\":118,\"label\":\"Zalando - Cale\u00e7ons / Short\",\"category\":\"V\u00eatements\",\"date\":\"2026-04-28T22:00:00.000Z\",\"id\":\"mr6i745mhyi7ve7cb\"},{\"type\":\"expense\",\"amount\":10,\"label\":\"Caf\u00e9 Boulot\",\"category\":\"Restauration\",\"date\":\"2026-04-28T22:00:00.000Z\",\"id\":\"mr6i65oepfergdeyl\"},{\"type\":\"expense\",\"amount\":5,\"label\":\"Caf\u00e9 Boulot\",\"category\":\"Restauration\",\"date\":\"2026-05-03T22:00:00.000Z\",\"id\":\"mr6i5tsk86d7bwxdu\"},{\"type\":\"income\",\"amount\":350,\"label\":\"CPAM Cong\u00e9 Paternit\u00e9 Avril\",\"category\":\"Salaire\",\"date\":\"2026-05-04T22:00:00.000Z\",\"id\":\"mr6i4kmngcwsijuom\"},{\"type\":\"expense\",\"amount\":326,\"label\":\"T\u00e9l\u00e9phone 1/3\",\"category\":\"Autre\",\"date\":\"2026-05-06T22:00:00.000Z\",\"id\":\"mr6i2k50c66s123es\"},{\"type\":\"expense\",\"amount\":34,\"label\":\"Pizza La Roche-Chalais\",\"category\":\"Alimentation\",\"date\":\"2026-05-10T22:00:00.000Z\",\"id\":\"mr6i1qfhufjp533z1\"},{\"type\":\"expense\",\"amount\":13,\"label\":\"Sandwich Travail\",\"category\":\"Alimentation\",\"date\":\"2026-05-12T22:00:00.000Z\",\"id\":\"mr6i0z2k403j9hzqo\"},{\"type\":\"expense\",\"amount\":27.1,\"label\":\"Tabac\",\"category\":\"Autre\",\"date\":\"2026-06-17T22:00:00.000Z\",\"id\":\"mr6hz8c0hk7rhctlv\"},{\"type\":\"expense\",\"amount\":25.1,\"label\":\"Tabac\",\"category\":\"Autre\",\"date\":\"2026-06-21T22:00:00.000Z\",\"id\":\"mr6hylldqodme96fl\"},{\"type\":\"expense\",\"amount\":306,\"label\":\"T\u00e9l\u00e9phone 2/3\",\"category\":\"Autre\",\"date\":\"2026-06-07T22:00:00.000Z\",\"id\":\"mr6hxhhx2n2xcvruv\"},{\"type\":\"income\",\"amount\":60,\"label\":\"Rbt Zalando\",\"category\":\"Remboursement\",\"date\":\"2026-06-07T22:00:00.000Z\",\"id\":\"mr6hwitb5ocb0ed1x\"},{\"type\":\"expense\",\"amount\":12.14,\"label\":\"Spotify\",\"category\":\"Abonnements\",\"date\":\"2026-06-10T22:00:00.000Z\",\"id\":\"mr6hub9v8buwslzun\"},{\"type\":\"income\",\"amount\":100,\"label\":\"Aide carburant\",\"category\":\"Autre revenu\",\"date\":\"2026-06-16T22:00:00.000Z\",\"id\":\"mr6htgjsf7m992j76\"},{\"type\":\"transfer_to_savings\",\"amount\":30,\"label\":\"OUVERTURE Compte \u00c9pargne\",\"category\":\"\u00c9pargne\",\"date\":\"2026-06-18T22:00:00.000Z\",\"id\":\"mr6hs5nhnskidy5vw\"},{\"type\":\"income\",\"amount\":1061,\"label\":\"Salaire Mars\",\"category\":\"Autre revenu\",\"date\":\"2026-04-06T22:00:00.000Z\",\"id\":\"mr6he11f5as0kmmy6\"},{\"type\":\"income\",\"amount\":1611,\"label\":\"Salaire Avril\",\"category\":\"Salaire\",\"date\":\"2026-05-05T22:00:00.000Z\",\"id\":\"mr6hcqnllfrcgx5iu\"},{\"type\":\"income\",\"amount\":1878,\"label\":\"Salaire Mai 2026\",\"category\":\"Salaire\",\"date\":\"2026-06-07T22:00:00.000Z\",\"id\":\"mr6hc1rj9l9e1rud5\"}]";
export const SEED_BANK_SAVINGS = "30";
export const SEED_BANK_RECURRING = "[{\"direction\":\"to\",\"amount\":420,\"label\":\"Virement vers \u00e9pargne\",\"frequency\":\"monthly\",\"nextDate\":\"2026-07-11T14:34:00.000Z\",\"id\":\"mr6gs8ptetoi9weid\",\"createdAt\":\"2026-07-04T14:35:21.761Z\"}]";
export const SEED_NAV_SHORTCUTS = "[{\"id\":\"mr5go01ezkvc0\",\"name\":\"Travail\",\"address\":\"Bertranneau, 17270 Cercoux\",\"lat\":45.1442128,\"lng\":-0.2209876,\"icon\":\"work\"},{\"id\":\"mr5gozotxudhw\",\"name\":\"Maison\",\"address\":\"3 all\u00e9e gambetta, 17360 Saint-Aigulin\",\"lat\":45.1562055,\"lng\":-0.013817699999999999,\"icon\":\"home\"}]";
export const SEED_PLACE_CATEGORIES = "[{\"id\":\"home\",\"name\":\"Maison\",\"icon\":\"home\",\"color\":\"#FFC107\",\"isSystem\":true},{\"id\":\"shops\",\"name\":\"Magasins\",\"icon\":\"shopping\",\"color\":\"#4CAF50\",\"isSystem\":true},{\"id\":\"walks\",\"name\":\"Spots balades\",\"icon\":\"tree\",\"color\":\"#8BC34A\",\"isSystem\":true},{\"id\":\"people\",\"name\":\"Humano\u00efdes\",\"icon\":\"account-group\",\"color\":\"#9C27B0\",\"isSystem\":true},{\"id\":\"services\",\"name\":\"Services\",\"icon\":\"gas-station\",\"color\":\"#2196F3\",\"isSystem\":true},{\"id\":\"cat_1783158466965\",\"name\":\"Autre\",\"icon\":\"star\",\"color\":\"#FFC107\"}]";
export const SEED_KNOWN_PLACES = "[{\"id\":\"1783158397516\",\"name\":\"Maison\",\"categoryId\":\"home\",\"lat\":45.1562986,\"lng\":-0.0134749,\"radiusM\":100,\"address\":\"3 all\u00e9e gambetta, 17360 Saint-Aigulin\",\"createdAt\":1783158397516},{\"id\":\"1783158487122\",\"name\":\"Travail\",\"categoryId\":\"cat_1783158466965\",\"lat\":45.1436216,\"lng\":-0.2234388,\"radiusM\":200,\"address\":\"Bertranneau 17270 Cercoux\",\"createdAt\":1783158487122},{\"id\":\"1783175865742\",\"name\":\"\ud83c\udfe0 Maman\",\"categoryId\":\"people\",\"lat\":45.1498713,\"lng\":0.0286514,\"radiusM\":200,\"address\":\"123 chemin des gardes 24490 La Roche-Chalais\",\"createdAt\":1783175865742},{\"id\":\"1783176030148\",\"name\":\"\u00c9tang des belettes\",\"categoryId\":\"walks\",\"lat\":45.24270526730783,\"lng\":-0.018382184207439426,\"radiusM\":250,\"address\":\"\u00c9tang des belettes, 16210 Rioux-Martin\",\"createdAt\":1783176030148},{\"id\":\"1783176083337\",\"name\":\"Lac des Nauves\",\"categoryId\":\"walks\",\"lat\":45.05530964301243,\"lng\":-0.10037026926966065,\"radiusM\":200,\"address\":\"Lac des nauves, coutras\",\"createdAt\":1783176083337},{\"id\":\"1783176167337\",\"name\":\"Bricomarch\u00e9 Coutras\",\"categoryId\":\"shops\",\"lat\":45.04857403538994,\"lng\":-0.12327096425224228,\"radiusM\":50,\"address\":\"Bricomarch\u00e9 Coutras\",\"createdAt\":1783176167337},{\"id\":\"1783176200151\",\"name\":\"Bricomarch\u00e9 Chalais\",\"categoryId\":\"shops\",\"lat\":45.27287490622608,\"lng\":0.043415576219558716,\"radiusM\":50,\"address\":\"Bricomarch\u00e9 chalais\",\"createdAt\":1783176200151},{\"id\":\"1783176253266\",\"name\":\"Brico D\u00e9pot Bordeaux\",\"categoryId\":\"shops\",\"lat\":44.8695698,\"lng\":-0.4936083,\"radiusM\":500,\"address\":\"Brico D\u00e9p\u00f4t, Avenue du Peyrou, Le Clos de Lalanne, Moulinat, Artigues-pr\u00e8s-Bordeaux, Bordeaux, Gironde, Nouvelle-Aquitaine, France m\u00e9tropolitaine, 33370, France\",\"createdAt\":1783176253266},{\"id\":\"1783176280174\",\"name\":\"Ikea Bordeaux\",\"categoryId\":\"shops\",\"lat\":44.88457973894595,\"lng\":-0.5644418857991697,\"radiusM\":500,\"address\":\"Ikea Bordeaux\",\"createdAt\":1783176280174},{\"id\":\"1783176438895\",\"name\":\"\ud83c\udfe0Mamie\",\"categoryId\":\"people\",\"lat\":46.15717111374718,\"lng\":-1.1219435557723048,\"radiusM\":200,\"address\":\"Petit Marseille, Villeneuve les salines, 17000 La Rochelle\",\"createdAt\":1783176438895}]";
export const SEED_TRIPS = "[{\"id\":\"mr5gmfqyeta0\",\"startTime\":1783002600000,\"endTime\":1783004400000,\"distanceKm\":20.4,\"vehicle\":\"car\",\"pointCount\":2,\"startLat\":45.1562986,\"startLon\":-0.0134749,\"endLat\":45.1436216,\"endLon\":-0.2234388,\"source\":\"manual\",\"startAddress\":\"Maison\",\"endAddress\":\"Travail\",\"route\":[{\"lat\":45.1562986,\"lng\":-0.0134749},{\"lat\":45.15685834305665,\"lng\":-0.012723162908514498},{\"lat\":45.15768342294585,\"lng\":-0.0142805205177865},{\"lat\":45.15881662568982,\"lng\":-0.013628926099045204},{\"lat\":45.16078913672447,\"lng\":-0.020925715616613168},{\"lat\":45.16778424055011,\"lng\":-0.04500014325458324},{\"lat\":45.177058282904035,\"lng\":-0.08288516066386367},{\"lat\":45.17315229493488,\"lng\":-0.09777139875950525},{\"lat\":45.17392207195491,\"lng\":-0.10769676424388311},{\"lat\":45.17191377317681,\"lng\":-0.1098061130687711},{\"lat\":45.17059273711422,\"lng\":-0.11312514601740987},{\"lat\":45.16875212340187,\"lng\":-0.1162071005182952},{\"lat\":45.16775317868524,\"lng\":-0.11675379893858917},{\"lat\":45.16445082819464,\"lng\":-0.12049575120727242},{\"lat\":45.16211209620409,\"lng\":-0.12641825509490445},{\"lat\":45.159949267658654,\"lng\":-0.12921045727125605},{\"lat\":45.156566180488205,\"lng\":-0.12983200715098064},{\"lat\":45.15299738664618,\"lng\":-0.13146270084689607},{\"lat\":45.15126718314976,\"lng\":-0.1308187398535665},{\"lat\":45.14983469056009,\"lng\":-0.12887927878182384},{\"lat\":45.148267088850815,\"lng\":-0.13280811155709674},{\"lat\":45.14605040538843,\"lng\":-0.13470887410221621},{\"lat\":45.14569575422762,\"lng\":-0.13614217954454944},{\"lat\":45.14430701111344,\"lng\":-0.13761166484982826},{\"lat\":45.143361766560034,\"lng\":-0.14116776175796988},{\"lat\":45.14377610180264,\"lng\":-0.14297040528617802},{\"lat\":45.14332140982429,\"lng\":-0.14531835906382187},{\"lat\":45.143030833859974,\"lng\":-0.15663489684811796},{\"lat\":45.14331165976661,\"lng\":-0.15870320021349474},{\"lat\":45.14254984975288,\"lng\":-0.1607674435945228},{\"lat\":45.14317288179725,\"lng\":-0.16427005823061339},{\"lat\":45.141794396304455,\"lng\":-0.16425109646661443},{\"lat\":45.140864281112435,\"lng\":-0.16500889516464667},{\"lat\":45.14397673866865,\"lng\":-0.16945283125096466},{\"lat\":45.14527676666814,\"lng\":-0.17231656674994156},{\"lat\":45.145509618902096,\"lng\":-0.17567171145856264},{\"lat\":45.14919235815532,\"lng\":-0.183113036910072},{\"lat\":45.14619958812802,\"lng\":-0.19441726835793818},{\"lat\":45.14482734938046,\"lng\":-0.2036485968710622},{\"lat\":45.141707046005116,\"lng\":-0.21134454276761974},{\"lat\":45.14537381923002,\"lng\":-0.21672734597814272},{\"lat\":45.1436216,\"lng\":-0.2234388}],\"endPlaceId\":\"1783158487122\",\"startPlaceId\":\"1783158397516\"}]";
