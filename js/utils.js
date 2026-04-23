// js/utils.js

/**
 * Genera un sufijo aleatorio alfanumérico de X caracteres en mayúsculas
 */
export function generarSufijo(longitud = 3) {
    const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let resultado = '';
    for (let i = 0; i < longitud; i++) {
        resultado += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    return resultado;
}

/**
 * Genera el código único de cita.
 * Formato: REG + COD_SEDE(5) + YYYYMMDD + HHMM + SUFIJO(3)
 */
export function generarCodigo(codigoSede, fechaStr, horaStr, sufijo) {
    return `REG${codigoSede}${fechaStr}${horaStr}${sufijo}`;
}

/**
 * Convierte un objeto Date a string YYYYMMDD
 */
export function formatearFecha(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
}

/**
 * Convierte un objeto Date en string de fecha input 'YYYY-MM-DD'
 */
export function dateToInputString(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Convierte string YYYYMMDD a objeto Date
 */
export function parsearFecha(fechaStr) {
    const yyyy = parseInt(fechaStr.slice(0, 4), 10);
    const mm = parseInt(fechaStr.slice(4, 6), 10) - 1;
    const dd = parseInt(fechaStr.slice(6, 8), 10);
    return new Date(yyyy, mm, dd);
}

/**
 * Añade minutos a una hora en formato HH:MM
 */
export function sumarMinutos(horaStr, minutosSuma) {
    const [h, m] = horaStr.split(':').map(Number);
    const totalMinutos = h * 60 + m + minutosSuma;
    const newH = Math.floor(totalMinutos / 60) % 24;
    const newM = totalMinutos % 60;
    return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

/**
 * Convierte formato HH:MM a HHMM
 */
export function cleanHora(horaStr) {
    return horaStr.replace(':', '');
}

/**
 * Convierte formato HHMM a HH:MM
 */
export function formatHoraToDisplay(horaStrClean) {
    if(horaStrClean.length !== 4) return horaStrClean;
    return `${horaStrClean.slice(0, 2)}:${horaStrClean.slice(2, 4)}`;
}

/**
 * Genera el array de slots dada una configuración.
 * config = {
 *   fechaInicio: "YYYY-MM-DD",
 *   fechaFin: "YYYY-MM-DD",
 *   diasActivos: [0, 1, 2, 3, 4, 5, 6], // 0 dom, 1 lun...
 *   franjas: [{inicio: "09:00", fin: "14:00"}],
 *   intervalo: 30, // en minutos
 *   puestos: 3
 * }
 */
export function generarSlotsBatch(config) {
    const slots = [];
    const inicioDate = new Date(config.fechaInicio);
    // Para asegurar que llega hasta el final:
    const finDate = new Date(config.fechaFin);
    finDate.setHours(23, 59, 59, 999);

    const currentDate = new Date(inicioDate);

    while (currentDate <= finDate) {
        const dayOfWeek = currentDate.getDay();
        if (config.diasActivos.includes(dayOfWeek)) {
            const fechaStrYMD = formatearFecha(currentDate);

            // Procesar cada franja para este día
            config.franjas.forEach(franja => {
                let currentHora = franja.inicio;
                
                // Mientras la hora actual + intervalo no exceda la hora de fin
                while (currentHora < franja.fin) { // Ojo, simple comparación lexicográfica sirve si formato HH:MM (ej 09:00 < 14:00)
                    const nextHora = sumarMinutos(currentHora, config.intervalo);
                    if (nextHora > franja.fin) break;

                    const cleanHoraStr = cleanHora(currentHora);
                    
                    // Generar cita por cada puesto
                    for(let p = 1; p <= config.puestos; p++) {
                        slots.push({
                            fechaStr: fechaStrYMD,
                            horaStrClean: cleanHoraStr,
                            puesto: p,
                            // Convertir fecha y hora actuales a un Date puro para firebase si se desea, 
                            // aunque será firebase timestamp luego. 
                            baseDate: new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), parseInt(currentHora.split(':')[0]), parseInt(currentHora.split(':')[1]))
                        });
                    }

                    currentHora = nextHora;
                }
            });
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return slots;
}
