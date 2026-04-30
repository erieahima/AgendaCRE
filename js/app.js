// js/app.js
import { getSedes, inicializarSedes, resetLlamadasSede } from './firebase.js';
import { cacheClear, cacheInvalidatePrefix } from './cache.js';
import { renderCalendario, loadCitasCalendario, initCalendarioModal } from './calendario.js';
import { setupGenerador } from './generador.js';
import { setupImpresion } from './impresion.js';
import { initAuth, hasPermission } from './auth.js';
import { setupUsuarios } from './usuarios.js';

import { setupHistorico } from './historico.js';
import { setupAsignar } from './asignar.js';
import { setupPuesto } from './puesto.js';
import { setupPantalla } from './pantalla.js';
import { setupEspera } from './espera.js';
import { setupTablasMaestras } from './tablasMaestras.js';
import { setupObservatorio } from './observatorio.js';

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
    
    // FILTRAR SEDES: Admin/Super ve todo, otros solo sedesAsignadas (v3.22.0 con soporte ALL)
    if (AppState.user.rol !== 'Super_admin' && AppState.user.rol !== 'Admin') {
        const permitidas = AppState.user.sedesAsignadas || [];
        if (!permitidas.includes("ALL")) {
            sedesData = sedesData.filter(s => permitidas.includes(s.codigoTerritorial));
        }
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
    
    // Ocultar/Mostrar opciones del menú según permisos (V.3.6.5)
    document.getElementById('nav-item-calendario').style.display = hasPermission('ver_calendario') ? 'block' : 'none';
    document.getElementById('nav-item-grabaciones').style.display = 'none'; // Módulo eliminado (v3.28.0)
    document.getElementById('nav-item-historico').style.display = hasPermission('ver_historico') ? 'block' : 'none';
    document.getElementById('nav-item-observatorio').style.display = hasPermission('ver_observatorio') ? 'block' : 'none';
    document.getElementById('nav-item-generador').style.display = hasPermission('generar') ? 'block' : 'none';
    document.getElementById('nav-item-asignar').style.display = hasPermission('asignar_cita') ? 'block' : 'none';
    document.getElementById('nav-item-impresion').style.display = hasPermission('ver_impresion') ? 'block' : 'none';
    document.getElementById('nav-item-usuarios').style.display = hasPermission('admin_usuarios') ? 'block' : 'none';
    document.getElementById('nav-item-config-puesto').style.display = hasPermission('config_puesto') ? 'block' : 'none';
    document.getElementById('nav-item-pantalla-citas').style.display = hasPermission('ver_pantalla') ? 'block' : 'none';
    document.getElementById('nav-item-espera').style.display = hasPermission('ver_espera') ? 'block' : 'none';
    document.getElementById('nav-item-tablas-maestras').style.display = hasPermission('admin_tablas') ? 'block' : 'none';
    
    const isSuper = AppState.user.rol === 'Super_admin';
    const isAdmin = AppState.user.rol === 'Admin';
    const isOperador = AppState.user.rol === 'Operador';

    // Escuchar cambios de sede global y guardar en localStorage
    globalSelector.addEventListener('change', (e) => {
        AppState.sedeActivaId = e.target.value;
        localStorage.setItem('last_sede_id', AppState.sedeActivaId);
        // Invalidar caché de la sede anterior para no servir datos cruzados
        cacheInvalidatePrefix(`cal_dia_`);
        cacheInvalidatePrefix(`cal_mes_`);
        checkDailyReset(AppState.sedeActivaId); // Verificar reset diario al cambiar de sede
        window.dispatchEvent(new CustomEvent('sedeChanged', { detail: AppState.sedeActivaId }));
    });

    // 3. Inicializar módulos
    initCalendarioModal();
    setupGenerador(AppState);
    renderCalendario(); 
    setupImpresion(AppState);
    if(hasPermission('admin_usuarios')) setupUsuarios(AppState); 

    if(hasPermission('ver_historico')) setupHistorico(AppState);
    if(hasPermission('asignar_cita')) setupAsignar(AppState);
    if(hasPermission('config_puesto')) setupPuesto(AppState);
    if(hasPermission('ver_pantalla')) setupPantalla(AppState);
    if(hasPermission('ver_espera')) setupEspera(AppState);
    if(hasPermission('admin_tablas')) setupTablasMaestras(AppState);
    if(hasPermission('ver_observatorio')) setupObservatorio(AppState);

    // Conectar eventos globales
    window.addEventListener('sedeChanged', (e) => {
        refreshSedeFeatures();
        const activeSection = document.querySelector('.view-section.active');
        const vistaActiva = activeSection ? activeSection.id : '';
        if(vistaActiva === 'view-calendario') {
            loadCitasCalendario(e.detail);
        }
    });

    window.addEventListener('sedesListChanged', async () => {
        // Recargar sedes en el selector sin perder la activa
        const currentSede = AppState.sedeActivaId;
        let sedesData = await getSedes();
        
        // Mantener filtro de seguridad
        if (AppState.user.rol !== 'Super_admin' && AppState.user.rol !== 'Admin') {
            const permitidas = AppState.user.sedesAsignadas || [];
            if (!permitidas.includes("ALL")) {
                sedesData = sedesData.filter(s => permitidas.includes(s.codigoTerritorial));
            }
        }

        AppState.sedes = sedesData;
        const globalSelector = document.getElementById('global-sede-selector');
        globalSelector.innerHTML = '';
        AppState.sedes.forEach(sede => {
            const opt = document.createElement('option');
            opt.value = sede.codigoTerritorial;
            opt.textContent = sede.nombre;
            globalSelector.appendChild(opt);
        });
        globalSelector.value = currentSede;
        refreshSedeFeatures();
    });

    // Ejecución inicial de visibilidad por sede
    refreshSedeFeatures();

    // VISTA INICIAL INTELIGENTE: Hacer clic en el primer botón visible para este rol
    const firstVisibleBtn = Array.from(document.querySelectorAll('.nav-links .nav-btn'))
                                 .find(btn => btn.parentElement.style.display !== 'none');
    if (firstVisibleBtn) {
        firstVisibleBtn.click();
    }

    // [V.3.24.0] Auto-limpieza diaria de pantalla (00:00h)
    // Sincroniza el estado de la pantalla al detectar cambio de día local
    const checkDailyReset = async (sedeId) => {
        if (!sedeId) return;
        const today = new Date().toLocaleDateString('es-ES');
        const storageKey = `last_reset_date_${sedeId}`;
        const lastReset = localStorage.getItem(storageKey);
        
        if (lastReset && lastReset !== today) {
            console.log(`[AutoReset] Nueva jornada detectada para sede ${sedeId}. Limpiando pantalla...`);
            try {
                // Ejecutamos limpieza como si se pulsara el botón manual
                await resetLlamadasSede(sedeId);
                localStorage.setItem(storageKey, today);
                // Notificar a la vista de pantalla si está activa para forzar refresco visual
                window.dispatchEvent(new CustomEvent('pantallaResetAuto'));
            } catch (err) {
                console.error("Error en reset automático:", err);
            }
        } else if (!lastReset) {
            localStorage.setItem(storageKey, today);
        }
    };

    // Ejecución inicial y listener de cambio de sede
    if (AppState.sedeActivaId) checkDailyReset(AppState.sedeActivaId);

    setInterval(() => {
        if (AppState.sedeActivaId) checkDailyReset(AppState.sedeActivaId);
    }, 60000); // Revisar cada minuto
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

            // Ocultar jerárquico por defecto al cambiar de vista (v3.20.1)
            const wrapperJer = document.getElementById('wrapper-jerarquico');
            if(wrapperJer) wrapperJer.classList.add('hidden');

            // Hook específico onViewEnter
            if (targetId === 'view-calendario') {
                loadCitasCalendario(AppState.sedeActivaId);
            } else if (targetId === 'view-config-puesto') {
                window.dispatchEvent(new CustomEvent('puestoViewEntered'));
            } else if (targetId === 'view-pantalla-citas') {
                window.dispatchEvent(new CustomEvent('pantallaViewEntered'));
            } else if (targetId === 'view-lista-espera') {
                window.dispatchEvent(new CustomEvent('esperaViewEntered'));
            } else if (targetId === 'view-tablas-maestras') {
                window.dispatchEvent(new CustomEvent('tablasViewEntered'));
            } else if (targetId === 'view-historico') {
                window.dispatchEvent(new CustomEvent('historicoViewEntered'));
            }
        });
    });
}

