# Task 012 — Official-source workflow preflight

Date: 2026-09-07. Executor: Codex source-workflow subagent. Scope: local read-only review plus this report. No website/API fetch, application mutation, build, test-suite run, commit, state-file edit, or publication occurred.

**Verdict: PASS for locating and auditing the previous workflow; NOT YET VERIFIED for the incoming patch.** Use the Beta 2.5 Online pull/build scripts inside an isolated candidate, with extra source capture and validation. The legacy root puller and `update-lyrian-version.mjs` are unsuitable as the scheduled entry point. A successful data pull alone cannot establish full website coverage, source consistency, or working character-sheet behavior.

## Evidence roots and inspected hashes

Path abbreviations below are absolute roots, not new folders:

- `ROOT` = `E:\Chat gpt Codex\Angels sword`
- `ONLINE` = `E:\Chat gpt Codex\Angels sword\Angel Sword Lirian Chronicles Beta 2.5 Online`
- `CLIO_OLD` = `E:\Chat gpt Codex\Angels sword\.tmp_official_site\clio-characterbuilder-2026-07-21`

| Inspected file | SHA-256 |
|---|---|
| `ROOT\scripts\pull-angels-sword-data.js` | `380B0D761C626A9519664C670456BC0FA6E3149E9CC32A50438EF949B5F37DFA` |
| `ONLINE\scripts\pull-angels-sword-data.js` | `511F19C627BC67AD896E58C0011B4CED020D94E8F1E97AF4E14D61E34C681E0C` |
| `ONLINE\scripts\build-version-assets.mjs` | `111D84F525DFD3C10487FA4F499C28FB55D06A8D156FC1FC11E1730A81642905` |
| `ONLINE\scripts\update-lyrian-version.mjs` | `83F9BD2D2B6E54C4EAB6CCFE2C1166027C12E7CE8D6A08949090C399E850B0E5` |
| `ONLINE\data\angelssword\manifest.json` | `89F74C425AB177EBC0F9528DC9E985CC1F642E58DE71C1049350A5474E5F3FD5` |
| `ONLINE\assets\versions\manifest.json` | `A8BC531ED6A12E1D21CCE64234CFB379D9398367D28D13262CEDB715CF448940` |
| `ONLINE\data\CCS_TEMPLATE_README.md` | `3F686B1419A5E94DA6244C99C49CA238608D2AF9C540FD4F2212ECBCDBF8CDA3` |
| `CLIO_OLD\js\api-client.js` | `F96153DCB8098E0F59238B5A56DE2D734F2615D4FEBEA3C8CA7C81AE1249A15E` |
| `CLIO_OLD\js\character-export.js` | `C2537DD156A2AD19CAE7E5314F9A4F6100BEC75299DC854CC83ECAE553077B92` |
| `ONLINE\data\angelssword\joined\primary_race_details_resolved.json` | `78E102AFAC3C5C3A5119EB4D78C0ADF3B879F7481B49F3A59CA2D227CE185231` |
| `ONLINE\assets\versions\0.13.1\lyrian-detail-data.js` | `91DE70DD74A6A253E7101B2C2607B7AE93B756445BB00D7E8FEB8CBDE40D1039` |

Relevant instructions read: `B:\AI-Video\STUDIO-START-HERE.md`; `ROOT\AGENTS.md`; `ONLINE\AGENTS.md`; `ONLINE\BETA_2.5_PROJECT_STATE.md`; `ONLINE\BETA_2.5_ONLINE_CONVERSION_PLAN.md`; task brief `ONLINE\BETA_2.5_TASKS\012-website-patch-update.md`. The state file, not historical handoff headers, governs the current development/Owlbear lane.

## Previous source and comparison process

The maintenance procedure is in `ONLINE\STANDARD_HANDOFF_README.md`, sections “Pulling New Official Data” and “Required New-Version Audit.” It requires a copied/new build, explicit upstream rules version, raw/decoded/joined diffs, stable-ID comparisons, patch-note/detail reconciliation, and fresh/old-version character tests. Its header still says Beta 2.13; do not interpret that as current worktree identity.

