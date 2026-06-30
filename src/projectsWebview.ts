import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import type { ProjectStore } from './projectStore';
import type { SessionManager } from './sessionManager';
import { resolveColorId } from './colors';

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

/** Maps a theme-color id (e.g. charts.blue) to its webview CSS variable. */
function cssVar(colorId: string): string {
  return `var(--vscode-${colorId.replace(/\./g, '-')})`;
}

/**
 * The Projects panel, rendered as a webview so each project can have a real
 * background colour block and a styled terminal group. Icons use the bundled
 * codicon font (real SVG glyphs, not emoji).
 */
export class ProjectsWebviewProvider
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  public static readonly viewType = 'projectSwitch.projects';

  private view: vscode.WebviewView | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly store: ProjectStore,
    private readonly sessions: SessionManager,
    private readonly actions: WebviewActions
  ) {
    this.disposables.push(
      store.onDidChange(() => this.postState()),
      sessions.onDidChange(() => this.postState()),
      vscode.window.onDidChangeActiveTerminal(() => this.postState())
    );
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')],
    };
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
    const activeTerminal = vscode.window.activeTerminal;
    const activeSession = activeTerminal
      ? this.sessions.findSessionByTerminal(activeTerminal)
      : undefined;

    const projects = this.store.getProjects().map((p) => ({
      id: p.id,
      name: p.name,
      path: p.path,
      colorVar: cssVar(resolveColorId(p)),
      active: p.id === activeId,
      sessions: this.sessions.getSessions(p.id).map((s) => ({
        id: s.id,
        label: s.treeLabel,
        cwd: s.cwd,
        running: s.runningCommand,
        active: s.id === activeSession?.id,
      })),
    }));
    void this.view.webview.postMessage({ type: 'state', projects });
  }

  private html(webview: vscode.Webview): string {
    const nonce = randomUUID().replace(/-/g, '');
    const codiconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'codicon.css')
    );
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link href="${codiconUri}" rel="stylesheet" />
<style>
  body {
    padding: 8px 6px;
    margin: 0;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
  }
  .empty { padding: 18px 12px; text-align: center; color: var(--vscode-descriptionForeground); }
  button { font-family: inherit; cursor: pointer; }
  button.primary {
    margin-top: 10px;
    padding: 5px 12px;
    border: none;
    border-radius: 4px;
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
  }
  button.primary:hover { background: var(--vscode-button-hoverBackground); }

  .card {
    --c: var(--proj-color, var(--vscode-foreground));
    position: relative;
    border-left: 3px solid var(--c);
    border-radius: 6px;
    padding: 7px 9px;
    margin: 0 2px 8px;
    background: color-mix(in srgb, var(--c) 8%, transparent);
    transition: background 0.12s ease;
  }
  .card:hover { background: color-mix(in srgb, var(--c) 13%, transparent); }
  .card.active {
    background: color-mix(in srgb, var(--c) 18%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 45%, transparent);
  }

  .card-header { display: flex; align-items: center; gap: 7px; }
  .cdot { width: 9px; height: 9px; border-radius: 50%; background: var(--c); flex: 0 0 auto; }
  .card:not(.active) .cdot { background: transparent; box-shadow: inset 0 0 0 1.5px var(--c); }
  .name {
    flex: 1 1 auto;
    font-weight: 600;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    cursor: pointer;
  }
  .count {
    flex: 0 0 auto;
    min-width: 16px;
    text-align: center;
    background: color-mix(in srgb, var(--c) 30%, var(--vscode-badge-background));
    color: var(--vscode-badge-foreground);
    border-radius: 9px;
    padding: 0 6px;
    font-size: 0.78em;
    font-weight: 700;
  }
  .actions { display: flex; gap: 1px; flex: 0 0 auto; opacity: 0; transition: opacity 0.1s ease; }
  .card:hover .actions, .card.active .actions { opacity: 1; }
  button.icon {
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px;
    border: none; background: transparent;
    color: var(--vscode-icon-foreground, var(--vscode-foreground));
    border-radius: 4px;
  }
  button.icon:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.18)); }
  button.icon .codicon { font-size: 15px; }

  .sessions { margin: 6px 0 1px; display: flex; flex-direction: column; gap: 1px; }
  .session {
    display: flex; align-items: center; gap: 6px;
    padding: 3px 3px 3px 6px;
    border-radius: 4px;
    cursor: pointer;
    opacity: 0.5;
    transition: opacity 0.1s ease, background 0.1s ease;
  }
  .session:hover { opacity: 0.85; background: var(--vscode-list-hoverBackground); }
  .session.active {
    opacity: 1;
    background: color-mix(in srgb, var(--c) 14%, transparent);
    box-shadow: inset 2px 0 0 var(--c);
  }
  .sdot { width: 6px; height: 6px; border-radius: 50%; background: var(--c); flex: 0 0 auto; }
  .smain { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 6px; }
  .srun { font-size: 12px; flex: 0 0 auto; opacity: 0.8; }
  .slabel { flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .session.active .slabel { font-weight: 600; }
  .scwd { flex: 0 1 auto; opacity: 0.6; font-size: 0.85em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sclose { flex: 0 0 auto; opacity: 0; width: 20px; height: 20px; }
  .session:hover .sclose { opacity: 0.85; }
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

  function codicon(name) {
    const i = document.createElement('i');
    i.className = 'codicon codicon-' + name;
    return i;
  }
  function iconBtn(name, title, on) {
    const b = document.createElement('button');
    b.className = 'icon';
    b.title = title;
    b.appendChild(codicon(name));
    b.addEventListener('click', on);
    return b;
  }

  function sessionRow(s) {
    const row = document.createElement('div');
    row.className = 'session' + (s.active ? ' active' : '');
    row.addEventListener('click', () => send('focusSession', s.id));

    const dot = document.createElement('span'); dot.className = 'sdot';
    const main = document.createElement('span'); main.className = 'smain';
    if (s.running) main.appendChild(codicon('play')).classList.add('srun');
    const lbl = document.createElement('span'); lbl.className = 'slabel';
    lbl.textContent = s.running || s.label; lbl.title = s.cwd;
    main.appendChild(lbl);
    if (s.running) {
      const cwd = document.createElement('span'); cwd.className = 'scwd';
      cwd.textContent = s.label; cwd.title = s.cwd;
      main.appendChild(cwd);
    }
    const close = iconBtn('close', '關閉 terminal', (ev) => { ev.stopPropagation(); send('closeSession', s.id); });
    close.classList.add('sclose');

    row.append(dot, main, close);
    return row;
  }

  function card(p) {
    const el = document.createElement('div');
    el.className = 'card' + (p.active ? ' active' : '');
    el.style.setProperty('--proj-color', p.colorVar);

    const header = document.createElement('div');
    header.className = 'card-header';
    const dot = document.createElement('span'); dot.className = 'cdot';
    const name = document.createElement('span'); name.className = 'name';
    name.textContent = p.name; name.title = p.path;
    name.addEventListener('click', () => send('openProject', p.id));
    header.append(dot, name);

    if (p.sessions.length) {
      const count = document.createElement('span'); count.className = 'count';
      count.textContent = String(p.sessions.length);
      header.append(count);
    }

    const actions = document.createElement('span'); actions.className = 'actions';
    actions.append(
      iconBtn('add', '開新 terminal', (ev) => { ev.stopPropagation(); send('newSession', p.id); }),
      iconBtn('symbol-color', '設定顏色', (ev) => { ev.stopPropagation(); send('setColor', p.id); }),
      iconBtn('edit', '重新命名', (ev) => { ev.stopPropagation(); send('rename', p.id); }),
      iconBtn('trash', '移除專案', (ev) => { ev.stopPropagation(); send('remove', p.id); })
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
      btn.textContent = '新增專案';
      btn.addEventListener('click', () => send('addProject'));
      empty.append(msg, btn);
      app.append(empty);
      return;
    }
    projects.forEach((p) => app.append(card(p)));
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
