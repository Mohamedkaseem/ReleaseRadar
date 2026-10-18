# Agent tool contracts

All tool inputs are validated. Tools run sequentially within the 20-call budget; repeated test requests reuse an existing candidate outcome. Graph queries have a five-second timeout. Verification has a 15-second process timeout.

| Tool | Input | Output / side effect |
|---|---|---|
| get_release_changes | Empty object | Deterministic detected changes |
| inspect_change | changeId | Graph-derived findings with paths, source IDs, and test IDs; persisted |
| get_verification_plan | Empty object | Checks registered in the imported graph |
| get_evidence | sourceId | Original path, line, excerpt, and revision |
| get_history | Empty object | Last three completed investigation summaries |
| run_test | testId | Actual candidate execution result; persisted |
| finish | summary | Optional model explanation; status remains backend-computed |

A tool error is returned to the model as data. Budget exhaustion ends the investigation with an explicit error. Source excerpts are untrusted data, not instructions. Arbitrary commands, test IDs, graph names, and revisions are not model tools.

`get_evidence` uses baseline evidence by default when an identifier exists in both snapshots. Findings refer to baseline dependencies; candidate verification is separately bound to the candidate hash.
