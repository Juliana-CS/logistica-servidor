// ============================================================
// SERVIDOR LOGÍSTICA DE RECEBIMENTO
// Node.js + Express — persiste dados em logistica_db.json
// ============================================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'logistica_db.json');

// ─── MIDDLEWARE ──────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CORS para acesso na rede local
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ─── HELPERS DE ARQUIVO ──────────────────────────────────────
function lerDB() {
  try {
    if (!fs.existsSync(DB_PATH)) return {};
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function salvarDB(dados) {
  fs.writeFileSync(DB_PATH, JSON.stringify(dados, null, 2), 'utf8');
}

// ─── ROTAS DA API ────────────────────────────────────────────

// GET /api/db — retorna todo o estado atual
app.get('/api/db', (req, res) => {
  res.json(lerDB());
});

// POST /api/acao — registra contato ou liberação
// Body: { carga, acao: 'contato' | 'liberacao' }
app.post('/api/acao', (req, res) => {
  const { carga, acao } = req.body;
  if (!carga || !acao) return res.status(400).json({ erro: 'carga e acao são obrigatórios' });

  const db = lerDB();
  if (!db[carga]) db[carga] = {};
  db[carga][acao] = true;
  db[carga][`${acao}_at`] = new Date().toISOString();
  salvarDB(db);

  res.json({ ok: true, carga, acao, dados: db[carga] });
});

// POST /api/acionamento — registra doca e move para Em Doca
// Body: { carga, doca, fornecedor, motorista }
app.post('/api/acionamento', (req, res) => {
  const { carga, doca, fornecedor, motorista } = req.body;
  if (!carga || !doca) return res.status(400).json({ erro: 'carga e doca são obrigatórios' });

  const db = lerDB();
  if (!db[carga]) db[carga] = {};

  db[carga].acionamento = true;
  db[carga].acionamento_at = new Date().toISOString();
  db[carga].doca = doca;
  if (fornecedor) db[carga].fornecedor = fornecedor;
  if (motorista) db[carga].motorista = motorista;

  salvarDB(db);
  res.json({ ok: true, carga, doca, dados: db[carga] });
});

// DELETE /api/acionamento/:carga — remove da doca (opcional, para correções)
app.post('/api/remover', (req, res) => {
  const { carga } = req.body;
  if (!carga) return res.status(400).json({ erro: 'carga é obrigatória' });

  const db = lerDB();
  if (db[carga]) {
    delete db[carga].acionamento;
    delete db[carga].acionamento_at;
    delete db[carga].doca;
    salvarDB(db);
  }
  res.json({ ok: true, carga });
});

// ─── INICIA SERVIDOR ─────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  // Garantir que o arquivo DB existe
  if (!fs.existsSync(DB_PATH)) salvarDB({});

  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   SERVIDOR LOGÍSTICA DE RECEBIMENTO          ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║   Rodando em: http://localhost:${PORT}           ║`);
  console.log('║                                              ║');

  // Exibir IP da rede local
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`║   Rede local:  http://${net.address}:${PORT}    ║`);
      }
    }
  }

  console.log('║                                              ║');
  console.log(`║   Dados em:   logistica_db.json              ║`);
  console.log('║   Para parar: Ctrl + C                       ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
});
