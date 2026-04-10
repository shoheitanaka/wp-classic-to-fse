# FSEテーマ変換 ビジュアル検証スキル（ステージング方式）

## 概要

既存サイトのステージング環境を使い、クラシックテーマとFSE変換テーマのデザイン同一性を
Playwrightスクリーンショット比較 + Computed Style差分で検証・自動修正するスキル。

本番と同一のDB・メディア・プラグイン構成の上でテーマだけを差し替えるため、
ダミーデータでは再現できない独自フォントサイズ・margin・padding・カスタマイザー設定を含めた
正確なデザイン比較が可能。

---

## アーキテクチャ

```
  Claude Code (ローカル)
  ┌──────────────────────────────────────────────────┐
  │ /convert-theme                                    │
  │   Phase 1: テーマ解析（ソースコード読み取り）        │
  │   Phase 2: テーマ変換（CLAUDE.md ルールに基づく）    │
  │   Phase 3: ビジュアル検証 ← ここ                   │
  └────────────────────┬─────────────────────────────┘
                       │ REST API (Application Password)
                       ▼
  ┌──────────────────────────────────────────────────┐
  │ ステージングサイト                                 │
  │   WordPress + 同一DB + 同一プラグイン              │
  │   + FSE Conversion Helper プラグイン               │
  │                                                  │
  │   REST API:                                      │
  │     /site-info           サイト情報                │
  │     /customizer-export   カスタマイザー全設定       │
  │     /capture-urls        キャプチャURL自動検出      │
  │     /switch-theme        テーマ切替                │
  │     /upload-theme        テーマZIPアップロード       │
  │     /widgets-export      ウィジェット構成           │
  │     /menus-export        メニュー構造              │
  │     /sidebars-export     サイドバー情報             │
  │     /theme-mods          theme_mods全取得          │
  │     /computed-style-injection  JS注入の切替        │
  └──────────────────────────────────────────────────┘
                       ▲
                       │ Playwright (ローカルから接続)
                       │
  ┌──────────────────────────────────────────────────┐
  │ scripts/capture.ts                                │
  │   1. カスタマイザー設定エクスポート保存              │
  │   2. キャプチャ対象URL取得                         │
  │   3. Classic 状態でスクショ + Computed Style        │
  │   4. テーマ切替 → FSE                             │
  │   5. FSE 状態でスクショ + Computed Style            │
  │   6. Classic に戻す                               │
  └────────────────────┬─────────────────────────────┘
                       ▼
  ┌──────────────────────────────────────────────────┐
  │ scripts/diff.ts                                   │
  │   - ピクセル差分ヒートマップ                       │
  │   - Computed Style 差異 (severity分類)             │
  │   - 修正提案集約                                  │
  │   - VISUAL_DIFF_REPORT.md 出力                    │
  └────────────────────┬─────────────────────────────┘
                       ▼
  ┌──────────────────────────────────────────────────┐
  │ 修正ループ（Claude Code が実行）                   │
  │   1. diff-report.json 読み取り                    │
  │   2. theme.json / CSS 修正                        │
  │   3. 再ZIP → 再アップロード → 再キャプチャ → 再比較  │
  │   4. 閾値クリア or 5回で終了                       │
  └──────────────────────────────────────────────────┘
```

---

## セットアップ手順

### 1. ステージングサイト準備

1. 本番サイトのステージング環境を作成（ホスティング機能 or 手動コピー）
2. ステージングに `fse-conversion-helper` プラグインをインストール・有効化
3. WordPress管理画面 > ユーザー > Application Password を発行
4. `capture-config.json` を作成

### 2. ローカル環境準備

```bash
cd wp-classic-to-fse
npm install
npx playwright install chromium
cp capture-config.example.json capture-config.json
# capture-config.json を編集
```

---

## カスタマイザー設定の活用

ステージング方式の最大の利点。カスタマイザーで設定された独自値を theme.json 生成に直接反映できる。

```
customizer-export レスポンス → theme.json 生成インプット:
  header_textcolor    → styles.elements.h1.color
  background_color    → styles.color.background
  custom_css          → style.css に追記 or styles に変換
  editor-color-palette → settings.color.palette
  editor-font-sizes   → settings.typography.fontSizes
  custom-logo size    → parts/header.html ロゴブロック属性

widgets-export → parts/sidebar.html のブロック構造
menus-export   → wp:navigation ブロック構造
```

---

## 許容閾値

| 指標 | 閾値 |
|------|------|
| ピクセル差分率 | < 2% |
| font-size 差異 | ≤ 1px |
| margin/padding 差異 | ≤ 4px |
| color 差異 | 完全一致 |
| 要素位置シフト | ≤ 10px |
| 要素サイズ差異 | ≤ 10px |
| 要素欠落 | 0件 |

---

## 注意事項

- ステージングサイトで実行すること（本番で実行しない）
- Application Password は検証完了後に削除推奨
- FSE Conversion Helper プラグインも検証完了後にアンインストール推奨
- Basic認証がある場合は capture-config.json に設定
- Playwright はローカル実行 — ステージングにNode.js不要
- テーマ切替でウィジェット・カスタマイザー設定が失われるため先にエクスポート
- キャプチャ完了後は自動的にClassicテーマに戻す
