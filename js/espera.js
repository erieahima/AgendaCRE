import { listenListaEspera } from './firebase.js';
import { formatHoraToDisplay, formatearHoraHumana } from './utils.js';

let appStateRef = null;
let unsubscribeEspera = null;

export function setupEspera(appState) {
    appStateRef = appState;

    // Escuchar entrada a la vista
    window.addEventListener('esperaViewEntered', () => {
        if (unsubscribeEspera) unsubscribeEspera();
        
        if (appState.sedeActivaId) {
            unsubscribeEspera = listenListaEspera(appState.sedeActivaId, (lista) => {
                renderListaEspera(lista);
            });
        }
    });

    // Cambiar de sede debe refrescar el listener
    window.addEventListener('sedeChanged', (e) => {
        const activeSection = document.querySelector('.view-section.active');
        if (activeSection && activeSection.id === 'view-lista-espera') {
            if (unsubscribeEspera) unsubscribeEspera();
            unsubscribeEspera = listenListaEspera(e.detail, (lista) => {
                renderListaEspera(lista);
            });
        }
    });
}

function renderListaEspera(lista) {
    const container = document.getElementById('espera-container');
    if (!container) return;

    if (lista.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding: 3rem; color: var(--text-muted);">
                <h3>No hay pacientes en espera</h3>
                <p>Todos los asistentes de hoy han sido llamados o no hay asistencia marcada.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = lista.map(cita => `
        <div class="card p-3 flex-between" style="border-left: 5px solid var(--primary); background: #f8fafc;">
            <div>
                <strong style="font-size: 1.1rem; color: var(--primary);">${cita.codigo}</strong>
                <div style="font-size: 0.9rem; color: var(--text-muted); margin-top: 5px;">
                    Hora Cita: <strong>${formatearHoraHumana(cita.hora)}</strong> | 
                    Paciente: <strong>${cita.iniciales || 'Sin iniciales'}</strong>
                </div>
            </div>
            <div style="text-align: right;">
                <span class="badge asignada">EN ESPERA</span>
            </div>
        </div>
    `).join('');
}
