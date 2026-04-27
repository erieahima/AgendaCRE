import { listenCitasTerminadas, actualizarCitaData, Timestamp } from './firebase.js';
import { formatearFechaHumana, formatearHoraHumana } from './utils.js';

let appStateRef = null;
let unsubscribeGrabaciones = null;

export function setupGrabaciones(appState) {
    appStateRef = appState;
    
    // Iniciar listener en tiempo real filtrado por sede
    conectarListenerPorSede(appState.sedeActivaId);

    // Escuchar cambios de sede para reiniciar el listener
    window.addEventListener('sedeChanged', (e) => {
        conectarListenerPorSede(e.detail);
    });
}

function conectarListenerPorSede(sedeId) {
    if (unsubscribeGrabaciones) unsubscribeGrabaciones();
    
    unsubscribeGrabaciones = listenCitasTerminadas(sedeId, (citas) => {
        renderGrabacionesList(citas);
    });
}

function renderGrabacionesList(citas) {
    const tbody = document.getElementById('grabaciones-tbody');
    if (!tbody) return;

    // Filtro en cliente: Excluimos las que ya están grabadas o tienen incidencia
    const citasFiltradas = citas.filter(c => c.estadoGrabacion !== 'Grabada' && c.estadoGrabacion !== 'Incidencia');

    // Ordenar por fecha y hora
    citasFiltradas.sort((a, b) => {
        const dateCompare = a.fecha.localeCompare(b.fecha);
        if (dateCompare !== 0) return dateCompare;
        return a.hora.localeCompare(b.hora);
    });

    if (citasFiltradas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center" style="padding: 3rem;">No hay citas terminadas pendientes de grabación. ✨</td></tr>';
        return;
    }

    const ahora = Date.now();
    const UNA_HORA = 3600000;

    tbody.innerHTML = '';

    citasFiltradas.forEach(cita => {
        // V.3.15.0: Autocomprobación de caducidad de estado 'Inicia grabación' (1h)
        if (cita.estadoGrabacion === 'Inicia grabación' && cita.estadoGrabacionTimestamp) {
            const ts = cita.estadoGrabacionTimestamp.toMillis ? cita.estadoGrabacionTimestamp.toMillis() : cita.estadoGrabacionTimestamp;
            if (ahora - ts > UNA_HORA) {
                console.log(`Estado caducado para cita ${cita.codigo}. Revirtiendo a Pendiente...`);
                actualizarCitaData(cita.id, { 
                    estadoGrabacion: 'Pendiente', 
                    estadoGrabacionTimestamp: null 
                });
                return; // El listener actualizará la vista
            }
        }

        const tr = document.createElement('tr');
        aplicarClaseFila(tr, cita.estadoGrabacion);

        tr.innerHTML = `
            <td>
                <div style="font-weight: 600; color: var(--text-main);">${formatearFechaHumana(cita.fecha)}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">${formatearHoraHumana(cita.hora)}</div>
            </td>
            <td><span class="badge" title="${cita.codigo}" style="background: #f1f5f9; color: #475569; font-family: monospace;">${cita.codigo.slice(-3)}</span></td>
            <td><strong>${cita.iniciales || '---'}</strong></td>
            <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <strong id="user-code-${cita.id}" style="font-size: 0.9rem;">${cita.codigoUsuario || '---'}</strong>
                    ${cita.codigoUsuario ? `<button class="btn-copy-code" data-code="${cita.codigoUsuario}" style="background:none; border:none; cursor:pointer; font-size: 1rem; padding: 2px;" title="Copiar código">📋</button>` : ''}
                </div>
            </td>
            <td class="text-center">
                <div style="width: 18px; height: 18px; background: ${cita.haceConstar ? '#22c55e' : '#fff'}; border-radius: 4px; margin: 0 auto; border: 1px solid ${cita.haceConstar ? '#16a34a' : '#cbd5e1'}; box-shadow: inset 0 1px 2px rgba(0,0,0,0.05);"></div>
            </td>
            <td class="text-center">
                <div style="width: 18px; height: 18px; background: ${cita.vulnerabilidad ? '#22c55e' : '#fff'}; border-radius: 4px; margin: 0 auto; border: 1px solid ${cita.vulnerabilidad ? '#16a34a' : '#cbd5e1'}; box-shadow: inset 0 1px 2px rgba(0,0,0,0.05);"></div>
            </td>
            <td style="max-width: 250px; font-size: 0.85rem; color: #64748b; line-height: 1.4;">${cita.observaciones || '<i style="color:#cbd5e1">Sin observaciones</i>'}</td>
            <td>
                <select class="input-modern select-estado-grabacion" style="width: 160px; font-weight: 500;">
                    <option value="Pendiente" ${cita.estadoGrabacion === 'Pendiente' ? 'selected' : ''}>⏳ Pendiente</option>
                    <option value="Inicia grabación" ${cita.estadoGrabacion === 'Inicia grabación' ? 'selected' : ''}>🟠 Inicia grabación</option>
                    <option value="Incidencia" ${cita.estadoGrabacion === 'Incidencia' ? 'selected' : ''}>🔴 Incidencia</option>
                    <option value="Grabada" ${cita.estadoGrabacion === 'Grabada' ? 'selected' : ''}>✅ Grabada</option>
                </select>
            </td>
            <td>
                <button class="btn-primary btn-sm btn-guardar-grabacion" style="padding: 6px 16px;">Guardar</button>
            </td>
        `;

        // Lógica de copia
        const btnCopy = tr.querySelector('.btn-copy-code');
        if (btnCopy) {
            btnCopy.addEventListener('click', async () => {
                const code = btnCopy.getAttribute('data-code');
                navigator.clipboard.writeText(code);
                const originalText = btnCopy.textContent;
                btnCopy.textContent = '✅';
                
                // V.3.7.8: Cambiar estado automáticamente al copiar el código
                if (cita.estadoGrabacion !== 'Inicia grabación') {
                    // Feedback visual inmediato (V.3.23.1)
                    aplicarClaseFila(tr, 'Inicia grabación');
                    const sel = tr.querySelector('.select-estado-grabacion');
                    if (sel) sel.value = 'Inicia grabación';

                    try {
                        const idParaUpdate = cita.id || cita.codigo;
                        await actualizarCitaData(idParaUpdate, { 
                            estadoGrabacion: 'Inicia grabación',
                            estadoGrabacionTimestamp: Timestamp.now()
                        });
                    } catch (err) {
                        console.error("Error al actualizar estado tras copia:", err);
                        // V.3.23.2: Mostrar error detallado para diagnóstico
                        alert("Error de permisos en Firebase: " + err.message + "\n\nPor favor, cambie el estado a 'Inicia grabación' y dele a 'Guardar' manualmente.");
                        aplicarClaseFila(tr, cita.estadoGrabacion || 'Pendiente');
                        if (sel) sel.value = cita.estadoGrabacion || 'Pendiente';
                    }
                }

                setTimeout(() => { btnCopy.textContent = originalText; }, 1500);
            });
        }

        // V.3.16.2: Permitir abrir modal al pulsar en la fila
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', (e) => {
            // Evitar abrir modal si pulsamos en el botón de copiar, el select o el botón de guardar
            if (e.target.closest('button') || e.target.closest('select')) return;
            import('./calendario.js').then(m => m.openModal(cita));
        });

        const select = tr.querySelector('.select-estado-grabacion');
        
        // Cambio inmediato para TODOS los estados (evita inconsistencias y doble clic)
        select.addEventListener('change', async (e) => {
            const nuevoEstado = e.target.value;

            // V.3.18.0: Confirmación para pasar a 'Grabada'
            if (nuevoEstado === 'Grabada') {
                const ok = confirm("¿Está seguro/a que desea grabar la ficha como terminada?");
                if (!ok) {
                    select.value = cita.estadoGrabacion || 'Pendiente';
                    aplicarClaseFila(tr, select.value);
                    return;
                }
            }

            // V.3.18.0: Gestión de Incidencia con motivo obligatorio
            if (nuevoEstado === 'Incidencia') {
                const motivo = prompt("Por favor, indique el motivo de la incidencia:");
                if (!motivo) {
                    select.value = cita.estadoGrabacion || 'Pendiente';
                    aplicarClaseFila(tr, select.value);
                    return;
                }
                const nuevasObs = `${cita.observaciones || ''}\n[INCIDENCIA]: ${motivo}`.trim();
                try {
                    await actualizarCitaData(cita.id, { 
                        estadoGrabacion: 'Incidencia',
                        observaciones: nuevasObs,
                        estadoGrabacionTimestamp: null
                    });
                    alert("Cita marcada como incidencia y movida al histórico.");
                    return;
                } catch (err) {
                    alert("Error al guardar incidencia: " + err.message);
                    return;
                }
            }

            aplicarClaseFila(tr, nuevoEstado);

            try {
                const patch = { 
                    estadoGrabacion: nuevoEstado,
                    estadoGrabacionTimestamp: (nuevoEstado === 'Inicia grabación') ? Timestamp.now() : null
                };
                await actualizarCitaData(cita.codigo || cita.id, patch);
            } catch (err) {
                console.error("Error sincronizando estado:", err);
            }
        });

        // Guardar manual para el resto
        const saveBtn = tr.querySelector('.btn-guardar-grabacion');
        saveBtn.addEventListener('click', async () => {
            const nuevoEstado = select.value;
            const codigoUsuario = cita.codigoUsuario || '';

            // V.3.17.0: Validación de código de usuario numérico para estado 'terminada'
            if (nuevoEstado === 'Grabada') {
                if (!codigoUsuario.trim() || !/^\d+$/.test(codigoUsuario.trim())) {
                    alert("Atención: El código de usuario debe contener únicamente números para poder marcar la cita como terminada.");
                    return;
                }
            }

            saveBtn.disabled = true;
            saveBtn.textContent = "...";

            try {
                await actualizarCitaData(cita.id, { estadoGrabacion: nuevoEstado });
                if (nuevoEstado === 'Grabada') {
                    // El listener lo quitará de la vista automáticamente
                } else {
                    alert("Estado actualizado con éxito.");
                }
            } catch (err) {
                alert("Error al guardar: " + err.message);
            } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = "Guardar";
            }
        });

        tbody.appendChild(tr);
    });
}

function aplicarClaseFila(tr, estado) {
    tr.className = ''; 
    switch(estado) {
        case 'Inicia grabación': tr.className = 'row-inicia'; break;
        case 'Incidencia': tr.className = 'row-incid'; break;
        case 'Grabada': tr.className = 'row-grabada'; break;
        default: tr.className = 'row-pend'; break;
    }
}
