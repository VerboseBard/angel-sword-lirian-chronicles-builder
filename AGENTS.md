# Angel Sword — Beta 2.5 Online worktree: agent entry point

Every AI session in this folder — ChatGPT/Codex, Claude, or any sub-agent —
starts by reading **`BETA_2.5_PROJECT_STATE.md`**. It is the ground-truth
ops hub: identity and hard rules (worktree/branch, NOTHING is ever pushed,
frozen sibling folders, no `git add -A`), the coordinator + sub-agent
operating model with the DECIDED/SKETCH task-brief contract, standing
permissions and obligations for ChatGPT (including the required work-log
acknowledgment), the verification gates, the owner-decision ledger, the
task queue, and the append-only WORK LOG that every session must add its
entry to before finishing.

Plan of record: `BETA_2.5_ONLINE_CONVERSION_PLAN.md`.
Task briefs: `BETA_2.5_TASKS/` (template inside; verbatim executor reports
in `BETA_2.5_TASKS/reports/`).

If anything here conflicts with `BETA_2.5_PROJECT_STATE.md`, that file wins.
