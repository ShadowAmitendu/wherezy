(function () {
  "use strict";

  const REPO_SLUG = "ShadowAmitendu/wherezy";
  const RELEASE_FALLBACK_TAG = "v2.0.0";
  const THEME_STORAGE_KEY = "wherezy_showcase_theme";

  const PLATFORM_ASSETS = {
    windows: {
      assetName: "wherezy-windows-x86_64.exe",
      ctaLabel: "Download for Windows (.exe)",
      cardId: "card-windows",
    },
    macos: {
      assetName: "wherezy-macos-arm64",
      ctaLabel: "Download for macOS (arm64)",
      cardId: "card-macos",
    },
    linux: {
      assetName: "wherezy-linux-x86_64",
      ctaLabel: "Download for Linux (x86_64)",
      cardId: "card-linux",
    },
    wheel: {
      assetName: "wherezy-2.0.0-py3-none-any.whl",
    },
  };

  function releaseDownloadUrl(assetName) {
    return "https://github.com/" + REPO_SLUG + "/releases/latest/download/" + assetName;
  }

  function detectOs() {
    const raw =
      (navigator.userAgentData && navigator.userAgentData.platform) ||
      navigator.platform ||
      navigator.userAgent ||
      "";
    const s = raw.toLowerCase();
    if (s.indexOf("mac") !== -1) return "macos";
    if (s.indexOf("linux") !== -1 || s.indexOf("x11") !== -1) return "linux";
    return "windows";
  }

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return "";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function applyTheme(themeId) {
    if (themeId === "material") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", themeId);
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themeId);
    } catch (_err) {
      // Ignore private-browsing storage errors.
    }
    document.querySelectorAll("[data-set-theme]").forEach(function (btn) {
      const active = btn.getAttribute("data-set-theme") === themeId;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function bindTabGroup(tabSelector, paneSelector, attrName) {
    const tabs = Array.from(document.querySelectorAll(tabSelector));
    const panes = Array.from(document.querySelectorAll(paneSelector));
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        const target = tab.getAttribute(attrName);
        tabs.forEach(function (t) {
          const isMatch = t === tab;
          t.classList.toggle("is-active", isMatch);
          t.setAttribute("aria-selected", isMatch ? "true" : "false");
        });
        panes.forEach(function (pane) {
          pane.classList.toggle("is-active", pane.getAttribute(attrName) === target);
        });
      });
    });
  }

  function bindCopyButtons() {
    document.querySelectorAll("[data-copy]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const box = btn.closest(".code-box");
        const code = box ? box.querySelector("code") : null;
        const text = code ? code.textContent : "";
        if (!text) return;

        const done = function () {
          const prev = btn.textContent;
          btn.textContent = "Copied!";
          setTimeout(function () {
            btn.textContent = prev;
          }, 1600);
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(done);
        } else {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          try {
            document.execCommand("copy");
          } catch (_err) {
            // Fallback failed silently.
          }
          document.body.removeChild(ta);
          done();
        }
      });
    });
  }

  function initOsDefaults() {
    const osKey = detectOs();
    const spec = PLATFORM_ASSETS[osKey] || PLATFORM_ASSETS.windows;

    const heroBtn = document.getElementById("hero-download-btn");
    const heroLabel = document.getElementById("hero-download-label");
    if (heroBtn && heroLabel) {
      heroBtn.setAttribute("href", releaseDownloadUrl(spec.assetName));
      heroLabel.textContent = spec.ctaLabel;
    }

    const card = document.getElementById(spec.cardId);
    if (card) {
      card.classList.add("is-highlighted");
    }
  }

  function hydrateLatestRelease() {
    const apiUrl = "https://api.github.com/repos/" + REPO_SLUG + "/releases/latest";
    fetch(apiUrl, { headers: { Accept: "application/vnd.github+json" } })
      .then(function (resp) {
        if (!resp.ok) throw new Error("Release status " + resp.status);
        return resp.json();
      })
      .then(function (release) {
        const tag = release.tag_name || RELEASE_FALLBACK_TAG;
        document.querySelectorAll("[data-release-tag]").forEach(function (el) {
          el.textContent = tag;
        });

        const releaseLink = document.getElementById("latest-release-link");
        if (releaseLink && release.html_url) {
          releaseLink.setAttribute("href", release.html_url);
        }

        const assets = Array.isArray(release.assets) ? release.assets : [];
        const byPrefix = {};
        assets.forEach(function (asset) {
          byPrefix[asset.name] = asset;
        });

        const mapTargets = [
          { key: "windows", linkId: "dl-windows", metaId: "meta-windows", exact: "wherezy-windows-x86_64.exe" },
          { key: "linux", linkId: "dl-linux", metaId: "meta-linux", exact: "wherezy-linux-x86_64" },
          { key: "macos", linkId: "dl-macos", metaId: "meta-macos", exact: "wherezy-macos-arm64" },
        ];

        mapTargets.forEach(function (item) {
          const asset = byPrefix[item.exact];
          if (!asset) return;
          const linkEl = document.getElementById(item.linkId);
          const metaEl = document.getElementById(item.metaId);
          if (linkEl && asset.browser_download_url) {
            linkEl.setAttribute("href", asset.browser_download_url);
          }
          if (metaEl && asset.size) {
            metaEl.textContent = asset.name + " · " + formatBytes(asset.size);
          }
        });

        const whlAsset = assets.find(function (a) {
          return a.name && a.name.endsWith(".whl");
        });
        if (whlAsset) {
          const whlLink = document.getElementById("dl-wheel");
          const whlMeta = document.getElementById("meta-wheel");
          if (whlLink && whlAsset.browser_download_url) {
            whlLink.setAttribute("href", whlAsset.browser_download_url);
          }
          if (whlMeta) {
            whlMeta.textContent = whlAsset.name + (whlAsset.size ? " · " + formatBytes(whlAsset.size) : "");
          }
        }

        const sumsAsset = byPrefix["SHA256SUMS.txt"];
        if (sumsAsset && sumsAsset.browser_download_url) {
          const sumsEl = document.getElementById("dl-checksums");
          if (sumsEl) sumsEl.setAttribute("href", sumsAsset.browser_download_url);
        }

        const osKey = detectOs();
        const activeAsset = byPrefix[PLATFORM_ASSETS[osKey].assetName];
        const heroBtn = document.getElementById("hero-download-btn");
        if (heroBtn && activeAsset && activeAsset.browser_download_url) {
          heroBtn.setAttribute("href", activeAsset.browser_download_url);
        }
      })
      .catch(function () {
        // Static /releases/latest/download/ fallback URLs remain active when offline.
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    let savedTheme = "material";
    try {
      savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || "material";
    } catch (_err) {
      savedTheme = "material";
    }
    applyTheme(savedTheme);

    document.querySelectorAll("[data-set-theme]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyTheme(btn.getAttribute("data-set-theme") || "material");
      });
    });

    bindTabGroup(".preview-tab", ".preview-pane", "data-preview-tab");
    bindTabGroup(".guide-tab", ".guide-pane", "data-guide-tab");
    bindCopyButtons();
    initOsDefaults();
    hydrateLatestRelease();
  });
})();
