/**
 * 差分解析スクリプト
 *
 * Classic / FSE のスクリーンショットとComputed Styleを比較し、
 * 差分レポートを生成する。
 */
import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

// ─── 型定義 ───

interface PixelDiffResult {
  page: string;
  viewport: string;
  totalPixels: number;
  diffPixels: number;
  diffPercentage: number;
  diffImagePath: string;
  classicSize: { width: number; height: number };
  fseSize: { width: number; height: number };
}

interface StyleDiffEntry {
  selector: string;
  property: string;
  classicValue: string;
  fseValue: string;
  severity: 'critical' | 'warning' | 'info';
  suggestion: string;
}

interface StyleDiffResult {
  page: string;
  viewport: string;
  diffs: StyleDiffEntry[];
}

interface DiffReport {
  timestamp: string;
  pixelDiffs: PixelDiffResult[];
  styleDiffs: StyleDiffResult[];
  summary: {
    totalComparisons: number;
    perfectMatches: number;
    minorDiffs: number;
    majorDiffs: number;
    criticalStyleIssues: number;
    warningStyleIssues: number;
  };
  fixSuggestions: FixSuggestion[];
}

interface FixSuggestion {
  priority: number;
  target: 'theme.json' | 'style.css' | 'template' | 'functions.php';
  path: string;
  description: string;
  currentValue: string;
  suggestedValue: string;
  affectedPages: string[];
}

// ─── Severity 判定 ───

function classifySeverity(
  property: string,
  classicVal: string,
  fseVal: string,
): { severity: 'critical' | 'warning' | 'info'; suggestion: string } {
  // font-size
  if (property === 'font-size') {
    const c = parseFloat(classicVal);
    const f = parseFloat(fseVal);
    const diff = Math.abs(c - f);
    if (diff > 2) return {
      severity: 'critical',
      suggestion: `theme.json styles で font-size を ${classicVal} に設定`,
    };
    if (diff > 0) return {
      severity: 'warning',
      suggestion: `font-size 差異 ${diff.toFixed(1)}px — theme.json で微調整`,
    };
  }

  // margin / padding
  if (property.startsWith('margin') || property.startsWith('padding')) {
    const c = parseFloat(classicVal) || 0;
    const f = parseFloat(fseVal) || 0;
    const diff = Math.abs(c - f);
    if (diff > 10) return {
      severity: 'critical',
      suggestion: `theme.json spacing または style.css で ${property}: ${classicVal} を設定`,
    };
    if (diff > 4) return {
      severity: 'warning',
      suggestion: `${property} 差異 ${diff.toFixed(1)}px — theme.json spacing で調整`,
    };
    return { severity: 'info', suggestion: '' };
  }

  // color
  if (property === 'color' || property === 'background-color') {
    if (classicVal !== fseVal) return {
      severity: 'warning',
      suggestion: `theme.json color palette に ${classicVal} を追加`,
    };
  }

  // layout
  if (['display', 'position', 'flex-direction'].includes(property)) {
    if (classicVal !== fseVal) return {
      severity: 'critical',
      suggestion: `レイアウト構造の差異 — テンプレート/パーツのブロック構造を確認`,
    };
  }

  // width / max-width
  if (['width', 'max-width'].includes(property)) {
    const c = parseFloat(classicVal) || 0;
    const f = parseFloat(fseVal) || 0;
    if (Math.abs(c - f) > 20) return {
      severity: 'critical',
      suggestion: `theme.json layout.contentSize / wideSize を調整`,
    };
  }

  // BoundingRect
  if (property.startsWith('__rect_')) {
    const c = parseInt(classicVal);
    const f = parseInt(fseVal);
    const diff = Math.abs(c - f);
    if (['__rect_width', '__rect_height'].includes(property) && diff > 20) {
      return { severity: 'critical', suggestion: `要素サイズの大幅な差異 — レイアウト構造を確認` };
    }
    if (['__rect_x', '__rect_y'].includes(property) && diff > 30) {
      return { severity: 'critical', suggestion: `要素位置の大幅なシフト — レイアウト構造を確認` };
    }
    if (diff > 10) return { severity: 'warning', suggestion: '' };
  }

  // font-family
  if (property === 'font-family' && classicVal !== fseVal) {
    return {
      severity: 'warning',
      suggestion: `theme.json typography.fontFamilies を確認`,
    };
  }

  return { severity: 'info', suggestion: '' };
}

