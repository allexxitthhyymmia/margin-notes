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
