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
    document.getElementById('btn-export-excel').addEventListener('click', handleExportExcel);
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
// ═══════════════════════════════════════════════════════
// EXPORTACIÓN A EXCEL (v3.29.0)
// ═══════════════════════════════════════════════════════

async function handleExportExcel() {
    if (!appStateRef.sedeActivaId) { alert('Selecciona una sede arriba.'); return; }

    const fInicio = document.getElementById('print-fecha-inicio').value;
    const fFin    = document.getElementById('print-fecha-fin').value;
    if (!fInicio || !fFin) { alert('Selecciona ambas fechas.'); return; }

    const sede = appStateRef.sedes.find(s => s.codigoTerritorial === appStateRef.sedeActivaId);
    if (!sede) return;

    const yyyymmddIni = fInicio.replace(/-/g, '');
    const yyyymmddFin = fFin.replace(/-/g, '');

    const btn = document.getElementById('btn-export-excel');
    const msgContainer = document.getElementById('pdf-generating-msg');
    const statusText   = document.getElementById('pdf-status-text');

    try {
        btn.disabled = true;
        msgContainer.classList.remove('hidden');
        statusText.textContent = 'Obteniendo datos de Firebase...';

        let citas = await getCitasPorSedeYRango(appStateRef.sedeActivaId, yyyymmddIni, yyyymmddFin);
        citas.sort((a, b) => {
            const d = a.fecha.localeCompare(b.fecha);
            if (d !== 0) return d;
            if (a.hora !== b.hora) return a.hora.localeCompare(b.hora);
            return (a.puesto || 0) - (b.puesto || 0);
        });

        if (citas.length === 0) {
            alert('No hay citas en el rango seleccionado.');
            msgContainer.classList.add('hidden');
            btn.disabled = false;
            return;
        }

        statusText.textContent = `Generando Excel con ${citas.length} citas...`;

        const ExcelJS = window.ExcelJS;
        if (!ExcelJS) { alert('La librería ExcelJS no está disponible. Recarga la página.'); return; }

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'AgendaCRE';
        workbook.created = new Date();

        // Primero construir Listado para obtener el mapa de filas
        // que Calendario usará para referenciar celdas con fórmulas vinculadas
        const rowMap = buildListadoSheet(workbook, citas);
        buildCalendarioSheet(workbook, citas, fInicio, fFin, sede, rowMap);

        statusText.textContent = '¡Listo! Descargando...';
        const buffer = await workbook.xlsx.writeBuffer();
        const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url    = URL.createObjectURL(blob);
        const a      = document.createElement('a');
        a.href       = url;
        a.download   = `${yyyymmddIni}-${yyyymmddFin}_${sede.nombre.replace(/ /g, '_')}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);

    } catch (err) {
        console.error(err);
        alert('Error al generar Excel: ' + err.message);
    } finally {
        msgContainer.classList.add('hidden');
        btn.disabled = false;
    }
}

// ── Colores de celda por estado (ARGB: Alpha+RGB) ──────────────────────────
const ESTADO_FILL = {
    grabada:    { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }, // verde claro
    incidencia: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }, // rojo claro
    asignada:   { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }, // azul claro
    pendiente:  { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }, // gris claro
};
// El Formato Condicional en Excel requiere usar bgColor para rellenos sólidos
const ESTADO_CF_FILL = {
    grabada:    { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFD1FAE5' } },
    incidencia: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFEE2E2' } },
    asignada:   { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFDBEAFE' } },
    pendiente:  { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF1F5F9' } },
};
const ESTADO_FONT_COLOR = {
    grabada:    { argb: 'FF065F46' },
    incidencia: { argb: 'FF991B1B' },
    asignada:   { argb: 'FF1E40AF' },
    pendiente:  { argb: 'FF374151' },
};
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
const BORDER_THIN = { style: 'thin', color: { argb: 'FFD1D5DB' } };
const ALL_BORDERS = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };

function estadoLabel(estado) {
    const labels = { grabada: 'Grabada', incidencia: 'Incidencia', asignada: 'Asignada', pendiente: 'Pendiente' };
    return labels[estado] || (estado || 'Pendiente');
}

function fechaHumanaCorta(yyyymmdd) {
    if (!yyyymmdd || yyyymmdd.length < 8) return yyyymmdd;
    const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const d = new Date(yyyymmdd.slice(0,4), yyyymmdd.slice(4,6)-1, yyyymmdd.slice(6,8));
    return `${dias[d.getDay()]} ${yyyymmdd.slice(6,8)}/${yyyymmdd.slice(4,6)}`;
}

// ── Hoja 1: CALENDARIO (grid visual igual que la app) ─────────────────────
// rowMap: Map<"fecha|hora|puesto" → número de fila en Listado>
// Las celdas de la hoja Calendario usan fórmulas que apuntan a la columna
// Documento de Listado, por lo que editar el documento en cualquiera de las
// dos hojas lo actualiza en la otra automáticamente.
function buildCalendarioSheet(workbook, citas, fInicio, fFin, sede, rowMap) {
    const ws = workbook.addWorksheet('Calendario', { views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }] });
    
    // v3.29.2: Proteger la hoja para que sea de solo lectura
    ws.protect('AgendaCRE', { selectLockedCells: true, selectUnlockedCells: true });

    // Calcular días del rango
    const dates = [];
    const cur = new Date(fInicio);
    const end = new Date(fFin);
    while (cur <= end) {
        const y  = cur.getFullYear();
        const m  = String(cur.getMonth() + 1).padStart(2, '0');
        const dd = String(cur.getDate()).padStart(2, '0');
        dates.push(`${y}${m}${dd}`);
        cur.setDate(cur.getDate() + 1);
    }

    // Calcular filas únicas: combinaciones (hora × puesto)
    const slots = [];
    const slotSet = new Set();
    citas.forEach(c => {
        const key = `${c.hora}|${c.puesto}`;
        if (!slotSet.has(key)) { slotSet.add(key); slots.push({ hora: c.hora, puesto: c.puesto }); }
    });
    slots.sort((a, b) => a.hora.localeCompare(b.hora) || (a.puesto - b.puesto));

    // Mapa rápido de citas
    const citaMap = new Map();
    citas.forEach(c => citaMap.set(`${c.fecha}|${c.hora}|${c.puesto}`, c));

    // Fila 1: cabecera de sede
    const sedeRow = ws.getRow(1);
    sedeRow.getCell(1).value = `${sede.nombre} · ${fInicio} → ${fFin}`;
    sedeRow.getCell(1).font  = { bold: true, size: 12, color: { argb: 'FF1E40AF' } };
    ws.mergeCells(1, 1, 1, dates.length + 1);
    sedeRow.height = 22;

    // Fila 2: cabeceras de fecha
    const headerRow = ws.getRow(2);
    headerRow.getCell(1).value = 'Hora / Puesto';
    headerRow.getCell(1).fill  = HEADER_FILL;
    headerRow.getCell(1).font  = HEADER_FONT;
    headerRow.getCell(1).border = ALL_BORDERS;
    headerRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

    dates.forEach((fecha, i) => {
        const cell = headerRow.getCell(i + 2);
        cell.value     = fechaHumanaCorta(fecha);
        cell.fill      = HEADER_FILL;
        cell.font      = HEADER_FONT;
        cell.border    = ALL_BORDERS;
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    headerRow.height = 28;

    // Columna A: etiquetas de slot
    ws.getColumn(1).width = 14;

    // Filas de datos
    slots.forEach((slot, si) => {
        const row  = ws.getRow(si + 3);
        row.height = 52;

        const labelCell = row.getCell(1);
        labelCell.value     = `${slot.hora}   P.${slot.puesto}`;
        labelCell.font      = { bold: true, size: 9, color: { argb: 'FF374151' } };
        labelCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        labelCell.border    = ALL_BORDERS;
        labelCell.alignment = { horizontal: 'center', vertical: 'middle' };

        dates.forEach((fecha, di) => {
            const citaKey = `${fecha}|${slot.hora}|${slot.puesto}`;
            const cita    = citaMap.get(citaKey);
            const cell    = row.getCell(di + 2);
            cell.border    = ALL_BORDERS;
            cell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };

            if (cita) {
                const shortCode = (cita.codigo || '').slice(-3);
                const doc       = cita.documento || '—';
                const estado    = cita.estado || 'pendiente';
                const asist     = cita.asistencia ? ' ✓' : '';
                const listadoRow = rowMap ? rowMap.get(citaKey) : null;

                if (listadoRow) {
                    // Fórmula vinculada: la celda de Documento en Listado es la columna F (6)
                    // Además, el Estado lo leemos dinámicamente de la columna E (5) de Listado.
                    // Formato: Código(+✓) \n Documento \n Estado
                    const formula = `"${shortCode}${asist}"&CHAR(10)&IF(Listado!F${listadoRow}<>"",Listado!F${listadoRow},"—")&CHAR(10)&Listado!E${listadoRow}`;
                    cell.value = {
                        formula,
                        result: `${shortCode}${asist}\n${doc}\n${estadoLabel(estado)}`
                    };
                } else {
                    cell.value = `${shortCode}${asist}\n${doc}\n${estadoLabel(estado)}`;
                }

                cell.fill = ESTADO_FILL[estado] || ESTADO_FILL.pendiente;
                cell.font = { size: 9, color: ESTADO_FONT_COLOR[estado] || ESTADO_FONT_COLOR.pendiente };
            } else {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
            }
        });
    });

    // Anchos de columnas de fecha
    dates.forEach((_, i) => { ws.getColumn(i + 2).width = 16; });

    // Formato Condicional para Calendario: cambia color si el texto cambia dinámicamente
    const endCol = ws.getColumn(dates.length + 1).letter;
    const gridRef = `B3:${endCol}${slots.length + 2}`;
    ws.addConditionalFormatting({
        ref: gridRef,
        rules: [
            { type: 'expression', formulae: ['ISNUMBER(SEARCH("Grabada",B3))'], style: { fill: ESTADO_CF_FILL.grabada, font: { color: ESTADO_FONT_COLOR.grabada } } },
            { type: 'expression', formulae: ['ISNUMBER(SEARCH("Incidencia",B3))'], style: { fill: ESTADO_CF_FILL.incidencia, font: { color: ESTADO_FONT_COLOR.incidencia } } },
            { type: 'expression', formulae: ['ISNUMBER(SEARCH("Asignada",B3))'], style: { fill: ESTADO_CF_FILL.asignada, font: { color: ESTADO_FONT_COLOR.asignada } } },
            { type: 'expression', formulae: ['ISNUMBER(SEARCH("Pendiente",B3))'], style: { fill: ESTADO_CF_FILL.pendiente, font: { color: ESTADO_FONT_COLOR.pendiente } } }
        ]
    });
}

// ── Hoja 2: LISTADO (tabla completa de backup) ─────────────────────────────
// Devuelve Map<"fecha|hora|puesto" → número de fila> para que Calendario
// pueda generar fórmulas vinculadas a la columna Documento (F).
function buildListadoSheet(workbook, citas) {
    const ws = workbook.addWorksheet('Listado');
    // rowMap guarda en qué fila de Excel quedó cada cita
    const rowMap = new Map();

    ws.columns = [
        { header: 'Fecha',          key: 'fecha',          width: 12 },
        { header: 'Hora',           key: 'hora',           width: 8  },
        { header: 'Puesto',         key: 'puesto',         width: 8  },
        { header: 'Código',         key: 'codigo',         width: 8  }, // solo 3 chars
        { header: 'Estado',         key: 'estado',         width: 13 },
        { header: 'Documento',      key: 'documento',      width: 14 },
        { header: 'HC',             key: 'haceConstar',    width: 6  },
        { header: 'Vulnerabilidad', key: 'vulnerabilidad', width: 15 },
        { header: 'Asistencia',     key: 'asistencia',     width: 11 },
        { header: 'Observaciones',  key: 'observaciones',  width: 35 },
    ];

    // Estilo de cabecera
    const headerRow = ws.getRow(1);
    headerRow.eachCell(cell => {
        cell.fill      = HEADER_FILL;
        cell.font      = HEADER_FONT;
        cell.border    = ALL_BORDERS;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    headerRow.height = 24;

    // Filas de datos (fila 1 = cabecera, datos desde fila 2)
    citas.forEach((cita, idx) => {
        const excelRow = idx + 2; // la fila 1 es la cabecera
        const estado = cita.estado || 'pendiente';
        const f = cita.fecha || '';
        const fechaDisplay = f.length === 8
            ? `${f.slice(6,8)}/${f.slice(4,6)}/${f.slice(0,4)}`
            : f;

        const row = ws.addRow({
            fecha:          fechaDisplay,
            hora:           cita.hora           || '',
            puesto:         cita.puesto         || '',
            codigo:         (cita.codigo        || '').slice(-3),
            estado:         '', // Se rellena con fórmula/desplegable a continuación
            documento:      cita.documento      || '',
            haceConstar:    cita.haceConstar    ? 'Sí' : 'No',
            vulnerabilidad: cita.vulnerabilidad ? 'Sí' : 'No',
            asistencia:     cita.asistencia     ? 'Sí' : 'No',
            observaciones:  cita.observaciones  || '',
        });

        // Lista desplegable y automatización del Estado
        const cellEstado = row.getCell('estado');
        cellEstado.dataValidation = {
            type: 'list',
            allowBlank: false,
            formulae: ['"Pendiente,Asignada,Grabada,Incidencia"']
        };

        // Si la cita aún es editable, automatizamos para que Documento -> Asignada
        if (estado === 'pendiente' || estado === 'asignada') {
            cellEstado.value = {
                formula: `IF(F${excelRow}<>"","Asignada","Pendiente")`,
                result: estadoLabel(estado)
            };
        } else {
            cellEstado.value = estadoLabel(estado);
        }

        const fill = ESTADO_FILL[estado] || ESTADO_FILL.pendiente;
        const fontColor = ESTADO_FONT_COLOR[estado] || ESTADO_FONT_COLOR.pendiente;
        row.eachCell(cell => {
            cell.fill      = fill;
            cell.font      = { size: 10, color: fontColor };
            cell.border    = ALL_BORDERS;
            cell.alignment = { vertical: 'middle', wrapText: false };
        });
        row.height = 18;

        // Registrar la fila en el mapa para que Calendario pueda referenciarla
        const citaKey = `${cita.fecha}|${cita.hora}|${cita.puesto}`;
        rowMap.set(citaKey, excelRow);
    });

    // Formato condicional para pintar toda la fila según el estado
    ws.addConditionalFormatting({
        ref: `A2:J${citas.length + 1}`,
        rules: [
            { type: 'expression', formulae: ['$E2="Grabada"'], style: { fill: ESTADO_CF_FILL.grabada, font: { color: ESTADO_FONT_COLOR.grabada } } },
            { type: 'expression', formulae: ['$E2="Incidencia"'], style: { fill: ESTADO_CF_FILL.incidencia, font: { color: ESTADO_FONT_COLOR.incidencia } } },
            { type: 'expression', formulae: ['$E2="Asignada"'], style: { fill: ESTADO_CF_FILL.asignada, font: { color: ESTADO_FONT_COLOR.asignada } } },
            { type: 'expression', formulae: ['$E2="Pendiente"'], style: { fill: ESTADO_CF_FILL.pendiente, font: { color: ESTADO_FONT_COLOR.pendiente } } }
        ]
    });

    // Auto-filtro en la cabecera
    ws.autoFilter = { from: 'A1', to: 'J1' };

    return rowMap; // Devolvemos el mapa para el vínculo con Calendario
}

