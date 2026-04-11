/**
 * deploy.ts
 *
 * FSEテーマのバージョンを自動インクリメントしてステージングにアップロードする。
 *
 * バージョン形式: 1.4.0-fse.N (Nはビルド番号)
 *
 * 使い方:
 *   npx tsx scripts/deploy.ts            # バージョンをインクリメントしてアップロード
 *   npx tsx scripts/deploy.ts --no-bump  # バージョンを変えずにアップロード
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface Config {
  stagingUrl: string;
  apiUser: string;
  apiPassword: string;
  fseTheme: string;
}

const THEME_DIR = path.resolve('./converted-theme');
const STYLE_CSS = path.join(THEME_DIR, 'style.css');
const FUNCTIONS_PHP = path.join(THEME_DIR, 'functions.php');
// ZIP_NAME must match the theme directory name WordPress will use as stylesheet slug.
// Using a fixed name prevents WordPress from generating a random suffix each upload.
const THEME_SLUG = 'antimall-fse';
const ZIP_PATH = path.resolve(`./${THEME_SLUG}.zip`);
const CONFIG_PATH = './capture-config.json';

// ─── バージョン管理 ───

/** style.css から現在のバージョン文字列を取得 */
function getCurrentVersion(): string {
  const css = fs.readFileSync(STYLE_CSS, 'utf-8');
  const m = css.match(/^Version:\s*(.+)$/m);
  if (!m) throw new Error('Version field not found in style.css');
  return m[1].trim();
}

/** "1.4.0-fse.N" のビルド番号 N を取得。なければ 0 を返す */
function parseBuildNumber(version: string): number {
  const m = version.match(/\.(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

/** ビルド番号を N+1 にした新バージョン文字列を返す */
function bumpVersion(version: string): string {
  const base = version.replace(/\.\d+$/, '');  // "1.4.0-fse"
  const n = parseBuildNumber(version);
  return `${base}.${n + 1}`;
}

/** style.css と functions.php のバージョン文字列を書き換える */
function applyVersion(newVersion: string): void {
  // style.css
  let css = fs.readFileSync(STYLE_CSS, 'utf-8');
  css = css.replace(/^(Version:\s*)(.+)$/m, `$1${newVersion}`);
  fs.writeFileSync(STYLE_CSS, css);

  // functions.php
  let php = fs.readFileSync(FUNCTIONS_PHP, 'utf-8');
  php = php.replace(
    /define\(\s*'ANTIMALL_FSE_VERSION',\s*'[^']+'\s*\)/,
    `define( 'ANTIMALL_FSE_VERSION', '${newVersion}' )`,
  );
  fs.writeFileSync(FUNCTIONS_PHP, php);
}

// ─── ZIP & アップロード ───

function buildZip(): void {
  if (fs.existsSync(ZIP_PATH)) fs.unlinkSync(ZIP_PATH);
  // Create a temp symlink so ZIP root directory is THEME_SLUG, not ".".
  // WordPress uses the ZIP root directory name as the theme slug (stylesheet).
  const tmpLink = path.resolve(`./${THEME_SLUG}`);
  if (fs.existsSync(tmpLink)) fs.rmSync(tmpLink, { recursive: true, force: true });
  fs.symlinkSync(THEME_DIR, tmpLink);
  try {
    execSync(`zip -r "${ZIP_PATH}" "${THEME_SLUG}" -x "*/.DS_Store" -q`, { stdio: 'inherit' });
  } finally {
    fs.rmSync(tmpLink, { force: true });
  }
}

function uploadTheme(config: Config): { stylesheet: string; name: string } {
  const token = Buffer.from(`${config.apiUser}:${config.apiPassword}`).toString('base64');
  const result = execSync(
    `curl -s -X POST \
      -H "Authorization: Basic ${token}" \
      -F "theme=@${ZIP_PATH}" \
      "${config.stagingUrl}/wp-json/fse-conversion/v1/upload-theme"`,
  );
  return JSON.parse(result.toString());
}

function updateConfig(config: Config, stylesheet: string): void {
  config.fseTheme = stylesheet;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}

// ─── メイン ───

async function main(): Promise<void> {
  const noBump = process.argv.includes('--no-bump');
  const config: Config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

  // バージョン処理
  const currentVersion = getCurrentVersion();
  const newVersion = noBump ? currentVersion : bumpVersion(currentVersion);

  if (!noBump) {
    console.log(`  Version: ${currentVersion} → ${newVersion}`);
    applyVersion(newVersion);
  } else {
    console.log(`  Version: ${currentVersion} (no bump)`);
  }

  // ZIP作成
  console.log('  Building ZIP...');
  buildZip();
  const sizeMB = (fs.statSync(ZIP_PATH).size / 1024).toFixed(0);
  console.log(`  ZIP: ${sizeMB} KB`);

  // アップロード
  console.log('  Uploading to staging...');
  const result = uploadTheme(config);
  if (!result.stylesheet) throw new Error(`Upload failed: ${JSON.stringify(result)}`);
  console.log(`  Uploaded: ${result.name} (stylesheet: ${result.stylesheet})`);

  // capture-config.json 更新
  updateConfig(config, result.stylesheet);
  console.log(`  capture-config.json updated: fseTheme = ${result.stylesheet}`);

  console.log(`\n✓ Deploy complete — ${result.name} v${newVersion}`);
}

main().catch(err => {
  console.error('Deploy failed:', err.message);
  process.exit(1);
});
