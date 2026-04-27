// js/firebase.js
import { firebaseConfig } from '../firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import { 
    initializeFirestore, persistentLocalCache, collection, doc, setDoc, getDocs, getDoc, query, where, writeBatch, Timestamp, addDoc, updateDoc, onSnapshot, limit, orderBy, startAt, endAt, getCountFromServer
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
    { nombre: "Oficina Provincial Málaga", codigoTerritorial: "29000", activa: true, hasQueuingSystem: true },
    { nombre: "Asamblea Local Benalmádena", codigoTerritorial: "29025", activa: true, hasQueuingSystem: true },
    { nombre: "Asamblea Local Torremolinos", codigoTerritorial: "29200", activa: true, hasQueuingSystem: true }
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
    if (!isConfigured) return SEDES_INICIALES;
    const sedesRef = collection(db, "sedes");
    const q = query(sedesRef, where("activa", "==", true));
    const snapshot = await getDocs(q);
    const sedes = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        // Migración al vuelo: Si no tiene el flag, lo ponemos a true por defecto
        if (data.hasQueuingSystem === undefined) data.hasQueuingSystem = true;
        sedes.push({ id: doc.id, ...data });
    });
    return sedes;
}

export async function getAllSedes() {
    if (!isConfigured) return SEDES_INICIALES;
    const sedesRef = collection(db, "sedes");
    const snapshot = await getDocs(sedesRef);
    const sedes = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.hasQueuingSystem === undefined) data.hasQueuingSystem = true;
        sedes.push({ id: doc.id, ...data });
    });
    return sedes;
}

export async function getSedeById(id) {
    if (!isConfigured) return SEDES_INICIALES.find(s => s.codigoTerritorial === id);
    const docRef = doc(db, "sedes", id);
    const snap = await getDoc(docRef);
    return snap.exists() ? snap.data() : null;
}

export async function guardarSede(id, data) {
    const docRef = doc(db, "sedes", id);
    await setDoc(docRef, data, { merge: true });
}

