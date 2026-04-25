// js/app.js
import { getSedes, inicializarSedes } from './firebase.js';
import { renderCalendario, loadCitasCalendario, initCalendarioModal } from './calendario.js';
import { setupGenerador } from './generador.js';
import { setupImpresion } from './impresion.js';
import { initAuth, hasPermission } from './auth.js';
import { setupUsuarios } from './usuarios.js';
import { setupGrabaciones } from './grabaciones.js';
import { setupHistorico } from './historico.js';
import { setupAsignar } from './asignar.js';
import { setupPuesto } from './puesto.js';
import { setupPantalla } from './pantalla.js';
import { setupEspera } from './espera.js';

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

        // PERSISTENCIA DE SEDE: Recuperar última sede guardada
        const lastSede = localStorage.getItem('last_sede_id');
        const sedeExiste = AppState.sedes.find(s => s.codigoTerritorial === lastSede);
        
        if (lastSede && sedeExiste) {
            AppState.sedeActivaId = lastSede;
            globalSelector.value = lastSede;
        } else {
            AppState.sedeActivaId = AppState.sedes[0].codigoTerritorial;
            globalSelector.value = AppState.sedeActivaId;
        }
    } else {
        const opt = document.createElement('option');
        opt.value = "";
        opt.textContent = "Sin sedes asignadas";
        globalSelector.appendChild(opt);
    }
    
    // Ocultar/Mostrar opciones del menú según permisos (V.3.4.1)
    document.getElementById('nav-item-calendario').style.display = hasPermission('ver_calendario') ? 'block' : 'none';
    document.getElementById('nav-item-grabaciones').style.display = hasPermission('ver_grabaciones') ? 'block' : 'none';
    document.getElementById('nav-item-historico').style.display = hasPermission('ver_historico') ? 'block' : 'none';
    document.getElementById('nav-item-generador').style.display = hasPermission('generar') ? 'block' : 'none';
    document.getElementById('nav-item-asignar').style.display = hasPermission('asignar_cita') ? 'block' : 'none';
    document.getElementById('nav-item-impresion').style.display = hasPermission('ver_impresion') ? 'block' : 'none';
    document.getElementById('nav-item-usuarios').style.display = hasPermission('admin_usuarios') ? 'block' : 'none';
    document.getElementById('nav-item-config-puesto').style.display = hasPermission('config_puesto') ? 'block' : 'none';
    document.getElementById('nav-item-pantalla-citas').style.display = hasPermission('ver_pantalla') ? 'block' : 'none';
    document.getElementById('nav-item-espera').style.display = hasPermission('ver_espera') ? 'block' : 'none';
    
    const isSuper = AppState.user.rol === 'Super_admin';
    const isAdmin = AppState.user.rol === 'Admin';
    const isOperador = AppState.user.rol === 'Operador';

    // Escuchar cambios de sede global y guardar en localStorage
    globalSelector.addEventListener('change', (e) => {
        AppState.sedeActivaId = e.target.value;
        localStorage.setItem('last_sede_id', AppState.sedeActivaId);
        window.dispatchEvent(new CustomEvent('sedeChanged', { detail: AppState.sedeActivaId }));
    });

    // 3. Inicializar módulos
    initCalendarioModal();
    setupGenerador(AppState);
    renderCalendario(); 
    setupImpresion(AppState);
    if(hasPermission('admin_usuarios')) setupUsuarios(AppState); 
    if(hasPermission('ver_grabaciones')) setupGrabaciones(AppState);
    if(hasPermission('ver_historico')) setupHistorico(AppState);
    if(hasPermission('asignar_cita')) setupAsignar(AppState);
    if(hasPermission('config_puesto')) setupPuesto(AppState);
    if(hasPermission('ver_pantalla')) setupPantalla(AppState);
    if(hasPermission('ver_espera')) setupEspera(AppState);

    // Conectar eventos globales
    window.addEventListener('sedeChanged', (e) => {
        const activeSection = document.querySelector('.view-section.active');
        const vistaActiva = activeSection ? activeSection.id : '';
        if(vistaActiva === 'view-calendario') {
            loadCitasCalendario(e.detail);
        }
    });

    // VISTA INICIAL INTELIGENTE: Hacer clic en el primer botón visible para este rol
    const firstVisibleBtn = Array.from(document.querySelectorAll('.nav-links .nav-btn'))
                                 .find(btn => btn.parentElement.style.display !== 'none');
    if (firstVisibleBtn) {
        firstVisibleBtn.click();
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
            } else if (targetId === 'view-grabaciones') {
                // El listener de tiempo real ya mantiene la lista actualizada
            } else if (targetId === 'view-config-puesto') {
                window.dispatchEvent(new CustomEvent('puestoViewEntered'));
            } else if (targetId === 'view-pantalla-citas') {
                window.dispatchEvent(new CustomEvent('pantallaViewEntered'));
            } else if (targetId === 'view-lista-espera') {
                window.dispatchEvent(new CustomEvent('esperaViewEntered'));
            }
        });
    });
}

// Exportar State para uso si es requerido
export { AppState };
