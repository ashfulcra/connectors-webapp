# Asana setup and acceptance

## Create or manage the credential

[Open the Asana token console](https://app.asana.com/0/my-apps). Sign in, choose Create new token, name it and copy the PAT. The workspace GID is still a separate required form input. The connector shows this action directly next to credential entry and in saved settings, separately from official help.

## Quick start in your instance

1. Follow [Asana's official quick start](https://developers.asana.com/docs/quick-start): create a personal token in the developer console, and obtain your workspace GID from the workspaces endpoint while signed in. A PAT follows its user's permissions; the connector itself performs read requests only.
2. On your deployment's `/app`, select Asana. Enter connection name, token and **Workspace ID** (the GID, not workspace name), then **Verify and continue →**.
3. Discover/select one project, then follow the [preview/destination/enable walkthrough](https://connectors.my.fulcra.ai/guide#use). Verify an imported task and a harmless task update before expanding scope.

Use a deployment-owned PAT or read-only OAuth token with user identity, selected-project discovery and task read access. A workspace ID is needed for project discovery. Only explicitly selected project IDs are read. The connector never changes Asana tasks.

The initial events request establishes a sync token **before** snapshot enumeration. Snapshots persist offsets; after enumeration the saved event token closes the change gap. Event batches hydrate at most five tasks per invocation and retain the remaining queue. Removed membership, deleted task and inaccessible task are separate imported statuses; none automatically purges Fulcra history. A 412 on an existing token requests bounded reconciliation. Daily snapshot reconciliation limits drift.

Verified with fixtures: bootstrap ordering, paginated snapshot, expired-token reconciliation, changed-task hydration and removal/deletion distinctions. Common immutable revision IDs deduplicate unchanged snapshots. **Live project/change/readback and real token reset are unverified**.

Sources: [events and 412 token behavior](https://developers.asana.com/reference/getevents), [project task pagination](https://developers.asana.com/reference/gettasksforproject), [task fields and permissions](https://developers.asana.com/reference/gettask).
