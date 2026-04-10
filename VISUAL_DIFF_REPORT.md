# ビジュアル差分レポート（最終版）

生成日時: 2026-04-11  
対象: Antimall Classic Theme → Antimall FSE Theme  
ステージングURL: https://nishikawa.demo01web.info  
自動修正ラウンド数: 2

---

## 修正ラウンド別サマリー

| ラウンド | Critical | Warning | 主な修正内容 |
|---------|---------|---------|------------|
| Round 0（初回） | 3,298 | 1,546 | - |
| Round 1 | 2,983 | 1,498 | font-size修正(17.6px)、contentSize(1250px)、#colophon追加、フッター構造修正 |
| Round 2（最終） | 2,839 | 1,499 | style.cssにグローバルリセット追加、ヘッダー/フッターmargin修正、block-gap: 0 |
| **改善率** | **-14%** | **-3%** | |

---

## 最終ピクセル差分（Round 2）

| ページ | desktop | tablet | mobile | 判定 |
|--------|---------|--------|--------|------|
| front-page | 20.47% | 27.11% | 32.74% | ❌ |
| page-buy-form | 30.13% | 36.49% | 40.25% | ❌ |
| category-news | 34.01% | 40.15% | 44.20% | ❌ |
| single-with-thumbnail | 42.17% | 46.67% | 46.70% | ❌ |
| single-no-thumbnail | 39.03% | 54.37% | 62.20% | ❌ |
| archive-2025-08 | 42.60% | 60.76% | 62.35% | ❌ |
| author-artws_admin | 46.31% | 63.49% | 69.88% | ❌ |
| search-results | 40.83% | 50.12% | 59.13% | ❌ |
| search-empty | 42.89% | 52.76% | 57.97% | ❌ |
| 404 | 45.37% | 51.98% | 61.78% | ❌ |

**完全一致 (< 0.1%)**: 0件  
**軽微な差異 (0.1-2%)**: 0件  
**重大な差異 (> 2%)**: 30件（全件）

---

## 差分が大きい根本原因

### 1. WooCommerce / Revolution Slider 依存コンテンツ（最大要因）

クラシックテーマのフロントページ（固定ページID: 102）はRevolution Slider + WooCommerceの商品グリッドで構成されており、FSEでは再現不可能です。

- **Classic**: Revolution Sliderヒーロー → WooCommerce商品グリッド → バナーセクション
- **FSE**: ブログ投稿一覧（wp:queryブロック）

### 2. ナビゲーション未設定（ヘッダー高さ差異）

| 要素 | Classic | FSE |
|------|---------|-----|
| ヘッダー高さ | 144px | 450px |

FSEでは`wp:navigation`ブロックにナビゲーションメニューが未割り当て（ref:0）のため、ページ一覧が縦積みで展開されます。管理画面でナビゲーションを設定すると解消します。

### 3. WooCommerceテンプレートの除外

変換スコープからWooCommerceを除外しているため、商品ページ（archive-product, single-product等）はFSEテーマで代替表示となります。

### 4. カスタムCSS依存

Antimallのmain.cssは以下のセレクタを多用しており、FSE生成HTMLの異なるクラス構造では適用されません：
- `.nbcore-*`, `.site-header .menu-*`, `.woocommerce-*`
- ヘッダーレイアウト固有クラス（`.mid-inline`, `.left-stack` 等）

---

## 適用済み自動修正

| # | 修正内容 | 対象ファイル |
|---|---------|------------|
| 1 | body/global font-size: 17.6px (1.1rem) | `style.css`, `theme.json` |
| 2 | contentSize: 1250px (classic mainの実幅に合わせる) | `theme.json` |
| 3 | `id="colophon"` をフッターに追加（プラグイン参照対応） | `parts/footer.html` |
| 4 | フッター構造簡素化・margin-top: 55px | `parts/footer.html` |
| 5 | ヘッダーのmargin/padding除去 | `parts/header.html`, `style.css` |
| 6 | グローバルblock-gap: 0px（FSEデフォルトスペース排除） | `theme.json`, `style.css` |
| 7 | `.wp-site-blocks > *`のmargin除去 | `style.css` |

---

## 残存する要手動対応項目

### 優先度 高

| 項目 | 対応方法 |
|------|---------|
| ナビゲーションメニューの設定 | WordPress管理画面 → 外観 → メニュー → Primary, Header Sub, Footer に割り当て |
| フロントページの再構築 | Revolution Sliderに相当するカバーブロック + FSEブロックパターンで再構築 |
| WooCommerce FSE対応 | WooCommerce 8.x+のブロックテンプレートを有効化 |

### 優先度 中

| 項目 | 対応方法 |
|------|---------|
| サイドバーウィジェット | ウィジェット設定画面でDefault Sidebarにウィジェットを追加 |
| フッターウィジェット | フッターブロックパターン内のコンテンツを実際のコンテンツに更新 |
| カラーパレット調整 | サイトエディタ → スタイル → カラーで実際のブランドカラーに調整 |
| Google Fonts | theme.jsonのfontFamiliesを実際の使用フォントに更新 |

### 優先度 低

| 項目 | 対応方法 |
|------|---------|
| Megamenu | `wp:navigation`ブロックのサブメニュー設定で対応 |
| スティッキーヘッダー | style.cssで`position: sticky; top: 0;`追加 |
| 戻るボタン（Back to Top） | スクロールトップボタンプラグインで代替 |
| ローディングアニメーション | CSSアニメーションで再実装、または削除 |

---

## 自動修正の限界

このテーマは以下の理由から自動修正の閾値（ピクセル差分率 < 2%）には到達できません：

1. **WooCommerce専用テーマ**: 全10ページ中、フロントページを含む多くがWooCommerce機能に依存
2. **Revolution Slider**: PHPで動的生成されるスライダーはFSEブロックで自動変換不可
3. **独自フレームワーク**: `netbase-core`の100+カスタマイザーオプションはFSEサイトエディタで再設定が必要
4. **コンテンツ依存**: 元テーマのビジュアルは商品画像・スライダー画像など実際のコンテンツに強依存

FSEテーマは**構造的には正しく変換**されており、ナビゲーション設定・ウィジェット設定・サイトエディタカスタマイズを行うことで、視覚的な差異を最小化できます。

---

## テスト用URLリスト（差分確認）

```
Front Page:  https://nishikawa.demo01web.info/
Single Post: https://nishikawa.demo01web.info/伊万里の意匠/
Category:    https://nishikawa.demo01web.info/category/news/
Search:      https://nishikawa.demo01web.info/?s=古美術西川
404:         https://nishikawa.demo01web.info/this-page-does-not-exist-fse-test/
```

---

## 差分画像の場所

```
./visual-diff/diff/  - ピクセル差分画像（赤が差分箇所）
./visual-diff/classic/  - クラシックテーマのスクリーンショット
./visual-diff/fse/      - FSEテーマのスクリーンショット
```
