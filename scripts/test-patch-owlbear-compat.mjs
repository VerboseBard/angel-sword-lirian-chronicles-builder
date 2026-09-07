/* Task 012: actual current/candidate transport code in four pairings.
   Pure local contracts: no browser, network, server, live saves or Owlbear SDK.
   The dependency-free sheet ESM runs in a fresh VM realm after removing only
   export declarations. Production opener factory/core imports and the exact
   panel handoff guard run unchanged with injected windows/clock/storage.
   This does not prove real iframe embedding, multi-user ownership or visual dice.
   node scripts/test-patch-owlbear-compat.mjs [--current-root=...] [--out=...] [--browser]
*/
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import http from 'node:http';
import {fileURLToPath, pathToFileURL} from 'node:url';

const candidateRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const option = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const currentRoot = path.resolve(option('current-root') || path.join(candidateRoot, '..', 'Angel Sword Lirian Chronicles Beta 2.5 Online'));
assert.notEqual(candidateRoot, currentRoot, 'Current/candidate roots must be distinct');
const out = path.resolve(option('out') || path.join(candidateRoot, 'qa-test-results', 'patch-2026-09-07-compat'));
const json = (value) => JSON.parse(JSON.stringify(value));
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(setImmediate); };
let checks = 0;
const equal = (actual, expected, label) => { assert.deepEqual(json(actual), json(expected), label); checks++; };
const truth = (actual, label) => { assert.ok(actual, label); checks++; };

function makeClock() {
  let now = 1_000_000, id = 0;
  const timers = new Map();
  const set = (fn, ms, interval) => { timers.set(++id, {fn, at: now + ms, interval}); return id; };
  return {
    now: () => now,
    setInterval: (fn, ms) => set(fn, ms, ms),
    setTimeout: (fn, ms) => set(fn, ms, 0),
    clear: (timer) => timers.delete(timer),
    jump: (ms) => { now += ms; },
    timerCount: () => timers.size
  };
}

async function loadLane(name, root) {
  const files = ['owlbear/core.js', 'owlbear/opener-bridge.js', 'owlbear/panel.js', 'src/js/vtt-relay.js', 'owlbear/manifest.json', 'owlbear-dice/manifest.json'];
  const sources = Object.fromEntries(await Promise.all(files.map(async (file) => [file, await fs.readFile(path.join(root, file), 'utf8')])));
  const hashes = Object.fromEntries(files.map((file) => [file, crypto.createHash('sha256').update(sources[file]).digest('hex')]));
  const core = await import(pathToFileURL(path.join(root, 'owlbear/core.js')).href);
  const opener = await import(pathToFileURL(path.join(root, 'owlbear/opener-bridge.js')).href);
  truth(!/^\s*import\b/m.test(sources['src/js/vtt-relay.js']), `${name}: sheet relay remains dependency-free`);
  const guard = sources['owlbear/panel.js'].match(/function shouldApplyHandoff\(event, consumed\) \{[\s\S]*?\r?\n\}/)?.[0];
  truth(guard, `${name}: exact production handoff guard found`);
  return {name, root, sources, hashes, core, opener, guard};
}

