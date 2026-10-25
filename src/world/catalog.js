// Catálogo de tipos: tudo que é balanceamento mora aqui, como dados.

export const TERRAIN = { GRASS: 0, WATER: 1, FOREST: 2, SAND: 3 };

export const ZONE = { NONE: 0, RESIDENTIAL: 1, COMMERCIAL: 2, INDUSTRIAL: 3, RURAL: 4 };

// Densidade de uma zona residencial ou comercial, escolhida pelo jogador ao
// zonear (state.map.density, por tile). Limita até onde os prédios crescem:
//   maxLevel:  nível máximo (baixa fica em casas, sobrados, lojas e mercados,
//              e não recebe prédios grandes)
//   maxFloors: andares máximos dos prédios que crescem andar por andar
// A indústria e a zona rural não usam densidade.
export const DENSITY = { LOW: 0, MEDIUM: 1, HIGH: 2 };
export const DENSITY_INFO = {
  [DENSITY.LOW]: { name: 'Baixa', maxLevel: 2, maxFloors: 2 },
  [DENSITY.MEDIUM]: { name: 'Média', maxLevel: 3, maxFloors: 6 },
  [DENSITY.HIGH]: { name: 'Alta', maxLevel: 3, maxFloors: 12 },
};

export const ZONE_INFO = {
  [ZONE.RESIDENTIAL]: { name: 'Residencial', color: '#5fbf5a', key: 'r' },
  [ZONE.COMMERCIAL]: { name: 'Comercial', color: '#4f8ff7', key: 'c' },
  [ZONE.INDUSTRIAL]: { name: 'Industrial', color: '#e8b931', key: 'i' },
  [ZONE.RURAL]: { name: 'Rural', color: '#a3843f', key: 'f' },
};

