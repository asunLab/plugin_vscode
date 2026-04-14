// ASUN syntax highlighting for VS Code Markdown Preview
(function () {
  "use strict";

  function highlightAsunBlocks() {
    // VS Code markdown preview may use various class patterns:
    // - code.language-asun  (standard markdown-it)
    // - code with parent pre having data-lang="asun" (shiki-based)
    var selectors = [
      'code.language-asun',
      'code[class*="language-asun"]',
      'pre[data-lang="asun"] > code',
      'pre[data-language="asun"] > code'
    ];
    var blocks = document.querySelectorAll(selectors.join(', '));

    // Also scan all <code> elements inside <pre> for unrecognized asun blocks
    if (blocks.length === 0) {
      document.querySelectorAll('pre > code').forEach(function (code) {
        var pre = code.parentElement;
        // Check if the info string or class hints at asun
        var cls = (code.className || '') + ' ' + (pre.className || '');
        if (/\basun\b/i.test(cls)) {
          // Already matched above
        }
      });
    }

    blocks.forEach(function (block) {
      // Skip if already highlighted by us
      if (block.dataset.asunHighlighted) return;
      block.dataset.asunHighlighted = "true";

      // Get plain text (strip any existing shiki spans)
      var text = block.textContent || "";
      if (!text.trim()) return;
      block.innerHTML = tokenize(text);
    });
  }

  function tokenize(src) {
    var result = "";
    var i = 0;
    while (i < src.length) {
      // Comments /* ... */
      if (src[i] === "/" && src[i + 1] === "*") {
        var end = src.indexOf("*/", i + 2);
        var comment = end === -1 ? src.slice(i) : src.slice(i, end + 2);
        result += sp("cmt", esc(comment));
        i += comment.length;
        continue;
      }
      // Strings "..."
      if (src[i] === '"') {
        var j = i + 1;
        while (j < src.length && src[j] !== '"') {
          if (src[j] === "\\") j++;
          j++;
        }
        var str = src.slice(i, j + 1);
        result += sp("str", esc(str));
        i = j + 1;
        continue;
      }
      // Schema/body separator
      if (src[i] === ":") {
        result += sp("op", ":");
        i++;
        continue;
      }
      // Type and structural marker
      if (src[i] === "@") {
        result += sp("at", "@");
        i++;
        continue;
      }
      // Numbers (must check before identifiers for negative)
      if (
        /[0-9]/.test(src[i]) ||
        (src[i] === "-" && i + 1 < src.length && /[0-9]/.test(src[i + 1]))
      ) {
        var nm = src.slice(i).match(/^-?[0-9]+(\.[0-9]+)?/);
        if (nm) {
          result += sp("num", nm[0]);
          i += nm[0].length;
          continue;
        }
      }
      // Identifiers / keywords
      if (/[a-zA-Z_]/.test(src[i])) {
        var wm = src.slice(i).match(/^[a-zA-Z_][a-zA-Z0-9_+\-]*/);
        if (wm) {
          var word = wm[0];
          var prev = i - 1;
          while (prev >= 0 && /\s/.test(src[prev])) prev--;
          if (word === "true" || word === "false") {
            result += sp("bool", word);
          } else if (
            prev >= 0 &&
            src[prev] === "@" &&
            /^(int|float|str|bool)$/.test(word)
          ) {
            result += sp("typ", word);
          } else {
            result += sp("var", esc(word));
          }
          i += word.length;
          continue;
        }
      }
      // Brackets
      if ("{[(".indexOf(src[i]) !== -1 || "}])".indexOf(src[i]) !== -1) {
        result += sp("bkt", esc(src[i]));
        i++;
        continue;
      }
      // Comma
      if (src[i] === ",") {
        result += sp("op", ",");
        i++;
        continue;
      }
      // Whitespace and other
      result += esc(src[i]);
      i++;
    }
    return result;
  }

  function sp(cls, content) {
    return '<span class="asun-' + cls + '">' + content + "</span>";
  }

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Inject CSS
  var style = document.createElement("style");
  style.textContent = [
    /* ── Dark theme (default) ── */
    ".asun-cmt  { color: #6a9955; font-style: italic; }",
    ".asun-str  { color: #ce9178; }",
    ".asun-typ  { color: #4ec9b0; }",
    ".asun-num  { color: #b5cea8; }",
    ".asun-bool { color: #569cd6; }",
    ".asun-at   { color: #d4d4d4; }",
    ".asun-bkt  { color: #ffd700; }",
    ".asun-op   { color: #d4d4d4; }",
    ".asun-var  { color: #9cdcfe; }",
    /* ── Light theme ── */
    "body.vscode-light .asun-cmt  { color: #008000; }",
    "body.vscode-light .asun-str  { color: #a31515; }",
    "body.vscode-light .asun-typ  { color: #267f99; }",
    "body.vscode-light .asun-num  { color: #098658; }",
    "body.vscode-light .asun-bool { color: #0000ff; }",
    "body.vscode-light .asun-at   { color: #000000; }",
    "body.vscode-light .asun-bkt  { color: #0431fa; }",
    "body.vscode-light .asun-op   { color: #000000; }",
    "body.vscode-light .asun-var  { color: #001080; }",
    /* ── High-contrast theme ── */
    "body.vscode-high-contrast .asun-cmt  { color: #7ca668; }",
    "body.vscode-high-contrast .asun-str  { color: #ce9178; }",
    "body.vscode-high-contrast .asun-typ  { color: #4ec9b0; }",
    "body.vscode-high-contrast .asun-num  { color: #b5cea8; }",
    "body.vscode-high-contrast .asun-bool { color: #569cd6; }",
    "body.vscode-high-contrast .asun-at   { color: #d4d4d4; }",
    "body.vscode-high-contrast .asun-bkt  { color: #ffd700; }",
    "body.vscode-high-contrast .asun-op   { color: #d4d4d4; }",
    "body.vscode-high-contrast .asun-var  { color: #9cdcfe; }",
  ].join("\n");
  document.head.appendChild(style);

  // Run on load
  highlightAsunBlocks();

  // Watch for dynamic preview updates (markdown preview re-renders on edit)
  var observer = new MutationObserver(function () {
    highlightAsunBlocks();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
