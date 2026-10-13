# margin-notes

A Chrome extension to annotate any web page and copy the notes as structured
feedback. Paste the feedback into an agent chat or an issue.

## What it does

Click the extension icon to turn the overlay on for the current tab. Click it
again to turn it off. The icon shows `ON` while it is active. The state stays on
through SPA navigation and reloads of the same site.

- **Select text**: a "Comment" button appears next to the selection.
- **Rectangle** (or key `R`): drag a box. The note records the text inside it.
- **Comment popover**: `Cmd+Enter` saves, `Esc` cancels.
- **Pins**: each note gets a numbered pin. Click a pin to edit or delete.
- **List**: all notes, with Go and Delete.
- **Hide / Show**: hide the pins and boxes.
- **Clear**: deletes all notes of this site. Asks "Sure?" first.
- **Copy feedback**: copies the notes of this site as markdown.

Notes are stored in `chrome.storage.local`, per origin. They stay until you
clear them.

## Install (unpacked)

1. `npm install`
2. `npm run build` (writes `dist/`)
3. Open `chrome://extensions`.
4. Turn on **Developer mode** (top right).
5. Click **Load unpacked** and pick the `dist/` folder.
6. Pin the extension, open a page, click the icon.

After a code change, run `npm run build` and click the reload icon on the
extension card.

## Feedback format

Notes are grouped by page. Each note has the nearest heading above it (`h1` to
`h4`), the quoted text, and the comment. Badge-like elements in a heading (class
contains `badge`, `pill`, `tag` or `chip`) are moved into parentheses.

```markdown
# Review feedback: http://localhost:3000

## /pricing (Pricing | Acme)

1. [text] Section: "Team plan (Popular)"
   > Billed yearly, cancel any time.
   Comment: Say what happens to the data after cancelling.

2. [area] Section: "FAQ"
   > Can I change plans later? Yes, at any time.
   Comment: This answer is too short.

## / (Acme)

3. [area] Section: (top)
   > Get started
   Comment: Button contrast is too low.
```

## Permissions

- `activeTab`: access to the tab only after you click the icon.
- `scripting`: inject the overlay into that tab.
- `storage`: keep the notes and the per-tab on/off state.

No host permissions. A trade-off: `activeTab` access ends when the tab goes to a
different origin. Then the overlay turns off, and you click the icon again.

## Development

- `npm run typecheck`
- `npm run build`
- `npm run check` (both)

## License

MIT
