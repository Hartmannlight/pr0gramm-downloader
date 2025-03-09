chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "downloadMedia" && message.url && message.filename) {
    chrome.downloads.download({
      url: message.url,
      filename: `Pr0gramm/${message.filename}`,
      conflictAction: "uniquify",
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error("Download failed:", chrome.runtime.lastError.message);
      } else {
        console.log("Download started, ID:", downloadId);
      }
    });
  }
});