const lanes = [await loadLane('current', currentRoot), await loadLane('candidate', candidateRoot)];
const baseCharacter = {
  schemaVersion: 1,
  ui: {gameVersion: '0.13.1'},
  fields: {Name: 'Compatibility Fixture', 'Primary Race': 'Human', 'Sub Race': '', Power: 4, Focus: 5, Agility: 3, Toughness: 2, Fitness: 1, Cunning: 2, Reason: 3, Awareness: 4, Presence: 5, Speed: 25, Class1: 'Gunslinger', Class2: 'Deadeye'},
  builder: {startMode: 'mirane', selectedRaceId: 'human', selectedAncestryId: '', selectedClassIds: ['gunslinger', 'deadeye'], choiceSelections: {'warning-shot-target': 'fixture'}},
  play: {resources: {hpCurrent: 42, hpMax: 50, manaCurrent: 6, manaMax: 8, apCurrent: 3, apMax: 4, rpCurrent: 2, rpMax: 5}}
};
const fixtures = [
  {name: 'saved-0.13.1', character: baseCharacter},
  {name: 'saved-0.13.2-with-extension-fields', character: {...json(baseCharacter), ui: {gameVersion: '0.13.2'}, optionalPatchMetadata: {source: 'synthetic compatibility fixture'}}}
];
const normalizedCurrent = lanes[0].core.normalizeCharacterExport(baseCharacter);
for (const lane of lanes) {
  equal(lane.core.CHARACTER_SCHEMA_VERSION, 1, `${lane.name}: unchanged character schema`);
  equal(lane.core.ROLL_SCHEMA_VERSION, 1, `${lane.name}: unchanged roll schema`);
  for (const fixture of fixtures) {
    const normalized = lane.core.normalizeCharacterExport(json(fixture.character));
    equal(normalized, normalizedCurrent, `${lane.name}/${fixture.name}: meaningful fields and stable binding identity`);
    const binding = lane.core.createBindingRecord(normalized, {id: 'fixture-player', name: 'Fixture Player', role: 'PLAYER'}, {id: 'fixture-token', name: 'Fixture Token'});
    equal([binding.characterId, binding.ownerPlayerId, binding.tokenId, binding.resources.hpCurrent, binding.speed], [normalizedCurrent.characterId, 'fixture-player', 'fixture-token', 42, 25], `${lane.name}/${fixture.name}: ownership/binding values preserved`);
  }
  const officialFixture = {format: 'angelssword-character', version: 1, character: {name: 'Official Envelope Fixture', race: {primaryRaceId: 'human', primaryRaceName: 'Human', ancestryId: 'mirane', ancestryName: 'Mirane'}, mainStats: {power: 4, focus: 5}, subStats: {reason: 3}, classes: [{classId: 'deadeye', name: 'Deadeye'}], derivedStats: {hp: 50, maxMana: 8, ap: 4, rp: 5, speed: 25}}};
  equal(lane.core.normalizeCharacterExport(officialFixture), lanes[0].core.normalizeCharacterExport(officialFixture), `${lane.name}: official envelope import parity`);
  equal(lane.core.extractRollDice(lane.core.normalizeRollEvent({id: 'legacy-text', total: 12, breakdown: '2d10: 3 + 9'})), [{sides: 10, value: 3}, {sides: 10, value: 9}], `${lane.name}: older text-only multi-die fallback`);
  equal(lane.core.normalizeRollEvent({id: 'invalid', total: 'not-a-number'}), null, `${lane.name}: malformed total rejected`);
  for (const schemaVersion of [undefined, 0, 1]) {
    const normalized = lane.core.normalizeRollEvent({id: 'schema-fixture', total: 12, schemaVersion, extraField: 'ignored', dice: [{sides: 10, value: 3}, {sides: 10, value: 9}]});
    equal([normalized.total, normalized.dice], [12, [{sides: 10, value: 3}, {sides: 10, value: 9}]], `${lane.name}: legacy/current schema field retains known roll content`);
  }
}
equal(lanes[1].core.OPENER_BRIDGE_KIND, lanes[0].core.OPENER_BRIDGE_KIND, 'Current/candidate message kinds agree');
equal(lanes[1].core.OPENER_BRIDGE_TIMING, lanes[0].core.OPENER_BRIDGE_TIMING, 'Current/candidate handshake timing agrees');
for (const file of ['owlbear/manifest.json', 'owlbear-dice/manifest.json']) {
  equal(JSON.parse(lanes[1].sources[file]), JSON.parse(lanes[0].sources[file]), `${file}: existing extension manifest contract unchanged`);
}

