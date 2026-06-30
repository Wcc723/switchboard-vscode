# Project Switch

在同一個 VSCode 視窗裡管理多個專案，以及每個專案的多個 Claude Code session。

Activity Bar 最左側新增一個容器，內含兩個面板：

- **Projects**（webview）：每個專案是一張**色塊卡片**（左側色條 + 淡底色），卡片間有**分隔線**；卡片標題顯示狀態（當前高亮、實心圓點、terminal 數徽章）與動作按鈕（＋ terminal、🎨 顏色、✎ 改名、🗑 移除），底下是該專案的 terminal 群組。
- **Files**（原生樹）：顯示**當前專案**的檔案樹，保留 VSCode 原生檔案圖示；點檔開檔，任何資料夾可「在此開 terminal」。

切換專案只是聚焦，不會 reload 視窗，所以**所有 terminal 全程不中斷**。

## 功能

- **專案 = 色塊卡片**：跨視窗持久化（存在 globalState），背景色塊 + 分隔線快速辨識；每個專案一個顏色。
- **terminal 群組**：每個專案的 terminal 集中在卡片內，一鍵開啟 / 聚焦 / 關閉。
  - **顯示執行中的指令**：跑 `claude` / `codex` 等時，卡片內該 terminal 的標籤會變成指令名稱（cwd 退為灰字），結束後還原。需 VSCode shell integration 啟用（bash/zsh/pwsh/fish 預設開）。
  - **分頁色帶**：原生終端機分頁名稱前帶該專案的 emoji 色圓點（如 `🔵 my-app: src`）+ 圖示染色，標示所屬群組。
- **檔案瀏覽**：Files 面板是當前專案的檔案樹，點檔開檔；任何資料夾 hover 可「在此開 terminal」（cwd 設在該子目錄）。
- **切換即聚焦**：點專案卡片會把它的資料夾掛進 multi-root workspace、在 Explorer 聚焦該根、帶出最近一個 terminal，Files 面板也切到該專案。
- **自選顏色**：設定專案顏色（卡片動作按鈕或指令），六色調色盤 🔴🟠🟡🟢🔵🟣，或改回「自動」依名稱配色。
- **檔案以色圓點標示（不染文字）**：每個專案底下的檔案會在右側顯示該專案的 emoji 色圓點（Files 樹、原生 Explorer、編輯器分頁都會），一眼分辨檔案屬於哪個專案，但不改變檔名文字顏色。
  - 編輯器分頁要看到圓點，需開啟設定 `workbench.editor.decorations.badges: true`（預設開啟）。
- **與原生終端機列表連動**：在原生終端機分頁點到某個 terminal，Project 面板會自動高亮它所屬的專案（VSCode 無法把原生分頁分組成資料夾，故以命名 + 顏色 + 連動整合）。
- **狀態列指示器**：底部狀態列顯示當前 terminal 所屬專案的彩色晶片「🔵 專案名 · claude」，跟著聚焦的 terminal 即時切換（終端機內容區由 xterm 渲染、無法加色帶，故以狀態列指示）。
- **可設定行為**：
  - `projectSwitch.onProjectClick` — `focusOrStartSession`（預設）/ `focusOnly` / `alwaysNewSession`
  - `projectSwitch.autoStartClaude` — 開 terminal 時是否自動執行 Claude（**預設 `false`**，只開乾淨 terminal）
  - `projectSwitch.claudeCommand` — 自動執行時的指令（預設 `claude`，可改 `claude --resume` 等）

## 開發 / 試用

```bash
npm install
npm run watch     # esbuild 監看；或 npm run build 做一次性建置
```

在 VSCode 開啟本資料夾後按 **F5** 啟動 Extension Development Host，左側即會出現 Projects 面板。

型別檢查：`npm run compile`。打包：`npm run package`（產生 `.vsix`，可用 `code --install-extension *.vsix` 安裝）。

## 架構說明

Projects 面板用 **webview** 自繪（背景色塊、分隔線、terminal 群組是原生 TreeView 做不到的）；Files 面板維持**原生 TreeView**（保留檔案圖示主題與專案染色）。兩者透過 message / 共用 actions 串接。

已知限制：VSCode 不允許改「已開啟」terminal 的原生分頁顏色，故換色時面板即時更新、但已開的原生分頁維持原色（新開的才用新色）。

未納入（future）：`claude --resume` 自動還原、terminal running/idle 狀態細分、卡片拖曳排序。
