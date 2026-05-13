import { getMessaging, getToken, isSupported, onMessage } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging.js";
import { app } from "/firebase-module-init.js";

let foregroundListenerAttached = false;

function setStatus(el, text) {
  if (el) el.textContent = text;
}

function attachForegroundIfNeeded(messaging) {
  if (foregroundListenerAttached) return;
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

async function fetchVapidPublicKey() {
  const cfgRes = await fetch("/api/me/push-config", {
    credentials: "same-origin",
  });
  if (!cfgRes.ok) {
    return { ok: false, error: "Konfiguration nicht ladbar." };
  }
  const { vapidPublicKey } = await cfgRes.json();
  if (!vapidPublicKey) {
    return {
      ok: false,
      error: "VAPID-Schluessel fehlt (Server-Umgebung: FCM_VAPID_PUBLIC_KEY).",
    };
  }
  return { ok: true, vapidPublicKey };
}

async function getMessagingSwReg() {
  const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
    scope: "/",
  });
  await reg.update();
  return reg;
}

async function persistPushToken(token) {
  const res = await fetch("/api/me/push-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ token }),
  });
  return res.ok;
}

async function afterTokenSuccess(statusEl, btn, messaging) {
  setStatus(statusEl, "Push ist aktiv.");
  if (btn) {
    btn.textContent = "Push erneuern";
    btn.disabled = false;
  }
  try {
    localStorage.setItem("bw_push_enabled", "1");
  } catch (e) {
    /* ignore */
  }
  attachForegroundIfNeeded(messaging);
}

async function syncPushUiFromExistingState() {
  const statusEl = document.getElementById("pushNotifyStatus");
  const btn = document.getElementById("pushNotifyBtn");

  if (!(await isSupported())) {
    setStatus(statusEl, "Push wird in diesem Browser nicht unterstuetzt.");
    if (btn) btn.disabled = true;
    return;
  }

  const perm = Notification.permission;
  if (perm === "denied") {
    setStatus(statusEl, "Benachrichtigung nicht erlaubt (Browser blockiert).");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Push aktivieren";
    }
    return;
  }

  const vapid = await fetchVapidPublicKey();
  if (!vapid.ok) {
    setStatus(statusEl, vapid.error);
    return;
  }

  if (perm !== "granted") {
    if (btn) {
      btn.textContent = "Push aktivieren";
      btn.disabled = false;
    }
    setStatus(statusEl, "");
    return;
  }

  try {
    const reg = await getMessagingSwReg();
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: vapid.vapidPublicKey,
      serviceWorkerRegistration: reg,
    });
    if (!token) {
      if (btn) btn.textContent = "Push aktivieren";
      setStatus(statusEl, "");
      return;
    }
    const ok = await persistPushToken(token);
    if (!ok) {
      setStatus(statusEl, "Token konnte nicht gespeichert werden.");
      if (btn) btn.textContent = "Push erneuern";
      return;
    }
    await afterTokenSuccess(statusEl, btn, messaging);
  } catch (e) {
    console.error(e);
    if (btn) btn.textContent = "Push aktivieren";
    setStatus(statusEl, "");
  }
}

async function registerPush() {
  const statusEl = document.getElementById("pushNotifyStatus");
  const btn = document.getElementById("pushNotifyBtn");
  if (!(await isSupported())) {
    setStatus(statusEl, "Push wird in diesem Browser nicht unterstuetzt.");
    if (btn) btn.disabled = true;
    return;
  }
  const vapid = await fetchVapidPublicKey();
  if (!vapid.ok) {
    setStatus(statusEl, vapid.error);
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    setStatus(statusEl, "Benachrichtigung nicht erlaubt.");
    return;
  }
  setStatus(statusEl, "Registriere…");
  const reg = await getMessagingSwReg();
  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey: vapid.vapidPublicKey,
    serviceWorkerRegistration: reg,
  });
  if (!token) {
    setStatus(statusEl, "Kein FCM-Token erhalten.");
    return;
  }
  const ok = await persistPushToken(token);
  if (!ok) {
    setStatus(statusEl, "Token konnte nicht gespeichert werden.");
    return;
  }
  await afterTokenSuccess(statusEl, btn, messaging);
}

document.addEventListener("DOMContentLoaded", () => {
  syncPushUiFromExistingState().catch((e) => {
    console.error(e);
  });
  const btn = document.getElementById("pushNotifyBtn");
  if (btn) {
    btn.addEventListener("click", () => {
      registerPush().catch((e) => {
        console.error(e);
        const statusEl = document.getElementById("pushNotifyStatus");
        if (statusEl) statusEl.textContent = "Fehler bei der Registrierung.";
      });
    });
  }
});
