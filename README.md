# Project Switch

在同一個 VSCode 視窗裡管理多個專案，以及每個專案的多個 Claude Code session。

Activity Bar 最左側新增一個 **Projects** 面板：列出你註冊的專案（= 群組），每個專案底下是它的一組 terminal（cwd 設在該專案的整合終端機，可選擇自動跑 `claude`）。**切換專案時會展開該專案的 terminal 群組、收合其他專案**；每個專案有自己的顏色，連原生終端機列表也能一眼分辨。切換只是聚焦，不會 reload 視窗，所以**所有 terminal 全程不中斷**。

每個專案底下分成兩區：**TERMINALS**（該專案所有 terminal，集中且名稱標出 cwd）與 **FILES**（檔案瀏覽 / 開檔，任何資料夾都能就地開一個 cwd 在該處的 terminal）。

## 功能

- **專案 = 群組**：跨視窗持久化（存在 globalState），每個專案一個顏色。
- **terminal 群組**：每個專案的 terminal 集中在 TERMINALS 區，名稱標出 cwd（如 `my-app: src`），一鍵開啟 / 聚焦 / 關閉。
- **檔案瀏覽**：FILES 區是當前專案的檔案樹，點檔開檔；任何資料夾 hover 可「在此開 terminal」（cwd 設在該子目錄）。
- **切換即展開群組**：點專案會把它的資料夾掛進 multi-root workspace、在 Explorer 聚焦該根、展開它的群組並帶出最近一個 terminal。
- **自選顏色**：右鍵專案 → 設定專案顏色，從調色盤挑（或改回「自動」依名稱配色）。
- **檔案依專案染色**：每個專案底下的檔案會以該專案顏色標示（FILES 樹、原生 Explorer、編輯器分頁都會），一眼分辨檔案屬於哪個專案；專案列右側徽章顯示 terminal 數量。
  - 編輯器分頁要看到顏色，請開啟設定 `workbench.editor.decorations.colors: true`。
- **與原生終端機列表連動**：在原生終端機分頁點到某個 terminal，Project 面板會自動高亮 / 展開它所屬的專案（VSCode 無法把原生分頁分組成資料夾，故以命名 + 顏色 + 連動整合）。
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

## 範圍說明

v1 聚焦在「多專案 × 多 Claude session 的駕駛艙」。檔案瀏覽沿用 VSCode 原生 multi-root Explorer。

未納入（future）：只顯示當前專案的自訂檔案樹、專案配色、`claude --resume` 自動還原、session running/idle 狀態細分。
