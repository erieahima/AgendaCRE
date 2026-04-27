import { getTodosLosUsuarios, guardarPerfilUsuario, borrarUsuarioData } from './firebase.js';
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
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center">Cargando usuarios...</td></tr>';

    try {
        const users = await getTodosLosUsuarios();
        tbody.innerHTML = '';

        users.forEach(u => {
            const tr = document.createElement('tr');
            tr.dataset.uid = u.uid;
            renderRowViewMode(tr, u);
            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="color: var(--danger);">Error al cargar: ' + err.message + '</td></tr>';
    }
}

function renderRowViewMode(tr, u) {
    const sedesStr = u.rol === 'Super_admin' || u.rol === 'Admin' 
        ? '<span class="badge badge-success">Acceso Total</span>' 
        : (u.sedesAsignadas || []).map(s => `<span class="badge badge-neutral" style="margin-right:2px">${s}</span>`).join("") || '<span class="text-muted">Sin sedes</span>';

    tr.innerHTML = `
        <td style="font-weight:600; color: var(--primary);">${u.email}</td>
        <td><span class="badge" style="background:var(--secondary); color:var(--text-main); text-transform: uppercase; font-size:0.7rem">${u.rol}</span></td>
        <td>${sedesStr}</td>
        <td style="text-align: center;">
            <div style="display: flex; gap: 8px; justify-content: center;">
                <button class="btn-icon edit-btn" title="Editar">✏️</button>
                ${u.rol !== 'Super_admin' ? `<button class="btn-icon delete-btn" title="Borrar" style="border-color: var(--danger-bg); color: var(--danger);">🗑️</button>` : ''}
            </div>
        </td>
    `;

    tr.querySelector('.edit-btn').addEventListener('click', () => renderRowEditMode(tr, u));
    
    const delBtn = tr.querySelector('.delete-btn');
    if (delBtn) {
        delBtn.addEventListener('click', async () => {
            if (confirm(`¿Estás seguro de que deseas eliminar el perfil de ${u.email}?`)) {
                await borrarUsuarioData(u.uid);
                renderUserList();
            }
        });
    }
}

function renderRowEditMode(tr, u) {
    const roles = ['Super_admin', 'Admin', 'Operador', 'Cita', 'Grabador', 'pantalla'];
    
    const roleOptions = roles.map(r => `<option value="${r}" ${u.rol === r ? 'selected' : ''}>${r}</option>`).join("");
    
    // Lista de sedes para selección múltiple (compacta)
    const sedeOptions = appStateRef.sedes.map(s => {
        const selected = (u.sedesAsignadas || []).includes(s.codigoTerritorial) ? 'selected' : '';
        return `<option value="${s.codigoTerritorial}" ${selected}>${s.codigoTerritorial} - ${s.nombre}</option>`;
    }).join("");

    tr.innerHTML = `
        <td><input type="text" class="input-modern w-full" value="${u.email}" readonly style="background: #f1f5f9; cursor: not-allowed; font-size: 0.9rem;"></td>
        <td>
            <select class="input-modern w-full edit-rol" style="font-size: 0.9rem; padding: 5px;">
                ${roleOptions}
            </select>
        </td>
        <td>
            <select class="input-modern w-full edit-sedes" multiple style="height: 60px; font-size: 0.8rem; padding: 5px;">
                ${u.rol === 'Super_admin' || u.rol === 'Admin' 
                    ? '<option disabled selected>-- Acceso Total --</option>' 
                    : sedeOptions}
            </select>
            <small class="text-muted" style="font-size: 10px;">Mantén Ctrl+Click para varios</small>
        </td>
        <td style="text-align: center;">
            <div style="display: flex; gap: 8px; justify-content: center;">
                <button class="btn-icon save-btn" title="Guardar" style="border-color: var(--success); color: var(--success);">💾</button>
                <button class="btn-icon cancel-btn" title="Cancelar">❌</button>
            </div>
        </td>
    `;

    // Lógica para deshabilitar sedes según rol en vivo
    const selectRol = tr.querySelector('.edit-rol');
    const selectSedes = tr.querySelector('.edit-sedes');
    
    selectRol.addEventListener('change', () => {
        if (selectRol.value === 'Super_admin' || selectRol.value === 'Admin') {
            selectSedes.innerHTML = '<option disabled selected>-- Acceso Total --</option>';
            selectSedes.disabled = true;
        } else {
            selectSedes.disabled = false;
            selectSedes.innerHTML = appStateRef.sedes.map(s => {
                const selected = (u.sedesAsignadas || []).includes(s.codigoTerritorial) ? 'selected' : '';
                return `<option value="${s.codigoTerritorial}" ${selected}>${s.codigoTerritorial} - ${s.nombre}</option>`;
            }).join("");
        }
    });

    tr.querySelector('.cancel-btn').addEventListener('click', () => renderRowViewMode(tr, u));
    
    tr.querySelector('.save-btn').addEventListener('click', async (e) => {
        const newRol = selectRol.value;
        let newSedes = [];
        if (newRol !== 'Super_admin' && newRol !== 'Admin') {
            newSedes = Array.from(selectSedes.selectedOptions).map(opt => opt.value);
        }

        const btn = e.target;
        btn.textContent = "⏳";
        btn.disabled = true;

        try {
            const updatedData = { ...u, rol: newRol, sedesAsignadas: newSedes };
            await guardarPerfilUsuario(u.uid, updatedData);
            renderRowViewMode(tr, updatedData);
        } catch (err) {
            alert("Error al guardar: " + err.message);
            renderRowEditMode(tr, u);
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

    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.textContent = "Creando...";

    try {
        const uid = await crearUsuarioAutenticacion(email, pass);
        await guardarPerfilUsuario(uid, {
            email,
            rol,
            sedesAsignadas
        });

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
    appStateRef.sedes.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.codigoTerritorial;
        opt.textContent = `${s.codigoTerritorial} - ${s.nombre}`;
        select.appendChild(opt);
    });
}
