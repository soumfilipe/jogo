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
| Carvão / Solar / Bomba / Poço | coloca um serviço público (um clique; precisa encostar numa rua) |
| `O` Orçamento (ou clique no dinheiro) | impostos, receitas e despesas, histórico e empréstimos |
| `L` / `P` / `N` / `H` Mapas | valor do terreno, poluição, energia ou água sobre o mapa |
| Botão direito/do meio, `WASD`, setas | mover a câmera |
| Roda do mouse | zoom |
| Espaço, `1`, `2`, `3` | pausar e velocidades |
| Minimapa | clique ou arraste para ir até um ponto |

### No celular

Em telas estreitas (ou celular deitado) a interface muda:

- **Barra inferior**: Mover (arrastar a câmera e tocar para inspecionar),
  Construir, Mapas, Orçamento e Arquivo. O rótulo mostra a ferramenta ou o mapa
  escolhido.
- **Painéis que sobem de baixo**, como o teclado do iOS: Construir (ruas, zonas e
  serviços públicos, com preço), Mapas e Arquivo (salvar, carregar, exportar,
  importar, código de save, nova cidade). Fecham ao tocar fora ou ao deslizar
  para baixo. Orçamento, inspetor e a lista de saves também abrem de baixo (com o
  celular deitado, orçamento e inspetor abrem ao lado).
- **Gestos**: um dedo arrasta a câmera (Mover) ou desenha com a ferramenta
  escolhida; dois dedos movem e dão zoom (pinça) a qualquer momento, sem
  construir nada.

Prédios surgem sozinhos nas zonas que ficam a até 2 tiles de uma estrada, conforme
a demanda (as três barrinhas RCI no topo), e **sobem de nível** com o tempo. Cada morador é um **cidadão individual**:
tem nome, idade, casa e emprego, sai de casa de manhã, vai pelas estradas até o
trabalho e volta no fim da tarde. Com "Inspecionar" dá para clicar em alguém
andando e seguir com a câmera.

## Orçamento

Painel aberto pela tecla `O` ou clicando no dinheiro no topo
(`src/ui/budget.js`; regras em `src/systems/economy.js` e `ECONOMY` no catálogo).

- **Impostos por zona**, de 0% a 20% (padrão 9%). Cada ponto acima do padrão tira
  demanda da zona (residencial também afasta moradores novos); abaixo, soma.
- **Receitas** a cada ponto de imposto: $1,20 por morador empregado
  (residencial) e $0,60 por vaga ocupada (comercial e industrial).
- **Despesas**: manutenção das ruas ($2 por tile por mês), dos serviços
  públicos e parcelas de empréstimos.
- **Empréstimos** de $25 mil, $50 mil ou $100 mil, com juros de 10% ao ano em 24
  parcelas fixas; até 3 ao mesmo tempo, e dá para quitar antes.
- O painel mostra a previsão do mês e um gráfico de receita e despesa dos últimos
  24 meses (com dica ao passar o mouse e a mesma informação em tabela); o
  histórico de 36 meses fica no save.

## Energia e água

Como no Cities: Skylines, **as ruas distribuem energia e água**: cada rede de ruas
conectadas é uma rede de abastecimento, e usinas, bombas e poços abastecem a rede
da rua em que estão encostados (`src/systems/utilities.js`).

| Serviço | Produz | Custo | Manutenção | Observação |
| --- | --- | --- | --- | --- |
| Usina a carvão (2×2) | 3.000 de energia | $12.000 | $400/mês | polui bastante |
| Usina solar (2×2) | 1.200 de energia | $20.000 | $150/mês | limpa |
| Bomba d'água | 2.500 de água | $6.000 | $200/mês | precisa encostar em rio ou lago |
| Poço artesiano | 700 de água | $3.500 | $90/mês | funciona em qualquer lugar |

- Cada prédio consome por morador ou vaga: residencial 1 de energia e 1,2 de
  água; comercial 1,5 e 0,6; industrial 2,2 e 1,4 (`CONSUMPTION` no catálogo).
- Se a produção não dá para todos, ficam sem primeiro os prédios mais longe das
  fontes (pelo caminho das ruas).
- **Sem energia ou água**, um prédio não cresce nem sobe de nível; a cada dia
  perde 25% dos moradores ou funcionários; vazio por 3 dias fica **abandonado**
  (escuro, sem luzes) e, abandonado por 15 dias, **desaba** (a zona continua).
- Lotes novos só crescem se a rede tem energia e água sobrando para eles.
- Ícones sobre os prédios mostram o que falta (raio = energia, gota = água); o
  topo da tela mostra consumo / produção.
- Saves de antes dos serviços públicos recebem energia e água **importadas** da
  região; a importação de cada recurso acaba quando o jogador constrói a primeira
  usina (ou bomba/poço) própria.

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
- Tipos, capacidades e exigências ficam em `src/world/catalog.js`.

### Aparência: 20 projetos por tipo

Cada tipo (zona + nível + tamanho) tem **20 projetos diferentes**, gerados em
`src/render/designs.js` combinando forma (bloco, escalonado, pódio com torre,
torres gêmeas, lâmina, anexos), telhado (quatro águas, duas águas, plano, dente
de serra), fachada (grade de janelas, faixas de vidro, vitrine, sacadas),
detalhes (caixa d'água, ar-condicionado, painel solar, jardim, heliponto, antena,
chaminés, silos, portas de carga, letreiro, toldo, estacionamento) e cores. Cada
prédio usa um dos 20, sorteado pelo id — sempre o mesmo, e nada disso vai para
o save. `src/render/buildings.js` desenha as partes de cada projeto.

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

