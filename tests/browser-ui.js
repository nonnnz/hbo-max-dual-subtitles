(async () => {
  if (!globalThis.testPassed) return;
  globalThis.testPassed = false;
  const check = (condition, name) => { if (!condition) throw Error(name); };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const output = document.getElementById('result');
  const previous = output.textContent;
  const originalAttach = Element.prototype.attachShadow;
  let panel;
  Element.prototype.attachShadow = function(options) {
    const shadow = originalAttach.call(this, options);
    if (this.id === 'dual-sub-extension') panel = shadow;
    return shadow;
  };
  try {
    const entry = {url: 'https://cdn.example/play.mpd', body: `<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT20S"><Period>
      ${['th', 'en'].map(lang => `<AdaptationSet contentType="text" lang="${lang}"><SegmentTemplate timescale="1" media="${lang}/$Number$.vtt" duration="10"/><Representation mimeType="text/vtt" id="${lang}"/></AdaptationSet>`).join('')}
    </Period></MPD>`};
    let receive;
    globalThis.browser = {runtime: {
      onMessage: {addListener(fn) { receive = fn; }},
      async sendMessage(message) {
        if (message.type === 'manifests') return [entry];
        const lang = message.url.includes('/th/') ? 'สวัสดี' : 'Hello';
        const offset = message.url.endsWith('/2.vtt') ? 11 : 1;
        return `WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:0\n\n00:00:${String(offset).padStart(2, '0')}.000 --> 00:00:${String(offset + 2).padStart(2, '0')}.000\n${lang}`;
      }
    }};
    const video = document.createElement('video');
    let clock = 1.5;
    Object.defineProperties(video, {currentTime: {get: () => clock}, clientWidth: {get: () => 640}, clientHeight: {get: () => 360}});
    video.style.cssText = 'width:640px;height:360px';
    document.body.append(video);
    const script = document.createElement('script');
    script.src = '../extension/content.js';
    await new Promise((resolve, reject) => { script.onload = resolve; script.onerror = reject; document.body.append(script); });
    await wait(250);
    check(panel.getElementById('a').options.length === 3, 'UI discovers two DASH languages');
    for (const [selector, index] of [['a', 1], ['b', 2]]) {
      const select = panel.getElementById(selector);
      select.selectedIndex = index;
      select.dispatchEvent(new Event('change'));
    }
    await wait(400);
    check(panel.getElementById('first').textContent === 'สวัสดี', 'Thai line rendered');
    check(panel.getElementById('second').textContent === 'Hello', 'English line rendered');
    clock = 11.5;
    await wait(250);
    check(panel.getElementById('second').textContent === 'Hello', 'seek into second segment');
    clock = 5;
    await wait(250);
    check(panel.getElementById('second').textContent === '', 'expired cue cleared');
    const replacement = document.createElement('video');
    Object.defineProperties(replacement, {clientWidth: {get: () => 640}, clientHeight: {get: () => 360}});
    video.replaceWith(replacement);
    await wait(250);
    check(panel.getElementById('a').options.length === 3, 'video replacement retains manifest discovered ahead of player');
    history.pushState({}, '', '?next-title');
    receive({type: 'manifest', ...entry});
    await wait(250);
    check(panel.getElementById('a').options.length === 3, 'manifest arriving before navigation timer retained');
    output.textContent = previous + '\nPASS: content script discovery, language selection, Thai/English rendering, seeking, expired cues, video replacement, and navigation race.';
    globalThis.testPassed = true;
  } catch (error) { output.textContent = previous + '\nFAIL UI: ' + error.stack; }
  finally { Element.prototype.attachShadow = originalAttach; }
})();
