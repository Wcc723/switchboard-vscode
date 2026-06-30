import * as vscode from 'vscode';

export function isFolderInWorkspace(folderPath: string): boolean {
  return (vscode.workspace.workspaceFolders ?? []).some(
    (f) => f.uri.fsPath === folderPath
  );
}

/**
 * Add a project folder to the current (multi-root) workspace without reloading
 * the window. Returns false if VS Code refused (e.g. no workspace yet) — the
 * caller can still use the project for sessions regardless.
 */
export function ensureFolderInWorkspace(folderPath: string): boolean {
  if (isFolderInWorkspace(folderPath)) {
    return true;
  }
  const start = vscode.workspace.workspaceFolders?.length ?? 0;
  return vscode.workspace.updateWorkspaceFolders(start, 0, {
    uri: vscode.Uri.file(folderPath),
  });
}

export function removeFolderFromWorkspace(folderPath: string): void {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const index = folders.findIndex((f) => f.uri.fsPath === folderPath);
  if (index >= 0) {
    vscode.workspace.updateWorkspaceFolders(index, 1);
  }
}
