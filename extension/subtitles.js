/* Shared with the dependency-free Node checks. */
globalThis.DualSub = (() => {
  function time(value) {
    const parts = value.replace(",", ".").split(":").map(Number);
    return parts.reduce((sum, part) => sum * 60 + part, 0);
  }
  function parse(text) {
    const cues = [];
    for (const block of text.replace(/^\uFEFF/, "").replace(/\r/g, "").split(/\n\s*\n/)) {
      const lines = block.split("\n");
      const index = lines.findIndex(line => /^\s*(?:\d+:)?\d{2}:\d{2}[.,]\d+\s+-->/.test(line));
      if (index < 0) continue;
      const [start, end] = lines[index].trim().split(/\s+-->\s+/);
      const cue = {start: time(start), end: time(end.split(/\s/)[0]),
        text: lines.slice(index + 1).join("\n").replace(/<[^>]*>/g, "")
          .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim()};
      if (Number.isFinite(cue.start) && cue.end > cue.start) cues.push(cue);
    }
    return cues.sort((a, b) => a.start - b.start);
  }
  function active(cues, seconds) {
    return cues.filter(cue => cue.start <= seconds && seconds < cue.end).map(cue => cue.text).join("\n");
  }
  function attributes(line) {
    return Object.fromEntries([...line.matchAll(/([\w-]+)=(?:"([^"]*)"|([^,]*))/g)]
      .map(match => [match[1], match[2] ?? match[3]]));
  }
  return {time, parse, active, attributes};
})();
