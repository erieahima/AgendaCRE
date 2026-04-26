// js/impresion.js
import { getCitasPorSedeYFecha } from './firebase.js';
import { formatHoraToDisplay, dateToInputString, formatearFechaHumana, formatearHoraHumana } from './utils.js';

let appStateRef = null;

export function setupImpresion(appState) {
    appStateRef = appState;
    const today = new Date();
    document.getElementById('print-fecha').value = dateToInputString(today);

    document.getElementById('btn-print-pdf').addEventListener('click', handleExportPDF);
}

async function handleExportPDF() {
    if (!appStateRef.sedeActivaId) {
        alert("Selecciona una sede arriba.");
        return;
    }

    const fechaInput = document.getElementById('print-fecha').value;
    if (!fechaInput) {
        alert("Selecciona una fecha.");
        return;
    }

    const yyyymmdd = fechaInput.replace(/-/g, '');
    const sede = appStateRef.sedes.find(s => s.codigoTerritorial === appStateRef.sedeActivaId);
    if (!sede) return;

    const msgContainer = document.getElementById('pdf-generating-msg');
    const statusText = document.getElementById('pdf-status-text');
    const renderArea = document.getElementById('a4-render-area');
    const btnExport = document.getElementById('btn-print-pdf');

    try {
        btnExport.disabled = true;
        msgContainer.classList.remove('hidden');
        statusText.textContent = "Obteniendo datos de Firebase...";

        const citas = await getCitasPorSedeYFecha(appStateRef.sedeActivaId, yyyymmdd);
        
        if (citas.length === 0) {
            alert("No hay citas para exportar en este día.");
            msgContainer.classList.add('hidden');
            btnExport.disabled = false;
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: 'p',
            unit: 'mm',
            format: 'a4'
        });

        // Loop por cada cita
        for (let i = 0; i < citas.length; i++) {
            const cita = citas[i];
            statusText.textContent = `Generando página ${i + 1} de ${citas.length}...`;

            // Preparar el HTML de UNA hoja A4
            renderArea.innerHTML = createA4Html(cita, sede, fechaInput);
            
            // Renderizar a Canvas
            const canvas = await html2canvas(renderArea.querySelector('.a4-page'), {
                scale: 2, // Mayor calidad
                useCORS: true,
                logging: false
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.8);
            
            if (i > 0) doc.addPage();
            
            // Añadir imagen al PDF (A4 es 210x297mm)
            doc.addImage(imgData, 'JPEG', 0, 0, 210, 297);
        }

        statusText.textContent = "¡Documento listo! Descargando...";
        const fileName = `${yyyymmdd}-Citas-${sede.nombre.replace(/ /g, '_')}.pdf`;
        doc.save(fileName);

        setTimeout(() => {
            msgContainer.classList.add('hidden');
            btnExport.disabled = false;
            renderArea.innerHTML = '';
        }, 2000);

    } catch (error) {
        console.error(error);
        alert("Error al generar PDF: " + error.message);
        msgContainer.classList.add('hidden');
        btnExport.disabled = false;
    }
}

function createA4Html(cita, sede, fechaISO) {
    const shortCode = cita.codigo.slice(-3);
    const fechaHumana = formatearFechaHumana(cita.fecha);
    const horaHumana = formatearHoraHumana(cita.hora);

    return `
        <div class="a4-page" style="width: 210mm; height: 297mm; background: white; padding: 25mm; box-sizing: border-box; display: flex; flex-direction: column; font-family: 'Inter', 'Helvetica', sans-serif; color: #000; position: relative;">
            
            <!-- CUADRO SUPERIOR (Datos Identificativos) -->
            <div style="border: 2.5pt solid #000; padding: 12mm; margin-bottom: 20mm; border-radius: 4px;">
                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8mm;">
                    <div style="font-size: 16pt;"><strong>Fecha de la cita:</strong> ${fechaHumana}</div>
                    <div style="font-size: 16pt;"><strong>Hora de la cita:</strong> ${horaHumana}</div>
                </div>
                
                <div style="font-size: 14pt; margin-bottom: 8mm; line-height: 1.4;">
                    <strong>Dirección:</strong><br>
                    ${sede.nombre}<br>
                    📍 ${sede.direccion || 'Dirección no especificada'}
                </div>

                <div style="font-size: 32pt; font-weight: 900; border-top: 1.5pt solid #eee; padding-top: 6mm; text-align: center; letter-spacing: 2px;">
                    CÓDIGO DE CITA: <span style="color: #2563eb;">${shortCode}</span>
                </div>
            </div>

            <!-- TEXTO INTERMEDIO (Fuera del cuadro) -->
            <div style="text-align: center; margin-bottom: 12mm; padding: 0 10mm;">
                <p style="font-size: 15pt; line-height: 1.6; color: #334155;">
                    Para el día de la fecha tendrá que asistir con los datos insertados en nuestros datos a través del siguiente código QR
                </p>
            </div>

            <!-- CUADRO CÓDIGO QR -->
            <div style="border: 2pt solid #000; padding: 10mm; margin: 0 auto; width: fit-content; border-radius: 12px; background: #fff; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                <div style="width: 85mm; height: 85mm; overflow: hidden; display: flex; justify-content: center; align-items: center; background: white;">
                    <img src="img/qr-poster.png" style="width: 330%; margin-top: -105%; filter: contrast(1.1);">
                </div>
                <div style="text-align: center; font-size: 10pt; color: #64748b; margin-top: 4mm; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                    Escanee para completar sus datos
                </div>
            </div>

            <!-- ESPACIO FLEXIBLE -->
            <div style="flex: 1;"></div>

            <!-- PIE DE PÁGINA -->
            <div style="border-top: 1.5pt solid #000; padding-top: 6mm; margin-top: 20mm; display: flex; justify-content: space-between; align-items: flex-end;">
                <div style="font-size: 11pt; font-family: monospace; color: #475569;">
                    <strong>código de control:</strong> ${cita.codigo}
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 12pt; font-weight: 800; color: #2563eb;">CRUZ ROJA</div>
                    <div style="font-size: 8pt; color: #94a3b8; margin-top: 1mm;">Generado el ${new Date().toLocaleDateString('es-ES')}</div>
                </div>
            </div>
        </div>
    `;
}
    `;
}
