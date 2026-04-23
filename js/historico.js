import { getHistoricoGrabaciones } from './firebase.js';
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

function renderTable(data) {
    const tbody = document.getElementById('historico-tbody');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No hay registros grabados en este rango.</td></tr>';
        return;
    }

    data.forEach(cita => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="font-weight: 600;">${formatearFechaLocal(cita.fecha)}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">${formatearHoraLocal(cita.hora)}</div>
            </td>
            <td><span class="badge" style="background:#f1f5f9; color:#475569">${cita.codigo}</span></td>
            <td><strong>${cita.codigoUsuario || '---'}</strong></td>
            <td style="font-size:0.85rem">${cita.observaciones || '---'}</td>
            <td>${appStateRef.sedes.find(s => s.codigoTerritorial === cita.sede)?.nombre || cita.sede}</td>
            <td><span class="badge" style="background:#dcfce7; color:#166534">Grabada</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function filtrarEnPantalla(term) {
    const filtered = historicalData.filter(c => {
        return (c.codigoUsuario || "").toLowerCase().includes(term) || 
               c.codigo.toLowerCase().includes(term);
    });
    renderTable(filtered);
}

function formatearFechaLocal(s) {
    if(!s || s.length !== 8) return s;
    return `${s.substring(6,8)}/${s.substring(4,6)}/${s.substring(0,4)}`;
}

function formatearHoraLocal(s) {
    if(!s || s.length !== 4) return s + 'h';
    return `${s.substring(0,2)}:${s.substring(2,4)}h`;
}
