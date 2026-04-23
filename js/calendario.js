// js/calendario.js
import { AppState } from './app.js';
import { getCitasPorSedeYFecha, getCitasPorSedeYRango, actualizarCitaData } from './firebase.js';
import { formatHoraToDisplay, formatearFecha, formatearFechaHumana, formatearHoraHumana } from './utils.js';

let currentView = 'dia'; // 'dia', 'semana', 'mes'
let currentDate = new Date();
let citasData = []; // Cache en memoria para la vista actual

let controlsInitialized = false;

export function renderCalendario() {
    if (!controlsInitialized) {
        setupControls();
        controlsInitialized = true;
    }
    updateCalendario();
}

/**
 * Inicialización única de los controles del modal, 
 * independiente de si el calendario está renderizado o no.
 */
export function initCalendarioModal() {
    setupModalControls();
}

export async function loadCitasCalendario(sedeId) {
    updateCalendario();
}

function setupControls() {
    // Evitar registros duplicados si por alguna razón la bandera falla
    const prevBtn = document.getElementById('cal-prev');
    const nextBtn = document.getElementById('cal-next');
    
    // Clonar para limpiar listeners previos si existieran (doble seguridad)
    const newPrev = prevBtn.cloneNode(true);
    const newNext = nextBtn.cloneNode(true);
    prevBtn.parentNode.replaceChild(newPrev, prevBtn);
    nextBtn.parentNode.replaceChild(newNext, nextBtn);

    document.querySelector('.view-toggles').addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            document.querySelectorAll('.view-toggles .btn-toggle').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentView = e.target.getAttribute('data-view');
            updateCalendario();
        }
    });

    newPrev.addEventListener('click', () => {
        if(currentView === 'dia') currentDate.setDate(currentDate.getDate() - 1);
        if(currentView === 'mes') currentDate.setMonth(currentDate.getMonth() - 1);
        updateCalendario();
    });

    newNext.addEventListener('click', () => {
        if(currentView === 'dia') currentDate.setDate(currentDate.getDate() + 1);
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
let modalInitialized = false;

alert("DEPURACIÓN: Calendario.js cargado v2.2.6");

function setupModalControls() {
    if (modalInitialized) return;
    modalInitialized = true;
    
    alert("DEPURACIÓN: setupModalControls ejecutándose");

    const modal = document.getElementById('cita-modal');
    
    // Delegación delegada para cerrar
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-close')) {
            modal.classList.add('hidden');
        }
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });
    
    // Auto-asignar al poner iniciales
    const inputInit = document.getElementById('modal-iniciales');
    if (inputInit) {
        inputInit.addEventListener('input', (e) => {
            if (e.target.value.trim() !== "") {
                document.getElementById('modal-estado-select').value = 'asignada';
            }
        });
    }

    // DELEGACIÓN GLOBAL PARA GUARDAR (A PRUEBA DE FALLOS)
    document.addEventListener('click', async (e) => {
        if (e.target.id === 'btn-save-cita') {
            const btnSave = e.target;
            alert("DEPURACIÓN: Click en GUARDAR (Delegado)");
            
            if(!modalCitaActiva) {
                alert("Error: No hay cita activa para guardar.");
                return;
            }

            const codigoUsuario = document.getElementById('modal-codigo-usuario').value;
            const iniciales = document.getElementById('modal-iniciales').value;
            const observaciones = document.getElementById('modal-observaciones').value;
            const estado = document.getElementById('modal-estado-select').value;

            btnSave.disabled = true;
            const oldText = btnSave.textContent;
            btnSave.textContent = "Guardando...";

            try {
                const idDocumento = modalCitaActiva.id || modalCitaActiva.codigo;
                alert("DEPURACIÓN: Intentando actualizar ID: " + idDocumento);
                
                await actualizarCitaData(idDocumento, {
                    codigoUsuario,
                    iniciales,
                    observaciones,
                    estado
                });
                
                alert("Felicidades: ¡Guardado en Firebase!");
                modal.classList.add('hidden');
                
                if (document.getElementById('view-calendario')?.classList.contains('active')) {
                    updateCalendario(); 
                }
                
                window.dispatchEvent(new CustomEvent('citaActualizada', { detail: idDocumento }));
            } catch (err) {
                alert("ERROR CRÍTICO: " + err.message);
            } finally {
                btnSave.disabled = false;
                btnSave.textContent = oldText;
            }
        }
    });
}

function openModal(cita, isRestricted = false) {
    modalCitaActiva = cita;
    const modal = document.getElementById('cita-modal');
    
    document.getElementById('modal-codigo').textContent = cita.codigo;
    document.getElementById('modal-fecha').textContent = formatearFechaHumana(cita.fecha);
    document.getElementById('modal-hora').textContent = formatearHoraHumana(cita.hora);
    
    const inputUser = document.getElementById('modal-codigo-usuario');
    const inputInit = document.getElementById('modal-iniciales');
    const inputObs = document.getElementById('modal-observaciones');
    const selectEstado = document.getElementById('modal-estado-select');

    inputUser.value = cita.codigoUsuario || "";
    inputInit.value = cita.iniciales || "";
    inputObs.value = cita.observaciones || "";
    selectEstado.value = cita.estado || "pendiente";

    // Si es modo restringido (Asignar Cita), solo habilitamos iniciales
    if (isRestricted) {
        inputUser.disabled = true;
        inputObs.disabled = true;
        selectEstado.disabled = true;
    } else {
        inputUser.disabled = false;
        inputObs.disabled = false;
        selectEstado.disabled = false;
    }
    
    modal.classList.remove('hidden');
}

window.openCitaDesdeAsignar = (cita) => openModal(cita, true);
window.openCitaDesdeMes = (cita) => openModal(cita);

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
        
        html += `<div class="month-cell" id="mc-${yyyymmdd}">
            <div class="month-cell-header">${dia}</div>
            <div style="text-align:center; margin-top:10px;">
                <span style="font-size:0.8rem; font-weight:600; color:var(--primary);">${delDia.length > 0 ? delDia.length + ' Citas' : ''}</span>
            </div>
        </div>`;
    }

    const remain = 7 - (((startDayOfWeek - 1) + finMes.getDate()) % 7);
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
                currentView = 'dia';
                document.querySelectorAll('.view-toggles .btn-toggle').forEach(b => {
                    b.classList.toggle('active', b.getAttribute('data-view') === 'dia');
                });
                updateCalendario();
            });
        }
    }
}
