---
active: true
iteration: 4
max_iterations: 10000
completion_promise: "ALL_BEADS_DONE"
started_at: "2026-01-04T19:35:00Z"
---

Use beads for all tasks. Loop: 1. bd ready --json (pick highest P0 unblocked bead). 2. Work on it (implement, test). 3. bd close <id> --reason 'Done: [summary]'. 4. git commit that completed bead and push to remote. 5. Repeat until 'bd ready' empty. Output <promise>ALL_BEADS_DONE</promise> when no beads left. Use subagents if needed.
