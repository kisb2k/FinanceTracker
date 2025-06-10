
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Validate essential Firebase configuration
const essentialConfigKeys: (keyof typeof firebaseConfig)[] = ['apiKey', 'authDomain', 'projectId', 'appId'];
let missingKeys: string[] = [];

if (typeof window === 'undefined') { // Check only on server-side
  missingKeys = essentialConfigKeys.filter(key => !firebaseConfig[key]);

  if (!firebaseConfig.projectId) {
    console.error("🔴 CRITICAL: NEXT_PUBLIC_FIREBASE_PROJECT_ID is missing in .env.local or not loaded. Firebase will not initialize correctly. Please verify your .env.local file and restart the development server.");
  } else if (missingKeys.length > 0) {
    const message = `🟡 WARNING: Firebase configuration might be incomplete. Missing or undefined .env.local variables: ${missingKeys.map(k => `NEXT_PUBLIC_FIREBASE_${k.toUpperCase()}`).join(', ')}. Please verify your .env.local file and restart the development server.`;
    console.warn(message);
  }
}


let app: FirebaseApp;
let db: Firestore;

if (getApps().length === 0) {
  if (firebaseConfig.projectId) { // Initialize only if projectId is available
    try {
      app = initializeApp(firebaseConfig);
      db = getFirestore(app);
      console.log("✅ Firebase initialized successfully with Project ID:", firebaseConfig.projectId);
    } catch (initError) {
      console.error("🔴 Firebase initialization error:", initError);
      // @ts-ignore
      app = null; 
      // @ts-ignore
      db = null;
    }
  } else {
    // Error already logged above for missing projectId on server
    // @ts-ignore
    app = null; 
    // @ts-ignore
    db = null;
  }
} else {
  app = getApps()[0];
  db = getFirestore(app);
  if (firebaseConfig.projectId) {
    console.log("✅ Firebase app already initialized. Using existing instance for Project ID:", firebaseConfig.projectId);
  }
}

export { db, app };

