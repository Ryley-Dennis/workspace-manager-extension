import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Resolves ~ to the user's home directory.
 */
export function resolvePath(inputPath: string): string {
  if (inputPath.startsWith('~')) {
    return path.join(os.homedir(), inputPath.slice(1));
  }
  return inputPath;
}

/**
 * Returns the configured home paths from settings, with ~ resolved.
 */
export function getHomePaths(): string[] {
  const config = vscode.workspace.getConfiguration('workspaceManager');
  const raw: string[] = config.get('homePaths') ?? [];
  return raw.map(resolvePath);
}

/**
 * Returns the raw (unresolved) home paths from settings.
 * Used when writing back to settings so we preserve the user's ~ notation.
 */
export function getRawHomePaths(): string[] {
  const config = vscode.workspace.getConfiguration('workspaceManager');
  return config.get('homePaths') ?? [];
}

/**
 * Persists a new array of raw home paths to settings.
 */
export async function setHomePaths(rawPaths: string[]): Promise<void> {
  const config = vscode.workspace.getConfiguration('workspaceManager');
  await config.update('homePaths', rawPaths, vscode.ConfigurationTarget.Global);
}

/**
 * Scans a single home path and returns its immediate subdirectories,
 * filtering out hidden directories (those starting with a dot).
 */
export function scanRepos(homePath: string): string[] {
  const resolved = resolvePath(homePath);

  if (!fs.existsSync(resolved)) {
    return [];
  }

  try {
    return fs
      .readdirSync(resolved)
      .filter((name) => {
        // Filter out hidden directories (dotfiles)
        if (name.startsWith('.')) {
          return false;
        }
        const fullPath = path.join(resolved, name);
        return fs.statSync(fullPath).isDirectory();
      })
      .map((name) => path.join(resolved, name));
  } catch {
    return [];
  }
}
