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

    // Refresco de expiración (cada 2 segundos para mayor precisión en el borrado de la principal)
    setInterval(() => {
        if (cacheLlamadas.length > 0) {
            renderPantalla(cacheLlamadas);
        }
    }, 2000);

    // Función interna para iniciar el listener
    const startListening = (sedeId) => {
        if (unsubscribeLlamadas) unsubscribeLlamadas();
        unsubscribeLlamadas = listenLlamadasRecientes(sedeId, (llamadas) => {
            cacheLlamadas = llamadas;
            renderPantalla(llamadas);
        });
    };

    // Iniciar inmediatamente si ya hay sede (útil si se recarga la página en esta vista)
    if (appState.sedeActivaId) {
        startListening(appState.sedeActivaId);
    }

    // Escuchar entrada a la vista
    window.addEventListener('pantallaViewEntered', () => {
        if (appState.sedeActivaId) startListening(appState.sedeActivaId);
    });

    window.addEventListener('sedeChanged', (e) => {
        startListening(e.detail);
    });
}

let lastMainHTML = "";
let lastListHTML = "";

function renderPantalla(llamadas) {
    const mainCodigo = document.getElementById('pantalla-main-codigo');
    const mainMesa = document.getElementById('pantalla-main-mesa');
    const listaRecientes = document.getElementById('pantalla-lista-recientes');

    if (!mainCodigo || !listaRecientes) return;

    const nowSecs = Date.now() / 1000;
    const mediaHoraSecs = 1800;
    const principalDurationSecs = 45;

    const validas = llamadas.filter(ll => {
        const callSecs = ll.llamada?.timestamp?.seconds || 0;
        if (callSecs === 0) return false;
        return (nowSecs - callSecs) < mediaHoraSecs;
    });

    if (validas.length === 0) {
        if (lastMainHTML !== "empty") {
            const principalContainer = document.querySelector('.llamada-principal');
            if (principalContainer) principalContainer.style.opacity = '0';
            mainCodigo.textContent = "";
            mainMesa.textContent = "";
            listaRecientes.innerHTML = '<p style="color: #94a3b8; text-align: center; margin-top: 2rem;">Esperando llamadas...</p>';
            lastMainHTML = "empty";
            lastListHTML = "empty";
        }
        return;
    }

    const masReciente = validas[0];
    const age = nowSecs - (masReciente.llamada?.timestamp?.seconds || 0);

    const principalContainer = document.querySelector('.llamada-principal');

    let principalHTML = "";
    let listado = [];

    if (age < principalDurationSecs) {
        // ACTIVA EN GRANDE
        if (principalContainer) principalContainer.style.opacity = '1';
        mainCodigo.textContent = masReciente.codigo.slice(-3);
        mainMesa.textContent = masReciente.llamada.puesto;
        principalHTML = masReciente.id + "_active";
        listado = validas.slice(1, 7);
    } else {
        // OCULTAR GRANDE
        if (principalContainer) principalContainer.style.opacity = '0';
        mainCodigo.textContent = "";
        mainMesa.textContent = "";
        principalHTML = "hidden";
        listado = validas.slice(0, 6);
    }

    // Solo actualizar la lista si el contenido HTML generado cambia
    const newListHTML = listado.map(ll => `
        <div class="llamada-item">
            <div class="codigo">${ll.codigo.slice(-3)}</div>
            <div class="mesa">${ll.llamada.puesto}</div>
        </div>
    `).join('');

    if (newListHTML !== lastListHTML) {
        listaRecientes.innerHTML = newListHTML;
        lastListHTML = newListHTML;
    }

    // Sonido si es una llamada nueva (últimos 4 segundos)
    if (age < 4 && principalHTML !== lastMainHTML) {
        playDing();
    }
    lastMainHTML = principalHTML;
}

let lastCallId = null;
function playDing() {
    // Para no molestar con dings repetidos de la misma lista
    // En una app real, compararíamos el ID de la última llamada
}
