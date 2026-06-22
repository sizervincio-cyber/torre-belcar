/* ============================================================
   Torre de Controle · Entrega Técnica Belcar
   Camada de dados, regras de negócio e persistência (localStorage)
   Sem dependências externas. Tudo roda no navegador, offline.
   ============================================================ */
(function () {
  "use strict";

  var STORAGE_KEY = "tc_belcar_v1";
  var DAY = 24 * 60 * 60 * 1000;

  /* ---------------- Etapas (stages) configuráveis ----------------
     ordem, cor (apenas marcação de coluna), sla_dias (prazo da etapa).
     A cor do CARD segue o semáforo de SLA, não esta cor decorativa. */
  var STAGES = [
    { code: "01", name: "Aguardando Faturamento", ordem: 1,  cor: "#64748b", sla_dias: 2, gate: true },
    { code: "02", name: "Faturado",               ordem: 2,  cor: "#2563eb", sla_dias: 1 },
    { code: "03", name: "Planejamento de Rota",   ordem: 3,  cor: "#2563eb", sla_dias: 1 },
    { code: "04", name: "Pátio Definido",         ordem: 4,  cor: "#0ea5e9", sla_dias: 1 },
    { code: "05", name: "Em Movimentação",        ordem: 5,  cor: "#0ea5e9", sla_dias: 1 },
    { code: "06", name: "Em Preparação",          ordem: 6,  cor: "#8b5cf6", sla_dias: 3 },
    { code: "07", name: "Em Qualidade",           ordem: 7,  cor: "#f59e0b", sla_dias: 1 },
    { code: "08", name: "Reprovado Qualidade",    ordem: 8,  cor: "#dc2626", sla_dias: 1 },
    { code: "09", name: "Liberado",               ordem: 9,  cor: "#16a34a", sla_dias: 1 },
    { code: "10", name: "Em Pátio de Entrega",    ordem: 10, cor: "#16a34a", sla_dias: 2 },
    { code: "11", name: "Agendado Cliente",       ordem: 11, cor: "#16a34a", sla_dias: 2 },
    { code: "12", name: "Entregue",               ordem: 12, cor: "#15803d", sla_dias: 0 },
    { code: "13", name: "Encerrado",              ordem: 13, cor: "#334155", sla_dias: 0 }
  ];

  /* Transições oficiais do fluxo (Faturamento -> Encerramento).
     A etapa 07 tem dois caminhos: Aprovar (-> 09) e Reprovar (-> 08).
     A etapa 08 retorna para 06 (Em Preparação) com motivo obrigatório. */
  var FLOW_NEXT = {
    "01": "02", "02": "03", "03": "04", "04": "05", "05": "06",
    "06": "07", "07": "09", "08": "06", "09": "10", "10": "11",
    "11": "12", "12": "13"
  };

  /* Responsáveis fictícios por área (dor nº 1: responsável obrigatório). */
  var TEAM = [
    "Carlos Andrade (Comercial)",
    "Equipe Faturamento",
    "Diego Moraes (Planejamento)",
    "Equipe Pátio 1",
    "Equipe Pátio 2",
    "Time Preparação A",
    "Time Preparação B",
    "Ana Ribeiro (Qualidade)",
    "Marcos Pereira (Entrega)",
    "Júlia Campos (Entrega)",
    "Fernanda Lopes (Coordenação)"
  ];

  var YARDS = [
    { nome: "Pátio Central",        tipo: "Recebimento", capacidade: 40 },
    { nome: "Pátio Preparação",     tipo: "Preparação",  capacidade: 25 },
    { nome: "Pátio de Entrega",     tipo: "Entrega",     capacidade: 20 },
    { nome: "Estacionamento Anexo", tipo: "Apoio",       capacidade: 30 }
  ];

  /* ---------------- Utilidades ---------------- */
  function uid() { return "v" + Math.random().toString(36).slice(2, 9); }
  function nowISO() { return new Date().toISOString(); }
  function daysAgoISO(d) { return new Date(Date.now() - d * DAY).toISOString(); }

  function stageByCode(code) {
    for (var i = 0; i < STAGES.length; i++) if (STAGES[i].code === code) return STAGES[i];
    return STAGES[0];
  }

  /* Dias (com casas) que o veículo está na etapa atual. */
  function daysInStage(v) {
    var since = v.stage_since ? new Date(v.stage_since).getTime() : Date.now();
    return (Date.now() - since) / DAY;
  }

  /* Semáforo de SLA: ok | warn | late | none (R5). */
  function slaStatus(v) {
    var st = stageByCode(v.stage_code);
    if (!st.sla_dias || st.sla_dias <= 0 || v.stage_code === "12" || v.stage_code === "13") {
      return { level: "none", dias: Math.floor(daysInStage(v)), sla: st.sla_dias || 0 };
    }
    var d = daysInStage(v);
    var rest = st.sla_dias - d;
    var level = "ok";
    if (rest < 0) level = "late";
    else if (rest <= 1) level = "warn";
    return { level: level, dias: Math.floor(d), sla: st.sla_dias };
  }

  function isLate(v) { return slaStatus(v).level === "late"; }
  function isFinished(v) { return v.stage_code === "12" || v.stage_code === "13"; }

  /* ---------------- Persistência ---------------- */
  var state = { vehicles: [], movements: [], yards: [] };

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { console.warn("Falha ao salvar:", e); }
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (raw) {
      try { state = JSON.parse(raw); } catch (e) { state = null; }
    }
    if (!state || !state.vehicles || !state.vehicles.length) {
      seed();
      save();
    }
    if (!state.yards || !state.yards.length) { state.yards = YARDS.slice(); }
    if (!state.calendar_events) state.calendar_events = [];
    if (!state.webhook_events) state.webhook_events = [];
    if (!state.notifications) state.notifications = [];
    if (!state.comments) state.comments = [];
    if (!state.attachments) state.attachments = [];
    if (!state.checklists) state.checklists = [];
    ensureCalendar(); // gera programação para faturados que ainda não têm
    save();
  }

  /* ---------------- Seed (20 veículos fictícios) ---------------- */
  function seed() {
    var clientes = [
      "Transportadora Aurora LTDA", "Construtora Vale Verde", "AgroNorte Logística",
      "Distribuidora Sol Nascente", "Mineração Pedra Alta", "Frigorífico Boa Carne",
      "Cooperativa AgroUnião", "Expresso Litoral", "Cimentos do Vale",
      "Madeireira Três Rios", "LogPrime Transportes", "Sementes do Cerrado"
    ];
    var modelos = ["Cargo 1719", "Constellation 24.280", "Atego 2426", "Axor 2544",
                   "Accelo 1016", "Constellation 17.280", "Cargo 2429", "Atego 1719"];
    var cores = ["Branco", "Prata", "Vermelho", "Azul", "Cinza"];
    var implementos = ["Baú seco", "Carroceria de madeira", "Basculante", "Tanque",
                       "Sider", "Refrigerado", "Cavalo simples", "Sem implemento"];
    var cidades = ["Goiânia", "Anápolis", "Brasília", "Rio Verde", "Catalão",
                   "Itumbiara", "Jataí", "Luziânia"];
    var consultores = ["Carlos Andrade", "Patrícia Nunes", "Renato Dias", "Sílvia Rocha"];
    var chassis = [
      "VR016624", "VR015462", "VR014428", "VR006414", "VR000615", "VR000686",
      "TR005515", "TR202295", "VR017701", "VR018234", "VR011190", "TR009842",
      "VR020055", "VR021376", "TR013004", "VR009987", "VR022810", "VR023145",
      "TR014777", "VR024509"
    ];
    /* distribuição de etapas pelo pipeline; alguns atrasados, alguns reprovados */
    var plan = [
      { code: "01", since: 3,  nf: false, prio: "Alta" },     // atrasado, sem NF (gate)
      { code: "01", since: 1,  nf: false, prio: "Normal" },
      { code: "02", since: 0,  nf: true,  prio: "Normal" },
      { code: "02", since: 2,  nf: true,  prio: "Urgente" },  // atrasado
      { code: "03", since: 1,  nf: true,  prio: "Normal" },
      { code: "04", since: 0,  nf: true,  prio: "Normal" },
      { code: "05", since: 2,  nf: true,  prio: "Alta" },     // atrasado
      { code: "06", since: 1,  nf: true,  prio: "Normal" },
      { code: "06", since: 5,  nf: true,  prio: "Urgente", reprov: 1 }, // atrasado + reprovado antes
      { code: "06", since: 2,  nf: true,  prio: "Normal" },
      { code: "07", since: 0,  nf: true,  prio: "Alta" },
      { code: "07", since: 2,  nf: true,  prio: "Normal" },   // atrasado
      { code: "08", since: 1,  nf: true,  prio: "Urgente", reprov: 1 },
      { code: "09", since: 0,  nf: true,  prio: "Normal" },
      { code: "10", since: 1,  nf: true,  prio: "Normal" },
      { code: "10", since: 4,  nf: true,  prio: "Alta" },     // atrasado
      { code: "11", since: 1,  nf: true,  prio: "Urgente" },
      { code: "11", since: 0,  nf: true,  prio: "Normal" },
      { code: "12", since: 2,  nf: true,  prio: "Normal" },
      { code: "13", since: 6,  nf: true,  prio: "Normal" }
    ];
    var respByStage = {
      "01": "Equipe Faturamento", "02": "Equipe Faturamento", "03": "Diego Moraes (Planejamento)",
      "04": "Diego Moraes (Planejamento)", "05": "Equipe Pátio 1", "06": "Time Preparação A",
      "07": "Ana Ribeiro (Qualidade)", "08": "Time Preparação B", "09": "Equipe Pátio 2",
      "10": "Marcos Pereira (Entrega)", "11": "Júlia Campos (Entrega)", "12": "Júlia Campos (Entrega)",
      "13": "Fernanda Lopes (Coordenação)"
    };

    state = { vehicles: [], movements: [], yards: YARDS.slice(), calendar_events: [], webhook_events: [], notifications: [], comments: [], attachments: [], checklists: [] };

    for (var i = 0; i < plan.length; i++) {
      var p = plan[i];
      var created = daysAgoISO(p.since + 4 + (i % 5));
      var v = {
        id: uid(),
        chassi: chassis[i],
        pedido: "PED-" + (40100 + i),
        cliente: clientes[i % clientes.length],
        modelo: modelos[i % modelos.length],
        cor: cores[i % cores.length],
        ano_modelo: "2025/2026",
        implemento: implementos[i % implementos.length],
        cidade: cidades[i % cidades.length],
        telefone_cliente: "(62) 9" + (8000 + i) + "-" + (1000 + i),
        email_cliente: "contato" + i + "@cliente.com.br",
        consultor: consultores[i % consultores.length],
        stage_code: p.code,
        responsavel: p.code === "01" && !p.nf ? respByStage[p.code] : respByStage[p.code],
        patio: ["05", "06"].indexOf(p.code) >= 0 ? "Pátio Preparação"
              : ["09", "10", "11"].indexOf(p.code) >= 0 ? "Pátio de Entrega"
              : "Pátio Central",
        prioridade: p.prio,
        numero_nf: p.nf ? "NF-" + (250000 + i) : "",
        data_faturamento: p.nf ? daysAgoISO(p.since + 1) : "",
        data_prevista_entrega: daysAgoISO(-(3 + (i % 6))), // futura
        observacao: "",
        reprovacoes: p.reprov || 0,
        stage_since: daysAgoISO(p.since),
        created_at: created
      };
      state.vehicles.push(v);

      /* histórico inicial sintético: criação + chegada na etapa atual */
      state.movements.push({
        id: uid(), vehicle_id: v.id, chassi: v.chassi,
        stage_anterior: "", stage_novo: "01",
        responsavel: "Carlos Andrade (Comercial)",
        comentario: "Cadastro do veículo no sistema.",
        created_at: created
      });
      if (v.stage_code !== "01") {
        state.movements.push({
          id: uid(), vehicle_id: v.id, chassi: v.chassi,
          stage_anterior: "01", stage_novo: v.stage_code,
          responsavel: v.responsavel,
          comentario: "Movimentação registrada na carga inicial.",
          created_at: v.stage_since
        });
      }
      if (p.reprov) {
        state.movements.push({
          id: uid(), vehicle_id: v.id, chassi: v.chassi,
          stage_anterior: "07", stage_novo: "08",
          responsavel: "Ana Ribeiro (Qualidade)",
          comentario: "Reprovado: adesivação fora do padrão. Refazer.",
          created_at: daysAgoISO(p.since + 1)
        });
      }
    }
    ensureCalendar();
  }

  /* ---------------- Operações de negócio ---------------- */

  /* Verifica se o veículo PODE avançar. Retorna {ok, motivo}. (R1, R2) */
  function canAdvance(v) {
    if (isFinished(v)) return { ok: false, motivo: "Veículo já entregue/encerrado." };
    // R1 — Gate de faturamento
    if (v.stage_code === "01") {
      if (!v.numero_nf || !v.data_faturamento) {
        return { ok: false, motivo: "GATE 01 · Faturamento: informe o número da NF e a data de faturamento antes de avançar." };
      }
    }
    return { ok: true };
  }

  /* Aplica mudança de etapa, grava histórico (R4) e persiste. */
  function moveStage(v, novoCode, responsavel, comentario) {
    var anterior = v.stage_code;
    v.stage_code = novoCode;
    v.stage_since = nowISO();
    if (responsavel) v.responsavel = responsavel;
    if (novoCode === "08") v.reprovacoes = (v.reprovacoes || 0) + 1;
    state.movements.push({
      id: uid(), vehicle_id: v.id, chassi: v.chassi,
      stage_anterior: anterior, stage_novo: novoCode,
      responsavel: responsavel || v.responsavel,
      comentario: comentario || "",
      created_at: nowISO()
    });
    syncCalendarOnStageChange(v, novoCode, null); // integração Kanban -> Calendário
    save();
  }

  function addVehicle(data) {
    var v = Object.assign({
      id: uid(),
      stage_code: "01",
      stage_since: nowISO(),
      created_at: nowISO(),
      reprovacoes: 0,
      observacao: "",
      responsavel: ""
    }, data);
    state.vehicles.push(v);
    state.movements.push({
      id: uid(), vehicle_id: v.id, chassi: v.chassi,
      stage_anterior: "", stage_novo: "01",
      responsavel: v.consultor ? v.consultor + " (Comercial)" : "Comercial",
      comentario: "Cadastro do veículo no sistema.",
      created_at: nowISO()
    });
    save();
    return v;
  }

  function updateVehicle(id, patch) {
    var v = getVehicle(id);
    if (!v) return null;
    Object.assign(v, patch);
    save();
    return v;
  }

  function getVehicle(id) {
    for (var i = 0; i < state.vehicles.length; i++) if (state.vehicles[i].id === id) return state.vehicles[i];
    return null;
  }

  function movementsFor(id) {
    return state.movements
      .filter(function (m) { return m.vehicle_id === id; })
      .sort(function (a, b) { return new Date(a.created_at) - new Date(b.created_at); });
  }

  function resetData() {
    seed(); save();
  }

  /* ---------------- Métricas / KPIs ---------------- */
  function metrics() {
    var vs = state.vehicles;
    var ativos = vs.filter(function (v) { return !isFinished(v); });

    var atrasados = ativos.filter(isLate);

    // Lead time médio (dias) dos veículos entregues: criação -> entrega
    var leadTimes = [];
    vs.forEach(function (v) {
      if (v.stage_code === "12" || v.stage_code === "13") {
        var mv = movementsFor(v.id).filter(function (m) { return m.stage_novo === "12"; })[0];
        var end = mv ? new Date(mv.created_at).getTime() : new Date(v.stage_since).getTime();
        var lt = (end - new Date(v.created_at).getTime()) / DAY;
        if (lt > 0) leadTimes.push(lt);
      }
    });
    var leadMedio = leadTimes.length
      ? (leadTimes.reduce(function (a, b) { return a + b; }, 0) / leadTimes.length) : 0;

    // Contagem por etapa
    var porEtapa = {};
    STAGES.forEach(function (s) { porEtapa[s.code] = 0; });
    vs.forEach(function (v) { porEtapa[v.stage_code] = (porEtapa[v.stage_code] || 0) + 1; });

    // Gargalo = etapa ativa (não final) com mais veículos
    var gargalo = null, gMax = -1;
    STAGES.forEach(function (s) {
      if (s.code === "12" || s.code === "13") return;
      if (porEtapa[s.code] > gMax) { gMax = porEtapa[s.code]; gargalo = s; }
    });

    // Tempo médio por etapa (entre os veículos atualmente em cada etapa)
    var tempoEtapa = {};
    STAGES.forEach(function (s) {
      var inStage = vs.filter(function (v) { return v.stage_code === s.code; });
      var avg = inStage.length
        ? inStage.reduce(function (a, v) { return a + daysInStage(v); }, 0) / inStage.length : 0;
      tempoEtapa[s.code] = avg;
    });

    var reprovados = vs.filter(function (v) { return v.stage_code === "08"; }).length;
    var comRetrabalho = vs.filter(function (v) { return (v.reprovacoes || 0) > 0; }).length;
    var totalQualidade = vs.filter(function (v) { return (v.reprovacoes || 0) > 0 || ["07","08","09","10","11","12","13"].indexOf(v.stage_code) >= 0; }).length;

    return {
      total: vs.length,
      ativos: ativos.length,
      atrasados: atrasados,
      atrasadosCount: atrasados.length,
      leadMedio: leadMedio,
      porEtapa: porEtapa,
      gargalo: gargalo,
      gargaloCount: gMax,
      tempoEtapa: tempoEtapa,
      faturados: vs.filter(function (v) { return v.numero_nf && !isFinished(v); }).length,
      emPreparacao: porEtapa["06"] || 0,
      emQualidade: (porEtapa["07"] || 0) + (porEtapa["08"] || 0),
      emPatio: vs.filter(function (v) { return ["04","09","10"].indexOf(v.stage_code) >= 0; }).length,
      prontos: porEtapa["09"] || 0,
      entregues: (porEtapa["12"] || 0) + (porEtapa["13"] || 0),
      reprovadosAgora: reprovados,
      taxaRetrabalho: totalQualidade ? (comRetrabalho / totalQualidade * 100) : 0,
      reprovacoesTotais: vs.reduce(function (a, v) { return a + (v.reprovacoes || 0); }, 0)
    };
  }

  function yardOccupancy() {
    return state.yards.map(function (y) {
      var ocup = state.vehicles.filter(function (v) {
        return v.patio === y.nome && !isFinished(v);
      }).length;
      return { nome: y.nome, tipo: y.tipo, capacidade: y.capacidade, ocupacao: ocup,
               disponivel: Math.max(0, y.capacidade - ocup) };
    });
  }

  /* ============================================================
     CALENDÁRIO · agenda operacional gerada a partir do faturamento
     ============================================================ */

  /* Usuário atuante (demo) — usado em triggered_by / created_by. */
  var CURRENT_USER = { id: "u-monica", nome: "Mônica", perfil: "Gestor Operacional" };

  /* Os 9 tipos de programação (seção 3 do escopo). */
  var EVENT_TYPES = [
    "Faturamento", "Planejamento de Rota", "Movimentação", "Preparação",
    "Qualidade", "Pátio de Entrega", "Agendamento Cliente", "Entrega Técnica", "Pós-entrega"
  ];

  /* Plano de geração a partir da data de faturamento (offsets em dias). */
  var CAL_PLAN = [
    { type: "Faturamento",         stage: "02", off: 0, dur: 0, time: "09:00", role: "faturamento" },
    { type: "Planejamento de Rota", stage: "03", off: 1, dur: 0, time: "08:30", role: "planejamento" },
    { type: "Movimentação",        stage: "05", off: 2, dur: 0, time: "10:00", role: "movimentacao" },
    { type: "Preparação",          stage: "06", off: 3, dur: 1, time: "08:00", role: "preparacao" },
    { type: "Qualidade",           stage: "07", off: 5, dur: 0, time: "14:00", role: "qualidade" },
    { type: "Pátio de Entrega",    stage: "10", off: 6, dur: 0, time: "09:00", role: "movimentacao" },
    { type: "Agendamento Cliente", stage: "11", off: 7, dur: 0, time: "11:00", role: "entrega" },
    { type: "Entrega Técnica",     stage: "12", off: 8, dur: 0, time: "15:00", role: "entrega" },
    { type: "Pós-entrega",         stage: "13", off: 9, dur: 0, time: "17:00", role: "gestor" }
  ];

  /* Responsável padrão por área (obrigatório por programação). */
  var ROLE_RESP = {
    faturamento: "Equipe Faturamento",
    planejamento: "Diego Moraes (Planejamento)",
    movimentacao: "Equipe Pátio 1",
    preparacao: "Time Preparação A",
    qualidade: "Ana Ribeiro (Qualidade)",
    entrega: "Marcos Pereira (Entrega)",
    gestor: "Fernanda Lopes (Coordenação)"
  };

  /* Mapeia o status do Kanban para o tipo de evento correspondente. */
  var STAGE_TO_EVENT = {
    "02": "Faturamento", "03": "Planejamento de Rota", "05": "Movimentação",
    "06": "Preparação", "07": "Qualidade", "10": "Pátio de Entrega",
    "11": "Agendamento Cliente", "12": "Entrega Técnica", "13": "Pós-entrega"
  };

  var EMAIL_EVENTS = [
    "calendar.event_created", "calendar.event_updated", "calendar.event_rescheduled",
    "calendar.event_completed", "calendar.responsible_changed", "calendar.sla_expired"
  ];

  function pad(n) { return ("0" + n).slice(-2); }
  function ymd(d) { var x = new Date(d); return x.getFullYear() + "-" + pad(x.getMonth() + 1) + "-" + pad(x.getDate()); }
  function addDaysYMD(baseIso, n) { var d = new Date(baseIso); d.setDate(d.getDate() + n); return ymd(d); }
  function todayYMD() { return ymd(new Date()); }

  function makeCalEvent(v, step, sd, ed) {
    var resp = ROLE_RESP[step.role];
    return {
      id: uid(),
      vehicle_id: v.id, chassi: v.chassi, cliente: v.cliente, modelo: v.modelo,
      event_type: step.type, stage_ref: step.stage,
      title: step.type + " · " + v.chassi,
      description: "Programação de " + step.type.toLowerCase() + " do veículo " + v.chassi + ".",
      scheduled_date: sd, scheduled_time: step.time,
      end_date: ed, end_time: step.time,
      responsible_id: null, responsible_name: resp,
      status: "Programado",
      priority: v.prioridade || "Normal",
      yard_id: null, yard_name: v.patio || "", city: v.cidade || "",
      sla_due_at: sd,
      completed_at: null, cancelled_at: null,
      rescheduled_from: null, reschedule_reason: null,
      created_by: CURRENT_USER.nome, updated_by: CURRENT_USER.nome,
      created_at: nowISO(), updated_at: nowISO(),
      history: [{ at: nowISO(), who: "Sistema", note: "Programação criada automaticamente a partir do faturamento." }]
    };
  }

  function generateCalendarPlan(v) {
    var base = v.data_faturamento || v.created_at || nowISO();
    return CAL_PLAN.map(function (step) {
      var sd = addDaysYMD(base, step.off);
      var ed = step.dur ? addDaysYMD(base, step.off + step.dur) : sd;
      return makeCalEvent(v, step, sd, ed);
    });
  }

  /* Ajusta o status das programações conforme a etapa atual do veículo. */
  function reconcileStatuses(v, events) {
    var curOrder = stageByCode(v.stage_code).ordem;
    events.forEach(function (e) {
      var evOrder = stageByCode(e.stage_ref).ordem;
      if (evOrder < curOrder) { e.status = "Concluído"; e.completed_at = e.scheduled_date; }
      else if (evOrder === curOrder) { e.status = "Em andamento"; }
      else { e.status = "Programado"; }
    });
  }

  /* Gera a agenda para todos os veículos faturados que ainda não têm. */
  function ensureCalendar() {
    if (!state.calendar_events) state.calendar_events = [];
    state.vehicles.forEach(function (v) {
      var faturado = v.numero_nf && v.stage_code !== "01";
      if (!faturado) return;
      var has = state.calendar_events.some(function (e) { return e.vehicle_id === v.id; });
      if (has) return;
      var evs = generateCalendarPlan(v);
      reconcileStatuses(v, evs);
      state.calendar_events = state.calendar_events.concat(evs);
    });
  }

  function calEventsFor(vehicleId) {
    return state.calendar_events.filter(function (e) { return e.vehicle_id === vehicleId; });
  }
  function getCalEvent(id) {
    for (var i = 0; i < state.calendar_events.length; i++) if (state.calendar_events[i].id === id) return state.calendar_events[i];
    return null;
  }
  function pushEvHist(e, who, note) {
    e.history = e.history || [];
    e.history.push({ at: nowISO(), who: who || CURRENT_USER.nome, note: note });
  }

  /* Status efetivo (deriva "Atrasado" dinamicamente). */
  function effectiveCalStatus(e) {
    if (e.status === "Concluído" || e.status === "Cancelado") return e.status;
    var today = todayYMD();
    if (e.scheduled_date < today) return "Atrasado";
    return e.status; // Programado / Em andamento / Reagendado
  }

  /* ---- Eventos internos (n8n) e log de e-mail (stub) ---- */
  function emitCalendar(name, e, who) {
    var triggeredBy = who || CURRENT_USER;
    var payload = {
      event: name,
      timestamp: nowISO(),
      calendar_event: {
        id: e.id, vehicle_id: e.vehicle_id, chassi: e.chassi, cliente: e.cliente,
        modelo: e.modelo, etapa: e.event_type, data_programada: e.scheduled_date,
        hora_programada: e.scheduled_time, responsavel: e.responsible_name, status: e.status
      },
      triggered_by: triggeredBy
    };
    state.webhook_events.push({
      id: uid(), event: name, vehicle_id: e.vehicle_id, payload: payload,
      status: "pending", created_at: nowISO()
    });
    if (EMAIL_EVENTS.indexOf(name) >= 0) {
      logEmail(e, name, e.responsible_name);
    }
  }

  function logEmail(e, eventName, recipient) {
    var labels = {
      "calendar.event_created": "Nova programação",
      "calendar.event_updated": "Programação atualizada",
      "calendar.event_rescheduled": "Programação reagendada",
      "calendar.event_completed": "Programação concluída",
      "calendar.responsible_changed": "Responsável alterado",
      "calendar.sla_expired": "SLA vencido",
      "manual": "Notificação manual"
    };
    var subj = "[Belcar · Entrega Técnica] " + (labels[eventName] || "Programação") + " — " + e.event_type + " " + e.chassi;
    var body = "Chassi: " + e.chassi + "\nCliente: " + e.cliente + "\nModelo: " + e.modelo +
      "\nEtapa programada: " + e.event_type + "\nData: " + e.scheduled_date + "\nHora: " + (e.scheduled_time || "—") +
      "\nResponsável: " + e.responsible_name + "\nStatus: " + e.status +
      "\n\nAbrir veículo: app#veiculo/" + e.vehicle_id + "\nAbrir calendário: app#calendario";
    state.notifications.push({
      id: uid(), event: eventName, vehicle_id: e.vehicle_id,
      recipient: recipient || e.responsible_name, subject: subj, body: body,
      status: "simulated", created_at: nowISO()
    });
  }

  /* ---- Sincronização Kanban -> Calendário ---- */
  function syncCalendarOnStageChange(v, novoCode, who) {
    // Ao ser faturado, gera o plano completo (se ainda não existir).
    if (novoCode === "02" && !state.calendar_events.some(function (e) { return e.vehicle_id === v.id; })) {
      var evs = generateCalendarPlan(v);
      reconcileStatuses(v, evs);
      state.calendar_events = state.calendar_events.concat(evs);
      evs.forEach(function (e) { emitCalendar("calendar.event_created", e, who); });
    }
    var curOrder = stageByCode(novoCode).ordem;
    calEventsFor(v.id).forEach(function (e) {
      if (e.status === "Cancelado") return;
      var evOrder = stageByCode(e.stage_ref).ordem;
      if (evOrder < curOrder && e.status !== "Concluído") {
        e.status = "Concluído"; e.completed_at = nowISO(); e.updated_at = nowISO();
        pushEvHist(e, (who && who.nome) || "Sistema", "Concluído automaticamente (avanço no Kanban).");
        emitCalendar("calendar.event_completed", e, who);
      } else if (evOrder === curOrder && e.status === "Programado") {
        e.status = "Em andamento"; e.updated_at = nowISO();
        emitCalendar("calendar.event_updated", e, who);
      }
    });
  }

  /* ---- Ações do calendário ---- */
  function rescheduleEvent(id, opts) {
    var e = getCalEvent(id);
    if (!e) return null;
    var oldDate = e.scheduled_date, oldTime = e.scheduled_time;
    e.rescheduled_from = oldDate;
    e.reschedule_reason = opts.motivo || "";
    e.scheduled_date = opts.nova_data || e.scheduled_date;
    e.sla_due_at = e.scheduled_date;
    if (opts.novo_horario) e.scheduled_time = opts.novo_horario;
    if (e.status === "Atrasado" || effectiveCalStatus(e) === "Atrasado") e.status = "Programado";
    e.updated_by = opts.responsavel_alteracao || CURRENT_USER.nome;
    e.updated_at = nowISO();
    pushEvHist(e, e.updated_by,
      "Reagendou de " + oldDate + (oldTime ? " " + oldTime : "") + " para " +
      e.scheduled_date + (e.scheduled_time ? " " + e.scheduled_time : "") +
      ". Motivo: " + (opts.motivo || "—"));
    emitCalendar("calendar.event_rescheduled", e, { id: "u", nome: e.updated_by, perfil: "Operacional" });
    if (opts.notif_cliente) logEmail(e, "calendar.event_rescheduled", e.cliente);
    save();
    return e;
  }

  function completeCalEvent(id, who) {
    var e = getCalEvent(id);
    if (!e) return null;
    e.status = "Concluído"; e.completed_at = nowISO(); e.updated_at = nowISO();
    pushEvHist(e, who || CURRENT_USER.nome, "Programação concluída manualmente.");
    emitCalendar("calendar.event_completed", e, null);
    save();
    return e;
  }

  function notifyResponsible(id, who) {
    var e = getCalEvent(id);
    if (!e) return null;
    logEmail(e, "manual", e.responsible_name);
    pushEvHist(e, who || CURRENT_USER.nome, "Responsável notificado (" + e.responsible_name + ").");
    save();
    return e;
  }

  function updateCalEvent(id, patch, who) {
    var e = getCalEvent(id);
    if (!e) return null;
    var respChanged = patch.responsible_name && patch.responsible_name !== e.responsible_name;
    Object.assign(e, patch);
    e.updated_at = nowISO();
    if (respChanged) {
      pushEvHist(e, who || CURRENT_USER.nome, "Responsável alterado para " + e.responsible_name + ".");
      emitCalendar("calendar.responsible_changed", e, null);
    }
    save();
    return e;
  }

  /* ============================================================
     MOBILE · usuários/login, comentários, fotos, checklists e
     eventos mobile.* (n8n) — compartilha a mesma base do web app.
     ============================================================ */

  var MOBILE_USERS = [
    { id: "u-admin",     nome: "Admin",              perfil: "Administrador",     team: "Fernanda Lopes (Coordenação)" },
    { id: "u-monica",    nome: "Mônica",             perfil: "Gestor Operacional",team: "Fernanda Lopes (Coordenação)" },
    { id: "u-comercial", nome: "Comercial Exemplo",  perfil: "Comercial",         team: "Carlos Andrade (Comercial)" },
    { id: "u-fat",       nome: "Faturamento Exemplo",perfil: "Faturamento",       team: "Equipe Faturamento" },
    { id: "u-diego",     nome: "Diego",              perfil: "Planejamento",      team: "Diego Moraes (Planejamento)" },
    { id: "u-bruno",     nome: "Bruno",              perfil: "Movimentação",      team: "Equipe Pátio 1" },
    { id: "u-wanderson", nome: "Wanderson",          perfil: "Preparação",        team: "Time Preparação A" },
    { id: "u-mateus",    nome: "Mateus",             perfil: "Qualidade",         team: "Ana Ribeiro (Qualidade)" },
    { id: "u-valmario",  nome: "Valmário",           perfil: "Entrega Técnica",   team: "Marcos Pereira (Entrega)" },
    { id: "u-view",      nome: "Visualizador",       perfil: "Visualizador",      team: "" }
  ];

  /* Define o usuário atuante (login mobile) — usado em triggered_by. */
  function setActor(user) { if (user) CURRENT_USER = user; }
  function canEdit(user) { return user && user.perfil !== "Visualizador"; }

  /* Templates de checklist por etapa (toque único). */
  var CHECKLIST_TEMPLATES = {
    "Preparação": ["Lavagem realizada", "Conferência visual", "Acessórios instalados", "Implemento conferido", "Adesivação conferida", "Correções realizadas", "Fotos anexadas"],
    "Qualidade": ["Pintura conferida", "Cabine conferida", "Pneus conferidos", "Luzes conferidas", "Documentos conferidos", "Acessórios conferidos", "Fotos finais anexadas", "Pendências registradas"],
    "Entrega Técnica": ["Cliente presente", "Orientação técnica realizada", "Documentos entregues", "Aceite registrado", "Fotos da entrega anexadas", "Observações finais"]
  };
  /* etapa de checklist conforme status atual do veículo. */
  function checklistEtapaFor(stageCode) {
    if (stageCode === "06") return "Preparação";
    if (stageCode === "07" || stageCode === "08") return "Qualidade";
    if (stageCode === "11" || stageCode === "12") return "Entrega Técnica";
    return null;
  }
  function checklistFor(vehicleId, etapa) {
    var tmpl = CHECKLIST_TEMPLATES[etapa] || [];
    return tmpl.map(function (item) {
      var rec = state.checklists.filter(function (c) { return c.vehicle_id === vehicleId && c.etapa === etapa && c.item === item; })[0];
      return { item: item, done: !!(rec && rec.done), observacao: rec ? rec.observacao : "" };
    });
  }
  function toggleChecklist(vehicleId, etapa, item, who) {
    var rec = state.checklists.filter(function (c) { return c.vehicle_id === vehicleId && c.etapa === etapa && c.item === item; })[0];
    if (!rec) { rec = { id: uid(), vehicle_id: vehicleId, etapa: etapa, item: item, done: false, observacao: "", updated_at: nowISO() }; state.checklists.push(rec); }
    rec.done = !rec.done; rec.updated_at = nowISO();
    var v = getVehicle(vehicleId);
    if (v) {
      var all = checklistFor(vehicleId, etapa);
      var complete = all.every(function (i) { return i.done; });
      if (complete) emitMobile("mobile.vehicle.checklist_completed", v, { etapa: etapa }, who);
    }
    save();
    return rec.done;
  }

  /* Comentários internos por veículo. */
  function addComment(vehicleId, data, who) {
    var v = getVehicle(vehicleId);
    var c = {
      id: uid(), vehicle_id: vehicleId, user_id: who ? who.id : null,
      user: who ? who.nome : (data.user || "Operador"),
      comentario: data.texto || "", etapa: data.etapa || (v ? stageByCode(v.stage_code).name : ""),
      mention: data.mention || "", created_at: nowISO()
    };
    state.comments.push(c);
    if (v) emitMobile("mobile.vehicle.comment_created", v, { comentario: c.comentario, mention: c.mention }, who);
    save();
    return c;
  }
  function commentsFor(vehicleId) {
    return state.comments.filter(function (c) { return c.vehicle_id === vehicleId; })
      .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
  }

  /* Fotos / anexos por veículo (thumb = dataURL reduzido). */
  function addAttachment(vehicleId, data, who) {
    var v = getVehicle(vehicleId);
    var a = {
      id: uid(), vehicle_id: vehicleId, file_url: data.thumb || "", file_type: "image",
      etapa: v ? stageByCode(v.stage_code).name : "", category: data.category || "Outros",
      observation: data.observation || "", uploaded_by: who ? who.nome : "Operador",
      uploaded_from: "mobile_app", created_at: nowISO()
    };
    state.attachments.push(a);
    if (v) emitMobile("mobile.vehicle.photo_uploaded", v, { category: a.category }, who);
    save();
    return a;
  }
  function attachmentsFor(vehicleId) {
    return state.attachments.filter(function (a) { return a.vehicle_id === vehicleId; })
      .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
  }

  /* Emissor de eventos mobile.* (n8n) + log de notificação. */
  function emitMobile(eventName, v, extra, who) {
    extra = extra || {};
    var actor = who || CURRENT_USER;
    var payload = {
      event: eventName,
      timestamp: nowISO(),
      vehicle: {
        id: v.id, chassi: v.chassi, cliente: v.cliente, modelo: v.modelo,
        status_anterior: extra.status_anterior || null,
        status_atual: extra.status_atual || stageByCode(v.stage_code).name,
        responsavel_atual: v.responsavel || null
      },
      triggered_by: { id: actor.id || "u", nome: actor.nome, perfil: actor.perfil || "Operacional" },
      source: "mobile_app"
    };
    if (extra.etapa) payload.vehicle.etapa = extra.etapa;
    if (extra.category) payload.vehicle.category = extra.category;
    state.webhook_events.push({ id: uid(), event: eventName, vehicle_id: v.id, payload: payload, status: "pending", created_at: nowISO() });

    // log de notificação/e-mail (push simulado) para eventos relevantes
    var pushFor = {
      "mobile.vehicle.status_changed": "Status atualizado",
      "mobile.vehicle.responsible_changed": "Responsável alterado",
      "mobile.vehicle.checklist_completed": "Checklist concluído",
      "mobile.vehicle.sla_expired": "SLA vencido",
      "mobile.delivery.completed": "Entrega concluída",
      "mobile.vehicle.closed": "Processo encerrado"
    };
    if (pushFor[eventName]) {
      state.notifications.push({
        id: uid(), user_id: null, vehicle_id: v.id,
        title: pushFor[eventName] + " · " + v.chassi,
        message: v.chassi + " — " + (payload.vehicle.status_atual || "") + " · resp.: " + (v.responsavel || "—"),
        type: eventName, read_at: null, action_url: "app#veiculo/" + v.id,
        status: "simulated", created_at: nowISO()
      });
    }
    return payload;
  }

  /* Atalhos mobile que encapsulam regras (gate + responsável + histórico). */
  function mobileAdvance(vehicleId, targetCode, responsavel, comentario, who) {
    var v = getVehicle(vehicleId);
    if (!v) return { ok: false, motivo: "Veículo não encontrado." };
    if (v.stage_code === "01" && (!v.numero_nf || !v.data_faturamento)) {
      return { ok: false, motivo: "Veículo bloqueado. A operação só é liberada após faturamento." };
    }
    if (!responsavel && !v.responsavel) return { ok: false, motivo: "Defina o responsável antes de avançar." };
    var anterior = stageByCode(v.stage_code).name;
    moveStage(v, targetCode, responsavel, comentario); // grava histórico + sincroniza calendário
    emitMobile("mobile.vehicle.status_changed", v, { status_anterior: anterior, status_atual: stageByCode(targetCode).name }, who);
    if (targetCode === "12") emitMobile("mobile.delivery.completed", v, {}, who);
    if (targetCode === "13") emitMobile("mobile.vehicle.closed", v, {}, who);
    return { ok: true };
  }
  function mobileSetResponsible(vehicleId, responsavel, who) {
    var v = getVehicle(vehicleId);
    if (!v) return;
    v.responsavel = responsavel; v.updated_at = nowISO();
    state.movements.push({ id: uid(), vehicle_id: v.id, chassi: v.chassi, stage_anterior: v.stage_code, stage_novo: v.stage_code,
      responsavel: responsavel, comentario: "Responsável alterado para " + responsavel + ".", created_at: nowISO() });
    emitMobile("mobile.vehicle.responsible_changed", v, {}, who);
    save();
  }

  /* ---------------- API pública ---------------- */
  window.TC = {
    STAGES: STAGES,
    FLOW_NEXT: FLOW_NEXT,
    TEAM: TEAM,
    DAY: DAY,
    load: load,
    save: save,
    resetData: resetData,
    state: function () { return state; },
    stageByCode: stageByCode,
    daysInStage: daysInStage,
    slaStatus: slaStatus,
    isLate: isLate,
    isFinished: isFinished,
    canAdvance: canAdvance,
    moveStage: moveStage,
    addVehicle: addVehicle,
    updateVehicle: updateVehicle,
    getVehicle: getVehicle,
    movementsFor: movementsFor,
    metrics: metrics,
    yardOccupancy: yardOccupancy,
    nextCode: function (code) { return FLOW_NEXT[code] || null; },

    /* Calendário */
    CURRENT_USER: CURRENT_USER,
    EVENT_TYPES: EVENT_TYPES,
    calendarEvents: function () { return state.calendar_events; },
    calEventsFor: calEventsFor,
    getCalEvent: getCalEvent,
    effectiveCalStatus: effectiveCalStatus,
    rescheduleEvent: rescheduleEvent,
    completeCalEvent: completeCalEvent,
    notifyResponsible: notifyResponsible,
    updateCalEvent: updateCalEvent,
    webhookEvents: function () { return state.webhook_events; },
    notifications: function () { return state.notifications; },

    /* Mobile */
    MOBILE_USERS: MOBILE_USERS,
    setActor: setActor,
    canEdit: canEdit,
    CHECKLIST_TEMPLATES: CHECKLIST_TEMPLATES,
    checklistEtapaFor: checklistEtapaFor,
    checklistFor: checklistFor,
    toggleChecklist: toggleChecklist,
    addComment: addComment,
    commentsFor: commentsFor,
    addAttachment: addAttachment,
    attachmentsFor: attachmentsFor,
    emitMobile: emitMobile,
    mobileAdvance: mobileAdvance,
    mobileSetResponsible: mobileSetResponsible
  };
})();
