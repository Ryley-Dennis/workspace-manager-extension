import * as vscode from 'vscode';
import * as path from 'path';
import { getRawHomePaths, scanRepos, resolvePath } from './homePathManager';

// ─── Tree item types ──────────────────────────────────────────────────────────

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

export class RepoItem extends vscode.TreeItem {
  constructor(
    public readonly repoPath: string,
    public readonly isActive: boolean,
    pendingState?: vscode.TreeItemCheckboxState
  ) {
    const hasPending = pendingState !== undefined;
    super(
      (hasPending ? '* ' : '') + path.basename(repoPath),
      vscode.TreeItemCollapsibleState.None
    );
    this.contextValue = 'repo';
    this.tooltip = repoPath;
    this.description = isActive ? 'in workspace' : '';
    this.iconPath = new vscode.ThemeIcon('repo');
    this.checkboxState = hasPending
      ? pendingState
      : isActive
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

  private pendingChanges = new Map<string, vscode.TreeItemCheckboxState>();

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  stagePendingChange(
    repoPath: string,
    desiredState: vscode.TreeItemCheckboxState
  ): void {
    const isActive = this.getActiveWorkspacePaths().has(repoPath);
    const appliedState = isActive
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked;

    // If the user toggled back to the current applied state, cancel the pending change.
    if (desiredState === appliedState) {
      this.pendingChanges.delete(repoPath);
    } else {
      this.pendingChanges.set(repoPath, desiredState);
    }

    this.updatePendingContext();
    this.refresh();
  }

  uncheckAll(): void {
    const activeUris = this.getActiveWorkspacePaths();
    const rawPaths = getRawHomePaths();

    for (const raw of rawPaths) {
      const repoPaths = scanRepos(resolvePath(raw));
      for (const repoPath of repoPaths) {
        if (activeUris.has(repoPath)) {
          // Currently in workspace — stage for removal
          this.pendingChanges.set(repoPath, vscode.TreeItemCheckboxState.Unchecked);
        } else {
          // Already unchecked — clear any pending add
          this.pendingChanges.delete(repoPath);
        }
      }
    }

    this.updatePendingContext();
    this.refresh();
  }

  applyChanges(): void {
    const toAdd: string[] = [];
    const toRemove: string[] = [];

    for (const [repoPath, desiredState] of this.pendingChanges) {
      if (desiredState === vscode.TreeItemCheckboxState.Checked) {
        toAdd.push(repoPath);
      } else {
        toRemove.push(repoPath);
      }
    }

    this.pendingChanges.clear();
    this.updatePendingContext();

    // Process removes in descending index order so earlier removals don't shift later indices.
    const snapshot = vscode.workspace.workspaceFolders ?? [];
    const removeIndices = toRemove
      .map((p) => snapshot.findIndex((f) => f.uri.fsPath === p))
      .filter((i) => i !== -1)
      .sort((a, b) => b - a);

    for (const idx of removeIndices) {
      vscode.workspace.updateWorkspaceFolders(idx, 1);
    }

    for (const repoPath of toAdd) {
      // Re-read length each iteration in case updateWorkspaceFolders is synchronous.
      const currentLength = (vscode.workspace.workspaceFolders ?? []).length;
      vscode.workspace.updateWorkspaceFolders(currentLength, 0, {
        uri: vscode.Uri.file(repoPath),
        name: path.basename(repoPath),
      });
    }

    // Do NOT call refresh() here. onDidChangeWorkspaceFolders fires after the
    // workspace actually updates, so we let that drive the tree refresh and avoid
    // reading stale workspaceFolders in getChildren.
  }

  private updatePendingContext(): void {
    vscode.commands.executeCommand(
      'setContext',
      'workspaceManager.hasPendingChanges',
      this.pendingChanges.size > 0
    );
  }

  getTreeItem(element: RepoTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: RepoTreeItem): RepoTreeItem[] {
    if (!element) {
      const rawPaths = getRawHomePaths();

      if (rawPaths.length === 0) {
        const placeholder = new vscode.TreeItem(
          'No home paths configured. Click + to add one.',
          vscode.TreeItemCollapsibleState.None
        );
        placeholder.iconPath = new vscode.ThemeIcon('info');
        return [placeholder as RepoTreeItem];
      }

      return rawPaths.map((raw) => new HomePathItem(raw, resolvePath(raw)));
    }

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
        (repoPath) =>
          new RepoItem(
            repoPath,
            activeUris.has(repoPath),
            this.pendingChanges.get(repoPath)
          )
      );
    }

    return [];
  }

  private getActiveWorkspacePaths(): Set<string> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    return new Set(folders.map((f) => f.uri.fsPath));
  }
}