// ─── ピクセル差分 ───

function normalizeImage(img: PNG, w: number, h: number): Buffer {
  const buffer = Buffer.alloc(w * h * 4, 255);
  for (let y = 0; y < img.height && y < h; y++) {
    for (let x = 0; x < img.width && x < w; x++) {
      const srcIdx = (y * img.width + x) * 4;
      const dstIdx = (y * w + x) * 4;
      buffer[dstIdx] = img.data[srcIdx];
      buffer[dstIdx + 1] = img.data[srcIdx + 1];
      buffer[dstIdx + 2] = img.data[srcIdx + 2];
      buffer[dstIdx + 3] = img.data[srcIdx + 3];
    }
  }
  return buffer;
}

function compareScreenshots(classicPath: string, fsePath: string, diffPath: string): PixelDiffResult | null {
  if (!fs.existsSync(classicPath) || !fs.existsSync(fsePath)) return null;

  const classicImg = PNG.sync.read(fs.readFileSync(classicPath));
  const fseImg = PNG.sync.read(fs.readFileSync(fsePath));

  const width = Math.max(classicImg.width, fseImg.width);
  const height = Math.max(classicImg.height, fseImg.height);
  const diff = new PNG({ width, height });

  const classicData = normalizeImage(classicImg, width, height);
  const fseData = normalizeImage(fseImg, width, height);

  const diffPixels = pixelmatch(classicData, fseData, diff.data, width, height, {
    threshold: 0.1,
    includeAA: false,
    alpha: 0.3,
  });

  fs.mkdirSync(path.dirname(diffPath), { recursive: true });
  fs.writeFileSync(diffPath, PNG.sync.write(diff));

  const basename = path.basename(classicPath, '.png');
  const parts = basename.split('_');
  const viewport = parts.pop()!;
  const page = parts.join('_');

  return {
    page,
    viewport,
    totalPixels: width * height,
    diffPixels,
    diffPercentage: (diffPixels / (width * height)) * 100,
    diffImagePath: diffPath,
    classicSize: { width: classicImg.width, height: classicImg.height },
    fseSize: { width: fseImg.width, height: fseImg.height },
  };
}

// ─── スタイル差分 ───

function compareStyles(classicPath: string, fsePath: string): StyleDiffResult | null {
  if (!fs.existsSync(classicPath) || !fs.existsSync(fsePath)) return null;

  const classicStyles = JSON.parse(fs.readFileSync(classicPath, 'utf-8'));
  const fseStyles = JSON.parse(fs.readFileSync(fsePath, 'utf-8'));

  const diffs: StyleDiffEntry[] = [];
  const basename = path.basename(classicPath, '_styles.json');
  const parts = basename.split('_');
  const viewport = parts.pop()!;
  const page = parts.join('_');

  for (const selector of Object.keys(classicStyles)) {
    const classicProps = classicStyles[selector];
    const fseProps = fseStyles[selector];

    if (!fseProps) {
      diffs.push({
        selector,
        property: '(element missing)',
        classicValue: 'exists',
        fseValue: 'NOT FOUND',
        severity: 'critical',
        suggestion: 'テンプレート/パーツに対応する要素を追加',
      });
      continue;
    }

    for (const prop of Object.keys(classicProps)) {
      if (classicProps[prop] !== fseProps[prop]) {
        const { severity, suggestion } = classifySeverity(prop, classicProps[prop], fseProps[prop] || '');
        diffs.push({
          selector,
          property: prop,
          classicValue: classicProps[prop],
          fseValue: fseProps[prop] || '(unset)',
          severity,
          suggestion,
        });
      }
    }
  }

  return { page, viewport, diffs };
}

