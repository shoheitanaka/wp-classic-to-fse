ステージング環境でクラシックテーマとFSE変換テーマのビジュアル差分を検証してください。

## 前提条件
- `capture-config.json` が設定済み
- ステージングに FSE Conversion Helper プラグインが有効化済み
- `./converted-theme/` に変換済みテーマが存在

## 実行手順

### Step 1: 接続確認
```bash
node -e "
const c = require('./capture-config.json');
const t = Buffer.from(c.apiUser+':'+c.apiPassword).toString('base64');
fetch(c.stagingUrl+'/wp-json/fse-conversion/v1/site-info',{headers:{'Authorization':'Basic '+t}})
.then(r=>r.json()).then(d=>console.log('OK:',d.active_theme.name)).catch(console.error);
"
```
失敗した場合はユーザーに設定確認を案内して中断。

### Step 2: テーマアップロード
`converted-theme` を ZIP 化してステージングにアップロード:
```bash
cd converted-theme && zip -r ../converted-theme.zip . && cd ..
curl -u "$API_USER:$API_PASS" \
  -F "theme=@converted-theme.zip" \
  $STAGING_URL/wp-json/fse-conversion/v1/upload-theme
```

### Step 3: キャプチャ実行
```bash
npm run capture
```
Classic → スクショ + Computed Style → テーマ切替 → FSE → スクショ + Computed Style → Classic に戻す

### Step 4: 差分解析
```bash
npm run diff
```

### Step 5: 差分レポート提示
`visual-diff/diff-report.json` を読み取り、サマリーをユーザーに報告:
- ピクセル差分率（ページ別）
- Critical / Warning / Info の件数
- 上位の修正提案

### Step 6: 自動修正に進むか確認
差異がある場合、ユーザーに以下を提示:
- 「自動修正ループを実行しますか？」
- 「はい」→ `/auto-fix` と同じロジックで自動修正ループを実行
- 「いいえ」→ VISUAL_DIFF_REPORT.md を最終版として出力
