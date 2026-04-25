import { listenListaEspera } from './firebase.js';
import { formatHoraToDisplay, formatearHoraHumana } from './utils.js';
import { openModal } from './calendario.js';

let appStateRef = null;
let unsubscribeEspera = null;
let currentLista = []; // Guardar referencia a la lista actual

export function setupEspera(appState) {
    appStateRef = appState;

    const container = document.getElementById('espera-container');
    if (container) {
        container.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-atender');
            if (btn) {
                const citaId = btn.dataset.id;
                const cita = currentLista.find(c => c.id === citaId);
                if (cita) openModal(cita);
            }
        });
    }

    // Escuchar entrada a la vista
    window.addEventListener('esperaViewEntered', () => {
        if (unsubscribeEspera) unsubscribeEspera();
        
        if (appState.sedeActivaId) {
            unsubscribeEspera = listenListaEspera(appState.sedeActivaId, (lista) => {
                currentLista = lista;
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
                currentLista = lista;
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
                <span style="font-size: 3rem;">⏳</span>
                <h3 style="margin-top: 1rem;">No hay nadie esperando en la recepción</h3>
                <p>Las personas usuarias aparecerán aquí cuando marquen su llegada.</p>
            </div>
        `;
        return;
    }

    const activeSede = appStateRef.sedes.find(s => s.codigoTerritorial === appStateRef.sedeActivaId);
    const hasQueuing = activeSede ? activeSede.hasQueuingSystem : false;

    container.innerHTML = lista.map(cita => {
        const shortCode = cita.codigo ? cita.codigo.slice(-3) : '---';
        
        return `
            <div class="card p-4 mb-3 flex-between shadow-sm" style="border-left: 6px solid var(--primary); background: white; border-radius: 12px;">
                <div style="display: flex; gap: 1.5rem; align-items: center;">
                    <div style="background: var(--bg-main); padding: 0.75rem 1.25rem; border-radius: 8px; border: 1px solid var(--border);">
                        <div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); margin-bottom: 2px;">Cita</div>
                        <strong style="font-size: 1.5rem; color: var(--primary); font-family: monospace;">${shortCode}</strong>
                    </div>
                    <div>
                        <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-main); margin-bottom: 4px;">
                            ${cita.iniciales ? `Iniciales: ${cita.iniciales}` : '---'}
                        </div>
                        <div style="font-size: 0.85rem; color: var(--text-muted);">
                            <strong>${formatearHoraHumana(cita.hora)}</strong> | Sede: ${activeSede ? activeSede.nombre : '---'}
                        </div>
                    </div>
                </div>
                
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 10px;">
                    <span class="badge asignada" style="padding: 6px 12px; font-weight: 700;">EN ESPERA</span>
                    ${!hasQueuing ? `
                        <button class="btn btn-primary btn-atender" data-id="${cita.id}" style="padding: 8px 20px; font-size: 0.9rem;">
                            Atender 🖊️
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}
