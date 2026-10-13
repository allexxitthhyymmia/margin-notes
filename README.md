# margin-notes

A Chrome extension to annotate any web page and turn the notes into structured
feedback. Copy it into an agent chat, or send it straight to a running agent
through a local MCP server.

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
- **Batch / Live**: how notes go to the agent (see below).
- **Send (n)**: sends the n unsent notes to the agent. Sent pins turn green.
- **Dot**: green when the MCP server is reachable.

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

## Send feedback to an agent

The MCP server `dist-server/margin-notes-mcp.mjs` runs inside the agent session
(stdio). It also listens on `http://127.0.0.1:4319` for notes from the extension.

1. `npm run build`
2. Register it once:
   `claude mcp add margin-notes -- node ~/dev/private/margin-notes/dist-server/margin-notes-mcp.mjs`
3. Start Claude Code with the channel on:
   `claude --dangerously-load-development-channels server:margin-notes`
4. Tell the agent what to do, e.g. "Work on the margin-notes feedback for this
   repo as it comes in."

Modes, switched in the toolbar:

- **Batch** (default): notes collect. Click **Send** to send all unsent notes
  as one message.
- **Live**: each note is sent when you save it. The agent works on one note at
  a time.

An edited note counts as unsent again. It goes out marked `(updated)`.

Delivery:

- **Channel**: the server pushes each feedback message into the session as
  `<channel source="margin-notes">`. The agent sees it without asking. This
  needs the `--dangerously-load-development-channels` flag while the server is
  not on the channel allowlist.
- **Fallback**: clients without channels call the `wait_for_feedback` tool. It
  returns the feedback that arrived since the last call, or waits up to
  `timeout_seconds` (default 120) for new feedback.

Only one session can hold the port. A second session logs
`port 4319 in use` and serves the tool only. Set `MARGIN_NOTES_PORT` to change
the server port (the extension always uses 4319).

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
- `storage`: keep the notes, the send mode and the per-tab on/off state.
- Host permission `http://127.0.0.1:4319/*`: only the local MCP server.

No access to other sites. A trade-off: `activeTab` access ends when the tab goes to a
different origin. Then the overlay turns off, and you click the icon again.

The server accepts posts only with a `chrome-extension://` Origin. A web page
cannot set that Origin, so a page cannot inject text into the agent.

## Development

- `npm run typecheck`
- `npm run build`
- `npm run check` (both)

## License

MIT
