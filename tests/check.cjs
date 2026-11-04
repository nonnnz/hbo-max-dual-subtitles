const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const directory = path.join(__dirname, '..', 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json')));
for (const file of [...manifest.background.scripts, ...manifest.content_scripts.flatMap(s => s.js)]) {
  new vm.Script(fs.readFileSync(path.join(directory, file), 'utf8'), {filename: file});
}
require('../extension/subtitles.js');
const {parse, active, attributes} = globalThis.DualSub;
const cues = parse('\uFEFF1\r\n00:00:01,250 --> 00:00:03,000\r\nHello <i>world</i> &amp; friends\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,500\r\nสวัสดี\r\n');
assert.equal(cues.length, 2);
assert.equal(active(cues, 1.249), '');
assert.equal(active(cues, 1.25), 'Hello world & friends');
assert.equal(active(cues, 3), 'สวัสดี');
assert.equal(active(cues, 4.5), '');
assert.equal(parse('WEBVTT\n\ncue-id\n01:02.500 --> 01:04.000 align:center\nTwo\nlines')[0].start, 62.5);
assert.equal(parse('WEBVTT\n\nNOTE comment\nno cue').length, 0);
assert.equal(parse('1\n00:00:05,000 --> 00:00:04,000\nInvalid').length, 0);
assert.equal(active(parse('00:00:01.000 --> 00:00:04.000\nA\n\n00:00:02.000 --> 00:00:03.000\nB'), 2.5), 'A\nB');
assert.equal(attributes('#EXT-X-MEDIA:TYPE=SUBTITLES,NAME="English, CC",URI="en/sub.m3u8"').NAME, 'English, CC');
require('../extension/dash.js');
const {expand, normalize} = globalThis.DualDash;
const segments = expand({timescale: '1000', media: 'th/$Number$.vtt'}, [{t: 0, d: 10000, r: 2}], 'https://cdn.example/', {}, 0, 30);
assert.equal(segments.length, 3);
assert.equal(segments[2].url, 'https://cdn.example/th/3.vtt');
assert.equal(segments[2].start, 20);
assert.equal(expand({media: '$Time$.vtt'}, [{d: 0}], 'https://cdn.example/', {}, 0, 30).length, 0);
const mapped = text => `WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:0\n\n${text}`;
assert.equal(normalize(mapped('00:00:01.000 --> 00:00:03.000\nrelative'), segments[1])[0].start, 11);
assert.equal(normalize(mapped('00:00:11.000 --> 00:00:13.000\nabsolute'), segments[1])[0].start, 11);
const periodSegment = {start: 1350, end: 1380, mediaTime: 1320, periodStart: 30, pto: 0};
assert.equal(normalize(mapped('00:22:01.000 --> 00:22:02.000\nmedia'), periodSegment)[0].start, 1351);
assert.equal(normalize(mapped('00:00:01.000 --> 00:00:02.000\nrelative'), periodSegment)[0].start, 1351);

// Exercise Firefox response filtering, including extensionless MPD URLs.
let observe, responseFilter, captured;
const context = {
  URL, TextDecoder, AbortSignal, fetch, Map,
  browser: {
    webRequest: {
      onHeadersReceived: {addListener(fn) { observe = fn; }},
      onBeforeRequest: {addListener() {}},
      filterResponseData() { responseFilter = {write(data) { captured = data; }, close() {}}; return responseFilter; }
    },
    tabs: {onRemoved: {addListener() {}}, sendMessage: async () => {}},
    runtime: {onMessage: {addListener() {}}}
  }
};
vm.runInNewContext(fs.readFileSync(path.join(directory, 'background.js'), 'utf8'), context);
observe({tabId: 1, url: 'https://cdn.example/manifest', documentUrl: 'https://other.example/', responseHeaders: [{name: 'Content-Type', value: 'application/dash+xml'}]});
assert.equal(responseFilter, undefined);
observe({tabId: 1, url: 'https://cdn.example/manifest', documentUrl: 'https://play.hbomax.com/video/watch/test', responseHeaders: [{name: 'Content-Type', value: 'application/dash+xml'}]});
const bytes = new TextEncoder().encode('<MPD/>').buffer;
responseFilter.ondata({data: bytes});
responseFilter.onstop();
assert.equal(captured, bytes, 'playback bytes must pass through unchanged');
assert.equal(vm.runInNewContext('manifests.get(1)[0].body', context), '<MPD/>');
console.log('Passed: manifest wiring, parser, DASH expansion, relative/absolute/period timing, Firefox response capture and byte passthrough.');
