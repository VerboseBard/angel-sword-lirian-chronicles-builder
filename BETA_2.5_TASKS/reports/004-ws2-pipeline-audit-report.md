# Report — Task 004: Adversarial cross-audit of commit `5384bce` (WS2 staging publish pipeline)

Executor: Claude Opus 5 sub-agent, 2026-08-25 (post-budget-reset re-dispatch; an
earlier attempt was killed within a minute for budget and produced nothing).
Nothing was patched, refactored, or re-implemented. No tracked file was edited
except this report.

---

## 0. Headline

**The artifact this pipeline emits is correct and complete. The guard rails
around the process that emits it are not.**

Every byte-level claim in the 001 report checked out: the closure is genuinely
complete (I rebuilt the reference list from the real pages and diffed it), the
manifest rewrite is exact parity with `server.mjs`, query strings are handled,
Windows paths are handled, and the arithmetic in the report is right. I found
**two real holes** — one of them serious — plus eight smaller misses, all of
which are process/guard-rail problems rather than output problems.

- **Worst finding: `--out=<anything>` is an unvalidated, un-anchored
  `fs.rm(..., { recursive: true, force: true })` target.** `--out=../../..`
  computes to `E:\`. `--out=.` computes to the worktree root (including
  `.git` and the uncommitted `BETA_2.5_PROJECT_STATE.md`).
  `--out=../Angel Sword Lirian Chronicles Public Beta 2.20` computes to the
  **frozen** sibling the project state forbids touching. I proved the deletion
  fires by running the real script against a canary directory in my own
  scratchpad. Severity: **HIGH**.
- **Second finding: the deploy-sim cannot detect a broken staged tree**, because
  it wipes and re-emits before it verifies. I deleted `dice-3d-embedded.js`
  (2.8 MB, in both dice pages' load chains), deleted the promoted registry, and
  corrupted two `owlbear/manifest.json` fields back to relative paths — then ran
  `npm run test:staging`, which reported **PASS, 46/46**. Severity: **HIGH**
  (it is not the check the report implies it is).

**Verdict: `5384bce` is safe to build WS2 staging on, conditional on one small
guard being added before anyone runs `publish:staging` with a non-default
`--out`.** See §3.

**Tally:** 8 checklist items — **PASS 3** (items 2, 3, 6), **FAIL 2** (items 1,
5), **NUANCED 2** (items 4, 7), **inventory** 1 (item 8, which asks for a list,
not a verdict). **10 misses** found.

---

## 1. Verdict per checklist item

### Item 1 — Deletion safety (highest priority): **FAIL**

The deletion target is **not** hard-anchored. Exact construction,
`scripts/publish-staging.mjs`:

```js
// line 93
const absOutDir = path.isAbsolute(outDir) ? outDir : path.join(projectRoot, outDir);
...
// line 106
await fs.rm(absOutDir, { recursive: true, force: true });
```

There is no check that `absOutDir` is inside `projectRoot`, no check that it is
empty or non-existent, no marker file, no prompt, and no `--force` gate.

**What IS safe (each verified):**

| Redirection vector | Safe? | Why |
|---|---|---|
| **cwd** | ✅ safe | `PROJECT_ROOT = path.resolve(__dirname, "..")` (line 29) is derived from `import.meta.url`. I ran the script from `C:\` and the emit still targeted the worktree. |
| **env** | ✅ safe | `LYRIAN_STAGING_BASE_URL` (line 137) feeds `baseUrl` only. No env var reaches `outDir`. |
| **hostile base URL** | ✅ safe | `baseUrl` never touches a filesystem path; it is consumed only by `absolutizeManifest()`. `normalizeBaseUrl()` (line 92) also throws on anything non-http(s) *before* the `rm` on line 106. |
| **`--out=` / positional** | ❌ **NOT safe** | See below. |

**Computed `fs.rm` targets** (exact reproduction of line 93; not executed):

```
--out="dist-staging"        => ...\Angel Sword Lirian Chronicles Beta 2.5 Online\dist-staging   (intended)
--out="."                   => ...\Angel Sword Lirian Chronicles Beta 2.5 Online   <-- whole worktree + .git
--out=".."                  => E:\Chat gpt Codex\Angels sword
--out="../.."               => E:\Chat gpt Codex
--out="../../.."            => E:\                                                 <-- entire drive
--out="../Angel Sword Lirian Chronicles Public Beta 2.20"
                            => ...\Angel Sword Lirian Chronicles Public Beta 2.20   <-- the FROZEN sibling
