// js/firebase.js v3.30.0
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

// -- CACHÉ DE MÓDULO: SEDES (TTL 30 min) --
// Evita releer la colección 'sedes' en cada login y cambio de vista.
// Se invalida explícitamente desde tablasMaestras.js cuando cambia alguna sede.
const SEDES_CACHE_TTL = 30 * 60 * 1000;
let _sedesActivasCache = null;
let _sedesActivasExp = 0;
let _todasSedesCache = null;
let _todasSedesExp = 0;

export function invalidarCacheSedes() {
    _sedesActivasCache = null;
    _todasSedesCache = null;
}

export async function getSedes() {
    if (!isConfigured) return SEDES_INICIALES;
    if (_sedesActivasCache && Date.now() < _sedesActivasExp) return _sedesActivasCache;
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
    _sedesActivasCache = sedes;
    _sedesActivasExp = Date.now() + SEDES_CACHE_TTL;
    return sedes;
}

export async function getAllSedes() {
    if (!isConfigured) return SEDES_INICIALES;
    if (_todasSedesCache && Date.now() < _todasSedesExp) return _todasSedesCache;
    const sedesRef = collection(db, "sedes");
    const snapshot = await getDocs(sedesRef);
    const sedes = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.hasQueuingSystem === undefined) data.hasQueuingSystem = true;
        sedes.push({ id: doc.id, ...data });
    });
    _todasSedesCache = sedes;
    _todasSedesExp = Date.now() + SEDES_CACHE_TTL;
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
        getCountFromServer(query(baseQuery, where("estado", "in", ["grabada", "incidencia"]))),
        getCountFromServer(query(baseQuery, where("estado", "==", "grabada"))),
        getCountFromServer(query(baseQuery, where("estado", "==", "incidencia")))
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

