import * as vscode from 'vscode';
import type { Project, ProjectStore } from './projectStore';
import type { Session, SessionManager } from './sessionManager';
import { themeColorFor } from './colors';

export class ProjectNode {
  readonly kind = 'project' as const;
  constructor(
    public readonly project: Project,
    public readonly active: boolean
  ) {}
}

export class CategoryNode {
  readonly kind = 'category' as const;
  constructor(
    public readonly category: 'terminals' | 'files',
    public readonly project: Project
  ) {}
}

export class SessionNode {
  readonly kind = 'session' as const;
  constructor(public readonly session: Session) {}
}

export class FileNode {
  readonly kind = 'file' as const;
  constructor(
    public readonly project: Project,
    public readonly uri: vscode.Uri,
    public readonly fileType: vscode.FileType
  ) {}
}

export type TreeNode = ProjectNode | CategoryNode | SessionNode | FileNode;

const { Expanded, Collapsed, None } = vscode.TreeItemCollapsibleState;

/**
 * Tree layout (Layout A):
 *   Project
 *     ├─ TERMINALS   → sessions (terminals), each labelled by its cwd
 *     └─ FILES       → lazy filesystem tree (open files; open terminal in any folder)
 */
export class ProjectsTreeProvider
  implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    TreeNode | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly disposables: vscode.Disposable[] = [];
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private watchedProjectId: string | undefined;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly store: ProjectStore,
    private readonly sessions: SessionManager
  ) {
    this.disposables.push(
      store.onDidChange(() => {
        this.syncWatcher();
        this.refresh();
      }),
      sessions.onDidChange(() => this.refresh())
    );
    this.syncWatcher();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    switch (node.kind) {
      case 'project':
        return this.projectItem(node);
      case 'category':
        return this.categoryItem(node);
      case 'session':
        return this.sessionItem(node);
      case 'file':
        return this.fileItem(node);
    }
  }

  async getChildren(node?: TreeNode): Promise<TreeNode[]> {
    if (!node) {
      const activeId = this.store.activeProjectId;
      return this.store
        .getProjects()
        .map((p) => new ProjectNode(p, p.id === activeId));
    }
    if (node.kind === 'project') {
      return [
        new CategoryNode('terminals', node.project),
        new CategoryNode('files', node.project),
      ];
    }
    if (node.kind === 'category') {
      if (node.category === 'terminals') {
        return this.sessions
          .getSessions(node.project.id)
          .map((s) => new SessionNode(s));
      }
      return this.readDir(node.project, vscode.Uri.file(node.project.path));
    }
    if (node.kind === 'file' && node.fileType === vscode.FileType.Directory) {
      return this.readDir(node.project, node.uri);
    }
    return [];
  }

  private async readDir(
    project: Project,
    uri: vscode.Uri
  ): Promise<FileNode[]> {
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(uri);
    } catch {
      return [];
    }
    entries.sort((a, b) => {
      const aDir = a[1] === vscode.FileType.Directory;
      const bDir = b[1] === vscode.FileType.Directory;
      if (aDir !== bDir) {
        return aDir ? -1 : 1;
      }
      return a[0].localeCompare(b[0]);
    });
    return entries.map(
      ([name, type]) =>
        new FileNode(project, vscode.Uri.joinPath(uri, name), type)
    );
  }

  private projectItem(node: ProjectNode): vscode.TreeItem {
    const p = node.project;
    const color = themeColorFor(p);
    const state = node.active ? Expanded : Collapsed;
    const item = new vscode.TreeItem(p.name, state);
    // Encode the desired state into the id so VS Code re-applies it on switch
    // (expand the active project's group, collapse the others).
    item.id = `${p.id}:${state}`;
    item.contextValue = 'project';
    item.tooltip = p.path;
    item.iconPath = new vscode.ThemeIcon(
      node.active ? 'circle-large-filled' : 'folder',
      color
    );
    const count = this.sessions.getSessions(p.id).length;
    if (count > 0) {
      item.description = `${count} terminal${count > 1 ? 's' : ''}`;
    }
    item.command = {
      command: 'projectSwitch.openProject',
      title: '切換 / 聚焦專案',
      arguments: [node],
    };
    return item;
  }

  private categoryItem(node: CategoryNode): vscode.TreeItem {
    const p = node.project;
    if (node.category === 'terminals') {
      const count = this.sessions.getSessions(p.id).length;
      const item = new vscode.TreeItem('TERMINALS', count > 0 ? Expanded : None);
      item.id = `${p.id}:terminals`;
      item.contextValue = 'terminalsCategory';
      item.iconPath = new vscode.ThemeIcon('terminal');
      if (count > 0) {
        item.description = String(count);
      }
      return item;
    }
    const item = new vscode.TreeItem('FILES', Collapsed);
    item.id = `${p.id}:files`;
    item.contextValue = 'filesCategory';
    item.iconPath = new vscode.ThemeIcon('files');
    return item;
  }

  private sessionItem(node: SessionNode): vscode.TreeItem {
    const s = node.session;
    const project = this.store.getProject(s.projectId);
    const color = project
      ? themeColorFor(project)
      : new vscode.ThemeColor('terminal.ansiBlue');
    const item = new vscode.TreeItem(s.treeLabel, None);
    item.id = s.id;
    item.contextValue = 'session';
    item.tooltip = s.cwd;
    item.iconPath = new vscode.ThemeIcon('terminal', color);
    item.command = {
      command: 'projectSwitch.focusSession',
      title: '聚焦 terminal',
      arguments: [node],
    };
    return item;
  }

  private fileItem(node: FileNode): vscode.TreeItem {
    const isDir = node.fileType === vscode.FileType.Directory;
    // Passing the uri lets VS Code derive the label and file-icon-theme icon.
    const item = new vscode.TreeItem(node.uri, isDir ? Collapsed : None);
    item.contextValue = isDir ? 'folder' : 'file';
    if (!isDir) {
      item.command = {
        command: 'vscode.open',
        title: '開啟檔案',
        arguments: [node.uri],
      };
    }
    return item;
  }

  private syncWatcher(): void {
    const activeId = this.store.activeProjectId;
    if (activeId === this.watchedProjectId) {
      return;
    }
    this.watchedProjectId = activeId;
    this.fileWatcher?.dispose();
    this.fileWatcher = undefined;

    const project = activeId ? this.store.getProject(activeId) : undefined;
    if (!project) {
      return;
    }
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(project.path), '**/*')
    );
    const onChange = () => this.debouncedRefresh();
    // Only structural changes (create/delete) affect the file tree.
    watcher.onDidCreate(onChange);
    watcher.onDidDelete(onChange);
    this.fileWatcher = watcher;
  }

  private debouncedRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => this.refresh(), 300);
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.fileWatcher?.dispose();
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this._onDidChangeTreeData.dispose();
  }
}
