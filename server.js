// ============================================================
// SERVIDOR LOGÍSTICA DE RECEBIMENTO
// Node.js + Express + MongoDB Atlas
// ============================================================
require('node:dns/promises').setServers(["1.1.1.1", "8.8.8.8"]); // Se usar CommonJS (require)
// OU se o seu projeto usar "import":
// import dns from 'node:dns/promises'; dns.setServers(['1.1.1.1', '8.8.8.8']);

const express = require('express');
const path    = require('path');
const { MongoClient } = require('mongodb');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── CONFIGURAÇÃO MONGODB ────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME   = 'logistica';
const COL_NAME  = 'registros';

let db = null;

async function conectarMongo() {
  try {
    const client = await MongoClient.connect(MONGO_URI);
    db = client.db(DB_NAME);
    console.log('✓ MongoDB Atlas conectado');
  } catch (err) {
    console.error('✗ Erro ao conectar MongoDB:', err.message);
    process.exit(1);
  }
}

// ─── HELPERS DO BANCO ────────────────────────────────────────
// O banco armazena um único documento com todos os registros
// { _id: 'estado', dados: { carga1: {...}, carga2: {...} } }

async function lerDB() {
  try {
    const doc = await db.collection(COL_NAME).findOne({ _id: 'estado' });
    return doc?.dados || {};
  } catch (err) {
    console.error('Erro ao ler DB:', err.message);
    return {};
  }
}

async function salvarDB(dados) {
  try {
    await db.collection(COL_NAME).updateOne(
      { _id: 'estado' },
      { $set: { dados } },
      { upsert: true }
    );
  } catch (err) {
    console.error('Erro ao salvar DB:', err.message);
  }
}

// ─── MIDDLEWARE ──────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ─── ROTAS DA API ────────────────────────────────────────────

// GET /api/db — retorna todo o estado atual
app.get('/api/db', async (req, res) => {
  const dados = await lerDB();
  res.json(dados);
});

// POST /api/acao — registra contato ou liberação
app.post('/api/acao', async (req, res) => {
  const { carga, acao } = req.body;
  if (!carga || !acao) return res.status(400).json({ erro: 'carga e acao são obrigatórios' });

  const db_atual = await lerDB();
  if (!db_atual[carga]) db_atual[carga] = {};
  db_atual[carga][acao]          = true;
  db_atual[carga][`${acao}_at`] = new Date().toISOString();
  await salvarDB(db_atual);

  res.json({ ok: true, carga, acao });
});

// POST /api/acionamento — registra doca
app.post('/api/acionamento', async (req, res) => {
  const { carga, doca, fornecedor, motorista } = req.body;
  if (!carga || !doca) return res.status(400).json({ erro: 'carga e doca são obrigatórios' });

  const db_atual = await lerDB();
  if (!db_atual[carga]) db_atual[carga] = {};
  db_atual[carga].acionamento    = true;
  db_atual[carga].acionamento_at = new Date().toISOString();
  db_atual[carga].doca           = doca;
  if (fornecedor) db_atual[carga].fornecedor = fornecedor;
  if (motorista)  db_atual[carga].motorista  = motorista;
  await salvarDB(db_atual);

  res.json({ ok: true, carga, doca });
});

// POST /api/atualizar-doca — altera apenas o campo doca, sem mexer em acionamento_at
app.post('/api/atualizar-doca', async(req, res) => {
  const { carga, doca } = req.body;
  if (!carga || !doca) return res.status(400).json({ erro: 'carga e doca são obrigatórios' });

  const db = await lerDB();
  if (!db[carga]) db[carga] = {};
  db[carga].doca = doca;
  await salvarDB(db);

  res.json({ ok: true, carga, doca, dados: db[carga] });
});

// POST /api/remover — remove doca de uma carga
app.post('/api/remover', async (req, res) => {
  const { carga } = req.body;
  if (!carga) return res.status(400).json({ erro: 'carga é obrigatória' });

  const db_atual = await lerDB();
  if (db_atual[carga]) {
    delete db_atual[carga].acionamento;
    delete db_atual[carga].acionamento_at;
    delete db_atual[carga].doca;
    await salvarDB(db_atual);
  }

  res.json({ ok: true, carga });
});

// Rota catch-all
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── INICIA SERVIDOR ─────────────────────────────────────────
conectarMongo().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║   SERVIDOR LOGÍSTICA DE RECEBIMENTO          ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║   Porta: ${PORT}                             ║`);
    console.log('║   Banco: MongoDB Atlas                       ║');
    console.log('║   Para parar: Ctrl + C                       ║');
    console.log('╚══════════════════════════════════════════════╝');
  });
});
