import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import type { ProjectStore } from './projectStore';
import type { SessionManager } from './sessionManager';
import { resolveColorId } from './colors';

export interface WebviewActions {
  addProject(): void;
  /** Add one or more projects from dropped filesystem paths. */
  addPaths(paths: string[]): void;
  openProject(projectId: string): void;
  newSession(projectId: string): void;
  focusSession(sessionId: string): void;
  closeSession(sessionId: string): void;
  setColor(projectId: string): void;
  renameProject(projectId: string): void;
  removeProject(projectId: string): void;
  /** Open the "⋯ more" overflow menu (colour / rename / remove). */
  showMore(projectId: string): void;
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

  private onMessage(msg: { type: string; id?: string; paths?: string[] }): void {
    switch (msg?.type) {
      case 'ready':
        this.postState();
        break;
      case 'addProject':
        this.actions.addProject();
        break;
      case 'dropFolders':
        if (msg.paths?.length) this.actions.addPaths(msg.paths);
        break;
      case 'dropUnresolved':
        void vscode.window.showWarningMessage(
          vscode.l10n.t(
            "Couldn't read the dropped item's path. Drop the folder onto the Files list below, or use the ＋ Add Project button."
          )
        );
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
      case 'more':
        if (msg.id) this.actions.showMore(msg.id);
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

    // Localized strings used by the client-side render code.
    const str = {
      empty: vscode.l10n.t('No projects yet.'),
      addProject: vscode.l10n.t('Add Project'),
      dragHint: vscode.l10n.t('or drag a folder here'),
      dropHere: vscode.l10n.t('Drop to add as a project'),
      newTerminal: vscode.l10n.t('New terminal'),
      more: vscode.l10n.t('More actions'),
      closeTerminal: vscode.l10n.t('Close terminal'),
    };

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
  .empty .hint { margin-top: 10px; font-size: 0.9em; opacity: 0.85; }
  button { font-family: inherit; cursor: pointer; }

  /* Drop overlay shown while dragging folders over the panel. */
  #dropzone {
    position: fixed; inset: 4px;
    display: none;
    flex-direction: column; align-items: center; justify-content: center;
    gap: 8px;
    background: color-mix(in srgb, var(--vscode-focusBorder) 12%, transparent);
    border: 2px dashed var(--vscode-focusBorder);
    border-radius: 8px;
    color: var(--vscode-foreground);
    font-weight: 600;
    text-align: center;
    pointer-events: none;
    z-index: 10;
  }
  #dropzone .codicon { font-size: 26px; }
  body.dragging #dropzone { display: flex; }
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
  .name {
    flex: 1 1 auto;
    font-weight: 600;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    cursor: pointer;
  }
  /* Leading badge: terminal count (replaces the old colour dot). */
  .count {
    flex: 0 0 auto;
    min-width: 18px;
    text-align: center;
    background: color-mix(in srgb, var(--c) 30%, var(--vscode-badge-background));
    color: var(--vscode-badge-foreground);
    border-radius: 9px;
    padding: 0 6px;
    font-size: 0.78em;
    font-weight: 700;
  }
  .count.running {
    background: color-mix(in srgb, var(--c) 60%, var(--vscode-badge-background));
    animation: td-pulse 1.7s ease-in-out infinite;
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

  .sessions { margin: 5px 0 1px; display: flex; flex-direction: column; gap: 2px; }
  .session {
    display: flex; align-items: center; gap: 7px;
    padding: 4px 5px 4px 7px;
    border-radius: 5px;
    cursor: pointer;
    color: var(--vscode-descriptionForeground);
    transition: background 0.12s ease, color 0.12s ease;
  }
  .session:hover { background: var(--vscode-list-hoverBackground); color: var(--vscode-foreground); }
  .session.active {
    color: var(--vscode-foreground);
    background: color-mix(in srgb, var(--c) 26%, var(--vscode-editor-background));
  }
  .session.active:hover {
    background: color-mix(in srgb, var(--c) 34%, var(--vscode-editor-background));
  }
  .sdot {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--c); flex: 0 0 auto;
    opacity: 0.4; transition: opacity 0.12s ease;
  }
  .session:hover .sdot, .session.active .sdot { opacity: 1; }
  @keyframes td-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  .session.running .sdot {
    opacity: 1;
    animation: td-pulse 1.7s ease-in-out infinite;
  }
  .session.running .slabel { color: var(--vscode-foreground); font-weight: 600; }
  .smain { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 6px; }
  .slabel { flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .session.active .slabel { font-weight: 600; }
  .scwd { flex: 0 1 auto; opacity: 0.7; font-size: 0.85em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sclose { flex: 0 0 auto; opacity: 0; width: 20px; height: 20px; }
  .session:hover .sclose { opacity: 0.85; }
</style>
</head>
<body>
<div id="app"></div>
<div id="dropzone"><i class="codicon codicon-new-folder"></i><span id="dropText"></span></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const STR = ${JSON.stringify(str)};
  const app = document.getElementById('app');
  document.getElementById('dropText').textContent = STR.dropHere;
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
    row.className = 'session' + (s.active ? ' active' : '') + (s.running ? ' running' : '');
    row.addEventListener('click', () => send('focusSession', s.id));

    const dot = document.createElement('span'); dot.className = 'sdot';
    const main = document.createElement('span'); main.className = 'smain';
    const lbl = document.createElement('span'); lbl.className = 'slabel';
    lbl.textContent = s.running || s.label; lbl.title = s.cwd;
    main.appendChild(lbl);
    if (s.running) {
      const cwd = document.createElement('span'); cwd.className = 'scwd';
      cwd.textContent = s.label; cwd.title = s.cwd;
      main.appendChild(cwd);
    }
    const close = iconBtn('close', STR.closeTerminal, (ev) => { ev.stopPropagation(); send('closeSession', s.id); });
    close.classList.add('sclose');

    row.append(dot, main, close);
    return row;
  }

  function card(p) {
    const el = document.createElement('div');
    el.className = 'card' + (p.active ? ' active' : '');
    el.style.setProperty('--proj-color', p.colorVar);

    const running = p.sessions.some((s) => s.running);

    const header = document.createElement('div');
    header.className = 'card-header';

    // Leading badge shows the terminal count (replaces the old colour dot).
    const count = document.createElement('span');
    count.className = 'count' + (running ? ' running' : '');
    count.textContent = String(p.sessions.length);

    const name = document.createElement('span'); name.className = 'name';
    name.textContent = p.name; name.title = p.path;
    name.addEventListener('click', () => send('openProject', p.id));

    // Single row: keep only "＋ new terminal"; the rest go into a "⋯ more" menu.
    const actions = document.createElement('span'); actions.className = 'actions';
    actions.append(
      iconBtn('add', STR.newTerminal, (ev) => { ev.stopPropagation(); send('newSession', p.id); }),
      iconBtn('ellipsis', STR.more, (ev) => { ev.stopPropagation(); send('more', p.id); })
    );

    header.append(count, name, actions);
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
      msg.textContent = STR.empty;
      const btn = document.createElement('button');
      btn.className = 'primary';
      btn.textContent = STR.addProject;
      btn.addEventListener('click', () => send('addProject'));
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = STR.dragHint;
      empty.append(msg, btn, hint);
      app.append(empty);
      return;
    }
    projects.forEach((p) => app.append(card(p)));
  }

  // --- Drag & drop: best-effort. Drop a folder onto the card to add it. -------
  // A webview can only resolve an OS path via the legacy File.path (removed in
  // newer Electron) or a text/uri-list. When neither yields a path we tell the
  // user to drop onto the native Files tree instead (the reliable target). The
  // extension host validates that each path is a directory before adding it.
  function pathsFromDrop(dt) {
    const out = [];
    if (dt && dt.files && dt.files.length) {
      for (const f of dt.files) { if (f && f.path) out.push(f.path); }
    }
    if (!out.length && dt) {
      const list = dt.getData('text/uri-list') || dt.getData('text/plain') || '';
      list.split(/\\r?\\n/).forEach((line) => {
        line = line.trim();
        if (!line || line.charAt(0) === '#' || line.indexOf('file:') !== 0) return;
        try {
          let p = decodeURIComponent(new URL(line).pathname);
          // On Windows a drive path looks like /C:/... — strip the leading slash.
          if (/^\\/[a-zA-Z]:\\//.test(p)) p = p.slice(1);
          out.push(p);
        } catch (_e) { /* ignore malformed URIs */ }
      });
    }
    return out;
  }

  let dragDepth = 0;
  function setDragging(on) { document.body.classList.toggle('dragging', on); }

  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragDepth++;
    setDragging(true);
  });
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) setDragging(false);
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    setDragging(false);
    const dt = e.dataTransfer;
    const paths = pathsFromDrop(dt);
    if (paths.length) {
      vscode.postMessage({ type: 'dropFolders', paths });
    } else if (dt && dt.files && dt.files.length) {
      // Something was dropped but we couldn't resolve a filesystem path
      // (e.g. a VS Code build where File.path is unavailable).
      vscode.postMessage({ type: 'dropUnresolved' });
    }
  });

  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
