import * as vscode from 'vscode';

/**
 * A small palette of terminal ANSI theme colors. Each project is mapped to one
 * of these deterministically, so its terminals (and tree icons) share a colour
 * and read as a group — both in our panel and in the native terminal list.
 */
const PALETTE = [
  'terminal.ansiBlue',
  'terminal.ansiGreen',
  'terminal.ansiMagenta',
  'terminal.ansiCyan',
  'terminal.ansiYellow',
  'terminal.ansiRed',
];

export function colorIdForProject(projectId: string): string {
  let hash = 0;
  for (let i = 0; i < projectId.length; i++) {
    hash = (hash * 31 + projectId.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export function themeColorForProject(projectId: string): vscode.ThemeColor {
  return new vscode.ThemeColor(colorIdForProject(projectId));
}
