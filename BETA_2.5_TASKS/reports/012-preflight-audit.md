# Task 012 — Independent preflight audit

Date: 2026-09-07. Auditor: Codex subagent via coordinator. Sole write: this report.

**Verdict: PASS for scheduled execution readiness.** The current work order protects the canonical Owlbear development line and frozen offline fallback, requires an isolated candidate from the complete current working state, and covers source capture, same-version hotfixes, rules/character-sheet behavior, offline persistence, exports and connections. This is a preflight verdict only; neither the incoming patch nor today's application runtime has been certified.

## Inspected evidence and limits

ONLINE below means E:\Chat gpt Codex\Angels sword\Angel Sword Lirian Chronicles Beta 2.5 Online. Both reports were read in full and material claims checked against actual source/manifests, read-only Git state and local data. Source files were inspected at the relevant implementation/test sections; this is not a full application code review or a full-tree integrity seal.

- Canonical branch: agent/beta-2-5-online, HEAD e0536e9e7f5e7d6a72dc662ec2d7f8b1fdbb2f88. Initial audit inventory showed only the concurrent untracked task-012 brief, no application WIP.
- Frozen fallback: branch agent/beta-2-20-development, HEAD 29caf3c3b9ef73e5154b4e4e537c8202facb8207; status was clean. Dereferenced tag beta-2.2-locked equals that HEAD.
- Git worktree inventory confirmed canonical, frozen, public and parked redesign paths/HEADs reported by the Owlbear reviewer. Workshop source-location dependency was checked in its comparison script; no Workshop writes/sync were performed.
- Source/runtime manifests confirm baseline rules 0.13.1 and four retained versions. The July Clio directory exists with 21 JavaScript modules. No present upstream availability claim is made.
- Scheduler configuration confirms ACTIVE heartbeat angel-sword-patch-refresh, current task ID, six-hour interval and explicit self-pause after bounded completion. Creation epoch 1788767719909 is 2026-09-07 07:55:19.909 UTC / 02:55:19.909 CDT; plus six hours is approximately 13:55 UTC / 08:55 CDT. This is the intended interval, not guaranteed exact dispatch or witnessed future execution. The work order states the computer and Codex must be running.

## Binary preflight gates

| Gate | Result | Evidence |
|---|---|---|
| Both reports materially grounded in source | PASS | Pull/build/manifests; Owlbear core/bridge/manifests; test/staging code |
| Scope is full local update, not reminder only | PASS | Brief and saved automation prompt |
| Scheduled time and bounded stopping instruction agree | PASS | Approximately 08:55 CDT September 7; six-hour heartbeat; pause after completion/final check |
| Canonical WIP and frozen rollback protected | PASS | Re-inventory, full-current-state copy, hashes, no reset/clean/bulk staging/push |
| Candidate build/test output boundaries explicit | PASS | Copied candidate scripts, disposable staging, existing artifact retention, test port ownership |
| Same-version and partial-rollout controls explicit | PASS | Raw bytes/metadata/hashes, start/end identity, distinct attempts, final hotfix check, no partial deletions |
| Character/rules/export/offline scope adequate | PASS | Stable IDs, historical rules, new content, joins, CCS cells/formulas/round trips, offline runtime |
| Owlbear current/candidate compatibility required | PASS | Both extensions, handshake, bidirectional exactly-once rolls, reconnect, structured dice, ownership/cache contracts |
| Test gaps distinguished from proof | PASS | Browser skips, static-host limitations, live/multi-user/device gaps remain unverified |
| Auditor leaves code, production, rooms and frozen assets untouched | PASS | Sole report write; no builds/network/server/browser/commits/scheduler mutations |

## Confirmed findings and disposition

