import * as vscode from 'vscode';
import * as path from 'path';
import { randomUUID } from 'crypto';

export interface Project {
  id: string;
  name: string;
  /** Absolute filesystem path to the project folder. */
  path: string;
}

const STORAGE_KEY = 'projectSwitch.projects';

/**
 * Persists the list of registered projects in globalState (shared across windows)
 * and tracks which project is currently "active" (a runtime-only concept).
 */
export class ProjectStore implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private _activeProjectId: string | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  getProjects(): Project[] {
    return this.context.globalState.get<Project[]>(STORAGE_KEY, []);
  }

  getProject(id: string): Project | undefined {
    return this.getProjects().find((p) => p.id === id);
  }

  async addProject(folderPath: string, name?: string): Promise<Project> {
    const projects = this.getProjects();
    const existing = projects.find((p) => p.path === folderPath);
    if (existing) {
      return existing;
    }
    const project: Project = {
      id: randomUUID(),
      name: name ?? path.basename(folderPath) ?? folderPath,
      path: folderPath,
    };
    await this.context.globalState.update(STORAGE_KEY, [...projects, project]);
    this._onDidChange.fire();
    return project;
  }

  async removeProject(id: string): Promise<void> {
    const projects = this.getProjects().filter((p) => p.id !== id);
    await this.context.globalState.update(STORAGE_KEY, projects);
    if (this._activeProjectId === id) {
      this._activeProjectId = undefined;
    }
    this._onDidChange.fire();
  }

  async renameProject(id: string, name: string): Promise<void> {
    const projects = this.getProjects().map((p) =>
      p.id === id ? { ...p, name } : p
    );
    await this.context.globalState.update(STORAGE_KEY, projects);
    this._onDidChange.fire();
  }

  get activeProjectId(): string | undefined {
    return this._activeProjectId;
  }

  setActive(id: string | undefined): void {
    if (this._activeProjectId === id) {
      return;
    }
    this._activeProjectId = id;
    this._onDidChange.fire();
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
