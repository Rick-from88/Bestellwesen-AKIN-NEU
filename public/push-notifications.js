import { getMessaging, getToken, isSupported, onMessage } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging.js";
import { app } from "/firebase-module-init.js";

let foregroundListenerAttached = false;

function setStatus(el, text) {
  if (el) el.textContent = text;
}

async function registerPush() {
  const statusEl = document.getElementById("pushNotifyStatus");
  const btn = document.getElementById("pushNotifyBtn");
  if (!(await isSupported())) {
    setStatus(statusEl, "Push wird in diesem Browser nicht unterstuetzt.");
    if (btn) btn.disabled = true;
    return;
  }
  const cfgRes = await fetch("/api/me/push-config", {
    credentials: "same-origin",
  });
  if (!cfgRes.ok) {
    setStatus(statusEl, "Konfiguration nicht ladbar.");
    return;
  }
  const { vapidPublicKey } = await cfgRes.json();
  if (!vapidPublicKey) {
    setStatus(
      statusEl,
      "VAPID-Schluessel fehlt (Server-Umgebung: FCM_VAPID_PUBLIC_KEY).",
    );
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    setStatus(statusEl, "Benachrichtigung nicht erlaubt.");
    return;
  }
  setStatus(statusEl, "Registriere…");
  const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
    scope: "/",
  });
  await reg.update();
  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey: vapidPublicKey,
    serviceWorkerRegistration: reg,
  });
  if (!token) {
    setStatus(statusEl, "Kein FCM-Token erhalten.");
    return;
  }
  const res = await fetch("/api/me/push-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    setStatus(statusEl, "Token konnte nicht gespeichert werden.");
    return;
  }
  setStatus(statusEl, "Push ist aktiv.");
  if (btn) btn.textContent = "Push erneuern";
  try {
    localStorage.setItem("bw_push_enabled", "1");
  } catch (e) {
    /* ignore */
  }

  if (!foregroundListenerAttached) {
    foregroundListenerAttached = true;
    onMessage(messaging, (payload) => {
      const n = payload.notification;
      if (n?.title) {
        try {
          new Notification(n.title, { body: n.body || "" });
        } catch (e) {
          /* ignore */
        }
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("pushNotifyBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    registerPush().catch((e) => {
      console.error(e);
      const statusEl = document.getElementById("pushNotifyStatus");
      if (statusEl) statusEl.textContent = "Fehler bei der Registrierung.";
    });
  });
});
