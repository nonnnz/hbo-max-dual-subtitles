# Changelog

## 0.2.0

- Detect HBO Max's segmented DASH WebVTT subtitle tracks.
- Resolve inherited BaseURLs and templates, numbered/time segment URLs, repeated segments, and multiple periods.
- Normalize segment-relative and media-clock cues using WebVTT timestamp maps.
- Load selected language segments near the current playback position first.
- Skip empty subtitle placeholders and preserve discovered tracks during video replacement.
- Add a button to detect subtitles again.
- Add browser regressions for Thai/English detection, rendering, seeking, and navigation.

Reported working on HBO Max in Zen by the project owner. Coverage across other titles, regions, and Firefox versions remains limited.

## 0.1.0

- Initial Zen / Firefox extension with two subtitle selectors.
- Local SRT/WebVTT files, timing adjustment, and subtitle positioning.
- Basic direct-file and HLS subtitle discovery.
