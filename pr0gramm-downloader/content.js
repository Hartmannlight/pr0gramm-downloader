// Liefert die URL des zu ladenden Mediums (Video oder Bild)
function getMediaUrl() {
  const media = document.querySelector("video source") || document.querySelector("img");
  if (!media) return null;
  let url = media.src;
  if (url.startsWith("//")) url = "https:" + url;
  return url;
}

// Extrahiert die fortlaufende ID aus der aktuellen URL
function getPageId() {
  let segments = window.location.pathname.split("/");
  // Entfernt leere Segmente (z. B. bei einem abschließenden /)
  segments = segments.filter(Boolean);
  return segments.pop();
}

// Bestimmt die Dateiendung aus der Media-URL
function getExtension(url) {
  const match = url.match(/(\.[a-z0-9]+)(?:\?|$)/i);
  return match ? match[1] : "";
}

function addDownloadButton() {
  const container = document.querySelector(".item-details");
  if (!container || document.querySelector("#pr0-download-btn")) return;

  const btn = document.createElement("button");
  btn.id = "pr0-download-btn";
  btn.innerText = "Download Media";
  btn.style.cssText = "padding:4px 8px;font-size:9px;cursor:pointer;margin-left:10px;border:2px solid #d23c22;background:transparent;color:white;border-radius:0;";

  btn.addEventListener("click", () => {
    const mediaUrl = getMediaUrl();
    if (!mediaUrl) {
      alert("Media file not found!");
      return;
    }
    const id = getPageId();
    const ext = getExtension(mediaUrl);
    const filename = `${id}${ext}`;
    console.log("Sending download request:", mediaUrl, "with filename:", filename);
    chrome.runtime.sendMessage({ action: "downloadMedia", url: mediaUrl, filename });
  });

  container.appendChild(btn);
}

const observer = new MutationObserver(addDownloadButton);
observer.observe(document.body, { childList: true, subtree: true });
addDownloadButton();
