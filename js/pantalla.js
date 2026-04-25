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

let lastMainHTML = "";
let lastListHTML = "";

function renderPantalla(llamadas) {
    const mainCodigo = document.getElementById('pantalla-main-codigo');
    const mainMesa = document.getElementById('pantalla-main-mesa');
    const listaRecientes = document.getElementById('pantalla-lista-recientes');

    if (!mainCodigo || !listaRecientes) return;

    const nowSecs = Date.now() / 1000;
    const hideFromListSecs = 1800; // 30 min para desaparecer de la lista completa
    const principalDurationSecs = 45; // Tiempo total que puede estar en grande si no hay más esperando
    const minBufferSecs = 10; // Tiempo mínimo garantizado en grande antes de dar paso

    // 1. Filtrar las que son válidas para mostrar (menos de 30 min) 
    // Ordenamos cronológicamente (ASC) para procesar la cola
    const validasArr = llamadas
        .filter(ll => {
            const callSecs = ll.llamada?.timestamp?.seconds || 0;
            if (callSecs === 0) return false;
            return (nowSecs - callSecs) < hideFromListSecs;
        })
        .sort((a, b) => (a.llamada.timestamp?.seconds || 0) - (b.llamada.timestamp?.seconds || 0));

    if (validasArr.length === 0) {
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

    // 2. Determinar quién es el "Rey del Panel" (BIG)
    // Es el primero de la cola que:
    // a) Tiene menos de 45 segundos de antigüedad
    // b) Y ADEMÁS: (Tiene menos de 10s O es el último que ha entrado)
    let indexPrincipal = -1;
    for (let i = 0; i < validasArr.length; i++) {
        const age = nowSecs - (validasArr[i].llamada?.timestamp?.seconds || 0);
        if (age < principalDurationSecs) {
            // Si tiene menos de 10s, tiene prioridad absoluta de quedarse
            // Si es el último, también se queda
            if (age < minBufferSecs || i === validasArr.length - 1) {
                indexPrincipal = i;
                break;
            }
        }
    }

    const principalContainer = document.querySelector('.llamada-principal');
    let principalHTML = "";
    let listado = [];

    if (indexPrincipal !== -1) {
        const masReciente = validasArr[indexPrincipal];
        const age = nowSecs - (masReciente.llamada?.timestamp?.seconds || 0);
        
        // MOSTRAR EN GRANDE
        if (principalContainer) principalContainer.style.opacity = '1';
        mainCodigo.textContent = masReciente.codigo.slice(-3);
        mainMesa.textContent = masReciente.llamada.puesto;
        principalHTML = masReciente.id + "_" + (masReciente.llamada?.timestamp?.seconds || "0");
        
        // REGLA CLAVE: La lista de la derecha SOLO muestra las que ya PASARON por el panel grande
        // Las que están "en espera" (posteriores a indexPrincipal) NO se muestran todavía
        listado = validasArr.slice(0, indexPrincipal).reverse(); // Reverse para que la más reciente de las pasadas esté arriba
        
        // Sonido si es el comienzo de su aparición
        if (age < 4 && principalHTML !== lastMainHTML) {
            playDing();
        }
    } else {
        // Todo es histórico
        if (principalContainer) principalContainer.style.opacity = '0';
        mainCodigo.textContent = "";
        mainMesa.textContent = "";
        principalHTML = "hidden";
        listado = [...validasArr].reverse();
    }

    // 3. Renderizar lista lateral (limitamos a 6)
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
