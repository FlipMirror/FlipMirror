chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_TAB_ID") {
    sendResponse(sender.tab.id);
  }
});