// Prédios que crescem sozinhos nas zonas.
//   level:     nível (1 a 3); prédios 1x1 sobem de nível no lugar
//   size:      lado do terreno ocupado, em tiles (1 ou 2)
//   residents: quantos cidadãos moram
//   jobs:      quantas vagas de emprego
//   perFloor:  quantas pessoas cabem num andar; o número de andares sai da
//              capacidade, 1 pessoa = 1 cidadão (ver floorsOf)
//   tall:      cresce andar por andar depois de pronto, até o limite da
//              densidade da zona (residents/jobs são a capacidade inicial;
//              cada andar a mais soma perFloor, ver capacityOf). A aparência
//              de cada prédio vem dos projetos em src/render/designs.js (20
//              por tipo)
//
// Os ids 'casa', 'loja' e 'fabrica' existem desde o formato de save 2 e não
// podem ser renomeados (saves antigos guardam o id do tipo).
export const BUILDINGS = {
  // --- Residencial -----------------------------------------------------------
  casa: {
    name: 'Casa', zone: ZONE.RESIDENTIAL, level: 1, size: 1, residents: 4, jobs: 0, perFloor: 4,
  },
  sobrado: {
    name: 'Sobrado', zone: ZONE.RESIDENTIAL, level: 2, size: 1, residents: 8, jobs: 0, perFloor: 4,
  },
  apartamentos: {
    name: 'Prédio de apartamentos', zone: ZONE.RESIDENTIAL, level: 3, size: 1, residents: 16, jobs: 0, perFloor: 4, tall: true,
  },
  condominio: {
    name: 'Condomínio', zone: ZONE.RESIDENTIAL, level: 3, size: 2, residents: 48, jobs: 0, perFloor: 8, tall: true,
  },

  // --- Comercial -------------------------------------------------------------
  loja: {
    name: 'Loja', zone: ZONE.COMMERCIAL, level: 1, size: 1, residents: 0, jobs: 5, perFloor: 5,
  },
  mercado: {
    name: 'Mercado', zone: ZONE.COMMERCIAL, level: 2, size: 1, residents: 0, jobs: 12, perFloor: 6,
  },
  escritorios: {
    name: 'Escritórios', zone: ZONE.COMMERCIAL, level: 3, size: 1, residents: 0, jobs: 32, perFloor: 8, tall: true,
  },
  shopping: {
    name: 'Shopping', zone: ZONE.COMMERCIAL, level: 3, size: 2, residents: 0, jobs: 80, perFloor: 40,
  },

  // --- Industrial ------------------------------------------------------------
  fabrica: {
    name: 'Fábrica', zone: ZONE.INDUSTRIAL, level: 1, size: 1, residents: 0, jobs: 10, perFloor: 10,
  },
  industria: {
    name: 'Indústria', zone: ZONE.INDUSTRIAL, level: 2, size: 1, residents: 0, jobs: 18, perFloor: 18,
  },
  complexo: {
    name: 'Complexo industrial', zone: ZONE.INDUSTRIAL, level: 3, size: 1, residents: 0, jobs: 30, perFloor: 15,
  },
  galpao: {
    name: 'Galpão logístico', zone: ZONE.INDUSTRIAL, level: 3, size: 2, residents: 0, jobs: 70, perFloor: 70,
  },

  // --- Rural (ver systems/food.js) --------------------------------------------
  //   food: alimentos por mês com todas as vagas preenchidas (FOOD.perResident
  //   por morador). Não usam a rede de energia e água.
  sitio: {
    name: 'Sítio', zone: ZONE.RURAL, level: 1, size: 1, residents: 0, jobs: 6, perFloor: 6, food: 40,
  },
  fazenda: {
    name: 'Fazenda', zone: ZONE.RURAL, level: 2, size: 1, residents: 0, jobs: 10, perFloor: 10, food: 85,
  },
  fazenda_mecanizada: {
    name: 'Fazenda mecanizada', zone: ZONE.RURAL, level: 3, size: 1, residents: 0, jobs: 12, perFloor: 12, food: 140,
  },
  agroindustria: {
    name: 'Agroindústria', zone: ZONE.RURAL, level: 3, size: 2, residents: 0, jobs: 40, perFloor: 40, food: 520,
  },

  // --- Prédios colocados pelo jogador (serviços públicos e estatais) ----------
  //   utility.power / water: quanto produz por hora (mesma unidade do consumo)
  //   utility.cost: preço para construir; upkeep: manutenção por mês
  //   utility.pollution: peso na poluição em volta (como a indústria)
  //   utility.needsWater: precisa encostar em rio ou lago
  //   utility.income: receita por mês com todas as vagas preenchidas (estatais)
  //   utility.area: área do conhecimento em que atua (gera um pouco de pesquisa)
  //   utility.institute: instituição de pesquisa (transforma verba em pesquisa)
  //   utility.privateResearch: P&D privado dos escritórios em volta
  //   utility.mods: modificadores ativos enquanto o prédio funciona
  //   (a tecnologia que libera cada um está em techs.js)
  usina_carvao: {
    name: 'Usina a carvão', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 20,
    utility: { power: 3000, water: 0, cost: 12_000, upkeep: 400, pollution: 14, area: 'energia' },
  },
  usina_solar: {
    name: 'Usina solar', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 4,
    utility: { power: 1200, water: 0, cost: 20_000, upkeep: 150, pollution: 0, area: 'energia' },
  },
  bomba_agua: {
    name: "Bomba d'água", zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 6,
    utility: { power: 0, water: 2500, cost: 6_000, upkeep: 200, pollution: 0, needsWater: true, area: 'saude' },
  },
  poco: {
    name: 'Poço artesiano', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 2,
    utility: { power: 0, water: 700, cost: 3_500, upkeep: 90, pollution: 0, area: 'saude' },
  },
  usina_gas: {
    name: 'Usina a gás', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 14,
    utility: { power: 2500, water: 0, cost: 16_000, upkeep: 350, pollution: 7, area: 'energia' },
  },
  hidreletrica: {
    name: 'Hidrelétrica', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 16,
    utility: { power: 5000, water: 0, cost: 45_000, upkeep: 300, pollution: 0, needsWater: true, area: 'energia' },
  },
  usina_eolica: {
    name: 'Parque eólico', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 3,
    utility: { power: 900, water: 0, cost: 14_000, upkeep: 120, pollution: 0, area: 'energia' },
  },
  usina_hidrogenio: {
    name: 'Usina a hidrogênio', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 12,
    utility: { power: 2000, water: 0, cost: 60_000, upkeep: 1_200, pollution: 0, area: 'energia' },
  },
  refinaria: {
    name: 'Refinaria', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 60,
    utility: { power: 0, water: 0, cost: 40_000, upkeep: 300, pollution: 18, income: 1_500, area: 'quimica' },
  },
  fabrica_cimento: {
    name: 'Fábrica de cimento', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 25,
    utility: {
      power: 0, water: 0, cost: 15_000, upkeep: 100, pollution: 12, income: 500, area: 'quimica',
      mods: [{ mod: 'buildCost', mul: 0.9 }],
    },
  },
  usina_etanol: {
    name: 'Usina de etanol', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 40,
    utility: { power: 600, water: 0, cost: 20_000, upkeep: 150, pollution: 6, income: 700, area: 'quimica' },
  },
  instituto_pesquisa: {
    name: 'Instituto de pesquisa', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 30,
    utility: { power: 0, water: 0, cost: 25_000, upkeep: 600, pollution: 0, institute: true },
  },
  parque_tecnologico: {
    name: 'Parque tecnológico', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 40,
    utility: { power: 0, water: 0, cost: 35_000, upkeep: 400, pollution: 0, privateResearch: ['computacao', 'social'] },
  },
  petroquimica: {
    name: 'Complexo petroquímico', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 80,
    utility: { power: 0, water: 0, cost: 70_000, upkeep: 500, pollution: 22, income: 3_200, area: 'quimica' },
  },
  biotecnologia: {
    name: 'Indústria de biotecnologia', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 50,
    utility: { power: 0, water: 0, cost: 55_000, upkeep: 400, pollution: 2, income: 2_400, area: 'saude' },
  },
  torre_celular: {
    name: 'Torre de celular', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 1,
    utility: { power: 0, water: 0, cost: 4_000, upkeep: 60, pollution: 0, area: 'computacao', signal: { radius: 16, landValue: 0.05 } },
  },

  // --- Educação (escolas: ver systems/education.js) ---------------------------
  //   utility.school: { stage, seats, radius } — etapa de ensino (EDUCATION.stages),
  //     vagas de alunos e o raio (em tiles, da casa do aluno) que a escola atende
  //   utility.library: { radius, bonus } — estudantes no raio avançam `bonus` mais rápido
  creche: {
    name: 'Creche', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 6,
    utility: { power: 0, water: 0, cost: 4_000, upkeep: 180, pollution: 0, area: 'educacao', school: { stage: 'creche', seats: 60, radius: 10 } },
  },
  escola: {
    name: 'Escola primária', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 12,
    utility: { power: 0, water: 0, cost: 8_000, upkeep: 350, pollution: 0, area: 'educacao', school: { stage: 'fundamental', seats: 300, radius: 12 } },
  },
  escola_media: {
    name: 'Escola de ensino médio', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 20,
    utility: { power: 0, water: 0, cost: 15_000, upkeep: 500, pollution: 0, area: 'educacao', school: { stage: 'medio', seats: 400, radius: 18 } },
  },
  escola_tecnica: {
    name: 'Escola técnica', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 10,
    utility: { power: 0, water: 0, cost: 10_000, upkeep: 400, pollution: 0, area: 'engenharia', school: { stage: 'tecnico', seats: 150, radius: 20 } },
  },
  senai: {
    name: 'Centro de aprendizagem industrial', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 12,
    // Mantido pelas indústrias: manutenção baixa para a cidade.
    utility: { power: 0, water: 0, cost: 12_000, upkeep: 80, pollution: 0, area: 'engenharia', school: { stage: 'tecnico', seats: 250, radius: 24 } },
  },
  universidade: {
    name: 'Universidade', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 60,
    // Também é instituição de pesquisa: os professores pesquisam nas áreas com verba.
    utility: {
      power: 0, water: 0, cost: 60_000, upkeep: 1_500, pollution: 0, institute: true,
      school: { stage: 'superior', seats: 800, radius: 40 },
    },
  },
  biblioteca: {
    name: 'Biblioteca', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 4,
    utility: { power: 0, water: 0, cost: 5_000, upkeep: 120, pollution: 0, area: 'cultura', library: { radius: 12, bonus: 0.1 } },
  },

  // --- Serviços e lazer (cobertura: ver systems/services.js) -----------------
  //   utility.service: { kind, radius, strength } — tipo de cobertura
  //     (saude, policia, bombeiros, lazer), raio em tiles e quanto cobre no
  //     centro (1 = o máximo); a cobertura cai até a borda do raio. O prédio
  //     só cobre com funcionários.
  hospital: {
    name: 'Hospital', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 40,
    utility: { power: 0, water: 0, cost: 30_000, upkeep: 1_200, pollution: 0, area: 'saude', service: { kind: 'saude', radius: 24, strength: 1 } },
  },
  posto_saude: {
    name: 'Posto de vacinação', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 5,
    utility: { power: 0, water: 0, cost: 4_000, upkeep: 150, pollution: 0, area: 'saude', service: { kind: 'saude', radius: 10, strength: 0.4 } },
  },
  clinica: {
    name: 'Clínica de bairro', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 8,
    utility: { power: 0, water: 0, cost: 6_000, upkeep: 250, pollution: 0, area: 'saude', service: { kind: 'saude', radius: 12, strength: 0.7 } },
  },
  caps: {
    name: 'Centro de atenção psicossocial', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 8,
    utility: { power: 0, water: 0, cost: 6_000, upkeep: 250, pollution: 0, area: 'saude', service: { kind: 'lazer', radius: 14, strength: 0.6 } },
  },
  delegacia: {
    name: 'Delegacia de polícia', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 15,
    utility: { power: 0, water: 0, cost: 10_000, upkeep: 450, pollution: 0, area: 'seguranca', service: { kind: 'policia', radius: 16, strength: 1 } },
  },
  guarda_municipal: {
    name: 'Guarda municipal', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 8,
    utility: { power: 0, water: 0, cost: 5_000, upkeep: 200, pollution: 0, area: 'seguranca', service: { kind: 'policia', radius: 12, strength: 0.6 } },
  },
  central_cameras: {
    name: 'Central de videomonitoramento', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 6,
    utility: { power: 0, water: 0, cost: 12_000, upkeep: 400, pollution: 0, area: 'seguranca', service: { kind: 'policia', radius: 20, strength: 0.5 } },
  },
  quartel_bombeiros: {
    name: 'Quartel de bombeiros', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 12,
    utility: { power: 0, water: 0, cost: 9_000, upkeep: 400, pollution: 0, area: 'seguranca', service: { kind: 'bombeiros', radius: 16, strength: 1 } },
  },
  parque: {
    name: 'Praça', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 1,
    utility: { power: 0, water: 0, cost: 1_500, upkeep: 40, pollution: 0, area: 'ambiental', service: { kind: 'lazer', radius: 6, strength: 0.6 }, park: true },
  },
  cinema: {
    name: 'Cinema', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 10,
    utility: { power: 0, water: 0, cost: 6_000, upkeep: 100, pollution: 0, income: 300, area: 'cultura', service: { kind: 'lazer', radius: 14, strength: 0.7 }, tourism: { appeal: 0, works: 'filme' } },
  },
  ginasio: {
    name: 'Ginásio poliesportivo', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 10,
    utility: { power: 0, water: 0, cost: 12_000, upkeep: 300, pollution: 0, area: 'cultura', service: { kind: 'lazer', radius: 16, strength: 0.8 } },
  },
  mercado_municipal: {
    name: 'Mercado municipal', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 8,
    utility: { power: 0, water: 0, cost: 3_000, upkeep: 80, pollution: 0, income: 150, area: 'abastecimento', service: { kind: 'alimentos', radius: 10, strength: 0.75 } },
  },
  restaurante_popular: {
    name: 'Restaurante popular', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 12,
    utility: { power: 0, water: 0, cost: 5_000, upkeep: 300, pollution: 0, area: 'abastecimento', service: { kind: 'alimentos', radius: 8, strength: 1 } },
  },
  ceasa: {
    name: 'Central de abastecimento (Ceasa)', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 40,
    utility: { power: 0, water: 0, cost: 25_000, upkeep: 400, pollution: 3, area: 'abastecimento', mods: [{ mod: 'food.price', mul: 0.8 }] },
  },

  // --- Turismo e eventos (ver systems/tourism.js e events.js) ----------------
  //   utility.tourism: turistas por dia que a atração chama: `appeal` sempre,
  //     `game` em dia de jogo (domingo), `weekend` no sábado e no domingo
  //   utility.hotel: quartos (turistas que dormem na cidade gastam mais)
  //   utility.gateway: turistas chegam por aqui (além das estradas da borda)
  //   tourism.works: 'filme' | 'peca' — o público vem das obras em cartaz
  museu: {
    name: 'Museu', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 12,
    utility: { power: 0, water: 0, cost: 14_000, upkeep: 250, pollution: 0, area: 'cultura', service: { kind: 'lazer', radius: 12, strength: 0.7 }, tourism: { appeal: 25 } },
  },
  campo_futebol: {
    name: 'Campo de futebol do clube', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 8,
    utility: {
      power: 0, water: 0, cost: 6_000, upkeep: 120, pollution: 0, income: 400, area: 'cultura',
      service: { kind: 'lazer', radius: 10, strength: 0.6 }, tourism: { appeal: 0, game: 80 }, gated: { income: 'broadcast' },
    },
  },
  estadio: {
    name: 'Estádio', zone: ZONE.NONE, level: 0, size: 3, residents: 0, jobs: 30,
    utility: {
      power: 0, water: 0, cost: 60_000, upkeep: 900, pollution: 2, income: 2_500, area: 'cultura',
      service: { kind: 'lazer', radius: 18, strength: 0.8 }, tourism: { appeal: 5, game: 300 }, gated: { income: 'broadcast' },
    },
  },
  parque_tematico: {
    name: 'Parque temático', zone: ZONE.NONE, level: 0, size: 3, residents: 0, jobs: 60,
    utility: { power: 0, water: 0, cost: 45_000, upkeep: 700, pollution: 1, income: 1_200, area: 'cultura', service: { kind: 'lazer', radius: 20, strength: 0.8 }, tourism: { appeal: 30, weekend: 150 } },
  },
  // Pista de atletismo e parque aquático: casa dos clubes de atletismo e de
  // natação (ver systems/sports.js); o parque aquático também chama turistas.
  pista_atletismo: {
    name: 'Pista de atletismo', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 6,
    utility: { power: 0, water: 0, cost: 15_000, upkeep: 200, pollution: 0, area: 'cultura', service: { kind: 'lazer', radius: 12, strength: 0.6 } },
  },
  parque_aquatico: {
    name: 'Parque aquático', zone: ZONE.NONE, level: 0, size: 3, residents: 0, jobs: 30,
    utility: { power: 0, water: 0, cost: 35_000, upkeep: 500, pollution: 0, income: 800, area: 'cultura', service: { kind: 'lazer', radius: 18, strength: 0.8 }, tourism: { appeal: 20, weekend: 120 } },
  },
  hotel: {
    name: 'Hotel', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 20,
    utility: { power: 0, water: 0, cost: 12_000, upkeep: 200, pollution: 0, area: 'cultura', hotel: { rooms: 60 } },
  },
  // Arena de eventos: shows, festivais e torneios (a agenda é da parte B).
  arena_eventos: {
    name: 'Arena de eventos', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 15,
    utility: { power: 0, water: 0, cost: 20_000, upkeep: 350, pollution: 0, income: 500, area: 'cultura', service: { kind: 'lazer', radius: 14, strength: 0.7 }, tourism: { appeal: 10, weekend: 40 } },
  },
  // Teatro: as peças em cartaz (ver systems/culture.js) chamam o público.
  teatro: {
    name: 'Teatro', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 10,
    utility: { power: 0, water: 0, cost: 8_000, upkeep: 150, pollution: 0, income: 200, area: 'cultura', service: { kind: 'lazer', radius: 12, strength: 0.7 }, tourism: { appeal: 0, works: 'peca' } },
  },
  aeroporto: {
    name: 'Aeroporto', zone: ZONE.NONE, level: 0, size: 3, residents: 0, jobs: 50,
    utility: {
      power: 0, water: 0, cost: 80_000, upkeep: 1_200, pollution: 10, area: 'engenharia',
      gateway: { tourism: 1.5 }, freight: { range: 60, bonus: 0.05 },
    },
  },
  // Só pela ferramenta de revitalização (ver commands.js).
  centro_cultural: {
    name: 'Centro cultural', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 8,
    utility: { power: 0, water: 0, cost: 4_000, upkeep: 120, pollution: 0, area: 'cultura', service: { kind: 'lazer', radius: 10, strength: 0.7 }, tourism: { appeal: 12 } },
  },

  // --- Lixo e esgoto (ver systems/waste.js e sanitation.js) -------------------
  //   utility.waste: { radius, capacity } — recolhe o lixo dos prédios no raio
  //     até encher (b.fill guarda quanto já recebeu)
  //   utility.recycle: { radius, share } — o lixo dos prédios no raio vira share
  //   utility.sewage: esgoto tratado por hora (mesma unidade da água)
  //   utility.gated: { recurso: modificador } — só produz depois da pesquisa
  lixao: {
    name: 'Lixão', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 4,
    utility: { power: 0, water: 0, cost: 2_000, upkeep: 60, pollution: 6, area: 'ambiental', waste: { radius: 30, capacity: 60_000 } },
  },
  aterro: {
    name: 'Aterro sanitário', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 8,
    utility: {
      power: 800, water: 0, cost: 10_000, upkeep: 250, pollution: 2, area: 'ambiental',
      waste: { radius: 40, capacity: 250_000 }, gated: { power: 'biogas' },
    },
  },
  centro_reciclagem: {
    name: 'Centro de reciclagem', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 15,
    utility: { power: 0, water: 0, cost: 8_000, upkeep: 250, pollution: 1, income: 200, area: 'quimica', recycle: { radius: 14, share: 0.7 } },
  },
  estacao_esgoto: {
    name: 'Estação de tratamento de esgoto', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 12,
    utility: {
      power: 0, water: 1_200, cost: 15_000, upkeep: 400, pollution: 1, needsWater: true, area: 'saude',
      sewage: 3_000, gated: { water: 'reuso' },
    },
  },
  base_samu: {
    name: 'Base do SAMU', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 10,
    utility: { power: 0, water: 0, cost: 8_000, upkeep: 350, pollution: 0, area: 'saude', service: { kind: 'saude', radius: 22, strength: 0.5 } },
  },

  // --- Transporte público (ver systems/transit.js) ----------------------------
  //   utility.transit: { mode, radius } — quem mora E trabalha no raio de
  //     estações do mesmo modo viaja nele em vez de carro.
  ponto_onibus: {
    name: 'Garagem de ônibus', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 12,
    utility: { power: 0, water: 0, cost: 5_000, upkeep: 250, pollution: 3, area: 'engenharia', transit: { mode: 'onibus', radius: 10 } },
  },
  estacao_brt: {
    name: 'Estação de BRT', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 6,
    utility: { power: 0, water: 0, cost: 9_000, upkeep: 300, pollution: 1, area: 'engenharia', transit: { mode: 'brt', radius: 12 } },
  },
  estacao_vlt: {
    name: 'Estação de VLT', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 6,
    utility: { power: 0, water: 0, cost: 14_000, upkeep: 350, pollution: 0, area: 'engenharia', transit: { mode: 'vlt', radius: 12 } },
  },
  estacao_metro: {
    name: 'Estação de metrô', zone: ZONE.NONE, level: 0, size: 1, residents: 0, jobs: 10,
    utility: { power: 0, water: 0, cost: 30_000, upkeep: 600, pollution: 0, area: 'engenharia', transit: { mode: 'metro', radius: 14 } },
  },

  // --- Carga (ver systems/logistics.js) ----------------------------------------
  //   utility.freight: { range, bonus } — terminal de carga: a indústria a até
  //     `range` tiles de rua dele exporta a produção; `bonus` soma à receita.
  //   utility.supply: { radius } — abastece o comércio no raio (mais receita).
  patio_ferroviario: {
    name: 'Pátio ferroviário de carga', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 20,
    utility: { power: 0, water: 0, cost: 8_000, upkeep: 200, pollution: 4, area: 'abastecimento', freight: { range: 40, bonus: 0 } },
  },
  porto: {
    name: 'Porto de contêineres', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 40,
    utility: { power: 0, water: 0, cost: 35_000, upkeep: 500, pollution: 6, needsWater: true, area: 'abastecimento', freight: { range: 80, bonus: 0.1 } },
  },
  centro_distribuicao: {
    name: 'Centro de distribuição', zone: ZONE.NONE, level: 0, size: 2, residents: 0, jobs: 30,
    utility: { power: 0, water: 0, cost: 20_000, upkeep: 300, pollution: 2, area: 'abastecimento', freight: { range: 40, bonus: 0 }, supply: { radius: 30 } },
  },
};

