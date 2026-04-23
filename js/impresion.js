// js/impresion.js
import { getCitasPorSedeYFecha } from './firebase.js';
import { formatHoraToDisplay, dateToInputString } from './utils.js';

let appStateRef = null;

export function setupImpresion(appState) {
    appStateRef = appState;
    const today = new Date();
    document.getElementById('print-fecha').value = dateToInputString(today);

    document.getElementById('btn-load-print').addEventListener('click', loadImpresion);
    document.getElementById('btn-print').addEventListener('click', () => {
        window.print();
    });
}

async function loadImpresion() {
    if (!appStateRef.sedeActivaId) {
        alert("Selecciona una sede arriba.");
        return;
    }

    const fechaInput = document.getElementById('print-fecha').value;
    if (!fechaInput) {
        alert("Selecciona una fecha.");
        return;
    }

    // Convertir yyyy-mm-dd a yyyymmdd para firebase
    const yyyymmdd = fechaInput.replace(/-/g, '');
    
    const tbody = document.getElementById('print-tbody');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Cargando...</td></tr>';
    
    const printArea = document.getElementById('print-area');
    printArea.classList.remove('hidden');

    // UI header config
    const sedeName = appStateRef.sedes.find(s => s.codigoTerritorial === appStateRef.sedeActivaId)?.nombre || appStateRef.sedeActivaId;
    document.getElementById('print-sede-name').textContent = sedeName;
    document.getElementById('print-date-label').textContent = \`Fecha generada: \${fechaInput}\`;
    
    try {
        const citas = await getCitasPorSedeYFecha(appStateRef.sedeActivaId, yyyymmdd);
        
        if(citas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">No hay citas generadas para esta sede y fecha.</td></tr>';
            document.getElementById('btn-print').disabled = true;
            return;
        }

        tbody.innerHTML = '';
        citas.forEach(cita => {
            const tr = document.createElement('tr');
            
            // Colorear ligeramente si está ocupada
            if(cita.estado === 'ocupada') {
                tr.style.backgroundColor = '#fef2f2';
            }

            tr.innerHTML = \`
                <td><strong>\${formatHoraToDisplay(cita.hora)}</strong></td>
                <td style="font-family: monospace; font-size: 1.1em;">\${cita.codigo}</td>
                <td>Puesto \${cita.puesto}</td>
                <td><span class="badge \${cita.estado}">\${cita.estado}</span></td>
                <td><!-- Espacio observaciones papel --></td>
            \`;
            tbody.appendChild(tr);
        });

        document.getElementById('btn-print').disabled = false;

    } catch (e) {
        tbody.innerHTML = \`<tr><td colspan="5" class="text-center" style="color:red">Error: \${e.message}</td></tr>\`;
        document.getElementById('btn-print').disabled = true;
    }
}
