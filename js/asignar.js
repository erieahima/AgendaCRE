import { buscarCitasParaAsignar } from './firebase.js';
import { formatearFechaHumana, formatearHoraHumana } from './utils.js';
import { cacheGet, cacheSet, cachePatchItem } from './cache.js';

// Caché de 10 minutos para la carga masiva de citas de la sede.
// Cubre TODOS los días (no solo hoy), igual que antes.
const ASIGNAR_TTL = 10 * 60 * 1000;

let lastSedeId = null;
let appStateRef = null;

function getCacheKey(sedeId) {
    return `asignar_${sedeId}`;
}

/** Devuelve el array de citas desde caché o carga desde Firestore si ha expirado. */
async function getOrLoadCitas(sedeId) {
    const key = getCacheKey(sedeId);
    const cached = cacheGet(key);
    if (cached) return cached;

    const citas = await buscarCitasParaAsignar(sedeId); // sin term → carga hasta 10.000 citas de todos los días
    cacheSet(key, citas, ASIGNAR_TTL);
    return citas;
}

export function setupAsignar(appState) {
    appStateRef = appState;
    const searchInput = document.getElementById('asignar-search-input');
    const resultsContainer = document.getElementById('asignar-results');

    if (!searchInput) return;

    let searchTimeout = null;
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.trim().toUpperCase();

        if (term.length < 3) {
            resultsContainer.innerHTML = '';
            return;
        }

        clearTimeout(searchTimeout);
        // Debounce aumentado a 600ms para reducir aún más las consultas
        searchTimeout = setTimeout(async () => {
            try {
                const sedeId = appState.sedeActivaId;

                // 1. Obtener caché de todos los días (sin repetir la carga masiva)
                const allCitas = await getOrLoadCitas(sedeId);

                // 2. Filtrado local (cubre TODOS los días ya en memoria)
                const locales = allCitas.filter(cita => {
                    const code = (cita.codigo || "").toUpperCase();
                    const doc = (cita.documento || cita.iniciales || "").toUpperCase();
                    return code.includes(term) || doc.includes(term);
                });

                // 3. Solo consultar el servidor si hay muy pocos resultados locales
                //    y el término parece suficientemente específico (> 3 chars)
                let finales = locales;
                if (locales.length < 3 && term.length > 3) {
                    const globales = await buscarCitasParaAsignar(sedeId, term);
                    const mapRes = new Map();
                    locales.forEach(c => mapRes.set(c.id || c.codigo, c));
                    globales.forEach(c => mapRes.set(c.id || c.codigo, c));
                    finales = Array.from(mapRes.values());
                }

                // 4. Ordenar por fecha desc
                finales.sort((a, b) => {
                    const fA = a.fecha || '00000000';
                    const fB = b.fecha || '00000000';
                    if (fA !== fB) return fB.localeCompare(fA);
                    return (b.hora || '00:00').localeCompare(a.hora || '00:00');
                });

                renderResults(finales.slice(0, 40));
            } catch (error) {
                console.error("Error en la búsqueda:", error);
                renderResults([]);
            }
        }, 600);
    });

    // Al cambiar de sede, la caché del módulo apunta a la nueva sede automáticamente
    // (la key incluye sedeId). No hay que borrar nada manualmente.
    window.addEventListener('sedeChanged', () => {
        // Solo limpiamos la búsqueda visual
        searchInput.value = '';
        resultsContainer.innerHTML = '';
    });

    // Al guardar una cita desde el modal: actualizar el elemento en caché (patch)
    // en lugar de recargar los 10.000 docs.
    window.addEventListener('citaActualizada', async (e) => {
        const { id, patch } = e.detail || {};
        if (id && patch && appState.sedeActivaId) {
            cachePatchItem(getCacheKey(appState.sedeActivaId), id, patch);
        }

        // Refrescar resultados visibles con los datos actualizados del caché
        const term = searchInput.value.trim().toUpperCase();
        if (term.length >= 3) {
            const allCitas = await getOrLoadCitas(appState.sedeActivaId);
            const locales = allCitas.filter(cita => {
                const code = (cita.codigo || "").toUpperCase();
                const doc = (cita.documento || cita.iniciales || "").toUpperCase();
                return code.includes(term) || doc.includes(term);
            });
            locales.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
            renderResults(locales.slice(0, 40));
        }
    });
}

function renderResults(citas) {
    const resultsContainer = document.getElementById('asignar-results');
    resultsContainer.innerHTML = '';

    if (citas.length === 0) {
        resultsContainer.innerHTML = '<p class="text-muted">No se encontraron citas con ese código.</p>';
        return;
    }

    citas.forEach(cita => {
        const card = document.createElement('div');
        card.className = `card-resultado ${cita.estado || 'pendiente'}`;
        card.style.cursor = 'pointer';
        card.style.padding = '1rem';
        card.style.borderRadius = 'var(--radius-md)';
        card.style.border = '1px solid var(--border)';
        card.style.transition = 'transform 0.2s';
        
        aplicarEstiloEstado(card, cita.estado);

        card.innerHTML = `
            ${cita.asistencia ? '<div class="asistencia-dot-absolute" style="top:5px; right:5px;"></div>' : ''}
            <div style="display:flex; justify-content:space-between; align-items:start;">
                <strong>${cita.codigo}</strong>
                <span class="badge ${cita.estado || 'pendiente'}">${(cita.estado || 'pendiente').toUpperCase()}</span>
            </div>
            <div class="mt-2" style="font-size: 0.9rem;">
                <div>🗓️ ${formatearFechaHumana(cita.fecha)}</div>
                <div>🕒 ${formatearHoraHumana(cita.hora)}</div>
                ${(cita.documento || cita.iniciales) ? `<div style="color:var(--primary); font-weight:600;">👤 Doc: ${cita.documento || cita.iniciales}</div>` : '<div style="color:var(--text-muted);">❌ Sin asignar</div>'}
            </div>
        `;

        card.addEventListener('mouseenter', () => card.style.transform = 'translateY(-3px)');
        card.addEventListener('mouseleave', () => card.style.transform = 'translateY(0)');
        
        card.addEventListener('click', () => {
            if (window.openCitaDesdeAsignar) {
                window.openCitaDesdeAsignar(cita);
            }
        });

        resultsContainer.appendChild(card);
    });
}

function aplicarEstiloEstado(el, estado) {
    switch(estado) {
        case 'asignada':
            el.style.backgroundColor = '#eff6ff';
            el.style.borderLeft = '6px solid #3b82f6';
            break;
        case 'terminada':
            el.style.backgroundColor = '#f0fdf4';
            el.style.borderLeft = '6px solid #22c55e';
            break;
        case 'anulada':
            el.style.backgroundColor = '#fef2f2';
            el.style.borderLeft = '6px solid #ef4444';
            break;
        default:
            el.style.backgroundColor = '#ffffff';
            el.style.borderLeft = '6px solid #d1d5db';
    }
}
