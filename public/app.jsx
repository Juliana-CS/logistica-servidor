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
  if (total >= 6 * 60 && total <= 14 * 60 + 20) return '1º Turno';   // 06:00–14:20
  if (total >= 14 * 60 + 21 && total <= 22 * 60) return '2º Turno';  // 14:21–22:00
  return '3º Turno';                                                   // 22:01–05:59
}

// Lógica necessária:
// 22:00–23:59 → dia seguinte (3º turno do próximo ciclo)
// 00:00–21:59 → dia atual

function getDayKey(date) {
  if (!date) return null;
  const d = new Date(date);
  if (d.getHours() >= 22) d.setDate(d.getDate() + 1);  // empurra para o próximo dia
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
      fimConfDia = `${partes[0].padStart(2, '0')}/${partes[1].padStart(2, '0')}`;
      const [hh, mm] = row['FINALCONF_HORA'].trim().split(':');
      fimConfMin = parseInt(hh) * 60 + parseInt(mm);
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
    <div className={`bg-white border ${border[color]} rounded-lg p-4 card-glow shadow-sm`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-600 uppercase tracking-widest font-bold">{title}</p>
          <p className={`text-4xl font-bold mt-1 font-mono ${text[color]}`}>{value}</p>
          {sub && <p className="text-xs text-slate-600 mt-1">{sub}</p>}
        </div>
        {icon && <span className="text-2xl opacity-30">{icon}</span>}
      </div>
    </div>
  );
}

