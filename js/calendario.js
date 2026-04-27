// js/calendario.js
import { AppState } from './app.js';
import { getCitasPorSedeYFecha, getCitasPorSedeYRango, actualizarCitaData } from './firebase.js';
import { formatHoraToDisplay, formatearFecha, formatearFechaHumana, formatearHoraHumana } from './utils.js';
import { cacheGet, cacheSet, cacheInvalidate, cachePatchItem } from './cache.js';

// TTL para datos del calendario: 5 minutos
const CAL_TTL = 5 * 60 * 1000;

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
        updateCalendario();
    });

    document.getElementById('cal-llamar-siguiente').addEventListener('click', async () => {
        await llamarSiguienteCita();
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
    const cacheKey = `cal_dia_${AppState.sedeActivaId}_${yyyymmdd}`;
    let citasDelDia = cacheGet(cacheKey);
    if (!citasDelDia) {
        citasDelDia = await getCitasPorSedeYFecha(AppState.sedeActivaId, yyyymmdd);
        cacheSet(cacheKey, citasDelDia, CAL_TTL);
    }
    
    let html = `
        <div class="cal-header">
            <div style="width: 60px; border-right: 1px solid var(--border);"></div>
            <div class="day-header" style="flex:1;">${currentDate.toLocaleDateString('es-ES', {weekday: 'long', day: 'numeric', month: 'short'})}</div>
        </div>
        <div class="cal-body" id="cal-body-container">
    `;

    // Agrupar por hora exacta (HH:MM) para que cada slot temporal tenga su propia línea
    const groupedByTime = {};
    citasDelDia.forEach(c => {
        if (!groupedByTime[c.hora]) groupedByTime[c.hora] = [];
        groupedByTime[c.hora].push(c);
    });

    // Obtener horas ordenadas
    const sortedTimes = Object.keys(groupedByTime).sort();

    for(let t of sortedTimes) {
        html += `
            <div class="cal-row-hour">
                <div class="hour-indicator">${formatHoraToDisplay(t)}</div>
                <div class="citas-container-flex" id="time-row-${t}">
                </div>
            </div>
        `;
    }
    html += `</div>`;
    grid.innerHTML = html;

    // Inyectar citas en sus filas temporales
    for(let t of sortedTimes) {
        const container = document.getElementById(`time-row-${t}`);
        const appointments = groupedByTime[t];
        
        appointments.forEach(cita => {
            const div = document.createElement('div');
            div.className = `cita-evento ${cita.estado}`;
            div.dataset.codigo = cita.codigo;
            
            div.innerHTML = `
                ${cita.asistencia ? '<div class="asistencia-dot-absolute"></div>' : ''}
                <span>${cita.codigo.slice(-3)}</span>
            `;
            div.title = cita.codigo; // Mantener completo en el tooltip
            
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

function setupModalControls() {
    if (modalInitialized) return;
    modalInitialized = true;
    
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
        inputInit.addEventListener('blur', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
    }

    // Gestionar comportamiento de asistencia según estado (V.3.6.5)
    const selectEstado = document.getElementById('modal-estado-select');
    const switchAsistencia = document.getElementById('modal-asistencia-switch');
    if (selectEstado && switchAsistencia) {
        selectEstado.addEventListener('change', (e) => {
            const estado = e.target.value;
            // Si pasamos a terminado o anulado, quitamos asistencia automáticamente
            if (['terminada', 'anulada', 'pendiente'].includes(estado)) {
                switchAsistencia.checked = false;
            }
        });
    }

    // DELEGACIÓN GLOBAL PARA GUARDAR Y OTROS BOTONES
    document.addEventListener('click', async (e) => {
        if (e.target.id === 'btn-admin-edit') {
            const btn = e.target;
            // Habilitar campos
            document.getElementById('modal-codigo-usuario').disabled = false;
            document.getElementById('modal-hace-constar').disabled = false;
            document.getElementById('modal-vulnerabilidad').disabled = false;
            document.getElementById('modal-iniciales').disabled = false;
            document.getElementById('modal-observaciones').disabled = false;
            document.getElementById('modal-estado-select').disabled = false;
            document.getElementById('modal-asistencia-switch').disabled = false;
            
            document.getElementById('btn-save-cita').classList.remove('hidden');
            btn.classList.add('hidden');
            return;
        }

        if (e.target.id === 'btn-save-cita') {
            const btnSave = e.target;
            
            if(!modalCitaActiva) return;

            const codigoUsuario = document.getElementById('modal-codigo-usuario').value;
            const haceConstar = document.getElementById('modal-hace-constar').checked;
            const vulnerabilidad = document.getElementById('modal-vulnerabilidad').checked;
            const iniciales = document.getElementById('modal-iniciales').value.toUpperCase();
            const observaciones = document.getElementById('modal-observaciones').value;
            const estado = document.getElementById('modal-estado-select').value;
            let asistencia = document.getElementById('modal-asistencia-switch').checked;

            // V.3.17.0: Validación de código de usuario numérico para estado 'terminada'
            if (estado === 'terminada') {
                if (!codigoUsuario.trim() || !/^\d+$/.test(codigoUsuario.trim())) {
                    alert("Atención: El código de usuario debe contener únicamente números para poder marcar la cita como terminada.");
                    return;
                }
            }

            btnSave.disabled = true;
            const oldText = btnSave.textContent;
            btnSave.textContent = "Guardando...";

            try {
                const idDocumento = modalCitaActiva.id || modalCitaActiva.codigo;
                const patch = { codigoUsuario, iniciales, observaciones, estado, asistencia, haceConstar, vulnerabilidad };
                await actualizarCitaData(idDocumento, patch);
                
                // Actualizar la caché sin volver a leer de Firestore
                if (modalCitaActiva.fecha && AppState.sedeActivaId) {
                    const diaKey = `cal_dia_${AppState.sedeActivaId}_${modalCitaActiva.fecha}`;
                    cachePatchItem(diaKey, idDocumento, patch);
                    // Invalidar la vista de mes para que refleje cambios de estado
                    const d = new Date(modalCitaActiva.fecha.slice(0,4), modalCitaActiva.fecha.slice(4,6) - 1, modalCitaActiva.fecha.slice(6,8));
                    const mesKey = `cal_mes_${AppState.sedeActivaId}_`;
                    // Invalidar cualquier caché mensual que contenga este día
                    cacheInvalidate(mesKey + modalCitaActiva.fecha.slice(0,6) + '01_' + new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0,10).replace(/-/g,''));
                }

                modal.classList.add('hidden');
                
                if (document.getElementById('view-calendario')?.classList.contains('active')) {
                    updateCalendario(); 
                }
                
                window.dispatchEvent(new CustomEvent('citaActualizada', { detail: { id: idDocumento, patch } }));
            } catch (err) {
                console.error("Error al guardar cita:", err);
                alert("Error al guardar: " + err.message);
            } finally {
                btnSave.disabled = false;
                btnSave.textContent = oldText;
            }
        }

        if (e.target.id === 'btn-llamar-modal') {
            if (!modalCitaActiva) return;
            const btn = e.target;
            btn.disabled = true;

            const { getPuestoConfig, actualizarCitaData, Timestamp } = await import('./firebase.js');
            const config = await getPuestoConfig(AppState.user.uid);

            if (!config || !config.activo || !config.nombre) {
                alert("Primero debes configurar y activar tu puesto.");
                btn.disabled = false;
                return;
            }

            try {
                const idDocumento = modalCitaActiva.id || modalCitaActiva.codigo;
                await actualizarCitaData(idDocumento, {
                    llamada: {
                        puesto: config.nombre,
                        timestamp: Timestamp.now()
                    }
                });
                alert(`Llamada enviada: ${modalCitaActiva.codigo} a la ${config.nombre}`);
                updateCalendario();
            } catch (err) {
                console.error(err);
                alert("Error al llamar: " + err.message);
            } finally {
                btn.disabled = false;
            }
        }
    });
}

export function openModal(cita, isRestricted = false) {
    modalCitaActiva = cita;
    const modal = document.getElementById('cita-modal');
    
    document.getElementById('modal-codigo').textContent = cita.codigo;
    document.getElementById('modal-fecha').textContent = formatearFechaHumana(cita.fecha);
    document.getElementById('modal-hora').textContent = formatearHoraHumana(cita.hora);
    
    const inputUser = document.getElementById('modal-codigo-usuario');
    const inputInit = document.getElementById('modal-iniciales');
    const inputObs = document.getElementById('modal-observaciones');
    const selectEstado = document.getElementById('modal-estado-select');
    const switchAsistencia = document.getElementById('modal-asistencia-switch');

    inputUser.value = cita.codigoUsuario || "";
    document.getElementById('modal-hace-constar').checked = cita.haceConstar || false;
    document.getElementById('modal-vulnerabilidad').checked = cita.vulnerabilidad || false;
    inputInit.value = cita.iniciales || "";
    inputObs.value = cita.observaciones || "";
    selectEstado.value = cita.estado || "pendiente";
    switchAsistencia.checked = cita.asistencia || false;

    // Control del botón de llamar en el modal
    const btnLlamarModal = document.getElementById('btn-llamar-modal');
    if (btnLlamarModal) {
        if (isRestricted) {
            btnLlamarModal.classList.add('hidden');
        } else {
            // Consultar config del puesto para ver si mostramos el botón
            import('./firebase.js').then(async ({ getPuestoConfig }) => {
                const config = await getPuestoConfig(AppState.user.uid);
                if (config && config.activo && config.nombre) {
                    btnLlamarModal.classList.remove('hidden');
                } else {
                    btnLlamarModal.classList.add('hidden');
                }
            });
        }
    }

    // Si es modo restringido (Asignar Cita) o si ya está grabada, deshabilitamos campos
    const isGrabada = cita.estadoGrabacion === 'Grabada';
    const canAdminEdit = AppState.user.rol === 'Super_admin';
    const btnSave = document.getElementById('btn-save-cita');
    const btnAdminEdit = document.getElementById('btn-admin-edit');

    if (isGrabada) {
        inputUser.disabled = true;
        document.getElementById('modal-hace-constar').disabled = true;
        document.getElementById('modal-vulnerabilidad').disabled = true;
        inputInit.disabled = true;
        inputObs.disabled = true;
        selectEstado.disabled = true;
        switchAsistencia.disabled = true;
        
        btnSave.classList.add('hidden');
        if (canAdminEdit) {
            btnAdminEdit.classList.remove('hidden');
        } else {
            btnAdminEdit.classList.add('hidden');
        }
    } else {
        btnAdminEdit.classList.add('hidden');
        btnSave.classList.remove('hidden');
        
        if (isRestricted) {
            inputUser.disabled = true;
            document.getElementById('modal-hace-constar').disabled = false; // Permitir HC/Vuln incluso en asignación? 
            document.getElementById('modal-vulnerabilidad').disabled = false;
            inputInit.disabled = false;
            inputObs.disabled = true;
            selectEstado.disabled = true;
            switchAsistencia.disabled = false;
        } else {
            inputUser.disabled = false;
            document.getElementById('modal-hace-constar').disabled = false;
            document.getElementById('modal-vulnerabilidad').disabled = false;
            inputInit.disabled = false;
            inputObs.disabled = false;
            selectEstado.disabled = false;
            switchAsistencia.disabled = false;
        }
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

    const mesKey = `cal_mes_${AppState.sedeActivaId}_${inicioMesStr}_${finMesStr}`;
    let citasMes = cacheGet(mesKey);
    if (!citasMes) {
        citasMes = await getCitasPorSedeYRango(AppState.sedeActivaId, inicioMesStr, finMesStr);
        cacheSet(mesKey, citasMes, CAL_TTL);
    }

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

async function llamarSiguienteCita() {
    if (!AppState.sedeActivaId) return;

    // 1. Obtener config del puesto
    const { getPuestoConfig, getNextCitaParaLlamar, actualizarCitaData, Timestamp } = await import('./firebase.js');
    const config = await getPuestoConfig(AppState.user.uid);

    if (!config || !config.activo || !config.nombre) {
        alert("Primero debes configurar y activar tu puesto en 'Configurar Puesto'.");
        return;
    }

    const todayStr = formatearFecha(new Date());
    const siguiente = await getNextCitaParaLlamar(AppState.sedeActivaId, todayStr);

    if (!siguiente) {
        alert("No hay personas usuarias esperando asistencia para hoy.");
        return;
    }

    if (confirm(`¿Llamar a ${siguiente.codigo} (${formatHoraToDisplay(siguiente.hora)}) a la ${config.nombre}?`)) {
        try {
            await actualizarCitaData(siguiente.id, {
                llamada: {
                    puesto: config.nombre,
                    timestamp: Timestamp.now()
                }
            });
            updateCalendario();
            openModal(siguiente); // Abrir modal automáticamente para atender a la persona usuaria
        } catch (e) {
            console.error(e);
            alert("Error al realizar la llamada: " + e.message);
        }
    }
}
