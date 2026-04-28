// js/impresion.js
import { getCitasPorSedeYRango } from './firebase.js';
import { formatHoraToDisplay, dateToInputString, formatearFechaHumana, formatearHoraHumana } from './utils.js';

let appStateRef = null;

export function setupImpresion(appState) {
    appStateRef = appState;
    const today = new Date();
    const todayStr = dateToInputString(today);
    document.getElementById('print-fecha-inicio').value = todayStr;
    document.getElementById('print-fecha-fin').value = todayStr;

    document.getElementById('btn-print-pdf').addEventListener('click', handleExportPDF);
}

async function handleExportPDF() {
    if (!appStateRef.sedeActivaId) {
        alert("Selecciona una sede arriba.");
        return;
    }

    const fInicio = document.getElementById('print-fecha-inicio').value;
    const fFin = document.getElementById('print-fecha-fin').value;
    
    if (!fInicio || !fFin) {
        alert("Selecciona ambas fechas.");
        return;
    }

    const yyyymmddInicio = fInicio.replace(/-/g, '');
    const yyyymmddFin = fFin.replace(/-/g, '');
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
        statusText.textContent = `Consultando rango: ${fInicio} al ${fFin}...`;

        let citas = await getCitasPorSedeYRango(appStateRef.sedeActivaId, yyyymmddInicio, yyyymmddFin);
        
        // Ordenar por fecha y hora manualmente (V.3.25.0)
        citas.sort((a,b) => {
            const da = a.fecha.localeCompare(b.fecha);
            if(da !== 0) return da;
            return a.hora.localeCompare(b.hora);
        });
        
        if (citas.length === 0) {
            alert("No hay citas registradas en el rango seleccionado.");
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
            renderArea.innerHTML = createA4Html(cita, sede);
            
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
        const fileName = `${yyyymmddInicio}_${yyyymmddFin}-Citas-${sede.nombre.replace(/ /g, '_')}.pdf`;
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

function createA4Html(cita, sede) {
    const shortCode = cita.codigo.slice(-3);
    const fechaHumana = formatearFechaHumana(cita.fecha);
    const horaHumana = formatearHoraHumana(cita.hora);

    return `
        <div class="a4-page" style="
            width: 210mm; height: 297mm;
            background: white;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            font-family: 'Inter', 'Helvetica', Arial, sans-serif;
            color: #000;
            padding: 0;
            overflow: hidden;
        ">
            <!-- ═══ CABECERA AZUL ═══ -->
            <div style="
                background: #001a3d;
                color: white;
                padding: 8mm 14mm;
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                flex-shrink: 0;
            ">
                <div>
                    <div style="font-size: 20pt; font-weight: 800; color: #e20613; line-height: 1.1;">Cruz Roja</div>
                    <div style="font-size: 7pt; font-weight: 700; color: #e20613; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.5px;">
                        Proceso de regularización extraordinaria
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 9pt; font-weight: 700; letter-spacing: 1px;">OFICINA PROVINCIAL</div>
                    <div style="font-size: 11pt; font-weight: 800; letter-spacing: 1.5px;">MÁLAGA</div>
                </div>
            </div>

            <!-- Título: Resguardo de cita (fuera del faldón, pegado abajo) -->
            <div style="
                background: white;
                padding: 5mm 14mm 4mm 14mm;
                border-bottom: 1px solid #e2e8f0;
                flex-shrink: 0;
            ">
                <h1 style="font-size: 20pt; margin: 0; color: #0f172a; font-weight: 800; line-height: 1;">Resguardo de cita</h1>
            </div>

            <!-- ═══ CUERPO PRINCIPAL ═══ -->
            <div style="padding: 5mm 14mm; flex: 1; display: flex; flex-direction: column; gap: 4.5mm; overflow: hidden;">

                <!-- CUADRO: Datos de la cita -->
                <div style="border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; flex-shrink: 0;">
                    <!-- Header del cuadro: solo el título, sin código a la derecha -->
                    <div style="background: #f8fafc; padding: 3mm 5mm; border-bottom: 1px solid #cbd5e1;">
                        <span style="font-size: 10pt; font-weight: 700; color: #1e293b;">Datos de la cita</span>
                    </div>

                    <!-- Fila 1: Código de la Cita | Trámite -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #cbd5e1;">
                        <div style="padding: 3mm 5mm; border-right: 1px solid #cbd5e1;">
                            <div style="font-size: 7pt; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 1mm;">Código de la Cita</div>
                            <div style="font-size: 22pt; font-weight: 800; color: #001a3d; line-height: 1;">${shortCode}</div>
                        </div>
                        <div style="padding: 3mm 5mm;">
                            <div style="font-size: 7pt; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 1mm;">Trámite</div>
                            <div style="font-size: 12pt; font-weight: 700; color: #0f172a; line-height: 1.2;">Proceso de Regularización</div>
                        </div>
                    </div>

                    <!-- Fila 2: Fecha | Hora (sin subtextos) -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #cbd5e1;">
                        <div style="padding: 3mm 5mm; border-right: 1px solid #cbd5e1;">
                            <div style="font-size: 7pt; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 1mm;">Fecha</div>
                            <div style="font-size: 14pt; font-weight: 800; color: #0f172a; line-height: 1;">${fechaHumana}</div>
                        </div>
                        <div style="padding: 3mm 5mm;">
                            <div style="font-size: 7pt; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 1mm;">Hora</div>
                            <div style="font-size: 14pt; font-weight: 800; color: #0f172a; line-height: 1;">${horaHumana}</div>
                        </div>
                    </div>

                    <!-- Fila 3: Lugar de atención | Dirección -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr;">
                        <div style="padding: 3mm 5mm; border-right: 1px solid #cbd5e1;">
                            <div style="font-size: 7pt; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 1mm;">Lugar de atención</div>
                            <div style="font-size: 11pt; font-weight: 800; color: #0f172a; line-height: 1.2;">${sede.nombre}</div>
                        </div>
                        <div style="padding: 3mm 5mm;">
                            <div style="font-size: 7pt; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 1mm;">Dirección</div>
                            <div style="font-size: 9.5pt; font-weight: 600; color: #0f172a; line-height: 1.3;">${sede.direccion || 'Dirección de la sede'}</div>
                        </div>
                    </div>
                </div>

                <!-- INDICACIONES -->
                <div style="
                    background: #fff5f5;
                    border-left: 4px solid #e20613;
                    padding: 4mm 5mm;
                    border-radius: 0 4px 4px 0;
                    flex-shrink: 0;
                ">
                    <div style="font-size: 8pt; font-weight: 700; text-transform: uppercase; color: #991b1b; margin-bottom: 2mm; letter-spacing: 0.4px;">
                        Indicaciones para acudir a tu cita
                    </div>
                    <div style="font-size: 8.5pt; color: #1e293b; line-height: 1.45;">
                        <div style="display: flex; gap: 5px; margin-bottom: 1.5mm;">
                            <span style="color: #e20613; flex-shrink: 0; font-size: 9pt;">◆</span>
                            <span><strong>Cita unipersonal e intransferible.</strong> Únicamente puede acudir la persona a cuyo nombre se ha emitido este resguardo.</span>
                        </div>
                        <div style="display: flex; gap: 5px; margin-bottom: 1.5mm;">
                            <span style="color: #e20613; flex-shrink: 0; font-size: 9pt;">◆</span>
                            <span><strong>Aporta tu documento de identificación</strong> (pasaporte u otro documento oficial). Sin él no se podrá realizar la atención.</span>
                        </div>
                        <div style="display: flex; gap: 5px; margin-bottom: 1.5mm;">
                            <span style="color: #e20613; flex-shrink: 0; font-size: 9pt;">◆</span>
                            <span><strong>Acude 15 minutos antes</strong> de la hora de tu cita para completar el alta.</span>
                        </div>
                        <div style="display: flex; gap: 5px;">
                            <span style="color: #e20613; flex-shrink: 0; font-size: 9pt;">◆</span>
                            <span><strong>Inscríbete previamente</strong> a través del código QR que aparece debajo. El alta es necesaria para poder atenderte.</span>
                        </div>
                    </div>
                </div>

                <!-- SECCIÓN QR -->
                <div style="
                    border: 1.5px dashed #94a3b8;
                    border-radius: 10px;
                    padding: 5mm;
                    display: flex;
                    align-items: center;
                    gap: 7mm;
                    flex-shrink: 0;
                ">
                    <div style="width: 32mm; height: 32mm; flex-shrink: 0; border: 1px solid #e2e8f0; border-radius: 6px; padding: 1.5mm; background: white;">
                        <img src="img/QRIMAP.png" style="width: 100%; height: 100%; object-fit: contain;">
                    </div>
                    <div>
                        <div style="font-size: 10pt; font-weight: 800; color: #0f172a; margin-bottom: 1.5mm;">Inscripción previa obligatoria</div>
                        <div style="font-size: 8pt; color: #475569; line-height: 1.45;">
                            Escanea este QR con tu móvil para acceder al formulario de Cruz Roja.
                            Indica como motivo: <strong>«Regularización extraordinaria»</strong>.
                            Tu inscripción quedará registrada y podrás ser atendido el día de tu cita.
                        </div>
                    </div>
                </div>

                <!-- ═══ SECCIÓN MULTILINGÜE ═══ -->
                <div style="
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 3.5mm 7mm;
                    padding-top: 4mm;
                    border-top: 1px solid #e2e8f0;
                    flex-shrink: 0;
                ">
                    <div>
                        <div style="font-size: 7pt; font-weight: 700; color: #e20613; text-transform: uppercase; margin-bottom: 1mm;">Español</div>
                        <div style="font-size: 7.5pt; color: #475569; line-height: 1.35;">
                            <strong>Trae tu pasaporte u otro documento de identificación.</strong>
                            Cita personal e intransferible. Acude 15 minutos antes. Inscríbete previamente con el QR.
                        </div>
                    </div>
                    <div>
                        <div style="font-size: 7pt; font-weight: 700; color: #e20613; text-transform: uppercase; margin-bottom: 1mm;">English</div>
                        <div style="font-size: 7.5pt; color: #475569; line-height: 1.35;">
                            <strong>Bring your passport or other ID document.</strong>
                            Personal and non-transferable appointment. Arrive 15 minutes early. Pre-register using the QR code.
                        </div>
                    </div>
                    <div>
                        <div style="font-size: 7pt; font-weight: 700; color: #e20613; text-transform: uppercase; margin-bottom: 1mm;">Français</div>
                        <div style="font-size: 7.5pt; color: #475569; line-height: 1.35;">
                            <strong>Apportez votre passeport ou autre pièce d'identité.</strong>
                            Rendez-vous personnel et non transférable. Présentez-vous 15 minutes à l'avance. Inscrivez-vous avec le QR.
                        </div>
                    </div>
                    <div dir="rtl" style="text-align: right;">
                        <div style="font-size: 7pt; font-weight: 700; color: #e20613; text-transform: uppercase; margin-bottom: 1mm;">العربية</div>
                        <div style="font-size: 7.5pt; color: #475569; line-height: 1.35;">
                            <strong>أحضر جواز سفرك أو وثيقة هوية أخرى.</strong>
                            الموعد شخصي وغير قابل للتحويل. احضر قبل 15 دقيقة. سجل مسبقًا عبر رمز QR.
                        </div>
                    </div>
                </div>

            </div>

            <!-- ═══ PIE DE PÁGINA ═══ -->
            <div style="
                background: #f1f5f9;
                padding: 3mm 14mm;
                border-top: 1px solid #e2e8f0;
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-shrink: 0;
            ">
                <div style="font-size: 7.5pt; font-weight: 700; color: #475569;">
                    CRUZ ROJA ESPAÑOLA · OFICINA PROVINCIAL DE MÁLAGA
                </div>
                <div style="font-size: 7pt; color: #94a3b8; text-align: right;">
                    Resguardo emitido el ${new Date().toLocaleDateString('es-ES')} · Documento sin valor sin documento identificativo el día de la cita
                </div>
            </div>
        </div>
    `;
}
