# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

- **Stockage Yoann2.0 (app mobile)** : le dossier `Yoann2.0` du téléphone est la source de vérité. Il contient `Photos/` (Catégorie/Projet/Tâche/Sous-tâche et `Trajets/AAAA-MM/…`, masqué de la galerie par `.nomedia`), `Catalogue/` (deux emplacements alternés A/B), `Sauvegardes/` (7 jours, 4 semaines, 12 mois), `Journal/` et `Corbeille/` (vidée après 30 jours). Code : `artifacts/yoann2/utils/library/` et `utils/backup.ts`.
- Les données référencent les photos par `y2p:<id>` ; l'id est aussi dans le nom du fichier, ce qui permet de retrouver une photo déplacée à la main. Les sauvegardes ne contiennent aucun lien propre au téléphone.
- Le bilan hebdomadaire ne fait que constater et corriger le catalogue ; ranger, mettre à la corbeille et retirer les anciens liens demandent toujours une confirmation.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

- **Appareil cible** : Samsung Galaxy S25 Ultra (Android, One UI 7) — optimiser pour grand écran Android, pas d'iOS.
- **Usage** : application strictement personnelle — pas d'onboarding multi-utilisateur, pas de soumission App Store, pas de contraintes d'accessibilité publique.
- **Liquid glass / NativeTabs iOS** : non pertinent, l'app est Android uniquement.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
