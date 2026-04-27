import { getCitasPorSede } from './firebase.js';

let appStateRef = null;

export function setupObservatorio(appState) {
    appStateRef = appState;

    // Eventos
    document.getElementById('btn-refresh-observatorio').addEventListener('click', loadStats);

    // Cargar si se cambia de sede
    window.addEventListener('sedeChanged', () => {
        if(document.getElementById('view-observatorio').classList.contains('active')) {
            loadStats();
        }
    });

    // Cargar automáticamente si la vista se activa
    document.querySelector('[data-target="view-observatorio"]').addEventListener('click', () => {
        loadStats();
    });
}

async function loadStats() {
    if (!appStateRef.sedeActivaId) return;

    const fechaInicio = document.getElementById('obs-fecha-inicio').value.replace(/-/g, '');
    const fechaFin = document.getElementById('obs-fecha-fin').value.replace(/-/g, '');

    const btn = document.getElementById('btn-refresh-observatorio');
    const originalText = btn.textContent;
    btn.textContent = "⌛ Cargando...";
    btn.disabled = true;

    try {
        // Obtenemos todas las citas de la sede
        // Nota: En un futuro esto debería filtrarse en Firebase por rango de fecha
        const citas = await getCitasPorSede(appStateRef.sedeActivaId);
        
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
    let terminadas = 0;
    let grabadas = 0;
    let incidencias = 0;

    citas.forEach(c => {
        // Citas asignadas (tienen estado asignada o terminada o grabada)
        // Pero el usuario pide "Número de citas asignadas" específicamente. 
        // Normalmente se refiere a las que están en estado 'asignada' actualmente?
        // O las que alguna vez fueron asignadas? 
        // Siguiendo los estados del modal: pendiente, asignada, terminada, anulada.
        if (c.estado === 'asignada') asignadas++;
        if (c.estado === 'terminada') terminadas++;
        
        // Métricas de grabación
        if (c.estadoGrabacion === 'Grabada') grabadas++;
        if (c.estadoGrabacion === 'Incidencia') incidencias++;
    });

    // Animación de números (opcional, pero queda premium)
    animateValue("stat-total", total);
    animateValue("stat-asignadas", asignadas);
    animateValue("stat-terminadas", terminadas);
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
