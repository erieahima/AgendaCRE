import { getPuestoConfig, guardarPuestoConfig } from './firebase.js';

let appStateRef = null;

export async function setupPuesto(appState) {
    appStateRef = appState;
    const form = document.getElementById('form-config-puesto');
    const inputNombre = document.getElementById('config-puesto-nombre');
    const inputActivo = document.getElementById('config-puesto-activo');

    if (!form) return;

    // Cargar config inicial
    const cargarConfig = async () => {
        if (!appState.user) return;
        const config = await getPuestoConfig(appState.user.uid);
        inputNombre.value = config.nombre || "";
        inputActivo.checked = config.activo || false;
    };

    // Escuchar entrada a la vista
    window.addEventListener('puestoViewEntered', cargarConfig);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button');
        btn.disabled = true;
        btn.textContent = "Guardando...";

        try {
            await guardarPuestoConfig(appState.user.uid, {
                nombre: inputNombre.value.trim(),
                activo: inputActivo.checked
            });
            alert("Configuración guardada correctamente.");
        } catch (error) {
            console.error(error);
            alert("Error al guardar: " + error.message);
        } finally {
            btn.disabled = false;
            btn.textContent = "Guardar Configuración";
        }
    });

    // Cargar si ya estamos logueados
    if (appState.user) {
        await cargarConfig();
    }
}
