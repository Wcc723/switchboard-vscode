import * as vscode from 'vscode';
import { ProjectStore, type Project } from './projectStore';
import { SessionManager } from './sessionManager';
import { FilesTreeProvider, FileNode } from './filesTree';
import { ProjectDecorationProvider } from './fileDecorations';
import {
  ProjectsWebviewProvider,
  type WebviewActions,
} from './projectsWebview';
import {
  ensureFolderInWorkspace,
  removeFolderFromWorkspace,
} from './workspaceFolders';
import { PALETTE, emojiFor, themeColorFor } from './colors';

export function activate(context: vscode.ExtensionContext): void {
  const store = new ProjectStore(context);
  const sessions = new SessionManager(context);
  const decorations = new ProjectDecorationProvider(store);
  const filesProvider = new FilesTreeProvider(store);
  context.subscriptions.push(store, sessions, decorations, filesProvider);

  // Reliable folder drop: a TreeView drag-and-drop controller receives a
  // text/uri-list for both OS (Finder) and Explorer drags, so dropping a folder
  // onto the Files view adds it as a project. (The Projects webview can't get OS
  // paths on newer VS Code, so this native tree is the dependable drop target.)
  const dropController: vscode.TreeDragAndDropController<FileNode> = {
    dropMimeTypes: ['text/uri-list'],
    dragMimeTypes: [],
    async handleDrop(_target, dataTransfer) {
      const item = dataTransfer.get('text/uri-list');
      if (!item) {
        return;
      }
      const raw = await item.asString();
      const paths: string[] = [];
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
          continue;
        }
        try {
          paths.push(vscode.Uri.parse(trimmed, true).fsPath);
        } catch {
          /* ignore malformed URIs */
        }
      }
      if (paths.length) {
        await addPaths(paths);
      }
    },
  };

  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(decorations),
    vscode.window.createTreeView('projectSwitch.files', {
      treeDataProvider: filesProvider,
      showCollapseAll: true,
      dragAndDropController: dropController,
    })
  );

  // --- Actions (shared by the webview and the command palette) ---------------

  // Add a folder to the workspace only when the user opted in. Off by default
  // because adding the first folder to an empty window reloads VS Code (which
  // resets terminals + re-warms shell integration). TermDeck's Files view and
  // terminals don't need the folder to be in the workspace.
  function maybeAddFolder(folderPath: string): void {
    const enabled = vscode.workspace
      .getConfiguration('projectSwitch')
      .get<boolean>('addToWorkspace', false);
    if (enabled) {
      ensureFolderInWorkspace(folderPath);
    }
  }

  async function addProject(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: true,
      openLabel: vscode.l10n.t('Add Project'),
      title: vscode.l10n.t('Select project folders to add'),
    });
    if (!uris?.length) {
      return;
    }
    for (const uri of uris) {
      const project = await store.addProject(uri.fsPath);
      maybeAddFolder(project.path);
    }
  }

  /** Add projects from dropped filesystem paths; only real directories count. */
  async function addPaths(rawPaths: string[]): Promise<void> {
    const seen = new Set<string>();
    let added = 0;
    let rejected = 0;
    for (const p of rawPaths) {
      if (!p || seen.has(p)) {
        continue;
      }
      seen.add(p);
      let stat: vscode.FileStat;
      try {
        stat = await vscode.workspace.fs.stat(vscode.Uri.file(p));
      } catch {
        rejected++;
        continue;
      }
      if ((stat.type & vscode.FileType.Directory) === 0) {
        rejected++;
        continue;
      }
      const isNew = !store.getProjects().some((x) => x.path === p);
      const project = await store.addProject(p);
      maybeAddFolder(project.path);
      if (isNew) {
        added++;
      }
    }
    if (added === 0 && rejected > 0) {
      void vscode.window.showWarningMessage(
        vscode.l10n.t('Drop a folder to add a project.')
      );
    }
  }

  function openProject(project: Project): void {
    store.setActive(project.id);
    maybeAddFolder(project.path);
    // Note: deliberately does NOT reveal in the native Explorer — clicking a
    // project should not steal focus to the file explorer.
    const mode = vscode.workspace
      .getConfiguration('projectSwitch')
      .get<string>('onProjectClick', 'focusOrStartSession');
    if (mode === 'focusOnly') {
      sessions.focusLatest(project);
    } else if (mode === 'alwaysNewSession') {
      sessions.createSession(project);
    } else {
      sessions.focusOrCreate(project);
    }
  }

  function newSession(project: Project, cwd?: string): void {
    store.setActive(project.id);
    maybeAddFolder(project.path);
    sessions.createSession(project, cwd);
  }

  async function setColor(project: Project): Promise<void> {
    type ColorPick = vscode.QuickPickItem & { colorId: string | undefined };
    const current = vscode.l10n.t('Current');
    const items: ColorPick[] = PALETTE.map((c) => ({
      label: `${c.emoji} ${vscode.l10n.t(c.label)}`,
      description: project.color === c.id ? current : undefined,
      colorId: c.id,
    }));
    items.push({
      label: `$(history) ${vscode.l10n.t('Auto (colour by name)')}`,
      description: project.color === undefined ? current : undefined,
      colorId: undefined,
    });
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: vscode.l10n.t('Choose a colour for "{0}"', project.name),
    });
    if (picked) {
      await store.setColor(project.id, picked.colorId);
    }
  }

  async function renameProject(project: Project): Promise<void> {
    const name = await vscode.window.showInputBox({
      prompt: vscode.l10n.t('Project name'),
      value: project.name,
    });
    if (name?.trim()) {
      await store.renameProject(project.id, name.trim());
    }
  }

  async function removeProject(project: Project): Promise<void> {
    const count = sessions.getSessions(project.id).length;
    const detail =
      count > 0
        ? vscode.l10n.t('This will close {0} running terminal(s).', String(count))
        : undefined;
    const remove = vscode.l10n.t('Remove');
    const confirm = await vscode.window.showWarningMessage(
      vscode.l10n.t('Remove "{0}" from the list?', project.name),
      { modal: true, detail },
      remove
    );
    if (confirm !== remove) {
      return;
    }
    sessions.closeProjectSessions(project.id);
    removeFolderFromWorkspace(project.path);
    await store.removeProject(project.id);
  }

  /** The "⋯ more" overflow menu for a project card (colour / rename / remove). */
  async function showMore(project: Project): Promise<void> {
    type MoreItem = vscode.QuickPickItem & { run: () => void | Promise<void> };
    const items: MoreItem[] = [
      { label: `$(symbol-color) ${vscode.l10n.t('Set colour')}`, run: () => setColor(project) },
      { label: `$(edit) ${vscode.l10n.t('Rename')}`, run: () => renameProject(project) },
      { label: `$(trash) ${vscode.l10n.t('Remove')}`, run: () => removeProject(project) },
    ];
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: project.name,
    });
    if (picked) {
      await picked.run();
    }
  }

  const byId = (id: string): Project | undefined => store.getProject(id);

  const actions: WebviewActions = {
    addProject: () => void addProject(),
    addPaths: (paths) => void addPaths(paths),
    openProject: (id) => {
      const p = byId(id);
      if (p) void openProject(p);
    },
    newSession: (id) => {
      const p = byId(id);
      if (p) newSession(p);
    },
    focusSession: (id) => {
      const s = sessions.findSessionById(id);
      if (s) sessions.focusSession(s);
    },
    closeSession: (id) => {
      const s = sessions.findSessionById(id);
      if (s) sessions.closeSession(s);
    },
    setColor: (id) => {
      const p = byId(id);
      if (p) void setColor(p);
    },
    renameProject: (id) => {
      const p = byId(id);
      if (p) void renameProject(p);
    },
    removeProject: (id) => {
      const p = byId(id);
      if (p) void removeProject(p);
    },
    showMore: (id) => {
      const p = byId(id);
      if (p) void showMore(p);
    },
  };

  const webviewProvider = new ProjectsWebviewProvider(
    context.extensionUri,
    store,
    sessions,
    actions
  );
  context.subscriptions.push(
    webviewProvider,
    vscode.window.registerWebviewViewProvider(
      ProjectsWebviewProvider.viewType,
      webviewProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // A status-bar chip showing which project the active terminal belongs to.
  // (The terminal viewport itself is xterm-owned; an extension can't draw a
  // band there, so this is the always-visible "which project" indicator.)
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  context.subscriptions.push(statusBar);

  const updateStatusBar = (terminal?: vscode.Terminal): void => {
    const term = terminal ?? vscode.window.activeTerminal;
    const session = term ? sessions.findSessionByTerminal(term) : undefined;
    const project = session ? store.getProject(session.projectId) : undefined;
    if (!project) {
      statusBar.hide();
      return;
    }
    const running = session?.runningCommand ? ` · ${session.runningCommand}` : '';
    statusBar.text = `${emojiFor(project)} ${project.name}${running}`;
    statusBar.color = themeColorFor(project);
    statusBar.tooltip = `TermDeck — ${project.path}`;
    statusBar.show();
  };

  // Integrate with the native terminal list: focusing one of our terminals
  // (anywhere) marks its project active and updates the status-bar chip.
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTerminal((terminal) => {
      const session = terminal
        ? sessions.findSessionByTerminal(terminal)
        : undefined;
      if (session) {
        store.setActive(session.projectId);
      }
      updateStatusBar(terminal);
    }),
    sessions.onDidChange(() => updateStatusBar())
  );
  updateStatusBar();

  // --- Commands (palette + FILES tree menus) ---------------------------------

  const pickProject = async (): Promise<Project | undefined> => {
    const projects = store.getProjects();
    if (projects.length === 0) {
      return undefined;
    }
    const picked = await vscode.window.showQuickPick(
      projects.map((p) => ({ label: p.name, description: p.path, id: p.id })),
      { placeHolder: vscode.l10n.t('Select a project') }
    );
    return picked ? byId(picked.id) : undefined;
  };

  const register = (id: string, fn: (...args: any[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  register('projectSwitch.addProject', () => addProject());
  register('projectSwitch.refresh', () => filesProvider.refresh());

  register('projectSwitch.openTerminalHere', (arg: unknown) => {
    if (!(arg instanceof FileNode) || arg.fileType !== vscode.FileType.Directory) {
      return;
    }
    const id = store.activeProjectId;
    const project = id ? byId(id) : undefined;
    if (project) {
      newSession(project, arg.uri.fsPath);
    }
  });

  register('projectSwitch.newSession', async () => {
    const project = await pickProject();
    if (project) newSession(project);
  });
  register('projectSwitch.setColor', async () => {
    const project = await pickProject();
    if (project) await setColor(project);
  });
  register('projectSwitch.renameProject', async () => {
    const project = await pickProject();
    if (project) await renameProject(project);
  });
  register('projectSwitch.removeProject', async () => {
    const project = await pickProject();
    if (project) await removeProject(project);
  });
}

export function deactivate(): void {
  // Disposables are cleaned up via context.subscriptions.
}
