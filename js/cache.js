// js/cache.js
// Módulo central de caché en memoria con TTL configurable.
// Actúa como capa de datos entre los módulos y Firestore,
// evitando lecturas redundantes cuando los datos ya están en memoria.

const _store = new Map(); // key → { data, expiresAt }

/**
 * Lee una entrada del caché.
 * @returns {any|null} Los datos almacenados, o null si no existen o han expirado.
 */
export function cacheGet(key) {
    const entry = _store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        _store.delete(key);
        return null;
    }
    return entry.data;
}

/**
 * Escribe una entrada en el caché.
 * @param {string} key   Clave de la entrada
 * @param {any} data     Datos a almacenar
 * @param {number} ttlMs Tiempo de vida en milisegundos (por defecto 5 minutos)
 */
export function cacheSet(key, data, ttlMs = 5 * 60 * 1000) {
    _store.set(key, {
        data,
        expiresAt: Date.now() + ttlMs
    });
}

/**
 * Invalida (elimina) una entrada específica del caché.
 */
export function cacheInvalidate(key) {
    _store.delete(key);
}

/**
 * Invalida todas las entradas cuya clave empiece por el prefijo dado.
 * Útil para invalidar en bloque (ej. todas las entradas de una sede).
 */
export function cacheInvalidatePrefix(prefix) {
    for (const key of _store.keys()) {
        if (key.startsWith(prefix)) {
            _store.delete(key);
        }
    }
}

/**
 * Actualiza un único elemento dentro de un array cacheado,
 * evitando invalidar toda la entrada. Útil tras editar una cita.
 * @param {string} key     Clave exacta de la entrada en caché
 * @param {string} itemId  ID del elemento a actualizar (id o codigo)
 * @param {object} patch   Campos a sobreescribir
 */
export function cachePatchItem(key, itemId, patch) {
    const entry = _store.get(key);
    if (!entry || Date.now() > entry.expiresAt) return;
    if (!Array.isArray(entry.data)) return;

    const idx = entry.data.findIndex(c => (c.id || c.codigo) === itemId);
    if (idx !== -1) {
        entry.data[idx] = { ...entry.data[idx], ...patch };
    }
}

/**
 * Limpia todo el caché. Útil al cerrar sesión o cambiar de usuario.
 */
export function cacheClear() {
    _store.clear();
}
