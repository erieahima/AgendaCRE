// js/firebase.js
import { firebaseConfig } from '../firebase-config.js';

// No cargar Firebase real si faltan las credenciales reales
const isConfigured = firebaseConfig.apiKey && firebaseConfig.apiKey !== "TU_API_KEY";

let db = null;
let firestore = null; // Guardar import module referencias

if (isConfigured) {
    // Inicializar
    const app = window.firebaseApp(firebaseConfig);
    db = window.getFirestore(app);
} else {
    console.error("Firebase no está configurado. Revisa firebase-config.js");
}

// Dependencias de firestore modulares necesarias. Se deben importar de la web.
import { collection, doc, setDoc, getDocs, getDoc, query, where, writeBatch, Timestamp, addDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

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