/**
 * Andares de um prédio das zonas: só os necessários para a capacidade dele
 * (0 para os serviços públicos, que não têm perFloor).
 */
export function floorsOf(info) {
  if (!info.perFloor) return 0;
  return Math.ceil((info.residents || info.jobs) / info.perFloor);
}

/** Andares de um prédio já construído (os do tipo, mais os que cresceu). */
export function buildingFloors(b) {
  return b.floors ?? floorsOf(BUILDINGS[b.type]);
}

/** Moradores ou vagas de um prédio construído, contando os andares a mais. */
export function capacityOf(b) {
  const info = BUILDINGS[b.type];
  const base = info.residents || info.jobs;
  if (b.floors === undefined) return base;
  return base + (b.floors - floorsOf(info)) * info.perFloor;
}

/**
 * Até quantos andares um prédio do tipo `info` cresce na densidade dada.
 * `extra`: andares a mais na densidade alta, liberados pela pesquisa (aço
 * estrutural e estrutura tubular: os "níveis 4 e 5").
 */
export function maxFloorsFor(info, density, extra = 0) {
  if (!info.tall) return floorsOf(info);
  return Math.max(floorsOf(info), DENSITY_INFO[density].maxFloors + (density === DENSITY.HIGH ? extra : 0));
}

/**
 * Valor do terreno exigido para o andar `floor` de um prédio que cresce: o
 * do nível 3 no primeiro andar a mais, subindo até TOWER_LAND_VALUE no
 * andar mais alto possível (o limite da densidade alta).
 */
export function landValueForFloor(info, floor) {
  const base = floorsOf(info);
  const top = DENSITY_INFO[DENSITY.HIGH].maxFloors;
  const from = LAND_VALUE_FOR_LEVEL[info.zone][3];
  // Acima do limite da densidade alta (arranha-céus), vale o valor de torre.
  return Math.min(TOWER_LAND_VALUE, from + ((floor - base) / Math.max(1, top - base)) * (TOWER_LAND_VALUE - from));
}
export const TOWER_LAND_VALUE = 0.9;

export const UTILITY_TYPES = Object.keys(BUILDINGS).filter((id) => BUILDINGS[id].utility);

// Consumo de energia e água por morador ou vaga de emprego, por zona.
export const CONSUMPTION = {
  [ZONE.RESIDENTIAL]: { power: 1, water: 1.2 },
  [ZONE.COMMERCIAL]: { power: 1.5, water: 0.6 },
  [ZONE.INDUSTRIAL]: { power: 2.2, water: 1.4 },
  // Fazendas ficam fora da rede (ver isServed).
  [ZONE.RURAL]: { power: 0, water: 0 },
};

