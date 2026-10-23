# Jogo

Jogo de construção de cidades (no estilo de [POLIS](https://polis-game.com/)) feito
em JavaScript puro, que roda no navegador **localmente** e grava o progresso em
**arquivos de save**.

## Como rodar

Precisa só do [Node.js](https://nodejs.org/) 18 ou mais novo — não há dependências para instalar.

```bash
npm start
```

Abra <http://localhost:8080>. Os saves ficam na pasta `saves/` do projeto.

Variáveis opcionais: `PORT=3000` (outra porta) e `SAVES_DIR=/outra/pasta` (outro local para os saves).

```bash
npm test   # testes do formato de save e do servidor
```

## Sistema de salvamento

| Ação | Onde vai parar |
| --- | --- |
| **Salvar** (`Ctrl+S`) | `saves/<id-da-cidade>.json` |
| **Salvar como…** | um arquivo novo, e a partida passa a usar ele |
| **Automático** (a cada 60 s e ao fechar a aba) | `saves/auto-<id-da-cidade>.json` — não sobrescreve o save manual |
| **Exportar / Importar arquivo** | um `.jogo.json` baixado/aberto de qualquer pasta |
| **Código de save** | o save inteiro em uma linha de texto (`JOGO1:…`) para copiar e colar |

Proteções:

- **Gravação atômica**: o servidor grava num arquivo temporário e renomeia, então
  uma queda no meio não corrompe o save. A versão anterior fica em `<id>.json.bak`.
- **Lixeira**: apagar um save move o arquivo para `saves/.trash/`.
- **Checksum**: saves corrompidos ou editados à mão são detectados ao carregar.
- **Versão do formato + migrações**: saves antigos continuam abrindo quando o formato mudar.
- O servidor só escuta em `127.0.0.1` e só aceita ids `[a-z0-9_-]` (nada de `../`).

Se o jogo for aberto por outro servidor estático (sem o `server.js`), ele detecta
isso e salva no `localStorage` do navegador; exportar/importar arquivo continua funcionando.
(Abrir o `index.html` direto com duplo clique não funciona: o navegador bloqueia
módulos JavaScript em `file://`.)

### Formato do arquivo

```jsonc
{
  "format": "jogo-save",
  "version": 1,                 // versão do formato (migrações em src/save/format.js)
  "meta": {                     // dados leves, usados na tela "Carregar"
    "id": "vila-nova-rqlkbx",
    "gameId": "vila-nova-rqlkbx",
    "name": "Vila Nova",
    "autosave": false,
    "gameVersion": "0.1.0",
    "createdAt": "…", "updatedAt": "…",
    "playTimeSeconds": 120,
    "summary": { "population": 0, "money": 19700, "date": { "year": 1, "month": 1, "day": 5 } }
  },
  "checksum": "1a2b3c4d",
  "data": { /* estado do jogo; o mapa vai comprimido em RLE */ }
}
```

### Mudando o formato

Tudo que está em `state` (`src/game/state.js`) é salvo. Ao mudar a estrutura de
forma incompatível, aumente `SAVE_VERSION` em `src/save/format.js` e adicione em
`MIGRATIONS` a função que converte a versão anterior.

## Estrutura

```
server.js               servidor local: arquivos estáticos + API /api/saves
index.html, styles.css  interface
src/main.js             liga o jogo, a interface e o salvamento
src/game/state.js       estado do jogo e simulação (por enquanto um esboço)
src/save/format.js      formato do save: criar, validar, checksum, migrações, RLE
src/save/backends.js    onde gravar: arquivos (servidor) ou navegador
src/save/SaveManager.js salvar, carregar, automático, exportar/importar
test/                   testes (node --test)
```
