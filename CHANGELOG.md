# Change Log

All notable changes to the **MD Context Injector** extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.0.1] - 2026-05-23

### Added

- **Inline `@` completion provider** for Markdown files. Typing `@` opens a native IntelliSense-style popup at the cursor with every workspace file and folder, with fuzzy filtering as you keep typing.
- **Cached workspace index** built once on activation and reused across triggers. Backed by a `FileSystemWatcher` so it invalidates automatically on file create/delete.
- **Folder support** — directories are auto-derived from the indexed file paths and rendered with the proper folder icon, distinct from files.
- **Configurable exclude list:**
  - `mdContextInjector.useDefaultExcludes` (`boolean`, default `true`) — toggle for the built-in defaults (`node_modules`, `.git`, `build`, `out`, `dist`, `.next`, `.cache`, `.turbo`, `coverage`, `.fvm`, `.dart_tool`, `android`, `ios`, `.run`).
  - `mdContextInjector.excludePatterns` (`string[]`, default `[]`) — additional glob patterns, merged with the defaults.
  - Both settings have `resource` scope (configurable per-workspace) and trigger an automatic index rebuild when changed.
- **Manual commands:**
  - `LLM Context: Insert Workspace Relative Path` — opens a centered QuickPick fallback for cases where you'd rather invoke the picker without typing `@`.
  - `LLM Context: Refresh File Index` — forces a rebuild of the file/folder index.
- **Dedicated `MD Context Injector` Output channel** for activation logs, index rebuild timings, and configuration-change diagnostics.
