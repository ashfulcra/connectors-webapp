# GitHub setup and acceptance

## Create or manage the credential

[Create a fine-grained GitHub token](https://github.com/settings/personal-access-tokens/new?name=Fulcra%20Connectors&metadata=read&issues=read&pull_requests=read). Choose the resource owner, Only select repositories, the repositories to sync and an expiration. Read-only Metadata, Issues and Pull requests are prefilled. For the App alternative, [create a GitHub App](https://github.com/settings/apps/new) or [manage existing Apps](https://github.com/settings/apps), install it on selected repositories and generate a private key in its settings. The connector shows this action directly next to credential entry and in saved settings, separately from official help.

## Quick start in your instance

1. For the token pilot, follow [GitHub's fine-grained token instructions](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens). Choose the intended owner/repositories, expiration, and read permissions for metadata, issues and pull requests. Organization approval may be required. Use your own token, not the assistant's session.
2. On your deployment's `/app`, select GitHub and **Read-only fine-grained token**. Enter the token and name. Alternatively select **GitHub App installation** and supply your own App ID, Installation ID and private key. Webhook secret is optional.
3. Choose **Verify and continue →**, select one discovered repository, then follow the [preview/destination/enable walkthrough](https://connectors.my.fulcra.ai/guide#use). Verify an issue or PR and an issue-comment update. Do not expect review comments or repository files.

Choose a read-only fine-grained PAT pilot, or your own GitHub App installation. Request repository metadata, issues and pull requests read access on selected repositories. For an App, enroll the App ID, installation ID and private key through the protected credential form. These stay encrypted server-side. App installation tokens are regenerated under a database lock before expiry. Never copy an assistant/CLI token into the deployed app.

Select `owner/repository` IDs explicitly. Poll issue/PR snapshots and repository issue comments independently, with update overlap and validated same-repository Link pagination. The REST version is pinned to `2026-03-10`. Primary/secondary rate-limit response headers schedule retries. This first example covers issue/PR metadata and issue comments; it does not claim review comments, repository files or every deletion can be discovered through polling.

Optional SHA256-signed webhooks only schedule a selected-source poll. GitHub does not supply a signed delivery timestamp; durable delivery-ID dedupe protects repeated delivery. Polling cannot infer every historical deletion and retains existing imported history.

Verified: fixture pagination, repo boundary, issue/PR distinction, independent edited comments, secondary rate limits, signature/tamper; actual PostgreSQL concurrent installation-renewal test proves one exchange for three callers. A selected-source PAT import and later revision have been read back as v1 records and file bytes on one owner deployment. Verify your own sources and any App-installation/refresh path separately.

Sources: [issue behavior](https://docs.github.com/en/rest/issues/issues), [repository comments](https://docs.github.com/en/rest/issues/comments), [installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app).
