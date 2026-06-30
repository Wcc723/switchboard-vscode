import * as vscode from 'vscode';
import type { ProjectStore } from './projectStore';

export class FileNode {
  constructor(
    public readonly uri: vscode.Uri,
    public readonly fileType: vscode.FileType
  ) {}
}

/**
 * A native file tree for the *active* project only. Kept native (not in the
 * webview) so files keep the user's file-icon theme and project colouring via
 * the FileDecorationProvider.
 */
export class FilesTreeProvider
  implements vscode.TreeDataProvider<FileNode>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    FileNode | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly disposables: vscode.Disposable[] = [];
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private watchedProjectId: string | undefined;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly store: ProjectStore) {
    this.disposables.push(
      store.onDidChange(() => {
        this.syncWatcher();
        this.refresh();
      })
    );
    this.syncWatcher();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(node: FileNode): vscode.TreeItem {
    const isDir = node.fileType === vscode.FileType.Directory;
    const item = new vscode.TreeItem(
      node.uri,
      isDir
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );
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

  async getChildren(node?: FileNode): Promise<FileNode[]> {
    if (!node) {
      const id = this.store.activeProjectId;
      const project = id ? this.store.getProject(id) : undefined;
      if (!project) {
        return [];
      }
      return this.readDir(vscode.Uri.file(project.path));
    }
    if (node.fileType === vscode.FileType.Directory) {
      return this.readDir(node.uri);
    }
    return [];
  }

  private async readDir(uri: vscode.Uri): Promise<FileNode[]> {
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
      ([name, type]) => new FileNode(vscode.Uri.joinPath(uri, name), type)
    );
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
