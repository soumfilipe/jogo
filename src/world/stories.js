// Textos das notícias, como dados (ver systems/news.js).
//
// Cada pauta tem manchetes (h) e frases (s): uma lista de alternativas para
// cada frase do texto, na ordem. A notícia sorteia uma manchete e uma
// alternativa de cada frase; a última lista é opcional (s4), para o texto ter
// três ou quatro frases. As chaves entre {} vêm da notícia:
//
//   sempre: {cidade}, {regiao}, {pessoa}, {pessoa2} (moradores de verdade, com
//           {idade} e {idade2}), {empresa}, {ano}, {mes}
//   por pauta: {pct}, {n}, {valor}, {tech}, {nota}, {efeito}, {artista}...
//
// Fofocas, boatos e curiosidades não dependem da cidade e podem sair a
// qualquer hora; boatos têm `claim`, o que a checagem desmente depois.
// Sobre pessoas, os textos não usam gênero (os nomes não dizem o de ninguém).

export const STORIES = {
  // ---------------------------------------------------------------------------
  // Problemas da cidade (alertas)
  // ---------------------------------------------------------------------------
  energia: {
    h: ['Apagão deixa {pct} da cidade sem luz', 'Falta de energia atinge {n} prédios em {cidade}', 'Cidade às escuras: geração não dá conta do consumo'],
    s: [
      ['Moradores e comerciantes de {cidade} enfrentam cortes de energia que já atingem {n} prédios, cerca de {pct} do total.', 'A rede elétrica de {cidade} não está dando conta do consumo, e {n} prédios estão sem luz.'],
      ['Sem energia, famílias começam a deixar as casas e lojas fecham mais cedo, segundo a reportagem.', 'Na {regiao}, comerciantes relatam prejuízo com mercadorias perdidas e clientes que não voltam.'],
      ['Técnicos ouvidos pela reportagem dizem que a solução passa por novas usinas ligadas à rede de ruas.', 'Especialistas lembram que prédios sem energia por vários dias acabam abandonados.'],
      ['{pessoa}, que mora na {regiao}, resume: "Já comprei vela três vezes este mês".', 'A prefeitura não respondeu até o fechamento desta edição.'],
    ],
  },
  agua: {
    h: ['Torneiras secas: {n} prédios sem água em {cidade}', 'Falta d\'água atinge {pct} da cidade', 'Crise hídrica: abastecimento não acompanha o crescimento'],
    s: [
      ['A falta de água já chega a {n} prédios de {cidade}, cerca de {pct} do total.', 'Moradores de {cidade} acordaram mais uma vez sem água nas torneiras, em {n} prédios.'],
      ['Na {regiao}, filas se formam em volta de caminhões-pipa e de vizinhos que ainda têm caixa d\'água cheia.', 'Comerciantes reclamam que restaurantes e padarias não conseguem trabalhar.'],
      ['Engenheiros sugerem novas bombas d\'água à beira dos rios ou poços artesianos onde não há rio por perto.', 'Sem água, prédios esvaziam em poucos dias e podem ficar abandonados, alertam técnicos.'],
      ['"Lavei a louça com água mineral", conta {pessoa}, de {idade} anos.'],
    ],
  },
  desemprego: {
    h: ['Desemprego chega a {pct} em {cidade}', 'Falta trabalho: {n} pessoas procuram emprego', 'Filas de emprego dobram o quarteirão'],
    s: [
      ['A taxa de desemprego em {cidade} chegou a {pct}, com {n} pessoas procurando trabalho.', 'São {n} moradores de {cidade} sem emprego, o equivalente a {pct} de quem pode trabalhar.'],
      ['Na {regiao}, a fila por uma vaga de balconista começou antes do amanhecer.', '{pessoa}, de {idade} anos, conta que já deixou o currículo em todas as lojas do bairro.'],
      ['Economistas apontam que faltam zonas comerciais e industriais para tanta gente morando na cidade.', 'Analistas lembram que o desemprego costuma trazer mais crime e menos satisfação.'],
      ['Associações comerciais pedem impostos menores para abrir mais vagas.'],
    ],
  },
  crime: {
    h: ['Onda de assaltos assusta moradores', 'Violência em alta: crime atinge {pct} na {regiao}', 'Insegurança vira o assunto das ruas de {cidade}'],
    s: [
      ['O índice de criminalidade de {cidade} chegou a {pct}, o mais alto em meses.', 'Moradores de {cidade} relatam assaltos, furtos de carro e arrombamentos, principalmente na {regiao}.'],
      ['{pessoa} teve a bicicleta levada em frente de casa e diz que não sai mais à noite.', 'Comerciantes da {regiao} instalaram grades e passaram a fechar mais cedo.'],
      ['Especialistas em segurança apontam a falta de delegacias e o desemprego como causas principais.', 'Segundo estudiosos, bairros densos e insatisfeitos são os mais afetados.'],
      ['A polícia promete reforçar o patrulhamento nas próximas semanas.'],
    ],
  },
  saude: {
    h: ['Saúde pública em crise: índice cai para {pct}', 'Hospitais lotados e postos vazios de médicos', 'Moradores adoecem mais em {cidade}'],
    s: [
      ['O índice de saúde da população de {cidade} caiu para {pct}, segundo levantamento da reportagem.', 'Prontos-socorros de {cidade} estão lotados e há bairros sem nenhum atendimento por perto.'],
      ['Na {regiao}, {pessoa} conta que esperou o dia inteiro por uma consulta.', 'Médicos relatam aumento de doenças respiratórias perto das indústrias.'],
      ['Sanitaristas apontam falta de hospitais e clínicas, além da poluição e do lixo sem coleta.', 'Uma cidade com a saúde baixa corre risco de epidemias, alertam especialistas.'],
      ['A prefeitura diz que estuda abrir novas clínicas de bairro.'],
    ],
  },
  transito: {
    h: ['Trânsito para no horário de pico', 'Engarrafamento recorde: {pct} das ruas paradas às 8h', 'Motoristas perdem a paciência no rush'],
    s: [
      ['Às 8h, {pct} das ruas de {cidade} estavam acima da capacidade, segundo contagem da reportagem.', 'Quem precisou atravessar {cidade} de manhã enfrentou filas de carros quase paradas.'],
      ['{pessoa} diz que leva mais tempo para chegar ao trabalho do que passa no almoço.', 'Na {regiao}, os cruzamentos viraram estacionamento no horário de pico.'],
      ['Urbanistas defendem avenidas, transporte público e semáforos para desafogar as ruas.', 'Carros parados também poluem, lembram ambientalistas.'],
      ['"Eu ia de bicicleta, mas a ciclovia não existe", reclama {pessoa2}.'],
    ],
  },
  lixo: {
    h: ['Lixo se acumula nas calçadas de {cidade}', 'Sem coleta: {n} prédios convivem com o lixo', 'Mau cheiro toma conta da {regiao}'],
    s: [
      ['A coleta de lixo não chega a {n} prédios de {cidade}, e os sacos se acumulam nas calçadas.', 'Moradores da {regiao} reclamam do cheiro e dos ratos que apareceram com o lixo acumulado.'],
      ['{pessoa} conta que guarda o lixo na área de serviço há duas semanas.', 'Comerciantes dizem que os clientes evitam as ruas mais sujas.'],
      ['Técnicos afirmam que faltam lixões ou aterros com espaço livre perto dos bairros.', 'Lixo sem coleta polui e derruba a saúde e a satisfação, segundo sanitaristas.'],
    ],
  },
  esgoto: {
    h: ['Esgoto sem tratamento chega aos rios', 'Rio vira esgoto a céu aberto', '{pct} do esgoto de {cidade} vai direto para a água'],
    s: [
      ['Cerca de {pct} do esgoto de {cidade} chega aos rios sem nenhum tratamento.', 'Pescadores da {regiao} dizem que o rio mudou de cor e de cheiro nos últimos meses.'],
      ['Quem bebe água bombeada desse rio corre risco de adoecer, alertam médicos.', 'Biólogos encontraram peixes mortos perto das saídas de esgoto.'],
      ['Ambientalistas cobram estações de tratamento de esgoto.', 'Poços artesianos não são afetados, lembram os técnicos.'],
    ],
  },
  abandono: {
    h: ['{n} prédios abandonados viram problema', 'Cidade fantasma? Abandono cresce na {regiao}', 'Prédios vazios preocupam vizinhos'],
    s: [
      ['{cidade} já tem {n} prédios abandonados, a maioria sem energia, sem água ou queimada.', 'Janelas quebradas e portas fechadas se espalham pela {regiao}.'],
      ['Vizinhos temem invasões e dizem que o valor dos imóveis caiu.', '{pessoa} conta que metade dos vizinhos já se mudou.'],
      ['Prédios abandonados acabam desabando, lembra a defesa civil.'],
    ],
  },
  creche: {
    h: ['Falta vaga em creche, e pais pagam o preço', '{n} famílias sem creche para os filhos pequenos', 'Pais exaustos: sem creche, rendimento no trabalho despenca'],
    s: [
      ['São {n} pais e mães que trabalham em {cidade} e não têm onde deixar os filhos pequenos.', 'A procura por creches em {cidade} é bem maior que as vagas.'],
      ['{pessoa} leva o filho para o trabalho dois dias por semana e já recebeu advertência do chefe.', 'Empresários reclamam que funcionários sem creche rendem muito menos.'],
      ['O estresse acumulado derruba a saúde e a satisfação das famílias, segundo psicólogos.', 'Pedagogos defendem creches perto das casas, onde as famílias moram.'],
    ],
  },
  satisfacao: {
    h: ['Pesquisa: só {pct} dos moradores estão satisfeitos', 'Moradores insatisfeitos pensam em deixar {cidade}', 'Mau humor geral em {cidade}'],
    s: [
      ['Uma pesquisa feita pela reportagem mostra que a satisfação média em {cidade} caiu para {pct}.', 'Os moradores de {cidade} nunca estiveram tão insatisfeitos com a vida na cidade.'],
      ['A principal queixa é {queixa}.', 'Entre as reclamações, a mais citada foi {queixa}.'],
      ['Casas muito insatisfeitas perdem famílias, que se mudam para outras cidades.', 'Corretores já falam em imóveis encalhados.'],
      ['"Gosto daqui, mas está difícil", diz {pessoa}, de {idade} anos.'],
    ],
  },
  epidemia: {
    h: ['Epidemia se espalha por {cidade}', 'Surto de doença lota hospitais', 'Autoridades confirmam epidemia'],
    s: [
      ['Uma epidemia foi confirmada em {cidade}, e os hospitais já estão lotados.', 'O número de doentes em {cidade} disparou nas últimas semanas, e as autoridades confirmaram uma epidemia.'],
      ['Os bairros com a pior saúde são os mais atingidos, com mais mortes.', 'Médicos pedem que quem tiver sintomas procure atendimento logo.'],
      ['Especialistas dizem que o surto deve durar alguns meses; hospitais, clínicas e vacinação ajudam a contê-lo.'],
      ['Escolas e igrejas fazem campanhas de higiene.'],
    ],
  },
  deficit: {
    h: ['Contas no vermelho: prefeitura fecha o mês com déficit de {valor}', 'Rombo de {valor} nas contas da cidade', 'Gastos superam receitas pelo mês seguido'],
    s: [
      ['A prefeitura de {cidade} gastou {valor} a mais do que arrecadou no último mês.', 'As contas de {cidade} fecharam o mês com um déficit de {valor}.'],
      ['Em caixa, restam {caixa}.', 'O saldo da cidade está em {caixa}.'],
      ['Economistas recomendam rever a manutenção dos serviços, os impostos ou a verba de pesquisa.', 'Se nada mudar, a cidade vai precisar de empréstimos, dizem analistas.'],
    ],
  },
  divida: {
    h: ['Cidade quebrada: caixa da prefeitura fica negativo', 'Prefeitura no cheque especial', 'Saldo negativo de {valor} preocupa fornecedores'],
    s: [
      ['O caixa da prefeitura de {cidade} está negativo em {valor}.', 'A prefeitura de {cidade} já deve {valor} e não tem dinheiro em caixa.'],
      ['Fornecedores ameaçam suspender serviços, e obras novas ficam paradas.', 'Sem dinheiro, não dá para construir nada novo.'],
      ['Especialistas sugerem aumentar impostos com cuidado, cortar gastos ou renegociar empréstimos.'],
    ],
  },

  // Fim dos problemas: um texto curto por problema ({o_que}) com o mesmo molde.
  resolvido: {
    h: ['{titulo}', '{titulo}, dizem moradores'],
    s: [
      ['{o_que}', '{o_que}'],
      ['A situação foi acompanhada pela reportagem nas últimas semanas.', 'Moradores ouvidos pela reportagem confirmam a melhora.'],
      ['"Finalmente", resume {pessoa}.', 'Especialistas pedem atenção para que o problema não volte.'],
    ],
  },

  // ---------------------------------------------------------------------------
  // Acontecimentos
  // ---------------------------------------------------------------------------
  incendio: {
    h: ['Incêndio destrói {alvo} na {regiao}', 'Fogo consome {alvo} em {cidade}', 'Chamas deixam {alvo} em ruínas'],
    s: [
      ['Um incêndio atingiu {alvo} na {regiao} de {cidade}.', 'O fogo começou de madrugada e se espalhou rápido na {regiao}.'],
      ['{feridos}'],
      ['{bombeiros}'],
      ['Vizinhos ajudaram com baldes até a situação se acalmar.', '{pessoa}, que mora em frente, diz que acordou com o cheiro de fumaça.'],
    ],
  },
  fechou: {
    h: ['{empresa} fecha as portas', 'Fim da linha para {empresa}', '{empresa} encerra as atividades e demite funcionários'],
    s: [
      ['{empresa}, do setor de {setor}, encerrou as atividades em {cidade}.', 'Depois de meses com a equipe incompleta, {empresa} anunciou o fechamento.'],
      ['Sem conseguir contratar o suficiente, a empresa não conseguiu manter o negócio.', 'A falta de gente qualificada e de trabalhadores foi o motivo apontado pela direção.'],
      ['O andar que a empresa ocupava fica vago e pode receber um negócio novo.', 'Comerciantes vizinhos lamentam: "Era um ponto conhecido".'],
    ],
  },
  veiculo: {
    h: ['Nasce {veiculo}, {tipo} de {cidade}', '{veiculo} estreia em {cidade}', 'Imprensa ganha reforço: chega {veiculo}'],
    s: [
      ['{cidade} ganhou {um_tipo}: {veiculo} começou a funcionar nesta semana.', 'Começa hoje {veiculo}, {um_tipo} com sede em {cidade}.'],
      ['A redação fica na {regiao} e promete cobrir o dia a dia da cidade.', 'A equipe é formada por jornalistas da própria cidade.'],
      ['{marco}'],
      ['"Cidade sem imprensa não sabe de si", diz a direção.'],
    ],
  },
  veiculo_fim: {
    h: ['{veiculo} encerra as atividades', 'Imprensa perde {veiculo}'],
    s: [
      ['{veiculo} deixou de circular em {cidade}.', 'Depois de meses sem equipe suficiente, {veiculo} fechou.'],
      ['Os jornalistas da redação procuram trabalho em outros veículos.', 'Leitores lamentam o fim de uma voz da cidade.'],
      ['Outros veículos devem ocupar o espaço, dizem especialistas em mídia.'],
    ],
  },
  tech_cidade: {
    h: ['{cidade} passa a contar com {tech}', 'Chegou: {tech}', 'Pesquisa da cidade conclui {tech}'],
    s: [
      ['Os pesquisadores de {cidade} concluíram {tech}, e a novidade já está disponível.', 'Depois de meses de trabalho nos institutos, {cidade} domina {tech}.'],
      ['{desc}'],
      ['Na prática, {efeito}', 'O efeito esperado: {efeito}'],
      ['"É um passo importante para a cidade", diz um dos pesquisadores.', 'Empresários já fazem planos com a novidade.'],
    ],
  },
  tech_mundo: {
    h: ['Mundo conhece {tech}', 'Novidade no mundo: {tech}', 'Ciência apresenta {tech}'],
    s: [
      ['A comunidade científica internacional celebra {tech}.', 'Notícias de fora contam que o mundo acaba de conhecer {tech}.'],
      ['{nota}'],
      ['{aqui}'],
      ['Especialistas dizem que a novidade vai mudar a vida nas cidades.', 'Por aqui, empresários e pesquisadores acompanham de perto.'],
    ],
  },
  marco: {
    h: ['Mundo entra numa nova era: {marco}', 'Começa a era de {marco}'],
    s: [
      ['Historiadores já chamam o momento de "{marco}".', 'Uma onda de descobertas inaugura uma nova época no mundo: {marco}.'],
      ['Novas tecnologias aparecem a cada ano e mudam a forma como as cidades crescem.'],
      ['Quem quiser chegar antes do mundo ainda pode pesquisar como pioneiro, pagando mais caro.'],
    ],
  },
  midia: {
    h: ['{titulo}'],
    s: [['{texto}'], ['{texto2}'], ['{texto3}']],
  },
  populacao: {
    h: ['{cidade} chega a {n} habitantes', 'Somos {n}! Cidade bate marca de população', 'Censo: {cidade} passa de {n} moradores'],
    s: [
      ['{cidade} acaba de passar dos {n} habitantes.', 'A população de {cidade} chegou a {n} pessoas, segundo a contagem mais recente.'],
      ['O crescimento traz mais lojas e empregos, mas também mais trânsito e mais lixo.', 'Novas famílias chegam toda semana atrás de casa e trabalho.'],
      ['{pessoa}, que nasceu aqui, lembra do tempo em que todo mundo se conhecia.', 'Urbanistas recomendam planejar a cidade antes que o crescimento cobre a conta.'],
    ],
  },
  superavit: {
    h: ['Contas em dia: cidade fecha o mês com {valor} de sobra', 'Superávit de {valor} anima a prefeitura'],
    s: [
      ['A prefeitura de {cidade} arrecadou {valor} a mais do que gastou no último mês.', 'O caixa da cidade cresceu {valor} no último mês.'],
      ['Com {caixa} em caixa, sobra espaço para investir em serviços públicos.'],
      ['Economistas lembram que dinheiro parado também não constrói nada.', 'Moradores querem ver o dinheiro virar obras.'],
    ],
  },
  carnaval: {
    h: ['Carnaval toma as ruas de {cidade}', 'Folia começa e turistas lotam a cidade', 'É carnaval!'],
    s: [
      ['Começou o carnaval em {cidade}, com desfiles e blocos por toda parte.', 'Os foliões já tomaram as ruas da {regiao} no primeiro dia de carnaval.'],
      ['Hotéis estão lotados e o comércio comemora o movimento.', 'Turistas chegam de fora para ver os desfiles.'],
      ['A festa vai até o dia 14 e deixa a cidade inteira mais feliz.', 'O bloco mais animado deste ano sai da {regiao}.'],
      ['{artista} é a atração mais esperada da festa.'],
    ],
  },
  mega: {
    h: ['Megaevento esportivo começa em {cidade}', 'Os olhos do mundo estão em {cidade}'],
    s: [
      ['Começou o megaevento esportivo que traz delegações e turistas do mundo inteiro a {cidade}.'],
      ['O estádio está pronto, e o metrô vai levar o público até lá.', 'O comércio espera um mês de vendas recordes.'],
      ['Durante julho, o turismo deve multiplicar na cidade.'],
    ],
  },
  futebol: {
    h: ['{time} {resultado_h} no domingo', 'Domingo de futebol: {time} {placar} {rival_curto}', '{time} {resultado_h} {adversario}'],
    s: [
      ['O {time} {resultado} {adversario} por {placar} no jogo de domingo.', 'Diante da torcida, o {time} {resultado} {adversario}: {placar}.'],
      ['{lance}'],
      ['A torcida lotou as arquibancadas e o trânsito ficou complicado na saída.', 'O técnico disse que o time ainda pode melhorar.'],
    ],
  },
  // Clubes da cidade (ver systems/sports.js).
  jogo_vitoria: {
    h: ['{clube} vence {adversario}', 'Vitória do {clube} {onde}', '{modalidade}: {clube} {placar} {adversario}'],
    s: [
      ['O {clube} venceu {adversario} por {placar}, {onde}.', 'Deu {clube}: {placar} sobre {adversario}, {onde}.'],
      ['{torcida}'],
      ['A vitória anima a torcida para a sequência do campeonato.', 'O técnico elogiou a entrega do elenco.'],
    ],
  },
  jogo_derrota: {
    h: ['{clube} perde para {adversario}', 'Derrota do {clube} {onde}', '{modalidade}: {clube} cai diante de {adversario}'],
    s: [
      ['O {clube} perdeu para {adversario} por {placar}, {onde}.', 'Dia ruim para o {clube}: {placar} para {adversario}, {onde}.'],
      ['{torcida}'],
      ['O técnico pediu calma e disse que o time vai reagir.', 'A torcida cobrou mais empenho na saída.'],
    ],
  },
  jogo_empate: {
    h: ['{clube} empata com {adversario}', 'Empate do {clube} {onde}'],
    s: [
      ['O {clube} empatou com {adversario}: {placar}, {onde}.'],
      ['{torcida}'],
      ['O resultado deixou tudo em aberto na tabela.', 'Os dois times saíram de campo reclamando da arbitragem.'],
    ],
  },
  medalha: {
    h: ['{atleta} leva {medalha} {prova}', '{modalidade}: {medalha} para o {clube}', 'Pódio: {clube} em {posicao}º na etapa'],
    s: [
      ['{atleta}, do {clube}, ficou com {a_medalha} {prova} na {etapa}ª etapa do campeonato de {modalidade}, em {sede}.'],
      ['O clube terminou a etapa em {posicao}º lugar.'],
      ['A torcida espera mais medalhas nas próximas etapas.', 'O técnico disse que o treino está dando resultado.'],
    ],
  },
  escolinha: {
    h: ['{clube} abre a categoria {categoria}', 'Escolinha do {clube} recebe a {categoria}'],
    s: [
      ['O {clube} abriu a categoria {categoria} da sua escolinha de {modalidade}.'],
      ['As vagas vão primeiro para as crianças com mais jeito para o esporte.', 'Os treinos são no contraturno da escola.'],
      ['A diretoria aposta na base para formar os craques do futuro.', 'Os pais já fazem fila para inscrever os filhos.'],
    ],
  },
  revelacao: {
    h: ['Cria da base, {atleta} sobe ao time principal', '{clube} promove {atleta}, de {idade} anos'],
    s: [
      ['{atleta}, de {idade} anos, deixou a base e agora joga no time principal do {clube}.'],
      ['Os técnicos da escolinha dizem que é o melhor da geração.', 'Quem acompanha a base já conhecia o talento.'],
      ['A torcida espera muito do garoto.', 'É a prova de que a escolinha está dando resultado.'],
    ],
  },
  proposta: {
    h: ['{comprador} oferece {valor} por {atleta}', 'Proposta milionária por {atleta}, do {clube}'],
    s: [
      ['O {comprador} fez uma proposta de {valor} por {atleta}, do {clube}.'],
      ['A diretoria tem 30 dias para responder.'],
      ['A torcida está dividida entre o dinheiro e o craque.', 'Se a venda sair, a família do atleta deve deixar a cidade.'],
    ],
  },
  venda: {
    h: ['{clube} vende {atleta} ao {comprador}', '{atleta} está de saída: vendido por {valor}'],
    s: [
      ['O {clube} aceitou a proposta de {valor} do {comprador} por {atleta}.'],
      ['{familia}'],
      ['O dinheiro reforça o caixa do clube.', 'A torcida se despediu do craque com faixas no último treino.'],
    ],
  },
  proposta_recusada: {
    h: ['{clube} recusa {valor} por {atleta}', '{atleta} fica: {clube} diz não ao {comprador}'],
    s: [
      ['O {clube} recusou a proposta de {valor} do {comprador} por {atleta}.'],
      ['A diretoria diz que o craque não está à venda.'],
      ['A torcida comemorou a decisão.', 'O {comprador} não deve insistir tão cedo.'],
    ],
  },
  clube_fundado: {
    h: ['Nasce o {clube}', '{cidade} ganha um clube de {modalidade}'],
    s: [
      ['Foi fundado o {clube}, que vai disputar o campeonato estadual de {modalidade}.'],
      ['O elenco foi montado com atletas da própria cidade.', 'Os atletas são todos moradores de {cidade}.'],
      ['A diretoria promete brigar pelo acesso já na primeira temporada.', 'A torcida já lota os treinos para conhecer o time.'],
    ],
  },
  temporada_titulo: {
    h: ['{clube} é campeão {divisao}!', 'Título: {clube} conquista o campeonato {divisao}', 'Festa em {cidade}: o {clube} é campeão'],
    s: [
      ['O {clube} terminou em primeiro lugar e é campeão {divisao} de {modalidade}.'],
      ['{destaque}'],
      ['{proxima}'],
    ],
  },
  temporada_acesso: {
    h: ['{clube} garante o acesso', 'O {clube} sobe de divisão'],
    s: [
      ['O {clube} terminou o campeonato {divisao} de {modalidade} em {posicao}º lugar e garantiu o acesso.'],
      ['{destaque}'],
      ['{proxima}'],
    ],
  },
  temporada_rebaixamento: {
    h: ['{clube} é rebaixado', 'Queda: o {clube} cai de divisão'],
    s: [
      ['O {clube} terminou o campeonato {divisao} de {modalidade} em {posicao}º lugar e foi rebaixado.'],
      ['A diretoria promete reforçar o elenco.', 'A torcida protestou na saída do último jogo.'],
      ['{proxima}'],
    ],
  },
  temporada_fim: {
    h: ['{clube} termina o campeonato {divisao} em {posicao}º lugar', 'Fim de temporada para o {clube}'],
    s: [
      ['O {clube} fechou a temporada em {posicao}º lugar no campeonato {divisao} de {modalidade}.'],
      ['{destaque}'],
      ['A diretoria já planeja a próxima temporada.', 'Agora é descansar e pensar em reforços.'],
    ],
  },
  evento_sucesso: {
    h: ['{evento} lota e vira o assunto da cidade', 'Sucesso: {publico} pessoas no {evento}', '{evento} esgota os ingressos'],
    s: [
      ['O {evento} reuniu {publico} pessoas, {lotacao} da capacidade, na {regiao}.', 'Foram {publico} pessoas no {evento}, um sucesso de público.'],
      ['{atracoes}'],
      ['O comércio em volta comemorou o movimento.', 'Quem foi já pergunta quando será a próxima edição.'],
    ],
  },
  evento_morno: {
    h: ['{evento} reúne {publico} pessoas', 'Público morno no {evento}'],
    s: [
      ['O {evento} recebeu {publico} pessoas, {lotacao} da capacidade.'],
      ['{atracoes}'],
      ['Os organizadores esperavam mais gente.', 'Faltou divulgação, dizem os frequentadores.'],
    ],
  },
  evento_fracasso: {
    h: ['{evento} tem público abaixo do esperado', 'Fracasso: {evento} com arquibancadas vazias', 'Cadê o público? {evento} decepciona'],
    s: [
      ['Só {publico} pessoas foram ao {evento}, {lotacao} da capacidade.'],
      ['{atracoes}'],
      ['Críticos culpam o preço do ingresso e a pouca propaganda.', 'A prefeitura vai rever a programação cultural.'],
    ],
  },
  festival_anuncio: {
    h: ['{evento} anuncia a programação', 'Vem aí o {evento}'],
    s: [
      ['A prefeitura confirmou o {evento} para daqui a {dias} dias.'],
      ['{atracoes}'],
      ['Os ingressos já estão à venda.', 'Fãs de toda a região já se organizam para vir.'],
    ],
  },
  artista_saiu: {
    h: ['{artista} deixa {cidade}', 'Sem palco na cidade, {artista} se muda', '{artista} vai embora em busca de oportunidades'],
    s: [
      ['Revelação da cidade, {artista} decidiu se mudar com a família.', '{artista}, nome do {genero} que nasceu aqui, está de mudança.'],
      ['Segundo pessoas próximas, faltaram shows e palcos em {cidade}.', 'Há mais de um ano sem tocar na cidade, a carreira seguia só em turnê.'],
      ['Fãs lamentam e cobram mais eventos culturais.'],
    ],
  },
  serie_confirmar: {
    h: ['{evento}: a próxima edição espera confirmação', 'Vai ter {evento} este ano?'],
    s: [
      ['Faltam {dias} dias para a data do {evento}, e a prefeitura ainda não confirmou a programação.'],
      ['Sem confirmação até uma semana antes, a edição será cancelada.'],
      ['Cancelar uma edição costuma afastar o público das próximas.', 'Os fãs aguardam o anúncio das atrações.'],
    ],
  },
  cultura: {
    h: ['{artista} é o nome do momento', 'Ninguém escuta outra coisa: {artista} lidera as paradas', 'O sucesso de {artista}'],
    s: [
      ['{artista} lidera o ranking de artistas mais ouvidos de {cidade}.', 'Não há rádio ou festa em {cidade} que não toque {artista}.'],
      ['O sucesso vem embalado pela moda do {genero}.', 'Os ingressos para os próximos shows esgotaram em minutos.'],
      ['Críticos dizem que a fama pode passar tão rápido quanto chegou.', 'Os fãs já esperam um novo trabalho para o fim do ano.'],
    ],
  },
  estreia: {
    h: ['Estreia "{obra}" e público lota as salas', '"{obra}" é a estreia da semana', 'Crítica elogia "{obra}"'],
    s: [
      ['Estreou nesta semana "{obra}", {tipo_obra} de {genero_obra}.', 'Chega às salas de {cidade} "{obra}", {tipo_obra} de {genero_obra} que promete ser o assunto do mês.'],
      ['Quem já assistiu fala em {opiniao}.'],
      ['Cinemas e teatros esperam atrair turistas com a novidade.', 'As sessões de sábado já estão esgotadas.'],
    ],
  },

  // ---------------------------------------------------------------------------
  // Críticas ao governo, pela origem da insatisfação (ver rt.complaints)
  // ---------------------------------------------------------------------------
  critica: {
    health: {
      h: ['Opinião: a saúde não pode esperar', 'Saúde abandonada: até quando?', 'Postos vazios, promessas cheias'],
      s: [
        ['A prefeitura de {cidade} parece ter esquecido que hospital não se constrói em discurso.', 'Quem precisa de atendimento em {cidade} sabe: as clínicas estão longe e lotadas.'],
        ['A saúde ruim é hoje um dos principais motivos de insatisfação dos moradores.', 'Enquanto isso, a saúde da população vai caindo.'],
        ['Faltam clínicas de bairro e hospitais onde as pessoas moram.', 'É preciso levar atendimento aos bairros, e não só ao centro.'],
        ['O eleitor vai lembrar.'],
      ],
    },
    leisure: {
      h: ['Cidade sem praça, gente sem sorriso', 'Opinião: lazer também é direito', 'Onde as crianças vão brincar?'],
      s: [
        ['Faltam praças, cinemas e ginásios em boa parte de {cidade}.', 'Os moradores de {cidade} trabalham, voltam para casa e não têm para onde ir.'],
        ['A falta de lazer aparece entre as principais queixas da população.', 'Pesquisas mostram que a falta de lazer pesa na satisfação dos moradores.'],
        ['A prefeitura prefere asfalto a árvores e bancos.', 'Uma praça custa pouco perto do que devolve em qualidade de vida.'],
      ],
    },
    school: {
      h: ['Criança sem escola é cidade sem futuro', 'Opinião: faltam escolas, sobram desculpas', 'Pais reclamam da falta de vagas nas escolas'],
      s: [
        ['Em vários bairros de {cidade}, não há escola primária por perto ou as que existem estão lotadas.', 'A falta de vagas escolares virou uma das maiores queixas das famílias.'],
        ['{pessoa} leva os filhos para estudar do outro lado da cidade.', 'Sem escola, não há quem ocupe as vagas que exigem estudo.'],
        ['A prefeitura precisa entender que educação não é gasto, é investimento.', 'Escolas com raio de atendimento curto deixam bairros inteiros de fora.'],
      ],
    },
    food: {
      h: ['Para comprar comida, é preciso atravessar a cidade', 'Opinião: o mercado é longe demais', 'Bairros sem mercado'],
      s: [
        ['Muitos bairros de {cidade} não têm mercado, feira ou restaurante popular por perto.', 'Comprar comida virou uma viagem para boa parte dos moradores.'],
        ['A falta de alimentos perto de casa derruba a saúde e a satisfação.', 'É um problema que a população sente todos os dias.'],
        ['Mercados municipais e comércio de bairro resolveriam boa parte do problema.', 'A prefeitura precisa olhar para onde as pessoas moram.'],
      ],
    },
    garbage: {
      h: ['Opinião: a cidade está imunda', 'Lixo na porta, prefeitura de costas', 'Coleta de lixo é obrigação, não favor'],
      s: [
        ['Sacos de lixo amontoados viraram paisagem em parte de {cidade}.', 'A coleta de lixo não chega a todos os bairros de {cidade}.'],
        ['O lixo é hoje uma das principais causas de insatisfação dos moradores.', 'E quem paga a conta é a saúde da população.'],
        ['Falta lixão ou aterro com espaço onde a cidade cresceu.', 'A prefeitura precisa planejar a coleta antes que a cidade cresça mais.'],
      ],
    },
    pollution: {
      h: ['Opinião: respirar virou luxo', 'Fumaça das fábricas sufoca bairros', 'Até quando vamos aceitar o ar sujo?'],
      s: [
        ['A poluição das fábricas e dos carros incomoda moradores de toda a {regiao}.', 'Em {cidade}, há casas a poucos metros de chaminés.'],
        ['O ar sujo derruba a saúde e a satisfação de quem mora perto.', 'É uma das reclamações mais ouvidas pela reportagem.'],
        ['Zonas industriais longe das casas e árvores no caminho ajudariam.', 'A prefeitura deixou a indústria crescer sem pensar em quem mora ao lado.'],
      ],
    },
    unemployment: {
      h: ['Opinião: emprego é a primeira política social', 'Promessa de empregos não saiu do papel', 'Desempregados cobram a prefeitura'],
      s: [
        ['O desemprego virou a maior fonte de insatisfação em {cidade}.', 'Cada vez mais moradores de {cidade} procuram trabalho e não encontram.'],
        ['Sem renda, as famílias deixam de consumir, e o comércio sente.', 'O desemprego também alimenta o crime, lembram especialistas.'],
        ['A cidade precisa de mais zonas comerciais e industriais, e de impostos que atraiam empresas.', 'A prefeitura tem que criar condições para as empresas virem para cá.'],
      ],
    },
    tax: {
      h: ['Opinião: o imposto está pesado demais', 'Moradores reclamam do imposto alto', 'Imposto alto, serviço baixo'],
      s: [
        ['O imposto residencial de {cidade} está em {imposto}, acima do que os moradores aceitam.', 'O imposto alto virou queixa geral em {cidade}.'],
        ['Famílias dizem que a conta não fecha no fim do mês.', 'Imposto alto também afasta novos moradores.'],
        ['A prefeitura precisa mostrar onde o dinheiro está sendo gasto.', 'Ou o serviço melhora, ou o imposto tem que baixar.'],
      ],
    },
    stress: {
      h: ['Opinião: pais exaustos, cidade cansada', 'Faltam creches, sobra estresse', 'Quem cuida das crianças enquanto os pais trabalham?'],
      s: [
        ['Sem vaga em creche, pais e mães de {cidade} se desdobram entre o trabalho e os filhos pequenos.', 'A falta de creches é uma das maiores causas de insatisfação nas famílias de {cidade}.'],
        ['O estresse aparece na saúde, no trabalho e na satisfação.', 'Empresas também perdem, com funcionários rendendo bem menos.'],
        ['Creches perto das casas resolveriam boa parte do problema.', 'A prefeitura precisa tratar a primeira infância como prioridade.'],
      ],
    },
    crime: {
      h: ['Opinião: a cidade tem medo', 'Insegurança: a prefeitura lava as mãos', 'Segurança pública: cadê a polícia?'],
      s: [
        ['A sensação de insegurança tomou conta de {cidade}.', 'Moradores de {cidade} trocaram o passeio da noite pelas grades nas janelas.'],
        ['O crime é hoje um dos principais motivos de insatisfação na cidade.', 'Segundo a reportagem, a {regiao} é a mais afetada.'],
        ['Faltam delegacias nos bairros, e o desemprego não ajuda.', 'Segurança se faz com polícia por perto, emprego e cidade cuidada.'],
      ],
    },
    energia: {
      h: ['Opinião: a prefeitura deixou a cidade no escuro', 'Apagões: faltou planejamento'],
      s: [
        ['Os apagões em {cidade} não são acidente: são falta de planejamento.', 'A cidade cresceu e as usinas não acompanharam.'],
        ['Quem perde é o morador que vê a geladeira desligar e o comerciante que fecha mais cedo.'],
        ['Uma cidade que não garante energia não atrai empresas nem famílias.'],
      ],
    },
    agua: {
      h: ['Opinião: água é o básico', 'Torneira seca é culpa de quem?'],
      s: [
        ['Faltar água numa cidade cercada de rios é um vexame para a prefeitura.', 'A falta de água em {cidade} mostra que o básico foi esquecido.'],
        ['Famílias deixam a cidade por causa disso.'],
        ['Bombas e poços custam menos que o prejuízo de uma cidade seca.'],
      ],
    },
    transito: {
      h: ['Opinião: a cidade parou', 'Engarrafamento é escolha política'],
      s: [
        ['Todo dia de manhã, {cidade} vira um grande estacionamento.', 'O trânsito de {cidade} rouba horas de quem trabalha.'],
        ['A prefeitura insiste em ruas estreitas e quase nenhum transporte público.'],
        ['Avenidas, ônibus e metrô não são luxo, são necessidade.'],
      ],
    },
    esgoto: {
      h: ['Opinião: nossos rios viraram esgoto', 'Esgoto a céu aberto envergonha a cidade'],
      s: [
        ['O esgoto de {cidade} vai quase todo para os rios sem tratamento.', 'Quem passa pela beira do rio em {cidade} sente o cheiro antes de ver a água.'],
        ['Peixes morrem, e quem bebe água bombeada do rio adoece.'],
        ['Estação de tratamento de esgoto não dá voto, mas dá saúde.', 'A prefeitura precisa tratar o esgoto antes que o rio morra de vez.'],
      ],
    },
    abandono: {
      h: ['Opinião: a cidade está sendo abandonada', 'Prédios vazios, promessas vazias'],
      s: [
        ['Prédios abandonados se multiplicam em {cidade}, e ninguém na prefeitura parece notar.', 'Cada prédio vazio em {cidade} conta a história de uma família que desistiu.'],
        ['Sem energia, sem água ou depois de um incêndio, eles ficam ali, apodrecendo.'],
        ['A cidade precisa cuidar do que já tem antes de crescer mais.'],
      ],
    },
    satisfacao: {
      h: ['Opinião: a cidade está infeliz', 'O mau humor da cidade tem endereço'],
      s: [
        ['Os moradores de {cidade} estão insatisfeitos, e as pesquisas mostram isso mês após mês.', 'A insatisfação em {cidade} virou rotina.'],
        ['A principal queixa é {queixa}.'],
        ['A prefeitura precisa ouvir quem mora aqui antes que as famílias vão embora.'],
      ],
    },
    divida: {
      h: ['Opinião: quem vai pagar essa conta?', 'Gastança e caixa vazio'],
      s: [
        ['As contas de {cidade} estão no vermelho, e a prefeitura parece não se preocupar.', 'Gastar mais do que arrecada não é governar.'],
        ['Cedo ou tarde, a conta chega para o contribuinte.'],
        ['É hora de cortar o que não funciona e cobrar o que é justo.'],
      ],
    },
  },
  // Nome de cada fonte de insatisfação nas reportagens.
  queixas: {
    health: 'a saúde', leisure: 'a falta de lazer', school: 'a falta de escola', food: 'a falta de mercados por perto',
    garbage: 'o lixo sem coleta', pollution: 'a poluição', unemployment: 'o desemprego', tax: 'o imposto alto',
    stress: 'a falta de creches', crime: 'a insegurança',
  },

  // ---------------------------------------------------------------------------
  // Curiosidades da cidade (sem alerta)
  // ---------------------------------------------------------------------------
  cidade: [
    {
      h: ['Moradores da {regiao} fazem mutirão de limpeza', 'Vizinhos se unem para pintar a praça'],
      s: [
        ['Um grupo de moradores da {regiao} passou o sábado limpando calçadas e pintando bancos.', 'Vizinhos da {regiao} organizaram um mutirão para cuidar do bairro.'],
        ['A ideia foi de {pessoa}, que mora na mesma rua há anos.'],
        ['"Se cada um fizer um pouco, a cidade fica melhor", diz {pessoa2}.'],
      ],
    },
    {
      h: ['{empresa} completa mais um ano em {cidade}', 'Negócio local é exemplo de sucesso'],
      s: [
        ['{empresa} comemorou mais um ano de funcionamento em {cidade} com festa para os clientes.', 'Com fila na porta, {empresa} virou ponto de referência na cidade.'],
        ['O segredo, segundo os donos, é tratar todo cliente como vizinho.'],
        ['A empresa planeja contratar mais gente no próximo ano.', 'Os clientes mais antigos ganharam desconto.'],
      ],
    },
    {
      h: ['Previsão do tempo: dias de {tempo} em {cidade}', 'Meteorologia anuncia {tempo} para os próximos dias'],
      s: [
        ['A meteorologia prevê dias de {tempo} em {cidade}.', 'Os próximos dias serão de {tempo}, segundo os meteorologistas.'],
        ['A Defesa Civil pede atenção a quem vai pegar a estrada.', 'Feirantes já ajustam as barracas para o tempo que vem por aí.'],
        ['Os vendedores de sorvete e de guarda-chuva fazem as contas.', 'Na praça, a previsão virou o assunto da semana.'],
      ],
    },
    {
      h: ['Feira de ciências da escola surpreende', 'Estudantes de {cidade} brilham na feira de ciências'],
      s: [
        ['Estudantes de {cidade} apresentaram projetos na feira de ciências anual.', 'A feira de ciências de {cidade} reuniu mais de cem projetos de estudantes.'],
        ['O projeto vencedor foi um filtro de água feito com garrafas.', 'Um robô montado com peças velhas de rádio chamou a atenção do público.'],
        ['Os professores dizem que nunca viram tanto interesse.'],
      ],
    },
    {
      h: ['Concurso elege o melhor pastel de {cidade}', 'Disputa acirrada no festival gastronômico'],
      s: [
        ['O festival gastronômico de {cidade} reuniu milhares de pessoas na {regiao}.', 'Mais de trinta barracas disputaram o título de melhor pastel da cidade.'],
        ['O vencedor foi o pastel de {sabor} de {pessoa}.', 'O júri ficou em dúvida entre o de carne e o de {sabor}.'],
        ['A organização promete repetir a festa no ano que vem.'],
      ],
    },
  ],

  // ---------------------------------------------------------------------------
  // Fofocas e notícias inúteis
  // ---------------------------------------------------------------------------
  fofoca: [
    {
      h: ['Flagra: {artista} numa padaria da {regiao}', 'Paparazzi: {artista} pede pão na chapa', 'Visita inesperada: {artista} toma café no bairro'],
      s: [
        ['Clientes viram {artista} tomando café da manhã numa padaria da {regiao}.', 'Clientes de uma padaria da {regiao} não acreditaram quando {artista} entrou pedindo pão na chapa.'],
        ['Segundo testemunhas, foram dois pães, um café pingado e muita simpatia.', 'A visita durou vinte minutos e rendeu dezenas de fotos.'],
        ['O dono da padaria já pendurou a foto na parede.', 'Fãs passaram o resto do dia na porta, esperando uma nova visita.'],
      ],
    },
    {
      h: ['Romance no ar? {artista} e {artista2} jantam juntos', 'Clima de romance entre {artista} e {artista2}'],
      s: [
        ['Testemunhas viram {artista} e {artista2} jantando juntos num restaurante da cidade.', '{artista} e {artista2} foram fotografados de mãos dadas na saída de um show.'],
        ['As assessorias não confirmam nem desmentem.', 'A notícia já é o assunto mais comentado nas rodas de conversa.'],
        ['Os fãs, claro, já escolheram um nome para o casal.', 'Uma música nova pode contar a história toda, especulam os fãs.'],
      ],
    },
    {
      h: ['Fim de namoro abala os fãs de {artista}', 'Acabou? {artista} apaga as fotos do romance'],
      s: [
        ['Os fãs de {artista} estão em choque com o suposto fim de um namoro.', 'O romance mais comentado da cidade pode ter chegado ao fim, dizem pessoas próximas de {artista}.'],
        ['A assessoria pede respeito e não dá detalhes.', 'Nas rodas de conversa, cada um tem uma versão da história.'],
        ['Uma música nova pode contar a história toda, especulam os fãs.'],
      ],
    },
    {
      h: ['Gato sobe em poste e mobiliza bombeiros', 'Resgate de gato para o trânsito na {regiao}', 'Bichano teimoso desafia bombeiros'],
      s: [
        ['Um gato chamado {pet} subiu num poste da {regiao} e se recusou a descer por seis horas.', 'Os bombeiros de {cidade} foram chamados para tirar um gato do alto de um poste.'],
        ['Vizinhos tentaram atum, leite e até música para convencer o bichano.', 'O resgate juntou uma pequena multidão e atrapalhou o trânsito.'],
        ['No fim, o gato desceu sozinho, assim que todos foram embora.', 'Na casa de {pessoa}, onde o gato mora, garantem que é a terceira vez neste ano.'],
      ],
    },
    {
      h: ['Abóbora gigante de {n} quilos surpreende vizinhos', 'Horta de quintal produz abóbora recorde'],
      s: [
        ['{pessoa}, de {idade} anos, colheu uma abóbora de {n} quilos no quintal de casa.', 'Uma abóbora de {n} quilos virou atração na {regiao}.'],
        ['O segredo, segundo quem plantou, é conversar com a planta todos os dias.', 'Foram precisos quatro vizinhos para levantar a abóbora.'],
        ['Ela vai virar doce para a festa da rua.', 'Já tem gente pedindo sementes.'],
      ],
    },
    {
      h: ['Moradores dizem ter visto disco voador sobre a {regiao}', 'Luzes no céu intrigam moradores'],
      s: [
        ['Moradores da {regiao} juram ter visto luzes estranhas no céu na noite de sábado.', '{pessoa} garante que viu um disco voador pairando sobre a caixa d\'água do bairro.'],
        ['Astrônomos dizem que provavelmente era um balão ou um avião.', 'A foto tirada pelo celular de um vizinho mostra só um ponto borrado.'],
        ['Mesmo assim, já tem gente organizando vigília no fim de semana.'],
      ],
    },
    {
      h: ['Briga de vizinhos por causa de galo vai parar na delegacia', 'O galo que canta às 3 da manhã'],
      s: [
        ['A disputa entre {pessoa} e {pessoa2} por causa de um galo que canta de madrugada foi parar na delegacia.', 'Um galo que canta às três da manhã está tirando o sono da {regiao}.'],
        ['Um dos lados diz que o galo é da família há anos; o outro diz que não dorme há meses.', 'O delegado sugeriu um acordo: o galo dorme na garagem.'],
        ['O galo não quis comentar.'],
      ],
    },
    {
      h: ['Casamento na {regiao} tem 600 convidados e bolo de sete andares', 'A festa do ano na {regiao}'],
      s: [
        ['O casamento de {pessoa} e {pessoa2} parou a {regiao} no sábado.', 'Foram 600 convidados, duas bandas e um bolo de sete andares.'],
        ['A festa foi até o sol nascer, segundo vizinhos que não foram convidados.', 'O buquê foi disputado por mais de trinta pessoas.'],
        ['O casal viaja em lua de mel para o litoral.'],
      ],
    },
    {
      h: ['{artista} anuncia pausa na carreira', 'Tempo para descansar: {artista} se despede dos palcos por um ano'],
      s: [
        ['{artista} disse que vai dar um tempo nos palcos para descansar.', 'No fim de um show lotado, {artista} anunciou uma pausa na carreira.'],
        ['Os fãs choraram na plateia.', 'Os ingressos da turnê de despedida esgotaram em minutos.'],
        ['Críticos dizem que é jogada de marketing; os fãs dizem que é coragem.'],
      ],
    },
    {
      h: ['{artista} muda o visual e divide os fãs', 'Cabelo novo de {artista} é o assunto da semana'],
      s: [
        ['{artista} surpreendeu os fãs com um visual completamente novo.', 'O novo corte de cabelo de {artista} apareceu no show de sábado e não saiu mais das conversas.'],
        ['Nas rodas de conversa, ninguém fala de outra coisa.', 'Os salões da cidade já recebem pedidos do "corte de {artista}".'],
        ['Críticos dizem que é jogada de marketing; os fãs dizem que é coragem.'],
      ],
    },
    {
      h: ['Cachorro caramelo vira mascote de {empresa}', 'O cão que bate ponto'],
      s: [
        ['Um cachorro caramelo aparece todo dia às 8h na porta de {empresa} e só vai embora no fim do expediente.', 'Funcionários de {empresa} adotaram um cachorro caramelo que apareceu na porta.'],
        ['Ganhou nome, {pet}, e até crachá.', 'Hoje ele tem cama, pote de ração e fila de admiradores.'],
        ['Os clientes dizem que voltam só para vê-lo.'],
      ],
    },
    {
      h: ['Bolo de aniversário gigante é dividido em praça', '{pessoa} faz {idade} anos e convida a cidade inteira'],
      s: [
        ['{pessoa} completou {idade} anos e resolveu comemorar na praça, com bolo para quem passasse.', 'Uma festa de aniversário aberta ao público reuniu centenas de pessoas na {regiao}.'],
        ['O bolo tinha três metros e acabou em meia hora.', 'Teve parabéns cantado por desconhecidos e até banda.'],
        ['"Fazer {idade} anos é motivo de festa", disse {pessoa}, com a voz embargada.'],
      ],
    },
    {
      h: ['Papagaio que canta jingle de campanha vira atração', 'Papagaio desbocado faz sucesso na {regiao}'],
      s: [
        ['Um papagaio da {regiao} aprendeu a repetir frases de comício e virou atração.', 'O papagaio {pet}, de {pessoa}, faz sucesso cantando jingles antigos.'],
        ['Curiosos fazem fila na janela para ouvir o bicho.', 'Ninguém sabe quem ensinou as frases mais impublicáveis.'],
        ['A família pensa em cobrar ingresso.'],
      ],
    },
    {
      h: ['Torneio de dominó da {regiao} termina em polêmica', 'Peça marcada? Final do dominó acaba em confusão'],
      s: [
        ['A final do torneio de dominó da {regiao} terminou com acusações de peça marcada.', 'O tradicional torneio de dominó da {regiao} acabou em bate-boca na mesa final.'],
        ['{pessoa}, que venceu os últimos três anos, pediu revisão.', 'Os jogadores mais velhos dizem que nunca viram nada igual.'],
        ['A organização promete uma revanche no mês que vem.'],
      ],
    },
  ],
  // Fofocas da era das redes sociais (vídeos, desafios e virais).
  fofocaSocial: [
    {
      h: ['Vídeo de {pessoa} dançando no ônibus viraliza', 'Dança no ônibus soma milhões de visualizações'],
      s: [
        ['Um vídeo de {pessoa} dançando dentro de um ônibus em {cidade} passou de {n} mil visualizações.', 'Uma viagem de ônibus em {cidade} virou fenômeno na internet por causa de uma dança.'],
        ['Na gravação, os outros passageiros acabam entrando na coreografia.'],
        ['Marcas já procuraram a nova estrela da internet.', 'O motorista diz que nunca viu nada igual.'],
      ],
    },
    {
      h: ['Desafio do pastel invade as redes', 'Nova moda: comer pastel sem sujar a roupa'],
      s: [
        ['Um desafio criado em {cidade} pede para comer um pastel de feira inteiro sem sujar a roupa.', 'O "desafio do pastel" virou febre entre os jovens de {cidade}.'],
        ['Até agora, quase ninguém conseguiu.', 'Feirantes dizem que as vendas triplicaram.'],
        ['As lavanderias também agradecem.'],
      ],
    },
    {
      h: ['{artista} posta foto e quebra a internet', 'Foto de {artista} de pijama é a mais curtida do ano'],
      s: [
        ['Uma foto de {artista} de pijama passou de {n} mil curtidas em uma hora.', 'Bastou uma foto de pijama para {artista} parar a internet da cidade.'],
        ['Os fãs encontraram mensagens escondidas no fundo da imagem.'],
        ['A assessoria diz que foi só uma foto.'],
      ],
    },
    {
      h: ['Perfil de cachorro de {cidade} tem mais seguidores que a prefeitura', 'O cachorro influenciador'],
      s: [
        ['O perfil de {pet}, um cachorro da {regiao}, já tem mais seguidores do que o perfil oficial da prefeitura.', 'Um cachorro de {cidade} virou influenciador digital.'],
        ['Os vídeos mostram o dia a dia do bicho: passeio, soneca e petisco.'],
        ['A família já recebe propostas de patrocínio de rações.'],
      ],
    },
  ],

  // ---------------------------------------------------------------------------
  // Boatos (fake news): a checagem desmente depois (claim)
  // ---------------------------------------------------------------------------
  boato: [
    {
      claim: 'a água da cidade deixa as pessoas verdes',
      h: ['URGENTE: água da torneira estaria deixando moradores verdes', 'Água "verde" assusta a {regiao}'],
      s: [
        ['Mensagens que circulam pela cidade dizem que a água da torneira está deixando a pele das pessoas esverdeada.', 'Moradores da {regiao} relatam que a água estaria "mudando a cor das pessoas".'],
        ['O texto fala em "produto secreto" colocado na água.'],
        ['Nenhum caso foi confirmado por médicos.', 'A mensagem pede para todo mundo repassar.'],
      ],
    },
    {
      claim: 'a prefeitura vai cobrar imposto sobre o ar',
      h: ['Prefeitura vai taxar o ar que você respira?', 'Novo imposto sobre o ar estaria a caminho'],
      s: [
        ['Circula pela cidade a informação de que a prefeitura vai criar um imposto sobre o ar.', 'Uma mensagem compartilhada milhares de vezes diz que cada morador vai pagar pelo ar que respira.'],
        ['O texto fala em "medidores de respiração" que seriam instalados nas casas.'],
        ['A mensagem não cita nenhuma fonte.'],
      ],
    },
    {
      claim: 'a usina vai explodir na semana que vem',
      h: ['Usina estaria prestes a explodir, diz mensagem', 'Pânico: boato fala em explosão na usina'],
      s: [
        ['Um áudio que circula na cidade diz que a usina vai explodir na semana que vem.', 'Moradores próximos à usina relatam medo depois de uma mensagem anônima.'],
        ['O autor diz ser "primo de um funcionário".'],
        ['Algumas famílias já falam em sair da cidade.'],
      ],
    },
    {
      claim: '{artista} morreu',
      h: ['{artista} teria morrido, dizem mensagens', 'Fãs de luto: notícia sobre {artista} se espalha'],
      s: [
        ['Mensagens espalhadas pela cidade anunciam a morte de {artista}.', 'Fãs de {artista} entraram em desespero com a notícia de uma suposta morte.'],
        ['Não há detalhes sobre onde ou como teria acontecido.'],
        ['Velas já foram acesas em frente à casa de shows da cidade.'],
      ],
    },
    {
      claim: 'a vacina do posto de saúde transmite sinal de rádio',
      h: ['Vacina teria chip que transmite sinal de rádio', 'Boato sobre vacina assusta pais'],
      s: [
        ['Um texto compartilhado em grupos de pais diz que a vacina do posto de saúde tem um chip que transmite sinal de rádio.', 'Pais de {cidade} estão com medo de vacinar os filhos por causa de uma mensagem.'],
        ['O texto diz que "dá para ouvir a estação AM" encostando o ouvido no braço.'],
        ['Médicos estão preocupados com a queda na procura pela vacina.'],
      ],
    },
    {
      claim: 'um jacaré gigante vive no esgoto da cidade',
      h: ['Jacaré gigante estaria morando no esgoto', 'Moradores juram ter visto jacaré de 5 metros'],
      s: [
        ['Uma foto borrada mostra o que seria um jacaré de cinco metros saindo de um bueiro da {regiao}.', 'Moradores da {regiao} dizem que um jacaré enorme vive nas galerias de esgoto.'],
        ['O animal teria sido batizado de "Juca" pelos vizinhos.'],
        ['Crianças estão proibidas de brincar perto dos bueiros.'],
      ],
    },
    {
      claim: '{empresa} vai fechar e demitir todo mundo amanhã',
      h: ['{empresa} vai fechar amanhã, diz mensagem', 'Funcionários de {empresa} temem demissão em massa'],
      s: [
        ['Uma mensagem que circula pela cidade diz que {empresa} vai fechar amanhã e demitir todo mundo.', 'Funcionários de {empresa} chegaram assustados ao trabalho por causa de um boato.'],
        ['A mensagem não tem autor nem data.'],
        ['Clientes correram para gastar os vales que ainda tinham.'],
      ],
    },
    {
      claim: 'o prédio mais alto da cidade está afundando',
      h: ['Prédio estaria afundando meio metro por dia', 'Alerta falso: prédio da {regiao} afundando?'],
      s: [
        ['Mensagens dizem que o prédio mais alto da {regiao} está afundando meio metro por dia.', 'Moradores de um prédio da {regiao} receberam alertas de que o edifício estaria cedendo.'],
        ['Um vídeo com a câmera torta seria a "prova".'],
        ['Algumas famílias passaram a noite na casa de parentes.'],
      ],
    },
  ],
  // Boatos que aproveitam um problema real da cidade (exageram o que existe).
  boatoProblema: {
    energia: { claim: 'a cidade vai ficar um ano sem energia', h: ['Cidade ficaria um ano sem luz, diz áudio'], s: [['Um áudio que circula pela cidade diz que a energia vai ser cortada por um ano inteiro.'], ['O autor diz ter ouvido de "um engenheiro".'], ['Os apagões existem, mas a informação não tem fonte.']] },
    agua: { claim: 'a água vai ser racionada para um banho por semana', h: ['Racionamento: só um banho por semana?'], s: [['Mensagens dizem que a prefeitura vai liberar água para um banho por semana.'], ['O texto traz uma "tabela de horários" sem nenhuma assinatura.'], ['A falta de água é real em parte da cidade, o que ajuda o boato a se espalhar.']] },
    epidemia: { claim: 'a doença da epidemia passa pelo celular', h: ['Doença passaria pelo celular, diz mensagem'], s: [['Uma corrente de mensagens afirma que a doença da epidemia passa de um celular para o outro.'], ['O texto recomenda deixar o aparelho no congelador.'], ['Médicos já receberam pacientes com o celular congelado.']] },
    crime: { claim: 'uma quadrilha de cem pessoas vai invadir a cidade', h: ['Quadrilha de cem pessoas a caminho?'], s: [['Áudios falam numa quadrilha de cem pessoas que estaria a caminho da cidade.'], ['O comércio da {regiao} fechou mais cedo por precaução.'], ['A violência é real, mas ninguém confirma a tal quadrilha.']] },
    divida: { claim: 'a prefeitura vai vender as praças para pagar dívidas', h: ['Prefeitura venderia as praças, diz boato'], s: [['Mensagens dizem que a prefeitura vai vender todas as praças da cidade para pagar as dívidas.'], ['O texto fala até em leilão marcado.'], ['As contas estão no vermelho, mas não há nenhum leilão.']] },
  },
  checagem: {
    h: ['É falso que {claim}', 'Checagem: é boato que {claim}', 'Fato ou boato? Não é verdade que {claim}'],
    s: [
      ['Circulou nos últimos dias a informação de que {claim}.', 'A reportagem checou a mensagem que dizia que {claim}.'],
      ['Não há nenhuma prova, e especialistas ouvidos desmentem a história.', 'Nenhuma fonte oficial confirma, e os dados mostram o contrário.'],
      ['Antes de compartilhar, confira se a notícia saiu num veículo de confiança.', 'Boatos se espalham mais rápido do que a verdade, lembram os checadores.'],
    ],
  },

  // Palavras para completar os textos.
  words: {
    pets: ['Bolinha', 'Tico', 'Pipoca', 'Paçoca', 'Marrom', 'Banzé', 'Farofa', 'Chico', 'Mel', 'Biscoito'],
    sabores: ['queijo', 'palmito', 'frango com catupiry', 'banana com canela', 'pizza', 'carne seca'],
    tempo: ['calor forte', 'frio e garoa', 'chuva forte', 'muito vento', 'sol entre nuvens'],
    times: ['Esporte Clube', 'Atlético', 'Associação Atlética', 'Futebol Clube'],
    rivais: ['o Ferroviário', 'o Operário', 'o União', 'o Comercial', 'o Guarani', 'o Independente', 'o Botafogo da Serra'],
    lances: [
      'O gol da vitória saiu de cabeça, nos acréscimos.', 'O goleiro foi o destaque, com três defesas difíceis.',
      'Um pênalti polêmico no segundo tempo vai render discussão a semana toda.', 'O jogo foi parado por dez minutos por causa de um cachorro em campo.',
      'A torcida reclamou do juiz do começo ao fim.',
    ],
    opinioes: ['obra-prima', 'roteiro previsível, mas atuações brilhantes', 'o melhor do ano', 'final de deixar todo mundo sem palavras', 'muita risada'],
  },
};

