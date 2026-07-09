#!/usr/bin/env python3
"""Pull all screens (HTML + screenshot) of a Stitch project to ./stitch-export/.

Usage: python3 tools/stitch-pull.py [project_id]
Defaults to the "Celerity Design System Evolution" project.

Auth: reads the Stitch API key from .vscode/mcp.json (gitignored — never
commit the key). The key covers read/export; screen *generation* requires
OAuth and must be done in the Stitch web UI (stitch.withgoogle.com).
Transport via curl: the python.org macOS build lacks root certificates.
"""
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MCP_JSON = ROOT / ".vscode" / "mcp.json"
OUT = ROOT / "stitch-export"
URL = "https://stitch.googleapis.com/mcp"
DEFAULT_PROJECT = "10471893190608311045"  # Celerity Design System Evolution

KEY = json.loads(MCP_JSON.read_text())["servers"]["stitch"]["headers"]["X-Goog-Api-Key"]


def call(tool, args):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                       "params": {"name": tool, "arguments": args}})
    proc = subprocess.run(
        ["curl", "-sS", "--max-time", "120", "-X", "POST", URL,
         "-H", "Content-Type: application/json",
         "-H", "Accept: application/json, text/event-stream",
         "-H", f"X-Goog-Api-Key: {KEY}", "-d", body],
        capture_output=True, text=True, check=True)
    resp = json.loads(proc.stdout)
    if "error" in resp or resp["result"].get("isError"):
        raise RuntimeError(json.dumps(resp)[:500])
    return resp["result"].get("structuredContent") or resp["result"]["content"]


def fetch(url, dest):
    subprocess.run(["curl", "-sSL", "--max-time", "120", "-o", str(dest), url], check=True)


def slug(title):
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or "untitled"


project_id = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PROJECT
OUT.mkdir(exist_ok=True)
screens = call("list_screens", {"projectId": project_id})["screens"]
print(f"{len(screens)} screens in project {project_id}")

index = []
for s in screens:
    screen_id = s["name"].split("/")[-1]
    detail = call("get_screen", {"name": s["name"],
                                 "projectId": project_id, "screenId": screen_id})
    title = detail.get("title") or screen_id
    base = slug(title)
    html = detail.get("htmlCode", {}).get("downloadUrl")
    shot = detail.get("screenshot", {}).get("downloadUrl")
    if html:
        fetch(html, OUT / f"{base}.html")
    if shot:
        fetch(shot, OUT / f"{base}.png")
    index.append({"title": title, "screen": s["name"],
                  "device": detail.get("deviceType"),
                  "files": [f"{base}.html" if html else None,
                            f"{base}.png" if shot else None]})
    print(f"  ✓ {title}")

(OUT / "index.json").write_text(json.dumps(index, indent=1))
print(f"done → {OUT}")
