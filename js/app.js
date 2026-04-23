// js/app.js
import { getSedes, inicializarSedes } from './firebase.js';
import { renderCalendario, loadCitasCalendario } from './calendario.js';
import { setupGenerador } from './generador.js';
import { setupImpresion } from './impresion.js';
import { initAuth, hasPermission } from './auth.js';

// Estado global de la aplicación
const AppState = {
    sedes: [],
    sedeActivaId: null,
    user: null
};

document.addEventListener('DOMContentLoaded', () => {
    // 1. Setup navegación base
    setupNavigation();

    // 2. Esperar a la Autenticación
    initAuth(async (userProfile) => {
        AppState.user = userProfile;
        await loadAuthenticatedApp();
    });
});

async function loadAuthenticatedApp() {
    // 2. Inicializar y cargar sedes
    await inicializarSedes();
    let sedesData = await getSedes();
    
    // FILTRAR SEDES: Admin/Super ve todo, otros solo sedesAsignadas
    if (AppState.user.rol !== 'Super_admin' && AppState.user.rol !== 'Admin') {
        const permitidas = AppState.user.sedesAsignadas || [];
        sedesData = sedesData.filter(s => permitidas.includes(s.codigoTerritorial));
    }
    AppState.sedes = sedesData;
    
    // Rellenar selectores
    const globalSelector = document.getElementById('global-sede-selector');
    globalSelector.innerHTML = ''; 
    
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
        opt.textContent = "Sin sedes asignadas";
        globalSelector.appendChild(opt);
    }
    
    // Ocultar/Mostrar opciones del menú según permisos
    document.getElementById('nav-item-generador').style.display = hasPermission('generar') ? 'block' : 'none';
    document.getElementById('nav-item-impresion').style.display = hasPermission('ver_calendario') ? 'block' : 'none';

    // Escuchar cambios de sede global
    globalSelector.addEventListener('change', (e) => {
        AppState.sedeActivaId = e.target.value;
        window.dispatchEvent(new CustomEvent('sedeChanged', { detail: AppState.sedeActivaId }));
    });

    // 3. Inicializar módulos
    setupGenerador(AppState);
    renderCalendario(); 
    setupImpresion(AppState);

    // Conectar eventos globales
    window.addEventListener('sedeChanged', (e) => {
        const vistaActiva = document.querySelector('.view-section.active').id;
        if(vistaActiva === 'view-calendario') {
            loadCitasCalendario(e.detail);
        }
    });

    // Forzar vista inicial permitida si Generador está oculto
    if (!hasPermission('generar')) {
        document.querySelector('[data-target="view-calendario"]').click();
    }
}

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
