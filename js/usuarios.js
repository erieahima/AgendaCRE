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
    tbody.innerHTML = '<tr><td colspan="4">Cargando usuarios...</td></tr>';

    try {
        const users = await getTodosLosUsuarios();
        tbody.innerHTML = '';

        users.forEach(u => {
            const tr = document.createElement('tr');
            const sedesStr = u.rol === 'Super_admin' || u.rol === 'Admin' 
                ? '<i>Todas las sedes</i>' 
                : (u.sedesAsignadas || []).join(", ") || 'Ninguna';

            tr.innerHTML = `
                <td>${u.email}</td>
                <td><span class="badge">${u.rol}</span></td>
                <td style="font-size:0.8rem">${sedesStr}</td>
                <td>
                    <button class="btn-secondary btn-sm" onclick="alert('Configuración de edición en próxima versión')">✏️</button>
                    ${u.rol !== 'Super_admin' ? `<button class="btn-danger btn-sm ml-1" data-uid="${u.uid}">🗑️</button>` : ''}
                </td>
            `;
            
            // Evento borrar (parcial, solo borra data de Firestore para habilitar re-creación)
            const deleteBtn = tr.querySelector('.btn-danger');
            if(deleteBtn) {
                deleteBtn.addEventListener('click', async () => {
                    if(confirm("¿Seguro que quieres borrar este perfil? (Nota: Seguirá existiendo en Auth)")) {
                        await borrarUsuarioData(u.uid);
                        renderUserList();
                    }
                });
            }

            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="4">Error al cargar: ' + err.message + '</td></tr>';
    }
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
        // 1. Crear en Firebase Auth (Secondary instance)
        const uid = await crearUsuarioAutenticacion(email, pass);

        // 2. Crear perfil en Firestore
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
