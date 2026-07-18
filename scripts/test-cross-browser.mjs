import { chromium, firefox, webkit } from 'playwright';
import { fork } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const QA_DIR = path.join(PROJECT_ROOT, 'qa-test-results');
const DEPLOY_TEMP_DIR = path.join(PROJECT_ROOT, 'deploy-temp-dist');
const PORT = 4199; // Use a dedicated test port to avoid conflict with running instances

async function copyDirectory(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function copyDeploymentArtifact() {
  await fs.rm(DEPLOY_TEMP_DIR, { recursive: true, force: true });
  await fs.mkdir(path.join(DEPLOY_TEMP_DIR, 'src', 'css'), { recursive: true });
  await fs.copyFile(path.join(PROJECT_ROOT, 'index.html'), path.join(DEPLOY_TEMP_DIR, 'index.html'));
  await fs.copyFile(path.join(PROJECT_ROOT, 'manifest.webmanifest'), path.join(DEPLOY_TEMP_DIR, 'manifest.webmanifest'));
  await copyDirectory(path.join(PROJECT_ROOT, 'assets'), path.join(DEPLOY_TEMP_DIR, 'assets'));
  await fs.copyFile(
    path.join(PROJECT_ROOT, 'src', 'css', 'main.css'),
    path.join(DEPLOY_TEMP_DIR, 'src', 'css', 'main.css')
  );
}

async function assertDiceRollerHasNoPageDimmingPlane() {
  const sourcePath = path.join(PROJECT_ROOT, 'assets', 'dice-3d', 'lyrian-accurate-dice.js');
  const source = await fs.readFile(sourcePath, 'utf8');
  const hasDarkFloorPlane = /new\s+THREE\.PlaneGeometry\s*\(\s*15\s*,\s*9\s*\)/.test(source)
    || /scene\.add\s*\(\s*floor\s*\)/.test(source);
  if (hasDarkFloorPlane) {
    throw new Error('Accurate dice roller still draws a full-screen dark floor plane that visibly dims the play sheet during rolls.');
  }
}

async function runDirectFileStartupAssertion() {
  const fileUrl = pathToFileURL(path.join(DEPLOY_TEMP_DIR, 'index.html')).href;
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 }
  });
  const errors = [];
  const failedFileRequests = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  page.on('requestfailed', (request) => {
    if (request.url().startsWith('file:')) {
      failedFileRequests.push(`${request.url()} ${request.failure()?.errorText || ''}`.trim());
    }
  });

  try {
    await page.goto(fileUrl, { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(2500);

    const result = await page.evaluate(() => {
      const stepContent = document.getElementById('builder-step-content');
      const stepNav = document.getElementById('builder-step-nav');
      const versionSelect = document.getElementById('game-version-select');
      const summary = document.getElementById('builder-summary');

      return {
        dataVersion: window.LYRIAN_DATA?.version || '',
        selectedVersion: versionSelect?.value || '',
        versionCount: versionSelect?.querySelectorAll('option').length || 0,
        cardCount: stepContent?.querySelectorAll('.builder-option-card').length || 0,
        navCount: stepNav?.querySelectorAll('button').length || 0,
        summaryText: summary?.textContent?.replace(/\s+/g, ' ').trim() || '',
        buildLabel: document.querySelector('.builder-build-version')?.textContent || '',
        startModes: [...document.querySelectorAll('[data-character-start-mode]')].map((button) => button.dataset.characterStartMode),
        activeStartMode: document.querySelector('[data-character-start-mode][aria-pressed="true"]')?.dataset.characterStartMode || '',
        optionalRuntimesDeferred: !window.PDFLib
          && !window.XLSX
          && !window.JSZip
          && !window.THREE
          && !window.LyrianAccurateDiceRoller
      };
    });

    const startupIsValid = result.dataVersion === '0.13.0'
      && result.selectedVersion === '0.13.0'
      && result.versionCount >= 3
      && result.cardCount > 0
      && result.navCount > 0
      && result.summaryText.includes('Identity')
      && result.buildLabel.includes('Beta 2.11')
      && result.startModes.join('|') === 'standard|mirane'
      && result.activeStartMode === 'standard'
      && result.optionalRuntimesDeferred;

    if (!startupIsValid || errors.length || failedFileRequests.length) {
      throw new Error(`Direct file startup regression failed: ${JSON.stringify({ result, errors, failedFileRequests }, null, 2)}`);
    }
  } finally {
    await browser.close();
  }
}

async function runMobileChoiceOverlayAssertions(page, browserName) {
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });

  const portraitLabel = await page.evaluate(() => {
    const frame = document.querySelector('.builder-identity-banner .portrait-frame');
    const placeholder = document.getElementById('builder-portrait-placeholder');
    if (!frame || !placeholder) return { present: false };
    const frameRect = frame.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(placeholder);
    const textRect = range.getBoundingClientRect();
    return {
      present: true,
      text: placeholder.textContent?.trim() || '',
      fontSize: Number.parseFloat(getComputedStyle(placeholder).fontSize),
      fullyInside: textRect.left >= frameRect.left - 1
        && textRect.right <= frameRect.right + 1
        && textRect.top >= frameRect.top - 1
        && textRect.bottom <= frameRect.bottom + 1
    };
  });
  if (!portraitLabel.present || portraitLabel.text !== 'Add portrait' || !portraitLabel.fullyInside || portraitLabel.fontSize > 12) {
    throw new Error(`Mobile Add portrait readability regression failed: ${JSON.stringify(portraitLabel)}`);
  }

  page.once('dialog', async (dialog) => dialog.accept());
  await page.click('[data-character-start-mode="mirane"]');
  const miraneHeader = await page.evaluate(() => ({
    active: document.querySelector('[data-character-start-mode="mirane"]')?.getAttribute('aria-pressed') === 'true',
    note: document.getElementById('builder-start-mode-note')?.textContent || '',
    summary: document.querySelector('.builder-stage-summary')?.textContent || ''
  }));
  if (!miraneHeader.active || !miraneHeader.note.includes('Mirane campaign restrictions') || !miraneHeader.summary.includes('Remaining Clim 4000')) {
    throw new Error(`Mobile Mirane header selector regression failed: ${JSON.stringify(miraneHeader)}`);
  }
  await page.click('[data-character-start-mode="standard"]');
  const standardHeaderActive = await page.locator('[data-character-start-mode="standard"][aria-pressed="true"]').count();
  if (standardHeaderActive !== 1) {
    throw new Error('Mobile Standard Play header selector did not reactivate after the Mirane check.');
  }

  const humanCard = page.locator('[data-builder-action="pick-race"]').filter({ hasText: 'Human' }).first();
  await humanCard.click();
  await page.waitForSelector('#builder-mobile-choice-overlay:not([hidden])', { timeout: 5000 });

  const openResult = await page.evaluate(() => ({
    overlayOpen: !document.getElementById('builder-mobile-choice-overlay')?.hidden,
    modalTitle: document.getElementById('builder-mobile-choice-title')?.textContent?.trim() || '',
    acceptLabel: document.getElementById('builder-mobile-choice-accept')?.textContent?.trim() || '',
    acceptEnabled: !document.getElementById('builder-mobile-choice-accept')?.disabled,
    bodyLocked: document.body.classList.contains('builder-mobile-choice-open'),
    raceStillPending: document.querySelector('.builder-stage-summary')?.textContent?.includes('No primary race') || false
  }));
  if (
    !openResult.overlayOpen
    || openResult.modalTitle !== 'Human'
    || !openResult.acceptLabel.includes('Accept Species')
    || !openResult.acceptEnabled
    || !openResult.bodyLocked
    || !openResult.raceStillPending
  ) {
    throw new Error(`Mobile species overlay regression failed: ${JSON.stringify(openResult)}`);
  }

  if (browserName.startsWith('Chromium')) {
    const overlayPath = path.join(QA_DIR, 'screenshot-chromium-mobile-choice-overlay.png');
    await page.screenshot({ path: overlayPath });
    console.log('   Captured: qa-test-results/screenshot-chromium-mobile-choice-overlay.png');
  }

  await page.click('[data-mobile-choice-close].builder-mobile-choice-cancel');
  const closeResult = await page.evaluate(() => ({
    overlayClosed: document.getElementById('builder-mobile-choice-overlay')?.hidden || false,
    bodyUnlocked: !document.body.classList.contains('builder-mobile-choice-open'),
    raceStillPending: document.querySelector('.builder-stage-summary')?.textContent?.includes('No primary race') || false
  }));
  if (!closeResult.overlayClosed || !closeResult.bodyUnlocked || !closeResult.raceStillPending) {
    throw new Error(`Mobile overlay close regression failed: ${JSON.stringify(closeResult)}`);
  }

  await humanCard.click();
  await page.click('#builder-mobile-choice-accept');
  await page.waitForSelector('#builder-mobile-choice-overlay[hidden]', { state: 'attached', timeout: 5000 });
  const acceptResult = await page.evaluate(() => ({
    raceSelected: document.querySelector('.builder-stage-summary')?.textContent?.includes('Human') || false,
    stepTitle: document.getElementById('builder-step-title')?.textContent?.trim() || '',
    overlayClosed: document.getElementById('builder-mobile-choice-overlay')?.hidden || false
  }));
  if (!acceptResult.raceSelected || !acceptResult.overlayClosed || !/ancestry|clan|secondary lineage/i.test(acceptResult.stepTitle)) {
    throw new Error(`Mobile overlay accept-and-continue regression failed: ${JSON.stringify(acceptResult)}`);
  }

  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
}

async function runMobileQuickBuildDetailAssertions(page, browserName) {
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  page.once('dialog', async (dialog) => dialog.accept());
  await page.click('#quick-build-entry');
  await page.locator('[data-quick-build-action="select-species"][data-id="slimefolk"]').click();
  await page.click('#builder-next');
  await page.click('#builder-next');
  await page.locator('[data-quick-build-action="select-build"][data-id="sneak-thief"]').click();
  await page.waitForSelector('#builder-mobile-choice-overlay:not([hidden])', { timeout: 5000 });

  const result = await page.evaluate(() => ({
    title: document.getElementById('builder-mobile-choice-title')?.textContent?.trim() || '',
    acceptLabel: document.getElementById('builder-mobile-choice-accept')?.textContent?.trim() || '',
    detail: document.getElementById('builder-mobile-choice-content')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    bodyLocked: document.body.classList.contains('builder-mobile-choice-open')
  }));
  if (
    result.title !== 'Sneak Thief'
    || result.acceptLabel !== 'Choose This Build'
    || !result.bodyLocked
    || !result.detail.includes('How It Plays')
    || !result.detail.includes('Starting Class Package')
    || !result.detail.includes('Evasive Maneuver')
    || !result.detail.includes('Decipher Magic')
    || !result.detail.includes('Equipment and Perks')
  ) {
    throw new Error(`Mobile Quick Build class-detail regression failed: ${JSON.stringify(result)}`);
  }

  if (browserName.startsWith('Chromium')) {
    const detailPath = path.join(QA_DIR, 'screenshot-chromium-mobile-quick-build-detail.png');
    await page.screenshot({ path: detailPath });
    console.log('   Captured: qa-test-results/screenshot-chromium-mobile-quick-build-detail.png');
  }

  await page.click('#builder-mobile-choice-accept');
  await page.waitForSelector('#builder-mobile-choice-overlay[hidden]', { state: 'attached', timeout: 5000 });
  const closed = await page.evaluate(() => ({
    overlayClosed: document.getElementById('builder-mobile-choice-overlay')?.hidden || false,
    nextEnabled: !document.getElementById('builder-next')?.disabled
  }));
  if (!closed.overlayClosed || !closed.nextEnabled) {
    throw new Error(`Mobile Quick Build detail close regression failed: ${JSON.stringify(closed)}`);
  }

  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
}

async function runMobileSheetAppAssertions(page, browserName) {
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
      ui: {
        mode: 'sheet',
        sheetTab: 'actions',
        mobileSheetPage: 'overview',
        playMode: 'combat',
        gameVersion: '0.13.0'
      },
      builder: {
        selectedRaceId: 'human',
        selectedClassIds: ['fighter'],
        classAbilityProgress: { fighter: 3 }
      },
      fields: {
        Name: 'Mobile Test Hero',
        Focus: '2',
        Power: '2',
        Agility: '2',
        Toughness: '2'
      }
    }));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#sheet-view:not(.is-hidden)', { timeout: 5000 });
  await page.waitForSelector('#play-mobile-page-nav:not([hidden])', { timeout: 5000 });
  await page.waitForFunction(() => document.querySelector('#play-header-card')?.textContent?.includes('Mobile Test Hero'));

  const initial = await page.evaluate(() => {
    const modeButtons = [...document.querySelectorAll('#play-header-card [data-play-mode]')];
    const positions = Object.fromEntries(modeButtons.map((button) => [button.dataset.playMode, Math.round(button.getBoundingClientRect().x)]));
    const pageNav = document.getElementById('play-mobile-page-nav');
    const pageNavRect = pageNav?.getBoundingClientRect();
    const pageButtonsFit = [...(pageNav?.querySelectorAll('[data-mobile-sheet-page]') || [])].every((button) => {
      const rect = button.getBoundingClientRect();
      return rect.left >= pageNavRect.left - 1 && rect.right <= pageNavRect.right + 1;
    });
    return {
      visibleModeLabels: modeButtons.map((button) => button.innerText.trim()),
      positions,
      toolbarHidden: getComputedStyle(document.querySelector('#sheet-view .sheet-toolbar')).display === 'none',
      dockVisible: getComputedStyle(document.getElementById('play-mobile-sheet-dock')).display !== 'none',
      dockSticky: getComputedStyle(document.getElementById('play-mobile-sheet-dock')).position === 'sticky',
      page: document.getElementById('sheet-view').dataset.mobileSheetPage,
      manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href') || '',
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      pageButtonsFit
    };
  });

  const labelsValid = initial.visibleModeLabels.join('|') === 'Character Sheet|Crafting|Gathering';
  const visualOrderValid = initial.positions.combat < initial.positions.gathering && initial.positions.gathering < initial.positions.crafting;
  if (
    !labelsValid ||
    !visualOrderValid ||
    !initial.toolbarHidden ||
    !initial.dockVisible ||
    !initial.dockSticky ||
    initial.page !== 'overview' ||
    initial.manifest !== 'manifest.webmanifest' ||
    !initial.noHorizontalOverflow ||
    !initial.pageButtonsFit
  ) {
    throw new Error(`Mobile sheet header regression failed: ${JSON.stringify(initial)}`);
  }

  await page.click('[data-mobile-sheet-page="skills"]');
  await page.waitForSelector('#play-skills .play-skill-mini-row', { state: 'visible', timeout: 5000 });
  await page.locator('#play-skills [data-play-roll-skill]').first().click();
  await page.waitForFunction(() => (document.querySelector('#play-log')?.textContent || '').includes('Check'));
  const skillResult = await page.evaluate(() => ({
    page: document.getElementById('sheet-view').dataset.mobileSheetPage,
    centerVisible: getComputedStyle(document.querySelector('.play-center-column')).display !== 'none',
    rightHidden: getComputedStyle(document.querySelector('.play-right-column')).display === 'none',
    rollLogged: (document.querySelector('#play-log')?.textContent || '').includes('Check')
  }));
  if (skillResult.page !== 'skills' || !skillResult.centerVisible || !skillResult.rightHidden || !skillResult.rollLogged) {
    throw new Error(`Mobile skills/roll regression failed: ${JSON.stringify(skillResult)}`);
  }

  const referenceClose = page.locator('[data-play-reference-close]');
  if (await referenceClose.isVisible().catch(() => false)) {
    await referenceClose.click();
  }

  await page.click('[data-mobile-sheet-page="abilities"]', { force: true });
  const abilitiesResult = await page.evaluate(() => ({
    page: document.getElementById('sheet-view').dataset.mobileSheetPage,
    abilitiesVisible: getComputedStyle(document.querySelector('[data-play-tab-panel="abilities"]')).display !== 'none',
    actionsHidden: getComputedStyle(document.querySelector('[data-play-tab-panel="actions"]')).display === 'none'
  }));
  if (abilitiesResult.page !== 'abilities' || !abilitiesResult.abilitiesVisible || !abilitiesResult.actionsHidden) {
    throw new Error(`Mobile abilities page regression failed: ${JSON.stringify(abilitiesResult)}`);
  }

  await page.click('#play-header-card [data-play-mode="gathering"]');
  await page.waitForSelector('#play-gathering:not([hidden])', { state: 'visible', timeout: 5000 });
  const gatheringVisible = await page.locator('#play-gathering').isVisible();
  const walkthroughNavVisible = await page.locator('#play-mobile-walkthrough-nav').isVisible();
  const gatheringLayout = await page.evaluate(() => ({
    noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    diceHidden: getComputedStyle(document.getElementById('sheet-dice-tray')).display === 'none',
    wizardStepsVisible: [...document.querySelectorAll('#play-gathering .play-wizard-nav-step')].every((button) => {
      const rect = button.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= document.documentElement.clientWidth;
    })
  }));
  await page.click('#play-mobile-walkthrough-nav [data-play-mode="crafting"]');
  await page.waitForSelector('#play-crafting:not([hidden])', { state: 'visible', timeout: 5000 });
  const craftingVisible = await page.locator('#play-crafting').isVisible();
  const craftingLayout = await page.evaluate(() => ({
    noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    diceHidden: getComputedStyle(document.getElementById('sheet-dice-tray')).display === 'none',
    wizardStepsVisible: [...document.querySelectorAll('#play-crafting .play-wizard-nav-step')].every((button) => {
      const rect = button.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= document.documentElement.clientWidth;
    })
  }));
  if (
    !gatheringVisible ||
    !walkthroughNavVisible ||
    !craftingVisible ||
    !gatheringLayout.noHorizontalOverflow ||
    !gatheringLayout.diceHidden ||
    !gatheringLayout.wizardStepsVisible ||
    !craftingLayout.noHorizontalOverflow ||
    !craftingLayout.diceHidden ||
    !craftingLayout.wizardStepsVisible
  ) {
    throw new Error(`Mobile walkthrough routing regression failed: ${JSON.stringify({ gatheringVisible, walkthroughNavVisible, craftingVisible, gatheringLayout, craftingLayout })}`);
  }

  await page.click('#play-mobile-walkthrough-nav [data-play-mode="combat"]');
  await page.click('[data-mobile-sheet-page="overview"]');
  await page.waitForFunction(() => document.querySelector('#play-header-card')?.textContent?.includes('Mobile Test Hero'));
  if (browserName.startsWith('Chromium')) {
    const sheetPath = path.join(QA_DIR, 'screenshot-chromium-mobile-sheet.png');
    await page.screenshot({ path: sheetPath });
    console.log('   Captured: qa-test-results/screenshot-chromium-mobile-sheet.png');
  }

  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
}

function isLocalTestUrl(url) {
  return url.includes(`127.0.0.1:${PORT}`) || url.includes(`localhost:${PORT}`);
}

