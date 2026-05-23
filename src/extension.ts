import * as vscode from 'vscode';
import { ThemeIcon } from 'vscode';
import path from 'path';

const TRIGGER_CHARACTER = '@';

const CONFIG_NAMESPACE = 'markdownContextInjector';
const CONFIG_USE_DEFAULTS = 'useDefaultExcludes';
const CONFIG_USER_PATTERNS = 'excludePatterns';

// Built-in defaults. Tuned for JS/TS, Flutter and common build outputs.
// Users can toggle these off or add their own via settings.
const DEFAULT_EXCLUDE_PATTERNS: readonly string[] = [
	'**/node_modules/**',
	'**/.git/**',
	'**/build/**',
	'**/out/**',
	'**/dist/**',
	'**/.fvm/**',
	'**/.dart_tool/**',
	'**/android/**',
	'**/ios/**',
	'**/.run/**',
	'**/coverage/**',
	'**/.next/**',
	'**/.cache/**',
	'**/.turbo/**',
];

function getExcludeGlob(): string | null {
	const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
	const useDefaults = config.get<boolean>(CONFIG_USE_DEFAULTS, true);
	const userPatterns = config.get<string[]>(CONFIG_USER_PATTERNS, []);

	const patterns = [
		...(useDefaults ? DEFAULT_EXCLUDE_PATTERNS : []),
		...userPatterns.filter((p) => typeof p === 'string' && p.trim().length > 0),
	];

	if (patterns.length === 0) {
		return null;
	}
	if (patterns.length === 1) {
		return patterns[0];
	}
	return `{${patterns.join(',')}}`;
}

let output: vscode.OutputChannel;
let index: WorkspaceIndex;

interface IndexedPath {
	relativePath: string;
	isFolder: boolean;
}

class WorkspaceIndex {
	private cache: IndexedPath[] | null = null;
	private inflight: Promise<IndexedPath[]> | null = null;
	private watcher: vscode.FileSystemWatcher | undefined;

	constructor(private readonly channel: vscode.OutputChannel) { }

	register(context: vscode.ExtensionContext): void {
		this.watcher = vscode.workspace.createFileSystemWatcher('**/*');
		const invalidate = (uri: vscode.Uri) => {
			if (this.cache) {
				this.channel.appendLine(`Index invalidated by change to ${uri.fsPath}`);
			}
			this.cache = null;
		};
		this.watcher.onDidCreate(invalidate);
		this.watcher.onDidDelete(invalidate);

		const refreshOnFolderChange = vscode.workspace.onDidChangeWorkspaceFolders(() => {
			this.channel.appendLine('Workspace folders changed, rebuilding index');
			this.invalidate();
			void this.getItems();
		});

		const refreshOnConfigChange = vscode.workspace.onDidChangeConfiguration((event) => {
			if (
				event.affectsConfiguration(`${CONFIG_NAMESPACE}.${CONFIG_USE_DEFAULTS}`) ||
				event.affectsConfiguration(`${CONFIG_NAMESPACE}.${CONFIG_USER_PATTERNS}`)
			) {
				this.channel.appendLine('Exclude settings changed, rebuilding index');
				this.invalidate();
				void this.getItems();
			}
		});

		context.subscriptions.push(this.watcher, refreshOnFolderChange, refreshOnConfigChange);

		// Eagerly warm the cache so the first `@` press is instant.
		void this.getItems();
	}

	invalidate(): void {
		this.cache = null;
	}

	async getItems(): Promise<IndexedPath[]> {
		if (this.cache) {
			return this.cache;
		}
		if (this.inflight) {
			return this.inflight;
		}
		this.inflight = this.build();
		try {
			this.cache = await this.inflight;
			return this.cache;
		} finally {
			this.inflight = null;
		}
	}

	private async build(): Promise<IndexedPath[]> {
		const startedAt = Date.now();
		const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
		if (workspaceFolders.length === 0) {
			return [];
		}

		const excludeGlob = getExcludeGlob();
		const files = await vscode.workspace.findFiles('**/*', excludeGlob);

		const items: IndexedPath[] = [];
		const folderPaths = new Set<string>();

		for (const file of files) {
			const relative = toPosix(vscode.workspace.asRelativePath(file, false));
			items.push({ relativePath: relative, isFolder: false });

			let dir = path.posix.dirname(relative);
			while (dir && dir !== '.' && dir !== '/' && !folderPaths.has(dir)) {
				folderPaths.add(dir);
				dir = path.posix.dirname(dir);
			}
		}

		const folderItems: IndexedPath[] = [...folderPaths]
			.sort()
			.map((folderPath) => ({ relativePath: folderPath, isFolder: true }));

		// Folders first so directory-level references are easy to find.
		const all = [...folderItems, ...items];

		this.channel.appendLine(
			`Indexed ${all.length} entries (${items.length} files, ${folderItems.length} folders) in ${Date.now() - startedAt}ms`
		);
		return all;
	}
}

