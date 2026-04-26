import { 
    auth, signInWithEmailAndPassword, signOut, onAuthStateChanged, getUsuarioData, 
    firebaseConfig, initializeApp, getAuth, createUserWithEmailAndPassword 
} from './firebase.js';
import { cacheClear } from './cache.js';

let currentUserProfile = null;

/**
 * Crea un usuario en Firebase Auth sin cerrar la sesión actual de Admin.
 * Usa una instancia secundaria de Firebase App.
 */
export async function crearUsuarioAutenticacion(email, password) {
    const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp_" + Date.now());
    const secondaryAuth = getAuth(secondaryApp);
    try {
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        const uid = userCredential.user.uid;
        // Cerrar sesión del secundario inmediatamente
        await signOut(secondaryAuth);
        return uid;
    } catch (error) {
        throw error;
    }
}

export function initAuth(onUserReady) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Usuario autenticado, obtener perfil
            currentUserProfile = await getUsuarioData(user.uid);
            
            if (currentUserProfile) {
                currentUserProfile.uid = user.uid; // Añadir UID para uso en otras funciones
                document.getElementById('login-screen').classList.add('hidden');
                document.getElementById('app-layout').classList.remove('hidden-access');
                onUserReady(currentUserProfile);
            } else {
                alert("Error: Usuario autenticado pero sin perfil en base de datos.");
                await logout();
            }
        } else {
            // Usuario no autenticado
            currentUserProfile = null;
            document.getElementById('login-screen').classList.remove('hidden');
            document.getElementById('app-layout').classList.add('hidden-access');
        }
    });

    // Evento login
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-pass').value;
        const btn = e.target.querySelector('button');
        
        btn.disabled = true;
        btn.textContent = "Entrando...";

        try {
            await signInWithEmailAndPassword(auth, email, pass);
        } catch (error) {
            alert("Error al entrar: " + error.message);
            btn.disabled = false;
            btn.textContent = "Iniciar Sesión";
        }
    });

    // Evento logout (si existe botón)
    const logoutBtn = document.getElementById('btn-logout');
    if(logoutBtn) {
        logoutBtn.addEventListener('click', () => logout());
    }
}

export async function logout() {
    cacheClear();
    await signOut(auth);
    window.location.reload(); 
}

export function getCurrentUser() {
    return currentUserProfile;
}

export function hasPermission(action) {
    if (!currentUserProfile) return false;
    const role = (currentUserProfile.rol || '').toLowerCase();
    
    // Mapeo detallado de permisos por rol (V.3.0.0)
    const permissions = {
        'super_admin': ['generar', 'ver_calendario', 'ver_grabaciones', 'ver_impresion', 'admin_usuarios', 'ver_historico', 'asignar_cita', 'config_puesto', 'ver_pantalla', 'ver_espera', 'admin_tablas'],
        'admin':       ['ver_calendario', 'ver_grabaciones', 'ver_historico', 'asignar_cita', 'config_puesto', 'ver_pantalla', 'ver_espera'],
        'operador':    ['ver_calendario', 'asignar_cita', 'ver_espera', 'config_puesto', 'ver_pantalla'],
        'cita':        ['asignar_cita'],
        'grabador':    ['ver_grabaciones'],
        'pantalla':    ['ver_pantalla']
    };

    return permissions[role]?.includes(action) || false;
}