--out="C:\Windows"          => C:\Windows
--out="E:\"                 => E:\
--out="\\server\share"      => \\server\share                                       <-- UNC, off-machine
```

`--out=""` and `--out="."` both normalize to the worktree root.

**Empirical proof the `rm` actually fires** (run inside my own scratchpad, never
against project data):

```
=== BEFORE ===
.../scratchpad/deletion-proof/IMPORTANT.txt
.../scratchpad/deletion-proof/precious-subdir/nested.txt

$ node scripts/publish-staging.mjs --base-url=https://hostile.invalid/x --skip-build --out=.../scratchpad/deletion-proof
Emitting staging artifact to .../scratchpad/deletion-proof for base URL https://hostile.invalid/x
Emitted 2 extensions + 14 shared dice asset(s) to .../scratchpad/deletion-proof

=== AFTER ===
ls: cannot access '.../deletion-proof/IMPORTANT.txt': No such file or directory
ls: cannot access '.../deletion-proof/precious-subdir': No such file or directory
=== what is there now ===
assets  owlbear  owlbear-dice
```

Pre-existing user data in the target directory was destroyed without warning.

**How reachable is this in practice?** `--out=` is a *documented* flag in the
script's own usage header (line 18) and is forwarded by
`test-staging-deploy.mjs` too (its `parseArgs`, line 62 → line 127 → line 133).
The realistic trigger is not an attacker; it is an operator typo — `--out=.` or
`--out=..` on a tired evening — which in this worktree means losing `.git` plus
the uncommitted `BETA_2.5_PROJECT_STATE.md`, or reaching the frozen 2.20 folder.
A second, quieter instance of the same pattern is `copyDirWholesale()` (line 68),
which also does an unguarded `fs.rm(dest, {recursive:true, force:true})` —
same anchor, so it inherits the same exposure.

The 001 report celebrates this `rm` as the mechanism that guarantees clean
reruns ("by construction"), which is true for the default path — but it never
asks what happens when the path is not the default.

---

### Item 2 — Closure completeness: **PASS**

I built my own reference list by reading the real pages, then diffed. It matches
exactly, and the two named risks are covered.

**Reference list derived by hand (from source, not from the script):**

- `owlbear/`: manifest seeds → `manifest.json`, `icon.svg`, `background.html`,
  `panel.html`; markup of those two pages → `dist/background.js`,
  `dist/panel.js`. = **6**
- `owlbear-dice/`: the same four, plus `overlay.html` (only reachable via
  `background.js`'s `new URL("overlay.html", ...)`), plus `dist/background.js`,
  `dist/panel.js`, `dist/overlay.js`. = **8**
- shared: the inline loader arrays in `owlbear-dice/panel.html` (lines 74–94) and
  `overlay.html` (lines 50–70) name the registry + 2 vendor + 8 `dice-3d/*`
  files, and the registry names 3 sidecars. = **14**
- **Total 28** — matches the script's report exactly.

**`dice-3d-embedded.js`: present.** `dist-staging/assets/dice-3d/dice-3d-embedded.js`
exists, 2,780,150 bytes, and is one of the 28 files fetched HTTP 200 by the
deploy-sim. This was the brief's specific worry (sequential `.reduce` chain — one
404 kills the engine); it is covered.

**Every `faceArtScript` sidecar: present.** The registry names exactly three
(`asari-full-set-draft.js`, `leaflit-full-set.js`, `rana-full-set.js`); all three
are in `dist-staging/assets/dice-3d/promoted/`.

**CSS / icons / fonts / `background.html`:** there is **no external CSS file
anywhere** in either extension — `owlbear/panel.html`, `owlbear-dice/panel.html`
and `overlay.html` all use inline `<style>`; `owlbear/background.html` and
`owlbear-dice/background.html` are 4-line shells whose only reference is
`dist/background.js` (both in the closure). No `@font-face`, no `url(...)`, no
web fonts (the pages use `"Segoe UI", system-ui, sans-serif` — system stacks).
Both `icon.svg`s are in the closure.

**Nothing further is loaded at runtime by the engine.** I grepped all seven
closure engine files plus both vendor files for external asset references
(`.glb .gltf .bin .mp3 .ogg .wav .woff/2 .ttf .otf .png .jpg .webp .json .hdr
.ktx2 .svg` as quoted literals) and for `fetch(` / `new XMLHttpRequest` /
`.loadAsync(` / `loader.load(` / `new GLTFLoader`: **zero hits of any kind.** All
face art is base64 `data:` URIs inside the sidecars and inside
`new-angelsword-dice-face-art.384-webp.js`. The only two `glb` substrings in
`dice-3d-embedded.js` are inside base64 payloads. `GLTFLoader.js` ships but is
inert because both pages set `window.LYRIAN_DISABLE_LEGACY_GLB_DICE = true`.

**esbuild is not code-splitting** (`scripts/build-owlbear.mjs`: `bundle: true`,
`format: "esm"`, no `splitting`), so there are no unaccounted-for chunk files.

**Also confirmed:** the `/api/vtt-relay/events` calls are not merely
try/caught — they are **hostname-gated** and never fire on a staging host:
`owlbear/panel.js:630` wraps both the immediate call and the 2.5 s interval in
`if (isDevRelayHost())` (line 68: `/^(?:localhost|127\.0\.0\.1|\[::1\])$/i`),
and `owlbear/background.js:122` does the same for its 1.5 s poll. So a
subpath-hosted staging deploy will not produce a background 404 storm against
the host root. This is *better* than the 001 report claimed (see item 7).

---

### Item 3 — Query-string handling: **PASS** (both halves)

**Stripped before filesystem copy.** `scripts/lib/owlbear-staging-assets.mjs`
line 127:

```js
sidecars.add(match[1].split("?")[0].replace(/\\/g, "/"));
```

Evidence: the registry's raw values carry versions —
`"faceArtScript": "assets/dice-3d/promoted/rana-full-set.js?v=20260810042336"` —
and the staged files land as bare `rana-full-set.js`. Correct.

**Still resolves on a query-ignorant static host.** The staged registry
deliberately keeps its `?v=` suffixes (it is copied byte-for-byte), and the dice
pages request `"../" + src`, i.e. the versioned URL. I replayed the exact
14 runtime-shaped requests both pages emit — including `V` on the engine files
and the registry's own `?v=` on the three sidecars — against a deliberately
dumbest-possible static server that resolves by `pathname` only:

```
200  /assets/dice/promoted-dice-skins.registry.js?v=20260825-numeral-dots-v3
200  /assets/dice-3d/dice-3d-embedded.js?v=20260825-numeral-dots-v3
200  /assets/dice-3d/new-angelsword-dice-face-art.384-webp.js?v=...
200  /assets/vendor/three.min.js
200  /assets/vendor/GLTFLoader.js
200  ... (6 more dice-3d files) ...
200  /assets/dice-3d/promoted/asari-full-set-draft.js?v=20260810003206
200  /assets/dice-3d/promoted/leaflit-full-set.js?v=20260809221238
200  /assets/dice-3d/promoted/rana-full-set.js?v=20260810042336

14 runtime-shaped requests replayed, 0 non-200.
```

Note (not a defect, a coverage gap): the shipped deploy-sim only ever fetches the
**bare** paths, never the `?v=` form. The versioned form works, but nothing in
the suite asserts it.

---

### Item 4 — Manifest rewrite parity: **NUANCED**

**Parity with `server.mjs`: exact.** `scripts/server.mjs:148-159` rewrites
`icon`, `background_url`, `action.icon`, `action.popover` via
`new URL(value, base)` where `base = http://<host>/<extDir>/`.
`absolutizeManifest()` (lib lines 208-220) does the same four with
`extensionBaseUrl()` producing the same trailing-slash-terminated base. There is
**no fifth URL-bearing field** in either manifest — I diffed the source and
staged manifests field by field:

```
  SAME  name / version / manifest_version / description / author / homepage_url
  SAME  action.title / action.width / action.height
CHANGED icon           : "icon.svg"       -> "https://.../owlbear/icon.svg"
CHANGED background_url : "background.html"-> "https://.../owlbear/background.html"
CHANGED action.icon    : "icon.svg"       -> "https://.../owlbear/icon.svg"
CHANGED action.popover : "panel.html"     -> "https://.../owlbear/panel.html"
```

`homepage_url` stays the real external GitHub Pages URL. Exactly 4 changes.

**Awkward base inputs — correct** (real emits run for the starred ones):

| Input | Result |
|---|---|
| `https://staging.invalid/as` | ✅ `.../as/owlbear/icon.svg` |
| `https://staging.invalid/as/` ★ | ✅ identical (trailing slash stripped) |
| `https://staging.invalid/as///` | ✅ identical |
| `https://staging.invalid` | ✅ `https://staging.invalid/owlbear/icon.svg` |
| `https://staging.invalid/` | ✅ identical |
| `https://staging.invalid:8443/deep/sub/path` ★ | ✅ `...:8443/deep/sub/path/owlbear/icon.svg` |
| `http://staging.invalid/as` | ✅ http preserved |
| `ftp://...`, `//host/as` | ✅ rejected with a clear message |

**Hostile / sloppy base inputs — silently wrong from `publish:staging`.**
`normalizeBaseUrl()` (publish-staging.mjs:48-65) validates only that the string
parses as a URL and is http(s), then does `candidate.replace(/\/+$/, "")` — it
never strips a query, a fragment, or dot-segments, and never re-serializes:

| Input | Baked `icon` | Problem |
|---|---|---|
| `https://staging.invalid/as?x=1` | `https://staging.invalid/owlbear/icon.svg` | **subpath `/as` silently lost** (relative resolution discards the query and the last segment) |
| `https://staging.invalid/as#frag` | `https://staging.invalid/owlbear/icon.svg` | same |
| `https://staging.invalid/as/./..` | `https://staging.invalid/owlbear/icon.svg` | same |
| `HTTPS://STAGING.INVALID/As` | `https://staging.invalid/As/owlbear/icon.svg` | manifest is *correct*, but `test:staging`'s prefix assert compares against the raw un-normalized string and goes **falsely red** |
| `https://staging.invalid/a s` | `.../a%20s/owlbear/icon.svg` | manifest correct, verifier falsely red (raw vs percent-encoded) |
| `https://user:pw@staging.invalid/as` | `https://user:pw@.../owlbear/icon.svg` | credentials baked into a public manifest |

The mitigating fact: `test:staging` **does** catch the first three loudly
(verified, see item 5). The unmitigated fact: `publish:staging` — the command
that actually produces the upload — runs no such check and prints the wrong URLs
as if they were right. `npm run publish:staging -- --base-url=<url copy-pasted
from a browser address bar with a `?utm_source=…` on it>` is the realistic path
to a silently mis-baked upload.

---

### Item 5 — Verifier honesty: **FAIL** (half of it works; the important half cannot fire)

**Server hygiene: PASS, all four sub-claims verified in code.**
`startDumbStaticServer()` (test-staging-deploy.mjs:79-116) writes exactly one
header — `res.writeHead(200, { "content-type": type })`, line 105 — so no CORS,
no `cache-control`, no COOP/COEP, no relay endpoints; it binds
`server.listen(0, "127.0.0.1")` (line 114), i.e. ephemeral port on loopback
only; `main()` closes it inside a `finally` block (lines 217-222), and the exit
code is set via `process.exitCode = 1` on failure (verified: `exit=1`). Ephemeral
ports observed across my runs (56602, 65390, 55130) were all released.

**Mutation test 1 — corrupt a manifest field: the check FIRES.** I could not
reach this path by hand-editing (see below), so I drove it through a base URL
that makes the emit produce mismatching URLs. Real shipped-script output:

```
$ node scripts/test-staging-deploy.mjs "--base-url=https://staging.invalid/as?x=1"
Checked 38 condition(s) covering 2 manifests and 28 closure files.
FAIL - 8 problem(s):
  - owlbear/manifest.json: field "icon" = "https://staging.invalid/owlbear/icon.svg"
      is not baked under base URL prefix "https://staging.invalid/as?x=1/owlbear/"
  ... (all 4 fields × both manifests) ...
exit=1
```

38 rather than 46 because a failed field `continue`s past its own asset fetch —
the arithmetic is internally consistent.

**Mutation test 2 — delete closure files + corrupt manifests by hand: the
verifier is BLIND.** This is the finding. `test-staging-deploy.mjs` line 133
calls `publishStaging({...})` unconditionally, which wipes and re-emits
`dist-staging/` before a single check runs. So there is no way to point it at a
tree and ask "is this tree good?" I mutated the freshly-emitted staged tree
three ways at once:

1. deleted `dist-staging/assets/dice-3d/dice-3d-embedded.js` (2.8 MB, position 3
   in both pages' sequential load chains — a 404 here kills the dice engine);
2. deleted `dist-staging/assets/dice/promoted-dice-skins.registry.js` entirely;
3. rewrote `dist-staging/owlbear/manifest.json` so `icon` → `"icon.svg"` and
   `action.popover` → `"panel.html"` (relative paths, i.e. exactly the bug the
   pipeline exists to prevent).

Then ran the shipped check:

```
$ npm run test:staging
Checked 46 condition(s) covering 2 manifests and 28 closure files.
PASS - deploy-simulation green for base URL https://staging.invalid/as.
```

**All three mutations were erased and reported as green.**

The structural consequence is worse than the demo. The emit copies
`crawlExtensionAssets(<source>).sharedAssets`; the verifier then re-derives
`crawlExtensionAssets(<staged>)` — the *same function* over a tree the *same
process* created milliseconds earlier from the *same source*. I ran both crawls
side by side: **identical, 28 files each, byte-for-byte the same list.** So the
"every closure file resolves HTTP 200" assertion is close to tautological: it can
only fail if `fs.copyFile` silently failed, and a genuinely missing source file
would crash the *emit* with a raw `ENOENT` before the verifier ever ran.
Relatedly, the "is not an absolute URL" branch (lines 168-172) is unreachable
from the shipped harness, since `new URL(v, base).href` is always absolute.

The 001 report's phrasing — "independently re-crawls the **staged** tree (not the
emit step's in-memory list)" — is literally true and materially misleading. It
is independent of the *bookkeeping*, not of the *emit*. Nothing in the suite
validates the bytes that will actually be uploaded.

---

### Item 6 — Windows correctness: **PASS**

The posix/native split is applied consistently and correctly:

- URL-space math uses `path.posix` only: `resolveRelative()` (lib:56-58),
  `path.posix.basename` (lib:107, 169).
- Filesystem-space math converts explicitly: `toFsPath()` (lib:52-54) and
  `copySharedAsset()` (publish-staging:73-79) both do
  `path.join(root, ...relPosixPath.split("/"))`, so a posix path becomes a native
  one — never a string concat.
- `extractRegistrySidecars()` normalizes any Windows separator that leaks in from
  a registry written on win32: `.replace(/\\/g, "/")` (lib:127).
- The sim server's `safeResolve()` handles both separators
  (`normalized.replace(/^[/\\]+/, "")`, test-staging-deploy:70-71).

Empirical: all 28 closure files resolve HTTP 200 over HTTP from the staged tree,
i.e. staged files land exactly where the URL paths expect on win32. Both staged
manifests contain **zero** backslashes (grep count 0/0); every baked URL uses
forward slashes. Extension directory names are lowercase in both the constant and
on disk, so the artifact will still resolve on a case-sensitive Linux host.

---

### Item 7 — Report accuracy: **NUANCED** (numbers all correct; one claim
materially misleading, one understated)

Spot-checks, all independently reproduced:

| Report claim | Verdict |
|---|---|
| "46 conditions" | ✅ observed. Arithmetic: 2 manifest fetches + (2 ext × 4 fields × 2 checks) + 28 closure fetches = 2 + 16 + 28 = **46**. |
| "28 closure files" | ✅ observed, and matches my independent hand-derived list (6 + 8 + 14). |
| "six promoted files, three named by the registry" | ✅ `assets/dice-3d/promoted/` holds 6 (`asari-d20.js`, `asari-full-set-draft.js`, `exact-reference-test.js`, `leaflit-full-set.js`, `my-custom-dice-set.js`, `rana-full-set.js`); the registry names exactly 3. The 3 orphans total ~4.86 MB — independently corroborating the 002 scout. |
| "`resolveBuilderUrl()` = one directory above the panel, no config point" | ✅ `owlbear/panel.js:64-65`: `return new URL("..", window.location.href).href;`. Called at lines 515 and 532. No override, no env, no manifest field. The builder-co-hosting question (owner Q8) is real. |
| "45 MB closure", "36 files", "stable across two runs" | ✅ `du -sh dist-staging` = 45M, `find -type f | wc -l` = 36, stable across my four emits. |
| "`assets/dice-3d` is 48MB, `assets/dice` is 22MB" | ✅ 48M / 22M. |
| "no dev/sim server left running; :4176 pre-existed at 10:21 AM" | ✅ confirmed — PID 22928, `StartTime 8/25/2026 10:21:14 AM`, still the only listener on 4176. I never started, stopped, or used it. |
| "independently re-crawls the STAGED tree" | ⚠️ **misleading** — see item 5. |
| "`fetch("/api/vtt-relay/events")` … already tolerant of 404s on static hosting" | ⚠️ **understated** — it is hostname-gated and never fires off localhost at all (`owlbear/panel.js:630`, `owlbear/background.js:122`). The conclusion (safe on static hosting) is right; the stated reason is weaker than the truth. |

I found **no factual error** in the 001 report — every number, size, and path it
asserts is reproducible. Its weakness is one over-claimed guarantee, not
inaccuracy.

---

### Item 8 — Bounded miss-hunt (inventory, not a verdict)

Runtime-loaded asset patterns the crawler cannot see, within the three shipped
scripts and the two dice HTML pages:

1. **Extension allow-list is JS/CSS/image-only.**
   `ASSET_EXT_RE = /\.(?:js|mjs|css|svg|png|jpg|jpeg|webp|json)$/i` (lib:39).
   Not matched: `.mp3 .ogg .wav .m4a` (audio), `.woff .woff2 .ttf .otf` (fonts),
   `.glb .gltf .bin` (models), `.mp4 .webm`, `.gif .ico .avif .bmp`. Nothing
   today needs them — but **WS4 is "wire the builder's existing roll sounds into
   the warm overlay"**, the very next queue item, and those sound files would be
   silently omitted from every staging emit with no test going red.
2. **Only `faceArtScript` is read out of the registry** (lib:126). Today that is
   the registry's only file-path key (I enumerated every quoted key: `id, name,
   description, author, generatedAt, geometryContract, faceCount, availableDice,
   previewUrl, faceArtScript, palette{...}` — `previewUrl` is a base64 `data:`
   URI, not a file). Any future key naming a real file is missed silently.
3. **Literals that already carry a query string are dropped.** `PATH_LIKE_RE`
   (lib:40) rejects `?`, and `ASSET_EXT_RE` anchors on `$`. Today the pages write
   `"…js" + V` (concatenated), so the literal is bare and matches. The instant
   anyone inlines a version — `src="../assets/dice-3d/foo.js?v=1"` — that file
   vanishes from the closure with no warning. A one-character refactor away from
   a broken emit.
4. **CSS `url(...)` is not parsed.** No impact today (all three styled pages use
   inline `<style>` with no `url()`), but any future external stylesheet's
   references would be invisible.
5. **HTML refs are resolved against the extension dir, not the file's own
   directory** (lib:117-118), and `extractHtmlAssetRefs` re-derives the file via
   `path.posix.basename(seed)` (lib:169). A page moved into a subfolder
   (`owlbear/pages/foo.html`) would be read from the wrong location and its refs
   resolved wrongly.
6. **The crawl is a single pass over a snapshot of the seed set** (lib:167 —
   `for (const seed of [...seeds])`). An HTML page linking another HTML page is
   never followed. Correct today (leaves only) and honestly commented, but it is
   the mechanism that made `EXTRA_ENTRY_HTML` necessary, and the next
   JS-opened page will need the same manual entry.
7. **`resolveRelative()` can produce root-escaping paths.** A literal like
   `"../../secret.js"` in an extension page normalizes to `../secret.js`, is
   classified as a shared asset, and `copySharedAsset()` will `path.join` it
   outside `projectRoot` and write it outside `outDir` — no boundary check on
   either end. Needs hostile content already in the repo, so this is defense in
   depth rather than a live hole.
8. **The two dice pages use different cache-busters for the same files.**
   `owlbear-dice/panel.html:74` → `?v=20260811-srgb-dice-v1`;
   `overlay.html:50` → `?v=20260825-numeral-dots-v3`. On a real CDN a user who
   opens both the popover and the overlay downloads the same ~45 MB **twice**
   under two cache keys. Pre-existing repo state, not introduced by `5384bce`,
   but it becomes a bandwidth and first-load problem the moment this is hosted.
9. **The wholesale directory copy publishes unserved source.** `dist-staging/`
   ships `owlbear/{core,panel,opener-bridge,sdk,background}.js` and
   `owlbear-dice/{panel,overlay,background}.js` — the un-bundled esbuild inputs
   that no page loads (~60 KB). Harmless functionally; `sdk.js` even contains a
   bare `import "@owlbear-rodeo/sdk"` that would 404 if anything ever fetched it.
   Worth an explicit owner decision, since staging is public-ish.

---

## 2. Misses found (10)

| # | Severity | Miss | Suggested follow-up task (NOT a patch) |
|---|---|---|---|
| M1 | **HIGH** | `--out=` is an unvalidated `fs.rm(recursive, force)` target; `--out=.` → worktree + `.git`, `--out=../../..` → `E:\`, and the frozen 2.20 sibling is two dots away. Proven by execution. | "Anchor the staging output directory": require the resolved out-dir to be inside the worktree, refuse a path that exists and is not a previous emit (marker file), and drop or gate `--out=` behind an explicit flag. |
| M2 | **HIGH** | `test:staging` re-emits before verifying, so it cannot detect a corrupted, incomplete, or stale artifact — it PASSED with a 2.8 MB engine file and the registry deleted and two manifest fields corrupted. The closure assertion is near-tautological (identical crawl of source vs staged). | "Add a `--no-emit` / verify-existing mode to the deploy-sim" so the exact bytes about to be uploaded are the bytes checked; consider a stored manifest of expected files + sizes as the independent reference. |
| M3 | **MEDIUM** | `normalizeBaseUrl()` accepts query strings, fragments, dot-segments, spaces and uppercase schemes; `publish:staging` alone then bakes silently-wrong manifests (subpath lost) or manifests that make `test:staging` falsely red. | "Harden the staging base URL": re-serialize through `new URL()`, reject/strip `search`/`hash`/credentials, normalize case, and compare the verifier's prefix against the normalized form. |
| M4 | **MEDIUM** | Crawler extension allow-list has no audio/font/model/video types — **WS4's roll sounds will be silently absent from staging.** | "Extend the staging crawler's asset allow-list before WS4 lands" (audio + fonts at minimum), with a WS4 regression assert that the sound files appear in the closure. |
| M5 | LOW-MED | Only `faceArtScript` is read from the registry; a future URL-bearing registry key is missed silently. | Fold into the WS6 registry-gate task: assert the closure covers every file-path-shaped registry value, not a hard-coded key. |
| M6 | LOW | A quoted literal that already contains `?v=` is silently dropped from the closure. | Same task as M4: strip the query before the extension test rather than anchoring on `$`. |
| M7 | LOW | HTML refs resolve against the extension dir, not the containing file's dir; `basename()` re-derivation breaks for pages in subfolders. | Small hardening ticket alongside M4/M6. |
| M8 | LOW | `resolveRelative()` can emit `../`-escaping paths that `copySharedAsset()` will read and write outside the project root / out dir unchecked. | Add a boundary assert in the copy step (same task as M1). |
| M9 | LOW (pre-existing) | `panel.html` and `overlay.html` carry different `?v=` tokens for the same ~45 MB of files → duplicated CDN downloads per user. | "Unify the dice-page cache-buster token" — one shared constant; touches the state file's cache-buster rule, so owner-visible. |
| M10 | INFO | The emit publishes ~60 KB of unserved un-bundled source (`core.js`, `panel.js`, `opener-bridge.js`, `sdk.js`, `background.js`, …) because extension dirs are copied wholesale. | Owner decision: acceptable, or prune the copy to the crawled closure? Natural fit with WS3 slimming. |

None of M1–M10 was noted in the 001 report.

---

## 3. Overall: is `5384bce` safe to build WS2 staging on?

**Yes — with one guard added first.**

What it produces is right. The emitted folder is complete (28/28 referenced files
present and servable, `dice-3d-embedded.js` included, all three real sidecars
included, the three orphans correctly excluded), the manifests are exact
`server.mjs` parity with nothing else disturbed, query strings are handled on
both sides, Windows paths are handled, and it works on a header-free static
server. The design choice that most impressed me is the one the report is
proudest of and is genuinely right: crawling the registry rather than copying
`assets/dice-3d/` wholesale, which is what surfaced the six-vs-three orphan
finding.

What it does not do is protect the operator or validate the upload:

- **M1 should be fixed before anyone uses `--out=` in anger.** The default
  `npm run test:staging` / `npm run publish:staging -- --base-url=…` path is
  safe; the danger is one typo away and the blast radius reaches `.git`, the
  frozen 2.20 folder, and `E:\`. This is a ~5-line guard, not a redesign.
- **M2 should be fixed before the pipeline is trusted as a release gate.** Right
  now a green `test:staging` means "the emit code works", not "this artifact is
  good". That distinction matters the moment the artifact is produced once and
  uploaded later, which is exactly the WS2 workflow.

Neither is a reason to redo or revert the commit. Build on it; queue M1 and M2 as
the first two follow-ups, and M4 before WS4 starts.

---

## 4. Work narrative

**Reading (in order).** `BETA_2.5_PROJECT_STATE.md`, this brief, then brief 001
and its report, then the three shipped scripts. Then — deliberately before
running anything — I read the *sources of truth* the report describes, so my
reference list would be mine and not its: both `manifest.json`s,
`owlbear/panel.html`, `owlbear/background.html`, `owlbear-dice/panel.html`,
`owlbear-dice/overlay.html`, `owlbear-dice/background.html`, and
`scripts/server.mjs`'s `serveStatic` manifest branch (lines 146-170) for parity.
That order mattered: I hand-derived 6 + 8 + 14 = 28 and 2 + 16 + 28 = 46 *before*
running the script, so the match is a real cross-check rather than confirmation
bias.

**Baseline.** Ran `node scripts/test-staging-deploy.mjs`: 46 conditions, PASS,
36 files, 45 MB. Listed the whole staged tree and diffed it against my
hand-derived list — exact match, including the three sidecars and the absence of
the three orphans.

**Deletion safety (the part I spent most effort on).** Traced `outDir` from
`parseArgs` → `publishStaging` → line 93 → line 106 and found no anchor. Checked
each redirection vector the brief named: cwd (safe — proven by running the script
from `C:\`), env (safe — only feeds `baseUrl`), hostile base URL (safe — never
reaches a path, and `normalizeBaseUrl` throws before the `rm`), arguments
(**not** safe). Computed the `rm` targets for nine hostile `--out` values without
executing them, then proved the deletion actually fires by pointing the real
script at a canary directory **inside my own scratchpad** — never at project
data — and showing the pre-existing files were gone. Cleaned the scratchpad
immediately after.

**Verifier honesty.** My first plan was the brief's: hand-mutate `dist-staging/`
and expect red. That plan *failed to produce a red* — which turned out to be the
finding, not a dead end. I mutated three ways at once (deleted the 2.8 MB
`dice-3d-embedded.js`, deleted the registry, corrupted two manifest fields to
relative paths) and `npm run test:staging` still said PASS/46, because line 133
re-emits first. I then had to find a *different* way to prove the check logic
works at all — I could not edit tracked files, and no hand-edit survives the
re-emit. The way in was a base URL the emit itself mis-bakes: a query-string base
URL made 8 manifest-field assertions fire with `exit=1`. Finally I ran
`crawlExtensionAssets` over the source tree and the staged tree side by side and
got byte-identical 28-file lists, which is what turned "the mutation test didn't
work" into the structural claim that the closure assertion is near-tautological.

**Base URL matrix.** Imported the shipped `extensionBaseUrl` /
`absolutizeManifest` (not copies) and drove 15 base URLs through them, with
`normalizeBaseUrl` reproduced verbatim since it is not exported — I flagged that
reproduction explicitly rather than pretending it was the shipped function. Then
ran two *real* emits (trailing slash; port + deep subpath) as the brief demanded,
plus one real verifier run on the query-string case, and did a field-by-field
diff of source vs staged manifests to prove exactly four fields move.

**Closure hunt.** Grepped the seven closure engine files plus both vendor files
for external asset literals and for `fetch` / XHR / GLTF loads: zero. Chased the
two `glb` substrings in `dice-3d-embedded.js` and found them inside base64
payloads. Enumerated every quoted key in the promoted registry to check whether
`faceArtScript` is really the only path-bearing field (it is). Checked
`build-owlbear.mjs` for code splitting (none). Checked whether the
`/api/vtt-relay/events` polls are gated (they are — hostname-gated, better than
the report says).

**Dead ends.** (a) The hand-mutation test, as above — it became the second-worst
finding. (b) I looked for a way to make the verifier check a pre-existing tree
without editing tracked files and concluded there is none — `--out=` still
re-emits into wherever you point it, which is itself part of M2. (c) I
considered temporarily renaming a source file to force an emit-time failure and
rejected it: that is a tracked-tree mutation, forbidden by the brief, and a
sibling read-only agent was live in this tree. (d) An early `node -e` one-liner
for the path probe died on Windows backslash escaping through the shell; I moved
the probes into scratchpad `.mjs` files, which also made them quotable evidence.
(e) A scratchpad `import` of the shipped lib by bare Windows path failed with
`ERR_UNSUPPORTED_ESM_URL_SCHEME` ('e:' read as a protocol); fixed with
`pathToFileURL` + dynamic `import`.

**Final state.** Re-ran `node scripts/test-staging-deploy.mjs` to leave
`dist-staging/` freshly and cleanly emitted (36 files, 45 MB, 46/46 PASS, base
`https://staging.invalid/as` — exactly the state 001 left). No servers of mine
running: every sim port (56602, 65390, 55130) released; `:4176` is PID 22928,
started 10:21:14 AM, hours before this session — never started, stopped, or
relied on by me. `git status --porcelain` shows only the pre-existing
` M BETA_2.5_PROJECT_STATE.md`, ` M BETA_2.5_TASKS/TASK_TEMPLATE.md`, and
`?? BETA_2.5_TASKS/004-ws2-pipeline-audit.md` — no tracked-file change from me.
No commit (audit task). Scratchpad probes discarded except as quoted evidence
above.

## 5. Questions parked for the owner

1. **M1 fix shape:** should `publish:staging` simply refuse any `--out` outside
   the worktree (my recommendation), or keep the flag and require an explicit
   `--allow-outside` + a non-existent/marker-bearing target?
2. **M2 fix shape:** add a `--no-emit` verify-existing mode to the deploy-sim, or
   go further and have the emit write a checksum manifest the verifier checks
   against? The second is the only version that would catch a truncated upload.
3. **M4 timing:** extend the crawler's asset allow-list now, or make it part of
   the WS4 sound task? (If WS4 lands first, staging silently ships without
   sounds and nothing goes red.)
4. **M10:** is publishing ~60 KB of unserved, unminified extension source in the
   staging artifact acceptable, or should the emit copy only the crawled closure?
5. **M9:** the two dice pages' mismatched `?v=` tokens double the 45 MB download
   on a real host — worth unifying before staging goes up? (Touches the state
   file's standing cache-buster rule, so it is an owner call.)
