## What changes for users?

Describe the connector/pattern, selected source boundaries, and resulting Fulcra records/files.

## Setup and limits

Link the provider guide. List required account tier/scopes, supported data and known polling or deletion limitations. Explain schema/migration changes and upgrade steps where relevant.

## Evidence

- [ ] Direct credential creation/console links (separate from help), required scopes/steps and source/destination/schedule/preview controls follow the agent setup contract; native-only exceptions are explicit; new/replacement/saved views are checked.
- [ ] Synthetic/sanitized fixtures cover pagination, updates, source boundaries, rate limits and access loss.
- [ ] `npm test`, `npm run test:bootstrap`, `npm run check`, `npm run build` pass.
- [ ] Runner/persistence changes: isolated PostgreSQL integration tests pass (or explain why not applicable).
- [ ] Live selected-source import, subsequent change and Fulcra destination readback were verified; or clearly list these as unverified.
- [ ] No credentials, private payloads or full transcripts are included.

State the actual commands/results and remaining prerequisites. Target `main`. Keep account-specific evidence private.
