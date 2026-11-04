# Contributing

Dual Subtitles is a plain JavaScript extension for Zen / Firefox, focused on HBO Max. No dependency installation or build step is needed.

## Develop

1. Clone this repository and open `about:debugging#/runtime/this-firefox` in Zen or Firefox.
2. Choose **Load Temporary Add-on…** and select `extension/manifest.json`.
3. After editing, click **Reload** for the extension and reload the playback tab.

## Check your change

With Node.js 24 or newer:

```sh
node tests/check.cjs
```

For browser checks, run `python3 -m http.server 8765 --bind 127.0.0.1` from the repository root, then open `http://localhost:8765/tests/browser.html`. Both results must show `PASS`. The browser tests use synthetic manifests; they need no HBO account.

Changes to detection, timing, or rendering should include a focused regression check. For live testing, check two languages, seeking, pause/resume, fullscreen, and navigation to another title. State which browser and site region you tested.

## Open a pull request

Keep changes focused. Explain the problem, resulting behavior, and how you checked it. Preserve the native HBO Max subtitle controls and render subtitle text with `textContent`. Do not add translation services or dependencies without discussing the need first.

Never attach account credentials, cookies, authorization headers, signed CDN URLs, full network captures, or copyrighted subtitle files. Use short synthetic fixtures for reproductions. Report bugs with the issue template.

## Package

Run `python3 scripts/package.py` to create `dist/dual-sub-<version>.zip`. It contains only the extension runtime files, with `manifest.json` at the archive root. CI checks and packages the same files. This is an unsigned archive, not a permanently installable Firefox add-on.
