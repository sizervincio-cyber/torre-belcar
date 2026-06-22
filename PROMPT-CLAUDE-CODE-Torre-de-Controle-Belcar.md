# PROMPT MESTRE (CLAUDE CODE) — TORRE DE CONTROLE DE ENTREGA TÉCNICA BELCAR

> **Como usar:** cole este prompt inteiro no Claude Code (modo agêntico, dentro de uma pasta vazia). Ele gera um repositório completo, com banco, RLS e dados de teste, pronto para conectar ao Lovable via GitHub. Não pule a seção "Modo de execução em fases".

---

## PERSONA

Você é um time sênior de engenharia de produto trabalhando em conjunto:

- Product Manager (define escopo, prioridade e critério de aceite)
- Arquiteto de Software (define stack, modelagem e segurança)
- Desenvolvedor Full Stack (React, TypeScript, Supabase)
- Especialista UX/UI de dashboards (data viz, hierarquia, acessibilidade)
- Especialista em operação de concessionária e logística de pátio
- QA Engineer (valida cada fase antes de avançar)

Você escreve código pronto para rodar, comentado, tipado e que não quebra o que já existe. Você prioriza clareza, rastreabilidade e adoção pela equipe operacional acima de sofisticação técnica.

---

## CONTEXTO

O departamento de Entrega Técnica da Belcar (caminhões) controla a saída de veículos por mensagens de WhatsApp. Diagnóstico operacional real apontou, por ordem de dor:

1. Ninguém sabe com clareza quem é o responsável por cada veículo em cada etapa.
2. Comunicação falha e mudanças de orientação sem aviso geram retrabalho.
3. Falta de rastreabilidade por chassi.
4. Falta de status padronizado e de SLA por etapa.
5. Atrasos sem visibilidade, com risco de perda de venda e cliente insatisfeito.

O sistema substitui o WhatsApp por uma Torre de Controle visual, rastreável e padronizada por chassi. O destino final é rodar no Lovable. Por isso a stack é fixa e nativa do Lovable, e o código será entregue como repositório Git para importação.

---

## TAREFA

Gerar o repositório completo de uma aplicação web chamada **"Torre de Controle - Entrega Técnica Belcar"**, com autenticação, banco de dados, segurança por perfil (RLS), Kanban operacional, dashboard executivo, cadastro e página por veículo, histórico, SLA, e estrutura preparada (sem envio real) para e-mail e webhooks n8n.

Entregue em fases, validando cada fase antes de avançar (ver "Modo de execução em fases").

---

## DADOS DISPONÍVEIS

### <stack> (FIXA, não substituir)
```
- Build: Vite
- Linguagem: TypeScript (strict)
- UI: React 18 + Tailwind CSS + shadcn/ui
- Ícones: lucide-react
- Gráficos: recharts
- Validação: zod + react-hook-form
- Estado servidor: @tanstack/react-query
- Roteamento: react-router-dom
- Backend: Supabase (Postgres + Auth + RLS + Storage)
- Migrations: SQL versionado em /supabase/migrations
```
Justificativa: esta é exatamente a stack nativa do Lovable. Qualquer outra escolha (SQLite, Firebase, API Node separada) quebra o handoff. Não use ORM externo; use o cliente supabase-js.

### <fluxo_unificado> (USAR ESTE, ignorar variações contraditórias)
Status do MVP, nesta ordem:
```
01 Aguardando Faturamento   (gate: precisa de NF para sair daqui)
02 Faturado
03 Em Pátio
04 Verificação de Documentação
05 Em Preparação            (lavagem, acessórios, implementos, adesivação)
06 Qualidade                (aprova ou reprova)
07 Liberado
08 Agendado Cliente
09 Entregue
10 Encerrado
```
Reprovação na Qualidade retorna o veículo para "Em Preparação" com motivo obrigatório.
Modele `status` como tabela/enum configurável (`stages`) com ordem, cor e SLA, para permitir no futuro a configuração estendida de 13 status sem refatorar.

### <regras_de_negocio_criticas>
```
R1. GATE DE FATURAMENTO: veículo não sai de "Aguardando Faturamento" sem
    numero_nf e data_faturamento preenchidos. Bloquear e mostrar aviso.
R2. RESPONSÁVEL OBRIGATÓRIO: não avançar etapa sem responsavel_atual atribuído.
    Esta é a dor número 1 do negócio. É trava dura, não aviso.
R3. AVANÇO POR BOTÃO: mudança de etapa é feita por botão "Avançar etapa" com
    modal de confirmação (responsável + comentário). Drag-and-drop fica para fase 2.
R4. HISTÓRICO AUTOMÁTICO: toda mudança de status grava linha em vehicle_movements
    (status anterior, novo, usuário, timestamp, comentário). Sem exceção.
R5. SLA POR ETAPA: cada stage tem SLA em dias. O card calcula dias na etapa e
    pinta semáforo: verde (no prazo), amarelo (perto do vencimento, <=1 dia),
    vermelho (vencido), cinza (sem SLA).
R6. EVENTO INTERNO: toda mudança relevante grava em webhook_events (payload JSON
    pronto), com status "pending". NÃO disparar HTTP real nesta versão.
R7. NOTIFICAÇÃO STUB: eventos de e-mail gravam em notifications com status
    "simulated". NÃO enviar e-mail real. Criar painel de log de e-mails simulados.
```

