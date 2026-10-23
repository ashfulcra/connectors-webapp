# Slack setup and acceptance

## Create or manage the credential

[Open Slack app and token settings](https://api.slack.com/apps). Create or choose your app, open OAuth & Permissions, add the listed read scopes and install/reinstall it to the workspace. Copy the appropriate bot/user OAuth token, not an app-level or configuration token. The connector shows this action directly next to credential entry and in saved settings, separately from official help.

## Quick start in your instance

1. Create/install your own Slack app with suitable read scopes for the selected channels. Follow [Slack's token guide](https://docs.slack.dev/authentication/tokens/) and the history/replies method links below to choose the correct token/scopes. App-level/configuration tokens are not interchangeable with a channel-reading bot/user token. Complete any required workspace approval.
2. On your deployment's `/app`, select Slack. Enter the connection name and read token, plus the signing secret if using signed events. Choose **Verify and continue →**.
3. Select one discovered channel, then follow the [preview/destination/enable walkthrough](https://connectors.my.fulcra.ai/guide#use). Verify a new message and thread. Old edit/delete guarantees require properly configured signed events; without them this is a recent-history polling example. The current form does not implement generic Slack OAuth token rotation; replace expiring/revoked pilot credentials through the protected form.

Create a deployment-owned Slack app/token with read access to selected member channels. Use the required public/private channel history and discovery scopes; public/private channel thread retrieval may require a user token with suitable history scopes. No message-send scopes are needed. Enroll the app signing secret separately if using Events API hints. Slack app distribution/tier affects history/replies limits; the example uses15 messages per page and honors Retry-After.

Select channel IDs explicitly. Exact decimal timestamp strings remain source identities; history and thread cursors are independent and durable. Source timestamp arithmetic uses integer microseconds. Thread content is normalized per message with optional Markdown artifacts. Large backfills can create thread backlog; the bounded500-thread queue requires reducing the selection/window if exceeded.

**Polling-only limitation:** old message edits/deletes and replies to old roots outside the overlap window are not guaranteed discoverable through recent history. Signed selected-channel events trigger exact-message hydration, old thread checks or retained deletion markers. Events cannot select a new channel or destination. Timestamp signature verification and durable event-ID dedupe reject replay; hints are acknowledged only with durable checkpoint advancement. No files are downloaded by this message/thread example.

Verified: fixture history/thread cursors, exact timestamps, old edit hydration, selected-channel exclusion, 429 and signature/replay; real PostgreSQL webhook dedupe/ack. **Live channel/new-message/edit/readback remains unverified**.

Sources: [history](https://docs.slack.dev/reference/methods/conversations.history/), [threads](https://docs.slack.dev/reference/methods/conversations.replies/), [request verification](https://docs.slack.dev/authentication/verifying-requests-from-slack/).
