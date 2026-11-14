// Firebase bootstrap: App, App Check (required by Firebase AI Logic), and the AI Logic instance.
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAI, GoogleAIBackend } from "firebase/ai";

const env = import.meta.env;

export const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});

export let appCheckEnabled = false;

if (env.VITE_RECAPTCHA_SITE_KEY) {
  // On localhost, App Check uses a debug token. The SDK prints it to the console on first load;
  // register it in Firebase console → App Check → Apps → Manage debug tokens.
  if (env.DEV) (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  initializeAppCheck(app, {
    // Fraud Defense (formerly reCAPTCHA Enterprise) — Firebase no longer accepts new reCAPTCHA Classic registrations.
    provider: new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
  appCheckEnabled = true;
} else {
  console.warn("[Veil] VITE_RECAPTCHA_SITE_KEY is empty — App Check is not initialised.");
}

export const ai = getAI(app, { backend: new GoogleAIBackend() });