// ─── UPLOAD DE BASES ─────────────────────────────────────────
function UploadSection({ onContinum, onConf, onPaletes, loaded }) {
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

  return (
    <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className="pulse-dot"></div>
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Upload de Bases</h2>
      </div>
      <div className="flex flex-wrap gap-3">
        {fileInput('Base Continum (.xls)', '.xls,.xlsx,.html', onContinum, loaded.continum)}
        {fileInput('Conferência (.txt)', '.txt,.csv', onConf, loaded.conf)}
        {fileInput('Paletes (.txt)', '.txt,.csv', onPaletes, loaded.paletes)}
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card title="Total Programado" value={stats.total} icon="📦" color="blue" sub={selectedDay !== '__all__' ? selectedDay : 'todas as datas'} />
        <Card title="Finalizados" value={stats.statusCount['FINALIZADO'] || 0} icon="✓" color="green" />
        <Card title="Em Conferência" value={stats.statusCount['CONFERENCIA'] || 0} icon="⚙" color="blue" />
        <Card title="Não Compareceu" value={stats.statusCount['NÃO COMPARECEU'] || 0} icon="✗" color="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-sm">
          <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-3">Programado por Dia/Turno</h3>
          <div className="space-y-3">
            {Object.entries(stats.byDay).sort().map(([day, info]) => (
              <div key={day} className="border border-slate-300 rounded-lg p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-mono text-sm text-blue-700">{day}</span>
                  <span className="font-mono text-sm text-slate-800">{info.total} cargas</span>
                </div>
                <div className="flex gap-2 flex-wrap">
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

        <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-sm">
          <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-1">Contagem por Status × Data</h3>
          <p className="text-xs text-slate-600 mb-3">Exibe todos os dias independente do filtro</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
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
    </div>
  );
}

// Turno pelo total de minutos (0-1439), sem precisar de Date object
function getTurnoByMin(totalMin) {
  if (totalMin === null || totalMin === undefined) return null;
  if (totalMin >= 6 * 60 && totalMin <= 14 * 60 + 20) return '1º Turno';
  if (totalMin >= 14 * 60 + 21 && totalMin <= 22 * 60) return '2º Turno';
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

  // Dias disponíveis vindos da base conf (fimConfDia), para o filtro
  const allDaysConf = useMemo(() => {
    const s = new Set(Object.values(efMap).map(e => e.fimConfDia).filter(Boolean));
    return Array.from(s).sort();
  }, [efMap]);

  const stats = useMemo(() => {
    const turnos = {
      '1º Turno': { prog: 0, fin: 0, turnoIni: 6 * 60, turnoFim: 14 * 60 + 20 },
      '2º Turno': { prog: 0, fin: 0, turnoIni: 14 * 60 + 21, turnoFim: 22 * 60 },
      '3º Turno': { prog: 0, fin: 0, turnoIni: 22 * 60 + 1, turnoFim: 5 * 60 + 59 },
    };

    // PROGRAMADO: Continum filtrado por data
    filtered.forEach(row => {
      const t = row.turno || '1º Turno';
      if (turnos[t]) turnos[t].prog++;
    });

    // FINALIZADO: base conf — FINALCONF_DATA = dia filtrado, FINALCONF_HORA define o turno
    Object.values(efMap).forEach(entry => {
      if (entry.fimConfDia === null || entry.fimConfMin === null) return;
      if (selectedDay !== '__all__' && entry.fimConfDia !== selectedDay) return;
      const m = entry.fimConfMin;
      const t = m >= 6 * 60 && m <= 14 * 60 + 20 ? '1º Turno'
        : m >= 14 * 60 + 21 && m <= 22 * 60 ? '2º Turno'
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

      {/* Cards por turno + Gráfico na mesma linha */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cards compactos */}
        <div className="flex flex-col gap-3">
          {Object.entries(stats).map(([turno, { prog, fin }]) => {
            const pct = prog > 0 ? ((fin / prog) * 100).toFixed(1) : '0.0';
            return (
              <div key={turno} className="bg-white border border-slate-300 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">{turno}</span>
                  <Badge color={parseFloat(pct) >= 80 ? 'green' : parseFloat(pct) >= 50 ? 'yellow' : 'red'}>
                    {pct}%
                  </Badge>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-600">Prog</span>
                    <span className="text-2xl font-mono font-bold text-slate-900">{prog}</span>
                  </div>
                  <span className="text-slate-600">|</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-600">Fin</span>
                    <span className="text-xl font-mono font-bold text-green-700">{fin}</span>
                  </div>
                  <div className="flex-1 bg-slate-100 rounded-full h-1.5 ml-2">
                    <div
                      className={`h-1.5 rounded-full transition-all ${parseFloat(pct) >= 80 ? 'bg-green-500' : parseFloat(pct) >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {/* Gráfico menor */}
        <GraficoFinalizadosTurno stats={stats} />
      </div>

      {/* Painel Eficiência de Conferência por Hora/Turno */}
      <EficienciaHoraTurno filtered={filtered} efMap={efMap} selectedDay={selectedDay} />
    </div>
  );
}

// ─── GRÁFICO FINALIZADOS POR TURNO ──────────────────────────
function GraficoFinalizadosTurno({ stats }) {
  const turnos = [
    { nome: '1º Turno', key: '1º Turno', cor: '#3b82f6', corBg: 'rgba(59,130,246,0.15)' },
    { nome: '2º Turno', key: '2º Turno', cor: '#eab308', corBg: 'rgba(234,179,8,0.15)' },
    { nome: '3º Turno', key: '3º Turno', cor: '#f97316', corBg: 'rgba(249,115,22,0.15)' },
  ];

  const valores = turnos.map(t => stats[t.key]?.fin || 0);
  const maximo = Math.max(...valores, 1);

  return (
    <div className="bg-white border border-slate-300 rounded-xl p-5 shadow-sm">
      <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-5">
        Finalizados por Turno
      </h3>

      {/* Barras */}
      <div className="flex items-end justify-around gap-4 px-2" style={{ height: 120 }}>
        {turnos.map((t, i) => {
          const val = valores[i];
          const pct = maximo > 0 ? (val / maximo) * 100 : 0;
          const pctProg = stats[t.key]?.prog > 0
            ? ((val / stats[t.key].prog) * 100).toFixed(0) + '%'
            : '0%';

          return (
            <div key={t.key} className="flex flex-col items-center gap-1 flex-1">
              <span className="text-sm font-mono font-bold" style={{ color: t.cor }}>{val}</span>
              <div className="w-full flex items-end" style={{ height: 80 }}>
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
      <div className="mt-4 pt-3 border-t border-slate-200 flex justify-center gap-6">
        {turnos.map((t, i) => (
          <div key={t.key} className="flex items-center gap-2 text-xs text-slate-600">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: t.cor }}></span>
            {t.nome}: <span className="font-mono font-bold text-slate-800">{valores[i]}</span>
            <span className="text-slate-600">
              ({stats[t.key]?.prog > 0
                ? ((valores[i] / stats[t.key].prog) * 100).toFixed(0)
                : 0}% de {stats[t.key]?.prog || 0} prog.)
            </span>
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
      nome: '1º Turno', cor: 'border-blue-400', corHeader: 'bg-blue-900/40 text-blue-700',
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
        { label: '14:00', ini: 14 * 60, fim: 14 * 60 + 20 },
      ],
      turnoIni: 6 * 60, turnoFim: 14 * 60 + 20,
    },
    {
      nome: '2º Turno', cor: 'border-yellow-400', corHeader: 'bg-yellow-900/40 text-yellow-700',
      slots: [
        { label: '14:21', ini: 14 * 60 + 21, fim: 15 * 60 },
        { label: '15:00', ini: 15 * 60, fim: 16 * 60 },
        { label: '16:00', ini: 16 * 60, fim: 17 * 60 },
        { label: '17:00', ini: 17 * 60, fim: 18 * 60 },
        { label: '18:00', ini: 18 * 60, fim: 19 * 60 },
        { label: '19:00', ini: 19 * 60, fim: 20 * 60 },
        { label: '20:00', ini: 20 * 60, fim: 21 * 60 },
        { label: '21:00', ini: 21 * 60, fim: 22 * 60 },
        { label: '22:00', ini: 22 * 60, fim: 22 * 60 + 1 },
      ],
      turnoIni: 14 * 60 + 21, turnoFim: 22 * 60,
    },
    {
      nome: '3º Turno', cor: 'border-orange-400', corHeader: 'bg-orange-100 text-orange-700',
      slots: [
        { label: '22:01', ini: 22 * 60 + 1, fim: 23 * 60 },
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
    return totalMin >= 22 * 60 + 1 || totalMin <= 5 * 60 + 59;
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
        ? ((24 * 60 - (22 * 60 + 1)) + (5 * 60 + 59 + 1)) / 60
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
      <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-4">
        Eficiência de Conferência por Hora/Turno
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {turnoStats.map(turno => (
          <div key={turno.nome} className={`border ${turno.cor} rounded-xl overflow-hidden`}>
            <div className={`${turno.corHeader} px-3 py-2 flex items-center justify-between`}>
              <span className="text-xs font-bold uppercase tracking-widest">{turno.nome}</span>
              <span className="text-xs font-mono font-bold">{turno.pct}</span>
            </div>
            <table className="w-full text-xs">
              <tbody>
                {turno.slots.map(slot => (
                  <tr key={slot.label} className="border-b border-slate-200 table-row-hover">
                    <td className="py-1.5 px-3 font-mono text-slate-500 w-16">{slot.label}</td>
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
                  <td colSpan={3} className="py-2 px-3 text-xs font-bold">
                    <span className="text-slate-600">TOTAL: </span>
                    <span className="font-mono text-blue-700">{turno.totalCargas}</span>
                    <span className="text-slate-600 mx-1">|</span>
                    <span className={`font-mono font-bold ${getEficienciaColor(turno.taxaGeral)}`}>
                      {turno.taxaGeral !== null ? turno.taxaGeral.toFixed(1) : '--'} reg/h
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
function DashboardDoca({ data, dbState, efMap }) {
  const now = new Date();
  const conferencia = useMemo(() => {
    const vistos = new Set();

    // 1. Acionados manualmente via painel (têm doca registrada no servidor)
    const manuais = Object.entries(dbState)
      .filter(([, db]) => db.acionamento && db.doca)
      .map(([carga, db]) => {
        const cargaInt = parseInt(carga);
        vistos.add(cargaInt);
        const rowContinum = data.find(r => r.carga === cargaInt);
        const ref = db.acionamento_at ? new Date(db.acionamento_at) : null;
        const minutos = ref ? diffMinutes(ref, now) : null;
        return {
          carga: cargaInt,
          fornecedor: db.fornecedor || rowContinum?.fornecedor || '--',
          motorista: db.motorista || rowContinum?.motorista || '--',
          doca: db.doca,
          acionado: ref,
          minutosDoca: minutos,
          origem: 'manual',
        };
      });

    // 2. Status CONFERENCIA no Continum (que ainda não foram acionados manualmente)
    const doContinum = data
      .filter(r => r.status === 'CONFERENCIA' && !vistos.has(r.carga))
      .map(row => {
        const ref = row.acionado || row.chegada;
        const minutos = ref ? diffMinutes(ref, now) : null;
        return { ...row, doca: dbState[row.carga]?.doca || '--', minutosDoca: minutos, origem: 'continum' };
      });

    return [...manuais, ...doContinum]
      .sort((a, b) => (b.minutosDoca || 0) - (a.minutosDoca || 0));
  }, [data, dbState]);

  return (
    <div className="space-y-4">
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
        <div className="px-4 py-3 border-b border-slate-200 flex justify-between items-center">
          <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest">Cargas em Doca</h3>
          <span className="text-xs text-slate-600">{conferencia.length} cargas em conferência</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-100">
                <th className="text-left py-2 px-3 text-slate-700 font-semibold">CARGA</th>
                <th className="text-left py-2 px-3 text-slate-700 font-semibold">FORNECEDOR</th>
                <th className="text-left py-2 px-3 text-slate-700 font-semibold">MOTORISTA</th>
                <th className="text-center py-2 px-3 text-slate-700 font-semibold">DOCA</th>
                <th className="text-center py-2 px-3 text-slate-700 font-semibold">ACIONADO</th>
                <th className="text-right py-2 px-3 text-slate-700 font-semibold">TEMPO DOCA</th>
                <th className="text-center py-2 px-3 text-slate-700 font-semibold">CONFERÊNCIA</th>
                <th className="text-center py-2 px-3 text-slate-700 font-semibold">ORIGEM</th>
              </tr>
            </thead>
            <tbody>
              {conferencia.map((row, i) => (
                <tr key={i} className={`border-b border-slate-200 table-row-hover ${getDocaSLABg(row.minutosDoca)}`}>
                  <td className="py-2 px-3 font-mono text-blue-700 font-semibold">{row.carga}</td>
                  <td className="py-2 px-3 text-slate-700 max-w-xs truncate">{row.fornecedor}</td>
                  <td className="py-2 px-3 text-slate-600">{row.motorista}</td>
                  <td className="py-2 px-3 text-center font-mono text-yellow-700 font-bold">{row.doca}</td>
                  <td className="py-2 px-3 text-center font-mono text-slate-600">
                    {row.acionado ? row.acionado.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--'}
                  </td>
                  <td className={`py-2 px-3 text-right font-mono font-bold text-lg ${getDocaSLAColor(row.minutosDoca)}`}>
                    {formatDuration(row.minutosDoca)}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {(() => {
                      const entry = efMap[row.carga];
                      if (!entry || !entry.temInicio)
                        return <span className="status-badge bg-slate-100 text-slate-500 border border-slate-300">Não iniciada</span>;
                      if (entry.temInicio && !entry.temFim)
                        return <span className="status-badge bg-yellow-900/50 text-yellow-700 border border-yellow-700/50">⚙ Em conferência</span>;
                      return <span className="status-badge bg-green-900/50 text-green-700 border border-green-700/50">✓ Finalizada</span>;
                    })()}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {row.origem === 'manual'
                      ? <span className="status-badge bg-green-900/50 text-green-700 border border-green-700/50">✓ Acionado</span>
                      : <span className="status-badge bg-blue-900/50 text-blue-700 border border-blue-700/50">⚙ Continum</span>
                    }
                  </td>
                </tr>
              ))}
              {conferencia.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-slate-600">Nenhuma carga em conferência</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── DASHBOARD: AGUARDANDO ACIONAMENTO ───────────────────────
function DashboardAguardando({ data, palMap, dbState, salvarAcao, salvarAcionamento }) {
  const now = new Date();
  const [docaInputs, setDocaInputs] = useState({});

  const aguardando = useMemo(() =>
    data.filter(r => ['AGENDADO', 'FALTA COMPARECER'].includes(r.status) && r.chegada && !dbState[r.carga]?.acionamento).map(row => {
      const minutosTotal = row.chegada ? diffMinutes(row.chegada, now) : null;
      const pal = palMap[row.carga] || {};
      return { ...row, minutosTotal, ruaModa: pal.ruaModa || '--', temEtiqueta: pal.temEtiqueta || false };
    }).sort((a, b) => (b.minutosTotal || 0) - (a.minutosTotal || 0)),
    [data, palMap]
  );

  function handleAction(carga, action) {
    salvarAcao(carga, action);
  }

  function handleAcionamento(row) {
    const doca = docaInputs[row.carga] || '';
    if (!doca) {
      alert('Digite o número da Doca antes de confirmar!');
      return;
    }
    salvarAcionamento(row.carga, doca, row.fornecedor, row.motorista);
    setDocaInputs(prev => ({ ...prev, [row.carga]: '' }));
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: '≥ 2h (CRÍTICO)', color: 'red' },
          { label: '≥ 1:30h (ALERTA)', color: 'orange' },
          { label: '≥ 1h (ATENÇÃO)', color: 'yellow' },
          { label: '< 1h (OK)', color: 'green' },
        ].map(({ label, color }, idx) => {
          const mins = [120, 90, 60, 0][idx];
          const nextMins = [Infinity, 120, 90, 60][idx];
          const count = aguardando.filter(r =>
            r.minutosTotal >= mins && r.minutosTotal < nextMins
          ).length;
          return <Card key={label} title={label} value={count} color={color} />;
        })}
      </div>

      <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-slate-300">
          <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest">Aguardando Acionamento — {aguardando.length} cargas</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-100">
                <th className="text-left py-2 px-3 text-slate-700 font-semibold">CARGA</th>
                <th className="text-left py-2 px-3 text-slate-700 font-semibold">FORNECEDOR</th>
                <th className="text-center py-2 px-3 text-slate-700 font-semibold">RUA</th>
                <th className="text-center py-2 px-3 text-slate-700 font-semibold">ETIQUETA</th>
                <th className="text-right py-2 px-3 text-slate-700 font-semibold">TEMPO TOTAL</th>
                <th className="text-center py-2 px-3 text-slate-700 font-semibold">CONTATO</th>
                <th className="text-center py-2 px-3 text-slate-700 font-semibold">LIBERAÇÃO</th>
                <th className="text-center py-2 px-3 text-slate-700 font-semibold">ACIONAMENTO</th>
              </tr>
            </thead>
            <tbody>
              {aguardando.map((row, i) => {
                const db = dbState[row.carga] || {};
                return (
                  <tr key={i} className={`border-b border-slate-200 table-row-hover ${getAguardandoSLABg(row.minutosTotal)}`}>
                    <td className="py-2 px-3 font-mono text-blue-700 font-semibold">{row.carga}</td>
                    <td className="py-2 px-3 text-slate-700 max-w-xs" style={{ maxWidth: 200 }}>
                      <div className="truncate">{row.fornecedor}</div>
                      <div className="text-slate-500 truncate">{row.motorista}</div>
                    </td>
                    <td className="py-2 px-3 text-center font-mono font-bold text-cyan-800">{row.ruaModa}</td>
                    <td className="py-2 px-3 text-center">
                      {row.temEtiqueta
                        ? <Badge color="green">SIM</Badge>
                        : <Badge color="red">NÃO</Badge>}
                    </td>
                    <td className={`py-2 px-3 text-right font-mono font-bold text-base ${getAguardandoSLAColor(row.minutosTotal)}`}>
                      {formatDuration(row.minutosTotal)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {db.contato
                        ? <Badge color="green">✓</Badge>
                        : <button
                          onClick={() => handleAction(row.carga, 'contato')}
                          className="bg-blue-900 hover:bg-blue-700 text-blue-700 rounded px-2 py-1 text-xs font-semibold transition-all"
                        >CONTATO</button>
                      }
                    </td>
                    <td className="py-2 px-3 text-center">
                      {db.liberacao
                        ? <Badge color="green">✓</Badge>
                        : <button
                          onClick={() => handleAction(row.carga, 'liberacao')}
                          className="bg-purple-100 hover:bg-purple-200 text-purple-700 rounded px-2 py-1 text-xs font-semibold transition-all"
                        >LIBERAÇÃO</button>
                      }
                    </td>
                    <td className="py-2 px-3 text-center">
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
    { id: 'geral', label: '📊 Visão Geral' },
    { id: 'eficiencia', label: '⚡ Eficiência' },
    { id: 'doca', label: '🚛 Em Doca' },
    { id: 'aguardando', label: '⏳ Aguardando' },
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
    carregarDB();
    const intervalo = setInterval(carregarDB, 60000); // 60 segundos
    return () => clearInterval(intervalo);
  }, [carregarDB]);

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
          setContinuumData(rows.map(normalizeContinum).filter(r => r.senha !== ''));
          setLoaded(p => ({ ...p, continum: true }));
          return;
        }
      }
      const buf = await file.arrayBuffer();
      const json = processXLSArrayBuffer(new Uint8Array(buf));
      setContinuumData(json.map(normalizeContinum).filter(r => r.senha !== ''));
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
      setEfMap(processConf(text));
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

  async function handleCaptura() {
    const painel = document.getElementById('painel-ativo');
    if (!painel) return;

    // Usa html2canvas carregado via CDN
    if (typeof html2canvas === 'undefined') {
      alert('Biblioteca de captura não carregada. Verifique sua conexão.');
      return;
    }

    try {
      const tabLabel = tabs.find(t => t.id === activeTab)?.label || activeTab;
      const agora = new Date().toLocaleString('pt-BR').replace(/[/:,\s]/g, '_');
      const canvas = await html2canvas(painel, {
        backgroundColor: '#0d1117',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `logistica_${tabLabel.replace(/[^a-zA-Z0-9]/g, '_')}_${agora}.png`;
      a.click();
    } catch (err) {
      alert('Erro ao capturar tela: ' + err.message);
    }
  }

  return (
    <div className="min-h-screen bg-blue-50 text-slate-900" style={{ fontFamily: "'IBM Plex Sans',sans-serif" }}>
      <header className="bg-blue-800 border-b border-slate-300 sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-white font-bold text-lg">🚛</div>
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

      <div className="max-w-screen-2xl mx-auto px-4 py-6 space-y-6">
        <UploadSection onContinum={handleContinum} onConf={handleConf} onPaletes={handlePaletes} loaded={loaded} />



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
              {activeTab === 'doca' && <DashboardDoca data={continuumData} dbState={dbState} efMap={efMap} />}
              {activeTab === 'aguardando' && <DashboardAguardando data={continuumData} palMap={palMap} dbState={dbState} salvarAcao={salvarAcao} salvarAcionamento={salvarAcionamento} />}
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
    </div>
  );
}

// Mount
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
