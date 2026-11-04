/* DASH text tracks use the same video presentation clock as the player. */
globalThis.DualDash = (() => {
  const children = (node, name) => [...node.children].filter(child => child.localName === name);
  const first = (node, name) => children(node, name)[0];
  function duration(value) {
    const m = (value || "").match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
    return m ? Number(m[1] || 0) * 86400 + Number(m[2] || 0) * 3600 + Number(m[3] || 0) * 60 + Number(m[4] || 0) : NaN;
  }
  function expand(template, entries, base, representation, periodStart, periodDuration) {
    const scale = Number(template.timescale || 1);
    const pto = Number(template.presentationTimeOffset || 0);
    let number = Number(template.startNumber || 1), cursor = 0;
    if (!(scale > 0) || !Number.isSafeInteger(number) || !template.media) return [];
    if (!entries.length && Number(template.duration) > 0 && Number.isFinite(periodDuration)) {
      entries = [{t: pto, d: Number(template.duration), r: Math.ceil(periodDuration * scale / Number(template.duration)) - 1}];
    }
    const result = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      cursor = Number(entry.t ?? cursor);
      const length = Number(entry.d);
      let repeat = Number(entry.r || 0);
      if (repeat === -1) {
        const limit = entries[i + 1]?.t ?? (periodDuration * scale + pto);
        repeat = Math.ceil((Number(limit) - cursor) / length) - 1;
      }
      if (!(length > 0) || !Number.isFinite(cursor) || !Number.isInteger(repeat) || repeat < 0 || repeat > 10000 || result.length + repeat + 1 > 10000) return [];
      for (let j = 0; j <= repeat; j++) {
        const media = template.media.replace(/\$\$/g, "\u0001").replace(/\$(Number|Time|RepresentationID|Bandwidth)(?:%0(\d+)d)?\$/g, (_, key, width) => {
          const value = {Number: number, Time: cursor, RepresentationID: representation.id || "", Bandwidth: representation.bandwidth || ""}[key];
          return String(value).padStart(Math.min(Number(width) || 0, 20), "0");
        }).replace(/\u0001/g, "$");
        if (/\$(?:Number|Time|RepresentationID|Bandwidth)/.test(media)) return [];
        result.push({url: new URL(media, base).href, start: periodStart + (cursor - pto) / scale,
          end: periodStart + (cursor - pto + length) / scale, mediaTime: cursor / scale, periodStart, pto: pto / scale});
        cursor += length;
        number++;
      }
    }
    return result;
  }
  function read(raw, manifestUrl) {
    const doc = new DOMParser().parseFromString(raw, "application/xml");
    if (doc.documentElement.localName !== "MPD" || doc.getElementsByTagName("parsererror").length) return [];
    const mpd = doc.documentElement;
    const periods = children(mpd, "Period");
    const result = new Map();
    let previousEnd = 0;
    for (let p = 0; p < periods.length; p++) {
      const period = periods[p];
      const periodStart = period.hasAttribute("start") ? duration(period.getAttribute("start")) : previousEnd;
      const nextStart = duration(periods[p + 1]?.getAttribute("start"));
      const total = duration(mpd.getAttribute("mediaPresentationDuration"));
      const periodDuration = duration(period.getAttribute("duration")) || (Number.isFinite(nextStart) ? nextStart - periodStart : total - periodStart);
      previousEnd = periodStart + periodDuration;
      const variants = new Map();
      for (const adaptation of children(period, "AdaptationSet")) {
        for (const rep of children(adaptation, "Representation")) {
          const mime = rep.getAttribute("mimeType") || adaptation.getAttribute("mimeType") || "";
          const mediaHint = nodesMedia(adaptation, rep);
          if (!/vtt|subrip/i.test(mime) && !/\.vtt(?:[?$]|$)/i.test(mediaHint)) continue;
          const nodes = [mpd, period, adaptation, rep];
          let base = manifestUrl, template = {}, timeline;
          for (const node of nodes) {
            const b = first(node, "BaseURL");
            if (b) base = new URL(b.textContent.trim(), base).href;
            const t = first(node, "SegmentTemplate");
            if (t) {
              Object.assign(template, Object.fromEntries([...t.attributes].map(a => [a.name, a.value])));
              timeline = first(t, "SegmentTimeline") || timeline;
            }
          }
          const language = adaptation.getAttribute("lang") || rep.getAttribute("lang") || "und";
          const declaredLabel = first(adaptation, "Label")?.textContent.trim() || "";
          const role = first(adaptation, "Role")?.getAttribute("value") || (/\bCC\b|SDH/i.test(declaredLabel) ? "caption" : "subtitle");
          const variantKey = `${language}:${role}`;
          const variant = variants.get(variantKey) || 0;
          variants.set(variantKey, variant + 1);
          const id = `dash:${new URL(manifestUrl).pathname}:${variantKey}:${variant}`;
          let segments = [];
          if (template.media) {
            const entries = timeline ? children(timeline, "S").map(s => Object.fromEntries([...s.attributes].map(a => [a.name, a.value]))) : [];
            segments = expand(template, entries, base, {id: rep.id, bandwidth: rep.getAttribute("bandwidth")}, periodStart, periodDuration);
          } else if (base !== manifestUrl && /vtt|subrip/.test(mime)) {
            segments = [{url: base, start: periodStart, end: periodStart + periodDuration, mediaTime: 0, periodStart, pto: 0}];
          }
          segments = segments.filter(segment => !/\/empty-dash-subs\.vtt(?:[?#]|$)/i.test(segment.url));
          if (!segments.length) { variants.set(variantKey, variant); continue; }
          let name;
          try { name = new Intl.DisplayNames([navigator.language || "en"], {type: "language"}).of(language); } catch {}
          const label = `${name || language}${/caption/i.test(role) ? " (CC)" : ""}${variant ? ` (${variant + 1})` : ""}`;
          if (result.has(id)) result.get(id).segments.push(...segments);
          else result.set(id, {id, label, language, segments});
        }
      }
    }
    return [...result.values()];
  }
  function nodesMedia(adaptation, rep) {
    return [first(adaptation, "SegmentTemplate"), first(rep, "SegmentTemplate")].map(t => t?.getAttribute("media") || "").join(" ");
  }
  function normalize(raw, segment) {
    const cues = DualSub.parse(raw);
    const stamp = raw.match(/X-TIMESTAMP-MAP\s*=([^\r\n]+)/)?.[1];
    let shift = segment.periodStart - segment.pto;
    let localTime = 0;
    if (stamp) {
      const local = stamp.match(/LOCAL:([\d:.]+)/)?.[1];
      const ticks = stamp.match(/MPEGTS:(\d+)/)?.[1];
      if (local && ticks) {
        localTime = DualSub.time(local);
        const wrap = 2 ** 33 / 90000;
        const mapped = Number(ticks) / 90000;
        const unwrapped = mapped + Math.round((segment.mediaTime - mapped) / wrap) * wrap;
        shift += unwrapped - localTime;
      }
    }
    // ponytail: cue ranges distinguish relative files from full-document files;
    // unusual overlapping timestamp ranges may still need the manual delay control.
    const length = segment.end - segment.start;
    const last = Math.max(...cues.map(c => c.end));
    const firstStart = cues[0]?.start;
    const onMediaClock = firstStart >= segment.mediaTime - 1 && last <= segment.mediaTime + length + 5;
    if (cues.length && !onMediaClock && last <= length + 5) shift = segment.start - localTime;
    return cues.map(cue => ({...cue, start: Math.round((cue.start + shift) * 1000) / 1000, end: Math.round((cue.end + shift) * 1000) / 1000}));
  }
  return {read, expand, normalize, duration};
})();
