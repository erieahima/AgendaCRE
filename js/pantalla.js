import { listenLlamadasRecientes, resetLlamadasSede } from './firebase.js';

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

    const updateDebugInfo = (status, sedeId, lastSoundId) => {
        const debugEl = document.getElementById('pantalla-debug-info');
        if (debugEl) {
            const time = new Date().toLocaleTimeString();
            debugEl.textContent = `Diag: Sede [${sedeId || '?'}] | Status [${status}] | Sonido [${lastSoundId || '---'}] | ${time}`;
        }
    };

    // Refresco de expiración (cada 2 segundos para mayor precisión en el borrado de la principal)
    setInterval(() => {
        if (cacheLlamadas.length > 0) {
            renderPantalla(cacheLlamadas);
        }
        updateDebugInfo("OK", appState.sedeActivaId, lastPlayedId);
    }, 2000);

    // Función interna para iniciar el listener
    const startListening = (sedeId) => {
        if (unsubscribeLlamadas) unsubscribeLlamadas();
        updateDebugInfo("Conectando...", sedeId);
        unsubscribeLlamadas = listenLlamadasRecientes(sedeId, (llamadas) => {
            cacheLlamadas = llamadas;
            renderPantalla(llamadas);
            updateDebugInfo("En Vivo", sedeId);
        });
    };

    // VISIBILIDAD DE CONTROLES: Solo Super_admin y perfil pantalla
    const isAuthorized = appState.user && (appState.user.rol === 'Super_admin' || appState.user.rol === 'pantalla');
    const controls = document.getElementById('pantalla-controls');
    const btnClear = document.getElementById('btn-clear-pantalla');
    if (controls) {
        controls.style.display = isAuthorized ? 'block' : 'none';
        if (btnClear) {
            btnClear.style.display = (appState.user && appState.user.rol === 'Super_admin') ? 'inline-block' : 'none';
            btnClear.addEventListener('click', async () => {
                const sedeId = appState.sedeActivaId;
                if (!sedeId) return;

                if (confirm("¿Estás seguro de que deseas limpiar la pantalla? Esto borrará el historial visual actual de esta sede.")) {
                    try {
                        btnClear.disabled = true;
                        btnClear.textContent = "⌛ Limpiando...";
                        await resetLlamadasSede(sedeId);
                    } catch (err) {
                        console.error(err);
                        alert("Error al limpiar pantalla.");
                    } finally {
                        btnClear.textContent = "🧹 Limpiar Pantalla";
                        btnClear.disabled = false;
                    }
                }
            });
        }
    }

    // v3.28.2: Iniciar el listener SOLO cuando el usuario entra a la vista Pantalla (lazy)
    // Antes se iniciaba siempre al cargar la app, generando snapshots innecesarios
    window.addEventListener('pantallaViewEntered', () => {
        if (appState.sedeActivaId) startListening(appState.sedeActivaId);
    });

    window.addEventListener('sedeChanged', (e) => {
        // Solo reconectar si la vista Pantalla está activa
        const isPantallaActive = document.getElementById('view-pantalla-citas')?.classList.contains('active');
        if (isPantallaActive) startListening(e.detail);
    });
}

const localEntranceTimes = new Map(); 
let lastMainHTML = "";
let lastListHTML = "";
let lastPlayedId = ""; // Asegura que cada código suena una sola vez
let lastSnapshotArrival = 0; // Tiempo local (ms) en que llegó el último snapshot de datos
let lastSnapshotLatestTS = 0; // Timestamp (s) de la llamada más reciente del último snapshot

