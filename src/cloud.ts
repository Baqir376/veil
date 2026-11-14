// Optional Firebase services around the core flow — all loaded lazily so the landing page stays light.
//  • Auth (Google): sign in to keep a history of privacy receipts.
//  • Firestore: users/{uid}/receipts/{id} — counts, stages and a SHA-256 of the payload. Never values.
//  • Remote Config: tune the cloud model, on-device timeout and never-mask terms without a redeploy.
import type { User } from "firebase/auth";
import { app } from "./firebase";
import type { Receipt } from "./app/receipt";

// ---------- Remote Config ----------
export interface Settings {
  cloudModel: string;
  deviceTimeoutMs: number;
  maxAttackRounds: number;
  neverMaskExtra: string[];
}
export const DEFAULT_SETTINGS: Settings = {
  cloudModel: "gemini-3.5-flash-lite",
  deviceTimeoutMs: 20000,
  maxAttackRounds: 2,
  neverMaskExtra: [],
};

export async function loadSettings(): Promise<Settings & { source: "remote" | "default" }> {
  try {
    const { getRemoteConfig, fetchAndActivate, getValue } = await import("firebase/remote-config");
    const rc = getRemoteConfig(app);
    rc.settings.minimumFetchIntervalMillis = import.meta.env.DEV ? 60_000 : 3_600_000;
    rc.defaultConfig = {
      cloud_model: DEFAULT_SETTINGS.cloudModel,
      device_timeout_ms: DEFAULT_SETTINGS.deviceTimeoutMs,
      max_attack_rounds: DEFAULT_SETTINGS.maxAttackRounds,
      never_mask_extra: "[]",
    };
    const fetched = await fetchAndActivate(rc).catch(() => false);
    let extra: string[] = [];
    try { extra = JSON.parse(getValue(rc, "never_mask_extra").asString()); } catch { /* keep [] */ }
    return {
      cloudModel: getValue(rc, "cloud_model").asString() || DEFAULT_SETTINGS.cloudModel,
      deviceTimeoutMs: getValue(rc, "device_timeout_ms").asNumber() || DEFAULT_SETTINGS.deviceTimeoutMs,
      maxAttackRounds: getValue(rc, "max_attack_rounds").asNumber() || DEFAULT_SETTINGS.maxAttackRounds,
      neverMaskExtra: Array.isArray(extra) ? extra.filter((t) => typeof t === "string") : [],
      source: fetched || getValue(rc, "cloud_model").getSource() === "remote" ? "remote" : "default",
    };
  } catch {
    return { ...DEFAULT_SETTINGS, source: "default" };
  }
}

// ---------- Auth ----------
export async function watchUser(cb: (u: User | null) => void): Promise<() => void> {
  const { getAuth, onAuthStateChanged } = await import("firebase/auth");
  return onAuthStateChanged(getAuth(app), cb);
}
export async function signInWithGoogle() {
  const { getAuth, GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
  await signInWithPopup(getAuth(app), new GoogleAuthProvider());
}
export async function signOutUser() {
  const { getAuth, signOut } = await import("firebase/auth");
  await signOut(getAuth(app));
}

// ---------- Firestore: receipt history ----------
/** Firestore rejects `undefined`; a JSON round-trip also guarantees no functions or Maps sneak in. */
const plain = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

export async function saveReceipt(uid: string, r: Receipt) {
  const { getFirestore, doc, setDoc, serverTimestamp } = await import("firebase/firestore");
  await setDoc(doc(getFirestore(app), "users", uid, "receipts", r.id), { ...plain(r), savedAt: serverTimestamp() });
}

export async function listReceipts(uid: string, max = 20): Promise<Receipt[]> {
  const { getFirestore, collection, query, orderBy, limit, getDocs } = await import("firebase/firestore");
  const q = query(collection(getFirestore(app), "users", uid, "receipts"), orderBy("createdAt", "desc"), limit(max));
  return (await getDocs(q)).docs.map((d) => d.data() as Receipt);
}

export async function deleteReceipt(uid: string, id: string) {
  const { getFirestore, doc, deleteDoc } = await import("firebase/firestore");
  await deleteDoc(doc(getFirestore(app), "users", uid, "receipts", id));
}
