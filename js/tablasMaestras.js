// js/tablasMaestras.js
import { getAllSedes, guardarSede } from './firebase.js';

export function setupTablasMaestras(appState) {
    const container = document.getElementById('sedes-cards-container');
    const btnAdd = document.getElementById('btn-show-add-sede');

    if (!container || !btnAdd) return;

    const renderSedesCards = async () => {
        const sedes = await getAllSedes();
        container.innerHTML = '';

        sedes.forEach(sede => {
            const card = document.createElement('div');
            card.className = `sede-card ${sede.activa ? '' : 'inactiva'}`;
            
            card.innerHTML = `
                <div class="sede-card-header">
                    <div>
                        <h3>${sede.nombre}</h3>
                        <span class="code-label">#${sede.codigoTerritorial}</span>
                    </div>
                    <span class="badge ${sede.activa ? 'badge-success' : 'badge-danger'}">
                        ${sede.activa ? 'Activa' : 'Baja'}
                    </span>
                </div>

                <div class="sede-features-list">
                    <div class="feature-item ${sede.hasQueuingSystem ? 'active' : ''}">
                        ${sede.hasQueuingSystem ? '✅' : '❌'} Sistema de Pantalla y Turnos
                    </div>
                </div>

                <div class="sede-card-actions">
                    <button class="btn btn-sm btn-outline btn-edit" title="Editar Sede">✏️ Editar</button>
                    ${sede.activa ? `<button class="btn btn-sm btn-outline btn-delete" style="color: var(--danger); border-color: var(--danger);" title="Dar de baja">🗑️ Baja</button>` : ''}
                </div>
            `;

            // Vincular acciones
            card.querySelector('.btn-edit').addEventListener('click', () => editSedeModal(sede));
            
            const delBtn = card.querySelector('.btn-delete');
            if (delBtn) {
                delBtn.addEventListener('click', async () => {
                    if (confirm(`¿Dar de baja la sede ${sede.nombre}?`)) {
                        await guardarSede(sede.codigoTerritorial, { activa: false });
                        renderSedesCards();
                        window.dispatchEvent(new CustomEvent('sedesListChanged'));
                    }
                });
            }

            container.appendChild(card);
        });
    };

    const editSedeModal = (sede = null) => {
        // En una versión más avanzada usaríamos un modal real del DOM. 
        // Para rapidez y robustez ahora mismo, usamos prompts con validación.
        const nombre = prompt("Nombre de la Sede:", sede ? sede.nombre : "");
        if (nombre === null) return;
        
        const codigo = sede ? sede.codigoTerritorial : prompt("Código Territorial (Identificador único):", "");
        if (codigo === null || codigo === "") return;

        const hasQueuing = confirm("¿Habilitar Sistema de Pantalla/Turnos para esta sede?");
        const isActiva = sede ? confirm("¿La sede está activa actualmente?") : true;

        const data = {
            nombre: nombre,
            codigoTerritorial: codigo,
            activa: isActiva,
            hasQueuingSystem: hasQueuing
        };

        guardarSede(codigo, data).then(() => {
            renderSedesCards();
            window.dispatchEvent(new CustomEvent('sedesListChanged'));
        });
    };

    btnAdd.addEventListener('click', () => editSedeModal());

    renderSedesCards();
}