function renderPantalla(llamadas) {
    const mainCodigo = document.getElementById('pantalla-main-codigo');
    const mainMesa = document.getElementById('pantalla-main-mesa');
    const listaRecientes = document.getElementById('pantalla-lista-recientes');

    if (!mainCodigo || !listaRecientes) return;

    // 1. Clasificar y Ordenar (ASC: el más antiguo primero en el array)
    // Filtramos para asegurar que tienen marca de tiempo válida
    const processedArr = llamadas
        .filter(ll => ll.llamada && ll.llamada.timestamp)
        .sort((a, b) => (a.llamada.timestamp.seconds) - (b.llamada.timestamp.seconds));

    if (processedArr.length === 0) {
        const principalContainer = document.querySelector('.llamada-principal');
        if (principalContainer) principalContainer.style.opacity = '0';
        mainCodigo.textContent = ""; 
        mainMesa.textContent = "";
        listaRecientes.innerHTML = '<p style="color: #94a3b8; text-align: center; margin-top: 2rem;">Esperando llamadas...</p>';
        return;
    }

    // 2. Sincronización lógica: Calcular "ahora" relativo al snapshot
    const newestCall = processedArr[processedArr.length - 1];
    const newestTS = newestCall.llamada.timestamp.seconds;

    // Si el snapshot es nuevo (entró una llamada nueva al sistema), reiniciamos el cronómetro local
    if (newestTS !== lastSnapshotLatestTS) {
        lastSnapshotLatestTS = newestTS;
        lastSnapshotArrival = Date.now();
    }

    // Segundos transcurridos desde que RECIBIMOS los últimos datos
    const localElapsedSecs = (Date.now() - lastSnapshotArrival) / 1000;
    
    // El "Tiempo Lógico" compartido por todos los equipos es: TS_de_la_más_reciente + Tiempo_local_transcurrido
    // Esto garantiza que todos avancen a la par independientemente de si su reloj de Windows está mal
    const logicNowSecs = newestTS + localElapsedSecs;

    const principalDurationSecs = 45; 
    const minBufferSecs = 10; 

    // 3. Determinar quién es el "Rey del Panel" (BIG)
    let indexPrincipal = -1;
    for (let i = 0; i < processedArr.length; i++) {
        const ll = processedArr[i];
        const callTS = ll.llamada.timestamp.seconds;
        const relativeAge = logicNowSecs - callTS;
        const someoneIsWaiting = i < processedArr.length - 1;
        
        // Turno terminado si:
        // - Ha cumplido 45s lógicos
        // - O ha cumplido 10s lógicos Y hay otra llamada posterior esperando su turno
        const turnFinished = relativeAge >= principalDurationSecs || (relativeAge >= minBufferSecs && someoneIsWaiting);
        
        if (!turnFinished) {
            indexPrincipal = i;
            break;
        }
    }

    const principalContainer = document.querySelector('.llamada-principal');
    let principalHTML = "";
    let listado = [];

    if (indexPrincipal !== -1) {
        const masReciente = processedArr[indexPrincipal];
        const age = logicNowSecs - masReciente.llamada.timestamp.seconds;
        
        if (principalContainer) principalContainer.style.opacity = '1';
        mainCodigo.textContent = (masReciente.codigo || "---").slice(-3);
        mainMesa.textContent = masReciente.llamada?.puesto || "Mesa";
        principalHTML = masReciente.id + "_" + masReciente.llamada.timestamp.seconds;
        
        // La lista muestra los que ya pasaron por el panel grande
        listado = processedArr.slice(0, indexPrincipal).reverse();
        
        // El sonido debe sonar siempre que el ID O el timestamp cambien (V.3.29.5)
        // Usamos principalHTML que ya contiene: masReciente.id + "_" + timestamp
        if (principalHTML !== lastPlayedId) {
            if (playDing()) {
                lastPlayedId = principalHTML;
            }
        }
    } else {
        // En caso de que todas hayan expirado (o error), todas van a la derecha
        if (principalContainer) principalContainer.style.opacity = '0';
        mainCodigo.textContent = "";
        mainMesa.textContent = "";
        principalHTML = "hidden";
        listado = [...processedArr].reverse();
    }

    // Renderizar lista lateral (limitamos a 5 para evitar scroll)
    const listadoFinal = listado.slice(0, 5);
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
    if (!document.fullscreenElement) return false;

    const audio = document.getElementById('audio-ding');
    if (audio) {
        audio.currentTime = 0;
        audio.volume = 0.6;
        audio.play().catch(e => console.log("Auto-play prevenido o error de audio:", e));
        return true;
    }
    return false;
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
