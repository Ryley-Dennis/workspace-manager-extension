import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { parse as parseJsonc } from 'jsonc-parser';
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
      path.basename(repoPath) + (hasPending ? ' *' : ''),
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
    const toRemove = new Set<string>();

    for (const [repoPath, desiredState] of this.pendingChanges) {
      if (desiredState === vscode.TreeItemCheckboxState.Checked) {
        toAdd.push(repoPath);
      } else {
        toRemove.add(repoPath);
      }
    }

    this.pendingChanges.clear();
    this.updatePendingContext();

    if (toAdd.length === 0 && toRemove.size === 0) {
      return;
    }

    // updateWorkspaceFolders is broken for batched changes — it only reliably
    // applies one folder per call regardless of what the API suggests. Since we
    // already require a .code-workspace file, write the desired folder list
    // directly to the workspace JSON and let VS Code pick up the change.
    const workspaceFile = vscode.workspace.workspaceFile;
    if (!workspaceFile || workspaceFile.scheme !== 'file') {
      return;
    }

    const current = vscode.workspace.workspaceFolders ?? [];
    const finalPaths = [
      ...current.filter((f) => !toRemove.has(f.uri.fsPath)).map((f) => f.uri.fsPath),
      ...toAdd,
    ];

    const filePath = workspaceFile.fsPath;
    const raw = fs.readFileSync(filePath, 'utf8');
    const json = parseJsonc(raw);
    json.folders = finalPaths.map((p) => ({ path: p }));
    fs.writeFileSync(filePath, JSON.stringify(json, null, '\t'));
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
      if (vscode.workspace.workspaceFile?.scheme !== 'file') {
        const msg = new vscode.TreeItem(
          'Open a .code-workspace file to use Workspace Manager.',
          vscode.TreeItemCollapsibleState.None
        );
        msg.iconPath = new vscode.ThemeIcon('warning');
        return [msg as RepoTreeItem];
      }

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
