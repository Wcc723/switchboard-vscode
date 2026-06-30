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
import { PALETTE } from './colors';

export function activate(context: vscode.ExtensionContext): void {
  const store = new ProjectStore(context);
  const sessions = new SessionManager(context);
  const decorations = new ProjectDecorationProvider(store, sessions);
  const filesProvider = new FilesTreeProvider(store);
  context.subscriptions.push(store, sessions, decorations, filesProvider);

  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(decorations),
    vscode.window.createTreeView('projectSwitch.files', {
      treeDataProvider: filesProvider,
      showCollapseAll: true,
    })
  );

  // --- Actions (shared by the webview and the command palette) ---------------

  async function addProject(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: true,
      openLabel: '加入專案',
      title: '選擇要加入的專案資料夾',
    });
    if (!uris?.length) {
      return;
    }
    for (const uri of uris) {
      const project = await store.addProject(uri.fsPath);
      ensureFolderInWorkspace(project.path);
    }
  }

  async function openProject(project: Project): Promise<void> {
    store.setActive(project.id);
    ensureFolderInWorkspace(project.path);
    try {
      await vscode.commands.executeCommand(
        'revealInExplorer',
        vscode.Uri.file(project.path)
      );
    } catch {
      // Explorer may be unavailable; ignore.
    }
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
    ensureFolderInWorkspace(project.path);
    sessions.createSession(project, cwd);
  }

  async function setColor(project: Project): Promise<void> {
    type ColorPick = vscode.QuickPickItem & { colorId: string | undefined };
    const items: ColorPick[] = PALETTE.map((c) => ({
      label: c.label,
      description: project.color === c.id ? '目前' : undefined,
      colorId: c.id,
    }));
    items.push({
      label: '$(history) 自動（依名稱配色）',
      description: project.color === undefined ? '目前' : undefined,
      colorId: undefined,
    });
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: `選擇「${project.name}」的顏色`,
    });
    if (picked) {
      await store.setColor(project.id, picked.colorId);
    }
  }

  async function renameProject(project: Project): Promise<void> {
    const name = await vscode.window.showInputBox({
      prompt: '專案名稱',
      value: project.name,
    });
    if (name?.trim()) {
      await store.renameProject(project.id, name.trim());
    }
  }

  async function removeProject(project: Project): Promise<void> {
    const count = sessions.getSessions(project.id).length;
    const detail =
      count > 0 ? `這會關閉 ${count} 個正在執行的 terminal。` : undefined;
    const confirm = await vscode.window.showWarningMessage(
      `從清單移除「${project.name}」？`,
      { modal: true, detail },
      '移除'
    );
    if (confirm !== '移除') {
      return;
    }
    sessions.closeProjectSessions(project.id);
    removeFolderFromWorkspace(project.path);
    await store.removeProject(project.id);
  }

  const byId = (id: string): Project | undefined => store.getProject(id);

  const actions: WebviewActions = {
    addProject: () => void addProject(),
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
  };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ProjectsWebviewProvider.viewType,
      new ProjectsWebviewProvider(store, sessions, actions),
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // Integrate with the native terminal list: focusing one of our terminals
  // (anywhere) marks its project active, so the panel highlights it.
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTerminal((terminal) => {
      if (!terminal) {
        return;
      }
      const session = sessions.findSessionByTerminal(terminal);
      if (session) {
        store.setActive(session.projectId);
      }
    })
  );

  // --- Commands (palette + FILES tree menus) ---------------------------------

  const pickProject = async (): Promise<Project | undefined> => {
    const projects = store.getProjects();
    if (projects.length === 0) {
      return undefined;
    }
    const picked = await vscode.window.showQuickPick(
      projects.map((p) => ({ label: p.name, description: p.path, id: p.id })),
      { placeHolder: '選擇專案' }
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
