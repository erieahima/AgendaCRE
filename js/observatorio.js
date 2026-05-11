import { getStatsCitas } from './firebase.js';
import { cacheGet, cacheSet, cacheInvalidatePrefix } from './cache.js';

let appStateRef = null;

export function setupObservatorio(appState) {
    appStateRef = appState;

    // Eventos
    document.getElementById('btn-refresh-observatorio').addEventListener('click', loadStats);
    document.getElementById('check-jerarquico').addEventListener('change', loadStats);

    // Cargar si se cambia de sede
    window.addEventListener('sedeChanged', () => {
        checkJerarquicoUI();
        if(document.getElementById('view-observatorio').classList.contains('active')) {
            loadStats();
        }
    });

    // Cargar automáticamente si la vista se activa
    document.querySelector('[data-target="view-observatorio"]').addEventListener('click', () => {
        checkJerarquicoUI(true);
        loadStats();
    });

    // v3.30.0: Invalidar caché de estadísticas cuando se actualiza una cita
    window.addEventListener('citaActualizada', () => {
        if (appStateRef.sedeActivaId) {
            cacheInvalidatePrefix(`obs_${appStateRef.sedeActivaId}_`);
        }
    });
}

function checkJerarquicoUI(forceShow = false) {
    const wrapper = document.getElementById('wrapper-jerarquico');
    const isObservatorio = document.getElementById('view-observatorio').classList.contains('active') || forceShow;
    const sedeActual = appStateRef.sedes.find(s => s.codigoTerritorial === appStateRef.sedeActivaId);
    
    // Mostramos el check solo en Observatorio y solo si es la Oficina Provincial de Málaga (nombre flexible)
    if (isObservatorio && sedeActual && 
        sedeActual.nombre.toLowerCase().includes("provincial") && 
        (sedeActual.nombre.toLowerCase().includes("málaga") || sedeActual.nombre.toLowerCase().includes("malaga"))) {
        wrapper.classList.remove('hidden');
    } else {
        wrapper.classList.add('hidden');
        document.getElementById('check-jerarquico').checked = false;
    }
}

async function loadStats() {
    if (!appStateRef.sedeActivaId) return;

    const fechaInicio = document.getElementById('obs-fecha-inicio').value.replace(/-/g, '');
    const fechaFin = document.getElementById('obs-fecha-fin').value.replace(/-/g, '');
    const isJerarquico = document.getElementById('check-jerarquico').checked;

    const btn = document.getElementById('btn-refresh-observatorio');
    const originalText = btn.textContent;
    btn.textContent = "⌛ Cargando...";
    btn.disabled = true;

    // v3.30.0: TTL de 3 minutos por sede+rango para evitar relanzar agregaciones redundantes
    const OBS_TTL = 3 * 60 * 1000;

    try {
        let stats = { total: 0, asignadas: 0, atendidas: 0, grabadas: 0, incidencias: 0 };
        
        if (isJerarquico) {
            // Cargar de TODAS las sedes disponibles usando agregación por cada una
            // Cada sede tiene su propia clave de caché
            const promesas = appStateRef.sedes.map(s => {
                const key = `obs_${s.codigoTerritorial}_${fechaInicio}_${fechaFin}`;
                const cached = cacheGet(key);
                if (cached) return Promise.resolve(cached);
                return getStatsCitas(s.codigoTerritorial, fechaInicio, fechaFin)
                    .then(r => { cacheSet(key, r, OBS_TTL); return r; });
            });
            const resultados = await Promise.all(promesas);
            
            resultados.forEach(r => {
                stats.total += r.total;
                stats.asignadas += r.asignadas;
                stats.atendidas += r.atendidas;
                stats.grabadas += r.grabadas;
                stats.incidencias += r.incidencias;
            });
        } else {
            // Solo sede activa
            const key = `obs_${appStateRef.sedeActivaId}_${fechaInicio}_${fechaFin}`;
            const cached = cacheGet(key);
            if (cached) {
                stats = cached;
            } else {
                stats = await getStatsCitas(appStateRef.sedeActivaId, fechaInicio, fechaFin);
                cacheSet(key, stats, OBS_TTL);
            }
        }
        
        displayStats(stats);
    } catch (err) {
        console.error("Error al cargar estadísticas:", err);
        alert("Error al cargar los datos del observatorio.");
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

function displayStats(stats) {
    animateValue("stat-total", stats.total);
    animateValue("stat-asignadas", stats.asignadas);
    animateValue("stat-terminadas", stats.atendidas);
    animateValue("stat-grabadas", stats.grabadas);
    animateValue("stat-incidencias", stats.incidencias);
}

function animateValue(id, value) {
    const obj = document.getElementById(id);
    let start = parseInt(obj.textContent) || 0;
    let end = value;
    let duration = 800;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}
