import { getCitasTerminadas, actualizarCitaData } from './firebase.js';

let appStateRef = null;

export function setupGrabaciones(appState) {
    appStateRef = appState;
    renderGrabacionesList();
}

export async function renderGrabacionesList() {
    const tbody = document.getElementById('grabaciones-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="6">Cargando citas terminadas...</td></tr>';

    try {
        const citas = await getCitasTerminadas();
        
        // Ordenar por fecha (YYYY-MM-DD) y hora
        citas.sort((a, b) => {
            const dateCompare = a.fecha.localeCompare(b.fecha);
            if (dateCompare !== 0) return dateCompare;
            return a.hora.localeCompare(b.hora);
        });

        tbody.innerHTML = '';

        if (citas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No hay citas terminadas pendientes de grabación.</td></tr>';
            return;
        }

        citas.forEach(cita => {
            const tr = document.createElement('tr');
            
            // Establecer clase según estado actual (si tuviera incidencia previa)
            if (cita.estadoGrabacion === 'Incidencia') tr.classList.add('row-error');

            tr.innerHTML = `
                <td>${cita.fecha}</td>
                <td><strong>${cita.codigo}</strong></td>
                <td>${cita.codigoUsuario || '---'}</td>
                <td>${cita.observaciones || ''}</td>
                <td>
                    <select class="input-modern select-estado-grabacion" style="width: 130px;">
                        <option value="Pendiente" ${cita.estadoGrabacion === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
                        <option value="Incidencia" ${cita.estadoGrabacion === 'Incidencia' ? 'selected' : ''}>Incidencia</option>
                        <option value="Grabada" ${cita.estadoGrabacion === 'Grabada' ? 'selected' : ''}>Grabada</option>
                    </select>
                </td>
                <td>
                    <button class="btn-primary btn-sm btn-guardar-grabacion" data-codigo="${cita.codigo}">Guardar</button>
                </td>
            `;

            // Estilos de fila dinámicos al cambiar el select (preview)
            const select = tr.querySelector('.select-estado-grabacion');
            select.addEventListener('change', (e) => {
                tr.style.backgroundColor = ''; 
                if (e.target.value === 'Incidencia') {
                    tr.style.backgroundColor = '#fee2e2'; // Rojo suave
                } else if (e.target.value === 'Grabada') {
                    tr.style.backgroundColor = '#dcfce7'; // Verde suave
                }
            });

            // Evento Guardar
            const saveBtn = tr.querySelector('.btn-guardar-grabacion');
            saveBtn.addEventListener('click', async () => {
                const nuevoEstado = select.value;
                saveBtn.disabled = true;
                saveBtn.textContent = "...";

                try {
                    await actualizarCitaData(cita.codigo, {
                        estadoGrabacion: nuevoEstado
                    });

                    if (nuevoEstado === 'Grabada') {
                        tr.remove(); // Desaparece del listado
                        if (tbody.children.length === 0) {
                            tbody.innerHTML = '<tr><td colspan="6">No hay citas terminadas pendientes de grabación.</td></tr>';
                        }
                    } else if (nuevoEstado === 'Incidencia') {
                        tr.style.backgroundColor = '#fee2e2';
                        alert("Cita marcada con incidencia.");
                    } else {
                        tr.style.backgroundColor = '';
                    }
                } catch (err) {
                    alert("Error al actualizar: " + err.message);
                } finally {
                    saveBtn.disabled = false;
                    saveBtn.textContent = "Guardar";
                }
            });

            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="6">Error al cargar listado: ' + err.message + '</td></tr>';
    }
}
