---
layout: default
title: Overview
permalink: /
---

# Wherezy v2.0.0

**Know where everything lives at home — in seconds.**

Wherezy is a lightweight, 100% local and LAN-first household inventory web application packaged with a standalone **Desktop Server Controller** (`wherezy` / `wherezy.exe`), Python CLI/package (`pipx`), and Docker support. Organize rooms, shelves, and bins, track borrowed tools and expiry dates, print QR and Code 128 barcode labels, and optionally use a **Local LLM** (Ollama / LM Studio) or **Google Gemini API**.

---

## Page Collection

{% assign doc_pages = site.docs | sort: "nav_order" %}
{% for doc in doc_pages %}
- **[{{ doc.title }}]({{ doc.url | relative_url }})** — {{ doc.summary }}
{% endfor %}

---

## Quick Downloads (`v2.0.0`)

| Platform / Format | Package | Launch |
| :--- | :--- | :--- |
| Windows (`x86_64`) | [wherezy-windows-x86_64.exe](https://github.com/ShadowAmitendu/wherezy/releases/latest/download/wherezy-windows-x86_64.exe) | Double-click for GUI & System Tray, or `wherezy --headless` |
| Linux (`x86_64`) | [wherezy-linux-x86_64](https://github.com/ShadowAmitendu/wherezy/releases/latest/download/wherezy-linux-x86_64) | `./wherezy-linux-x86_64 --open` |
| macOS (`arm64`) | [wherezy-macos-arm64](https://github.com/ShadowAmitendu/wherezy/releases/latest/download/wherezy-macos-arm64) | Double-click for Menu Bar Controller, or `./wherezy-macos-arm64 --headless` |
| Python Wheel (`pipx`) | [wherezy-2.0.0-py3-none-any.whl](https://github.com/ShadowAmitendu/wherezy/releases/latest/download/wherezy-2.0.0-py3-none-any.whl) | `pipx install ...` -> `wherezy` or `wherezy-desktop` |
| Checksums | [SHA256SUMS.txt](https://github.com/ShadowAmitendu/wherezy/releases/latest/download/SHA256SUMS.txt) | Verify download integrity |

See the [Downloads]({{ '/downloads/' | relative_url }}) page for full install commands and Docker instructions.

---

## Theme Configuration

This showcase site uses GitHub Pages Jekyll with `theme: {{ site.theme }}` configured in `site/_config.yml`.
To switch to any official [GitHub Pages theme](https://pages.github.com/themes/) (`jekyll-theme-cayman`, `jekyll-theme-slate`, `jekyll-theme-architect`, `jekyll-theme-tactile`, `minima`, etc.), update the `theme:` field in `site/_config.yml`.
