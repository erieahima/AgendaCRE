import { getHistoricoGrabaciones, buscarCitasHistorico } from './firebase.js';
import { dateToInputString } from './utils.js';

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

    // Cargar automáticamente al iniciar si hay sede
    if (appState.sedeActivaId) {
        loadHistorico(); 
    }
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
        historicalData = await getHistoricoGrabaciones(appStateRef.sedeActivaId, start, end);
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
               (c.codigo || "").toLowerCase().includes(termLower);
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
        
        // Marcamos en rojo si coincide con el término de búsqueda
        const matches = termHighlight && (
            (cita.codigoUsuario || "").toLowerCase().includes(termHighlight.toLowerCase()) ||
            cita.codigo.toLowerCase().includes(termHighlight.toLowerCase())
        );

        if (matches) {
            tr.style.backgroundColor = '#fef2f2';
            tr.style.borderLeft = '4px solid #ef4444';
        }

        tr.innerHTML = `
            <td>
                <div style="font-weight: 600;">${formatearFechaLocal(cita.fecha)}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">${formatearHoraLocal(cita.hora)}</div>
            </td>
            <td><span class="badge" style="background:#f1f5f9; color:#475569">${cita.codigo}</span></td>
            <td><strong>${cita.iniciales || '---'}</strong></td>
            <td><strong style="${matches ? 'color:#ef4444' : ''}">${cita.codigoUsuario || '---'}</strong></td>
            <td style="font-size:0.85rem">${cita.observaciones || '---'}</td>
            <td>${appStateRef.sedes.find(s => s.codigoTerritorial === cita.sede)?.nombre || cita.sede}</td>
            <td>${renderEstadoBadge(cita.estadoGrabacion)}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderEstadoBadge(estado) {
    let color = "#475569";
    let bg = "#f1f5f9";
    let texto = estado || "Pendiente";

    if (estado === "Grabada") { bg = "#dcfce7"; color = "#166534"; }
    else if (estado === "Incidencia") { bg = "#fee2e2"; color = "#991b1b"; }
    else if (estado === "Inicia grabación") { bg = "#ffedd5"; color = "#9a3412"; }
    else if (estado === "asignada") { bg = "#eff6ff"; color = "#1e40af"; }

    return `<span class="badge" style="background:${bg}; color:${color}">${texto}</span>`;
}

function formatearFechaLocal(s) {
    if(!s || s.length !== 8) return s;
    return `${s.substring(6,8)}/${s.substring(4,6)}/${s.substring(0,4)}`;
}

function formatearHoraLocal(s) {
    if(!s || s.length !== 4) return s + 'h';
    return `${s.substring(0,2)}:${s.substring(2,4)}h`;
}
