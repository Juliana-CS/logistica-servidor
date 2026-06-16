    // ============================================================
    // LOGÍSTICA DE RECEBIMENTO - APP PRINCIPAL
    // Desenvolvido para uso simultâneo via JSON compartilhado
    // ============================================================

    
    const { useState, useEffect, useCallback, useMemo, useRef } = React;

    // ─── UTILITÁRIOS DE TEMPO ────────────────────────────────────
    function parseDateBR(dateStr, hourStr) {
        if (!dateStr || !hourStr) return null;
        try {
            // Formato DD/MM/YY HH:mm
            const [d, m, y] = dateStr.trim().split('/');
            const year = y.length === 2 ? '20' + y : y;
            const dt = new Date(`${year}-${m}-${d}T${hourStr.trim()}:00`);
            return isNaN(dt.getTime()) ? null : dt;
        } catch { return null; }
    }

function parseDatetime(dtStr) {
    if (!dtStr || dtStr === 'NaN' || dtStr === '') return null;
    try {
        const d = new Date(dtStr);
        return isNaN(d.getTime()) ? null : d;
    } catch { return null; }
}

function getTurno(date) {
    if (!date) return null;
    const h = date.getHours();
    const m = date.getMinutes();
    const total = h * 60 + m;
    if (total >= 6 * 60 && total < 14 * 60) return '1º Turno';   // 06:00–14:20
    if (total >= 14 * 60 && total < 22 * 60) return '2º Turno';  // 14:21–22:00
    return '3º Turno';                                                   // 22:01–05:59
}

// Lógica necessária:
// 22:00–23:59 → dia seguinte (3º turno do próximo ciclo)
// 00:00–21:59 → dia atual

function getDayKey(date) {
    if (!date) return null;
    const d = new Date(date);
    if (d.getHours() >= 22+11) d.setDate(d.getDate() + 1);  // empurra para o próximo dia
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

function diffMinutes(a, b) {
    if (!a || !b) return null;
    return Math.floor((b - a) / 60000);
}

function formatDuration(minutes) {
    if (minutes === null || minutes === undefined || minutes < 0) return '--:--';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function getDocaSLAColor(minutes) {
    if (minutes === null) return 'text-slate-500';
    if (minutes >= 240) return 'text-red-700';
    if (minutes >= 180) return 'text-orange-700';
    if (minutes >= 120) return 'text-yellow-700';
    return 'text-green-700';
}

function getDocaSLABg(minutes) {
    if (minutes === null) return 'bg-slate-100';
    if (minutes >= 240) return 'bg-red-50 border-l-4 border-red-500';
    if (minutes >= 180) return 'bg-orange-50 border-l-4 border-orange-500';
    if (minutes >= 120) return 'bg-yellow-50 border-l-4 border-yellow-500';
    return 'bg-green-50 border-l-4 border-green-500';
}

function getAguardandoSLAColor(minutes) {
    if (minutes === null) return 'text-slate-500';
    if (minutes >= 120) return 'text-red-700';
    if (minutes >= 90) return 'text-orange-700';
    if (minutes >= 60) return 'text-yellow-700';
    return 'text-green-700';
}

function getAguardandoSLABg(minutes) {
    if (minutes === null) return '';
    if (minutes >= 120) return 'bg-red-50 border-l-4 border-red-500';
    if (minutes >= 90) return 'bg-orange-50 border-l-4 border-orange-500';
    if (minutes >= 60) return 'bg-yellow-50 border-l-4 border-yellow-500';
    return 'bg-green-50 border-l-4 border-green-500';
}

// SLA baseado em registros/hora (contagem de cargas por hora do slot)
function getEficienciaIcon(val) {
    if (val === null || val === undefined) return '─';
    if (val <= 5) return '↓';
    if (val >= 7) return '↑';
    return '→';
}

function getEficienciaColor(val) {
    if (val === null || val === undefined) return 'text-slate-500';
    if (val <= 5) return 'text-red-700';
    if (val >= 7) return 'text-green-700';
    return 'text-yellow-700';
}

// ─── LÓGICA DE RUA (MODA) ────────────────────────────────────
function extractRua(endereco) {
    if (!endereco) return null;
    const m = endereco.match(/\.\(?\w{2,4}\)?\./);
    if (m) {
        return m[0].replace(/\./g, '');
    }
    // Fallback: pegar o segundo segmento após primeiro ponto
    const parts = endereco.split('.');
    if (parts.length >= 2) return parts[1];
    return null;
}

function getModa(arr) {
    if (!arr || arr.length === 0) return null;
    const freq = {};
    arr.forEach(v => { if (v) freq[v] = (freq[v] || 0) + 1; });
    let max = 0, moda = null;
    for (const [k, v] of Object.entries(freq)) {
        if (v > max) { max = v; moda = k; }
    }
    return moda;
}

// ─── PROCESSAMENTO DAS BASES ─────────────────────────────────
function processContinum(htmlContent) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const table = doc.querySelector('table');
    if (!table) return [];

    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length < 2) return [];

    const headers = Array.from(rows[0].querySelectorAll('th,td')).map(c => c.textContent.trim());

    const data = [];
    for (let i = 1; i < rows.length; i++) {
        const cells = Array.from(rows[i].querySelectorAll('td')).map(c => c.textContent.trim());
        if (cells.length === 0) continue;
        const obj = {};
        headers.forEach((h, idx) => { obj[h] = cells[idx] || ''; });
        data.push(obj);
    }
    return data;
}

function processConf(csvText) {
    const result = Papa.parse(csvText, { header: true, delimiter: ';', skipEmptyLines: true });
    const efMapRaw = {};

    result.data.forEach(row => {
        const carga = parseInt(row['CARGA']);
        if (!carga) return;

        const inicioDate = parseDateBR(row['INICIOCONF_DATA'], row['INICIOCONF_HORA']);
        const fimDate = parseDateBR(row['FINALCONF_DATA'], row['FINALCONF_HORA']);
        const qtde = parseFloat(row['QTDE_CXS']) || 0;

        // Ignorar conferências virtuais
        if ((row['CONFERENTE'] || '').trim().toUpperCase() === 'AAA VIRTUAL') return;

        // Deduplica: mantém apenas o primeiro registro por carga
        if (efMapRaw[carga]) return;

        // fimConfDia: dia calendário puro do FINALCONF_DATA (DD/MM), sem ciclo
        let fimConfDia = null;
        let fimConfMin = null;  // minutos do horário (0-1439)
        if (row['FINALCONF_DATA'] && row['FINALCONF_HORA']) {
            const partes = row['FINALCONF_DATA'].trim().split('/');
            const [hh, mm] = row['FINALCONF_HORA'].trim().split(':');
            fimConfMin = parseInt(hh) * 60 + parseInt(mm);

            const dia = parseInt(partes[0]);
            const mes = parseInt(partes[1]) - 1;
            const ano = partes[2] ? (partes[2].length === 2 ? 2000 + parseInt(partes[2]) : parseInt(partes[2])) : 2025;

            const baseDate = new Date(ano, mes, dia);

            // Apenas horários entre 22:00 e 23:59 pertencem ao ciclo do dia SEGUINTE
            if (fimConfMin >= 22 * 60 +15) baseDate.setDate(baseDate.getDate() + 1);

            fimConfDia = `${baseDate.getDate().toString().padStart(2, '0')}/${(baseDate.getMonth() + 1).toString().padStart(2, '0')}`;
        }

        const diffH = (inicioDate && fimDate) ? (fimDate - inicioDate) / 3600000 : 0;
        const eficiencia = (diffH > 0 && qtde > 0) ? qtde / diffH : null;

        efMapRaw[carga] = {
            eficiencia, qtde,
            conferente: row['CONFERENTE'],
            descricao: row['DESCRICAO'],
            fimConf: fimDate,
            fimConfDia,
            fimConfMin,
            temInicio: !!(inicioDate),   // true se INICIOCONF preenchido
            temFim: !!(fimDate),      // true se FINALCONF preenchido
        };
    });
    return efMapRaw;
}

function processPaletes(csvText) {
    const result = Papa.parse(csvText, { header: true, delimiter: ';', skipEmptyLines: true });
    const ruaMap = {};
    const etiquetaMap = {};

    result.data.forEach(row => {
        const carga = parseInt(row['CARGA']);
        if (!carga) return;

        const endereco = row['ENDERECO'];
        const rua = extractRua(endereco);

        if (!ruaMap[carga]) ruaMap[carga] = [];
        if (rua) ruaMap[carga].push(rua);

        // Etiqueta: tem endereço preenchido e não vazio
        if (!etiquetaMap[carga]) etiquetaMap[carga] = false;
        if (endereco && endereco.trim() !== '' && endereco !== '0') etiquetaMap[carga] = true;
    });

    const modaMap = {};
    for (const [carga, ruas] of Object.entries(ruaMap)) {
        modaMap[carga] = { ruaModa: getModa(ruas), temEtiqueta: etiquetaMap[carga] || false };
    }
    return modaMap;
}

// ─── PARSING XLS BINÁRIO via XLSX lib ────────────────────────
function processXLSArrayBuffer(buffer) {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    return json;
}

// Normaliza uma linha do Continum (seja do HTML ou XLSX)
function normalizeContinum(row) {
    let agenda = parseDatetime(row['DATA/HORA AGENDA'] || row['DATA_HORA_AGENDA'] || '');
    let chegada = parseDatetime(row['DATA/HORA CHEG'] || row['DATA_HORA_CHEG'] || '');
    let acionado = parseDatetime(row['ACIONADO'] || '');
    let horaLib = parseDatetime(row['HORA LIBERAÇÃO'] || row['HORA_LIBERACAO'] || '');
    let inicioConf = parseDatetime(row['INICIO CONF'] || row['INICIO_CONF'] || '');
    let fimConf = parseDatetime(row['FIM CONF'] || row['FIM_CONF'] || '');

    return {
        senha: row['SENHA'] || '',
        carga: parseInt(row['CARGA']) || 0,
        status: (row['STATUS'] || '').trim().toUpperCase(),
        fornecedor: (row['FORNECEDOR'] || '').trim(),
        motorista: (row['MOTORISTA'] || '').trim(),
        placaCarreta: row['PLACA CARRETA'] || row['PLACA_CARRETA'] || '',
        placaCavalo: row['PLACA CAVALO'] || row['PLACA_CAVALO'] || '',
        agenda,
        chegada,
        acionado,
        horaLib,
        inicioConf,
        fimConf,
        turno: getTurno(agenda),
        diaKey: getDayKey(agenda),
        equip: row['TIPO EQUIP'] || row['TIPO_EQUIP'] || '',
        qtdEquip: row['QTD EQUIP'] || row['QTD_EQUIP'] || '',
    };
}