// Prédio sem energia ou água: a cada dia perde esta fração dos moradores ou
// funcionários; vazio por ABANDON_AFTER_DAYS dias vira abandonado, e
// abandonado por COLLAPSE_AFTER_DAYS dias desaba (o lote fica livre).
export const UNSERVED_LEAVE_SHARE = 0.25;
export const ABANDON_AFTER_DAYS = 3;
export const COLLAPSE_AFTER_DAYS = 15;

// Tipos 1x1 de cada nível, por zona: é o caminho de crescimento no lugar.
export const LEVELS = {};
// Tipos grandes (2x2) por zona: surgem em lotes vazios bem valorizados.
export const LARGE_BUILDINGS = {};
for (const [id, info] of Object.entries(BUILDINGS)) {
  if (info.utility) continue;
  if (info.size === 1) ((LEVELS[info.zone] ??= {})[info.level] ??= []).push(id);
  else (LARGE_BUILDINGS[info.zone] ??= []).push(id);
}
export const MAX_LEVEL = 3;

// Valor do terreno (0 a 1) necessário para um prédio chegar a cada nível.
// A indústria e as fazendas não ligam para valor do terreno, só para demanda e lotação.
export const LAND_VALUE_FOR_LEVEL = {
  [ZONE.RESIDENTIAL]: { 2: 0.45, 3: 0.62 },
  [ZONE.COMMERCIAL]: { 2: 0.45, 3: 0.6 },
  [ZONE.INDUSTRIAL]: { 2: 0, 3: 0 },
  [ZONE.RURAL]: { 2: 0, 3: 0 },
};

// Dias mínimos entre uma mudança de nível e a próxima.
export const DAYS_BETWEEN_UPGRADES = 3;

// Florestas: densidade de 1 a `maxDensity` (árvores por tile). A cada tick,
// com `growChance`, até `tilesPerTick` tiles sorteados crescem: mata fica mais
// densa, e grama livre ao lado de mata com pelo menos `spreadDensity` vira mata.
export const FOREST = {
  maxDensity: 6,
  growChance: 0.05,
  tilesPerTick: 5,
  spreadDensity: 3,
};

// Tipos de rua (o valor de state.map.road: 0 é sem rua). `speed` multiplica a
// velocidade dos carros, `capacity` é quantos carros cabem num tile antes de
// engarrafar, `cost` é o preço por tile (a avenida e a via expressa vêm da
// pesquisa) e `noise` é o barulho que ela faz em volta (desvaloriza o terreno).
export const ROAD_TYPES = {
  1: { id: 'rua', name: 'Rua', speed: 1, capacity: 3, cost: 10, noise: 0 },
  2: { id: 'avenida', name: 'Avenida', speed: 1.4, capacity: 6, cost: 25, noise: 0.03, tech: 'via_expressa' },
  3: { id: 'expressa', name: 'Via expressa', speed: 2, capacity: 10, cost: 60, noise: 0.08, tech: 'via_expressa' },
  // Calçadão: só pedestres (quem passa anda a pé, devagar, e não engarrafa);
  // valoriza o comércio em volta como `commerce` lojas a mais.
  4: { id: 'calcadao', name: 'Calçadão', speed: 0.5, capacity: 99, cost: 30, noise: 0, pedestrian: true, commerce: 1.5, tech: 'ciclovia_lazer' },
};

// Trânsito (ver systems/traffic.js): acima da capacidade do tile, os carros
// andam mais devagar: velocidade ÷ (1 + slowdown × excesso).
export const TRAFFIC = {
  slowdown: 1.5,
  // Peso de um passageiro de transporte público nas ruas (o ônibus leva muitos).
  busShare: 0.15,
  // Velocidade de cada modo de transporte público (o metrô não pega trânsito).
  modes: {
    onibus: { name: 'Ônibus', speed: 1, ignoresTraffic: false, fare: 0.04 },
    brt: { name: 'BRT', speed: 1.3, ignoresTraffic: true, fare: 0.05 },
    vlt: { name: 'VLT', speed: 1.4, ignoresTraffic: true, fare: 0.05 },
    metro: { name: 'Metrô', speed: 2, ignoresTraffic: true, fare: 0.06 },
  },
  // Poluição de um carro parado num tile (somada à da indústria no mapa).
  carPollution: 0.033,
};

export const COSTS = {
  road: 10,
  zone: 5,
  demolishRoad: 2,
  demolishBuilding: 20,
  clearForest: 5,
  // Marcar um tile de mata como parque de conservação.
  park: 3,
};

export const ECONOMY = {
  startMoney: 50_000,
  roadUpkeepPerMonth: 2,
  // Impostos por zona, em % (inteiros). O padrão é neutro para a demanda.
  taxDefault: 9,
  taxMin: 0,
  taxMax: 20,
  // Arrecadação por mês a cada 1% de imposto: por morador empregado
  // (residencial) e por vaga ocupada (comercial e industrial).
  incomePerWorker: 1.2,
  incomePerJob: 0.6,
  // Cada ponto percentual acima do padrão tira esta demanda da zona (e
  // abaixo do padrão, soma).
  taxDemandEffect: { residential: 4, commercial: 3, industrial: 3, rural: 3 },
  // Empréstimos: valores oferecidos, juros ao ano, número de parcelas mensais
  // e quantos podem estar abertos ao mesmo tempo.
  loanOptions: [25_000, 50_000, 100_000],
  loanAnnualRate: 0.1,
  loanMonths: 24,
  maxLoans: 3,
  // Meses guardados no histórico do orçamento.
  historyMonths: 36,
};

export const TAX_ZONES = ['residential', 'commercial', 'industrial', 'rural'];

// Alimentos (ver systems/food.js), em unidades por mês.
// Lixo (ver systems/waste.js), em unidades por dia.
// Creches (ver systems/childcare.js): quem trabalha e tem filho de 0 a 5
// anos sem vaga na creche rende só `productivity` do normal e acumula
// estresse (`rise` por dia, até o tamanho da penalidade; acima dele, baixa
// `fall` por dia). Com o filho na creche, a penalidade cai para `enrolled`
// (25%: rende 85% e o estresse para em 25%) e some depois da pesquisa
// Educação infantil. O estresse médio da casa tira satisfação e saúde.
export const CHILDCARE = {
  ages: [0, 5],
  productivity: 0.4,
  enrolled: 0.25,
  rise: 0.05,
  fall: 0.1,
  satisfaction: 0.25,
  health: 0.1,
};

