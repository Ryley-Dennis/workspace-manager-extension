import * as vscode from 'vscode';
import * as path from 'path';
import { getHomePaths, getRawHomePaths, scanRepos, resolvePath } from './homePathManager';

// ─── Tree item types ──────────────────────────────────────────────────────────

/**
 * Represents a home path group header (e.g. "~/work").
 */
export class HomePathItem extends vscode.TreeItem {
  constructor(
    public readonly rawPath: string,
    public readonly resolvedPath: string
  ) {
    super(rawPath, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'homePath';
    this.iconPath = new vscode.ThemeIcon('folder-opened');
    this.tooltip = resolvedPath;
  }
}

/**
 * Represents a single repository inside a home path group.
 * Uses a checkbox via checkboxState.
 */
export class RepoItem extends vscode.TreeItem {
  constructor(
    public readonly repoPath: string,
    public readonly isActive: boolean
  ) {
    super(path.basename(repoPath), vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'repo';
    this.tooltip = repoPath;
    this.description = isActive ? 'in workspace' : '';
    this.iconPath = new vscode.ThemeIcon(isActive ? 'repo' : 'repo');

    // Native VSCode checkbox support (available since 1.85)
    this.checkboxState = isActive
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked;
  }
}

export type RepoTreeItem = HomePathItem | RepoItem;

// ─── Tree provider ────────────────────────────────────────────────────────────

export class RepoTreeProvider
  implements vscode.TreeDataProvider<RepoTreeItem>
{
  private _onDidChangeTreeData =
    new vscode.EventEmitter<RepoTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: RepoTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: RepoTreeItem): RepoTreeItem[] {
    // Root level — return one HomePathItem per configured home path
    if (!element) {
      const rawPaths = getRawHomePaths();

      if (rawPaths.length === 0) {
        // No home paths configured yet — show a placeholder message via a
        // disabled item so the user knows what to do.
        const placeholder = new vscode.TreeItem(
          'No home paths configured. Click + to add one.',
          vscode.TreeItemCollapsibleState.None
        );
        placeholder.iconPath = new vscode.ThemeIcon('info');
        return [placeholder as RepoTreeItem];
      }

      return rawPaths.map(
        (raw) => new HomePathItem(raw, resolvePath(raw))
      );
    }

    // Second level — return RepoItems for a given HomePathItem
    if (element instanceof HomePathItem) {
      const repoPaths = scanRepos(element.resolvedPath);
      const activeUris = this.getActiveWorkspacePaths();

      if (repoPaths.length === 0) {
        const empty = new vscode.TreeItem(
          'No repositories found',
          vscode.TreeItemCollapsibleState.None
        );
        empty.iconPath = new vscode.ThemeIcon('info');
        return [empty as RepoTreeItem];
      }

      return repoPaths.map(
        (repoPath) => new RepoItem(repoPath, activeUris.has(repoPath))
      );
    }

    return [];
  }

  /**
   * Returns a Set of fsPath strings for all folders currently in the workspace.
   */
  private getActiveWorkspacePaths(): Set<string> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    return new Set(folders.map((f) => f.uri.fsPath));
  }
}
