# Hosting and storage

Fulcra holds imported records and files. Native Workflow persistence holds encrypted operational state, cursors, grants, pending deliveries and schedules. Both are provisioned through this app's Fulcra deployment flow. There is no embedded filesystem database and no separate user database/cron account on the default path.

Follow [setup](setup.md). The deploy command verifies ownership, retains rollback metadata, checks the Node 24/Svelte runtime, initializes a first controller and pins its identity. It never copies another deployment's state.

## Boundaries

- One verified owner and independent keys/state per deployment.
- Native controller serializes commands and worker phases; source/destination side effects remain separate persisted steps.
- Imported content is in Fulcra; encrypted operational histories follow platform retention.
- Native state supports bounded workloads; see [architecture](design.md). A failed or missing controller requires recovery, not a new empty instance.
- Epochs carry state to the latest deployment after 500 transitions. Preserve state compatibility during upgrades.

Queue callback security relies on Vercel's managed edge isolation. Do not expose generated callbacks directly on a self-hosted server without equivalent authentication. PostgreSQL is available for an explicitly configured independent worker; its leases/cron require their own deployment tests.

Primary references: [Workflow managed World](https://workflow-sdk.dev/worlds/vercel), [Svelte integration](https://workflow-sdk.dev/docs/getting-started/sveltekit), [retention](https://vercel.com/docs/workflows/retention).
