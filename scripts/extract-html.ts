/**
 * HTML-First Extraction Script
 *
 * クラシックテーマの実レンダリングHTMLと計算済みスタイルを取得し、
 * FSE変換の「設計図」として visual-diff/html/classic/ に保存する。
 *
 * Usage: npx tsx scripts/extract-html.ts
 * Output: visual-diff/html/classic/{page}.html
 *         visual-diff/html/classic/{page}-structure.json
 *         visual-diff/html/classic/{page}-guide.md
 *         visual-diff/html/classic/extraction-summary.md
 */

import { chromium, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ブラウザ注入スクリプト（tsx の __name 注入問題を回避するため別ファイル）
const BROWSER_SCRIPT = fs.readFileSync(path.join(__dirname, 'browser-extract.js'), 'utf-8');

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

// 抽出する要素セレクタ（存在する最初のものを使用）
const KEY_SELECTORS: Record<string, string[]> = {
  header:     ['header', '#masthead', '.site-header', '#header', '.header'],
  topbar:     ['.topbar', '.header-top', '.top-bar', '.antimall-topbar', '.header-top-area'],
  logo:       ['.site-logo', '.logo', '#logo', '.custom-logo-link', '.header-logo'],
  navigation: ['nav', '.main-navigation', '#site-navigation', '.nav-menu', '.primary-menu'],
  hero:       ['.hero', '.slider', '.rev_slider_wrapper', '.hero-area', '.banner', '#slider', '.tp-banner'],
  main:       ['main', '#primary', '.site-main', '#main', '.main-content'],
  content:    ['.entry-content', '#content', '.content-area', '.post-content'],
  sidebar:    ['aside', '#secondary', '.widget-area', '.sidebar', '.site-sidebar'],
  footer:     ['footer', '#colophon', '.site-footer', '#footer'],
  footer_nav: ['.footer-navigation', '.footer-menu', '.footer-nav'],
  copyright:  ['.site-info', '.copyright', '.footer-copyright', '.footer-bottom'],
};

function getAuthHeaders(config: Config): Record<string, string> {
  const token = Buffer.from(`${config.apiUser}:${config.apiPassword}`).toString('base64');
  return { Authorization: `Basic ${token}`, 'Content-Type': 'application/json' };
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
  await new Promise(resolve => setTimeout(resolve, 3000));
}

// browser-extract.js が window.__extractPageStructure を定義する
type PageStructure = Record<string, unknown>;

async function extractPageStructure(page: Page, url: string): Promise<PageStructure> {
  // ページロード前にブラウザスクリプトを注入（addInitScript は goto より前に呼ぶ）
  await page.addInitScript({ content: BROWSER_SCRIPT });

  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.evaluate('document.fonts.ready');
  await new Promise(resolve => setTimeout(resolve, 2000));

  // window.__extractPageStructure(selectors) を呼ぶだけ
  const selectorsJson = JSON.stringify(KEY_SELECTORS);
  return page.evaluate(`window.__extractPageStructure(${selectorsJson})`) as Promise<PageStructure>;
}

function buildGuideMarkdown(pageName: string, structure: PageStructure): string {
  const lines: string[] = [];
  const s = structure as any;

  lines.push(`# HTML 構造抽出: ${pageName}`);
  lines.push('');
  lines.push(`- **URL**: ${s.url}`);
  lines.push(`- **Title**: ${s.title}`);
  lines.push(`- **取得日時**: ${s.extractedAt}`);
  lines.push('');

  // Body スタイル
  lines.push('## Body スタイル（グローバル基準値）');
  lines.push('');
  lines.push('```css');
  lines.push('body {');
  const bodyKeys = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'color', 'backgroundColor'];
  for (const k of bodyKeys) {
    const v = s.bodyStyles?.[k];
    if (v) lines.push(`  ${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v};`);
  }
  lines.push('}');
  lines.push('```');
  lines.push('');
  lines.push(`**Body クラス**: \`${(s.bodyClasses || []).join(' ')}\``);
  lines.push('');

  // 各要素
  const elements = s.elements || {};
  for (const [key, info] of Object.entries(elements) as [string, any][]) {
    if (!info) continue;
    lines.push(`## ${key} 要素`);
    lines.push('');
    lines.push(`- **セレクタ**: \`${info.selector}\``);
    lines.push(`- **タグ**: \`${info.tagName}${info.id ? '#' + info.id : ''}${(info.classes || []).slice(0, 3).map((c: string) => '.' + c).join('')}\``);
    lines.push(`- **位置/サイズ**: x=${info.rect?.x}, y=${info.rect?.y}, w=${info.rect?.width}, h=${info.rect?.height}`);
    lines.push('');

    const keyStyleKeys = ['fontFamily', 'fontSize', 'color', 'backgroundColor', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'display', 'position', 'height'];
    const relevantStyles = keyStyleKeys.filter(k => info.styles?.[k]);
    if (relevantStyles.length > 0) {
      lines.push('**計算済みスタイル**:');
      lines.push('```css');
      for (const k of relevantStyles) {
        lines.push(`${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${info.styles[k]};`);
      }
      lines.push('```');
      lines.push('');
    }

    if ((info.children || []).length > 0) {
      lines.push('**直下の子要素**:');
      for (const child of info.children as any[]) {
        const tag = `${child.tagName}${child.id ? '#' + child.id : ''}${(child.classes || []).slice(0, 3).map((c: string) => '.' + c).join('')}`;
        const bg = child.styles?.backgroundColor;
        const h = child.styles?.height;
        const extras = [bg && bg !== 'rgba(0, 0, 0, 0)' ? `bg:${bg}` : '', h ? `h:${h}` : ''].filter(Boolean).join(', ');
        lines.push(`- \`${tag}\`${extras ? ' — ' + extras : ''}${child.innerText ? ' — ' + child.innerText.slice(0, 60) : ''}`);
      }
      lines.push('');
    }

    if (info.outerHTML) {
      const preview = info.outerHTML.slice(0, 600);
      lines.push('<details>');
      lines.push(`<summary>HTML プレビュー (${info.outerHTML.length} 文字)</summary>`);
      lines.push('');
      lines.push('```html');
      lines.push(preview + (info.outerHTML.length > 600 ? '\n<!-- ... -->' : ''));
      lines.push('```');
      lines.push('</details>');
      lines.push('');
    }
  }

  // ナビゲーション
  if ((s.navigation || []).length > 0) {
    lines.push('## ナビゲーション構造');
    lines.push('');
    for (const item of s.navigation as any[]) {
      lines.push(`- **${item.text}** → \`${item.href}\``);
      if ((item.children || []).length > 0) {
        for (const child of item.children as any[]) {
          lines.push(`  - ${child.text} → \`${child.href}\``);
        }
      }
    }
    lines.push('');
  }

  // CSS変数
  const cssVars = s.cssVariables || {};
  if (Object.keys(cssVars).length > 0) {
    lines.push('## CSS カスタムプロパティ');
    lines.push('');
    lines.push('```css');
    lines.push(':root {');
    for (const [k, v] of Object.entries(cssVars) as [string, string][]) {
      if (v) lines.push(`  ${k}: ${v};`);
    }
    lines.push('}');
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

/** パーツ要素（header / footer / sidebar）を詳細に出力する共通ヘルパー */
function renderPartSection(title: string, info: any, note?: string): string[] {
  const lines: string[] = [];
  if (!info) return lines;

  lines.push(`## ${title}`);
  lines.push('');
  if (note) { lines.push(`> ${note}`); lines.push(''); }

  lines.push(`- **セレクタ**: \`${info.selector}\``);
  lines.push(`- **タグ**: \`${info.tagName}${info.id ? '#' + info.id : ''}${(info.classes || []).map((c: string) => '.' + c).join('')}\``);
  lines.push(`- **実サイズ**: ${info.rect?.width}px × ${info.rect?.height}px`);
  lines.push('');

  // 主要スタイル
  const styleKeys = [
    'backgroundColor', 'color', 'fontFamily', 'fontSize', 'lineHeight',
    'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
    'display', 'position',
  ];
  const hasStyle = styleKeys.some(k => info.styles?.[k]);
  if (hasStyle) {
    lines.push('**計算済みスタイル**:');
    lines.push('```css');
    for (const k of styleKeys) {
      const v = info.styles?.[k];
      if (v) lines.push(`${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v};`);
    }
    lines.push('```');
    lines.push('');
  }

  // 直下の子要素（詳細）
  if ((info.children || []).length > 0) {
    lines.push('**直下の子要素（順序・スタイル）**:');
    lines.push('');
    lines.push('| # | 要素 | 背景色 | 高さ | テキスト |');
    lines.push('|---|------|--------|------|---------|');
    (info.children as any[]).forEach((child: any, i: number) => {
      const tag = `${child.tagName}${child.id ? '#' + child.id : ''}${(child.classes || []).slice(0, 4).map((c: string) => '.' + c).join('')}`;
      const bg = child.styles?.backgroundColor || '';
      const h = child.styles?.height || '';
      const text = (child.innerText || '').replace(/\n/g, ' ').slice(0, 50);
      lines.push(`| ${i + 1} | \`${tag}\` | ${bg} | ${h} | ${text} |`);
    });
    lines.push('');
  }

  // HTML プレビュー
  if (info.outerHTML) {
    lines.push('<details>');
    lines.push(`<summary>HTML プレビュー (${info.outerHTML.length} 文字)</summary>`);
    lines.push('');
    lines.push('```html');
    lines.push(info.outerHTML.slice(0, 800) + (info.outerHTML.length > 800 ? '\n<!-- ... -->' : ''));
    lines.push('```');
    lines.push('</details>');
    lines.push('');
  }

  return lines;
}

function buildSummaryMarkdown(pages: { name: string; structure: PageStructure }[]): string {
  const lines: string[] = [];
  lines.push('# HTML 抽出サマリー — Claude 変換時の参照ガイド');
  lines.push('');
  lines.push('> このファイルを変換作業の **第一参照** として使用すること。');
  lines.push('> PHPコードの解釈ではなく、実際のDOMとスタイルに基づいてFSEブロックを設計する。');
  lines.push('');

  // front-page をメイン参照とする（ヘッダー・フッターが必ず含まれる）
  const frontPage = pages.find(p => p.name === 'front-page') || pages[0];
  // サイドバーはサイドバーがある最初のページから取得
  const sidebarPage = pages.find(p => (p.structure as any)?.elements?.sidebar)
    || pages.find(p => p.name === 'single-with-thumbnail')
    || pages.find(p => p.name === 'category-news');

  const bs = (frontPage?.structure as any)?.bodyStyles || {};

  // ─── 1. グローバルスタイル ───────────────────────────────────────
  lines.push('## 1. グローバルスタイル基準値');
  lines.push('');
  lines.push('> theme.json `styles.typography` / `styles.color` の値はこれに合わせること。');
  lines.push('');
  lines.push('```css');
  lines.push('body {');
  const bodyKeys = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'color', 'backgroundColor'];
  for (const k of bodyKeys) {
    if (bs[k]) lines.push(`  ${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${bs[k]};`);
  }
  lines.push('}');
  lines.push('```');
  lines.push('');
  lines.push(`**Body クラス** (front-page): \`${((frontPage?.structure as any)?.bodyClasses || []).join(' ')}\``);
  lines.push('');

  // ─── 2. ページ別 要素検出テーブル ────────────────────────────────
  lines.push('## 2. ページ別 要素検出状況');
  lines.push('');
  lines.push('| 要素 | ' + pages.map(p => p.name).join(' | ') + ' |');
  lines.push('|------|' + pages.map(() => '------').join('|') + '|');
  for (const key of Object.keys(KEY_SELECTORS)) {
    const cells = pages.map(p => {
      const el = (p.structure as any)?.elements?.[key];
      return el ? `✅ \`${el.selector}\`` : '—';
    });
    lines.push(`| **${key}** | ${cells.join(' | ')} |`);
  }
  lines.push('');

  // ─── 3. ヘッダー ────────────────────────────────────────────────
  const headerInfo = (frontPage?.structure as any)?.elements?.header;
  lines.push(...renderPartSection(
    '3. ヘッダー (parts/header.html)',
    headerInfo,
    'front-page の実DOMから取得。FSE parts/header.html の設計基準として使用する。',
  ));

  // ─── 4. フッター ────────────────────────────────────────────────
  const footerInfo = (frontPage?.structure as any)?.elements?.footer;
  lines.push(...renderPartSection(
    '4. フッター (parts/footer.html)',
    footerInfo,
    'front-page の実DOMから取得。FSE parts/footer.html の設計基準として使用する。',
  ));

  // ─── 5. サイドバー ──────────────────────────────────────────────
  const sidebarInfo = (sidebarPage?.structure as any)?.elements?.sidebar;
  lines.push(...renderPartSection(
    `5. サイドバー (parts/sidebar.html) — "${sidebarPage?.name || '未検出'}" ページより`,
    sidebarInfo,
    'サイドバーが存在するページの実DOMから取得。FSE parts/sidebar.html の設計基準として使用する。',
  ));

  if (!sidebarInfo) {
    lines.push('## 5. サイドバー');
    lines.push('');
    lines.push('> サイドバーがどのページでも検出されませんでした。サイドバーなしテーマの可能性があります。');
    lines.push('');
  }

  // サイドバー有無のページ一覧
  const withSidebar = pages.filter(p => (p.structure as any)?.elements?.sidebar).map(p => p.name);
  const withoutSidebar = pages.filter(p => !(p.structure as any)?.elements?.sidebar).map(p => p.name);
  if (withSidebar.length > 0 || withoutSidebar.length > 0) {
    lines.push('**サイドバー有無**:');
    lines.push(`- あり: ${withSidebar.join(', ') || 'なし'}`);
    lines.push(`- なし: ${withoutSidebar.join(', ') || 'なし'}`);
    lines.push('');
    lines.push('> サイドバーなしのページには `page-no-sidebar.html` / `single-no-sidebar.html` テンプレートを使用すること。');
    lines.push('');
  }

  // ─── 6. ナビゲーション ──────────────────────────────────────────
  const nav = (frontPage?.structure as any)?.navigation || [];
  if (nav.length > 0) {
    lines.push('## 6. ナビゲーション メニュー項目');
    lines.push('');
    lines.push('> FSE NavigationブロックのメニューIDはPHPコードまたはMCPで確認すること。');
    lines.push('');
    for (const item of nav as any[]) {
      const subs = (item.children || []) as any[];
      lines.push(`- **${item.text}**${subs.length > 0 ? ` (子メニュー ${subs.length}件)` : ''} → \`${item.href}\``);
      for (const sub of subs) {
        lines.push(`  - ${sub.text} → \`${sub.href}\``);
      }
    }
    lines.push('');
  }

  // ─── 7. FSEブロック変換マッピング ───────────────────────────────
  lines.push('## 7. FSEブロック変換マッピング（実DOM基準）');
  lines.push('');
  lines.push('| 実DOM要素 | 推奨FSEブロック | 備考 |');
  lines.push('|-----------|----------------|------|');
  const elems = (frontPage?.structure as any)?.elements || {};
  if (elems.header)     lines.push(`| \`${elems.header.selector}\` | \`wp:template-part {"slug":"header"}\` | ヘッダーパーツ |`);
  if (elems.navigation) lines.push(`| \`${elems.navigation.selector}\` | \`wp:navigation {"ref":ID}\` | DBのナビID確認必要 |`);
  if (elems.hero)       lines.push(`| \`${elems.hero.selector}\` | \`wp:cover\` or \`wp:group\` | 要手動再構築 |`);
  if (elems.main)       lines.push(`| \`${elems.main.selector}\` | \`wp:query\` / \`wp:post-content\` | ページ種別で分岐 |`);
  const sidebarEl = (sidebarPage?.structure as any)?.elements?.sidebar;
  if (sidebarEl)        lines.push(`| \`${sidebarEl.selector}\` | \`wp:template-part {"slug":"sidebar"}\` | サイドバーパーツ |`);
  if (elems.footer)     lines.push(`| \`${elems.footer.selector}\` | \`wp:template-part {"slug":"footer"}\` | フッターパーツ |`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`生成日時: ${new Date().toISOString()}`);

  return lines.join('\n');
}

async function extractPage(
  page: Page,
  captureUrl: CaptureUrl,
  outputDir: string,
): Promise<{ name: string; structure: PageStructure }> {
  console.log(`  Extracting: ${captureUrl.name}`);

  const structure = await extractPageStructure(page, captureUrl.url);

  // フルHTMLを保存
  const fullHtml = await page.content();
  fs.writeFileSync(path.join(outputDir, `${captureUrl.name}.html`), fullHtml);

  // 構造JSONを保存
  fs.writeFileSync(
    path.join(outputDir, `${captureUrl.name}-structure.json`),
    JSON.stringify(structure, null, 2),
  );

  // ガイドMarkdownを保存
  const md = buildGuideMarkdown(captureUrl.name, structure);
  fs.writeFileSync(path.join(outputDir, `${captureUrl.name}-guide.md`), md);

  console.log(`  ✓ ${captureUrl.name}`);
  return { name: captureUrl.name, structure };
}

async function main(): Promise<void> {
  const config: Config = JSON.parse(fs.readFileSync('./capture-config.json', 'utf-8'));
  config.outputDir = config.outputDir || './visual-diff';

  const outputDir = path.join(config.outputDir, 'html', 'classic');
  fs.mkdirSync(outputDir, { recursive: true });

  console.log('=== HTML-First Extraction ===');
  console.log(`  Staging: ${config.stagingUrl}`);
  console.log(`  Output:  ${outputDir}`);

  const siteInfo = await apiGet<Record<string, unknown>>(config, 'site-info');
  console.log(`  Current theme: ${(siteInfo.active_theme as any).name}`);

  const captureUrls = (await apiGet<{ urls: CaptureUrl[] }>(config, 'capture-urls')).urls;
  console.log(`  Pages: ${captureUrls.length}`);

  await switchTheme(config, config.classicTheme);

  const browser = await chromium.launch();
  const results: { name: string; structure: PageStructure }[] = [];

  try {
    const contextOptions: Record<string, unknown> = {};
    if (config.basicAuthUser && config.basicAuthPass) {
      contextOptions.httpCredentials = {
        username: config.basicAuthUser,
        password: config.basicAuthPass,
      };
    }
    const context = await browser.newContext(contextOptions);

    console.log('\n=== Extracting pages ===');
    for (const captureUrl of captureUrls) {
      // addInitScript はページごとに新しいページで呼ぶ必要があるため、ページを再作成
      const page = await context.newPage();
      try {
        const result = await extractPage(page, captureUrl, outputDir);
        results.push(result);
      } catch (err) {
        console.error(`  ✗ ${captureUrl.name}: ${err}`);
      } finally {
        await page.close();
      }
    }

    await context.close();
  } finally {
    await browser.close();
    await switchTheme(config, config.classicTheme);
  }

  if (results.length > 0) {
    const summaryMd = buildSummaryMarkdown(results);
    const summaryPath = path.join(outputDir, 'extraction-summary.md');
    fs.writeFileSync(summaryPath, summaryMd);
    console.log(`\n✓ Summary: ${summaryPath}`);
  }

  console.log(`\n=== Extraction Complete ===`);
  console.log(`  ${results.length} pages extracted to ${outputDir}`);
  console.log('');
  console.log('  次のステップ:');
  console.log(`  1. ${outputDir}/extraction-summary.md を読む（変換の第一参照）`);
  console.log('  2. 各ページの *-guide.md を読んでブロック設計');
  console.log('  3. PHPコードはナビID・クエリ条件の確認のみに使用');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
