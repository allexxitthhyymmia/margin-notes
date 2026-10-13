// Review overlay. Select text or draw a rectangle, add a comment, then "Copy feedback".
// Injected by the background worker. Injecting it twice is a no-op.

type Kind = 'text' | 'area'
interface Note {
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
}
interface Rect {
  x: number
  y: number
  w: number
  h: number
}

declare global {
  interface Window {
    __marginNotes?: { unmount(): void }
  }
}

const KEY = `notes:${location.origin}`

async function load(): Promise<Note[]> {
  try {
    const v = (await chrome.storage.local.get(KEY))[KEY]
    return Array.isArray(v) ? (v as Note[]) : []
  } catch {
    return []
  }
}
function save(notes: Note[]): void {
  chrome.storage.local.set({ [KEY]: notes }).catch(() => {
    // storage failed: notes live for this page only
  })
}

function sectionAbove(docY: number): string {
  let best = ''
  for (const h of Array.from(document.querySelectorAll('h1, h2, h3, h4'))) {
    const top = h.getBoundingClientRect().top + window.scrollY
    if (top <= docY + 4) best = headingText(h)
  }
  return best
}

const BADGE = /badge|pill|tag|chip/i

// Heading text with badge-like children in parentheses, e.g. "Spec format (Mandatory)".
function headingText(h: Element): string {
  const c = h.cloneNode(true) as Element
  const badges: string[] = []
  for (const e of Array.from(c.querySelectorAll('[class]'))) {
    if (!e.isConnected || !BADGE.test(e.getAttribute('class') || '')) continue
    const t = (e.textContent || '').replace(/\s+/g, ' ').trim()
    if (t) badges.push(t)
    e.remove()
  }
  const name = (c.textContent || '').replace(/\s+/g, ' ').trim()
  return badges.length ? `${name} (${badges.join(', ')})` : name
}

function textInRect(r: Rect): string {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const parts: string[] = []
  const range = document.createRange()
  let node: Node | null
  while ((node = walker.nextNode())) {
    const t = (node.textContent || '').trim()
    if (!t) continue
    range.selectNodeContents(node)
    for (const b of Array.from(range.getClientRects())) {
      const cx = b.left + window.scrollX + b.width / 2
      const cy = b.top + window.scrollY + b.height / 2
      if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) {
        parts.push(t)
        break
      }
    }
  }
  return clip(parts.join(' ').replace(/\s+/g, ' '))
}

const clip = (s: string) => (s.length > 400 ? s.slice(0, 400) + ' [...]' : s)

function toMarkdown(notes: Note[]): string {
  const out: string[] = [`# Review feedback: ${location.origin}`, '']
  const byPage = new Map<string, Note[]>()
  for (const n of notes) {
    if (!byPage.has(n.path)) byPage.set(n.path, [])
    byPage.get(n.path)!.push(n)
  }
  let i = 0
  for (const [path, list] of byPage) {
    out.push(list[0].title ? `## ${path} (${list[0].title})` : `## ${path}`, '')
    for (const n of list) {
      i++
      out.push(`${i}. [${n.kind}] Section: ${n.section ? `"${n.section}"` : '(top)'}`)
      if (n.quote) out.push(`   > ${n.quote.replace(/\n+/g, ' ')}`)
      out.push(`   Comment: ${n.comment.replace(/\n/g, '\n   ')}`, '')
    }
  }
  return out.join('\n')
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

const OVERLAY_CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: ui-sans-serif, system-ui, sans-serif; }
.bar { position: fixed; right: 16px; bottom: 16px; display: flex; gap: 6px; align-items: center;
  background: #18181b; color: #fafafa; padding: 6px; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.35);
  z-index: 3; font-size: 13px; }
