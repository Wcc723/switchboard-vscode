# Changelog

本擴充的所有重要變更都會記錄於此檔。

格式依循 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，版本遵循 [語意化版本](https://semver.org/lang/zh-TW/)。

## [0.0.3] - 2026-06-30

### 新增
- **拖曳加入專案**：把資料夾拖到 Files 面板即可新增為專案（原生 TreeView 拖放控制器，Finder 與檔案總管都支援）；Projects 卡片也接受拖放（盡力，新版 VSCode 受 webview 限制時提示改拖到 Files）。
- **多語系**：介面支援英文（預設）與繁體中文翻譯，依 VSCode 顯示語言切換（`l10n` + `package.nls`）。
- **`projectSwitch.addToWorkspace` 設定**（預設 `false`）：預設不再把專案資料夾加入 workspace，避免空視窗首次開啟時 reload 導致 terminal 被重置；需要原生 Explorer / Git 時可開啟。

### 變更
- Projects 卡片改為**單行版面**：最左為 terminal 數徽章（取代原本的色點），名稱佔滿寬度，動作精簡為 **＋（開 terminal）** 與 **⋯（更多：設色 / 改名 / 移除，原生選單）**。
- **執行中狀態強化**：執行指令時 session 圓點與專案數量徽章會脈動標示。
- 更新 README 使用截圖為改版後的單行卡片介面。

## [0.0.2] - 2026-06-30

### 新增
- README / Marketplace 說明頁加入實際使用截圖。
- 新增本 CHANGELOG。

## [0.0.1] - 2026-06-30

首次發布。

### 功能
- **Projects 面板（webview）**：每個專案一張色塊卡片（左色條 + 淡底色 + 分隔），標題顯示狀態（當前高亮、terminal 數）與動作（開 terminal / 設色 / 改名 / 移除）。
- **terminal 群組**：每個專案集中管理多個 terminal，cwd 可設在任意子目錄；透過 shell integration 顯示執行中的指令（如 `claude` / `codex`）。
- **Files 面板**：顯示當前專案的檔案樹（保留原生檔案圖示）；檔案以該專案的顏色圓點標示（Files 樹 / 原生 Explorer / 編輯器分頁），不改變文字顏色。
- **專案色彩**：六色調色盤可自選或自動配色，一致套用於卡片、terminal 分頁與檔案圓點。
- **狀態列指示器**：顯示當前聚焦 terminal 所屬的專案與執行中指令。
- **與原生終端機列表連動**：在原生分頁點選 terminal 時，面板會自動高亮其所屬專案。
- **單一視窗、多專案**：以 multi-root workspace 動態掛載專案，切換不 reload，所有 terminal 全程不中斷。
- **可設定行為**：`projectSwitch.onProjectClick`、`projectSwitch.autoStartClaude`、`projectSwitch.claudeCommand`。

### 安全性
- `projectSwitch.claudeCommand` 設為 machine scope，避免惡意 workspace 透過 `.vscode/settings.json` 注入並自動執行指令；並宣告 untrusted workspace 支援。
