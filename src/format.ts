// Shared by the overlay (Copy feedback) and the MCP server (Send to agent).

export type Kind = 'text' | 'area'
export interface Note {
  id: string
  kind: Kind
  path: string
  title: string
  section: string
  quote: string
  comment: string
  x: number
  y: number
  w: number
  h: number
  // The comment as it was last sent to the agent. Unset: never sent.
  sent?: string
}

// A note with its number in the overlay. update: it was sent before with another comment.
export interface Item {
  n: number
  note: Note
  update?: boolean
}

export const isUnsent = (n: Note) => n.sent !== n.comment

export function toMarkdown(origin: string, items: Item[]): string {
  const out: string[] = [`# Review feedback: ${origin}`, '']
  const byPage = new Map<string, Item[]>()
  for (const it of items) {
    if (!byPage.has(it.note.path)) byPage.set(it.note.path, [])
    byPage.get(it.note.path)!.push(it)
  }
  for (const [path, list] of byPage) {
    const title = list[0].note.title
    out.push(title ? `## ${path} (${title})` : `## ${path}`, '')
    for (const { n, note, update } of list) {
      out.push(`${n}. [${note.kind}]${update ? ' (updated)' : ''} Section: ${note.section ? `"${note.section}"` : '(top)'}`)
      if (note.quote) out.push(`   > ${note.quote.replace(/\n+/g, ' ')}`)
      out.push(`   Comment: ${note.comment.replace(/\n/g, '\n   ')}`, '')
    }
  }
  return out.join('\n')
}