button { all: unset; cursor: pointer; padding: 6px 10px; border-radius: 6px; font-size: 13px; color: inherit; }
button:hover { background: #3f3f46; }
button.on { background: #7c3aed; }
button.primary { background: #7c3aed; }
button:disabled { opacity: .4; cursor: default; }
.count { padding: 0 6px; opacity: .8; }
.layer { position: fixed; inset: 0; cursor: crosshair; z-index: 1; background: rgba(124,58,237,.04); }
.draft { position: absolute; border: 2px dashed #7c3aed; background: rgba(124,58,237,.08); pointer-events: none; }
.box { position: absolute; border: 2px solid #7c3aed; background: rgba(124,58,237,.06); pointer-events: none; border-radius: 4px; }
.pin { position: absolute; width: 22px; height: 22px; border-radius: 50%; background: #7c3aed; color: #fff;
  font-size: 12px; display: grid; place-items: center; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,.3); z-index: 2; }
.pop { position: absolute; width: 300px; background: #18181b; color: #fafafa; border-radius: 10px; padding: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,.4); z-index: 4; font-size: 13px; }
.pop .q { opacity: .7; font-style: italic; margin-bottom: 6px; max-height: 80px; overflow: auto; }
.pop textarea { width: 100%; min-height: 80px; resize: vertical; background: #27272a; color: #fafafa; border: 1px solid #3f3f46;
  border-radius: 6px; padding: 6px; font-size: 13px; }
.pop .row { display: flex; justify-content: flex-end; gap: 6px; margin-top: 8px; }
.ask { position: absolute; z-index: 4; }
.toast { position: fixed; right: 16px; bottom: 64px; background: #16a34a; color: #fff; padding: 6px 10px; border-radius: 6px; z-index: 5; font-size: 13px; }
.list { position: fixed; right: 16px; bottom: 64px; width: 360px; max-height: 60vh; overflow: auto; background: #18181b; color: #fafafa;
  border-radius: 10px; padding: 10px; z-index: 4; font-size: 13px; box-shadow: 0 8px 28px rgba(0,0,0,.4); }
.list .item { border-top: 1px solid #3f3f46; padding: 6px 0; }
.list .meta { opacity: .6; font-size: 12px; }
`

async function mount(): Promise<void> {
  let cancelled = false
  window.__marginNotes = {
    unmount() {
      cancelled = true
      delete window.__marginNotes
    },
  }
  let notes = await load()
  if (cancelled) return
  let mode: 'off' | 'area' = 'off'
  let hidden = false
  let path = location.pathname
  const live = new AbortController()
  const { signal } = live

  const host = document.createElement('div')
  host.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;z-index:2147483000;'
  document.documentElement.appendChild(host)
  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML = `<style>${OVERLAY_CSS}</style><div class="marks"></div><div class="ui"></div>`
  const marks = root.querySelector('.marks') as HTMLDivElement
  const ui = root.querySelector('.ui') as HTMLDivElement

  const bar = document.createElement('div')
  bar.className = 'bar'
  bar.innerHTML = `
    <span class="count"></span>
    <button data-a="area" title="Draw a rectangle (R)">Rectangle</button>
    <button data-a="list">List</button>
    <button data-a="hide">Hide</button>
    <button data-a="clear">Clear</button>
    <button data-a="copy" class="primary">Copy feedback</button>`
  root.appendChild(bar)
  const btn = (a: string) => bar.querySelector(`[data-a="${a}"]`) as HTMLButtonElement

  let layer: HTMLDivElement | null = null
  let popEl: HTMLElement | null = null
  let listEl: HTMLElement | null = null
  let clearArmed = false

  function closePop(): void {
    popEl?.remove()
    popEl = null
  }

  function toast(msg: string): void {
    const t = document.createElement('div')
    t.className = 'toast'
    t.textContent = msg
    root.appendChild(t)
    setTimeout(() => t.remove(), 1800)
  }

  function render(): void {
    const here = notes.filter((n) => n.path === location.pathname)
    ;(bar.querySelector('.count') as HTMLElement).textContent = `${notes.length} note${notes.length === 1 ? '' : 's'}`
    btn('copy').disabled = notes.length === 0
    btn('clear').textContent = clearArmed ? 'Sure?' : 'Clear'
    btn('area').classList.toggle('on', mode === 'area')
    btn('hide').textContent = hidden ? 'Show' : 'Hide'
    marks.innerHTML = ''
    if (hidden) return
    here.forEach((n) => {
      const idx = notes.indexOf(n) + 1
      const b = document.createElement('div')
      b.className = 'box'
      b.style.cssText = `left:${n.x}px;top:${n.y}px;width:${n.w}px;height:${n.h}px;${n.kind === 'text' ? 'border-style:dotted;' : ''}`
      marks.appendChild(b)
      const p = document.createElement('div')
      p.className = 'pin'
      p.textContent = String(idx)
      p.style.left = `${n.x + n.w - 11}px`
      p.style.top = `${n.y - 11}px`
      p.title = n.comment
      p.onclick = (e) => {
        e.stopPropagation()
        editor(n.x + n.w + 8, n.y, n.quote, n.comment, (c) => {
          if (c === null) notes = notes.filter((x) => x.id !== n.id)
          else n.comment = c
          save(notes)
          render()
        }, true)
      }
      marks.appendChild(p)
    })
    if (listEl) showList()
  }

  // Popover with a textarea. onDone(null) means delete.
  function editor(docX: number, docY: number, quote: string, value: string, onDone: (c: string | null) => void, existing = false): void {
    closePop()
    const pop = document.createElement('div')
    pop.className = 'pop'
    const maxX = window.scrollX + window.innerWidth - 316
    pop.style.left = `${Math.max(window.scrollX + 8, Math.min(docX, maxX))}px`
    pop.style.top = `${docY}px`
    pop.innerHTML = `${quote ? '<div class="q"></div>' : ''}<textarea placeholder="Comment (Cmd+Enter saves, Esc cancels)"></textarea>
      <div class="row">${existing ? '<button data-x="del">Delete</button>' : ''}<button data-x="cancel">Cancel</button><button data-x="ok" class="primary">Save</button></div>`
    if (quote) (pop.querySelector('.q') as HTMLElement).textContent = quote
    const ta = pop.querySelector('textarea') as HTMLTextAreaElement
    ta.value = value
    const done = (c: string | null | undefined) => {
      closePop()
      if (c === undefined) return
      onDone(c)
    }
    pop.addEventListener('click', (e) => {
      const x = (e.target as HTMLElement).dataset.x
      if (x === 'ok' && ta.value.trim()) done(ta.value.trim())
      if (x === 'cancel') done(undefined)
      if (x === 'del') done(null)
    })
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Escape') done(undefined)
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && ta.value.trim()) done(ta.value.trim())
    })
    ui.appendChild(pop)
    popEl = pop
    setTimeout(() => ta.focus(), 0)
  }

  function add(kind: Kind, r: Rect, quote: string): void {
    editor(r.x, r.y + r.h + 8, quote, '', (c) => {
      if (!c) return
      notes.push({
        id: Math.random().toString(36).slice(2),
        kind,
        path: location.pathname,
        title: document.title.trim(),
        section: sectionAbove(r.y),
        quote,
        comment: c,
        ...r,
      })
      save(notes)
      render()
    })
  }

  function setMode(m: 'off' | 'area'): void {
    mode = m
    layer?.remove()
    layer = null
    if (m === 'area') {
      const l = document.createElement('div')
      l.className = 'layer'
      let start: { x: number; y: number } | null = null
      let draft: HTMLDivElement | null = null
      l.addEventListener('mousedown', (e) => {
        start = { x: e.clientX, y: e.clientY }
        draft = document.createElement('div')
        draft.className = 'draft'
        l.appendChild(draft)
      })
      l.addEventListener('mousemove', (e) => {
        if (!start || !draft) return
        draft.style.cssText = `left:${Math.min(start.x, e.clientX)}px;top:${Math.min(start.y, e.clientY)}px;width:${Math.abs(e.clientX - start.x)}px;height:${Math.abs(e.clientY - start.y)}px`
      })
      l.addEventListener('mouseup', (e) => {
        if (!start) return
        const r = {
          x: Math.min(start.x, e.clientX) + window.scrollX,
          y: Math.min(start.y, e.clientY) + window.scrollY,
          w: Math.abs(e.clientX - start.x),
          h: Math.abs(e.clientY - start.y),
        }
        start = null
        draft?.remove()
        setMode('off')
        if (r.w < 8 || r.h < 8) return
        add('area', r, textInRect(r))
      })
      ui.appendChild(l)
      layer = l
    }
    render()
  }

  function showList(): void {
    listEl?.remove()
    const l = document.createElement('div')
    l.className = 'list'
    if (!notes.length) l.textContent = 'No notes yet.'
    notes.forEach((n, i) => {
      const it = document.createElement('div')
      it.className = 'item'
      it.innerHTML = `<div class="meta"></div><div class="c"></div><div class="row"><button data-go>Go</button><button data-del>Delete</button></div>`
      ;(it.querySelector('.meta') as HTMLElement).textContent = `${i + 1}. ${n.path} · ${n.section || '(top)'}`
      ;(it.querySelector('.c') as HTMLElement).textContent = n.comment
      ;(it.querySelector('[data-go]') as HTMLElement).onclick = () => {
        if (location.pathname !== n.path) location.href = n.path
        else window.scrollTo({ top: n.y - 120, behavior: 'smooth' })
      }
      ;(it.querySelector('[data-del]') as HTMLElement).onclick = () => {
        notes = notes.filter((x) => x.id !== n.id)
        save(notes)
        render()
      }
      l.appendChild(it)
    })
    root.appendChild(l)
    listEl = l
  }

  bar.addEventListener('click', async (e) => {
    const a = (e.target as HTMLElement).dataset.a
    if (a !== 'clear') clearArmed = false
    if (a === 'area') setMode(mode === 'area' ? 'off' : 'area')
    if (a === 'hide') {
      hidden = !hidden
      render()
    }
    if (a === 'list') {
      if (listEl) {
        listEl.remove()
        listEl = null
      } else showList()
    }
    if (a === 'clear') {
      if (!clearArmed) clearArmed = true
      else {
        notes = []
        save(notes)
        clearArmed = false
      }
      render()
    }
    if (a === 'copy') toast((await copy(toMarkdown(notes))) ? 'Feedback copied' : 'Copy failed')
  })

  // Text selection: show a "Comment" button next to it.
  let ask: HTMLElement | null = null
  document.addEventListener('mouseup', (e) => {
    if (e.composedPath().includes(host)) return
    setTimeout(() => {
      ask?.remove()
      ask = null
      const sel = window.getSelection()
      const text = sel?.toString().trim() || ''
      if (!sel || !text || mode === 'area') return
      const b = sel.getRangeAt(0).getBoundingClientRect()
      const r = { x: b.left + window.scrollX, y: b.top + window.scrollY, w: b.width, h: b.height }
      const wrap = document.createElement('div')
      wrap.className = 'ask'
      wrap.style.left = `${r.x + r.w + 6}px`
      wrap.style.top = `${r.y - 4}px`
      wrap.innerHTML = '<button class="primary pin" style="position:static;width:auto;height:auto;border-radius:6px;padding:4px 8px">Comment</button>'
      wrap.onmousedown = (ev) => ev.preventDefault()
      wrap.onclick = () => {
        wrap.remove()
        ask = null
        add('text', r, clip(text))
      }
      root.appendChild(wrap)
      ask = wrap
    }, 0)
  }, { signal })

  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    if (e.key === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey) setMode(mode === 'area' ? 'off' : 'area')
    if (e.key === 'Escape') {
      setMode('off')
      closePop()
    }
  }, { signal })

  // Another tab on the same origin changed the notes.
  const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local' || !(KEY in changes)) return
    const next = changes[KEY].newValue
    if (JSON.stringify(next ?? []) === JSON.stringify(notes)) return
    notes = Array.isArray(next) ? (next as Note[]) : []
    render()
  }
  chrome.storage.onChanged.addListener(onStorage)

  // Client-side navigation does not reload the page.
  const timer = setInterval(() => {
    if (location.pathname !== path) {
      path = location.pathname
      closePop()
      ask?.remove()
      setTimeout(render, 300)
    }
  }, 300)
  window.addEventListener('resize', render, { signal })
  setTimeout(render, 300)

  window.__marginNotes = {
    unmount() {
      live.abort()
      clearInterval(timer)
      chrome.storage.onChanged.removeListener(onStorage)
      host.remove()
      delete window.__marginNotes
    },
  }
}

// mount() reserves the slot before its async load, so a second injection is a no-op.
if (!window.__marginNotes) mount()

export {}
