import { getPuestoConfig, guardarPuestoConfig } from './firebase.js';

let appStateRef = null;
let isInitialized = false;

export async function setupPuesto(appState) {
    appStateRef = appState;
    const form = document.getElementById('form-config-puesto');
    const inputNombre = document.getElementById('config-puesto-nombre');
    const inputActivo = document.getElementById('config-puesto-activo');
    const statusMsg = document.getElementById('puesto-save-status');

    if (!form || isInitialized) return;

    // Cargar config inicial
    const cargarConfig = async () => {
        if (!appState.user) return;
        const config = await getPuestoConfig(appState.user.uid);
        inputNombre.value = (config.nombre || "").toUpperCase();
        inputActivo.checked = config.activo || false;
    };

    // Forzar mayúsculas en tiempo real mientras el usuario escribe
    inputNombre.addEventListener('input', () => {
        const pos = inputNombre.selectionStart;
        inputNombre.value = inputNombre.value.toUpperCase();
        inputNombre.setSelectionRange(pos, pos);
    });

    // Escuchar entrada a la vista
    window.addEventListener('puestoViewEntered', cargarConfig);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button');
        
        btn.disabled = true;
        const originalBtnText = btn.innerHTML;
        btn.innerHTML = "⌛ Guardando...";
        statusMsg.classList.add('hidden');

        try {
            await guardarPuestoConfig(appState.user.uid, {
                nombre: inputNombre.value.trim().toUpperCase(),
                activo: inputActivo.checked
            });
            
            // UI Feedback moderno en lugar de alert (V.3.8.8)
            statusMsg.textContent = "✅ Configuración guardada correctamente";
            statusMsg.style.background = "var(--success-bg)";
            statusMsg.style.color = "#065f46";
            statusMsg.classList.remove('hidden');

            // Ocultar mensaje tras unos segundos
            setTimeout(() => {
                statusMsg.classList.add('hidden');
            }, 4000);

        } catch (error) {
            console.error(error);
            statusMsg.textContent = "❌ Error: " + error.message;
            statusMsg.style.background = "var(--danger-bg)";
            statusMsg.style.color = "#991b1b";
            statusMsg.classList.remove('hidden');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalBtnText;
        }
    });

    isInitialized = true;

    // Cargar si ya estamos logueados
    if (appState.user) {
        await cargarConfig();
    }
}
