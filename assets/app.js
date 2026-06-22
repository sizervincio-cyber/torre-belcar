/* ============================================================
   Torre de Controle · Entrega Técnica Belcar
   Camada de aplicação: navegação, telas, Kanban, dashboard,
   painel do veículo e enforcement das regras de negócio.
   ============================================================ */
(function () {
  "use strict";

  var T = window.TC;
  var app = document.getElementById("app");
  var overlay = document.getElementById("overlay");
  var overlayCard = document.getElementById("overlay-card");
  var toastEl = document.getElementById("toast");

  var UI = {
    view: "dashboard",
    filters: { q: "", status: "", resp: "", patio: "", consultor: "", prio: "", lateOnly: false },
    calView: "mensal",
    calCursor: new Date(),
    calFilters: { q: "", resp: "", etapa: "", status: "", patio: "", cidade: "", quick: "" }
  };
  var pendingMove = null;     // { id, target, requireComment, title }
  var pendingResched = null;  // id do evento sendo reagendado

  /* ---------------- Helpers ---------------- */
  function esc(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d)) return "—";
    return ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2) + "/" + d.getFullYear();
  }
  function fmtDateTime(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    return fmtDate(iso) + " " + ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  }
  function num(n, dec) { return (Math.round(n * Math.pow(10, dec || 0)) / Math.pow(10, dec || 0)).toLocaleString("pt-BR"); }

  var SLA_LABEL = { ok: "No prazo", warn: "Atenção", late: "Vencido", none: "—" };
  function slaBadge(v) {
    var s = T.slaStatus(v);
    var txt = s.level === "none" ? (s.dias + "d") : (s.dias + "/" + s.sla + "d · " + SLA_LABEL[s.level]);
    return '<span class="badge sla-' + s.level + '"><span class="dot"></span>' + txt + "</span>";
  }
  function stageTag(code) {
    var st = T.stageByCode(code);
    return '<span class="stage-tag"><span class="dot" style="background:' + st.cor + '"></span>' +
      st.code + " " + esc(st.name) + "</span>";
  }

  function toast(msg, kind) {
    toastEl.className = "toast" + (kind ? " " + kind : "");
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.hidden = true; }, 3200);
  }

  function openOverlay(html, centered) {
    overlay.className = "overlay" + (centered ? " center" : "");
    overlayCard.innerHTML = html;
    overlay.hidden = false;
  }
  function closeOverlay() { overlay.hidden = true; overlayCard.innerHTML = ""; pendingMove = null; }

  /* ---------------- Filtros ---------------- */
  function filteredVehicles() {
    var f = UI.filters;
    var q = f.q.trim().toUpperCase();
    return T.state().vehicles.filter(function (v) {
      if (q && v.chassi.toUpperCase().indexOf(q) < 0 &&
          (v.cliente || "").toUpperCase().indexOf(q) < 0 &&
          (v.pedido || "").toUpperCase().indexOf(q) < 0) return false;
      if (f.status && v.stage_code !== f.status) return false;
      if (f.resp && v.responsavel !== f.resp) return false;
      if (f.patio && v.patio !== f.patio) return false;
      if (f.consultor && v.consultor !== f.consultor) return false;
      if (f.prio && v.prioridade !== f.prio) return false;
      if (f.lateOnly && !T.isLate(v)) return false;
      return true;
    });
  }

  function uniqueValues(key) {
    var seen = {}, out = [];
    T.state().vehicles.forEach(function (v) {
      if (v[key] && !seen[v[key]]) { seen[v[key]] = 1; out.push(v[key]); }
    });
    return out.sort();
  }

  function filtersBar(showStatus) {
    var f = UI.filters;
    function opts(list, sel) {
      return list.map(function (x) {
        return '<option value="' + esc(x) + '"' + (sel === x ? " selected" : "") + ">" + esc(x) + "</option>";
      }).join("");
    }
    var statusOpts = T.STAGES.map(function (s) {
      return '<option value="' + s.code + '"' + (f.status === s.code ? " selected" : "") + ">" + s.code + " " + esc(s.name) + "</option>";
    }).join("");
    return '' +
      '<div class="filters">' +
        '<div class="search"><input data-filter="q" placeholder="Buscar por chassi, cliente ou pedido…" value="' + esc(f.q) + '"></div>' +
        (showStatus ? '<select data-filter="status"><option value="">Todos os status</option>' + statusOpts + '</select>' : '') +
        '<select data-filter="resp"><option value="">Responsável (todos)</option>' + opts(T.TEAM, f.resp) + '</select>' +
        '<select data-filter="patio"><option value="">Pátio (todos)</option>' + opts(uniqueValues("patio"), f.patio) + '</select>' +
        '<select data-filter="consultor"><option value="">Consultor (todos)</option>' + opts(uniqueValues("consultor"), f.consultor) + '</select>' +
        '<select data-filter="prio"><option value="">Prioridade</option>' +
          ["Normal", "Alta", "Urgente"].map(function (p) { return '<option value="' + p + '"' + (f.prio === p ? " selected" : "") + ">" + p + "</option>"; }).join("") +
        '</select>' +
        '<label class="btn ' + (f.lateOnly ? "danger" : "") + '" style="gap:6px;cursor:pointer">' +
          '<input type="checkbox" data-filter="lateOnly" ' + (f.lateOnly ? "checked" : "") + ' style="width:14px;height:14px"> Só atrasados</label>' +
        (anyFilter() ? '<button class="btn ghost sm" data-action="clear-filters">Limpar filtros</button>' : '') +
      '</div>';
  }
  function anyFilter() {
    var f = UI.filters;
    return f.q || f.status || f.resp || f.patio || f.consultor || f.prio || f.lateOnly;
  }

  /* ---------------- Shell / Navegação ---------------- */
  var NAV = [
    { id: "dashboard", label: "Dashboard" },
    { id: "kanban", label: "Kanban" },
    { id: "calendario", label: "Calendário" },
    { id: "torre", label: "Torre de Controle" },
    { id: "cadastro", label: "Cadastrar veículo" },
    { id: "patios", label: "Pátios" },
    { id: "historico", label: "Histórico" }
  ];

  function render() {
    var nav = NAV.map(function (n) {
      return '<button data-action="nav" data-view="' + n.id + '"' +
        (UI.view === n.id ? ' class="active"' : "") + ">" + n.label + "</button>";
    }).join("");

    var body = "";
    switch (UI.view) {
      case "dashboard": body = viewDashboard(); break;
      case "kanban":    body = viewKanban(); break;
      case "calendario": body = viewCalendario(); break;
      case "torre":     body = viewTorre(); break;
      case "cadastro":  body = viewCadastro(); break;
      case "patios":    body = viewPatios(); break;
      case "historico": body = viewHistorico(); break;
    }

    app.innerHTML =
      '<div class="app-shell">' +
        '<header class="topbar">' +
          '<div class="brand">' +
            '<div class="brand-mark">B</div>' +
            '<div class="brand-text"><strong>Torre de Controle</strong><span>Entrega Técnica · Belcar</span></div>' +
          '</div>' +
          '<nav class="nav">' + nav + '</nav>' +
          '<a class="nav-mobile" href="app-celular.html" target="_blank" title="Abrir simulação do app de celular" ' +
            'style="margin-left:8px;color:#fff;background:rgba(255,255,255,.16);border-radius:999px;padding:8px 14px;font-size:13px;font-weight:600;text-decoration:none;white-space:nowrap">📱 App celular</a>' +
        '</header>' +
        '<main class="content">' + body + '</main>' +
      '</div>';
  }

  /* ---------------- Tela: Dashboard ---------------- */
  function viewDashboard() {
    var m = T.metrics();
    var gName = m.gargalo ? (m.gargalo.code + " " + m.gargalo.name) : "—";

    var kpis =
      '<div class="kpi-row">' +
        '<div class="kpi-big ' + (m.atrasadosCount > 0 ? "is-danger" : "") + '">' +
          '<div class="kpi-label">Veículos atrasados</div>' +
          '<div class="kpi-value">' + m.atrasadosCount + '</div>' +
          '<div class="kpi-sub">de ' + m.ativos + ' veículos ativos · fora do SLA da etapa</div>' +
        '</div>' +
        '<div class="kpi-big">' +
          '<div class="kpi-label">Lead time médio</div>' +
          '<div class="kpi-value">' + (m.leadMedio ? num(m.leadMedio, 1) : "—") + ' <span style="font-size:16px;color:var(--muted)">dias</span></div>' +
          '<div class="kpi-sub">do cadastro até a entrega (veículos entregues)</div>' +
        '</div>' +
        '<div class="kpi-big is-warn">' +
          '<div class="kpi-label">Gargalo atual</div>' +
          '<div class="kpi-value" style="font-size:22px;line-height:1.25;margin-top:10px">' + esc(gName) + '</div>' +
          '<div class="kpi-sub">' + m.gargaloCount + ' veículos parados nesta etapa</div>' +
        '</div>' +
      '</div>';

    var minis = [
      { l: "Faturados", v: m.faturados, c: "var(--flow)" },
      { l: "Em preparação", v: m.emPreparacao, c: "#8b5cf6" },
      { l: "Em qualidade", v: m.emQualidade, c: "var(--warn)" },
      { l: "Em pátio", v: m.emPatio, c: "#0ea5e9" },
      { l: "Prontos p/ entrega", v: m.prontos, c: "var(--ok)" },
      { l: "Entregues", v: m.entregues, c: "#15803d" },
      { l: "Atrasados", v: m.atrasadosCount, c: "var(--danger)" },
      { l: "Reprovados agora", v: m.reprovadosAgora, c: "var(--danger)" }
    ].map(function (x) {
      return '<div class="mini"><div class="mini-top"><span class="dot" style="background:' + x.c + '"></span>' +
        '<span class="mini-label">' + x.l + '</span></div><div class="mini-value">' + x.v + '</div></div>';
    }).join("");

    // Gráfico: veículos por etapa (gargalos)
    var stagesActive = T.STAGES.filter(function (s) { return s.code !== "12" && s.code !== "13"; });
    var maxCount = Math.max.apply(null, stagesActive.map(function (s) { return m.porEtapa[s.code] || 0; }).concat([1]));
    var barsGargalo = stagesActive.map(function (s) {
      var c = m.porEtapa[s.code] || 0;
      return barRow(s.code + " " + s.name, c, maxCount, c === m.gargaloCount && c > 0 ? "var(--danger)" : "var(--flow)");
    }).join("");

    // Gráfico: tempo médio por etapa
    var maxTempo = Math.max.apply(null, stagesActive.map(function (s) { return m.tempoEtapa[s.code] || 0; }).concat([1]));
    var barsTempo = stagesActive.map(function (s) {
      var t = m.tempoEtapa[s.code] || 0;
      var over = t > s.sla_dias && s.sla_dias > 0;
      return barRow(s.code + " " + s.name, t, maxTempo, over ? "var(--danger)" : "var(--ok)", num(t, 1) + "d");
    }).join("");

    // Tabela auditável de atrasados
    var rowsAtraso = m.atrasados.length ? m.atrasados.sort(function (a, b) {
      return T.daysInStage(b) - T.daysInStage(a);
    }).map(function (v) {
      return '<tr data-action="open-vehicle" data-id="' + v.id + '">' +
        '<td class="chassi">' + esc(v.chassi) + '</td>' +
        '<td>' + stageTag(v.stage_code) + '</td>' +
        '<td>' + Math.floor(T.daysInStage(v)) + ' dias</td>' +
        '<td>' + slaBadge(v) + '</td>' +
        '<td>' + (v.responsavel ? esc(v.responsavel) : '<span style="color:var(--danger);font-weight:600">Sem responsável</span>') + '</td>' +
        '<td><span class="prio prio-' + v.prioridade + '">' + v.prioridade + '</span></td>' +
        '</tr>';
    }).join("") : '<tr class="empty-row"><td colspan="6">Nenhum veículo atrasado. 👏</td></tr>';

    return '' +
      '<div class="page-head"><div><h2>Dashboard executivo</h2>' +
        '<p>Onde está travando e o que está atrasado — em 3 segundos.</p></div>' +
        '<button class="btn ghost sm" data-action="reset-data" title="Recarregar dados de demonstração">↺ Restaurar dados de demonstração</button></div>' +
      kpis +
      '<div class="mini-row">' + minis + '</div>' +
      '<div class="grid-2" style="margin-bottom:16px">' +
        '<div class="card"><h3>Veículos por etapa · gargalos</h3><div class="bars">' + barsGargalo + '</div></div>' +
        '<div class="card"><h3>Tempo médio por etapa (dias)</h3><div class="bars">' + barsTempo + '</div></div>' +
      '</div>' +
      '<div class="card"><h3>Atrasados · lista auditável (' + m.atrasadosCount + ')</h3>' +
        '<div class="table-wrap" style="box-shadow:none;border:1px solid var(--line)"><table class="data"><thead><tr>' +
          '<th>Chassi</th><th>Etapa</th><th>Tempo na etapa</th><th>SLA</th><th>Responsável</th><th>Prioridade</th>' +
        '</tr></thead><tbody>' + rowsAtraso + '</tbody></table></div></div>';
  }

  function barRow(label, value, max, color, valLabel) {
    var pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
    return '<div class="bar-row"><div class="bar-label" title="' + esc(label) + '">' + esc(label) + '</div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
      '<div class="bar-val">' + (valLabel || value) + '</div></div>';
  }

  /* ---------------- Tela: Kanban ---------------- */
  function viewKanban() {
    var list = filteredVehicles();
    var byStage = {};
    T.STAGES.forEach(function (s) { byStage[s.code] = []; });
    list.forEach(function (v) { (byStage[v.stage_code] = byStage[v.stage_code] || []).push(v); });

    var cols = T.STAGES.map(function (s) {
      var items = byStage[s.code] || [];
      var cards = items.length ? items.map(vehicleCard).join("") :
        '<div class="kan-empty">— vazio —</div>';
      return '<div class="kan-col">' +
        '<div class="kan-head"><span class="dot" style="background:' + s.cor + '"></span>' +
          '<span class="kan-title">' + s.code + " " + esc(s.name) + '</span>' +
          '<span class="kan-count">' + items.length + '</span></div>' +
        '<div class="kan-body">' + cards + '</div></div>';
    }).join("");

    return '<div class="page-head"><div><h2>Kanban operacional</h2>' +
      '<p>Cada coluna é um status. Avance o veículo pelo painel — sempre com responsável.</p></div></div>' +
      filtersBar(false) +
      '<div class="kanban">' + cols + '</div>';
  }

  function vehicleCard(v) {
    var s = T.slaStatus(v);
    var cls = s.level === "late" ? "is-late" : s.level === "warn" ? "is-warn" : s.level === "ok" ? "is-ok" : "";
    var resp = v.responsavel
      ? '<span class="vc-resp">👤 ' + esc(v.responsavel) + '</span>'
      : '<span class="vc-resp missing">⚠ Sem responsável</span>';
    var flags = "";
    if (v.stage_code === "01" && (!v.numero_nf || !v.data_faturamento))
      flags += '<span class="flag" title="Bloqueado pelo gate de faturamento">🔒 Sem NF</span>';
    if ((v.reprovacoes || 0) > 0)
      flags += '<span class="flag" title="Já reprovado na qualidade">↩ Retrabalho</span>';
    return '<div class="vcard ' + cls + '" data-action="open-vehicle" data-id="' + v.id + '">' +
      '<div class="vc-top"><span class="vc-chassi">' + esc(v.chassi) + '</span>' +
        '<span class="prio prio-' + v.prioridade + '">' + v.prioridade + '</span></div>' +
      '<div class="vc-line">' + esc(v.cliente) + '</div>' +
      '<div class="vc-line">' + esc(v.modelo) + (v.implemento ? " · " + esc(v.implemento) : "") + '</div>' +
      '<div class="vc-foot">' + resp + slaBadge(v) + '</div>' +
      (flags ? '<div class="vc-foot" style="margin-top:6px">' + flags + '</div>' : '') +
      '</div>';
  }

  /* ---------------- Tela: Torre de Controle (tabela) ---------------- */
  function viewTorre() {
    var list = filteredVehicles().sort(function (a, b) {
      var la = T.isLate(a) ? 0 : 1, lb = T.isLate(b) ? 0 : 1;
      if (la !== lb) return la - lb;
      return T.stageByCode(a.stage_code).ordem - T.stageByCode(b.stage_code).ordem;
    });
    var rows = list.length ? list.map(function (v) {
      return '<tr data-action="open-vehicle" data-id="' + v.id + '">' +
        '<td class="chassi">' + esc(v.chassi) + '</td>' +
        '<td>' + esc(v.cliente) + '</td>' +
        '<td>' + esc(v.modelo) + '</td>' +
        '<td>' + stageTag(v.stage_code) + '</td>' +
        '<td>' + (v.responsavel ? esc(v.responsavel) : '<span style="color:var(--danger);font-weight:600">—</span>') + '</td>' +
        '<td>' + fmtDate(v.data_faturamento) + '</td>' +
        '<td>' + slaBadge(v) + '</td>' +
        '<td><span class="prio prio-' + v.prioridade + '">' + v.prioridade + '</span></td>' +
        '<td>' + esc(v.patio || "—") + '</td>' +
        '</tr>';
    }).join("") : '<tr class="empty-row"><td colspan="9">Nenhum veículo encontrado com os filtros atuais.</td></tr>';

    return '<div class="page-head"><div><h2>Torre de Controle</h2>' +
      '<p>' + list.length + ' veículo(s) · rastreáveis por chassi. Clique para abrir o painel.</p></div>' +
      '<button class="btn primary" data-action="nav" data-view="cadastro">+ Cadastrar veículo</button></div>' +
      filtersBar(true) +
      '<div class="table-wrap"><table class="data"><thead><tr>' +
        '<th>Chassi</th><th>Cliente</th><th>Modelo</th><th>Status</th><th>Responsável</th>' +
        '<th>Faturamento</th><th>SLA</th><th>Prioridade</th><th>Pátio</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  /* ---------------- Tela: Cadastro ---------------- */
  function viewCadastro() {
    function optList(list) { return list.map(function (x) { return '<option value="' + esc(x) + '">' + esc(x) + "</option>"; }).join(""); }
    return '<div class="page-head"><div><h2>Cadastrar veículo</h2>' +
      '<p>O veículo entra como <b>01 Aguardando Faturamento</b>. Só avança após NF emitida (Gate 01).</p></div></div>' +
      '<div class="card" style="max-width:880px">' +
        '<div class="banner info">ℹ Campos com <b style="color:var(--danger)">*</b> são obrigatórios. Você poderá preencher a NF e atribuir responsável depois, no painel do veículo.</div>' +
        '<form id="form-cadastro" class="form-grid">' +
          field("chassi", "Chassi", "text", true) +
          field("pedido", "Pedido", "text", false) +
          field("cliente", "Cliente", "text", true) +
          '<div class="form-field"><label>Consultor</label><select name="consultor"><option value="">—</option>' +
            optList(["Carlos Andrade", "Patrícia Nunes", "Renato Dias", "Sílvia Rocha"]) + '</select></div>' +
          field("modelo", "Modelo", "text", true) +
          field("cor", "Cor", "text", false) +
          field("implemento", "Implemento", "text", false) +
          field("cidade", "Cidade", "text", false) +
          field("telefone_cliente", "Telefone do cliente", "text", false) +
          field("email_cliente", "E-mail do cliente", "email", false) +
          '<div class="form-field"><label>Prioridade</label><select name="prioridade">' +
            '<option value="Normal">Normal</option><option value="Alta">Alta</option><option value="Urgente">Urgente</option></select></div>' +
          '<div class="form-field"><label>Pátio inicial</label><select name="patio">' +
            optList(T.state().yards.map(function (y) { return y.nome; })) + '</select></div>' +
          field("data_prevista_entrega", "Data prevista de entrega", "date", false) +
          '<div class="form-field full" id="cad-err"></div>' +
        '</form>' +
        '<div class="form-foot">' +
          '<button class="btn ghost" data-action="nav" data-view="torre">Cancelar</button>' +
          '<button class="btn primary" data-action="submit-cadastro">Cadastrar veículo</button>' +
        '</div>' +
      '</div>';
  }
  function field(name, label, type, req) {
    return '<div class="form-field"><label>' + esc(label) + (req ? ' <span class="req">*</span>' : "") +
      '</label><input name="' + name + '" type="' + type + '"></div>';
  }

  /* ---------------- Tela: Pátios ---------------- */
  function viewPatios() {
    var occ = T.yardOccupancy();
    var cards = occ.map(function (y) {
      var pct = y.capacidade ? Math.min(100, Math.round(y.ocupacao / y.capacidade * 100)) : 0;
      var cls = pct >= 100 ? "full" : pct >= 80 ? "high" : "";
      return '<div class="yard"><h4>' + esc(y.nome) + '</h4>' +
        '<div class="yard-sub">' + esc(y.tipo) + '</div>' +
        '<div class="gauge ' + cls + '"><span style="width:' + pct + '%"></span></div>' +
        '<div class="yard-nums"><span>Ocupação: <b>' + y.ocupacao + '/' + y.capacidade + '</b></span>' +
        '<span>Disponível: <b>' + y.disponivel + '</b></span></div></div>';
    }).join("");
    return '<div class="page-head"><div><h2>Pátios e capacidade</h2>' +
      '<p>Ocupação calculada pelos veículos ativos vinculados a cada pátio.</p></div></div>' +
      '<div class="yard-grid">' + cards + '</div>';
  }

  /* ---------------- Tela: Histórico ---------------- */
  function viewHistorico() {
    var f = UI.filters;
    var q = (f.q || "").trim().toUpperCase();
    var movs = T.state().movements.slice().sort(function (a, b) {
      return new Date(b.created_at) - new Date(a.created_at);
    });
    if (q) movs = movs.filter(function (m) { return m.chassi.toUpperCase().indexOf(q) >= 0; });
    movs = movs.slice(0, 300);
    var rows = movs.length ? movs.map(function (m) {
      var ant = m.stage_anterior ? T.stageByCode(m.stage_anterior).code + " " + T.stageByCode(m.stage_anterior).name : "—";
      var nov = T.stageByCode(m.stage_novo).code + " " + T.stageByCode(m.stage_novo).name;
      return '<tr style="cursor:default">' +
        '<td>' + fmtDateTime(m.created_at) + '</td>' +
        '<td class="chassi">' + esc(m.chassi) + '</td>' +
        '<td>' + esc(ant) + '</td>' +
        '<td>' + esc(nov) + '</td>' +
        '<td>' + esc(m.responsavel || "—") + '</td>' +
        '<td style="white-space:normal;max-width:280px">' + esc(m.comentario || "—") + '</td>' +
        '</tr>';
    }).join("") : '<tr class="empty-row"><td colspan="6">Sem movimentações.</td></tr>';

    return '<div class="page-head"><div><h2>Histórico de movimentações</h2>' +
      '<p>Toda mudança de status é registrada automaticamente (data, hora, responsável, motivo).</p></div></div>' +
      '<div class="filters"><div class="search"><input data-filter="q" placeholder="Filtrar por chassi…" value="' + esc(f.q) + '"></div></div>' +
      '<div class="table-wrap"><table class="data"><thead><tr>' +
        '<th>Data / hora</th><th>Chassi</th><th>Status anterior</th><th>Novo status</th><th>Responsável</th><th>Observação</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  /* ============================================================
     CALENDÁRIO
     ============================================================ */
  var MONTHS = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  var DOW = ["seg","ter","qua","qui","sex","sáb","dom"];

  function pad2(n) { return ("0" + n).slice(-2); }
  function ymdOf(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function parseYMD(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmtYMD(s) { if (!s) return "—"; var p = s.split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
  var PRIO_RANK = { Urgente: 0, Alta: 1, Normal: 2 };

  function calLevel(e) {
    var st = T.effectiveCalStatus(e);
    if (st === "Concluído") return "done";
    if (st === "Cancelado" || st === "Reagendado") return "cancelled";
    if (st === "Atrasado") return "late";
    if (e.scheduled_date === ymdOf(new Date())) return "warn"; // hoje = atenção
    return "scheduled";
  }

  function calFilteredEvents() {
    var f = UI.calFilters;
    var q = f.q.trim().toUpperCase();
    var today = ymdOf(new Date());
    var in7 = ymdOf(new Date(Date.now() + 7 * T.DAY));
    return T.calendarEvents().filter(function (e) {
      if (q && e.chassi.toUpperCase().indexOf(q) < 0 &&
          (e.cliente || "").toUpperCase().indexOf(q) < 0 &&
          (e.modelo || "").toUpperCase().indexOf(q) < 0) return false;
      if (f.resp && e.responsible_name !== f.resp) return false;
      if (f.etapa && e.event_type !== f.etapa) return false;
      if (f.status && T.effectiveCalStatus(e) !== f.status) return false;
      if (f.patio && e.yard_name !== f.patio) return false;
      if (f.cidade && e.city !== f.cidade) return false;
      switch (f.quick) {
        case "atrasados": if (T.effectiveCalStatus(e) !== "Atrasado") return false; break;
        case "prox7": if (e.scheduled_date < today || e.scheduled_date > in7) return false; break;
        case "entregas": if (["Entrega Técnica", "Agendamento Cliente"].indexOf(e.event_type) < 0) return false; break;
        case "movimentacoes": if (["Movimentação", "Pátio de Entrega"].indexOf(e.event_type) < 0) return false; break;
        case "preparacao": if (e.event_type !== "Preparação") return false; break;
        case "qualidade": if (e.event_type !== "Qualidade") return false; break;
      }
      return true;
    });
  }

  function viewCalendario() {
    var c = UI.calCursor;
    var monthCap = MONTHS[c.getMonth()].charAt(0).toUpperCase() + MONTHS[c.getMonth()].slice(1);
    var period = UI.calView === "mensal" ? (monthCap + " de " + c.getFullYear())
      : UI.calView === "semanal" ? weekLabel(c) : "Programações";
    var seg = ["mensal", "semanal", "lista"].map(function (v) {
      return '<button data-action="cal-view" data-cv="' + v + '"' + (UI.calView === v ? ' class="active"' : "") + ">" +
        (v === "mensal" ? "Mensal" : v === "semanal" ? "Semanal" : "Lista") + "</button>";
    }).join("");

    var body = UI.calView === "mensal" ? calMonth() : UI.calView === "semanal" ? calWeek() : calList();

    return '<div class="page-head"><div><h2>Calendário operacional</h2>' +
        '<p>Agenda do mês gerada a partir do faturamento. A programação só nasce quando o veículo é <b>Faturado</b>.</p></div>' +
        '<button class="btn ghost sm" data-action="cal-logs">📨 Logs (n8n / e-mail)</button></div>' +
      '<div class="cal-toolbar">' +
        '<div class="segmented">' + seg + '</div>' +
        (UI.calView !== "lista" ?
          '<div class="cal-nav"><button class="btn sm" data-action="cal-prev">‹</button>' +
          '<span class="cal-period">' + period + '</span>' +
          '<button class="btn sm" data-action="cal-next">›</button>' +
          '<button class="btn ghost sm" data-action="cal-today">Hoje</button></div>' : "") +
      '</div>' +
      calFiltersBar() +
      '<div class="cal-legend">' +
        '<span><i style="background:var(--flow)"></i> Programado</span>' +
        '<span><i style="background:var(--warn)"></i> Hoje / atenção</span>' +
        '<span><i style="background:var(--danger)"></i> Atrasado</span>' +
        '<span><i style="background:var(--ok)"></i> Concluído</span>' +
        '<span><i style="background:var(--muted)"></i> Cancelado / reagendado</span>' +
      '</div>' +
      body;
  }

  function calFiltersBar() {
    var f = UI.calFilters;
    function opts(list, sel) { return list.map(function (x) { return '<option value="' + esc(x) + '"' + (sel === x ? " selected" : "") + ">" + esc(x) + "</option>"; }).join(""); }
    var etapaOpts = T.EVENT_TYPES.map(function (t) { return '<option value="' + esc(t) + '"' + (f.etapa === t ? " selected" : "") + ">" + esc(t) + "</option>"; }).join("");
    var statusOpts = ["Programado", "Em andamento", "Concluído", "Atrasado", "Reagendado", "Cancelado"]
      .map(function (s) { return '<option value="' + s + '"' + (f.status === s ? " selected" : "") + ">" + s + "</option>"; }).join("");
    var cidades = []; var seenC = {};
    T.calendarEvents().forEach(function (e) { if (e.city && !seenC[e.city]) { seenC[e.city] = 1; cidades.push(e.city); } });
    var quicks = [
      ["", "Tudo"], ["atrasados", "Atrasados"], ["prox7", "Próximos 7 dias"],
      ["entregas", "Só entregas"], ["movimentacoes", "Só movimentações"],
      ["preparacao", "Só preparação"], ["qualidade", "Só qualidade"]
    ].map(function (x) { return '<option value="' + x[0] + '"' + (f.quick === x[0] ? " selected" : "") + ">" + x[1] + "</option>"; }).join("");

    return '<div class="filters">' +
      '<div class="search"><input data-calfilter="q" placeholder="Buscar chassi, cliente ou modelo…" value="' + esc(f.q) + '"></div>' +
      '<select data-calfilter="resp"><option value="">👤 Responsável (todos)</option>' + opts(T.TEAM, f.resp) + '</select>' +
      '<select data-calfilter="etapa"><option value="">Etapa (todas)</option>' + etapaOpts + '</select>' +
      '<select data-calfilter="status"><option value="">Status (todos)</option>' + statusOpts + '</select>' +
      '<select data-calfilter="patio"><option value="">Pátio (todos)</option>' + opts(uniqueValues("patio"), f.patio) + '</select>' +
      (cidades.length ? '<select data-calfilter="cidade"><option value="">Cidade (todas)</option>' + opts(cidades.sort(), f.cidade) + '</select>' : "") +
      '<select data-calfilter="quick">' + quicks + '</select>' +
      (anyCalFilter() ? '<button class="btn ghost sm" data-action="cal-clear">Limpar</button>' : "") +
      '</div>';
  }
  function anyCalFilter() {
    var f = UI.calFilters;
    return f.q || f.resp || f.etapa || f.status || f.patio || f.cidade || f.quick;
  }

  function chip(e) {
    var lvl = calLevel(e);
    return '<span class="chip lvl-' + lvl + '" data-action="open-cal-event" data-id="' + e.id + '" title="' +
      esc(e.event_type + " · " + e.chassi + " · " + e.cliente + " · " + e.responsible_name) + '">' +
      '<b>' + esc(e.chassi) + '</b> <span class="chip-sub">' + esc(shortEtapa(e.event_type)) + '</span></span>';
  }
  function shortEtapa(t) {
    var map = { "Planejamento de Rota": "Planej.", "Agendamento Cliente": "Agend.", "Pátio de Entrega": "Pátio entr.", "Entrega Técnica": "Entrega", "Movimentação": "Mov.", "Faturamento": "Fatur." };
    return map[t] || t;
  }

  function calMonth() {
    var events = calFilteredEvents();
    var byDay = {};
    events.forEach(function (e) { (byDay[e.scheduled_date] = byDay[e.scheduled_date] || []).push(e); });

    var c = UI.calCursor;
    var first = new Date(c.getFullYear(), c.getMonth(), 1);
    // semana começa na segunda
    var startOffset = (first.getDay() + 6) % 7;
    var start = new Date(first); start.setDate(1 - startOffset);
    var todayStr = ymdOf(new Date());

    var headers = DOW.map(function (d) { return '<div class="month-dow">' + d + "</div>"; }).join("");
    var cells = "";
    for (var i = 0; i < 42; i++) {
      var day = new Date(start); day.setDate(start.getDate() + i);
      var ds = ymdOf(day);
      var out = day.getMonth() !== c.getMonth();
      var list = (byDay[ds] || []).sort(function (a, b) {
        return (PRIO_RANK[a.priority] - PRIO_RANK[b.priority]) || (a.scheduled_time || "").localeCompare(b.scheduled_time || "");
      });
      var shown = list.slice(0, 3).map(chip).join("");
      var more = list.length > 3 ? '<span class="more-chip" data-action="cal-day" data-date="' + ds + '">+' + (list.length - 3) + " mais</span>" : "";
      cells += '<div class="month-cell ' + (out ? "out" : "") + (ds === todayStr ? " today" : "") + '">' +
        '<span class="daynum">' + day.getDate() + "</span>" + shown + more + "</div>";
      if (i >= 34 && day.getMonth() !== c.getMonth() && (day.getDay() + 6) % 7 === 6) break; // corta semana extra vazia
    }
    return '<div class="month-grid">' + headers + cells + "</div>";
  }

  function weekStartOf(d) { var s = new Date(d); s.setDate(d.getDate() - ((d.getDay() + 6) % 7)); s.setHours(0, 0, 0, 0); return s; }
  function weekLabel(d) {
    var s = weekStartOf(d), e = new Date(s); e.setDate(s.getDate() + 5);
    return s.getDate() + "/" + pad2(s.getMonth() + 1) + " – " + e.getDate() + "/" + pad2(e.getMonth() + 1);
  }

  function calWeek() {
    var events = calFilteredEvents();
    var byDay = {};
    events.forEach(function (e) { (byDay[e.scheduled_date] = byDay[e.scheduled_date] || []).push(e); });
    var s = weekStartOf(UI.calCursor);
    var todayStr = ymdOf(new Date());
    var names = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    var cols = "";
    for (var i = 0; i < 6; i++) {
      var day = new Date(s); day.setDate(s.getDate() + i);
      var ds = ymdOf(day);
      var list = (byDay[ds] || []).sort(function (a, b) {
        return (PRIO_RANK[a.priority] - PRIO_RANK[b.priority]) || (a.scheduled_time || "").localeCompare(b.scheduled_time || "");
      });
      var cards = list.length ? list.map(evCard).join("") : '<div class="wc-empty">— sem programações —</div>';
      cols += '<div class="week-col"><div class="wc-head ' + (ds === todayStr ? "today" : "") + '">' +
        '<span>' + names[i] + " " + day.getDate() + "/" + pad2(day.getMonth() + 1) + "</span>" +
        '<span class="kan-count">' + list.length + "</span></div>" +
        '<div class="wc-body">' + cards + "</div></div>";
    }
    return '<div class="week-grid">' + cols + "</div>";
  }

  function evCard(e) {
    var lvl = calLevel(e);
    return '<div class="evcard lvl-' + lvl + '" data-action="open-cal-event" data-id="' + e.id + '">' +
      '<div class="ev-top"><span class="ev-chassi">' + esc(e.chassi) + '</span>' +
        '<span class="prio prio-' + e.priority + '">' + e.priority + '</span></div>' +
      '<div class="ev-etapa">' + esc(e.event_type) + '</div>' +
      '<div class="ev-meta"><span>👤 ' + esc(e.responsible_name) + '</span><span>' + (e.scheduled_time || "") + '</span></div>' +
      '<div class="ev-meta"><span class="ev-status">' + T.effectiveCalStatus(e) + '</span><span>' + esc(e.cliente) + '</span></div>' +
      '</div>';
  }

  function calList() {
    var events = calFilteredEvents().sort(function (a, b) {
      return a.scheduled_date.localeCompare(b.scheduled_date) || (a.scheduled_time || "").localeCompare(b.scheduled_time || "");
    });
    var rows = events.length ? events.map(function (e) {
      var st = T.effectiveCalStatus(e);
      var lvl = calLevel(e);
      return '<tr style="cursor:pointer" data-action="open-cal-event" data-id="' + e.id + '">' +
        '<td>' + fmtYMD(e.scheduled_date) + '</td>' +
        '<td>' + (e.scheduled_time || "—") + '</td>' +
        '<td class="chassi">' + esc(e.chassi) + '</td>' +
        '<td>' + esc(e.cliente) + '</td>' +
        '<td>' + esc(e.event_type) + '</td>' +
        '<td>' + esc(e.responsible_name) + '</td>' +
        '<td><span class="ev-status lvl-' + lvl + '" style="background:var(--cbg);color:var(--ct)">' + st + '</span></td>' +
        '<td>' + (st === "Atrasado" ? '<span class="badge sla-late"><span class="dot"></span>Vencido</span>' :
          st === "Concluído" ? '<span class="badge sla-ok"><span class="dot"></span>OK</span>' :
          '<span class="badge sla-none"><span class="dot"></span>' + fmtYMD(e.sla_due_at) + '</span>') + '</td>' +
        '<td><button class="btn sm" data-action="open-cal-event" data-id="' + e.id + '">Abrir</button></td>' +
        '</tr>';
    }).join("") : '<tr class="empty-row"><td colspan="9">Nenhuma programação com os filtros atuais.</td></tr>';

    return '<div class="table-wrap"><table class="data"><thead><tr>' +
      '<th>Data</th><th>Hora</th><th>Chassi</th><th>Cliente</th><th>Etapa</th><th>Responsável</th><th>Status</th><th>SLA</th><th>Ação</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  /* ---- Drawer do evento de calendário ---- */
  function openCalEvent(id) {
    var e = T.getCalEvent(id);
    if (!e) return;
    var st = T.effectiveCalStatus(e);
    var lvl = calLevel(e);
    var hist = (e.history || []).slice().reverse().map(function (h) {
      return '<div class="tl-item"><div class="tl-when">' + fmtDateTime(h.at) + '</div>' +
        '<div class="tl-what">' + esc(h.note) + '</div><div class="tl-who">por ' + esc(h.who) + '</div></div>';
    }).join("");

    var canFinish = st !== "Concluído" && st !== "Cancelado";
    var html =
      '<div class="drawer-head"><div>' +
        '<div class="dh-chassi" style="font-size:18px">' + esc(e.event_type) + '</div>' +
        '<div class="dh-sub">' + esc(e.chassi) + ' · ' + esc(e.cliente) + '</div>' +
      '</div><button class="x-btn" data-action="close-overlay">✕</button></div>' +
      '<div class="drawer-body">' +
        '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px">' +
          '<span class="ev-status lvl-' + lvl + '" style="background:var(--cbg);color:var(--ct);font-size:12px;padding:4px 12px">' + st + '</span>' +
          '<span class="prio prio-' + e.priority + '">' + e.priority + '</span>' +
          (e.rescheduled_from ? '<span class="flag">↻ reagendado de ' + fmtYMD(e.rescheduled_from) + '</span>' : "") +
        '</div>' +

        '<div class="section-title">Ações</div>' +
        '<div class="actions-bar">' +
          '<button class="btn" data-action="open-vehicle" data-id="' + e.vehicle_id + '">🚚 Abrir veículo</button>' +
          (canFinish ? '<button class="btn primary" data-action="cal-reschedule" data-id="' + id + '">📅 Reagendar</button>' : "") +
          (canFinish ? '<button class="btn ok" data-action="cal-complete" data-id="' + id + '">✓ Concluir</button>' : "") +
          '<button class="btn ghost" data-action="cal-notify" data-id="' + id + '">📨 Notificar responsável</button>' +
        '</div>' +

        '<div class="section-title">Programação</div>' +
        '<div class="kv">' +
          kv("Etapa", e.event_type) + kv("Responsável", e.responsible_name) +
          kv("Data programada", fmtYMD(e.scheduled_date)) + kv("Hora", e.scheduled_time || "—") +
          kv("Status", st) + kv("Prioridade", e.priority) +
          kv("Pátio", e.yard_name) + kv("Cidade", e.city) +
          kv("Modelo", e.modelo) + kv("Concluída em", e.completed_at ? fmtDateTime(e.completed_at) : "—") +
        '</div>' +
        (e.reschedule_reason ? '<div class="banner info">↻ Último motivo de reagendamento: ' + esc(e.reschedule_reason) + '</div>' : "") +

        '<div class="section-title">Histórico da programação</div>' +
        '<div class="timeline">' + (hist || '<div style="color:var(--muted)">Sem registros.</div>') + '</div>' +
      '</div>';
    openOverlay(html, false);
  }

  /* ---- Modal de reagendamento ---- */
  function openReschedule(id) {
    var e = T.getCalEvent(id);
    if (!e) return;
    pendingResched = id;
    var respOpts = '<option value="">— selecione —</option>' + T.TEAM.map(function (t) {
      return '<option value="' + esc(t) + '">' + esc(t) + "</option>";
    }).join("");
    var html =
      '<div class="drawer-head" style="border-radius:12px 12px 0 0"><div>' +
        '<div class="dh-chassi" style="font-size:16px">Reagendar programação</div>' +
        '<div class="dh-sub">' + esc(e.event_type) + ' · ' + esc(e.chassi) + ' · atual: ' + fmtYMD(e.scheduled_date) + ' ' + (e.scheduled_time || "") + '</div>' +
      '</div><button class="x-btn" data-action="close-overlay">✕</button></div>' +
      '<div class="drawer-body">' +
        '<div class="form-grid">' +
          '<div class="form-field"><label>Nova data <span class="req">*</span></label><input type="date" id="rs-date" value="' + e.scheduled_date + '"></div>' +
          '<div class="form-field"><label>Novo horário</label><input type="time" id="rs-time" value="' + (e.scheduled_time || "") + '"></div>' +
          '<div class="form-field full"><label>Motivo do reagendamento <span class="req">*</span></label><textarea id="rs-motivo" placeholder="Ex.: veículo ainda em movimentação"></textarea></div>' +
          '<div class="form-field"><label>Responsável pela alteração <span class="req">*</span></label><select id="rs-by">' + respOpts + '</select></div>' +
          '<div class="form-field"><label>Notificações</label>' +
            '<label style="font-weight:400;display:flex;gap:7px;align-items:center;margin-top:6px"><input type="checkbox" id="rs-notif-resp" checked style="width:14px;height:14px"> Notificar responsável</label>' +
            '<label style="font-weight:400;display:flex;gap:7px;align-items:center;margin-top:4px"><input type="checkbox" id="rs-notif-cli" style="width:14px;height:14px"> Notificar cliente</label>' +
          '</div>' +
        '</div>' +
        '<div class="form-err" id="rs-err" style="margin-top:8px"></div>' +
        '<div class="form-foot"><button class="btn ghost" data-action="close-overlay">Cancelar</button>' +
          '<button class="btn primary" data-action="cal-reschedule-confirm">Reagendar</button></div>' +
      '</div>';
    openOverlay(html, true);
  }

  function confirmReschedule() {
    if (!pendingResched) return;
    var date = ($("#rs-date") || {}).value;
    var time = ($("#rs-time") || {}).value;
    var motivo = ($("#rs-motivo") || {}).value || "";
    var by = ($("#rs-by") || {}).value;
    var notifResp = ($("#rs-notif-resp") || {}).checked;
    var notifCli = ($("#rs-notif-cli") || {}).checked;
    var err = $("#rs-err");
    if (!date) { if (err) err.textContent = "Informe a nova data."; return; }
    if (!motivo.trim()) { if (err) err.textContent = "O motivo é obrigatório."; return; }
    if (!by) { if (err) err.textContent = "Informe quem está reagendando."; return; }
    var e = T.rescheduleEvent(pendingResched, {
      nova_data: date, novo_horario: time, motivo: motivo.trim(),
      responsavel_alteracao: by, notif_resp: notifResp, notif_cliente: notifCli
    });
    closeOverlay();
    toast("Programação reagendada para " + fmtYMD(date) + ". Histórico e logs gerados.", "ok");
    render();
  }

  /* ---- Logs n8n / e-mail ---- */
  function openLogs() {
    var wh = T.webhookEvents().slice().reverse().slice(0, 40);
    var em = T.notifications().slice().reverse().slice(0, 40);
    var whHtml = wh.length ? wh.map(function (w) {
      return '<div class="log-item"><span class="log-when">' + fmtDateTime(w.created_at) + '</span>' +
        '<span class="log-ev">' + esc(w.event) + '</span> · ' + esc(w.payload.calendar_event.chassi) +
        '<pre>' + esc(JSON.stringify(w.payload, null, 2)) + '</pre></div>';
    }).join("") : '<div style="color:var(--muted)">Nenhum evento ainda.</div>';
    var emHtml = em.length ? em.map(function (n) {
      return '<div class="log-item"><span class="log-when">' + fmtDateTime(n.created_at) + '</span>' +
        '<span class="log-ev">' + esc(n.status) + '</span> → ' + esc(n.recipient) +
        '<div style="margin-top:4px;font-weight:600">' + esc(n.subject) + '</div>' +
        '<pre>' + esc(n.body) + '</pre></div>';
    }).join("") : '<div style="color:var(--muted)">Nenhum e-mail simulado ainda.</div>';

    var html =
      '<div class="drawer-head" style="border-radius:12px 12px 0 0"><div>' +
        '<div class="dh-chassi" style="font-size:16px">Logs de integração</div>' +
        '<div class="dh-sub">Eventos n8n e e-mails simulados (modo desenvolvimento — nada é enviado de verdade)</div>' +
      '</div><button class="x-btn" data-action="close-overlay">✕</button></div>' +
      '<div class="drawer-body">' +
        '<div class="tabs"><button class="active" data-action="logs-tab" data-tab="n8n">Eventos n8n (' + T.webhookEvents().length + ')</button>' +
          '<button data-action="logs-tab" data-tab="email">E-mails simulados (' + T.notifications().length + ')</button></div>' +
        '<div id="logs-n8n" class="log-list">' + whHtml + '</div>' +
        '<div id="logs-email" class="log-list" hidden>' + emHtml + '</div>' +
      '</div>';
    openOverlay(html, true);
  }

  /* ---------------- Painel do veículo (drawer) ---------------- */
  function openVehicle(id) {
    var v = T.getVehicle(id);
    if (!v) return;
    var st = T.stageByCode(v.stage_code);
    var gateBlocked = v.stage_code === "01" && (!v.numero_nf || !v.data_faturamento);

    // Ações conforme a etapa
    var actions = "";
    if (v.stage_code === "07") {
      actions =
        '<button class="btn ok" data-action="approve" data-id="' + id + '">✓ Aprovar (→ 09 Liberado)</button>' +
        '<button class="btn danger" data-action="reject" data-id="' + id + '">✕ Reprovar (→ 08)</button>';
    } else if (v.stage_code === "08") {
      actions = '<button class="btn primary" data-action="advance" data-id="' + id + '">↩ Retornar p/ Preparação (→ 06)</button>';
    } else if (v.stage_code === "12") {
      actions = '<button class="btn ok" data-action="advance" data-id="' + id + '">✓ Encerrar processo (→ 13)</button>';
    } else if (v.stage_code === "13") {
      actions = '<span style="color:var(--muted)">Processo encerrado.</span>';
    } else {
      var nx = T.nextCode(v.stage_code);
      var nxName = nx ? (T.stageByCode(nx).code + " " + T.stageByCode(nx).name) : "—";
      actions = '<button class="btn primary" data-action="advance" data-id="' + id + '"' + (gateBlocked ? "" : "") + '>→ Avançar etapa (→ ' + esc(nxName) + ')</button>';
    }

    var movs = T.movementsFor(id).reverse();
    var timeline = movs.map(function (m) {
      var nov = T.stageByCode(m.stage_novo);
      return '<div class="tl-item ' + (m.stage_novo === "08" ? "reprovado" : "") + '">' +
        '<div class="tl-when">' + fmtDateTime(m.created_at) + '</div>' +
        '<div class="tl-what">' + (m.stage_anterior ? esc(T.stageByCode(m.stage_anterior).name) + " → " : "") + "<b>" + esc(nov.name) + "</b></div>" +
        '<div class="tl-who">por ' + esc(m.responsavel || "—") + '</div>' +
        (m.comentario ? '<div class="tl-note">' + esc(m.comentario) + '</div>' : "") +
        '</div>';
    }).join("");

    var respOpts = '<option value="">— selecione —</option>' + T.TEAM.map(function (t) {
      return '<option value="' + esc(t) + '"' + (v.responsavel === t ? " selected" : "") + ">" + esc(t) + "</option>";
    }).join("");
    var patioOpts = T.state().yards.map(function (y) {
      return '<option value="' + esc(y.nome) + '"' + (v.patio === y.nome ? " selected" : "") + ">" + esc(y.nome) + "</option>";
    }).join("");
    var prioOpts = ["Normal", "Alta", "Urgente"].map(function (p) {
      return '<option value="' + p + '"' + (v.prioridade === p ? " selected" : "") + ">" + p + "</option>";
    }).join("");

    var html =
      '<div class="drawer-head"><div>' +
        '<div class="dh-chassi">' + esc(v.chassi) + '</div>' +
        '<div class="dh-sub">' + esc(v.cliente) + ' · ' + esc(v.modelo) + '</div>' +
      '</div><button class="x-btn" data-action="close-overlay">✕</button></div>' +
      '<div class="drawer-body">' +
        '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px">' +
          stageTag(v.stage_code) + slaBadge(v) +
          '<span class="prio prio-' + v.prioridade + '">' + v.prioridade + '</span>' +
          ((v.reprovacoes || 0) > 0 ? '<span class="flag">↩ ' + v.reprovacoes + ' reprovação(ões)</span>' : "") +
        '</div>' +

        (gateBlocked ? '<div class="banner warn">🔒 <b>Gate 01 · Faturamento:</b> informe número da NF e data de faturamento abaixo para liberar o avanço.</div>' : "") +
        (!v.responsavel ? '<div class="banner warn">⚠ <b>Sem responsável:</b> defina um responsável antes de avançar a etapa.</div>' : "") +

        '<div class="section-title">Ações</div>' +
        '<div class="actions-bar">' + actions + '</div>' +

        '<div class="section-title">Dados editáveis</div>' +
        '<div class="form-grid" id="veh-edit">' +
          '<div class="form-field"><label>Responsável atual</label><select name="responsavel">' + respOpts + '</select></div>' +
          '<div class="form-field"><label>Prioridade</label><select name="prioridade">' + prioOpts + '</select></div>' +
          '<div class="form-field"><label>Número da NF</label><input name="numero_nf" value="' + esc(v.numero_nf) + '"></div>' +
          '<div class="form-field"><label>Data de faturamento</label><input type="date" name="data_faturamento" value="' + (v.data_faturamento ? v.data_faturamento.slice(0, 10) : "") + '"></div>' +
          '<div class="form-field"><label>Pátio</label><select name="patio"><option value="">—</option>' + patioOpts + '</select></div>' +
          '<div class="form-field"><label>Data prevista de entrega</label><input type="date" name="data_prevista_entrega" value="' + (v.data_prevista_entrega ? v.data_prevista_entrega.slice(0, 10) : "") + '"></div>' +
          '<div class="form-field full"><label>Observações</label><textarea name="observacao">' + esc(v.observacao) + '</textarea></div>' +
        '</div>' +
        '<div class="form-foot" style="justify-content:flex-start"><button class="btn primary" data-action="save-vehicle" data-id="' + id + '">Salvar alterações</button></div>' +

        '<div class="section-title">Dados gerais</div>' +
        '<div class="kv">' +
          kv("Pedido", v.pedido) + kv("Consultor", v.consultor) +
          kv("Cor", v.cor) + kv("Implemento", v.implemento) +
          kv("Cidade", v.cidade) + kv("Ano/Modelo", v.ano_modelo) +
          kv("Telefone", v.telefone_cliente) + kv("E-mail", v.email_cliente) +
          kv("Cadastrado em", fmtDate(v.created_at)) + kv("Na etapa há", Math.floor(T.daysInStage(v)) + " dia(s)") +
        '</div>' +

        '<div class="section-title">Linha do tempo</div>' +
        '<div class="timeline">' + (timeline || '<div style="color:var(--muted)">Sem registros.</div>') + '</div>' +
      '</div>';

    openOverlay(html, false);
  }
  function kv(k, val) {
    return '<div><div class="k">' + esc(k) + '</div><div class="v">' + (val ? esc(val) : "—") + "</div></div>";
  }

  /* ---------------- Modal: confirmar avanço de etapa ---------------- */
  function openMoveModal(id, target, opts) {
    opts = opts || {};
    var v = T.getVehicle(id);
    if (!v) return;
    var stTarget = T.stageByCode(target);
    pendingMove = { id: id, target: target, requireComment: !!opts.requireComment };

    var respOpts = '<option value="">— selecione —</option>' + T.TEAM.map(function (t) {
      return '<option value="' + esc(t) + '"' + (v.responsavel === t ? " selected" : "") + ">" + esc(t) + "</option>";
    }).join("");

    var html =
      '<div class="drawer-head" style="border-radius:12px 12px 0 0"><div>' +
        '<div class="dh-chassi" style="font-size:16px">' + esc(opts.title || "Mover etapa") + '</div>' +
        '<div class="dh-sub">' + esc(v.chassi) + ' → ' + stTarget.code + ' ' + esc(stTarget.name) + '</div>' +
      '</div><button class="x-btn" data-action="close-move">✕</button></div>' +
      '<div class="drawer-body">' +
        '<div class="form-field" style="margin-bottom:14px"><label>Responsável <span class="req">*</span> ' +
          '<span style="font-weight:400;color:var(--muted)">(obrigatório — dor nº 1)</span></label>' +
          '<select id="mv-resp">' + respOpts + '</select></div>' +
        '<div class="form-field"><label>' + (opts.requireComment ? 'Motivo <span class="req">*</span>' : "Comentário") +
          '</label><textarea id="mv-comment" placeholder="' + esc(opts.placeholder || "Opcional…") + '"></textarea></div>' +
        '<div class="form-err" id="mv-err" style="margin-top:8px"></div>' +
        '<div class="form-foot">' +
          '<button class="btn ghost" data-action="close-move">Cancelar</button>' +
          '<button class="btn ' + (opts.confirmClass || "primary") + '" data-action="confirm-move">' + esc(opts.confirmLabel || "Confirmar") + '</button>' +
        '</div>' +
      '</div>';
    openOverlay(html, true);
  }

  function confirmMove() {
    if (!pendingMove) return;
    var v = T.getVehicle(pendingMove.id);
    var resp = ($("#mv-resp") || {}).value || "";
    var comment = ($("#mv-comment") || {}).value || "";
    var err = $("#mv-err");

    if (!resp) { if (err) err.textContent = "Selecione o responsável. Nenhuma etapa avança sem responsável."; return; }
    if (pendingMove.requireComment && !comment.trim()) { if (err) err.textContent = "O motivo é obrigatório."; return; }

    T.moveStage(v, pendingMove.target, resp, comment.trim());
    var movedTo = T.stageByCode(pendingMove.target);
    closeOverlay();
    toast("Veículo " + v.chassi + " → " + movedTo.code + " " + movedTo.name, "ok");
    render();
  }

  /* ---------------- Ações de avanço (com regras) ---------------- */
  function doAdvance(id) {
    var v = T.getVehicle(id);
    var check = T.canAdvance(v);
    if (!check.ok) { toast(check.motivo, "danger"); return; }
    var target = v.stage_code === "08" ? "06" : T.nextCode(v.stage_code);
    if (!target) { toast("Não há próxima etapa.", "danger"); return; }
    var titles = {
      "06": "Retornar para preparação",
      "13": "Encerrar processo"
    };
    openMoveModal(id, target, {
      title: v.stage_code === "08" ? "Retornar para preparação" : (v.stage_code === "12" ? "Encerrar processo" : "Avançar etapa"),
      confirmLabel: v.stage_code === "12" ? "Encerrar" : "Avançar"
    });
  }
  function doApprove(id) {
    openMoveModal(id, "09", { title: "Aprovar na qualidade", confirmLabel: "Aprovar", confirmClass: "ok",
      placeholder: "Observações da inspeção (opcional)…" });
  }
  function doReject(id) {
    openMoveModal(id, "08", { title: "Reprovar na qualidade", confirmLabel: "Reprovar", confirmClass: "danger",
      requireComment: true, placeholder: "Descreva o motivo da reprovação (obrigatório)…" });
  }

  function saveVehicleEdits(id) {
    var root = $("#veh-edit");
    if (!root) return;
    var patch = {};
    $all("[name]", root).forEach(function (input) {
      var val = input.value;
      if ((input.name === "data_faturamento" || input.name === "data_prevista_entrega") && val) {
        val = new Date(val + "T12:00:00").toISOString();
      }
      patch[input.name] = val;
    });
    T.updateVehicle(id, patch);
    toast("Alterações salvas.", "ok");
    openVehicle(id); // reabre com dados atualizados
    render();
  }

  function submitCadastro() {
    var form = $("#form-cadastro");
    var data = {};
    $all("[name]", form).forEach(function (i) {
      var val = i.value.trim();
      if (i.name === "data_prevista_entrega" && val) val = new Date(val + "T12:00:00").toISOString();
      data[i.name] = val;
    });
    var errs = [];
    if (!data.chassi) errs.push("Chassi é obrigatório.");
    if (!data.cliente) errs.push("Cliente é obrigatório.");
    if (!data.modelo) errs.push("Modelo é obrigatório.");
    if (data.chassi) {
      var dup = T.state().vehicles.some(function (v) { return v.chassi.toUpperCase() === data.chassi.toUpperCase(); });
      if (dup) errs.push("Já existe um veículo com este chassi.");
    }
    var errBox = $("#cad-err");
    if (errs.length) {
      if (errBox) errBox.innerHTML = '<div class="banner warn">⚠ ' + errs.map(esc).join("<br>") + "</div>";
      return;
    }
    if (!data.prioridade) data.prioridade = "Normal";
    data.chassi = data.chassi.toUpperCase();
    var v = T.addVehicle(data);
    UI.view = "torre";
    render();
    toast("Veículo " + v.chassi + " cadastrado em 01 Aguardando Faturamento.", "ok");
    openVehicle(v.id);
  }

  /* ---------------- Delegação de eventos ---------------- */
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-action]");
    if (!t) {
      // clique fora do card de overlay fecha o drawer/modal
      if (e.target === overlay) closeOverlay();
      return;
    }
    var act = t.getAttribute("data-action");
    var id = t.getAttribute("data-id");
    switch (act) {
      case "nav": UI.view = t.getAttribute("data-view"); render(); window.scrollTo(0, 0); break;
      case "open-vehicle": openVehicle(id); break;
      case "close-overlay": closeOverlay(); break;
      case "close-move": closeOverlay(); break;
      case "advance": doAdvance(id); break;
      case "approve": doApprove(id); break;
      case "reject": doReject(id); break;
      case "confirm-move": confirmMove(); break;
      case "save-vehicle": saveVehicleEdits(id); break;
      case "submit-cadastro": submitCadastro(); break;
      case "clear-filters":
        UI.filters = { q: "", status: "", resp: "", patio: "", consultor: "", prio: "", lateOnly: false };
        render(); break;
      case "reset-data":
        if (confirm("Restaurar os dados de demonstração? As alterações locais serão perdidas.")) {
          T.resetData(); render(); toast("Dados de demonstração restaurados.", "ok");
        }
        break;

      /* ---- Calendário ---- */
      case "cal-view": UI.calView = t.getAttribute("data-cv"); render(); break;
      case "cal-prev": shiftCalendar(-1); render(); break;
      case "cal-next": shiftCalendar(1); render(); break;
      case "cal-today": UI.calCursor = new Date(); render(); break;
      case "cal-clear": UI.calFilters = { q: "", resp: "", etapa: "", status: "", patio: "", cidade: "", quick: "" }; render(); break;
      case "cal-day":
        UI.calView = "lista"; UI.calCursor = parseYMD(t.getAttribute("data-date"));
        UI.calFilters.q = ""; render(); break;
      case "open-cal-event": openCalEvent(id); break;
      case "cal-reschedule": openReschedule(id); break;
      case "cal-reschedule-confirm": confirmReschedule(); break;
      case "cal-complete":
        T.completeCalEvent(id, T.CURRENT_USER.nome); openCalEvent(id); render();
        toast("Programação concluída. Evento e e-mail registrados.", "ok"); break;
      case "cal-notify":
        T.notifyResponsible(id, T.CURRENT_USER.nome);
        toast("Responsável notificado (log de e-mail simulado gerado).", "ok"); break;
      case "cal-logs": openLogs(); break;
      case "logs-tab":
        var tab = t.getAttribute("data-tab");
        $all(".tabs button").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-tab") === tab); });
        var n8n = $("#logs-n8n"), eml = $("#logs-email");
        if (n8n && eml) { n8n.hidden = tab !== "n8n"; eml.hidden = tab !== "email"; }
        break;
    }
  });

  function shiftCalendar(dir) {
    var c = new Date(UI.calCursor);
    if (UI.calView === "semanal") c.setDate(c.getDate() + dir * 7);
    else c.setMonth(c.getMonth() + dir);
    UI.calCursor = c;
  }

  // Filtros (input/change) com leve debounce para o campo de busca
  var debounceTimer;
  document.addEventListener("input", function (e) {
    var el = e.target.closest("[data-filter]");
    var cel = e.target.closest("[data-calfilter]");
    if (el) {
      var key = el.getAttribute("data-filter");
      UI.filters[key] = el.type === "checkbox" ? el.checked : el.value;
      if (key === "q") { clearTimeout(debounceTimer); debounceTimer = setTimeout(function () { rerenderKeepFocus('[data-filter="q"]'); }, 200); }
      else render();
    } else if (cel) {
      var ckey = cel.getAttribute("data-calfilter");
      UI.calFilters[ckey] = cel.type === "checkbox" ? cel.checked : cel.value;
      if (ckey === "q") { clearTimeout(debounceTimer); debounceTimer = setTimeout(function () { rerenderKeepFocus('[data-calfilter="q"]'); }, 200); }
      else render();
    }
  });
  document.addEventListener("change", function (e) {
    var el = e.target.closest("[data-filter]");
    if (!el || el.getAttribute("data-filter") === "q") return;
    // selects/checkbox já tratados no input; garante atualização em alguns navegadores
  });

  function rerenderKeepFocus(sel) {
    render();
    var box = $(sel || '[data-filter="q"]');
    if (box) { box.focus(); var l = box.value.length; box.setSelectionRange(l, l); }
  }

  // Esc fecha overlay
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !overlay.hidden) closeOverlay(); });

  /* ---------------- Inicialização ---------------- */
  T.load();
  render();
})();
