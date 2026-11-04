"""Package runtime files only; no signing or publishing."""

import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
extension = root / "extension"
manifest = json.loads((extension / "manifest.json").read_text())
files = {"manifest.json", "LICENSE"}
files.update(manifest["background"]["scripts"])
for script in manifest["content_scripts"]:
    files.update(script.get("js", []))
    files.update(script.get("css", []))
files.update(manifest.get("icons", {}).values())

destination = root / "dist" / f"dual-sub-{manifest['version']}.zip"
destination.parent.mkdir(exist_ok=True)
with ZipFile(destination, "w", ZIP_DEFLATED) as archive:
    for name in sorted(files):
        source = root / name if name == "LICENSE" else extension / name
        archive.write(source, name)
with ZipFile(destination) as archive:
    assert archive.testzip() is None
    assert set(archive.namelist()) == files
print(f"Created {destination.relative_to(root)} (unsigned)")
