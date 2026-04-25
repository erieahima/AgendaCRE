// js/tablasMaestras.js
import { getAllSedes, guardarSede, borrarSede } from './firebase.js';

export function setupTablasMaestras(appState) {
    const tbody = document.getElementById('sedes-tbody');
    const btnAdd = document.getElementById('btn-show-add-sede');

    if (!tbody || !btnAdd) return;

    const renderSedesTable = async () => {
        const sedes = await getAllSedes();
        tbody.innerHTML = '';

        sedes.forEach(sede => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${sede.nombre}</td>
                <td>${sede.codigoTerritorial}</td>
                <td>
                    <span class="badge ${sede.hasQueuingSystem ? 'badge-success' : 'badge-neutral'}">
                        ${sede.hasQueuingSystem ? 'Activo' : 'Inactivo'}
                    </span>
                </td>
                <td>
                    <span class="badge ${sede.activa ? 'badge-success' : 'badge-danger'}">
                        ${sede.activa ? 'Activa' : 'Baja'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm btn-edit" data-id="${sede.id}">✏️</button>
                    ${sede.activa ? `<button class="btn btn-sm btn-delete" data-id="${sede.id}">🗑️</button>` : ''}
                </td>
            `;

            // Botón Editar
            tr.querySelector('.btn-edit').addEventListener('click', () => editSede(sede));
            
            // Botón Borrar (Baja lógica)
            const delBtn = tr.querySelector('.btn-delete');
            if (delBtn) {
                delBtn.addEventListener('click', async () => {
                    if (confirm(`¿Dar de baja la sede ${sede.nombre}?`)) {
                        await guardarSede(sede.id, { activa: false });
                        renderSedesTable();
                        // Notificar a la app que las sedes han cambiado
                        window.dispatchEvent(new CustomEvent('sedesListChanged'));
                    }
                });
            }

            tbody.appendChild(tr);
        });
    };

    const editSede = (sede = null) => {
        const nombre = prompt("Nombre de la Sede:", sede ? sede.nombre : "");
        if (nombre === null) return;
        
        const codigo = prompt("Código Territorial (ID):", sede ? sede.codigoTerritorial : "");
        if (codigo === null) return;

        const hasQueuing = confirm("¿Deseas habilitar el Sistema de Pantalla/Turnos para esta sede?");
        
        const data = {
            nombre: nombre,
            codigoTerritorial: codigo,
            activa: true,
            hasQueuingSystem: hasQueuing
        };

        guardarSede(codigo, data).then(() => {
            renderSedesTable();
            window.dispatchEvent(new CustomEvent('sedesListChanged'));
        });
    };

    btnAdd.addEventListener('click', () => editSede());

    // Carga inicial
    renderSedesTable();
}
