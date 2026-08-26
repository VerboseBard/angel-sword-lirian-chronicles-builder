# Report — Task 006: Final audit of the WS2 chain (001 build → 004 cross-audit → 005 hardening)

Executor: Claude Fable 5 final-audit subagent, 2026-08-25, per Model protocol v3.
Read-only pass: reports and briefs read from disk, code spot-checked at commit
`6f767ff` (verified = HEAD; working tree diff against it is empty; diffstat
3 files +279/-13 exactly as the 005 report claims). Nothing was run (no npm, no
node, no servers); one `git log/show/status/diff` set and one grep of
`scripts/server.mjs` were the only non-read operations. This file is my one write.

---

## 1. Do the three reports agree? — YES, and 005 does not quietly redefine 004

Traced each DECIDED fix shape in brief 005 against what `6f767ff` actually ships:

| Brief 005 DECIDED | Shipped at 6f767ff | Match |
|---|---|---|
| M1: out-dir strictly inside worktree, not root, no `.git` entry, refuse before any delete, no override flag | `assertSafeOutDir()` (publish-staging.mjs:134-183), called before build and before the `fs.rm`; four ordered checks; no flag | Yes |
| M2: verify-in-place mode; verify derives closure from STAGED tree + STAGED registry; pinned sentinels (embedded engine, three.min, GLTFLoader, registry) + every staged-registry sidecar | `--no-emit` / `--artifact=` (implies no-emit); crawl runs against `absOutDir`; `PINNED_SENTINEL_ASSETS` (lib:57-62) + fresh `extractRegistrySidecars(absOutDir, ...)` with a hard failure on zero sidecars — both phases run in BOTH modes | Yes |
| M3: refuse query/fragment/dot-segments; legit subpath survives | `normalizeBaseUrl()` refuses `search`, `hash`, raw-string dot-segments (checked pre-parse via `rawPathSegments()`, correctly, since `new URL()` collapses them); returns parser-normalized href | Yes |
| M4: add audio+font extensions | `ASSET_EXT_RE` now `...mp3|ogg|wav|m4a|woff2?|ttf|otf` | Yes |

The chain is coherent: 004 proposed (including a heavier checksum-manifest idea),
the coordinator explicitly ruled the lighter fix shapes (state-file work log
~20:45 entry), and 005 implemented the ruled shapes and proved them with 004's
own attack commands, pre-fix and post-fix. Where 005 went beyond the brief
(credentials refusal, 8 MIME types, M6, M8) it declared each as a deviation and
each is genuinely small — no quiet narrowing found anywhere.

One honest nuance, allowed but worth stating plainly for the owner: **"deleting
a staged closure file → red" is true only in `--no-emit` mode.** The default
`npm run test:staging` still re-emits first (the brief explicitly permits this),
so a green default run still chiefly proves "the emit works," not "this artifact
is good." The pinned sentinels do add real value even in default mode (they
would catch source-page corruption that shrank the crawl), but the operational
rule the owner should internalize is: **before any real upload, verify the
exact tree with `--no-emit`, not with a default run.** Neither report states
that workflow rule this bluntly.

Numbers cross-check: 53 = 2 manifest fetches + 2×4×2 field checks + 28 closure
+ 4 sentinels + 3 sidecars — matches the code paths exactly. The 005 report's
quoted error strings match the shipped messages verbatim. `2ce4815` (concurrent
coordinator commit) is real and touches only state/task files, as 005 said.

## 2. Soundness of the two HIGH fixes

**M2 (verify-in-place): genuinely sound** for what it claims. No re-emit in
no-emit mode (publishStaging is simply never called); the sentinel and
registry-re-read phases are truly independent of the page-derived crawl; the
demonstrated 7-failure red on 004's 3-part mutation follows directly from the
code. Residual (decided, not a defect): checks are presence-only — HTTP 200 on
a truncated or 0-byte file still passes all 53 conditions. 004 parked the
checksum idea as owner Q2 and the coordinator chose the lighter shape, so this
is a known accepted gap; it belongs on the ship-caveat list because a partial
upload is exactly the failure mode a static-host deploy produces.

