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
        <div class="a4-page" style="width: 210mm; height: 297mm; background: white; padding: 20mm; box-sizing: border-box; display: flex; flex-direction: column; font-family: 'Helvetica', sans-serif; color: #1e293b; border: 1px solid #eee;">
            <!-- Header -->
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #2563eb; padding-bottom: 10mm; margin-bottom: 15mm;">
                <div style="font-size: 24pt; font-weight: 800; color: #2563eb;">CRUZ ROJA</div>
                <div style="text-align: right;">
                    <div style="font-size: 14pt; font-weight: 700;">Ticket de Cita</div>
                    <div style="font-size: 10pt; color: #64748b;">Sistema de Gestión de Turnos</div>
                </div>
            </div>

            <!-- Content -->
            <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
                <div style="font-size: 18pt; color: #475569; margin-bottom: 5mm;">SU CÓDIGO DE TURNO ES:</div>
                <div style="font-size: 120pt; font-weight: 900; color: #0f172a; margin-bottom: 10mm; border: 4px solid #0f172a; padding: 10mm 20mm; border-radius: 20px; line-height: 1;">
                    ${shortCode}
                </div>
                
                <div style="width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; margin-top: 15mm;">
                    <div style="padding: 10mm; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
                        <div style="font-size: 12pt; color: #64748b; margin-bottom: 2mm;">FECHA</div>
                        <div style="font-size: 20pt; font-weight: 700;">${fechaHumana}</div>
                    </div>
                    <div style="padding: 10mm; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
                        <div style="font-size: 12pt; color: #64748b; margin-bottom: 2mm;">HORA ESTIMADA</div>
                        <div style="font-size: 20pt; font-weight: 700;">${horaHumana}</div>
                    </div>
                </div>

                <div style="margin-top: 15mm; padding: 10mm; width: 100%; border-left: 10px solid #2563eb; background: #eff6ff; border-radius: 0 12px 12px 0;">
                    <div style="font-size: 14pt; font-weight: 700; color: #1e3a8a;">UBICACIÓN: ${sede.nombre}</div>
                    <div style="font-size: 12pt; color: #374151; font-weight: 500; margin-top: 2mm;">📍 ${sede.direccion || 'Dirección no especificada'}</div>
                    <div style="font-size: 10pt; color: #1e40af; margin-top: 4mm; border-top: 1px dashed #bfdbfe; padding-top: 4mm;">
                        Por favor, permanezca en la zona de espera hasta que su código aparezca en pantalla o sea llamado por el personal.
                    </div>
                </div>

                <!-- Sección QR Ayuda (Nuevo V.3.9.1) -->
                <div style="margin-top: 10mm; display: flex; gap: 10mm; align-items: center; background: #fff5f5; padding: 8mm; border-radius: 12px; border: 1.5px solid #fee2e2;">
                    <div style="width: 45mm; height: 45mm; overflow: hidden; background: white; border: 1px solid #e2e8f0; border-radius: 8px; flex-shrink: 0; display: flex; justify-content: center; align-items: center;">
                        <img src="img/qr-poster.png" style="width: 330%; margin-top: -105%; margin-left: 0%;">
                    </div>
                    <div style="flex: 1;">
                        <div style="font-size: 14pt; font-weight: 800; color: #b91c1c; margin-bottom: 2mm;">¿NECESITAS AYUDA?</div>
                        <div style="font-size: 11pt; line-height: 1.4; color: #7f1d1d; font-weight: 500;">
                            Escanea este código con tu móvil para acceder al <strong>formulario de solicitud</strong> en solo 3 pasos.
                        </div>
                        <div style="font-size: 9pt; color: #991b1b; margin-top: 4mm; font-style: italic;">
                            * Este proceso es independiente del sistema de turnos.
                        </div>
                    </div>
                </div>
            </div>

            <!-- Footer -->
            <div style="margin-top: auto; padding-top: 10mm; border-top: 1px solid #e2e8f0; font-size: 9pt; color: #94a3b8; display: flex; justify-content: space-between;">
                <div>ID Cita: ${cita.codigo}</div>
                <div>Este documento es un comprobante de turno. No garantiza la atención inmediata.</div>
                <div>Pág. 1/1</div>
            </div>
        </div>
    `;
}
