# Notion setup and acceptance

## Create or manage the credential

[Open the Notion connection console](https://www.notion.so/profile/integrations). Create an internal connection for the intended workspace, choose Read content and copy the token from Configuration. A workspace owner must create it. Grant the selected root page through Content access or its Connections menu. The connector shows this action directly next to credential entry and in saved settings, separately from official help.

## Quick start in your instance

1. Follow [Notion's internal connection setup](https://www.notion.com/help/create-integrations-with-the-notion-api). Use read-content capability and obtain the internal connection token. Explicitly connect the integration to the root page you want to import; a token alone does not grant all page access.
2. On your deployment's `/app`, select Notion. Enter the connection name and token, then **Verify and continue →**.
3. Discover/select one small shared root page and follow the [preview/destination/enable walkthrough](https://connectors.my.fulcra.ai/guide#use). Check the completed document in Fulcra, then change a nested text block and verify the next revision. This example does not expand database rows or comments.

Create a read-capable integration and explicitly connect it to selected root pages. Enroll its token in this deployment, discover shared pages, and select stable page IDs. The API version is pinned to `2026-03-11`.

Search supplies the picker only. Collection retrieves page properties and follows children from each selected root using a persisted breadth-first frontier and pagination cursors. A complete document is emitted only once the frontier is empty. Blocks retain parent relationships; Markdown renders supported text structures and visible unsupported-block markers. External file links are retained as links, not silently downloaded. Root scans are repeated so changes in old nested blocks can be detected even when the root timestamp does not change. Imported revision IDs also include canonical content.

Each selected root is bounded to 5, 000 blocks/2MB of persisted traversal state; select smaller roots when that bound is reached. Databases/data-source rows and comments are not expanded by this page/block example. Removed access becomes an explicit retained status rather than deleting Fulcra copies.

Verified: fixture nested/paginated frontier, version header, unsupported block visibility, complete-document gating, selected-root boundary and access loss. **Live shared-root/nested-document/readback remains unverified**.

Sources: [block children](https://developers.notion.com/reference/get-block-children), [page search](https://developers.notion.com/reference/post-search), [versioning](https://developers.notion.com/reference/versioning).
