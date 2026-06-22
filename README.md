# Torre de Controle · Entrega Técnica Belcar

Sistema simples para o departamento de **Entrega Técnica** acompanhar cada veículo
**por chassi**, com status padronizado, responsável obrigatório e SLA por etapa —
substituindo o acompanhamento informal por WhatsApp.

> Funciona **abrindo um arquivo no navegador**. Não precisa instalar nada, não precisa
> de internet, não precisa de login.

> ⚠️ **Versão piloto / demonstração.** Os dados ficam **no navegador de cada aparelho**
> (localStorage) — **não há servidor e não é multiusuário real**: o que você cadastra no
> seu computador/celular **não** aparece para os outros. Serve para validar o processo
> com a equipe. Para uso compartilhado em tempo real, veja **“Próximo passo: versão em nuvem”**.

---

## ▶ Como usar (operação)

1. Abra a pasta `torre belcar`.
2. **Dê dois cliques em `index.html`.** O sistema abre no seu navegador (Chrome, Edge, Firefox).
3. Pronto. Já vem com **20 veículos de demonstração** para você explorar.

> Para deixar fácil, clique com o botão direito em `index.html` → **Fixar na barra de tarefas**
> ou crie um atalho na área de trabalho.

### 📱 Versão celular (simulação)
Abra **`app-celular.html`** (ou clique em **“📱 App celular”** no topo da versão web). Ele simula o app de smartphone dentro de uma moldura de celular no computador, e ocupa a tela toda quando aberto no próprio celular. **Compartilha a mesma base de dados** da versão web (o que muda em um aparece no outro).

O app mobile tem: **login** por usuário (demonstração), menu inferior com **Hoje · Fluxo (Kanban) · Calendário · Buscar · Alertas**, **busca/scanner por chassi**, e a **página do veículo** com abas **Resumo, Checklist, Fotos, Timeline, Comentários, Agenda e Notificações**. Permite mudar status (com gate de faturamento e responsável obrigatório), preencher checklist com um toque, anexar fotos (câmera ou simulada), comentar e reagendar — tudo gerando histórico e eventos `mobile.*` para n8n + logs de notificação.

### Onde ficam os dados
Os dados são salvos **no próprio navegador** (localStorage) da máquina que abriu o arquivo.
É ideal para **piloto / uso individual ou em um computador da operação**.
Para uso compartilhado em rede (vários usuários vendo o mesmo dado em tempo real),
veja a seção **“Próximo passo: versão em nuvem”**.

O botão **“↺ Restaurar dados de demonstração”** (no Dashboard) recarrega os 20 veículos de exemplo.

---

## 🧭 O que o sistema faz

| Tela | Para quê |
|------|----------|
| **Dashboard** | Responde em 3 segundos: *quantos atrasados, qual o gargalo, lead time médio*. KPIs + gráficos + lista auditável de atrasados. |
| **Kanban** | Quadro visual com **as 13 etapas** em colunas. Cada cartão = um chassi, com responsável, dias na etapa e semáforo de SLA. |
| **Calendário** | Agenda operacional do mês (visões **mensal, semanal e lista**). A programação de cada veículo é **gerada automaticamente quando ele é faturado**, com base na data de faturamento e nos SLAs. |
| **Torre de Controle** | Tabela rastreável por chassi, com busca e filtros (status, responsável, pátio, consultor, prioridade, atrasados). |
| **Cadastrar veículo** | Entrada de um novo chassi (começa em *01 Aguardando Faturamento*). |
| **Pátios** | Ocupação x capacidade de cada pátio. |
| **Histórico** | Registro automático de toda mudança de status (data, hora, responsável, motivo). |

### As 13 etapas (status padronizado)
`01 Aguardando Faturamento → 02 Faturado → 03 Planejamento de Rota → 04 Pátio Definido →
05 Em Movimentação → 06 Em Preparação → 07 Em Qualidade → 09 Liberado → 10 Em Pátio de Entrega →
11 Agendado Cliente → 12 Entregue → 13 Encerrado`
Na **Qualidade (07)** o veículo pode ser **Reprovado (08)**, voltando para *Em Preparação (06)* com **motivo obrigatório**.

---

## 🔒 Regras que o sistema garante

- **Gate 01 · Faturamento:** o veículo **não sai de “Aguardando Faturamento”** sem **número da NF + data de faturamento**.
- **Responsável obrigatório:** **nenhuma etapa avança** sem um responsável selecionado (a dor nº 1 da operação).
- **Histórico automático:** toda mudança de status grava uma linha no Histórico — sem exceção.
- **SLA com semáforo:** cada etapa tem prazo. O cartão fica 🟢 no prazo, 🟡 atenção (≤ 1 dia), 🔴 vencido, ⚪ sem SLA.
- **Reprovação rastreada:** reprovar na qualidade exige motivo e conta para o indicador de retrabalho.

