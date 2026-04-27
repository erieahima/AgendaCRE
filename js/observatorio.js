import { getCitasPorSede } from './firebase.js';

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

    try {
        let citas = [];
        
        if (isJerarquico) {
            // Cargar de TODAS las sedes disponibles
            const promesas = appStateRef.sedes.map(s => getCitasPorSede(s.codigoTerritorial));
            const resultados = await Promise.all(promesas);
            resultados.forEach(r => citas = citas.concat(r));
        } else {
            // Solo sede activa
            citas = await getCitasPorSede(appStateRef.sedeActivaId);
        }
        
        // Filtrar por rango
        const filtradas = citas.filter(c => c.fecha >= fechaInicio && c.fecha <= fechaFin);

        calculateAndDisplay(filtradas);
    } catch (err) {
        console.error("Error al cargar estadísticas:", err);
        alert("Error al cargar los datos del observatorio.");
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

function calculateAndDisplay(citas) {
    let total = citas.length;
    let asignadas = 0;
    let atendidas = 0; // Se refiere a 'terminada'
    let grabadas = 0;
    let incidencias = 0;
    let pendientesGrabar = 0;

    citas.forEach(c => {
        if (c.estado === 'asignada') asignadas++;
        if (c.estado === 'terminada') {
            atendidas++;
            // Si está terminada pero no ha sido grabada ni es incidencia, es pendiente de grabar
            if (c.estadoGrabacion !== 'Grabada' && c.estadoGrabacion !== 'Incidencia') {
                pendientesGrabar++;
            }
        }
        
        if (c.estadoGrabacion === 'Grabada') grabadas++;
        if (c.estadoGrabacion === 'Incidencia') incidencias++;
    });

    animateValue("stat-total", total);
    animateValue("stat-asignadas", asignadas);
    animateValue("stat-terminadas", atendidas);
    animateValue("stat-pend-grab", pendientesGrabar);
    animateValue("stat-grabadas", grabadas);
    animateValue("stat-incidencias", incidencias);
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
