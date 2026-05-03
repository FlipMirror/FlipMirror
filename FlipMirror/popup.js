const KEY = "flipEnabled";
const PIP_KEY = "flipPiPEnabled";

let toggle, pipToggle;
let onLabel, offLabel, pipOnLabel, pipOffLabel;
let mood, tabId;

document.addEventListener("DOMContentLoaded", async () => {
  toggle = document.getElementById("toggle");
  pipToggle = document.getElementById("pipToggle");

  onLabel = document.getElementById("onLabel");
  offLabel = document.getElementById("offLabel");

  pipOnLabel = document.getElementById("pipOnLabel");
  pipOffLabel = document.getElementById("pipOffLabel");

  mood = document.getElementById("mood");

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  tabId = tab.id;

  init();
});

function init() {
  chrome.storage.local.get([KEY, PIP_KEY], (res) => {
    const map = res[KEY] || {};
    const pipMap = res[PIP_KEY] || {};

    toggle.checked = map[tabId] || false;
    pipToggle.checked = pipMap[tabId] || false;

    updateUI();
  });

  toggle.addEventListener("change", async () => {
    const state = toggle.checked;

    chrome.storage.local.get([KEY], async (res) => {
      const map = res[KEY] || {};
      map[tabId] = state;

      chrome.storage.local.set({ [KEY]: map });

      updateUI("main");
      await inject();
    });
  });

  // 🔥 ФИКС: гарантируем загрузку content.js перед PiP
  pipToggle.addEventListener("change", async () => {
    const state = pipToggle.checked;

    chrome.storage.local.get([PIP_KEY], async (res) => {
      const map = res[PIP_KEY] || {};
      map[tabId] = state;

      chrome.storage.local.set({ [PIP_KEY]: map });

      updateUI("pip");

      // 🔥 1. гарантированно внедряем content.js
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"]
      });

      // 🔥 2. запускаем PiP
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (enabled) => {
          if (enabled) {
            window.startFlippedPiP?.();
          } else {
            document.exitPictureInPicture?.();
          }
        },
        args: [state]
      });
    });
  });

  const btn = document.getElementById("donateBtn");
  if (btn) {
    btn.addEventListener("click", () => {
      chrome.tabs.create({
        url: "https://www.donationalerts.com/r/flipmirror"
      });
    });
  }

  // синхронизация UI
  chrome.storage.onChanged.addListener((changes) => {
    if (changes[PIP_KEY]) {
      const newMap = changes[PIP_KEY].newValue || {};
      const newState = newMap[tabId] || false;

      if (!pipToggle) return;

      pipToggle.checked = newState;

      if (newState) {
        pipOnLabel.classList.add("active");
        pipOffLabel.classList.remove("active");
      } else {
        pipOnLabel.classList.remove("active");
        pipOffLabel.classList.add("active");
      }
    }
  });
}

async function inject() {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
  } catch (e) {}
}

function updateUI(trigger = "main") {
  toggle.checked
    ? onLabel.classList.add("active")
    : onLabel.classList.remove("active");

  toggle.checked
    ? offLabel.classList.remove("active")
    : offLabel.classList.add("active");

  pipToggle.checked
    ? pipOnLabel.classList.add("active")
    : pipOnLabel.classList.remove("active");

  pipToggle.checked
    ? pipOffLabel.classList.remove("active")
    : pipOffLabel.classList.add("active");

  updateMood(trigger);
}

function updateMood(trigger) {
  if (!mood) return;

  if (toggle.checked) {
    mood.textContent = "😄";

    if (trigger === "main") {
      mood.classList.remove("flash");
      void mood.offsetWidth;
      mood.classList.add("flash");
    }

  } else {
    mood.textContent = "😊";
    mood.classList.remove("flash");
  }
}