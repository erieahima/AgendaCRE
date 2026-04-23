// js/calendario.js
import { AppState } from './app.js';
import { getCitasPorSedeYFecha, getCitasPorSedeYRango, actualizarEstadoCita } from './firebase.js';
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

    const searchInput = document.getElementById('search-cita');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            document.querySelectorAll('.cita-evento').forEach(el => {
                if(!term) {
                    el.classList.remove('highlighted');
                    el.style.opacity = '1';
                    return;
                }
                const codigoCita = (el.dataset.codigo || el.textContent).toLowerCase();
                if(codigoCita.includes(term)) {
                    el.classList.add('highlighted');
                    el.style.opacity = '1';
                } else {
                    el.classList.remove('highlighted');
                    el.style.opacity = '0.3';
                }
            });
        });
    }

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
        const diaFormat = currentDate.toLocaleDateString('es-ES', { year: 'numeric', month: 'long' });
        label.textContent = "Semana - " + diaFormat.charAt(0).toUpperCase() + diaFormat.slice(1);
        await renderWeekView(grid);
    } 
    else if (currentView === 'mes') {
        const mesFmt = currentDate.toLocaleDateString('es-ES', { year: 'numeric', month: 'long' });
        label.textContent = "Mes - " + mesFmt.charAt(0).toUpperCase() + mesFmt.slice(1);
        await renderMonthView(grid);
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
            <div style="width: 60px; border-right: 1px solid var(--border);"></div>
            <div class="day-header" style="flex:1;">${currentDate.toLocaleDateString('es-ES', {weekday: 'long', day: 'numeric', month: 'short'})}</div>
        </div>
        <div class="cal-body" id="cal-body-container">
    `;

    // Map appointments by hour to the nearest integer hour for the grid
    const groupedByHourInt = {};
    for(let h=8; h<=20; h++) groupedByHourInt[h] = [];

    citasDelDia.forEach(c => {
        const hInt = parseInt(c.hora.substring(0, 2));
        if (hInt >= 8 && hInt <= 20) {
            groupedByHourInt[hInt].push(c);
        }
    });

    for(let h=8; h<=20; h++) {
        html += `
            <div class="cal-row-hour">
                <div class="hour-indicator">${String(h).padStart(2,'0')}:00</div>
                <div class="citas-container-flex" id="hour-row-${h}">
                </div>
            </div>
        `;
    }
    html += `</div>`;
    grid.innerHTML = html;

    // Inject appointments into their rows
    for(let h=8; h<=20; h++) {
        const container = document.getElementById(`hour-row-${h}`);
        const appointments = groupedByHourInt[h];
        
        appointments.forEach(cita => {
            const div = document.createElement('div');
            div.className = `cita-evento ${cita.estado}`;
            div.dataset.codigo = cita.codigo;
            
            div.innerHTML = `
                <strong>${formatHoraToDisplay(cita.hora)}</strong>
                <span>${cita.codigo}</span>
            `;
            div.title = cita.codigo;
            
            div.addEventListener('click', (e) => {
                e.stopPropagation();
                openModal(cita);
            });
            container.appendChild(div);
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

window.openCitaDesdeMes = (cita) => openModal(cita);

async function renderWeekView(grid) {
    if (!AppState.sedeActivaId) {
        grid.innerHTML = '<div style="text-align:center; padding: 2rem;">Selecciona una sede</div>';
        return;
    }

    // Determinar lunes a domingo de la semana de currentDate
    const dayOfWeek = currentDate.getDay() === 0 ? 7 : currentDate.getDay(); 
    const lunes = new Date(currentDate);
    lunes.setDate(currentDate.getDate() - dayOfWeek + 1);
    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);

    const inicioStr = formatearFecha(lunes);
    const finStr = formatearFecha(domingo);

    const citasSemana = await getCitasPorSedeYRango(AppState.sedeActivaId, inicioStr, finStr);

    let html = '<div class="week-grid">';
    
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const targetDate = new Date(lunes);
        targetDate.setDate(lunes.getDate() + dayOffset);
        
        html += `<div class="week-col">
            <div class="week-header">${targetDate.toLocaleDateString('es-ES', {weekday: 'short', day: 'numeric'})}</div>`;

        for(let h=8; h<=20; h++) {
            html += `<div style="position:absolute; top:${(h-8)*60 + 40}px; left:0; right:0; height:60px; border-bottom:1px solid #e2e8f0;"></div>`;
            if(dayOffset === 0) { // Etiqueta de horas solo en la columna de la izquierda (lunes)
                html += `<div class="week-time-label" style="top:${(h-8)*60 + 30}px;">${String(h).padStart(2,'0')}:00</div>`;
            }
        }

        html += `<div class="events-area-week" id="events-week-${dayOffset}" style="position:absolute; top:40px; left:0; right:0; bottom:0;"></div>`;
        html += `</div>`; 
    }
    html += '</div>';
    grid.innerHTML = html;

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const targetDate = new Date(lunes);
        targetDate.setDate(lunes.getDate() + dayOffset);
        const yyyymmdd = formatearFecha(targetDate);
        const citasDelDia = citasSemana.filter(c => c.fecha === yyyymmdd);
        
        const agrupadasPorHora = {};
        citasDelDia.forEach(c => {
            if(!agrupadasPorHora[c.hora]) agrupadasPorHora[c.hora] = [];
            agrupadasPorHora[c.hora].push(c);
        });

        const evArea = document.getElementById(`events-week-${dayOffset}`);
        
        for(let horaStr in agrupadasPorHora) {
            const hStr = horaStr.slice(0, 2);
            const mStr = horaStr.slice(2, 4);
            const mins = (parseInt(hStr) - 8) * 60 + parseInt(mStr);
            
            const rowDiv = document.createElement('div');
            rowDiv.className = 'citas-row';
            rowDiv.style.top = `${mins}px`;
            
            if(dayOffset !== 0) rowDiv.style.left = '4px';

            agrupadasPorHora[horaStr].forEach(cita => {
                const div = document.createElement('div');
                div.className = `cita-evento compact ${cita.estado}`;
                div.dataset.codigo = cita.codigo;
                div.title = `${formatHoraToDisplay(cita.hora)} - ${cita.codigo}`;
                div.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openModal(cita);
                });
                rowDiv.appendChild(div);
            });
            evArea.appendChild(rowDiv);
        }
    }
}

async function renderMonthView(grid) {
    if (!AppState.sedeActivaId) {
        grid.innerHTML = '<div style="text-align:center; padding: 2rem;">Selecciona una sede</div>';
        return;
    }

    const yyyy = currentDate.getFullYear();
    const mm = currentDate.getMonth();

    const inicioMes = new Date(yyyy, mm, 1);
    const finMes = new Date(yyyy, mm + 1, 0);

    const inicioMesStr = formatearFecha(inicioMes);
    const finMesStr = formatearFecha(finMes);

    const citasMes = await getCitasPorSedeYRango(AppState.sedeActivaId, inicioMesStr, finMesStr);

    let html = '<div class="month-grid">';
    
    // Headers L V M
    const dNombres = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    for(let d=0; d<7; d++) {
        html += `<div style="text-align:center; font-weight:bold; padding: 8px; border-right:1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; background:var(--surface);">${dNombres[d]}</div>`;
    }

    const startDayOfWeek = inicioMes.getDay() === 0 ? 7 : inicioMes.getDay(); 
    
    for(let i = 1; i < startDayOfWeek; i++) {
        html += `<div class="month-cell" style="background:#f8fafc;"></div>`;
    }

    for(let dia = 1; dia <= finMes.getDate(); dia++) {
        const iterDate = new Date(yyyy, mm, dia);
        const yyyymmdd = formatearFecha(iterDate);
        const delDia = citasMes.filter(c => c.fecha === yyyymmdd);
        
        const dispCitas = delDia.filter(c => c.estado === 'disponible');
        const ocupCitas = delDia.filter(c => c.estado === 'ocupada');

        html += `<div class="month-cell" id="mc-${yyyymmdd}">
            <div class="month-cell-header">${dia}</div>
            <div class="month-events-container">`;
        
        delDia.forEach(cita => {
            html += `<div class="cita-evento compact ${cita.estado}" 
                          data-codigo="${cita.codigo}" 
                          title="${formatHoraToDisplay(cita.hora)} - ${cita.codigo}"
                          onclick="event.stopPropagation(); window.openCitaDesdeMes(${JSON.stringify(cita).replace(/"/g, '&quot;')})">
                     </div>`;
        });

        html += `</div></div>`;
    }
    }

    const totalCells = (startDayOfWeek - 1) + finMes.getDate();
    const remain = 7 - (totalCells % 7);
    if(remain < 7) {
        for(let i=0; i<remain; i++) {
            html += `<div class="month-cell" style="background:#f8fafc;"></div>`;
        }
    }

    html += '</div>';
    grid.innerHTML = html;

    for(let dia = 1; dia <= finMes.getDate(); dia++) {
        const iterDate = new Date(yyyy, mm, dia);
        const yyyymmdd = formatearFecha(iterDate);
        const mc = document.getElementById(`mc-${yyyymmdd}`);
        if(mc) {
            mc.addEventListener('click', () => {
                currentDate = iterDate;
                document.querySelector('[data-view="dia"]').click();
            });
        }
    }
}