// Cena cultural (ver systems/culture.js): artistas inventados com carreira,
// gêneros que entram e saem de moda, filmes e peças com temporada.
export const CULTURE = {
  // Artistas: quantos no começo, limite da lista e novatos por ano
  // (mais 1 a cada `newPerPeople` moradores, até `newMax`).
  startArtists: 40,
  maxArtists: 120,
  newBase: 2,
  newPerPeople: 2_000,
  newMax: 8,
  // Carreira: anos até começar a cair, meses com fama quase zero até se aposentar.
  veteranYears: 25,
  retireMonths: 18,
  // Gêneros: a partir de que ano do mundo surgem novatos (e até quando).
  genres: {
    modinha: { name: 'Modinha', kind: 'musica', from: 1900, until: 1930 },
    maxixe: { name: 'Maxixe', kind: 'musica', from: 1900, until: 1935 },
    samba: { name: 'Samba', kind: 'musica', from: 1910 },
    choro: { name: 'Choro', kind: 'musica', from: 1910, until: 1960 },
    marchinha: { name: 'Marchinha', kind: 'musica', from: 1920, until: 1970 },
    sertanejo: { name: 'Sertanejo', kind: 'musica', from: 1930, until: 2005 },
    samba_cancao: { name: 'Samba-canção', kind: 'musica', from: 1945, until: 1965 },
    bolero: { name: 'Bolero', kind: 'musica', from: 1945, until: 1975 },
    forro: { name: 'Forró', kind: 'musica', from: 1945 },
    baiao: { name: 'Baião', kind: 'musica', from: 1946, until: 1975 },
    rock: { name: 'Rock', kind: 'musica', from: 1955 },
    bossa: { name: 'Bossa nova', kind: 'musica', from: 1958, until: 1990 },
    jovem_guarda: { name: 'Jovem Guarda', kind: 'musica', from: 1964, until: 1975 },
    mpb: { name: 'MPB', kind: 'musica', from: 1965 },
    pop: { name: 'Pop', kind: 'musica', from: 1965 },
    tropicalia: { name: 'Tropicália', kind: 'musica', from: 1967, until: 1975 },
    brega: { name: 'Brega', kind: 'musica', from: 1970 },
    soul: { name: 'Soul', kind: 'musica', from: 1970, until: 1990 },
    disco: { name: 'Disco', kind: 'musica', from: 1975, until: 1985 },
    pagode: { name: 'Pagode', kind: 'musica', from: 1980 },
    rock_nacional: { name: 'Rock nacional', kind: 'musica', from: 1982, until: 2000 },
    axe: { name: 'Axé', kind: 'musica', from: 1985 },
    lambada: { name: 'Lambada', kind: 'musica', from: 1987, until: 1995 },
    rap: { name: 'Rap', kind: 'musica', from: 1988 },
    funk: { name: 'Funk', kind: 'musica', from: 1990 },
    eletronica: { name: 'Eletrônica', kind: 'musica', from: 1995 },
    tecnobrega: { name: 'Tecnobrega', kind: 'musica', from: 2002 },
    sertanejo_universitario: { name: 'Sertanejo universitário', kind: 'musica', from: 2005 },
    arrocha: { name: 'Arrocha', kind: 'musica', from: 2005 },
    trap: { name: 'Trap', kind: 'musica', from: 2015 },
    piseiro: { name: 'Piseiro', kind: 'musica', from: 2018 },
    comedia: { name: 'Comédia', kind: 'teatro', from: 1910 },
    drama: { name: 'Drama', kind: 'teatro', from: 1910 },
    revista: { name: 'Teatro de revista', kind: 'teatro', from: 1910, until: 1960 },
    musical: { name: 'Musical', kind: 'teatro', from: 1930 },
    infantil: { name: 'Teatro infantil', kind: 'teatro', from: 1950 },
    standup: { name: 'Stand-up', kind: 'teatro', from: 2005 },
  },
  // Filmes e peças: gêneros (com o ano do mundo em que aparecem), quantos
  // estreiam por mês e duração em cartaz (dias).
  workGenres: {
    filme: { 'comédia': 1900, drama: 1900, romance: 1900, 'animação': 1940, 'ação': 1950, terror: 1950, aventura: 1950 },
    peca: { 'comédia': 1900, drama: 1900, musical: 1930, infantil: 1950 },
  },
  premieres: { filme: 3, peca: 2 },
  run: { filme: [28, 70], peca: [42, 112] },
  peak: [14, 28],
  // Turistas por dia de cada cinema/teatro com uma obra no auge.
  appeal: { filme: 15, peca: 10 },
  // Palavras para os nomes inventados.
  stagePrefix: { rap: 'MC', funk: 'MC', trap: 'MC', eletronica: 'DJ', tecnobrega: 'DJ' },
  // Bandas: substantivo no plural + complemento que concorda com qualquer gênero.
  bandNouns: ['Luas', 'Estrelas', 'Tambores', 'Ventos', 'Cometas', 'Raízes', 'Ondas', 'Faróis', 'Corsários', 'Girassóis', 'Trovões', 'Andorinhas', 'Cactos', 'Vagalumes', 'Pandeiros'],
  bandAdjectives: ['Azuis', 'do Norte', 'Selvagens', 'de Prata', 'do Cais', 'Livres', 'do Morro', 'Errantes', 'de Neon', 'Gigantes', 'do Asfalto', 'Imortais'],
  // Títulos: o artigo vem junto (concorda com o substantivo).
  titleNouns: ['O Segredo', 'O Caminho', 'O Silêncio', 'O Último Verão', 'O Farol', 'O Herdeiro', 'O Baile', 'A Viagem', 'O Sonho', 'O Retrato', 'A Noite', 'O Rio', 'O Jardim', 'A Promessa', 'A Herança'],
  titlePlaces: ['da Serra', 'do Sertão', 'da Cidade', 'de Copacabana', 'do Interior', 'da Praia', 'do Morro', 'de Ninguém', 'do Porto', 'da Estação'],

  // Agenda de eventos (ver systems/agenda.js).
  //   venues: onde cada tipo pode acontecer; artists: quantos artistas
  //   [mín, máx] (0 = sem artista); days: duração [mín, máx]; hours: de que
  //   horas a que horas (o público chega antes); tech: tecnologia que libera
  //   (ou mod: modificador que libera).
  eventTypes: {
    show: { name: 'Show', venues: ['arena_eventos', 'estadio', 'parque', 'calcadao'], artists: [1, 1], days: [1, 1], hours: [20, 23], power: null },
    festival: { name: 'Festival', venues: ['arena_eventos', 'estadio', 'parque_tematico', 'calcadao'], artists: [2, 6], days: [1, 3], hours: [14, 23], tech: 'televisao' },
    mostra: { name: 'Mostra de cinema', venues: ['cinema'], artists: [0, 0], days: [1, 7], hours: [18, 23], power: 'filme' },
    teatro: { name: 'Temporada de teatro', venues: ['teatro'], artists: [0, 1], days: [3, 10], hours: [20, 22], power: 'peca' },
    feira: { name: 'Feira cultural', venues: ['parque', 'calcadao'], artists: [0, 2], days: [1, 2], hours: [10, 17], power: 0.4 },
    esports: { name: 'Torneio de eSports', venues: ['arena_eventos'], artists: [0, 0], days: [1, 2], hours: [14, 21], power: 0.6, mod: 'event.esports' },
  },
  // Capacidade de cada local (o calçadão: por tile do trecho) e aluguel por dia.
  venues: {
    arena_eventos: { capacity: 3_000 },
    estadio: { capacity: 20_000, rent: 8_000 },
    parque_tematico: { capacity: 8_000, rent: 4_000 },
    parque: { capacity: 800 },
    cinema: { capacity: 300 },
    teatro: { capacity: 400 },
    calcadao: { perTile: 150, maxTiles: 60 },
  },
  // Cachê por apresentação: base × (0,2 + fama²).
  fee: 20_000,
  // Ingresso padrão e quanto o preço pesa no público.
  ticket: 20,
  priceElasticity: 0.8,
  // Propaganda: 1 + k × ln(1 + verba / scale).
  marketing: { k: 0.6, scale: 5_000 },
  // Público potencial: parte da população e, com estrada saindo do mapa (ou
  // aeroporto), gente de fora (parte da população mais uma base regional).
  audience: { city: 0.35, outside: 0.15, regional: 2_000 },
  weekend: 1.3,
  noise: 0.15,
  // Lotação para contar como sucesso e como fracasso.
  success: 0.7,
  flop: 0.35,
  // Mínimo e máximo de dias de antecedência para agendar.
  minDays: 7,
  maxDays: 120,
  // Turnê: meses sem show na cidade até o artista sair em turnê, e até um
  // artista da cidade (que já tem alguma fama) se mudar com a família.
  touringMonths: 6,
  leaveMonths: 12,
  leaveFame: 0.2,
  // Artista da cidade larga o emprego e vive da arte com esta fama.
  fullTimeFame: 0.25,
  // Vocação dos cidadãos (arte, esporte) e o talento mínimo para virar artista.
  // A *Educação física escolar* aumenta a vocação para o esporte (mod calling.esporte).
  calling: { arte: 0.08, esporte: 0.08 },
  artistTalent: 0.6,
};

