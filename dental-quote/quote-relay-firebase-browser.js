import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const REQUIRED_CONFIG_KEYS = Object.freeze([
  'apiKey',
  'authDomain',
  'projectId',
  'messagingSenderId',
  'appId'
]);

function requireRelayGlobals() {
  if (!window.QuoteRelayCore || !window.QuoteRelayTransport) {
    throw new Error('quote relay core not loaded');
  }
}

function validateFirebaseConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('firebase config required');
  }
  for (const key of REQUIRED_CONFIG_KEYS) {
    if (typeof config[key] !== 'string' || !config[key].trim()) {
      throw new Error(`firebase config missing: ${key}`);
    }
  }
  return Object.freeze(Object.fromEntries(REQUIRED_CONFIG_KEYS.map((key) => [key, config[key].trim()])));
}

export function createFirebaseRelayTransport(firebaseConfig) {
  requireRelayGlobals();
  const validatedConfig = validateFirebaseConfig(firebaseConfig);
  const app = getApps().length ? getApp() : initializeApp(validatedConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  return window.QuoteRelayTransport.createRelayTransport({
    auth,
    db,
    signInAnonymously,
    doc,
    setDoc,
    getDoc,
    buildRelayPayload: window.QuoteRelayCore.buildRelayPayload
  });
}

export { validateFirebaseConfig };