`ROOT\OFFICIAL_CLIO_BUILDER_COMPARISON_2026-07-21.md` records the earlier full source observation, including how the official app was reached: Adventure → Mirane → Expeditioner Alliance HQ → Expedition Registration → Creation Mode. Its official entry point was `https://clio.angelssword.com/characterbuilder/index.html`. The retained directory `CLIO_OLD` EXISTS and contains exactly 21 JavaScript modules under `js`, plus index/vault/sheet HTML, lore-app.js, curated JSONs, CCS template, and selected API sample responses. An old “deleted/missing” note was corrected after restoration; do not discard this permanent baseline because the directory name starts `.tmp`.

`ONLINE\BETA_2.20_OFFICIAL_BUILDER_AND_VTT_AUDIT_2026-08-04.md` records a later comparison against the July source. It found substantive builder fixes while the official numbered release still reported 0.13.1. Its August 4 Owlbear architecture findings are historical; August 25 project state and implementation supersede those transport recommendations. No separate August 4 retained source directory was found in the inspected `.tmp_official_site` inventory; the July source plus later report are the evidenced references here.

## Source URLs to verify at scheduled execution

These URLs are grounded in existing scripts/captures, not a fresh availability claim:

- Official RPG/manual: `https://rpg.angelssword.com` and `/game/online-manual`.
- Rules section pages under `/game/latest/`: `latest-update`, `settings-guide`, `rulebook`, `breakthroughs`, `keywords`, `races`, `classes`, `abilities`, `items`, `monsters`, `monster-abilities`.
- Current local puller API base: `https://clio-proxy.angelssword.com/api/ttrpg`.
- Version discovery: `/version/latest` and `/version/list` under that base.
- Official Clio pages: `https://clio.angelssword.com/characterbuilder/index.html`, `vault.html`, `sheet.html`; also inventory `https://clio.angelssword.com/lore/index.html` and whatever public navigation opens at execution time.
- Official builder modules: discover current script references from the pages; compare to `CLIO_OLD\js\*`, including `api-client.js`, `character.js`, `builder.js`, `class-browser.js`, `requirement-checker.js`, `proficiency.js`, `skill-parser.js`, `breakthrough-browser.js`, `mod-rules.js`, `material-bonus.js`, `sub-items.js`, `staff-builder.js`, `character-export.js`, `vault.js`, `sheet.js`, `battle-mode.js`, and `homebrew-classes.js`.
- Curated data beneath `https://clio.angelssword.com/characterbuilder/data/`: `classes-full.json`, `items-mods.json`, `mod-descriptions.json`, `material-subitems.json`, `aerial-staff-parts.json`, `ccs-template.xlsx`. Discover newly referenced resources as well.
- Prior Roll20 source references: `/characterbuilder/roll20/clio-companion.user.js` and `js/battle-mode.js`, documented in `ONLINE\BETA_2.20_ROLL20_HANDOFF.md`. Public upstream code is observation evidence; preserve the project's own adapter implementation and contracts.

The root legacy script still uses `https://api.angelssword.com`, an older public request-header construction, and `versions[0]`; it ignores CLI version arguments. The July comparison reported direct API “Bad Request” responses and the proxy replacement. The Online local puller has already adopted that proxy and explicit version selection.

## Actual pull and generated-data pipeline

`ONLINE\scripts\pull-angels-sword-data.js:70` fetches both version records, selects `process.argv[2]` by exact `versionNumber` if supplied, otherwise uses `/version/latest`. It errors if an explicit version is absent from the list.

For the selected version it fetches 16 top-level resource families:

`classes`, `key-abilities`, `true-abilities`, `items`, `monsters`, `monsters-abilities`, `monsters-abilities-lists`, `monsters-active-actions`, `monsters-active-actions-lists`, `primary-races`, `ancestries`, `breakthroughs`, `keywords`, `rulebook`, `settings-guide`, `patch-notes`.

