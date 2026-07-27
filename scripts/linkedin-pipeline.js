#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const workspaceRoot = process.cwd();
const ledgerPath = path.join(workspaceRoot, 'outputs', 'linkedin-outbound-ledger.json');
/results/people/?keywords=Marketing%20Director%20OR%20Brand%20Manager&locationByGeoUrn=%5B%22100732083%22%5D&origin=FACETED_SEARCH";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay() {
  return Math.floor(Math.random() * 76) + 45;
}

function ensureLedger() {
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  if (!fs.existsSync(ledgerPath)) {
    fs.writeFileSync(ledgerPath, JSON.stringify({ generatedAt: new Date().toISOString(), profiles: [], completedConnections: [], manualChecks: [] }, null, 2));
  }
}

function loadLedger() {
  ensureLedger();
  return JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
}

function saveLedger(ledger) {
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
}

async function main() {
  ensureLedger();
  const ledger = loadLedger();

  console.log(`LinkedIn outbound pipeline initialized. Dry run: ${dryRun}`);
  console.log(`Search URL: ${searchUrl}`);

  if (dryRun) {
    const placeholderProfiles = [
      { name: 'Sample Profile 1', title: 'Sales Development Representative', company: 'Example Co' },
      { name: 'Sample Profile 2', title: 'Business Development Representative', company: 'Example Labs' },
      { name: 'Sample Profile 3', title: 'Account Executive', company: 'Growth Ventures' },
    ];

    const existing = ledger.profiles || [];
    const merged = [...existing, ...placeholderProfiles.slice(0, 3).map((profile, index) => ({ ...profile, id: existing.length + index + 1 }))];
    ledger.profiles = merged;
    ledger.completedConnections = ledger.completedConnections || [];
    ledger.manualChecks = ledger.manualChecks || [];
    saveLedger(ledger);
    console.log(`Dry-run ledger saved to ${ledgerPath}`);
    return;
  }

  try {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: false, channel: 'chrome' });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1200 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(randomDelay() * 1000);

    const profiles = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('li, .entity-result, .reusable-search__result-container'));
      return cards.slice(0, 10).map((card) => {
        const name = card.querySelector('a, .app-aware-link, .entity-result__title-text a')?.textContent?.trim() || 'Unknown';
        const title = card.querySelector('.entity-result__primary-subtitle, .entity-result__secondary-subtitle, .t-14.t-normal')?.textContent?.trim() || 'Unknown';
        const company = card.querySelector('.entity-result__secondary-subtitle, .entity-result__subtitle, .entity-result__primary-subtitle')?.textContent?.trim() || 'Unknown';
        return { name, title, company };
      });
    });

    ledger.profiles = profiles.slice(0, 10).map((profile, index) => ({ ...profile, id: index + 1 }));
    ledger.completedConnections = ledger.completedConnections || [];
    ledger.manualChecks = ledger.manualChecks || [];
    saveLedger(ledger);

    for (const profile of ledger.profiles) {
      await page.waitForTimeout(randomDelay() * 1000);
      console.log(`Preparing connection for ${profile.name}`);
      const connectionButton = page.locator('text=Connect').first();
      if (await connectionButton.count()) {
        await connectionButton.click();
        const sendWithoutNote = page.locator('text=Send without a note').first();
        if (await sendWithoutNote.count()) {
          await sendWithoutNote.click();
          ledger.completedConnections.push({ name: profile.name, company: profile.company, status: 'connected' });
          saveLedger(ledger);
          console.log(`Connected with ${profile.name}`);
        } else {
          ledger.manualChecks.push({ name: profile.name, company: profile.company, reason: 'Connect modal did not expose expected action' });
          saveLedger(ledger);
          console.log(`Manual review required for ${profile.name}`);
        }
      } else {
        ledger.manualChecks.push({ name: profile.name, company: profile.company, reason: 'No Connect action available' });
        saveLedger(ledger);
        console.log(`Manual review required for ${profile.name}`);
      }
    }

    await browser.close();
  } catch (error) {
    console.error('LinkedIn automation failed:', error.message);
    process.exitCode = 1;
  }
}

main();
