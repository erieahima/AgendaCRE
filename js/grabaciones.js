import { listenCitasTerminadas, actualizarCitaData } from './firebase.js';

let appStateRef = null;
let unsubscribeGrabaciones = null;

export function setupGrabaciones(appState) {
    appStateRef = appState;
    
    // Iniciar listener en tiempo real
    if (unsubscribeGrabaciones) unsubscribeGrabaciones();
    
    unsubscribeGrabaciones = listenCitasTerminadas((citas) => {
        renderGrabacionesList(citas);
    });
}

function renderGrabacionesList(citas) {
    const tbody = document.getElementById('grabaciones-tbody');
    if (!tbody) return;

    // Filtro en cliente: Excluimos las que ya están grabadas 
    const citasFiltradas = citas.filter(c => c.estadoGrabacion !== 'Grabada');

    // Ordenar por fecha y hora
    citasFiltradas.sort((a, b) => {
        const dateCompare = a.fecha.localeCompare(b.fecha);
        if (dateCompare !== 0) return dateCompare;
        return a.hora.localeCompare(b.hora);
    });

    if (citasFiltradas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding: 3rem;">No hay citas terminadas pendientes de grabación. ✨</td></tr>';
        return;
    }

    tbody.innerHTML = '';

    citasFiltradas.forEach(cita => {
        const tr = document.createElement('tr');
        aplicarClaseFila(tr, cita.estadoGrabacion);

        tr.innerHTML = `
            <td><div style="font-weight: 600; color: var(--text-main);">${formatearFechaLarga(cita.fecha)}</div><div style="font-size: 0.8rem; color: var(--text-muted);">${cita.hora}h</div></td>
            <td><span class="badge" style="background: #f1f5f9; color: #475569; font-family: monospace;">${cita.codigo}</span></td>
            <td><strong>${cita.codigoUsuario || '---'}</strong></td>
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

        const select = tr.querySelector('.select-estado-grabacion');
        
        // Cambio inmediato para "Inicia grabación" (Coordinación)
        select.addEventListener('change', async (e) => {
            const nuevoEstado = e.target.value;
            aplicarClaseFila(tr, nuevoEstado);

            if (nuevoEstado === 'Inicia grabación') {
                try {
                    await actualizarCitaData(cita.codigo, { estadoGrabacion: nuevoEstado });
                    // No hace falta alert, el onSnapshot actualizará a los demás
                } catch (err) {
                    console.error("Error sincronizando inicio:", err);
                }
            }
        });

        // Guardar manual para el resto
        const saveBtn = tr.querySelector('.btn-guardar-grabacion');
        saveBtn.addEventListener('click', async () => {
            const nuevoEstado = select.value;
            saveBtn.disabled = true;
            saveBtn.textContent = "...";

            try {
                await actualizarCitaData(cita.codigo, { estadoGrabacion: nuevoEstado });
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

function formatearFechaLarga(fechaStr) {
    const [y, m, d] = fechaStr.split('-');
    const fecha = new Date(y, m - 1, d);
    return fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}
