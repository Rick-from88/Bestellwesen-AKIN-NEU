// Firebase module init (ES module import)
// Usage: include in your HTML as
// <script type="module" src="/firebase-module-init.js"></script>

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyD14Iwp8m6ivTTaA3Bft7I1-xL8tc7NUzk",
  authDomain: "akin-bestellwesen.firebaseapp.com",
  projectId: "akin-bestellwesen",
  storageBucket: "akin-bestellwesen.firebasestorage.app",
  messagingSenderId: "461919576268",
  appId: "1:461919576268:web:e495915c145681cb81a269",
  measurementId: "G-0GNGTXZSG9"
};

const app = initializeApp(firebaseConfig);
try {
  getAnalytics(app);
} catch (e) {
  // analytics may require additional setup; ignore failures
}
