import * as path from "path";
import * as fs from "fs";
import {
  workspace,
  ExtensionContext,
  commands,
  window,
  TextEditor,
  Range,
  Position,
  DecorationOptions,
  ThemeColor,
  TextEditorDecorationType,
} from "vscode";

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  State,
  TransportKind,
  ExecuteCommandRequest,
} from "vscode-languageclient/node";

let client: LanguageClient;
let commandsRegistered = false;
let activeLineInfoDecoration: TextEditorDecorationType | undefined;
let activeLineInfoTimer: NodeJS.Timeout | undefined;
let activeLineInfoSeq = 0;

export async function activate(context: ExtensionContext) {
  // Guard command registration — only once per extension host lifetime.
  // On hot-reload / window-reload activate() is called again but commands
  // already exist; registering them a second time throws "command already exists".
  if (!commandsRegistered) {
    commandsRegistered = true;
    const cmds: [string, () => any][] = [
      ["asun.format", () => formatDocument()],
      ["asun.compress", () => compressDocument()],
      ["asun.toJSON", () => asunToJSON()],
      ["asun.fromJSON", () => jsonToASUN()],
    ];
    for (const [id, handler] of cmds) {
      try {
        context.subscriptions.push(commands.registerCommand(id, handler));
      } catch {
        // Command already registered by another instance (dev + installed overlap)
      }
    }
  }

  const serverPath = resolveServerPath(context);
  if (!serverPath) {
    window.showErrorMessage(
      "ASUN LSP binary not found. Please set asun.lspPath in settings or ensure lsp-asun (or asun-lsp) is in PATH.",
    );
    return;
  }

  const serverOptions: ServerOptions = {
    run: {
      command: serverPath,
      args: ["-stdio"],
      transport: TransportKind.stdio,
    },
    debug: {
      command: serverPath,
      args: ["-stdio"],
      transport: TransportKind.stdio,
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: "file",     language: "asun" },
      { scheme: "untitled", language: "asun" },
    ],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher("**/*.asun"),
    },
  };

  // If already running (e.g. rare double-activation edge case), skip.
  // deactivate() handles cleanup — do NOT stop here to avoid spurious SIGKILL cycles.
  if (client) {
    return;
  }

  // Create the decoration type as early as possible during activation.
  // VS Code orders sibling inline `after` decorations at the same position
  // by decoration-type creation order; an earlier type tends to render
  // closer to the code (i.e. before later types such as GitLens'
  // current-line blame). Creating it before client.start() gives our
  // hint the best chance of appearing ahead of other extensions.
  if (!activeLineInfoDecoration) {
    activeLineInfoDecoration = window.createTextEditorDecorationType({
      after: {
        margin: "0 0 0 1.5rem",
        color: new ThemeColor("editorCodeLens.foreground"),
      },
      rangeBehavior: 1,
    });
    context.subscriptions.push(activeLineInfoDecoration);
  }

  client = new LanguageClient(
    "asun-lsp",
    "ASUN Language Server",
    serverOptions,
    clientOptions,
  );

  try {
    await client.start();
    context.subscriptions.push(
      window.onDidChangeTextEditorSelection((e) => scheduleActiveLineInfoUpdate(e.textEditor)),
    );
    context.subscriptions.push(
      window.onDidChangeActiveTextEditor((editor) => scheduleActiveLineInfoUpdate(editor)),
    );
    context.subscriptions.push(
      workspace.onDidChangeTextDocument((e) => {
        const editor = window.activeTextEditor;
        if (!editor || editor.document.uri.toString() !== e.document.uri.toString()) return;
        scheduleActiveLineInfoUpdate(editor);
      }),
    );
    scheduleActiveLineInfoUpdate(window.activeTextEditor);
    context.subscriptions.push(client);
  } catch (err: any) {
    window.showErrorMessage(
      `ASUN Language Server failed to start: ${err?.message ?? err}\nBinary: ${serverPath}`,
    );
  }
}

