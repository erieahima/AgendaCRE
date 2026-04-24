import { listenLlamadasRecientes } from './firebase.js';

let appStateRef = null;
let unsubscribeLlamadas = null;
let cacheLlamadas = [];
let lastRenderDataHash = "";

export function setupPantalla(appState) {
    appStateRef = appState;
    const clockEl = document.getElementById('pantalla-clock');
    
    // Reloj (cada segundo)
    setInterval(() => {
        const now = new Date();
        if (clockEl) {
            clockEl.textContent = now.toLocaleTimeString('es-ES', { hour12: false });
        }
    }, 1000);

    // Refresco de expiración (cada 5 segundos para evitar parpadeo constante)
    setInterval(() => {
        if (cacheLlamadas.length > 0) {
            renderPantalla(cacheLlamadas);
        }
    }, 5000);

    // Escuchar entrada a la vista
    window.addEventListener('pantallaViewEntered', () => {
        if (unsubscribeLlamadas) unsubscribeLlamadas();
        if (appState.sedeActivaId) {
            unsubscribeLlamadas = listenLlamadasRecientes(appState.sedeActivaId, (llamadas) => {
                cacheLlamadas = llamadas;
                renderPantalla(llamadas);
            });
        }
    });

    window.addEventListener('sedeChanged', (e) => {
        const activeSection = document.querySelector('.view-section.active');
        if (activeSection && activeSection.id === 'view-pantalla-citas') {
            if (unsubscribeLlamadas) unsubscribeLlamadas();
            unsubscribeLlamadas = listenLlamadasRecientes(e.detail, (llamadas) => {
                cacheLlamadas = llamadas;
                renderPantalla(llamadas);
            });
        }
    });
}

function renderPantalla(llamadas) {
    const mainCodigo = document.getElementById('pantalla-main-codigo');
    const mainMesa = document.getElementById('pantalla-main-mesa');
    const listaRecientes = document.getElementById('pantalla-lista-recientes');

    if (!mainCodigo || !listaRecientes) return;

    const nowSecs = Date.now() / 1000;
    const mediaHoraSecs = 1800;
    const principalDurationSecs = 45;

    const validas = llamadas.filter(ll => {
        const callSecs = ll.llamada.timestamp?.seconds || 0;
        return (nowSecs - callSecs) < mediaHoraSecs;
    });

    // Crear un hash simple de los datos para ver si algo cambió antes de re-renderizar la lista
    const currentDataHash = validas.map(ll => ll.id).join('-') + (validas[0] ? (nowSecs - (validas[0].llamada.timestamp?.seconds || 0) < principalDurationSecs) : 'empty');
    if (currentDataHash === lastRenderDataHash) return;
    lastRenderDataHash = currentDataHash;

    if (validas.length === 0) {
        mainCodigo.textContent = "---";
        mainMesa.textContent = "---";
        listaRecientes.innerHTML = '<p style="color: #94a3b8; text-align: center; margin-top: 2rem;">Esperando llamadas...</p>';
        return;
    }

    const masReciente = validas[0];
    const age = nowSecs - (masReciente.llamada.timestamp?.seconds || 0);

    let listado = [];
    if (age < principalDurationSecs) {
        // Mostrar como principal (Solo los últimos 3 caracteres)
        mainCodigo.textContent = masReciente.codigo.slice(-3);
        mainMesa.textContent = masReciente.llamada.puesto;
        listado = validas.slice(1, 7);
    } else {
        // Ya no es principal, va a la lista directamente
        mainCodigo.textContent = "---";
        mainMesa.textContent = "---";
        listado = validas.slice(0, 6);
    }

    listaRecientes.innerHTML = listado.map(ll => `
        <div class="llamada-item">
            <div class="codigo">${ll.codigo.slice(-3)}</div>
            <div class="mesa">${ll.llamada.puesto}</div>
        </div>
    `).join('');

    // Sonido opcional (Ding!)
    playDing();
}

let lastCallId = null;
function playDing() {
    // Para no molestar con dings repetidos de la misma lista
    // En una app real, compararíamos el ID de la última llamada
}