function isIgnorableLocalMediaAbort(request) {
  const url = request.url();
  const failureText = request.failure()?.errorText || '';
  return isLocalTestUrl(url)
    && /\.mp3(?:[?#]|$)/i.test(url)
    && /abort|cancel/i.test(failureText);
}

async function main() {
  console.log('--- Initializing Cross-Browser Testing against Deployment Artifact ---');
  await fs.mkdir(QA_DIR, { recursive: true });
  await assertDiceRollerHasNoPageDimmingPlane();

  // 1. Replicate the GitHub Pages deployment artifact copy
  console.log(`Replicating deployment artifact in ${DEPLOY_TEMP_DIR}...`);
  await copyDeploymentArtifact();
  await fs.writeFile(path.join(DEPLOY_TEMP_DIR, '.nojekyll'), '', 'utf8');

  let testFailedGlobal = false;

  try {
    console.log('Checking direct file startup from copied deployment artifact...');
    await runDirectFileStartupAssertion();
  } catch (fileStartupError) {
    console.error('Direct file startup check failed:', fileStartupError.message);
    testFailedGlobal = true;
  }

  // 2. Start local server in the background serving the mock deployment folder
  console.log(`Starting local server on port ${PORT}...`);
  const serverProcess = fork(path.join(PROJECT_ROOT, 'scripts', 'server.mjs'), {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      LYRIAN_PORT: String(PORT),
      LYRIAN_NO_OPEN: '1', // Prevent opening browser
      LYRIAN_PROJECT_ROOT: DEPLOY_TEMP_DIR // Force server to serve deployment artifact folder
    }
  });

  // Give the server 3 seconds to start
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const targetUrl = `http://127.0.0.1:${PORT}/`;
  const viewports = [
    { name: 'Wide', width: 1660, height: 760 },
    { name: 'Desktop', width: 1280, height: 800 },
    { name: 'Mobile', width: 390, height: 844 } // iPhone 13/14 viewport simulation
  ];

const browsers = [
    { name: 'Chromium (Chrome-Edge)', type: chromium },
    { name: 'Firefox', type: firefox },
    { name: 'WebKit (Safari)', type: webkit }
  ];

  async function runCraftingOutcomeResolutionAssertion(page) {
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    await page.locator('[data-builder-action="pick-race"]').filter({ hasText: 'Human' }).first().click();
    await page.click('#builder-sheet-shortcut-top');
    await page.waitForSelector('[data-play-mode="crafting"]', { timeout: 5000 });
    await page.click('[data-play-mode="crafting"]');
    await page.waitForSelector('#play-crafting [data-crafting-select-recipe="axolotl-elixir"]', { timeout: 5000 });
    await page.click('#play-crafting [data-crafting-select-recipe="axolotl-elixir"]');
    await page.click('#play-crafting [data-crafting-wizard-goto="4"]');
    await page.waitForSelector('#play-crafting [data-crafting-action="craft-success"]', { timeout: 5000 });
    await page.click('#play-crafting [data-crafting-action="craft-success"]');

    const guardResult = await page.evaluate(() => {
      const logText = document.querySelector('#play-log')?.textContent || '';
      return {
        successDisabled: Boolean(document.querySelector('#play-crafting [data-crafting-action="craft-success"]')?.disabled),
        failureDisabled: Boolean(document.querySelector('#play-crafting [data-crafting-action="craft-failure"]')?.disabled),
        undoAvailable: Boolean(document.querySelector('#play-crafting [data-crafting-action="craft-undo"]')),
        newCraftAvailable: Boolean(document.querySelector('#play-crafting [data-crafting-action="reset-session"]')),
        craftSucceededMentions: (logText.match(/Craft Succeeded/g) || []).length,
        craftedLineMentions: (logText.match(/Crafted: 1 x Axolotl Elixir/g) || []).length
      };
    });

    if (
      !guardResult.successDisabled ||
      !guardResult.failureDisabled ||
      !guardResult.undoAvailable ||
      !guardResult.newCraftAvailable ||
      guardResult.craftSucceededMentions !== 1 ||
      guardResult.craftedLineMentions !== 1
    ) {
      throw new Error(`Crafting outcome guard regression failed: ${JSON.stringify(guardResult)}`);
    }

    await page.click('[data-play-mode="combat"]');
    await page.click('[data-play-tab="inventory"]');
    const inventoryResult = await page.evaluate(() => {
      const inventoryText = document.querySelector('#play-inventory')?.textContent || '';
      return {
        axolotlInventoryMentions: (inventoryText.match(/Axolotl Elixir/g) || []).length
      };
    });
    if (inventoryResult.axolotlInventoryMentions !== 1) {
      throw new Error(`Crafting outcome inventory regression failed: ${JSON.stringify(inventoryResult)}`);
    }

    await page.click('[data-play-mode="crafting"]');
    await page.evaluate(() => {
      document.querySelector('#play-crafting [data-crafting-action="craft-success"]')?.click();
    });
    const duplicateAttemptResult = await page.evaluate(() => {
      const logText = document.querySelector('#play-log')?.textContent || '';
      return {
        craftSucceededMentions: (logText.match(/Craft Succeeded/g) || []).length,
        craftedLineMentions: (logText.match(/Crafted: 1 x Axolotl Elixir/g) || []).length
      };
    });
    if (duplicateAttemptResult.craftSucceededMentions !== 1 || duplicateAttemptResult.craftedLineMentions !== 1) {
      throw new Error(`Crafting duplicate outcome regression failed: ${JSON.stringify(duplicateAttemptResult)}`);
    }

    await page.click('#play-crafting [data-crafting-action="reset-session"]');
    await page.waitForFunction(() => document.querySelector('#play-crafting .play-wizard-shell h3')?.textContent?.trim() === 'Choose Recipe');
    const resetResult = await page.evaluate(() => ({
      recipeStepVisible: document.querySelector('#play-crafting .play-wizard-shell h3')?.textContent?.trim() === 'Choose Recipe',
      lastOutcomeVisible: document.querySelector('#play-crafting')?.textContent.includes('Last outcome') || false
    }));
    if (!resetResult.recipeStepVisible || resetResult.lastOutcomeVisible) {
      throw new Error(`Crafting new-session reset regression failed: ${JSON.stringify(resetResult)}`);
    }

    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
  }

  async function runGatheringNoYieldResolutionAssertion(page) {
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    await page.locator('[data-builder-action="pick-race"]').filter({ hasText: 'Human' }).first().click();
    await page.click('#builder-sheet-shortcut-top');
    await page.waitForSelector('[data-play-mode="gathering"]', { timeout: 5000 });
    await page.click('[data-play-mode="gathering"]');
    await page.waitForSelector('#play-gathering .play-wizard-shell h3', { timeout: 5000 });

    await page.locator('#play-gathering [data-crafting-field="gatheringHpMax"]').first().fill('1');
    await page.locator('#play-gathering [data-crafting-field="gatheringHpRemaining"]').first().fill('1');
    await page.click('#play-gathering [data-gathering-wizard-continue]');
    await page.locator('#play-gathering [data-gathering-gm-override]').first().check();
    await page.click('#play-gathering [data-gathering-wizard-continue]');
    await page.waitForFunction(() => document.querySelector('#play-gathering .play-wizard-shell h3')?.textContent?.trim() === 'Roll Strikes');

    await page.click('#play-gathering [data-crafting-action="gather-finish"]');
    await page.waitForFunction(() => document.querySelector('#play-gathering .play-wizard-shell h3')?.textContent?.trim() === 'Resolve Gather');

    const result = await page.evaluate(() => {
      const panel = document.querySelector('#play-gathering');
      const text = panel?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const resolvedButton = Array.from(panel?.querySelectorAll('button') || [])
        .find((button) => button.textContent.trim() === 'Attempt Resolved');
      return {
        hasNoYieldTitle: text.includes('Attempt Resolved / No Yield'),
        explainsNoYield: /Node Points were 0 \/ \d+/.test(text),
        explainsReset: text.includes('Progress bars were reset afterward'),
        explainsDepleted: text.includes('The node lost its final HP and is depleted. Pick a new node'),
        resolvedButtonDisabled: Boolean(resolvedButton?.disabled),
        repeatDisabled: Boolean(panel?.querySelector('[data-gathering-wizard-repeat]')?.disabled),
        newNodeAvailable: Boolean(panel?.querySelector('[data-gathering-wizard-new-node]'))
      };
    });

    if (
      !result.hasNoYieldTitle ||
      !result.explainsNoYield ||
      !result.explainsReset ||
      !result.explainsDepleted ||
      !result.resolvedButtonDisabled ||
      !result.repeatDisabled ||
      !result.newNodeAvailable
    ) {
      throw new Error(`Gathering no-yield resolution regression failed: ${JSON.stringify(result)}`);
    }

    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
  }

  async function runAllClassProgressionAssertions(page) {
    const versions = await page.evaluate(() => (window.LYRIAN_VERSION_MANIFEST?.versions || [])
      .filter((entry) => entry.local)
      .map((entry) => entry.id));
    const audited = [];

    for (const version of versions) {
      await page.evaluate((gameVersion) => {
        localStorage.clear();
        localStorage.setItem('lyrian-chronicles-selected-game-version-v2', gameVersion);
        localStorage.setItem('lyrian-chronicles-selected-game-version-latest-v1', '0.13.0');
        localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
          ui: { mode: 'builder', gameVersion },
          fields: { Name: `All Class Progression Audit ${gameVersion}` },
          builder: { selectedRaceId: 'human' }
        }));
      }, version);
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction((gameVersion) => window.LYRIAN_DATA?.version === gameVersion, version);

      const classes = await page.evaluate(() => window.LYRIAN_DATA.classes.map(({ id, name }) => ({ id, name })));
      const batchSize = 12;
      for (let offset = 0; offset < classes.length; offset += batchSize) {
        const batch = classes.slice(offset, offset + batchSize);
        await page.evaluate(({ gameVersion, selectedClasses }) => {
          localStorage.clear();
          localStorage.setItem('lyrian-chronicles-selected-game-version-v2', gameVersion);
          localStorage.setItem('lyrian-chronicles-selected-game-version-latest-v1', '0.13.0');
          localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
            ui: { mode: 'builder', gameVersion },
            fields: { Name: `All Class Progression Audit ${gameVersion}` },
            builder: {
              selectedRaceId: 'human',
              selectedClassIds: selectedClasses.map((entry) => entry.id),
              classAbilityProgress: Object.fromEntries(selectedClasses.map((entry) => [entry.id, 0]))
            }
          }));
        }, { gameVersion: version, selectedClasses: batch });
        await page.reload({ waitUntil: 'load' });
        await page.waitForFunction((gameVersion) => window.LYRIAN_DATA?.version === gameVersion, version);
        await page.click('[data-step-index="6"]');
        await page.waitForSelector('.class-progress-card', { timeout: 5000 });

        const rendered = await page.evaluate(() => [...document.querySelectorAll('.class-progress-card')].map((card) => ({
          name: card.querySelector('h4')?.textContent?.trim() || '',
          hasKeyAbility: /Key:\s*\S/.test(card.textContent || ''),
          levels: [...card.querySelectorAll('.class-progress-list li span:first-child')]
            .map((entry) => entry.textContent.replace(/\s+/g, ' ').trim())
        })));
        const expectedNames = batch.map((entry) => entry.name).sort();
        const renderedNames = rendered.map((entry) => entry.name).sort();
        const badProgressions = rendered.filter((entry) => (
          !entry.hasKeyAbility
          || entry.levels.length !== 7
          || entry.levels[1] !== 'Level 3: Class Skills'
          || entry.levels[3] !== 'Level 5: Heart'
          || entry.levels[5] !== 'Level 7: Soul'
          || [0, 2, 4, 6].some((index) => /Level \d+: (?:Class Skills|Heart|Soul)$/.test(entry.levels[index] || ''))
        ));
        if (
          renderedNames.join('|') !== expectedNames.join('|')
          || badProgressions.length
        ) {
          throw new Error(`All-class progression audit failed for ${version}: ${JSON.stringify({
            expectedNames,
            renderedNames,
            badProgressions
          })}`);
        }
        audited.push(...batch.map((entry) => `${version}:${entry.id}`));
      }
    }

    console.log(`   Audited ${audited.length} rendered class progressions across ${versions.length} local rules versions.`);
  }

  async function runRaceClassMatrixAssertions(page) {
    const matrix = await page.evaluate(() => {
      const ancestriesByRace = new Map();
      for (const ancestry of window.LYRIAN_DETAIL_DATA.ancestries || []) {
        const key = String(ancestry.primaryRace || '').toLowerCase();
        const entries = ancestriesByRace.get(key) || [];
        entries.push({ id: ancestry.id, name: ancestry.name });
        ancestriesByRace.set(key, entries);
      }
      const normalizeId = (value) => String(value || '').trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      return (window.LYRIAN_DETAIL_DATA.races || []).flatMap((race) => {
        const raceKey = String(race.name || '').toLowerCase();
        if (raceKey === 'human') {
          return [{ raceId: race.id, raceName: race.name, ancestryId: '', ancestryName: 'No ancestry' }];
        }
        if (raceKey === 'demon') {
          return Object.values(race.lineageChoices || {})
            .filter((choice) => choice?.title)
            .map((choice) => ({
              raceId: race.id,
              raceName: race.name,
              ancestryId: `demon-clan-${normalizeId(choice.code)}`,
              ancestryName: choice.title
            }));
        }
        return (ancestriesByRace.get(raceKey) || []).map((ancestry) => ({
          raceId: race.id,
          raceName: race.name,
          ancestryId: ancestry.id,
          ancestryName: ancestry.name
        }));
      });
    });
    const expectedClassCount = await page.evaluate(() => window.LYRIAN_DATA.classes.length);
    const expectedMiraneRestricted = [
      'angelblooded',
      'shinigami-eyes',
      'true-shinigami-eyes',
      'vampire',
      'vampire-lord'
    ];
    let evaluatedClassCards = 0;

    for (const identity of matrix) {
      let standardStates = null;
      for (const startMode of ['standard', 'mirane']) {
        await page.evaluate(({ raceId, ancestryId, startMode }) => {
          localStorage.clear();
          localStorage.setItem('lyrian-chronicles-selected-game-version-v2', '0.13.0');
          localStorage.setItem('lyrian-chronicles-selected-game-version-latest-v1', '0.13.0');
          localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
            ui: { mode: 'builder', gameVersion: '0.13.0' },
            fields: { Name: `Race and Class Matrix Audit ${startMode}` },
            builder: {
              startMode,
              selectedRaceId: raceId,
              selectedAncestryId: ancestryId
            }
          }));
        }, { ...identity, startMode });
        await page.reload({ waitUntil: 'load' });
        await page.waitForFunction(() => window.LYRIAN_DATA?.version === '0.13.0');
        await page.click('[data-step-index="6"]');
        await page.waitForFunction((classCount) => (
          document.querySelectorAll('[data-builder-action="toggle-class"]').length === classCount
        ), expectedClassCount);

        const result = await page.evaluate(() => {
          const cards = [...document.querySelectorAll('[data-builder-action="toggle-class"]')];
          const states = cards.map((card) => {
            const meta = card.querySelector('.builder-option-meta')?.textContent || '';
            const note = card.querySelector('.builder-option-note')?.textContent || '';
            const campaignLocked = meta.includes('Unavailable in Mirane');
            const available = meta.includes('Available');
            return {
              id: card.dataset.id,
              status: campaignLocked ? 'campaign' : (available ? 'available' : 'locked'),
              unlock: [...card.querySelectorAll('.builder-pill')].map((pill) => pill.textContent.trim()).find((value) => value.startsWith('Unlock ')) || '',
              campaignLocked,
              classLocked: card.classList.contains('locked'),
              note
            };
          });
          return {
            count: cards.length,
            uniqueIds: new Set(cards.map((card) => card.dataset.id)).size,
            budgetText: [...document.querySelectorAll('.selected-chip')].map((chip) => chip.textContent.replace(/\s+/g, ' ').trim()).join(' | '),
            states,
            unresolved: states.filter((entry) => (
              (entry.status === 'available' && entry.classLocked)
              || (entry.status !== 'available' && !entry.classLocked)
              || (entry.status === 'campaign' && !entry.note.includes('Unavailable for new Mirane Expedition characters'))
              || (entry.status === 'locked' && !entry.note.includes('Prerequisites not met'))
            )).map((entry) => entry.id)
          };
        });
        if (
          result.count !== expectedClassCount
          || result.uniqueIds !== expectedClassCount
          || result.unresolved.length
          || !result.budgetText.includes('Class EXP: 0 / 1000')
          || !result.budgetText.includes('Interlude: 0 / 3')
        ) {
          throw new Error(`Race/class matrix audit failed for ${startMode} ${identity.raceName} / ${identity.ancestryName}: ${JSON.stringify(result)}`);
        }

        if (startMode === 'standard') {
          const unexpectedCampaignLocks = result.states.filter((entry) => entry.campaignLocked).map((entry) => entry.id);
          if (unexpectedCampaignLocks.length) {
            throw new Error(`Standard Play exposed Mirane class locks for ${identity.raceName} / ${identity.ancestryName}: ${unexpectedCampaignLocks.join(', ')}`);
          }
          standardStates = new Map(result.states.map((entry) => [entry.id, entry]));
        } else {
          const campaignLockedIds = result.states.filter((entry) => entry.campaignLocked).map((entry) => entry.id).sort();
          const expectedIds = [...expectedMiraneRestricted].sort();
          const mismatched = result.states.filter((entry) => (
            !entry.campaignLocked
            && standardStates
            && (entry.status !== standardStates.get(entry.id)?.status || entry.unlock !== standardStates.get(entry.id)?.unlock)
          )).map((entry) => entry.id);
          if (campaignLockedIds.join('|') !== expectedIds.join('|') || mismatched.length) {
            throw new Error(`Dual-start class rules differ unexpectedly for ${identity.raceName} / ${identity.ancestryName}: ${JSON.stringify({ campaignLockedIds, expectedIds, mismatched })}`);
          }
        }
        evaluatedClassCards += result.count;
      }
    }

    console.log(`   Audited ${evaluatedClassCards} class availability states across ${matrix.length} race and ancestry paths in both Standard and Mirane starts.`);
  }

  async function runClassProficiencyChoiceAssertions(page) {
    const expectedByClass = {
      acolyte: ['class-acolyte-weapon-proficiency'],
      adventurer: [
        'class-adventurer-common-weapon-proficiency',
        'class-adventurer-extra-weapon-proficiency',
        'class-adventurer-armor-proficiency'
      ],
      alchemist: ['class-alchemist-basic-weapon-proficiency'],
      armorsmith: ['class-armorsmith-basic-melee-weapon-proficiency'],
      blacksmith: ['class-blacksmith-smithing-weapon-proficiency'],
      carpenter: ['class-carpenter-ranged-weapon-proficiency'],
      cavalier: ['class-cavalier-extra-common-weapon-proficiency'],
      cultivator: ['class-cultivator-extra-weapon-proficiency'],
      fighter: Array.from({ length: 5 }, (_, index) => `class-fighter-common-weapon-proficiency-${index + 1}`),
      forager: ['class-forager-gathering-weapon-proficiency'],
      merchant: ['class-merchant-common-weapon-proficiency'],
      mime: ['class-mime-common-weapon-proficiency', 'class-mime-specialized-weapon-proficiency'],
      miner: ['class-miner-armor-proficiency'],
      ranger: ['class-ranger-ranged-weapon-proficiency', 'class-ranger-melee-weapon-proficiency'],
      rogue: ['class-rogue-weapon-proficiency'],
      transmuter: ['class-transmuter-basic-weapon-proficiency']
    };
    const expectedClassIds = Object.keys(expectedByClass).sort();
    const sourceClassIds = await page.evaluate(() => window.LYRIAN_DETAIL_DATA.classes
      .filter((record) => {
        const key = record.keyAbility || {};
        return [key.benefit1, key.benefit2, key.benefit3, key.benefit4, record.heart]
          .filter(Boolean)
          .some((text) => /proficien/i.test(text) && /(?:your choice|of your choosing|choice between|\beither\b|one other|another weapon|\b(?:1|5|single)\s+(?:common|basic|smithing|armor)|common ranged weapon|common melee weapon|one of the following)/i.test(text));
      })
      .map((record) => record.id)
      .sort());
    if (sourceClassIds.join('|') !== expectedClassIds.join('|')) {
      throw new Error(`Selectable class proficiency source audit failed: ${JSON.stringify({ expectedClassIds, sourceClassIds })}`);
    }

    const entries = Object.entries(expectedByClass);
    for (let offset = 0; offset < entries.length; offset += 12) {
      const batch = entries.slice(offset, offset + 12);
      await page.evaluate((selectedClasses) => {
        localStorage.clear();
        localStorage.setItem('lyrian-chronicles-selected-game-version-v2', '0.13.0');
        localStorage.setItem('lyrian-chronicles-selected-game-version-latest-v1', '0.13.0');
        localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
          ui: { mode: 'builder', gameVersion: '0.13.0' },
          fields: { Name: 'Class Proficiency Choice Audit' },
          builder: {
            selectedRaceId: 'human',
            selectedClassIds: selectedClasses.map(([classId]) => classId),
            classAbilityProgress: Object.fromEntries(selectedClasses.map(([classId]) => [classId, 0]))
          }
        }));
      }, batch);
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => window.LYRIAN_DATA?.version === '0.13.0');
      await page.click('[data-step-index="6"]');
      const expectedIds = batch.flatMap(([, ids]) => ids).sort();
      await page.waitForFunction((count) => (
        document.querySelectorAll('[data-builder-choice-select*="proficiency"]').length === count
      ), expectedIds.length);
      const actualIds = await page.evaluate(() => [...document.querySelectorAll('[data-builder-choice-select*="proficiency"]')]
        .map((entry) => entry.dataset.builderChoiceSelect)
        .sort());
      if (actualIds.join('|') !== expectedIds.join('|')) {
        throw new Error(`Class proficiency dropdown coverage failed: ${JSON.stringify({ expectedIds, actualIds })}`);
      }
    }

    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('lyrian-chronicles-selected-game-version-v2', '0.13.0');
      localStorage.setItem('lyrian-chronicles-selected-game-version-latest-v1', '0.13.0');
      localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
        ui: { mode: 'builder', gameVersion: '0.13.0' },
        fields: { Name: 'Acolyte Fighter Proficiency Audit' },
        builder: {
          selectedRaceId: 'human',
          selectedClassIds: ['acolyte', 'fighter'],
          classAbilityProgress: { acolyte: 0, fighter: 0 }
        }
      }));
    });
    await page.reload({ waitUntil: 'load' });
    await page.click('[data-step-index="6"]');
    await page.selectOption('[data-builder-choice-select="class-acolyte-weapon-proficiency"]', 'Wand');
    const fighterSelections = ['Small Weapons', 'Polearms', 'Light Swords', 'Longsword', 'Dueling Weapons'];
    for (let index = 0; index < fighterSelections.length; index += 1) {
      const selector = `[data-builder-choice-select="class-fighter-common-weapon-proficiency-${index + 1}"]`;
      const previouslySelected = fighterSelections.slice(0, index);
      const duplicateOptions = await page.locator(selector).locator('option').evaluateAll((options, blocked) => (
        options.filter((option) => blocked.includes(option.value)).map((option) => option.value)
      ), previouslySelected);
      if (duplicateOptions.length) {
        throw new Error(`Fighter proficiency uniqueness failed before choice ${index + 1}: ${JSON.stringify(duplicateOptions)}`);
      }
      await page.selectOption(selector, fighterSelections[index]);
    }
    const resolvedProficiencyResult = await page.evaluate(() => {
      const panel = [...document.querySelectorAll('.review-panel')]
        .find((entry) => entry.querySelector('strong')?.textContent?.trim() === 'Class Benefit Choices');
      return {
        panelText: panel?.textContent?.replace(/\s+/g, ' ').trim() || '',
        values: [...document.querySelectorAll('[data-builder-choice-select*="class-fighter-common-weapon-proficiency"]')]
          .map((entry) => entry.value)
      };
    });
    if (
      !resolvedProficiencyResult.panelText.includes('Acolyte: Wand proficiency.')
      || new Set(resolvedProficiencyResult.values).size !== 5
    ) {
      throw new Error(`Resolved class proficiency choices failed: ${JSON.stringify(resolvedProficiencyResult)}`);
    }

    const setArmorsmithProgress = async (progress) => {
      await page.evaluate((classProgress) => {
        localStorage.clear();
        localStorage.setItem('lyrian-chronicles-selected-game-version-v2', '0.13.0');
        localStorage.setItem('lyrian-chronicles-selected-game-version-latest-v1', '0.13.0');
        localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
          ui: { mode: 'builder', gameVersion: '0.13.0' },
          fields: { Name: 'Armorsmith Heart Proficiency Audit' },
          builder: {
            selectedRaceId: 'human',
            selectedClassIds: ['armorsmith'],
            classAbilityProgress: { armorsmith: classProgress }
          }
        }));
      }, progress);
      await page.reload({ waitUntil: 'load' });
      await page.click('[data-step-index="6"]');
      return page.locator('[data-builder-choice-select="class-armorsmith-heart-proficiency"]').count();
    };
    const beforeHeart = await setArmorsmithProgress(3);
    const afterHeart = await setArmorsmithProgress(4);
    if (beforeHeart !== 0 || afterHeart !== 1) {
      throw new Error(`Armorsmith Heart proficiency level gate failed: ${JSON.stringify({ beforeHeart, afterHeart })}`);
    }

    console.log('   Audited 25 selectable proficiency grants across 16 classes.');
  }

  async function runQuickBuildStartModeAssertion(page) {
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });

    page.once('dialog', async (dialog) => dialog.accept());
    await page.click('#quick-build-entry');
    const quickSpecies = await page.evaluate(() => ({
      count: document.querySelectorAll('[data-quick-build-action="select-species"]').length,
      slimefolkText: document.querySelector('[data-quick-build-action="select-species"][data-id="slimefolk"]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      slimefolkImage: document.querySelector('[data-quick-build-action="select-species"][data-id="slimefolk"] img')?.getAttribute('src') || '',
      dullahanText: document.querySelector('[data-quick-build-action="select-species"][data-id="dullahan"]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      wolfFolkText: document.querySelector('[data-quick-build-action="select-species"][data-id="wolf-folk"]')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    }));
    if (
      quickSpecies.count !== 18
      || !quickSpecies.slimefolkText.includes('Chimera / Slimefolk')
      || !quickSpecies.slimefolkImage.includes('Slime_GIrl')
      || !quickSpecies.dullahanText.includes('Fae / Dullahan')
      || !quickSpecies.wolfFolkText.includes('Chimera / Wolf-folk')
    ) {
      throw new Error(`Quick Build Slimefolk species regression failed: ${JSON.stringify(quickSpecies)}`);
    }
    await page.locator('[data-quick-build-action="select-species"][data-id="slimefolk"]').click();
    await page.click('#builder-next');
    await page.waitForSelector('[data-quick-start-mode="standard"]', { timeout: 5000 });

    const initial = await page.evaluate(() => ({
      standardPressed: document.querySelector('[data-quick-start-mode="standard"]')?.getAttribute('aria-pressed'),
      miranePressed: document.querySelector('[data-quick-start-mode="mirane"]')?.getAttribute('aria-pressed'),
      text: document.querySelector('.quick-spirit-core-card')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    }));
    if (initial.standardPressed !== 'true' || initial.miranePressed !== 'false' || !initial.text.includes('3000 starting Clim')) {
      throw new Error(`Quick Build standard start regression failed: ${JSON.stringify(initial)}`);
    }

    let dismissedPrompt = '';
    page.once('dialog', async (dialog) => {
      dismissedPrompt = dialog.message();
      await dialog.dismiss();
    });
    await page.click('[data-quick-start-mode="mirane"]');
    const afterDismiss = await page.locator('[data-quick-start-mode="standard"]').getAttribute('aria-pressed');
    if (afterDismiss !== 'true' || !dismissedPrompt.includes('different set of campaign restrictions')) {
      throw new Error(`Quick Build Mirane confirmation/cancel regression failed: ${JSON.stringify({ afterDismiss, dismissedPrompt })}`);
    }

    page.once('dialog', async (dialog) => dialog.accept());
    await page.click('[data-quick-start-mode="mirane"]');
    const mirane = await page.evaluate(() => ({
      pressed: document.querySelector('[data-quick-start-mode="mirane"]')?.getAttribute('aria-pressed'),
      text: document.querySelector('.quick-spirit-core-card')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      status: document.getElementById('status-message')?.textContent || ''
    }));
    if (
      mirane.pressed !== 'true'
      || !mirane.text.includes('4000 starting Clim')
      || !mirane.text.includes('Creation EXP, breakthrough EXP, and Interlude Points stay standard')
    ) {
      throw new Error(`Quick Build Mirane start regression failed: ${JSON.stringify(mirane)}`);
    }

    await page.click('#builder-next');
    await page.locator('[data-quick-build-action="select-build"]').first().click();
    await page.click('#builder-next');
    await page.waitForSelector('.mirane-legacy-planner', { timeout: 5000 });
    const quickReviewSpecies = await page.locator('.review-panel').filter({ hasText: 'Species' }).first().textContent();
    if (!quickReviewSpecies?.includes('Chimera / Slimefolk')) {
      throw new Error(`Quick Build Slimefolk review regression failed: ${quickReviewSpecies}`);
    }
    const quickLegacyOptions = await page.locator('.mirane-legacy-option').count();
    if (quickLegacyOptions !== 3) {
      throw new Error(`Quick Build Mirane review did not show all three legacy options: ${quickLegacyOptions}`);
    }

    await page.waitForTimeout(500);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
  }

  async function runAllQuickBuildPackageAssertions(page) {
    const expectedClassPlans = {
      'shield-warrior': [{ name: 'Fighter', purchasedCount: 7 }, { name: 'Guardian', purchasedCount: 0 }],
      'great-weapon-striker': [{ name: 'Fighter', purchasedCount: 7 }, { name: 'Highlander', purchasedCount: 0 }],
      'sneak-thief': [{ name: 'Rogue', purchasedCount: 7 }, { name: 'Mage', purchasedCount: 1 }],
      'unarmed-monk': [{ name: 'Martial Artist', purchasedCount: 7 }, { name: 'Cultivator', purchasedCount: 1 }],
      'hunter-archer': [{ name: 'Ranger', purchasedCount: 7 }, { name: 'Rogue', purchasedCount: 1 }],
      'scout-sniper-path': [{ name: 'Ranger', purchasedCount: 7 }, { name: 'Rogue', purchasedCount: 1 }],
      'control-wizard': [{ name: 'Mage', purchasedCount: 7 }, { name: 'Elementalist', purchasedCount: 0 }],
      'elemental-blaster': [{ name: 'Pyromancer', purchasedCount: 7 }, { name: 'Sorcerer', purchasedCount: 0 }],
      'cleric-support': [{ name: 'Acolyte', purchasedCount: 7 }, { name: 'Medic', purchasedCount: 1 }],
      'performance-support': [{ name: 'Idol', purchasedCount: 7 }, { name: 'Jewel Idol', purchasedCount: 0 }],
      gadgeteer: [{ name: 'Artificer', purchasedCount: 7 }, { name: 'Magitechnician', purchasedCount: 0 }],
      'potion-healer': [{ name: 'Alchemist', purchasedCount: 7 }, { name: 'Acolyte', purchasedCount: 1 }]
    };
    const audited = [];
    for (const startMode of ['standard', 'mirane']) {
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'load' });

      page.once('dialog', async (dialog) => dialog.accept());
      await page.click('#quick-build-entry');
      await page.locator('[data-quick-build-action="select-species"][data-id="slimefolk"]').click();
      await page.click('#builder-next');
      await page.waitForSelector('[data-quick-start-mode="standard"]', { timeout: 5000 });
      if (startMode === 'mirane') {
        page.once('dialog', async (dialog) => dialog.accept());
        await page.click('[data-quick-start-mode="mirane"]');
      }
      await page.click('#builder-next');
      await page.waitForSelector('[data-quick-build-action="select-build"]', { timeout: 5000 });

      const buildIds = await page.locator('[data-quick-build-action="select-build"]').evaluateAll((cards) => cards.map((card) => card.dataset.id));
      if (buildIds.length !== 12 || new Set(buildIds).size !== buildIds.length) {
        throw new Error(`Quick Build package inventory regression failed for ${startMode}: ${JSON.stringify(buildIds)}`);
      }

      for (const buildId of buildIds) {
        await page.locator(`[data-quick-build-action="select-build"][data-id="${buildId}"]`).click();
        const detailText = (await page.locator('#builder-detail-card').textContent())?.replace(/\s+/g, ' ').trim() || '';
        if (
          !detailText.includes('How It Plays')
          || !detailText.includes('Starting Class Package')
          || !detailText.includes('Skills You Start With')
          || !detailText.includes('Equipment and Perks')
          || !expectedClassPlans[buildId].every((entry) => detailText.includes(entry.name))
        ) {
          throw new Error(`Quick Build newcomer detail regression failed for ${buildId}: ${detailText}`);
        }
        const detailScroll = await page.evaluate(() => {
          const copy = document.querySelector('#builder-detail-card .detail-copy-scroll');
          if (!copy) {
            return { exists: false };
          }
          const styles = getComputedStyle(copy);
          return {
            exists: true,
            overflowY: styles.overflowY,
            clientHeight: copy.clientHeight,
            scrollHeight: copy.scrollHeight,
            clientWidth: copy.clientWidth,
            scrollWidth: copy.scrollWidth
          };
        });
        if (
          !detailScroll.exists
          || !['auto', 'scroll'].includes(detailScroll.overflowY)
          || detailScroll.clientHeight <= 0
          || detailScroll.scrollHeight < detailScroll.clientHeight
          || detailScroll.scrollWidth > detailScroll.clientWidth + 1
        ) {
          throw new Error(`Quick Build detail overflow regression failed for ${buildId}: ${JSON.stringify(detailScroll)}`);
        }
        await page.click('#builder-next');
        await page.waitForSelector('.quick-build-review-actions', { timeout: 5000 });
        await page.waitForTimeout(150);

        const result = await page.evaluate(() => {
          const panels = [...document.querySelectorAll('.review-panel')].map((panel) => panel.textContent.replace(/\s+/g, ' ').trim());
          const saved = JSON.parse(localStorage.getItem('lyrian-chronicles-character-suite-v2') || '{}');
          const classNames = new Map((window.LYRIAN_DETAIL_DATA?.classes || []).map((entry) => [entry.id, entry.name]));
          const breakthroughNames = new Map((window.LYRIAN_DATA?.breakthroughs || []).map((entry) => [entry.id, entry.name]));
          const breakthroughCosts = new Map((window.LYRIAN_DATA?.breakthroughs || []).map((entry) => [entry.id, Number.parseInt(entry.cost, 10) || 0]));
          const itemNames = new Map((window.LYRIAN_DATA?.items || []).map((entry) => [entry.id, entry.name]));
          const selectedClassIds = saved.builder?.selectedClassIds || [];
          return {
            selectedClassIds,
            selectedClassNames: selectedClassIds.map((id) => classNames.get(id) || id),
            classProgress: selectedClassIds.map((id) => ({
              name: classNames.get(id) || id,
              purchasedCount: Number(saved.builder?.classAbilityProgress?.[id] || 0)
            })),
            breakthroughNames: (saved.builder?.selectedBreakthroughIds || []).map((id) => breakthroughNames.get(id) || id),
            breakthroughSpend: (saved.builder?.selectedBreakthroughIds || []).reduce((total, id) => total + (breakthroughCosts.get(id) || 0), 0),
            inventory: (saved.play?.inventoryItems || []).map((entry) => ({
              name: itemNames.get(entry.itemId) || entry.name || entry.itemId || '',
              equipped: Boolean(entry.equipped)
            })),
            elementalAffinity: saved.builder?.choiceSelections?.['breakthrough-elemental-affinity-elements'] || '',
            startMode: saved.builder?.startMode || '',
            startModeField: saved.fields?.['Start Mode'] || '',
            expPanel: panels.find((text) => text.startsWith('EXP')) || '',
            climPanel: panels.find((text) => text.startsWith('Clim')) || '',
            summary: panels.find((text) => text.startsWith('Why This Build')) || '',
            roadmap: panels.find((text) => text.startsWith('Class Path and Extra-EXP Roadmap')) || '',
            status: document.getElementById('status-message')?.textContent || ''
          };
        });
        const expMatch = result.expPanel.match(/Spent (\d+) \/ (\d+); remaining (-?\d+)/);
        const climMatch = result.climPanel.match(/Spent (\d+); remaining (-?\d+)/);
        const expectedModeLabel = startMode === 'mirane' ? 'Mirane Expedition' : 'Standard Play';
        const restrictedClasses = result.selectedClassNames.filter((name) => /^(?:Angelblooded|Shinigami Eyes|True Shinigami Eyes|Vampire|Vampire Lord)$/i.test(name));
        const expectedClassPlan = expectedClassPlans[buildId];
        const classAllocationValid = JSON.stringify(result.classProgress) === JSON.stringify(expectedClassPlan)
          && (buildId === 'elemental-blaster'
            ? result.breakthroughNames.includes('Elemental Affinity')
            && result.breakthroughNames.includes('Wide Circuits I')
            && result.elementalAffinity === 'Fire'
            : true);
        if (
          result.startMode !== startMode
          || result.startModeField !== expectedModeLabel
          || result.selectedClassIds.length !== 2
          || new Set(result.selectedClassIds).size !== 2
          || !classAllocationValid
          || restrictedClasses.length
          || !expMatch
          || Number(expMatch[1]) !== 1000
          || Number(expMatch[2]) !== 1000
          || Number(expMatch[3]) !== 0
          || result.breakthroughSpend !== 300
          || !climMatch
          || Number(climMatch[2]) < 0
          || !result.summary.includes('Class plan:')
          || !result.summary.includes('= 1000 EXP')
          || !result.summary.includes('Gear package:')
          || !result.roadmap.includes('total EXP')
          || !result.roadmap.includes('mastered')
          || result.summary.includes('Unavailable in Mirane and removed:')
        ) {
          throw new Error(`Quick Build package failed for ${startMode}/${buildId}: ${JSON.stringify(result)}`);
        }
        const autoEquipCandidates = result.inventory.filter(({ name }) => {
          const normalized = name.toLowerCase();
          return !/(potion|elixir|flask|ration|food|salve|poison|shell)/.test(normalized)
            && /(armor|weapon|binocular|kit|multitool|rig)/.test(normalized);
        });
        const missingAutoEquips = autoEquipCandidates.filter((entry) => !entry.equipped).map((entry) => entry.name);
        const equippedConsumables = result.inventory
          .filter((entry) => entry.equipped && /(potion|elixir|flask|ration|food|salve|poison|shell)/.test(entry.name.toLowerCase()))
          .map((entry) => entry.name);
        if (!autoEquipCandidates.length || missingAutoEquips.length || equippedConsumables.length) {
          throw new Error(`Quick Build equipment loadout regression failed for ${startMode}/${buildId}: ${JSON.stringify({ inventory: result.inventory, missingAutoEquips, equippedConsumables })}`);
        }
        audited.push(`${startMode}:${buildId}`);

        await page.click('[data-quick-build-action="back-to-build"]');
        await page.waitForSelector('[data-quick-build-action="select-build"]', { timeout: 5000 });
      }
    }

    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    page.once('dialog', async (dialog) => dialog.accept());
    await page.click('#quick-build-entry');
    await page.locator('[data-quick-build-action="select-species"][data-id="phoenix"]').click();
    await page.click('#builder-next');
    await page.click('#builder-next');
    await page.locator('[data-quick-build-action="select-build"][data-id="elemental-blaster"]').click();
    await page.click('#builder-next');
    await page.waitForSelector('.quick-build-class-roadmap', { timeout: 5000 });
    await page.waitForTimeout(250);
    const phoenixElementalPlan = await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('lyrian-chronicles-character-suite-v2') || '{}');
      const classNames = new Map((window.LYRIAN_DETAIL_DATA?.classes || []).map((entry) => [entry.id, entry.name]));
      const breakthroughNames = new Map((window.LYRIAN_DATA?.breakthroughs || []).map((entry) => [entry.id, entry.name]));
      return {
        progress: (saved.builder?.selectedClassIds || []).map((id) => ({
          name: classNames.get(id) || id,
          purchasedCount: Number(saved.builder?.classAbilityProgress?.[id] || 0)
        })),
        breakthroughs: (saved.builder?.selectedBreakthroughIds || []).map((id) => breakthroughNames.get(id) || id),
        summary: document.querySelector('.review-panel.quick-build-class-roadmap')?.textContent.replace(/\s+/g, ' ').trim() || ''
      };
    });
    if (
      !phoenixElementalPlan.progress.some((entry) => entry.name === 'Pyromancer' && entry.purchasedCount === 7)
      || !phoenixElementalPlan.progress.some((entry) => entry.name === 'Sorcerer' && entry.purchasedCount === 0)
      || phoenixElementalPlan.breakthroughs.includes('Elemental Affinity')
      || !phoenixElementalPlan.breakthroughs.includes('Wide Circuits I')
      || !phoenixElementalPlan.summary.includes('Phoenix already grants Fire Mastery')
    ) {
      throw new Error(`Quick Build Phoenix Fire Mastery shortcut regression failed: ${JSON.stringify(phoenixElementalPlan)}`);
    }

    const demonOptimizations = {
      'sneak-thief': [
        { name: 'Rogue', purchasedCount: 7 },
        { name: 'Mage', purchasedCount: 1 },
        { name: 'Saboteur', purchasedCount: 0 }
      ],
      'cleric-support': [
        { name: 'Acolyte', purchasedCount: 7 },
        { name: 'Medic', purchasedCount: 2 }
      ],
      'performance-support': [
        { name: 'Idol', purchasedCount: 7 },
        { name: 'Jewel Idol', purchasedCount: 0 },
        { name: 'Maid', purchasedCount: 0 }
      ],
      'potion-healer': [
        { name: 'Alchemist', purchasedCount: 7 },
        { name: 'Medic', purchasedCount: 2 }
      ]
    };
    for (const [buildId, expectedProgress] of Object.entries(demonOptimizations)) {
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'load' });
      page.once('dialog', async (dialog) => dialog.accept());
      await page.click('#quick-build-entry');
      await page.locator('[data-quick-build-action="select-species"][data-id="demon"]').click();
      await page.click('#builder-next');
      await page.click('#builder-next');
      await page.locator(`[data-quick-build-action="select-build"][data-id="${buildId}"]`).click();
      const demonDetail = (await page.locator('#builder-detail-card').textContent())?.replace(/\s+/g, ' ').trim() || '';
      if (!expectedProgress.every((entry) => demonDetail.includes(entry.name)) || !demonDetail.includes('Demon optimization:')) {
        throw new Error(`Quick Build Demon detail optimization failed for ${buildId}: ${demonDetail}`);
      }
      await page.click('#builder-next');
      await page.waitForSelector('.quick-build-class-roadmap', { timeout: 5000 });
      await page.waitForTimeout(250);
      const demonResult = await page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem('lyrian-chronicles-character-suite-v2') || '{}');
        const classNames = new Map((window.LYRIAN_DETAIL_DATA?.classes || []).map((entry) => [entry.id, entry.name]));
        return {
          progress: (saved.builder?.selectedClassIds || []).map((id) => ({
            name: classNames.get(id) || id,
            purchasedCount: Number(saved.builder?.classAbilityProgress?.[id] || 0)
          })),
          expText: [...document.querySelectorAll('.review-panel')]
            .map((panel) => panel.textContent.replace(/\s+/g, ' ').trim())
            .find((text) => text.startsWith('EXP')) || '',
          summary: [...document.querySelectorAll('.review-panel')]
            .map((panel) => panel.textContent.replace(/\s+/g, ' ').trim())
            .find((text) => text.startsWith('Why This Build')) || ''
        };
      });
      if (
        JSON.stringify(demonResult.progress) !== JSON.stringify(expectedProgress)
        || !demonResult.expText.includes('Spent 1000 / 1000; remaining 0')
        || !demonResult.summary.includes('Demon optimization:')
      ) {
        throw new Error(`Quick Build Demon class shortcut failed for ${buildId}: ${JSON.stringify(demonResult)}`);
      }
    }

    console.log(`   Audited ${audited.length} Quick Build class-and-gear packages across Standard and Mirane starts, plus Phoenix and Demon race shortcuts.`);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
  }

  async function runMiraneLegacyPlannerAssertion(page) {
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('lyrian-chronicles-selected-game-version-v2', '0.13.0');
      localStorage.setItem('lyrian-chronicles-selected-game-version-latest-v1', '0.13.0');
      localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
        ui: { mode: 'builder', builderStep: 9, gameVersion: '0.13.0' },
        fields: { Name: 'Mirane Legacy Audit', 'Spirit Core': '3200' },
        builder: { startMode: 'mirane', selectedRaceId: 'human' }
      }));
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.mirane-legacy-planner', { timeout: 5000 });

    const planner = page.locator('.mirane-legacy-planner');
    const summary = await planner.innerText();
    if (
      !summary.includes('Current Spirit Core')
      || !summary.includes('3200')
      || !summary.includes('2200 Spirit Core')
      || await planner.locator('.mirane-legacy-option').count() !== 3
    ) {
      throw new Error(`Mirane legacy planner summary regression failed: ${summary}`);
    }

    await planner.locator('.mirane-legacy-option').filter({ hasText: 'Retire This Character' }).locator('summary').click();
    const retirementText = await planner.locator('.mirane-legacy-option').filter({ hasText: 'Retire This Character' }).innerText();
    if (!retirementText.includes('lockout still applies') || !retirementText.includes('Slow Starter') || !retirementText.includes('4050 Clim')) {
      throw new Error(`Mirane retirement explanation regression failed: ${retirementText}`);
    }

    await planner.locator('.mirane-legacy-option').filter({ hasText: 'Expedition Death — Option 2' }).locator('summary').click();
    const optionTwoText = await planner.locator('.mirane-legacy-option').filter({ hasText: 'Expedition Death — Option 2' }).innerText();
    if (!optionTwoText.includes('50% rate') || !optionTwoText.includes('remains locked out')) {
      throw new Error(`Mirane expedition death Option 2 regression failed: ${optionTwoText}`);
    }

    await page.evaluate(() => {
      localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
        ui: { mode: 'builder', builderStep: 9, gameVersion: '0.13.0' },
        fields: { Name: 'Standard Legacy Audit', 'Spirit Core': '3200' },
        builder: { startMode: 'standard', selectedRaceId: 'human' }
      }));
    });
    await page.reload({ waitUntil: 'load' });
    if (await page.locator('.mirane-legacy-planner').count()) {
      throw new Error('Mirane legacy planner appeared during Standard Play.');
    }

    await page.waitForTimeout(500);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
  }

  async function runMiraneEconomyAndCraftingAssertion(page) {
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('lyrian-chronicles-selected-game-version-v2', '0.13.0');
      localStorage.setItem('lyrian-chronicles-selected-game-version-latest-v1', '0.13.0');
      localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
        ui: { mode: 'sheet', playMode: 'crafting', sheetTab: 'actions', gameVersion: '0.13.0' },
        fields: { Name: 'Mirane Economy Audit', Exp: '0' },
        builder: { startMode: 'mirane', selectedRaceId: 'human' },
        play: { crafting: { activityMode: 'crafting' } }
      }));
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#play-crafting:not([hidden])', { timeout: 5000 });

    const rulesText = await page.locator('#play-crafting .mirane-downtime-rules').first().innerText();
    if (
      !rulesText.includes('Mirane crafting rules')
      || !rulesText.includes('crafting channel')
      || !rulesText.includes('Basic Craft')
      || !rulesText.includes('150 Clim base')
      || !rulesText.includes('4000 Clim maximum listing price')
    ) {
      throw new Error(`Mirane crafting/economy rules panel regression failed: ${rulesText}`);
    }

    const rulesContrast = await page.evaluate(() => {
      const panel = document.querySelector('#play-crafting .mirane-downtime-rules');
      const paragraph = panel?.querySelector(':scope > p');
      return {
        paragraphColor: paragraph ? getComputedStyle(paragraph).color : '',
        panelBackground: panel ? getComputedStyle(panel).backgroundColor : ''
      };
    });
    if (!/26,\s*27,\s*31/.test(rulesContrast.paragraphColor)) {
      throw new Error(`Mirane crafting rules contrast regression failed: ${JSON.stringify(rulesContrast)}`);
    }

    const allRecipeCount = await page.locator('#play-crafting [data-crafting-select-recipe]').count();
    const availabilityFilter = page.locator('#play-crafting [data-crafting-availability-filter="available"]');
    if (await availabilityFilter.count() !== 1) {
      throw new Error('Crafting Available Recipes filter control was not rendered.');
    }
    const recipeCategoryFilterGroup = page.locator('#play-crafting .play-recipe-filter-group').filter({ hasText: 'Recipe Category' });
    if (await recipeCategoryFilterGroup.locator('[data-crafting-availability-filter="available"]').count() !== 1) {
      throw new Error('Crafting Available Recipes filter is not beside the recipe category choices.');
    }
    await availabilityFilter.click();
    const filteredRecipeCount = await page.locator('#play-crafting [data-crafting-select-recipe]').count();
    const unavailableRecipeCount = await page.locator('#play-crafting .play-recipe-option.is-unavailable').count();
    const availabilityNote = await page.locator('#play-crafting .play-recipe-availability-filter-note').innerText();
    const availabilityPressed = await availabilityFilter.getAttribute('aria-pressed');
    if (availabilityPressed !== 'true' || unavailableRecipeCount !== 0 || !availabilityNote.includes('class and required core tool')) {
      throw new Error(`Crafting Available Recipes filter regression failed: ${JSON.stringify({ allRecipeCount, filteredRecipeCount, unavailableRecipeCount, availabilityNote, availabilityPressed })}`);
    }
    await availabilityFilter.click();
    const restoredRecipeCount = await page.locator('#play-crafting [data-crafting-select-recipe]').count();
    if (restoredRecipeCount !== allRecipeCount) {
      throw new Error(`Crafting recipe filter did not restore the full list: ${JSON.stringify({ allRecipeCount, restoredRecipeCount })}`);
    }

    await page.click('#play-crafting [data-crafting-selection-mode="shop"]');
    const marketPriceInput = page.locator('#play-crafting [data-mirane-market-price]').first();
    const marketItemId = await marketPriceInput.getAttribute('data-mirane-market-price');
    if (!marketItemId) {
      throw new Error('Mirane crafting shop did not expose a current market price field.');
    }
    const availabilitySelector = `#play-crafting [data-mirane-market-availability="${marketItemId}"]`;
    const purchaseSelector = `#play-crafting [data-crafting-purchase-item="${marketItemId}"]`;
    await page.click(availabilitySelector);
    const unavailable = await page.locator(purchaseSelector).isDisabled();
    if (!unavailable) {
      throw new Error('Mirane market availability toggle did not disable purchasing.');
    }
    await page.click(availabilitySelector);
    await page.locator(`#play-crafting [data-mirane-market-price="${marketItemId}"]`).fill('1');
    await page.locator(`#play-crafting [data-mirane-market-price="${marketItemId}"]`).press('Tab');
    page.once('dialog', async (dialog) => dialog.accept());
    await page.click(purchaseSelector);
    await page.waitForFunction(() => (document.getElementById('status-pill')?.textContent || '').includes('1 Clim'));

    await page.click('#play-crafting [data-crafting-selection-mode="recipe"]');
    await page.locator('#play-crafting [data-crafting-select-recipe]').first().click();
    await page.locator('#play-crafting [data-mirane-natural-ip]').check();
    await page.click('#play-crafting [data-crafting-wizard-goto="4"]');
    await page.click('#play-crafting [data-crafting-action="craft-failure"]');
    const firstAward = await page.locator('[data-field="Exp"]').first().inputValue();
    if (firstAward !== '20') {
      throw new Error(`Mirane natural-IP crafting EXP was not awarded once: ${firstAward}`);
    }

    await page.click('#play-crafting [data-crafting-action="reset-session"]');
    await page.locator('#play-crafting [data-crafting-select-recipe]').first().click();
    await page.click('#play-crafting [data-crafting-wizard-goto="4"]');
    await page.click('#play-crafting [data-crafting-action="craft-failure"]');
    const secondAward = await page.locator('[data-field="Exp"]').first().inputValue();
    if (secondAward !== '20') {
      throw new Error(`Mirane once-per-interlude EXP cap failed: ${secondAward}`);
    }

    await page.click('#play-crafting [data-mirane-reset-interlude-exp]');
    const resetText = await page.locator('#play-crafting .mirane-interlude-exp-status').first().innerText();
    if (!resetText.includes('award is available')) {
      throw new Error(`Mirane interlude phase reset failed: ${resetText}`);
    }

    await page.click('#play-header-card [data-play-mode="gathering"]');
    await page.waitForSelector('#play-gathering .mirane-downtime-rules', { timeout: 5000 });
    const gatheringRulesText = await page.locator('#play-gathering .mirane-downtime-rules').first().innerText();
    if (!gatheringRulesText.includes('Mirane gathering rules') || !gatheringRulesText.includes('Gather interlude') || !gatheringRulesText.includes('Spiritual Ground')) {
      throw new Error(`Mirane gathering rules panel regression failed: ${gatheringRulesText}`);
    }
    const gatheringRulesContrast = await page.evaluate(() => {
      const panel = document.querySelector('#play-gathering .mirane-downtime-rules');
      const paragraph = panel?.querySelector(':scope > p');
      return {
        paragraphColor: paragraph ? getComputedStyle(paragraph).color : '',
        panelBackground: panel ? getComputedStyle(panel).backgroundColor : ''
      };
    });
    if (!/26,\s*27,\s*31/.test(gatheringRulesContrast.paragraphColor)) {
      throw new Error(`Mirane gathering rules contrast regression failed: ${JSON.stringify(gatheringRulesContrast)}`);
    }

    await page.waitForTimeout(500);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
  }

  async function runDualStartGameplayOverrideAssertion(page) {
    const miraneClasses = ['onmyoji-', 'oracle', 'merchant', 'necromancer', 'death-knight'];
    await page.evaluate((selectedClassIds) => {
      localStorage.clear();
      localStorage.setItem('lyrian-chronicles-selected-game-version-v2', '0.13.0');
      localStorage.setItem('lyrian-chronicles-selected-game-version-latest-v1', '0.13.0');
      localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
        ui: { mode: 'sheet', playMode: 'combat', sheetTab: 'actions', gameVersion: '0.13.0' },
        fields: { Name: 'Mirane Gameplay Override Audit', Toughness: '5' },
        builder: {
          startMode: 'mirane',
          selectedRaceId: 'human',
          selectedClassIds,
          classAbilityProgress: Object.fromEntries(selectedClassIds.map((id) => [id, 4]))
        },
        play: { hpHasManualChange: true, resources: { hpCurrent: 1 } }
      }));
    }, miraneClasses);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.play-rest-card', { timeout: 5000 });

    const miraneRestText = await page.locator('.play-rest-card').innerText();
    if (
      !miraneRestText.includes('Floor Rest 0x Toughness')
      || !miraneRestText.includes('Camp / Basic Rest 1x')
      || !miraneRestText.includes('Luxury Rest 2x')
      || !miraneRestText.includes('recover only 1 Mana')
    ) {
      throw new Error(`Mirane recovery rule summary regression failed: ${miraneRestText}`);
    }
    const miraneRecoveryContrast = await page.evaluate(() => {
      const override = document.querySelector('.play-rest-card .mirane-rule-override');
      const paragraph = override?.querySelector('p');
      const normalParagraph = document.querySelector('.play-rest-card .play-action-copy > p');
      return {
        overrideTextColor: paragraph ? getComputedStyle(paragraph).color : '',
        normalTextColor: normalParagraph ? getComputedStyle(normalParagraph).color : '',
        backgroundColor: override ? getComputedStyle(override).backgroundColor : ''
      };
    });
    if (
      !miraneRecoveryContrast.overrideTextColor
      || miraneRecoveryContrast.overrideTextColor === miraneRecoveryContrast.normalTextColor
      || !/247,\s*237,\s*207/.test(miraneRecoveryContrast.overrideTextColor)
    ) {
      throw new Error(`Mirane recovery contrast regression failed: ${JSON.stringify(miraneRecoveryContrast)}`);
    }
    await page.click('[data-play-rest="floor"]');
    const miraneRestLog = await page.locator('#play-log').innerText();
    if (!miraneRestLog.includes('Recovered 0 HP (0x Toughness 5)') || !miraneRestLog.includes('reduced by one tier')) {
      throw new Error(`Mirane reduced-tier rest execution failed: ${miraneRestLog}`);
    }

    await page.click('[data-play-tab="abilities"]');
    const overrideCards = await page.evaluate(() => {
      const cardText = (name) => [...document.querySelectorAll('#play-quick-abilities .play-action-card')]
        .find((card) => [...card.querySelectorAll('strong, .play-reference-title')]
          .some((title) => title.textContent.trim() === name))?.textContent?.replace(/\s+/g, ' ').trim() || '';
      return {
        divineProvidence: cardText('Divine Providence'),
        createTalisman: cardText('Create Talisman'),
        procurement: cardText('Procurement')
      };
    });
    if (
      !overrideCards.divineProvidence.includes('both rested and entered a new encounter')
      || !overrideCards.createTalisman.includes('natural IP grants 20 EXP')
      || !overrideCards.procurement.includes('500 points for each week')
    ) {
      throw new Error(`Mirane ability override card regression failed: ${JSON.stringify(overrideCards)}`);
    }

    const classOverrideExpectations = {
      oracle: 'once per expedition',
      necromancer: 'store up to 8 corpses',
      'death-knight': 'shared storage limit is 8'
    };
    for (const [classId, expectedText] of Object.entries(classOverrideExpectations)) {
      await page.click(`[data-play-class-reference="${classId}"]`);
      await page.waitForSelector('#sheet-modal:not([hidden])', { timeout: 5000 });
      const modalText = await page.locator('#sheet-modal-content').innerText();
      if (!modalText.includes('Mirane Expedition override') || !modalText.includes(expectedText)) {
        throw new Error(`Mirane ${classId} class reference override failed: ${modalText}`);
      }
      await page.click('#sheet-modal-close');
    }

    await page.evaluate(() => {
      localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
        ui: { mode: 'builder', gameVersion: '0.13.0' },
        fields: { Name: 'Mirane Favor Class Audit' },
        builder: { startMode: 'mirane', selectedRaceId: 'human' }
      }));
    });
    await page.reload({ waitUntil: 'load' });
    await page.click('[data-step-index="6"]');
    const favorText = await page.locator('.mirane-class-start-note').innerText();
    if (!favorText.includes('1 Favor for a Tier 1 or Tier 2 class') || !favorText.includes('2 Favor for a Tier 3 class')) {
      throw new Error(`Mirane Favor class-training note regression failed: ${favorText}`);
    }

    await page.evaluate(() => {
      localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
        ui: { mode: 'sheet', playMode: 'combat', sheetTab: 'actions', gameVersion: '0.13.0' },
        fields: { Name: 'Standard Gameplay Override Audit', Toughness: '5' },
        builder: { startMode: 'standard', selectedRaceId: 'human' },
        play: { hpHasManualChange: true, resources: { hpCurrent: 1 } }
      }));
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.play-rest-card', { timeout: 5000 });
    if (await page.locator('.play-rest-card .mirane-rule-override').count()) {
      throw new Error('Mirane recovery override appeared during Standard Play.');
    }
    await page.click('[data-play-rest="floor"]');
    const standardRestLog = await page.locator('#play-log').innerText();
    if (!standardRestLog.includes('Recovered 5 HP (1x Toughness 5)') || standardRestLog.includes('reduced by one tier')) {
      throw new Error(`Standard rest changed by Mirane rules: ${standardRestLog}`);
    }

    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
  }

  async function runRulesRegressionAssertions(page) {
    await runQuickBuildStartModeAssertion(page);
    await runAllQuickBuildPackageAssertions(page);
    await runMiraneLegacyPlannerAssertion(page);
    await runMiraneEconomyAndCraftingAssertion(page);
    await runDualStartGameplayOverrideAssertion(page);
    await runAllClassProgressionAssertions(page);
    await runRaceClassMatrixAssertions(page);
    await runClassProficiencyChoiceAssertions(page);
    await runSpreadsheetVisibleGridImportAssertion(page);
    await runCraftingOutcomeResolutionAssertion(page);
    await runGatheringNoYieldResolutionAssertion(page);

    await page.locator('[data-builder-action="pick-race"]').filter({ hasText: 'Human' }).first().click();
    await page.click('[data-step-index="7"]');
    await page.waitForSelector('.builder-skill-expertise-panel', { timeout: 5000 });

    const firstExpertisePanel = page.locator('.builder-skill-expertise-panel').first();
    await firstExpertisePanel.locator('summary').click();
    const sourceUiResult = await firstExpertisePanel.evaluate((panel) => ({
      hasSourceDropdown: Boolean(panel.querySelector('select[data-skill-expertise-source]')),
      hasDirectSkillPointButton: Array.from(panel.querySelectorAll('[data-add-skill-expertise]'))
        .some((button) => button.textContent.includes('Use skill point'))
    }));
    if (sourceUiResult.hasSourceDropdown || !sourceUiResult.hasDirectSkillPointButton) {
      throw new Error(`Expertise source UI regression failed: ${JSON.stringify(sourceUiResult)}`);
    }
    await firstExpertisePanel.locator('[data-skill-expertise-name]').selectOption('Jumping');
    await firstExpertisePanel.locator('[data-add-skill-expertise][data-skill-expertise-source="creation"]').click();
    await page.waitForFunction(() => document.body.textContent.includes('Jumping'));
    await firstExpertisePanel.locator('[data-adjust-skill-expertise="1"][data-skill-expertise-name="Jumping"]').click();
    await firstExpertisePanel.locator('[data-adjust-skill-expertise="1"][data-skill-expertise-name="Jumping"]').click();
    await page.waitForFunction(() => document.body.textContent.includes('3 exchanged points') && document.body.textContent.includes('+6'));

    const expertiseResult = await page.evaluate(() => {
      const panelText = document.querySelector('.builder-skill-expertise-panel')?.textContent || '';
      const budgetText = document.querySelector('.selected-chip-list')?.textContent || '';
      return {
        hasRepeatedExpertise: panelText.includes('Jumping') && panelText.includes('3 exchanged points') && panelText.includes('+6'),
        budgetUpdated: budgetText.includes('Skill Points Spent: 3 / 10') && budgetText.includes('Remaining Skill Points: 7')
      };
    });

    if (!expertiseResult.hasRepeatedExpertise || !expertiseResult.budgetUpdated) {
      throw new Error(`Named expertise regression failed: ${JSON.stringify(expertiseResult)}`);
    }

    await page.click('#builder-sheet-shortcut-top');
    await page.waitForSelector('#play-hit-points #play-temp-hp-button', { timeout: 5000 });

    const skillSheetResult = await page.evaluate(() => {
      const firstSkill = document.querySelector('#play-skills .play-skill-mini-row');
      const baseRollText = firstSkill?.querySelector('[data-play-roll-skill]')?.textContent?.trim() || '';
      const expertiseText = firstSkill?.querySelector('.play-skill-expertise-options')?.textContent || '';
      return {
        baseRollText,
        hasOwnedExpertise: expertiseText.includes('Jumping +6'),
        hidesGenericExpertiseZero: !(firstSkill?.textContent || '').includes('Expertise +0'),
        hidesUnassignedExpertise: !(firstSkill?.textContent || '').includes('Unassigned')
      };
    });

    if (skillSheetResult.baseRollText !== '+0' || !skillSheetResult.hasOwnedExpertise || !skillSheetResult.hidesGenericExpertiseZero || !skillSheetResult.hidesUnassignedExpertise) {
      throw new Error(`Sheet expertise regression failed: ${JSON.stringify(skillSheetResult)}`);
    }

    await page.locator('#play-skills .play-skill-mini-row').first().locator('.play-skill-expertise-menu summary').click();
    await page.locator('[data-play-expertise-name="Jumping"]').click();
    await page.waitForFunction(() => document.querySelector('#play-log')?.textContent?.includes('Athletics (Jumping) Check'));

    const expertiseRollResult = await page.evaluate(() => {
      const logText = document.querySelector('#play-log .play-log-entry')?.textContent || '';
      return {
        hasNamedRoll: logText.includes('Athletics (Jumping) Check'),
        hasExpertiseBreakdown: logText.includes('Jumping Expertise +6'),
        hasTotal: /Total:\s*\d+/.test(logText)
      };
    });

    if (!expertiseRollResult.hasNamedRoll || !expertiseRollResult.hasExpertiseBreakdown || !expertiseRollResult.hasTotal) {
      throw new Error(`Sheet expertise roll regression failed: ${JSON.stringify(expertiseRollResult)}`);
    }

    await page.fill('#play-hp-adjust-amount', '7');
    await page.click('#play-temp-hp-button');
    await page.fill('#play-hp-adjust-amount', '3');
    await page.click('#play-temp-hp-button');
    await page.fill('#play-hp-adjust-amount', '5');
    await page.click('#play-damage-button');
    await page.click('#play-heal-button');

    const healthResult = await page.evaluate(() => {
      const currentHp = document.querySelector('.play-hit-current')?.textContent?.trim();
      const maxHp = document.querySelector('.play-hit-max')?.textContent?.trim();
      const tempHp = document.querySelector('.play-hit-temp-value')?.textContent?.trim();
      const tempBadgeText = document.querySelector('.play-hit-temp-inline')?.textContent || '';
      const note = document.querySelector('.play-hit-rule-note')?.textContent || '';
      const logText = document.querySelector('#play-log')?.textContent || '';
      const protectionLine = document.querySelector('.play-protection-line')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      return {
        currentHp,
        maxHp,
        tempHp,
        hasInlineTempBadge: tempBadgeText.includes('Temp HP'),
        oldTempInputRemoved: !document.querySelector('#play-temp-hp-adjust-amount'),
        noteMentionsTemp: note.includes('Temporary HP is tracked separately'),
        noteMentionsNoStack: note.includes('does not stack'),
        logMentionsNoStack: logText.includes('Temporary HP does not stack'),
        protectionLine,
        hasAstraProtectionLabel: /Astra Protection Level\s+\d+/.test(protectionLine)
      };
    });

    if (healthResult.currentHp !== healthResult.maxHp || healthResult.tempHp !== '2' || !healthResult.hasInlineTempBadge || !healthResult.oldTempInputRemoved || !healthResult.noteMentionsTemp || !healthResult.noteMentionsNoStack || !healthResult.logMentionsNoStack || !healthResult.hasAstraProtectionLabel) {
      throw new Error(`Health tracker regression failed: ${JSON.stringify(healthResult)}`);
    }

    await page.evaluate(() => {
      const key = 'lyrian-chronicles-character-suite-v2';
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      saved.ui = {
        ...(saved.ui || {}),
        mode: 'builder'
      };
      saved.fields = {
        ...(saved.fields || {}),
        Toughness: '1'
      };
      saved.play = {
        ...(saved.play || {}),
        resources: {
          ...(saved.play?.resources || {}),
          hpCurrent: '20',
          hpMax: '30',
          tempHp: 0
        },
        hpAdjustAmount: ''
      };
      delete saved.play.hpHasManualChange;
      localStorage.setItem(key, JSON.stringify(saved));
    });
    await page.reload({ waitUntil: 'load' });
    await page.click('#builder-sheet-shortcut-top');
    await page.waitForSelector('#play-hit-points #play-temp-hp-button', { timeout: 5000 });

    const staleHealthResult = await page.evaluate(() => ({
      currentHp: document.querySelector('.play-hit-current')?.textContent?.trim(),
      maxHp: document.querySelector('.play-hit-max')?.textContent?.trim()
    }));

    if (staleHealthResult.currentHp !== '30' || staleHealthResult.maxHp !== '30') {
      throw new Error(`Stale HP sync regression failed: ${JSON.stringify(staleHealthResult)}`);
    }

    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    await page.locator('[data-builder-action="pick-race"]').filter({ hasText: 'Fae' }).first().click();
    await page.click('[data-step-index="1"]');
    await page.locator('[data-builder-action="pick-ancestry"]').filter({ hasText: 'Anubis' }).first().click();
    await page.click('#builder-sheet-shortcut-top');
    await page.waitForSelector('#play-skills .play-skill-mini-row', { timeout: 5000 });

    const fixedExpertiseResult = await page.evaluate(() => {
      const insightRow = [...document.querySelectorAll('#play-skills .play-skill-mini-row')]
        .find((row) => row.textContent.includes('Insight'));
      const baseRollText = insightRow?.querySelector('[data-play-roll-skill]')?.textContent?.trim() || '';
      const expertiseText = insightRow?.querySelector('.play-skill-expertise-options')?.textContent || '';
      const breakdownText = insightRow?.querySelector('.play-skill-mini-copy span')?.textContent || '';
      return {
        baseRollText,
        expertiseText,
        breakdownText,
        hasDiscernLies: expertiseText.includes('Discern Lies +5'),
        baseDoesNotIncludeExpertise: baseRollText === '+0' && !breakdownText.includes('Expertise')
      };
    });

    if (!fixedExpertiseResult.hasDiscernLies || !fixedExpertiseResult.baseDoesNotIncludeExpertise) {
      throw new Error(`Fixed expertise regression failed: ${JSON.stringify(fixedExpertiseResult)}`);
    }

    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
        ui: { mode: 'sheet', sheetTab: 'actions', gameVersion: '0.13.0' },
        fields: { Name: 'Earned XP Tester', Exp: '0', 'Spirit Core': '0' },
        builder: {
          selectedRaceId: 'human'
        }
      }));
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('[data-play-transaction-amount="Exp"]', { timeout: 5000 });
    await page.fill('[data-play-transaction-amount="Exp"]', '500');
    await page.click('[data-play-transaction-field="Exp"][data-play-transaction-action="add"]');
    await page.waitForFunction(() => (
      [...document.querySelectorAll('.play-derived-card')]
        .some((card) => card.textContent.includes('EXP') && card.textContent.includes('500'))
    ));
    await page.click('[data-open-exp-spending]');
    await page.waitForSelector('[data-builder-action="toggle-class"][data-id="fighter"]', { timeout: 5000 });
    await page.waitForFunction(() => document.body.textContent.includes('Remaining EXP: 500'));
    await page.locator('[data-builder-action="toggle-class"][data-id="fighter"]').first().click();
    await page.waitForFunction(() => document.body.textContent.includes('Remaining EXP: 400'));

    const earnedExpClassSpendResult = await page.evaluate(() => {
      const bodyText = document.body.textContent.replace(/\s+/g, ' ');
      return {
        hasEarnedBudget: bodyText.includes('Class EXP: 100 / 500'),
        hasRemainingAfterSpend: bodyText.includes('Remaining EXP: 400')
      };
    });

    if (
      !earnedExpClassSpendResult.hasEarnedBudget ||
      !earnedExpClassSpendResult.hasRemainingAfterSpend
    ) {
      throw new Error(`Earned EXP class spending regression failed: ${JSON.stringify(earnedExpClassSpendResult)}`);
    }

    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
        ui: { mode: 'builder', gameVersion: '0.13.0' },
        fields: { Name: 'Equipment Control Tester', 'Clim Override': '10000' },
        builder: {
          selectedRaceId: 'human',
          selectedItemIds: []
        }
      }));
    });
    await page.reload({ waitUntil: 'load' });
    await page.click('[data-step-index="8"]');
    await page.waitForSelector('.builder-equipment-card', { timeout: 5000 });

    const equipmentControlId = await page.evaluate(() => (
      document.querySelector('[data-builder-action="add-item"]:not([disabled])')?.dataset.id || ''
    ));
    if (!equipmentControlId) {
      throw new Error('Equipment control regression failed: no purchasable item was available.');
    }

    await page.locator(`[data-builder-action="inspect-item"][data-id="${equipmentControlId}"]`).click();
    const equipmentInspectResult = await page.evaluate((id) => {
      const inspectButton = document.querySelector(`[data-builder-action="inspect-item"][data-id="${id}"]`);
      const card = inspectButton?.closest('.builder-equipment-card');
      return {
        detailTitle: document.querySelector('#builder-detail-card h3')?.textContent?.trim() || '',
        cardTitle: card?.querySelector('.builder-option-header strong')?.textContent?.trim() || '',
        selectedChips: [...document.querySelectorAll('.selected-chip-list .selected-chip')].map((entry) => entry.textContent.trim()),
        purchasedLabel: card?.textContent.includes('Purchased') || false
      };
    }, equipmentControlId);

    if (
      !equipmentInspectResult.detailTitle ||
      equipmentInspectResult.detailTitle !== equipmentInspectResult.cardTitle ||
      equipmentInspectResult.selectedChips.length !== 0 ||
      equipmentInspectResult.purchasedLabel
    ) {
      throw new Error(`Equipment inspect-only regression failed: ${JSON.stringify(equipmentInspectResult)}`);
    }

    await page.locator(`[data-builder-action="add-item"][data-id="${equipmentControlId}"]`).click();
    await page.waitForFunction((id) => {
      const inspectButton = document.querySelector(`[data-builder-action="inspect-item"][data-id="${id}"]`);
      return inspectButton?.closest('.builder-equipment-card')?.textContent.includes('Purchased');
    }, equipmentControlId);

    const equipmentAddResult = await page.evaluate((id) => {
      const inspectButton = document.querySelector(`[data-builder-action="inspect-item"][data-id="${id}"]`);
      const card = inspectButton?.closest('.builder-equipment-card');
      return {
        purchasedLabel: card?.textContent.includes('Purchased') || false,
        quantityText: card?.querySelector('.builder-equipment-quantity-count')?.textContent.trim() || '',
        selectedChips: [...document.querySelectorAll('.selected-chip-list .selected-chip')].map((entry) => entry.textContent.trim()),
        addDisabled: document.querySelector(`[data-builder-action="add-item"][data-id="${id}"]`)?.disabled || false,
        removeDisabled: document.querySelector(`[data-builder-action="remove-item"][data-id="${id}"]`)?.disabled || false
      };
    }, equipmentControlId);

    if (
      !equipmentAddResult.purchasedLabel ||
      equipmentAddResult.quantityText !== '1' ||
      equipmentAddResult.selectedChips.length !== 1 ||
      equipmentAddResult.addDisabled ||
      equipmentAddResult.removeDisabled
    ) {
      throw new Error(`Equipment add-control regression failed: ${JSON.stringify(equipmentAddResult)}`);
    }

    await page.locator(`[data-builder-action="remove-item"][data-id="${equipmentControlId}"]`).click();
    await page.waitForFunction((id) => {
      const inspectButton = document.querySelector(`[data-builder-action="inspect-item"][data-id="${id}"]`);
      return inspectButton && !inspectButton.closest('.builder-equipment-card')?.textContent.includes('Purchased');
    }, equipmentControlId);

    await page.locator(`[data-builder-action="add-item"][data-id="${equipmentControlId}"]`).click();
    await page.locator(`[data-builder-action="add-item"][data-id="${equipmentControlId}"]`).click();
    await page.waitForFunction((id) => {
      const card = document.querySelector(`[data-builder-action="inspect-item"][data-id="${id}"]`)?.closest('.builder-equipment-card');
      return card?.querySelector('.builder-equipment-quantity-count')?.textContent.trim() === '2';
    }, equipmentControlId);

    const equipmentQuantityResult = await page.evaluate((id) => {
      const inspectButton = document.querySelector(`[data-builder-action="inspect-item"][data-id="${id}"]`);
      const card = inspectButton?.closest('.builder-equipment-card');
      return {
        purchasedLabel: card?.textContent.includes('Purchased x2') || false,
        quantityText: card?.querySelector('.builder-equipment-quantity-count')?.textContent.trim() || '',
        selectedChips: [...document.querySelectorAll('.selected-chip-list .selected-chip')].map((entry) => entry.textContent.trim()),
        addDisabled: document.querySelector(`[data-builder-action="add-item"][data-id="${id}"]`)?.disabled || false,
        removeDisabled: document.querySelector(`[data-builder-action="remove-item"][data-id="${id}"]`)?.disabled || false
      };
    }, equipmentControlId);

    if (
      !equipmentQuantityResult.purchasedLabel ||
      equipmentQuantityResult.quantityText !== '2' ||
      !equipmentQuantityResult.selectedChips.some((entry) => entry.endsWith(' x2')) ||
      equipmentQuantityResult.addDisabled ||
      equipmentQuantityResult.removeDisabled
    ) {
      throw new Error(`Equipment quantity regression failed: ${JSON.stringify(equipmentQuantityResult)}`);
    }

    await page.locator(`[data-builder-action="remove-item"][data-id="${equipmentControlId}"]`).click();
    await page.waitForFunction((id) => {
      const card = document.querySelector(`[data-builder-action="inspect-item"][data-id="${id}"]`)?.closest('.builder-equipment-card');
      return card?.querySelector('.builder-equipment-quantity-count')?.textContent.trim() === '1';
    }, equipmentControlId);

    await page.locator(`[data-builder-action="remove-item"][data-id="${equipmentControlId}"]`).click();
    await page.waitForFunction((id) => {
      const inspectButton = document.querySelector(`[data-builder-action="inspect-item"][data-id="${id}"]`);
      return inspectButton && !inspectButton.closest('.builder-equipment-card')?.textContent.includes('Purchased');
    }, equipmentControlId);

    const equipmentRemoveResult = await page.evaluate((id) => ({
      selectedChips: [...document.querySelectorAll('.selected-chip-list .selected-chip')].map((entry) => entry.textContent.trim()),
      addDisabled: document.querySelector(`[data-builder-action="add-item"][data-id="${id}"]`)?.disabled || false,
      removeDisabled: document.querySelector(`[data-builder-action="remove-item"][data-id="${id}"]`)?.disabled || false
    }), equipmentControlId);

    if (
      equipmentRemoveResult.selectedChips.length !== 0 ||
      equipmentRemoveResult.addDisabled ||
      !equipmentRemoveResult.removeDisabled
    ) {
      throw new Error(`Equipment remove-control regression failed: ${JSON.stringify(equipmentRemoveResult)}`);
    }

    await page.fill('[data-builder-search="item"]', 'Alchemy Herb - Common Fire');
    await page.waitForFunction(() => (
      [...document.querySelectorAll('.builder-equipment-card')]
        .some((card) => card.textContent.includes('Alchemy Herb - Common Fire'))
    ));

    const materialCardResult = await page.evaluate(() => {
      const card = [...document.querySelectorAll('.builder-equipment-card')]
        .find((entry) => entry.textContent.includes('Alchemy Herb - Common Fire'));
      const heading = card?.previousElementSibling?.classList.contains('builder-equipment-group-heading')
        ? card.previousElementSibling.textContent
        : '';
      return {
        id: card?.querySelector('[data-builder-action="add-item"]')?.dataset.id || '',
        heading,
        text: card?.textContent || '',
        addDisabled: card?.querySelector('[data-builder-action="add-item"]')?.disabled || false,
        bundleCardVisible: [...document.querySelectorAll('.builder-equipment-card .builder-option-header strong')]
          .some((entry) => entry.textContent.trim() === 'Alchemy Materials')
      };
    });

    if (
      !materialCardResult.id ||
      !materialCardResult.heading.includes('Alchemy Materials') ||
      !materialCardResult.text.includes('60 Clim') ||
      !materialCardResult.text.includes('1 herb') ||
      materialCardResult.addDisabled ||
      materialCardResult.bundleCardVisible
    ) {
      throw new Error(`Generated material card regression failed: ${JSON.stringify(materialCardResult)}`);
    }

    await page.locator(`[data-builder-action="inspect-item"][data-id="${materialCardResult.id}"]`).click();
    const materialInspectResult = await page.evaluate((id) => {
      const card = document.querySelector(`[data-builder-action="inspect-item"][data-id="${id}"]`)?.closest('.builder-equipment-card');
      return {
        detailTitle: document.querySelector('#builder-detail-card h3')?.textContent?.trim() || '',
        cardTitle: card?.querySelector('.builder-option-header strong')?.textContent?.trim() || '',
        detailText: document.querySelector('#builder-detail-card')?.textContent || ''
      };
    }, materialCardResult.id);

    if (
      materialInspectResult.detailTitle !== 'Alchemy Herb - Common Fire' ||
      materialInspectResult.detailTitle !== materialInspectResult.cardTitle ||
      !materialInspectResult.detailText.includes('1 herb')
    ) {
      throw new Error(`Generated material inspect regression failed: ${JSON.stringify(materialInspectResult)}`);
    }

    await page.locator(`[data-builder-action="add-item"][data-id="${materialCardResult.id}"]`).click();
    await page.waitForFunction((id) => {
      const inspectButton = document.querySelector(`[data-builder-action="inspect-item"][data-id="${id}"]`);
      return inspectButton?.closest('.builder-equipment-card')?.textContent.includes('Purchased');
    }, materialCardResult.id);

    const materialAddResult = await page.evaluate((id) => {
      const card = document.querySelector(`[data-builder-action="inspect-item"][data-id="${id}"]`)?.closest('.builder-equipment-card');
      return {
        purchasedLabel: card?.textContent.includes('Purchased') || false,
        quantityText: card?.querySelector('.builder-equipment-quantity-count')?.textContent.trim() || '',
        selectedChips: [...document.querySelectorAll('.selected-chip-list .selected-chip')].map((entry) => entry.textContent.trim()),
        addDisabled: document.querySelector(`[data-builder-action="add-item"][data-id="${id}"]`)?.disabled || false,
        removeDisabled: document.querySelector(`[data-builder-action="remove-item"][data-id="${id}"]`)?.disabled || false
      };
    }, materialCardResult.id);

    if (
      !materialAddResult.purchasedLabel ||
      materialAddResult.quantityText !== '1' ||
      !materialAddResult.selectedChips.includes('Alchemy Herb - Common Fire') ||
      materialAddResult.addDisabled ||
      materialAddResult.removeDisabled
    ) {
      throw new Error(`Generated material add regression failed: ${JSON.stringify(materialAddResult)}`);
    }

    await page.locator(`[data-builder-action="add-item"][data-id="${materialCardResult.id}"]`).click();
    await page.waitForFunction((id) => {
      const card = document.querySelector(`[data-builder-action="inspect-item"][data-id="${id}"]`)?.closest('.builder-equipment-card');
      return card?.querySelector('.builder-equipment-quantity-count')?.textContent.trim() === '2';
    }, materialCardResult.id);

    const materialSecondAddResult = await page.evaluate((id) => {
      const card = document.querySelector(`[data-builder-action="inspect-item"][data-id="${id}"]`)?.closest('.builder-equipment-card');
      return {
        purchasedLabel: card?.textContent.includes('Purchased x2') || false,
        quantityText: card?.querySelector('.builder-equipment-quantity-count')?.textContent.trim() || '',
        selectedChips: [...document.querySelectorAll('.selected-chip-list .selected-chip')].map((entry) => entry.textContent.trim()),
        addDisabled: document.querySelector(`[data-builder-action="add-item"][data-id="${id}"]`)?.disabled || false,
        removeDisabled: document.querySelector(`[data-builder-action="remove-item"][data-id="${id}"]`)?.disabled || false
      };
    }, materialCardResult.id);

    if (
      !materialSecondAddResult.purchasedLabel ||
      materialSecondAddResult.quantityText !== '2' ||
      !materialSecondAddResult.selectedChips.includes('Alchemy Herb - Common Fire x2') ||
      materialSecondAddResult.addDisabled ||
      materialSecondAddResult.removeDisabled
    ) {
      throw new Error(`Generated material quantity regression failed: ${JSON.stringify(materialSecondAddResult)}`);
    }

    const summaryEquipmentLayout = await page.evaluate(() => {
      const summary = document.querySelector('#builder-summary');
      const summaryRect = summary?.getBoundingClientRect();
      const cards = [...(summary?.querySelectorAll('.summary-card') || [])].map((card) => {
        const title = card.querySelector('strong')?.textContent?.trim() || '';
        const rect = card.getBoundingClientRect();
        return {
          title,
          text: card.textContent.replace(/\s+/g, ' ').trim(),
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          bottom: Math.round(rect.bottom),
          isEquipment: card.classList.contains('summary-card-equipment')
        };
      });
      const equipment = cards.find((card) => card.title === 'Equipment');
      const topCards = cards.filter((card) => card.title !== 'Equipment');
      return {
        summaryWidth: Math.round(summaryRect?.width || 0),
        titles: cards.map((card) => card.title),
        equipment,
        topCardCount: topCards.length,
        equipmentSpansPanel: Boolean(summaryRect && equipment && equipment.width >= summaryRect.width * 0.92),
        equipmentBelowTopCards: Boolean(equipment && topCards.every((card) => equipment.y > card.y)),
        equipmentListsPurchasedMaterial: Boolean(equipment?.text.includes('Alchemy Herb - Common Fire'))
      };
    });

    if (
      summaryEquipmentLayout.topCardCount !== 5 ||
      summaryEquipmentLayout.titles.join('|') !== 'Identity|Stats|Breakthroughs|Classes|Skills|Equipment' ||
      !summaryEquipmentLayout.equipment?.isEquipment ||
      !summaryEquipmentLayout.equipmentSpansPanel ||
      !summaryEquipmentLayout.equipmentBelowTopCards ||
      !summaryEquipmentLayout.equipmentListsPurchasedMaterial
    ) {
      throw new Error(`Builder review equipment summary layout failed: ${JSON.stringify(summaryEquipmentLayout)}`);
    }

    await page.locator(`[data-builder-action="remove-item"][data-id="${materialCardResult.id}"]`).click();
    await page.waitForFunction((id) => {
      const card = document.querySelector(`[data-builder-action="inspect-item"][data-id="${id}"]`)?.closest('.builder-equipment-card');
      return card?.querySelector('.builder-equipment-quantity-count')?.textContent.trim() === '1';
    }, materialCardResult.id);

    const materialFirstRemoveResult = await page.evaluate((id) => {
      const card = document.querySelector(`[data-builder-action="inspect-item"][data-id="${id}"]`)?.closest('.builder-equipment-card');
      return {
        purchasedLabel: card?.textContent.includes('Purchased') || false,
        quantityText: card?.querySelector('.builder-equipment-quantity-count')?.textContent.trim() || '',
        selectedChips: [...document.querySelectorAll('.selected-chip-list .selected-chip')].map((entry) => entry.textContent.trim())
      };
    }, materialCardResult.id);

    if (
      !materialFirstRemoveResult.purchasedLabel ||
      materialFirstRemoveResult.quantityText !== '1' ||
      !materialFirstRemoveResult.selectedChips.includes('Alchemy Herb - Common Fire')
    ) {
      throw new Error(`Generated material decrement regression failed: ${JSON.stringify(materialFirstRemoveResult)}`);
    }

    await page.locator(`[data-builder-action="remove-item"][data-id="${materialCardResult.id}"]`).click();
    await page.waitForFunction((id) => {
      const inspectButton = document.querySelector(`[data-builder-action="inspect-item"][data-id="${id}"]`);
      return inspectButton && !inspectButton.closest('.builder-equipment-card')?.textContent.includes('Purchased');
    }, materialCardResult.id);
    await page.waitForTimeout(100);

    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
        ui: { mode: 'builder', gameVersion: '0.13.0' },
        fields: { Name: 'Class Requirement Tester' },
        builder: {
          selectedRaceId: 'human',
          selectedClassIds: ['fighter'],
          classAbilityProgress: { fighter: 7 }
        }
      }));
    });
    await page.reload({ waitUntil: 'load' });
    await page.click('[data-step-index="6"]');
    await page.waitForSelector('.builder-option-card', { timeout: 5000 });

    const classRequirementResult = await page.evaluate(() => {
      const getClassCardState = (name) => {
        const card = [...document.querySelectorAll('.builder-option-card')]
          .find((entry) => entry.querySelector('strong')?.textContent?.trim() === name);
        return card ? {
          found: true,
          locked: card.classList.contains('locked'),
          labels: card.querySelector('.builder-option-meta')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          note: card.querySelector('.builder-option-note')?.textContent?.replace(/\s+/g, ' ').trim() || ''
        } : { found: false };
      };
      return {
        bloodbinder: getClassCardState('Bloodbinder'),
        bodyguard: getClassCardState('Bodyguard'),
        evilEye: getClassCardState('Evil Eye')
      };
    });

    if (
      !classRequirementResult.bloodbinder.found ||
      classRequirementResult.bloodbinder.locked ||
      !classRequirementResult.bodyguard.found ||
      classRequirementResult.bodyguard.locked ||
      !classRequirementResult.evilEye.found ||
      classRequirementResult.evilEye.locked
    ) {
      throw new Error(`Class requirement unlock regression failed: ${JSON.stringify(classRequirementResult)}`);
    }

    const bardExpertiseUnlockResults = [];
    for (const expertiseName of ['Singing', 'Idol']) {
      await page.evaluate((selectedExpertiseName) => {
        localStorage.clear();
        localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
          ui: { mode: 'builder', gameVersion: '0.13.0' },
          fields: { Name: `Bard ${selectedExpertiseName} Expertise Tester` },
          builder: {
            selectedRaceId: 'human',
            skillExpertiseEntries: [{
              skillIndex: 19,
              name: selectedExpertiseName,
              source: 'creation',
              points: 3
            }]
          }
        }));
      }, expertiseName);
      await page.reload({ waitUntil: 'load' });
      await page.click('[data-step-index="6"]');
      await page.waitForSelector('.builder-option-card', { timeout: 5000 });
      bardExpertiseUnlockResults.push(await page.evaluate((selectedExpertiseName) => {
        const card = [...document.querySelectorAll('.builder-option-card')]
          .find((entry) => entry.querySelector('strong')?.textContent?.trim() === 'Bard');
        return {
          expertiseName: selectedExpertiseName,
          found: Boolean(card),
          locked: card?.classList.contains('locked') || false
        };
      }, expertiseName));
    }

    if (bardExpertiseUnlockResults.some((entry) => !entry.found || entry.locked)) {
      throw new Error(`Bard named expertise requirement regression failed: ${JSON.stringify(bardExpertiseUnlockResults)}`);
    }

    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
        ui: { mode: 'builder', gameVersion: '0.13.0' },
        fields: { Name: 'Dogfolk Paladin Tester' },
        builder: {
          selectedRaceId: 'chimera',
          selectedAncestryId: 'dogfolk',
          selectedBreakthroughIds: [
            'the-unknown-paladin',
            'light-armor-training',
            'medium-armor-training',
            'weapon-training'
          ],
          choiceSelections: {
            'breakthrough-weapon-training-groups': 'Bludgeoning Weapons'
          }
        }
      }));
    });
    await page.reload({ waitUntil: 'load' });
    await page.click('[data-step-index="6"]');
    await page.waitForSelector('.builder-option-card', { timeout: 5000 });

    const unknownPaladinRequirementResult = await page.evaluate(() => {
      const getClassCardState = (name) => {
        const card = [...document.querySelectorAll('.builder-option-card')]
          .find((entry) => entry.querySelector('strong')?.textContent?.trim() === name);
        return card ? {
          found: true,
          locked: card.classList.contains('locked'),
          labels: card.querySelector('.builder-option-meta')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          note: card.querySelector('.builder-option-note')?.textContent?.replace(/\s+/g, ' ').trim() || ''
        } : { found: false };
      };
      return {
        shieldPaladin: getClassCardState('Shield Paladin')
      };
    });

    if (
      !unknownPaladinRequirementResult.shieldPaladin.found ||
      unknownPaladinRequirementResult.shieldPaladin.locked
    ) {
      throw new Error(`The Unknown Paladin human requirement regression failed: ${JSON.stringify(unknownPaladinRequirementResult)}`);
    }

    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
        ui: { mode: 'builder', gameVersion: '0.13.0' },
        fields: { Name: 'Shield Paladin Progression Tester' },
        builder: {
          selectedRaceId: 'human',
          selectedClassIds: ['shield-paladin'],
          classAbilityProgress: { 'shield-paladin': 0 }
        }
      }));
    });
    await page.reload({ waitUntil: 'load' });
    await page.click('[data-step-index="6"]');
    await page.waitForSelector('.class-progress-card', { timeout: 5000 });

    const shieldPaladinProgressionResult = await page.evaluate(() => {
      const card = [...document.querySelectorAll('.class-progress-card')]
        .find((entry) => entry.querySelector('h4')?.textContent?.trim() === 'Shield Paladin');
      return card ? {
        key: card.textContent.includes('Key: Holy Weapon'),
        levels: [...card.querySelectorAll('.class-progress-list li span:first-child')]
          .map((entry) => entry.textContent.replace(/\s+/g, ' ').trim())
      } : null;
    });
    const expectedShieldPaladinLevels = [
      'Level 2: Holy Shield',
      'Level 3: Class Skills',
      'Level 4: Aura of Protection',
      'Level 5: Heart',
      'Level 6: Divine Smite II',
      'Level 7: Soul',
      'Level 8: Lay on Hands'
    ];
    if (
      !shieldPaladinProgressionResult?.key
      || shieldPaladinProgressionResult.levels.join('|') !== expectedShieldPaladinLevels.join('|')
    ) {
      throw new Error(`Shield Paladin progression order regression failed: ${JSON.stringify(shieldPaladinProgressionResult)}`);
    }

    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
        ui: { mode: 'builder', gameVersion: '0.13.0' },
        fields: { Name: 'Mage Cascade Tester' },
        builder: {
          selectedRaceId: 'human',
          selectedClassIds: ['mage'],
          classAbilityProgress: { mage: 4 },
          choiceSelections: {
            'race-human-weapon-group': 'Light Swords'
          }
        }
      }));
    });
    await page.reload({ waitUntil: 'load' });
    await page.click('[data-step-index="6"]');
    await page.waitForSelector('.builder-option-card', { timeout: 5000 });

    const mageCascadeRequirementResult = await page.evaluate(() => {
      const getClassCardState = (name) => {
        const card = [...document.querySelectorAll('.builder-option-card')]
          .find((entry) => entry.querySelector('strong')?.textContent?.trim() === name);
        return card ? {
          found: true,
          locked: card.classList.contains('locked'),
          labels: card.querySelector('.builder-option-meta')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          note: card.querySelector('.builder-option-note')?.textContent?.replace(/\s+/g, ' ').trim() || ''
        } : { found: false };
      };
      return {
        battleMage: getClassCardState('Battle Mage'),
        abjurer: getClassCardState('Abjurer')
      };
    });

    if (
      !mageCascadeRequirementResult.battleMage.found ||
      mageCascadeRequirementResult.battleMage.locked ||
      !mageCascadeRequirementResult.abjurer.found ||
      !mageCascadeRequirementResult.abjurer.locked
    ) {
      throw new Error(`Mage/Battle Mage/Abjurer cascade regression failed: ${JSON.stringify(mageCascadeRequirementResult)}`);
    }

    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
        ui: { mode: 'builder', gameVersion: '0.13.0' },
        fields: { Name: 'Battle Mage Cascade Tester' },
        builder: {
          selectedRaceId: 'human',
          selectedClassIds: ['mage', 'battle-mage'],
          classAbilityProgress: { mage: 4, 'battle-mage': 2 },
          choiceSelections: {
            'race-human-weapon-group': 'Light Swords'
          }
        }
      }));
    });
    await page.reload({ waitUntil: 'load' });
    await page.click('[data-step-index="6"]');
    await page.waitForSelector('.builder-option-card', { timeout: 5000 });

    const battleMageCascadeRequirementResult = await page.evaluate(() => {
      const card = [...document.querySelectorAll('.builder-option-card')]
        .find((entry) => entry.querySelector('strong')?.textContent?.trim() === 'Abjurer');
      return card ? {
        found: true,
        locked: card.classList.contains('locked'),
        labels: card.querySelector('.builder-option-meta')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        note: card.querySelector('.builder-option-note')?.textContent?.replace(/\s+/g, ' ').trim() || ''
      } : { found: false };
    });

    if (!battleMageCascadeRequirementResult.found || battleMageCascadeRequirementResult.locked) {
      throw new Error(`Battle Mage to Abjurer cascade regression failed: ${JSON.stringify(battleMageCascadeRequirementResult)}`);
    }

    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
        ui: { mode: 'builder', gameVersion: '0.13.0' },
        fields: { Name: 'Early Ascension Tester' },
        builder: {
          selectedRaceId: 'human',
          selectedBreakthroughIds: ['early-ascension']
        }
      }));
    });
    await page.reload({ waitUntil: 'load' });
    await page.click('[data-step-index="6"]');
    await page.waitForSelector('.builder-option-card', { timeout: 5000 });

    const earlyAscensionResult = await page.evaluate(() => {
      const getClassCardState = (name) => {
        const card = [...document.querySelectorAll('.builder-option-card')]
          .find((entry) => entry.querySelector('strong')?.textContent?.trim() === name);
        return card ? {
          found: true,
          locked: card.classList.contains('locked'),
          labels: card.querySelector('.builder-option-meta')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          note: card.querySelector('.builder-option-note')?.textContent?.replace(/\s+/g, ' ').trim() || ''
        } : { found: false };
      };
      return {
        aetherie: getClassCardState('Aetherie'),
        bloodbinder: getClassCardState('Bloodbinder'),
        bodyguard: getClassCardState('Bodyguard')
      };
    });

    if (
      !earlyAscensionResult.aetherie.found ||
      earlyAscensionResult.aetherie.locked ||
      !earlyAscensionResult.bloodbinder.found ||
      earlyAscensionResult.bloodbinder.locked ||
      !earlyAscensionResult.bodyguard.found ||
      !earlyAscensionResult.bodyguard.locked
    ) {
      throw new Error(`Early Ascension generic class mastery regression failed: ${JSON.stringify(earlyAscensionResult)}`);
    }

    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
        ui: { mode: 'builder', gameVersion: '0.13.0' },
        fields: { Name: 'Repeatable Elemental Affinity Tester' },
        builder: {
          selectedRaceId: 'human'
        }
      }));
    });
    await page.reload({ waitUntil: 'load' });
    await page.click('[data-step-index="5"]');
    await page.waitForSelector('.builder-elemental-affinity-card', { timeout: 5000 });
    await page.selectOption('[data-elemental-affinity-select]', 'Fire');
    await page.click('[data-builder-action="add-elemental-affinity"]');
    await page.waitForFunction(() => {
      const card = document.querySelector('.builder-elemental-affinity-card');
      return card?.textContent.includes('Fire') && ![...card.querySelectorAll('[data-elemental-affinity-select] option')].some((option) => option.value === 'Fire');
    });
    await page.selectOption('[data-elemental-affinity-select]', 'Lightning');
    await page.click('[data-builder-action="add-elemental-affinity"]');
    await page.waitForFunction(() => {
      const card = document.querySelector('.builder-elemental-affinity-card');
      const options = [...card?.querySelectorAll('[data-elemental-affinity-select] option') || []].map((option) => option.value);
      return card?.textContent.includes('Selected x2')
        && card.textContent.includes('Fire')
        && card.textContent.includes('Lightning')
        && !options.includes('Fire')
        && !options.includes('Lightning');
    });

    const repeatableElementalAffinityResult = await page.evaluate(() => {
      const card = document.querySelector('.builder-elemental-affinity-card');
      return {
        cardText: card?.textContent?.replace(/\s+/g, ' ').trim() || '',
        selectedBreakthroughChips: [...document.querySelectorAll('.selected-chip-list .selected-chip')].map((entry) => entry.textContent.replace(/\s+/g, ' ').trim()),
        summaryText: document.querySelector('#builder-summary')?.textContent?.replace(/\s+/g, ' ').trim() || ''
      };
    });

    if (
      !repeatableElementalAffinityResult.cardText.includes('Selected x2') ||
      !repeatableElementalAffinityResult.cardText.includes('Fire') ||
      !repeatableElementalAffinityResult.cardText.includes('Lightning') ||
      !repeatableElementalAffinityResult.summaryText.includes('Elemental Affinity: Fire') ||
      !repeatableElementalAffinityResult.summaryText.includes('Elemental Affinity: Lightning')
    ) {
      throw new Error(`Repeatable Elemental Affinity UI regression failed: ${JSON.stringify(repeatableElementalAffinityResult)}`);
    }

    await page.click('[data-step-index="6"]');
    await page.waitForSelector('.builder-option-card', { timeout: 5000 });

    const repeatableElementalUnlockResult = await page.evaluate(() => {
      const getClassCardState = (name) => {
        const card = [...document.querySelectorAll('.builder-option-card')]
          .find((entry) => entry.querySelector('strong')?.textContent?.trim() === name);
        return card ? {
          found: true,
          locked: card.classList.contains('locked'),
          labels: card.querySelector('.builder-option-meta')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          note: card.querySelector('.builder-option-note')?.textContent?.replace(/\s+/g, ' ').trim() || ''
        } : { found: false };
      };
      return {
        pyromancer: getClassCardState('Pyromancer'),
        flameSentinel: getClassCardState('Flame Sentinel'),
        electromancer: getClassCardState('Electromancer')
      };
    });

    if (
      !repeatableElementalUnlockResult.pyromancer.found ||
      repeatableElementalUnlockResult.pyromancer.locked ||
      !repeatableElementalUnlockResult.flameSentinel.found ||
      repeatableElementalUnlockResult.flameSentinel.locked ||
      !repeatableElementalUnlockResult.electromancer.found ||
      repeatableElementalUnlockResult.electromancer.locked
    ) {
      throw new Error(`Repeatable Elemental Affinity unlock regression failed: ${JSON.stringify(repeatableElementalUnlockResult)}`);
    }

    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
        ui: { mode: 'builder', gameVersion: '0.13.0' },
        fields: { Name: 'Breakthrough General XP Tester', Exp: '5200', 'Spirit Core': '1400' },
        builder: {
          selectedRaceId: 'human',
          selectedBreakthroughIds: ['early-ascension'],
          inspected: { breakthrough: 'elemental-affinity' }
        }
      }));
    });
    await page.reload({ waitUntil: 'load' });
    await page.click('[data-step-index="5"]');
    await page.waitForSelector('.builder-elemental-affinity-card [data-elemental-affinity-select]', { timeout: 5000 });
    await page.selectOption('[data-elemental-affinity-select]', 'Fire');
    await page.click('[data-builder-action="add-elemental-affinity"]');
    await page.waitForFunction(() => {
      const saved = JSON.parse(localStorage.getItem('lyrian-chronicles-character-suite-v2') || '{}');
      return saved.fields?.Exp === '5050'
        && saved.fields?.['Spirit Core'] === '1550'
        && saved.fields?.BName?.includes('Elemental Affinity: Fire');
    });

    const breakthroughGeneralXpResult = await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('lyrian-chronicles-character-suite-v2') || '{}');
      const cardText = document.querySelector('.builder-elemental-affinity-card')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const chipText = [...document.querySelectorAll('.selected-chip-list .selected-chip')]
        .map((entry) => entry.textContent.replace(/\s+/g, ' ').trim())
        .join(' | ');
      return {
        exp: saved.fields?.Exp || '',
        spiritCore: saved.fields?.['Spirit Core'] || '',
        bName: saved.fields?.BName || '',
        cardText,
        chipText
      };
    });

    if (
      breakthroughGeneralXpResult.exp !== '5050' ||
      breakthroughGeneralXpResult.spiritCore !== '1550' ||
      !breakthroughGeneralXpResult.bName.includes('Elemental Affinity: Fire') ||
      !breakthroughGeneralXpResult.cardText.includes('Selected x1') ||
      !breakthroughGeneralXpResult.chipText.includes('Normal XP Spent: 150')
    ) {
      throw new Error(`Breakthrough general XP spending regression failed: ${JSON.stringify(breakthroughGeneralXpResult)}`);
    }

    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
        ui: { mode: 'builder', gameVersion: '0.13.0' },
        fields: { Name: 'Locked Breakthrough Layout Tester' },
        builder: {
          selectedRaceId: 'human',
          inspected: { breakthrough: 'bully' }
        }
      }));
    });
    await page.reload({ waitUntil: 'load' });
    await page.click('[data-step-index="5"]');
    await page.waitForSelector('.builder-repeatable-choice-card', { timeout: 5000 });

    const compactLockedBreakthroughResult = await page.evaluate(() => {
      const card = [...document.querySelectorAll('.builder-repeatable-choice-card')]
        .find((entry) => entry.textContent.includes('Blend In II'));
      const rect = card?.getBoundingClientRect();
      return card ? {
        found: true,
        height: Math.round(rect.height),
        width: Math.round(rect.width),
        compact: card.classList.contains('is-compact'),
        locked: card.classList.contains('locked'),
        hasChoiceControls: Boolean(card.querySelector('.builder-inline-action-row')),
        text: card.textContent.replace(/\s+/g, ' ').trim()
      } : { found: false };
    });

    if (
      !compactLockedBreakthroughResult.found ||
      !compactLockedBreakthroughResult.locked ||
      !compactLockedBreakthroughResult.compact ||
      compactLockedBreakthroughResult.hasChoiceControls ||
      compactLockedBreakthroughResult.height > 180
    ) {
      throw new Error(`Compact locked breakthrough layout regression failed: ${JSON.stringify(compactLockedBreakthroughResult)}`);
    }

    const elementalAffinityId = 'elemental-affinity';
    await page.evaluate((breakthroughId) => {
      localStorage.clear();
      localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
        ui: { mode: 'builder', gameVersion: '0.13.0' },
        fields: { Name: 'Elemental Affinity Tester' },
        builder: {
          selectedRaceId: 'human',
          selectedBreakthroughIds: [breakthroughId],
          choiceSelections: {
            [`breakthrough-${breakthroughId}-element`]: 'Fire'
          }
        }
      }));
    }, elementalAffinityId);
    await page.reload({ waitUntil: 'load' });
    await page.click('[data-step-index="6"]');
    await page.waitForSelector('.builder-option-card', { timeout: 5000 });

    const elementalAffinityResult = await page.evaluate(() => {
      const getClassCardState = (name) => {
        const card = [...document.querySelectorAll('.builder-option-card')]
          .find((entry) => entry.querySelector('strong')?.textContent?.trim() === name);
        return card ? {
          found: true,
          locked: card.classList.contains('locked'),
          labels: card.querySelector('.builder-option-meta')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          note: card.querySelector('.builder-option-note')?.textContent?.replace(/\s+/g, ' ').trim() || ''
        } : { found: false };
      };
      return {
        pyromancer: getClassCardState('Pyromancer'),
        flameSentinel: getClassCardState('Flame Sentinel'),
        electromancer: getClassCardState('Electromancer')
      };
    });

    if (
      !elementalAffinityResult.pyromancer.found ||
      elementalAffinityResult.pyromancer.locked ||
      !elementalAffinityResult.flameSentinel.found ||
      elementalAffinityResult.flameSentinel.locked ||
      !elementalAffinityResult.electromancer.found ||
      !elementalAffinityResult.electromancer.locked
    ) {
      throw new Error(`Elemental Affinity mastery unlock regression failed: ${JSON.stringify(elementalAffinityResult)}`);
    }

    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
        ui: { mode: 'builder', gameVersion: '0.13.0' },
        fields: { Name: 'Key Ability Mastery Tester' },
        builder: {
          selectedRaceId: 'human',
          selectedClassIds: ['pyromancer'],
          classAbilityProgress: { pyromancer: 0 }
        }
      }));
    });
    await page.reload({ waitUntil: 'load' });
    await page.click('[data-step-index="6"]');
    await page.waitForSelector('.builder-option-card', { timeout: 5000 });

    const pyromancerMasteryResult = await page.evaluate(() => {
      const card = [...document.querySelectorAll('.builder-option-card')]
        .find((entry) => entry.querySelector('strong')?.textContent?.trim() === 'Flame Sentinel');
      return card ? {
        found: true,
        locked: card.classList.contains('locked'),
        labels: card.querySelector('.builder-option-meta')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        note: card.querySelector('.builder-option-note')?.textContent?.replace(/\s+/g, ' ').trim() || ''
      } : { found: false };
    });

    if (!pyromancerMasteryResult.found || pyromancerMasteryResult.locked) {
      throw new Error(`Key ability elemental mastery unlock regression failed: ${JSON.stringify(pyromancerMasteryResult)}`);
    }

    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
        ui: { mode: 'builder', gameVersion: '0.13.0' },
        fields: { Name: 'Chosen Element Mastery Tester' },
        builder: {
          selectedRaceId: 'human',
          selectedClassIds: ['sorcerer'],
          classAbilityProgress: { sorcerer: 7 },
          choiceSelections: {
            'class-sorcerer-elemental-mastery': 'Lightning'
          }
        }
      }));
    });
    await page.reload({ waitUntil: 'load' });
    await page.click('[data-step-index="6"]');
    await page.waitForSelector('.builder-option-card', { timeout: 5000 });

    const sorcererChoiceMasteryResult = await page.evaluate(() => {
      const card = [...document.querySelectorAll('.builder-option-card')]
        .find((entry) => entry.querySelector('strong')?.textContent?.trim() === 'Electromancer');
      return card ? {
        found: true,
        locked: card.classList.contains('locked'),
        labels: card.querySelector('.builder-option-meta')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        note: card.querySelector('.builder-option-note')?.textContent?.replace(/\s+/g, ' ').trim() || ''
      } : { found: false };
    });

    if (!sorcererChoiceMasteryResult.found || sorcererChoiceMasteryResult.locked) {
      throw new Error(`Chosen class elemental mastery unlock regression failed: ${JSON.stringify(sorcererChoiceMasteryResult)}`);
    }

    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
        ui: { mode: 'builder', gameVersion: '0.13.0' },
        fields: { Name: 'Ancestry Mastery Tester' },
        builder: {
          selectedRaceId: 'chimera',
          selectedAncestryId: 'phoenix'
        }
      }));
    });
    await page.reload({ waitUntil: 'load' });
    await page.click('[data-step-index="6"]');
    await page.waitForSelector('.builder-option-card', { timeout: 5000 });

    const phoenixMasteryResult = await page.evaluate(() => {
      const getClassCardState = (name) => {
        const card = [...document.querySelectorAll('.builder-option-card')]
          .find((entry) => entry.querySelector('strong')?.textContent?.trim() === name);
        return card ? {
          found: true,
          locked: card.classList.contains('locked'),
          labels: card.querySelector('.builder-option-meta')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          note: card.querySelector('.builder-option-note')?.textContent?.replace(/\s+/g, ' ').trim() || ''
        } : { found: false };
      };
      return {
        pyromancer: getClassCardState('Pyromancer'),
        flameSentinel: getClassCardState('Flame Sentinel'),
        electromancer: getClassCardState('Electromancer')
      };
    });

    if (
      !phoenixMasteryResult.pyromancer.found ||
      phoenixMasteryResult.pyromancer.locked ||
      !phoenixMasteryResult.flameSentinel.found ||
      phoenixMasteryResult.flameSentinel.locked ||
      !phoenixMasteryResult.electromancer.found ||
      !phoenixMasteryResult.electromancer.locked
    ) {
      throw new Error(`Ancestry trait elemental mastery unlock regression failed: ${JSON.stringify(phoenixMasteryResult)}`);
    }

    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    await page.locator('[data-builder-action="pick-race"]').filter({ hasText: 'Human' }).first().click();
    await page.click('[data-step-index="5"]');
    await page.waitForSelector('.builder-repeatable-choice-card', { timeout: 5000 });

    const languageTrainingCard = page.locator('.builder-repeatable-choice-card').filter({ has: page.locator('strong', { hasText: /^Language Training$/ }) }).first();
    await languageTrainingCard.locator('[data-repeatable-breakthrough-select]').selectOption('Sorthen');
    await languageTrainingCard.locator('[data-builder-action="add-repeatable-breakthrough-choice"]').click();
    await page.waitForFunction(() => {
      const card = [...document.querySelectorAll('.builder-repeatable-choice-card')]
        .find((entry) => entry.querySelector('strong')?.textContent?.trim() === 'Language Training');
      return card?.textContent.includes('Sorthen')
        && ![...card.querySelectorAll('[data-repeatable-breakthrough-select] option')].some((option) => option.value === 'Sorthen');
    });
    await languageTrainingCard.locator('[data-repeatable-breakthrough-select]').selectOption('Sylvan');
    await languageTrainingCard.locator('[data-builder-action="add-repeatable-breakthrough-choice"]').click();
    await page.waitForFunction(() => {
      const card = [...document.querySelectorAll('.builder-repeatable-choice-card')]
        .find((entry) => entry.querySelector('strong')?.textContent?.trim() === 'Language Training');
      return card?.textContent.includes('Selected x2')
        && card.textContent.includes('Sorthen')
        && card.textContent.includes('Sylvan');
    });

    const weaponTrainingCard = page.locator('.builder-repeatable-choice-card').filter({ has: page.locator('strong', { hasText: /^Weapon Training$/ }) }).first();
    await weaponTrainingCard.locator('[data-repeatable-breakthrough-select]').selectOption('Small Weapons');
    await weaponTrainingCard.locator('[data-builder-action="add-repeatable-breakthrough-choice"]').click();
    await page.waitForFunction(() => {
      const card = [...document.querySelectorAll('.builder-repeatable-choice-card')]
        .find((entry) => entry.querySelector('strong')?.textContent?.trim() === 'Weapon Training');
      return card?.textContent.includes('Small Weapons')
        && ![...card.querySelectorAll('[data-repeatable-breakthrough-select] option')].some((option) => option.value === 'Small Weapons');
    });
    await weaponTrainingCard.locator('[data-repeatable-breakthrough-select]').selectOption('Polearms');
    await weaponTrainingCard.locator('[data-builder-action="add-repeatable-breakthrough-choice"]').click();
    await page.waitForFunction(() => {
      const card = [...document.querySelectorAll('.builder-repeatable-choice-card')]
        .find((entry) => entry.querySelector('strong')?.textContent?.trim() === 'Weapon Training');
      return card?.textContent.includes('Selected x2')
        && card.textContent.includes('Small Weapons')
        && card.textContent.includes('Polearms');
    });

    const repeatableChoiceResult = await page.evaluate(() => ({
      summaryText: document.querySelector('#builder-summary')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      selectedChips: [...document.querySelectorAll('.selected-chip-list .selected-chip')].map((entry) => entry.textContent.replace(/\s+/g, ' ').trim())
    }));

    if (
      !repeatableChoiceResult.summaryText.includes('Language Training: Sorthen') ||
      !repeatableChoiceResult.summaryText.includes('Language Training: Sylvan') ||
      !repeatableChoiceResult.summaryText.includes('Weapon Training: Small Weapons') ||
      !repeatableChoiceResult.summaryText.includes('Weapon Training: Polearms')
    ) {
      throw new Error(`Repeatable unique breakthrough choice regression failed: ${JSON.stringify(repeatableChoiceResult)}`);
    }

    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    await page.locator('[data-builder-action="pick-race"]').filter({ hasText: 'Human' }).first().click();
    await page.click('[data-step-index="5"]');
    await page.waitForSelector('.builder-repeatable-choice-card', { timeout: 5000 });
    const skillTrainingCard = page.locator('.builder-repeatable-choice-card').filter({ has: page.locator('strong', { hasText: /^Skill Training$/ }) }).first();
    await skillTrainingCard.locator('[data-builder-action="add-stackable-breakthrough"]').click();
    await page.waitForFunction(() => document.body.textContent.includes('Selected x1'));
    await skillTrainingCard.locator('[data-builder-action="add-stackable-breakthrough"]').click();
    await page.waitForFunction(() => {
      const card = [...document.querySelectorAll('.builder-repeatable-choice-card')]
        .find((entry) => entry.querySelector('strong')?.textContent?.trim() === 'Skill Training');
      return card?.textContent.includes('Selected x2');
    });
    await page.click('[data-step-index="7"]');
    await page.waitForSelector('[data-builder-choice-field]', { timeout: 5000 });

    const stackableTrainingResult = await page.evaluate(() => ({
      ids: [
        ...[...document.querySelectorAll('[data-builder-choice-select]')].map((entry) => entry.dataset.builderChoiceSelect),
        ...[...document.querySelectorAll('[data-builder-choice-field]')].map((entry) => entry.dataset.builderChoiceField)
      ],
      summaryText: document.querySelector('#builder-summary')?.textContent?.replace(/\s+/g, ' ').trim() || ''
    }));

    if (
      !stackableTrainingResult.ids.includes('breakthrough-skill-training-skill-mode') ||
      !stackableTrainingResult.ids.includes('breakthrough-skill-training-skill-mode-2') ||
      !stackableTrainingResult.summaryText.includes('Skill Training #2')
    ) {
      throw new Error(`Stackable breakthrough purchase regression failed: ${JSON.stringify(stackableTrainingResult)}`);
    }

    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
        ui: { mode: 'sheet', sheetTab: 'abilities', gameVersion: '0.13.0' },
        fields: { Name: 'Reference Tester' },
        builder: {
          selectedRaceId: 'human',
          selectedClassIds: ['bloodbinder'],
          classAbilityProgress: { bloodbinder: 0 }
        }
      }));
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#play-quick-abilities .play-action-card', { timeout: 5000 });
    await page.locator('#play-quick-abilities .play-action-card')
      .filter({ hasText: 'Transfusion' })
      .locator('[data-play-reference-name="Transfusion"]')
      .first()
      .click();
    await page.waitForFunction(() => {
      const panel = document.querySelector('#play-reference-detail');
      return panel && !panel.hidden && panel.textContent.includes('You lose HP up to your Toughness x 2');
    });

    const referenceResult = await page.evaluate(() => {
      const panel = document.querySelector('#play-reference-detail');
      return {
        hasPanel: Boolean(panel && !panel.hidden),
        title: panel?.querySelector('h3')?.textContent?.trim() || '',
        text: panel?.textContent || '',
        linkCount: document.querySelectorAll('#play-quick-abilities [data-play-reference-name="Transfusion"]').length,
        removedBuilderAudit: !document.body.textContent.includes('Builder Audit') && !document.body.textContent.includes('Funds and Builder Effects')
      };
    });

    if (
      !referenceResult.hasPanel ||
      referenceResult.title !== 'Transfusion' ||
      !referenceResult.text.includes('40ft') ||
      !referenceResult.text.includes('Healing') ||
      !referenceResult.text.includes('Aid') ||
      !referenceResult.text.includes('ignores temporary HP') ||
      referenceResult.linkCount < 1 ||
      !referenceResult.removedBuilderAudit
    ) {
      throw new Error(`Ability reference detail regression failed: ${JSON.stringify(referenceResult)}`);
    }

    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    await page.locator('[data-builder-action="pick-race"]').filter({ hasText: 'Youkai' }).first().click();
    await page.click('#builder-sheet-shortcut-top');
    await page.click('[data-play-tab="abilities"]');
    await page.waitForSelector('#play-quick-abilities [data-play-use-ability]', { state: 'visible', timeout: 5000 });

    const spiritualSyncInitial = await page.evaluate(() => {
      const card = [...document.querySelectorAll('#play-quick-abilities .play-action-card')]
        .find((entry) => entry.textContent.includes('Spiritual Sync'));
      return {
        hasCard: Boolean(card),
        showsVariableMana: (card?.textContent || '').includes('X Mana'),
        hidesRawNegativeMana: !(card?.textContent || '').includes('-1 Mana'),
        mana: Number(document.querySelector('[data-play-resource="manaCurrent"]')?.value || 0),
        tempHp: Number(document.querySelector('.play-hit-temp-value')?.textContent?.trim() || 0)
      };
    });

    if (!spiritualSyncInitial.hasCard || !spiritualSyncInitial.showsVariableMana || !spiritualSyncInitial.hidesRawNegativeMana) {
      throw new Error(`Spiritual Sync card regression failed: ${JSON.stringify(spiritualSyncInitial)}`);
    }

    const spiritualSyncButton = page.locator('#play-quick-abilities .play-action-card')
      .filter({ hasText: 'Spiritual Sync' })
      .locator('[data-play-use-ability]');
    await spiritualSyncButton.click();
    await page.waitForFunction(() => Number(document.querySelector('.play-hit-temp-value')?.textContent?.trim() || 0) === 8);
    await spiritualSyncButton.click();
    await page.waitForFunction(() => Number(document.querySelector('.play-hit-temp-value')?.textContent?.trim() || 0) === 8);

    const spiritualSyncResult = await page.evaluate(() => {
      const logText = document.querySelector('#play-log')?.textContent || '';
      return {
        mana: Number(document.querySelector('[data-play-resource="manaCurrent"]')?.value || 0),
        tempHp: Number(document.querySelector('.play-hit-temp-value')?.textContent?.trim() || 0),
        hasTrackedEffectLog: logText.includes('Tracked mana conversion: Temporary HP set to 8'),
        hasVariableSpendLog: logText.includes('Variable cost: spent 1 Mana')
      };
    });

    if (
      spiritualSyncResult.mana !== spiritualSyncInitial.mana - 2 ||
      spiritualSyncResult.tempHp !== Math.max(spiritualSyncInitial.tempHp, 8) ||
      !spiritualSyncResult.hasTrackedEffectLog ||
      !spiritualSyncResult.hasVariableSpendLog
    ) {
      throw new Error(`Spiritual Sync use regression failed: ${JSON.stringify({ spiritualSyncInitial, spiritualSyncResult })}`);
    }

    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    await page.locator('[data-builder-action="pick-race"]').filter({ hasText: 'Human' }).first().click();
    await page.click('[data-step-index="6"]');
    await page.locator('[data-builder-action="toggle-class"][data-id="fighter"]').click();
    for (let index = 0; index < 3; index += 1) {
      await page.locator('[data-builder-action="learn-class-ability"][data-id="fighter"]').click();
      await page.waitForTimeout(150);
    }
    await page.click('#builder-sheet-shortcut-top');
    await page.click('[data-play-tab="abilities"]');
    await page.waitForSelector('#play-quick-abilities .play-action-card', { timeout: 5000 });

    const fighterAbilityCostButtons = await page.evaluate(() => {
      const getButtonsForAbility = (name) => {
        const card = [...document.querySelectorAll('#play-quick-abilities .play-action-card')]
          .find((entry) => entry.querySelector('.play-reference-title, strong')?.textContent?.trim() === name);
        return [...(card?.querySelectorAll('[data-play-use-ability], [data-play-use-ability-attack]') || [])].map((button) => ({
          text: button.textContent.trim(),
          cost: button.dataset.playAbilityCostLabel || '',
          attack: button.dataset.playAbilityAttack || ''
        }));
      };
      return {
        charge: getButtonsForAbility('Charge'),
        powerStrike: getButtonsForAbility('Power Strike')
      };
    });

    const chargeCosts = fighterAbilityCostButtons.charge.map((button) => button.cost).sort();
    const powerStrikeCosts = fighterAbilityCostButtons.powerStrike.map((button) => `${button.attack}:${button.cost}`).sort();
    const hasChargeOptions = chargeCosts.join('|') === '2 AP|4 AP';
    const hasPowerStrikeOptions = powerStrikeCosts.join('|') === 'heavyAttack:2 AP|lightAttack:1 AP|preciseAttack:2 AP';
    if (!hasChargeOptions || !hasPowerStrikeOptions) {
      throw new Error(`Fighter variable ability cost buttons failed: ${JSON.stringify(fighterAbilityCostButtons)}`);
    }

    await page.locator('#play-quick-abilities .play-action-card')
      .filter({ hasText: 'Charge' })
      .locator('button', { hasText: 'Spend 4 AP' })
      .click();
    await page.waitForFunction(() => Number(document.querySelector('[data-play-resource="apCurrent"]')?.value || 0) === 0);
    await page.fill('[data-play-resource="apCurrent"]', '4');
    await page.locator('#play-quick-abilities .play-action-card')
      .filter({ hasText: 'Power Strike' })
      .locator('button', { hasText: 'Spend 2 AP + Heavy' })
      .click();
    await page.waitForFunction(() => Number(document.querySelector('[data-play-resource="apCurrent"]')?.value || 0) === 2);

    const fighterSpendResult = await page.evaluate(() => {
      const logText = document.querySelector('#play-log')?.textContent || '';
      return {
        ap: Number(document.querySelector('[data-play-resource="apCurrent"]')?.value || 0),
        chargeSpentFour: logText.includes('Charge') && logText.includes('Cost: 4 AP'),
        powerStrikeSpentTwo: logText.includes('Power Strike') && logText.includes('Cost: 2 AP'),
        rolledHeavy: logText.includes('Power Strike Roll')
      };
    });

    if (
      fighterSpendResult.ap !== 2 ||
      !fighterSpendResult.chargeSpentFour ||
      !fighterSpendResult.powerStrikeSpentTwo ||
      !fighterSpendResult.rolledHeavy
    ) {
      throw new Error(`Fighter variable ability spend failed: ${JSON.stringify(fighterSpendResult)}`);
    }

    await page.fill('[data-play-resource="apCurrent"]', '1');
    await page.fill('[data-play-resource="rpCurrent"]', '1');
    await page.fill('[data-play-resource="manaCurrent"]', '2');
    const apRecoveryInitial = await page.evaluate(() => ({
      apMax: Number(document.querySelector('[data-play-resource="apMax"]')?.value || 0),
      ap: Number(document.querySelector('[data-play-resource="apCurrent"]')?.value || 0),
      rp: Number(document.querySelector('[data-play-resource="rpCurrent"]')?.value || 0),
      mana: Number(document.querySelector('[data-play-resource="manaCurrent"]')?.value || 0)
    }));
    await page.click('#play-resource-grid [data-play-recover-ap]');
    await page.waitForFunction((initial) => {
      const ap = Number(document.querySelector('[data-play-resource="apCurrent"]')?.value || 0);
      const rp = Number(document.querySelector('[data-play-resource="rpCurrent"]')?.value || 0);
      const mana = Number(document.querySelector('[data-play-resource="manaCurrent"]')?.value || 0);
      return ap === initial.apMax && rp === initial.rp && mana === initial.mana;
    }, apRecoveryInitial);

    const apRecoveryResult = await page.evaluate(() => {
      const logText = document.querySelector('#play-log')?.textContent || '';
      return {
        ap: Number(document.querySelector('[data-play-resource="apCurrent"]')?.value || 0),
        rp: Number(document.querySelector('[data-play-resource="rpCurrent"]')?.value || 0),
        mana: Number(document.querySelector('[data-play-resource="manaCurrent"]')?.value || 0),
        hasApRecoveryLog: logText.includes('AP Recovery'),
        warnsNoManaRpRestore: logText.includes('Mana and RP are not restored by AP recovery')
      };
    });

    if (
      apRecoveryResult.ap !== apRecoveryInitial.apMax ||
      apRecoveryResult.rp !== apRecoveryInitial.rp ||
      apRecoveryResult.mana !== apRecoveryInitial.mana ||
      !apRecoveryResult.hasApRecoveryLog ||
      !apRecoveryResult.warnsNoManaRpRestore
    ) {
      throw new Error(`AP recovery button regression failed: ${JSON.stringify({ apRecoveryInitial, apRecoveryResult })}`);
    }

    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
        ui: { mode: 'sheet', sheetTab: 'inventory', gameVersion: '0.13.0' },
        fields: {
          Name: 'Inventory Use Tester',
          Power: '0',
          Toughness: '0',
          Agility: '0'
        },
        builder: {
          selectedRaceId: 'human',
          selectedItemIds: ['bull-potion'],
          itemQuantities: { 'bull-potion': 2 }
        },
        play: {
          resources: {
            hpCurrent: 20,
            hpMax: 20,
            tempHp: 0,
            manaCurrent: 2,
            manaMax: 6,
            rpCurrent: 2,
            rpMax: 2,
            apCurrent: 4,
            apMax: 4
          }
        }
      }));
    });
    await page.reload({ waitUntil: 'load' });
    await page.click('[data-play-tab="inventory"]');
    await page.waitForSelector('#play-inventory [data-inventory-use]', { timeout: 5000 });

    const inventoryUseInitial = await page.evaluate(() => {
      const row = [...document.querySelectorAll('#play-inventory .play-item-row')]
        .find((entry) => entry.textContent.includes('Bull Potion'));
      return {
        hasBullPotion: Boolean(row),
        quantityBadge: row?.querySelector('.play-item-equipped-badge')?.textContent.trim() || '',
        mana: Number(document.querySelector('[data-play-resource="manaCurrent"]')?.value || 0),
        useButtons: [...(row?.querySelectorAll('[data-inventory-use]') || [])].map((button) => button.textContent.trim())
      };
    });

    if (
      !inventoryUseInitial.hasBullPotion ||
      inventoryUseInitial.quantityBadge !== 'x2' ||
      inventoryUseInitial.mana !== 2 ||
      !inventoryUseInitial.useButtons.includes('Use')
    ) {
      throw new Error(`Inventory use setup failed: ${JSON.stringify(inventoryUseInitial)}`);
    }

    await page.locator('#play-inventory .play-item-row')
      .filter({ hasText: 'Bull Potion' })
      .locator('[data-inventory-use]')
      .first()
      .click();
    await page.waitForFunction(() => Number(document.querySelector('[data-play-resource="manaCurrent"]')?.value || 0) === 4);

    const inventoryUseFirstResult = await page.evaluate(() => {
      const row = [...document.querySelectorAll('#play-inventory .play-item-row')]
        .find((entry) => entry.textContent.includes('Bull Potion'));
      const logText = document.querySelector('#play-log')?.textContent || '';
      return {
        hasBullPotion: Boolean(row),
        quantityBadge: row?.querySelector('.play-item-equipped-badge')?.textContent.trim() || '',
        mana: Number(document.querySelector('[data-play-resource="manaCurrent"]')?.value || 0),
        loggedUse: logText.includes('Bull Potion') && logText.includes('restored 2 Mana'),
        loggedConsumption: logText.includes('Inventory: one use consumed.')
      };
    });

    if (
      !inventoryUseFirstResult.hasBullPotion ||
      inventoryUseFirstResult.quantityBadge ||
      inventoryUseFirstResult.mana !== 4 ||
      !inventoryUseFirstResult.loggedUse ||
      !inventoryUseFirstResult.loggedConsumption
    ) {
      throw new Error(`Inventory item use failed: ${JSON.stringify(inventoryUseFirstResult)}`);
    }

    await page.locator('#play-inventory .play-item-row')
      .filter({ hasText: 'Bull Potion' })
      .locator('[data-inventory-use]')
      .first()
      .click();
    await page.waitForFunction(() => (document.querySelector('#play-log')?.textContent || '').includes('Bull Potion Blocked'));

    const inventoryUseBlockedResult = await page.evaluate(() => {
      const row = [...document.querySelectorAll('#play-inventory .play-item-row')]
        .find((entry) => entry.textContent.includes('Bull Potion'));
      const logText = document.querySelector('#play-log')?.textContent || '';
      return {
        hasBullPotion: Boolean(row),
        quantityBadge: row?.querySelector('.play-item-equipped-badge')?.textContent.trim() || '',
        mana: Number(document.querySelector('[data-play-resource="manaCurrent"]')?.value || 0),
        blockedUse: logText.includes('Bull Potion Blocked') && logText.includes('already used food recovery')
      };
    });

    if (
      !inventoryUseBlockedResult.hasBullPotion ||
      inventoryUseBlockedResult.quantityBadge ||
      inventoryUseBlockedResult.mana !== 4 ||
      !inventoryUseBlockedResult.blockedUse
    ) {
      throw new Error(`Food benefit lockout failed: ${JSON.stringify(inventoryUseBlockedResult)}`);
    }

    await page.click('[data-play-tab="actions"]');
    await page.click('[data-play-rest="camp"]');
    await page.waitForFunction(() => (document.querySelector('#play-log')?.textContent || '').includes('Food mana recovery is available again.'));
    await page.click('[data-play-tab="inventory"]');
    await page.locator('#play-inventory .play-item-row')
      .filter({ hasText: 'Bull Potion' })
      .locator('[data-inventory-use]')
      .first()
      .click();
    await page.waitForFunction(() => ![...document.querySelectorAll('#play-inventory .play-item-row')]
      .some((entry) => entry.textContent.includes('Bull Potion')));

    const inventoryUseFinalResult = await page.evaluate(() => ({
      hasBullPotion: [...document.querySelectorAll('#play-inventory .play-item-row')]
        .some((entry) => entry.textContent.includes('Bull Potion')),
      mana: Number(document.querySelector('[data-play-resource="manaCurrent"]')?.value || 0),
      resetLogged: (document.querySelector('#play-log')?.textContent || '').includes('Food mana recovery is available again.'),
      itemsText: document.querySelector('#play-inventory')?.textContent || ''
    }));

    if (
      inventoryUseFinalResult.hasBullPotion ||
      inventoryUseFinalResult.mana !== 6 ||
      !inventoryUseFinalResult.resetLogged ||
      !inventoryUseFinalResult.itemsText.includes('No equipment selected yet.')
    ) {
      throw new Error(`Inventory item consumption after rest failed: ${JSON.stringify(inventoryUseFinalResult)}`);
    }

    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
        ui: { mode: 'sheet', sheetTab: 'inventory', gameVersion: '0.13.0' },
        fields: {
          Name: 'Shielding Potion Tester',
          Power: '0',
          Toughness: '0',
          Agility: '0'
        },
        builder: {
          selectedRaceId: 'human',
          selectedItemIds: ['shielding-potion'],
          itemQuantities: { 'shielding-potion': 1 }
        },
        play: {
          resources: {
            hpCurrent: 20,
            hpMax: 20,
            tempHp: 0,
            manaCurrent: 6,
            manaMax: 6,
            rpCurrent: 2,
            rpMax: 2,
            apCurrent: 4,
            apMax: 4
          }
        }
      }));
    });
    await page.reload({ waitUntil: 'load' });
    await page.click('[data-play-tab="inventory"]');
    await page.waitForSelector('#play-inventory [data-inventory-use]', { timeout: 5000 });
    await page.locator('#play-inventory .play-item-row')
      .filter({ hasText: 'Shielding Potion' })
      .locator('[data-inventory-use]')
      .first()
      .click();
    await page.waitForFunction(() => Number(document.querySelector('.play-hit-temp-value')?.textContent || 0) === 15);
    await page.click('[data-play-tab="actions"]');
    await page.waitForFunction(() => (document.querySelector('#play-derived-grid .play-tracker-effects')?.textContent || '').includes('Shielding Potion'));

    const shieldingPotionResult = await page.evaluate(() => ({
      tempHp: Number(document.querySelector('.play-hit-temp-value')?.textContent || 0),
      activeEffectsText: document.querySelector('#play-derived-grid .play-tracker-effects')?.textContent || '',
      logText: document.querySelector('#play-log')?.textContent || ''
    }));

    if (
      shieldingPotionResult.tempHp !== 15 ||
      !shieldingPotionResult.activeEffectsText.includes('Shielding Potion') ||
      shieldingPotionResult.activeEffectsText.includes('Until start of your next turn') ||
      !shieldingPotionResult.logText.includes('Temporary HP set to 15')
    ) {
      throw new Error(`Shielding Potion tracking failed: ${JSON.stringify(shieldingPotionResult)}`);
    }
    await page.locator('#play-derived-grid .play-effect-chip')
      .filter({ hasText: 'Shielding Potion' })
      .first()
      .click();
    await page.waitForFunction(() => (document.querySelector('#sheet-modal')?.textContent || '').includes('Until start of your next turn'));
    await page.locator('#sheet-modal-close').click();

    await page.click('[data-open-effect-picker="negative"]');
    await page.waitForSelector('[data-manual-effect-option="poisoned"]', { timeout: 5000 });
    await page.check('[data-manual-effect-option="poisoned"]');
    await page.click('[data-manual-effect-confirm]');
    await page.waitForFunction(() => (document.querySelector('#play-derived-grid .play-tracker-effects')?.textContent || '').includes('Poisoned'));
    const manualConditionResult = await page.evaluate(() => ({
      effectsText: document.querySelector('#play-derived-grid .play-tracker-effects')?.textContent || '',
      logText: document.querySelector('#play-log')?.textContent || ''
    }));
    if (
      !manualConditionResult.effectsText.includes('Negative / Conditions') ||
      !manualConditionResult.effectsText.includes('Poisoned') ||
      manualConditionResult.effectsText.includes('Poison effect is active') ||
      !manualConditionResult.logText.includes('Conditions Added')
    ) {
      throw new Error(`Manual condition picker failed: ${JSON.stringify(manualConditionResult)}`);
    }
    await page.locator('#play-derived-grid .play-effect-chip')
      .filter({ hasText: 'Poisoned' })
      .first()
      .click();
    await page.waitForFunction(() => (document.querySelector('#sheet-modal')?.textContent || '').includes('Poison is source-specific'));
    await page.click('[data-play-effect-detail-clear]');
    await page.waitForFunction(() => !(document.querySelector('#play-derived-grid .play-tracker-effects')?.textContent || '').includes('Poisoned'));

    await page.click('[data-open-effect-picker="negative"]');
    await page.waitForSelector('[data-manual-effect-option="slow"]', { timeout: 5000 });
    await page.check('[data-manual-effect-option="slow"]');
    await page.click('[data-manual-effect-confirm]');
    await page.waitForFunction(() => (document.querySelector('#play-utility-grid')?.textContent || '').includes('Speed') && (document.querySelector('#play-utility-grid')?.textContent || '').includes('10'));
    await page.locator('#play-derived-grid .play-effect-chip')
      .filter({ hasText: 'Slow' })
      .first()
      .click();
    await page.waitForFunction(() => (document.querySelector('#sheet-modal')?.textContent || '').includes('Your movement speed is halved'));
    await page.click('[data-play-effect-detail-clear]');
    await page.waitForFunction(() => (document.querySelector('#play-utility-grid')?.textContent || '').includes('Speed') && (document.querySelector('#play-utility-grid')?.textContent || '').includes('20'));

    await page.click('[data-open-effect-picker="positive"]');
    await page.waitForSelector('[data-manual-effect-option="haste"]', { timeout: 5000 });
    await page.check('[data-manual-effect-option="haste"]');
    await page.click('[data-manual-effect-confirm]');
    await page.waitForFunction(() => Number(document.querySelector('[data-play-resource="apCurrent"]')?.value || 0) === 6);
    await page.locator('#play-derived-grid .play-effect-chip')
      .filter({ hasText: 'Haste' })
      .first()
      .click();
    await page.waitForFunction(() => (document.querySelector('#sheet-modal')?.textContent || '').includes('granting them 2 AP'));
    await page.click('[data-play-effect-detail-clear]');
    await page.waitForFunction(() => Number(document.querySelector('[data-play-resource="apCurrent"]')?.value || 0) === 4);

    await page.click('[data-open-effect-picker="positive"]');
    await page.waitForSelector('[data-manual-effect-option="inspired"]', { timeout: 5000 });
    await page.check('[data-manual-effect-option="inspired"]');
    await page.click('[data-manual-effect-confirm]');
    await page.waitForFunction(() => (document.querySelector('#play-derived-grid .play-tracker-effects')?.textContent || '').includes('Inspired'));
    const manualEffectResult = await page.evaluate(() => ({
      effectsText: document.querySelector('#play-derived-grid .play-tracker-effects')?.textContent || '',
      logText: document.querySelector('#play-log')?.textContent || ''
    }));
    if (
      !manualEffectResult.effectsText.includes('Positive Effects') ||
      !manualEffectResult.effectsText.includes('Inspired') ||
      manualEffectResult.effectsText.includes('morale/song/command') ||
      !manualEffectResult.logText.includes('Effects Added')
    ) {
      throw new Error(`Manual positive effect picker failed: ${JSON.stringify(manualEffectResult)}`);
    }
    await page.locator('#play-derived-grid .play-effect-chip')
      .filter({ hasText: 'Inspired' })
      .first()
      .click();
    await page.waitForFunction(() => (document.querySelector('#sheet-modal')?.textContent || '').includes('not a universal rules condition'));
    await page.locator('#sheet-modal-close').click();

    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('lyrian-chronicles-character-suite-v2', JSON.stringify({
        ui: { mode: 'sheet', sheetTab: 'abilities', gameVersion: '0.13.0' },
        fields: { Name: 'Hydromancer Cost Tester' },
        builder: {
          selectedRaceId: 'human',
          selectedClassIds: ['hydromancer'],
          classAbilityProgress: { hydromancer: 1 }
        },
        play: {
          resources: {
            hpCurrent: 25,
            hpMax: 25,
            tempHp: 0,
            manaCurrent: 7,
            manaMax: 7,
            rpCurrent: 2,
            rpMax: 2,
            apCurrent: 4,
            apMax: 4
          }
        }
      }));
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#play-quick-abilities .play-action-card', { timeout: 5000 });

    const hydromancerCostInitial = await page.evaluate(() => {
      const aquaDrillCard = [...document.querySelectorAll('#play-quick-abilities .play-action-card')]
        .find((entry) => entry.querySelector('.play-reference-title, strong')?.textContent?.trim() === 'Aqua Drill');
      return {
        buttons: [...(aquaDrillCard?.querySelectorAll('[data-play-use-ability], [data-play-use-ability-attack]') || [])].map((button) => ({
          text: button.textContent.trim(),
          cost: button.dataset.playAbilityCostLabel || '',
          attack: button.dataset.playAbilityAttack || ''
        })),
        ap: Number(document.querySelector('[data-play-resource="apCurrent"]')?.value || 0),
        rp: Number(document.querySelector('[data-play-resource="rpCurrent"]')?.value || 0),
        mana: Number(document.querySelector('[data-play-resource="manaCurrent"]')?.value || 0)
      };
    });

    const hydromancerButtons = hydromancerCostInitial.buttons.map((button) => `${button.attack}:${button.cost}`).sort();
    if (hydromancerButtons.join('|') !== 'heavyAttack:1 RP, 1 Mana|heavyAttack:2 AP') {
      throw new Error(`Hydromancer AP/RP choice buttons failed: ${JSON.stringify(hydromancerCostInitial)}`);
    }

    await page.locator('#play-quick-abilities .play-action-card')
      .filter({ hasText: 'Aqua Drill' })
      .locator('button', { hasText: 'Spend 1 RP + 1 Mana + Heavy' })
      .click();
    await page.waitForFunction((initial) => {
      const ap = Number(document.querySelector('[data-play-resource="apCurrent"]')?.value || 0);
      const rp = Number(document.querySelector('[data-play-resource="rpCurrent"]')?.value || 0);
      const mana = Number(document.querySelector('[data-play-resource="manaCurrent"]')?.value || 0);
      return ap === initial.ap && rp === initial.rp - 1 && mana === initial.mana - 1;
    }, hydromancerCostInitial);

    const hydromancerSpendResult = await page.evaluate(() => {
      const logText = document.querySelector('#play-log')?.textContent || '';
      return {
        ap: Number(document.querySelector('[data-play-resource="apCurrent"]')?.value || 0),
        rp: Number(document.querySelector('[data-play-resource="rpCurrent"]')?.value || 0),
        mana: Number(document.querySelector('[data-play-resource="manaCurrent"]')?.value || 0),
        aquaDrillSpentRp: logText.includes('Aqua Drill') && logText.includes('Cost: 1 RP, 1 Mana'),
        rolledHeavy: logText.includes('Aqua Drill Roll')
      };
    });

    if (
      hydromancerSpendResult.ap !== hydromancerCostInitial.ap ||
      hydromancerSpendResult.rp !== hydromancerCostInitial.rp - 1 ||
      hydromancerSpendResult.mana !== hydromancerCostInitial.mana - 1 ||
      !hydromancerSpendResult.aquaDrillSpentRp ||
      !hydromancerSpendResult.rolledHeavy
    ) {
      throw new Error(`Hydromancer AP/RP choice spend failed: ${JSON.stringify({ hydromancerCostInitial, hydromancerSpendResult })}`);
    }
  }

  async function runSpreadsheetVisibleGridImportAssertion(page) {
    const storageKey = 'lyrian-chronicles-character-suite-v2';
    await page.addScriptTag({ url: new URL('assets/xlsx.full.min.js', page.url()).toString() });
    await page.evaluate(() => {
      localStorage.clear();
      const core = {};
      const setCell = (address, value) => {
        core[address] = {
          v: value,
          t: typeof value === 'number' ? 'n' : (typeof value === 'boolean' ? 'b' : 's')
        };
      };

      setCell('B2', 'Roland Beaumont');
      setCell('D2', 'Human');
      setCell('B3', 'Male');
      setCell('B4', 28);
      setCell('B5', "6'");
      setCell('B6', '210lbs');
      setCell('B7', 'Kari');
      setCell('D4', 25);
      setCell('D5', 1950);

      setCell('A9', 'Focus');
      setCell('B9', 4);
      setCell('A10', 'Power');
      setCell('B10', 5);
      setCell('A11', 'Agility');
      setCell('B11', 4);
      setCell('A12', 'Toughness');
      setCell('B12', 6);
      setCell('C9', 'Fitness');
      setCell('D9', 6);
      setCell('C10', 'Cunning');
      setCell('D10', 2);
      setCell('C11', 'Reason');
      setCell('D11', 4);
      setCell('C12', 'Awareness');
      setCell('D12', 5);
      setCell('C13', 'Presence');
      setCell('D13', 1);

      setCell('A45', 5);
      setCell('A46', 4);
      setCell('A47', 4);
      setCell('A48', 3);
      setCell('C45', 5);
      setCell('C46', 4);
      setCell('C47', 3);
      setCell('C48', 2);
      setCell('C49', 1);

      setCell('E2', 'HP');
      setCell('F2', 85);
      setCell('E3', 'Mana');
      setCell('F3', 11);
      setCell('E7', 'RP');
      setCell('F7', 6);

      setCell('A15', 'Acolyte');
      setCell('C15', 1);
      setCell('D15', 100);
      setCell('A16', 'Shield Paladin');
      setCell('C16', 8);
      setCell('D16', 900);
      setCell('A17', 'Fighter');
      setCell('C17', 8);
      setCell('D17', 800);
      setCell('A18', 'Guardian');
      setCell('D18', 0);
      setCell('A19', 'Exalted Shield');
      setCell('D19', 0);
      setCell('A37', 'Holy Justice');
      setCell('A38', 'Silvered Spiked Shield');
      setCell('A39', 'Kunai');
      setCell('F37', 'Heavy Armour');
      setCell('L37', true);
      setCell('F38', 'Greatshield');
      setCell('L38', true);
      setCell('F39', 'Holy Shield');
      setCell('L39', false);
      setCell('F40', 'Armour plates');
      setCell('L40', false);
      core['!ref'] = 'A1:L60';

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, core, 'Core');
      XLSX.utils.book_append_sheet(workbook, {}, 'Abilities');
      XLSX.utils.book_append_sheet(workbook, {}, 'Breakthrough');
      XLSX.utils.book_append_sheet(workbook, {}, 'Inventory');
      XLSX.utils.book_append_sheet(workbook, {}, 'Journals');
      const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const file = new File([bytes], 'roland-visible-grid.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const input = document.getElementById('import-file');
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await page.waitForFunction((key) => {
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      return saved?.fields?.Name === 'Roland Beaumont' && saved?.fields?.Toughness === '6';
    }, storageKey, { timeout: 10000 });
    await page.click('#builder-sheet-shortcut-top');
    await page.waitForSelector('.play-hit-max', { timeout: 5000 });

    const result = await page.evaluate((key) => {
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      return {
        subRace: saved.fields?.['Sub Race'] || '',
        selectedAncestryId: saved.builder?.selectedAncestryId || '',
        selectedClassIds: saved.builder?.selectedClassIds || [],
        power: saved.fields?.Power || '',
        focus: saved.fields?.Focus || '',
        toughness: saved.fields?.Toughness || '',
        fitness: saved.fields?.Fitness || '',
        cunning: saved.fields?.Cunning || '',
        awareness: saved.fields?.Awareness || '',
        hpCurrent: document.querySelector('.play-hit-current')?.textContent?.trim() || '',
        hpMax: document.querySelector('.play-hit-max')?.textContent?.trim() || '',
        selectedItemIds: saved.builder?.selectedItemIds || [],
        inventoryFields: [1, 2, 3, 4, 5].map((index) => saved.fields?.[`CombatInventory${index}`] || '').filter(Boolean),
        customInventoryNames: (saved.play?.inventoryItems || []).filter((entry) => entry.custom).map((entry) => entry.name || ''),
        equippedInventoryKeys: (saved.play?.inventoryItems || []).filter((entry) => entry.equipped).map((entry) => entry.name || entry.itemId || ''),
        summaryText: document.querySelector('#builder-summary')?.textContent?.replace(/\s+/g, ' ').trim() || ''
      };
    }, storageKey);

    const classesMatch = result.selectedClassIds.join(',') === 'acolyte,shield-paladin,fighter';
    const selectedItemIds = new Set(result.selectedItemIds);
    const inventoryFields = new Set(result.inventoryFields);
    const customNames = new Set(result.customInventoryNames);
    const equippedKeys = new Set(result.equippedInventoryKeys);
    const equipmentImported = selectedItemIds.has('armor--heavy-')
      && selectedItemIds.has('shield--great-')
      && selectedItemIds.has('armor-plates')
      && inventoryFields.has('Armor (Heavy)')
      && inventoryFields.has('Shield (Great)')
      && inventoryFields.has('Armor Plates')
      && customNames.has('Holy Justice')
      && customNames.has('Silvered Spiked Shield')
      && customNames.has('Kunai')
      && customNames.has('Holy Shield')
      && equippedKeys.has('Holy Justice')
      && equippedKeys.has('Silvered Spiked Shield')
      && equippedKeys.has('Kunai')
      && equippedKeys.has('armor--heavy-')
      && equippedKeys.has('shield--great-');
    if (
      result.subRace !== '' ||
      result.selectedAncestryId !== '' ||
      !classesMatch ||
      !equipmentImported ||
      result.power !== '5' ||
      result.focus !== '4' ||
      result.toughness !== '6' ||
      result.fitness !== '6' ||
      result.cunning !== '2' ||
      result.awareness !== '5' ||
      result.hpCurrent !== '85' ||
      result.hpMax !== '85' ||
      result.summaryText.includes('Ancient Marionette')
    ) {
      throw new Error(`Visible spreadsheet import regression failed: ${JSON.stringify(result)}`);
    }

    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(500);
    await page.addScriptTag({ url: new URL('assets/xlsx.full.min.js', page.url()).toString() });

    await page.evaluate(() => {
      const core = {};
      const breakthroughs = {};
      const inventory = {};
      const setCell = (sheet, address, value) => {
        sheet[address] = {
          v: value,
          t: typeof value === 'number' ? 'n' : (typeof value === 'boolean' ? 'b' : 's')
        };
      };

      setCell(core, 'B2', 'Masaru');
      setCell(core, 'D2', 'Youkai');
      setCell(core, 'D3', 'Oni');
      setCell(core, 'B3', 'Male');
      setCell(core, 'B4', 34);
      setCell(core, 'B5', '6\' 2"');
      setCell(core, 'B6', '240 lbs');
      setCell(core, 'D4', 0);
      setCell(core, 'D5', 2100);

      setCell(core, 'A9', 'Focus');
      setCell(core, 'B9', 4);
      setCell(core, 'A10', 'Power');
      setCell(core, 'B10', 7);
      setCell(core, 'A11', 'Agility');
      setCell(core, 'B11', 4);
      setCell(core, 'A12', 'Toughness');
      setCell(core, 'B12', 4);
      setCell(core, 'C9', 'Fitness');
      setCell(core, 'D9', 6);
      setCell(core, 'C10', 'Cunning');
      setCell(core, 'D10', 1);
      setCell(core, 'C11', 'Reason');
      setCell(core, 'D11', 2);
      setCell(core, 'C12', 'Awareness');
      setCell(core, 'D12', 3);
      setCell(core, 'C13', 'Presence');
      setCell(core, 'D13', 5);

      setCell(core, 'E2', 'HP');
      setCell(core, 'F2', 65);
      setCell(core, 'E3', 'Mana');
      setCell(core, 'F3', 13);
      setCell(core, 'E7', 'RP');
      setCell(core, 'F7', 6);

      setCell(core, 'A15', 'Fighter');
      setCell(core, 'C15', 8);
      setCell(core, 'D15', 800);
      setCell(core, 'A16', 'Highlander');
      setCell(core, 'C16', 8);
      setCell(core, 'D16', 900);
      setCell(core, 'A17', 'Reaver');
      setCell(core, 'C17', 2);
      setCell(core, 'D17', 400);

      setCell(core, 'E9', 'Athletics');
      setCell(core, 'H9', 10);
      setCell(core, 'E28', 'Negotiation');
      setCell(core, 'H28', 0);
      setCell(core, 'E29', 'Intimidation');
      setCell(core, 'H29', 15);
      setCell(core, 'I29', 'Ceremonial (+10)');

      setCell(core, 'F37', 'Ceremonial Barrier Chainlinks Armor');
      setCell(core, 'J37', 12);
      setCell(core, 'L37', true);
      core['!ref'] = 'A1:L60';

      setCell(breakthroughs, 'A2', 'In Sync (Youkai)');
      setCell(breakthroughs, 'A3', 'Powerful Ki (Oni)');
      breakthroughs['!ref'] = 'A1:C5';

      setCell(inventory, 'A2', 'Ceremonial Barrier Chainlinks Armor');
      setCell(inventory, 'B2', 1);
      setCell(inventory, 'C2', 2);
      setCell(inventory, 'F2', 'Ceremonial, Barrier, Chainlink');
      setCell(inventory, 'A3', 'Blued Overwhelming UGS');
      setCell(inventory, 'B3', 1);
      setCell(inventory, 'C3', 2);
      setCell(inventory, 'F3', 'Tama (+1 Power) Overwhelming Edge');
      inventory['!ref'] = 'A1:F5';

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, core, 'Core');
      XLSX.utils.book_append_sheet(workbook, {}, 'Abilities');
      XLSX.utils.book_append_sheet(workbook, breakthroughs, 'Breakthrough');
      XLSX.utils.book_append_sheet(workbook, inventory, 'Inventory');
      XLSX.utils.book_append_sheet(workbook, {}, 'Journals');
      const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const file = new File([bytes], 'masaru-visible-grid.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const input = document.getElementById('import-file');
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await page.waitForFunction((key) => {
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      return saved?.fields?.Name === 'Masaru' && saved?.fields?.Mana === '13';
    }, storageKey, { timeout: 10000 });
    await page.click('#builder-sheet-shortcut-top');
    await page.waitForSelector('.play-hit-max', { timeout: 5000 });

    const masaruResult = await page.evaluate((key) => {
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      return {
        importedFinalStats: Boolean(saved.builder?.importedFinalStats),
        selectedBreakthroughIds: saved.builder?.selectedBreakthroughIds || [],
        hp: saved.fields?.HP || '',
        mana: saved.fields?.Mana || '',
        rp: saved.fields?.RP || '',
        block: saved.fields?.Block || '',
        potency: saved.fields?.Potency || '',
        athleticsSP: saved.fields?.SkillPoint1 || '',
        intimidationSP: saved.fields?.SkillPoint20 || '',
        negotiationSP: saved.fields?.SkillPoint21 || '',
        customInventory: (saved.play?.inventoryItems || []).filter((entry) => entry.custom).map((entry) => ({
          name: entry.name || '',
          equipped: Boolean(entry.equipped),
          description: entry.description || ''
        })),
        summaryText: document.querySelector('#builder-summary')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        hpCurrent: document.querySelector('.play-hit-current')?.textContent?.trim() || '',
        hpMax: document.querySelector('.play-hit-max')?.textContent?.trim() || ''
      };
    }, storageKey);

    const masaruBreakthroughs = new Set(masaruResult.selectedBreakthroughIds);
    const customArmor = masaruResult.customInventory.find((entry) => entry.name === 'Ceremonial Barrier Chainlinks Armor');
    if (
      !masaruResult.importedFinalStats ||
      !masaruBreakthroughs.has('in-sync--youkai-') ||
      !masaruBreakthroughs.has('powerful-ki--oni-') ||
      masaruResult.hp !== '65' ||
      masaruResult.mana !== '13' ||
      masaruResult.rp !== '6' ||
      masaruResult.block !== '20' ||
      masaruResult.potency !== '15' ||
      masaruResult.athleticsSP !== '10' ||
      masaruResult.intimidationSP !== '15' ||
      masaruResult.negotiationSP !== '0' ||
      !customArmor?.equipped ||
      !customArmor.description.includes('Increases your Block by 12') ||
      !masaruResult.summaryText.includes('Intimidation +20') ||
      !masaruResult.summaryText.includes('Athletics +16') ||
      !masaruResult.summaryText.includes('Ceremonial Barrier Chainlinks Armor') ||
      masaruResult.summaryText.includes('Negotiation +21') ||
      masaruResult.hpCurrent !== '65' ||
      masaruResult.hpMax !== '65'
    ) {
      throw new Error(`Masaru spreadsheet import regression failed: ${JSON.stringify(masaruResult)}`);
    }

    await page.click('#export-json');
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.click('[data-export-mode="spreadsheet"]');
    const download = await downloadPromise;
    const exportPath = path.join(QA_DIR, 'masaru-spreadsheet-export-regression.xlsx');
    await download.saveAs(exportPath);
    const exportBytes = Array.from(await fs.readFile(exportPath));
    const exportResult = await page.evaluate((bytes) => {
      const workbook = XLSX.read(new Uint8Array(bytes), { type: 'array', cellFormula: false, cellText: true });
      const read = (sheetName, address) => workbook.Sheets[sheetName]?.[address]?.v;
      const type = (sheetName, address) => workbook.Sheets[sheetName]?.[address]?.t;
      return {
        core: {
          B2: read('Core', 'B2'),
          D2: read('Core', 'D2'),
          D3: read('Core', 'D3'),
          H9: read('Core', 'H9'),
          H28: read('Core', 'H28'),
          H29: read('Core', 'H29'),
          I29: read('Core', 'I29'),
          A37: read('Core', 'A37'),
          F37: read('Core', 'F37'),
          J37: read('Core', 'J37'),
          L37: read('Core', 'L37'),
          L37Type: type('Core', 'L37')
        },
        breakthrough: {
          A2: read('Breakthrough', 'A2'),
          C2: read('Breakthrough', 'C2'),
          A3: read('Breakthrough', 'A3'),
          C3: read('Breakthrough', 'C3')
        },
        inventory: {
          A2: read('Inventory', 'A2'),
          B2: read('Inventory', 'B2'),
          C2: read('Inventory', 'C2'),
          F2: read('Inventory', 'F2'),
          A3: read('Inventory', 'A3'),
          B3: read('Inventory', 'B3'),
          C3: read('Inventory', 'C3'),
          F3: read('Inventory', 'F3')
        },
        metadataPresent: Boolean(workbook.Sheets._LyrianState)
      };
    }, exportBytes);

    if (
      exportResult.core.B2 !== 'Masaru' ||
      exportResult.core.D2 !== 'Youkai' ||
      exportResult.core.D3 !== 'Oni' ||
      exportResult.core.H9 !== 10 ||
      exportResult.core.H28 !== 0 ||
      exportResult.core.H29 !== 15 ||
      exportResult.core.I29 !== '+10' ||
      exportResult.core.A37 !== 'Blued Overwhelming UGS' ||
      exportResult.core.F37 !== 'Ceremonial Barrier Chainlinks Armor' ||
      exportResult.core.J37 !== 12 ||
      exportResult.core.L37 !== true ||
      exportResult.core.L37Type !== 'b' ||
      exportResult.breakthrough.A2 !== 'In Sync (Youkai)' ||
      exportResult.breakthrough.C2 !== 'Must be a Youkai.' ||
      exportResult.breakthrough.A3 !== 'Powerful Ki (Oni)' ||
      exportResult.breakthrough.C3 !== 'Must be an Oni.' ||
      exportResult.inventory.A2 !== 'Ceremonial Barrier Chainlinks Armor' ||
      exportResult.inventory.B2 !== 1 ||
      String(exportResult.inventory.C2) !== '2' ||
      !String(exportResult.inventory.F2 || '').includes('Increases your Block by 12') ||
      exportResult.inventory.A3 !== 'Blued Overwhelming UGS' ||
      exportResult.inventory.B3 !== 1 ||
      String(exportResult.inventory.C3) !== '2' ||
      exportResult.inventory.F3 !== 'Tama (+1 Power) Overwhelming Edge' ||
      !exportResult.metadataPresent
    ) {
      throw new Error(`Masaru spreadsheet export regression failed: ${JSON.stringify(exportResult)}`);
    }

    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1500);
  }

  async function runWideDashboardLayoutAssertions(page) {
    await page.locator('[data-builder-action="pick-race"]').filter({ hasText: 'Human' }).first().click();
    await page.click('#builder-sheet-shortcut-top');
    await page.waitForSelector('#play-hit-points #play-temp-hp-button', { timeout: 5000 });

    const layout = await page.evaluate(() => {
      const box = (selector) => {
        const element = document.querySelector(selector);
        if (!element) {
          return null;
        }
        const rect = element.getBoundingClientRect();
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom)
        };
      };
      const overlaps = (a, b) => {
        if (!a || !b) {
          return false;
        }
        return !(a.x >= b.right || a.right <= b.x || a.y >= b.bottom || a.bottom <= b.y);
      };

      const health = box('#play-hit-points');
      const animation = box('.play-resource-animation');
      const utility = box('#play-utility-grid');
      const effects = box('#play-derived-grid .play-tracker-effects');
      const resources = box('#play-resource-grid');
      const senses = box('.play-senses-section');
      const mainStat = box('.play-main-stat-card');
      const secondaryStat = box('.play-secondary-card');
      const mainLabel = box('.play-main-stat-head strong');
      const mainValue = box('.play-main-stat-head .play-main-stat-value');
      const secondaryLabel = box('.play-secondary-stat-head strong');
      const secondaryValue = box('.play-secondary-stat-head .play-secondary-value');
      const isInlinePair = (label, value) => Boolean(
        label &&
        value &&
        label.x < value.x &&
        label.bottom > value.y &&
        value.bottom > label.y
      );
      const healthControls = Array.from(document.querySelectorAll('#play-hit-points input, #play-hit-points button'))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            x: Math.round(rect.x),
            right: Math.round(rect.right),
            y: Math.round(rect.y),
            bottom: Math.round(rect.bottom)
          };
        });
      const utilityText = document.querySelector('#play-utility-grid')?.textContent || '';
      const trackerText = document.querySelector('#play-derived-grid')?.textContent || '';

      return {
        health,
        animation,
        utility,
        effects,
        resources,
        senses,
        mainStat,
        secondaryStat,
        healthIsWideAndThin: Boolean(health && health.width >= 600 && health.height <= 210),
        healthSitsRightOfResources: Boolean(health && resources && health.x >= resources.right + 8),
        effectsSitAboveResources: Boolean(effects && resources && effects.bottom <= resources.y - 8 && Math.abs(effects.x - resources.x) <= 8 && Math.abs(effects.right - resources.right) <= 8),
        resourcesRegainedWidth: Boolean(resources && resources.width >= 680),
        animationSitsUnderResources: Boolean(animation && resources && animation.y >= resources.bottom + 8 && Math.abs(animation.x - resources.x) <= 8 && Math.abs(animation.right - resources.right) <= 8),
        animationCompact: Boolean(animation && animation.height <= 130),
        utilityAlignedToAnimation: Boolean(animation && utility && Math.abs(animation.height - utility.height) <= 8),
        utilitySitsUnderHealth: Boolean(utility && health && utility.y >= health.bottom + 8 && Math.abs(utility.x - health.x) <= 8 && Math.abs(utility.right - health.right) <= 8),
        utilityNormalWidth: Boolean(utility && utility.width <= 900),
        utilityReachesRightLane: Boolean(utility && senses && utility.right >= senses.right - 8),
        mainStatCompact: Boolean(mainStat && mainStat.height <= 112),
        secondaryStatCompact: Boolean(secondaryStat && secondaryStat.height <= 126),
        mainStatValueInline: isInlinePair(mainLabel, mainValue),
        secondaryStatValueInline: isInlinePair(secondaryLabel, secondaryValue),
        healthControlsFit: Boolean(health && healthControls.length && healthControls.every((control) =>
          control.x >= health.x - 1 &&
          control.right <= health.right + 1 &&
          control.y >= health.y - 1 &&
          control.bottom <= health.bottom + 1
        )),
        speedMovedToUtility: utilityText.includes('Speed') && utilityText.includes('Initiative'),
        speedRemovedFromTracker: !trackerText.includes('Speed') && !trackerText.includes('Initiative'),
        healthAvoidsEffects: !overlaps(health, effects),
        utilityAvoidsSenses: !overlaps(utility, senses)
      };
    });

    if (
      !layout.healthIsWideAndThin ||
      !layout.healthSitsRightOfResources ||
      !layout.effectsSitAboveResources ||
      !layout.resourcesRegainedWidth ||
      !layout.animationSitsUnderResources ||
      !layout.animationCompact ||
      !layout.utilityAlignedToAnimation ||
      !layout.utilitySitsUnderHealth ||
      !layout.utilityNormalWidth ||
      !layout.utilityReachesRightLane ||
      !layout.mainStatCompact ||
      !layout.secondaryStatCompact ||
      !layout.mainStatValueInline ||
      !layout.secondaryStatValueInline ||
      !layout.healthControlsFit ||
      !layout.speedMovedToUtility ||
      !layout.speedRemovedFromTracker ||
      !layout.healthAvoidsEffects ||
      !layout.utilityAvoidsSenses
    ) {
      throw new Error(`Wide dashboard layout regression failed: ${JSON.stringify(layout)}`);
    }
  }

  try {
    for (const browserInfo of browsers) {
      console.log(`\nLaunching ${browserInfo.name}...`);
      let browser;
      try {
        browser = await browserInfo.type.launch();
      } catch (launchError) {
        console.warn(`Could not launch ${browserInfo.name}: browser binaries might be missing. Run "playwright install" first.`);
        console.warn(launchError.message);
        continue;
      }

      for (const vp of viewports) {
        console.log(` Testing ${vp.name} viewport (${vp.width}x${vp.height})...`);
        const context = await browser.newContext({
          acceptDownloads: true,
          viewport: { width: vp.width, height: vp.height }
        });
        const page = await context.newPage();

        let testErrors = [];
        let missingResources = [];

        // Attach listeners before navigation to catch load-time errors
        page.on('pageerror', (err) => {
          console.error(`   [CONSOLE ERROR] [${browserInfo.name} - ${vp.name}]:`, err.message);
          testErrors.push(err.message);
        });

        // Track request failures (e.g. DNS or network dropouts)
        page.on('requestfailed', (req) => {
          const url = req.url();
          if (isIgnorableLocalMediaAbort(req)) {
            return;
          }
          if (isLocalTestUrl(url)) {
            const failureText = req.failure()?.errorText || 'unknown failure';
            console.error(`   [REQUEST FAILED] [${browserInfo.name} - ${vp.name}]:`, `${url} (${failureText})`);
            missingResources.push(url);
          }
        });

        // Track HTTP status failures (404, 500, etc.)
        page.on('response', (response) => {
          const status = response.status();
          const url = response.url();
          if (status >= 400 && isLocalTestUrl(url)) {
            console.error(`   [HTTP ERROR ${status}] [${browserInfo.name} - ${vp.name}]:`, url);
            missingResources.push(url);
          }
        });

        try {
          await page.goto(targetUrl, { waitUntil: 'load', timeout: 15000 });
          // Wait for dynamic bindings and assets to settle
          await page.waitForTimeout(2500);

          // Assertions
          const checkResults = await page.evaluate(() => {
            const stepContent = document.getElementById('builder-step-content');
            const stepNav = document.getElementById('builder-step-nav');
            const versionSelect = document.getElementById('game-version-select');
            const builderBuildVersion = document.querySelector('.builder-build-version');

            const contentValid = stepContent && stepContent.children.length > 0 && stepContent.textContent.trim().length > 0;
            const navValid = stepNav && stepNav.querySelectorAll('button').length > 0;
            const versionsValid = versionSelect && versionSelect.querySelectorAll('option').length > 0;
            const builderBuildValid = builderBuildVersion && builderBuildVersion.textContent.includes('Beta 2.11');

            return {
              contentValid,
              navValid,
              versionsValid,
              builderBuildValid,
              contentHtml: stepContent ? stepContent.innerHTML : 'null',
              navCount: stepNav ? stepNav.querySelectorAll('button').length : 0,
              versionCount: versionSelect ? versionSelect.querySelectorAll('option').length : 0
            };
          });

          if (!checkResults.contentValid) {
            const errText = `App state check failed: #builder-step-content is empty or missing. Content HTML: ${checkResults.contentHtml}`;
            console.error(`   [STATE ERROR] [${browserInfo.name} - ${vp.name}]:`, errText);
            testErrors.push(errText);
          }

          if (!checkResults.navValid) {
            const errText = `App state check failed: #builder-step-nav has no buttons (found ${checkResults.navCount}).`;
            console.error(`   [STATE ERROR] [${browserInfo.name} - ${vp.name}]:`, errText);
            testErrors.push(errText);
          }

          if (!checkResults.versionsValid) {
            const errText = `App state check failed: #game-version-select has no options (found ${checkResults.versionCount}).`;
            console.error(`   [STATE ERROR] [${browserInfo.name} - ${vp.name}]:`, errText);
            testErrors.push(errText);
          }

          if (!checkResults.builderBuildValid) {
            const errText = 'App state check failed: builder build version label is missing or incorrect.';
            console.error(`   [STATE ERROR] [${browserInfo.name} - ${vp.name}]:`, errText);
            testErrors.push(errText);
          }

          if (vp.name === 'Wide') {
            await runWideDashboardLayoutAssertions(page);
          }

          if (browserInfo.name.startsWith('Chromium') && vp.name === 'Desktop') {
            await runRulesRegressionAssertions(page);
          }

          if (vp.name === 'Mobile') {
            await runMobileChoiceOverlayAssertions(page, browserInfo.name);
            await runMobileQuickBuildDetailAssertions(page, browserInfo.name);
            await runMobileSheetAppAssertions(page, browserInfo.name);
          }

          // Take screenshot
          const safeBrowserName = browserInfo.name.split(' ')[0].toLowerCase();
          const fileName = `screenshot-${safeBrowserName}-${vp.name.toLowerCase()}.png`;
          const savePath = path.join(QA_DIR, fileName);
          await page.screenshot({ path: savePath });
          console.log(`   Captured: qa-test-results/${fileName}`);

          if (testErrors.length > 0 || missingResources.length > 0) {
            throw new Error(`Test failed with ${testErrors.length} console errors and ${missingResources.length} missing resources.`);
          }
        } catch (pageError) {
          console.error(`   Error during ${browserInfo.name} ${vp.name} test:`, pageError.message);
          if (pageError.stack) {
            console.error(pageError.stack);
          }
          testFailedGlobal = true;
        } finally {
          await closeWithTimeout(context, `${browserInfo.name} context`);
        }
      }
      await closeWithTimeout(browser, `${browserInfo.name} browser`);
    }
  } finally {
    // 3. Stop the local server
    console.log('\nStopping test server...');
    serverProcess.kill();

    // 4. Clean up temporary deployment folder
    console.log('Cleaning up mock deployment directory...');
    await fs.rm(DEPLOY_TEMP_DIR, { recursive: true, force: true }).catch(() => {});

    console.log('Cross-browser test execution completed.');
    console.log(`Review captured screenshots in: ${QA_DIR}`);

    if (testFailedGlobal) {
      console.error('\n[TEST FAILURE] One or more cross-browser layout tests failed! Check errors above.');
      process.exitCode = 1;
    } else {
      console.log('\n[TEST SUCCESS] All deployment artifact layout, network, and DOM assertions passed.');
    }
  }
}

function closeWithTimeout(closable, label, ms = 15000) {
  return Promise.race([
    closable.close().catch((error) => {
      console.error(`   Warning: ${label} close reported an error:`, error.message);
    }),
    new Promise((resolve) => setTimeout(() => {
      console.error(`   Warning: ${label} did not close within ${ms / 1000}s; continuing anyway.`);
      resolve();
    }, ms))
  ]);
}

main().catch((err) => {
  console.error('Test execution failed:', err);
  process.exitCode = 1;
}).finally(() => {
  setTimeout(() => process.exit(process.exitCode || 0), 500);
});
