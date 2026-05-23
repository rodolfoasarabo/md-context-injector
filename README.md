# Markdown Context Injector

A VS Code / Cursor extension that lets you quickly insert workspace-relative file and folder paths into Markdown files using inline `@`-completions.

Perfect for prepping prompts and context blocks for LLM tooling (Claude Code, Cursor, ChatGPT, etc.) that expects repository-relative paths like `@src/components/Button.tsx`.

## Features

- **Inline `@` picker.** Type `@` in any Markdown file and get a native IntelliSense-style popup at the cursor with all workspace files and folders.
- **Folder support.** Pick directories as well as files. Folders are auto-derived from the indexed file paths and rendered with the proper folder icon.
- **Fast.** Files are scanned once on extension startup and cached in memory. The cache is invalidated automatically when files are created or deleted, so subsequent `@` presses are effectively instant.
- **Fuzzy filtering.** As you keep typing after `@`, VS Code's native fuzzy matcher filters paths by every segment — `@compbut` will surface `src/components/Button.tsx`.
- **Configurable excludes.** Sensible defaults out of the box (`node_modules`, `.git`, `dist`, `build`, etc.) plus per-workspace overrides for additional patterns.
- **Manual fallback.** A command-palette command opens a centered QuickPick if you'd rather drive the picker without typing `@`.

## Usage

1. Open a `.md` file in a workspace.
2. Type `@`. An inline completion popup appears at the cursor.
3. Keep typing to fuzzy-filter (e.g. `@compbut` → `src/components/Button.tsx`).
4. Press `Enter` (or click) → the relative path is inserted right after the `@`, producing `@src/components/Button.tsx`.

The `@` is preserved by design — most LLM tooling expects the `@path/to/file` reference syntax.

## Commands

| Command | Description |
| --- | --- |
| `LLM Context: Insert Workspace Relative Path` | Opens a centered QuickPick to insert a file/folder path. Useful as a fallback or for binding to a custom keybinding. |
| `LLM Context: Refresh File Index` | Forces a rebuild of the file/folder index. Mostly useful if files were changed outside VS Code and the watcher missed them. |

## Settings

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `markdownContextInjector.useDefaultExcludes` | `boolean` | `true` | Include the built-in exclude list (`node_modules`, `.git`, `build`, `out`, `dist`, `.next`, `.cache`, `.turbo`, `coverage`, `.fvm`, `.dart_tool`, `android`, `ios`, `.run`). |
| `markdownContextInjector.excludePatterns` | `string[]` | `[]` | Additional glob patterns to exclude from the picker. Merged with the defaults unless `useDefaultExcludes` is `false`. |

Both settings have `resource` scope, so you can configure them per workspace folder.

### Example workspace config

`.vscode/settings.json`:

```json
{
  "markdownContextInjector.excludePatterns": [
    "**/*.lock",
    "**/__snapshots__/**",
    "**/tmp/**"
  ]
}
```

If you want to fully take over the exclude list (no defaults), set:

```json
{
  "markdownContextInjector.useDefaultExcludes": false,
  "markdownContextInjector.excludePatterns": [
    "**/node_modules/**",
    "**/my-private-folder/**"
  ]
}
```

The index rebuilds automatically when either setting changes — no reload required.

## Development

```bash
yarn install
yarn compile     # one-shot webpack build
yarn watch       # rebuild on save
```

Press `F5` in VS Code to launch an Extension Development Host with the extension loaded. Logs appear in the **Output** panel under the channel **"Markdown Context Injector"**.

## Requirements

- VS Code `^1.105.0` (or any Electron-based editor that supports the same extension API, such as Cursor).
- A workspace with at least one folder open — the extension needs a workspace to scan.
