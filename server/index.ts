// margin-notes MCP server. The agent starts it over stdio. It also listens on
// 127.0.0.1 for notes from the extension and hands them to the agent:
// - as a Claude Code channel message (pushed into the session), and
// - through the wait_for_feedback tool, for clients without channels.

import { createServer, type IncomingMessage } from 'node:http'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { toMarkdown, type Item } from '../src/format'

const PORT = Number(process.env.MARGIN_NOTES_PORT) || 4319
const log = (msg: string) => process.stderr.write(`[margin-notes] ${msg}\n`)

interface Feedback {
  origin: string
  mode: 'batch' | 'live'
  items: Item[]
}

const INSTRUCTIONS = `margin-notes delivers review feedback from a person looking at a web page in Chrome.
Each message is markdown: the page path, the section heading, the quoted page text, and the comment.
Treat each comment as a request from that reviewer about the code that renders the page.
Feedback arrives as <channel source="margin-notes"> messages. mode="live" means one note at a time:
work on it, then wait for the next. mode="batch" means a set of notes sent together.
"(updated)" marks a note the reviewer changed after sending; it replaces the earlier version.
If no channel messages arrive (client without channels), call wait_for_feedback in a loop instead.`

const mcp = new Server(
  { name: 'margin-notes', version: '0.1.0' },
  {
    capabilities: { tools: {}, experimental: { 'claude/channel': {} } },
    instructions: INSTRUCTIONS,
  },
)

// Feedback not yet returned by wait_for_feedback, and callers waiting for some.
const queue: string[] = []
const waiters: Array<() => void> = []

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'wait_for_feedback',
      description:
        'Wait for review feedback from the margin-notes browser extension. Returns all feedback that arrived since the last call, or waits up to timeout_seconds for new feedback. Only needed when feedback does not arrive as channel messages.',
      inputSchema: {
        type: 'object',
        properties: {
          timeout_seconds: { type: 'number', description: 'How long to wait (0 to 600). Default 120.' },
        },
      },
    },
  ],
}))

mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name !== 'wait_for_feedback') throw new Error(`Unknown tool: ${req.params.name}`)
  const raw = Number(req.params.arguments?.timeout_seconds ?? 120)
  const timeout = Math.min(Math.max(Number.isFinite(raw) ? raw : 120, 0), 600)
  if (!queue.length && timeout > 0) {
    await new Promise<void>((done) => {
      const t = setTimeout(done, timeout * 1000)
      waiters.push(() => {
        clearTimeout(t)
        done()
      })
    })
  }
  const text = queue.splice(0).join('\n\n---\n\n')
  return { content: [{ type: 'text', text: text || `No feedback in ${timeout} s.` }] }
})

async function deliver(fb: Feedback): Promise<void> {
  const md = toMarkdown(fb.origin, fb.items)
  queue.push(md)
  waiters.splice(0).forEach((wake) => wake())
  await mcp.notification({
    method: 'notifications/claude/channel',
    params: { content: md, meta: { origin: fb.origin, mode: fb.mode, notes: String(fb.items.length) } },
  })
  log(`delivered ${fb.items.length} note(s) from ${fb.origin} (${fb.mode})`)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > 1_000_000) reject(new Error('body too large'))
      else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function isFeedback(v: unknown): v is Feedback {
  const f = v as Feedback
  return (
    typeof f?.origin === 'string' &&
    (f.mode === 'batch' || f.mode === 'live') &&
    Array.isArray(f.items) &&
    f.items.every((it) => typeof it?.n === 'number' && typeof it.note?.comment === 'string' && typeof it.note.path === 'string')
  )
}

// Only the extension may post. A web page always sends its own http(s) Origin,
// and it cannot set one that starts with chrome-extension://.
const http = createServer(async (req, res) => {
  const send = (status: number, body: object) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  if (!(req.headers.origin || '').startsWith('chrome-extension://')) return send(403, { error: 'extension only' })
  if (req.method === 'GET' && req.url === '/health') return send(200, { ok: true })
  if (req.method === 'POST' && req.url === '/feedback') {
    try {
      const fb: unknown = JSON.parse(await readBody(req))
      if (!isFeedback(fb)) return send(400, { error: 'bad feedback' })
      await deliver(fb)
      return send(200, { ok: true })
    } catch (e) {
      return send(400, { error: (e as Error).message })
    }
  }
  send(404, { error: 'not found' })
})

http.on('error', (e: NodeJS.ErrnoException) => {
  // Another agent session already runs the server. This one serves the tool only.
  log(e.code === 'EADDRINUSE' ? `port ${PORT} in use, not receiving feedback in this session` : e.message)
})
http.listen(PORT, '127.0.0.1', () => log(`listening on http://127.0.0.1:${PORT}`))

await mcp.connect(new StdioServerTransport())
