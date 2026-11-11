// Public bootstrap metadata only. Cookie values never travel through page messages or DOM nodes.
const extensionOrigin = `chrome-extension://${chrome.runtime.id}`;
if (location.origin === 'https://x.com' && self !== top && parent === top && location.ancestorOrigins.length === 1 && location.ancestorOrigins[0] === extensionOrigin) {
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (sender.id === chrome.runtime.id && message?.type === 'x-csrf/disable') document.dispatchEvent(new Event('split8-x-disabled'));
  });
  document.appendChild(document.createComment(`split8-x-origin:${extensionOrigin}`));
  document.dispatchEvent(new Event('split8-x-bootstrap'));
  void chrome.runtime.sendMessage({ type: 'x-csrf/prepare' }).then(result => {
    if (!result?.ok) document.dispatchEvent(new Event('split8-x-disabled'));
  }).catch(() => document.dispatchEvent(new Event('split8-x-disabled')));
}
export {};
