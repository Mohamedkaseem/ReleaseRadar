# Architecture and execution

The TypeScript backend separates deterministic comparison and release policy from model planning. A guided run is reproducible without an external LLM. Model mode uses the same validated tools and status policy.

## Data lifecycle

1. Validate a supported baseline and candidate identifier.
2. Load their synthetic manifests and source content.
3. Compute content hashes including the evidence files; import each immutable snapshot idempotently.
4. Persist snapshot graph references on the investigation.
5. Compare contracts and traverse the baseline graph for direct field/endpoint consumers and downstream services.
6. Attach workflow checks and evidence references; optionally execute verification.
7. Compute the verdict from observed outcomes and coverage warnings.
8. Persist the report; reopen its stored graph rather than rebuilding evidence from current files.

A verification request refuses to execute if the bundled candidate's content hash has changed since import. Outcomes are bound to the selected candidate revision. Historical graph references and source excerpts remain available after restart.

## Trust boundaries

The API accepts only bundled revision identifiers. Source reads stay inside the bundled example directory. The model invokes a fixed registry and never supplies Cypher or shell commands. Query values are parameterized. Test arguments are a validated revision and fixed test ID. Child processes receive a minimal environment without LLM credentials, have a 15-second timeout, and cap captured output at 24 KB.

These protections support the local trusted sample; the process runner does not isolate hostile repository code. A future arbitrary-repository version needs disposable containers, network restrictions, and stronger resource boundaries.

## Known limits

The dependency graph models declarations, not complete static data flow. Existing baseline consumers are the supported impact domain. A dependency can indicate a potential impact without a reproduced failure. Traversal is bounded to four dependency edges and 100 returned paths; a boundary check adds uncertainty when longer paths are detected. Cycles terminate because the path depth is bounded. If the model stops early or verification is missing, the verdict remains uncertain.

Reports use one graph per history namespace and immutable graphs per content snapshot. Failed/aborted imports lack a ready marker and can be retried. Successful imports have persisted metadata. AOF and a Docker named volume provide database persistence. This local version does not promise transactional recovery of every intermediate event.

Provider HTTP 429 responses are retried at most three times per model request, respecting Retry-After within the 180-second run budget. Retry waits appear in investigation activity. Exhausted provider retries preserve any already-confirmed blocking test failure.