export function deactivate(): Thenable<void> | undefined {
  if (activeLineInfoTimer) {
    clearTimeout(activeLineInfoTimer);
    activeLineInfoTimer = undefined;
  }
  if (!client) {
    return undefined;
  }
  return client.stop();
}

/**
 * Resolve the asun-lsp binary path.
 * Priority: settings > bundled (server/ inside extension) > PATH
 */
function resolveServerPath(context: ExtensionContext): string | undefined {
  // 1. Check user setting
  const config = workspace.getConfiguration("asun");
  const configPath = config.get<string>("lspPath");
  if (configPath && configPath.trim() !== "") {
    if (fs.existsSync(configPath)) {
      return configPath;
    }
    window.showWarningMessage(
      `asun.lspPath "${configPath}" not found, trying defaults.`,
    );
  }

  // 2. Check bundled binary inside extension (like rust-analyzer)
  //    Prefer lsp-asun (Zig implementation), fall back to asun-lsp (Go).
  const isWindows = process.platform === "win32";
  const ext = isWindows ? ".exe" : "";
  const bundledPaths = [
    // Zig LSP — primary (bundled server/ or dev sibling directory)
    path.resolve(context.extensionPath, "server", `lsp-asun${ext}`),
    path.resolve(context.extensionPath, "..", "lsp-asun", "zig-out", "bin", `lsp-asun${ext}`),
    // Go LSP — fallback
    path.resolve(context.extensionPath, "server", `asun-lsp${ext}`),
    path.resolve(context.extensionPath, "..", "asun-lsp", `asun-lsp${ext}`),
  ];
  for (const bp of bundledPaths) {
    if (fs.existsSync(bp)) {
      // Ensure executable permission on Unix
      if (!isWindows) {
        try {
          fs.chmodSync(bp, 0o755);
        } catch {
          // ignore
        }
      }
      return bp;
    }
  }

  // 3. Check PATH — prefer lsp-asun, fall back to asun-lsp
  const { execSync } = require("child_process");
  for (const binaryName of ["lsp-asun", "asun-lsp"]) {
    try {
      const cmd = isWindows ? `where ${binaryName}` : `which ${binaryName}`;
      const which = execSync(cmd, { encoding: "utf8" }).trim();
      if (which && fs.existsSync(which)) {
        return which;
      }
    } catch {
      // not in PATH, try next
    }
  }

  return undefined;
}

/**
 * Format (beautify) the active ASUN document.
 */
async function formatDocument() {
  const editor = window.activeTextEditor;
  if (!editor || editor.document.languageId !== "asun") {
    window.showInformationMessage("Open an ASUN file first.");
    return;
  }
  await commands.executeCommand("editor.action.formatDocument");
}

/**
 * Compress (minify) the active ASUN document via LSP command.
 */
async function compressDocument() {
  const editor = window.activeTextEditor;
  if (!editor || editor.document.languageId !== "asun") {
    window.showInformationMessage("Open an ASUN file first.");
    return;
  }

  if (!client || client.state !== State.Running) {
    window.showErrorMessage("ASUN language server not running.");
    return;
  }

  try {
    const compressed: string = await client.sendRequest(
      ExecuteCommandRequest.type,
      {
        command: "asun.compress",
        arguments: [editor.document.uri.toString()],
      },
    );
    if (compressed) {
      const fullRange = new Range(
        new Position(0, 0),
        editor.document.lineAt(editor.document.lineCount - 1).range.end,
      );
      await editor.edit((editBuilder) => {
        editBuilder.replace(fullRange, compressed);
      });
    }
  } catch (err: any) {
    window.showErrorMessage(`Compress failed: ${err.message || err}`);
  }
}

/**
 * Convert the active ASUN document to JSON and open in a new editor.
 */
