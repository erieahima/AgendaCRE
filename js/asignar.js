import { buscarCitasParaAsignar } from './firebase.js';
import { formatearFechaHumana, formatearHoraHumana } from './utils.js';

let allCitasCache = [];
let lastSedeId = null;
let appStateRef = null;

export function setupAsignar(appState) {
    appStateRef = appState;
    const searchInput = document.getElementById('asignar-search-input');
    const resultsContainer = document.getElementById('asignar-results');

    if (!searchInput) return;

    searchInput.addEventListener('input', async (e) => {
        const term = e.target.value.trim().toUpperCase();
        
        if (term.length < 3) {
            resultsContainer.innerHTML = '';
            return;
        }

        // Recargar caché si cambia la sede o está vacío
        if (lastSedeId !== appState.sedeActivaId || allCitasCache.length === 0) {
            allCitasCache = await buscarCitasParaAsignar(appState.sedeActivaId);
            lastSedeId = appState.sedeActivaId;
        }

        // Filtrar localmente (soporta substring en cualquier parte)
        const matches = allCitasCache.filter(cita => 
            cita.codigo.toUpperCase().includes(term)
        ).slice(0, 40); // Limitar a 40 para rendimiento UI

        renderResults(matches);
    });

    // Limpiar caché al cambiar de sede
    window.addEventListener('sedeChanged', () => {
        allCitasCache = [];
    });

    // Refrescar al guardar desde el modal
    window.addEventListener('citaActualizada', async () => {
        allCitasCache = []; // Forzar recarga
        if (searchInput.value.trim().length >= 3) {
            // Re-lanzar búsqueda para ver reflejado el cambio (ej. color azul)
            const term = searchInput.value.trim().toUpperCase();
            if (lastSedeId !== appState.sedeActivaId || allCitasCache.length === 0) {
                allCitasCache = await buscarCitasParaAsignar(appState.sedeActivaId);
                lastSedeId = appState.sedeActivaId;
            }
            const matches = allCitasCache.filter(cita => 
                cita.codigo.toUpperCase().includes(term)
            ).slice(0, 40);
            renderResults(matches);
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
        
        // Colores según estado (consistente con calendario)
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
                ${cita.iniciales ? `<div style="color:var(--primary); font-weight:600;">👤 Asignada a: ${cita.iniciales}</div>` : '<div style="color:var(--text-muted);">❌ Sin asignar</div>'}
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