// Texto da notícia quando um problema acaba.
export const SOLVED = {
  energia: ['Energia volta a toda a cidade', 'O abastecimento de energia foi normalizado em {cidade}, e os prédios voltaram a ter luz.'],
  agua: ['Água volta às torneiras', 'O abastecimento de água foi normalizado, e as torneiras de {cidade} voltaram a funcionar.'],
  desemprego: ['Desemprego cai em {cidade}', 'A taxa de desemprego de {cidade} voltou a um nível considerado normal.'],
  crime: ['Criminalidade recua', 'Os índices de crime de {cidade} caíram nas últimas semanas.'],
  saude: ['Saúde da população melhora', 'O índice de saúde de {cidade} voltou a subir, e os hospitais estão menos cheios.'],
  transito: ['Trânsito flui melhor no horário de pico', 'O rush da manhã em {cidade} já não para a cidade como antes.'],
  lixo: ['Coleta de lixo chega a toda a cidade', 'O lixo voltou a ser recolhido em todos os bairros de {cidade}.'],
  esgoto: ['Rios mais limpos', 'A maior parte do esgoto de {cidade} agora é tratada antes de chegar aos rios.'],
  abandono: ['Prédios abandonados diminuem', 'O número de prédios abandonados em {cidade} caiu.'],
  creche: ['Mais vagas em creches', 'A maioria dos pais que trabalham em {cidade} já tem onde deixar os filhos pequenos.'],
  satisfacao: ['Humor da cidade melhora', 'A satisfação dos moradores de {cidade} voltou a subir.'],
  epidemia: ['Fim da epidemia', 'As autoridades de saúde declararam o fim da epidemia em {cidade}.'],
};

