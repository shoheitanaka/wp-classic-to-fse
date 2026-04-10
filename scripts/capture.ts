/**
 * Playwright キャプチャスクリプト（ステージング環境対応）
 *
 * ステージングサイトのREST APIからキャプチャ対象URLを取得し、
 * Classic / FSE 両状態のスクリーンショット + Computed Style を収集する。
 */
import { chromium, Page, Browser, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// ─── 設定 ───

interface Config {
  stagingUrl: string;       // e.g. "https://staging.example.com"
  apiUser: string;          // WordPress Application Password ユーザー
  apiPassword: string;      // WordPress Application Password
  basicAuthUser?: string;   // ステージングの Basic認証ユーザー（任意）
  basicAuthPass?: string;   // ステージングの Basic認証パスワード（任意）
  classicTheme: string;     // クラシックテーマの stylesheet 名
  fseTheme: string;         // FSE テーマの stylesheet 名
  outputDir: string;
}

interface CaptureUrl {
  name: string;
  url: string;
  type: string;
  template?: string;
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

// ─── API ヘルパー ───

function getAuthHeaders(config: Config): Record<string, string> {
  const token = Buffer.from(`${config.apiUser}:${config.apiPassword}`).toString('base64');
  return {
    'Authorization': `Basic ${token}`,
    'Content-Type': 'application/json',
  };
}

async function apiGet<T>(config: Config, endpoint: string): Promise<T> {
  const url = `${config.stagingUrl}/wp-json/fse-conversion/v1/${endpoint}`;
  const res = await fetch(url, { headers: getAuthHeaders(config) });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function apiPost<T>(config: Config, endpoint: string, body: Record<string, unknown>): Promise<T> {
  const url = `${config.stagingUrl}/wp-json/fse-conversion/v1/${endpoint}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(config),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function switchTheme(config: Config, stylesheet: string): Promise<void> {
  console.log(`  Switching theme to: ${stylesheet}`);
  await apiPost(config, 'switch-theme', { stylesheet });
  // テーマ切替後のキャッシュクリア待ち
  await new Promise(resolve => setTimeout(resolve, 2000));
}

async function enableStyleInjection(config: Config): Promise<void> {
  await apiPost(config, 'computed-style-injection', { enabled: true });
}

async function disableStyleInjection(config: Config): Promise<void> {
  await apiPost(config, 'computed-style-injection', { enabled: false });
}

async function getCaptureUrls(config: Config): Promise<CaptureUrl[]> {
  const data = await apiGet<{ urls: CaptureUrl[] }>(config, 'capture-urls');
  return data.urls;
}

// ─── キャプチャ ───

async function capturePage(
  page: Page,
  captureUrl: CaptureUrl,
  viewport: Viewport,
  outputDir: string,
): Promise<void> {
  try {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(captureUrl.url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1000); // レンダリング安定待ち

    const baseName = `${captureUrl.name}_${viewport.name}`;

    // スクリーンショット
    await page.screenshot({
      path: path.join(outputDir, `${baseName}.png`),
      fullPage: true,
    });

    // Computed Style 取得（プラグイン注入スクリプトから）
    const styles = await page.evaluate(() => {
      return (window as unknown as { __FCH_STYLES?: Record<string, Record<string, string>> }).__FCH_STYLES || {};
    });
    fs.writeFileSync(
      path.join(outputDir, `${baseName}_styles.json`),
      JSON.stringify(styles, null, 2),
    );

    console.log(`  ✓ ${captureUrl.name} @ ${viewport.name}`);
  } catch (err) {
    console.error(`  ✗ ${captureUrl.name} @ ${viewport.name}: ${err}`);
  }
}

async function captureAll(
  browser: Browser,
  config: Config,
  captureUrls: CaptureUrl[],
  label: string,
): Promise<void> {
  const outputDir = path.join(config.outputDir, label);
  fs.mkdirSync(outputDir, { recursive: true });

  // Basic認証があればcontextに設定
  const contextOptions: Record<string, unknown> = {};
  if (config.basicAuthUser && config.basicAuthPass) {
    contextOptions.httpCredentials = {
      username: config.basicAuthUser,
      password: config.basicAuthPass,
    };
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

// ─── メイン ───

async function main(): Promise<void> {
  // 設定ファイルから読み込み
  const configPath = process.argv[2] || './capture-config.json';
  if (!fs.existsSync(configPath)) {
    console.error(`Config file not found: ${configPath}`);
    console.error('Create capture-config.json with stagingUrl, apiUser, apiPassword, classicTheme, fseTheme');
    process.exit(1);
  }

  const config: Config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  config.outputDir = config.outputDir || './visual-diff';

  // Phase 1: サイト情報確認
  console.log('=== Site Info ===');
  const siteInfo = await apiGet<Record<string, unknown>>(config, 'site-info');
  console.log(`  URL: ${siteInfo.site_url}`);
  console.log(`  Theme: ${(siteInfo.active_theme as Record<string, unknown>).name}`);
  console.log(`  Block theme: ${(siteInfo.active_theme as Record<string, unknown>).is_block}`);

  // Phase 2: カスタマイザー設定を保存（theme.json生成インプット用）
  console.log('\n=== Exporting Customizer Settings ===');
  const customizer = await apiGet<Record<string, unknown>>(config, 'customizer-export');
  const widgets = await apiGet<unknown>(config, 'widgets-export');
  const menus = await apiGet<unknown>(config, 'menus-export');
  const sidebars = await apiGet<unknown>(config, 'sidebars-export');

  const exportDir = path.join(config.outputDir, 'exports');
  fs.mkdirSync(exportDir, { recursive: true });
  fs.writeFileSync(path.join(exportDir, 'customizer.json'), JSON.stringify(customizer, null, 2));
  fs.writeFileSync(path.join(exportDir, 'widgets.json'), JSON.stringify(widgets, null, 2));
  fs.writeFileSync(path.join(exportDir, 'menus.json'), JSON.stringify(menus, null, 2));
  fs.writeFileSync(path.join(exportDir, 'sidebars.json'), JSON.stringify(sidebars, null, 2));
  console.log('  Exported to:', exportDir);

  // Phase 3: キャプチャ対象URL取得
  const captureUrls = await getCaptureUrls(config);
  console.log(`\n=== Found ${captureUrls.length} pages to capture ===`);
  captureUrls.forEach(u => console.log(`  - ${u.name}: ${u.url}`));

  // Phase 4: Computed Style 注入有効化
  await enableStyleInjection(config);

  const browser = await chromium.launch();

  try {
    // Phase 5: Classic テーマでキャプチャ
    await switchTheme(config, config.classicTheme);
    await captureAll(browser, config, captureUrls, 'classic');

    // Phase 6: FSE テーマでキャプチャ
    await switchTheme(config, config.fseTheme);
    await captureAll(browser, config, captureUrls, 'fse');

  } finally {
    await browser.close();
    // Computed Style 注入無効化
    await disableStyleInjection(config);
    // テーマを元に戻す
    await switchTheme(config, config.classicTheme);
  }

  console.log('\n=== Capture Complete ===');
  console.log(`Output: ${config.outputDir}`);
  console.log('Next: Run diff script to analyze differences.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