// Esporte (ver systems/sports.js): clubes da cidade, com atletas cidadãos,
// jogando ligas contra cidades rivais inventadas.
//   kinds: modalidades. venues: onde o clube manda os jogos; weekday: dia do
//   jogo (0 = segunda ... 6 = domingo); hour: início; squad/starters: elenco e
//   titulares; season: [mês de início, mês de fim]; score: como o placar é
//   sorteado; tech: pesquisa que libera; points: [vitória, empate, derrota]
//   (no vôlei, a vitória por 3 a 2 vale 2 e a derrota por 2 a 3 vale 1).
export const SPORTS = {
  kinds: {
    futebol: { name: 'Futebol', venues: ['campo_futebol', 'estadio'], weekday: 6, hour: 16, squad: 22, starters: 11, season: [3, 11], score: 'gols', goals: 1.3, tech: 'futebol_profissional', points: [3, 1, 0] },
    futsal: { name: 'Futsal', venues: ['ginasio'], weekday: 5, hour: 19, squad: 12, starters: 5, season: [4, 10], score: 'gols', goals: 3, tech: 'ginasio', points: [3, 1, 0] },
    volei: { name: 'Vôlei', venues: ['ginasio'], weekday: 5, hour: 19, squad: 14, starters: 6, season: [4, 10], score: 'sets', tech: 'ginasio', points: [3, 0, 0] },
    basquete: { name: 'Basquete', venues: ['ginasio'], weekday: 5, hour: 19, squad: 13, starters: 5, season: [4, 10], score: 'pontos', tech: 'ginasio', points: [2, 0, 1] },
    handebol: { name: 'Handebol', venues: ['ginasio'], weekday: 5, hour: 19, squad: 14, starters: 7, season: [4, 10], score: 'gols', goals: 26, tech: 'ginasio', points: [2, 1, 0] },
    criquete: { name: 'Críquete', venues: ['campo_futebol', 'estadio'], weekday: 6, hour: 10, squad: 15, starters: 11, season: [3, 11], score: 'pontos', base: 160, spread: 50, tech: 'futebol_profissional', points: [2, 1, 0] },
    // Individuais: a temporada é feita de etapas (todos os times competem no
    // mesmo dia, numa sede que gira); starters = atletas que competem por
    // time; events: provas, com o artigo (para as notícias).
    atletismo: { name: 'Atletismo', individual: true, venues: ['pista_atletismo'], weekday: 5, hour: 9, squad: 12, starters: 4, season: [4, 10], tech: 'educacao_fisica', events: ['nos 100 m', 'nos 400 m', 'no salto em distância', 'no arremesso de peso', 'na maratona'] },
    ginastica: { name: 'Ginástica artística', individual: true, venues: ['ginasio'], weekday: 5, hour: 15, squad: 8, starters: 4, season: [4, 10], tech: 'ginasio', events: ['no solo', 'no salto', 'nas barras assimétricas', 'na trave', 'nas argolas'] },
    natacao: { name: 'Natação', individual: true, venues: ['parque_aquatico'], weekday: 6, hour: 9, squad: 10, starters: 4, season: [4, 10], tech: 'parque_tematico', events: ['nos 50 m livre', 'nos 100 m borboleta', 'nos 200 m medley', 'nos 1.500 m livre'] },
  },
  // Etapas das modalidades individuais: quantas por temporada e os pontos por colocação.
  meets: 8,
  meetPoints: [10, 8, 6, 5, 4, 3, 2, 1],
  meetNoise: 0.08,
  // Lugares no estádio, no campo do clube e no ginásio; bônus de força de mandar o jogo ali.
  venues: {
    campo_futebol: { capacity: 2_000, bonus: 0 },
    estadio: { capacity: 20_000, bonus: 0.04 },
    ginasio: { capacity: 1_500, bonus: 0 },
    pista_atletismo: { capacity: 3_000, bonus: 0.02 },
    parque_aquatico: { capacity: 1_500, bonus: 0.02 },
  },
  // Divisões: força média das rivais, prêmio do campeão (os outros ganham
  // menos, pela posição) e patrocínio por mês.
  divisions: [
    { name: 'Estadual', strength: 0.35, prize: 20_000, sponsor: 2_000, broadcast: 1_000 },
    { name: 'Regional', strength: 0.5, prize: 80_000, sponsor: 8_000, broadcast: 5_000 },
    { name: 'Nacional', strength: 0.65, prize: 400_000, sponsor: 40_000, broadcast: 25_000 },
  ],
  teams: 8,
  up: 2,
  down: 2,
  foundCost: 15_000,
  // Salário por atleta: salary × (0,5 + habilidade).
  salary: 300,
  ticket: 10,
  // Parte do ingresso que fica com a prefeitura (taxa municipal).
  cityShare: 0.1,
  // Público: parte da população (mais gente de fora, se há por onde chegar),
  // vezes (0,3 + torcida) e (0,5 + força).
  audience: { city: 0.25, regional: 600 },
  // Treino: a habilidade sobe growth × (0,3 + ln(1 + verba / scale)) por mês
  // até peakAge, fica parada até declineAge e depois cai decline por mês.
  training: { growth: 0.006, scale: 5_000 },
  peakAge: 27,
  declineAge: 31,
  decline: 0.008,
  ages: [18, 34],
  // Centro de treinamento: custo de cada nível e ganho de habilidade por nível.
  ct: { cost: [30_000, 80_000, 200_000], bonus: 0.15, strength: 0.02 },
  // Escolinha de base: cada nível abre uma categoria (da mais velha para a
  // mais nova; começar cedo dá mais anos de evolução). Custo dos níveis
  // (prefeitura), vagas por categoria, custo por aluno por mês (clube) e a
  // evolução por mês: growth × (0,3 + ln(1 + verba / scale)) × (1 + CT).
  academy: {
    categories: [
      { id: 'sub17', name: 'Sub-17', ages: [15, 17] },
      { id: 'sub15', name: 'Sub-15', ages: [11, 14] },
      { id: 'sub11', name: 'Sub-11', ages: [8, 10] },
    ],
    cost: [20_000, 50_000, 120_000],
    seats: 15,
    perKid: 60,
    growth: 0.012,
    scale: 3_000,
  },
  // Mercado: craque é quem tem habilidade ≥ força da divisão + star (ou ≥
  // minStar). Chance de proposta por mês; valor = base × hab³ × (jovem: ×young)
  // × (1 + divisão × division) × sorteio de 0,8 a 1,2. Validade em dias; quem
  // recusa só recebe outra proposta pelo atleta depois de cooldown meses.
  market: { star: 0.15, minStar: 0.6, chance: 0.12, base: 300_000, youngAge: 23, young: 1.5, division: 0.5, days: 30, cooldown: 3, sales: 20 },
  buyers: ['Atlético Metropolitano', 'Real Capital', 'Esporte Clube Litoral', 'União Paulistana', 'Sociedade Esportiva Planalto', 'Grêmio Industrial', 'Clube Atlético Cosmopolita', 'Fluminense do Sul', 'Internacional da Serra', 'Sporting Atlântico'],
  // Corrida de rua (ver systems/races.js): fecha o percurso das closed[0]h às
  // closed[1]h; largada às start h. Custo = base + perTile × tiles; inscrição
  // por corredor (vai para a prefeitura). Corredores = pop × share × (1 +
  // propaganda) + regional (com estrada para fora), até max. pace: fração da
  // velocidade de um carro. Cada tile vale km quilômetros.
  race: {
    tech: 'educacao_fisica', closed: [6, 12], start: 7, base: 5_000, perTile: 100, fee: 15,
    share: 0.03, regional: 500, max: 3_000, marketing: { k: 0.5, scale: 5_000 },
    tiles: [10, 300], days: [7, 120], pace: 0.25, km: 0.1,
  },
  // Meses no vermelho até o clube perder atletas.
  redMonths: 3,
  // Reinvestir: caixa acima de tantos meses de despesas vira treino.
  reserveMonths: 6,
  // Nomes inventados das rivais: "{time} de {cidade}".
  rivalTeams: ['Ferroviário', 'Operário', 'União', 'Atlético', 'Comercial', 'Guarani', 'Independente', 'Esporte Clube', 'Ypiranga', 'Industrial', 'Juventude', 'Palmeirense', 'Real', 'América', 'Botafogo', 'Náutico'],
  rivalCities: ['Vila Serrana', 'São Bento da Mata', 'Porto do Sul', 'Santa Clara do Rio', 'Campo Belo', 'Serra Azul', 'Lagoa Seca', 'Rio Claro do Norte', 'Monte Verde', 'Pedra Branca', 'Barra Funda', 'Vale do Sol', 'Bom Jardim', 'Três Pontes', 'Águas Claras', 'Nova Esperança', 'Porto Real', 'Cachoeira Alta', 'São Miguel', 'Santa Rita'],
};

// Turismo (ver systems/tourism.js).
// Notícias (ver systems/news.js): a imprensa da cidade transforma o que
// acontece em notícias, que são também os avisos para o jogador.
export const NEWS = {
  // Do mais antigo ao mais novo: o veículo, o ícone (ui/icons.js) e a tecnologia que o libera
  // (o setor de empresa de cada um está em SECTORS).
  media: {
    jornal: { name: 'Jornal', era: 'Era do jornal', icon: 'news', sector: 'jornal' },
    radio: { name: 'Rádio', era: 'Era do rádio', icon: 'radio', sector: 'radio', tech: 'radio' },
    tv: { name: 'Televisão', era: 'Era da televisão', icon: 'tv', sector: 'tv', tech: 'televisao' },
    portal: { name: 'Internet', era: 'Era da internet', icon: 'web', sector: 'portal', tech: 'internet' },
    social: { name: 'Redes sociais', era: 'Era das redes sociais', icon: 'phone', sector: 'digital', tech: 'smartphone' },
  },
  // Sem imprensa local, só a regional dá as notícias importantes da cidade.
  regional: { jornal: 'Folha da Região', radio: 'Rádio Nacional', tv: 'TV Regional', portal: 'Portal da Região', social: 'Portal da Região' },
  // Veículos: além do primeiro de cada tipo (minPop em SECTORS), mais um a
  // cada `peoplePerOutlet` moradores, até `maxOutlets`; chance de um andar
  // comercial vago virar redação quando a cidade quer mais imprensa.
  peoplePerOutlet: 3_000,
  maxOutlets: 12,
  openChance: 0.35,
  // Notícias guardadas no save (as mais antigas saem).
  maxItems: 120,
  // Notícias "de rotina" (fofoca, crítica, curiosidade, boato) por dia:
  // base + por veículo local, até o teto.
  daily: { base: 0.05, perOutlet: 0.12, max: 1.2 },
  // Peso de cada tipo de notícia de rotina, por veículo: as redes sociais
  // fofocam e espalham boatos; o jornal critica e informa.
  mix: {
    jornal: { fofoca: 3, critica: 2, cidade: 4, boato: 0.4 },
    radio: { fofoca: 4, critica: 2, cidade: 3, boato: 0.6 },
    tv: { fofoca: 5, critica: 1.5, cidade: 3, boato: 0.5 },
    portal: { fofoca: 5, critica: 2, cidade: 2, boato: 1.2 },
    social: { fofoca: 6, critica: 2, cidade: 1, boato: 3 },
  },
  // Dias até a checagem desmentir um boato (se houver imprensa séria) e o
  // limite de boatos esperando checagem.
  debunkDays: [3, 12],
  maxPendingFakes: 4,
  // Problemas da cidade: limite para virar notícia e dias até poder voltar a
  // ser notícia (o fim do problema também é notícia).
  cooldownDays: 30,
  problems: {
    energia: 0.05, // parte dos prédios sem energia
    agua: 0.05, // sem água
    desemprego: 0.12, // desempregados ÷ quem pode trabalhar
    crime: 0.35, // índice médio de crime
    saude: 0.4, // saúde média abaixo disso
    transito: 0.15, // ruas acima da capacidade no rush das 8h
    lixo: 0.08, // prédios sem coleta
    esgoto: 0.35, // esgoto sem tratamento
    abandono: 0.06, // prédios abandonados
    creche: 0.05, // pais sem vaga na creche ÷ quem trabalha
    satisfacao: 0.35, // satisfação média abaixo disso
  },
  // Críticas: fator de insatisfação (perda média de satisfação) que vira pauta.
  complaintMin: 0.03,
  // População que vira manchete.
  milestones: [100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000],
};

