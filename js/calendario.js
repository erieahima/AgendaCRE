// js/calendario.js
import { AppState } from './app.js';
import { getCitasPorSedeYFecha, actualizarEstadoCita } from './firebase.js';
import { formatHoraToDisplay, formatearFecha } from './utils.js';

let currentView = 'dia'; // 'dia', 'semana', 'mes'
let currentDate = new Date();
let citasData = []; // Cache en memoria para la vista actual

export function renderCalendario() {
    setupControls();
    updateCalendario();
}

export async function loadCitasCalendario(sedeId) {
    // Si estamos en vista de semana necesitaríamos cargar múltiples días.
    // Para simplificar esta demo full-stack, en 'dia' carga un día.
    // 'semana' y 'mes' también buscarán en un rango (simplificaremos iterando getCitasPorSedeYFecha por cada día a pintar, o mock)
    // En produccion se haría una query >= y <= fecha
    updateCalendario();
}

function setupControls() {
    document.querySelector('.view-toggles').addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            document.querySelectorAll('.view-toggles .btn-toggle').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentView = e.target.getAttribute('data-view');
            updateCalendario();
        }
    });

    document.getElementById('cal-prev').addEventListener('click', () => {
        if(currentView === 'dia') currentDate.setDate(currentDate.getDate() - 1);
        if(currentView === 'semana') currentDate.setDate(currentDate.getDate() - 7);
        if(currentView === 'mes') currentDate.setMonth(currentDate.getMonth() - 1);
        updateCalendario();
    });

    document.getElementById('cal-next').addEventListener('click', () => {
        if(currentView === 'dia') currentDate.setDate(currentDate.getDate() + 1);
        if(currentView === 'semana') currentDate.setDate(currentDate.getDate() + 7);
        if(currentView === 'mes') currentDate.setMonth(currentDate.getMonth() + 1);
        updateCalendario();
    });

    document.getElementById('cal-today').addEventListener('click', () => {
        currentDate = new Date();
        updateCalendario();
    });

    setupModalControls();
}

async function updateCalendario() {
    const grid = document.getElementById('calendar-grid');
    const label = document.getElementById('cal-current-date-label');
    
    grid.innerHTML = '<div style="text-align:center; padding: 2rem;">Cargando citas...</div>';
    
    if (currentView === 'dia') {
        const diaFormat = currentDate.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        label.textContent = diaFormat.charAt(0).toUpperCase() + diaFormat.slice(1);
        await renderDayView(grid);
    } 
    else if (currentView === 'semana') {
        label.textContent = "Semana del " + currentDate.toLocaleDateString('es-ES');
        grid.innerHTML = '<div style="text-align:center; padding: 2rem;">Vista semana (Simplificada) - Selecciona Día para editar citas. Para demo, la estructura se mantiene sencilla.</div>';
    } 
    else if (currentView === 'mes') {
        const mesFmt = currentDate.toLocaleDateString('es-ES', { year: 'numeric', month: 'long' });
        label.textContent = mesFmt.charAt(0).toUpperCase() + mesFmt.slice(1);
        grid.innerHTML = '<div style="text-align:center; padding: 2rem;">Vista mes (Simplificada).</div>';
    }
}

async function renderDayView(grid) {
    if (!AppState.sedeActivaId) {
        grid.innerHTML = '<div style="text-align:center; padding: 2rem;">Selecciona una sede</div>';
        return;
    }

    const yyyymmdd = formatearFecha(currentDate);
    const citasDelDia = await getCitasPorSedeYFecha(AppState.sedeActivaId, yyyymmdd);
    
    let html = `
        <div class="cal-header">
            <div class="time-label-col"></div>
            <div class="day-header">${currentDate.toLocaleDateString('es-ES', {weekday: 'short', day: 'numeric'})}</div>
        </div>
        <div class="cal-body" id="cal-body-container">
    `;

    // Draw hours grid (08:00 - 20:00)
    for(let h=8; h<=20; h++) {
        html += `
            <div style="position:absolute; top:${(h-8)*60}px; left:0; right:0; height:60px; border-bottom:1px solid #e2e8f0;"></div>
            <div style="position:absolute; top:${(h-8)*60 - 10}px; left:0; width:50px; text-align:right; font-size:0.75rem; color:#64748b;">${String(h).padStart(2,'0')}:00</div>
        `;
    }

    // Contenedor principal de los eventos
    html += `<div id="events-area" style="position:absolute; top:0; left:60px; right:0; bottom:0; padding:4px;">`;
    html += `</div></div>`;
    grid.innerHTML = html;

    const eventsArea = document.getElementById('events-area');

    // Mapear cada cita en el display
    // Agrupamos citas que compartan la misma hora para distribuirlas horizontalmente
    const agrupadasPorHora = {};
    citasDelDia.forEach(c => {
        if(!agrupadasPorHora[c.hora]) agrupadasPorHora[c.hora] = [];
        agrupadasPorHora[c.hora].push(c);
    });

    for(let horaStr in agrupadasPorHora) {
        const citasGrupo = agrupadasPorHora[horaStr];
        const hStr = horaStr.slice(0, 2);
        const mStr = horaStr.slice(2, 4);
        const minutosDesdeOcho = (parseInt(hStr) - 8) * 60 + parseInt(mStr);
        
        const anchoPx = 100 / citasGrupo.length; // Porcentaje de ancho para dividirlas
        
        citasGrupo.forEach((cita, idx) => {
            const div = document.createElement('div');
            div.className = `cita-evento ${cita.estado}`;
            div.style.top = `${minutosDesdeOcho}px`;
            div.style.height = `28px`; // Bloque fijo por simplicidad
            div.style.left = `calc(${anchoPx * idx}% + 4px)`;
            div.style.width = `calc(${anchoPx}% - 8px)`;
            
            div.innerHTML = `${formatHoraToDisplay(cita.hora)}<br>${cita.codigo.slice(-5)}`; // Mostrar sufijo en bloque pequeño
            div.title = cita.codigo;
            
            div.addEventListener('click', () => openModal(cita));
            eventsArea.appendChild(div);
        });
    }
}

// -- Modal Logistics --
let modalCitaActiva = null;

function setupModalControls() {
    const modal = document.getElementById('cita-modal');
    modal.querySelector('.modal-close').addEventListener('click', () => modal.classList.add('hidden'));
    
    document.getElementById('btn-toggle-estado').addEventListener('click', async () => {
        if(!modalCitaActiva) return;
        
        const nuevoEstado = modalCitaActiva.estado === 'disponible' ? 'ocupada' : 'disponible';
        const ok = confirm(`¿Cambiar estado a: ${nuevoEstado}?`);
        if(ok) {
            await actualizarEstadoCita(modalCitaActiva.codigo, nuevoEstado);
            modal.classList.add('hidden');
            updateCalendario(); // Reload
        }
    });

    // Cerrar si hace click fuera
    modal.addEventListener('click', (e) => {
        if(e.target === modal) modal.classList.add('hidden');
    });
}

function openModal(cita) {
    modalCitaActiva = cita;
    const modal = document.getElementById('cita-modal');
    document.getElementById('modal-codigo').textContent = cita.codigo;
    document.getElementById('modal-fecha').textContent = cita.fecha;
    document.getElementById('modal-hora').textContent = formatHoraToDisplay(cita.hora);
    document.getElementById('modal-puesto').textContent = `Puesto ${cita.puesto}`;
    
    const bdg = document.getElementById('modal-estado-label');
    bdg.textContent = cita.estado.toUpperCase();
    bdg.className = `badge ${cita.estado}`;
    
    modal.classList.remove('hidden');
}
