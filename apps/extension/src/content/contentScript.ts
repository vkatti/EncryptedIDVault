import { isInsertTargetMessage } from "@encrypted-id-vault/security";

import { insertIntoFocusedField } from "./insertion";

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isInsertTargetMessage(message)) {
        return false;
    }

    void (async () => {
        const result = await insertIntoFocusedField(message.payload, document);
        sendResponse(result);
    })();

    return true;
});