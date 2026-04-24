import { listenLlamadasRecientes } from './firebase.js';

let appStateRef = null;
let unsubscribeLlamadas = null;

export function setupPantalla(appState) {
    appStateRef = appState;
    const clockEl = document.getElementById('pantalla-clock');
    
    // Reloj
    setInterval(() => {
        const now = new Date();
        if (clockEl) {
            clockEl.textContent = now.toLocaleTimeString('es-ES', { hour12: false });
        }
    }, 1000);

    // Escuchar entrada a la vista para activar listener en tiempo real
    window.addEventListener('pantallaViewEntered', () => {
        if (unsubscribeLlamadas) unsubscribeLlamadas();
        
        if (appState.sedeActivaId) {
            unsubscribeLlamadas = listenLlamadasRecientes(appState.sedeActivaId, (llamadas) => {
                renderPantalla(llamadas);
            });
        }
    });

    // Cambiar de sede debe refrescar el listener
    window.addEventListener('sedeChanged', (e) => {
        const activeSection = document.querySelector('.view-section.active');
        if (activeSection && activeSection.id === 'view-pantalla-citas') {
            if (unsubscribeLlamadas) unsubscribeLlamadas();
            unsubscribeLlamadas = listenLlamadasRecientes(e.detail, (llamadas) => {
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

    if (llamadas.length === 0) {
        mainCodigo.textContent = "---";
        mainMesa.textContent = "---";
        listaRecientes.innerHTML = '<p style="color: #94a3b8; text-align: center; margin-top: 2rem;">Esperando llamadas...</p>';
        return;
    }

    // La primera es la principal
    const actual = llamadas[0];
    mainCodigo.textContent = actual.codigo;
    mainMesa.textContent = actual.llamada.puesto;

    // El resto son recientes
    const resto = llamadas.slice(1);
    listaRecientes.innerHTML = resto.map(ll => `
        <div class="llamada-item">
            <div class="codigo">${ll.codigo}</div>
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