export const TOURISM = {
  // Gasto de um turista que vem passar o dia, e a mais de quem dorme num hotel.
  daySpend: 3,
  hotelSpend: 8,
  // Turistas por dia de cada tile de parque de conservação.
  parkAppeal: 0.15,
  // Horário de chegada (minutos do dia) e quanto tempo cada um fica (minutos).
  arrive: [8 * 60, 13 * 60],
  stay: [3 * 60, 5 * 60],
  // Jogo de domingo: torcida chega para o jogo das 16h e fica 3 horas.
  gameArrive: [14 * 60, 15 * 60 + 45],
  gameEnd: 19 * 60,
  // Parte da torcida que é da própria cidade (sai de casa).
  localFans: 0.5,
  // Limite de turistas andando ao mesmo tempo (desempenho).
  maxVisitors: 600,
  // Carnaval (fevereiro, dias 10 a 14) e megaevento (julho, a cada 4 anos).
  carnaval: { month: 2, days: [10, 14], tourists: 120, multiplier: 1.5, satisfaction: 0.05 },
  mega: { month: 7, every: 4, multiplier: 3 },
};

export const WASTE = {
  perResident: 0.05,
  perJob: { commercial: 0.03, industrial: 0.06, rural: 0.01 },
  // Peso, na poluição em volta, de cada unidade de lixo por dia sem coleta
  // (um quarteirão denso sem coleta chega a uns 30% de poluição).
  pollution: 0.03,
};

// Esgoto (ver systems/sanitation.js): o esgoto de cada prédio é o consumo de
// água dele. O que não é tratado polui os rios; casas que bebem água de bomba
// em rio poluído adoecem.
export const SANITATION = {
  // Saúde perdida com o rio todo poluído e toda a água vindo de bombas.
  health: 0.08,
};

export const FOOD = {
  // Consumo de cada morador, e a fração a mais que se perde no caminho
  // (a cadeia do frio reduz).
  perResident: 1,
  waste: 0.3,
  // Quanto uma vaga de fazenda produz, em média (para a demanda rural).
  perJob: 7,
  // Preço da unidade importada quando falta e da exportada quando sobra.
  importPrice: 0.6,
  exportPrice: 0.25,
  // Fazenda em areia produz esta fração (a agricultura tropical resolve).
  sand: 0.5,
  // Comércio de nível 2 (o mercado) também vende alimentos no raio.
  market: { radius: 6, strength: 0.6 },
};

// Pesquisa (ver systems/research.js e world/techs.js).
export const RESEARCH = {
  // Quantos anos o mundo avança a cada ano de jogo.
  worldPace: 3,
  // Antes de o mundo chegar a uma tecnologia, ela custa este tanto a mais.
  pioneerMultiplier: 3,
  // Pontos por mês, numa área, de um instituto lotado recebendo fundingRef.
  pointsPerInstitute: 20,
  fundingRef: 1_000,
  // Verba por área: $ por mês, de 0 até fundingMax, em passos de fundingStep.
  fundingMax: 10_000,
  fundingStep: 250,
  // Prédios que atuam numa área pesquisam 15× mais devagar que um instituto.
  fieldShare: 1 / 15,
  // Pesquisador com pós-graduação (depois da tecnologia) vale por este tanto.
  posWeight: 2,
  // Uma área rende até este tanto a mais quando todos os pesquisadores são
  // formados nela (proporcional aos que são).
  fieldBonus: 0.5,
  // P&D privado: pontos por mês por vaga ocupada de escritório (comércio
  // nível 3) perto de um parque tecnológico.
  privatePerJob: 0.05,
  privateRadius: 10,
};

// Um prédio só cresce se houver estrada a até esta distância (em tiles).
export const ROAD_ACCESS_RADIUS = 2;

// Turnos de trabalho. Cada contratação sorteia um turno pela fração `share`;
// os horários de saída de casa (`leave`) e do trabalho (`back`) são sorteados
// dentro das faixas, em minutos do dia. Em vez de `back`, `hours` dá a
// duração da jornada (a volta é calculada a partir da saída de cada um).
// Turnos que passam da meia-noite voltam para casa no dia seguinte.
const hm = (h, m = 0) => h * 60 + m;
export const SHIFTS = {
  diurno: { name: 'Diurno', share: 0.8, leave: [hm(6, 30), hm(8, 30)], back: [hm(16, 30), hm(18, 30)] },
  noturno: { name: 'Noturno', share: 0.07, leave: [hm(21), hm(23)], back: [hm(6), hm(7, 30)] },
  madrugada: { name: 'Madrugada', share: 0.03, leave: [hm(0), hm(4, 30)], hours: [hm(8), hm(9)] },
  manha: { name: 'Meio período (manhã)', share: 0.05, leave: [hm(7), hm(9)], back: [hm(12), hm(13, 30)] },
  tarde: { name: 'Meio período (tarde)', share: 0.05, leave: [hm(12, 30), hm(14)], back: [hm(17, 30), hm(19, 30)] },
};

// Empresas: ocupam andares inteiros dos prédios comerciais e industriais, e
// cada andar alugado dá perFloor vagas do prédio. Andar sem empresa fica
// vago ("aluga-se") e não tem vagas. Cada setor tem os turnos dos seus
// funcionários (frações, como em SHIFTS) e um modelo de nome ({L} e {M} são
// sobrenomes sorteados).
//   kind: 'varejo' (térreos e lojas), 'escritorio' (andares de escritórios)
//         ou 'industria' (uma empresa ocupa o prédio industrial inteiro)
export const SECTORS = {
  padaria: { name: 'Padaria', kind: 'varejo', label: 'Padaria {L}', shifts: { madrugada: 0.2, diurno: 0.65, manha: 0.1, tarde: 0.05 } },
  mercadinho: { name: 'Mercadinho', kind: 'varejo', label: 'Mercadinho {L}', shifts: { diurno: 0.85, manha: 0.05, tarde: 0.1 } },
  farmacia: { name: 'Farmácia', kind: 'varejo', label: 'Farmácia {L}', shifts: { diurno: 0.8, noturno: 0.1, tarde: 0.1 } },
  restaurante: { name: 'Restaurante', kind: 'varejo', label: 'Restaurante {L}', shifts: { diurno: 0.75, tarde: 0.15, noturno: 0.1 } },
  bar: { name: 'Bar', kind: 'varejo', label: 'Bar {L}', shifts: { diurno: 0.3, tarde: 0.35, noturno: 0.35 } },
  roupas: { name: 'Loja de roupas', kind: 'varejo', label: '{L} Modas', shifts: { diurno: 0.9, manha: 0.05, tarde: 0.05 } },
  contabilidade: { name: 'Contabilidade', kind: 'escritorio', label: 'Contabilidade {L}', shifts: { diurno: 0.9, manha: 0.05, tarde: 0.05 } },
  advocacia: { name: 'Advocacia', kind: 'escritorio', label: '{L} & {M} Advogados', shifts: { diurno: 1 } },
  tecnologia: { name: 'Tecnologia', kind: 'escritorio', label: '{L} Tecnologia', shifts: { diurno: 0.85, tarde: 0.15 } },
  clinica: { name: 'Clínica', kind: 'escritorio', label: 'Clínica {L}', shifts: { diurno: 0.7, manha: 0.15, tarde: 0.15 } },
  atendimento: { name: 'Central de atendimento', kind: 'escritorio', label: '{L} Atendimento', shifts: { diurno: 0.55, tarde: 0.2, noturno: 0.15, madrugada: 0.1 } },
  metalurgica: { name: 'Metalúrgica', kind: 'industria', label: 'Metalúrgica {L}', shifts: { diurno: 0.8, noturno: 0.12, madrugada: 0.08 } },
  alimentos: { name: 'Alimentos', kind: 'industria', label: '{L} Alimentos', shifts: { diurno: 0.75, noturno: 0.1, madrugada: 0.1, manha: 0.05 } },
  textil: { name: 'Têxtil', kind: 'industria', label: 'Têxtil {L}', shifts: { diurno: 0.8, tarde: 0.1, noturno: 0.1 } },
  logistica: { name: 'Logística', kind: 'industria', label: '{L} Logística', shifts: { diurno: 0.7, noturno: 0.15, madrugada: 0.1, manha: 0.025, tarde: 0.025 } },
  quimica: { name: 'Química', kind: 'industria', label: 'Química {L}', shifts: { diurno: 0.8, noturno: 0.1, madrugada: 0.1 } },
  graos: { name: 'Grãos', kind: 'agro', label: 'Fazenda {L}', shifts: { diurno: 0.95, manha: 0.05 } },
  hortifruti: { name: 'Hortifrúti', kind: 'agro', label: 'Sítio {L}', shifts: { diurno: 0.9, madrugada: 0.1 } },
  laticinios: { name: 'Laticínios', kind: 'agro', label: 'Laticínios {L}', shifts: { diurno: 0.7, madrugada: 0.3 } },
  // Imprensa (ver NEWS): abre no comércio conforme a cidade cresce, do jornal
  // às redes sociais, cada uma depois da tecnologia dela. Quem trabalha nelas
  // são os jornalistas que assinam as notícias. {C} é o nome da cidade e {l},
  // o sobrenome em minúsculas e sem acento.
  jornal: {
    name: 'Jornal', kind: 'midia', medium: 'jornal', minPop: 80,
    labels: ['Diário {L}', 'Gazeta {L}', 'Folha de {C}', 'Correio {L}', 'Jornal de {C}', 'A Tribuna {L}'],
    shifts: { diurno: 0.55, tarde: 0.2, noturno: 0.15, madrugada: 0.1 },
  },
  radio: {
    name: 'Rádio', kind: 'midia', medium: 'radio', tech: 'radio', minPop: 300,
    labels: ['Rádio {L} AM', 'Rádio Cidade {L}', 'Rádio {C}', 'Rádio Sociedade {L}'],
    shifts: { madrugada: 0.2, diurno: 0.5, tarde: 0.2, noturno: 0.1 },
  },
  tv: {
    name: 'Emissora de TV', kind: 'midia', medium: 'tv', tech: 'televisao', minPop: 1_500,
    labels: ['TV {L}', 'Rede {L} de Televisão', 'TV {C}', 'Canal {L}'],
    shifts: { diurno: 0.5, tarde: 0.25, noturno: 0.15, madrugada: 0.1 },
  },
  portal: {
    name: 'Portal de notícias', kind: 'midia', medium: 'portal', tech: 'internet', minPop: 600,
    labels: ['{l}.com.br', 'Portal {L}', 'Notícias de {C}', '{C} Online'],
    shifts: { diurno: 0.6, tarde: 0.25, noturno: 0.15 },
  },
  digital: {
    name: 'Produtora de conteúdo digital', kind: 'midia', medium: 'social', tech: 'smartphone', minPop: 400,
    labels: ['@{l}news', '{L} Digital', '@fala{l}', 'Canal {L} Play'],
    shifts: { diurno: 0.5, tarde: 0.35, noturno: 0.15 },
  },
};