// ─── COMPONENTES UI BASE ─────────────────────────────────────
function Badge({ children, color = 'blue' }) {
    const colors = {
        blue: 'bg-blue-100 text-blue-800 border border-blue-400',
        green: 'bg-green-100 text-green-800 border border-green-400',
        yellow: 'bg-yellow-100 text-yellow-800 border border-yellow-400',
        orange: 'bg-orange-100 text-orange-800 border border-orange-400',
        red: 'bg-red-100 text-red-800 border border-red-400',
        slate: 'bg-slate-100 text-slate-700 border border-slate-400',
        purple: 'bg-purple-100 text-purple-800 border border-purple-400',
    };
    return (
        <span className={`status-badge ${colors[color] || colors.blue}`}>{children}</span>
    );
}

function StatusBadge({ status }) {
    const map = {
        'FINALIZADO': ['green', '✓ FINALIZADO'],
        'CONFERENCIA': ['blue', '⚙ CONFERÊNCIA'],
        'AGENDADO': ['slate', '◷ AGENDADO'],
        'NÃO COMPARECEU': ['red', '✗ NÃO COMPAR.'],
        'FALTA COMPARECER': ['orange', '! FALTA COMP.'],
        'RECUSADO': ['red', '✗ RECUSADO'],
        'LIBERADO P/ PGTO': ['purple', '$ LIBERADO PGTO'],
        'DIVERGENTE': ['orange', '≠ DIVERGENTE'],
        'PARA AGENDAR': ['slate', '+ PARA AGENDAR'],
    };
    const [color, label] = map[status] || ['slate', status];
    return <Badge color={color}>{label}</Badge>;
}

function Card({ title, value, sub, color = 'blue', icon }) {
    const border = {
        blue: 'border-blue-400',
        green: 'border-green-400',
        yellow: 'border-yellow-400',
        red: 'border-red-400',
        orange: 'border-orange-400',
        purple: 'border-purple-400',
    };
    const text = {
        blue: 'text-blue-700',
        green: 'text-green-700',
        yellow: 'text-yellow-700',
        red: 'text-red-700',
        orange: 'text-orange-700',
        purple: 'text-purple-700',
    };
    return (
        <div className={`bg-white border ${border[color]} rounded-lg px-5 py-2 card-glow shadow-sm`}>
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-base text-slate-600 uppercase tracking-widest font-bold">{title}</p>
                    <p className={`text-3xl font-bold mt-1 font-mono ${text[color]}`}>{value}</p>
                    {sub && <p className="text-xs text-slate-600 mt-0">{sub}</p>}
                </div>
                {icon && <span className="text-2xl opacity-30">{icon}</span>}
            </div>
        </div>
    );
}

