/**
 * Service worker — handles extension icon click when popup is not available,
 * and relays messages between popup and content script.
 */

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return

  if (tab.url?.includes('photos.google.com')) {
    chrome.tabs.sendMessage(tab.id, { action: 'toggle' })
  } else {
    chrome.tabs.create({ url: 'https://photos.google.com/?hl=en' })
  }
})

// Update badge when content script reports progress
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'progress' && sender.tab?.id) {
    const { deleted, status } = message.data
    const text = status === 'idle' || status === 'done' ? '' : String(deleted)
    const color = status === 'error' ? '#ef4444' : '#22c55e'

    chrome.action.setBadgeText({ text, tabId: sender.tab.id })
    chrome.action.setBadgeBackgroundColor({ color, tabId: sender.tab.id })
  }
})