1. The convenience updater early-returns for an installed version and skips snapshots when pulling. The proper per-project puller uses the Clio proxy and explicit version selection, but reserializes JSON, overwrites its unversioned data lane, captures only limited home/manual metadata and does not implement final rollout consistency checks. The brief requires full source evidence and same-version hashes. No fresh website/API fetch occurred.
2. Pull output follows CWD; data/app/extension builders resolve roots from their own files. Preserve scripts/package.json: it correctly establishes CommonJS for the puller despite root ESM. Run copied builders inside the candidate. Staging recursively replaces output; inspect a disposable candidate path first. The Workshop comparison assumes a sibling root; preserve the layout or make the documented equivalent read-only comparison, never silently sync away a failure.
3. Independently confirmed all nine Demon lineage references (wi/lir/d/ar/lu/ni/un/vi/none) exist in joined data while their runtime detail abilityRef is absent/null. The puller writes lineageChoices[code].abilityRef; the builder reads entry[code]. This is a pre-existing packaging discrepancy, not an incoming-patch regression. Runtime impact and severity remain unverified and need a scheduled implementation check.
4. npm test catches browser-launch failures and continues; its deployment copier and old Pages workflow omit owlbear-dice. The current staging verifier covers both manifests/integrity but cannot establish full builder co-hosting or browser CORS. normalizeRollEvent stamps schema 1 and discards unknown fields; same-version green tests cannot prove version-skew compatibility. The brief requires actual browser execution logs and current/candidate payload combinations.
5. Raw rulebook/monster/lore archives do not establish offline consumers. The image builder reuses same-version files without revalidation and may fall back to remote URLs. The CCS procedure requires a current template every release; cells, formulas, hidden round-trip state and meaningful exported fields need semantic validation. The brief now includes these requirements.
6. Initial scheduling prose said 08:52; the coordinator corrected it to the persisted approximately 08:55 interval. **No unresolved actionable preflight blocker remains.** Self-pausing is a future executor obligation; this remains a recurring heartbeat until paused.

## Tests and actions skipped

All application builds and rules/VTT/dice/staging/browser suites are **NOT RUN** in this read-only preflight. Real-room, multi-user, device, audible/visual and offline runtime checks are **NOT RUN**. No upstream patch fetch, CCS download, code fix, candidate creation, publication or scheduler update was performed by the auditor.

Executed read-only checks: source/file inspection, Git status/worktree/HEAD/tag comparison, JSON parsing and nine-lineage comparison, local module count, persisted schedule fields/time arithmetic and SHA-256 hashes. Historical recorded test passes remain historical.

## Work narrative

I read STUDIO-START-HERE first, then canonical AGENTS/state/plan, task brief, scheduler configuration and the prescribed audit example. While reports were being prepared I checked package scripts, pull/update/build behavior, source/runtime manifests, Owlbear core/opener/manifests and representative verification code. I reported the initial schedule mismatch early and the coordinator corrected it.

An initial search guessed a nonexistent owlbear-extension directory; subsequent inspection used owlbear and owlbear-dice. I initially suspected the CommonJS puller conflicted with root ESM, but the coordinator identified scripts/package.json. I inspected it, retracted the blocker and retained only the valid copying requirement. No runtime operation resulted from that false lead. An initial report-writing tool composition failed JavaScript parsing before any command ran; the corrected invocation wrote only this report.

I read both final worker reports and independently confirmed the Demon mismatch, frozen lock-tag commit, structured-dice/bridge contracts, browser-skip caveat and legacy Dice deployment omission. The coordinator incorporated capture/CCS/offline coverage and test-port/browser-skip requirements into the final brief. The evidence supports proceeding at the scheduled time under the written controls.

I acknowledge the state hub's Codex audit permission and obligations. The coordinator owns this task's state-file entry. No commits and no owner question. Exact next step: coordinator records PASS; scheduled executor re-inventories current working state at approximately 08:55 CDT before capture/build.

## SHA-256 of inspected files

Hashes identify inspected bytes, not runtime correctness or a full-tree seal. Coordinator-owned state can change after the audit; execution must capture fresh hashes.