async function asunToJSON() {
  const editor = window.activeTextEditor;
  if (!editor || editor.document.languageId !== "asun") {
    window.showInformationMessage("Open an ASUN file first.");
    return;
  }

  if (!client || client.state !== State.Running) {
    window.showErrorMessage("ASUN language server not running.");
    return;
  }

  try {
    const result: string = await client.sendRequest(
      ExecuteCommandRequest.type,
      {
        command: "asun.toJSON",
        arguments: [editor.document.uri.toString()],
      },
    );
    if (result) {
      const doc = await workspace.openTextDocument({
        content: result,
        language: "json",
      });
      await window.showTextDocument(doc, { preview: false });
    }
  } catch (err: any) {
    window.showErrorMessage(`Convert to JSON failed: ${err.message || err}`);
  }
}

/**
 * Convert JSON content to ASUN. Works on active JSON file or prompts for input.
 */
async function jsonToASUN() {
  const editor = window.activeTextEditor;
  let jsonText = "";

  if (editor && editor.document.languageId === "json") {
    jsonText = editor.document.getText();
  } else {
    const input = await window.showInputBox({
      prompt: "Paste JSON content to convert to ASUN",
      placeHolder: '{"key": "value"}',
    });
    if (!input) {
      return;
    }
    jsonText = input;
  }

  if (!client || client.state !== State.Running) {
    window.showErrorMessage("ASUN language server not running.");
    return;
  }

  try {
    const result: string = await client.sendRequest(
      ExecuteCommandRequest.type,
      {
        command: "asun.fromJSON",
        arguments: [jsonText],
      },
    );
    if (result) {
      const doc = await workspace.openTextDocument({
        content: result,
        language: "asun",
      });
      await window.showTextDocument(doc, { preview: false });
      // Format (beautify) immediately so the output is readable
      await commands.executeCommand("editor.action.formatDocument");
    }
  } catch (err: any) {
    window.showErrorMessage(`Convert to ASUN failed: ${err.message || err}`);
  }
}

function scheduleActiveLineInfoUpdate(editor: TextEditor | undefined) {
  if (activeLineInfoTimer) {
    clearTimeout(activeLineInfoTimer);
  }
  activeLineInfoTimer = setTimeout(() => {
    void updateActiveLineInfo(editor);
  }, 80);
}

async function updateActiveLineInfo(editor: TextEditor | undefined) {
  if (!activeLineInfoDecoration) return;

  if (!editor || editor.document.languageId !== "asun") {
    clearActiveLineInfo(undefined);
    return;
  }

  if (!client || client.state !== State.Running) {
    clearActiveLineInfo(undefined);
    return;
  }

  const seq = ++activeLineInfoSeq;
  const active = editor.selection.active;

  try {
    const info = await client.sendRequest("asun/cursorInfo", {
      textDocument: { uri: editor.document.uri.toString() },
      position: { line: active.line, character: active.character },
    }) as {
      path?: string;
      type?: string;
      line?: number;
      character?: number;
      endLine?: number;
      endCharacter?: number;
    } | null;

    if (seq !== activeLineInfoSeq) return;
    if (window.activeTextEditor !== editor) return;

    if (!info?.path || !info?.type) {
      clearActiveLineInfo(editor);
      return;
    }

    // Always anchor the hint at the end of the user's clicked line. This
    // places it after any trailing punctuation/comments on that line
    // (e.g. `Alice /*comments*/,`) instead of injecting the hint into
    // the middle of the source text.
    const hintLine = active.line;
    const line = editor.document.lineAt(hintLine);
    const hintCharacter = line.range.end.character;
    const range = new Range(
      new Position(hintLine, hintCharacter),
      new Position(hintLine, hintCharacter),
    );
    const decoration: DecorationOptions = {
      range,
      renderOptions: {
        after: {
          contentText: `// ${info.type} | ${info.path}`,
        },
      },
    };
    editor.setDecorations(activeLineInfoDecoration, [decoration]);
  } catch {
    if (seq !== activeLineInfoSeq) return;
    clearActiveLineInfo(editor);
  }
}

function clearActiveLineInfo(editor: TextEditor | undefined) {
  if (!activeLineInfoDecoration) return;
  if (editor) {
    editor.setDecorations(activeLineInfoDecoration, []);
    return;
  }
  window.visibleTextEditors.forEach((visibleEditor) => {
    visibleEditor.setDecorations(activeLineInfoDecoration!, []);
  });
}
