# Workspace Manager

A VS Code extension that lets you manage which repositories from your home directories are active in the current workspace.

## Testing Locally

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- VS Code or Cursor

### Setup

```sh
npm install
npm run compile
```

### Launch the Extension Development Host

#### VS Code

1. Open this folder in VS Code.
2. Press **F5** (or go to **Run > Start Debugging**).

A second VS Code window opens — the **Extension Development Host** — with the extension loaded.

#### Cursor

1. Open this folder in Cursor.
2. Press **F5** (or go to **Run > Start Debugging**).

Cursor will open a **VS Code** Extension Development Host window (not a Cursor window) — this is expected. The extension runs inside that VS Code instance. If you want to test inside Cursor itself, see [Installing as a .vsix](#installing-as-a-vsix) below.

---

### Using the Extension

1. In the Extension Development Host window, open (or create) a `.code-workspace` file. The extension works without one, but workspace folder changes won't persist across restarts without it.
2. Click the **Workspace Manager** icon in the Activity Bar (left sidebar).
3. Click **+** to add a home directory — this is a folder whose immediate subdirectories will appear as selectable repositories.
4. Check a repository to add it to the workspace; uncheck it to remove it.

### Iterating

| Task | Command |
|---|---|
| Recompile once | `npm run compile` |
| Recompile on save | `npm run watch` |
| Reload host window | **Cmd+R** in the host window |
| View extension logs | **Help > Toggle Developer Tools** in the host window |

---

### Installing as a .vsix

To test the extension as an end user would install it (including inside Cursor):

```sh
npm install --save-dev @vscode/vsce
npx vsce package
```

This produces a `.vsix` file. Install it:

- **VS Code:** `code --install-extension workspace-manager-*.vsix`
- **Cursor:** Open the command palette (**Cmd+Shift+P**), run **Extensions: Install from VSIX...**, and select the file.
