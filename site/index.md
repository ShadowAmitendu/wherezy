---
layout: default
title: Overview
permalink: /
---

# Wherezy v2.2.2

**Know where everything lives at home — in seconds.**

Wherezy is a lightweight, 100% local and LAN-first household inventory web application packaged with an installable **TTK Bootstrap Desktop Server Controller** (`Wherezy-Setup-2.2.2.exe` / `Wherezy.app`), built-in optional **HTTPS/TLS** (with automatic local SAN certificates for Wi-Fi camera scanning), Python CLI/package (`pipx`), and Docker support. Organize rooms, shelves, and bins, track borrowed tools and expiry dates, print QR and Code 128 barcode labels, and optionally use a **Local LLM** (Ollama / LM Studio) or **Google Gemini API**.

---

## Page Collection

{% assign doc_pages = site.docs | sort: "nav_order" %}
{% for doc in doc_pages %}
- **[{{ doc.title }}]({{ doc.url | relative_url }})** — {{ doc.summary }}
{% endfor %}

---

## Quick Downloads (`v2.2.2`)

| Platform / Format | Package | Install / Launch |
| :--- | :--- | :--- |
| Windows (`x86_64` Installer) | [Wherezy-Setup-2.2.2.exe](https://github.com/ShadowAmitendu/wherezy/releases/latest/download/Wherezy-Setup-2.2.2.exe) | Per-user installer (no admin needed), Start Menu, Tray & optional autostart |
| macOS (`.dmg`) | [Wherezy-2.2.2-macOS.dmg](https://github.com/ShadowAmitendu/wherezy/releases/latest/download/Wherezy-2.2.2-macOS.dmg) | Drag `Wherezy.app` to Applications; includes Menu Bar Controller |
| Linux (`x86_64`) | [wherezy-2.2.2-linux-x86_64.tar.gz](https://github.com/ShadowAmitendu/wherezy/releases/latest/download/wherezy-2.2.2-linux-x86_64.tar.gz) | Extract & run `./Wherezy/wherezy --open` |
| Python Wheel (`pipx`) | [wherezy-2.2.2-py3-none-any.whl](https://github.com/ShadowAmitendu/wherezy/releases/latest/download/wherezy-2.2.2-py3-none-any.whl) | `pipx install ...` -> `wherezy` or `wherezy-desktop` |
| Checksums | [SHA256SUMS.txt](https://github.com/ShadowAmitendu/wherezy/releases/latest/download/SHA256SUMS.txt) | Verify download integrity |

See the [Downloads]({{ '/downloads/' | relative_url }}) page for full install commands and Docker instructions.

---

## Theme Configuration

This showcase site uses GitHub Pages Jekyll with `theme: {{ site.theme }}` configured in `site/_config.yml`.
To switch to any official [GitHub Pages theme](https://pages.github.com/themes/) (`jekyll-theme-minimal`, `jekyll-theme-cayman`, `jekyll-theme-slate`, `jekyll-theme-tactile`, `minima`, etc.), update the `theme:` field in `site/_config.yml`.
