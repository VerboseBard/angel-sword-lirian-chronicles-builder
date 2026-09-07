# Task 012 — Owlbear/offline preservation preflight

Executor: Codex subagent via coordinator, 2026-09-07. Scope: read-only source/history inspection; this report is the sole permitted write. No build, tests, server, browser session, upstream capture, commit, push, or deployment was run.

## Verdict and binary gates

**PASS for preservation planning; runtime compatibility remains UNVERIFIED for the future patch.** The canonical code and protected baseline are recoverable and the established test commands are present. This does not certify the current app or the unseen patch as passing today.

| Gate | Result | Evidence |
|---|---|---|
| Required studio entry, applicable AGENTS, state, plan and task brief read | PASS | Paths in narrative below |
| Canonical worktree and frozen siblings identified | PASS | Git status/revision inventory below |
| Current Owlbear contract located in source | PASS | `owlbear/core.js`, `owlbear/opener-bridge.js`, `src/js/vtt-relay.js` |
| Build/test entry points verified against package/source | PASS | Command table below |
| Pre-existing gaps distinguished from update regressions | PASS | Existing task reports and current source checks below |
| Application/source/deployment mutations during this review | NONE | Only this report was written; coordinator has a disjoint documentation scope |
| Fresh tests, offline browser checks, real room, multi-user checks | NOT RUN | Read-only preflight scope; prior recorded passes are not fresh evidence |

I acknowledge the standing ChatGPT/Codex audit permission and obligations in the state hub: honor DECIDED items, scoped brief/report discipline, explicit staging only, no pushes, required verification for implementation, and the coordinator's append-only work-log entry. The coordinator owns the state-file write for this task.

## Exact baseline and protected locations

All app-relative paths below resolve under:

`E:\Chat gpt Codex\Angels sword\Angel Sword Lirian Chronicles Beta 2.5 Online`

The starting `git status --short` returned no entries for each repository below. Later task-012 documentation being authored by the coordinator is expected concurrent work, not pre-existing application WIP. Re-inventory at the scheduled run because these values can change.

| Root under `E:\Chat gpt Codex\Angels sword` | Branch/role | Observed HEAD |
|---|---|---|
| `Angel Sword Lirian Chronicles Beta 2.5 Online` | Canonical change line, `agent/beta-2-5-online` | `e0536e9e7f5e7d6a72dc662ec2d7f8b1fdbb2f88` |
| `Angel Sword Lirian Chronicles Public Beta 2.20` | Frozen known-working offline fallback, `agent/beta-2-20-development`, state names lock tag `beta-2.2-locked` | `29caf3c3b9ef73e5154b4e4e537c8202facb8207` |
| `.publish-public` | Shared Git repository worktree, `main`, existing public-release lane | `0c8b2dada4c4bca2321f6d6d998ba6f02ec0169c` |
| `Game Interface Angel Sword Character Sheet Alpha 1` | Parked visual redesign, `agent/beta-3-0-development` | `aebe72cfedd45ea978ba0160ac8f58b13751bec8` |
| `Dice Builder Workshop` | Independent dice project, protected | `4cdb8557d7a583d55bac1228593b5b079d22ef3a` |

`git worktree list` confirmed the first four worktrees share `.publish-public`. Its existing remote is `git@github.com:VerboseBard/angel-sword-lirian-chronicles-builder.git`; the manifest homepage points to `https://verbosebard.github.io/angel-sword-lirian-chronicles-builder/`. These are existing publication destinations, not permission to upload. The state says nothing is pushed and publishing remains owner-held. Package/README identity still says 2.13; the current internal line is 2.5 and the earned public label is Beta 3. Do not use a label or older README to select the implementation source.

Ignored local directories `dist-staging`, `node_modules`, and `qa-test-results` exist. The existing staging integrity and host-notes files are dated 2026-08-25, preceding task 008's 2026-08-26 sound change. Preserve that artifact; it is not evidence of the latest source. Ordinary clean Git status does not inventory ignored local state.

## Contracts and files to preserve