// Uma empresa nova tem COMPANY_GRACE_DAYS dias para contratar; depois, se
// passar COMPANY_CLOSE_DAYS dias seguidos com menos da metade das vagas
// preenchidas, fecha e o andar volta a ficar vago.
export const COMPANY_GRACE_DAYS = 7;
export const COMPANY_CLOSE_DAYS = 20;
// Chance por hora de uma empresa nova abrir num andar vago, havendo demanda.
export const COMPANY_OPEN_CHANCE = 0.1;

// Escolaridade dos cidadãos (citizen.edu) e etapas de ensino das escolas.
//   EDU: 0 nenhuma, 1 fundamental, 2 médio ou técnico, 3 superior, 4 pós-graduação
//   stages: idade de entrada, escolaridade exigida, anos de curso e a que
//     escolaridade leva. `full`: estudante em tempo integral não trabalha.
export const EDU = { NONE: 0, FUNDAMENTAL: 1, MEDIO: 2, SUPERIOR: 3, POS: 4 };
export const EDU_NAMES = ['Sem escolaridade', 'Fundamental', 'Médio', 'Superior', 'Pós-graduação'];
export const EDUCATION = {
  stages: {
    creche: { name: 'Creche', ages: [0, 5], needs: 0, years: 0, gives: 0 },
    fundamental: { name: 'Ensino fundamental', ages: [6, 14], needs: 0, years: 9, gives: EDU.FUNDAMENTAL, full: true },
    medio: { name: 'Ensino médio', ages: [15, 19], needs: EDU.FUNDAMENTAL, years: 3, gives: EDU.MEDIO, full: true },
    // Curso técnico: à noite, aceita adultos que trabalham.
    tecnico: { name: 'Curso técnico', ages: [15, 45], needs: EDU.FUNDAMENTAL, years: 2, gives: EDU.MEDIO },
    superior: { name: 'Graduação', ages: [18, 30], needs: EDU.MEDIO, years: 4, gives: EDU.SUPERIOR, full: true },
    // Pós-graduação: na universidade, depois da tecnologia de pós-graduação.
    pos: { name: 'Pós-graduação', ages: [22, 40], needs: EDU.SUPERIOR, years: 2, gives: EDU.POS, full: true },
    // Educação de jovens e adultos: à noite, na escola primária (com a lei).
    eja: { name: 'Educação de jovens e adultos', ages: [18, 60], needs: EDU.NONE, years: 2, gives: EDU.FUNDAMENTAL },
  },
  // Quem passou pela creche começa o fundamental com este adiantamento (anos).
  crecheHeadStart: 1,
  // Escolaridade mínima para trabalhar, por zona e nível do prédio (ou tipo
  // de prédio do jogador). Quem estudou mais pode pegar vaga menor.
  jobs: {
    residential: {},
    commercial: { 1: EDU.NONE, 2: EDU.FUNDAMENTAL, 3: EDU.MEDIO },
    industrial: { 1: EDU.NONE, 2: EDU.FUNDAMENTAL, 3: EDU.FUNDAMENTAL },
    rural: { 1: EDU.NONE, 2: EDU.NONE, 3: EDU.FUNDAMENTAL },
    buildings: {
      instituto_pesquisa: EDU.SUPERIOR, universidade: EDU.SUPERIOR, parque_tecnologico: EDU.SUPERIOR,
      biotecnologia: EDU.SUPERIOR, petroquimica: EDU.MEDIO, escola_media: EDU.SUPERIOR,
      escola: EDU.MEDIO, escola_tecnica: EDU.MEDIO, senai: EDU.MEDIO, creche: EDU.FUNDAMENTAL,
      biblioteca: EDU.MEDIO,
    },
  },
  // Escolaridade de quem chega de fora, por marco do mundo: chance de cada
  // nível (sem, fundamental, médio, superior, pós).
  immigrants: {
    1: [0.35, 0.45, 0.15, 0.05, 0],
    2: [0.25, 0.45, 0.2, 0.09, 0.01],
    3: [0.15, 0.4, 0.3, 0.13, 0.02],
    4: [0.08, 0.32, 0.37, 0.2, 0.03],
    5: [0.05, 0.25, 0.4, 0.25, 0.05],
    6: [0.03, 0.2, 0.4, 0.3, 0.07],
  },
};

// Demografia (ver systems/demography.js). Cada cidadão faz aniversário num
// mês do ano (pelo id); a chance de morrer e de ter filho é sorteada nele.
export const DEMOGRAPHY = {
  // Família que chega: adultos e até familyChildren filhos, cada um com
  // childChance (se couber na casa). Dá umas 3 crianças para cada 10 pessoas.
  familyAdults: [1, 2],
  familyChildren: 2,
  childChance: 0.6,
  // Chance por ano de um adulto de 20 a 40 anos ter um filho (se a casa tem vaga).
  birthAges: [20, 40],
  birthChance: 0.12,
  // Chance de morrer por ano: baseDeath até deathFromAge, depois cresce
  // deathGrowth por ano de idade; ninguém passa de maxAge.
  baseDeath: 0.001,
  deathFromAge: 60,
  deathAt60: 0.01,
  deathGrowth: 1.1,
  maxAge: 100,
  // Crianças pequenas (até 4 anos) morrem com esta chance por ano, menos com
  // saúde e vacinação.
  childDeath: 0.02,
  childAges: 4,
};

// Bem-estar (ver systems/wellbeing.js): saúde, crime e satisfação de cada casa,
// de 0 a 1, recalculados uma vez por dia.
export const WELLBEING = {
  // Saúde: base, mais até `coverage` com hospital/clínica no raio, menos a
  // poluição. A saúde multiplica a chance de morrer (de healthDeath[0] com
  // saúde 1 até healthDeath[1] com saúde 0).
  // `food`: acesso a alimentos (mercados no raio) soma até food/2 e a falta tira food/2.
  // `garbage`: casa sem coleta de lixo.
  health: { base: 0.6, coverage: 0.35, pollution: 0.3, food: 0.1, garbage: 0.03 },
  healthDeath: [0.6, 1.8],
  // Crime: base mais desemprego, insatisfação e densidade, menos a polícia.
  crime: { base: 0.15, unemployment: 0.5, unhappiness: 0.35, density: 0.15, police: 0.7 },
  // Satisfação: base e o peso de cada fator.
  satisfaction: {
    base: 0.6, health: 0.15, safety: 0.2, leisure: 0.15, school: 0.05, food: 0.08, garbage: 0.06,
    pollution: 0.2, unemployment: 0.3, taxPerPoint: 0.015,
  },
  // Casas com satisfação abaixo de `leaveBelow` perdem uma família por dia
  // com esta chance (emigração).
  leaveBelow: 0.25,
  leaveChance: 0.25,
  // Epidemia: chance por mês quando a saúde média da cidade está abaixo de
  // epidemicBelow (cidades acima de epidemicMinPop); dura epidemicMonths e
  // multiplica as mortes por epidemicDeath.
  epidemicBelow: 0.55,
  epidemicMinPop: 500,
  epidemicChance: 0.08,
  epidemicMonths: 2,
  epidemicDeath: 3,
};

// Incêndios (ver systems/fire.js): chance por dia de cada prédio pegar fogo
// (por nível); com bombeiros no raio, a chance de apagar é a cobertura;
// sem apagar, o prédio vira ruína e o fogo passa aos vizinhos com spreadChance
// (baixa: com 8 vizinhos, o fogo não pode crescer sem parar).
export const FIRE = {
  dailyChance: 0.00004,
  spreadChance: 0.08,
};

// Velocidade dos cidadãos, em tiles por minuto de jogo.
export const CITIZEN_SPEED = 0.5;
