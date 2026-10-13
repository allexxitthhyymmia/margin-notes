// Toggles the overlay per tab. The on/off state lives in chrome.storage.session,
// so it survives service worker restarts but not a browser restart.

const tabKey = (tabId: number) => `tab:${tabId}`

async function isOn(tabId: number): Promise<boolean> {
  const key = tabKey(tabId)
  return Boolean((await chrome.storage.session.get(key))[key])
}

async function setOn(tabId: number, on: boolean): Promise<void> {
  if (on) await chrome.storage.session.set({ [tabKey(tabId)]: true })
  else await chrome.storage.session.remove(tabKey(tabId))
  await chrome.action.setBadgeText({ tabId, text: on ? 'ON' : '' })
}

async function inject(tabId: number): Promise<boolean> {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
    return true
  } catch {
    // No permission for this page (e.g. chrome:// or a new origin after navigation).
    return false
  }
}

async function remove(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => (window as unknown as { __marginNotes?: { unmount(): void } }).__marginNotes?.unmount(),
    })
  } catch {
    // Page is gone or not reachable: nothing to remove.
  }
}

chrome.action.setBadgeBackgroundColor({ color: '#7c3aed' })

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id === undefined) return
  if (await isOn(tab.id)) {
    await remove(tab.id)
    await setOn(tab.id, false)
  } else {
    await setOn(tab.id, await inject(tab.id))
  }
})

// A reload or a full navigation drops the content script. Inject it again.
// activeTab keeps access for same-origin navigations; a new origin fails and turns the tab off.
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== 'complete' || !(await isOn(tabId))) return
  if (!(await inject(tabId))) await setOn(tabId, false)
  else await chrome.action.setBadgeText({ tabId, text: 'ON' })
})

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(tabKey(tabId))
})

// Bridge to the local MCP server. Content scripts cannot reach 127.0.0.1 from a web
// page origin; the worker can, through the host permission in the manifest.
const SERVER = 'http://127.0.0.1:4319'

async function request(path: string, body?: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(SERVER + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (res.ok) return { ok: true }
    return { ok: false, error: `server answered ${res.status}` }
  } catch {
    return { ok: false, error: 'agent not connected' }
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'ping') request('/health').then(reply)
  else if (msg?.type === 'send') request('/feedback', { origin: msg.origin, mode: msg.mode, items: msg.items }).then(reply)
  else return false
  return true
})
