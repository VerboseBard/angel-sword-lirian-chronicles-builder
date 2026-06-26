import { chromium, firefox, webkit } from 'playwright';
import { fork } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

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

async function main() {
  console.log('--- Initializing Cross-Browser Testing against Deployment Artifact ---');
  await fs.mkdir(QA_DIR, { recursive: true });

  // 1. Replicate the GitHub Pages deployment artifact copy
  console.log(`Replicating deployment artifact in ${DEPLOY_TEMP_DIR}...`);
  await fs.rm(DEPLOY_TEMP_DIR, { recursive: true, force: true }).catch(() => {});
  await copyDirectory(PROJECT_ROOT, DEPLOY_TEMP_DIR);
  await fs.writeFile(path.join(DEPLOY_TEMP_DIR, '.nojekyll'), '', 'utf8');

  let testFailedGlobal = false;

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
    { name: 'Desktop', width: 1280, height: 800 },
    { name: 'Mobile', width: 390, height: 844 } // iPhone 13/14 viewport simulation
  ];

  const browsers = [
    { name: 'Chromium (Chrome-Edge)', type: chromium },
    { name: 'Firefox', type: firefox },
    { name: 'WebKit (Safari)', type: webkit }
  ];

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

            const contentValid = stepContent && stepContent.children.length > 0 && stepContent.textContent.trim().length > 0;
            const navValid = stepNav && stepNav.querySelectorAll('button').length > 0;
            const versionsValid = versionSelect && versionSelect.querySelectorAll('option').length > 0;

            return {
              contentValid,
              navValid,
              versionsValid,
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
