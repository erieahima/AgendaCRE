// firebase-config-example.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";

// 👉 INSTRUCCIONES:
// 1. Crea un proyecto en Firebase Console.
// 2. Extrae tus credenciales reales.
// 3. Renombra este archivo de "firebase-config-example.js" a "firebase-config.js".
// 4. Pega tus credenciales aquí abajo:

const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_AUTH_DOMAIN",
  projectId: "TU_PROJECT_ID",
  storageBucket: "TU_STORAGE_BUCKET",
  messagingSenderId: "TU_MESSAGING_SENDER_ID",
  appId: "TU_APP_ID",
  measurementId: "TU_MEASUREMENT_ID"
};

export { firebaseConfig };