It then fetches every discovered class, item, monster, primary-race, and ancestry detail via `/class/{classId}`, `/item/{itemId}`, `/monster/{monsterId}`, `/primary-race/{primaryRaceId}`, `/ancestry/{ancestryId}`. Detail pools run concurrently with individual limits 10/12/8/5/8 (43 possible outstanding requests across families). Primary-race details are essential for `skills`; ancestry details are essential for all three traits. List-only capture previously caused missing grants.

The output root is **`process.cwd()/data/angelssword`**, even if an absolute script path was supplied:

1. `raw/`: 23 current JSON files, comprising metadata, versions, 16 resource families, and five detail families. These retain parsed response values but are JSON-reserialized, not original HTTP response bytes.
2. `decoded/`: recursively adds readable `...Html` and `...Text` companion fields for recognized base64 HTML, with mojibake repair.
3. `joined/`: six files: manual index, resolved key abilities, classes, monsters, primary races, ancestries. They resolve class→key/true abilities, key→associated true ability, monster list→actions/abilities, race→abilities and lineage choices, ancestry→three traits.
4. `site_snapshots.json`, `manifest.json`, and `README.md`: source URLs, selected version, capture time, collection counts, and limited page metadata.

`ONLINE\scripts\build-version-assets.mjs` then reads the local source folders and writes `assets/versions/<version>/lyrian-data.js` and `lyrian-detail-data.js`. It normalizes names/whitespace and preserves identifiers where supplied. The base bundle contains races, ancestries, classes, items, breakthroughs, abilities, keywords. The detail bundle contains races, ancestries and classes. Rulebook, settings guide, monsters, and all website/lore content are NOT made into browser bundles by this script; their existence in raw archives/manifest section labels does not prove offline UI coverage.

The builder merges prior entries into `assets/versions/manifest.json` and `manifest.js`, sorts entries, and sets both `latestKnownVersion` and `defaultVersion` to the requested/generated version. The two static default data `<script>` URLs in `index.html` must be updated separately. It also caches item images under `assets/item-images/<version>/`; race/class images are passed through, so an offline network-blocked exercise must identify remaining remote dependencies.

## Baseline evidenced on disk

- Root `data/angelssword/README.md`: generated May 9, version 0.12.5. Historical only.
- Online `data/angelssword/manifest.json`: generated `2026-07-20T20:14:21.494Z`, version **0.13.1**.
- Online runtime manifests: default/latestKnown **0.13.1**; retained versions **0.12.5, 0.12.6, 0.13.0, 0.13.1**.
- Latest captured counts: 37 versions, 181 classes/details, 175 key abilities, 937 true abilities, 206 items/details, 84 monsters/details, 144 monster abilities, 85 ability lists, 163 active actions, 82 action lists, 5 primary races/details, 43 ancestries/details, 89 breakthroughs, 87 keywords.
- Previous field-audit model: `ONLINE\docs\RULES_0.13.0_TO_0.13.1_AUDIT.md`. It compares decoded collections by stable ID, suppressing duplicate raw base64 mirrors when readable companions exist. It distinguishes a class granted at level 1 (neither EXP nor IP) from a legacy zero-EXP unlock (may still consume IP).
- Known source contradiction to recheck: Selkie patch notes replace Aqua Drill/Water Mastery with Blue Soul, while an old first-trait sentence still references Aqua Drill. Preserve/document official disagreement instead of making up a correction.

## Material pitfalls and preconditions for the later run