// ─── UPLOAD DE BASES ─────────────────────────────────────────
function UploadSection({ onContinum, onConf, onPaletes, loaded, onExportar, onAtualizar }) {
    const [atualizando, setAtualizando] = useState(false);
    const fileInput = (label, accept, onChange, isLoaded) => (
        <label className={`flex flex-col items-center justify-center gap-1 border-2 border-dashed rounded-lg p-3 cursor-pointer transition-all
      ${isLoaded ? 'border-green-500 bg-green-50' : 'border-slate-300 hover:border-blue-600 bg-white/80'}`}
            style={{ minWidth: 160 }}>
            <span className="text-lg">{isLoaded ? '✓' : '↑'}</span>
            <span className="text-xs font-semibold text-slate-800">{label}</span>
            <span className={`text-xs ${isLoaded ? 'text-green-700' : 'text-slate-500'}`}>
                {isLoaded ? 'Carregado' : 'Clique para selecionar'}
            </span>
            <input type="file" accept={accept} className="hidden" onChange={onChange} />
        </label>
    );
    async function handleAtualizar() {
        setAtualizando(true);
        await onAtualizar();
        setTimeout(() => setAtualizando(false), 2000);
    }
    return (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className="pulse-dot"></div>
                    <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Upload de Bases</h2>
                </div>
                <div className="flex flex-col gap-2">
                    <button onClick={onExportar} className="bg-gray-100 hover:bg-slate-700 text-slate-700 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 border border-slate-300">
                        📊 Exportar Excel
                    </button>

                    <button
                        onClick={handleAtualizar}
                        disabled={atualizando}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 border border-slate-300
          ${atualizando
                                ? 'bg-green-600 text-white border-green-600'
                                : 'bg-gray-100 hover:bg-slate-700 hover:text-white text-gray-800'}`}
                    >
                        {atualizando ? '✓ Atualizado!' : '🔄 Atualizar'}
                    </button>
                </div>
            </div>
            <div className="flex flex-wrap gap-3">
                {fileInput('Base Continum (.xls)', '.xls,.xlsx,.html', onContinum, loaded.continum)}
                {fileInput('Conferência (.txt)', '.txt,.csv', onConf, loaded.conf)}
                {fileInput('Paletes (.txt)', '.txt,.csv', onPaletes, loaded.paletes)}
            </div>
        </div>
    );
} function GraficoPizzaTurnos({ filtered }) {
    const turnos = ['1º Turno', '2º Turno', '3º Turno'];
    const cores = ['#3b82f6', '#eab308', '#f97316'];
    const valores = turnos.map(t => filtered.filter(r => r.turno === t).length);
    const total = valores.reduce((a, b) => a + b, 0);

    const raio = 90, cx = 90, cy = 90;
    let anguloAtual = -Math.PI / 2;

    const fatias = valores.map((val, i) => {
        const angulo = total > 0 ? (val / total) * 2 * Math.PI : 0;
        const x1 = cx + raio * Math.cos(anguloAtual);
        const y1 = cy + raio * Math.sin(anguloAtual);
        anguloAtual += angulo;
        const x2 = cx + raio * Math.cos(anguloAtual);
        const y2 = cy + raio * Math.sin(anguloAtual);
        const largeArc = angulo > Math.PI ? 1 : 0;
        const midAngulo = anguloAtual - angulo / 2;
        const lx = cx + (raio * 0.65) * Math.cos(midAngulo);
        const ly = cy + (raio * 0.65) * Math.sin(midAngulo);
        return { x1, y1, x2, y2, largeArc, lx, ly, val, angulo };
    });

    return (
        <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-sm flex flex-col items-center">
            <h3 className="text-sm font-bold text-slate-600 uppercase tracking-widest mb-3 text-center">
                Programado por Turno
            </h3>
            <div className="flex items-center gap-4">
                <svg width="140" height="140" viewBox="0 0 180 180">
                    {fatias.map((f, i) => f.angulo > 0 && (
                        <path
                            key={i}
                            d={`M${cx},${cy} L${f.x1},${f.y1} A${raio},${raio} 0 ${f.largeArc} 1 ${f.x2},${f.y2} Z`}
                            fill={cores[i]}
                            stroke="white"
                            strokeWidth="2"
                        />
                    ))}
                    {fatias.map((f, i) => f.val > 0 && (
                        <text key={i} x={f.lx} y={f.ly} textAnchor="middle" dominantBaseline="middle"
                            fontSize="10" fontWeight="bold" fill="white">
                            {total > 0 ? ((f.val / total) * 100).toFixed(0) + '%' : ''}
                        </text>
                    ))}
                </svg>

                <div className="flex flex-col gap-2">
                    {turnos.map((t, i) => (
                        <div key={t} className="flex items-center gap-2 text-xs">
                            <span className="w-3 h-3 rounded-sm inline-block flex-shrink-0" style={{ backgroundColor: cores[i] }} />
                            <span className="text-slate-600">{t.replace('º Turno', 'º T')}</span>
                            <span className="font-mono font-bold text-slate-800">— {valores[i]}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── DASHBOARD: VISÃO GERAL ───────────────────────────────────
function DashboardGeral({ data }) {
    const allDays = useMemo(() => {
        const s = new Set(data.map(r => r.diaKey).filter(Boolean));
        return Array.from(s).sort();
    }, [data]);

    const [selectedDay, setSelectedDay] = useState('__all__');

    const filtered = useMemo(() =>
        selectedDay === '__all__' ? data : data.filter(r => r.diaKey === selectedDay),
        [data, selectedDay]
    );

    const stats = useMemo(() => {
        const byDay = {};
        const statusCount = {};
        filtered.forEach(row => {
            const day = row.diaKey || 'Sem data';
            if (!byDay[day]) byDay[day] = { total: 0, turnos: { '1º Turno': 0, '2º Turno': 0, '3º Turno': 0 } };
            byDay[day].total++;
            if (row.turno) byDay[day].turnos[row.turno] = (byDay[day].turnos[row.turno] || 0) + 1;
            const st = row.status || 'DESCONHECIDO';
            statusCount[st] = (statusCount[st] || 0) + 1;
        });
        return { byDay, statusCount, total: filtered.length };
    }, [filtered]);

    const STATUS_ORDER = [
        'FINALIZADO', 'CONFERENCIA', 'AGENDADO',
        'NÃO COMPARECEU', 'FALTA COMPARECER',
        'RECUSADO', 'DIVERGENTE', 'LIBERADO P/ PGTO', 'PARA AGENDAR',
    ];

    const crossTab = useMemo(() => {
        const foundStatuses = new Set();
        const byStatusDay = {};
        data.forEach(row => {
            const st = row.status || 'DESCONHECIDO';
            const day = row.diaKey || 'Sem data';
            foundStatuses.add(st);
            if (!byStatusDay[st]) byStatusDay[st] = {};
            byStatusDay[st][day] = (byStatusDay[st][day] || 0) + 1;
        });
        const ordered = STATUS_ORDER.filter(s => foundStatuses.has(s) || byStatusDay[s]);
        foundStatuses.forEach(s => { if (!STATUS_ORDER.includes(s)) ordered.push(s); });
        return { statuses: ordered, byStatusDay };
    }, [data]);

    return (
        <div className="space-y-6">

            {/* Filtro de data */}
            <div className="flex items-center gap-3">
                <span className="text-xs text-slate-600 uppercase tracking-widest font-semibold">Filtrar por data:</span>
                <div className="flex gap-2 flex-wrap">
                    <button
                        onClick={() => setSelectedDay('__all__')}
                        className={`px-3 py-1 rounded text-xs font-semibold transition-all ${selectedDay === '__all__' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >Todas</button>
                    {allDays.map(d => (
                        <button key={d}
                            onClick={() => setSelectedDay(d)}
                            className={`px-3 py-1 rounded text-xs font-mono font-semibold transition-all ${selectedDay === d ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        >{d}</button>
                    ))}
                </div>
            </div>

            {/* Programado por Dia/Turno */}
            <div className="bg-white border border-slate-300 justify-center rounded-xl p-4 shadow-sm">
                <h3 className="text-sm font-bold text-slate-600 text-center uppercase tracking-widest mb-3">Programado por Dia/Turno</h3>
                <div className="flex gap-3 flex-wrap">
                    {Object.entries(stats.byDay).sort().map(([day, info]) => (
                        <div key={day} className="border border-slate-300 rounded-lg p-3 min-w-48 justify-center flex-1">
                            <div className="flex justify-center items-center gap-4 mb-2">
                                <span className="font-mono text-sm text-blue-700">{day}</span>
                                <span className="font-mono text-sm text-slate-800">{info.total} cargas</span>
                            </div>
                            <div className="flex gap-2 flex-wrap justify-center">
                                {Object.entries(info.turnos).map(([t, n]) => n > 0 && (
                                    <div key={t} className="flex items-center gap-1 text-xs bg-slate-100 rounded px-2 py-1">
                                        <span className="text-slate-600">{t.replace(' Turno', 'T')}:</span>
                                        <span className="text-slate-900 font-mono font-semibold">{n}</span>
                                        <span className="text-slate-700 font-mono">({info.total > 0 ? ((n / info.total) * 100).toFixed(0) : 0}%)</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Pizza + Top 5 por Turno */}
            <div className="grid grid-cols-4 gap-4">
                <GraficoPizzaTurnos filtered={filtered} />
                <Top3Fornecedores filtered={filtered} />
                
            </div>

        </div>
    );
}
function Top3Fornecedores({ filtered }) {
    const turnos = [
        { nome: '1º Turno', cor: 'border-blue-400', corHeader: 'text-blue-700' },
        { nome: '2º Turno', cor: 'border-blue-400', corHeader: 'text-blue-700' },
        { nome: '3º Turno', cor: 'border-blue-400', corHeader: 'text-blue-700' },
    ];

    const medalhas = ['1º', '2º', '3º', '4º', '5º'];

    const topPorTurno = turnos.map(({ nome }) => {
        const freq = {};
        filtered
            .filter(r => r.turno === nome && r.fornecedor)
            .forEach(r => { freq[r.fornecedor] = (freq[r.fornecedor] || 0) + 1; });
        return Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
    });

    return (
        <>
            {turnos.map(({ nome, cor, corHeader }, i) => (
                <div key={nome} className={`bg-white border ${cor} rounded-xl p-4 shadow-sm flex flex-col justify-center`}>
                    <h3 className={`text-sm font-bold uppercase tracking-widest mb-3 text-center self-stretch ${corHeader}`}>
                        Top 5 — {nome}
                    </h3>
                    {topPorTurno[i].length === 0
                        ? <p className="text-xs text-slate-400 text-center mt-4">Sem dados</p>
                        : topPorTurno[i].map(([forn, qtd], j) => (
                            <div key={forn} className="flex items-center gap-2 py-2 border-b border-slate-100 last:border-0">
                                <span className="text-sm font-bold text-blue-700">{medalhas[j]}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-normal text-slate-700 truncate">{forn}</p>
                                </div>
                                <span className="font-mono font-bold text-slate-800 text-sm">{qtd}</span>
                            </div>
                        ))
                    }
                </div>
            ))}
        </>
    );
}


// Turno pelo total de minutos (0-1439), sem precisar de Date object
function getTurnoByMin(totalMin) {
    if (totalMin === null || totalMin === undefined) return null;
    if (totalMin >= 14 * 60 + 21 && totalMin <= 22 * 60+10) return '2º Turno';
    return '3º Turno';
}

// ─── DASHBOARD: EFICIÊNCIA POR TURNO ─────────────────────────
function DashboardEficiencia({ data, efMap }) {
    const allDays = useMemo(() => {
        const s = new Set(data.map(r => r.diaKey).filter(Boolean));
        return Array.from(s).sort();
    }, [data]);

    const [selectedDay, setSelectedDay] = useState('__all__');

    const filtered = useMemo(() =>
        selectedDay === '__all__' ? data : data.filter(r => r.diaKey === selectedDay),
        [data, selectedDay]
    );

    const statsGlobal = useMemo(() => {
        const statusCount = {};
        data.forEach(row => {
            const st = row.status || 'DESCONHECIDO';
            statusCount[st] = (statusCount[st] || 0) + 1;
        });
        return { statusCount };
    }, [data]);

    const statsFiltered = useMemo(() => {
        const statusCount = {};
        filtered.forEach(row => {
            const st = row.status || 'DESCONHECIDO';
            statusCount[st] = (statusCount[st] || 0) + 1;
        });
        return { statusCount, total: filtered.length };
    }, [filtered]);

    const backlog = useMemo(() => {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        return data.filter(r => {
            if (!r.agenda) return false;
            const diaAgenda = new Date(r.agenda);
            diaAgenda.setHours(0, 0, 0, 0);
            if (diaAgenda >= hoje) return false;
            return ['AGENDADO', 'CONFERENCIA'].includes(r.status);
        }).length;
    }, [data]);

    const STATUS_ORDER = [
        'FINALIZADO', 'CONFERENCIA', 'AGENDADO',
        'NÃO COMPARECEU', 'FALTA COMPARECER',
        'RECUSADO', 'DIVERGENTE', 'LIBERADO P/ PGTO', 'PARA AGENDAR',
    ];

    const crossTab = useMemo(() => {
        const foundStatuses = new Set();
        const byStatusDay = {};
        data.forEach(row => {
            const st = row.status || 'DESCONHECIDO';
            const day = row.diaKey || 'Sem data';
            foundStatuses.add(st);
            if (!byStatusDay[st]) byStatusDay[st] = {};
            byStatusDay[st][day] = (byStatusDay[st][day] || 0) + 1;
        });
        const ordered = STATUS_ORDER.filter(s => foundStatuses.has(s) || byStatusDay[s]);
        foundStatuses.forEach(s => { if (!STATUS_ORDER.includes(s)) ordered.push(s); });
        return { statuses: ordered, byStatusDay };
    }, [data]);

    const stats = useMemo(() => {
        const turnos = {
            '1º Turno': { prog: 0, fin: 0, turnoIni: 6 * 60, turnoFim: 14 * 60 + 25 },
            '2º Turno': { prog: 0, fin: 0, turnoIni: 14 * 60 + 26, turnoFim: 22 * 60 + 10 },
            '3º Turno': { prog: 0, fin: 0, turnoIni: 22 * 60 + 11, turnoFim: 5 * 60 + 59 },
        };
        filtered.forEach(row => {
            const t = row.turno || '1º Turno';
            if (turnos[t]) turnos[t].prog++;
        });
        Object.values(efMap).forEach(entry => {
            if (entry.fimConfDia === null || entry.fimConfMin === null) return;
            if (selectedDay !== '__all__' && entry.fimConfDia !== selectedDay) return;
            const m = entry.fimConfMin;
            const t = m >= 6 * 60 && m <= 14 * 60 + 25 ? '1º Turno'
                : m >= 14 * 60 + 25 && m <= 22 * 60 + 10 ? '2º Turno'
                    : '3º Turno';
            if (turnos[t]) turnos[t].fin++;
        });
        return turnos;
    }, [filtered, efMap, selectedDay]);

    return (
        <div className="space-y-6">

            {/* Filtro de data */}
            <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-slate-600 uppercase tracking-widest font-semibold">Filtrar por data:</span>
                <button
                    onClick={() => setSelectedDay('__all__')}
                    className={`px-3 py-1 rounded text-xs font-semibold transition-all ${selectedDay === '__all__' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >Todas</button>
                {allDays.map(d => (
                    <button key={d}
                        onClick={() => setSelectedDay(d)}
                        className={`px-3 py-1 rounded text-xs font-mono font-semibold transition-all ${selectedDay === d ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >{d}</button>
                ))}
            </div>

            {/* Cards visão geral + Tabela Status×Data */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-sm flex flex-col h-full">
                    <h3 className="text-lg font-bold text-slate-600 text-center uppercase tracking-widest mb-3">VISÃO GERAL</h3>
                    <div className="grid grid-cols-2 gap-3 w-full flex-1 content-center">
                        <Card title="Total Programado" value={statsFiltered.total} icon="📦" color="blue" sub={selectedDay !== '__all__' ? selectedDay : 'todas as datas'} />
                        <Card title="Finalizados" value={statsFiltered.statusCount['FINALIZADO'] || 0} icon="✓" color="green" />
                        <Card title="Em Conferência" value={statsGlobal.statusCount['CONFERENCIA'] || 0} icon="⚙" color="blue" sub='Todas as datas' />
                        <Card title="Agendados" value={statsGlobal.statusCount['AGENDADO'] || 0} icon="📅" color="yellow" sub='Todas as datas' />
                        <Card title="Falta Comparecer" value={statsFiltered.statusCount['FALTA COMPARECER'] || 0} icon="⏰" color="yellow" />
                        <Card title="Não Compareceu" value={statsFiltered.statusCount['NÃO COMPARECEU'] || 0} icon="✗" color="orange" />
                    </div>
                    <div className="flex justify-center mt-3">
                        <div className="w-1/2">
                            <Card title="Backlog" value={backlog} icon="⚠" color="red" />
                        </div>
                    </div>
                </div>

                {/* Tabela Status × Data */}
                <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-sm">
                    <h3 className="text-lg font-bold text-slate-600 text-center uppercase tracking-widest mb-3">Contagem por Status × Data</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-lg">
                            <thead>
                                <tr className="border-b border-slate-300">
                                    <th className="text-left py-2 px-2 text-slate-700 font-semibold whitespace-nowrap">Status</th>
                                    {allDays.map(d => (
                                        <th key={d} className="text-center py-2 px-2 text-slate-700 font-mono font-semibold whitespace-nowrap">{d}</th>
                                    ))}
                                    <th className="text-center py-2 px-2 text-slate-700 font-semibold">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {crossTab.statuses.map(st => {
                                    const rowTotal = allDays.reduce((acc, d) => acc + (crossTab.byStatusDay[st]?.[d] || 0), 0);
                                    return (
                                        <tr key={st} className="border-b border-slate-200 table-row-hover">
                                            <td className="py-2 px-2 whitespace-nowrap"><StatusBadge status={st} /></td>
                                            {allDays.map(d => {
                                                const n = crossTab.byStatusDay[st]?.[d] || 0;
                                                return (
                                                    <td key={d} className={`py-2 px-2 text-center font-mono font-bold ${n > 0 ? 'text-slate-800' : 'text-slate-700'}`}>
                                                        {n > 0 ? n : '–'}
                                                    </td>
                                                );
                                            })}
                                            <td className="py-2 px-2 text-center font-mono font-bold text-blue-700">{rowTotal}</td>
                                        </tr>
                                    );
                                })}
                                <tr className="border-t border-slate-300 bg-slate-50">
                                    <td className="py-2 px-2 text-xs font-bold text-slate-600">TOTAL</td>
                                    {allDays.map(d => {
                                        const colTotal = crossTab.statuses.reduce((acc, st) => acc + (crossTab.byStatusDay[st]?.[d] || 0), 0);
                                        return <td key={d} className="py-2 px-2 text-center font-mono font-bold text-blue-700">{colTotal}</td>;
                                    })}
                                    <td className="py-2 px-2 text-center font-mono font-bold text-blue-700">{data.length}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>


            {/* Cards por turno + Gráfico na mesma linha */}
            {/* Cards por turno — 3 na mesma linha */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Object.entries(stats).map(([turno, { prog, fin }]) => {
                    const pct = prog > 0 ? ((fin / prog) * 100).toFixed(1) : '0.0';
                    return (
                        <div key={turno} className="bg-white border border-slate-300 rounded-xl px-4 py-3">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-bold text-slate-600 uppercase tracking-widest">{turno}</span>
                                <Badge color={parseFloat(pct) >= 80 ? 'green' : parseFloat(pct) >= 50 ? 'yellow' : 'red'}>
                                    {Math.min(parseFloat(pct), 100).toFixed(1)}%
                                </Badge>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-slate-600">Prog</span>
                                    <span className="text-2xl font-mono font-bold text-slate-900">{prog}</span>
                                </div>
                                <span className="text-slate-400">|</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-slate-600">Fin</span>
                                    <span className="text-xl font-mono font-bold text-green-700">{fin}</span>
                                </div>
                                <div className="flex-1 bg-slate-100 rounded-full h-1.5 ml-2">
                                    <div
                                        className={`h-1.5 rounded-full transition-all ${parseFloat(pct) >= 80 ? 'bg-green-500' : parseFloat(pct) >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                        style={{ width: `${Math.min(parseFloat(pct), 100)}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>


            {/* Gráfico | EficienciaHoraTurno — mesma linha */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <GraficoFinalizadosTurno stats={stats} />
                <EficienciaHoraTurno filtered={filtered} efMap={efMap} selectedDay={selectedDay} />
            </div>

        </div>
    );
}

// ─── GRÁFICO FINALIZADOS POR TURNO ──────────────────────────
function GraficoFinalizadosTurno({ stats }) {
    const turnos = [
        { nome: '1ºT', key: '1º Turno', cor: '#3b82f6', corBg: 'rgba(59,130,246,0.15)' },
        { nome: '2ºT', key: '2º Turno', cor: '#eab308', corBg: 'rgba(234,179,8,0.15)' },
        { nome: '3ºT', key: '3º Turno', cor: '#f97316', corBg: 'rgba(249,115,22,0.15)' },
    ];

    const valores = turnos.map(t => stats[t.key]?.fin || 0);
    const maximo = Math.max(...valores, 1);

    return (
        <div className="bg-white border border-gray-300 rounded-xl p-5 flex flex-col justify-center">
            <h3 className="text-lg font-bold text-slate-500 uppercase tracking-widest mb-auto text-center w-full">


                Finalizados por Turno
            </h3>

            {/* Barras */}
            <div className="flex items-end justify-center gap-8 px-4 w-full" style={{ height: 290 }}>
                {turnos.map((t, i) => {
                    const val = valores[i];
                    const pct = maximo > 0 ? (val / maximo) * 100 : 0;
                    const pctProg = stats[t.key]?.prog > 0
                        ? ((val / stats[t.key].prog) * 100).toFixed(0) + '%'
                        : '0%';

                    return (
                        <div key={t.key} className="flex flex-col items-center gap-1 w-20">
                            <span className="text-lg font-mono font-bold" style={{ color: t.cor }}>{val}</span>
                            <div className="w-full flex items-end" style={{ height: 290 }}>
                                <div
                                    className="w-full rounded-t-lg transition-all duration-500 flex items-end justify-center pb-1"
                                    style={{ height: `${Math.max(pct, 4)}%`, backgroundColor: t.cor, boxShadow: `0 0 10px ${t.cor}55` }}
                                >
                                    {pct > 25 && <span className="text-xs font-bold text-white/80">{pctProg}</span>}
                                </div>
                            </div>
                            <span className="text-xs font-semibold text-slate-600">{t.nome.replace(' Turno', 'T')}</span>
                        </div>
                    );
                })}
            </div>

            {/* Linha de referência e legenda */}
            <div className="text-lg mt-4 pt-3 border-t border-slate-200 flex justify-center gap-6">
                {turnos.map((t, i) => (
                    <div key={t.key} className="flex items-center gap-2 text-base text-slate-600">
                        <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: t.cor }}></span>
                        {t.nome}: <h1 className="text-xl font-mono font-bold text-slate-800">{valores[i]}</h1>
                       
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── EFICIÊNCIA POR HORA E TURNO ─────────────────────────────
function EficienciaHoraTurno({ filtered, efMap, selectedDay }) {
    const TURNOS = [
        {
            nome: '1º Turno', cor: 'border-blue-400', corHeader: 'bg-blue-700/30 text-blue-700',
            // Slots: [início_inclusive, fim_exclusive) em minutos. Último slot fecha no fim do turno.
            slots: [
                { label: '06:00', ini: 6 * 60, fim: 7 * 60 },
                { label: '07:00', ini: 7 * 60, fim: 8 * 60 },
                { label: '08:00', ini: 8 * 60, fim: 9 * 60 },
                { label: '09:00', ini: 9 * 60, fim: 10 * 60 },
                { label: '10:00', ini: 10 * 60, fim: 11 * 60 },
                { label: '11:00', ini: 11 * 60, fim: 12 * 60 },
                { label: '12:00', ini: 12 * 60, fim: 13 * 60 },
                { label: '13:00', ini: 13 * 60, fim: 14 * 60 },
                { label: '14:00', ini: 14 * 60, fim: 14 * 60 + 25 },
            ],
            turnoIni: 6 * 60, turnoFim: 14 * 60 + 25,
        },
        {
            nome: '2º Turno', cor: 'border-blue-400', corHeader: 'bg-blue-700/30 text-blue-700',
            slots: [
                { label: '14:20', ini: 14 * 60 + 26, fim: 15 * 60 },
                { label: '15:00', ini: 15 * 60, fim: 16 * 60 },
                { label: '16:00', ini: 16 * 60, fim: 17 * 60 },
                { label: '17:00', ini: 17 * 60, fim: 18 * 60 },
                { label: '18:00', ini: 18 * 60, fim: 19 * 60 },
                { label: '19:00', ini: 19 * 60, fim: 20 * 60 },
                { label: '20:00', ini: 20 * 60, fim: 21 * 60 },
                { label: '21:00', ini: 21 * 60, fim: 22 * 60 },
                { label: '22:00', ini: 22 * 60, fim: 22 * 60 + 15 },
            ],
            turnoIni: 14 * 60 + 26, turnoFim: 22 * 60 + 15,
        },
        {
            nome: '3º Turno', cor: 'border-blue-400', corHeader: 'bg-blue-700/30 text-blue-700',
            slots: [
                { label: '22:00', ini: 22 * 60 + 16, fim: 23 * 60 },
                { label: '23:00', ini: 23 * 60, fim: 24 * 60 },
                { label: '00:00', ini: 0, fim: 1 * 60 },
                { label: '01:00', ini: 1 * 60, fim: 2 * 60 },
                { label: '02:00', ini: 2 * 60, fim: 3 * 60 },
                { label: '03:00', ini: 3 * 60, fim: 4 * 60 },
                { label: '04:00', ini: 4 * 60, fim: 5 * 60 },
                { label: '05:00', ini: 5 * 60, fim: 5 * 60 + 59 },
                { label: '05:59', ini: 5 * 60 + 59, fim: 5 * 60 + 60 },
            ],
            // 3º turno cruza meia-noite: pertence se >= 22:01 OU <= 05:59
            turnoIni: null, turnoFim: null, 
        },
    ];

    // Verifica se um horário (em minutos) pertence ao 3º turno
    function is3Turno(totalMin) {
        return totalMin >= 22 * 60 + 11 || totalMin <= 5 * 60 + 59;
    }

    const turnoStats = useMemo(() => {
        // FINALIZADOS: exclusivamente da base conf
        // FINALCONF_DATA = dia filtrado (ou todos), FINALCONF_HORA = slot/turno
        // selectedDay vem via prop para respeitar o filtro de data
        const finalizadosConf = Object.values(efMap).filter(entry => {
            if (entry.fimConfDia === null || entry.fimConfMin === null) return false;
            if (selectedDay !== '__all__' && entry.fimConfDia !== selectedDay) return false;
            return true;
        });

        return TURNOS.map(turno => {
            // Filtra finalizados que pertencem a este turno pelo fimConfMin
            const finDoTurno = finalizadosConf.filter(entry => {
                const m = entry.fimConfMin;
                if (turno.nome === '3º Turno') return is3Turno(m);
                return m >= turno.turnoIni && m <= turno.turnoFim;
            });

            const slots = turno.slots.map(slot => {
                const count = finDoTurno.filter(entry => {
                    const m = entry.fimConfMin;
                    return m >= slot.ini && m < slot.fim;
                }).length;
                const duracaoH = (slot.fim - slot.ini) / 60;
                const taxa = duracaoH > 0 && count > 0 ? count / duracaoH : null;
                return { label: slot.label, count, taxa };
            });

            const totalCargas = slots.reduce((a, s) => a + s.count, 0);

            const duracaoTurnoH = turno.nome === '3º Turno'
                ? ((24 * 60 - (22 * 60 + 11)) + (5 * 60 + 59 + 1)) / 60
                : (turno.turnoFim - turno.turnoIni) / 60;

            const taxaGeral = duracaoTurnoH > 0 && totalCargas > 0
                ? totalCargas / duracaoTurnoH : null;

            // Programado: Continum filtrado, pelo turno da agenda
            const progTurno = filtered.filter(r => {
                if (!r.agenda) return false;
                const m = r.agenda.getHours() * 60 + r.agenda.getMinutes();
                return turno.nome === '3º Turno' ? is3Turno(m) : m >= turno.turnoIni && m <= turno.turnoFim;
            }).length;

            const pct = progTurno > 0 ? ((totalCargas / progTurno) * 100).toFixed(0) + '%' : '0%';

            return { ...turno, slots, totalCargas, taxaGeral, pct };
        });
    }, [efMap, filtered, selectedDay]);

    return (
        <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-sm">
            <h3 className="text-sm0,5 font-bold text-slate-500 text-center uppercase tracking-widest mb-4">
                Eficiência de Conferência por Hora/Turno
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {turnoStats.map(turno => (
                    <div key={turno.nome} className={`border ${turno.cor} rounded-xl overflow-hidden`}>
                        <div className={`${turno.corHeader} px-3 py-2 flex items-center justify-between`}>
                            <span className="text-sm font-bold uppercase tracking-widest">{turno.nome}</span>
                            <span className="text-sm font-mono font-bold">{turno.pct}</span>
                        </div>
                        <table className="w-full text-lg">
                            <tbody>
                                {turno.slots.map(slot => (
                                    <tr key={slot.label} className="border-b border-slate-200 table-row-hover">
                                        <td className="py-1.5 px-3 font-semibold text-slate-500 w-16">{slot.label}</td>
                                        <td className={`py-1.5 px-2 text-center text-lg font-bold w-8 ${getEficienciaColor(slot.taxa)}`}>
                                            {getEficienciaIcon(slot.taxa)}
                                        </td>
                                        <td className="py-1.5 px-3 text-right font-mono font-bold text-slate-800">
                                            {slot.count}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t border-slate-300 bg-slate-100">
                                    <td colSpan={3} className="py-2 px-3 text-sm font-bold">
                                        <span className="text-slate-600">TOTAL: </span>
                                        <span className="font-mono text-blue-700">{turno.totalCargas}</span>
                                        <span className="text-slate-600 mx-1">|</span>
                                        <span className={`font-mono font-bold ${getEficienciaColor(turno.taxaGeral)}`}>
                                            {turno.taxaGeral !== null ? turno.taxaGeral.toFixed(1) : '--'} cargas/h
                                        </span>
                                        <span className={`ml-1 font-bold ${getEficienciaColor(turno.taxaGeral)}`}>
                                            {getEficienciaIcon(turno.taxaGeral)}
                                        </span>
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── DASHBOARD: CARGAS EM DOCA ────────────────────────────────
function DashboardDoca({ data, dbState, efMap, desfazerDoca, atualizarDoca }) {
    const now = new Date();
    const [busca, setBusca] = useState('');
    const [resultado, setResultado] = useState(null);
    const [novaDoca, setNovaDoca] = useState('');
    const [buscado, setBuscado] = useState(false);
    const conferencia = useMemo(() => {
        const vistos = new Set();


        // 1. Acionados manualmente via painel (têm doca registrada no servidor)
        const manuais = Object.entries(dbState)
            .filter(([, db]) => db.acionamento && db.doca)
            .map(([carga, db]) => {
                const cargaInt = parseInt(carga);
                vistos.add(cargaInt);
                const rowContinum = data.find(r => r.carga === cargaInt);
                if (!rowContinum) return false;
                const statusValido = ['CONFERENCIA', 'AGENDADO'].includes(rowContinum?.status);
                if (!statusValido) return false;
                const ref = db.acionamento_at ? new Date(db.acionamento_at) : null;
                const minutos = ref ? diffMinutes(ref, now) : null;
                return {
                    carga: cargaInt,
                    fornecedor: db.fornecedor || rowContinum?.fornecedor || '--',
                    motorista: db.motorista || rowContinum?.motorista || '--',
                    placaCarreta: rowContinum?.placaCarreta || '--',
                    placaCavalo:  rowContinum?.placaCavalo  || '--',
                    doca: db.doca,
                    acionado: ref,
                    minutosDoca: minutos,
                };
            })
            .filter(Boolean);       


        // 2. Status CONFERENCIA no Continum (que ainda não foram acionados manualmente)
        const doContinum = data
            .filter(r => r.status === 'CONFERENCIA' && !vistos.has(r.carga))
            .map(row => {
                const ref = row.acionado || row.chegada;
                const minutos = ref ? diffMinutes(ref, now) : null;
                return { ...row, doca: dbState[row.carga]?.doca || '--', minutosDoca: minutos };
            });
        

        return [...manuais, ...doContinum]
            .sort((a, b) => (b.minutosDoca || 0) - (a.minutosDoca || 0));
    }, [data, dbState]);

            function handleBuscar() {
        const cargaInt = parseInt(busca.trim());
        if (!cargaInt) return;
        setBuscado(true);
        const row = conferencia.find(r => r.carga === cargaInt);
        if (!row) {
            setResultado(null);
            return;
        }
        setResultado(row);
        setNovaDoca(row.doca !== '--' ? row.doca : '');
        }

        function handleConfirmarDoca() {
        if (!novaDoca.trim()) {
            alert('Digite o número da doca.');
            return;
        }
        const msg = resultado.doca !== '--'
            ? `A carga ${resultado.carga} está na doca ${resultado.doca}. Deseja alterar para a doca ${novaDoca}?`
            : `Confirma a doca ${novaDoca} para a carga ${resultado.carga}?`;
        if (!window.confirm(msg)) return;
        atualizarDoca(resultado.carga, novaDoca);
        setResultado(prev => ({ ...prev, doca: novaDoca }));
        }

    return (
  <div className="space-y-4">

    {/* Buscar e editar doca */}
    <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-sm">
      <h3 className="text-sm font-bold text-slate-600 uppercase tracking-widest mb-3">Editar Doca</h3>
      <div className="flex items-center gap-3">
        <input
          type="number"
          placeholder="Digite o número da carga..."
          value={busca}
          onChange={e => { setBusca(e.target.value); setBuscado(false); setResultado(null); }}
          onKeyDown={e => e.key === 'Enter' && handleBuscar()}
          className="doca-input w-64 text-sm"
        />
        <button
          onClick={handleBuscar}
          className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
        >🔍 Buscar</button>
      </div>

      {buscado && !resultado && (
        <div className="mt-4 text-sm text-slate-500">
          Nenhuma carga em conferência encontrada com o número <span className="font-mono font-bold">{busca}</span>.
        </div>
      )}

      {resultado && (
        <div className="mt-4 border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-slate-400 uppercase tracking-widest mb-1">Carga</p>
              <p className="font-mono font-bold text-blue-700 text-sm">{resultado.carga}</p>
            </div>
            <div>
              <p className="text-slate-400 uppercase tracking-widest mb-1">Fornecedor</p>
              <p className="font-semibold text-slate-700">{resultado.fornecedor}</p>
            </div>
            <div>
              <p className="text-slate-400 uppercase tracking-widest mb-1">Motorista</p>
              <p className="text-slate-600">{resultado.motorista}</p>
            </div>
            <div>
              <p className="text-slate-400 uppercase tracking-widest mb-1">Doca Atual</p>
              <p className={`font-mono font-bold text-sm ${resultado.doca !== '--' ? 'text-yellow-700' : 'text-slate-400'}`}>
                {resultado.doca}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-widest whitespace-nowrap">
              {resultado.doca !== '--' ? 'Nova Doca:' : 'Doca:'}
            </label>
            <input
              className="doca-input"
              placeholder="Nº da doca"
              value={novaDoca}
              onChange={e => setNovaDoca(e.target.value)}
            />
            <button
              onClick={handleConfirmarDoca}
              className="bg-green-700 hover:bg-green-600 text-white px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
            >✓ Confirmar</button>
          </div>
        </div>
      )}
    </div>

    {/* Cards de SLA + tabela */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: '≥ 4h (CRÍTICO)', min: 240, color: 'red' },
                    { label: '≥ 3h (ALERTA)', min: 180, color: 'orange' },
                    { label: '≥ 2h (ATENÇÃO)', min: 120, color: 'yellow' },
                    { label: '< 2h (OK)', min: 0, color: 'green' },
                ].map(({ label, min, color }) => {
                    const count = conferencia.filter(r =>
                        min === 0 ? r.minutosDoca < 120 : r.minutosDoca >= min && (min === 240 || r.minutosDoca < min + 60)
                    ).length;
                    return <Card key={label} title={label} value={count} color={color} />;
                })}
            </div>

            <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-sm">
                <div className="px-4 py-3 text-center border-b border-slate-200 flex flex-col items-start gap-2">
                    <h3 className="text-lg text-center font-bold text-slate-800 uppercase tracking-widest">Cargas em Doca - {conferencia.length}</h3>
                </div>



                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-slate-300 bg-slate-100">

                                <th className="text-center py-2 px-3 text-base  text-slate-700 font-semibold">TEMPO DOCA</th>
                                <th className="text-center py-2 px-3 text-base  text-slate-700 font-semibold">CARGA</th>
                                <th className="text-center py-2 px-3 text-base  text-slate-700 font-semibold">FORNECEDOR</th>
                                <th className="text-center py-2 px-3 text-base  text-slate-700 font-semibold">PLACAS</th>
                                <th className="text-center py-2 px-3 text-base  text-slate-700 font-semibold">DOCA</th>
                                <th className="text-center py-2 px-3 text-base  text-slate-700 font-semibold">ACIONADO</th>
                                <th className="text-center py-2 px-3 text-base  text-slate-700 font-semibold">CONFERÊNCIA</th>

                            </tr>
                        </thead>
                        <tbody>
                            {conferencia.map((row, i) => (
                                <tr key={i} className={`border-b border-slate-200 table-row-hover `}>
                                   
                                    <td className={`py-2 px-3 text-center font-mono font-bold text-xl ${getDocaSLAColor(row.minutosDoca)}`}>
                                        {formatDuration(row.minutosDoca)}
                                    </td>
                                    <td className={`py-2 px-3 text-center text-xl font-mono font-semibold ${getDocaSLAColor(row.minutosDoca)}`}>{row.carga}</td>
                                    <td className="py-2 px-3 text-center text-slate-700 text-xl font-semibold  max-w-xs truncate">{row.fornecedor}</td>

                                    <td className="py-2 px-3 text-center text-sm text-slate-800 font-semibold align-middle ">
                                        <div className="whitespace-normal break-words">{row.placaCarreta}</div>
                                        <div className="whitespace-normal break-words">{row.placaCavalo}</div>
                                    </td>

                                    <td className="py-2 px-3 text-center text-xl font-mono text-blue-600 font-bold">{row.doca}</td>
                                    <td className="py-2 px-3 text-center text-base font-mono text-slate-600">
                                        {row.acionado ? (
                                            <div className="flex flex-col items-center gap-0.5">
                                                <span>{row.acionado.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                                                {(new Date() - row.acionado) / 60000 <= 5 && (
                                                    <button
                                                        onClick={() => desfazerDoca(row.carga)}
                                                        className="text-xs text-red-400 hover:text-red-600 transition-all"
                                                    >↩ desfazer</button>
                                                )}
                                            </div>
                                        ) : '--'}
                                    </td>

                                    <td className="py-2 px-3 text-lg text-center font-semibold">
                                        {(() => {
                                            const entry = efMap[row.carga];
                                            if (!entry || !entry.temInicio) return <span className="text-slate-500">Não iniciada</span>;
                                            if (entry.temInicio && !entry.temFim) return <span className="text-yellow-700">⚙ Em conferência</span>;
                                            return <span className="text-green-700">✓ Finalizada</span>;
                                        })()}
                                    </td>
                                </tr>
                            ))}
                            {conferencia.length === 0 && (
                                <tr><td colSpan={6} className="py-8 text-center text-slate-600">Nenhuma carga em conferência</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ─── DASHBOARD: AGUARDANDO ACIONAMENTO ───────────────────────
function DashboardAguardando({ data, palMap, dbState, salvarAcao, salvarAcionamento, desfazerAcao, handlePaletes}) {
    const now = new Date();
    const [docaInputs, setDocaInputs] = useState({});
    const [filtroEtiqueta, setFiltroEtiqueta] = useState('__all__');
    const [expirado, setExpirado] = useState(false);                 
    const ultimoCarregamento = useRef(Date.now());

    const aguardando = useMemo(() =>
        data.filter(r => ['AGENDADO', 'FALTA COMPARECER'].includes(r.status) && r.chegada && !dbState[r.carga]?.acionamento)
            .map(row => {
                const minutosTotal = row.chegada ? diffMinutes(row.chegada, now) : null;
                const pal = palMap[row.carga] || {};
                return { ...row, minutosTotal, ruaModa: pal.ruaModa || '--', temEtiqueta: pal.temEtiqueta || false };
            })
            .sort((a, b) => (b.minutosTotal || 0) - (a.minutosTotal || 0))
            .filter(r => {
                if (filtroEtiqueta === 'sim') return r.temEtiqueta;
                if (filtroEtiqueta === 'nao') return !r.temEtiqueta;
                return true;
            }),
        [data, palMap, dbState, filtroEtiqueta]);

         // 👈 adicione esse useEffect
    useEffect(() => {
        ultimoCarregamento.current = Date.now();
        setExpirado(false);

        const intervalo = setInterval(() => {
            const minutos = (Date.now() - ultimoCarregamento.current) / 60000;
            if (minutos >= 30) setExpirado(true);
        }, 60000);

        return () => clearInterval(intervalo);
    }, [data]); // reseta o timer sempre que data mudar (novo carregamento)

    function handleAction(carga, action) {
        salvarAcao(carga, action);
    }

    function handleAcionamento(row) {
        const doca = docaInputs[row.carga] || '';
        if (!doca) {
            alert('Digite o número da Doca antes de confirmar!');
            return;
        }
              const numeroDoca = Number(doca);
        if (
            !Number.isInteger(numeroDoca) ||
            numeroDoca < 1 ||
            numeroDoca > 50 ||
            doca !== String(numeroDoca)
        ) {
        alert('A Doca deve ser um número inteiro entre 1 e 50.');
        return;
        }
        salvarAcionamento(row.carga, doca, row.fornecedor, row.motorista);
        setDocaInputs(prev => ({ ...prev, [row.carga]: '' }));
    }

    return (
        <div className="space-y-4">

          {expirado && (
    <div className="flex items-center justify-between bg-amber-50 border border-amber-400 rounded-xl px-5 py-3 shadow-sm">
        <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
                <p className="font-bold text-amber-700">Dados desatualizados</p>
                <p className="text-sm text-amber-600">Faz mais de 30 minutos desde o último carregamento. e a base novamente.</p>
            </div>
        </div>
        <label className="ml-4 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-semibold text-sm transition-all whitespace-nowrap cursor-pointer">
            📂 Carregar base
            <input type="file" className="hidden" onChange={handlePaletes} />
        </label>
    </div>
)}

            {/* resto do JSX normal... */}
            <div className="flex items-center gap-3"></div>
            <div className="flex items-center gap-3">
                <span className="text-xs text-slate-600 uppercase tracking-widest font-semibold">Etiqueta:</span>
                <div className="flex gap-2">
                    <button onClick={() => setFiltroEtiqueta('__all__')}
                        className={`px-3 py-1 rounded text-xs font-semibold transition-all ${filtroEtiqueta === '__all__' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                        Todas
                    </button>
                    <button onClick={() => setFiltroEtiqueta('sim')}
                        className={`px-3 py-1 rounded text-xs font-semibold transition-all ${filtroEtiqueta === 'sim' ? 'bg-green-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                        Com Etiqueta
                    </button>
                    <button onClick={() => setFiltroEtiqueta('nao')}
                        className={`px-3 py-1 rounded text-xs font-semibold transition-all ${filtroEtiqueta === 'nao' ? 'bg-red-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                        Sem Etiqueta
                    </button>
                </div>
            </div>
            <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-sm">
                <div className="px-4 py-3 border-b border-slate-300">
                    <h3 className="text-lg font-bold text-slate-600 uppercase tracking-widest">Aguardando Acionamento - {aguardando.length}</h3>                    
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-lg">
                        <thead>
                            <tr className="border-b border-slate-300 bg-slate-100">
                                <th className="text-center py-2 px-3 text-slate-700 font-semibold">POSIÇÃO</th>
                                <th className="text-center py-2 px-3 text-slate-700 font-semibold">TEMPO TOTAL</th>
                                <th className="text-center py-2 px-3 text-slate-700 font-semibold">CARGA</th>
                                <th className="text-center py-2 px-3 text-slate-700 font-semibold">SENHA</th>
                                <th className="text-center py-2 px-3 text-slate-700 font-semibold">FORNECEDOR</th>
                                <th className="text-center py-2 px-3 text-slate-700 font-semibold">MOTORISTA</th>
                                <th className="text-center py-2 px-3 text-slate-700 font-semibold">PLACA</th>
                                <th className="text-center py-2 px-3 text-slate-700 font-semibold">RUA</th>
                                <th className="text-center py-2 px-3 text-slate-700 font-semibold">ETIQUETA</th>
                                <th className="text-center py-2 px-3 text-slate-700 font-semibold col-acao">CONTATO</th>
                                <th className="text-center py-2 px-3 text-slate-700 font-semibold col-acao">LIBERAÇÃO</th>
                                <th className="text-center py-2 px-3 text-slate-700 font-semibold col-acao">ACIONAMENTO</th>
                            </tr>
                        </thead>
                        <tbody>
                            {aguardando.map((row, i) => {
                                const db = dbState[row.carga] || {};
                                return (
                                    <tr key={i} className={`border-b border-slate-200 table-row-hover `}>
                                        <td className="py-2 px-3 text-center text-base font-mono font-bold text-slate-500 align-middle">{i + 1}°</td>

                                        <td className={`py-2 px-3 text-center font-mono font-bold text-base align-middle ${getAguardandoSLAColor(row.minutosTotal)}`}>
                                            {formatDuration(row.minutosTotal)}
                                        </td>
                                      
                                        <td className="text-base py-2 px-3 text-center font-mono font-semibold align-middle ">
                                            {row.carga ? (
                                                <span className={`text-blue-700 ${getAguardandoSLAColor(row.minutosTotal)}`}>{row.carga}</span>
                                            ) : (
                                                <span className="text-orange-600 text-xs">EM DIVERGÊNCIA</span>
                                            )}
                                        </td>

                                          <td className="text-base py-2 px-3 text-center text-slate-1000 font-semibold align-middle ">
                                            <div className="whitespace-normal  break-words">{row.senha}</div>
                                        </td>

                                        <td className="text-base py-2 px-3 text-center text-slate-1000 font-semibold align-middle ">
                                            <div className="whitespace-normal break-words">{row.fornecedor?.trim().split(/\s+/).slice(0, 2).join(' ')}</div>
                                        </td>
                                        <td className="text-base py-2 px-3 text-center text-slate-1000 align-middle ">
                                            <div className="text-slate-800 font-semibold whitespace-normal break-words">{row.motorista?.trim().split(/\s+/).slice(0, 2).join(' ')}</div>
                                        </td>
                                        <td className="text-base py-2 px-3 text-center text-slate-700 font-semibold align-middle ">
                                            <div className="whitespace-normal break-words">{row.placaCarreta}</div>
                                            <div className="whitespace-normal break-words">{row.placaCavalo}</div>
                                        </td>
                                        <td className="text-base py-2 px-3 text-center font-mono font-bold text-cyan-9000 align-middle">{row.ruaModa}</td>
                                        <td className="text-base py-2 px-3 text-center align-middle">
                                            <span className={row.temEtiqueta ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                                                {row.temEtiqueta ? 'SIM' : 'NÃO'}
                                            </span>
                                        </td>

                                        <td className="py-2 px-3 text-center align-middle col-acao">
                                            {db.contato
                                                ? <div className="flex flex-col items-center gap-0.5">
                                                    <Badge color="green">✓</Badge>
                                                    {db.contato_at && (
                                                        <span className="text-slate-400 text-xs font-mono">
                                                            {new Date(db.contato_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    )}
                                                    {db.contato_at && (new Date() - new Date(db.contato_at)) / 60000 <= 60 && (
                                                        <button
                                                            onClick={() => desfazerAcao(row.carga, 'contato')}
                                                            className="text-xs text-red-400 hover:text-red-600 transition-all"
                                                        >↩ desfazer</button>
                                                    )}
                                                </div>
                                                : <button
                                                    onClick={() => handleAction(row.carga, 'contato')}
                                                    className="bg-blue-100 hover:bg-blue-700 text-blue-700 rounded px-2 py-1 text-xs font-semibold transition-all"
                                                >CONTATO</button>
                                            }
                                        </td>
                                        <td className="py-2 px-3 text-center align-middle col-acao">
                                            {db.liberacao
                                                ? <div className="flex flex-col items-center gap-0.5">
                                                    <Badge color="green">✓</Badge>
                                                    {db.liberacao_at && (
                                                        <span className="text-slate-400 text-xs font-mono">
                                                            {new Date(db.liberacao_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    )}
                                                    {db.liberacao_at && (new Date() - new Date(db.liberacao_at)) / 60000 <= 60 && (
                                                        <button
                                                            onClick={() => desfazerAcao(row.carga, 'liberacao')}
                                                            className="text-xs text-red-400 hover:text-red-600 transition-all"
                                                        >↩ desfazer</button>
                                                    )}
                                                </div>
                                                : <button
                                                    onClick={() => handleAction(row.carga, 'liberacao')}
                                                    className="bg-purple-100 hover:bg-purple-200 text-purple-700 rounded px-2 py-1 text-xs font-semibold transition-all"
                                                >LIBERAÇÃO</button>
                                            }
                                        </td>
                                        <td className="py-2 px-3 text-center align-middle col-acao">
                                            {db.acionamento
                                                ? <div className="flex items-center justify-center gap-1">
                                                    <Badge color="green">✓ DOCA {db.doca}</Badge>
                                                </div>
                                                : <div className="flex items-center gap-1 justify-center">
                                                    <input
                                                        className="doca-input"
                                                        placeholder="Doca"
                                                        value={docaInputs[row.carga] || ''}
                                                        onChange={e => setDocaInputs(prev => ({ ...prev, [row.carga]: e.target.value }))}
                                                    />
                                                    <button
                                                        onClick={() => handleAcionamento(row)}
                                                        className="bg-green-100 hover:bg-green-200 text-green-700 rounded px-2 py-1 text-xs font-semibold transition-all"
                                                    >✓</button>
                                                </div>
                                            }
                                        </td>
                                    </tr>
                                );
                            })}
                            {aguardando.length === 0 && (
                                <tr><td colSpan={8} className="py-8 text-center text-slate-600">Nenhuma carga aguardando acionamento</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function DashboardLiberadoPgto({ data, dbState }) {
    const now = new Date();

    const liberados = useMemo(() => {
        return data
            .filter(r => r.status === 'LIBERADO P/ PGTO')
            .map(row => {
                const minutosLiberado = row.fimConf ? diffMinutes(row.fimConf, now) : null;
                const minutosTotal = row.chegada ? diffMinutes(row.chegada, now) : null;
                const doca = dbState[row.carga]?.doca || '--';
                return { ...row, minutosLiberado, minutosTotal, doca };
            })
            .sort((a, b) => (b.minutosLiberado || 0) - (a.minutosLiberado || 0));
    }, [data, dbState]);

    function getSLAColor(min) {
        if (min === null) return '#94a3b8';
        if (min >= 60) return '#ef4444';
        if (min >= 30) return '#eab308';
        return '#22c55e';
    }

    return (
        <div className="space-y-4">
            <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-sm">
                <div className="px-4 py-3 border-b border-slate-300 flex flex-col gap-1">
                    <h3 className="text-lg font-bold text-slate-600 uppercase tracking-widest">Liberados p/ Pagamento</h3>
                    <span className="text-lg text-slate-600">{liberados.length} cargas</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-slate-300 bg-slate-100">
                                <th className="text-center py-2 px-3 text-slate-700 font-semibold">TEMPO LIB. PGTO</th>
                                <th className="text-center py-2 px-3 text-slate-700 font-semibold">CARGA</th>
                                <th className="text-center py-2 px-3 text-slate-700 font-semibold">FORNECEDOR</th>
                                 <th className="text-center py-2 px-3 text-slate-700 font-semibold">MOTORISTA</th>
                                <th className="text-center py-2 px-3 text-slate-700 font-semibold">DOCA</th>                               
                                <th className="text-center py-2 px-3 text-slate-700 font-semibold">TEMPO TOTAL</th>
                            </tr>
                        </thead>
                        <tbody>
                            {liberados.map((row, i) => (
                                <tr key={i} className="border-b border-slate-200 table-row-hover">
                                  
                                    <td className={`py-2 px-3 text-center font-mono font-bold text-base align-middle ${row.minutosLiberado === null ? 'text-slate-500' :
                                        row.minutosLiberado >= 60 ? 'text-red-700' :
                                            row.minutosLiberado >= 30 ? 'text-yellow-700' :
                                                'text-green-700'
                                        }`}>
                                        {formatDuration(row.minutosLiberado)}
                                    </td>
                                    <td className={`py-2 px-3 text-center text-base font-mono text-blue-700 font-semibold align-middle ${getAguardandoSLAColor(row.minutosLiberado)}`}>{row.carga} </td>
                                    <td className="py-2 px-3 text-center text-base text-slate-700 font-semibold align-middle">{row.fornecedor}</td>                                     
                                    <td className="text-center text-base text-slate-500 whitespace-normal break-words">{row.motorista?.trim().split(/\s+/).slice(0, 2).join(' ')}</td>                                    
                                    <td className="py-2 px-3 text-center text-base font-mono font-bold text-yellow-700 align-middle">{row.doca}</td>
                                   
                                    <td className={`py-2 px-3 text-center text-base font-mono font-bold text-base align-middle ${getAguardandoSLAColor(row.minutosTotal)}`}>
                                        {formatDuration(row.minutosTotal)}
                                    </td>
                                </tr>
                            ))}
                            {liberados.length === 0 && (
                                <tr><td colSpan={7} className="py-8 text-center text-slate-600">Nenhuma carga liberada p/ pagamento</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
// ─── APP PRINCIPAL ────────────────────────────────────────────
function App() {
    const [continuumData, setContinuumData] = useState([]);
    const [efMap, setEfMap] = useState({});
    const [palMap, setPalMap] = useState({});
    const [dbState, setDbState] = useState({});
    const [loaded, setLoaded] = useState({ continum: false, conf: false, paletes: false });
    const [servidorOk, setServidorOk] = useState(null); // null=verificando, true=ok, false=offline
    const [activeTab, setActiveTab] = useState('geral');

    const [error, setError] = useState(null);

    const tabs = [
        { id: 'geral', label: '📊 Agenda' },
        { id: 'eficiencia', label: '⚡ Eficiência' },
        { id: 'doca', label: '🚛 Em Doca' },
        { id: 'aguardando', label: '⏳ Aguardando' },
        { id: 'liberado', label: '💰 Lib. Pagamento' },
    ];

    // ─── POLLING DO SERVIDOR ─────────────────────────────────
    // Carrega o estado do servidor e repete a cada 60 segundos
    const carregarDB = useCallback(async () => {
        try {
            const res = await fetch('/api/db');
            if (!res.ok) throw new Error('Servidor não respondeu');
            const dados = await res.json();
            setDbState(dados);
            setServidorOk(true);
        } catch {
            setServidorOk(false);
        }
    }, []);
    useEffect(() => {
        try {
            const savedContinum = localStorage.getItem('continum_data');
            const savedEfMap = localStorage.getItem('ef_map');
            const savedPalMap = localStorage.getItem('pal_map');

            if (savedContinum) {
                const parsed = JSON.parse(savedContinum).map(row => ({
                    ...row,
                    agenda: row.agenda ? new Date(row.agenda) : null,
                    chegada: row.chegada ? new Date(row.chegada) : null,
                    acionado: row.acionado ? new Date(row.acionado) : null,
                    horaLib: row.horaLib ? new Date(row.horaLib) : null,
                    inicioConf: row.inicioConf ? new Date(row.inicioConf) : null,
                    fimConf: row.fimConf ? new Date(row.fimConf) : null,
                }));
                setContinuumData(parsed);
                setLoaded(p => ({ ...p, continum: true }));
            }
            if (savedEfMap) {
                setEfMap(JSON.parse(savedEfMap));
                setLoaded(p => ({ ...p, conf: true }));
            }
            if (savedPalMap) {
                setPalMap(JSON.parse(savedPalMap));
                setLoaded(p => ({ ...p, paletes: true }));
            }
        } catch (err) {
            console.error('Erro ao carregar dados salvos:', err);
        } finally {
            carregarDB(); // <- garante que roda após o localStorage ser lido
        }
    }, []);
    async function handleContinum(e) {
        const file = e.target.files[0];
        if (!file) return;
        try {
            setError(null);
            const text = await file.text();
            let rows = [];
            if (text.trim().startsWith('<') || text.includes('<table')) {
                rows = processContinum(text);
                if (rows.length > 0) {
                    const normalized = rows.map(normalizeContinum).filter(r => r.senha !== '');
                    setContinuumData(normalized);
                    localStorage.setItem('continum_data', JSON.stringify(normalized));
                    setLoaded(p => ({ ...p, continum: true }));
                    return;
                }
            }
            const buf = await file.arrayBuffer();
            const json = processXLSArrayBuffer(new Uint8Array(buf));
            const normalized = json.map(normalizeContinum).filter(r => r.senha !== '');
            setContinuumData(normalized);
            localStorage.setItem('continum_data', JSON.stringify(normalized));
            setLoaded(p => ({ ...p, continum: true }));
        } catch (err) {
            setError('Erro ao carregar Continum: ' + err.message);
        }
    }

    async function handleConf(e) {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const efData = processConf(text);
            setEfMap(efData);
            localStorage.setItem('ef_map', JSON.stringify(efData));
            setLoaded(p => ({ ...p, conf: true }));
        } catch (err) {
            setError('Erro ao carregar Conferência: ' + err.message);
        }
    }

    async function handlePaletes(e) {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            setPalMap(processPaletes(text));
            const palData = processPaletes(text);
            setPalMap(palData);
            localStorage.setItem('pal_map', JSON.stringify(palData));
            setLoaded(p => ({ ...p, paletes: true }));
            setLoaded(p => ({ ...p, paletes: true }));
        } catch (err) {
            setError('Erro ao carregar Paletes: ' + err.message);
        }
    }

    // Salvar via API (chamado pelos componentes filhos)
    async function salvarAcao(carga, acao) {
        try {
            await fetch('/api/acao', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ carga, acao }),
            });
            await carregarDB();
        } catch { setError('Erro ao comunicar com o servidor.'); }
    }

    async function salvarAcionamento(carga, doca, fornecedor, motorista) {
        try {
            await fetch('/api/acionamento', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ carga, doca, fornecedor, motorista }),
            });
            await carregarDB();
        } catch { setError('Erro ao comunicar com o servidor.'); }
    }

    async function desfazerAcao(carga, acao) {
        try {
            const res = await fetch('/api/desfazer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ carga, acao }),
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data.erro || 'Erro ao desfazer ação');
                return;
            }
            await carregarDB();
        } catch {
            setError('Erro ao comunicar com o servidor.');
        }
    }
    async function desfazerDoca(carga) {
        try {
            const res = await fetch('/api/remover', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ carga }),
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data.erro || 'Erro ao desfazer doca');
                return;
            }
            await carregarDB();
        } catch {
            setError('Erro ao comunicar com o servidor.');
        }
    }

        async function atualizarDoca(carga, doca) {

    const numeroDoca = Number(doca);

    if (
        !Number.isInteger(numeroDoca) ||
        numeroDoca < 1 ||
        numeroDoca > 50 ||
        doca !== String(numeroDoca)
    ) {
        alert('A Doca deve ser um número inteiro entre 1 e 50.');
        return;
    }
    try {
        await fetch('/api/atualizar-doca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carga, doca }),
        });
        await carregarDB();
    } catch {
        setError('Erro ao comunicar com o servidor.');
    }
    }


    // ─── EXPORTAÇÃO EXCEL ───────────────────────────────────────
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportDate, setExportDate] = useState('');

    function handleExportExcel() {
        const registros = Object.entries(dbState)
            .filter(([, db]) => db.contato_at || db.liberacao_at || db.acionamento_at)
            .map(([carga, db]) => {
                const cargaInt = parseInt(carga);
                const rowCont = continuumData.find(r => r.carga === cargaInt);
                const refDate = db.acionamento_at || db.liberacao_at || db.contato_at;
                if (exportDate && refDate) {
                    const d = new Date(refDate);
                    const dKey = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
                    if (dKey !== exportDate) return null;
                }
                function fmtDt(iso) {
                    if (!iso) return '';
                    const d = new Date(iso);
                    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                }
                return {
                    'Carga': cargaInt,
                    'Fornecedor': db.fornecedor || rowCont?.fornecedor || '',
                    'Motorista': db.motorista || rowCont?.motorista || '',
                    'Doca': db.doca || '',
                    'Data/Hora Contato': fmtDt(db.contato_at),
                    'Data/Hora Liberação': fmtDt(db.liberacao_at),
                    'Data/Hora Acionamento': fmtDt(db.acionamento_at),
                };
            })
            .filter(Boolean);

        if (registros.length === 0) {
            alert('Nenhum registro encontrado para a data selecionada.');
            return;
        }
        const cols = ['Carga', 'Fornecedor', 'Motorista', 'Doca', 'Data/Hora Contato', 'Data/Hora Liberação', 'Data/Hora Acionamento'];
        const csv = [cols.join(';'), ...registros.map(r => cols.map(c => `"${r[c]}"`).join(';'))].join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `logistica_registros_${exportDate ? exportDate.replace('/', '_') : 'todos'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        setShowExportModal(false);
    }

    const exportDates = useMemo(() => {
        const dates = new Set();
        Object.values(dbState).forEach(db => {
            const ref = db.acionamento_at || db.liberacao_at || db.contato_at;
            if (ref) {
                const d = new Date(ref);
                dates.add(`${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`);
            }
        });
        return Array.from(dates).sort();
    }, [dbState]);
    async function handleCaptura() {
        const painel = document.getElementById('painel-ativo');
        if (!painel) return;

        if (typeof html2canvas === 'undefined') {
            alert('Biblioteca de captura não carregada. Verifique sua conexão.');
            return;
        }

        try {
            const tabLabel = tabs.find(t => t.id === activeTab)?.label || activeTab;
            const agora = new Date().toLocaleString('pt-BR').replace(/[/:,\s]/g, '_');

            // Oculta colunas de ação antes de capturar
            const colsAcao = document.querySelectorAll('.col-acao');
            colsAcao.forEach(el => el.style.display = 'none');

            const canvas = await html2canvas(painel, {
                backgroundColor: '#f0f4ff',
                scale: 2,
                useCORS: true,
                logging: false,
                scrollX: 0,
                scrollY: 0,
                windowWidth: painel.scrollWidth,
                windowHeight: painel.scrollHeight,
                width: painel.scrollWidth,
                height: painel.scrollHeight,
            });

            // Restaura colunas após captura
            colsAcao.forEach(el => el.style.display = '');

            canvas.toBlob(async (blob) => {
                await navigator.clipboard.write([
                    new ClipboardItem({
                        'image/png': blob
                    })
                ]);
             const msg = document.createElement('div');
msg.textContent = '✓ Imagem copiada para a área de transferência';
msg.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #16a34a;
    color: white;
    padding: 12px 18px;
    border-radius: 8px;
    font-weight: 600;
    z-index: 9999;
    box-shadow: 0 4px 12px rgba(0,0,0,.2);
`;

document.body.appendChild(msg);

setTimeout(() => {
    msg.remove();
}, 3000);
            });
        } catch (err) {
            // Garante restauração mesmo se der erro
            document.querySelectorAll('.col-acao').forEach(el => el.style.display = '');
            alert('Erro ao capturar tela: ' + err.message);
        }
    }

    return (
        <div className="min-h-screen bg-blue-50 text-slate-900" style={{ fontFamily: "'IBM Plex Sans',sans-serif" }}>
            <header className="bg-blue-800 border-b border-slate-300 sticky top-0 z-50">
                <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">

                        <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center text-white font-bold text-sm">🚛</div>

                        <div>
                            <h1 className="text-base font-bold text-gray-100 tracking-wide">ACOMPANHAMENTO LOGÍSTICO</h1>
                            <p className="text-sm text-gray-300">Recebimento — CD 910</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">

                        {servidorOk === null && (
                            <span className="text-xs text-slate-800 flex items-center gap-1">
                                <span className="animate-pulse">⬤</span> Conectando...
                            </span>
                        )}
                        {servidorOk === true && (
                            <span className="text-xs text-green-500 flex items-center gap-2">
                                <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                                Servidor online · Sincroniza a cada 1 min
                            </span>
                        )}
                        {servidorOk === false && (
                            <span className="text-xs text-red-500 flex items-center gap-2">
                                <span className="inline-block w-2 h-2 rounded-full bg-red-400"></span>
                                Servidor offline
                            </span>
                        )}
                    </div>
                </div>
            </header>

            <div className="max-w-screen-2xl mx-auto px-4 py-6 space-y-6 flex-1 w-full">
                <UploadSection onContinum={handleContinum} onConf={handleConf} onPaletes={handlePaletes} loaded={loaded} onExportar={() => setShowExportModal(true)} onAtualizar={carregarDB} />



                {error && (
                    <div className="bg-red-950/50 border border-red-700 rounded-xl px-4 py-3 text-red-300 text-sm">⚠ {error}</div>
                )}

                {continuumData.length > 0 && (
                    <>
                        <div className="flex items-center justify-between border-b border-slate-300">
                            <div className="flex gap-1">
                                {tabs.map(tab => (
                                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                        className={`px-4 py-2 text-xs font-semibold transition-all ${activeTab === tab.id ? 'tab-active text-blue-700' : 'text-slate-600 hover:text-slate-900'}`}>
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={handleCaptura}
                                className="mb-1 flex items-center gap-2 bg-slate-100 hover:bg-slate-700 text-slate-700 hover:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border border-slate-300"
                                title="Capturar tela do painel atual"
                            >
                                📷 Capturar Tela
                            </button>
                        </div>
                        <div className="pb-8" id="painel-ativo">
                            {activeTab === 'geral' && <DashboardGeral data={continuumData} />}
                            {activeTab === 'eficiencia' && <DashboardEficiencia data={continuumData} efMap={efMap} />}
                            {activeTab === 'doca' && <DashboardDoca data={continuumData} dbState={dbState} efMap={efMap} desfazerDoca={desfazerDoca} atualizarDoca={atualizarDoca}/>}
                            {activeTab === 'aguardando' && <DashboardAguardando data={continuumData} palMap={palMap} dbState={dbState} salvarAcao={salvarAcao} salvarAcionamento={salvarAcionamento} desfazerAcao={desfazerAcao} handlePaletes={handlePaletes} />}
                            {activeTab === 'liberado' && <DashboardLiberadoPgto data={continuumData} dbState={dbState} />}
                        </div>
                    </>
                )}

                {continuumData.length === 0 && (
                    <div className="text-center py-20 text-slate-600">
                        <div className="text-6xl mb-4">📦</div>
                        <p className="text-lg font-semibold">Carregue a Base Continum para iniciar</p>
                        <p className="text-sm mt-2">Faça upload do arquivo .xls no painel acima</p>
                    </div>
                )}
            </div>
            {showExportModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-96">
                        <h2 className="text-base font-bold text-slate-800 mb-1">Exportar Registros</h2>
                        <p className="font-auto text-xs mb-1">As datas disponíveis para exportação são as quatro mais recentes.</p>
                        <p className="text-xs text-slate-500 mb-4">Selecione para filtrar os registros exportados</p>
                        <div className="space-y-3 mb-5">
                            <div>
                                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-2">Data</label>
                                <div className="flex gap-2 flex-wrap">
                                    <button onClick={() => setExportDate('')}
                                        className={`px-3 py-1 rounded text-xs font-semibold transition-all ${exportDate === '' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                    >Todas</button>
                                    {exportDates.map(d => (
                                        <button key={d} onClick={() => setExportDate(d)}
                                            className={`px-3 py-1 rounded text-xs font-mono font-semibold transition-all ${exportDate === d ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                        >{d}</button>
                                    ))}
                                </div>
                            </div>

                        </div>
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => setShowExportModal(false)}
                                className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all"
                            >Cancelar</button>
                            <button onClick={handleExportExcel}
                                className="px-4 py-2 rounded-lg text-xs font-bold bg-green-700 hover:bg-green-600 text-white transition-all flex items-center gap-2"
                            >📊 Exportar CSV</button>
                        </div>
                    </div>

                </div>
            )}
            <footer className="bg-blue-800 py-2 px-4 text-center text-xs text-white font-semibold tracking-widest flex flex-col">
                © {new Date().getFullYear()} Desenvolvido por Juliana Cruz.
            </footer>
        </div>
    );
}

// Mount
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));