async function pairing(sheetLane, panelLane) {
  const label = `${sheetLane.name}-sheet__${panelLane.name}-extension`;
  const clock = makeClock();
  const origin = 'https://patch-compat.invalid';
  const sheetUrl = `${origin}/`;
  const sheetListeners = new Set(), roomReceived = [], consumed = [], handoffs = [], posts = [], opened = [];
  let panelHandler = null, bridge, roomLog = [], clearedAt = 0;
  const guard = vm.runInNewContext(`(${panelLane.guard})`, {HANDOFF_CLEARED_AT_KEY: 'fixture-clear', localStorage: {getItem: () => String(clearedAt)}});
  const popup = {closed: false, location: {href: sheetUrl}, focus() {}, postMessage(data, targetOrigin) {
    equal(targetOrigin, origin, `${label}: panel targets exact origin`);
    posts.push({direction: 'panel-to-sheet', data: json(data)});
    queueMicrotask(() => sheetListeners.forEach((fn) => fn({data: json(data), source: opener, origin})));
  }};
  const opener = {closed: false, postMessage(data, targetOrigin) {
    equal(targetOrigin, origin, `${label}: sheet targets exact origin`);
    posts.push({direction: 'sheet-to-panel', data: json(data)});
    queueMicrotask(() => panelHandler?.({data: json(data), source: popup, origin}));
  }};
  const newPanel = () => panelLane.opener.createOwlbearOpenerBridge({
    openWindow: (url, name) => { opened.push({url, name}); return popup; },
    subscribe: (fn) => { panelHandler = fn; return () => { panelHandler = null; }; },
    onVisible: () => () => {}, now: clock.now, setInterval: clock.setInterval, clearInterval: clock.clear,
    onHandoff: (event) => { if (!guard(event, consumed)) return false; handoffs.push({raw: json(event.character), normalized: panelLane.core.normalizeCharacterExport(event.character)}); consumed.push(event.id); return true; },
    onSheetRoll: (event) => { roomLog = panelLane.core.mergeRollLog(roomLog, event); }
  });
  const FakeDate = class extends Date { constructor(...args) { super(...(args.length ? args : [clock.now()])); } static now() { return clock.now(); } };
  const realm = {window: {opener, addEventListener: (kind, fn) => { if (kind === 'message') sheetListeners.add(fn); }}, location: {hostname: 'patch-compat.invalid', origin, href: sheetUrl}, Date: FakeDate, crypto, console, setTimeout: clock.setTimeout, clearTimeout: clock.clear, setInterval: clock.setInterval, clearInterval: clock.clear, fetch: () => { throw new Error('Network transport forbidden in pure compatibility fixture'); }, BroadcastChannel: undefined};
  const relaySource = sheetLane.sources['src/js/vtt-relay.js'];
  vm.runInNewContext(`${relaySource.replace(/^export /gm, '')}\n globalThis.relay = {getOwlbearOpenerState, publishVttEvent, publishVttHandoff, subscribeVttRoomEvents};`, realm, {filename: path.join(sheetLane.root, 'src/js/vtt-relay.js')});
  bridge = newPanel();
  truth(bridge.connect(sheetUrl), `${label}: fixed-name popup opens`);
  const unsubscribe = realm.relay.subscribeVttRoomEvents((event) => roomReceived.push(json(event)));
  await settle();
  equal([bridge.getState(), realm.relay.getOwlbearOpenerState()], ['connected', 'connected'], `${label}: actual two-sided handshake connected`);
  equal(opened[0].name, 'angel-sword-sheet-bridge', `${label}: stable popup name`);
  for (const fixture of fixtures) {
    truth(await realm.relay.publishVttHandoff({id: fixture.name, character: json(fixture.character)}), `${label}/${fixture.name}: acknowledged handoff`);
    equal(handoffs.at(-1).raw, fixture.character, `${label}/${fixture.name}: complete handoff state unchanged`);
    equal(handoffs.at(-1).normalized, normalizedCurrent, `${label}/${fixture.name}: installed receiver fields/identity unchanged`);
  }
  equal(await realm.relay.publishVttHandoff({id: fixtures[0].name, character: json(baseCharacter)}), false, `${label}: duplicate handoff not re-applied`);
  equal(handoffs.length, 2, `${label}: exactly one application per new handoff ID`);
  clearedAt = clock.now();
  equal(await realm.relay.publishVttHandoff({id: 'cleared-fixture', ts: clock.now() - 1, character: json(baseCharacter)}), false, `${label}: pre-clear handoff cannot resurrect character`);
  const dice = [{sides: 10, value: 3}, {sides: 10, value: 9}, {sides: 100, value: 70}];
  const sheetRoll = realm.relay.publishVttEvent('dice', {id: 'sheet-structured', schemaVersion: 1, characterId: normalizedCurrent.characterId, character: baseCharacter.fields.Name, playerId: 'fixture-player', playerRole: 'GM', total: 82, formula: '2d10+1d100', breakdown: '2d10: 3 + 9; 1d100: 70', dice});
  await settle();
  opener.postMessage(sheetRoll, origin);
  await settle();
  equal(roomLog.length, 1, `${label}: room log deduplicates same sheet roll`);
  equal([roomLog[0].total, roomLog[0].playerRole, panelLane.core.extractRollDice(roomLog[0])], [82, 'GM', dice], `${label}: authoritative individual dice, total and role preserved`);
  const roomRoll = panelLane.core.normalizeRollEvent({id: 'room-structured', total: 12, character: 'Second Fixture', dice: dice.slice(0, 2), playerRole: 'PLAYER'});
  truth(bridge.sendRoomRollToSheet(roomRoll), `${label}: reverse room roll sent`);
  truth(bridge.sendRoomRollToSheet(roomRoll), `${label}: reverse duplicate transport sent`);
  await settle();
  equal(roomReceived.length, 1, `${label}: actual sheet subscription delivers reverse roll exactly once`);
  equal([roomReceived[0].total, roomReceived[0].dice], [12, dice.slice(0, 2)], `${label}: reverse multi-die payload intact`);
  bridge.sendRoomRollToSheet(sheetRoll);
  await settle();
  equal(roomReceived.length, 1, `${label}: sheet does not replay own room echo`);
  const invalidHandoff = {kind: 'character-handoff', id: 'wrong-origin', ts: clock.now() + 1, character: json(baseCharacter)};
  panelHandler({data: invalidHandoff, source: popup, origin: 'https://wrong.invalid'});
  panelHandler({data: {...invalidHandoff, id: 'wrong-source'}, source: {}, origin});
  equal(handoffs.length, 2, `${label}: panel rejects wrong origin and source`);
  sheetListeners.forEach((fn) => fn({data: {...roomRoll, id: 'wrong-origin-room', relaySource: 'owlbear-room'}, source: opener, origin: 'https://wrong.invalid'}));
  sheetListeners.forEach((fn) => fn({data: {...roomRoll, id: 'wrong-source-room', relaySource: 'owlbear-room'}, source: {}, origin}));
  equal(roomReceived.length, 1, `${label}: sheet rejects wrong origin and source`);
  clock.jump(60_000);
  equal([bridge.getState(), realm.relay.getOwlbearOpenerState()], ['connected', 'connected'], `${label}: hidden-panel 60-second timer gap tolerated`);
  clock.jump(16_000);
  equal([bridge.getState(), realm.relay.getOwlbearOpenerState()], ['connecting', 'connecting'], `${label}: true stale gap detected`);
  bridge.disconnect();
  bridge = newPanel();
  truth(bridge.reconnect(sheetUrl), `${label}: reloaded panel reacquires popup`);
  await settle();
  equal([bridge.getState(), realm.relay.getOwlbearOpenerState()], ['connected', 'connected'], `${label}: reconnect restores both sides`);
  truth(bridge.sendRoomRollToSheet({...roomRoll, id: 'after-reconnect'}), `${label}: reconnected room roll sent`);
  await settle();
  equal(roomReceived.length, 2, `${label}: post-reconnect delivery works`);
  popup.closed = true;
  equal(bridge.getState(), 'closed', `${label}: closed sheet detected`);
  opener.closed = true;
  equal(realm.relay.getOwlbearOpenerState(), 'closed', `${label}: closed room detected`);
  unsubscribe(); bridge.disconnect();
  equal(clock.timerCount(), 0, `${label}: injected timers released`);
  return {pairing: label, result: 'PASS', handoffs: handoffs.length, sheetRollsInLog: roomLog.length, roomRollsReceived: roomReceived.length, postedMessages: posts.length};
}

