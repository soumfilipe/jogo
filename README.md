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
npm test   # testes da simulação, do formato de save e do servidor
```

## Como jogar

| Controle | Ação |
| --- | --- |
| `E` Estrada | arraste para traçar uma estrada em "L" ($10 por tile) |
| `R` / `C` / `I` Zonas | arraste um retângulo de zona residencial, comercial ou industrial ($5 por tile) |
| `B` Demolir | arraste sobre prédios, estradas, árvores ou zonas |
| `V` Inspecionar | clique num prédio ou num cidadão andando; arraste para mover a câmera |
| `L` / `P` Mapas | mostra o valor do terreno ou a poluição sobre o mapa |
| Botão direito/do meio, `WASD`, setas | mover a câmera |
| Roda do mouse | zoom |
| Espaço, `1`, `2`, `3` | pausar e velocidades |
| Minimapa | clique ou arraste para ir até um ponto |

Prédios surgem sozinhos nas zonas que ficam a até 2 tiles de uma estrada, conforme
a demanda (as três barrinhas RCI no topo), e **sobem de nível** com o tempo. Cada morador é um **cidadão individual**:
tem nome, idade, casa e emprego, sai de casa de manhã, vai pelas estradas até o
trabalho e volta no fim da tarde. Com "Inspecionar" dá para clicar em alguém
andando e seguir com a câmera.

## Prédios e níveis

| Nível | Residencial | Comercial | Industrial |
| --- | --- | --- | --- |
| 1 | Casa (4 moradores) | Loja (5 vagas) | Fábrica (10 vagas) |
| 2 | Sobrado (8) | Mercado (12) | Indústria (18) |
| 3 | Prédio de apartamentos (16) | Escritórios (30) | Complexo industrial (30) |
| Grande 2×2 | Condomínio (48) | Shopping (80) | Galpão logístico (70) |

- Um prédio 1×1 sobe um nível quando está **lotado**, o **valor do terreno** é
  suficiente (residencial 45% / 62%, comercial 45% / 60%; indústria não exige) e
  a demanda da zona não está negativa. Entre um nível e outro passam pelo menos
  3 dias. Os moradores e funcionários continuam no prédio.
- Prédios grandes nascem em lotes vazios 2×2 da mesma zona, com valor do terreno
  de nível 2, depois que a cidade passa de 300 habitantes.
- O **valor do terreno** sobe com água e floresta por perto, comércio e movimento,
  e cai com a **poluição** das indústrias. É recalculado a cada hora de jogo.
- O painel "Inspecionar" mostra o nível, o valor do terreno, a poluição e o que
  falta para o prédio subir.
- Tipos, capacidades, exigências e aparência ficam em `src/world/catalog.js`; o
  desenho de cada estilo em `src/render/buildings.js`.

## Noite e luzes

Entre 17h30 e 6h30 a cidade escurece e as janelas acendem e apagam sozinhas
(`src/render/lights.js`). Cada janela tem seu próprio horário, sorteado de forma
fixa pelo id do prédio, então nada pisca:

| Tipo | Acende | Apaga |
| --- | --- | --- |
| Residências | 17h30 a 20h; parte também acende cedo, antes do trabalho (5h30 a 7h) | 22h a 1h30 (alguns ficam acordados até 2h a 4h) |
| Comércio | 17h a 18h30 | 20h a 23h (alguns escritórios até de madrugada) |
| Indústria | turno da noite, cerca de 30% das janelas | 6h |

Nas residências, a fração de janelas acesas acompanha quantos moradores estão em
casa: casa vazia fica apagada. As luzes ficam numa camada própria, redesenhada a
cada 15 minutos de jogo, em que cada prédio esconde as luzes dos que estão atrás.
À noite os cidadãos andando aparecem por cima da escuridão, como faróis.

## Como a simulação funciona

- **Tempo**: 1 tick = 1 minuto de jogo. O estado guarda só o número do tick; data
  e hora são derivadas (`src/core/time.js`). Velocidades: 20, 60 e 180 ticks/s.
- **Determinismo**: toda aleatoriedade vem de um gerador com semente cujo estado
  fica dentro do save. Mesma semente + mesmas ações = mesma cidade, e carregar um
  save continua exatamente do mesmo ponto (há teste para isso).
- **Estado × runtime**: `state` (o que é salvo) só tem dados simples. Índices para
  consultas rápidas (prédio por tile, moradores, redes de estrada, cache de rotas…)
  ficam no `runtime` e são reconstruídos ao carregar (`src/world/runtime.js`).
- **Ações do jogador** passam por `src/world/commands.js`, que valida e cobra.
- **Sistemas** rodam em ordem fixa a cada tick (`src/systems/simulation.js`):
  cidadãos (saídas, rotas, movimento) a cada minuto; demanda, valor do terreno,
  crescimento, imigração e contratação a cada hora; subida de nível uma vez por
  dia; impostos e manutenção a cada mês.
- **Rotas**: A* sobre as estradas, com cache e no máximo 100 cálculos por tick
  (o resto espera na fila, em estado "Saindo…").

Em testes sem interface, uma cidade de ~15 mil cidadãos em 256×256 roda a
~0,2 ms por tick em média e gera um save de ~5,6 MB.

## Sistema de salvamento

| Ação | Onde vai parar |
| --- | --- |
| **Salvar** (`Ctrl+S`) | `saves/<id-da-cidade>.json` |
| **Salvar como…** | um arquivo novo, e a partida passa a usar ele |
| **Automático** (a cada 60 s e ao esconder/fechar a aba) | `saves/auto-<id-da-cidade>.json` — não sobrescreve o save manual |
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
  "version": 2,                 // versão do formato (migrações em src/save/format.js)
  "meta": {                     // dados leves, usados na tela "Carregar"
    "id": "vila-nova-rqlkbx",
    "gameId": "vila-nova-rqlkbx",
    "name": "Vila Nova",
    "autosave": false,
    "gameVersion": "0.2.0",
    "createdAt": "…", "updatedAt": "…",
    "playTimeSeconds": 120,
    "summary": { "population": 985, "buildings": 342, "money": 38635,
                 "date": { "day": 5, "month": 1, "year": 1 }, "mapSize": "256x256" }
  },
  "checksum": "1a2b3c4d",
  "data": { /* estado do jogo */ }
}
```