1. **Wrong script/directory can overwrite the wrong baseline.** Pull output follows CWD, but `build-version-assets.mjs:6` resolves output relative to its OWN source location. Running the original Online asset builder from a staging CWD still writes Online assets. Run both copies from the actual isolated candidate, preserving `scripts/package.json` (`type: commonjs`) for the CommonJS puller. The project package itself is ESM.
2. **The convenience updater misses hotfixes.** `update-lyrian-version.mjs:7` still discovers via the legacy API; its `planVersionUpdate` returns `alreadyInstalled` at line 182 when the version exists, without checking content. Bypass this helper for task 012. Do not restore its browser-side downloader; standard handoff requires prepared bundled updates.
3. **No version/source equality guard in asset build.** `build-version-assets.mjs:452` trusts the CLI version even if the pulled manifest identifies a different version. Explicitly assert equality before building, then assert both emitted bundles and both manifests agree. A mislabeled stale bundle otherwise looks successful.
4. **Partial website capture is easily mistaken for full scrape.** `captureSiteSnapshots` only reads RPG home/manual; it returns titles, description, headings and links, not page HTML/body content or screenshots. It never visits Clio. Missing Playwright returns a “skipped” note; per-page exceptions become `{url,error}`; neither fails the whole pull. A browser launch failure does fail it. Obtain the actual full public page/module/data capture separately within the existing capture lane, respecting the browser tool/skill rules at execution.
5. **Rollout consistency is not implemented by the puller.** It queries latest once, makes many separate requests, and does not recheck latest or response hashes at the end. It has no retry/backoff, fetch timeout, response schema gate, ETag/Last-Modified archive, per-response capture time or content hash. Preserve full response bytes/metadata alongside the historical parsed pipeline. Pin a version, compare start/end identity and hashes, and retain separate attempts if deployment changes underneath the capture. Capture intermediate newly released patch notes too; the puller retrieves only the selected version's notes.
6. **Raw snapshots overwrite in place.** All output paths are unversioned under `data/angelssword`; source archives are written sequentially after fetch/decode/join/snapshot. Preserve a dated baseline before the pull. Do not treat missing records from an incomplete response as legitimate deletions. Do not reuse an existing source attempt directory.
7. **Join success is not validated.** `resolveRef` returns null silently, `expandListRefs` filters failed lookups away, and manifest counts count records rather than reference integrity. Exact case/whitespace strings and ID schema changes can break links despite unchanged counts. Verify every nonempty source reference against expected targets, including monster list cardinalities; distinguish intentionally blank slots.
8. **Confirmed pre-existing lineage detail defect:** puller `:420-433` creates resolved references at `entry.lineageChoices[code].abilityRef`, but asset builder `:348` reads `entry[code]`. Local read-only inspection found all **nine Demon lineage abilities resolved in joined data but all nine `abilityRef` values absent/null in the existing 0.13.1 detail bundle**. IDs remain present; runtime impact may be masked by a fallback and was not tested here. Preserve this as a baseline defect and assess/fix if necessary for the requested rules/connection correctness. Do not label it a new-patch regression.
9. **Same-version artwork can remain stale.** `cacheRemoteImage:73` returns an existing file without comparing URL, bytes or ETag. It returns the original remote URL after failures and accepts arbitrary response bytes without a content-type/decode test. Evaluate changed artwork explicitly; verify cached images decode and all required offline assets resolve. Do not wipe existing caches globally.
10. **Curated rules and behavior changes are outside the API scrape.** Official `classes-full.json`, item mods, material catalogs, staff parts, source QA/ruling comments, character creation/refund logic, Battle Mode, exports and newly accessible lore/DM features need their own semantic change/impact ledger. Discover current modules/routes rather than limiting the capture to the old 21-module list. The July retained `api-client.js` also references developer localhost fallbacks; those strings are not authorization to inspect unrelated local services.
11. **CCS refresh is a separate release obligation.** `data/CCS_TEMPLATE_README.md` requires downloading the current official workbook for every release, validating expected sheets and updating capture/hash metadata. Do this in the candidate, preserving baseline. Recheck field/cell maps, formulas, hidden round-trip state, styles, booleans and representative exports. Sheet-name tests alone do not prove map/formula correctness. The exporter patches XML in the official archive rather than rebuilding the workbook, intentionally preserving formula/template structure.

## Practical execution sequence (future, not executed)

1. At the task's scheduled time, re-read task 012/state and reinventory actual Online branch, HEAD and WIP. Construct the isolated candidate from its full current working state, as instructed in the brief. Keep Public Beta 2.20 and saved characters intact. No stale HEAD-only copy.
2. Preserve original source/data/runtime/template hashes in a dated attempt under the existing source-capture lane. Read official version/list/latest and public navigation. Record discovered version/build metadata and fetch times. Do not infer new patch number from this report.
3. Capture actual public pages, linked scripts, curated data, template and relevant patch histories. Compare July retained source and August audit while treating current Online code as the implementation baseline; many historical gaps were subsequently fixed.
4. In the isolated candidate root, run the copied/audited scripts with the verified version. These are the exact documented commands, with the example version replaced by the observed target:

