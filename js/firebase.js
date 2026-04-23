// js/firebase.js
import { firebaseConfig } from '../firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import { 
    initializeFirestore, persistentLocalCache, collection, doc, setDoc, getDocs, getDoc, query, where, writeBatch, Timestamp, addDoc, updateDoc, onSnapshot, limit 
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";
import { 
    getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";

// No cargar Firebase real si faltan las credenciales reales
const isConfigured = firebaseConfig.apiKey && firebaseConfig.apiKey !== "TU_API_KEY";

let db = null;
let auth = null;

if (isConfigured) {
    const app = initializeApp(firebaseConfig);
    
    // Nueva forma de habilitar persistencia en Firestore v10+
    db = initializeFirestore(app, {
        localCache: persistentLocalCache({})
    });
    
    auth = getAuth(app);
} else {
    console.error("Firebase no está configurado. Revisa firebase-config.js");
}

// -- SEDES --
const SEDES_INICIALES = [
    { nombre: "Oficina Provincial Málaga", codigoTerritorial: "29000", activa: true },
    { nombre: "Asamblea Local Benalmádena", codigoTerritorial: "29025", activa: true },
    { nombre: "Asamblea Local Torremolinos", codigoTerritorial: "29200", activa: true }
];

export async function inicializarSedes() {
    if (!isConfigured) return;
    const sedesRef = collection(db, "sedes");
    const snapshot = await getDocs(sedesRef);
    if (snapshot.empty) {
        console.log("Inicializando sedes base...");
        for (const sede of SEDES_INICIALES) {
            await setDoc(doc(sedesRef, sede.codigoTerritorial), sede);
        }
    }
}

export async function getSedes() {
    if (!isConfigured) return SEDES_INICIALES; // Placeholder
    const sedesRef = collection(db, "sedes");
    const q = query(sedesRef, where("activa", "==", true));
    const snapshot = await getDocs(q);
    const sedes = [];
    snapshot.forEach(doc => {
        sedes.push({ id: doc.id, ...doc.data() });
    });
    return sedes;
}

// -- CITAS --

/**
 * Guarda nuevas citas en lotes (máximo 500 operaciones por batch)
 * @param {Array} citasList Array de objetos cita generados
 */
export async function guardarCitasBulk(citasList) {
    if (!isConfigured) {
        console.warn("Firebase no configurado, simulación de guardado: ", citasList.length, " citas.");
        return new Promise(resolve => setTimeout(resolve, 1000));
    }

    const maxBatchSize = 500;
    const chunks = [];
    
    // Dividir en trozos de 500
    for (let i = 0; i < citasList.length; i += maxBatchSize) {
        chunks.push(citasList.slice(i, i + maxBatchSize));
    }

    let guardadasCount = 0;
    for (const chunk of chunks) {
        const batch = writeBatch(db);
        
        for (const cita of chunk) {
            // El id de documento puede ser el mismo código
            const docRef = doc(collection(db, "citas"), cita.codigo);
            // Firebase Timestamp base
            const timestamp = Timestamp.fromDate(cita.baseDate);
            
            const citaToSave = {
                codigo: cita.codigo,
                sede: cita.sede,
                fecha: cita.fechaStr,
                hora: cita.horaStrClean,
                fechaHoraTimestamp: timestamp,
                puesto: cita.puesto,
                estado: cita.estado
            };
            batch.set(docRef, citaToSave, { merge: true }); // Merge para no sobreescribir si ya existe
            guardadasCount++;
        }
        await batch.commit();
    }
    return guardadasCount;
}

/**
 * Consulta citas de una sede
 * @param {string} codigoSede 
 */
export async function getCitasPorSede(codigoSede) {
    if (!isConfigured) return [];
    // Para simplificar extraemos todo. En un caso real se paginaría o filtraría por fechas.
    const citasRef = collection(db, "citas");
    const q = query(citasRef, where("sede", "==", codigoSede)); // En un entorno de producción añadiríamos rangos de fecha
    const snapshot = await getDocs(q);
    const citas = [];
    snapshot.forEach(doc => citas.push(doc.data()));
    return citas;
}

export async function getCitasPorSedeYFecha(codigoSede, fechaStr) {
    if (!isConfigured) return [];
    
    const citasRef = collection(db, "citas");
    const q = query(citasRef, where("sede", "==", codigoSede), where("fecha", "==", fechaStr));
    const snapshot = await getDocs(q);
    
    const citas = [];
    snapshot.forEach(doc => citas.push(doc.data()));
    // Ordenar por hora y luego por puesto
    citas.sort((a, b) => {
        if(a.hora === b.hora) return a.puesto - b.puesto;
        return a.hora.localeCompare(b.hora);
    });
    return citas;
}

export async function actualizarCitaData(codigoCita, data) {
    if (!isConfigured) {
        console.log("Simulando update completo:", codigoCita, data);
        return;
    }
    const citaRef = doc(db, "citas", codigoCita);
    await updateDoc(citaRef, data);
}

export async function getCitasPorSedeYRango(codigoSede, fechaInicioYMD, fechaFinYMD) {
    if (!isConfigured) return [];
    
    const citasRef = collection(db, "citas");
    const q = query(
        citasRef, 
        where("sede", "==", codigoSede),
        where("fecha", ">=", fechaInicioYMD),
        where("fecha", "<=", fechaFinYMD)
    );
    const snapshot = await getDocs(q);
    
    const citas = [];
    snapshot.forEach(docSnap => citas.push({ id: docSnap.id, ...docSnap.data() }));
    return citas;
}

export async function borrarCitasBulk(citasPorBorrarIds) {
    if (!isConfigured) {
        console.warn("Firebase no const, simulando: ", citasPorBorrarIds.length, " citas a borrar.");
        return new Promise(resolve => setTimeout(resolve, 1000));
    }

    const maxBatchSize = 500;
    const chunks = [];
    for (let i = 0; i < citasPorBorrarIds.length; i += maxBatchSize) {
        chunks.push(citasPorBorrarIds.slice(i, i + maxBatchSize));
    }

    let borradasCount = 0;
    for (const chunk of chunks) {
        const batch = writeBatch(db);
        for (const id of chunk) {
            const docRef = doc(db, "citas", id);
            batch.delete(docRef);
            borradasCount++;
        }
        await batch.commit();
    }
    return borradasCount;
}

// -- PERFILES DE USUARIO --
export async function getUsuarioData(uid) {
    if (!isConfigured) return null;
    const userRef = doc(db, "usuarios", uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
        return snap.data();
    }
    return null;
}

export async function getTodosLosUsuarios() {
    if (!isConfigured) return [];
    const usuarios = [];
    const snap = await getDocs(collection(db, "usuarios"));
    snap.forEach(doc => {
        usuarios.push({ ...doc.data(), uid: doc.id });
    });
    return usuarios;
}

export async function guardarPerfilUsuario(uid, data) {
    await setDoc(doc(db, "usuarios", uid), data);
}

async function getCitasTerminadas() {
    if (!isConfigured) return [];
    const citasRef = collection(db, "citas");
    // Buscamos tanto en minúscula como con la primera en mayúscula por si acaso
    const q = query(
        citasRef, 
        where("estado", "in", ["terminada", "Terminada"]),
        limit(200)
    );
    const snapshot = await getDocs(q);
    const citas = [];
    snapshot.forEach(docSnap => citas.push({ id: docSnap.id, ...docSnap.data() }));
    return citas;
}

export async function borrarUsuarioData(uid) {
    const userRef = doc(db, "usuarios", uid);
    await writeBatch(db).delete(userRef).commit();
}

export function listenCitasTerminadas(sedeId, callback) {
    if (!isConfigured || !sedeId) return () => {};
    const citasRef = collection(db, "citas");
    const q = query(
        citasRef, 
        where("sede", "==", sedeId),
        where("estado", "in", ["terminada", "Terminada"]),
        limit(200)
    );
    return onSnapshot(q, (snapshot) => {
        const citas = [];
        snapshot.forEach(docSnap => citas.push({ id: docSnap.id, ...docSnap.data() }));
        callback(citas);
    });
}

export async function getHistoricoGrabaciones(sedeId, fechaInicio, fechaFin) {
    if (!isConfigured || !sedeId) return [];
    const citasRef = collection(db, "citas");
    const q = query(
        citasRef,
        where("sede", "==", sedeId),
        where("fecha", ">=", fechaInicio),
        where("fecha", "<=", fechaFin),
        where("estadoGrabacion", "==", "Grabada")
    );
    
    const snapshot = await getDocs(q);
    const citas = [];
    snapshot.forEach(docSnap => citas.push({ id: docSnap.id, ...docSnap.data() }));
    return citas;
}

export async function buscarCitasHistorico(sedeId, term) {
    if (!isConfigured || !sedeId || term.length < 3) return [];
    const citasRef = collection(db, "citas");
    
    // Simplificamos: buscamos coincidencia exacta en código o códigoUsuario
    const q1 = query(citasRef, 
        where("sede", "==", sedeId), 
        where("codigo", "==", term),
        where("estadoGrabacion", "==", "Grabada")
    );
    const q2 = query(citasRef, 
        where("sede", "==", sedeId), 
        where("codigoUsuario", "==", term),
        where("estadoGrabacion", "==", "Grabada")
    );

    const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    const results = new Map();
    s1.forEach(d => results.set(d.id, {id: d.id, ...d.data()}));
    s2.forEach(d => results.set(d.id, {id: d.id, ...d.data()}));
    
    return Array.from(results.values());
}

export { db, auth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, firebaseConfig, initializeApp, getAuth, getCitasTerminadas };
