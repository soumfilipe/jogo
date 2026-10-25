# Jogo

[![Testes](https://github.com/soumfilipe/jogo/actions/workflows/testes.yml/badge.svg)](https://github.com/soumfilipe/jogo/actions/workflows/testes.yml)

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
| `R` / `C` / `I` / `F` Zonas | arraste um retângulo de zona residencial, comercial, industrial ou rural ($5 por tile) |
| `X` Densidade (Baixa / Média / Alta) | densidade das zonas residenciais e comerciais; arrastar sobre lotes construídos troca só a densidade |
| `B` Demolir | arraste sobre prédios, estradas, árvores ou zonas |
| `V` Inspecionar | clique num prédio ou num cidadão andando; arraste para mover a câmera |
| Carvão / Bomba / Poço / Instituto… | coloca um prédio público ou estatal (um clique; precisa encostar numa rua). Os que dependem de pesquisa aparecem quando são liberados |
| `O` Orçamento (ou clique no dinheiro) | impostos, receitas e despesas, histórico e empréstimos |
| `T` Pesquisa (ou 🔬 no topo) | verba por área do conhecimento, alvo de cada área e marco do mundo |
| Avenida / Via expressa | como a estrada, mas mais rápidas e com mais capacidade (depois da pesquisa *Via expressa*); sobre uma rua, melhoram ela pagando só a diferença |
| `L` / `P` / `N` / `H` / `U` / `G` / `K` / `J` / `M` / `Q` / `Y` Mapas | valor do terreno, poluição (também nos rios), energia, água, escolas, saúde, crime, satisfação, trânsito, alimentos ou lixo sobre o mapa |
| Botão direito/do meio, `WASD`, setas | mover a câmera |
| Roda do mouse | zoom |
| Espaço, `1`, `2`, `3` | pausar e velocidades |
| Minimapa | clique ou arraste para ir até um ponto |

### No celular

Em telas estreitas (ou celular deitado) a interface muda:

- **Barra inferior**: Mover (arrastar a câmera e tocar para inspecionar),
  Construir, Mapas, Orçamento, Pesquisa e Arquivo. O rótulo mostra a ferramenta ou o mapa
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

## Pesquisa e tecnologias

Painel aberto pela tecla `T` ou pelo 🔬 no topo (`src/ui/research.js`; regras em
`src/systems/research.js`, árvore em `src/world/techs.js` e `RESEARCH` no catálogo).
A árvore inteira, com o que cada tecnologia libera e os sistemas que ainda
faltam, está em [`docs/arvore-tecnologica.html`](docs/arvore-tecnologica.html)
(abra pelo servidor: <http://localhost:8080/docs/arvore-tecnologica.html>).

- **218 tecnologias em 11 áreas** do conhecimento (educação, cultura e esporte,
  economia e sociedade, segurança, química, alimentação e logística, engenharia,
  energia, computação, saúde e ciências ambientais).
- **A pesquisa vem de instituições.** Cada **Instituto de pesquisa** lotado
  transforma a verba de cada área (até $10 mil por mês) em pontos, com retorno
  decrescente: 4× a verba rende 2× os pontos. Sem instituto, a verba não rende
  nem é cobrada. Prédios que atuam numa área também pesquisam, 15× mais devagar
  (usinas em energia, bombas e poços em saúde, refinaria em química). O
  **Parque tecnológico** faz os escritórios em volta pesquisarem (P&D privado).
- **Alvo de cada área**: por padrão, os pontos vão para a tecnologia disponível
  mais barata da área; dá para escolher outra no painel. Quando todas as áreas
  do custo têm pontos suficientes, ela é concluída no fechamento do mês e um
  aviso aparece na tela.
- **Marcos do mundo**: o mundo avança sozinho (3 "anos" por ano de jogo) por
  seis marcos, de *Eletricidade e concreto* a *Transição verde e digital*.
  Antes de o mundo chegar a uma tecnologia, a cidade só a consegue como
  pioneira, pagando 3× os pontos. Em **Nova cidade** escolhe-se o marco inicial,
  como o ano no SimCity 2000; o que veio antes já vem pronto.
- **Efeitos**: tecnologias liberam prédios (usina a gás, hidrelétrica, eólica,
  solar, a hidrogênio; refinaria, fábrica de cimento e usina de etanol, que são
  estatais e dão receita), liberam o nível 3 de residências e comércio (código
  de zoneamento) e mudam parâmetros do jogo: manutenção, juros, velocidade dos
  cidadãos, poluição, consumo, impostos, valor do terreno, demanda.
- Nesta versão, 140 tecnologias podem ser pesquisadas (etapas 0, 1 e 2). As
  outras dependem de sistemas que ainda não existem (trânsito, lixo,
  agricultura, turismo, desastres...) e aparecem como "chega numa próxima versão".
- Pesquisadores (do instituto e da universidade) precisam de **curso
  superior**. Quem é formado numa área rende até 50% mais nela, e com a
  tecnologia de pós-graduação, mestres e doutores valem o dobro. A distribuição
  dos cursos da universidade fica no painel Pesquisa.

## Saúde, segurança, satisfação e leis

Regras em `src/systems/services.js`, `wellbeing.js`, `fire.js` e `policies.js`;
números em `WELLBEING` e `FIRE` no catálogo.

- **Serviços com raio** (menu Construir): hospital, clínica de bairro, posto de
  vacinação, delegacia, guarda municipal, central de câmeras, quartel de
  bombeiros, e lazer (praça, cinema, ginásio, centro de atenção psicossocial).
  A cobertura cai do centro até a borda do raio, e o prédio só atende com
  funcionários.
- **Bem-estar de cada casa**, uma vez por dia:
  - *saúde*: hospitais e clínicas por perto, menos a poluição; muda a chance de
    morrer dos moradores (e das crianças pequenas, com a vacinação);
  - *crime*: desemprego, insatisfação e densidade, menos a polícia;
  - *satisfação*: saúde, segurança, lazer, escola, poluição, desemprego e
    imposto residencial. A média aparece no topo (🙂) e puxa a demanda
    residencial; casas abaixo de 25% perdem famílias.
- **Incêndios**: cada prédio pode pegar fogo; com bombeiros no raio, a chance
  de apagar é a cobertura. Sem apagar, vira ruína e o fogo pode passar aos
  vizinhos.
- **Epidemias**: numa cidade grande com a saúde média baixa, podem começar e
  durar dois meses, com mais mortes onde a saúde é pior.
- **Leis e políticas** (painel do orçamento): 27 leis liberadas pela pesquisa,
  como o código contra incêndio, a merenda escolar, a saúde da família e o
  orçamento participativo. Cada uma tem custo mensal (fixo, por morador, por
  aluno...) e efeitos enquanto está ativa.

## Agricultura e alimentos

Regras em `src/systems/food.js`; números em `FOOD` no catálogo.

- **Zona rural** (`F`): sítios, fazendas e, com a pesquisa, fazendas mecanizadas
  e agroindústrias (2x2). Crescem enquanto a cidade importa comida (a quarta
  barrinha da demanda, marrom), não precisam de energia nem de água e pagam o
  imposto rural. O trator libera o nível 2 e a Revolução Verde, o nível 3.
- **Balanço do mês**: cada morador consome 1 unidade (mais 30% de perda, que a
  cadeia do frio reduz). O que as fazendas não dão conta é importado (despesa
  *Alimentos importados*, mais barata com o Ceasa); a sobra é exportada.
  Adubo, defensivos, eletrificação rural e Revolução Verde multiplicam a
  produção, mas adubo e defensivos fazem as fazendas poluírem. Fazenda em areia
  produz metade até a agricultura tropical.
- **Acesso**: a comida chega às casas pelo mercado municipal, pelo restaurante
  popular e pelo comércio de nível 2 (o mercado do bairro; o supermercado
  aumenta o raio). Casa sem mercado no raio perde saúde e satisfação; o mapa
  *Alimentos* (`Q`) mostra quem está bem servido.

## Lixo e esgoto

Regras em `src/systems/waste.js` e `sanitation.js`; números em `WASTE` e
`SANITATION` no catálogo.

- **Lixo**: cada morador e cada vaga geram lixo por dia. O lixão (desde o
  começo) e o aterro sanitário (pesquisa) recolhem o lixo dos prédios no raio
  até encher; o inspetor mostra quanto já está ocupado. O lixão polui em volta;
  o aterro quase nada e, com o biogás, ainda gera energia. Prédio sem coleta
  polui um pouco e a casa perde saúde e satisfação (mapa *Lixo*, `Y`).
  Centro de reciclagem, coleta seletiva (lei) e reciclagem de entulho diminuem
  o lixo; plásticos aumentam.
- **Esgoto**: o consumo de água vira esgoto. A estação de tratamento (pesquisa)
  trata até a capacidade dela; o resto polui os rios (aparece no mapa de
  poluição e tira o valor da paisagem). Quem bebe água de bomba d'água em rio
  poluído adoece; poço e água importada não. Com o tratamento avançado, a
  estação também produz água. O painel do orçamento mostra quanto do esgoto é
  tratado.

## Trânsito, transporte público e carga

Regras em `src/systems/traffic.js`, `transit.js` e `logistics.js`; números em
`ROAD_TYPES` e `TRAFFIC` no catálogo.

- **Tipos de via**: rua, avenida (40% mais rápida, o dobro da capacidade) e via
  expressa (2× mais rápida, ~3× a capacidade, mas barulhenta: tira valor do
  terreno em volta). As rotas preferem as vias mais rápidas.
- **Engarrafamento**: a cada tick, os carros em cada tile de rua são contados;
  acima da capacidade do tipo de via, todos ali andam mais devagar. Semáforos,
  engenharia de tráfego e smartphone aliviam. O mapa *Trânsito* (`M`) mostra as
  ruas livres (verde) e paradas (vermelho), e os carros parados poluem.
- **Transporte público** (grupo Transporte do menu Construir): ponto de ônibus,
  estações de BRT, VLT e metrô. Quem mora **e** trabalha no raio de estações do
  mesmo modo vai nele (o mais rápido disponível) e paga passagem, que entra na
  receita do mês (linha *Passagens* no orçamento). O ônibus ainda pega trânsito,
  mas ocupa pouco a rua; BRT e VLT têm faixa própria; o metrô anda por baixo e
  não aparece.
- **Carga** (grupo Carga): a indústria precisa de um terminal ao alcance pela
  rua (pátio ferroviário, porto, centro de distribuição); sem ele, arrecada 20%
  menos. O caminhão de carga multiplica o alcance; o porto (na água) soma 10%;
  o centro de distribuição abastece o comércio em volta (+5%).
- Tudo é derivado das posições e dos prédios: salvar no meio do rush e carregar
  dá o mesmo resultado.

## Famílias, escolas e escolaridade

Regras em `src/systems/demography.js` e `src/systems/education.js`, números em
`DEMOGRAPHY` e `EDUCATION` no catálogo.

- **Famílias**: quem chega vem com um ou dois adultos e, se couber na casa, até
  dois filhos (umas 3 crianças a cada 10 pessoas). Crianças moram com a família,
  não trabalham e ocupam vaga na casa. A escolaridade dos adultos que chegam
  depende do marco do mundo (no primeiro, 5% têm curso superior).
- **Aniversários**: cada cidadão faz aniversário num mês do ano. Nele, envelhece,
  soma um ano de curso se estuda, pode ter um filho (adultos de 20 a 40 anos,
  se a casa tem vaga) e pode morrer (a chance cresce depois dos 60). Aos 65 se
  aposenta.
- **Escolas** (menu Construir): cada uma tem vagas e atende casas num raio.
  | Prédio | Etapa | Idade | Anos | Forma em |
  | --- | --- | --- | --- | --- |
  | Creche | creche | 0 a 5 | — | começa o fundamental 1 ano adiantado |
  | Escola primária | fundamental | 6 a 14 | 9 | Fundamental |
  | Escola de ensino médio | médio | 15 a 19 | 3 | Médio |
  | Escola técnica / Centro de aprendizagem | técnico (noturno) | 15 a 45 | 2 | Médio |
  | Universidade | graduação e pós | 18 a 30 / 22 a 40 | 4 / 2 | Superior / Pós |

  Fundamental, médio, graduação e pós são em tempo integral: quem estuda não
  trabalha, e um jovem desempregado larga a procura para estudar. A
  **biblioteca** faz os estudantes em volta avançarem 10% mais rápido.
- **Empregos exigem estudo**: escritórios (comércio nível 3) pedem ensino
  médio; mercados e indústria acima do nível 1, fundamental; institutos,
  universidade e biotecnologia, curso superior. Quem estudou mais procura
  primeiro a vaga que aproveita o estudo. O inspetor mostra o estudo exigido
  em cada prédio e a escolaridade de cada cidadão.
- **Mapa de escolas** (`U`): casas com escola primária com vaga no raio (azul),
  com escola lotada (amarelo) e sem escola (vermelho).
- **Arranha-céus e torres**: na densidade alta, o aço estrutural deixa o
  comércio crescer até 25 andares, e a estrutura tubular leva residências e
  comércio a 40.

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
| 3 | Prédio de apartamentos (16) | Escritórios (32) | Complexo industrial (30) |
| Grande 2×2 | Condomínio (48) | Shopping (80) | Galpão logístico (70) |

- Um prédio 1×1 sobe um nível quando está **lotado**, o **valor do terreno** é
  suficiente (residencial 45% / 62%, comercial 45% / 60%; indústria não exige),
  a demanda da zona não está negativa e o nível já foi liberado pela pesquisa
  (o nível 2 vem com o concreto armado, no começo; o nível 3 e os prédios
  grandes, com o **código de zoneamento**). Entre um nível e outro passam pelo menos
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

### Andares: 1 cidadão = 1 pessoa

A altura de um prédio sai da capacidade dele: cada tipo diz quantas pessoas
cabem num andar (`perFloor` no catálogo) e o prédio tem só os andares
necessários (`floorsOf`). Cada fileira de janelas é um andar.

| Tipo | Por andar | Andares |
| --- | --- | --- |
| Casa / Sobrado | 4 | 1 / 2 |
| Prédio de apartamentos | 4 | 4 a 12 |
| Condomínio (2×2) | 8 | 6 a 12 |
| Loja / Mercado | 5 / 6 | 1 / 2 |
| Escritórios | 8 | 4 a 12 |
| Shopping (2×2) | 40 | 2 |
| Fábrica / Indústria / Galpão | 10 / 18 / 70 | 1 (pé-direito alto) |
| Complexo industrial | 15 | 2 |

As formas repartem os andares entre as partes (a base de um escalonado fica
com a maioria; uma lâmina, mais estreita, ganha um andar a mais). Térreos de
loja, pódios e o escritório anexo das fábricas são extras de acabamento.

### Densidade e crescimento andar por andar

Ao zonear residencial ou comercial, o jogador escolhe a **densidade** (`X` ou os
botões Baixa / Média / Alta; fica em `state.map.density`, por tile):

| Densidade | Até onde cresce |
| --- | --- |
| Baixa | nível 2: casas, sobrados, lojas e mercados; sem prédios grandes |
| Média | prédios de até 6 andares |
| Alta | prédios de até 12 andares |

- Apartamentos, condomínios e escritórios (`tall` no catálogo) continuam
  crescendo **um andar por vez** depois de chegar ao nível 3: com o prédio
  lotado, abastecido, demanda na zona e o **valor do terreno** exigido para o
  andar, que sobe do valor do nível 3 até 90% no 12º andar. Cada andar soma
  `perFloor` moradores ou vagas (`capacityOf`) e mais consumo de energia e água.
- Arrastar a zona sobre lotes construídos troca só a densidade (custa o mesmo
  que zonear). Um prédio acima do limite novo fica como está, só não cresce
  mais. A indústria não usa densidade.
- O lote vazio fica mais forte quanto maior a densidade, e o inspetor mostra
  andares, densidade e o que falta para o próximo andar.
- Saves do formato 6 abrem com tudo em densidade média, que é como
  as zonas funcionavam antes.

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

## Empresas

Quem emprega no comércio e na indústria são **empresas** (`src/systems/companies.js`,
setores em `SECTORS` no catálogo). Cada uma aluga andares inteiros de um prédio, e
cada andar alugado dá `perFloor` vagas:

- **Lojas, mercados e shopping**: uma empresa de varejo por andar (padaria,
  mercadinho, farmácia, restaurante, bar, loja de roupas).
- **Escritórios**: empresas de 1 a 3 andares (contabilidade, advocacia,
  tecnologia, clínica, central de atendimento); o térreo às vezes é comércio.
- **Indústria**: uma empresa só no prédio inteiro (metalúrgica, alimentos,
  têxtil, logística, química), que ocupa os andares novos quando o prédio cresce.

Prédio novo nasce alugado. Andar **vago** (o prédio cresceu ou uma empresa
fechou) não tem vagas, não entra na demanda e recebe uma empresa nova quando a
zona tem demanda, antes de surgirem prédios novos. Uma empresa com menos da
metade dos funcionários por 20 dias seguidos (depois de 7 dias para contratar)
**fecha** e demite todo mundo. Prédio com andar vago não cresce até alugá-lo.

O inspetor do prédio lista as empresas por andar (com vagas preenchidas) e os
andares vagos; o do cidadão mostra onde ele trabalha. À noite, prédios
comerciais acendem na proporção de quem trabalha lá.

## Turnos de trabalho

Cada funcionário de empresa tem o turno sorteado pelas frações do **setor** dela
(padaria começa de madrugada, bar trabalha à tarde e à noite, escritório é quase
todo diurno). Nos serviços públicos, valem as frações de `SHIFTS` no catálogo:

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

Cada cidadão em viagem aparece como um carrinho com cor própria (quem vai de
ônibus, BRT ou VLT, num veículo maior na cor da linha), alinhado à rua
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
- **Redesenho parcial**: a simulação marca os trechos que mudaram (`touchMap`:
  prédio novo, demolido, que subiu de nível, abandonado ou que ganhou/perdeu
  energia ou água) e só esses retângulos do cache são redesenhados (~2 ms, em
  vez de 60–100 ms do mapa inteiro numa cidade de 10 mil habitantes). Ações do
  jogador e mudanças nas ruas redesenham tudo.
- As luzes das janelas são refeitas a cada 15 minutos de jogo, no máximo a cada
  0,3 s de tempo real, reaproveitando a geometria dos prédios do último desenho
  e os horários das janelas (sorteados uma vez por prédio).
- Para esconder carros atrás dos prédios, só são recortados os prédios que
  encostam num carro que está atrás deles (busca numa grade da tela).
- Caminhos com muitos contornos não usam `closePath` (o `fill` fecha sozinho):
  no Chromium isso deixava o redesenho de mapas grandes até 30 vezes mais lento.
- No console do navegador, `jogo.state`, `jogo.rt`, `jogo.cam`, `jogo.renderer`,
  `jogo.advance(ticks)` e `jogo.applyCommand(cmd)` ajudam a depurar.
  `jogo.loop` (ms de simulação e de desenho no último quadro) e
  `jogo.renderer.stats` (ms de cada camada) servem para medir desempenho.

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
  de mata cresce uns 15% por ano. Só o trecho em volta do tile que cresceu é
  redesenhado.
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
isso e salva no **IndexedDB** do navegador (é o caso do GitHub Pages):
- cabe cidades grandes (centenas de MB, conforme o espaço livre do aparelho);
- a lista de saves lê só os metadados, sem carregar as cidades inteiras;
- o jogo pede armazenamento persistente para o navegador não apagar os saves;
- saves de versões antigas, que ficavam no `localStorage` (limite de ~5 MB),
  são copiados para o IndexedDB na primeira abertura e apagados de lá.

O `localStorage` só é usado se o IndexedDB não abrir (ex.: modo privado de alguns
navegadores). Exportar/importar arquivo funciona em todos os casos.
(Abrir o `index.html` direto com duplo clique não funciona: o navegador bloqueia
módulos JavaScript em `file://`.)

### Formato do arquivo

```jsonc
{
  "format": "jogo-save",
  "version": 11,                // versão do formato (migrações em src/save/format.js)
  "meta": {                     // dados leves, usados na tela "Carregar"
    "id": "vila-nova-rqlkbx",
    "gameId": "vila-nova-rqlkbx",
    "name": "Vila Nova",
    "autosave": false,
    "gameVersion": "0.6.0",
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
`{ "$typed": "Uint8Array", "length": 65536, "rle": [qtd, valor, …] }`.

Prédios, cidadãos e empresas são gravados em colunas (`src/save/table.js`): o nome de
cada campo aparece uma vez só, ids viram diferenças, textos repetidos (turno,
estado) viram um dicionário e as rotas de quem está viajando viram passos, uma
letra por tile (`"19772,urrdd…"`). Uma cidade de 10 mil habitantes no pico da
manhã caiu de 3,6 MB para 0,9 MB. O arquivo é gravado como JSON compacto.

Saves do formato 12 (antes da zona rural) abrem com o imposto rural no padrão.

Saves do formato 11 (antes da etapa 3) abrem sem passagens acumuladas no mês.

Saves do formato 10 (antes da etapa 2) abrem sem leis ativas, sem epidemia e
com a saúde, o crime e a satisfação calculados no primeiro dia.

Saves do formato 9 (antes da escolaridade) abrem com os moradores adultos
recebendo uma escolaridade sorteada pelo marco do mundo; ninguém está estudando.

Saves de antes da pesquisa (formato 8) abrem no primeiro marco, com as
tecnologias iniciais mais as de tudo o que a cidade já tinha (e os requisitos
delas): uma cidade com apartamentos ganha o código de zoneamento, uma com
usina solar ganha a usina solar, e o mundo avança até o marco da mais recente.
Assim nada do que a cidade já podia construir fica bloqueado.

Saves de antes das empresas (formato 7) abrem normalmente: a migração marca o
save, e ao carregar cada prédio comercial e industrial ganha empresas em todos
os andares, com quem já trabalhava lá distribuído entre elas, mantendo emprego,
turno e horários. Nenhum andar fica vago e ninguém perde o emprego.

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
src/systems/            demanda, valor do terreno, energia e água, crescimento e níveis, empresas,
                        economia, ordem dos sistemas
src/render/             projeção isométrica, câmera, renderizador, desenho
                        dos prédios, minimapa
src/ui/                 painel de inspeção e painel de orçamento
src/save/format.js      formato do save: criar, validar, checksum, migrações, RLE
src/save/table.js       prédios, cidadãos e empresas em colunas, rotas como passos
src/save/backends.js    onde gravar: arquivos (servidor), IndexedDB ou localStorage
src/save/SaveManager.js salvar, carregar, automático, exportar/importar
test/                   testes (node --test)
```
