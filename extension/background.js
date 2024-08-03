chrome.action.onClicked.addListener((tab) => {
    if (tab.url.includes("photos.google.com")) {
      chrome.tabs.sendMessage(tab.id, {action: "deletePhotos"});
    } else {
      chrome.tabs.create({ url: "https://photos.google.com" });
    }
  });