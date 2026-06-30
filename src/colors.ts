import * as vscode from 'vscode';

export interface PaletteColor {
  /** A registered theme-color id (used for card background + terminal tab). */
  id: string;
  label: string;
  /** A colour emoji that matches `id`, used as a file/decoration dot. */
  emoji: string;
}

/**
 * The colours a project can use. Each has a theme-color id (for the webview card
 * and the terminal tab) plus a matching emoji circle (for file decorations, so
 * we can mark files with a colour dot without tinting their text). A project
 * with no explicit colour falls back to a hash of its id.
 */
export const PALETTE: PaletteColor[] = [
  { id: 'charts.red', label: '紅 Red', emoji: '🔴' },
  { id: 'charts.orange', label: '橙 Orange', emoji: '🟠' },
  { id: 'charts.yellow', label: '黃 Yellow', emoji: '🟡' },
  { id: 'charts.green', label: '綠 Green', emoji: '🟢' },
  { id: 'charts.blue', label: '藍 Blue', emoji: '🔵' },
  { id: 'charts.purple', label: '紫 Purple', emoji: '🟣' },
];

interface Colorable {
  id: string;
  color?: string;
}

function paletteFor(project: Colorable): PaletteColor {
  if (project.color) {
    const explicit = PALETTE.find((c) => c.id === project.color);
    if (explicit) {
      return explicit;
    }
  }
  let hash = 0;
  for (let i = 0; i < project.id.length; i++) {
    hash = (hash * 31 + project.id.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export function resolveColorId(project: Colorable): string {
  return paletteFor(project).id;
}

export function themeColorFor(project: Colorable): vscode.ThemeColor {
  return new vscode.ThemeColor(resolveColorId(project));
}

export function emojiFor(project: Colorable): string {
  return paletteFor(project).emoji;
}
