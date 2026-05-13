/* global firebase */
/* eslint-disable no-undef */
importScripts(
  "https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging-compat.js",
);

firebase.initializeApp({
  apiKey: "AIzaSyD14Iwp8m6ivTTaA3Bft7I1-xL8tc7NUzk",
  authDomain: "akin-bestellwesen.firebaseapp.com",
  projectId: "akin-bestellwesen",
  storageBucket: "akin-bestellwesen.firebasestorage.app",
  messagingSenderId: "461919576268",
  appId: "1:461919576268:web:e495915c145681cb81a269",
  measurementId: "G-0GNGTXZSG9",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  const title = n.title || "Bestellwesen";
  const options = {
    body: n.body || "",
    data: payload.data || {},
  };
  return self.registration.showNotification(title, options);
});