export async function borrarSede(id) {
    await deleteDoc(doc(db, "sedes", id));
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
                sufijo: cita.codigo.slice(-3), // Guardar sufijo para búsqueda rápida
                sede: cita.sede,
                fecha: cita.fechaStr,
                hora: cita.horaStrClean,
                fechaHoraTimestamp: timestamp,
                puesto: cita.puesto,
                estado: cita.estado,
                asistencia: false,
                llamada: null
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

/**
 * OPTIMIZACIÓN (v3.20.3): Obtiene estadísticas usando consultas de agregación (getCountFromServer)
 * Esto es mucho más barato y rápido que descargar todos los documentos.
 */
export async function getStatsCitas(codigoSede, fechaInicio, fechaFin) {
    if (!isConfigured) return { total: 0, asignadas: 0, atendidas: 0, grabadas: 0, incidencias: 0 };
    
    const citasRef = collection(db, "citas");
    const baseQuery = query(citasRef, 
        where("sede", "==", codigoSede),
        where("fecha", ">=", fechaInicio),
        where("fecha", "<=", fechaFin)
    );

    // Lanzamos las peticiones de conteo en paralelo
    const [
        snapTotal,
        snapAsignadas,
        snapAtendidas,
        snapGrabadas,
        snapIncidencias
    ] = await Promise.all([
        getCountFromServer(baseQuery),
        getCountFromServer(query(baseQuery, where("estado", "==", "asignada"))),
        getCountFromServer(query(baseQuery, where("estado", "==", "terminada"))),
        getCountFromServer(query(baseQuery, where("estadoGrabacion", "==", "Grabada"))),
        getCountFromServer(query(baseQuery, where("estadoGrabacion", "==", "Incidencia")))
    ]);

    return {
        total: snapTotal.data().count,
        asignadas: snapAsignadas.data().count,
        atendidas: snapAtendidas.data().count,
        grabadas: snapGrabadas.data().count,
        incidencias: snapIncidencias.data().count
    };
}

export async function getCitasPorSedeYFecha(codigoSede, fechaStr) {
    if (!isConfigured) return [];
    
    const citasRef = collection(db, "citas");
    const q = query(citasRef, where("sede", "==", codigoSede), where("fecha", "==", fechaStr));
    const snapshot = await getDocs(q);
    
    const citas = [];
    snapshot.forEach(docSnap => citas.push({ id: docSnap.id, ...docSnap.data() }));
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

export async function resetLlamadasSede(sedeId) {
    if (!isConfigured) return;
    const citasRef = collection(db, "citas");
    const q = query(citasRef, where("sede", "==", sedeId), where("llamada", "!=", null));
    const snap = await getDocs(q);
    
    if (snap.empty) return;

    const docs = [];
    snap.forEach(docSnap => docs.push(docSnap.ref));

    // Chunk size 500 (Firestore limit)
    const chunkSize = 500;
    for (let i = 0; i < docs.length; i += chunkSize) {
        const batch = writeBatch(db);
        const chunk = docs.slice(i, i + chunkSize);
        chunk.forEach(ref => {
            batch.update(ref, { llamada: null });
        });
        await batch.commit();
    }
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
        where("estadoGrabacion", "in", ["Grabada", "Incidencia"])
    );
    
    const snapshot = await getDocs(q);
    const citas = [];
    snapshot.forEach(docSnap => citas.push({ id: docSnap.id, ...docSnap.data() }));
    return citas;
}

export async function buscarCitasHistorico(sedeId, term) {
    if (!isConfigured || term.length < 3) return [];
    
    // NOTA: Para buscar por prefijo (starts with) en Firestore usamos orderBy + startAt + endAt
    const termClean = term.trim().toUpperCase();
    const citasRef = collection(db, "citas");
    
    // Buscamos por prefijo de Código de Cita + Grabada/Incidencia
    const q1 = query(citasRef, 
        where("estadoGrabacion", "in", ["Grabada", "Incidencia"]),
        orderBy("codigo"), 
        startAt(termClean), 
        endAt(termClean + "\uf8ff"), 
        limit(20)
    );
    
    // Buscamos por prefijo de Código de Usuario + Grabada/Incidencia
    const q2 = query(citasRef, 
        where("estadoGrabacion", "in", ["Grabada", "Incidencia"]),
        orderBy("codigoUsuario"), 
        startAt(termClean), 
        endAt(termClean + "\uf8ff"), 
        limit(20)
    );

    const results = new Map();
    try {
        const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
        s1.forEach(d => results.set(d.id, {id: d.id, ...d.data()}));
        s2.forEach(d => results.set(d.id, {id: d.id, ...d.data()}));
    } catch (e) {
        console.error("Error en búsqueda por prefijo:", e);
        // Fallback a búsqueda exacta si hay problemas de índices de ordenación
        const q3 = query(citasRef, where("codigoUsuario", "==", termClean), limit(20));
        const s3 = await getDocs(q3);
        s3.forEach(d => results.set(d.id, {id: d.id, ...d.data()}));
    }
    
    return Array.from(results.values());
}

export async function buscarCitasParaAsignar(sedeId, term = "") {
    if (!isConfigured || !sedeId) return [];
    
    const citasRef = collection(db, "citas");
    const termClean = term.trim().toUpperCase();

    // ESTRATEGIA A: Búsqueda por SUFIJO (Los 3 caracteres finales)
    if (termClean.length === 3) {
        // Buscamos por sufijo en TODAS las citas y filtramos por sede en el cliente
        // Esto evita requerir índices compuestos complejos y es rápido porque hay pocos duplicados de sufijo
        const qSufijo = query(citasRef, 
            where("sufijo", "==", termClean),
            limit(100)
        );
        try {
            const snap = await getDocs(qSufijo);
            const results = [];
            snap.forEach(d => {
                const data = d.data();
                if (data.sede === sedeId) {
                    results.push({id: d.id, ...data});
                }
            });
            // Si encontramos resultados por sufijo, los devolvemos directamente
            if (results.length > 0) return results;
        } catch (e) {
            console.error("Error buscando por sufijo:", e);
        }
    }

    // ESTRATEGIA B: Búsqueda por PREFIJO (Fecha YYYYMMDD o Código Completo)
    if (termClean.length > 3) {
        let prefix = termClean;
        if (!prefix.startsWith("REG")) {
            // Si el usuario escribe una fecha (ej 20260425), anteponemos REG+SEDE para que sea un prefijo válido
            prefix = `REG${sedeId}${termClean}`;
        } else {
            // Si ya escribe REG..., validamos que pertenezca a su sede
            if (!prefix.startsWith(`REG${sedeId}`)) return []; 
        }

        const qPrefix = query(citasRef, 
            orderBy("codigo"), 
            startAt(prefix), 
            endAt(prefix + "\uf8ff"),
            limit(100)
        );

        try {
            const snap = await getDocs(qPrefix);
            const results = [];
            snap.forEach(d => results.push({id: d.id, ...d.data()}));
            return results;
        } catch (e) {
            console.error("Error buscando por prefijo:", e);
        }
    }

    // ESTRATEGIA C: Carga de proximidad (Solo si NO hay término de búsqueda)
    // Se usa para cargar el caché inicial de forma que el filtrado local sea instantáneo
    if (!term) {
        const q = query(citasRef, 
            where("sede", "==", sedeId),
            orderBy("fecha", "desc"),
            orderBy("hora", "desc"),
            limit(10000) 
        );

        const results = [];
        try {
            const snap = await getDocs(q);
            snap.forEach(d => results.push({id: d.id, ...d.data()}));
        } catch (e) {
            console.error("Error cargando citas para asignar:", e);
        }
        return results;
        return results;
    }

    return []; // Si hay término pero no hubo resultados en las estrategias A o B
}

// -- CONFIGURACION DE PUESTO --

/**
 * Obtiene la configuración de puesto de un usuario
 */
/**
 * Obtiene la configuración de puesto de un usuario (Local a este navegador)
 */
export async function getPuestoConfig(uid) {
    const key = `puestoConfig_${uid}`;
    const local = localStorage.getItem(key);
    if (local) {
        return JSON.parse(local);
    }
    return { nombre: "", activo: false };
}

/**
 * Guarda la configuración de puesto de un usuario (Local a este navegador)
 */
export async function guardarPuestoConfig(uid, config) {
    const key = `puestoConfig_${uid}`;
    localStorage.setItem(key, JSON.stringify(config));
}

// -- LOGICA DE LLAMADAS --

/**
 * Busca la cita más antigua de hoy que ha marcado asistencia y no ha sido llamada
 */
export async function getNextCitaParaLlamar(sedeId, fechaStr) {
    if (!isConfigured) return null;
    
    // La prioridad es: 
    // 1. Que sean de hoy
    // 2. Que hayan marcado asistencia (llegada)
    // 3. Que NO hayan sido llamados aún
    // 4. Ordenados por HORA de la cita (prioridad por antigüedad de cita, no de llegada)
    const citasRef = collection(db, "citas");
    const q = query(citasRef, 
        where("sede", "==", sedeId),
        where("fecha", "==", fechaStr),
        where("asistencia", "==", true),
        where("llamada", "==", null),
        orderBy("fechaHoraTimestamp", "asc"),
        limit(1)
    );
    
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    
    const docSnap = snapshot.docs[0];
    return { id: docSnap.id, ...docSnap.data() };
}

/**
 * Escucha las últimas llamadas en tiempo real
 */
export function listenLlamadasRecientes(sedeId, callback) {
    if (!isConfigured || !sedeId) return () => {};
    
    const citasRef = collection(db, "citas");
    // Filtramos por sede y ordenamos por el momento de la LLAMADA (timestamp interno) descendentemente.
    // Quitamos el filtro de "fecha == hoy" para que si se llama a una cita de otro día, aparezca en la pantalla.
    const q = query(
        citasRef, 
        where("sede", "==", sedeId),
        orderBy("llamada.timestamp", "desc"),
        limit(15)
    );
    
    return onSnapshot(q, (snapshot) => {
        const llamadas = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            // Solo incluimos las que realmente tienen una llamada activa
            if (data.llamada && data.llamada.timestamp) {
                llamadas.push({ id: docSnap.id, ...data });
            }
        });
        callback(llamadas);
    }, (error) => {
        console.error("Error en listenLlamadasRecientes:", error);
    });
}

/**
 * Escucha la lista de espera (asistentes no llamados)
 */
export function listenListaEspera(sedeId, callback) {
    if (!isConfigured || !sedeId) return () => {};
    
    const citasRef = collection(db, "citas");
    const d = new Date();
    const hoy = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    
    const q = query(
        citasRef, 
        where("sede", "==", sedeId),
        where("fecha", "==", hoy),
        where("asistencia", "==", true),
        where("llamada", "==", null),
        orderBy("fechaHoraTimestamp", "asc")
    );
    
    return onSnapshot(q, (snapshot) => {
        const lista = [];
        snapshot.forEach(docSnap => {
            lista.push({ id: docSnap.id, ...docSnap.data() });
        });
        callback(lista);
    });
}

export { db, auth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, firebaseConfig, initializeApp, getAuth, getCitasTerminadas, Timestamp };
