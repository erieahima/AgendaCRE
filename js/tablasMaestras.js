// js/tablasMaestras.js
import { getAllSedes, guardarSede, invalidarCacheSedes } from './firebase.js';

export function setupTablasMaestras(appState) {
    const container = document.getElementById('sedes-cards-container');
    const btnAdd = document.getElementById('btn-show-add-sede');

    if (!container || !btnAdd) return;

    const renderSedesCards = async () => {
        try {
            const sedes = await getAllSedes();
            container.innerHTML = '';

            if (sedes.length === 0) {
                container.innerHTML = `
                    <div style="grid-column: 1/-1; padding: 3rem; text-align: center; background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 1rem;">
                        <span style="font-size: 3rem;">📍</span>
                        <h3 style="margin-top: 1rem; color: #64748b;">No hay sedes configuradas</h3>
                        <p style="color: #94a3b8;">Pulsa en "Nueva Sede" para empezar.</p>
                    </div>
                `;
                return;
            }

            sedes.forEach(sede => {
                const card = document.createElement('div');
                card.className = `sede-card ${sede.activa ? '' : 'inactiva'}`;
                card.id = `sede-card-${sede.codigoTerritorial}`;
                renderCardContent(card, sede);
                container.appendChild(card);
            });
        } catch (error) {
            console.error("Error en Tablas Maestras:", error);
            container.innerHTML = `<div class="error-msg">Error al cargar sedes.</div>`;
        }
    };

    const renderCardContent = (card, sede) => {
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
                <div class="feature-item active">
                    ✅ Gestión de Citas (Base)
                </div>
                <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 8px; border-top: 1px solid var(--border); padding-top: 8px;">
                    📍 <strong>Dirección:</strong> ${sede.direccion || 'No definida'}
                </div>
            </div>

            <div class="sede-card-actions">
                <button class="btn btn-sm btn-outline btn-edit">✏️ Editar</button>
                ${sede.activa ? `<button class="btn btn-sm btn-outline btn-delete" style="color: var(--danger); border-color: var(--danger);">🗑️ Baja</button>` : ''}
            </div>
        `;

        card.querySelector('.btn-edit').addEventListener('click', () => renderCardEditForm(card, sede));
        
        const delBtn = card.querySelector('.btn-delete');
        if (delBtn) {
            delBtn.addEventListener('click', async () => {
                if (confirm(`¿Dar de baja la sede ${sede.nombre}?`)) {
                    await guardarSede(sede.codigoTerritorial, { activa: false });
                    invalidarCacheSedes(); // v3.30.0: forzar recarga en el próximo getSedes()
                    renderSedesCards();
                    window.dispatchEvent(new CustomEvent('sedesListChanged'));
                }
            });
        }
    };

    const renderCardEditForm = (card, sede) => {
        const isNew = !sede.codigoTerritorial;
        card.classList.add('editing');
        card.innerHTML = `
            <div class="sede-edit-form" style="display: flex; flex-direction: column; gap: 1rem;">
                <div class="form-group">
                    <label style="font-size: 0.8rem; font-weight: 700;">Nombre de la Sede:</label>
                    <input type="text" id="edit-sede-nombre" class="input-modern w-full" value="${sede.nombre || ''}" placeholder="Ej. Asamblea Local...">
                </div>
                
                ${isNew ? `
                <div class="form-group">
                    <label style="font-size: 0.8rem; font-weight: 700;">Código Territorial:</label>
                    <input type="text" id="edit-sede-codigo" class="input-modern w-full" placeholder="Ej. 29XXX">
                </div>
                ` : `<div class="code-label">Editando: #${sede.codigoTerritorial}</div>`}

                <div class="form-group flex-between">
                    <label style="font-size: 0.8rem;">Sistema de Pantallas:</label>
                    <label class="switch">
                        <input type="checkbox" id="edit-sede-queuing" ${sede.hasQueuingSystem ? 'checked' : ''}>
                        <span class="slider round"></span>
                    </label>
                </div>

                <div class="form-group flex-between">
                    <label style="font-size: 0.8rem;">Sede Activa:</label>
                    <label class="switch">
                        <input type="checkbox" id="edit-sede-activa" ${sede.activa !== false ? 'checked' : ''}>
                        <span class="slider round"></span>
                    </label>
                </div>

                <div class="form-group">
                    <label style="font-size: 0.8rem; font-weight: 700;">Dirección Postal:</label>
                    <input type="text" id="edit-sede-direccion" class="input-modern w-full" value="${sede.direccion || ''}" placeholder="Ej. Calle Hospital 4, Ciudad...">
                </div>

                <div class="sede-card-actions" style="margin-top: 0.5rem;">
                    <button class="btn btn-sm btn-outline btn-cancel">Cancelar</button>
                    <button class="btn btn-sm btn-primary btn-save">Guardar Cambios</button>
                </div>
            </div>
        `;

        card.querySelector('.btn-cancel').addEventListener('click', () => {
            if (isNew) renderSedesCards();
            else {
                card.classList.remove('editing');
                renderCardContent(card, sede);
            }
        });

        card.querySelector('.btn-save').addEventListener('click', async () => {
            const nuevoNombre = document.getElementById('edit-sede-nombre').value;
            const nuevoCodigo = isNew ? document.getElementById('edit-sede-codigo').value : sede.codigoTerritorial;
            
            if (!nuevoNombre || !nuevoCodigo) {
                alert("Nombre y Código son obligatorios");
                return;
            }

            const data = {
                nombre: nuevoNombre,
                codigoTerritorial: nuevoCodigo,
                hasQueuingSystem: document.getElementById('edit-sede-queuing').checked,
                activa: document.getElementById('edit-sede-activa').checked,
                direccion: document.getElementById('edit-sede-direccion').value
            };

            await guardarSede(nuevoCodigo, data);
            invalidarCacheSedes(); // v3.30.0: forzar recarga en el próximo getSedes()
            renderSedesCards();
            window.dispatchEvent(new CustomEvent('sedesListChanged'));
        });
    };

    btnAdd.addEventListener('click', () => {
        // Crear una tarjeta temporal vacía al principio
        const placeholder = { nombre: '', codigoTerritorial: '', activa: true, hasQueuingSystem: true };
        const card = document.createElement('div');
        card.className = 'sede-card editing';
        container.prepend(card);
        renderCardEditForm(card, placeholder);
    });

    window.addEventListener('tablasViewEntered', () => {
        renderSedesCards();
    });

    renderSedesCards();
}
