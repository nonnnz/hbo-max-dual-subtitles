/* Run in a real browser: DOMParser behavior is part of the regression. */
(() => {
  const check = (condition, name) => { if (!condition) throw Error(name); };
  try {
    const xml = `<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT60S">
      <BaseURL>https://cdn.example/title/</BaseURL>
      <Period start="PT0S" duration="PT30S">
        <AdaptationSet contentType="text" lang="th-TH"><Role value="subtitle"/>
          <SegmentTemplate timescale="1000" startNumber="1" media="t/th/$Number$.vtt"><SegmentTimeline><S t="0" d="10000" r="2"/></SegmentTimeline></SegmentTemplate>
          <Representation id="thai" mimeType="text/vtt"/>
        </AdaptationSet>
        <AdaptationSet contentType="text" lang="en-US"><Role value="caption"/>
          <Representation id="english" mimeType="text/vtt"><SegmentTemplate timescale="1000" media="t/en/$Number%03d$.vtt"><SegmentTimeline><S t="0" d="10000" r="-1"/></SegmentTimeline></SegmentTemplate></Representation>
        </AdaptationSet>
        <AdaptationSet contentType="video"><Representation mimeType="video/mp4"/></AdaptationSet>
      </Period>
      <Period start="PT30S" duration="PT30S">
        <AdaptationSet contentType="text" lang="th-TH"><Role value="subtitle"/>
          <SegmentTemplate timescale="1000" presentationTimeOffset="90000" media="feature/$Time$.vtt"><SegmentTimeline><S t="90000" d="30000"/></SegmentTimeline></SegmentTemplate>
          <Representation id="thai2" mimeType="text/vtt"/>
        </AdaptationSet>
      </Period>
    </MPD>`;
    const tracks = DualDash.read(xml, 'https://origin.example/dash.mpd?token=sample');
    check(tracks.length === 2, 'Thai and English detected without native textTracks');
    check(tracks[0].segments.length === 4, 'repeats and periods merged');
    check(tracks[0].segments[2].url === 'https://cdn.example/title/t/th/3.vtt', 'DASH Number expansion and inherited BaseURL');
    check(tracks[1].segments[2].url.endsWith('/t/en/003.vtt'), 'negative repeat and padded Number');
    check(tracks[0].segments[3].start === 30 && tracks[0].segments[3].url.endsWith('/feature/90000.vtt'), 'Time expansion and presentationTimeOffset');
    const raw = 'WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:8100000\n\n00:00:01.000 --> 00:00:02.000\nสวัสดี';
    const cue = DualDash.normalize(raw, tracks[0].segments[3])[0];
    check(cue.start === 31 && cue.end === 32, 'WebVTT mapped into period video clock');
    check(DualSub.active([cue], 31.5) === 'สวัสดี', 'seeking into normalized cue');
    check(DualDash.read('<invalid>', 'https://cdn.example/a.mpd').length === 0, 'malformed XML rejected');
    const prefixed = xml.replace(/<(\/?)(MPD|BaseURL|Period|AdaptationSet|Role|SegmentTemplate|SegmentTimeline|S|Representation)(?=[\s/>])/g, '<$1d:$2').replace('xmlns=', 'xmlns:d=');
    check(DualDash.read(prefixed, 'https://cdn.example/a.mpd').length === 2, 'namespace-prefixed DASH');
    document.getElementById('result').textContent = 'PASS: DASH discovery, Thai/English, inherited templates and BaseURL, Number/Time, negative repeats, multiple periods, WebVTT timestamp mapping, seeking, malformed XML and XML namespaces.';
    globalThis.testPassed = true;
  } catch (error) {
    document.getElementById('result').textContent = 'FAIL: ' + error.stack;
    globalThis.testPassed = false;
  }
})();