## Turnos de trabalho

Cada contratação sorteia um turno (`SHIFTS` em `src/world/catalog.js`):

| Turno | Parcela | Sai de casa | Volta |
| --- | --- | --- | --- |
| Diurno | 80% | 6h30 a 8h30 | 16h30 a 18h30 |
| Noturno | 7% | 21h a 23h | 6h a 7h30 (do dia seguinte) |
| Madrugada | 3% | 0h a 4h30 | 8 a 9 horas depois de sair |
| Meio período, manhã | 5% | 7h a 9h | 12h a 13h30 |
| Meio período, tarde | 5% | 12h30 a 14h | 17h30 a 19h30 |

Assim há carros na rua também no horário de almoço, à noite e de madrugada. O turno aparece
no painel do cidadão.

## Ambiente

Efeitos só visuais (nada vai para o save), animados em tempo real mesmo com o
jogo pausado:

- **Smog** (`src/render/smog.js`): névoa marrom sobre as áreas poluídas, em duas
  camadas de alturas diferentes que derivam devagar em sentidos opostos. Segue o
  mapa de poluição e escurece à noite.
- **Florestas** (`src/render/nature.js`): a densidade da mata varia pelo mapa
  (de 1 a 6 árvores por tile, com clareiras e trechos fechados), com pinheiros,
  árvores de copa redonda (algumas em tons de outono) e arbustos. Há árvores
  soltas na borda da mata e, raramente, no campo aberto. A densidade fica no
  save (`map.forest`), porque as matas crescem (ver abaixo).
- **Água**: mais clara perto da margem e mais escura no fundo, espuma na beira,
  faixas de onda que clareiam em sequência e brilhos que piscam.

Ondas, brilhos e smog ficam numa camada de meia resolução refeita a cada 80 ms;
entre uma e outra, a imagem pronta é reaproveitada.

## Cidadãos nas ruas

Cada cidadão em viagem aparece como um carrinho com cor própria, alinhado à rua
e andando pela **mão direita** (`src/render/movers.js`; é só desenho, a posição
simulada continua no meio da rua). Os carros ficam numa camada desenhada de trás
para frente em que os prédios recortam o que está atrás deles, então não
aparecem por cima das construções. Quem está saindo de casa ou chegando ao
trabalho, ainda dentro do lote, não aparece.

## Desempenho da renderização

- O mapa (chão, ruas, prédios) é desenhado num cache um pouco maior que a tela.
  Ao arrastar, a imagem pronta é só deslocada; no zoom, é escalada e redesenhada
  quando a roda para.
- Mudanças feitas pelo jogador aparecem na hora; as da simulação (prédios
  crescendo) são redesenhadas no máximo a cada 0,4 s.
- As luzes das janelas são refeitas a cada 15 minutos de jogo, no máximo a cada
  0,3 s de tempo real.
- Para esconder carros atrás dos prédios, só são recortados os prédios que
  encostam num carro que está atrás deles (busca numa grade da tela).
- Caminhos com muitos contornos não usam `closePath` (o `fill` fecha sozinho):
  no Chromium isso deixava o redesenho de mapas grandes até 30 vezes mais lento.
- No console do navegador, `jogo.state`, `jogo.rt`, `jogo.cam`, `jogo.renderer`,
  `jogo.advance(ticks)` e `jogo.applyCommand(cmd)` ajudam a depurar.

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
  energia e água, crescimento, imigração e contratação a cada hora; efeitos da
  falta de energia/água e subida de nível uma vez por dia; orçamento
  (impostos, manutenção, parcelas) a cada mês.
- **Florestas crescem** (`src/systems/forest.js`, `FOREST` no catálogo): a cada
  tick, com 5% de chance, até 5 tiles sorteados crescem. Mata fica mais densa
  (até 6 árvores) e grama encostada numa mata com 3 ou mais árvores vira mata
  nova. Só em tiles verdes sem estrada, zona ou prédio; num mapa 256×256 a área
  de mata cresce uns 15% por ano. O mapa é redesenhado no máximo uma vez por
  hora de jogo por causa disso.
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
  "version": 5,                 // versão do formato (migrações em src/save/format.js)
  "meta": {                     // dados leves, usados na tela "Carregar"
    "id": "vila-nova-rqlkbx",
    "gameId": "vila-nova-rqlkbx",
    "name": "Vila Nova",
    "autosave": false,
    "gameVersion": "0.5.0",
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
src/systems/            demanda, valor do terreno, energia e água, crescimento e níveis,
                        economia, ordem dos sistemas
src/render/             projeção isométrica, câmera, renderizador, desenho
                        dos prédios, minimapa
src/ui/                 painel de inspeção e painel de orçamento
src/save/format.js      formato do save: criar, validar, checksum, migrações, RLE
src/save/backends.js    onde gravar: arquivos (servidor) ou navegador
src/save/SaveManager.js salvar, carregar, automático, exportar/importar
test/                   testes (node --test)
```
