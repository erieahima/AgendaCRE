import { getHistoricoGrabaciones, buscarCitasHistorico } from './firebase.js';
import { dateToInputString, formatearFechaHumana, formatearHoraHumana } from './utils.js';
import { cacheGet, cacheSet, cacheInvalidatePrefix } from './cache.js';

let appStateRef = null;
let historicalData = [];

export function setupHistorico(appState) {
    appStateRef = appState;
    
    // Configurar fechas por defecto (últimos 7 días)
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(today.getDate() - 7);
    
    const inputInicio = document.getElementById('hist-fecha-inicio');
    const inputFin = document.getElementById('hist-fecha-fin');
    
    if(inputInicio && inputFin) {
        inputInicio.value = dateToInputString(lastWeek);
        inputFin.value = dateToInputString(today);
    }

    // Eventos
    document.getElementById('btn-load-historico').addEventListener('click', loadHistorico);
    
    document.getElementById('hist-search').addEventListener('input', (e) => {
        filtrarEnPantalla(e.target.value.toLowerCase());
    });

    // Cargar si se cambia de sede
    window.addEventListener('sedeChanged', () => {
        if(document.getElementById('view-historico').classList.contains('active')) {
            loadHistorico();
        }
    });

    // v3.28.3: Carga lazy — solo cuando el usuario entra a la vista Histórico
    window.addEventListener('historicoViewEntered', () => {
        if (appState.sedeActivaId) loadHistorico();
    });

    // v3.30.0: Invalidar caché del histórico cuando se graba/actualiza una cita
    window.addEventListener('citaActualizada', () => {
        if (appState.sedeActivaId) {
            cacheInvalidatePrefix(`hist_${appState.sedeActivaId}_`);
        }
    });
}

async function loadHistorico() {
    if (!appStateRef.sedeActivaId) {
        alert("Selecciona una sede.");
        return;
    }

    const term = document.getElementById('hist-search').value.trim();
    
    // Si hay búsqueda activa, ignoramos fechas y buscamos globalmente
    if (term.length >= 2) {
        filtrarEnPantalla(term);
        return;
    }

    const start = document.getElementById('hist-fecha-inicio').value.replace(/-/g, '');
    const end = document.getElementById('hist-fecha-fin').value.replace(/-/g, '');
    
    const tbody = document.getElementById('historico-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Cargando historial...</td></tr>';

    try {
        // v3.30.0: Caché de 5 min por sede+rango — evita releer Firestore al entrar/salir de la vista
        const cacheKey = `hist_${appStateRef.sedeActivaId}_${start}_${end}`;
        let cached = cacheGet(cacheKey);
        if (cached) {
            historicalData = cached;
        } else {
            historicalData = await getHistoricoGrabaciones(appStateRef.sedeActivaId, start, end);
            cacheSet(cacheKey, historicalData, 5 * 60 * 1000);
        }
        renderTable(historicalData);
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="color:red">Error: ${err.message}</td></tr>`;
    }
}

async function filtrarEnPantalla(term) {
    if (!term || term.length < 2) {
        renderTable(historicalData);
        return;
    }

    const termLower = term.toLowerCase();

    // 1. Filtrado local (lo que ya está cargado en la semana) - Búsqueda PARCIAL
    const locales = historicalData.filter(c => {
        return (c.codigoUsuario || "").toLowerCase().includes(termLower) || 
               (c.codigo || "").toLowerCase().includes(termLower) ||
               (c.documento || c.iniciales || "").toLowerCase().includes(termLower);
    });

    // 2. Si el término es suficiente, buscamos globalmente (EXACTA o casi exacta)
    if (term.length >= 3) {
        try {
            // Enviamos el término tal cual, firebase.js probará varias combinaciones
            const globales = await buscarCitasHistorico(appStateRef.sedeActivaId, term.trim());
            
            // Combinar evitando duplicados por ID
            const mapResultados = new Map();
            locales.forEach(c => mapResultados.set(c.id, c));
            globales.forEach(c => mapResultados.set(c.id, c));
            
            renderTable(Array.from(mapResultados.values()), term);
        } catch (err) {
            console.error("Error global search:", err);
            renderTable(locales, term);
        }
    } else {
        renderTable(locales, term);
    }
}

function renderTable(data, termHighlight = "") {
    const tbody = document.getElementById('historico-tbody');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No se encontraron coincidencias.</td></tr>';
        return;
    }

    // Ordenar por fecha descendente
    data.sort((a,b) => b.fecha.localeCompare(a.fecha) || b.hora.localeCompare(a.hora));

    data.forEach(cita => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        
        // Marcamos en rojo si coincide con el término de búsqueda
        const matches = termHighlight && (
            (cita.codigoUsuario || "").toLowerCase().includes(termHighlight.toLowerCase()) ||
            cita.codigo.toLowerCase().includes(termHighlight.toLowerCase()) ||
            (cita.documento || cita.iniciales || "").toLowerCase().includes(termHighlight.toLowerCase())
        );

        if (matches) {
            tr.style.backgroundColor = '#fef2f2';
            tr.style.borderLeft = '4px solid #ef4444';
        }

        tr.innerHTML = `
            <td>
                <div style="font-weight: 600;">${formatearFechaHumana(cita.fecha)}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">${formatearHoraHumana(cita.hora)}</div>
            </td>
            <td><span class="badge" title="${cita.codigo}" style="background:#f1f5f9; color:#475569">${cita.codigo.slice(-3)}</span></td>
            <td><strong style="${matches ? 'color:#ef4444' : ''}">${cita.documento || cita.iniciales || '---'}</strong></td>
            <td><strong>${cita.codigoUsuario || '---'}</strong></td>
            <td class="text-center">
                <div style="width: 15px; height: 15px; background: ${cita.haceConstar ? '#22c55e' : '#fff'}; border-radius: 3px; margin: 0 auto; border: 1px solid ${cita.haceConstar ? '#16a34a' : '#cbd5e1'};"></div>
            </td>
            <td class="text-center">
                <div style="width: 15px; height: 15px; background: ${cita.vulnerabilidad ? '#22c55e' : '#fff'}; border-radius: 3px; margin: 0 auto; border: 1px solid ${cita.vulnerabilidad ? '#16a34a' : '#cbd5e1'};"></div>
            </td>
            <td style="font-size:0.85rem; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${cita.observaciones || '---'}</td>
            <td>${appStateRef.sedes.find(s => s.codigoTerritorial === cita.sede)?.nombre || cita.sede}</td>
            <td>${renderEstadoBadge(cita.estadoGrabacion || cita.estado)}</td>
        `;

        tr.addEventListener('click', () => {
            import('./calendario.js').then(m => m.openModal(cita));
        });

        tbody.appendChild(tr);
    });
}

function renderEstadoBadge(estado) {
    let color = "#475569";
    let bg = "#f1f5f9";
    let texto = estado || "Pendiente";

    if (estado === "grabada") { bg = "#dcfce7"; color = "#166534"; texto = "Grabada"; }
    else if (estado === "incidencia") { bg = "#fee2e2"; color = "#991b1b"; texto = "Incidencia"; }
    else if (estado === "asignada") { bg = "#eff6ff"; color = "#1e40af"; texto = "Asignada"; }

    return `<span class="badge" style="background:${bg}; color:${color}">${texto}</span>`;
}