| File under ONLINE unless absolute | SHA-256 |
|---|---|
| AGENTS.md | CC40377268566A671E3790604073734CEC4DDFDC561A9544A523657CD9442289 |
| BETA_2.5_PROJECT_STATE.md | 7AFF371A8CBE915684DF7BA0AE84AD28988002D584B5275FCE36111FB2C4AF2B |
| BETA_2.5_ONLINE_CONVERSION_PLAN.md | 5E88935134BD5F396BA362EE95F11431A83A1EA23698B70BD179FAD4CF476604 |
| BETA_2.5_TASKS/012-website-patch-update.md | 63073CE40D987C48C2FED56A515CC37D37B7E0C473FE76EC51713DC32AFDF959 |
| BETA_2.5_TASKS/reports/012-source-workflow-report.md | 3B5B7FC2981814658C942E0810DE689D5B62AA795F3792219219F2AD4A846C41 |
| BETA_2.5_TASKS/reports/012-owlbear-safeguards-report.md | 8690F176EEDE050610455B4D19123A938E5D0E2C09A08241E076BF729D574424 |
| STANDARD_HANDOFF_README.md | B119550A83231C10ECDE453484680AD2CA72EC80C67DB5FBBAD0F5503F3D9D55 |
| package.json | AE3C9310E46FF9F0BC3E87C5B041C27131B6875E1BF107CAE6A1124BAE17E37D |
| scripts/package.json | 58B55392B5778941E1E96892A70EDC12E2D7BB8541289B237FBDDC9926ED51BD |
| scripts/pull-angels-sword-data.js | 511F19C627BC67AD896E58C0011B4CED020D94E8F1E97AF4E14D61E34C681E0C |
| scripts/update-lyrian-version.mjs | 83F9BD2D2B6E54C4EAB6CCFE2C1166027C12E7CE8D6A08949090C399E850B0E5 |
| scripts/build-version-assets.mjs | 111D84F525DFD3C10487FA4F499C28FB55D06A8D156FC1FC11E1730A81642905 |
| scripts/build-app.mjs | B13E56A52DD3DCD2B4241A8089D42D8243E1B82F9BE179B52E12E248BF2F254C |
| scripts/build-owlbear.mjs | BDC3D644FB393484F88673C3112A028ACD5118414C4D4321B96AFD21C610A699 |
| scripts/sync-workshop-dice-core.mjs | F47B7BA98874A0D2434B1226152740F6FCC4C85F5D75DA883042DD864003C360 |
| scripts/test-staging-deploy.mjs | 9755E486864CDDC75F418DA167C454F20644074A731C8A3F09F17AF06785ADBD |
| scripts/publish-staging.mjs | 0335F178C8B0338EFCF8A481D30BE9815509E21DFE2A7FB14DC9E8F69E35EE58 |
| scripts/test-rules-0131.mjs | 84C0A8DCFC027A78A3640682879C0BF81FEE347D6CFA281ADDA0B9CEE1199E8F |
| scripts/test-community-update.mjs | B58E663B1BC508273B79752EE5834E5C844E11EEE01152AB5750604D9B9A14CC |
| scripts/test-cross-browser.mjs | 836F747DE4D1124ED7DE73BDDDAAC2C611D525C74C09BDA95599A7C8A08D17EC |
| scripts/test-owlbear-panel.mjs | 3202816A62C97073EF82CF58E0E4628BB04F2A8A44B6F915A53BA31B88480011 |
| scripts/test-owlbear-opener-bridge.mjs | AFC21EFB4B90D53C795277C6195D4BB0014388A1F674BACB41F19224136AEA12 |
| owlbear/core.js | 7514C596C02F7642122F45A34A9080CDEE3A52FBB29F6B9DFB8F2A5E8AB68557 |
| owlbear/opener-bridge.js | BE18EAD0C3FD3D57E1B0D132EC6DACA4CACD8F4CDCFB8A888193AA73A4D6F585 |
| owlbear/panel.js | 19C6FA8D55129E9293EF619F392F332567AC1714663DC3163F6D185B56CE1ACA |
| owlbear/manifest.json | 92880AEA874DDC2F6396F8135CC26CF522712C203FD7561B32F83FF4D13EBA02 |
| owlbear-dice/manifest.json | D12490DCC07222339492C97753B9707317091530F662B5C299667EEDA0D53BB1 |
| .github/workflows/deploy-pages.yml | BE2835A9F138460074739ED0A11CCF1C35409CBCC983351E8E9C85471283DCCE |
| data/CCS_TEMPLATE_README.md | 3F686B1419A5E94DA6244C99C49CA238608D2AF9C540FD4F2212ECBCDBF8CDA3 |
| data/angelssword/manifest.json | 89F74C425AB177EBC0F9528DC9E985CC1F642E58DE71C1049350A5474E5F3FD5 |
| assets/versions/manifest.json | A8BC531ED6A12E1D21CCE64234CFB379D9398367D28D13262CEDB715CF448940 |
| data/angelssword/joined/primary_race_details_resolved.json | 78E102AFAC3C5C3A5119EB4D78C0ADF3B879F7481B49F3A59CA2D227CE185231 |
| assets/versions/0.13.1/lyrian-detail-data.js | 91DE70DD74A6A253E7101B2C2607B7AE93B756445BB00D7E8FEB8CBDE40D1039 |
| B:\AI-Video\STUDIO-START-HERE.md | 594B03DF8BD3C82B7BC0BC07B7B353D2BE11BC37E95DDA821C8EB6806289B7A0 |
| C:\Users\bulld\.codex\automations\angel-sword-patch-refresh\automation.toml | A3E21866019802EE23999991E8215FE2B37DE641496D2DC44C5BBE7E6A7D42FF |
| C:\Users\bulld\OneDrive\Documents\Tools\V4S23_TONY_RIGHT_DRAW_MID_attempt01_AUDIT_V1.md | A612E27BC54729810E6FF81E23DED63AB505F60A8C3EDBF1AE3537BFF8EFEE28 |
