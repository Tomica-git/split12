export function buildSessionRules({ tabIds, hosts }: { tabIds: number[]; hosts: string[] }): chrome.declarativeNetRequest.Rule[] {
  if (tabIds.length === 0 || hosts.length === 0) return [];
  const base = { tabIds, resourceTypes: ['sub_frame' as chrome.declarativeNetRequest.ResourceType], requestDomains: hosts };
  return [
    {
      id: 1,
      priority: 1,
      action: { type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType, responseHeaders: [{ header: 'x-frame-options', operation: 'remove' as chrome.declarativeNetRequest.HeaderOperation }] },
      condition: { ...base },
    },
    {
      id: 2,
      priority: 1,
      action: { type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType, responseHeaders: [{ header: 'content-security-policy', operation: 'remove' as chrome.declarativeNetRequest.HeaderOperation }] },
      condition: { ...base, responseHeaders: [{ header: 'content-security-policy', values: ['*frame-ancestors*'] }] },
    },
  ];
}
