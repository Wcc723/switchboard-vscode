import * as vscode from 'vscode';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type { Project } from './projectStore';
import { themeColorForProject } from './colors';

export interface Session {
  id: string;
  projectId: string;
  /** Absolute cwd of the terminal (project root, or a subdirectory). */
  cwd: string;
  /** Full name shown on the native terminal tab, e.g. "my-app: src". */
  name: string;
  /** Short label shown in our tree under the project, e.g. "src" or "~". */
  treeLabel: string;
  terminal: vscode.Terminal;
}

/**
 * A "session" is a VS Code integrated terminal whose cwd is a project folder (or
 * a subdirectory of it). This manager creates, focuses and tracks those
 * terminals, grouped by project.
 */
export class SessionManager implements vscode.Disposable {
  private readonly sessions = new Map<string, Session[]>();
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.window.onDidCloseTerminal((t) => this.handleTerminalClosed(t))
    );
  }

  getSessions(projectId: string): Session[] {
    return this.sessions.get(projectId) ?? [];
  }

  createSession(project: Project, cwd?: string): Session {
    const cfg = vscode.workspace.getConfiguration('projectSwitch');
    const autoStart = cfg.get<boolean>('autoStartClaude', false);
    const claudeCommand = cfg.get<string>('claudeCommand', 'claude');

    const folder = cwd ?? project.path;
    const rel =
      folder === project.path ? '~' : path.relative(project.path, folder) || '~';

    const existing = this.getSessions(project.id);
    const sameCwd = existing.filter((s) => s.cwd === folder).length;
    const suffix = sameCwd > 0 ? ` #${sameCwd + 1}` : '';
    const treeLabel = `${rel}${suffix}`;
    const name = `${project.name}: ${treeLabel}`;

    const color = themeColorForProject(project.id);
    const terminal = vscode.window.createTerminal({
      name,
      cwd: folder,
      iconPath: new vscode.ThemeIcon('terminal', color),
      color,
    });
    const session: Session = {
      id: randomUUID(),
      projectId: project.id,
      cwd: folder,
      name,
      treeLabel,
      terminal,
    };
    this.sessions.set(project.id, [...existing, session]);

    if (autoStart && claudeCommand.trim().length > 0) {
      terminal.sendText(claudeCommand);
    }
    terminal.show();
    this._onDidChange.fire();
    return session;
  }

  focusSession(session: Session): void {
    session.terminal.show();
  }

  /** Focus the newest session of a project, creating one (at root) if none exist. */
  focusOrCreate(project: Project): Session {
    const sessions = this.getSessions(project.id);
    if (sessions.length > 0) {
      const last = sessions[sessions.length - 1];
      last.terminal.show();
      return last;
    }
    return this.createSession(project);
  }

  /** Focus the newest session of a project if one exists; otherwise do nothing. */
  focusLatest(project: Project): void {
    const sessions = this.getSessions(project.id);
    if (sessions.length > 0) {
      sessions[sessions.length - 1].terminal.show();
    }
  }

  closeSession(session: Session): void {
    // Disposing triggers onDidCloseTerminal, which removes it from tracking.
    session.terminal.dispose();
  }

  closeProjectSessions(projectId: string): void {
    for (const s of this.getSessions(projectId)) {
      s.terminal.dispose();
    }
    this.sessions.delete(projectId);
    this._onDidChange.fire();
  }

  private handleTerminalClosed(terminal: vscode.Terminal): void {
    for (const [projectId, sessions] of this.sessions) {
      const filtered = sessions.filter((s) => s.terminal !== terminal);
      if (filtered.length === sessions.length) {
        continue;
      }
      if (filtered.length > 0) {
        this.sessions.set(projectId, filtered);
      } else {
        this.sessions.delete(projectId);
      }
      this._onDidChange.fire();
      return;
    }
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
