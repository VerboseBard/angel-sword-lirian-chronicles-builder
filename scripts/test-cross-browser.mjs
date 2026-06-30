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

// Exclusions list matching deploy-pages.yml
const EXCLUDED_NAMES = new Set([
  '.git',
  '.github',
  'node_modules',
  'dist',
  'qa-test-results',
  'scripts',
  'deploy-temp-dist',
  'vite.config.js',
  'package.json',
  'package-lock.json',
  'runtime',
  'diagnostics'
]);

const EXCLUDED_EXTENSIONS = new Set([
  '.zip',
  '.7z',
  '.rar'
]);

async function copyDirectory(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (EXCLUDED_NAMES.has(entry.name)) {
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (EXCLUDED_EXTENSIONS.has(ext)) {
      continue;
    }

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
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
        buildLabel: document.querySelector('.builder-build-version')?.textContent || ''
      };
    });

    const startupIsValid = result.dataVersion === '0.13.0'
      && result.selectedVersion === '0.13.0'
      && result.versionCount >= 3
      && result.cardCount > 0
      && result.navCount > 0
      && result.summaryText.includes('Identity')
      && result.buildLabel.includes('Beta 1.4');

    if (!startupIsValid || errors.length || failedFileRequests.length) {
      throw new Error(`Direct file startup regression failed: ${JSON.stringify({ result, errors, failedFileRequests }, null, 2)}`);
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('--- Initializing Cross-Browser Testing against Deployment Artifact ---');
  await fs.mkdir(QA_DIR, { recursive: true });
  await assertDiceRollerHasNoPageDimmingPlane();

  // 1. Replicate the GitHub Pages deployment artifact copy
  console.log(`Replicating deployment artifact in ${DEPLOY_TEMP_DIR}...`);
  await fs.rm(DEPLOY_TEMP_DIR, { recursive: true, force: true }).catch(() => {});
  await copyDirectory(PROJECT_ROOT, DEPLOY_TEMP_DIR);
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

  async function runRulesRegressionAssertions(page) {
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
      summaryEquipmentLayout.titles.join('|') !== 'Identity|Stats|Skills|Classes|Breakthroughs|Equipment' ||
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
      const money = box('#play-derived-grid .play-tracker-money');
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
        money,
        resources,
        senses,
        mainStat,
        secondaryStat,
        healthIsWideAndThin: Boolean(health && health.width >= 600 && health.height <= 210),
        healthSitsRightOfResources: Boolean(health && resources && health.x >= resources.right + 8),
        moneySitsAboveResources: Boolean(money && resources && money.bottom <= resources.y - 8 && Math.abs(money.x - resources.x) <= 8 && Math.abs(money.right - resources.right) <= 8),
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
        healthAvoidsMoney: !overlaps(health, money),
        utilityAvoidsSenses: !overlaps(utility, senses)
      };
    });

    if (
      !layout.healthIsWideAndThin ||
      !layout.healthSitsRightOfResources ||
      !layout.moneySitsAboveResources ||
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
      !layout.healthAvoidsMoney ||
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
          if (url.includes(`127.0.0.1:${PORT}`) || url.includes(`localhost:${PORT}`)) {
            console.error(`   [REQUEST FAILED] [${browserInfo.name} - ${vp.name}]:`, url);
            missingResources.push(url);
          }
        });

        // Track HTTP status failures (404, 500, etc.)
        page.on('response', (response) => {
          const status = response.status();
          const url = response.url();
          if (status >= 400 && (url.includes(`127.0.0.1:${PORT}`) || url.includes(`localhost:${PORT}`))) {
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
            const builderBuildValid = builderBuildVersion && builderBuildVersion.textContent.includes('Beta 1.4');

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
          testFailedGlobal = true;
        } finally {
          await context.close();
        }
      }
      await browser.close();
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

main().catch((err) => {
  console.error('Test execution failed:', err);
  process.exitCode = 1;
});
