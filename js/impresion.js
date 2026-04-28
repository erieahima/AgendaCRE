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
    const nombreSede = (sede.nombre || "Sede Provincial").toUpperCase();

    return `
        <div class="a4-page" style="width: 210mm; height: 297mm; background: white; box-sizing: border-box; display: flex; flex-direction: column; font-family: 'Inter', 'Helvetica', sans-serif; color: #000; position: relative; padding: 0;">
            
            <!-- CABECERA ESTILO PDF (v3.30.0) -->
            <div style="background: #001a3d; color: white; padding: 12mm 15mm; display: flex; justify-content: space-between; align-items: flex-start; position: relative;">
                <div style="flex: 1;">
                    <div style="font-size: 22pt; font-weight: 800; color: #e20613; margin-bottom: 2mm;">Cruz Roja</div>
                    <div style="font-size: 11pt; font-weight: 400; letter-spacing: 1px;">Española</div>
                    <div style="font-size: 8pt; font-weight: 700; color: #e20613; margin-top: 4px; letter-spacing: 0.5px; text-transform: uppercase;">Proceso de regularización extraordinaria</div>
                </div>
                <div style="text-align: right; flex: 1;">
                    <div style="font-size: 10pt; font-weight: 700; letter-spacing: 1.5px; margin-bottom: 2px;">OFICINA PROVINCIAL</div>
                    <div style="font-size: 12pt; font-weight: 800; letter-spacing: 2px;">MÁLAGA</div>
                </div>
                <div style="position: absolute; bottom: -20px; left: 15mm;">
                    <h1 style="font-size: 32pt; margin: 0; color: #fff; font-weight: 800;">Resguardo de cita</h1>
                </div>
            </div>

            <div style="padding: 25mm 15mm 10mm 15mm; flex: 1; display: flex; flex-direction: column;">
                
                <!-- CUADRO DATOS DE LA CITA -->
                <div style="border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; margin-bottom: 8mm; background: #fff;">
                    <div style="background: #f8fafc; padding: 4mm 6mm; border-bottom: 1px solid #cbd5e1; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 11pt; font-weight: 700; color: #1e293b;">Datos de la cita</span>
                        <div style="background: #001a3d; color: white; padding: 2mm 6mm; border-radius: 4px; font-weight: 800; font-size: 12pt; letter-spacing: 1px;">
                            ${cita.codigo}
                        </div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #cbd5e1;">
                        <div style="padding: 4mm 6mm; border-right: 1px solid #cbd5e1;">
                            <label style="display: block; font-size: 8pt; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 1mm;">Código de la Cita</label>
                            <span style="font-size: 20pt; font-weight: 800; color: #001a3d;">${shortCode}</span>
                        </div>
                        <div style="padding: 4mm 6mm;">
                            <label style="display: block; font-size: 8pt; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 1mm;">Trámite</label>
                            <span style="font-size: 14pt; font-weight: 700; color: #0f172a;">Informe de vulnerabilidad</span>
                            <div style="font-size: 8pt; color: #64748b; margin-top: 1mm;">y/o "Hace constar" si procede</div>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #cbd5e1;">
                        <div style="padding: 4mm 6mm; border-right: 1px solid #cbd5e1;">
                            <label style="display: block; font-size: 8pt; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 1mm;">Fecha</label>
                            <span style="font-size: 16pt; font-weight: 800; color: #0f172a;">${fechaHumana}</span>
                            <div style="font-size: 8pt; color: #64748b; margin-top: 1mm;">Viernes, 8 de mayo</div>
                        </div>
                        <div style="padding: 4mm 6mm;">
                            <label style="display: block; font-size: 8pt; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 1mm;">Hora</label>
                            <span style="font-size: 16pt; font-weight: 800; color: #0f172a;">${horaHumana}</span>
                            <div style="font-size: 8pt; color: #64748b; margin-top: 1mm;">acuda 15 minutos antes: ${horaHumana}</div>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr;">
                        <div style="padding: 4mm 6mm; border-right: 1px solid #cbd5e1;">
                            <label style="display: block; font-size: 8pt; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 1mm;">Lugar de atención</label>
                            <span style="font-size: 12pt; font-weight: 800; color: #0f172a;">${sede.nombre}</span>
                            <div style="font-size: 8pt; color: #64748b; margin-top: 1mm;">${sede.direccion || 'Dirección de la sede'}</div>
                        </div>
                        <div style="padding: 4mm 6mm;">
                            <label style="display: block; font-size: 8pt; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 1mm;">Sala</label>
                            <span style="font-size: 12pt; font-weight: 800; color: #0f172a;">Sala Polivalente</span>
                            <div style="font-size: 8pt; color: #64748b; margin-top: 1mm;">Acceso por entrada principal</div>
                        </div>
                    </div>
                </div>

                <!-- INDICACIONES -->
                <div style="background: #fff5f5; border-left: 5px solid #e20613; padding: 5mm 8mm; margin-bottom: 8mm; border-radius: 0 4px 4px 0;">
                    <h3 style="margin: 0 0 3mm 0; font-size: 10pt; text-transform: uppercase; color: #991b1b; letter-spacing: 0.5px;">Indicaciones para acudir a tu cita</h3>
                    <ul style="list-style: none; padding: 0; margin: 0; font-size: 9.5pt; color: #1e293b; line-height: 1.5;">
                        <li style="margin-bottom: 2mm; display: flex; align-items: flex-start; gap: 8px;">
                            <span style="color: #e20613; font-size: 12pt;">◆</span>
                            <span><strong>Cita unipersonal e intransferible.</strong> Únicamente puede acudir la persona a cuyo nombre se ha emitido este resguardo.</span>
                        </li>
                        <li style="margin-bottom: 2mm; display: flex; align-items: flex-start; gap: 8px;">
                            <span style="color: #e20613; font-size: 12pt;">◆</span>
                            <span><strong>Aporta tu documento de identificación</strong> (pasaporte u otro documento oficial). Sin él no se podrá realizar la atención.</span>
                        </li>
                        <li style="margin-bottom: 2mm; display: flex; align-items: flex-start; gap: 8px;">
                            <span style="color: #e20613; font-size: 12pt;">◆</span>
                            <span><strong>Acude 15 minutos antes</strong> de la hora de tu cita para completar el alta.</span>
                        </li>
                        <li style="margin-bottom: 2mm; display: flex; align-items: flex-start; gap: 8px;">
                            <span style="color: #e20613; font-size: 12pt;">◆</span>
                            <span><strong>Inscríbete previamente</strong> a través del código QR que aparece debajo. El alta es necesaria para poder atenderte.</span>
                        </li>
                    </ul>
                </div>

                <!-- SECCIÓN QR -->
                <div style="border: 1px dashed #64748b; border-radius: 12px; padding: 6mm; display: flex; align-items: center; gap: 10mm; background: #fff;">
                    <div style="width: 35mm; height: 35mm; background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 2mm;">
                        <img src="img/QRIMAP.png" style="width: 100%; height: 100%; object-fit: contain;">
                    </div>
                    <div style="flex: 1;">
                        <h4 style="margin: 0 0 2mm 0; font-size: 12pt; color: #0f172a; font-weight: 800;">Inscripción previa obligatoria</h4>
                        <p style="margin: 0; font-size: 9pt; color: #475569; line-height: 1.5;">
                            Escanee este QR con tu móvil para acceder al formulario de Cruz Roja. Indica como motivo: <strong>«Regularización extraordinaria»</strong>. Tu inscripción quedará registrada y podrás ser atendido el día de tu cita.
                        </p>
                    </div>
                </div>

                <!-- SECCIÓN MULTILINGÜE -->
                <div style="margin-top: auto; padding-top: 8mm; display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; border-top: 1px solid #e2e8f0;">
                    <div>
                        <h5 style="color: #e20613; margin: 0 0 1mm 0; font-size: 8pt; text-transform: uppercase;">Español</h5>
                        <p style="font-size: 8pt; margin: 0; color: #475569; line-height: 1.4;">
                            <strong>Trae tu pasaporte u otro documento de identificación.</strong> Cita personal e intransferible. Acude 15 minutos antes. Inscríbete previamente con el QR.
                        </p>
                    </div>
                    <div>
                        <h5 style="color: #e20613; margin: 0 0 1mm 0; font-size: 8pt; text-transform: uppercase;">English</h5>
                        <p style="font-size: 8pt; margin: 0; color: #475569; line-height: 1.4;">
                            <strong>Bring your passport or other ID document.</strong> Personal and non-transferable appointment. Arrive 15 minutes early. Pre-register using the QR code.
                        </p>
                    </div>
                    <div>
                        <h5 style="color: #e20613; margin: 0 0 1mm 0; font-size: 8pt; text-transform: uppercase;">Français</h5>
                        <p style="font-size: 8pt; margin: 0; color: #475569; line-height: 1.4;">
                            <strong>Apportez votre passeport ou autre pièce d'identité.</strong> Rendez-vous personnel et non transférable. Présentez-vous 15 minutes à l'avance. Inscrivez-vous au préalable avec le QR.
                        </p>
                    </div>
                    <div dir="rtl" style="text-align: right;">
                        <h5 style="color: #e20613; margin: 0 0 1mm 0; font-size: 8pt; text-transform: uppercase;">العربية</h5>
                        <p style="font-size: 8pt; margin: 0; color: #475569; line-height: 1.4;">
                            <strong>أحضر جواز سفرك أو وثيقة هوية أخرى.</strong> الموعد شخصي وغير قابل للتحويل. احضر قبل 15 دقيقة. سجل مسبقًا عبر رمز QR.
                        </p>
                    </div>
                </div>
            </div>

            <!-- FOOTER -->
            <div style="background: #f1f5f9; padding: 4mm 15mm; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                <div style="font-size: 8pt; color: #64748b; font-family: monospace;">
                    Código de control: ${cita.id || cita.codigo}
                </div>
                <div style="font-size: 7.5pt; color: #94a3b8; text-align: right;">
                    Resguardo emitido el ${new Date().toLocaleDateString('es-ES')} | Documento sin valor identificativo
                </div>
            </div>
        </div>
    `;
}
