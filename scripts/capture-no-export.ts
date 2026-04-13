/**
 * キャプチャスクリプト（エクスポートフェーズをスキップ）
 */
import { chromium, Page, Browser } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

interface Config {
  stagingUrl: string;
  apiUser: string;
  apiPassword: string;
  basicAuthUser?: string;
  basicAuthPass?: string;
  classicTheme: string;
  fseTheme: string;
  outputDir: string;
}

interface CaptureUrl {
  name: string;
  url: string;
  type: string;
}

interface Viewport {
  name: string;
  width: number;
  height: number;
}

const VIEWPORTS: Viewport[] = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 812 },
];

function getAuthHeaders(config: Config): Record<string, string> {
  const token = Buffer.from(`${config.apiUser}:${config.apiPassword}`).toString('base64');
  return { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' };
}

async function apiGet<T>(config: Config, endpoint: string): Promise<T> {
  const url = `${config.stagingUrl}/wp-json/fse-conversion/v1/${endpoint}`;
  const res = await fetch(url, { headers: getAuthHeaders(config) });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function apiPost<T>(config: Config, endpoint: string, body: Record<string, unknown>): Promise<T> {
  const url = `${config.stagingUrl}/wp-json/fse-conversion/v1/${endpoint}`;
  const res = await fetch(url, { method: 'POST', headers: getAuthHeaders(config), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function switchTheme(config: Config, stylesheet: string): Promise<void> {
  console.log(`  Switching theme to: ${stylesheet}`);
  await apiPost(config, 'switch-theme', { stylesheet });
  await new Promise(resolve => setTimeout(resolve, 3000));
}

async function capturePage(page: Page, captureUrl: CaptureUrl, viewport: Viewport, outputDir: string): Promise<void> {
  try {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(captureUrl.url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1500);

    const baseName = `${captureUrl.name}_${viewport.name}`;

    await page.screenshot({ path: path.join(outputDir, `${baseName}.png`), fullPage: true });

    // Try __FCH_STYLES first; if empty (e.g. FSE theme selectors differ), fall back to
    // direct getComputedStyle() evaluation so both classic and FSE are compared fairly.
    const styles = await page.evaluate(() => {
      const injected = (window as any).__FCH_STYLES;
      if (injected && Object.keys(injected).length > 0) return injected;

      const SELECTORS = [
        'body',
        'header', '.site-header', '#masthead',
        'footer', '.site-footer', '#colophon',
        'main', '.site-main', '#primary', '#content',
        'aside', '.widget-area', '#secondary',
        'nav', '.main-navigation', '.wp-block-navigation',
        'h1', 'h2', 'h3', 'h4', 'h5', 'p', 'a',
        '.entry-title', '.entry-content', '.entry-meta',
        '.widget', '.widget-title',
        'button', '.wp-block-button__link',
        'input[type="search"]',
        '.wp-block-columns', '.wp-block-column',
        // FSE theme custom classes
        '.antimall-header', '.antimall-topbar', '.antimall-bottom-bar',
        '.antimall-footer', '.antimall-footer-top', '.antimall-footer-abs',
        '.antimall-page-title-wrap', '.antimall-content-wrap', '.antimall-sidebar',
      ];

      const PROPS = [
        'font-family', 'font-size', 'font-weight', 'line-height', 'color',
        'background-color',
        'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
        'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
        'display', 'position', 'max-width', 'width',
      ];

      const result: Record<string, Record<string, string>> = {};

      for (const sel of SELECTORS) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const cs = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const props: Record<string, string> = {};
        for (const p of PROPS) props[p] = cs.getPropertyValue(p).trim();
        props['__rect_x']      = String(Math.round(rect.x));
        props['__rect_y']      = String(Math.round(rect.y));
        props['__rect_width']  = String(Math.round(rect.width));
        props['__rect_height'] = String(Math.round(rect.height));
        result[sel] = props;
      }

      return result;
    });
    fs.writeFileSync(path.join(outputDir, `${baseName}_styles.json`), JSON.stringify(styles, null, 2));

    console.log(`  ✓ ${captureUrl.name} @ ${viewport.name}`);
  } catch (err) {
    console.error(`  ✗ ${captureUrl.name} @ ${viewport.name}: ${err}`);
  }
}

async function captureAll(browser: Browser, config: Config, captureUrls: CaptureUrl[], label: string): Promise<void> {
  const outputDir = path.join(config.outputDir, label);
  fs.mkdirSync(outputDir, { recursive: true });

  const contextOptions: Record<string, unknown> = {};
  if (config.basicAuthUser && config.basicAuthPass) {
    contextOptions.httpCredentials = { username: config.basicAuthUser, password: config.basicAuthPass };
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  console.log(`\n=== Capturing: ${label} (${captureUrls.length} pages × ${VIEWPORTS.length} viewports) ===`);
  for (const captureUrl of captureUrls) {
    for (const viewport of VIEWPORTS) {
      await capturePage(page, captureUrl, viewport, outputDir);
    }
  }

  await context.close();
}

async function main(): Promise<void> {
  const config: Config = JSON.parse(fs.readFileSync('./capture-config.json', 'utf-8'));
  config.outputDir = config.outputDir || './visual-diff';

  console.log('=== Site Info ===');
  const siteInfo = await apiGet<Record<string, unknown>>(config, 'site-info');
  console.log(`  URL: ${siteInfo.site_url}`);
  console.log(`  Theme: ${(siteInfo.active_theme as any).name}`);

  const captureUrls = (await apiGet<{ urls: CaptureUrl[] }>(config, 'capture-urls')).urls;
  console.log(`\n=== Found ${captureUrls.length} pages ===`);
  captureUrls.forEach(u => console.log(`  - ${u.name}: ${u.url}`));

  // Computed Style injection
  await apiPost(config, 'computed-style-injection', { enabled: true });
  console.log('\n  Style injection enabled');

  const browser = await chromium.launch();

  try {
    await switchTheme(config, config.classicTheme);
    await captureAll(browser, config, captureUrls, 'classic');

    await switchTheme(config, config.fseTheme);
    await captureAll(browser, config, captureUrls, 'fse');

  } finally {
    await browser.close();
    await apiPost(config, 'computed-style-injection', { enabled: false });
    await switchTheme(config, config.classicTheme);
    console.log('\n  Restored classic theme');
  }

  console.log('\n=== Capture Complete ===');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