export async function actualizarCitaData(idDocumento, data) {
    if (!isConfigured) {
        console.log("Simulando update completo:", idDocumento, data);
        return;
    }
    if (!idDocumento) throw new Error("ID de documento no proporcionado");
    
    // V.3.23.2: Limpiar campos undefined para evitar errores de Firestore
    const cleanData = {};
    Object.keys(data).forEach(key => {
        if (data[key] !== undefined) cleanData[key] = data[key];
    });

    const citaRef = doc(db, "citas", idDocumento);
    await updateDoc(citaRef, cleanData);
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

// -- CACHÉ DE MÓDULO: USUARIOS (TTL 10 min) --
// Evita releer toda la colección de usuarios en cada visita al panel.
// Se invalida explícitamente desde usuarios.js cuando se crea o borra un usuario.
const USUARIOS_CACHE_TTL = 10 * 60 * 1000;
let _usuariosCache = null;
let _usuariosExp = 0;

export function invalidarCacheUsuarios() {
    _usuariosCache = null;
}

export async function getTodosLosUsuarios() {
    if (!isConfigured) return [];
    if (_usuariosCache && Date.now() < _usuariosExp) return _usuariosCache;
    const usuarios = [];
    const snap = await getDocs(collection(db, "usuarios"));
    snap.forEach(doc => {
        usuarios.push({ ...doc.data(), uid: doc.id });
    });
    _usuariosCache = usuarios;
    _usuariosExp = Date.now() + USUARIOS_CACHE_TTL;
    return usuarios;
}

export async function guardarPerfilUsuario(uid, data) {
    await setDoc(doc(db, "usuarios", uid), data);
}

export async function borrarUsuarioData(uid) {
    const userRef = doc(db, "usuarios", uid);
    await writeBatch(db).delete(userRef).commit();
}

// NOTA: listenCitasTerminadas() y getCitasTerminadas() eliminadas en v3.28.2
// (módulo de grabaciones eliminado en v3.28.0, funciones ya no tienen importador)

export async function getHistoricoGrabaciones(sedeId, fechaInicio, fechaFin) {
    if (!isConfigured || !sedeId) return [];
    const citasRef = collection(db, "citas");
    const q = query(
        citasRef,
        where("sede", "==", sedeId),
        where("fecha", ">=", fechaInicio),
        where("fecha", "<=", fechaFin),
        where("estado", "in", ["grabada", "incidencia"])
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
    
    // Buscamos por prefijo de Código de Cita + estado grabada/incidencia
    const q1 = query(citasRef, 
        where("sede", "==", sedeId),
        where("estado", "in", ["grabada", "incidencia"]),
        orderBy("codigo"), 
        startAt(termClean), 
        endAt(termClean + "\uf8ff"), 
        limit(20)
    );
    
    // Buscamos por prefijo de Código de Usuario + estado grabada/incidencia
    const q2 = query(citasRef, 
        where("sede", "==", sedeId),
        where("estado", "in", ["grabada", "incidencia"]),
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
        try {
            const q3 = query(citasRef, 
                where("sede", "==", sedeId),
                where("codigoUsuario", "==", termClean), 
                limit(20)
            );
            const s3 = await getDocs(q3);
            s3.forEach(d => {
                const data = d.data();
                if (["grabada", "incidencia"].includes(data.estado)) results.set(d.id, {id: d.id, ...data});
            });
            
            // Fallback para código exacto
            const docRef = doc(db, "citas", termClean);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists() && docSnap.data().sede === sedeId && ["grabada", "incidencia"].includes(docSnap.data().estado)) {
                results.set(docSnap.id, {id: docSnap.id, ...docSnap.data()});
            }
        } catch(e2) { console.error("Error en fallback:", e2); }
    }
    
    return Array.from(results.values());
}

export async function buscarCitasParaAsignar(sedeId, term = "") {
    if (!isConfigured || !sedeId) return [];

    // v3.28.3: Sin término → no hay carga masiva. Se devuelve array vacío.
    if (!term) return [];

    const citasRef = collection(db, "citas");
    const termClean = term.trim().toUpperCase();
    const isNumeric = /^\d+$/.test(termClean);
    const results = new Map();

    // ESTRATEGIA A: Búsqueda por SUFIJO exacto (3 caracteres finales del código)
    if (termClean.length === 3 && !isNumeric) {
        const qSufijo = query(citasRef,
            where("sede", "==", sedeId),
            where("sufijo", "==", termClean),
            limit(100)
        );
        try {
            const snap = await getDocs(qSufijo);
            snap.forEach(d => results.set(d.id, { id: d.id, ...d.data() }));
            if (results.size > 0) return Array.from(results.values());
        } catch (e) { console.error("Error buscando por sufijo:", e); }
    }

    // ESTRATEGIA B: Búsqueda por PREFIJO de código (fecha YYYYMMDD o código completo)
    if (termClean.length > 3 && !isNumeric) {
        let prefix = termClean;
        if (!prefix.startsWith("REG")) {
            prefix = `REG${sedeId}${termClean}`;
        } else {
            if (!prefix.startsWith(`REG${sedeId}`)) return [];
        }
        try {
            const qPrefix = query(citasRef,
                where("sede", "==", sedeId),
                orderBy("codigo"),
                startAt(prefix),
                endAt(prefix + "\uf8ff"),
                limit(100)
            );
            const snap = await getDocs(qPrefix);
            snap.forEach(d => results.set(d.id, { id: d.id, ...d.data() }));
            if (results.size > 0) return Array.from(results.values());
        } catch (e) { 
            console.error("Error buscando por prefijo código, usando fallback:", e);
            // Fallback si falta índice: Búsqueda exacta si es código largo, o búsqueda por fecha si es fecha
            if (prefix.length >= 18) {
                try {
                    const docSnap = await getDoc(doc(db, "citas", prefix));
                    if (docSnap.exists() && docSnap.data().sede === sedeId) {
                        results.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
                    }
                } catch(e2) { console.error("Error en fallback exacto:", e2); }
            } else if (prefix.length >= 16) {
                const fechaStr = prefix.substring(8, 16);
                try {
                    const qFecha = query(citasRef,
                        where("sede", "==", sedeId),
                        where("fecha", "==", fechaStr),
                        limit(100)
                    );
                    const snap = await getDocs(qFecha);
                    snap.forEach(d => {
                        if (d.data().codigo.startsWith(prefix)) {
                            results.set(d.id, { id: d.id, ...d.data() });
                        }
                    });
                } catch(e3) { console.error("Error en fallback fecha:", e3); }
            }
            if (results.size > 0) return Array.from(results.values());
        }
    }

    // ESTRATEGIA D: Búsqueda por NÚMERO DE DOCUMENTO (cuando el término es numérico ≥ 4 dígitos)
    // Requiere índice compuesto (sede ASC, documento ASC) en Firestore
    if (isNumeric && termClean.length >= 4) {
        try {
            const qDoc = query(citasRef,
                where("sede", "==", sedeId),
                orderBy("documento"),
                startAt(termClean),
                endAt(termClean + "\uf8ff"),
                limit(20)
            );
            const snap = await getDocs(qDoc);
            snap.forEach(d => results.set(d.id, { id: d.id, ...d.data() }));
        } catch (e) {
            // Fallback: búsqueda exacta si falta el índice compuesto
            try {
                const qExact = query(citasRef,
                    where("sede", "==", sedeId),
                    where("documento", "==", termClean),
                    limit(20)
                );
                const snap = await getDocs(qExact);
                snap.forEach(d => results.set(d.id, { id: d.id, ...d.data() }));
            } catch (e2) { console.error("Error buscando por documento:", e2); }
        }
    }

    return Array.from(results.values());
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

export { db, auth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, firebaseConfig, initializeApp, getAuth, Timestamp, invalidarCacheSedes, invalidarCacheUsuarios };
