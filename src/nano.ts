// Web app binding: Firebase AI Logic with App Check (see src/firebase.ts).
import { ai } from "./firebase";
import { bindAI } from "./nanoCore";

bindAI(ai);

export * from "./nanoCore";