// ─── 修正提案の集約 ───

function aggregateFixSuggestions(styleDiffs: StyleDiffResult[]): FixSuggestion[] {
  const suggestionMap = new Map<string, FixSuggestion>();

  for (const result of styleDiffs) {
    for (const diff of result.diffs) {
      if (diff.severity === 'info' || !diff.suggestion) continue;

      const key = `${diff.selector}:${diff.property}`;
      const existing = suggestionMap.get(key);

      if (existing) {
        if (!existing.affectedPages.includes(result.page)) {
          existing.affectedPages.push(result.page);
        }
      } else {
        let target: FixSuggestion['target'] = 'style.css';
        if (diff.suggestion.includes('theme.json')) target = 'theme.json';
        if (diff.suggestion.includes('テンプレート')) target = 'template';
        if (diff.suggestion.includes('functions.php')) target = 'functions.php';

        suggestionMap.set(key, {
          priority: diff.severity === 'critical' ? 1 : 2,
          target,
          path: `${diff.selector} → ${diff.property}`,
          description: diff.suggestion,
          currentValue: diff.classicValue,
          suggestedValue: diff.classicValue,
          affectedPages: [result.page],
        });
      }
    }
  }

  return Array.from(suggestionMap.values()).sort((a, b) => a.priority - b.priority);
}

// ─── Markdown レポート生成 ───

