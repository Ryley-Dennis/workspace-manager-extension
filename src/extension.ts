import * as vscode from 'vscode';
import * as path from 'path';
import { RepoTreeProvider, RepoItem, HomePathItem } from './RepoTreeProvider';
import { getRawHomePaths, setHomePaths, resolvePath } from './homePathManager';

export function activate(context: vscode.ExtensionContext) {
  const provider = new RepoTreeProvider();

  // ─── Register the sidebar tree view ────────────────────────────────────────

  const treeView = vscode.window.createTreeView('workspaceManagerView', {
    treeDataProvider: provider,
    showCollapseAll: true,
    // Enable native checkbox support
    manageCheckboxStateManually: false,
  });

  // ─── Warn if not in a multi-root workspace ──────────────────────────────────

  function checkWorkspaceType() {
    const workspaceFile = vscode.workspace.workspaceFile;
    const isTrustedWorkspace = workspaceFile?.scheme === 'file';

    if (!isTrustedWorkspace) {
      vscode.window
        .showWarningMessage(
          'Workspace Manager works best with a .code-workspace file. ' +
            'Without one, workspace folder changes will not persist after restart.',
          'Create Workspace File',
          'Dismiss'
        )
        .then((choice) => {
          if (choice === 'Create Workspace File') {
            vscode.commands.executeCommand(
              'workbench.action.saveWorkspaceAs'
            );
          }
        });
    }
  }

  // Warn on activation
  checkWorkspaceType();

  // ─── Checkbox toggle handler ────────────────────────────────────────────────
  // Fires when the user checks or unchecks a repo item.

  context.subscriptions.push(
    treeView.onDidChangeCheckboxState((event) => {
      for (const [item, state] of event.items) {
        if (!(item instanceof RepoItem)) {
          continue;
        }

        const uri = vscode.Uri.file(item.repoPath);
        const folders = vscode.workspace.workspaceFolders ?? [];
        const existingIndex = folders.findIndex(
          (f) => f.uri.fsPath === item.repoPath
        );

        if (
          state === vscode.TreeItemCheckboxState.Checked &&
          existingIndex === -1
        ) {
          // Add to workspace
          vscode.workspace.updateWorkspaceFolders(
            folders.length, // insert at end
            0,              // delete count
            { uri, name: path.basename(item.repoPath) }
          );
        } else if (
          state === vscode.TreeItemCheckboxState.Unchecked &&
          existingIndex !== -1
        ) {
          // Remove from workspace
          vscode.workspace.updateWorkspaceFolders(
            existingIndex, // start index
            1              // delete 1 folder
          );
        }

        // Refresh so the description ("in workspace") updates
        provider.refresh();
      }
    })
  );

  // ─── Refresh when workspace folders change externally ──────────────────────

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => provider.refresh())
  );

  // ─── Refresh when settings change ──────────────────────────────────────────

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('workspaceManager.homePaths')) {
        provider.refresh();
      }
    })
  );

  // ─── Command: Refresh ───────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('workspaceManager.refresh', () => {
      provider.refresh();
    })
  );

  // ─── Command: Add Home Path ─────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('workspaceManager.addHomePath', async () => {
      const uris = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: 'Select Home Directory',
      });

      if (!uris || uris.length === 0) {
        return;
      }

      const newPath = uris[0].fsPath;
      const current = getRawHomePaths();

      // Avoid duplicates (compare resolved paths)
      const alreadyExists = current.some(
        (p) => resolvePath(p) === newPath
      );

      if (alreadyExists) {
        vscode.window.showInformationMessage(
          `${newPath} is already in your home paths.`
        );
        return;
      }

      await setHomePaths([...current, newPath]);
      provider.refresh();
    })
  );

  // ─── Command: Remove Home Path ──────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('workspaceManager.removeHomePath', async () => {
      const current = getRawHomePaths();

      if (current.length === 0) {
        vscode.window.showInformationMessage('No home paths configured.');
        return;
      }

      const selected = await vscode.window.showQuickPick(current, {
        title: 'Remove Home Path',
        placeHolder: 'Select a home path to remove',
        canPickMany: true,
      });

      if (!selected || selected.length === 0) {
        return;
      }

      const updated = current.filter((p) => !selected.includes(p));
      await setHomePaths(updated);
      provider.refresh();
    })
  );

  // ─── Register the tree view itself ─────────────────────────────────────────

  context.subscriptions.push(treeView);
}

export function deactivate() {}