```powershell
node scripts/pull-angels-sword-data.js <verified-rules-version>
node scripts/build-version-assets.mjs <verified-rules-version>
```

Do not literally pass angle-bracket placeholders. Verify source-manifest equality before the second command. If site snapshots must be skipped for browser-policy/tool compatibility, set `LYRIAN_SKIP_SNAPSHOTS=1` only for that pull and explicitly complete/record the browser capture separately; a skipped capture is not success.

5. Compare every raw/decoded/joined collection and captured module/resource by stable ID/path. Check counts, duplicates, source references, all detailed traits/skills, changed requirements/costs/grants/proficiencies/equipment and behavior; produce a source-backed change ledger. Handle unchanged numbered version with changed bytes as a real hotfix.
6. Make the smallest evidence-backed runtime/data/migration corrections in the candidate, update default scripts/cache tokens, retain all older bundled versions and saved-character formats. Review the nine lineage references described above before calling reference checks complete.
7. Required gates are in task 012 and current package.json: build; rules0131; community; VTT; dice skins/core check; cross-browser `npm test`; safe candidate staging checks; direct-file/network-blocked offline behavior; fresh/older version and complex save/export round trips. `STANDARD_HANDOFF_README.md` additionally names `npm run audit:minmax`; include it for class/unlock changes. Avoid assuming July/August historical test counts equal the current suite.
8. Recheck upstream version and content hashes after validation. If a small follow-up patch arrived, keep it as a distinct source attempt and repeat affected validation. Hand candidate, evidence, report and rollback instructions to an independent auditor before final delivery. No uploads/pushes.

## Verification gates for this preflight

| Gate | Outcome | Evidence/limit |
|---|---|---|
| Required root/project instructions read | PASS | Files named above |
| Previous official source baseline found | PASS | `CLIO_OLD`, 21 JS modules counted by Node/filesystem |
| Correct pull route and explicit-version behavior checked against code | PASS | Online puller lines 8, 70-85, 141-200 |
| Pull/build output boundaries inspected | PASS | Pull CWD versus builder script-relative root |
| Current source/runtime version baseline inspected | PASS | Hashed manifests |
| Nonempty direct joined `...Ref` keys checked for null targets | PASS, LIMITED | Read-only recursive scan: zero missing direct refs in six joined files; not a complete foreign-key/cardinality test |
| Demon lineage source→bundle references inspected | FAIL, PRE-EXISTING | Nine joined targets exist; all nine runtime detail refs absent/null |
| Current API/website reachability/new release verified | NOT RUN | Deferred per owner/task scope |
| App/VTT/browser/offline regression suites | NOT RUN | Read-only preflight; no new functional result claimed |
| Source/app modifications | PASS | Only this authorized report written; no commit |
| Second-agent review | PENDING | Coordinator/independent preflight auditor owns it |

## Work narrative and exact next step

I read STUDIO-START-HERE before inventorying the workspace, then read the project instructions and discovered the multiple legacy application folders. A broad filename search initially included unrelated video/portable runtime files; I narrowed subsequent reads to the Online scripts, source-data folders, handoffs and retained official-site capture. This separated the obsolete root puller (0.12.5 baseline and direct API) from the Online proxy puller and exposed the stale convenience updater.

I traced actual request paths, CLI argument handling, CWD/script-relative output resolution, decoded/join construction, image caching and manifest writes. I read the July source comparison, August audit and CCS procedure, then checked the corresponding retained API client/export source and counted actual modules. I ran two read-only Node inspections of joined JSON and the generated detail bundle to verify the nine lineage-reference mismatch, without invoking any network fetch/build or loading the app. I hashed the material evidence listed above. These checks establish workflow facts, not current upstream or end-to-end application behavior.

Exact next step: independent preflight auditor reviews this report against the hashed source; scheduled executor then follows task 012 at the scheduled time, beginning with a fresh working-state inventory and protected dated capture. No unresolved user question is required for this preflight.
