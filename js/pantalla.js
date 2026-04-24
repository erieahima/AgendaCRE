import { listenLlamadasRecientes } from './firebase.js';

let appStateRef = null;
let unsubscribeLlamadas = null;

let cacheLlamadas = [];

export function setupPantalla(appState) {
    appStateRef = appState;
    const clockEl = document.getElementById('pantalla-clock');
    
    // Reloj y refresco de expiración (cada minuto)
    setInterval(() => {
        const now = new Date();
        if (clockEl) {
            clockEl.textContent = now.toLocaleTimeString('es-ES', { hour12: false });
        }
        // Refrescar para quitar llamadas expiradas
        if (cacheLlamadas.length > 0) {
            renderPantalla(cacheLlamadas);
        }
    }, 1000);

    // Escuchar entrada a la vista para activar listener en tiempo real
    window.addEventListener('pantallaViewEntered', () => {
        if (unsubscribeLlamadas) unsubscribeLlamadas();
        
        if (appState.sedeActivaId) {
            unsubscribeLlamadas = listenLlamadasRecientes(appState.sedeActivaId, (llamadas) => {
                cacheLlamadas = llamadas;
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

    // --- FILTRADO POR TIEMPO (MEDIA HORA) Y LÍMITE (6) ---
    const nowSecs = Date.now() / 1000;
    const mediaHoraSecs = 1800; // 30 mins

    const validas = llamadas.filter(ll => {
        const callSecs = ll.llamada.timestamp?.seconds || 0;
        return (nowSecs - callSecs) < mediaHoraSecs;
    });

    if (validas.length === 0) {
        mainCodigo.textContent = "---";
        mainMesa.textContent = "---";
        listaRecientes.innerHTML = '<p style="color: #94a3b8; text-align: center; margin-top: 2rem;">Esperando llamadas...</p>';
        return;
    }

    // La primera es la principal (la más reciente)
    const actual = validas[0];
    mainCodigo.textContent = actual.codigo;
    mainMesa.textContent = actual.llamada.puesto;

    // El resto son recientes (máximo 6 adicionales o total?) 
    // Usuario dice: "mantendremos los últimos 6". Entendemos lista de la derecha = 6.
    const resto = validas.slice(1, 7); 
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
