#!/usr/bin/env node
/**
 * Recapture README product screenshots from the live demo.
 * Usage: node tools/capture-screenshots.mjs [baseUrl]
 */
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "screenshots");
const BASE = process.argv[2] || "https://stellar-celerity.me";

const FARMER = { width: 400, height: 846, deviceScaleFactor: 2 };
const FUNDER = { width: 1280, height: 900, deviceScaleFactor: 2 };
const LEDGER = { width: 1440, height: 900, deviceScaleFactor: 2 };

async function shot(page, name) {
  const dest = path.join(OUT, name);
  await page.waitForTimeout(350);
  await page.screenshot({ path: dest, type: "png" });
  console.log("✓", name);
}

async function dismissTour(page) {
  const skip = page.getByRole("button", { name: /skip|got it|done|close/i }).first();
  if (await skip.isVisible().catch(() => false)) {
    await skip.click().catch(() => {});
    await page.waitForTimeout(200);
  }
  // Force-complete in case the coach is mid-step.
  await page.evaluate(() => {
    try {
      localStorage.setItem("celerity.tour.farmer.v2", "1");
      localStorage.setItem("celerity.tour.funder.v2", "1");
    } catch {}
  });
}

async function seedStorage(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("celerity.tour.farmer.v2", "1");
      localStorage.setItem("celerity.tour.funder.v2", "1");
    } catch {}
  });
}

