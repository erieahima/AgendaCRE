import { getTodosLosUsuarios, guardarPerfilUsuario, borrarUsuarioData, invalidarCacheUsuarios } from './firebase.js';
import { crearUsuarioAutenticacion } from './auth.js';

let appStateRef = null;

export function setupUsuarios(appState) {
    appStateRef = appState;
    
    document.getElementById('btn-show-add-user').addEventListener('click', () => {
        rellenarSedesEnModal();
        document.getElementById('user-modal').classList.remove('hidden');
    });

    document.querySelectorAll('.user-modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('user-modal').classList.add('hidden');
        });
    });

    document.getElementById('form-new-user').addEventListener('submit', handleNewUser);

    renderUserList();
}

async function renderUserList() {
    const grid = document.getElementById('users-grid');
    grid.innerHTML = '<div class="col-span-full text-center">Cargando usuarios...</div>';

    try {
        const users = await getTodosLosUsuarios();
        grid.innerHTML = '';

        users.forEach(u => {
            const card = document.createElement('div');
            card.className = 'user-card';
            card.dataset.uid = u.uid;
            renderCardViewMode(card, u);
            grid.appendChild(card);
        });
    } catch (err) {
        grid.innerHTML = '<div class="col-span-full text-center" style="color: var(--danger);">Error al cargar: ' + err.message + '</div>';
    }
}

function renderCardViewMode(card, u) {
    card.classList.remove('editing');
    const isAllSedes = (u.sedesAsignadas || []).includes("ALL") || u.rol === 'Super_admin' || u.rol === 'Admin';
    
    const sedesHtml = isAllSedes 
        ? '<span class="all-sedes-tag">⭐ Acceso a Todas las Sedes</span>' 
        : (u.sedesAsignadas || []).map(s => `<span class="badge badge-neutral">${s}</span>`).join("") || '<span class="text-muted" style="font-size:0.8rem">Sin sedes asignadas</span>';

    card.innerHTML = `
        <div class="user-card-header">
            <div class="user-avatar">${u.email.charAt(0).toUpperCase()}</div>
            <div class="user-info">
                <span class="user-email" title="${u.email}">${u.email}</span>
                <span class="user-role-badge">${u.rol}</span>
            </div>
        </div>
        <div class="user-sedes-list">
            ${sedesHtml}
        </div>
        <div class="user-card-actions">
            <button class="btn-icon edit-btn" title="Editar">✏️</button>
            ${u.rol !== 'Super_admin' ? `<button class="btn-icon delete-btn" title="Borrar" style="border-color: var(--danger-bg); color: var(--danger);">🗑️</button>` : ''}
        </div>
    `;

    card.querySelector('.edit-btn').addEventListener('click', () => renderCardEditMode(card, u));
    
    const delBtn = card.querySelector('.delete-btn');
    if (delBtn) {
        delBtn.addEventListener('click', async () => {
            if (confirm(`¿Eliminar perfil de ${u.email}?`)) {
                await borrarUsuarioData(u.uid);
                invalidarCacheUsuarios(); // v3.30.0: la próxima carga será fresca
                renderUserList();
            }
        });
    }
}