function generateMarkdownReport(report: DiffReport): string {
  const lines: string[] = [
    '# ビジュアル差分レポート',
    '',
    `生成日時: ${report.timestamp}`,
    '',
    '## サマリー',
    '',
    `| 指標 | 値 |`,
    `|------|------|`,
    `| 比較総数 | ${report.summary.totalComparisons} |`,
    `| 完全一致 (< 0.1%) | ${report.summary.perfectMatches} |`,
    `| 軽微な差異 (0.1-2%) | ${report.summary.minorDiffs} |`,
    `| 重大な差異 (> 2%) | ${report.summary.majorDiffs} |`,
    `| Critical スタイル問題 | ${report.summary.criticalStyleIssues} |`,
    `| Warning スタイル問題 | ${report.summary.warningStyleIssues} |`,
    '',
  ];

  // ピクセル差分
  lines.push('## ピクセル差分');
  lines.push('');
  lines.push('| ページ | ビューポート | 差分率 | 差分画像 |');
  lines.push('|--------|------------|--------|----------|');
  for (const r of report.pixelDiffs.sort((a, b) => b.diffPercentage - a.diffPercentage)) {
    const status = r.diffPercentage < 0.1 ? '✅' : r.diffPercentage < 2 ? '⚠️' : '❌';
    lines.push(`| ${r.page} | ${r.viewport} | ${status} ${r.diffPercentage.toFixed(2)}% | ${r.diffImagePath} |`);
  }
  lines.push('');

  // Critical スタイル差異
  const criticals = report.styleDiffs
    .flatMap(r => r.diffs.filter(d => d.severity === 'critical').map(d => ({ ...d, page: r.page, viewport: r.viewport })));

  if (criticals.length > 0) {
    lines.push('## Critical スタイル差異');
    lines.push('');
    for (const d of criticals) {
      lines.push(`### ${d.selector} — ${d.property}`);
      lines.push(`- ページ: ${d.page} @ ${d.viewport}`);
      lines.push(`- Classic: \`${d.classicValue}\``);
      lines.push(`- FSE: \`${d.fseValue}\``);
      lines.push(`- 修正案: ${d.suggestion}`);
      lines.push('');
    }
  }

  // 修正提案
  if (report.fixSuggestions.length > 0) {
    lines.push('## 修正提案（優先度順）');
    lines.push('');
    for (let i = 0; i < report.fixSuggestions.length; i++) {
      const s = report.fixSuggestions[i];
      const icon = s.priority === 1 ? '🔴' : '🟡';
      lines.push(`${i + 1}. ${icon} **[${s.target}]** ${s.path}`);
      lines.push(`   - ${s.description}`);
      lines.push(`   - 値: \`${s.currentValue}\``);
      lines.push(`   - 影響ページ: ${s.affectedPages.join(', ')}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ─── メイン ───

async function main(): Promise<void> {
  const baseDir = process.argv[2] || './visual-diff';
  const classicDir = path.join(baseDir, 'classic');
  const fseDir = path.join(baseDir, 'fse');
  const diffDir = path.join(baseDir, 'diff');

  if (!fs.existsSync(classicDir) || !fs.existsSync(fseDir)) {
    console.error('Classic or FSE capture directories not found. Run capture first.');
    process.exit(1);
  }

  // ピクセル差分
  const screenshots = fs.readdirSync(classicDir).filter(f => f.endsWith('.png'));
  const pixelResults: PixelDiffResult[] = [];

  console.log('=== Pixel Diff ===');
  for (const file of screenshots) {
    const result = compareScreenshots(
      path.join(classicDir, file),
      path.join(fseDir, file),
      path.join(diffDir, `diff_${file}`),
    );
    if (result) {
      pixelResults.push(result);
      const icon = result.diffPercentage < 0.1 ? '✅' : result.diffPercentage < 2 ? '⚠️' : '❌';
      console.log(`  ${icon} ${result.page} @ ${result.viewport}: ${result.diffPercentage.toFixed(2)}%`);
    }
  }

  // スタイル差分
  const styleFiles = fs.readdirSync(classicDir).filter(f => f.endsWith('_styles.json'));
  const styleResults: StyleDiffResult[] = [];

  console.log('\n=== Style Diff ===');
  for (const file of styleFiles) {
    const result = compareStyles(
      path.join(classicDir, file),
      path.join(fseDir, file),
    );
    if (result) {
      styleResults.push(result);
      const critCount = result.diffs.filter(d => d.severity === 'critical').length;
      const warnCount = result.diffs.filter(d => d.severity === 'warning').length;
      if (critCount > 0 || warnCount > 0) {
        console.log(`  ${result.page} @ ${result.viewport}: ${critCount} critical, ${warnCount} warning`);
      }
    }
  }

  // 修正提案集約
  const fixSuggestions = aggregateFixSuggestions(styleResults);

  // レポート生成
  const report: DiffReport = {
    timestamp: new Date().toISOString(),
    pixelDiffs: pixelResults,
    styleDiffs: styleResults,
    summary: {
      totalComparisons: pixelResults.length,
      perfectMatches: pixelResults.filter(r => r.diffPercentage < 0.1).length,
      minorDiffs: pixelResults.filter(r => r.diffPercentage >= 0.1 && r.diffPercentage < 2).length,
      majorDiffs: pixelResults.filter(r => r.diffPercentage >= 2).length,
      criticalStyleIssues: styleResults.reduce(
        (sum, r) => sum + r.diffs.filter(d => d.severity === 'critical').length, 0,
      ),
      warningStyleIssues: styleResults.reduce(
        (sum, r) => sum + r.diffs.filter(d => d.severity === 'warning').length, 0,
      ),
    },
    fixSuggestions,
  };

  // JSON レポート
  fs.writeFileSync(path.join(baseDir, 'diff-report.json'), JSON.stringify(report, null, 2));

  // Markdown レポート
  const markdown = generateMarkdownReport(report);
  fs.writeFileSync(path.join(baseDir, 'VISUAL_DIFF_REPORT.md'), markdown);

  console.log('\n=== Summary ===');
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`\nReports saved to:`);
  console.log(`  ${path.join(baseDir, 'diff-report.json')}`);
  console.log(`  ${path.join(baseDir, 'VISUAL_DIFF_REPORT.md')}`);
}

main();