1. **Two extensions are implemented.** Preserve `owlbear/` Companion manifest version `0.2.0` and `owlbear-dice/` Dice manifest version `0.1.0`, their HTML/source/assets and generated `dist/` entry points. `scripts/build-owlbear.mjs` bundles Companion panel/background plus Dice panel/background/overlay. Current state/plan supersede `docs/owlbear-extension-architecture.md`, which still describes one extension and the old BroadcastChannel concern.
2. **Owlbear-first transport.** `owlbear/panel.js:64` resolves the builder at `new URL("..", window.location.href)`. The panel owns a popup; `owlbear/opener-bridge.js` and `src/js/vtt-relay.js` carry the bidirectional postMessage handshake/handoff/roll stream with source and origin validation. Keep same-origin sibling hosting and the popup relationship. Browser storage partitioning makes BroadcastChannel alone inadequate; the optional localhost relay must not mask a failed production bridge. Current owner-live verification is recorded in the state/plan, including panel closed, F5 reconnect, reverse Combat Log and two-tab guard. No new live proof was performed here.
3. **Compact character/room contract.** `owlbear/core.js:1-9` defines extension ID `com.angelssword.lyrian-chronicles`, relay `asb-vtt-events`, namespaced `/rolls`, `/player-binding`, `/character-binding`, `/roll-log`, schema constants `1`, room log limit `24`. Character import normalizes builder JSON or official `.aschar` to identity, stats, resources and speed. Preserve player/token ownership behavior, GM correction, binding IDs and log deduplication. Builder-generated character IDs hash name/race/ancestry/classes, so source-driven renames or changed class-name output can affect identity even if the schema is unchanged; test old bindings with representative updated characters.
4. **Resolved dice remain authoritative.** `normalizeRollEvent` keeps individual `dice:[{sides,value}]` results plus total, label, formula, breakdown, player/role and identity. `extractRollDice` retains older-text fallback. Four sheet roll sites must continue sending structured results. Preserve `owlbear-dice/overlay.js` interruption/stacking, role attribution, warm overlay and persistent sound/mute behavior. Do not alter painted art or shared dice geometry for a data refresh.
5. **Character persistence/interop.** Protect `src/js/state.js`, `io.js`, `aschar.js`, `rules.js`, and format/version semantics. Official envelope is `angelssword-character`, version `1`; existing importers do not reject newer envelope versions. Compare meaningful fields, not merely whether a file imports. Save-slot snapshots, current resources, creation mode, inventory quantity/mod/material data, class progress, selected choices, and original rule version need before/after fixtures.
6. **Version and cache behavior.** `assets/versions/manifest.json` currently defaults to `0.13.1`; historical local versions include `0.13.0`, `0.12.6`, `0.12.5`. New default assets, both manifest formats and `index.html` static data/detail scripts must agree. `rules.js:108-131` can promote an old saved selection when the bundled default advances; `io.js:885-914` supports that during hydration. Test reload with real old-format fixtures and explicit older-version selection; keeping old bundles alone is not proof characters remain on the intended rules. Bump relevant cache tokens when runtime consumers change, without resetting player storage.
7. **Manual token flow is DECIDED.** Download Token Image -> add to Owlbear library -> Place My Token. Preserve it and same-tab room navigation with autosave flush. Do not reintroduce the deleted URL token-image approach or redesign the connection workflow.

## Known gaps that must not be mistaken for this patch's regressions

- **No enforced schema compatibility gate.** Task 002's scout and task 003's independent audit found schema versions stamped but not read, incoming roll schema overwritten with `1`, duplicated `VTT_RELAY_VERSION` not checked/pinned, and unknown fields discarded during normalization. Current `core.js` and relay source still show these conditions. WS5 was not completed. The new-patch verification must use old/new payload fixtures and current/candidate consumer combinations; existing same-version green tests do not prove version-skew safety.
- **Dice defects already reported.** Task 009 reproduced d100 rolls 1-9 showing a tens face of 10 instead of 00; also flagged false settle-result warnings/latent fallback issue. Treat these as baseline unless new evidence differs. The current task may address only what is necessary for requested compatibility/correctness; no dice redesign is implied.
- **Existing cache skew.** Task 010 found promotion and pruning update only the builder registry cache token; extension pages retain stale tokens. Task 009 noted an older panel engine token than overlay. Preserve/measure the baseline, then record necessary cache fixes explicitly instead of attributing them to new upstream rules.
- **Old deployment is incomplete.** `.github/workflows/deploy-pages.yml` copies `owlbear/` but omits `owlbear-dice/`. `scripts/test-cross-browser.mjs:25-39` repeats that omission in its mock deployment and uses the dev server. Thus `npm test` remains useful for offline app/UI/rules, but cannot certify both extensions' static deployment.
- **Staging caveats.** Use the hardened current staging scripts. Source/records document output-path guards, SHA-256/size verification and target mode; arbitrary existing in-tree file output remains a documented low-severity deletion risk. Validate a disposable candidate output directory before invoking emit. Host requirements are COOP absent and ACAO present for `/owlbear*`; a Node-only HTTP simulation cannot prove browser CORS. Staging emits extensions and their asset closure, not a complete co-hosted builder; the panel's parent URL still requires the full app next to them.
- **Live release gaps remain.** State/roadmap list second-player ownership and GM repair, real official-character semantic comparisons both ways, phones/tablets, additional branded browsers/private mode and final visual/audio approval. A local mock cannot close those. The saved task-008 report records build, VTT 109 adapter + 48 bridge checks, dice-skins and core sync passing at that revision. This report does not repeat those as fresh results.

