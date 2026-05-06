# Implementation Plan

## Progress

| Done | Phase | Feature | Section |
|---|---|---|---|
| [ ] | Setup | Test infrastructure (vitest, vscode mock, memfs, coverage config) | [Unit Test Infrastructure](#unit-test-infrastructure) |
| [ ] | 1 | `homePathManager` unit tests | [Phase 1 — Also: homePathManager unit tests](#phase-1--also-homepathmanager-unit-tests) |
| [ ] | 1 | File watcher on home paths | [Feature 1.1](#feature-11-file-watcher-on-home-paths) |
| [ ] | 1 | Home Paths panel (relocate +/− out of repo list) | [Feature 1.2](#feature-12-home-paths-panel) |
| [ ] | 1 | Default home path on first install | [Feature 1.3](#feature-13-default-home-path-on-first-install) |
| [ ] | 2 | Hide repos | [Feature 2.1](#feature-21-hide-repos) |
| [ ] | 2 | Search / filter | [Feature 2.2](#feature-22-search--filter) |
| [ ] | 3 | Space to toggle focused repo | [Feature 3.1](#feature-31-space-to-toggle-focused-repo) |
| [ ] | 3 | Cmd+Enter to apply pending changes | [Feature 3.2](#feature-32-cmdenter-to-apply-pending-changes) |
| [ ] | 3 | Right-click context menu — repo subset | [Feature 3.3](#feature-33-right-click-context-menu-repo-subset) |
| [ ] | 4 | Groups data model and storage (`GroupManager`) | [Feature 4.1](#feature-41-groups-data-model-and-storage) |
| [ ] | 4 | Groups panel and CRUD UI | [Feature 4.2](#feature-42-groups-panel-and-crud-ui) |
| [ ] | 4 | Active group switching and group-aware Apply | [Feature 4.3](#feature-43-active-group-switching-and-group-aware-apply) |
| [ ] | 4 | Home-path removal confirm (groups-aware) | [Feature 4.4](#feature-44-home-path-removal-confirm-groups-aware) |
| [ ] | 4 | Right-click context menu — group subset | [Feature 4.5](#feature-45-right-click-context-menu-group-subset) |

---

## Scope

This plan covers every item in `TODO.md`, organized into four phases. The phases are ordered by dependency: each phase builds on capabilities introduced earlier, and shipping the phases independently keeps each release small and reviewable.

| Phase | Features | Version |
|---|---|---|
| 1 — Foundation | File watcher; Home Paths panel (relocate +/− out of repo list); default home path on first install | 0.2.0 |
| 2 — Repo list polish | Hide repos; search/filter | 0.3.0 |
| 3 — Input ergonomics | Space toggle; Cmd+Enter apply; right-click context menu (repo subset) | 0.4.0 |
| 4 — Groups | Groups panel; create/rename/delete; active group switching; group-aware Apply; right-click context menu (group subset); extend home-path-removal confirm to mention groups | 0.5.0 |

Phases 1–3 are mostly independent; Phase 4 is the largest change and depends on the Home Paths panel from Phase 1 being in place (so that the activity-bar container has multiple sub-views laid out).

### Cross-cutting principles

- **Single visibility pipeline** — once both hide and filter exist, repo list rendering goes through one `getVisibleRepos(homePath)` method on the provider that applies hide → filter in a fixed order. New visibility-affecting features extend this pipeline rather than inlining checks in `getChildren`.
- **Workspace-scoped state, not global** — hidden repos, active group, and groups themselves are per-workspace and live in `ExtensionContext.workspaceState`. The same repo can be hidden in workspace A and visible in workspace B, which matches user expectation.
- **Provider stays unaware of view chrome** — when the provider needs to push UI updates (filter banner, active-group indicator) the provider exposes typed events; `extension.ts` subscribes and updates `treeView.message`/`treeView.description`. Don't pass `treeView` instances into the provider.
- **Tests ship alongside code** — each feature's `### Tests` section defines the required unit tests. No feature is complete until its tests pass. Coverage thresholds are enforced in CI.
- **README updates ship with each phase.**

---

## Unit Test Infrastructure

This section is implemented once, in Phase 1, before any feature code. Every subsequent feature's test section assumes this infrastructure exists.

### Stack

| Package | Role |
|---|---|
| `vitest` | Test runner — native TypeScript, fast watch mode, fake timers |
| `@vitest/coverage-v8` | Coverage reports via V8 |
| `memfs` | In-memory filesystem for `scanRepos`, watcher, and workspace-file write tests |

No `@vscode/test-electron` — the unit tests target pure logic and mock the `vscode` module entirely. The goal is tests that run in milliseconds with no VS Code process.

### `vscode` module alias

Vitest redirects `import * as vscode from 'vscode'` to a hand-rolled mock via `resolve.alias`:

```
vitest.config.ts
  test.alias: { vscode: path.resolve(__dirname, 'src/test/vscode-mock.ts') }
```

The mock file exports the minimal API surface actually used by the extension:

**`src/test/vscode-mock.ts`**

```ts
// TreeItem — stores all properties; does not require VS Code internals
export class TreeItem {
  label?: string; collapsibleState?: number;
  iconPath?: any; description?: string; tooltip?: string;
  contextValue?: string; checkboxState?: any; command?: any;
  constructor(label: string | vscode.TreeItemLabel, collapsibleState?: number) {
    this.label = typeof label === 'string' ? label : label.label;
    this.collapsibleState = collapsibleState;
  }
}
export enum TreeItemCollapsibleState { None = 0, Collapsed = 1, Expanded = 2 }
export enum TreeItemCheckboxState    { Unchecked = 0, Checked = 1 }

// ThemeIcon
export class ThemeIcon { constructor(public id: string) {} }

// EventEmitter — real functional implementation
export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];
  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
  };
  fire(data: T) { this.listeners.forEach(l => l(data)); }
  dispose() { this.listeners = []; }
}

// Mutable workspace state — tests override these per test
export const workspace = {
  workspaceFile: undefined as any,
  workspaceFolders: undefined as any,
  getConfiguration: vi.fn((_section: string) => ({
    get: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
  })),
  onDidChangeWorkspaceFolders: vi.fn(),
  onDidChangeConfiguration: vi.fn(),
};
export const commands = { executeCommand: vi.fn().mockResolvedValue(undefined) };
export const window = {
  showInformationMessage: vi.fn().mockResolvedValue(undefined),
  showWarningMessage: vi.fn().mockResolvedValue(undefined),
  showErrorMessage: vi.fn().mockResolvedValue(undefined),
  showInputBox: vi.fn().mockResolvedValue(undefined),
  showQuickPick: vi.fn().mockResolvedValue(undefined),
  createTreeView: vi.fn().mockReturnValue({ onDidChangeCheckboxState: vi.fn(), dispose: vi.fn() }),
};
export enum ConfigurationTarget { Global = 1, Workspace = 2 }
export const Uri = {
  file: (p: string) => ({ scheme: 'file', fsPath: p }),
};
```

**`src/test/makeMemento.ts`**

Used by any test that needs an `ExtensionContext`:

```ts
export function makeMemento() {
  const store = new Map<string, unknown>();
  return {
    _store: store,
    get<T>(key: string, defaultValue?: T): T {
      return (store.has(key) ? store.get(key) : defaultValue) as T;
    },
    update(key: string, value: unknown): Thenable<void> {
      store.set(key, value);
      return Promise.resolve();
    },
    keys: (): readonly string[] => [...store.keys()],
  };
}

export function makeContext() {
  return { workspaceState: makeMemento(), globalState: makeMemento() } as any;
}
```

### `vitest.config.ts` _(new file at repo root)_

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    alias: { vscode: path.resolve(__dirname, 'src/test/vscode-mock.ts') },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/test/**'],
      thresholds: { lines: 80, functions: 80, branches: 75 },
    },
  },
});
```

### `package.json` script additions

```json
"test":          "vitest run",
"test:watch":    "vitest",
"test:coverage": "vitest run --coverage"
```

### `devDependencies` to add

```json
"vitest": "^2.0.0",
"@vitest/coverage-v8": "^2.0.0",
"memfs": "^4.0.0"
```

### File layout

```
src/test/
  vscode-mock.ts        — VS Code API stub (described above)
  makeMemento.ts        — ExtensionContext helper (described above)
  homePathManager.test.ts
  homePathWatcher.test.ts
  firstRun.test.ts
  homePathsPanelProvider.test.ts
  repoTreeProvider.test.ts
  groupManager.test.ts
  groupsPanelProvider.test.ts
```

---

# Phase 1 — Foundation

## Feature 1.1: File Watcher on Home Paths

**Goal:** Auto-refresh the tree when folders are created or deleted inside a configured home path, so cloning a new repo is immediately visible without hitting the manual refresh button.

### Approach

Use Node's `fs.watch` on each home path directory (non-recursive). `vscode.workspace.createFileSystemWatcher` is intentionally not used: it requires a `RelativePattern` rooted in a workspace folder, but home paths live outside the workspace. `fs.watch` is also dependency-free, consistent with the recent removal of `jsonc-parser` (commit `1fb97d8`).

`fs.watch` fires for both files and directories. To avoid spurious refreshes from git internals (`index.lock`), editor swap files, and `.DS_Store`, the debounced callback compares the current top-level directory listing against a cached snapshot per watched path; it calls `provider.refresh()` only if the *set of directory names* changed.

Watchers are managed as a `Map<resolvedPath, fs.FSWatcher>` kept in sync with the configured home paths:
- Home path added → start a new watcher.
- Home path removed → stop and delete the old watcher.
- Watcher emits `'error'` (target deleted/unmounted) → remove from map; the next `sync()` re-attempts.
- Extension deactivate → stop all watchers.

### Files to change

**`src/homePathWatcher.ts`** _(new file)_

```
export class HomePathWatcher implements vscode.Disposable {
  private watchers = new Map<string, fs.FSWatcher>();
  private snapshots = new Map<string, Set<string>>();
  private pending: NodeJS.Timeout | undefined;

  constructor(private onChanged: () => void) {}

  sync(resolvedPaths: string[]): void
    - stop watchers for paths no longer in list
    - start watchers for newly added paths via startWatcher(p)

  private startWatcher(p: string): void
    - try { const w = fs.watch(p, { persistent: false }, () => this.onEvent(p)) }
    - w.on('error', () => { w.close(); this.watchers.delete(p); this.snapshots.delete(p); })
    - on fs.watch throw: swallow, skip

  private onEvent(p: string): void
    - debounce 300ms
    - on fire: re-list directories at p; compare to snapshot
    - if different: update snapshot, call onChanged()

  dispose(): void
    - clearTimeout(this.pending); close all watchers
}
```

**`src/extension.ts`**

- Construct `HomePathWatcher` after `provider`. Push to `context.subscriptions`.
- Call `watcher.sync(getHomePaths())` on activation and inside the `onDidChangeConfiguration` handler for `workspaceManager.homePaths`.
- Do **not** also call `sync()` from `addHomePath`/`removeHomePath` commands — those write to settings, which already triggers `onDidChangeConfiguration`.

### Edge cases

- **Home path doesn't exist yet** — `fs.watch` throws synchronously; `startWatcher` swallows and skips.
- **Home path deleted at runtime** — the watcher fires `'error'`; error handler cleans up. No retry; next config change re-attempts.
- **Rapid events during a git clone** — 300 ms debounce + directory-set diff coalesces into at most one refresh.
- **Watcher already exists for the path** — `sync` checks `watchers.has(p)` before creating a new one.

### Tests

**`src/test/homePathWatcher.test.ts`**

Use `vi.useFakeTimers()` to control debounce. Mock `fs` using `vi.mock('fs', ...)` with a spy on `watch`, `readdirSync`, and `statSync`.

```
describe('sync')
  - calling sync(['a','b']) starts watchers for both paths
  - calling sync(['b']) after sync(['a','b']) closes the watcher for 'a'
  - calling sync(['a']) twice does not create a second watcher for 'a'
  - path where fs.watch throws → watcher is not stored in the map, no throw escapes

describe('onEvent — debounce')
  - multiple fs events within 300ms → onChanged called exactly once
  - advance 299ms → onChanged not yet called; advance 1ms → called
  - two bursts separated by >300ms → onChanged called twice

describe('onEvent — snapshot diff')
  - event fires, directory set unchanged → onChanged not called
  - event fires, a new directory appears → onChanged called, snapshot updated
  - event fires, a directory is removed → onChanged called, snapshot updated
  - event fires, only a file changed (not a dir) → onChanged not called

describe('error handling')
  - watcher 'error' event → watcher removed from map, snapshot removed
  - subsequent sync([p]) re-creates the watcher for p

describe('dispose')
  - dispose() closes all active watchers
  - dispose() clears any pending debounce timeout (onChanged not called after dispose)
```

---

## Feature 1.2: Home Paths Panel

**Goal:** Move the + and − home-path controls out of the Repositories view title and into a dedicated, collapsible "Home Paths" panel below it. Each path gets its own row with a remove (X) inline action.

### Approach

VS Code's activity-bar containers support multiple `views` entries that render as collapsible sub-panels. Add a second view, `workspaceManagerHomePaths`, to the existing `workspaceManager` container. A new `HomePathsPanelProvider` implements `TreeDataProvider` for it.

The Repositories view title loses `addHomePath` and `removeHomePath`. The new panel exposes:
- Title button: `+` to add (delegates to existing `addHomePath` command).
- Inline per-row: `X` to remove a single home path (new command `removeOneHomePath` taking a `HomePathRow` arg, with a confirm prompt).

If the user has no home paths configured, the panel renders a placeholder row: *"No home paths configured. Click + to add one."*

### Files to change

**`src/HomePathsPanelProvider.ts`** _(new file)_

```
export class HomePathRow extends vscode.TreeItem {
  constructor(public readonly rawPath: string, resolvedPath: string)
    - label: rawPath
    - tooltip: resolvedPath
    - iconPath: new ThemeIcon('folder')
    - contextValue: 'homePathRow'
    - collapsibleState: None
}

export class HomePathsPanelProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  refresh(): void — fires _onDidChangeTreeData
  getTreeItem(el): el
  getChildren(): if getRawHomePaths().length === 0 → [placeholder TreeItem with $(info)]
                  else → getRawHomePaths().map(p => new HomePathRow(p, resolvePath(p)))
}
```

**`src/extension.ts`**

- Construct `HomePathsPanelProvider`; create its tree view; push to subscriptions.
- Call `homePathsProvider.refresh()` from the same `onDidChangeConfiguration` handler that already refreshes the repo provider.
- Register `workspaceManager.removeOneHomePath` command — receives a `HomePathRow`, runs the Phase 1 confirm dialog (only mentions workspace folders; Phase 4 extends it), then calls `setHomePaths(current.filter(p => p !== row.rawPath))`.
- Remove `addHomePath`/`removeHomePath` from the Repositories view title menu in `package.json`. Keep `addHomePath` as a command (palette + new panel title). Delete the bulk `removeHomePath` quick-pick command.

**`package.json`**

```json
"views": {
  "workspaceManager": [
    { "id": "workspaceManagerView",      "name": "Repositories" },
    { "id": "workspaceManagerHomePaths", "name": "Home Paths"   }
  ]
}
```

```json
{ "command": "workspaceManager.addHomePath",       "when": "view == workspaceManagerHomePaths", "group": "navigation" },
{ "command": "workspaceManager.removeOneHomePath", "when": "viewItem == homePathRow",            "group": "inline" }
```

### Edge cases

- **Removing the last home path** — placeholder row appears; no error.
- **Removing a path with active workspace folders inside it** — Phase 1 prompt: *"Removing `<path>` will remove N folders from the current workspace. Continue?"* Phase 4 extends this.
- **Order preservation** — `setHomePaths` writes the array verbatim; panel renders in array order.

### Tests

**`src/test/homePathsPanelProvider.test.ts`**

Mock `getRawHomePaths` and `resolvePath` from `homePathManager` via `vi.mock('../homePathManager', ...)`.

```
describe('getChildren')
  - getRawHomePaths returns [] → single placeholder TreeItem with contextValue unset
  - getRawHomePaths returns ['/a', '/b'] → two HomePathRow items in that order
  - HomePathRow for '/a' has label '/a' and contextValue 'homePathRow'
  - HomePathRow tooltip equals resolvePath('/a')

describe('refresh')
  - calling refresh() fires onDidChangeTreeData
  - HomePathsPanelProvider auto-refreshes when the configuration changes
    (simulate by calling refresh() manually and asserting onDidChangeTreeData fires)
```

---

## Feature 1.3: Default Home Path on First Install

**Goal:** A first-time user who has never configured a home path sees their current workspace's parent directory pre-populated, so the extension is useful immediately without setup.

### Approach

On activation, check a `workspaceState` flag `workspaceManager.firstActivationHandled`. If unset:
1. Read `getRawHomePaths()`. If non-empty, set the flag and return (user already configured).
2. Otherwise, derive a sensible default:
   - If `workspace.workspaceFile` is a file URI: use `path.dirname(workspaceFile.fsPath)`.
   - Else if `workspace.workspaceFolders[0]`: use `path.dirname(folders[0].uri.fsPath)`.
   - Else: do nothing (no default to derive).
3. If a default was derived, call `setHomePaths([defaultPath])`.
4. Set the flag regardless, so we never auto-populate again even if the user later removes all paths.

### Files to change

**`src/firstRun.ts`** _(new file, ~25 lines)_

```ts
export async function ensureFirstRunDefault(context: vscode.ExtensionContext): Promise<void> {
  const KEY = 'workspaceManager.firstActivationHandled';
  if (context.workspaceState.get<boolean>(KEY)) return;
  await context.workspaceState.update(KEY, true);

  if (getRawHomePaths().length > 0) return;

  const wsFile = vscode.workspace.workspaceFile;
  const folders = vscode.workspace.workspaceFolders;
  let defaultPath: string | undefined;
  if (wsFile?.scheme === 'file') defaultPath = path.dirname(wsFile.fsPath);
  else if (folders?.[0])         defaultPath = path.dirname(folders[0].uri.fsPath);

  if (defaultPath) await setHomePaths([defaultPath]);
}
```

**`src/extension.ts`**
- `await ensureFirstRunDefault(context)` early in `activate`, before provider construction.

### Edge cases

- **No workspace open** — no default derivable; flag is set; user adds manually.
- **User clears all paths later** — flag is already set, so we never re-add.
- **Previously populated, now empty** — flag was set on first activation that saw paths; we don't re-populate.

### Tests

**`src/test/firstRun.test.ts`**

Mock `getRawHomePaths` and `setHomePaths`, and override `vscode.workspace.workspaceFile` / `vscode.workspace.workspaceFolders` per test.

```
describe('ensureFirstRunDefault')
  flag already set
    - returns without calling setHomePaths regardless of homePaths/workspace state

  flag not set, homePaths non-empty
    - sets flag, does not call setHomePaths

  flag not set, homePaths empty, workspaceFile is a file URI
    - sets flag
    - calls setHomePaths([path.dirname(workspaceFile.fsPath)])

  flag not set, homePaths empty, no workspaceFile, workspaceFolders[0] exists
    - sets flag
    - calls setHomePaths([path.dirname(folders[0].uri.fsPath)])

  flag not set, homePaths empty, no workspaceFile, no workspaceFolders
    - sets flag
    - does not call setHomePaths

  workspaceFile is not a file scheme (e.g. 'untitled')
    - falls through to workspaceFolders branch (or does nothing if no folders)
```

---

## Phase 1 — Also: homePathManager unit tests

The existing `homePathManager.ts` has no tests. Add them as part of Phase 1 infrastructure work.

**`src/test/homePathManager.test.ts`**

Mock `fs` using `memfs`. Mock `os.homedir()` via `vi.mock('os', () => ({ homedir: () => '/home/user' }))`.

```
describe('resolvePath')
  - '~' alone → '/home/user'
  - '~/code' → '/home/user/code'
  - '~/a/b/c' → '/home/user/a/b/c'
  - '/absolute/path' → '/absolute/path' (unchanged)
  - 'relative/path' → 'relative/path' (unchanged — not our job to resolve)

describe('scanRepos')
  setup: use memfs Volume with known directory structure

  - directory does not exist → returns []
  - directory exists and is empty → returns []
  - directory has subdirectories → returns their absolute paths
  - directory has files mixed with dirs → returns only dirs
  - directory has dotfile dirs (.git, .hidden) → excluded
  - directory has a dotfile dir and a regular dir → returns only the regular dir
  - readdirSync throws (simulate with memfs permissions) → returns []
  - returned paths are absolute (path.join(homePath, name))
  - returned paths are in filesystem order (no sort guarantee, but stable)
```

---

# Phase 2 — Repo List Polish

## Feature 2.1: Hide Repos

**Goal:** Let users hide specific repos from the list per-workspace without removing them from the home path. A master eye toggle in the view title reveals all hidden repos, and an inline eye icon on each row toggles individual visibility.

### Approach

Hidden repo paths persist in **`workspaceState`** under `workspaceManager.hiddenRepoPaths` as a `string[]`. Per-workspace storage is the right default: a repo hidden because it's irrelevant to workspace A may be the primary repo of workspace B.

The provider reads the set and omits hidden repos from `getChildren` by default. A context key `workspaceManager.showingHidden` controls which eye-icon variant appears in the view title.

Two states for the master toggle:
- **Normal** (default) — hidden repos are omitted; title bar shows `$(eye-closed)`.
- **Show all** — hidden repos render with `iconPath = $(eye-closed)` and `description: 'hidden'`; title bar shows `$(eye)`. (VS Code TreeItem has no native strikethrough — icon swap + description suffix is the correct substitute.)

**Auto-stage on hide:** if the user hides a repo that's currently active in the workspace, also stage an unchecked pending change. The user still has to hit Apply, so nothing is silently mutated, but they don't have to enter show-all mode just to clean up.

### Files to change

**`src/RepoTreeProvider.ts`**

- Accept `ExtensionContext` in the constructor.
- Add `hiddenPaths: Set<string>` — loaded from `workspaceState`.
- Add `showHidden = false`.
- Add `hideRepo(repoPath)` — adds to set, persists, auto-stages Unchecked if active, refreshes.
- Add `unhideRepo(repoPath)` — removes from set, persists, refreshes.
- Add `toggleShowHidden()` — flips flag, fires `_onDidChangeTreeData`, calls `updateHiddenContext()`.
- Add `updateHiddenContext()` — `setContext('workspaceManager.showingHidden', this.showHidden)`.
- Add private `getVisibleRepos(resolvedHomePath: string): string[]` — single pipeline, called by `getChildren`.
- `RepoItem` constructor gains `isHidden: boolean`. When `true`: `contextValue = 'repoHidden'`, `iconPath = $(eye-closed)`, `description = 'hidden'`.

**`src/extension.ts`**

- Pass `context` into `new RepoTreeProvider(context)`.
- Register `hideRepo`, `unhideRepo`, `toggleShowHidden`.

**`package.json`** — see inline/title menu entries in plan intro.

### Edge cases

- **Hiding an active repo** — auto-stages unchecked pending change.
- **Stale hidden paths** — orphan paths accumulate harmlessly; intentional (external drives can disappear).
- **Hiding a repo that's already hidden** — `Set.add` is idempotent; no duplicate.

### Tests

**`src/test/repoTreeProvider.test.ts`** (hide-specific section)

Use `makeContext()` for the ExtensionContext mock. Mock `scanRepos`/`getRawHomePaths`/`resolvePath`. Override `vscode.workspace.workspaceFolders` to control "active" repos.

```
describe('getVisibleRepos — hide logic')
  setup: homePath '/home/user/repos', repos [a, b, c], b is hidden in workspaceState

  showHidden = false
    - returns [a, c] (b excluded)

  showHidden = true
    - returns [a, b, c] (all included)

  no repos hidden
    - returns all repos regardless of showHidden

describe('hideRepo')
  - adds repoPath to hiddenPaths
  - persists hiddenPaths array to workspaceState
  - calls refresh() (verify _onDidChangeTreeData fires)
  - repo is active (in workspaceFolders) → stagePendingChange called with Unchecked
  - repo is not active → stagePendingChange not called

describe('unhideRepo')
  - removes repoPath from hiddenPaths
  - persists updated hiddenPaths to workspaceState
  - calls refresh()
  - unhiding a path not in hiddenPaths → no error, persists (empty or unchanged)

describe('toggleShowHidden')
  - default showHidden=false → becomes true after toggle
  - called again → back to false
  - fires _onDidChangeTreeData each time
  - calls setContext('workspaceManager.showingHidden', newValue) each time

describe('RepoItem — hidden flag')
  - isHidden=false → contextValue='repo', no 'hidden' description, $(repo) icon
  - isHidden=true → contextValue='repoHidden', description='hidden', $(eye-closed) icon
```

---

## Feature 2.2: Search / Filter

**Goal:** Type to filter the repo list by name, with the active filter visible above the tree and a one-click clear.

### Approach

A search button in the Repositories view title opens `vscode.window.showInputBox`. Use the input box's `onDidChangeValue` callback to **live-filter as the user types** — the tree updates with each keystroke. ESC closes without rollback (the live updates already applied and are persisted; the user can open the box and clear to undo).

Filter text persists per-workspace in `workspaceState`. Active filter is shown in `treeView.message` (banner above the tree, more visible than `description` for a feature that hides results). The provider exposes `onDidChangeFilter: vscode.Event<string>` so `extension.ts` can update the banner without the provider knowing about `treeView`.

### Files to change

**`src/RepoTreeProvider.ts`**

- Add `filterText: string` — init from `workspaceState.get('workspaceManager.filterText', '')`.
- Add `_onDidChangeFilter = new EventEmitter<string>()` and `onDidChangeFilter = this._onDidChangeFilter.event`.
- Add `setFilter(text)` — updates `filterText`, persists, calls `updateFilterContext()`, fires both `_onDidChangeTreeData` and `_onDidChangeFilter`.
- Add `clearFilter()` — delegates to `setFilter('')`.
- `updateFilterContext()` — `setContext('workspaceManager.filterActive', filterText.length > 0)`.
- Extend `getVisibleRepos(resolvedHomePath)` to add filter after hide:
  ```ts
  const filter = this.filterText.toLowerCase().trim();
  return repoPaths
    .filter(p => this.showHidden || !this.hiddenPaths.has(p))
    .filter(p => !filter || path.basename(p).toLowerCase().includes(filter));
  ```
- In `getChildren` for `HomePathItem`: if `getVisibleRepos` returns `[]` and `filterText` is set, return a single *"No results for '…'"* placeholder. If `getVisibleRepos` returns `[]` and no filter, return the existing *"No repositories found"* placeholder.

**`src/extension.ts`**

- Subscribe to `provider.onDidChangeFilter` → set `treeView.message = text ? 'Filter: ' + text : undefined`.
- Register:
  - `workspaceManager.filter` — `showInputBox({ value: provider.filterText, prompt: 'Filter repositories', onDidChangeValue: v => provider.setFilter(v) })`.
  - `workspaceManager.clearFilter` — `provider.clearFilter()`.

**`package.json`** — commands and title menu entries as described in plan intro.

### Edge cases

- **Pending change on a filtered-out repo** — Apply still applies it. Intentional.
- **HomePathItem with all repos filtered** — placeholder child so the home path header still renders.
- **Hide + filter ordering** — hide first, then filter; hidden repos never appear unless show-all is on.
- **ESC during live filter** — no rollback. Last typed value is persisted. Reopening the box restores it.

### Tests

**`src/test/repoTreeProvider.test.ts`** (filter-specific section)

```
describe('getVisibleRepos — filter logic')
  setup: repos [/repos/alpha, /repos/beta, /repos/gamma], no hidden repos

  filterText = ''
    - returns all three repos

  filterText = 'alpha'
    - returns [/repos/alpha]

  filterText = 'ALPHA' (uppercase)
    - returns [/repos/alpha] (case-insensitive)

  filterText = 'al'
    - returns [/repos/alpha] (substring match)

  filterText = 'zzz'
    - returns []

  filterText = 'a' with beta and gamma also matching
    - returns all repos with 'a' in basename (alpha, gamma, beta has no 'a')
    - verify exact subset

  filter applied after hide:
    - /repos/alpha is hidden, showHidden=false, filterText='alpha'
    - returns [] (hidden repo not surfaced by filter)

  filter applied after hide, showHidden=true:
    - /repos/alpha is hidden, showHidden=true, filterText='alpha'
    - returns [/repos/alpha]

describe('setFilter')
  - updates filterText property
  - persists to workspaceState under 'workspaceManager.filterText'
  - fires _onDidChangeTreeData
  - fires _onDidChangeFilter with the new text value
  - calls setContext('workspaceManager.filterActive', true) when text non-empty
  - calls setContext('workspaceManager.filterActive', false) when text is ''

describe('clearFilter')
  - sets filterText to ''
  - fires _onDidChangeFilter with ''
  - calls setContext('workspaceManager.filterActive', false)

describe('getChildren — filter placeholder')
  setup: homePath has repos but filter matches none

  - returns single placeholder TreeItem with label "No results for '…'"
  - placeholder appears as child of the HomePathItem (not top-level)

  setup: homePath is genuinely empty, no filter

  - returns existing "No repositories found" placeholder (distinct message)
```

---

# Phase 3 — Input Ergonomics

## Feature 3.1: Space to Toggle Focused Repo

**Goal:** With the Repositories view focused on a repo row, pressing Space toggles its checkbox.

### Approach

VS Code's tree view should already toggle a checkbox on Space when `checkboxState` is set. **Verify this first** in the dev host before writing code — if it works natively, this feature requires only a README entry.

If native Space does not work:

- Register `workspaceManager.toggleFocusedRepo`. Handler reads `treeView.selection[0]`, checks it is a `RepoItem`, computes the inverted target state based on current applied vs pending state, calls `provider.stagePendingChange(item.repoPath, targetState)`.
- Keybinding gated on `focusedView == workspaceManagerView`.

### Files to change _(only if native behavior is insufficient)_

- `src/extension.ts` — register command, access `treeView.selection`.
- `package.json` — `commands` and `keybindings` entries.

### Edge cases

- **Selection is not a `RepoItem`** — no-op.
- **Multi-select** — each selected `RepoItem` is toggled independently based on its own current state.

### Tests

_(Only write these if the fallback command is needed.)_

**`src/test/repoTreeProvider.test.ts`** (toggle command section)

```
describe('toggleFocusedRepo command handler')
  - selection is a RepoItem that is active → stages Unchecked
  - selection is a RepoItem that is inactive → stages Checked
  - selection is a HomePathItem → no-op (stagePendingChange not called)
  - selection is empty → no-op
  - multi-select with one active and one inactive RepoItem → each staged with inverted state
```

---

## Feature 3.2: Cmd+Enter to Apply Pending Changes

**Goal:** Cmd+Enter (Ctrl+Enter on non-mac) applies pending changes when the Repositories view has focus and there's something to apply.

### Approach

Pure `package.json` change — bind to the existing `applyChanges` command:

```json
"keybindings": [
  {
    "command": "workspaceManager.applyChanges",
    "key": "ctrl+enter",
    "mac": "cmd+enter",
    "when": "focusedView == workspaceManagerView && workspaceManager.hasPendingChanges"
  }
]
```

### Tests

No TypeScript changes → no unit tests. Covered by manual smoke test.

---

## Feature 3.3: Right-Click Context Menu (Repo Subset)

**Goal:** Right-clicking a repo opens a context menu with toggle/open actions.

### Approach

Repo context entries (in `view/item/context`, with `when: "viewItem == repo || viewItem == repoHidden"`):
1. **Toggle in Workspace** — `workspaceManager.toggleRepo`: reads `item.repoPath`, calls `stagePendingChange` with inverted state.
2. **Open in New Window** — `workspaceManager.openRepoInNewWindow`: `vscode.commands.executeCommand('vscode.openFolder', Uri.file(item.repoPath), true)`.
3. **Open in Current Window** — `workspaceManager.openRepoInCurrentWindow`: same with `false`. *(TODO.md lists "Open in new window" twice; treating the second as Open-in-Current-Window, the natural pair.)*

### Files to change

**`src/extension.ts`** — three command registrations, 3–6 lines each.

**`package.json`** — commands + `view/item/context` entries with `group: '1_toggle'` and `group: '2_open'`.

### Edge cases

- **Open in current window with unsaved changes** — VS Code's `vscode.openFolder` shows its own prompt. Don't reimplement.
- **Right-click placeholder row** — `viewItem` unset → menu doesn't appear.

### Tests

**`src/test/repoTreeProvider.test.ts`** (context menu command handlers)

```
describe('toggleRepo command handler')
  - item is an active RepoItem → stagePendingChange called with Unchecked
  - item is an inactive RepoItem → stagePendingChange called with Checked
  - item has an existing Unchecked pending change (i.e. matches applied state after pending) →
    stagePendingChange cancels the pending (or re-toggles; pin the specific behavior)

describe('openRepoInNewWindow command handler')
  - calls vscode.commands.executeCommand('vscode.openFolder', uri, true)
  - uri.fsPath equals item.repoPath

describe('openRepoInCurrentWindow command handler')
  - calls vscode.commands.executeCommand('vscode.openFolder', uri, false)
```

---

# Phase 4 — Groups

## Feature 4.1: Groups Data Model and Storage

**Goal:** Define the persistent shape that Phase 4 features build on.

### Approach

```ts
type Group = {
  id: string;          // crypto.randomUUID()
  name: string;        // user-facing; unique; not 'user-default-group'
  repoPaths: string[]; // resolved absolute paths
};
```

Persist as `Group[]` under `workspaceState.workspaceManager.groups`. Track active group as `string | undefined` under `workspaceState.workspaceManager.activeGroupId`. The default group is **virtual** — never stored, never rendered. "Active = undefined" is the default state. To deactivate, click the active group's row again (toggle off → `setActive(undefined)`).

### Files to change

**`src/groupManager.ts`** _(new file)_

```ts
const KEY_GROUPS  = 'workspaceManager.groups';
const KEY_ACTIVE  = 'workspaceManager.activeGroupId';
const RESERVED    = 'user-default-group';

export class GroupManager {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private context: vscode.ExtensionContext) {}

  getAll(): Group[]            // defaults [] on missing/corrupt storage
  getActive(): Group | undefined
  getActiveId(): string | undefined
  isReserved(name: string): boolean    // case-insensitive
  isNameTaken(name: string, excludeId?: string): boolean

  async create(name: string, repoPaths: string[]): Promise<Group>
  async rename(id: string, newName: string): Promise<void>
  async delete(id: string): Promise<void>
    // clears activeGroupId first if id === activeGroupId
  async setActive(id: string | undefined): Promise<void>
  async updateRepoPaths(id: string, repoPaths: string[]): Promise<void>
}
```

Validation in `create` and `rename`: reject empty/whitespace, reserved name, duplicate (all case-insensitive). Throw `Error` with a user-readable message; callers display it via `showErrorMessage`.

### Edge cases

- **Groups payload corrupted** — `getAll()` wraps in try/catch; returns `[]` on any parse error.
- **No `.code-workspace`** — groups work in `workspaceState`; switching is a no-op without a workspace file (same existing behavior as `applyChanges`).

### Tests

**`src/test/groupManager.test.ts`**

Use `makeContext()` for the ExtensionContext. No filesystem or VS Code API calls needed — `GroupManager` only touches `workspaceState`.

```
describe('create')
  valid name 'frontend', repoPaths ['/a', '/b']
    - getAll() returns one group with name='frontend', repoPaths=['/a','/b']
    - group has a non-empty string id (uuid format)
    - fires onDidChange

  invalid names
    - '' → rejects (throws)
    - '   ' → rejects
    - 'user-default-group' → rejects
    - 'User-Default-Group' → rejects (case-insensitive)
    - 'USER-DEFAULT-GROUP' → rejects

  duplicate name
    - create 'foo' then create 'foo' → second call rejects
    - create 'foo' then create 'FOO' → rejects (case-insensitive)
    - create 'foo' then create 'bar' → succeeds

describe('rename')
  - valid rename 'foo' → 'bar' → getAll()[0].name === 'bar', fires onDidChange
  - rename to same name → no-op (accepted without error, no change)
  - rename to reserved name → rejects
  - rename to name of another group → rejects
  - rename to name of another group (different case) → rejects
  - rename unknown id → no-op (does not throw)
  - rename does not change id or repoPaths

describe('delete')
  - removes the group from getAll()
  - fires onDidChange
  - deleting a non-active group → activeGroupId unchanged
  - deleting the active group → getActiveId() returns undefined
  - deleting unknown id → no-op, no throw

describe('setActive')
  - setActive(id) → getActiveId() === id, persisted, fires onDidChange
  - setActive(undefined) → getActiveId() === undefined, persisted, fires onDidChange
  - setActive(id) when id not in groups → persists id anyway (caller's responsibility)

describe('getActive')
  - no activeGroupId → returns undefined
  - activeGroupId set to valid group id → returns that Group
  - activeGroupId set to stale id (not in list) → returns undefined

describe('updateRepoPaths')
  - updates the correct group's repoPaths
  - leaves other groups unchanged
  - persists
  - fires onDidChange
  - unknown id → no-op, no throw

describe('getAll')
  - empty storage → []
  - non-array stored value → []
  - valid array → returns it

describe('isReserved')
  - 'user-default-group' → true
  - 'User-Default-Group' → true
  - 'frontend' → false
  - '' → false

describe('isNameTaken')
  - 'foo' when group 'foo' exists → true
  - 'FOO' when group 'foo' exists → true (case-insensitive)
  - 'foo' with excludeId = foo's id → false (rename to own name)
  - 'bar' when only 'foo' exists → false
```

---

## Feature 4.2: Groups Panel and CRUD UI

**Goal:** A collapsible panel above Repositories that lists user-defined groups, with create/rename/delete/switch actions.

### Approach

Add `workspaceManagerGroups` as the first view in the container. A new `GroupsPanelProvider` renders one row per group:
- **Label:** `group.name`
- **Icon:** `$(record)` when active, `$(circle-large-outline)` when not
- **Description:** `'active'` when active, `''` otherwise
- **Tooltip:** `'N repositories'`
- **`contextValue`:** `'group'`
- **`command`:** `workspaceManager.activateGroup` (so clicking the row activates the group)
- **Inline actions:** `$(edit)` → rename, `$(close)` → delete with confirm

When no groups exist: single placeholder *"No groups. Click + to create one."*

### Files to change

**`src/GroupsPanelProvider.ts`** _(new file)_

```
export class GroupRow extends vscode.TreeItem {
  constructor(public readonly group: Group, isActive: boolean) { ... }
}

export class GroupsPanelProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  constructor(private gm: GroupManager)
    - subscribe: gm.onDidChange(() => this.refresh())
  getChildren(): placeholder if no groups; else map(gm.getAll(), ...)
}
```

**`src/extension.ts`** — construct `GroupManager` and `GroupsPanelProvider`, register tree view, register `createGroup`, `renameGroup`, `deleteGroup`, `activateGroup` commands.

**`package.json`** — three-view layout (Groups first, then Repositories, then Home Paths).

### Edge cases

- **Reserved name on create** — `GroupManager.create` throws; command handler catches and calls `showErrorMessage`.
- **Delete confirm cancelled** — no-op.

### Tests

**`src/test/groupsPanelProvider.test.ts`**

```
describe('getChildren')
  - gm.getAll() returns [] → single placeholder TreeItem
  - gm.getAll() returns [g1, g2] → two GroupRow items
  - active group g1, inactive g2:
    g1 row: icon id 'record', description='active', contextValue='group'
    g2 row: icon id 'circle-large-outline', description='', contextValue='group'
  - both groups inactive (activeGroupId undefined):
    both rows have icon 'circle-large-outline', description=''
  - GroupRow.command is set (activates the group on click)
  - GroupRow tooltip contains the repo count as a number

describe('auto-refresh')
  - gm fires onDidChange → provider fires onDidChangeTreeData
  - multiple onDidChange fires → provider fires onDidChangeTreeData each time
```

---

## Feature 4.3: Active Group Switching and Group-Aware Apply

**Goal:** Clicking a group makes the workspace match that group's saved repo set. Hitting Apply while a group is active also updates the group's saved `repoPaths`.

### Approach

**Switching:**
1. If `pendingChanges` is non-empty, prompt *"Switch groups? Pending changes will be discarded."*
2. Clear `pendingChanges`, call `writeWorkspaceFolders(group.repoPaths)`, call `gm.setActive(group.id)`, refresh.
3. Clicking the **already-active** group → `gm.setActive(undefined)` (workspace unchanged; user deselects the active group to go back to freeform editing).

**Group-aware Apply:**
- After computing `finalPaths` in `applyChanges`: if `gm.getActiveId()` is set, call `gm.updateRepoPaths(activeId, finalPaths)`.

**Shared helper:**
Extract `writeWorkspaceFolders(paths: string[])` from `applyChanges` so both switching and applying use the same write path.

### Files to change

**`src/RepoTreeProvider.ts`**
- Constructor takes `GroupManager` in addition to `ExtensionContext`.
- Extract `private writeWorkspaceFolders(paths: string[]): void`.
- `applyChanges`: after writing folders, `if (this.gm.getActiveId()) await this.gm.updateRepoPaths(...)`.
- Subscribe to `gm.onDidChange` → refresh (keeps description and active indicator in sync).

**`src/extension.ts`**
- `treeView.description` wired to `gm.getActive()?.name ?? undefined` via subscription to `gm.onDidChange`.
- Register `activateGroup` command with pending-changes prompt.

### Edge cases

- **No `.code-workspace`** — `writeWorkspaceFolders` is a no-op; group state still updates.
- **Active group deleted while another window is open** — `GroupManager.delete` clears `activeGroupId`; provider refresh removes the description.
- **Switching with filter or show-hidden on** — switching only changes workspace folders; filter/showHidden state is unaffected.

### Tests

**`src/test/repoTreeProvider.test.ts`** (group switching and apply section)

Mock `fs.readFileSync` / `fs.writeFileSync` via `vi.mock('fs', ...)`. Use a spy on `gm.updateRepoPaths`.

```
describe('writeWorkspaceFolders')
  - reads workspace JSON (with JSONC comments), strips comments, replaces 'folders' array, writes back
  - handles empty paths array → writes folders: []
  - no workspaceFile → no-op (does not throw)
  - handles workspace JSON with existing folders → replaces them entirely

describe('applyChanges — group-aware')
  - active group set: after writing folders, gm.updateRepoPaths called with finalPaths
  - no active group: gm.updateRepoPaths not called
  - no pending changes → no-op, gm.updateRepoPaths not called

describe('activateGroup command handler')
  no pending changes
    - calls writeWorkspaceFolders with group.repoPaths
    - calls gm.setActive(group.id)
    - clears pendingChanges

  pending changes exist, user confirms Discard
    - proceeds with switch (writeWorkspaceFolders, gm.setActive, clear pending)

  pending changes exist, user cancels
    - pendingChanges unchanged
    - gm.setActive not called
    - writeWorkspaceFolders not called

  clicking already-active group
    - calls gm.setActive(undefined)
    - does not call writeWorkspaceFolders (workspace unchanged)
```

---

## Feature 4.4: Home-Path Removal Confirm (Groups-Aware)

**Goal:** When a home path is removed, the confirm prompt lists affected workspace folders **and** groups; on confirm cleans up both.

### Approach

`removeOneHomePath(row)` (upgraded from Phase 1):
1. `removedPath = resolvePath(row.rawPath)`.
2. `affectedRepos = scanRepos(removedPath)`.
3. `affectedWorkspaceFolders` = intersection of `affectedRepos` and current workspace folders.
4. `affectedGroups` = groups where any `repoPaths` entry starts with `removedPath + path.sep`.
5. Build warning message with counts and group names.
6. On confirm:
   - `gm.updateRepoPaths(g.id, g.repoPaths.filter(p => !p.startsWith(removedPath + sep)))` for each affected group.
   - `writeWorkspaceFolders(current.filter(f => !affectedWorkspaceFolders.has(f)))`.
   - `setHomePaths(current.filter(p => p !== row.rawPath))`.

### Files to change

**`src/extension.ts`** — the `removeOneHomePath` command handler grows to do the analysis and call the GroupManager and workspace write helpers.

### Edge cases

- **Group becomes empty after cleanup** — left in place; user deletes it manually.
- **Active group affected** — its `repoPaths` update; since the workspace also updates, they stay in sync without needing an explicit Apply.
- **A repo path in multiple groups** — each group processed independently.
- **Cancel** — no changes made.

### Tests

**`src/test/removeOneHomePath.test.ts`** _(or inline in extension command tests)_

```
setup: homePath '/dev', repos ['/dev/a', '/dev/b'], '/dev/a' in workspace,
       group 'g1' contains ['/dev/a', '/dev/b', '/other/c'],
       group 'g2' contains ['/other/x'] (unaffected)

confirm pressed
  - gm.updateRepoPaths called for g1 with ['/other/c']
  - gm.updateRepoPaths NOT called for g2
  - writeWorkspaceFolders called without '/dev/a'
  - setHomePaths called without '/dev'

cancel pressed
  - no gm.updateRepoPaths calls
  - no writeWorkspaceFolders call
  - no setHomePaths call

no affected workspace folders, no affected groups
  - confirm message omits the workspace and groups lines (or shows 0)
  - on confirm: still removes the home path from settings

home path has no repos
  - confirm message reflects 0 affected folders and 0 affected groups
```

---

## Feature 4.5: Right-Click Context Menu (Group Subset)

**Goal:** Right-clicking a group row opens a context menu with activate/rename/delete actions.

### Approach

Pure `package.json` addition — no new TypeScript. All three commands already exist from Feature 4.2.

```json
"view/item/context": [
  { "command": "workspaceManager.activateGroup", "when": "viewItem == group", "group": "1_toggle" },
  { "command": "workspaceManager.renameGroup",   "when": "viewItem == group", "group": "9_modify" },
  { "command": "workspaceManager.deleteGroup",   "when": "viewItem == group", "group": "9_modify" }
]
```

### Tests

No new TypeScript → no unit tests. The underlying commands are tested under Feature 4.2 and 4.3.

---

# Final touches per phase

Each phase ends with, in order:

1. **Run unit tests** — `npm test` must pass with zero failures.
2. **Run coverage** — `npm run test:coverage`. Lines and functions must stay ≥ 80%, branches ≥ 75%.
3. **Version bump** in `package.json` to the version in the scope table.
4. **README update** describing new user-visible features for this phase.
5. **Manual smoke test** in the dev host: open a `.code-workspace`, exercise each new command, reload the host window and verify persisted state survives the reload.

---

# Out of scope

The following items appeared during planning but are intentionally deferred:

- Fuzzy matching for the filter (substring is good enough for repo names).
- Auto-detection of workspace ↔ active-group divergence with a "modified" indicator.
- Bulk hide / unhide.
- Importing/exporting groups across workspaces (groups are intentionally per-workspace).
- Auto-cleanup of stale hidden paths or stale group entries (intentional, to handle external drives gracefully).
- Integration tests using `@vscode/test-electron` (unit tests give sufficient coverage; integration tests are a future addition if regressions emerge).
