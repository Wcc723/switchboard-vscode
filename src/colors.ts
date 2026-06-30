import * as vscode from 'vscode';

export interface PaletteColor {
  /** A registered theme-color id (used for both terminal tab and tree icon). */
  id: string;
  label: string;
}

/**
 * The colours a user can assign to a project. These are terminal ANSI theme
 * colours so they render consistently in both our tree and the native terminal
 * tabs. A project with no explicit colour falls back to a hash of its id.
 */
export const PALETTE: PaletteColor[] = [
  { id: 'terminal.ansiBlue', label: '藍 Blue' },
  { id: 'terminal.ansiGreen', label: '綠 Green' },
  { id: 'terminal.ansiMagenta', label: '洋紅 Magenta' },
  { id: 'terminal.ansiCyan', label: '青 Cyan' },
  { id: 'terminal.ansiYellow', label: '黃 Yellow' },
  { id: 'terminal.ansiRed', label: '紅 Red' },
];

interface Colorable {
  id: string;
  color?: string;
}

function hashedColorId(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length].id;
}

export function resolveColorId(project: Colorable): string {
  return project.color ?? hashedColorId(project.id);
}

export function themeColorFor(project: Colorable): vscode.ThemeColor {
  return new vscode.ThemeColor(resolveColorId(project));
}
