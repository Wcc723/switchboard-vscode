import * as vscode from 'vscode';
import { sep } from 'path';
import type { Project, ProjectStore } from './projectStore';
import type { SessionManager } from './sessionManager';
import { resolveColorId } from './colors';

/**
 * Colours every file/folder by the project that owns it, using its palette
 * colour. Decorations show up in our FILES tree, the native Explorer, and
 * editor tabs — so an opened file is instantly identifiable by project.
 *
 * (Editor tabs require `workbench.editor.decorations.colors: true`.)
 */
export class ProjectDecorationProvider
  implements vscode.FileDecorationProvider, vscode.Disposable
{
  private readonly _onDidChange = new vscode.EventEmitter<
    vscode.Uri | vscode.Uri[] | undefined
  >();
  readonly onDidChangeFileDecorations = this._onDidChange.event;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly store: ProjectStore,
    private readonly sessions: SessionManager
  ) {
    this.disposables.push(
      // Re-decorate when projects/colours change or terminal counts change.
      store.onDidChange(() => this._onDidChange.fire(undefined)),
      sessions.onDidChange(() => this._onDidChange.fire(undefined))
    );
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme !== 'file') {
      return undefined;
    }
    const project = this.owningProject(uri);
    if (!project) {
      return undefined;
    }
    const color = new vscode.ThemeColor(resolveColorId(project));
    if (uri.fsPath === project.path) {
      // Project root: badge shows the live terminal count (status at a glance).
      const count = this.sessions.getSessions(project.id).length;
      const badge = count > 0 ? String(count).slice(0, 2) : undefined;
      return new vscode.FileDecoration(badge, project.name, color);
    }
    return new vscode.FileDecoration(undefined, project.name, color);
  }

  /** The deepest registered project whose folder contains this uri. */
  private owningProject(uri: vscode.Uri): Project | undefined {
    const path = uri.fsPath;
    return this.store
      .getProjects()
      .filter((p) => path === p.path || path.startsWith(p.path + sep))
      .sort((a, b) => b.path.length - a.path.length)[0];
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this._onDidChange.dispose();
  }
}
