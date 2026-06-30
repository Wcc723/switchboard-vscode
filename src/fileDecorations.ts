import * as vscode from 'vscode';
import { sep } from 'path';
import type { Project, ProjectStore } from './projectStore';
import { emojiFor } from './colors';

/**
 * Marks every file/folder with its owning project's colour *emoji dot* — not a
 * text colour. The dot shows in our Files tree, the native Explorer, and editor
 * tabs, so an opened file is identifiable by project without tinting its name.
 *
 * (Editor tabs need `workbench.editor.decorations.badges: true`, which is the
 * default.)
 */
export class ProjectDecorationProvider
  implements vscode.FileDecorationProvider, vscode.Disposable
{
  private readonly _onDidChange = new vscode.EventEmitter<
    vscode.Uri | vscode.Uri[] | undefined
  >();
  readonly onDidChangeFileDecorations = this._onDidChange.event;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly store: ProjectStore) {
    this.disposables.push(
      store.onDidChange(() => this._onDidChange.fire(undefined))
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
    // Badge only (no `color`) → coloured dot, file name keeps its normal colour.
    return new vscode.FileDecoration(emojiFor(project), project.name);
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
