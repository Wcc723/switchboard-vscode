import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import type { ProjectStore } from './projectStore';
import type { SessionManager } from './sessionManager';
import { resolveColorId, emojiFor } from './colors';

export interface WebviewActions {
  addProject(): void;
  openProject(projectId: string): void;
  newSession(projectId: string): void;
  focusSession(sessionId: string): void;
  closeSession(sessionId: string): void;
  setColor(projectId: string): void;
  renameProject(projectId: string): void;
  removeProject(projectId: string): void;
}

/** Maps a theme-color id (e.g. terminal.ansiBlue) to its webview CSS variable. */
function cssVar(colorId: string): string {
  return `var(--vscode-${colorId.replace(/\./g, '-')})`;
}

/**
 * The Projects panel, rendered as a webview so each project can have a real
 * background colour block, a separator line, and a styled terminal group —
 * none of which a native TreeView can express.
 */
export class ProjectsWebviewProvider
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  public static readonly viewType = 'projectSwitch.projects';

  private view: vscode.WebviewView | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly store: ProjectStore,
    private readonly sessions: SessionManager,
    private readonly actions: WebviewActions
  ) {
    this.disposables.push(
      store.onDidChange(() => this.postState()),
      sessions.onDidChange(() => this.postState())
    );
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage(
      (msg) => this.onMessage(msg),
      undefined,
      this.disposables
    );
    this.postState();
  }

  private onMessage(msg: { type: string; id?: string }): void {
    switch (msg?.type) {
      case 'ready':
        this.postState();
        break;
      case 'addProject':
        this.actions.addProject();
        break;
      case 'openProject':
        if (msg.id) this.actions.openProject(msg.id);
        break;
      case 'newSession':
        if (msg.id) this.actions.newSession(msg.id);
        break;
      case 'focusSession':
        if (msg.id) this.actions.focusSession(msg.id);
        break;
      case 'closeSession':
        if (msg.id) this.actions.closeSession(msg.id);
        break;
      case 'setColor':
        if (msg.id) this.actions.setColor(msg.id);
        break;
      case 'rename':
        if (msg.id) this.actions.renameProject(msg.id);
        break;
      case 'remove':
        if (msg.id) this.actions.removeProject(msg.id);
        break;
    }
  }

  private postState(): void {
    if (!this.view) {
      return;
    }
    const activeId = this.store.activeProjectId;
    const projects = this.store.getProjects().map((p) => ({
      id: p.id,
      name: p.name,
      path: p.path,
      colorVar: cssVar(resolveColorId(p)),
      emoji: emojiFor(p),
      active: p.id === activeId,
      sessions: this.sessions.getSessions(p.id).map((s) => ({
        id: s.id,
        label: s.treeLabel,
        cwd: s.cwd,
      })),
    }));
    void this.view.webview.postMessage({ type: 'state', projects });
  }

  private html(webview: vscode.Webview): string {
    const nonce = randomUUID().replace(/-/g, '');
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  body {
    padding: 6px 4px;
    margin: 0;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
  }
  .empty {
    padding: 16px 12px;
    text-align: center;
    color: var(--vscode-descriptionForeground);
  }
  button {
    font-family: inherit;
    cursor: pointer;
  }
  button.primary {
    margin-top: 8px;
    padding: 4px 10px;
    border: none;
    border-radius: 4px;
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
  }
  button.primary:hover { background: var(--vscode-button-hoverBackground); }

  .card {
    --c: var(--proj-color, var(--vscode-foreground));
    position: relative;
    border-left: 4px solid var(--c);
    border-radius: 4px;
    padding: 6px 8px;
    margin: 0 2px;
    background: color-mix(in srgb, var(--c) 10%, transparent);
  }
  .card.active {
    background: color-mix(in srgb, var(--c) 22%, transparent);
    outline: 1px solid color-mix(in srgb, var(--c) 55%, transparent);
  }
  hr.sep {
    border: 0;
    border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.35));
    margin: 8px 6px;
  }
  .card-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .card-header .name { cursor: pointer; }
  .dot {
    flex: 0 0 auto;
    font-size: 0.85em;
    line-height: 1;
  }
  .name { font-weight: 600; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge {
    flex: 0 0 auto;
    background: var(--c);
    color: var(--vscode-editor-background);
    border-radius: 9px;
    padding: 0 6px;
    font-size: 0.75em;
    font-weight: 700;
  }
  .actions { display: flex; gap: 1px; opacity: 0; flex: 0 0 auto; }
  .card:hover .actions { opacity: 1; }
  button.icon {
    border: none;
    background: transparent;
    color: var(--vscode-icon-foreground, var(--vscode-foreground));
    padding: 2px 3px;
    border-radius: 3px;
    line-height: 1;
  }
  button.icon:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.2)); }

  .sessions { margin: 4px 0 0 6px; display: flex; flex-direction: column; gap: 1px; }
  .session {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 4px;
    border-radius: 3px;
    cursor: pointer;
  }
  .session:hover { background: var(--vscode-list-hoverBackground); }
  .sdot { width: 6px; height: 6px; border-radius: 50%; background: var(--c); flex: 0 0 auto; }
  .slabel { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sclose { opacity: 0; }
  .session:hover .sclose { opacity: 1; }
</style>
</head>
<body>
<div id="app"></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const app = document.getElementById('app');
  let projects = [];

  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'state') {
      projects = e.data.projects || [];
      render();
    }
  });

  function send(type, id) { vscode.postMessage({ type, id }); }

  function iconBtn(text, title, on) {
    const b = document.createElement('button');
    b.className = 'icon';
    b.textContent = text;
    b.title = title;
    b.addEventListener('click', on);
    return b;
  }

  function sessionRow(s) {
    const row = document.createElement('div');
    row.className = 'session';
    row.addEventListener('click', () => send('focusSession', s.id));
    const dot = document.createElement('span'); dot.className = 'sdot';
    const lbl = document.createElement('span'); lbl.className = 'slabel';
    lbl.textContent = s.label; lbl.title = s.cwd;
    const close = iconBtn('✕', '關閉 terminal', (ev) => { ev.stopPropagation(); send('closeSession', s.id); });
    close.className = 'icon sclose';
    row.append(dot, lbl, close);
    return row;
  }

  function card(p) {
    const el = document.createElement('div');
    el.className = 'card' + (p.active ? ' active' : '');
    el.style.setProperty('--proj-color', p.colorVar);

    const header = document.createElement('div');
    header.className = 'card-header';
    const dot = document.createElement('span'); dot.className = 'dot';
    dot.textContent = p.emoji || '';
    const name = document.createElement('span'); name.className = 'name';
    name.textContent = p.name; name.title = p.path;
    name.addEventListener('click', () => send('openProject', p.id));
    header.append(dot, name);

    if (p.sessions.length) {
      const badge = document.createElement('span'); badge.className = 'badge';
      badge.textContent = String(p.sessions.length);
      header.append(badge);
    }

    const actions = document.createElement('span'); actions.className = 'actions';
    actions.append(
      iconBtn('＋', '開新 terminal', (ev) => { ev.stopPropagation(); send('newSession', p.id); }),
      iconBtn('🎨', '設定顏色', (ev) => { ev.stopPropagation(); send('setColor', p.id); }),
      iconBtn('✎', '重新命名', (ev) => { ev.stopPropagation(); send('rename', p.id); }),
      iconBtn('🗑', '移除專案', (ev) => { ev.stopPropagation(); send('remove', p.id); })
    );
    header.append(actions);
    el.append(header);

    if (p.sessions.length) {
      const list = document.createElement('div'); list.className = 'sessions';
      p.sessions.forEach((s) => list.append(sessionRow(s)));
      el.append(list);
    }
    return el;
  }

  function render() {
    app.textContent = '';
    if (!projects.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      const msg = document.createElement('div');
      msg.textContent = '尚無專案。';
      const btn = document.createElement('button');
      btn.className = 'primary';
      btn.textContent = '＋ 新增專案';
      btn.addEventListener('click', () => send('addProject'));
      empty.append(msg, btn);
      app.append(empty);
      return;
    }
    projects.forEach((p, i) => {
      if (i > 0) {
        const hr = document.createElement('hr'); hr.className = 'sep';
        app.append(hr);
      }
      app.append(card(p));
    });
  }

  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