## Recommended verification gates for execution

Run baseline and candidate separately in disposable copied/current-state candidates, preserve exact logs and distinguish intentional changed-rule expectations from weakened tests.

| Command / exercise | What it proves or limitation |
|---|---|
| `npm run build` | Rebuilds `assets/app.bundle.js`, both extension bundles, Safari lookbehind compatibility check. Required after every `src/js/*` edit; `npm start` alone rebuilds only extensions. |
| `npm run test:rules0131` | Explicit historical 0.13.1 focused regressions, including unlock/grant/creation rules. Keep this older-version coverage after adding a new default. |
| `npm run test:community` | Existing community corrections and play-sheet rules; source seeds 0.13.1. |
| `npm run audit:minmax` | Required standard-handoff cascade/unlock audit. Include it with the task brief's other rules gates. |
| `npm run test:vtt` | Builds extensions; adapter checks, fake-clock opener checks, Playwright panel and popup bridge phase with dev relay blocked and BroadcastChannel removed. |
| `npm run test:dice-skins` | Promotion/core/registry integration. |
| `npm run dice:core:check` | Read-only normalized comparison of geometry/core against sibling `../Dice Builder Workshop`. A candidate nested elsewhere loses this relative dependency; preserve sibling layout or document an equivalent read-only comparison. Do not run sync without `--check` to make a failure disappear. |
| `npm test` | Production rebuild plus Chromium/Firefox/WebKit, direct `file:` startup, viewports, all-class progression, creation/Quick Builds, version selection, save and live-play checks. Its deployment copier omits Dice; pair with staging gate. |
| `npm run test:staging` then `npm run test:staging -- --no-emit` | Only in an isolated candidate with a verified disposable `dist-staging` path. First emits/builds; second checks the exact existing bytes without re-emitting. No upload. |
| `npm run test:followups`, `npm run test:roll20`, `npm run test:foundry-csb` | Use when modified sheet/import/export/adapter areas intersect these existing fallbacks; retain their source. Roll20 and Foundry expansion are parked. |
| Saved-character round trips and new rules fixtures | New/old characters, each start mode, import/export, chosen older version, reload, inventory/resources, changed/unavailable IDs and cross-record references. Compare semantic output and preserve original fixture bytes. |
| Current extension + new sheet; candidate extension + old/new fixtures | Pin handoff, exactly-once bidirectional rolls, structured multi-die values, reconnect, bindings/ownership, panel closed, and old payload fallback. Do not stamp newer versions then claim compatibility solely because normalization erases them. |
| True offline exercise | Load candidate with network blocked except its own local server or via file URL; create/load/save/reload/switch bundled versions; check missing resources and consoles. Do not alter the user's actual localStorage/save files. |

The real-room dev server is `npm start` at localhost:4176 (may fall forward if busy); installed local manifest URLs specifically need :4176. Inspect ports/processes first and do not take over another agent's room/server. Automated scripts use dedicated test ports but must likewise not compete concurrently.

`scripts/verify-interop-live.mjs [baseUrl] [outDir]` exists and uses a fresh headless browser to export `.aschar`/CCS, then import a generated Interop Probe into the official vault page's localStorage. It is only an import doorway test and does not compare all semantic fields. Do not run it as a read-only upstream scrape, assume it represents a real owner character, or use it in place of full parity fixtures. Inspect current official UI behavior at execution time.

## Isolation and rollback sequence

