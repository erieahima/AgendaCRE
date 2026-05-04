// js/asignar.js  v3.29.17
// Búsqueda 100% bajo demanda: sin precarga masiva.
// Cada término buscado se cachea 10 min. No hay lectura al entrar al módulo.
import { buscarCitasParaAsignar } from './firebase.js';
import { formatearFechaHumana, formatearHoraHumana } from './utils.js';
import { cacheGet, cacheSet, cacheInvalidatePrefix, cacheInvalidate } from './cache.js';

const ASIGNAR_TTL = 10 * 60 * 1000; // 10 minutos por término

let appStateRef = null;

function getTermKey(sedeId, term) {
    return `asignar_${sedeId}_${term}`;
}

/** Busca citas: primero en caché local por término, luego en Firestore. */
async function searchCitas(sedeId, term) {
    if (!term || term.length < 3) return [];
    const key = getTermKey(sedeId, term);
    const cached = cacheGet(key);
    if (cached) return cached;

    const results = await buscarCitasParaAsignar(sedeId, term);
    cacheSet(key, results, ASIGNAR_TTL);
    return results;
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
        searchTimeout = setTimeout(async () => {
            try {
                const citas = await searchCitas(appState.sedeActivaId, term);

                citas.sort((a, b) => {
                    const fA = a.fecha || '00000000';
                    const fB = b.fecha || '00000000';
                    if (fA !== fB) return fB.localeCompare(fA);
                    return (b.hora || '00:00').localeCompare(a.hora || '00:00');
                });

                renderResults(citas.slice(0, 40));
            } catch (err) {
                console.error('Error en búsqueda asignar:', err);
                renderResults([]);
            }
        }, 600);
    });

    // Al cambiar de sede: limpiar UI y caché de búsquedas de la sede anterior
    window.addEventListener('sedeChanged', () => {
        searchInput.value = '';
        resultsContainer.innerHTML = '';
        // No invalidamos la caché de la nueva sede: si ya se buscó algo, se reutiliza
    });

    // Al guardar una cita desde el modal:
    // - Invalidar caché de búsquedas del módulo Asignar (la próxima búsqueda re-consulta)
    // - Invalidar caché del calendario para ese día
    window.addEventListener('citaActualizada', async (e) => {
        const { patch } = e.detail || {};
        if (appState.sedeActivaId) {
            cacheInvalidatePrefix(`asignar_${appState.sedeActivaId}_`);
            if (patch?.fecha) {
                cacheInvalidate(`cal_dia_${appState.sedeActivaId}_${patch.fecha}`);
            }
        }

        // Refrescar resultados visibles con datos frescos
        const term = searchInput.value.trim().toUpperCase();
        if (term.length >= 3) {
            try {
                const citas = await searchCitas(appState.sedeActivaId, term);
                citas.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
                renderResults(citas.slice(0, 40));
            } catch (_) { /* silencioso */ }
        }
    });
}

function renderResults(citas) {
    const resultsContainer = document.getElementById('asignar-results');
    resultsContainer.innerHTML = '';

    if (citas.length === 0) {
        resultsContainer.innerHTML = '<p class="text-muted">No se encontraron citas con ese código o documento.</p>';
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
                ${(cita.documento || cita.iniciales)
                    ? `<div style="color:var(--primary); font-weight:600;">👤 Doc: ${cita.documento || cita.iniciales}</div>`
                    : '<div style="color:var(--text-muted);">❌ Sin asignar</div>'}
            </div>
        `;

        card.addEventListener('mouseenter', () => card.style.transform = 'translateY(-3px)');
        card.addEventListener('mouseleave', () => card.style.transform = 'translateY(0)');

        card.addEventListener('click', () => {
            if (window.openCitaDesdeAsignar) window.openCitaDesdeAsignar(cita);
        });

        resultsContainer.appendChild(card);
    });
}

function aplicarEstiloEstado(el, estado) {
    switch (estado) {
        case 'asignada':
            el.style.backgroundColor = '#eff6ff';
            el.style.borderLeft = '6px solid #3b82f6';
            break;
        case 'grabada':
            el.style.backgroundColor = '#f0fdf4';
            el.style.borderLeft = '6px solid #22c55e';
            break;
        case 'incidencia':
            el.style.backgroundColor = '#fef2f2';
            el.style.borderLeft = '6px solid #ef4444';
            break;
        default:
            el.style.backgroundColor = '#ffffff';
            el.style.borderLeft = '6px solid #d1d5db';
    }
}
