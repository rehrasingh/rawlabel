chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
});

chrome.action.onClicked.addListener(async (tab) => {
  // Open immediately while Chrome still recognizes the toolbar click as a user gesture.
  chrome.sidePanel.open({ windowId: tab.windowId }).catch((error) => {
    console.error('Unable to open RawLabel side panel:', error);
  });
  await chrome.storage.session.set({ rawLabelTargetTabId: tab.id, rawLabelTargetWindowId: tab.windowId });
});