async function browserPairings() {
  const {chromium} = await import('playwright');
  const browser = await chromium.launch({headless: true});
  const results = [];
  const mime = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json'};
  try {
    for (const sheetLane of lanes) for (const panelLane of lanes) {
      const label = `${sheetLane.name}-sheet__${panelLane.name}-extension`;
      const defaultVersion = sheetLane.name === 'candidate' ? '0.13.2' : '0.13.1';
      const errors = [], localFailures = [], blockedRemote = [], serverRequests = [];
      const server = http.createServer(async (req, res) => {
        const rawPath = new URL(req.url, 'http://localhost').pathname;
        serverRequests.push(rawPath);
        if (req.method !== 'GET' || rawPath.startsWith('/api/')) { res.writeHead(404); res.end(); return; }
        try {
          const relative = decodeURIComponent(rawPath).replace(/^\/+/, '') || 'index.html';
          const sourceRoot = /^(?:owlbear|owlbear-dice)\//.test(relative) ? panelLane.root : sheetLane.root;
          const target = path.resolve(sourceRoot, relative);
          if (!target.startsWith(`${sourceRoot}${path.sep}`)) { res.writeHead(403); res.end(); return; }
          const bytes = await fs.readFile(target);
          res.writeHead(200, {'content-type': mime[path.extname(target)] || 'application/octet-stream', ...(relative.startsWith('owlbear') ? {'access-control-allow-origin': '*'} : {})});
          res.end(bytes);
        } catch { res.writeHead(404); res.end(); }
      });
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      const origin = `http://127.0.0.1:${server.address().port}`;
      const context = await browser.newContext({viewport: {width: 1280, height: 800}});
      let panel, sheet;
      const result = {pairing: label, origin, result: 'FAIL', blockedRemote, localFailures, pageErrors: errors};
      try {
        await context.route('**/*', async (route) => {
          const url = route.request().url();
          if (url.startsWith(`${origin}/api/`)) { await route.abort(); return; }
          if (url.startsWith(origin + '/') || url.startsWith('data:') || url.startsWith('blob:')) { await route.continue(); return; }
          blockedRemote.push(url); await route.abort();
        });
        await context.addInitScript(() => {
          Object.defineProperty(window, 'BroadcastChannel', {value: undefined, configurable: true});
          window.__patchMessages = [];
          window.addEventListener('message', ({data}) => { if (data?.kind) window.__patchMessages.push(data); });
        });
        context.on('page', (page) => {
          page.on('pageerror', (error) => errors.push(error.message));
          page.on('response', (response) => { if (response.url().startsWith(origin + '/') && !response.url().includes('/api/') && response.status() >= 400) localFailures.push(`${response.status()} ${response.url()}`); });
        });
        panel = await context.newPage();
        await panel.goto(`${origin}/owlbear/panel.html`, {waitUntil: 'domcontentloaded'});
        const popup = panel.waitForEvent('popup');
        await panel.locator('#open-sheet').click();
        sheet = await popup;
        await sheet.waitForLoadState('domcontentloaded');
        await panel.waitForFunction(() => document.querySelector('#sheet-link-status')?.textContent.includes('connected'));
        await sheet.waitForFunction((version) => window.LYRIAN_DATA?.version === version, defaultVersion);
        await sheet.waitForFunction(() => document.querySelector('#builder-status-pill')?.textContent.startsWith('Ready with Lyrian data'));
        result.freshDefault = await sheet.evaluate(() => window.LYRIAN_DATA.version);
        equal(result.freshDefault, defaultVersion, `${label}: actual static browser fresh default`);

        if (sheetLane.name === 'candidate') {
          const oldSnapshot = JSON.stringify({...json(baseCharacter), ui: {mode: 'builder', gameVersion: '0.13.1'}});
          await sheet.evaluate((character) => {
            localStorage.setItem('lyrian-chronicles-selected-game-version-v2', '0.13.1');
            localStorage.setItem('lyrian-chronicles-selected-game-version-latest-v1', '0.13.1');
            localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({...character, ui: {mode: 'builder', gameVersion: '0.13.1'}}));
          }, json(baseCharacter));
          await sheet.reload({waitUntil: 'domcontentloaded'});
          await sheet.waitForFunction(() => window.LYRIAN_DATA?.version === '0.13.2');
          await sheet.waitForFunction(() => document.querySelector('#game-version-select')?.value === '0.13.2');
          await sheet.waitForFunction(() => document.querySelector('#builder-status-pill')?.textContent === 'Loaded saved character.' && document.querySelector('#builder-name-header')?.value === 'Compatibility Fixture');
          const upgraded = await sheet.evaluate(() => {
            const saved = JSON.parse(localStorage.getItem('lyrian-chronicles-character-suite-v2') || '{}');
            return {runtimeVersion: window.LYRIAN_DATA.version, uiVersion: document.querySelector('#game-version-select')?.value, selectedVersion: localStorage.getItem('lyrian-chronicles-selected-game-version-v2'), latestSeenVersion: localStorage.getItem('lyrian-chronicles-selected-game-version-latest-v1'), savedVersion: saved.ui?.gameVersion, name: saved.fields?.Name, race: saved.builder?.selectedRaceId, ancestry: saved.builder?.selectedAncestryId, classes: saved.builder?.selectedClassIds, startMode: saved.builder?.startMode};
          });
          result.oldProfileUpgrade = upgraded;
          equal(upgraded, {runtimeVersion: '0.13.2', uiVersion: '0.13.2', selectedVersion: '0.13.1', latestSeenVersion: '0.13.1', savedVersion: '0.13.1', name: 'Compatibility Fixture', race: 'human', ancestry: '', classes: ['gunslinger', 'deadeye'], startMode: 'mirane'}, `${label}: truly old0.13.1 profile opens latest runtime/UI while startup preserves stored character`);
          equal(await sheet.evaluate(() => localStorage.getItem('lyrian-chronicles-character-suite-v2')), oldSnapshot, `${label}: startup leaves complete stored old snapshot byte-for-byte intact`);
          // Startup hydration precedes persistence readiness; a normal edit performs the first save.
          await sheet.locator('#builder-name-header').fill('Upgraded Compatibility Fixture');
          await sheet.waitForFunction(() => {
            const saved = JSON.parse(localStorage.getItem('lyrian-chronicles-character-suite-v2') || '{}');
            return saved.ui?.gameVersion === '0.13.2' && saved.fields?.Name === 'Upgraded Compatibility Fixture';
          });
          await sheet.reload({waitUntil: 'domcontentloaded'});
          await sheet.waitForFunction(() => window.LYRIAN_DATA?.version === '0.13.2' && document.querySelector('#builder-status-pill')?.textContent === 'Loaded saved character.' && document.querySelector('#builder-name-header')?.value === 'Upgraded Compatibility Fixture');
          const upgradeSaved = await sheet.evaluate(() => {
            const saved = JSON.parse(localStorage.getItem('lyrian-chronicles-character-suite-v2') || '{}');
            return {runtimeVersion: window.LYRIAN_DATA.version, uiVersion: document.querySelector('#game-version-select')?.value, savedVersion: saved.ui?.gameVersion, name: saved.fields?.Name, race: saved.builder?.selectedRaceId, ancestry: saved.builder?.selectedAncestryId, classes: saved.builder?.selectedClassIds, startMode: saved.builder?.startMode};
          });
          result.oldProfileUpgradeAfterEditReload = upgradeSaved;
          equal(upgradeSaved, {runtimeVersion: '0.13.2', uiVersion: '0.13.2', savedVersion: '0.13.2', name: 'Upgraded Compatibility Fixture', race: 'human', ancestry: '', classes: ['gunslinger', 'deadeye'], startMode: 'mirane'}, `${label}: ordinary edit persists latest version and reload retains build identity`);
        }

        await sheet.evaluate(({character, latest}) => {
          localStorage.setItem('lyrian-chronicles-selected-game-version-v2', '0.13.1');
          localStorage.setItem('lyrian-chronicles-selected-game-version-latest-v1', latest);
          localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({...character, ui: {mode: 'builder', gameVersion: '0.13.1'}}));
        }, {character: json(baseCharacter), latest: defaultVersion});
        await sheet.reload({waitUntil: 'domcontentloaded'});
        // Data scripts load before initialize() hydrates controls and enables persistence.
        // Wait for its final visible loaded status before sending real input events.
        await sheet.waitForFunction(() => window.LYRIAN_DATA?.version === '0.13.1' && document.querySelector('#builder-status-pill')?.textContent === 'Loaded saved character.' && document.querySelector('#builder-name-header')?.value === 'Compatibility Fixture');
        await sheet.locator('#builder-name-header').fill('Browser Compatibility Fixture');
        await sheet.waitForFunction(() => JSON.parse(localStorage.getItem('lyrian-chronicles-character-suite-v2') || '{}').fields?.Name === 'Browser Compatibility Fixture');
        await sheet.reload({waitUntil: 'domcontentloaded'});
        await sheet.waitForFunction(() => window.LYRIAN_DATA?.version === '0.13.1' && document.querySelector('#builder-status-pill')?.textContent === 'Loaded saved character.' && document.querySelector('#builder-name-header')?.value === 'Browser Compatibility Fixture');
        equal(await sheet.locator('#builder-name-header').inputValue(), 'Browser Compatibility Fixture', `${label}: offline name edit persisted across reload`);
        const restored = await sheet.evaluate(() => {
          const saved = JSON.parse(localStorage.getItem('lyrian-chronicles-character-suite-v2') || '{}');
          return {version: saved.ui?.gameVersion, race: saved.builder?.selectedRaceId, ancestry: saved.builder?.selectedAncestryId, classes: saved.builder?.selectedClassIds};
        });
        equal(restored, {version: '0.13.1', race: 'human', ancestry: '', classes: ['gunslinger', 'deadeye']}, `${label}: old saved selections survive offline load/edit/reload`);
        result.oldSaveReload = restored;
        await sheet.locator('#builder-sheet-shortcut-top').click();
        await sheet.locator('[data-play-mode="table"]:visible').first().click();
        await sheet.locator('[data-table-tool-guide="owlbear"]').click();
        await sheet.locator('[data-owlbear-send]').click();
        await panel.waitForFunction(() => document.querySelector('#character-summary')?.textContent.includes('Browser Compatibility Fixture'));
        const handoff = await panel.evaluate(() => window.__patchMessages.filter((entry) => entry.kind === 'character-handoff').at(-1));
        truth(handoff?.character?.fields?.Name === 'Browser Compatibility Fixture', `${label}: actual Send Character UI carries saved character`);
        equal(handoff.character.builder.selectedClassIds, ['gunslinger', 'deadeye'], `${label}: actual handoff preserves classes`);
        result.actualUiHandoff = {name: handoff.character.fields.Name, version: handoff.character.ui.gameVersion, classes: handoff.character.builder.selectedClassIds};
        await sheet.locator('#sheet-modal-close').click();
        await sheet.locator('[data-play-mode="combat"]:visible').first().click();
        await sheet.locator('[data-play-roll="saveBonus"]:visible').first().click();
        await panel.waitForFunction(() => window.__patchMessages.some((event) => event.relaySource === 'angel-sword-sheet' && Array.isArray(event.dice) && event.dice.length === 2));
        const roll = await panel.evaluate(() => window.__patchMessages.filter((event) => Array.isArray(event.dice) && event.dice.length === 2).at(-1));
        equal(roll.dice.map((die) => die.sides), [10, 10], `${label}: actual sheet saving throw sends both d10 results`);
        await sheet.evaluate((event) => { window.opener.postMessage(event, location.origin); window.opener.postMessage(event, location.origin); }, roll);
        await panel.waitForFunction((id) => document.querySelectorAll(`#feed li[data-roll-id="${id}"]`).length === 1, roll.id);
        result.actualUiRoll = {kind: roll.kind, dice: roll.dice, total: roll.total, rendered: 1};
        const reverse = {v: 1, id: 'browser-room-fixture', ts: Date.now(), kind: 'dice', relaySource: 'owlbear-room', character: 'Room Fixture', label: 'Reverse Compatibility Check', formula: '2d10', breakdown: '2d10: 3 + 9', dice: [{sides: 10, value: 3}, {sides: 10, value: 9}], total: 12};
        await panel.evaluate((event) => { const popup = window.open('', 'angel-sword-sheet-bridge'); popup.postMessage(event, location.origin); popup.postMessage(event, location.origin); }, reverse);
        await sheet.waitForFunction(() => [...document.querySelectorAll('#play-log .play-log-entry')].filter((entry) => entry.textContent.includes('Reverse Compatibility Check')).length === 1);
        result.reverseRendered = 1;
        await panel.reload({waitUntil: 'domcontentloaded'});
        await panel.waitForFunction(() => document.querySelector('#sheet-link-status')?.textContent.includes('connected'));
        result.panelReloadReconnected = true;
        if (sheetLane.name === 'candidate') {
          await sheet.locator('[data-play-mode="table"]:visible').first().click();
          await sheet.locator('[data-table-tool-action="builder"]').click();
          await sheet.locator('#game-version-select').selectOption('0.13.2');
          await sheet.waitForFunction(() => window.LYRIAN_DATA?.version === '0.13.2');
          await sheet.reload({waitUntil: 'domcontentloaded'});
          await sheet.waitForFunction(() => window.LYRIAN_DATA?.version === '0.13.2');
          equal(await sheet.evaluate(() => JSON.parse(localStorage.getItem('lyrian-chronicles-character-suite-v2') || '{}').fields?.Name), 'Browser Compatibility Fixture', `${label}: latest version switch/reload retains character`);
          result.latestSwitchReload = '0.13.2';
        }
        equal(errors, [], `${label}: no browser runtime exceptions`);
        equal(localFailures, [], `${label}: all requested local resources resolve`);
        await panel.screenshot({path: path.join(out, `${label}-panel.png`)});
        await sheet.screenshot({path: path.join(out, `${label}-sheet.png`)});
        result.result = 'PASS';
      } catch (error) {
        result.error = error.stack || String(error);
        result.failureState = await sheet?.evaluate(() => ({runtimeVersion: window.LYRIAN_DATA?.version, uiVersion: document.querySelector('#game-version-select')?.value, selectedVersion: localStorage.getItem('lyrian-chronicles-selected-game-version-v2'), latestSeenVersion: localStorage.getItem('lyrian-chronicles-selected-game-version-latest-v1'), saved: JSON.parse(localStorage.getItem('lyrian-chronicles-character-suite-v2') || '{}')})).catch(() => null);
        await sheet?.screenshot({path: path.join(out, `${label}-failure.png`)}).catch(() => {});
      } finally {
        results.push(result);
        await fs.writeFile(path.join(out, 'browser-progress.json'), JSON.stringify(results, null, 2));
        await context.close();
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
    }
  } finally { await browser.close(); }
  return results;
}

const pairings = [];
for (const sheet of lanes) for (const panel of lanes) pairings.push(await pairing(sheet, panel));
await fs.mkdir(out, {recursive: true});
const browserResults = process.argv.includes('--browser') ? await browserPairings() : [];
const evidence = {time: new Date().toISOString(),checks,pairings,browserResults,lanes: lanes.map(({name,root,hashes}) => ({name,root,hashes})),limitations: ['VM/window contracts plus optional static browser; no real iframe or SDK room.', 'No real player saves, physical devices, audible/visual dice or live ownership actions.', 'Schema constants remain 1; missing/0/1 schema fields and unknown-field tolerance exercised, future-schema enforcement is not claimed.', 'Fixtures establish transport/import/binding compatibility, not legality or full app import/export parity.', 'Hidden-panel check simulates a timer gap; actual Owlbear panel visibility remains unverified.', 'Blocked remote references in optional browser results identify remaining external art/links, not validated offline asset completeness.']};
await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
truth(browserResults.every((entry) => entry.result === 'PASS'), 'All requested static browser combinations pass');
console.log(`[PATCH OWLBEAR COMPAT PASS] ${checks} checks; all 4 current/candidate sheet-extension pairings passed.`);
