/* ============================================================
   Torre de Controle · App Celular (simulação) · Belcar
   Mobile-first. Compartilha a base de dados/regras de assets/data.js.
   ============================================================ */
(function () {
  "use strict";
  var T = window.TC;
  T.load();

  var screen = document.getElementById("screen");
  var USER_KEY = "tc_mobile_user";

  var M = {
    user: null,
    tab: "hoje",
    hojeFilter: "meus",
    kanStatus: "06",
    calView: "lista",
    calCursor: new Date(),
    calF: { q: "", resp: "", quick: "" },
    searchQ: "",
    vehicleId: null,
    vehicleTab: "resumo",
    online: true,
    sheet: null
  };

  try { var saved = localStorage.getItem(USER_KEY); if (saved) { M.user = JSON.parse(saved); T.setActor(M.user); } } catch (e) {}

  /* ---------------- helpers ---------------- */
  function esc(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function pad(n) { return ("0" + n).slice(-2); }
  function ymd(d) { var x = new Date(d); return x.getFullYear() + "-" + pad(x.getMonth() + 1) + "-" + pad(x.getDate()); }
  function parseYMD(s) { var p = String(s).split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmtYMD(s) { if (!s) return "—"; var p = String(s).split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
  function fmtDate(iso) { if (!iso) return "—"; var d = new Date(iso); return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear(); }
  function fmtDateTime(iso) { if (!iso) return "—"; var d = new Date(iso); return fmtDate(iso) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function initials(name) { return (name || "?").split(" ").map(function (w) { return w[0]; }).slice(0, 2).join("").toUpperCase(); }
  function readOnly() { return !T.canEdit(M.user); }

  var SLA_TXT = { ok: "No prazo", warn: "Atenção", late: "Atrasado", none: "—" };
  function slaBadge(v) {
    var s = T.slaStatus(v);
    var cls = s.level === "ok" ? "b-ok" : s.level === "warn" ? "b-warn" : s.level === "late" ? "b-late" : "b-gray";
    var txt = s.level === "none" ? (s.dias + "d") : (s.dias + "/" + s.sla + "d · " + SLA_TXT[s.level]);
    return '<span class="badge ' + cls + '"><span class="dot"></span>' + txt + "</span>";
  }
  function lvlClass(v) { var l = T.slaStatus(v).level; return l === "late" ? "lv-late" : l === "warn" ? "lv-warn" : l === "ok" ? "lv-ok" : "lv-gray"; }
  function statusBadge(code) {
    var st = T.stageByCode(code);
    var cls = code === "08" ? "b-late" : (["12", "13", "09"].indexOf(code) >= 0 ? "b-done" : "b-flow");
    return '<span class="badge ' + cls + '"><span class="dot"></span>' + st.code + " " + esc(st.name) + "</span>";
  }
  function teamOptions(sel) {
    return T.TEAM.map(function (t) { return '<option value="' + esc(t) + '"' + (sel === t ? " selected" : "") + ">" + esc(t) + "</option>"; }).join("");
  }
  function mineFilter(v) {
    if (["Administrador", "Gestor Operacional", "Visualizador"].indexOf(M.user.perfil) >= 0) return true;
    return v.responsavel === M.user.team;
  }

  /* ---------------- render principal ---------------- */
  function render() {
    if (!M.user) { screen.innerHTML = loginScreen(); return; }
    if (M.vehicleId) { screen.innerHTML = vehicleScreen(); return; }
    screen.innerHTML = appShell();
  }

  function statusbarHTML() {
    var d = new Date();
    return '<div class="statusbar"><span>' + pad(d.getHours()) + ":" + pad(d.getMinutes()) + '</span>' +
      '<span class="sb-right">' + (M.online ? "" : "✈ ") + '📶 100%</span></div>';
  }

  function appShell() {
    var titles = { hoje: ["Hoje", "Operação do dia"], kanban: ["Fluxo", "Kanban operacional"],
      calendario: ["Calendário", "Agenda do mês"], buscar: ["Buscar", "Por chassi, NF, cliente…"], alertas: ["Alertas", "Central de notificações"] };
    var t = titles[M.tab];
    var content = "";
    switch (M.tab) {
      case "hoje": content = tabHoje(); break;
      case "kanban": content = tabKanban(); break;
      case "calendario": content = tabCalendario(); break;
      case "buscar": content = tabBuscar(); break;
      case "alertas": content = tabAlertas(); break;
    }
    var alertCount = computeAlerts().length;
    var nav = [
      ["hoje", "🏠", "Hoje"], ["kanban", "📋", "Fluxo"], ["calendario", "📅", "Agenda"],
      ["buscar", "🔍", "Buscar"], ["alertas", "🔔", "Alertas"]
    ].map(function (n) {
      var pill = n[0] === "alertas" && alertCount ? '<span class="pill">' + (alertCount > 9 ? "9+" : alertCount) + "</span>" : "";
      return '<button data-act="tab" data-tab="' + n[0] + '" class="' + (M.tab === n[0] ? "active" : "") + '">' +
        pill + '<span class="ic">' + n[1] + "</span>" + n[2] + "</button>";
    }).join("");

    return statusbarHTML() +
      (M.online ? "" : '<div class="offline-bar">✈ Offline · ações ficam aguardando sincronização</div>') +
      '<div class="appbar"><div style="flex:1"><div class="ab-title">' + t[0] + '</div><div class="ab-sub">' + t[1] + '</div></div>' +
        '<button class="ab-btn" data-act="perfil" title="Perfil">' + initials(M.user.nome) + '</button></div>' +
      '<div class="content">' + content + '</div>' +
      '<div class="tabbar">' + nav + "</div>" +
      '<div id="sheet-root"></div><div id="toast-root"></div>';
  }

  /* ---------------- LOGIN ---------------- */
  function loginScreen() {
    var users = T.MOBILE_USERS.map(function (u) {
      return '<div class="user-pick" data-act="login" data-id="' + u.id + '">' +
        '<div class="av">' + initials(u.nome) + "</div>" +
        '<div><div class="u-name">' + esc(u.nome) + '</div><div class="u-role">' + esc(u.perfil) + "</div></div></div>";
    }).join("");
    return statusbarHTML() +
      '<div class="login">' +
        '<div class="logo">B</div>' +
        '<h1>Torre de Controle</h1>' +
        '<p>Entrega Técnica Belcar · app operacional. Toque no seu usuário para entrar (demonstração).</p>' +
        '<div class="ul-h">Entrar como</div>' + users +
      '</div><div id="toast-root"></div>';
  }

  /* ---------------- TAB: HOJE ---------------- */
  function tabHoje() {
    var vs = T.state().vehicles;
    var ativos = vs.filter(function (v) { return !T.isFinished(v); });
    var atrasados = ativos.filter(T.isLate);
    var meus = ativos.filter(mineFilter);
    var semResp = ativos.filter(function (v) { return !v.responsavel; });
    var reprovados = vs.filter(function (v) { return v.stage_code === "08"; });
    var hojeStr = ymd(new Date());
    var in7 = ymd(new Date(Date.now() + 7 * T.DAY));
    var evHoje = T.calendarEvents().filter(function (e) { return e.scheduled_date === hojeStr && T.effectiveCalStatus(e) !== "Concluído"; });
    var ev7 = T.calendarEvents().filter(function (e) { return e.scheduled_date >= hojeStr && e.scheduled_date <= in7 && T.effectiveCalStatus(e) !== "Concluído"; });

    var quicks = [
      ["atrasados", atrasados.length, "Atrasados", "danger"],
      ["hoje", evHoje.length, "Hoje", "warn"],
      ["prox7", ev7.length, "Próx. 7 dias", ""],
      ["meus", meus.length, "Meus veículos", "ok"],
      ["semresp", semResp.length, "Sem responsável", "danger"],
      ["reprovados", reprovados.length, "Reprovados", "danger"]
    ].map(function (q) {
      return '<button class="quick ' + q[3] + (M.hojeFilter === q[0] ? " active" : "") + '" data-act="hoje-filter" data-f="' + q[0] + '">' +
        '<div class="q-val">' + q[1] + '</div><div class="q-lbl">' + q[2] + "</div></button>";
    }).join("");

    var body = "";
    if (M.hojeFilter === "hoje" || M.hojeFilter === "prox7") {
      var list = M.hojeFilter === "hoje" ? evHoje : ev7;
      list = list.sort(function (a, b) { return a.scheduled_date.localeCompare(b.scheduled_date); });
      body = '<div class="section-h">' + (M.hojeFilter === "hoje" ? "Programações de hoje" : "Próximos 7 dias") + "</div>" +
        (list.length ? list.map(eventRow).join("") : emptyMsg("Nada programado.", "📅"));
    } else {
      var map = { meus: meus, atrasados: atrasados, semresp: semResp, reprovados: reprovados };
      var labels = { meus: "Meus veículos", atrasados: "Veículos atrasados", semresp: "Sem responsável", reprovados: "Reprovados na qualidade" };
      var arr = (map[M.hojeFilter] || meus).sort(function (a, b) { return T.daysInStage(b) - T.daysInStage(a); });
      body = '<div class="section-h">' + labels[M.hojeFilter] + " (" + arr.length + ")</div>" +
        (arr.length ? arr.map(vehicleCard).join("") : emptyMsg("Nada por aqui.", "✅"));
    }

    return '<div class="quick-grid">' + quicks + "</div>" + body;
  }

  function emptyMsg(txt, ic) { return '<div class="empty"><div class="big">' + (ic || "📭") + "</div>" + esc(txt) + "</div>"; }

  function vehicleCard(v) {
    var icons = "";
    if (T.attachmentsFor(v.id).length) icons += "📷";
    var etapaCk = T.checklistEtapaFor(v.stage_code);
    if (etapaCk) { var ck = T.checklistFor(v.id, etapaCk); var done = ck.filter(function (i) { return i.done; }).length; icons += " ✓" + done + "/" + ck.length; }
    if (T.commentsFor(v.id).length) icons += " 💬";
    var noNf = v.stage_code === "01" && !v.numero_nf ? "🔒" : "";
    return '<div class="vcard ' + lvlClass(v) + '" data-act="open-veh" data-id="' + v.id + '">' +
      '<div class="vc-top"><span class="vc-chassi">' + esc(v.chassi) + " " + noNf + '</span>' + slaBadge(v) + "</div>" +
      '<div class="vc-cli">' + esc(v.cliente) + '</div><div class="vc-mod">' + esc(v.modelo) + (v.implemento ? " · " + esc(v.implemento) : "") + '</div>' +
      '<div class="vc-foot">' +
        (v.responsavel ? '<span class="resp">👤 ' + esc(v.responsavel) + "</span>" : '<span class="resp missing">⚠ Sem responsável</span>') +
        '<span class="badge b-flow"><span class="dot"></span>' + T.stageByCode(v.stage_code).code + " " + esc(T.stageByCode(v.stage_code).name) + "</span>" +
      "</div>" +
      (icons.trim() ? '<div class="vc-foot"><span class="vc-icons">' + icons + "</span><span class='muted' style='font-size:11px'>" + (v.cidade || "") + "</span></div>" : "") +
      "</div>";
  }

  /* ---------------- TAB: KANBAN ---------------- */
  function tabKanban() {
    var vs = T.state().vehicles;
    var counts = {};
    T.STAGES.forEach(function (s) { counts[s.code] = 0; });
    vs.forEach(function (v) { counts[v.stage_code] = (counts[v.stage_code] || 0) + 1; });

    var chips = T.STAGES.map(function (s) {
      return '<button class="schip ' + (M.kanStatus === s.code ? "active" : "") + '" data-act="kan-status" data-code="' + s.code + '">' +
        s.code + " " + esc(s.name) + ' <span class="cnt">' + (counts[s.code] || 0) + "</span></button>";
    }).join("");

    var list = vs.filter(function (v) { return v.stage_code === M.kanStatus; });
    var cards = list.length ? list.map(function (v) {
      var canAdv = v.stage_code !== "12" && v.stage_code !== "13" && !readOnly();
      return vehicleCard(v) + (canAdv ?
        '<div style="margin:-6px 0 12px;display:flex;gap:8px">' +
          (v.stage_code === "07"
            ? '<button class="btn ok sm" data-act="approve" data-id="' + v.id + '">✓ Aprovar</button><button class="btn danger sm" data-act="reject" data-id="' + v.id + '">✕ Reprovar</button>'
            : '<button class="btn primary sm" data-act="advance" data-id="' + v.id + '">→ Avançar etapa</button>') +
        "</div>" : "");
    }).join("") : emptyMsg("Nenhum veículo neste status.", "📋");

    return '<div class="status-scroll">' + chips + "</div>" + cards;
  }

  /* ---------------- TAB: CALENDÁRIO ---------------- */
  function calLevel(e) {
    var st = T.effectiveCalStatus(e);
    if (st === "Concluído") return "green"; if (st === "Cancelado" || st === "Reagendado") return "gray";
    if (st === "Atrasado") return "red"; if (e.scheduled_date === ymd(new Date())) return "warn"; return "blue";
  }
  function calFilteredEvents() {
    var f = M.calF, q = f.q.trim().toUpperCase(), today = ymd(new Date()), in7 = ymd(new Date(Date.now() + 7 * T.DAY));
    return T.calendarEvents().filter(function (e) {
      if (q && e.chassi.toUpperCase().indexOf(q) < 0 && (e.cliente || "").toUpperCase().indexOf(q) < 0) return false;
      if (f.resp && e.responsible_name !== f.resp) return false;
      if (f.quick === "atrasados" && T.effectiveCalStatus(e) !== "Atrasado") return false;
      if (f.quick === "hoje" && e.scheduled_date !== today) return false;
      if (f.quick === "prox7" && (e.scheduled_date < today || e.scheduled_date > in7)) return false;
      return true;
    });
  }
  function eventRow(e) {
    var lv = calLevel(e), st = T.effectiveCalStatus(e);
    var bcls = { green: "b-done", red: "b-late", warn: "b-warn", blue: "b-flow", gray: "b-gray" }[lv];
    return '<div class="vcard lv-' + (lv === "blue" ? "ok" : lv === "warn" ? "warn" : lv === "red" ? "late" : lv === "green" ? "ok" : "gray") + '" data-act="open-cal" data-id="' + e.id + '">' +
      '<div class="vc-top"><span class="vc-chassi" style="font-size:14px">' + esc(e.event_type) + '</span><span class="badge ' + bcls + '"><span class="dot"></span>' + st + "</span></div>" +
      '<div class="vc-cli">' + esc(e.chassi) + " · " + esc(e.cliente) + '</div>' +
      '<div class="vc-foot"><span class="resp">👤 ' + esc(e.responsible_name) + "</span><span class='muted' style='font-size:12px'>" + fmtYMD(e.scheduled_date) + " " + (e.scheduled_time || "") + "</span></div></div>";
  }

  function tabCalendario() {
    var views = ["dia", "semana", "mes", "lista"].map(function (v) {
      var lbl = { dia: "Dia", semana: "Semana", mes: "Mês", lista: "Lista" }[v];
      return '<button class="schip ' + (M.calView === v ? "active" : "") + '" data-act="cal-view" data-v="' + v + '">' + lbl + "</button>";
    }).join("");
    var filters =
      '<div class="searchbar" style="margin-bottom:8px"><span class="ic">🔍</span><input data-cf="q" placeholder="Buscar chassi/cliente" value="' + esc(M.calF.q) + '"></div>' +
      '<div style="display:flex;gap:8px;margin-bottom:10px">' +
        '<select class="btn ghost sm" style="flex:1" data-cf="resp"><option value="">👤 Responsável</option>' + teamOptions(M.calF.resp) + "</select>" +
        '<select class="btn ghost sm" style="flex:1" data-cf="quick"><option value="">Tudo</option>' +
          '<option value="hoje"' + (M.calF.quick === "hoje" ? " selected" : "") + '>Hoje</option>' +
          '<option value="prox7"' + (M.calF.quick === "prox7" ? " selected" : "") + '>Próx. 7 dias</option>' +
          '<option value="atrasados"' + (M.calF.quick === "atrasados" ? " selected" : "") + '>Atrasados</option></select>' +
      "</div>";

    var events = calFilteredEvents();
    var body = "";
    if (M.calView === "lista") {
      events.sort(function (a, b) { return a.scheduled_date.localeCompare(b.scheduled_date) || (a.scheduled_time || "").localeCompare(b.scheduled_time || ""); });
      body = events.length ? events.map(eventRow).join("") : emptyMsg("Sem programações.", "📅");
    } else if (M.calView === "dia") {
      var ds = ymd(M.calCursor);
      body = calNav(fmtYMD(ds)) + dayList(events, ds);
    } else if (M.calView === "semana") {
      body = calNav(weekLabel(M.calCursor)) + weekList(events);
    } else {
      body = calNav(monthLabel(M.calCursor)) + monthMini(events);
    }
    return '<div class="status-scroll">' + views + "</div>" + filters + body;
  }
  function calNav(label) {
    return '<div class="h-row"><button class="btn ghost sm" data-act="cal-prev">‹</button>' +
      '<h2 style="text-align:center;flex:1">' + esc(label) + "</h2>" +
      '<button class="btn ghost sm" data-act="cal-next">›</button></div>';
  }
  function dayList(events, ds) {
    var list = events.filter(function (e) { return e.scheduled_date === ds; })
      .sort(function (a, b) { return (a.scheduled_time || "").localeCompare(b.scheduled_time || ""); });
    return list.length ? list.map(eventRow).join("") : emptyMsg("Nada neste dia.", "📅");
  }
  function weekStart(d) { var s = new Date(d); s.setDate(d.getDate() - ((d.getDay() + 6) % 7)); s.setHours(0, 0, 0, 0); return s; }
  function weekLabel(d) { var s = weekStart(d), e = new Date(s); e.setDate(s.getDate() + 6); return pad(s.getDate()) + "/" + pad(s.getMonth() + 1) + " – " + pad(e.getDate()) + "/" + pad(e.getMonth() + 1); }
  function weekList(events) {
    var s = weekStart(M.calCursor), out = "", names = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"], today = ymd(new Date());
    for (var i = 0; i < 7; i++) {
      var day = new Date(s); day.setDate(s.getDate() + i); var ds = ymd(day);
      var list = events.filter(function (e) { return e.scheduled_date === ds; });
      if (!list.length) continue;
      out += '<div class="section-h">' + names[i] + " " + pad(day.getDate()) + "/" + pad(day.getMonth() + 1) + (ds === today ? " · hoje" : "") + "</div>" +
        list.sort(function (a, b) { return (a.scheduled_time || "").localeCompare(b.scheduled_time || ""); }).map(eventRow).join("");
    }
    return out || emptyMsg("Sem programações nesta semana.", "📅");
  }
  var MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  function monthLabel(d) { return MONTHS[d.getMonth()] + " " + d.getFullYear(); }
  function monthMini(events) {
    var byDay = {}; events.forEach(function (e) { (byDay[e.scheduled_date] = byDay[e.scheduled_date] || []).push(e); });
    var c = M.calCursor, first = new Date(c.getFullYear(), c.getMonth(), 1);
    var off = (first.getDay() + 6) % 7, start = new Date(first); start.setDate(1 - off);
    var today = ymd(new Date());
    var dow = ["S", "T", "Q", "Q", "S", "S", "D"].map(function (x) { return '<div style="text-align:center;font-size:10px;color:var(--muted);font-weight:700">' + x + "</div>"; }).join("");
    var cells = "";
    for (var i = 0; i < 42; i++) {
      var day = new Date(start); day.setDate(start.getDate() + i); var ds = ymd(day);
      var out = day.getMonth() !== c.getMonth(); var n = (byDay[ds] || []).length;
      var dotColor = n ? (byDay[ds].some(function (e) { return T.effectiveCalStatus(e) === "Atrasado"; }) ? "var(--danger)" : "var(--flow)") : "transparent";
      cells += '<button data-act="cal-day" data-date="' + ds + '" style="border:0;background:' + (ds === today ? "#eff6ff" : "var(--surface)") + ';border-radius:9px;padding:6px 0;cursor:pointer;color:' + (out ? "var(--line-2)" : "var(--ink)") + ';font-size:13px;font-weight:600;position:relative">' +
        day.getDate() + (n ? '<span style="position:absolute;bottom:3px;left:50%;transform:translateX(-50%);width:5px;height:5px;border-radius:50%;background:' + dotColor + '"></span>' : "") + "</button>";
    }
    return '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px">' + dow + cells + "</div>" +
      '<div class="muted" style="text-align:center;font-size:11px;margin-top:8px">Toque num dia para ver as programações</div>';
  }

  /* ---------------- TAB: BUSCAR ---------------- */
  function tabBuscar() {
    var q = M.searchQ.trim().toUpperCase();
    var results = q ? T.state().vehicles.filter(function (v) {
      return [v.chassi, v.cliente, v.pedido, v.numero_nf, v.modelo, v.consultor, v.responsavel]
        .some(function (f) { return (f || "").toUpperCase().indexOf(q) >= 0; });
    }) : [];
    return '<div class="searchbar"><span class="ic">🔍</span><input data-act="search-input" placeholder="Chassi, NF, cliente, pedido, modelo…" value="' + esc(M.searchQ) + '" autofocus></div>' +
      '<button class="btn ghost" style="margin:10px 0" data-act="scanner">📷 Ler QR Code / código de barras</button>' +
      (q ? ('<div class="section-h">' + results.length + " resultado(s)</div>" + (results.length ? results.map(vehicleCard).join("") : emptyMsg("Nada encontrado para “" + esc(M.searchQ) + "”.", "🔍")))
        : emptyMsg("Digite um chassi, NF, cliente ou pedido — ou use o scanner.", "🔍"));
  }

  /* ---------------- TAB: ALERTAS ---------------- */
  function computeAlerts() {
    var out = [], vs = T.state().vehicles, today = ymd(new Date());
    vs.forEach(function (v) {
      if (T.isFinished(v)) return;
      if (T.isLate(v)) out.push({ kind: "red", ic: "⏰", type: "SLA vencido", sub: v.chassi + " · " + T.stageByCode(v.stage_code).name + " · " + Math.floor(T.daysInStage(v)) + "d", act: "Priorizar / reatribuir", id: v.id });
      if (!v.responsavel) out.push({ kind: "red", ic: "👤", type: "Sem responsável", sub: v.chassi + " · " + v.cliente, act: "Definir responsável", id: v.id });
      if (v.stage_code === "08") out.push({ kind: "red", ic: "↩", type: "Reprovado na qualidade", sub: v.chassi + " · retorno p/ preparação", act: "Tratar retrabalho", id: v.id });
      if (v.stage_code === "11") out.push({ kind: "blue", ic: "📦", type: "Entrega agendada", sub: v.chassi + " · " + v.cliente, act: "Confirmar entrega", id: v.id });
      var etapaCk = T.checklistEtapaFor(v.stage_code);
      if (etapaCk) { var ck = T.checklistFor(v.id, etapaCk); if (ck.some(function (i) { return !i.done; }) && ck.some(function (i) { return i.done; })) out.push({ kind: "warn", ic: "✓", type: "Checklist incompleto", sub: v.chassi + " · " + etapaCk, act: "Concluir checklist", id: v.id }); }
    });
    T.calendarEvents().forEach(function (e) {
      if (e.event_type === "Entrega Técnica" && e.scheduled_date === today && T.effectiveCalStatus(e) !== "Concluído")
        out.push({ kind: "warn", ic: "🚚", type: "Entrega para hoje", sub: e.chassi + " · " + e.cliente, act: "Realizar entrega", id: e.vehicle_id });
      if (e.rescheduled_from && e.scheduled_date >= today)
        out.push({ kind: "blue", ic: "↻", type: "Reagendamento", sub: e.event_type + " " + e.chassi + " → " + fmtYMD(e.scheduled_date), act: "Conferir nova data", id: e.vehicle_id });
    });
    return out;
  }
  function tabAlertas() {
    var alerts = computeAlerts();
    if (!alerts.length) return emptyMsg("Tudo em ordem. Nenhum alerta agora. 🎉", "🔔");
    return alerts.map(function (a) {
      return '<div class="alert ' + a.kind + '" data-act="open-veh" data-id="' + a.id + '">' +
        '<div class="al-ic">' + a.ic + '</div><div class="al-body">' +
        '<div class="al-type">' + esc(a.type) + '</div><div class="al-sub">' + esc(a.sub) + '</div>' +
        '<div class="al-act">→ ' + esc(a.act) + '</div></div></div>';
    }).join("");
  }

  /* ---------------- PÁGINA DO VEÍCULO ---------------- */
  function vehicleScreen() {
    var v = T.getVehicle(M.vehicleId);
    if (!v) { M.vehicleId = null; return appShell(); }
    var tabs = [["resumo", "Resumo"], ["checklist", "Checklist"], ["fotos", "Fotos"], ["timeline", "Timeline"], ["comentarios", "Comentários"], ["agenda", "Agenda"], ["notif", "Notificações"]]
      .map(function (t) { return '<button class="' + (M.vehicleTab === t[0] ? "active" : "") + '" data-act="veh-tab" data-vt="' + t[0] + '">' + t[1] + "</button>"; }).join("");

    var content = "";
    switch (M.vehicleTab) {
      case "resumo": content = vtResumo(v); break;
      case "checklist": content = vtChecklist(v); break;
      case "fotos": content = vtFotos(v); break;
      case "timeline": content = vtTimeline(v); break;
      case "comentarios": content = vtComentarios(v); break;
      case "agenda": content = vtAgenda(v); break;
      case "notif": content = vtNotif(v); break;
    }
    var noNf = v.stage_code === "01" && !v.numero_nf;
    return statusbarHTML() +
      '<div class="appbar back"><button class="ab-btn ab-back" data-act="back">‹</button>' +
        '<div style="flex:1"><div class="ab-title" style="font-size:15px">Veículo</div></div>' +
        '<button class="ab-btn" data-act="open-cal-veh" title="Agenda" data-id="' + v.id + '">📅</button></div>' +
      '<div class="veh-head"><div class="vh-chassi">' + esc(v.chassi) + (noNf ? " 🔒" : "") + '</div>' +
        '<div class="vh-cli">' + esc(v.cliente) + " · " + esc(v.modelo) + '</div>' +
        '<div class="vh-badges">' + statusBadge(v.stage_code) + slaBadge(v) +
          (v.responsavel ? '<span class="badge"><span class="dot"></span>👤 ' + esc(v.responsavel) + "</span>" : '<span class="badge b-late"><span class="dot"></span>Sem responsável</span>') +
        "</div></div>" +
      '<div class="veh-tabs">' + tabs + "</div>" +
      '<div class="content">' + content + "</div>" +
      '<div id="sheet-root"></div><div id="toast-root"></div>';
  }

  function vtResumo(v) {
    var next = v.stage_code === "08" ? "06" : T.nextCode(v.stage_code);
    var ro = readOnly();
    var actions = T.isFinished(v) ? '<div class="muted" style="text-align:center;padding:8px">Processo ' + esc(T.stageByCode(v.stage_code).name) + ".</div>" :
      '<div class="btn-grid">' +
        (v.stage_code === "07"
          ? '<button class="btn ok" data-act="approve" data-id="' + v.id + '">✓ Aprovar</button><button class="btn danger" data-act="reject" data-id="' + v.id + '">✕ Reprovar</button>'
          : '<button class="btn primary" data-act="advance" data-id="' + v.id + '">→ Avançar etapa</button><button class="btn ghost" data-act="set-resp" data-id="' + v.id + '">👤 Responsável</button>') +
        '<button class="btn ghost" data-act="add-comment" data-id="' + v.id + '">💬 Comentar</button>' +
        '<button class="btn ghost" data-act="add-photo" data-id="' + v.id + '">📷 Foto</button>' +
      "</div>";
    return '<div class="card"><div class="kv2">' +
        kv("Status atual", T.stageByCode(v.stage_code).code + " " + T.stageByCode(v.stage_code).name) +
        kv("Próxima etapa", next ? T.stageByCode(next).name : "—") +
        kv("Responsável", v.responsavel || "—") + kv("Pátio atual", v.patio || "—") +
        kv("Pedido", v.pedido) + kv("NF", v.numero_nf || "—") +
        kv("Faturamento", fmtDate(v.data_faturamento)) + kv("Prev. entrega", fmtDate(v.data_prevista_entrega)) +
        kv("Cor", v.cor) + kv("Consultor", v.consultor) + kv("Cidade", v.cidade) + kv("Na etapa há", Math.floor(T.daysInStage(v)) + "d") +
      "</div></div>" +
      (ro ? '<div class="card muted" style="text-align:center">👁 Perfil Visualizador — somente leitura.</div>' : '<div class="section-h">Ações rápidas</div>' + actions) +
      (v.observacao ? '<div class="card"><div class="k" style="font-size:10.5px;color:var(--muted);font-weight:700">OBSERVAÇÕES</div>' + esc(v.observacao) + "</div>" : "");
  }
  function kv(k, v2) { return '<div><div class="k">' + esc(k) + '</div><div class="v">' + (v2 ? esc(v2) : "—") + "</div></div>"; }

  function vtChecklist(v) {
    var etapa = T.checklistEtapaFor(v.stage_code);
    if (!etapa) return emptyMsg("Sem checklist para a etapa atual (" + T.stageByCode(v.stage_code).name + ").", "✓");
    var items = T.checklistFor(v.id, etapa);
    var done = items.filter(function (i) { return i.done; }).length;
    var pct = Math.round(done / items.length * 100);
    var ro = readOnly();
    return '<div class="section-h">Checklist · ' + esc(etapa) + " (" + done + "/" + items.length + ")</div>" +
      '<div class="progress"><span style="width:' + pct + '%"></span></div>' +
      '<div class="card" style="padding:4px 14px">' + items.map(function (i) {
        return '<div class="chk-item ' + (i.done ? "done" : "") + '"' + (ro ? "" : ' data-act="chk-toggle" data-id="' + v.id + '" data-etapa="' + esc(etapa) + '" data-item="' + esc(i.item) + '"') + '>' +
          '<div class="chk-box">' + (i.done ? "✓" : "") + '</div><div class="chk-label">' + esc(i.item) + "</div></div>";
      }).join("") + "</div>" +
      (ro ? "" : '<div class="muted" style="font-size:12px;text-align:center">Toque para marcar. Ao concluir tudo, gera evento <b>checklist_completed</b>.</div>');
  }

  function vtFotos(v) {
    var atts = T.attachmentsFor(v.id);
    var ro = readOnly();
    var add = ro ? "" : '<div class="photo add" data-act="add-photo" data-id="' + v.id + '">＋</div>';
    var grid = atts.map(function (a) {
      var img = a.file_url ? '<img src="' + a.file_url + '" alt="">' : '<div style="display:grid;place-items:center;height:100%;font-size:26px">🖼️</div>';
      return '<div class="photo">' + img + '<span class="cat">' + esc(a.category) + "</span></div>";
    }).join("");
    return '<div class="section-h">Fotos do veículo (' + atts.length + ")</div>" +
      '<div class="photo-grid">' + add + grid + "</div>" +
      (atts.length ? "" : (ro ? emptyMsg("Sem fotos.", "📷") : '<div class="muted" style="font-size:12px;text-align:center;margin-top:10px">Toque em ＋ para abrir a câmera ou escolher da galeria.</div>'));
  }

  function vtTimeline(v) {
    var items = [];
    T.movementsFor(v.id).forEach(function (m) {
      var txt = m.stage_anterior && m.stage_anterior !== m.stage_novo
        ? (esc(m.responsavel || "Sistema") + " alterou de " + esc(T.stageByCode(m.stage_anterior).name) + " para " + esc(T.stageByCode(m.stage_novo).name))
        : (m.stage_anterior === m.stage_novo ? esc(m.comentario || "Atualização") : "Cadastro do veículo (" + esc(T.stageByCode(m.stage_novo).name) + ")");
      items.push({ at: m.created_at, cls: m.stage_novo === "08" ? "red" : (["12", "13"].indexOf(m.stage_novo) >= 0 ? "green" : ""), what: txt, note: m.stage_anterior !== m.stage_novo ? m.comentario : "" });
    });
    T.attachmentsFor(v.id).forEach(function (a) { items.push({ at: a.created_at, cls: "", what: esc(a.uploaded_by) + " anexou foto (" + esc(a.category) + ")", note: a.observation }); });
    T.commentsFor(v.id).forEach(function (c) { items.push({ at: c.created_at, cls: "", what: esc(c.user) + " comentou", note: c.comentario }); });
    items.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    return items.length ? '<div class="tl">' + items.map(function (i) {
      return '<div class="tl-i ' + i.cls + '"><div class="tl-when">' + fmtDateTime(i.at) + '</div><div class="tl-what">' + i.what + "</div>" +
        (i.note ? '<div class="tl-note">' + esc(i.note) + "</div>" : "") + "</div>";
    }).join("") + "</div>" : emptyMsg("Sem histórico.", "🕓");
  }

  function vtComentarios(v) {
    var cs = T.commentsFor(v.id), ro = readOnly();
    return (ro ? "" : '<button class="btn primary" style="margin-bottom:12px" data-act="add-comment" data-id="' + v.id + '">💬 Novo comentário</button>') +
      (cs.length ? cs.map(function (c) {
        return '<div class="cmt"><div class="cm-top"><span class="cm-user">' + esc(c.user) + '</span><span class="muted">' + fmtDateTime(c.created_at) + "</span></div>" +
          '<div class="cm-text">' + esc(c.comentario) + "</div>" +
          '<div style="margin-top:5px"><span class="cm-tag">' + esc(c.etapa) + "</span>" + (c.mention ? ' · <span class="cm-tag">@' + esc(c.mention) + "</span>" : "") + "</div></div>";
      }).join("") : emptyMsg("Nenhum comentário.", "💬"));
  }

  function vtAgenda(v) {
    var evs = T.calEventsFor(v.id).sort(function (a, b) { return a.scheduled_date.localeCompare(b.scheduled_date); });
    return evs.length ? evs.map(eventRow).join("") : emptyMsg("Sem programação. A agenda nasce quando o veículo é faturado.", "📅");
  }

  function vtNotif(v) {
    var ns = T.notifications().filter(function (n) { return n.vehicle_id === v.id; }).reverse();
    var ws = T.webhookEvents().filter(function (w) { return w.vehicle_id === v.id; }).reverse();
    var out = '<div class="section-h">Notificações / e-mail (' + ns.length + ")</div>";
    out += ns.length ? ns.slice(0, 20).map(function (n) {
      return '<div class="cmt"><div class="cm-top"><span class="cm-user">' + esc(n.title || n.subject || n.event) + '</span><span class="muted">' + fmtDateTime(n.created_at) + "</span></div>" +
        '<div class="cm-text">' + esc(n.message || n.body || "") + "</div><div class='cm-tag' style='margin-top:4px'>" + esc(n.status) + "</div></div>";
    }).join("") : emptyMsg("Sem notificações.", "🔔");
    out += '<div class="section-h">Eventos n8n (' + ws.length + ")</div>";
    out += ws.length ? ws.slice(0, 20).map(function (w) {
      return '<div class="cmt"><div class="cm-top"><span class="cm-user" style="font-family:monospace;font-size:11.5px">' + esc(w.event) + '</span><span class="muted">' + fmtDateTime(w.created_at) + "</span></div><div class='cm-tag' style='margin-top:4px'>" + esc(w.status) + " · " + esc(w.payload.source || "web") + "</div></div>";
    }).join("") : emptyMsg("Sem eventos.", "🔌");
    return out;
  }

  /* ---------------- SHEETS ---------------- */
  function openSheet(html, centered) {
    var root = $("#sheet-root");
    if (!root) return;
    root.innerHTML = '<div class="sheet-back" data-act="sheet-back"><div class="sheet ' + (centered ? "center" : "") + '" data-stop="1"><div class="grab"></div>' + html + "</div></div>";
  }
  function closeSheet() { var r = $("#sheet-root"); if (r) r.innerHTML = ""; pendingSheet = null; }
  var pendingSheet = null;

  function sheetAdvance(id, target, opts) {
    opts = opts || {};
    var v = T.getVehicle(id);
    if (v.stage_code === "01" && (!v.numero_nf || !v.data_faturamento)) {
      toast("Veículo bloqueado. A operação só é liberada após faturamento.", "danger"); return;
    }
    pendingSheet = { kind: "advance", id: id, target: target, requireComment: !!opts.requireComment };
    var st = T.stageByCode(target);
    openSheet('<h3>' + esc(opts.title || "Avançar etapa") + "</h3>" +
      '<div class="muted" style="margin-bottom:12px">' + esc(v.chassi) + " → " + st.code + " " + esc(st.name) + "</div>" +
      '<div class="field"><label>Responsável *</label><select id="sh-resp"><option value="">— selecione —</option>' + teamOptions(v.responsavel) + "</select></div>" +
      '<div class="field"><label>' + (opts.requireComment ? "Motivo *" : "Comentário") + '</label><textarea id="sh-comment" placeholder="' + esc(opts.ph || "Opcional") + '"></textarea></div>' +
      '<div class="sheet-err" id="sh-err"></div>' +
      '<button class="btn ' + (opts.cls || "primary") + '" data-act="advance-confirm">' + esc(opts.confirm || "Confirmar") + "</button>");
  }
  function advanceConfirm() {
    if (!pendingSheet) return;
    var resp = ($("#sh-resp") || {}).value || "";
    var comment = ($("#sh-comment") || {}).value || "";
    var err = $("#sh-err");
    if (!resp) { if (err) err.textContent = "Selecione o responsável."; return; }
    if (pendingSheet.requireComment && !comment.trim()) { if (err) err.textContent = "O motivo é obrigatório."; return; }
    var r = T.mobileAdvance(pendingSheet.id, pendingSheet.target, resp, comment.trim(), M.user);
    if (!r.ok) { if (err) err.textContent = r.motivo; return; }
    var st = T.stageByCode(pendingSheet.target);
    closeSheet(); toast("→ " + st.code + " " + st.name, "ok"); render();
  }

  function sheetResp(id) {
    var v = T.getVehicle(id);
    pendingSheet = { kind: "resp", id: id };
    openSheet('<h3>Alterar responsável</h3>' +
      '<div class="field"><label>Responsável atual: ' + esc(v.responsavel || "—") + '</label>' +
      '<select id="sh-resp"><option value="">— selecione —</option>' + teamOptions(v.responsavel) + "</select></div>" +
      '<div class="sheet-err" id="sh-err"></div>' +
      '<button class="btn primary" data-act="resp-confirm">Salvar</button>');
  }
  function respConfirm() {
    var resp = ($("#sh-resp") || {}).value;
    if (!resp) { var e = $("#sh-err"); if (e) e.textContent = "Selecione o responsável."; return; }
    T.mobileSetResponsible(pendingSheet.id, resp, M.user);
    closeSheet(); toast("Responsável atualizado.", "ok"); render();
  }

  function sheetComment(id) {
    var v = T.getVehicle(id);
    pendingSheet = { kind: "comment", id: id };
    openSheet('<h3>Comentar · ' + esc(v.chassi) + "</h3>" +
      '<div class="field"><label>Comentário *</label><textarea id="sh-text" placeholder="Escreva uma observação interna…"></textarea></div>' +
      '<div class="field"><label>Mencionar responsável (opcional)</label><select id="sh-mention"><option value="">—</option>' + teamOptions("") + "</select></div>" +
      '<div class="sheet-err" id="sh-err"></div>' +
      '<button class="btn primary" data-act="comment-confirm">Publicar</button>');
  }
  function commentConfirm() {
    var text = ($("#sh-text") || {}).value || "";
    if (!text.trim()) { var e = $("#sh-err"); if (e) e.textContent = "Escreva o comentário."; return; }
    T.addComment(pendingSheet.id, { texto: text.trim(), mention: ($("#sh-mention") || {}).value || "" }, M.user);
    closeSheet(); toast("Comentário publicado.", "ok"); render();
  }

  function sheetPhoto(id) {
    pendingSheet = { kind: "photo", id: id, thumb: "" };
    var cats = ["Recebimento", "Preparação", "Qualidade", "Avaria", "Pátio", "Entrega", "Documento", "Outros"];
    openSheet('<h3>Anexar foto</h3>' +
      '<input type="file" accept="image/*" capture="environment" id="sh-file" style="display:none">' +
      '<div id="sh-prev" class="scanner" style="height:160px;background:var(--bg)"><span class="muted">Nenhuma imagem</span></div>' +
      '<div class="btn-grid" style="margin-bottom:12px"><button class="btn ghost" data-act="photo-pick">📷 Câmera / galeria</button>' +
      '<button class="btn ghost" data-act="photo-sim">🖼️ Simular foto</button></div>' +
      '<div class="field"><label>Categoria</label><select id="sh-cat">' + cats.map(function (c) { return "<option>" + c + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label>Observação</label><input id="sh-obs" placeholder="Opcional"></div>' +
      '<div class="sheet-err" id="sh-err"></div>' +
      '<button class="btn primary" data-act="photo-confirm">Anexar</button>');
    setTimeout(function () {
      var f = $("#sh-file");
      if (f) f.addEventListener("change", function () {
        var file = f.files[0]; if (!file) return;
        var reader = new FileReader();
        reader.onload = function (ev) { downscale(ev.target.result, function (thumb) { pendingSheet.thumb = thumb; var p = $("#sh-prev"); if (p) p.innerHTML = '<img src="' + thumb + '" style="width:100%;height:100%;object-fit:cover;border-radius:14px">'; }); };
        reader.readAsDataURL(file);
      });
    }, 30);
  }
  function downscale(dataUrl, cb) {
    var img = new Image();
    img.onload = function () {
      var max = 256, w = img.width, h = img.height, scale = Math.min(1, max / Math.max(w, h));
      var cv = document.createElement("canvas"); cv.width = w * scale; cv.height = h * scale;
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      try { cb(cv.toDataURL("image/jpeg", 0.7)); } catch (e) { cb(dataUrl); }
    };
    img.onerror = function () { cb(dataUrl); };
    img.src = dataUrl;
  }
  function photoSim() {
    // gera um "thumbnail" SVG colorido representando a foto (sem câmera)
    var cat = ($("#sh-cat") || {}).value || "Foto";
    var colors = ["#1e3a8a", "#2563eb", "#0ea5e9", "#16a34a", "#f59e0b", "#dc2626"];
    var c = colors[Math.floor(Math.random() * colors.length)];
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="' + c + '"/><text x="128" y="135" font-size="22" fill="#fff" text-anchor="middle" font-family="Arial">📷 ' + esc(cat) + "</text></svg>";
    pendingSheet.thumb = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
    var p = $("#sh-prev"); if (p) p.innerHTML = '<img src="' + pendingSheet.thumb + '" style="width:100%;height:100%;object-fit:cover;border-radius:14px">';
  }
  function photoConfirm() {
    if (!pendingSheet.thumb) { var e = $("#sh-err"); if (e) e.textContent = "Capture ou simule uma foto."; return; }
    T.addAttachment(pendingSheet.id, { thumb: pendingSheet.thumb, category: ($("#sh-cat") || {}).value, observation: ($("#sh-obs") || {}).value }, M.user);
    closeSheet(); toast("Foto anexada ao chassi.", "ok"); render();
  }

  function sheetCalEvent(id) {
    var e = T.getCalEvent(id);
    if (!e) return;
    var st = T.effectiveCalStatus(e), ro = readOnly();
    var canDo = st !== "Concluído" && st !== "Cancelado" && !ro;
    openSheet('<h3>' + esc(e.event_type) + "</h3>" +
      '<div class="card" style="box-shadow:none"><div class="kv2">' +
        kv("Chassi", e.chassi) + kv("Cliente", e.cliente) + kv("Modelo", e.modelo) + kv("Responsável", e.responsible_name) +
        kv("Data", fmtYMD(e.scheduled_date)) + kv("Hora", e.scheduled_time || "—") + kv("Status", st) + kv("Local", e.yard_name || "—") +
      "</div></div>" +
      '<button class="btn" style="margin-bottom:9px" data-act="open-veh" data-id="' + e.vehicle_id + '">🚚 Abrir veículo</button>' +
      (canDo ? '<div class="btn-grid"><button class="btn ok" data-act="cal-complete" data-id="' + id + '">✓ Concluir</button>' +
        '<button class="btn primary" data-act="cal-reschedule" data-id="' + id + '">📅 Reagendar</button></div>' +
        '<button class="btn ghost" style="margin-top:9px" data-act="cal-notify" data-id="' + id + '">📨 Notificar responsável</button>' : ""), false);
  }
  function sheetReschedule(id) {
    var e = T.getCalEvent(id);
    pendingSheet = { kind: "resched", id: id };
    openSheet('<h3>Reagendar</h3><div class="muted" style="margin-bottom:12px">' + esc(e.event_type) + " · " + esc(e.chassi) + " · atual " + fmtYMD(e.scheduled_date) + "</div>" +
      '<div class="field"><label>Nova data *</label><input type="date" id="rs-date" value="' + e.scheduled_date + '"></div>' +
      '<div class="field"><label>Novo horário</label><input type="time" id="rs-time" value="' + (e.scheduled_time || "") + '"></div>' +
      '<div class="field"><label>Motivo *</label><textarea id="rs-motivo" placeholder="Ex.: veículo ainda em movimentação"></textarea></div>' +
      '<div class="check-row"><input type="checkbox" id="rs-nr" checked> Notificar responsável</div>' +
      '<div class="check-row"><input type="checkbox" id="rs-nc"> Notificar cliente</div>' +
      '<div class="sheet-err" id="rs-err"></div>' +
      '<button class="btn primary" data-act="resched-confirm">Reagendar</button>', true);
  }
  function reschedConfirm() {
    var date = ($("#rs-date") || {}).value, motivo = ($("#rs-motivo") || {}).value || "";
    var err = $("#rs-err");
    if (!date) { if (err) err.textContent = "Informe a nova data."; return; }
    if (!motivo.trim()) { if (err) err.textContent = "O motivo é obrigatório."; return; }
    T.rescheduleEvent(pendingSheet.id, { nova_data: date, novo_horario: ($("#rs-time") || {}).value, motivo: motivo.trim(),
      responsavel_alteracao: M.user.nome, notif_resp: ($("#rs-nr") || {}).checked, notif_cliente: ($("#rs-nc") || {}).checked });
    closeSheet(); toast("Reagendado para " + fmtYMD(date) + ".", "ok"); render();
  }

  function sheetScanner() {
    var chassis = T.state().vehicles.slice(0, 8).map(function (v) { return '<div class="opt" data-act="scan-pick" data-id="' + v.id + '">' + esc(v.chassi) + " · " + esc(v.cliente) + "</div>"; }).join("");
    openSheet('<h3>Ler QR Code / etiqueta</h3>' +
      '<div class="scanner"><div class="frame"></div><div class="laser"></div></div>' +
      '<div class="muted" style="font-size:12.5px;margin-bottom:10px">Simulação — toque num chassi para “escanear”:</div>' +
      '<div class="opt-list">' + chassis + "</div>", true);
  }

  function sheetPerfil() {
    openSheet('<h3>Perfil</h3>' +
      '<div class="user-pick" style="background:var(--bg);border-color:var(--line);color:var(--ink);margin-bottom:14px"><div class="av">' + initials(M.user.nome) + "</div>" +
        '<div><div class="u-name">' + esc(M.user.nome) + '</div><div class="u-role muted">' + esc(M.user.perfil) + "</div></div></div>" +
      '<div class="check-row"><input type="checkbox" id="pf-offline" ' + (M.online ? "" : "checked") + ' data-act="toggle-offline"> Modo offline (simular sinal ruim)</div>' +
      '<div class="section-h">Integração</div>' +
      '<div class="muted" style="font-size:12.5px;margin-bottom:10px">Eventos n8n: <b>' + T.webhookEvents().length + '</b> · Logs de notificação/e-mail: <b>' + T.notifications().length + "</b></div>" +
      '<button class="btn ghost" style="margin-bottom:9px" data-act="reset-demo">↺ Restaurar dados de demonstração</button>' +
      '<button class="btn danger" data-act="logout">Sair / trocar usuário</button>', true);
  }

  /* ---------------- toast ---------------- */
  function toast(msg, kind) {
    var root = $("#toast-root"); if (!root) return;
    root.innerHTML = '<div class="toast ' + (kind || "") + '">' + esc(msg) + "</div>";
    clearTimeout(toast._t); toast._t = setTimeout(function () { root.innerHTML = ""; }, 2600);
  }

  /* ---------------- eventos ---------------- */
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-act]");
    if (!t) return;
    var act = t.getAttribute("data-act"), id = t.getAttribute("data-id");
    switch (act) {
      case "login":
        var u = T.MOBILE_USERS.filter(function (x) { return x.id === t.getAttribute("data-id"); })[0];
        M.user = u; T.setActor(u); try { localStorage.setItem(USER_KEY, JSON.stringify(u)); } catch (e) {}
        M.tab = "hoje"; render(); break;
      case "logout": M.user = null; M.vehicleId = null; try { localStorage.removeItem(USER_KEY); } catch (e) {} render(); break;
      case "tab": M.tab = t.getAttribute("data-tab"); M.vehicleId = null; render(); break;
      case "perfil": sheetPerfil(); break;
      case "toggle-offline": M.online = !t.checked; closeSheet(); render(); break;
      case "reset-demo": if (confirm("Restaurar dados de demonstração?")) { T.resetData(); closeSheet(); render(); toast("Dados restaurados.", "ok"); } break;

      case "hoje-filter": M.hojeFilter = t.getAttribute("data-f"); render(); break;
      case "kan-status": M.kanStatus = t.getAttribute("data-code"); render(); break;

      case "open-veh": M.vehicleId = id; M.vehicleTab = "resumo"; closeSheet(); render(); window.scrollTo(0, 0); break;
      case "back": M.vehicleId = null; render(); break;
      case "veh-tab": M.vehicleTab = t.getAttribute("data-vt"); render(); break;
      case "open-cal-veh": M.vehicleTab = "agenda"; render(); break;

      case "advance":
        var v = T.getVehicle(id);
        var tgt = v.stage_code === "08" ? "06" : T.nextCode(v.stage_code);
        sheetAdvance(id, tgt, { title: v.stage_code === "08" ? "Retornar p/ preparação" : "Avançar etapa", confirm: "Avançar" });
        break;
      case "approve": sheetAdvance(id, "09", { title: "Aprovar na qualidade", confirm: "Aprovar", cls: "ok", ph: "Observações da inspeção" }); break;
      case "reject": sheetAdvance(id, "08", { title: "Reprovar na qualidade", confirm: "Reprovar", cls: "danger", requireComment: true, ph: "Motivo da reprovação (obrigatório)" }); break;
      case "advance-confirm": advanceConfirm(); break;

      case "set-resp": sheetResp(id); break;
      case "resp-confirm": respConfirm(); break;
      case "add-comment": sheetComment(id); break;
      case "comment-confirm": commentConfirm(); break;
      case "add-photo": sheetPhoto(id); break;
      case "photo-pick": var f = $("#sh-file"); if (f) f.click(); break;
      case "photo-sim": photoSim(); break;
      case "photo-confirm": photoConfirm(); break;
      case "chk-toggle":
        T.toggleChecklist(id, t.getAttribute("data-etapa"), t.getAttribute("data-item"), M.user); render(); break;

      case "open-cal": sheetCalEvent(id); break;
      case "cal-complete": T.completeCalEvent(id, M.user.nome); closeSheet(); render(); toast("Programação concluída.", "ok"); break;
      case "cal-reschedule": sheetReschedule(id); break;
      case "resched-confirm": reschedConfirm(); break;
      case "cal-notify": T.notifyResponsible(id, M.user.nome); closeSheet(); toast("Responsável notificado (log gerado).", "ok"); break;
      case "cal-view": M.calView = t.getAttribute("data-v"); render(); break;
      case "cal-prev": shiftCal(-1); render(); break;
      case "cal-next": shiftCal(1); render(); break;
      case "cal-day": M.calCursor = parseYMD(t.getAttribute("data-date")); M.calView = "dia"; render(); break;

      case "scanner": sheetScanner(); break;
      case "scan-pick": M.vehicleId = t.getAttribute("data-id"); M.vehicleTab = "resumo"; closeSheet(); render(); break;

      case "sheet-back": if (ev.target.closest("[data-stop]")) return; closeSheet(); break;
    }
  });

  // inputs (busca e filtros do calendário) com re-render mantendo foco
  var deb;
  document.addEventListener("input", function (ev) {
    var s = ev.target.closest("[data-act='search-input']");
    var cf = ev.target.closest("[data-cf]");
    if (s) { M.searchQ = s.value; clearTimeout(deb); deb = setTimeout(function () { render(); var b = $("[data-act='search-input']"); if (b) { b.focus(); var l = b.value.length; b.setSelectionRange(l, l); } }, 220); }
    else if (cf) {
      var k = cf.getAttribute("data-cf"); M.calF[k] = cf.value;
      if (k === "q") { clearTimeout(deb); deb = setTimeout(function () { render(); var b = $("[data-cf='q']"); if (b) { b.focus(); var l = b.value.length; b.setSelectionRange(l, l); } }, 220); }
      else render();
    }
  });

  function shiftCal(dir) {
    var c = new Date(M.calCursor);
    if (M.calView === "semana") c.setDate(c.getDate() + dir * 7);
    else if (M.calView === "dia") c.setDate(c.getDate() + dir);
    else c.setMonth(c.getMonth() + dir);
    M.calCursor = c;
  }

  render();
})();
