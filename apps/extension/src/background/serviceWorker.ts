chrome.runtime.onInstalled.addListener(() => {
    void chrome.storage.local.set({
        installedAt: new Date().toISOString()
    });
});