### Calendário · regras
- **Programação nasce no faturamento:** antes de *Faturado*, o veículo **não** aparece como programação ativa.
- **Geração automática:** ao faturar, o sistema cria a agenda das 9 etapas (Faturamento → Planejamento → Movimentação → Preparação → Qualidade → Pátio de Entrega → Agendamento → Entrega Técnica → Pós-entrega) a partir da data de faturamento + SLAs. As datas podem ser **reagendadas** manualmente.
- **Conectado ao Kanban:** ao mover o veículo no Kanban, as programações são atualizadas (etapa atual vira *Em andamento*, anteriores *Concluído*).
- **Cores:** 🔵 programado · 🟡 hoje/atenção · 🔴 atrasado · 🟢 concluído · ⚪ cancelado/reagendado.
- **Reagendamento** exige motivo e gera registro no histórico do evento.
- **Integrações (modo demonstração):** cada criação/alteração/conclusão gera um **evento interno para n8n** (`calendar.event_created`, `...rescheduled`, `...completed`, etc.) e um **log de e-mail simulado** — nada é enviado de verdade. Veja em **Calendário → 📨 Logs (n8n / e-mail)**.

---

## 📁 Estrutura dos arquivos

```
torre-belcar/
├── index.html            ← versão web (computador) — abra este arquivo
├── app-celular.html      ← simulação do app de celular (mobile)
├── assets/
│   ├── styles.css         ← identidade visual Belcar (web)
│   ├── data.js            ← modelo de dados, etapas, regras, calendário, mobile (compartilhado)
│   ├── app.js             ← telas web: Kanban, dashboard, calendário, painel do veículo
│   ├── mobile.css         ← estilo do app de celular
│   └── mobile.js          ← app de celular: login, abas, página do veículo, sheets
├── .nojekyll             ← (vazio) evita o Jekyll quebrar a pasta assets/ no GitHub Pages
├── .gitignore            ← exclui do deploy os arquivos internos
└── README.md

# Fora do deploy (locais/internos, ignorados pelo .gitignore):
#   .claude/  ·  *.docx  ·  PROMPT-CLAUDE-CODE-Torre-de-Controle-Belcar.md
```

---

## 🌐 Publicar no GitHub Pages (grátis)

O app é **100% estático** (só HTML, CSS e JS) — roda direto no GitHub Pages, sem build e sem servidor.

### 1) Subir o projeto para o GitHub
Dentro da pasta do projeto, rode (troque `USUARIO` pelo seu usuário do GitHub e crie antes o repositório vazio `torre-belcar` em github.com):

```bash
git init
git add .
git commit -m "Deploy inicial Torre Belcar"
git branch -M main
git remote add origin https://github.com/USUARIO/torre-belcar.git
git push -u origin main
```

> O `.gitignore` já exclui do deploy os arquivos internos (pasta `.claude/`, o `.docx` e o prompt).
> O arquivo `.nojekyll` (vazio, na raiz) garante que o GitHub Pages sirva a pasta `assets/` sem processamento do Jekyll.

### 2) Ativar o GitHub Pages
No repositório, no site do GitHub:

**Settings → Pages → em “Build and deployment”, “Source” = Deploy from a branch → Branch: `main` → pasta: `/ (root)` → Save.**

Aguarde ~1 minuto. O GitHub mostra o endereço publicado, no formato:

```
https://USUARIO.github.io/torre-belcar/
```

- Versão web (computador): `https://USUARIO.github.io/torre-belcar/`
- App celular: `https://USUARIO.github.io/torre-belcar/app-celular.html`

> Como os caminhos são **relativos** (`assets/...`), funciona igual estando na raiz do repositório.
> Cada visitante terá seus próprios dados no localStorage do navegador dele.

---

## ☁ Próximo passo: versão em nuvem (multiusuário)

Esta versão local é o **piloto** para validar o processo com a equipe. Quando a operação
adotar, o caminho natural é levar o **mesmo fluxo e as mesmas regras** para uma base
compartilhada, onde todos veem o mesmo dado em tempo real e há login por perfil:

- **Backend:** Supabase (Postgres + Auth + RLS por perfil: admin, gestor, comercial, faturamento,
  planejamento, preparação, qualidade, entrega, visualizador).
- **App:** a mesma lógica de etapas, gate de faturamento, responsável obrigatório e histórico.
- **Extras:** dashboard analítico, anexos/fotos, alertas por responsável e exportação.

As etapas, transições e regras já estão isoladas em `assets/data.js`, o que facilita essa migração
sem refazer o processo. (O detalhamento dessa versão em nuvem está num documento interno mantido
fora do deploy.)

---

## 🛠 Rodar via servidor local (opcional, para quem é técnico)

Não é necessário para usar o sistema, mas se preferir servir por HTTP:

```bash
node .claude/preview-server.js
# abre em http://localhost:4173
```