function renderCardEditMode(card, u) {
    card.classList.add('editing');
    const roles = ['Super_admin', 'Admin', 'Operador', 'Cita', 'Grabador', 'pantalla'];
    const roleOptions = roles.map(r => `<option value="${r}" ${u.rol === r ? 'selected' : ''}>${r}</option>`).join("");
    
    const isAllSedes = (u.sedesAsignadas || []).includes("ALL");

    card.innerHTML = `
        <div class="user-card-header">
            <div class="user-avatar" style="background:var(--primary); color:white">📝</div>
            <div class="user-info">
                <span class="user-email">${u.email}</span>
                <select class="input-modern edit-rol" style="width: 100%; margin-top: 5px; height: 30px; font-size: 0.8rem;">
                    ${roleOptions}
                </select>
            </div>
        </div>
        <div class="edit-body" style="padding: 0.5rem 0;">
            <label style="font-size: 0.8rem; font-weight: 700; display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <input type="checkbox" class="check-all-sedes" ${isAllSedes || u.rol === 'Super_admin' || u.rol === 'Admin' ? 'checked' : ''} 
                    ${u.rol === 'Super_admin' || u.rol === 'Admin' ? 'disabled' : ''}>
                Acceso a todas las sedes
            </label>
            <select class="input-modern edit-sedes" multiple style="width: 100%; height: 80px; font-size: 0.8rem;" 
                ${isAllSedes || u.rol === 'Super_admin' || u.rol === 'Admin' ? 'disabled' : ''}>
                ${appStateRef.sedes.map(s => {
                    const selected = (u.sedesAsignadas || []).includes(s.codigoTerritorial) ? 'selected' : '';
                    return `<option value="${s.codigoTerritorial}" ${selected}>${s.codigoTerritorial} - ${s.nombre}</option>`;
                }).join("")}
            </select>
        </div>
        <div class="user-card-actions">
            <button class="btn-icon save-btn" title="Guardar">💾</button>
            <button class="btn-icon cancel-btn" title="Cancelar">❌</button>
        </div>
    `;

    const selectRol = card.querySelector('.edit-rol');
    const selectSedes = card.querySelector('.edit-sedes');
    const checkAll = card.querySelector('.check-all-sedes');

    selectRol.addEventListener('change', () => {
        const isAdmin = selectRol.value === 'Super_admin' || selectRol.value === 'Admin';
        if (isAdmin) {
            checkAll.checked = true;
            checkAll.disabled = true;
            selectSedes.disabled = true;
        } else {
            checkAll.disabled = false;
            selectSedes.disabled = checkAll.checked;
        }
    });

    checkAll.addEventListener('change', () => {
        selectSedes.disabled = checkAll.checked;
    });

    card.querySelector('.cancel-btn').addEventListener('click', () => renderCardViewMode(card, u));
    
    card.querySelector('.save-btn').addEventListener('click', async (e) => {
        const newRol = selectRol.value;
        let newSedes = [];
        
        if (newRol === 'Super_admin' || newRol === 'Admin' || checkAll.checked) {
            newSedes = ["ALL"];
        } else {
            newSedes = Array.from(selectSedes.selectedOptions).map(opt => opt.value);
        }

        const btn = e.target;
        btn.textContent = "⌛";
        btn.disabled = true;

        try {
            const updatedData = { ...u, rol: newRol, sedesAsignadas: newSedes };
            await guardarPerfilUsuario(u.uid, updatedData);
            renderCardViewMode(card, updatedData);
        } catch (err) {
            alert("Error: " + err.message);
            renderCardEditMode(card, u);
        }
    });
}

async function handleNewUser(e) {
    e.preventDefault();
    const email = document.getElementById('new-user-email').value;
    const pass = document.getElementById('new-user-pass').value;
    const rol = document.getElementById('new-user-rol').value;
    const sedesSource = document.getElementById('new-user-sedes');
    const sedesAsignadas = Array.from(sedesSource.selectedOptions).map(opt => opt.value);

    // TODO: En el modal también se debería añadir la opción "Todas"
    // Por ahora hereda el comportamiento si es Admin

    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.textContent = "Creando...";

    try {
        const uid = await crearUsuarioAutenticacion(email, pass);
        await guardarPerfilUsuario(uid, {
            email,
            rol,
            sedesAsignadas: (rol === 'Super_admin' || rol === 'Admin') ? ["ALL"] : sedesAsignadas
        });

        invalidarCacheUsuarios(); // v3.30.0: forzar recarga en el próximo getTodosLosUsuarios()
        alert("Usuario creado con éxito.");
        document.getElementById('user-modal').classList.add('hidden');
        e.target.reset();
        renderUserList();
    } catch (err) {
        alert("Error al crear usuario: " + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = "Crear Usuario";
    }
}

function rellenarSedesEnModal() {
    const select = document.getElementById('new-user-sedes');
    select.innerHTML = '';
    // Añadimos opción 'Todas' al modal también (V.3.22.0)
    const optAll = document.createElement('option');
    optAll.value = "ALL";
    optAll.textContent = "⭐ TODAS LAS SEDES (Evolutivo)";
    select.appendChild(optAll);

    appStateRef.sedes.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.codigoTerritorial;
        opt.textContent = `${s.codigoTerritorial} - ${s.nombre}`;
        select.appendChild(opt);
    });
}
