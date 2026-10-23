# Granola setup and acceptance

## Create the credential in Granola

Granola keys are created in the desktop app. Its official documented path is **Settings → Connectors → API keys → Create new key**; select the permitted note scopes, generate and copy the key. There is no verified public web creation URL for this flow. The connector shows this exception beside the credential field and links [official key instructions](https://docs.granola.ai/help-center/sharing/integrations/granola-api).

## Quick start in your instance

1. In the Granola desktop app, open **Settings → Connectors → API keys**, create a key and choose the note-access scopes you intend to import. Eligible plan/admin policies still apply. Follow [Granola's official key setup](https://docs.granola.ai/help-center/sharing/integrations/granola-api).
2. On your deployment's `/app`, select Granola. Enter a connection name, the key, and a stable source account/workspace identifier; keep that identifier unchanged for this account. The webhook secret is optional.
3. Choose **Verify and continue →**, discover and select one folder, then follow the [preview/destination/enable walkthrough](https://connectors.my.fulcra.ai/guide#use). Verify one meeting and a later update in Fulcra before expanding scope.

Use a deployment-specific API key from an eligible Business/Enterprise account with access to the selected folders. Configure a stable account label/ID; changing that identity intentionally creates a different import namespace. Discover folders through the protected resource picker, select stable IDs and a bounded backfill start. No attachments or private notes are imported by default.

Polling uses `updated_after` with two-minute overlap and one note per bounded page. Revisions use content plus source update identity. Large transcripts emit separate paginated transcript artifacts; the meeting record labels them paginated rather than presenting the last chunk as complete. Pending transcripts retain their originating selected folder for recheck (maximum backlog100; exceeding the bound requires operator attention). Folder membership is checked again after hydration; exact selected folders and direct child memberships are accepted. Deeper descendants require explicit selection.

Optional webhooks use the Granola signing secret with timestamp/replay verification; they only schedule polling through the same source selection. Polling remains the correctness path. A webhook cannot grant source access or choose a Fulcra destination.

Verified: synthetic fixtures cover update overlap, selected-folder exclusion, large transcript continuation, delayed availability, revoked key and signature/replay/tamper. **Live account/change/readback must be verified on your own deployment**.

Current sources: [list notes](https://docs.granola.ai/api-reference/list-notes), [get note](https://docs.granola.ai/api-reference/get-note), [paged transcript](https://docs.granola.ai/api-reference/get-transcript), [webhook signatures](https://docs.granola.ai/webhooks).