1. Re-read state/plan/brief and re-inventory Git HEAD, staged/unstaged/untracked and ignored evidence outputs at the scheduled run. Copy actual current relevant working files, not only committed HEAD if someone added WIP. Do not reset, clean, force checkout, bulk-stage, alter frozen siblings or publish.
2. Make a separately named candidate in the existing Angel Sword project lane from the canonical 2.5 state. A sibling candidate retains the Workshop-relative read-only check. Record the original-to-candidate mapping and hashes; retain originals, raw data/snapshots, saved-character fixtures, current ignored staging output and generated asset provenance.
3. Record baseline suite results before pulling new data into the candidate. Preserve current rules versions and all Owlbear/dice contracts listed above. Diff upstream additions/changes/deletions and references before deciding on implementation; identify stable-ID and character-binding changes explicitly.
4. Build/test the candidate, create focused regressions for actual patch interactions, and run current/candidate compatibility combinations. Hash all protected original files again and compare to pre-work evidence. Expected coordinator documentation changes must be listed separately from source changes.
5. Deliver the candidate path, launch method, recorded old/new versions, logs, semantic parity report, protected-file integrity result and independent audit. Keep production and frozen offline files untouched. Rollback is returning to the untouched prior launch path or frozen 2.20 fallback, with original exported characters retained; it must not rely on reverting the shared worktree or altering live room state.

## Evidence SHA-256

Computed with PowerShell `Get-FileHash -Algorithm SHA256` against the paths above on 2026-09-07. These identify inspected bytes, not a full-tree integrity seal. State/documentation may later change under coordinator ownership; refresh before execution. Git revisions above identify tracked baselines; ignored files need their own inventory.

