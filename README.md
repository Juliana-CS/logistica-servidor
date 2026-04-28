# 🚛 Logística de Recebimento — Servidor de Rede Local

## Estrutura
```
logistica-servidor/
├── server.js           ← Servidor Node.js
├── package.json        ← Dependências
├── logistica_db.json   ← Criado automaticamente ao rodar
└── public/
    ├── index.html
    └── app.jsx
```

## Requisitos
- Node.js instalado na máquina servidora
- Download: https://nodejs.org (versão LTS)

## Como rodar

### 1ª vez (instalar dependências)
```bash
cd logistica-servidor
npm install
```

### Iniciar o servidor
```bash
node server.js
```

O terminal vai exibir:
```
╔══════════════════════════════════════════════╗
║   SERVIDOR LOGÍSTICA DE RECEBIMENTO          ║
╠══════════════════════════════════════════════╣
║   Rodando em: http://localhost:3000           ║
║   Rede local:  http://192.168.1.10:3000       ║
║   Dados em:   logistica_db.json               ║
║   Para parar: Ctrl + C                        ║
╚══════════════════════════════════════════════╝
```

### Acessar de qualquer máquina da rede
Abrir o navegador e digitar o endereço exibido em "Rede local":
```
http://192.168.x.x:3000
```

## Funcionamento

- Alterações (Contato, Liberação, Acionamento) são salvas **automaticamente** no `logistica_db.json`
- Todos os usuários conectados sincronizam a cada **1 minuto**
- O arquivo `logistica_db.json` é criado automaticamente na primeira execução
- Para fazer backup: copiar o `logistica_db.json`

## Iniciar automaticamente com o Windows

Para o servidor iniciar junto com o Windows, crie um arquivo `iniciar.bat` na pasta:

```bat
@echo off
cd /d "C:\caminho\para\logistica-servidor"
node server.js
pause
```

Coloque um atalho desse `.bat` na pasta de inicialização do Windows:
`C:\Users\SEU_USUARIO\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup`