async function captureFarmer(browser) {
  const context = await browser.newContext({
    viewport: { width: FARMER.width, height: FARMER.height },
    deviceScaleFactor: FARMER.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await seedStorage(page);

  // Splash mid-sequence — don't wait for networkidle (splash is only ~3.2s)
  await page.goto(`${BASE}/?shotBalance=500`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector(".cel-splash", { timeout: 15000 });
  await page.waitForTimeout(1100);
  await shot(page, "01-farmer-splash.png");

  await page.waitForSelector("text=Is this you?", { timeout: 15000 });
  await page.waitForTimeout(500);
  await shot(page, "02-farmer-connect.png");

  await page.getByRole("button", { name: /Yes, this is me/i }).click();
  await page.waitForSelector("text=Available Balance", { timeout: 20000 });
  await dismissTour(page);
  await page.waitForTimeout(600);
  await shot(page, "03-farmer-home.png");

  await page.getByText("Relief Programs", { exact: true }).click();
  await page.waitForTimeout(400);
  await shot(page, "06-farmer-relief-programs.png");
  await page.getByRole("button", { name: "Back" }).click();
  await page.waitForTimeout(300);

  await page.getByText("Installments", { exact: true }).click();
  await page.waitForTimeout(400);
  await shot(page, "07-farmer-installments.png");
  await page.getByRole("button", { name: "Back" }).click();
  await page.waitForTimeout(300);

  await page.getByText("My Region", { exact: true }).click();
  await page.waitForTimeout(400);
  await shot(page, "08-farmer-my-region.png");
  await page.getByRole("button", { name: "Back" }).click();
  await page.waitForTimeout(300);

  await page.getByText("Help", { exact: true }).click();
  await page.waitForTimeout(400);
  await shot(page, "09-farmer-help.png");
  await page.getByRole("button", { name: "Back" }).click();
  await page.waitForTimeout(400);

  // Cash-out flow
  await page.getByRole("button", { name: /Cash out/i }).click();
  await page.waitForTimeout(400);
  await shot(page, "11-farmer-cashout-destination.png");

  await page.getByText("GCash", { exact: true }).click();
  await page.waitForTimeout(400);
  await shot(page, "12-farmer-cashout-recipient.png");

  const saved = page.locator("button").filter({ hasText: /09\d{9}|Mang Ramon|Maria/ }).first();
  if (await saved.isVisible().catch(() => false)) {
    await saved.click();
  } else {
    await page.getByText(/New number/i).click();
    await page.locator("input").first().fill("09171234567");
    await page.getByRole("button", { name: /Next/i }).click();
    await page.locator("input").first().fill("Mang Ramon");
    await page.getByRole("button", { name: /Next/i }).click();
  }
  await page.waitForTimeout(400);

  const amountInput = page.locator("input").first();
  if (await amountInput.isVisible().catch(() => false)) {
    await amountInput.fill("250");
  }
  await page.waitForTimeout(300);
  await shot(page, "13-farmer-cashout-amount.png");

  await page.getByRole("button", { name: /^Next$/i }).click();
  await page.waitForTimeout(500);
  await shot(page, "14-farmer-cashout-confirm.png");

  await page.getByRole("button", { name: /Send ₱/i }).click();
  await page.waitForSelector("text=/Done|sent|Success|on the way/i", { timeout: 25000 });
  await page.waitForTimeout(600);
  await shot(page, "15-farmer-cashout-success.png");

  await page.getByRole("button", { name: /^Done$/i }).click();
  await page.waitForTimeout(500);

  await page.getByRole("button", { name: "Activity" }).click();
  await page.waitForTimeout(600);
  await shot(page, "04-farmer-activity.png");

  const txRow = page.locator("button.cel-row").first();
  if (await txRow.isVisible().catch(() => false)) {
    await txRow.click();
    await page.waitForTimeout(500);
    await shot(page, "10-farmer-tx-detail.png");
    await page.getByRole("button", { name: "Back" }).click().catch(() => {});
  } else {
    console.warn("! no activity row for tx detail");
  }

  await page.getByRole("button", { name: "Profile" }).click();
  await page.waitForTimeout(500);
  await shot(page, "05-farmer-profile.png");

  await context.close();
}

async function goHome(page) {
  const back = page.getByRole("button", { name: "Back to home" });
  if (await back.isVisible().catch(() => false)) {
    await back.click();
    await page.waitForTimeout(400);
    return;
  }
  await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Back to home"]');
    if (btn) btn.click();
  });
  await page.waitForTimeout(400);
}

async function clickQuick(page, re) {
  await page.evaluate((pattern) => {
    const rx = new RegExp(pattern, "i");
    const btns = [...document.querySelectorAll("button")];
    const hit = btns.find((b) => rx.test((b.textContent || "").trim()));
    if (hit) hit.click();
  }, re.source || re);
  await page.waitForTimeout(700);
}

async function captureFunder(browser) {
  const context = await browser.newContext({
    viewport: { width: FUNDER.width, height: FUNDER.height },
    deviceScaleFactor: FUNDER.deviceScaleFactor,
  });
  const page = await context.newPage();
  await seedStorage(page);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 90000 });

  await page.waitForSelector("text=Is this you?", { timeout: 20000 });
  await page.getByRole("button", { name: /Yes, this is me/i }).click();
  await page.waitForSelector("text=Available Balance", { timeout: 20000 });
  await dismissTour(page);

  await page.getByRole("button", { name: "Open funder console" }).click();
  await page.waitForSelector("text=Funder console", { timeout: 15000 });
  await page.waitForTimeout(500);
  await shot(page, "16-funder-login.png");

  await page.getByRole("button", { name: "Log in →" }).first().click();
  await page.waitForSelector("text=Still escrowed", { timeout: 25000 });
  await dismissTour(page);
  await page.waitForTimeout(800);
  await shot(page, "17-funder-summary.png");

  await page.getByText(/New Escrow Pool/i).first().click();
  await page.waitForTimeout(500);
  await shot(page, "19-funder-create-pool-modal.png");
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(400);

  await clickQuick(page, "My Pools");
  await page.waitForTimeout(500);
  await shot(page, "18-funder-pools.png");

  const topUp = page.getByRole("button", { name: /Top-?up/i }).first();
  if (await topUp.isVisible().catch(() => false)) {
    await topUp.click();
    await page.waitForTimeout(500);
    await shot(page, "20-funder-topup-modal.png");
    await page.getByRole("button", { name: "Cancel" }).click().catch(async () => {
      await page.keyboard.press("Escape");
    });
    await page.waitForTimeout(300);
  }

  await goHome(page);
  await clickQuick(page, "Farmers \\(LGU\\)");
  await shot(page, "21-funder-farmers.png");

  const lguSwitch = page.locator('input[type="checkbox"]').first();
  if (await lguSwitch.isVisible().catch(() => false)) {
    await lguSwitch.check({ force: true });
    await page.waitForTimeout(500);
    await shot(page, "22-funder-farmers-lgu-mode.png");
  }

  await goHome(page);
  await clickQuick(page, "Trigger Typhoon");
  await shot(page, "23-funder-trigger-empty.png");

  await page.getByText(/Load the sample bulletin/i).click();
  await page.waitForTimeout(700);
  await shot(page, "24-funder-trigger-parsed.png");

  await page.getByText(/Manual fallback/i).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shot(page, "25-funder-trigger-manual-fallback.png");

  await goHome(page);
  await clickQuick(page, "^Ledger$");
  await shot(page, "26-funder-ledger.png");

  await goHome(page);
  await clickQuick(page, "Settings");
  await shot(page, "27-funder-settings.png");

  await context.close();

  const ledgerCtx = await browser.newContext({
    viewport: { width: LEDGER.width, height: LEDGER.height },
    deviceScaleFactor: LEDGER.deviceScaleFactor,
  });
  const ledgerPage = await ledgerCtx.newPage();
  await seedStorage(ledgerPage);
  await ledgerPage.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 90000 });
  await ledgerPage.waitForSelector("text=Is this you?", { timeout: 20000 });
  await ledgerPage.getByRole("button", { name: /Yes, this is me/i }).click();
  await ledgerPage.waitForSelector("text=Available Balance", { timeout: 20000 });
  await dismissTour(ledgerPage);
  await ledgerPage.getByRole("button", { name: "Open funder console" }).click();
  await ledgerPage.waitForSelector("text=Funder console", { timeout: 15000 });
  await ledgerPage.getByRole("button", { name: "Log in →" }).first().click();
  await ledgerPage.waitForSelector("text=Still escrowed", { timeout: 25000 });
  await dismissTour(ledgerPage);
  await ledgerPage.getByRole("button", { name: /Public Ledger/i }).click();
  await ledgerPage.waitForTimeout(1800);
  await shot(ledgerPage, "28-transparency-ledger.png");
  await ledgerCtx.close();
}

const only = process.argv[3]; // optional: farmer | funder
const browser = await chromium.launch({ headless: true });
try {
  console.log("Capturing from", BASE, only || "all");
  if (!only || only === "farmer") await captureFarmer(browser);
  if (!only || only === "funder") await captureFunder(browser);
  console.log("Done →", OUT);
} finally {
  await browser.close();
}
