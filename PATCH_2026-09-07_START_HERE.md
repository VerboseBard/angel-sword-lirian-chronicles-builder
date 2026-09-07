# Angel Sword 0.13.2 — isolated local update

This folder is the September 7, 2026 patch candidate, based on the current Beta 2.5 Online worktree at `4722f45`. The existing app still identifies its public UI as Beta 2.13; **0.13.2 is the rules version**. It is a separate local Git worktree on `agent/patch-2026-09-07`. Nothing has been published.

All 13 required local verification gates passed, including three browser engines at three viewport sizes and all four current/candidate Owlbear sheet-extension combinations. The final website recheck at 10:52 CDT found no additional changes. Read the canonical task report linked below for evidence and the limits of local testing.

## Open the candidate

Use the existing local server on a separate port for the complete workflow, including spreadsheet template fetches and isolated browser storage:

```powershell
Set-Location -LiteralPath 'E:\Chat gpt Codex\Angels sword\Angel Sword Patch Candidate 2026-09-07'
$env:LYRIAN_PORT = '4177'
npm start
```

Open the URL printed by that command (normally `http://localhost:4177/`). Leave that terminal running while using it; Ctrl+C stops this server. If 4177 is occupied, the server prints the next available port. Dependencies and built assets are already present on this machine; no installation or internet download is required to start it.

Port 4177 gives the candidate its own browser storage, separate from the existing localhost:4176 sheet. Your existing saved characters will not automatically appear there. Export a character JSON backup from the existing sheet and import that file into the candidate to try a copy. Keep the original backup. Avoid clearing browser storage.

The existing Owlbear install links expect localhost:4176. Port 4177 is for isolated local evaluation; it does not replace your installed room extensions. Automated tests exercise current/candidate combinations in disposable browser contexts. Switching the live room or publishing the candidate is a separate release step.

The rule selector includes 0.13.2, 0.13.1, 0.13.0, 0.12.6 and 0.12.5. All four older data bundles are preserved. On first seeing the new default, the app opens an older profile using 0.13.2 in memory; it leaves the stored character unchanged until a real edit or save. Select an older version explicitly if your game is staying on that ruleset. Check the selected rules version when opening an imported character.

## Offline rules and source changes

Open [the searchable offline reference](docs/offline-reference/RULES_0.13.2.html) directly. It includes the full captured rulebook, campaign guide, 0.13.2 patch notes and 92 keyword definitions. Use browser Find (Ctrl+F). External source links require internet; the reference itself has no scripts, fonts or images to fetch.

The candidate adds Pigfolk and four classes: Fusilier, Manifestor, Mystic Eyes of Petrification and Still Stone Testament. It carries the changed abilities, class access, equipment text and new Open Shop/Modded Item rules. All new bundled artwork is local. Character correctness fixes include the official CCS initiative formula, corrected CCS stat selectors/bonuses, Petrification prerequisite grouping, the Rapid Flash prerequisite name alias, Eisen's current Physical damage type, and Bear/Blood Elixir nonstacking effects. Use the existing effect Clear control when Bear's encounter ends; Rest removes Blood's penalty. Earlier rules retain their source behavior.

The public site also exposes a Strategy Room GM suite and Mirane Bell issues 001/002. Their public sources are archived and described in the update report; this character builder does not embed those separate applications. Existing local differences, such as free-form crafting-mod notes instead of the official structured mod engine, are documented rather than silently treated as equivalent.

## Return to your existing setup

Stop only the candidate server with Ctrl+C, then reopen your usual Beta 2.5 Online launcher/URL. Its application files, staging output, saves and installed Owlbear extensions have not been replaced. The frozen Public Beta 2.20 fallback and Dice Builder Workshop remain in their original locations.

The canonical task record is `..\Angel Sword Lirian Chronicles Beta 2.5 Online\BETA_2.5_TASKS\reports\012-website-patch-update-report.md`. It links the detailed capture, implementation, compatibility, export and independent audit evidence. Full timestamped public-source captures remain in `..\.tmp_official_site\patch-2026-09-07\`.