function refreshSedeFeatures() {
    const sedeActual = AppState.sedes.find(s => s.codigoTerritorial === AppState.sedeActivaId);
    const hasQueuing = sedeActual ? sedeActual.hasQueuingSystem : false;

    // 1. Sidebar Opciones (V.3.7.3)
    const qItems = [
        { id: 'nav-item-config-puesto', action: 'config_puesto' },
        { id: 'nav-item-pantalla-citas', action: 'ver_pantalla' }
    ];

    qItems.forEach(item => {
        const el = document.getElementById(item.id);
        if (el) {
            const show = hasQueuing && hasPermission(item.action);
            el.style.display = show ? 'block' : 'none';
        }
    });

    // La Lista de Espera se muestra siempre que haya permiso
    const esperaEl = document.getElementById('nav-item-espera');
    if (esperaEl) {
        esperaEl.style.display = hasPermission('ver_espera') ? 'block' : 'none';
    }

    // 2. Elementos dinámicos en vistas (Botones Llamar, etc)
    // Usamos una clase CSS para ocultarlos masivamente
    if (!hasQueuing) {
        document.body.classList.add('hide-queuing-features');
    } else {
        document.body.classList.remove('hide-queuing-features');
    }
}

// Exportar State para uso si es requerido
export { AppState };