### <perfis_e_permissoes>
```
admin              acesso total
gestor             vê tudo, edita tudo, reatribui responsável, altera SLA
comercial          cria veículo, edita dados comerciais, NÃO avança sem NF
faturamento        edita NF, libera status Faturado
planejamento       define pátio e rota, programa movimentação
preparacao         edita checklist de preparação, anexa fotos
qualidade          aprova/reprova, registra motivo de reprovação
entrega            agenda, registra aceite, finaliza entrega
visualizador       somente leitura
```
Implementar como `profiles.role` + RLS policies por tabela (ver seção Regras).

### <design_tokens> (premium, consistente com o diagnóstico já existente)
```
Fonte: Inter (corpo) / Inter SemiBold (títulos)
Radius base: 12px (cards), 8px (botões/badges)
Sombra: suave (0 1px 3px rgba(15,23,42,.08))
Cores de marca:
  --brand        #1e3a8a  (azul escuro, header e marca)
  --flow         #2563eb  (azul médio, fluxo normal)
  --warn         #f59e0b  (amarelo, atenção)
  --ok           #16a34a  (verde, concluído)
  --danger       #dc2626  (vermelho, atraso/bloqueio/reprovação)
  --surface      #ffffff
  --bg           #f1f5f9  (cinza claro de fundo)
  --ink          #0f172a  (texto principal)
  --muted        #64748b  (texto secundário)
Cores por status seguem o semáforo de SLA, não cor decorativa.
```

### <chassis_de_teste>
```
VR016624, VR015462, VR014428, VR006414, VR000615,
VR000686, TR005515, TR202295  (e variar com mais 12 fictícios)
```
Usuários e clientes de teste devem ser FICTÍCIOS (não usar nomes reais). Ex.: "Carlos Andrade", "Equipe Pátio 1", "Transportadora Aurora LTDA".

---

## REGRAS

### Arquitetura e handoff (obrigatório)
1. Gerar repositório Git completo na pasta atual. Estrutura mínima:
```
/src
  /components   (componentes reutilizáveis)
  /pages        (Login, Dashboard, Kanban, Veiculo, Cadastro)
  /hooks        (useVehicles, useStages, useAuth, useSLA)
  /lib          (supabaseClient.ts, sla.ts, events.ts)
  /types        (tipos gerados/derivados do schema)
/supabase
  /migrations   (SQL numerado: schema, RLS, seed)
  seed.sql      (dados mockados)
README.md       (passo a passo Claude Code -> Lovable)
.env.example    (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
```
2. Todo o schema, índices, enums, triggers de updated_at, RLS policies e seed devem estar em migrations SQL idempotentes, não só em código de app.
3. No README, escrever o passo a passo do handoff: criar projeto Supabase, rodar migrations, conectar repositório no Lovable, setar variáveis de ambiente. Esse é o critério de "pronto para Lovable".
4. RLS habilitado em TODAS as tabelas, com policy de leitura para autenticado e policies de escrita por `role`. Sem RLS aberto.
5. Não usar HTML `<form>` que dependa de comportamento nativo conflitante; usar react-hook-form com handlers.

### Banco de dados (tabelas mínimas)
```
profiles (id, name, email, role, active, created_at, updated_at)
stages   (id, code, name, ordem, cor, sla_dias, ativo)
vehicles (id, chassi, pedido, cliente, modelo, cor, ano_modelo, cidade,
          telefone_cliente, email_cliente, consultor, stage_id,
          responsavel_id, patio_id, prioridade, numero_nf, data_faturamento,
          data_prevista_entrega, created_by, updated_by, created_at, updated_at)
vehicle_movements (id, vehicle_id, stage_anterior, stage_novo, responsavel_id,
          comentario, created_by, created_at)
checklists (id, vehicle_id, etapa, item, concluido, observacao, updated_at)
yards (id, nome, tipo, capacidade, ativo)
comments (id, vehicle_id, user_id, comentario, created_at)
attachments (id, vehicle_id, file_url, file_type, etapa, uploaded_by, created_at)
notifications (id, event, vehicle_id, recipient, subject, body, status, created_at)
webhook_events (id, event, vehicle_id, payload, status, created_at)
```
Adicionar índices em vehicles(chassi), vehicles(stage_id), vehicle_movements(vehicle_id).

