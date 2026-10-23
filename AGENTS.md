# Project instructions

The source project remains in a private repository. On 2026-10-23 the user explicitly confirmed: '确认公开全文和页面图片，任何人无需授权即可阅读'. The separate undertale-reader repository may now publish the full page JSON text and reduced reading JPGs for anonymous GitHub Pages access, along with reader code and licensed fonts. Use scripts/build_public_book.py and scripts/build_reader.py to export the explicit allowlist. Do not publish the original PDF, raw extraction folders, backups, credentials, exports, or private Git history. Do not change the source repository's visibility. The local editable viewer remains supported.

Before editing translations, read docs/translation-policy.md and the relevant entries of private/content/glossary.json. Community terminology is advisory. Preserve names and language-sensitive examples as the policy specifies; do not perform unreviewed global substitutions.

Preserve source scans and raw OCR. Keep corrected source, translations, layout, and generated images separate. Viewer design is in docs/viewer-design.md; the local implementation is in viewer/; durable editable samples are in private/content/viewer/. Never overwrite these with seed data.

UI requirement: use the simplest practical document editor. No invented product names, branding, decorative cards, slogans, or redundant English UI labels. Prioritize a large readable page and accurate layout. Use a fixed page coordinate system and scale the entire page together; keep source masks separate from translation frames. At narrow widths, put editing below the full-width page, never shrink the page into a half-width thumbnail.