| Relative path | SHA-256 |
|---|---|
| `AGENTS.md` | `CC40377268566A671E3790604073734CEC4DDFDC561A9544A523657CD9442289` |
| `BETA_2.5_PROJECT_STATE.md` | `2C5D2C8FB719AE59C19FDB788C65B5E619BF988C58DF8B3BB9E2F4DE4E991E34` |
| `BETA_2.5_ONLINE_CONVERSION_PLAN.md` | `5E88935134BD5F396BA362EE95F11431A83A1EA23698B70BD179FAD4CF476604` |
| `package.json` | `AE3C9310E46FF9F0BC3E87C5B041C27131B6875E1BF107CAE6A1124BAE17E37D` |
| `src/js/rules.js` | `AA3CD8E96ED539ECA00667C2832B9CD2908A13283D7D068427D03103A198EEBE` |
| `src/js/io.js` | `D11D1F558D90810FED3296423F97A96CED67A836B80B6986DC89C071B0BB9007` |
| `src/js/aschar.js` | `6DAC49CAB3DC1D366338571036A127B2A5E87928DDF6AA3BD0E528C230B3E08D` |
| `src/js/state.js` | `76D38DD1FEA120A2F90B6B273143AA571199E4D23F071B5895B3CBB6225D05A4` |
| `src/js/vtt-relay.js` | `A45073B777605167DD66787B3652A6694DDE293D78228E8718874D589F6495A0` |
| `src/js/runtime-loader.js` | `79420B8ADE9F2AC79259B05035D55DBEC386502D87E7C7A6D41AF66ECB19F651` |
| `owlbear/core.js` | `7514C596C02F7642122F45A34A9080CDEE3A52FBB29F6B9DFB8F2A5E8AB68557` |
| `owlbear/opener-bridge.js` | `BE18EAD0C3FD3D57E1B0D132EC6DACA4CACD8F4CDCFB8A888193AA73A4D6F585` |
| `owlbear/panel.js` | `19C6FA8D55129E9293EF619F392F332567AC1714663DC3163F6D185B56CE1ACA` |
| `owlbear/manifest.json` | `92880AEA874DDC2F6396F8135CC26CF522712C203FD7561B32F83FF4D13EBA02` |
| `owlbear-dice/manifest.json` | `D12490DCC07222339492C97753B9707317091530F662B5C299667EEDA0D53BB1` |
| `owlbear-dice/overlay.js` | `CC1D781D161AD22B8B5F4066A915ED707CE4F923FD94A3F833D61914297DF36A` |
| `owlbear-dice/panel.html` | `BDE536B6678EDF0521DD1A05905C34AE2F841C2B3B9503DE729CF96643A09967` |
| `owlbear-dice/overlay.html` | `B0CFDC8BE9037B6CE261CE302F909EEA16016FAFD24B63945BC03C7D086D1F73` |
| `assets/dice-3d/shared-dice-roller-core.js` | `51057131BA8C20209F72AAF9A52CE063806C0B1C6F8435C43DDDD1F35076F43C` |
| `assets/dice/promoted-dice-skins.registry.js` | `2A29C5E75D5C41CE8B067D15CA9ABF5DF34AF6FCD6C7131841AD983C28B4F057` |
| `scripts/build-app.mjs` | `B13E56A52DD3DCD2B4241A8089D42D8243E1B82F9BE179B52E12E248BF2F254C` |
| `scripts/build-owlbear.mjs` | `BDC3D644FB393484F88673C3112A028ACD5118414C4D4321B96AFD21C610A699` |
| `scripts/test-vtt-adapters.mjs` | `7FF4E1BB03C4B3AE2E738BB9B8774CB943B8B83089ABD27C0A2D641BDAA54BE4` |
| `scripts/test-owlbear-opener-bridge.mjs` | `AFC21EFB4B90D53C795277C6195D4BB0014388A1F674BACB41F19224136AEA12` |
| `scripts/test-owlbear-panel.mjs` | `3202816A62C97073EF82CF58E0E4628BB04F2A8A44B6F915A53BA31B88480011` |
| `scripts/test-staging-deploy.mjs` | `9755E486864CDDC75F418DA167C454F20644074A731C8A3F09F17AF06785ADBD` |
| `scripts/publish-staging.mjs` | `0335F178C8B0338EFCF8A481D30BE9815509E21DFE2A7FB14DC9E8F69E35EE58` |
| `scripts/lib/owlbear-staging-assets.mjs` | `F787F733B9E80F3A10D81424D8D86739FAF54A8C2D2D78025AEAFE2A0D3A08AD` |
| `scripts/test-cross-browser.mjs` | `836F747DE4D1124ED7DE73BDDDAAC2C611D525C74C09BDA95599A7C8A08D17EC` |
| `.github/workflows/deploy-pages.yml` | `BE2835A9F138460074739ED0A11CCF1C35409CBCC983351E8E9C85471283DCCE` |
| `assets/versions/manifest.json` | `A8BC531ED6A12E1D21CCE64234CFB379D9398367D28D13262CEDB715CF448940` |
| `index.html` | `3362250DBBF5E9DE9907B7EB073701C0D003F04CBFDF12302523F182277800F1` |
| `BETA_2.5_TASKS/reports/002-ws5-ws6-contract-scout-report.md` | `F403EE3886D240AC48F64DCA09C746C9750A7A4128588FBE2B15894FD2628214` |
| `BETA_2.5_TASKS/reports/003-scout-report-audit-report.md` | `706FC17871C730CA2BFC56DF27139372CFEC5860B672AA47EEC27526B4845610` |
| `BETA_2.5_TASKS/reports/009-dice-face-mismatch-scout-report.md` | `49E8F4C02C3DAAB2A9F0FB956D10F8398CBD75DFCBFA62B8C5C2FF06182D490E` |
| `BETA_2.5_TASKS/reports/010-registry-cache-buster-options-memo-report.md` | `04D908148BA5070E3ADD135933F42421DA085446BBE58CBACD1AB7A7B94B6490` |

## Work narrative

Read `B:\AI-Video\STUDIO-START-HERE.md` first, then root `AGENTS.md`, canonical `AGENTS.md`, the complete state hub (in chunks after output truncation), conversion plan, and the coordinator's task-012 brief when it arrived. Inventoried candidate README/state/package and Owlbear paths with `rg --files`; read actual manifests, build scripts, compact contract and transport/version/save code. Ran read-only Git status/history/worktree inventory across canonical/frozen/public/parked/Workshop roots. Read prior scout/audit summaries and relevant state log outcomes rather than assuming tests were rerun.

An initial guessed `.github/workflows/deploy.yml` read failed; `rg --files` provided the actual `deploy-pages.yml`, which was inspected and showed the Dice omission. The architecture document proved stale against current code and hub; recorded that conflict instead of adopting its one-extension model. Examined test source and staging output semantics, then checked the Workshop sync script's sibling dependency and existing ignored directories. Computed evidence hashes and authored this report only. No execution failures were created or resolved; runtime verdicts remain pending the authorized scheduled implementation and independent audit.

Exact next step: independent auditor checks this report against the hashed source; coordinator includes it in the scheduled task and records the preflight/work-log outcome. At the scheduled time, inventory again and run the baseline/candidate workflow in task 012.