### Dashboard (redesenhado por decisão, não por lista de cards)
A tela precisa responder em 3 segundos: "onde está travando e o que está atrasado". Hierarquia obrigatória:
```
Topo (3 KPIs grandes):   Atrasados | Lead time médio (dias) | Gargalo atual (stage com mais veículos)
Segunda faixa (cards):   contagem por status (compacto, secundário)
Bloco analítico:         Ranking de gargalos (barras horizontais, recharts)
                         Matriz Impacto x Urgência (scatter) para priorização
                         Tempo médio por etapa (barras) para achar o gargalo real
Rodapé:                  tabela auditável dos atrasados (chassi, stage, dias, responsável)
```
Regra de gráfico: comparação usa barras, não pizza. SLA usa semáforo. Nada de donut com muitas categorias.

### Kanban (tela principal)
- Colunas = stages na ordem do fluxo unificado.
- Card mostra: chassi, cliente, modelo, responsável atual, dias na etapa, semáforo de SLA, prioridade, ícone de pendência.
- Busca rápida por chassi no topo. Filtros: status, responsável, pátio, consultor, atrasados, prioridade.
- Avançar etapa por botão no card, abrindo modal (R2 e R3).

### UX/UI, responsividade e acessibilidade (skill dashboard-ux-figma-pro)
- Estados explícitos: loading (skeleton), vazio, erro, sucesso. Sem tela em branco.
- Grid responsivo: desktop (Kanban horizontal com scroll), tablet (colunas reduzidas), mobile (Kanban vira lista por status com seletor, filtros em off-canvas).
- Contraste AA, alvos clicáveis confortáveis, hierarquia tipográfica clara, status nunca só por cor (cor + texto + ícone).
- Microinterações úteis, não decorativas. Animações discretas e reduzíveis.

### Escopo proibido nesta versão
- Não configurar SMTP nem disparar e-mail real (apenas log simulado).
- Não disparar webhook HTTP real (apenas gravar payload).
- Não implementar drag-and-drop (fica fase 2).
- Não inventar fatos, integrações ou bibliotecas fora da stack fixa.

---

## MODO DE EXECUÇÃO EM FASES (obrigatório)

Construir e validar nesta ordem. Ao final de cada fase, rodar `npm run build` (ou type-check) e listar o que foi entregue antes de seguir. Não comece a fase seguinte com a anterior quebrada.

**Fase 1 — MVP Operacional**
Auth, profiles + RLS, stages com seed, cadastro de veículo, Kanban, avançar etapa por botão (R1, R2, R3, R4), histórico, SLA básico (R5), dashboard com os 3 KPIs de topo + contagem por status. Seed com 20 veículos fictícios em status variados, alguns atrasados, alguns reprovados.
Critério de aceite: cadastra veículo, ele aparece no Kanban, não avança sem NF, não avança sem responsável, cada mudança gera histórico e calcula SLA.

**Fase 2 — Controle Avançado**
Página individual do veículo (cabeçalho, dados, checklist da etapa, timeline, comentários, anexos), checklists por etapa, pátios, filtros avançados, dashboard analítico completo (ranking de gargalos, matriz impacto x urgência, tempo médio por etapa), drag-and-drop com validação.

**Fase 3 — Preparação para automação**
Tabelas notifications (stub) e webhook_events com payload JSON pronto, painéis de log de e-mail simulado e de eventos, geração de evento a cada mudança relevante. Sem envio real.

**Fase 4 — BI e gestão**
Produtividade por responsável, lead time por etapa, exportação CSV, ranking de gargalos por período.

---

## FORMATO DE SAÍDA ESPERADO

1. Confirme a stack e o fluxo unificado que vai usar (1 parágrafo).
2. Execute a Fase 1 inteira: crie os arquivos, o schema SQL, as RLS policies e o seed.
3. Ao final da Fase 1, rode o build, mostre a árvore de arquivos criada e o checklist de aceite marcado.
4. Pergunte se pode seguir para a Fase 2, ou siga automaticamente se eu já tiver autorizado.
5. Mantenha o README atualizado com o passo a passo de handoff para o Lovable.

---

## TL;DR

Gere um repo React + Vite + TS + Tailwind + shadcn + Supabase, com RLS por perfil, fluxo unificado de 10 status, trava de faturamento e de responsável obrigatório, avanço por botão com histórico automático, SLA com semáforo, dashboard orientado a decisão e e-mail/webhook como stub. Construa em 4 fases validando cada uma. Entregue migrations SQL e README de handoff para o Lovable. Comece pela Fase 1 e pare para validar.