**M1 (delete guard): sound against every named attack, with one real bypass
neither the audit nor the hardening considered — NTFS case-insensitivity.**
All four checks compare paths case-SENSITIVELY on a case-INSENSITIVE
filesystem. The boundary checks (1, 2) fail SAFE under case variance (a
case-variant path is refused as "outside"). But check 3 —
`relFromRoot.split(sep).includes(".git")` — fails DANGEROUS: `--out=.GIT`
passes it (`".GIT" !== ".git"`), passes checks 1-2 (leaf casing only), and
reaches check 4, whose outcome hinges on which error Windows returns for
`stat("<root>\.GIT\.git")` — a stat through the existing `.git` worktree
pointer FILE. ENOENT → the guard passes and `fs.rm` deletes the `.git` pointer
(recoverable here: the gitdir file is one deterministic line; in a normal clone
it would be the entire object store). ENOTDIR → refused by accident, on an
error path never designed as a guard. Either way the DECIDED claim
"`--out=.git` … impossible — prove each" is proven only for exact case. Same
blind spot in `assertWithinRoot` and the sim server's `safeResolve` (both fail
safe). Fix is one line — lowercase both sides of the segment/boundary compares
on win32 — and is NOT ship-blocking (it requires the specific weird typo
`--out=.GIT`; the frozen 2.20 sibling stays protected in any casing because the
boundary check refuses it as outside, and its own `.git` file trips check 4).
Also noted: check 4 has a trivial TOCTOU window (stat, then rm later) —
irrelevant for a single-operator local tool, recorded for completeness.
Junction/symlink probing: `path.resolve` is lexical, but Node's `fs.rm` unlinks
a reparse point rather than recursing into its target, and a junction aimed at
either worktree sibling is caught by check 4 (both contain `.git`), so no
practical junction attack survives.

## 3. What BOTH the worker and the auditor missed

1. **The deploy-sim's "zero custom headers needed" proof cannot see CORS, and
   CORS is probably load-bearing for install.** The sim fetches with Node,
   which enforces no CORS at all — so "works with zero headers" is proven only
   for non-browser clients. But adding an extension to Owlbear is a
   cross-origin BROWSER fetch of the manifest by owlbear.rodeo, and the dev
   server pointedly sends full permissive CORS on exactly
   `/owlbear(-dice)?/` paths (server.mjs:45-52,129) — including
   `access-control-allow-private-network`, which exists solely to satisfy the
   browser's preflight for owlbear.rodeo→localhost. That is direct evidence the
   working local install path depends on CORS headers the emitted artifact
   does not and cannot carry. 001 waved this off in one line ("a real static
   host either supplies itself or doesn't need"), 004 never challenged it, 005
   wasn't asked. Consequence for the host choice: GitHub Pages sends
   `access-control-allow-origin: *` on everything (fine); Cloudflare Pages
   sends no CORS by default (needs a `_headers` file). The state file's
   host-note records only the COOP constraint — **the host requirement is
   actually a pair: no COOP, yes ACAO.** Two-minute check at host time;
   should be recorded next to the COOP line (I cannot edit the state file).
2. **NTFS case-insensitivity** — §2 above. 004's "Windows correctness" item
   audited separators only; 005 then wrote new case-sensitive guards.
3. **There is no post-upload verification entry point.** `--no-emit` verifies a
   local DIRECTORY through a local sim. The actual WS2 ship step — emit,
   upload, confirm the HOST serves it — has no mode: nothing accepts
   `--origin=https://real-host/base` and runs the same 53 checks against the
   live host (which would also incidentally catch the CORS/header issues in
   item 1 if run with a browser-ish client, and would catch truncated uploads
   if paired with size checks). All the check logic already exists; this is a
   missing ~20-line entry point and the single most valuable follow-up before
   first real staging.
4. **No browser-level smoke of the staged artifact ever runs.** test:vtt
   exercises the dev tree via Playwright; the deploy-sim is HTTP-only. Nothing
   ever loads `dist-staging/`'s pages in a real browser, so "all files
   servable" stands in for "pages boot" — 004 closed most of that gap by
   grepping the engine for runtime loads (zero external fetches), which is
   good static coverage, but one Playwright load of the staged panel/overlay
   against the sim server would make it empirical. Owner's cost/benefit call.

## 4. Ship-readiness verdict

**Yes — the WS2 pipeline is sound enough for the owner to stage on once a host
is chosen.** The emitted artifact was independently verified correct/complete
by 004; the two HIGH guard-rail holes are genuinely closed at `6f767ff` and
were proven closed with the audit's own attacks; suites are green.

Caveats, in priority order:
1. Host must send NO COOP **and DOES send ACAO** on the extension paths (both
   satisfied by GitHub Pages defaults; Cloudflare Pages needs a `_headers`
   file for the second). Record this pair with the host decision.
2. Owner Q8 still gates usefulness: the panel's Open-My-Character-Sheet button
   resolves the builder at `../` of the panel — dead unless the full builder
   app ships at the same base URL (this pipeline emits only the extensions).
3. Pre-upload ritual: verify the exact bytes with `--no-emit` (a default
   test:staging green is an emit-works proof, not an artifact proof), and
   remember the checks are presence-only — a truncated upload still passes.
   The missing `--origin=` post-upload check (miss 3) is the cheap real fix.
4. First real host visit re-downloads ~45MB twice across the two dice pages
   (004's M9, owner-gated) — expected, not a bug, until WS3/Q7 land.
5. Non-blocking code nit: one-line case-insensitive compare in
   `assertSafeOutDir` (and `assertWithinRoot`) closes the `.GIT` bypass.

No re-litigation of 004's confirmed findings was performed; its item-by-item
verification stands. No tracked file was touched; this report is my only write.