Dentro de `data`, as camadas do mapa (typed arrays) viram
`{ "$typed": "Uint8Array", "length": 65536, "rle": [qtd, valor, …] }`. O arquivo é
gravado como JSON compacto.

### Mudando o formato

Tudo que está em `state` (`src/world/world.js`) é salvo. Ao mudar a estrutura de
forma incompatível, aumente `SAVE_VERSION` em `src/save/format.js` e adicione em
`MIGRATIONS` a função que converte a versão anterior (a migração 1 → 2 serve de exemplo).

## Estrutura

```
server.js               servidor local: arquivos estáticos + API /api/saves
index.html, styles.css  interface
src/main.js             liga simulação, renderização, controles e salvamento
src/core/               relógio/laço, tempo do jogo, RNG com semente
src/world/              estado (world.js), catálogo de prédios, terreno,
                        índices derivados (runtime.js), ações do jogador
src/agents/             cidadãos (rotina e movimento), pathfinding, nomes
src/systems/            demanda, valor do terreno, crescimento e níveis,
                        economia, ordem dos sistemas
src/render/             projeção isométrica, câmera, renderizador, desenho
                        dos prédios, minimapa
src/ui/                 painel de inspeção
src/save/format.js      formato do save: criar, validar, checksum, migrações, RLE
src/save/backends.js    onde gravar: arquivos (servidor) ou navegador
src/save/SaveManager.js salvar, carregar, automático, exportar/importar
test/                   testes (node --test)
```
