// js/generador.js
import { generarSlotsBatch, generarCodigo, generarSufijo, dateToInputString } from './utils.js';
import { guardarCitasBulk, getCitasPorSedeYRango, borrarCitasBulk } from './firebase.js';

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
    
    const btnBorrar = document.getElementById('btn-borrar');
    if(btnBorrar) {
        btnBorrar.addEventListener('click', handleBorrarSubmit);
    }
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
        alert("Por favor, selecciona una sede arriba.");
        return;
    }

    const fechaInicio = document.getElementById('gen-fecha-inicio').value;
    const fechaFin = document.getElementById('gen-fecha-fin').value;
    const progressContainer = document.getElementById('progress-container');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const btnSubmit = e.target.querySelector('button[type="submit"]');

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
        alert("No se generaron huecos. Comprueba rangos y fechas.");
        return;
    }

    // V.3.8.0: Evitar duplicados.
    const fIniBusq = fechaInicio.replace(/-/g, '');
    const fFinBusq = fechaFin.replace(/-/g, '');

    btnSubmit.disabled = true;
    progressContainer.classList.remove('hidden');
    progressFill.style.width = '0%';
    progressText.innerText = "Comprobando duplicados en Firebase...";

    try {
        const existentes = await getCitasPorSedeYRango(appStateRef.sedeActivaId, fIniBusq, fFinBusq);
        const mapExistentes = new Set(existentes.map(c => `${c.fecha}|${c.hora}|${c.puesto}`));

        const slotsNuevos = slotsBase.filter(s => !mapExistentes.has(`${s.fechaStr}|${s.horaStrClean}|${s.puesto}`));

        if (slotsNuevos.length === 0) {
            alert("Todas las citas solicitadas ya existen.");
            progressContainer.classList.add('hidden');
            btnSubmit.disabled = false;
            return;
        }

        const countExistentes = slotsBase.length - slotsNuevos.length;
        if (countExistentes > 0) {
            if (!confirm(`Se han detectado ${countExistentes} citas ya existentes. Se generarán solo las ${slotsNuevos.length} nuevas. ¿Continuar?`)) {
                progressContainer.classList.add('hidden');
                btnSubmit.disabled = false;
                return;
            }
        }

        progressFill.style.width = '30%';
        progressText.innerText = "Generando códigos únicos...";

        const usedSuffixesPerDay = {};
        const citas = slotsNuevos.map(slot => {
            if (!usedSuffixesPerDay[slot.fechaStr]) {
                usedSuffixesPerDay[slot.fechaStr] = new Set();
                existentes.filter(e => e.fecha === slot.fechaStr).forEach(e => {
                    const suf = e.codigo.slice(-3);
                    usedSuffixesPerDay[slot.fechaStr].add(suf);
                });
            }

            let sufijo = generarSufijo(3);
            let intentos = 0;
            while (usedSuffixesPerDay[slot.fechaStr].has(sufijo) && intentos < 1000) {
                sufijo = generarSufijo(3);
                intentos++;
            }
            usedSuffixesPerDay[slot.fechaStr].add(sufijo);

            return {
                fecha: slot.fechaStr,
                hora: slot.horaStrClean,
                puesto: slot.puesto,
                codigo: generarCodigo(appStateRef.sedeActivaId, slot.fechaStr, slot.horaStrClean, sufijo),
                sede: appStateRef.sedeActivaId,
                estado: "pendiente",
                asistencia: false,
                llamada: null
            };
        });

        progressFill.style.width = '60%';
        progressText.innerText = `Guardando ${citas.length} citas...`;

        const guardadas = await guardarCitasBulk(citas);

        progressFill.style.width = '100%';
        progressText.innerText = `¡Éxito! Se han guardado ${guardadas} citas nuevas.`;
        
        setTimeout(() => {
            progressContainer.classList.add('hidden');
            btnSubmit.disabled = false;
        }, 3000);

    } catch (e) {
        console.error(e);
        progressText.innerText = "Error al procesar.";
        btnSubmit.disabled = false;
        alert("Error: " + e.message);
    }
}

async function handleBorrarSubmit(e) {
    if(e) e.preventDefault();

    if (!appStateRef.sedeActivaId) {
        alert("Selecciona una sede.");
        return;
    }

    const fechaInicio = document.getElementById('gen-fecha-inicio').value;
    const fechaFin = document.getElementById('gen-fecha-fin').value;
    const btnBorrar = document.getElementById('btn-borrar');
    btnBorrar.disabled = true;

    try {
        const fIni = fechaInicio.replace(/-/g, '');
        const fFin = fechaFin.replace(/-/g, '');
        const existentes = await getCitasPorSedeYRango(appStateRef.sedeActivaId, fIni, fFin);
        
        if (existentes.length === 0) {
            alert("No hay citas para borrar en ese rango.");
            btnBorrar.disabled = false;
            return;
        }

        if(!confirm(`¿Borrar ${existentes.length} citas de la sede actual?`)) {
            btnBorrar.disabled = false;
            return;
        }

        const ids = existentes.map(c => c.id);
        const borradas = await borrarCitasBulk(ids);
        alert(`Eliminadas ${borradas} citas.`);
    } catch (err) {
        console.error(err);
        alert("Error: " + err.message);
    }
    btnBorrar.disabled = false;
}
