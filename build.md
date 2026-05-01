# ASUN Language Support for VS Code

This guide explains how to build, install, and use the ASUN VS Code extension.

---

## Contents

1. [Requirements](#1-requirements)
2. [Build and Package](#2-build-and-package)
3. [Install the Extension in VS Code](#3-install-the-extension-in-vs-code)
4. [Verify the Installation](#4-verify-the-installation)
5. [Features and Usage](#5-features-and-usage)
6. [Configuration](#6-configuration)
7. [FAQ](#7-faq)

---

## 1. Requirements

Before you begin, make sure the following tools are installed:

| Tool        | Minimum Version | Purpose                                   | Download                                   |
| ----------- | --------------- | ----------------------------------------- | ------------------------------------------ |
| **VS Code** | 1.75+           | Editor                                    | [Download](https://code.visualstudio.com/) |
| **Node.js** | 18+             | Build the extension                       | [Download](https://nodejs.org/)            |
| **Zig**     | 0.15+           | Build the language server                 | [Download](https://ziglang.org/download/)  |
| **Git**     | recent          | Clone `lsp-asun` automatically if missing | [Download](https://git-scm.com/)           |

Verify the installation from a terminal:

```bash
node --version
npm --version
zig version
code --version
git --version
```

If `code` is not available in your shell, open VS Code and run `Shell Command: Install 'code' command in PATH`.

---

## 2. Build and Package

The build script does the following:

1. Installs npm dependencies for the extension
2. Compiles the TypeScript extension code
3. Builds the `lsp-asun` language server with Zig
4. Bundles the binary into `server/`
5. Packages a platform-specific `.vsix`

### 2.1 Install the packaging tool

```bash
npm install -g @vscode/vsce
```

### 2.2 Build, install, and reload for the current platform

```bash
cd plugin_vscode
npm install
./scripts/build.sh current
```

This produces a `.vsix` file in the current directory, installs it into VS Code with `code --install-extension --force`, and requests a VS Code window reload. For example:

```text
asun-vscode-darwin-arm64-0.1.0.vsix
```

Builds without the `current` argument only produce VSIX files and do not install or reload VS Code.

### 2.3 Build for all supported platforms

```bash
./scripts/build.sh all
```

This generates six VSIX packages:

| File                                  | Platform            |
| ------------------------------------- | ------------------- |
| `asun-vscode-darwin-arm64-0.1.0.vsix` | macOS Apple Silicon |
| `asun-vscode-darwin-x64-0.1.0.vsix`   | macOS Intel         |
| `asun-vscode-linux-x64-0.1.0.vsix`    | Linux x86_64        |
| `asun-vscode-linux-arm64-0.1.0.vsix`  | Linux ARM64         |
| `asun-vscode-win32-x64-0.1.0.vsix`    | Windows x86_64      |
| `asun-vscode-win32-arm64-0.1.0.vsix`  | Windows ARM64       |

### 2.4 Build a specific platform

```bash
./scripts/build.sh darwin-arm64
./scripts/build.sh darwin-x64
./scripts/build.sh linux-x64
./scripts/build.sh linux-arm64
./scripts/build.sh win32-x64
./scripts/build.sh win32-arm64
```

### 2.5 How it works

The extension build is cross-platform because:

1. Zig can cross-compile `lsp-asun` for all supported targets
2. `vsce package --target ...` produces target-specific VSIX packages
3. The packaged extension loads the bundled language server from `server/`

If `../lsp-asun` does not exist, `./scripts/build.sh` clones it automatically from GitHub before building.

---

## 3. Install the Extension in VS Code

### Option 1: Install from a VSIX file

```bash
code --install-extension asun-vscode-darwin-arm64-0.1.0.vsix
```

Or in VS Code:

1. Open the Command Palette with `Cmd+Shift+P` on macOS or `Ctrl+Shift+P` on Windows/Linux
2. Run `Extensions: Install from VSIX...`
3. Choose the matching `.vsix` file for your platform
4. Reload VS Code after installation

### Option 2: Run in development mode

If you do not want to package the extension yet, you can run it directly in development mode.

Build the language server first:

```bash
cd ../lsp-asun
zig build
```

Then open the extension folder in VS Code:

```bash
code ../plugin_vscode
```

Press `F5` to launch a new Extension Development Host window.

In development mode the extension looks for the server in:

- `server/lsp-asun`
- `../lsp-asun/zig-out/bin/lsp-asun`
- `server/asun-lsp`
- `../asun-lsp/asun-lsp`
- `PATH`

The legacy `asun-lsp` fallback is kept for compatibility, but `lsp-asun` is the primary server.

---

## 4. Verify the Installation

1. Create a file named `test.asun`
2. Paste the following content:

```asun
{name@str, age@int, active@bool}:
  (Alice, 30, true)
```

3. Confirm the following:

- Syntax highlighting is active
- There are no error diagnostics for valid input
- Inlay hints appear before tuple values

If syntax highlighting works but diagnostics or formatting do not, see the [FAQ](#7-faq).

---

## 5. Features and Usage

### 5.1 Syntax Highlighting

Syntax highlighting works automatically for `.asun` files.

Highlighted elements include:

- field names
- type annotations such as `@str`, `@int`, `@bool`, `@float`
- string, number, and boolean values
- `{}` `()` `[]`
- comments like `/* ... */`

### 5.2 ASUN Code Blocks in Markdown

Fenced ASUN code blocks are highlighted in Markdown:

````markdown
```asun
{name@str, score@int}:(Alice, 100)
```
````

### 5.3 Diagnostics

The extension shows real-time diagnostics while you edit.

For example, this input is invalid:

```asun
{name@str}:(Alice
```

VS Code should underline the error and show it in the Problems panel.

### 5.4 Format

Format the current ASUN document into a readable layout.

Ways to run it:

- `Shift+Option+F` on macOS or `Shift+Alt+F` on Windows/Linux
- Command Palette: `ASUN: Format (Beautify)`
- Editor context menu: `Format Document`

Before:

```asun
{name@str,age@int,addr@{city@str,zip@int}}:(Alice,30,(NYC,10001))
```

After:

```asun
{name@str, age@int, addr@{city@str, zip@int}}:
  (Alice, 30, (NYC, 10001))
```

### 5.5 Compress

Compress the current ASUN document into a compact one-line form.

Use the Command Palette and run `ASUN: Compress (Minify)`.

Before:

```asun
{name@str, age@int}:
  (Alice, 30)
```

After:

```asun
{name@str,age@int}:(Alice,30)
```

### 5.6 Convert ASUN to JSON

Open an `.asun` file, run `ASUN: Convert to JSON`, and the extension opens the converted JSON in a new editor tab.

ASUN input:

```asun
{name@str, age@int, active@bool}:
  (Alice, 30, true)
```

JSON output:

```json
{
  "active": true,
  "age": 30,
  "name": "Alice"
}
```

### 5.7 Convert JSON to ASUN

There are two ways to do this.

From a JSON file:

1. Open a `.json` file
2. Run `ASUN: Convert JSON to ASUN`
3. The converted ASUN opens in a new tab

From pasted input:

1. Run `ASUN: Convert JSON to ASUN`
2. Paste JSON content into the input box
3. Press Enter

JSON input:

```json
[
  { "name": "Alice", "score": 95 },
  { "name": "Bob", "score": 87 }
]
```

ASUN output:

```asun
[{name@str,score@int}]:
  (Alice,95),
  (Bob,87)
```

### 5.8 Completion

Press `Ctrl+Space` to trigger completion suggestions while editing ASUN.

Typical suggestions include:

- top-level templates
- type names such as `int`, `str`, `bool`, `float`
- boolean literals like `true` and `false`

### 5.9 Hover

Hover over fields, type annotations, or values to see contextual information such as field type or node kind.

### 5.10 Inlay Hints

The extension can show field-name hints before tuple values.

Example source:

```asun
{name@str, age@int, city@str}:(Alice, 30, NYC)
```

Displayed with hints:

```text
{name@str, age@int, city@str}:(name: Alice, age: 30, city: NYC)
```

The `name:`, `age:`, and `city:` labels are visual hints only. They are not part of the file content.

### 5.11 Semantic Tokens

The extension provides semantic highlighting for different token categories:

| Element              | Semantic Type |
| -------------------- | ------------- |
| `{}` `()` `[]`       | keyword       |
| `@int`, `@str`, etc. | type          |
| field names          | variable      |
| string values        | string        |
| numbers              | number        |
| comments             | comment       |
| `:` `,`              | operator      |
| `true` `false`       | parameter     |

---

## 6. Configuration

Search for `asun` in VS Code settings.

| Setting                   | Type    | Default | Description                                                                 |
| ------------------------- | ------- | ------- | --------------------------------------------------------------------------- |
| `asun.lspPath`            | string  | `""`    | Path to the language server binary. If empty, the extension auto-detects it |
| `asun.inlayHints.enabled` | boolean | `true`  | Whether to show field-name inlay hints                                      |

### Set `asun.lspPath` manually

If the server binary is not in a default location, set an absolute path in your VS Code settings:

```json
{
  "asun.lspPath": "/Users/your-name/code/lsp-asun/zig-out/bin/lsp-asun"
}
```

---

## 7. FAQ

### Q: Syntax highlighting works, but diagnostics or formatting do not

The language server probably did not start correctly.

Try the following:

1. Check whether the server binary exists:

   ```bash
   ls -la ../lsp-asun/zig-out/bin/lsp-asun
   ```

2. If it does not exist, build it again:

   ```bash
   cd ../lsp-asun
   zig build
   ```

3. Open the VS Code Output panel and select `ASUN Language Server`
4. Set `asun.lspPath` manually if auto-detection does not find the binary

### Q: I see "ASUN LSP binary not found"

The extension could not find `lsp-asun` or the fallback `asun-lsp`.

Fixes:

- build `lsp-asun` with `zig build`
- set `asun.lspPath` manually
- place the server binary somewhere in your `PATH`

### Q: The format shortcut does nothing

Another formatter may be configured as the default formatter for ASUN files.

Add this to your VS Code settings:

```json
{
  "[asun]": {
    "editor.defaultFormatter": "asun.asun-vscode"
  }
}
```

### Q: Inlay hints do not appear

Make sure inlay hints are enabled globally in VS Code:

```json
{
  "editor.inlayHints.enabled": "on"
}
```

### Q: How do I uninstall the extension?

```bash
code --uninstall-extension asun.asun-vscode
```

You can also remove it from the Extensions view in VS Code.

---

## Quick Reference

| Feature         | Action                                                    |
| --------------- | --------------------------------------------------------- |
| Format          | `Shift+Option+F` or `ASUN: Format`                        |
| Compress        | `ASUN: Compress`                                          |
| ASUN to JSON    | `ASUN: Convert to JSON`                                   |
| JSON to ASUN    | `ASUN: Convert JSON to ASUN`                              |
| Completion      | `Ctrl+Space`                                              |
| Command Palette | `Cmd+Shift+P` on macOS or `Ctrl+Shift+P` on Windows/Linux |