// Chegada de cada veículo novo à cidade, quando a cidade conclui a tecnologia.
export const MEDIA_ARRIVAL = {
  radio: ['A cidade entra na era do rádio', 'Com o rádio, as notícias chegam às casas de {cidade} ao vivo, sem esperar o jornal do dia seguinte.', 'Novelas, futebol e música passam a fazer parte da rotina das famílias.', 'Logo devem surgir as primeiras rádios da cidade.'],
  tv: ['A televisão chega a {cidade}', 'A imagem entra nas salas de {cidade}: a televisão chegou.', 'Vizinhos se reúnem em volta do primeiro aparelho do quarteirão para ver o noticiário.', 'Emissoras locais devem surgir quando a cidade crescer.'],
  portal: ['{cidade} está conectada à internet', 'A internet chega a {cidade}, e com ela as notícias atualizadas a cada minuto.', 'Portais de notícias começam a disputar leitores com os jornais impressos.', 'Especialistas dizem que os boatos também vão viajar mais rápido.'],
  social: ['Chegam as redes sociais', 'Com o smartphone no bolso, cada morador de {cidade} vira repórter, comentarista e, às vezes, espalhador de boatos.', 'Vídeos, memes e opiniões se espalham em minutos.', 'A checagem de fatos nunca foi tão necessária.'],
};
