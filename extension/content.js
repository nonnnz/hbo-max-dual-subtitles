(() => {
  const {parse, active, attributes} = DualSub;
  const tracks = new Map();
  const seen = new Map();
  let video, page = location.href, generation = 0;
  const host = document.createElement("div");
  host.id = "dual-sub-extension";
  const root = host.attachShadow({mode: "closed"});
  root.innerHTML = `
    <style>
      :host { all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; font: 14px system-ui; color: white; }
      button, select, input { font: inherit; color: white; background: #262334; border: 1px solid #777; border-radius: 6px; padding: 6px; }
      button, select, input, details { pointer-events: auto; }
      details { position: absolute; top: 20px; right: 20px; width: 290px; background: #161320f2; border-radius: 10px; padding: 12px; }
      details:not([open]) { width: auto; }
      summary { cursor: pointer; font-weight: bold; }
      label { display: grid; gap: 5px; margin-top: 12px; }
      input[type=file] { width: 100%; box-sizing: border-box; }
      p { color: #d4cfe0; line-height: 1.4; font-size: 12px; }
      #captions { position: fixed; text-align: center; white-space: pre-line; pointer-events: none; line-height: 1.4; font-size: clamp(18px, 2.2vw, 34px); text-shadow: 0 2px 3px black, 0 0 5px black; }
      .line { display: table; margin: 4px auto; padding: 0 8px; border-radius: 4px; background: #000b; }
      .line:empty { display: none; }
      #second { color: #ffe5a0; }
    </style>
    <details><summary>Dual Subtitles</summary>
      <label>First language<select id="a"><option value="">Off / HBO Max captions</option></select></label>
      <label>Second language<select id="b"><option value="">Off</option></select></label>
      <label>Add subtitle file (.srt / .vtt)<input id="file" type="file" accept=".srt,.vtt"></label>
      <label>Subtitle delay in seconds<input id="delay" type="number" min="-600" max="600" step="0.1" value="0"></label>
      <label>Height above bottom<input id="height" type="range" min="5" max="50" value="18"></label>
      <button id="refresh" type="button">Detect subtitles again</button>
      <p>Choose two tracks, or keep HBO Max captions and add a second track. Positive delay displays subtitles later. Files stay on your device.</p>
      <p id="status" role="status">Start a video. If no languages appear, choose a subtitle language in HBO Max, then reload the page.</p>
    </details>
    <div id="captions"><div class="line" id="first"></div><div class="line" id="second"></div></div>`;
  const $ = id => root.getElementById(id);
  const status = text => { $("status").textContent = text; };
  const fetchText = url => browser.runtime.sendMessage({type: "fetch", url});
  function add(track) {
    if (tracks.has(track.id)) return;
    tracks.set(track.id, track);
    for (const id of ["a", "b"]) {
      const option = document.createElement("option");
      option.value = track.id;
      option.textContent = track.label;
      $(id).append(option);
    }
    status(`${tracks.size} subtitle tracks available. Select your languages.`);
  }
  async function choose(id) {
    const track = tracks.get($(id).value);
    if (!track || track.loaded || track.loading || track.native || (track.cues && !track.segments)) return;
    const version = generation;
    status(`Loading ${track.label}…`);
    try {
      if (track.segments) {
        track.loading = true;
        track.cues = [];
        const now = video?.currentTime || 0;
        const pending = [...track.segments].sort((a, b) => {
          const distance = s => now >= s.start && now < s.end ? -1 : Math.abs(s.start - now);
          return distance(a) - distance(b);
        });
        let completed = 0, failures = 0;
        // Fetch near the current playback position first; render as segments arrive.
        await Promise.all(Array.from({length: Math.min(4, pending.length)}, async () => {
          while (pending.length && version === generation) {
            const segment = pending.shift();
            try {
              const raw = await fetchText(segment.url);
              if (version !== generation) return;
              const cues = DualDash.normalize(raw, segment);
              if (!cues.length && !/^\s*(?:\uFEFF)?WEBVTT/.test(raw)) throw Error("Unsupported subtitle format");
              track.cues.push(...cues);
            } catch { failures++; }
            completed++;
            if (version === generation) status(`${track.label}: ${completed}/${track.segments.length} segments loaded${failures ? ` (${failures} failed)` : ""}.`);
          }
        }));
        if (version !== generation) return;
        const unique = new Map(track.cues.map(c => [`${c.start}:${c.end}:${c.text}`, c]));
        track.cues = [...unique.values()].sort((a, b) => a.start - b.start);
        track.loaded = failures === 0;
        if (!track.cues.length) throw Error("Subtitle segments could not be read. Click Detect subtitles again and retry the language.");
        status(`${track.label} ready (${track.cues.length} cues)${failures ? `; ${failures} segments failed. Select the language again to retry.` : "."}`);
        return;
      }
      // Full VTT/SRT tracks and HLS WebVTT playlists are supported.
      const text = await fetchText(track.url);
      if (version !== generation) return;
      if (text.trimStart().startsWith("#EXTM3U")) {
        const lines = text.split(/\r?\n/);
        const segments = lines.filter(line => line.trim() && !line.startsWith("#"));
        if (segments.length > 2000) throw Error("Subtitle playlist is too large");
        // ponytail: load a finite VOD playlist; live subtitle playlists need polling.
        if (!text.includes("#EXT-X-ENDLIST")) throw Error("Live subtitle playlists are not supported; use a local file");
        const cues = [];
        for (const line of lines) {
          if (line.startsWith("#EXTINF:")) continue;
          if (!line.trim() || line.startsWith("#")) continue;
          const body = await fetchText(new URL(line.trim(), track.url).href);
          if (version !== generation) return;
          const parsed = parse(body);
          const stamp = body.match(/X-TIMESTAMP-MAP\s*=\s*LOCAL:([^,\s]+),MPEGTS:(\d+)/);
          const shift = stamp ? Number(stamp[2]) / 90000 - DualSub.time(stamp[1]) : 0;
          for (const cue of parsed) cues.push({...cue, start: cue.start + shift, end: cue.end + shift});
        }
        track.cues = cues.sort((a, b) => a.start - b.start);
      } else track.cues = parse(text);
      if (!track.cues.length) throw Error("This track is not plain WebVTT/SRT; use a local subtitle file");
      status(`${track.label} ready (${track.cues.length} cues).`);
    } catch (error) { if (version === generation) status(error.message); }
    finally { track.loading = false; }
  }
  for (const id of ["a", "b"]) $(id).addEventListener("change", () => choose(id));
  $("file").addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 5_000_000) return status("Choose a subtitle file smaller than 5 MB.");
    const version = generation;
    const cues = parse(await file.text());
    if (version !== generation) return;
    if (!cues.length) return status("No valid SRT or WebVTT cues found.");
    const id = `file:${Date.now()}`;
    add({id, label: file.name, cues});
    $("b").value = id;
    event.target.value = "";
  });
  function manifest(entry) {
    if (location.href !== page) { page = location.href; reset(); }
    if (seen.get(entry.url) === entry.body) return;
    seen.set(entry.url, entry.body);
    if (entry.body.trimStart().startsWith("#EXTM3U")) {
      for (const line of entry.body.split(/\r?\n/)) {
        if (!line.startsWith("#EXT-X-MEDIA:")) continue;
        const attrs = attributes(line);
        if (attrs.TYPE !== "SUBTITLES" || !attrs.URI) continue;
        const url = new URL(attrs.URI, entry.url).href;
        add({id: url, url, label: attrs.NAME || attrs.LANGUAGE || "Subtitle"});
      }
    } else {
      try { DualDash.read(entry.body, entry.url).forEach(add); }
      catch (error) { status(`Could not read subtitle manifest: ${error.message}`); }
      if (!tracks.size) status("Manifest received, but no supported text tracks found. Enable a language in HBO Max and click Detect subtitles again.");
    }
  }
  browser.runtime.onMessage.addListener(message => {
    if (message.type === "manifest") manifest(message);
  });
  function reset() {
    generation++;
    tracks.clear(); seen.clear();
    for (const id of ["a", "b"]) while ($(id).options.length > 1) $(id).remove(1);
    $("first").textContent = $("second").textContent = "";
    status("New video. Waiting for subtitle tracks; local files must be added again.");
  }
  function tick() {
    if (location.href !== page) { page = location.href; reset(); }
    const videos = [...document.querySelectorAll("video")];
    const next = videos.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
    // The manifest may arrive before the replacement video element. Keep its tracks.
    video = next;
    const container = document.fullscreenElement || document.body;
    if (container && host.parentNode !== container) container.append(host);
    const visible = video && video.clientWidth > 0;
    $("captions").hidden = !visible;
    if (!visible) return;
    const rect = video.getBoundingClientRect();
    const captions = $("captions");
    captions.style.left = `${rect.left + rect.width * .08}px`;
    captions.style.width = `${rect.width * .84}px`;
    captions.style.bottom = `${innerHeight - rect.bottom + rect.height * Number($("height").value) / 100}px`;
    [...video.textTracks].forEach((track, i) => {
      if (track.kind === "subtitles" || track.kind === "captions") add({id: `native:${i}`, label: track.label || track.language || `Track ${i + 1}`, native: track});
    });
    for (const [selector, line] of [["a", "first"], ["b", "second"]]) {
      const track = tracks.get($(selector).value);
      let text = "";
      if (track?.native) {
        // Do not alter the player's selected track; show cues only if exposed.
        text = [...(track.native.cues || [])].filter(cue => cue.startTime <= video.currentTime - Number($("delay").value) && cue.endTime > video.currentTime - Number($("delay").value)).map(cue => cue.text).join("\n");
      } else if (track?.cues) text = active(track.cues, video.currentTime - Number($("delay").value));
      if ($(line).textContent !== text) $(line).textContent = text;
    }
  }
  const detect = () => browser.runtime.sendMessage({type: "manifests"}).then(entries => {
    seen.clear();
    entries.forEach(manifest);
    if (!tracks.size) status("No usable subtitle tracks yet. Reload the HBO Max page with a video open to capture its manifest.");
  }).catch(error => status(error.message));
  $("refresh").addEventListener("click", detect);
  detect();
  setInterval(tick, 150);
})();
