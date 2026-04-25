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

    // Lógica de Pantalla Completa y Wake Lock (Solo Super_admin y perfil pantalla)
    setupFullscreenLogic(appState);

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

    // VISIBILIDAD DE CONTROLES: Solo Super_admin y perfil pantalla
    const isAuthorized = appState.user && (appState.user.rol === 'Super_admin' || appState.user.rol === 'pantalla');
    const controls = document.getElementById('pantalla-controls');
    if (controls) {
        controls.style.display = isAuthorized ? 'block' : 'none';
    }

    // Iniciar inmediatamente si ya hay sede
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

const localEntranceTimes = new Map(); // Para rastrear cuándo VISTO por primera vez esta llamada localmente
let lastMainHTML = "";
let lastListHTML = "";

function renderPantalla(llamadas) {
    const mainCodigo = document.getElementById('pantalla-main-codigo');
    const mainMesa = document.getElementById('pantalla-main-mesa');
    const listaRecientes = document.getElementById('pantalla-lista-recientes');

    if (!mainCodigo || !listaRecientes) return;

    const now = Date.now();
    const principalDurationMs = 45000; 
    const minBufferMs = 10000; 

    // 1. Procesar llamadas y asignarles un tiempo de entrada local si no lo tienen
    const processedArr = llamadas
        .sort((a, b) => (a.llamada?.timestamp?.seconds || 0) - (b.llamada?.timestamp?.seconds || 0));

    processedArr.forEach(ll => {
        if (!localEntranceTimes.has(ll.id)) {
            // Si es nueva para este equipo, marcamos su entrada ahora mismo
            localEntranceTimes.set(ll.id, now);
        }
    });

    // Limpieza de caché local (opcional, para no llenar el Map)
    if (localEntranceTimes.size > 50) {
        const idsInLlamadas = new Set(llamadas.map(l => l.id));
        for (const id of localEntranceTimes.keys()) {
            if (!idsInLlamadas.has(id)) localEntranceTimes.delete(id);
        }
    }

    // 2. Determinar quién es el "Rey del Panel" siguiendo la cola
    let indexPrincipal = -1;
    for (let i = 0; i < processedArr.length; i++) {
        const ll = processedArr[i];
        const entranceTime = localEntranceTimes.get(ll.id) || now;
        const localAge = now - entranceTime;
        const someoneIsWaiting = i < processedArr.length - 1;
        
        // ¿Esta llamada ha agotado su tiempo en el panel grande?
        // Es 100% RELATIVO al reloj local, por lo que el desvío de hora no importa
        const turnFinished = localAge >= principalDurationMs || (localAge >= minBufferMs && someoneIsWaiting);
        
        if (!turnFinished) {
            indexPrincipal = i;
            break;
        }
    }

    const principalContainer = document.querySelector('.llamada-principal');
    let principalHTML = "";
    let listado = [];

    if (indexPrincipal !== -1) {
        try {
            const masReciente = processedArr[indexPrincipal];
            
            if (principalContainer) principalContainer.style.opacity = '1';
            mainCodigo.textContent = (masReciente.codigo || "---").slice(-3);
            mainMesa.textContent = masReciente.llamada?.puesto || "Mesa";
            principalHTML = masReciente.id + "_" + (masReciente.llamada?.timestamp?.seconds || "0");
            
            listado = processedArr.slice(0, indexPrincipal).reverse();
            
            const localAge = now - (localEntranceTimes.get(masReciente.id) || now);
            if (localAge < 3000 && principalHTML !== lastMainHTML) {
                playDing();
            }
        } catch (e) {
            console.error("Error renderizando principal:", e);
        }
    } 
    
    if (indexPrincipal === -1) {
        if (principalContainer) principalContainer.style.opacity = '0';
        mainCodigo.textContent = "";
        mainMesa.textContent = "";
        principalHTML = "hidden";
        listado = [...processedArr].reverse();
    }

    const listadoFinal = listado.slice(0, 6);
    const newListHTML = listadoFinal.map(ll => `
        <div class="llamada-item">
            <div class="codigo">${ll.codigo.slice(-3)}</div>
            <div class="mesa">${ll.llamada.puesto}</div>
        </div>
    `).join('');

    if (newListHTML !== lastListHTML) {
        listaRecientes.innerHTML = newListHTML;
        lastListHTML = newListHTML;
    }

    lastMainHTML = principalHTML;
}

function playDing() {
    // REGLA: Solo suena en el dispositivo que está en PANTALLA COMPLETA
    if (!document.fullscreenElement) return;

    const audio = document.getElementById('audio-ding');
    if (audio) {
        audio.currentTime = 0;
        audio.volume = 0.6;
        audio.play().catch(e => console.log("Auto-play prevenido o error de audio:", e));
    }
}

// LOGICA FULLSCREEN Y WAKE LOCK
let wakeLock = null;
let hideTimer = null;

function setupFullscreenLogic(appState) {
    const btnEnter = document.getElementById('btn-fullscreen');
    const btnExit = document.getElementById('btn-exit-fullscreen');
    const target = document.getElementById('pantalla-target-fs');

    if (!btnEnter || !btnExit || !target) return;

    const showExitBtn = () => {
        btnExit.classList.add('show');
        target.style.cursor = 'default'; 
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
            btnExit.classList.remove('show');
            if (document.fullscreenElement) {
                target.style.cursor = 'none'; // Ocultar ratón en FS
            }
        }, 3000); 
    };

    const toggleFS = async () => {
        try {
            if (!document.fullscreenElement) {
                await target.requestFullscreen();
                showExitBtn();
                target.addEventListener('mousemove', showExitBtn);

                if ('wakeLock' in navigator) {
                    wakeLock = await navigator.wakeLock.request('screen');
                }
            } else {
                if (document.fullscreenElement) await document.exitFullscreen();
            }
        } catch (err) {
            console.error("Error Fullscreen/WakeLock:", err);
        }
    };

    btnEnter.addEventListener('click', toggleFS);
    btnExit.addEventListener('click', () => {
        if (document.fullscreenElement) document.exitFullscreen();
    });

    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
            btnExit.classList.remove('show');
            target.style.cursor = 'default';
            target.removeEventListener('mousemove', showExitBtn);
            if (hideTimer) clearTimeout(hideTimer);
            
            if (controls) controls.style.display = isAuthorized ? 'block' : 'none';

            if (wakeLock) {
                wakeLock.release().then(() => {
                    wakeLock = null;
                });
            }
        } else {
            if (controls) controls.style.display = 'none';
        }
    });
}
