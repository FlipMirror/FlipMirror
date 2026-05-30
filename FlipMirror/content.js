const KEY = "flipEnabled";
const PIP_KEY = "flipPiPEnabled";

let TAB_ID = null;
let pipActive = false;
let currentVideo = null;
let videoFrameCallbackId = null;

// ===== TAB ID =====
chrome.runtime.sendMessage({ type: "GET_TAB_ID" }, (tabId) => {
  TAB_ID = tabId;
  window.__tabId = tabId;
  loadState();
});

// ===== STORAGE =====
function setPipState(state) {
  if (TAB_ID === null) return;

  chrome.storage.local.get([PIP_KEY], (res) => {
    const map = res[PIP_KEY] || {};
    map[TAB_ID] = state;
    chrome.storage.local.set({ [PIP_KEY]: map });
  });
}

// ===== VIDEO SEARCH =====
function getActiveVideo(root = document) {
  let found = null;

  root.querySelectorAll("video").forEach(v => {
    if (!found) found = v;
  });

  root.querySelectorAll(".video-wrapper").forEach(w => {
    const v = w.querySelector("video");
    if (v && !found) found = v;
  });

  root.querySelectorAll("*").forEach(el => {
    if (el.shadowRoot) {
      const v = getActiveVideo(el.shadowRoot);
      if (v && !found) found = v;
    }
  });

  return found;
}

// ===== DRAW =====
function draw(video, canvas, ctx) {
  ctx.save();

  const isFlipped = window.__flipState === true;

  if (isFlipped) {
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
  } else {
    ctx.drawImage(video, 0, 0);
  }

  ctx.restore();
}

// ===== LOOP =====
function startLoop(video, canvas, ctx) {
  stopLoop(video);

  function loop() {
    if (!pipActive) return;

    draw(video, canvas, ctx);
    videoFrameCallbackId = video.requestVideoFrameCallback(loop);
  }

  if (video.requestVideoFrameCallback) {
    videoFrameCallbackId = video.requestVideoFrameCallback(loop);
  } else {
    const raf = () => {
      draw(video, canvas, ctx);
      if (pipActive) requestAnimationFrame(raf);
    };
    raf();
  }
}

function stopLoop(video) {
  if (video && video.cancelVideoFrameCallback && videoFrameCallbackId) {
    video.cancelVideoFrameCallback(videoFrameCallbackId);
    videoFrameCallbackId = null;
  }
}

// ===== STOP PIP =====
function stopPiP() {
  if (!pipActive) return;

  pipActive = false;

  stopLoop(currentVideo);

  if (currentVideo) {
    currentVideo.style.transform = currentVideo.style.transform
      .replace("scale(0.001)", "")
      .trim();

    currentVideo.style.position = "";
    currentVideo.style.left = "";
    currentVideo.style.pointerEvents = "";
  }

  currentVideo = null;

  setPipState(false);
}

// ===== START PIP =====
async function startFlippedPiP() {
  if (TAB_ID === null) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  const video = getActiveVideo();
  if (!video || pipActive) return;

  currentVideo = video;
  pipActive = true;

  setPipState(true);

  await new Promise(resolve => {
    chrome.storage.local.get([KEY], (res) => {
      const map = res[KEY] || {};
      window.__flipState = TAB_ID !== null ? (map[TAB_ID] || false) : false;
      resolve();
    });
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 360;

  startLoop(video, canvas, ctx);

  const stream = canvas.captureStream(60);

  const pipVideo = document.createElement("video");
  pipVideo.srcObject = stream;
  pipVideo.muted = true;

  // ===== SYNC =====
  let syncing = false;

  pipVideo.addEventListener("play", () => {
    if (syncing) return;
    syncing = true;
    if (currentVideo.paused) currentVideo.play().catch(() => {});
    syncing = false;
  });

  pipVideo.addEventListener("pause", () => {
    if (syncing) return;
    syncing = true;
    if (!currentVideo.paused) currentVideo.pause();
    syncing = false;
  });

  currentVideo.addEventListener("play", () => {
    if (syncing) return;
    syncing = true;
    if (pipVideo.paused) pipVideo.play().catch(() => {});
    syncing = false;
  });

  currentVideo.addEventListener("pause", () => {
    if (syncing) return;
    syncing = true;
    if (!pipVideo.paused) pipVideo.pause();
    syncing = false;
  });

  const wasPaused = currentVideo.paused;

  await pipVideo.play().catch(() => {});
  await pipVideo.requestPictureInPicture();

  if (wasPaused) {
    currentVideo.pause();
    pipVideo.pause();
  }

  // скрываем, но не убиваем рендер
  video.style.transform += " scale(0.001)";
  video.style.position = "fixed";
  video.style.left = "-9999px";
  video.style.pointerEvents = "none";

  pipVideo.addEventListener("leavepictureinpicture", stopPiP);
  document.addEventListener("leavepictureinpicture", stopPiP, { once: true });
}

// ===== RESTART PIP (ключ) =====
async function restartPiP() {
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    }
  } catch {}

  pipActive = false;

  setTimeout(() => {
    startFlippedPiP();
  }, 50);
}

// ===== FLIP =====
function applyTransform(el, state) {
  let current = el.style.transform || "";

  if (state) {
    if (!current.includes("scaleX(-1)")) {
      el.style.transform = (current + " scaleX(-1)").trim();
    }
  } else {
    el.style.transform = current
      .replace(/scaleX\(-1\)/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
}

function applyFlip(state) {
  document.querySelectorAll("video").forEach(v => {
    applyTransform(v, state);
  });

  function process(root) {
    root.querySelectorAll(".video-wrapper").forEach(el => {
      applyTransform(el, state);
    });

    root.querySelectorAll("*").forEach(el => {
      if (el.shadowRoot) process(el.shadowRoot);
    });
  }

  process(document);
}

// ===== FORCE REDRAW =====
function forceRedraw() {
  if (!currentVideo || !pipActive) return;

  if (currentVideo.paused) {
    // 🔥 при паузе — только перезапуск
    restartPiP();
  } else {
    const canvas = document.querySelector("canvas");
    if (canvas) {
      const ctx = canvas.getContext("2d");
      draw(currentVideo, canvas, ctx);
    }
  }
}

// ===== STATE =====
function loadState() {
  chrome.storage.local.get([KEY], (res) => {
    const map = res[KEY] || {};
    const state = map[TAB_ID] || false;

    window.__flipState = state;
    applyFlip(state);
  });
}

// ===== LIVE UPDATE =====
chrome.storage.onChanged.addListener((changes) => {
  if (changes[KEY]) {
    const map = changes[KEY].newValue || {};
    const state = map[TAB_ID] || false;

    window.__flipState = state;
    applyFlip(state);

    forceRedraw();
  }
});

// ===== EXPORT =====
window.startFlippedPiP = startFlippedPiP;