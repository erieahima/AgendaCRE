// js/app.js
import { getSedes, inicializarSedes } from './firebase.js';
import { renderCalendario, loadCitasCalendario } from './calendario.js';
import { setupGenerador } from './generador.js';
import { setupImpresion } from './impresion.js';

// Estado global de la aplicación
const AppState = {
    sedes: [],
    sedeActivaId: null
};

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Setup navegación
    setupNavigation();

    // 2. Inicializar y cargar sedes
    await inicializarSedes();
    AppState.sedes = await getSedes();
    
    // Rellenar selectores
    const globalSelector = document.getElementById('global-sede-selector');
    globalSelector.innerHTML = ''; // Limpiar
    
    if (AppState.sedes.length > 0) {
        AppState.sedes.forEach(sede => {
            const opt = document.createElement('option');
            opt.value = sede.codigoTerritorial;
            opt.textContent = sede.nombre;
            globalSelector.appendChild(opt);
        });
        AppState.sedeActivaId = AppState.sedes[0].codigoTerritorial;
    } else {
        const opt = document.createElement('option');
        opt.value = "";
        opt.textContent = "Error de conexión/Firebase";
        globalSelector.appendChild(opt);
    }
    
    // Escuchar cambios de sede global
    globalSelector.addEventListener('change', (e) => {
        AppState.sedeActivaId = e.target.value;
        // Notificar a otras pantallas
        window.dispatchEvent(new CustomEvent('sedeChanged', { detail: AppState.sedeActivaId }));
    });

    // 3. Inicializar módulos
    setupGenerador(AppState);
    renderCalendario(); // Render inicial (vacío)
    setupImpresion(AppState);

    // Conectar eventos globales
    window.addEventListener('sedeChanged', (e) => {
        // Si estamos viendo el calendario, recargamos las citas
        const vistaActiva = document.querySelector('.view-section.active').id;
        if(vistaActiva === 'view-calendario') {
            loadCitasCalendario(e.detail);
        }
    });
});

/**
 * Lógica base de la Single Page Application: Navigation
 */
function setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const viewSections = document.querySelectorAll('.view-section');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active from all buttons and views
            navButtons.forEach(b => b.classList.remove('active'));
            viewSections.forEach(v => v.classList.remove('active'));

            // Add active to current
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');

            // Hook específico onViewEnter
            if (targetId === 'view-calendario') {
                loadCitasCalendario(AppState.sedeActivaId);
            }
        });
    });
}

// Exportar State para uso si es requerido
export { AppState };