class PathCompletionProvider implements vscode.CompletionItemProvider {
	constructor(private readonly workspaceIndex: WorkspaceIndex) { }

	async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position
	): Promise<vscode.CompletionList | undefined> {
		// Look back from the cursor to find the most recent `@` on this line.
		// Bail out if there's whitespace or another `@` between the cursor and the trigger.
		const linePrefix = document.lineAt(position.line).text.substring(0, position.character);
		const match = linePrefix.match(/@([^\s@]*)$/);
		if (!match) {
			return undefined;
		}

		const items = await this.workspaceIndex.getItems();
		if (items.length === 0) {
			return undefined;
		}

		const query = match[1];
		// We want to keep the leading `@` in the document and replace only the
		// fragment the user has typed after it. The range spans from just after
		// the `@` to the current cursor position.
		const replaceRange = new vscode.Range(
			position.line,
			position.character - query.length,
			position.line,
			position.character
		);

		const completions = items.map((item) => {
			const completion = new vscode.CompletionItem(
				item.relativePath,
				item.isFolder
					? vscode.CompletionItemKind.Folder
					: vscode.CompletionItemKind.File
			);
			completion.insertText = item.relativePath;
			completion.range = replaceRange;
			completion.filterText = item.relativePath;
			completion.detail = item.isFolder ? 'folder' : 'file';
			// Sort folders just slightly above files for ties; VS Code's fuzzy
			// match score still dominates when the user types a query.
			completion.sortText = `${item.isFolder ? '0' : '1'}_${item.relativePath}`;
			return completion;
		});

		return new vscode.CompletionList(completions, /* isIncomplete */ false);
	}
}

export function activate(context: vscode.ExtensionContext) {
	output = vscode.window.createOutputChannel('Markdown Context Injector');
	output.appendLine('Extension activated');

	index = new WorkspaceIndex(output);
	index.register(context);

	const insertPathCommand = vscode.commands.registerCommand(
		'markdown-context-injector.insertPath',
		() => insertWorkspaceRelativePath()
	);

	const refreshCommand = vscode.commands.registerCommand(
		'markdown-context-injector.refreshIndex',
		async () => {
			output.appendLine('Manual index refresh requested');
			index.invalidate();
			await index.getItems();
		}
	);

	// Inline IntelliSense-style picker for markdown. Triggered by typing `@`
	// (and naturally re-queried as the user keeps typing characters after it).
	const completionProvider = vscode.languages.registerCompletionItemProvider(
		{ language: 'markdown' },
		new PathCompletionProvider(index),
		TRIGGER_CHARACTER
	);

	context.subscriptions.push(insertPathCommand, refreshCommand, completionProvider, output);
}

async function insertWorkspaceRelativePath(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showErrorMessage('No active editor found');
		return;
	}

	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders || workspaceFolders.length === 0) {
		vscode.window.showErrorMessage('No workspace folders found');
		return;
	}

	const picker = vscode.window.createQuickPick<vscode.QuickPickItem & { relativePath: string }>();
	picker.placeholder = 'Select a file or folder to reference...';
	picker.matchOnDescription = true;
	picker.busy = true;
	picker.show();

	try {
		const items = await index.getItems();
		picker.items = items.map((item) => ({
			label: item.relativePath,
			description: item.isFolder ? '(folder)' : undefined,
			iconPath: new ThemeIcon(item.isFolder ? 'folder' : 'file'),
			relativePath: item.relativePath,
		}));
	} finally {
		picker.busy = false;
	}

	const selection = await new Promise<{ relativePath: string } | undefined>((resolve) => {
		picker.onDidAccept(() => {
			resolve(picker.selectedItems[0]);
			picker.hide();
		});
		picker.onDidHide(() => resolve(undefined));
	});
	picker.dispose();

	if (!selection) {
		return;
	}

	await editor.edit((editBuilder) => {
		editBuilder.insert(editor.selection.start, selection.relativePath);
	});
}

function toPosix(p: string): string {
	return p.split(path.sep).join('/');
}

export function deactivate() { }
