/* Firefox response filters observe manifests without changing playback bytes. */
const manifests = new Map();
function isMax(url) {
  try { return /(^|\.)(hbomax|max)\.com$/.test(new URL(url).hostname); }
  catch { return false; }
}
browser.webRequest.onHeadersReceived.addListener(details => {
  const mime = details.responseHeaders?.find(header => header.name.toLowerCase() === "content-type")?.value || "";
  if (details.tabId < 0 || !isMax(details.documentUrl || details.originUrl) ||
      (!/\.(mpd|m3u8)(?:[?#]|$)/i.test(details.url) && !/dash\+xml|mpegurl/i.test(mime))) return;
  const filter = browser.webRequest.filterResponseData(details.requestId);
  const decoder = new TextDecoder();
  let body = "";
  filter.ondata = event => {
    filter.write(event.data);
    if (body.length < 2_000_000) body += decoder.decode(event.data, {stream: true});
  };
  filter.onstop = () => {
    filter.close();
    body += decoder.decode();
    const entry = {url: details.url, body};
    const entries = (manifests.get(details.tabId) || []).filter(item => item.url !== entry.url);
    entries.push(entry);
    manifests.set(details.tabId, entries.slice(-8));
    browser.tabs.sendMessage(details.tabId, {type: "manifest", ...entry}).catch(() => {});
  };
  filter.onerror = () => { try { filter.disconnect(); } catch {} };
}, {urls: ["https://*/*"], types: ["xmlhttprequest", "other", "media"]}, ["blocking", "responseHeaders"]);
browser.tabs.onRemoved.addListener(id => manifests.delete(id));
browser.webRequest.onBeforeRequest.addListener(details => {
  manifests.delete(details.tabId);
}, {urls: ["https://*.hbomax.com/*", "https://*.max.com/*"], types: ["main_frame"]});
browser.runtime.onMessage.addListener(async (message, sender) => {
  if (!sender.tab || !isMax(sender.url)) return;
  if (message.type === "manifests") return manifests.get(sender.tab.id) || [];
  if (message.type === "fetch") {
    const url = new URL(message.url);
    if (url.protocol !== "https:" || url.username || url.password) throw Error("Invalid subtitle URL");
    const response = await fetch(url.href, {credentials: "omit", signal: AbortSignal.timeout(15000)});
    if (!response.ok) throw Error(`Subtitle request failed (${response.status})`);
    const body = await response.text();
    if (body.length > 5_000_000) throw Error("Subtitle file is too large");
    return body;
  }
});
