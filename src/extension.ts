import * as vscode from 'vscode';
import { ProjectStore, type Project } from './projectStore';
import { SessionManager } from './sessionManager';
import {
  ProjectsTreeProvider,
  ProjectNode,
  CategoryNode,
  SessionNode,
  FileNode,
} from './projectsTree';
import {
  ensureFolderInWorkspace,
  removeFolderFromWorkspace,
} from './workspaceFolders';

export function activate(context: vscode.ExtensionContext): void {
  const store = new ProjectStore(context);
  const sessions = new SessionManager(context);
  const tree = new ProjectsTreeProvider(store, sessions);
  context.subscriptions.push(store, sessions, tree);

  context.subscriptions.push(
    vscode.window.createTreeView('projectSwitch.projects', {
      treeDataProvider: tree,
      showCollapseAll: true,
    })
  );

  /** Resolve the target project from a command argument (tree node) or via quick pick. */
  const resolveProject = async (arg: unknown): Promise<Project | undefined> => {
    if (arg instanceof ProjectNode || arg instanceof CategoryNode || arg instanceof FileNode) {
      return arg.project;
    }
    if (arg instanceof SessionNode) {
      return store.getProject(arg.session.projectId);
    }
    const projects = store.getProjects();
    if (projects.length === 0) {
      return undefined;
    }
    const picked = await vscode.window.showQuickPick(
      projects.map((p) => ({ label: p.name, description: p.path, id: p.id })),
      { placeHolder: '選擇專案' }
    );
    return picked ? store.getProject(picked.id) : undefined;
  };

  const register = (id: string, fn: (...args: any[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  register('projectSwitch.addProject', async () => {
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
  });

  register('projectSwitch.openProject', async (arg: unknown) => {
    const project = await resolveProject(arg);
    if (!project) {
      return;
    }
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
  });

  register('projectSwitch.newSession', async (arg: unknown) => {
    const project = await resolveProject(arg);
    if (!project) {
      return;
    }
    store.setActive(project.id);
    ensureFolderInWorkspace(project.path);
    sessions.createSession(project);
  });

  register('projectSwitch.openTerminalHere', (arg: unknown) => {
    if (arg instanceof FileNode && arg.fileType === vscode.FileType.Directory) {
      store.setActive(arg.project.id);
      ensureFolderInWorkspace(arg.project.path);
      sessions.createSession(arg.project, arg.uri.fsPath);
    }
  });

  register('projectSwitch.focusSession', (arg: unknown) => {
    if (arg instanceof SessionNode) {
      sessions.focusSession(arg.session);
    }
  });

  register('projectSwitch.closeSession', (arg: unknown) => {
    if (arg instanceof SessionNode) {
      sessions.closeSession(arg.session);
    }
  });

  register('projectSwitch.renameProject', async (arg: unknown) => {
    const project = await resolveProject(arg);
    if (!project) {
      return;
    }
    const name = await vscode.window.showInputBox({
      prompt: '專案名稱',
      value: project.name,
    });
    if (name?.trim()) {
      await store.renameProject(project.id, name.trim());
    }
  });

  register('projectSwitch.removeProject', async (arg: unknown) => {
    const project = await resolveProject(arg);
    if (!project) {
      return;
    }
    const sessionCount = sessions.getSessions(project.id).length;
    const detail =
      sessionCount > 0
        ? `這會關閉 ${sessionCount} 個正在執行的 terminal。`
        : undefined;
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
  });

  register('projectSwitch.refresh', () => tree.refresh());
}

export function deactivate(): void {
  // Disposables are cleaned up via context.subscriptions.
}
