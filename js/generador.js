// js/generador.js
import { generarSlotsBatch, generarCodigo, generarSufijo, dateToInputString } from './utils.js';
import { guardarCitasBulk } from './firebase.js';

let appStateRef = null;
let franjaIdCounter = 0;

export function setupGenerador(appState) {
    appStateRef = appState;
    const form = document.getElementById('form-generador');
    const btnAddFranja = document.getElementById('btn-add-franja');
    const containerFranjas = document.getElementById('franjas-container');
    
    // Set default dates
    const today = new Date();
    document.getElementById('gen-fecha-inicio').value = dateToInputString(today);
    
    // Default franja (09:00 - 14:00)
    addFranjaHTMl(containerFranjas, "09:00", "14:00");

    btnAddFranja.addEventListener('click', () => {
        addFranjaHTMl(containerFranjas, "16:00", "19:00");
    });

    form.addEventListener('submit', handleGenerarSubmit);
}

function addFranjaHTMl(container, startVal, endVal) {
    const div = document.createElement('div');
    div.className = 'franja-item';
    div.dataset.id = franjaIdCounter++;

    div.innerHTML = `
        <div style="display: flex; gap: 1rem; width: 100%;">
            <div style="flex:1;">
                <label>Inicio:</label>
                <input type="time" name="franja-inicio" class="input-modern w-full" value="${startVal}" required>
            </div>
            <div style="flex:1;">
                <label>Fin:</label>
                <input type="time" name="franja-fin" class="input-modern w-full" value="${endVal}" required>
            </div>
            <div style="display:flex; align-items:flex-end;">
                <button type="button" class="btn-icon btn-remove-franja">❌</button>
            </div>
        </div>
        <div class="dias-checkboxes" style="margin-top: 0.5rem;">
            <label><input type="checkbox" value="1" checked> L</label>
            <label><input type="checkbox" value="2" checked> M</label>
            <label><input type="checkbox" value="3" checked> X</label>
            <label><input type="checkbox" value="4" checked> J</label>
            <label><input type="checkbox" value="5" checked> V</label>
            <label><input type="checkbox" value="6"> S</label>
            <label><input type="checkbox" value="0"> D</label>
        </div>
    `;

    // Botón eliminar
    div.querySelector('.btn-remove-franja').addEventListener('click', () => {
        div.remove();
    });

    container.appendChild(div);
}

async function handleGenerarSubmit(e) {
    e.preventDefault();

    if (!appStateRef.sedeActivaId) {
        alert("Por favor, selecciona una sede arriba (si no carga, revisa la configuración de Firebase).");
        return;
    }

    const fechaInicio = document.getElementById('gen-fecha-inicio').value;
    const fechaFin = document.getElementById('gen-fecha-fin').value;
    // Franjas
    const franjasDom = document.querySelectorAll('.franja-item');
    if (franjasDom.length === 0) {
        alert("Debes añadir al menos una franja horaria.");
        return;
    }

    const franjas = Array.from(franjasDom).map(item => {
        const checked = item.querySelectorAll('input[type="checkbox"]:checked');
        return {
            inicio: item.querySelector('input[name="franja-inicio"]').value,
            fin: item.querySelector('input[name="franja-fin"]').value,
            diasActivos: Array.from(checked).map(cb => parseInt(cb.value))
        };
    });

    for (let f of franjas) {
        if (f.diasActivos.length === 0) {
            alert(`La franja de ${f.inicio} a ${f.fin} debe tener al menos un día activo seleccionado.`);
            return;
        }
    }

    const intervalo = parseInt(document.getElementById('gen-intervalo').value);
    const puestos = parseInt(document.getElementById('gen-puestos').value);

    const config = {
        fechaInicio,
        fechaFin,
        franjas,
        intervalo,
        puestos
    };

    const slotsBase = generarSlotsBatch(config);
    if(slotsBase.length === 0) {
        alert("No se generaron huecos con la configuración seleccionada. Comprueba rangos y fechas.");
        return;
    }

    // Convertir slots base a objetos de Cita con código y estado
    const citas = slotsBase.map(slot => {
        const sufijo = generarSufijo(3);
        const cod = generarCodigo(appStateRef.sedeActivaId, slot.fechaStr, slot.horaStrClean, sufijo);
        
        return {
            ...slot,
            codigo: cod,
            sede: appStateRef.sedeActivaId,
            estado: "disponible" // Todas nacen disponibles
        };
    });

    if(!confirm(`Se van a generar ${citas.length} citas. ¿Deseas continuar?`)) {
        return;
    }

    await executeBulkCreation(citas);
}

async function executeBulkCreation(citas) {
    const progressContainer = document.getElementById('progress-container');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const btnSubmit = document.getElementById('btn-generar');

    btnSubmit.disabled = true;
    progressContainer.classList.remove('hidden');
    progressFill.style.width = '0%';
    progressText.innerText = "Iniciando subida a Firebase...";

    try {
        // En una app real podríamos simular progreso particionando aquí y actualizando la barra, 
        // pero guardarCitasBulk ya particiona internamente, podemos asumir que tarda un momento y usar una animación falsa
        // para dar UX, o modificar bulk para retornar promesas.
        // Haremos una transición de UX 50% al empezar.
        progressFill.style.width = '50%';
        
        const guardadas = await guardarCitasBulk(citas);

        progressFill.style.width = '100%';
        progressText.innerText = `¡Éxito! Se han guardado ${guardadas} citas en la agenda.`;
        
        // Reset después de unos segundos
        setTimeout(() => {
            progressContainer.classList.add('hidden');
            progressFill.style.width = '0%';
            btnSubmit.disabled = false;
        }, 4000);

    } catch (e) {
        console.error("Error bulk save:", e);
        progressText.innerText = "Error al guardar citas.";
        btnSubmit.disabled = false;
        alert("Error: " + e.message);
    }
}
