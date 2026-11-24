(() => {
  "use strict";

  const STORAGE_KEY = "nexo-gestao-estoque-v1";
  const USER_STORAGE_KEY = "nexo-demo-user-v1";
  const pageContent = document.getElementById("page-content");
  const dialog = document.getElementById("app-dialog");
  const dialogTitle = document.getElementById("dialog-title");
  const dialogContent = document.getElementById("dialog-content");
  const toastRegion = document.getElementById("toast-region");
  const routes = {
    dashboard: "Visão geral",
    stock: "Estoque",
    deliveries: "Entregas",
    replenishment: "Reposição",
    reports: "Relatórios"
  };
  const users = {
    manager: {
      name: "Marina Costa",
      initials: "MC",
      role: "Gerente de Operações",
      description: "Coordena a operação e acompanha todos os indicadores.",
      permissions: new Set([
        "view.dashboard", "view.stock", "view.deliveries", "view.replenishment", "view.reports",
        "products.manage", "stock.move", "deliveries.create", "deliveries.pick", "deliveries.dispatch",
        "deliveries.complete", "deliveries.cancel", "replenishment.receive", "purchase.approve", "purchase.receive", "export.stock",
        "export.deliveries", "export.replenishment", "backup.manage"
      ])
    },
    warehouse: {
      name: "João Lima",
      initials: "JL",
      role: "Almoxarife",
      description: "Cuida do catálogo, recebimentos, contagens e expedição.",
      permissions: new Set([
        "view.dashboard", "view.stock", "view.deliveries", "view.replenishment",
        "products.manage", "stock.move", "deliveries.pick", "deliveries.dispatch",
        "deliveries.cancel", "replenishment.receive", "purchase.receive", "export.stock"
      ])
    },
    driver: {
      name: "Ana Souza",
      initials: "AS",
      role: "Motorista / Roteirizador",
      description: "Consulta rotas e confirma entregas em trânsito.",
      permissions: new Set(["view.deliveries", "deliveries.complete"])
    },
    buyer: {
      name: "Rafael Nunes",
      initials: "RN",
      role: "Comprador / Suprimentos",
      description: "Acompanha níveis mínimos e organiza a reposição.",
      permissions: new Set([
        "view.stock", "view.replenishment",
        "purchase.request", "export.stock", "export.replenishment"
      ])
    }
  };
  let currentRoute = "dashboard";
  let activeQuery = "";
  let currentUserId;
  let state;

  const loadCurrentUser = () => {
    try {
      const saved = localStorage.getItem(USER_STORAGE_KEY);
      return saved === null ? "manager" : (users[saved] ? saved : "driver");
    } catch {
      return "driver";
    }
  };
  currentUserId = loadCurrentUser();
  const can = (permission) => Boolean(users[currentUserId]?.permissions.has(permission));
  const canAny = (...permissions) => permissions.some(can);
  const activePurchaseStatuses = new Set(["pending", "approved", "partially_received"]);
  const defaultRoute = () => currentUserId === "driver" ? "deliveries" : currentUserId === "buyer" ? "replenishment" : "dashboard";
  const deliveryPermission = (status) => ({
    planned: "deliveries.pick",
    separating: "deliveries.dispatch",
    in_transit: "deliveries.complete"
  })[status];
  const canAdvance = (delivery) => Boolean(deliveryPermission(delivery.status) && can(deliveryPermission(delivery.status)));

  const dateOffset = (offset) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const timezoneOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 10);
  };
  const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const currency = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(Number(value) || 0);
  const number = (value) => new Intl.NumberFormat("pt-BR").format(Number(value) || 0);
  const dateLabel = (value) => value ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(`${value}T12:00:00`)).replace(".", "") : "—";
  const fullDate = (value) => value ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(`${value}T12:00:00`)) : "—";
  const daysBetween = (start, end) => Math.max(0, Math.round((new Date(`${end}T12:00:00`) - new Date(`${start}T12:00:00`)) / 86400000));
  const productById = (id) => state.products.find((product) => product.id === id);
  const isOpenDelivery = (delivery) => !["delivered", "cancelled"].includes(delivery.status);
  const reservedFor = (productId) => state.deliveries
    .filter((delivery) => ["planned", "separating"].includes(delivery.status))
    .flatMap((delivery) => delivery.items)
    .filter((item) => item.productId === productId)
    .reduce((sum, item) => sum + item.quantity, 0);
  const availableFor = (product) => product.onHand - reservedFor(product.id);
  const isLate = (delivery) => isOpenDelivery(delivery) && delivery.expectedDate < dateOffset(0);
  const lowProducts = () => state.products.filter((product) => availableFor(product) <= product.reorderPoint);
  const activePurchaseFor = (productId) => state.purchaseRequests.find((request) =>
    request.productId === productId && activePurchaseStatuses.has(request.status));

  function seedState() {
    const products = [
      { id: "p-1001", sku: "INS-001", name: "Arroz tipo 1 · 5 kg", category: "Alimentos", supplier: "Cerealista Vale Verde", onHand: 128, reorderPoint: 40, unitCost: 23.9 },
      { id: "p-1002", sku: "INS-002", name: "Feijão carioca · 1 kg", category: "Alimentos", supplier: "Cerealista Vale Verde", onHand: 34, reorderPoint: 45, unitCost: 8.4 },
      { id: "p-1003", sku: "INS-003", name: "Óleo de soja · 900 ml", category: "Alimentos", supplier: "Distribuidora Sertão", onHand: 86, reorderPoint: 32, unitCost: 6.75 },
      { id: "p-1004", sku: "INS-004", name: "Açúcar cristal · 2 kg", category: "Alimentos", supplier: "Distribuidora Sertão", onHand: 21, reorderPoint: 30, unitCost: 7.2 },
      { id: "p-1005", sku: "HIG-001", name: "Detergente neutro · 500 ml", category: "Higiene e limpeza", supplier: "Atacado Bom Preço", onHand: 112, reorderPoint: 35, unitCost: 2.45 },
      { id: "p-1006", sku: "HIG-002", name: "Sabão em pó · 1,6 kg", category: "Higiene e limpeza", supplier: "Atacado Bom Preço", onHand: 27, reorderPoint: 30, unitCost: 14.8 },
      { id: "p-1007", sku: "HIG-003", name: "Água sanitária · 1 L", category: "Higiene e limpeza", supplier: "Atacado Bom Preço", onHand: 74, reorderPoint: 25, unitCost: 3.65 },
      { id: "p-1008", sku: "BEB-001", name: "Água mineral · 1,5 L", category: "Bebidas", supplier: "Bebidas São Francisco", onHand: 158, reorderPoint: 50, unitCost: 2.1 },
      { id: "p-1009", sku: "BEB-002", name: "Suco de uva integral · 1 L", category: "Bebidas", supplier: "Bebidas São Francisco", onHand: 18, reorderPoint: 24, unitCost: 12.5 },
      { id: "p-1010", sku: "MER-001", name: "Café torrado · 500 g", category: "Mercearia", supplier: "Café Chapada", onHand: 56, reorderPoint: 22, unitCost: 17.9 },
      { id: "p-1011", sku: "MER-002", name: "Macarrão espaguete · 500 g", category: "Mercearia", supplier: "Cerealista Vale Verde", onHand: 93, reorderPoint: 36, unitCost: 4.2 },
      { id: "p-1012", sku: "MER-003", name: "Farinha de mandioca · 1 kg", category: "Mercearia", supplier: "Cooperativa Raízes", onHand: 16, reorderPoint: 20, unitCost: 7.8 }
    ];
    const items = (entries) => entries.map(([productId, quantity]) => ({ productId, quantity }));
    return {
      products,
      deliveries: [
        { id: "d-2026-041", customer: "Mercado São Lucas", destination: "Av. Beira Rio, 214 · Centro", city: "Bom Jesus da Lapa", route: "Rota Centro", expectedDate: dateOffset(0), createdDate: dateOffset(-2), status: "separating", freightCost: 48, notes: "Entregar no recebimento", items: items([["p-1001", 18], ["p-1005", 12]]) },
        { id: "d-2026-042", customer: "Empório da Praça", destination: "Praça Marechal, 88 · Centro", city: "Bom Jesus da Lapa", route: "Rota Centro", expectedDate: dateOffset(0), createdDate: dateOffset(-1), status: "in_transit", freightCost: 32, notes: "", items: items([["p-1008", 24], ["p-1010", 8]]) },
        { id: "d-2026-043", customer: "Comercial Nova Bahia", destination: "Rua do Comércio, 501", city: "Paratinga", route: "Rota Norte", expectedDate: dateOffset(1), createdDate: dateOffset(-1), status: "planned", freightCost: 110, notes: "Confirmar horário por telefone", items: items([["p-1002", 16], ["p-1003", 12]]) },
        { id: "d-2026-044", customer: "Mercadinho Oliveira", destination: "Rua São José, 43", city: "Sítio do Mato", route: "Rota Sul", expectedDate: dateOffset(-1), createdDate: dateOffset(-3), status: "in_transit", freightCost: 155, notes: "", items: items([["p-1004", 10], ["p-1007", 8]]) },
        { id: "d-2026-045", customer: "Supermercado Dois Irmãos", destination: "Av. Principal, 900", city: "Bom Jesus da Lapa", route: "Rota Leste", expectedDate: dateOffset(2), createdDate: dateOffset(0), status: "planned", freightCost: 65, notes: "", items: items([["p-1005", 20], ["p-1011", 15]]) },
        { id: "d-2026-046", customer: "Loja de Conveniência Lapa", destination: "Rod. BA-160, km 2", city: "Bom Jesus da Lapa", route: "Rota Leste", expectedDate: dateOffset(-1), createdDate: dateOffset(-3), status: "delivered", deliveredDate: dateOffset(-1), freightCost: 42, notes: "", items: items([["p-1008", 18], ["p-1009", 5]]) },
        { id: "d-2026-047", customer: "Mercado Central Paratinga", destination: "Rua da Matriz, 17", city: "Paratinga", route: "Rota Norte", expectedDate: dateOffset(-2), createdDate: dateOffset(-4), status: "delivered", deliveredDate: dateOffset(-2), freightCost: 120, notes: "", items: items([["p-1001", 22], ["p-1012", 6]]) },
        { id: "d-2026-048", customer: "Armazém Ponto Certo", destination: "Rua Bahia, 126", city: "Bom Jesus da Lapa", route: "Rota Centro", expectedDate: dateOffset(3), createdDate: dateOffset(0), status: "planned", freightCost: 28, notes: "", items: items([["p-1003", 9], ["p-1010", 4]]) },
        { id: "d-2026-049", customer: "Comercial São Francisco", destination: "Av. Beira Rio, 1200", city: "Serra do Ramalho", route: "Rota Oeste", expectedDate: dateOffset(2), createdDate: dateOffset(-1), status: "separating", freightCost: 98, notes: "", items: items([["p-1007", 15], ["p-1011", 12]]) }
      ],
      movements: [
        { id: uid("mov"), productId: "p-1001", type: "Saída para entrega", quantity: 22, date: dateOffset(-2), reference: "d-2026-047", note: "Pedido entregue" },
        { id: uid("mov"), productId: "p-1008", type: "Saída para entrega", quantity: 18, date: dateOffset(-1), reference: "d-2026-046", note: "Pedido entregue" },
        { id: uid("mov"), productId: "p-1001", type: "Entrada", quantity: 60, date: dateOffset(-3), reference: "NF-1084", note: "Recebimento de compra" },
        { id: uid("mov"), productId: "p-1002", type: "Entrada", quantity: 40, date: dateOffset(-4), reference: "NF-1079", note: "Recebimento de compra" },
        { id: uid("mov"), productId: "p-1010", type: "Ajuste de inventário", quantity: 3, date: dateOffset(-1), reference: "INV-002", note: "Contagem cíclica" }
      ],
      purchaseRequests: []
    };
  }

  function validateState(candidate) {
    if (!candidate || !Array.isArray(candidate.products) || !Array.isArray(candidate.deliveries) || !Array.isArray(candidate.movements)) {
      throw new Error("O arquivo não contém uma estrutura de dados Nexo válida.");
    }
    if (candidate.purchaseRequests === undefined) candidate.purchaseRequests = [];
    if (!Array.isArray(candidate.purchaseRequests)) throw new Error("A lista de solicitações de compra é inválida.");
    candidate.purchaseRequests.forEach((request) => {
      if (request.receivedQuantity === undefined) request.receivedQuantity = 0;
    });
    const ids = new Set();
    const skus = new Set();
    for (const product of candidate.products) {
      if (!product.id || !product.sku || !product.name || !Number.isInteger(product.onHand) || product.onHand < 0 ||
          !Number.isInteger(product.reorderPoint) || product.reorderPoint < 0 || !Number.isFinite(product.unitCost) || product.unitCost < 0) {
        throw new Error("Há um produto com dados ausentes ou inválidos.");
      }
      if (ids.has(product.id)) throw new Error("O arquivo contém identificadores de produto repetidos.");
      if (skus.has(product.sku.toLocaleLowerCase("pt-BR"))) throw new Error("O arquivo contém SKUs repetidos.");
      ids.add(product.id);
      skus.add(product.sku.toLocaleLowerCase("pt-BR"));
    }
    const productIds = new Set(candidate.products.map((product) => product.id));
    const deliveryIds = new Set();
    for (const delivery of candidate.deliveries) {
      if (!delivery.id || deliveryIds.has(delivery.id) || !delivery.customer || !["planned", "separating", "in_transit", "delivered", "cancelled"].includes(delivery.status) ||
          !Number.isFinite(Number(delivery.freightCost)) || Number(delivery.freightCost) < 0 ||
          !Array.isArray(delivery.items) || !delivery.items.length ||
          new Set(delivery.items.map((item) => item.productId)).size !== delivery.items.length ||
          delivery.items.some((item) => !productIds.has(item.productId) || !Number.isInteger(item.quantity) || item.quantity <= 0)) {
        throw new Error("Há uma entrega com itens ou produtos inválidos.");
      }
      deliveryIds.add(delivery.id);
    }
    for (const product of candidate.products) {
      const reserved = candidate.deliveries.filter((delivery) => ["planned", "separating"].includes(delivery.status))
        .flatMap((delivery) => delivery.items)
        .filter((item) => item.productId === product.id)
        .reduce((sum, item) => sum + item.quantity, 0);
      if (reserved > product.onHand) throw new Error(`O estoque físico de ${product.name} é menor que a quantidade reservada.`);
    }
    for (const movement of candidate.movements) {
      if (!productIds.has(movement.productId) || !movement.type || !Number.isInteger(movement.quantity) || movement.quantity <= 0) {
        throw new Error("Há uma movimentação com dados inválidos.");
      }
    }
    const purchaseRequestIds = new Set();
    const pendingProductIds = new Set();
    for (const request of candidate.purchaseRequests) {
      if (!request.id || purchaseRequestIds.has(request.id) || !productIds.has(request.productId) ||
          !Number.isInteger(request.quantity) || request.quantity <= 0 || !Number.isInteger(request.receivedQuantity) ||
          request.receivedQuantity < 0 || request.receivedQuantity > request.quantity ||
          !Number.isFinite(request.unitCost) || request.unitCost < 0 ||
          !users[request.requestedBy] || !["pending", "approved", "partially_received", "received", "rejected"].includes(request.status) ||
          typeof request.requestedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(request.requestedAt) ||
          typeof request.supplier !== "string" || typeof request.note !== "string" ||
          (request.status === "pending" && pendingProductIds.has(request.productId)) ||
          (["pending", "approved", "rejected"].includes(request.status) && request.receivedQuantity !== 0) ||
          (request.status === "partially_received" && (request.receivedQuantity === 0 || request.receivedQuantity === request.quantity)) ||
          (request.status === "received" && request.receivedQuantity !== request.quantity) ||
          (request.status !== "pending" && (!users[request.reviewedBy] || typeof request.reviewedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(request.reviewedAt)))) {
        throw new Error("Há uma solicitação de compra com dados inválidos.");
      }
      purchaseRequestIds.add(request.id);
      if (request.status === "pending") pendingProductIds.add(request.productId);
    }
    return candidate;
  }

  function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) {
      const initial = seedState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    return validateState(JSON.parse(saved));
  }

  function commit(mutator, successMessage) {
    try {
      const draft = JSON.parse(JSON.stringify(state));
      mutator(draft);
      validateState(draft);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      state = draft;
      render();
      if (successMessage) toast(successMessage);
      return true;
    } catch (error) {
      toast(error instanceof Error ? error.message : "Não foi possível salvar as alterações.", "error");
      return false;
    }
  }

  function toast(message, kind = "success") {
    const element = document.createElement("div");
    element.className = `toast ${kind}`;
    element.textContent = message;
    toastRegion.append(element);
    window.setTimeout(() => element.remove(), 3800);
  }

  function statusMeta(delivery) {
    if (isLate(delivery)) return { label: "Atrasada", tone: "danger" };
    const map = {
      planned: { label: "Planejada", tone: "neutral" },
      separating: { label: "Em separação", tone: "warn" },
      in_transit: { label: "Em trânsito", tone: "info" },
      delivered: { label: "Entregue", tone: "ok" },
      cancelled: { label: "Cancelada", tone: "neutral" }
    };
    return map[delivery.status] || map.planned;
  }

  function statusPill(delivery) {
    const status = statusMeta(delivery);
    return `<span class="status-pill ${status.tone}">${status.label}</span>`;
  }

  function pageHeading(title, description, actions = "") {
    return `<div class="page-heading"><div><h1>${title}</h1><p>${description}</p></div><div class="heading-actions">${actions}</div></div>`;
  }

  function metricCard(label, value, note, icon, tone, trend = "", trendTone = "") {
    return `<article class="metric-card"><div class="metric-top"><span class="metric-label">${label}</span><span class="metric-icon ${tone}">${icon}</span></div><div class="metric-value">${value}</div><div class="metric-bottom">${trend ? `<span class="metric-trend ${trendTone}">${trend}</span>` : ""}<span>${note}</span></div></article>`;
  }

  function productThumb(product, extraClass = "") {
    const classes = ["", "orange", "blue", "pink"];
    const index = Math.max(0, state.products.findIndex((item) => item.id === product.id));
    return `<span class="product-thumb ${classes[index % classes.length]} ${extraClass}">${escapeHtml(product.name.charAt(0).toUpperCase())}</span>`;
  }

  function productCell(product) {
    return `<div class="product-cell">${productThumb(product)}<span class="product-name"><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.sku)} · ${escapeHtml(product.category)}</small></span></div>`;
  }

  function deliveryProductSummary(delivery) {
    return delivery.items.map((item) => {
      const product = productById(item.productId);
      return `${item.quantity}× ${escapeHtml(product?.name || "Produto removido")}`;
    }).join(", ");
  }

  function actionButton(label, action, id, tone = "secondary") {
    return `<button class="button button-${tone} button-small" data-action="${action}" data-id="${escapeHtml(id)}">${label}</button>`;
  }

  function renderDashboard() {
    const openDeliveries = state.deliveries.filter(isOpenDelivery);
    const lateCount = openDeliveries.filter(isLate).length;
    const low = lowProducts();
    const totalOnHand = state.products.reduce((sum, product) => sum + product.onHand, 0);
    const inventoryValue = state.products.reduce((sum, product) => sum + product.onHand * product.unitCost, 0);
    const closed = state.deliveries.filter((delivery) => delivery.status === "delivered");
    const onTime = closed.filter((delivery) => delivery.deliveredDate <= delivery.expectedDate).length;
    const otif = closed.length ? Math.round((onTime / closed.length) * 100) : 0;
    const chartDays = Array.from({ length: 7 }, (_, index) => dateOffset(index - 6));
    const dispatched = chartDays.map((day) => state.movements.filter((movement) => movement.date === day && movement.type === "Saída para entrega").reduce((sum, movement) => sum + movement.quantity, 0));
    const received = chartDays.map((day) => state.movements.filter((movement) => movement.date === day && movement.type.startsWith("Entrada")).reduce((sum, movement) => sum + movement.quantity, 0));
    const chartMax = Math.max(10, ...dispatched, ...received);
    const chartLabels = chartDays.map((day) => new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(new Date(`${day}T12:00:00`)).replace(".", ""));
    const recent = [...state.deliveries].sort((a, b) => b.createdDate.localeCompare(a.createdDate)).slice(0, 5);
    const lowRows = [...low].sort((a, b) => (availableFor(a) / Math.max(1, a.reorderPoint)) - (availableFor(b) / Math.max(1, b.reorderPoint))).slice(0, 4);
    return `
      ${pageHeading("Visão geral", `Acompanhe o pulso da operação · ${fullDate(dateOffset(0))}`, `<span class="date-chip">◷ &nbsp;Hoje · últimos 7 dias</span>${can("deliveries.create") ? `<button class="button button-primary" data-action="new-delivery"><span class="plus">+</span>Nova entrega</button>` : ""}`)}
      <section class="metric-grid" aria-label="Indicadores principais">
        ${metricCard("Valor em estoque", currency(inventoryValue), `${number(totalOnHand)} un. físicas · ${number(state.products.reduce((sum, product) => sum + reservedFor(product.id), 0))} reservadas`, "▦", "green", "●", "")}
        ${metricCard("Entregas em andamento", number(openDeliveries.length), lateCount ? `${lateCount} com prazo vencido` : "Nenhuma entrega atrasada", "⇢", "blue", lateCount ? `${lateCount} atrasada${lateCount > 1 ? "s" : ""}` : "● no prazo", lateCount ? "danger" : "")}
        ${metricCard("Itens para reposição", number(low.length), "Abaixo ou no nível mínimo", "↗", low.length ? "orange" : "green", low.length ? "Requer atenção" : "● Estoque saudável", low.length ? "warning" : "")}
        ${metricCard("OTIF", `${otif}%`, `${onTime} de ${closed.length} entregas concluídas no prazo`, "✓", "green", closed.length ? "Prazo e quantidade" : "Sem entregas concluídas", "")}
      </section>

      <section class="content-grid">
        <article class="panel">
          <header class="panel-header"><div><h2>Fluxo da operação</h2><div class="panel-subtitle">Volume diário · expedições e recebimentos</div></div><div class="chart-legend"><span class="legend-item"><i class="legend-dot"></i>Expedições</span><span class="legend-item"><i class="legend-dot orange"></i>Recebimentos</span></div></header>
          <div class="panel-body"><div class="chart-area"><div class="chart-y-labels"><span>${number(chartMax)}</span><span>${number(Math.round(chartMax * .75))}</span><span>${number(Math.round(chartMax * .5))}</span><span>${number(Math.round(chartMax * .25))}</span><span>0</span></div><div class="chart-grid"><span></span><span></span><span></span><span></span><span></span></div><div class="bar-chart">${dispatched.map((value, index) => `<div class="bar-group"><i class="bar" title="${value} unidade(s) expedidas" style="height:${Math.max(2, value / chartMax * 100)}%"></i><i class="bar secondary" title="${received[index]} unidade(s) recebidas" style="height:${Math.max(2, received[index] / chartMax * 100)}%"></i></div>`).join("")}</div><div class="chart-x-labels">${chartLabels.map((day) => `<span>${day}</span>`).join("")}</div></div></div>
        </article>
        <article class="panel">
          <header class="panel-header"><div><h2>Entregas por etapa</h2><div class="panel-subtitle">Situação atual da expedição</div></div><button class="text-button" data-route="deliveries">Ver entregas&nbsp; →</button></header>
          <div class="panel-body"><div class="delivery-summary">${[
            ["Planejadas", state.deliveries.filter((item) => item.status === "planned").length, "blue", "↗"],
            ["Em separação", state.deliveries.filter((item) => item.status === "separating").length, "orange", "▤"],
            ["Em trânsito", state.deliveries.filter((item) => item.status === "in_transit").length, "green", "⇢"],
            ["Atrasadas", lateCount, "orange", "◷"]
          ].map(([label, count, color, icon]) => `<div class="summary-row"><span class="summary-icon">${icon}</span><span class="summary-copy"><strong>${label}</strong><small>${label === "Atrasadas" ? "Prazo de entrega excedido" : "Pedidos ativos nesta etapa"}</small></span><span class="summary-value">${count}</span></div>`).join("")}
            <div class="panel-footnote">OTIF mede pedidos entregues completos e até a data combinada. Atualiza automaticamente ao concluir uma entrega.</div>
          </div></div>
        </article>
      </section>

      <section class="content-grid">
        <article class="panel">
          <header class="panel-header"><div><h2>Entregas recentes</h2><div class="panel-subtitle">Acompanhe os pedidos mais recentes</div></div><button class="text-button" data-route="deliveries">Ver todas&nbsp; →</button></header>
          ${recent.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>PEDIDO / CLIENTE</th><th>ROTA</th><th>PREVISÃO</th><th>STATUS</th></tr></thead><tbody>${recent.map((delivery) => `<tr><td><span class="customer-copy"><strong>${escapeHtml(delivery.id)} · ${escapeHtml(delivery.customer)}</strong><small>${delivery.items.length} produto${delivery.items.length === 1 ? "" : "s"}</small></span></td><td>${escapeHtml(delivery.route)}</td><td>${dateLabel(delivery.expectedDate)}</td><td>${statusPill(delivery)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-state">Nenhuma entrega registrada.</div>`}
        </article>
        <article class="panel">
          <header class="panel-header"><div><h2>Estoque em atenção</h2><div class="panel-subtitle">Itens no nível de reposição</div></div><button class="text-button" data-route="stock">Ver estoque&nbsp; →</button></header>
          ${lowRows.length ? `<div class="panel-body" style="padding-top:5px;padding-bottom:5px">${lowRows.map((product) => `<div class="summary-row" style="padding:8px 0"><span>${productThumb(product)}</span><span class="summary-copy"><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.sku)} · mínimo ${product.reorderPoint}</small></span><span class="summary-value" style="color:#c45b54">${availableFor(product)}</span></div>`).join("")}<div class="panel-footnote">${low.length > lowRows.length ? `+ ${low.length - lowRows.length} item(ns) exigem atenção. ` : ""}Sugestões calculadas com base no estoque disponível e no nível mínimo.</div></div>` : `<div class="empty-state">Tudo em ordem.<strong>Nenhum item precisa de reposição.</strong></div>`}
        </article>
      </section>
    `;
  }

  function renderStock() {
    const query = activeQuery.toLocaleLowerCase("pt-BR");
    const category = document.getElementById("stock-category")?.value || "all";
    const stockFilter = document.getElementById("stock-status")?.value || "all";
    const products = state.products.filter((product) => {
      const matchesQuery = !query || `${product.name} ${product.sku} ${product.category} ${product.supplier}`.toLocaleLowerCase("pt-BR").includes(query);
      const matchesCategory = category === "all" || product.category === category;
      const low = availableFor(product) <= product.reorderPoint;
      const matchesStatus = stockFilter === "all" || (stockFilter === "low" ? low : !low);
      return matchesQuery && matchesCategory && matchesStatus;
    });
    const categories = [...new Set(state.products.map((product) => product.category))].sort();
    const totalValue = state.products.reduce((sum, product) => sum + product.onHand * product.unitCost, 0);
    const headerActions = `${can("stock.move") ? `<button class="button button-secondary" data-action="movement"><span>↕</span>Registrar movimentação</button>` : ""}${can("products.manage") ? `<button class="button button-primary" data-action="new-product"><span class="plus">+</span>Novo produto</button>` : ""}`;
    return `
      ${pageHeading("Estoque", "Controle níveis, movimentações e disponibilidade dos produtos.", headerActions)}
      <section class="metric-grid">
        ${metricCard("Produtos cadastrados", number(state.products.length), "SKUs ativos no catálogo", "▦", "blue")}
        ${metricCard("Unidades em estoque", number(state.products.reduce((sum, product) => sum + product.onHand, 0)), `${number(state.products.reduce((sum, product) => sum + reservedFor(product.id), 0))} reservadas para pedidos`, "▤", "green")}
        ${metricCard("Estoque disponível", number(state.products.reduce((sum, product) => sum + availableFor(product), 0)), "Saldo físico menos reservas", "✓", "green")}
        ${metricCard("Valor imobilizado", currency(totalValue), "Custo estimado das unidades físicas", "R$", "orange")}
      </section>
      ${lowProducts().length ? `<div class="inline-alert"><span class="alert-symbol">◷</span><span><strong>${lowProducts().length} ${lowProducts().length === 1 ? "produto precisa" : "produtos precisam"} de atenção.</strong> Estoque disponível igual ou inferior ao mínimo definido. Consulte a página de reposição para ver as quantidades sugeridas.</span></div>` : ""}
      <section class="panel section-panel">
        <div class="table-toolbar"><div class="filter-row"><input class="filter-input" id="stock-search" type="search" placeholder="Buscar por produto, SKU ou fornecedor..." value="${escapeHtml(activeQuery)}"><select class="filter-select" id="stock-category"><option value="all">Todas as categorias</option>${categories.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("")}</select><select class="filter-select" id="stock-status"><option value="all">Todos os níveis</option><option value="low">Repor agora</option><option value="healthy">Nível saudável</option></select></div><span class="subtle-copy">${products.length} produto${products.length === 1 ? "" : "s"}</span></div>
        ${products.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>PRODUTO</th><th>FORNECEDOR</th><th>FÍSICO</th><th>RESERVADO</th><th>DISPONÍVEL</th><th>MÍNIMO</th><th>STATUS</th><th></th></tr></thead><tbody>${products.map((product) => {
          const reserved = reservedFor(product.id);
          const available = availableFor(product);
          const low = available <= product.reorderPoint;
          const rowActions = `${can("stock.move") ? `<button class="table-action" title="Registrar movimentação" aria-label="Movimentar ${escapeHtml(product.name)}" data-action="movement" data-id="${product.id}">↕</button>` : ""}${can("products.manage") ? `<button class="table-action" title="Editar produto" aria-label="Editar ${escapeHtml(product.name)}" data-action="edit-product" data-id="${product.id}">✎</button>` : ""}`;
          return `<tr><td>${productCell(product)}</td><td>${escapeHtml(product.supplier || "—")}</td><td><span class="stock-number">${number(product.onHand)}</span></td><td>${number(reserved)}</td><td><span class="stock-number ${low ? "low" : ""}">${number(available)}</span></td><td>${number(product.reorderPoint)}</td><td><span class="status-pill ${low ? "danger" : "ok"}">${low ? "Reposição" : "Saudável"}</span></td><td>${rowActions || "—"}</td></tr>`;
        }).join("")}</tbody></table></div>` : `<div class="empty-state"><strong>Nenhum produto encontrado</strong>Ajuste os filtros ou cadastre um novo produto.</div>`}
        <div class="table-bottom"><span>Disponível = estoque físico − itens reservados em pedidos abertos.</span>${can("export.stock") ? `<button class="text-button" data-action="export-stock">Exportar CSV&nbsp; ↓</button>` : ""}</div>
      </section>
      <section class="panel">
        <header class="panel-header"><div><h2>Movimentações recentes</h2><div class="panel-subtitle">Rastreabilidade das últimas alterações de saldo</div></div><span class="subtle-copy">${state.movements.length} registros</span></header>
        ${renderMovementTable(state.movements.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7))}
      </section>
    `;
  }

  function renderMovementTable(movements) {
    if (!movements.length) return `<div class="empty-state">Nenhuma movimentação registrada.</div>`;
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>DATA</th><th>PRODUTO</th><th>TIPO</th><th>QUANTIDADE</th><th>REFERÊNCIA</th><th>OBSERVAÇÃO</th></tr></thead><tbody>${movements.map((movement) => {
      const product = productById(movement.productId);
      const sign = movement.type === "Saída" || movement.type === "Saída para entrega" ? "−" : "+";
      return `<tr><td>${dateLabel(movement.date)}</td><td>${escapeHtml(product?.name || "Produto removido")}</td><td>${escapeHtml(movement.type)}</td><td><span class="stock-number ${sign === "−" ? "low" : ""}">${sign}${number(movement.quantity)}</span></td><td>${escapeHtml(movement.reference || "—")}</td><td>${escapeHtml(movement.note || "—")}</td></tr>`;
    }).join("")}</tbody></table></div>`;
  }

  function renderDeliveries() {
    const statusFilter = document.getElementById("delivery-status")?.value || "all";
    const periodFilter = document.getElementById("delivery-period")?.value || "all";
    const query = activeQuery.toLocaleLowerCase("pt-BR");
    const deliveries = state.deliveries
      .filter((delivery) => {
        const status = statusMeta(delivery).label.toLocaleLowerCase("pt-BR");
        const matchesStatus = statusFilter === "all" || (statusFilter === "late" ? isLate(delivery) : delivery.status === statusFilter);
        const matchesPeriod = periodFilter === "all" || (periodFilter === "open" ? isOpenDelivery(delivery) : delivery.status === periodFilter);
        const matchesQuery = !query || `${delivery.id} ${delivery.customer} ${delivery.destination} ${delivery.city} ${delivery.route} ${delivery.items.map((item) => productById(item.productId)?.name || "").join(" ")}`.toLocaleLowerCase("pt-BR").includes(query);
        return matchesStatus && matchesPeriod && matchesQuery;
      })
      .sort((a, b) => b.createdDate.localeCompare(a.createdDate));
    const open = state.deliveries.filter(isOpenDelivery);
    const late = open.filter(isLate);
    const completed = state.deliveries.filter((item) => item.status === "delivered");
    const deliveredOnTime = completed.filter((item) => item.deliveredDate <= item.expectedDate).length;
    const otif = completed.length ? Math.round(deliveredOnTime / completed.length * 100) : 0;
    const headerActions = `${can("export.deliveries") ? `<button class="button button-secondary" data-action="export-deliveries">Exportar lista&nbsp; ↓</button>` : ""}${can("deliveries.create") ? `<button class="button button-primary" data-action="new-delivery"><span class="plus">+</span>Nova entrega</button>` : ""}`;
    const driverNotice = currentUserId === "driver" ? `<div class="inline-alert"><span class="alert-symbol">⇢</span><span>Perfil de motorista: você pode confirmar entregas em trânsito. Esta demonstração não possui cadastro de atribuição de rotas e exibe a fila completa; em produção, mostre apenas as entregas vinculadas ao motorista autenticado.</span></div>` : "";
    return `
      ${pageHeading("Entregas", "Planeje expedições, acompanhe rotas e mantenha cada pedido rastreável.", headerActions)}
      <section class="metric-grid">
        ${metricCard("Pedidos em aberto", number(open.length), "Aguardando conclusão", "⇢", "blue")}
        ${metricCard("Atrasadas", number(late.length), "Prazo previsto ultrapassado", "◷", late.length ? "orange" : "green", late.length ? "Ação necessária" : "No prazo", late.length ? "warning" : "")}
        ${metricCard("Entregues", number(completed.length), "No período demonstrativo", "✓", "green")}
        ${metricCard("OTIF", `${otif}%`, "Entregue no prazo e completo", "◉", "blue")}
      </section>
      ${driverNotice}
      <section class="panel section-panel">
        <div class="table-toolbar"><div class="filter-row"><input class="filter-input" id="delivery-search" type="search" placeholder="Buscar pedido, cliente ou rota..." value="${escapeHtml(activeQuery)}"><select class="filter-select" id="delivery-status"><option value="all">Todos os status</option><option value="planned">Planejada</option><option value="separating">Em separação</option><option value="in_transit">Em trânsito</option><option value="delivered">Entregue</option><option value="cancelled">Cancelada</option><option value="late">Atrasada</option></select><select class="filter-select" id="delivery-period"><option value="all">Todos os pedidos</option><option value="open">Em aberto</option><option value="delivered">Concluídos</option></select></div><span class="subtle-copy">${deliveries.length} pedido${deliveries.length === 1 ? "" : "s"}</span></div>
        ${deliveries.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>PEDIDO / CLIENTE</th><th>ITENS</th><th>DESTINO / ROTA</th><th>PREVISÃO</th><th>FRETE</th><th>STATUS</th><th>AÇÕES</th></tr></thead><tbody>${deliveries.map((delivery) => `<tr><td><span class="customer-copy"><strong class="delivery-id">${escapeHtml(delivery.id)}</strong><small>${escapeHtml(delivery.customer)}</small></span></td><td><span class="route-copy"><strong>${delivery.items.length} produto${delivery.items.length === 1 ? "" : "s"}</strong><small>${deliveryProductSummary(delivery)}</small></span></td><td><span class="route-copy"><strong>${escapeHtml(delivery.city)}</strong><small>${escapeHtml(delivery.route)}</small></span></td><td>${dateLabel(delivery.expectedDate)}</td><td>${currency(delivery.freightCost)}</td><td>${statusPill(delivery)}</td><td><div class="table-actions"><button class="button button-secondary button-small" data-action="delivery-detail" data-id="${escapeHtml(delivery.id)}">Detalhes</button>${canAdvance(delivery) ? `<button class="table-action" title="Avançar etapa" aria-label="Avançar etapa de ${escapeHtml(delivery.id)}" data-action="advance-delivery" data-id="${escapeHtml(delivery.id)}">→</button>` : ""}</div></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-state"><strong>Nenhuma entrega encontrada</strong>Altere a busca ou os filtros para ver outros pedidos.</div>`}
        <div class="table-bottom"><span>Ao iniciar o trânsito, os itens são baixados do estoque e a movimentação fica registrada.</span><span>Atualizado agora</span></div>
      </section>
      <section class="panel">
        <header class="panel-header"><div><h2>Fluxo de status</h2><div class="panel-subtitle">Cada pedido percorre as etapas abaixo</div></div></header>
        <div class="panel-body delivery-summary">${[
          ["1. Planejada", "Reserva disponibilidade para o pedido.", "neutral"],
          ["2. Em separação", "Itens separados e prontos para expedição.", "warn"],
          ["3. Em trânsito", "Baixa física do estoque e início do transporte.", "info"],
          ["4. Entregue", "Conclui o pedido e calcula o indicador OTIF.", "ok"]
        ].map(([label, text, tone]) => `<div class="summary-row"><span class="status-pill ${tone}">${label}</span><span class="summary-copy"><small>${text}</small></span></div>`).join("")}
          <div class="panel-footnote">Entregas planejadas ou em separação reservam saldo. Cancelamentos liberam a reserva; pedidos em trânsito não podem ser cancelados para preservar a integridade do inventário.</div>
        </div>
      </section>
    `;
  }

  function renderReplenishment() {
    const recommendations = lowProducts().map((product) => ({ product, target: Math.max(product.reorderPoint * 2, product.reorderPoint + 1), suggested: Math.max(0, Math.max(product.reorderPoint * 2, product.reorderPoint + 1) - availableFor(product)) }))
      .sort((a, b) => availableFor(a.product) / Math.max(a.product.reorderPoint, 1) - availableFor(b.product) / Math.max(b.product.reorderPoint, 1));
    const totalCost = recommendations.reduce((sum, row) => sum + row.suggested * row.product.unitCost, 0);
    const headerActions = can("export.replenishment") ? `<button class="button button-secondary" data-action="export-replenishment">Exportar sugestão&nbsp; ↓</button>` : "";
    const recommendationCards = recommendations.map(({ product, target, suggested }) => {
      const activeRequest = activePurchaseFor(product.id);
      const buyerAction = can("purchase.request")
        ? activeRequest
          ? `<span class="status-pill ${activeRequest.status === "pending" ? "warn" : "info"} purchase-pending-label">${activeRequest.status === "pending" ? "Aguardando aprovação" : activeRequest.status === "partially_received" ? "Recebimento parcial" : "Compra aprovada"}</span>`
          : `<button class="button button-primary button-small" data-action="request-purchase" data-id="${escapeHtml(product.id)}">Solicitar compra</button>`
        : "";
      const receiveAction = can("replenishment.receive")
        ? `<button class="button button-secondary button-small" data-action="receive-product" data-id="${escapeHtml(product.id)}">Registrar recebimento</button>`
        : "";
      return `<article class="replenish-card"><div class="replenish-card-top">${productThumb(product)}<div><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.sku)} · ${escapeHtml(product.category)}</p></div></div><div class="replenish-qty"><div><strong>${number(suggested)}</strong><span> un. sugeridas</span></div><span class="status-pill danger">Abaixo do mínimo</span></div><div class="replenish-metrics"><span>Disponível<strong>${availableFor(product)}</strong></span><span>Mínimo<strong>${product.reorderPoint}</strong></span><span>Meta<strong>${target}</strong></span></div><div class="coverage-bar"><span style="width:${Math.min(100, Math.max(0, availableFor(product) / Math.max(target, 1) * 100))}%"></span></div><p class="subtle-copy" style="margin-top:7px">Fornecedor: ${escapeHtml(product.supplier || "Não informado")} · ${currency(product.unitCost)}/un.</p>${buyerAction}${receiveAction}</article>`;
    }).join("");
    return `
      ${pageHeading("Reposição", "Antecipe compras com base no saldo disponível e nos níveis mínimos definidos.", headerActions)}
      <section class="metric-grid">
        ${metricCard("SKUs para repor", number(recommendations.length), "No mínimo ou abaixo dele", "↗", recommendations.length ? "orange" : "green")}
        ${metricCard("Unidades sugeridas", number(recommendations.reduce((sum, row) => sum + row.suggested, 0)), "Meta: dois níveis mínimos", "▦", "blue")}
        ${metricCard("Custo estimado", currency(totalCost), "Estimativa pelo custo unitário", "R$", "orange")}
        ${metricCard("Cobertura saudável", `${state.products.length ? Math.round((state.products.length - recommendations.length) / state.products.length * 100) : 100}%`, "Produtos acima do mínimo", "✓", "green")}
      </section>
      ${renderPurchaseRequests()}
      ${recommendations.length ? `<div class="inline-alert"><span class="alert-symbol">↗</span><span>As sugestões recompõem o saldo disponível até dois níveis mínimos. O comprador envia o pedido ao Gerente de Operações; após a aprovação, o Almoxarife registra o recebimento físico e o estoque é atualizado.</span></div><section class="tile-grid">${recommendationCards}</section>` : `<section class="panel"><div class="empty-state"><strong>Estoque equilibrado</strong>Nenhum produto está no nível de reposição. O saldo disponível está acima dos mínimos configurados.</div></section>`}
      <div class="report-note"><strong>Como o cálculo funciona:</strong> saldo disponível = estoque físico − quantidade reservada em entregas planejadas ou em separação. As sugestões indicam uma quantidade para recompor o estoque até duas vezes o mínimo cadastrado; não geram uma ordem automática.</div>
    `;
  }

  function renderReports() {
    const delivered = state.deliveries.filter((delivery) => delivery.status === "delivered");
    const onTime = delivered.filter((delivery) => delivery.deliveredDate <= delivery.expectedDate).length;
    const otif = delivered.length ? Math.round(onTime / delivered.length * 100) : 0;
    const avgLead = delivered.length ? (delivered.reduce((sum, delivery) => sum + daysBetween(delivery.createdDate, delivery.deliveredDate), 0) / delivered.length).toFixed(1) : "0";
    const cost = state.deliveries.filter((delivery) => delivery.status !== "cancelled").reduce((sum, delivery) => sum + Number(delivery.freightCost || 0), 0);
    const low = lowProducts();
    const inventoryValue = state.products.reduce((sum, product) => sum + product.onHand * product.unitCost, 0);
    return `
      ${pageHeading("Relatórios", "Indicadores para apoiar decisões de compra, estoque e roteirização.", `<span class="date-chip">◷ &nbsp;Todos os registros</span>`)}
      <section class="report-grid">
        <article class="report-card"><h3>OTIF · entregas no prazo e completas</h3><strong>${otif}%</strong><p>${onTime} de ${delivered.length} pedidos concluídos chegaram dentro do prazo previsto.</p><div class="coverage-bar"><span style="width:${otif}%"></span></div></article>
        <article class="report-card"><h3>Lead time médio de entrega</h3><strong>${avgLead} dias</strong><p>Tempo entre a criação do pedido e sua confirmação de entrega.</p></article>
        <article class="report-card"><h3>Custo de frete registrado</h3><strong>${currency(cost)}</strong><p>Soma do frete estimado em pedidos não cancelados.</p></article>
        <article class="report-card"><h3>Valor físico em estoque</h3><strong>${currency(inventoryValue)}</strong><p>Saldo físico multiplicado pelo custo unitário informado.</p></article>
        <article class="report-card"><h3>Itens para reposição</h3><strong>${low.length} SKU${low.length === 1 ? "" : "s"}</strong><p>Produtos com saldo disponível no mínimo ou abaixo dele.</p></article>
        <article class="report-card"><h3>Rastreabilidade</h3><strong>${state.movements.length} eventos</strong><p>Movimentações registradas com data, tipo, referência e observação.</p></article>
      </section>
      ${renderPermissionMatrix()}
      <section class="panel section-panel">
        <header class="panel-header"><div><h2>Exportar dados</h2><div class="panel-subtitle">Baixe os registros para análise, conferência ou cópia de segurança.</div></div></header>
        <div class="panel-body">
          <div class="report-actions">${can("export.stock") ? `<button class="button button-secondary" data-action="export-stock">Estoque em CSV&nbsp; ↓</button>` : ""}${can("export.deliveries") ? `<button class="button button-secondary" data-action="export-deliveries">Entregas em CSV&nbsp; ↓</button>` : ""}${can("backup.manage") ? `<button class="button button-primary" data-action="backup-json">Cópia de segurança JSON&nbsp; ↓</button><button class="button button-secondary" data-action="import-json">Restaurar cópia JSON&nbsp; ↑</button><input id="backup-file" type="file" accept="application/json,.json" hidden>` : ""}</div>
          <div class="report-note"><strong>Privacidade e continuidade:</strong> este protótipo salva dados no armazenamento local do navegador e não transmite informações a um servidor. Exporte cópias JSON regularmente para evitar perda de dados ao limpar o navegador. O acesso é local ao dispositivo; autenticação, permissões de usuário e sincronização entre unidades exigem implantação com backend seguro.</div>
        </div>
      </section>
      <section class="panel">
        <header class="panel-header"><div><h2>Movimentações de estoque</h2><div class="panel-subtitle">Trilha de auditoria operacional</div></div>${can("export.stock") ? `<button class="text-button" data-action="export-stock">Baixar estoque&nbsp; ↓</button>` : ""}</header>
        ${renderMovementTable(state.movements.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10))}
      </section>
    `;
  }

  function renderPurchaseRequests() {
    if (!can("purchase.request") && !can("purchase.approve") && !can("purchase.receive")) return "";
    const canReview = can("purchase.approve");
    const canReceive = can("purchase.receive");
    const requests = state.purchaseRequests
      .filter((request) => canReview || (can("purchase.request") && request.requestedBy === currentUserId) ||
        (canReceive && ["approved", "partially_received", "received"].includes(request.status)))
      .slice()
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    const statusDetails = {
      pending: ["Aguardando aprovação", "warn"],
      approved: ["Aprovada para compra", "info"],
      partially_received: ["Recebimento parcial", "warn"],
      received: ["Recebida", "ok"],
      rejected: ["Recusada", "danger"]
    };
    const cards = requests.map((request) => {
      const product = productById(request.productId);
      const [statusLabel, statusTone] = statusDetails[request.status];
      const reviewer = request.reviewedBy ? users[request.reviewedBy]?.name || request.reviewedBy : "";
      return `<article class="purchase-request-card">
        <div class="purchase-request-heading">
          <div><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.sku)} · ${escapeHtml(request.supplier || "Fornecedor não informado")}</small></div>
          <span class="status-pill ${statusTone}">${statusLabel}</span>
        </div>
        <div class="purchase-request-details">
          <span>Quantidade<strong>${number(request.quantity)} un.</strong></span>
          <span>Custo estimado<strong>${currency(request.quantity * request.unitCost)}</strong></span>
          <span>Solicitada por<strong>${escapeHtml(users[request.requestedBy]?.name || request.requestedBy)}</strong></span>
          <span>Data<strong>${fullDate(request.requestedAt)}</strong></span>
        </div>
        ${["approved", "partially_received", "received"].includes(request.status) ? `<div class="purchase-request-receipt"><span>Recebido<strong>${number(request.receivedQuantity)} de ${number(request.quantity)} un.</strong></span><span>Restante<strong>${number(request.quantity - request.receivedQuantity)} un.</strong></span></div>` : ""}
        ${request.note ? `<p class="purchase-request-note"><strong>Justificativa:</strong> ${escapeHtml(request.note)}</p>` : ""}
        ${reviewer ? `<p class="purchase-request-note">Analisada por ${escapeHtml(reviewer)} em ${fullDate(request.reviewedAt)}.</p>` : ""}
        ${canReview && request.status === "pending" ? `<div class="purchase-request-actions"><button class="button button-primary button-small" data-action="review-purchase-request" data-status="approved" data-id="${escapeHtml(request.id)}">Aprovar</button><button class="button button-danger button-small" data-action="review-purchase-request" data-status="rejected" data-id="${escapeHtml(request.id)}">Recusar</button></div>` : ""}
        ${canReceive && ["approved", "partially_received"].includes(request.status) ? `<div class="purchase-request-actions"><button class="button button-primary button-small" data-action="receive-purchase-request" data-id="${escapeHtml(request.id)}">Registrar recebimento</button></div>` : ""}
      </article>`;
    }).join("");
    const title = canReview ? "Solicitações de compra para aprovação" : can("purchase.request") ? "Minhas solicitações de compra" : "Compras aprovadas para recebimento";
    const description = canReview ? "Aprove ou recuse antes de autorizar o pedido ao fornecedor."
      : can("purchase.request") ? "Acompanhe o andamento e a decisão do gerente."
        : "Registre a quantidade recebida das compras aprovadas; o estoque será atualizado automaticamente.";
    const emptyMessage = canReview ? "Nenhuma solicitação de compra foi enviada."
      : can("purchase.request") ? "Suas solicitações enviadas ao Gerente de Operações aparecerão aqui."
        : "Compras aprovadas pelo Gerente de Operações aparecerão aqui.";
    return `<section class="panel section-panel purchase-requests-panel">
      <header class="panel-header"><div><h2>${title}</h2><div class="panel-subtitle">${description}</div></div></header>
      ${requests.length ? `<div class="purchase-request-list">${cards}</div>` : `<div class="empty-state">${emptyMessage}</div>`}
    </section>`;
  }

  function showPurchaseRequestDialog(product) {
    if (!can("purchase.request")) {
      toast("Seu perfil não pode solicitar compras.", "error");
      return;
    }
    if (!product || activePurchaseFor(product.id)) {
      toast("Já existe uma compra em andamento para este produto.", "error");
      return;
    }
    const target = Math.max(product.reorderPoint * 2, product.reorderPoint + 1);
    const suggested = Math.max(1, target - availableFor(product));
    showDialog("Solicitar compra", `
      <form novalidate>
        <div class="form-grid">
          <div class="field full"><span class="field-label">Produto</span><strong>${escapeHtml(product.name)} · ${escapeHtml(product.sku)}</strong></div>
          <div class="field full"><span class="field-label">Fornecedor / custo unitário</span><span>${escapeHtml(product.supplier || "Fornecedor não informado")} · ${currency(product.unitCost)}/un.</span></div>
          <div class="field"><label for="purchase-quantity">Quantidade solicitada</label><input id="purchase-quantity" name="quantity" type="number" min="1" step="1" required value="${suggested}"></div>
          <div class="field"><span class="field-label">Quantidade sugerida</span><span>${number(suggested)} un.</span></div>
          <div class="field full"><label for="purchase-note">Justificativa (opcional)</label><textarea id="purchase-note" name="note" maxlength="180" placeholder="Informe urgência ou contexto da compra"></textarea></div>
        </div>
        <div class="report-note">O pedido será enviado ao Gerente de Operações. A aprovação autoriza a compra; o estoque só será atualizado quando o recebimento físico for registrado.</div>
        <div class="form-error" role="alert"></div>${dialogFooter("Cancelar", "Enviar para aprovação")}
      </form>
    `, (formData, form) => {
      const quantity = Number(formData.get("quantity"));
      if (!Number.isInteger(quantity) || quantity <= 0) {
        const error = form.querySelector(".form-error");
        error.textContent = "Informe uma quantidade inteira maior que zero.";
        error.classList.add("visible");
        return false;
      }
      if (activePurchaseFor(product.id)) {
        const error = form.querySelector(".form-error");
        error.textContent = "Já existe uma compra em andamento para este produto.";
        error.classList.add("visible");
        return false;
      }
      return commit((draft) => {
        draft.purchaseRequests.push({
          id: uid("purchase"),
          productId: product.id,
          quantity,
          unitCost: product.unitCost,
          supplier: product.supplier || "",
          requestedBy: currentUserId,
          requestedAt: dateOffset(0),
          note: String(formData.get("note") || "").trim(),
          status: "pending",
          reviewedBy: "",
          reviewedAt: "",
          receivedQuantity: 0
        });
      }, "Solicitação enviada ao Gerente de Operações.");
    }, "SUPRIMENTOS");
  }

  function reviewPurchaseRequest(id, status) {
    if (!can("purchase.approve")) {
      toast("Somente o Gerente de Operações pode analisar solicitações de compra.", "error");
      return;
    }
    if (!["approved", "rejected"].includes(status)) {
      toast("A decisão informada para esta solicitação é inválida.", "error");
      return;
    }
    const request = state.purchaseRequests.find((item) => item.id === id);
    if (!request || request.status !== "pending") {
      toast("Esta solicitação já foi analisada ou não existe.", "error");
      return;
    }
    const decisionLabel = status === "approved" ? "aprovada" : "recusada";
    commit((draft) => {
      const requestToReview = draft.purchaseRequests.find((item) => item.id === id);
      requestToReview.status = status;
      requestToReview.reviewedBy = currentUserId;
      requestToReview.reviewedAt = dateOffset(0);
    }, `Solicitação ${decisionLabel}. O estoque permanece inalterado até o recebimento físico.`);
  }

  function showPurchaseReceiptDialog(id) {
    if (!can("purchase.receive")) {
      toast("Seu perfil não pode registrar o recebimento desta compra.", "error");
      return;
    }
    const request = state.purchaseRequests.find((item) => item.id === id);
    if (!request || !["approved", "partially_received"].includes(request.status)) {
      toast("Somente compras aprovadas e ainda não recebidas podem ser registradas.", "error");
      return;
    }
    const product = productById(request.productId);
    const remaining = request.quantity - request.receivedQuantity;
    showDialog("Receber compra aprovada", `
      <form novalidate>
        <div class="form-grid">
          <div class="field full"><span class="field-label">Produto</span><strong>${escapeHtml(product.name)} · ${escapeHtml(product.sku)}</strong></div>
          <div class="field full"><span class="field-label">Fornecedor</span><span>${escapeHtml(request.supplier || "Fornecedor não informado")}</span></div>
          <div class="field"><span class="field-label">Quantidade solicitada</span><span>${number(request.quantity)} un.</span></div>
          <div class="field"><span class="field-label">Já recebido</span><span>${number(request.receivedQuantity)} un.</span></div>
          <div class="field full"><label for="purchase-received-quantity">Quantidade recebida agora</label><input id="purchase-received-quantity" name="quantity" type="number" min="1" max="${remaining}" step="1" required value="${remaining}"></div>
        </div>
        <div class="report-note">Restam ${number(remaining)} unidade(s). O saldo em estoque será atualizado pela quantidade efetivamente recebida.</div>
        <div class="form-error" role="alert"></div>${dialogFooter("Cancelar", "Confirmar recebimento")}
      </form>
    `, (formData, form) => {
      const quantity = Number(formData.get("quantity"));
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > remaining) {
        const error = form.querySelector(".form-error");
        error.textContent = `Informe uma quantidade inteira entre 1 e ${remaining}.`;
        error.classList.add("visible");
        return false;
      }
      const fullyReceived = quantity === remaining;
      const successMessage = fullyReceived
        ? `Recebimento completo: ${number(quantity)} unidade(s) adicionadas ao estoque.`
        : `Recebimento parcial: ${number(quantity)} unidade(s) adicionadas; restam ${number(remaining - quantity)}.`;
      return commit((draft) => {
        const requestToReceive = draft.purchaseRequests.find((item) => item.id === id);
        const productToUpdate = draft.products.find((item) => item.id === requestToReceive.productId);
        productToUpdate.onHand += quantity;
        requestToReceive.receivedQuantity += quantity;
        requestToReceive.status = requestToReceive.receivedQuantity === requestToReceive.quantity ? "received" : "partially_received";
        draft.movements.push({
          id: uid("mov"),
          productId: productToUpdate.id,
          type: "Entrada de compra aprovada",
          quantity,
          date: dateOffset(0),
          reference: requestToReceive.id,
          note: `Recebimento por ${users[currentUserId].role}.`
        });
      }, successMessage);
    }, "RECEBIMENTO DE COMPRA");
  }

  function renderPermissionMatrix() {
    const roles = Object.entries(users);
    const rows = [
      { label: "Visão geral", permissions: ["view.dashboard"] },
      { label: "Consultar estoque", permissions: ["view.stock"] },
      { label: "Cadastrar / editar produtos", permissions: ["products.manage"] },
      { label: "Movimentações e ajustes de estoque", permissions: ["stock.move"] },
      { label: "Consultar entregas e rotas", permissions: ["view.deliveries"] },
      { label: "Criar nova entrega", permissions: ["deliveries.create"] },
      { label: "Separar pedidos", permissions: ["deliveries.pick"] },
      { label: "Despachar pedidos", permissions: ["deliveries.dispatch"] },
      { label: "Confirmar entrega", permissions: ["deliveries.complete"] },
      { label: "Cancelar antes do despacho", permissions: ["deliveries.cancel"] },
      { label: "Consultar sugestões de reposição", permissions: ["view.replenishment"] },
      { label: "Solicitar compra para aprovação", permissions: ["purchase.request"] },
      { label: "Aprovar / recusar solicitação de compra", permissions: ["purchase.approve"] },
      { label: "Registrar recebimento de compra aprovada", permissions: ["purchase.receive"] },
      { label: "Registrar recebimento físico", permissions: ["replenishment.receive"] },
      { label: "Consultar relatórios", permissions: ["view.reports"] },
      { label: "Exportar dados operacionais", permissions: ["export.stock", "export.deliveries", "export.replenishment"], mode: "some" },
      { label: "Backup / restaurar dados", permissions: ["backup.manage"] }
    ];
    const permissionCell = (user, row) => {
      const count = row.permissions.filter((permission) => user.permissions.has(permission)).length;
      const granted = row.mode === "some" ? count > 0 : count === row.permissions.length;
      const partial = row.mode === "some" && count > 0 && count < row.permissions.length;
      if (!granted) return `<td class="permission-cell"><span class="permission-no" aria-label="Sem acesso">—</span></td>`;
      return `<td class="permission-cell"><span class="${partial ? "permission-partial" : "permission-yes"}" aria-label="${partial ? "Acesso parcial" : "Permitido"}" title="${partial ? `${count} de ${row.permissions.length} exportações disponíveis` : "Permitido"}">${partial ? "Parcial" : "✓"}</span></td>`;
    };
    return `
      <section class="panel section-panel">
        <header class="panel-header"><div><h2>Matriz de Permissões (RBAC)</h2><div class="panel-subtitle">Acesso por função · princípio do menor privilégio</div></div><span class="subtle-copy">Usuário ativo: ${escapeHtml(users[currentUserId].role)}</span></header>
        <div class="table-wrap"><table class="data-table rbac-table"><thead><tr><th>RECURSO / AÇÃO</th>${roles.map(([, user]) => `<th>${escapeHtml(user.role)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.label)}</td>${roles.map(([, user]) => permissionCell(user, row)).join("")}</tr>`).join("")}</tbody></table></div>
        <div class="panel-body"><div class="report-note" style="margin-top:0"><strong>Como ler:</strong> ✓ permitido · Parcial acesso limitado ao tipo de exportação · — sem acesso. O seletor no cabeçalho demonstra as permissões de cada perfil. Como a aplicação é local e não possui autenticação, esses controles de interface não são uma fronteira de segurança: um servidor deve autenticar usuários, filtrar rotas atribuídas e validar cada ação.</div></div>
      </section>
    `;
  }

  function render() {
    if (!can(`view.${currentRoute}`)) currentRoute = defaultRoute();
    updateCurrentUserUi();
    document.title = `Nexo — ${routes[currentRoute]}`;
    document.getElementById("breadcrumb-current").textContent = routes[currentRoute];
    document.querySelectorAll(".nav-link[data-route]").forEach((button) => {
      button.hidden = !can(`view.${button.dataset.route}`);
      button.classList.toggle("active", button.dataset.route === currentRoute);
    });
    document.querySelector('[data-nav-group="overview"]').hidden = !can("view.dashboard");
    document.querySelector('[data-nav-group="operations"]').hidden = !canAny("view.stock", "view.deliveries", "view.replenishment");
    document.querySelector('[data-nav-group="intelligence"]').hidden = !can("view.reports");
    document.querySelector(".notification-button").hidden = !can("view.replenishment");
    const pendingPurchaseCount = state.purchaseRequests.filter((request) =>
      (request.status === "pending" && (can("purchase.approve") || (can("purchase.request") && request.requestedBy === currentUserId))) ||
      (can("purchase.receive") && ["approved", "partially_received"].includes(request.status))).length;
    const purchaseRequestBadge = document.getElementById("nav-purchase-requests");
    purchaseRequestBadge.textContent = pendingPurchaseCount;
    purchaseRequestBadge.hidden = pendingPurchaseCount === 0;
    document.getElementById("nav-low-stock").textContent = lowProducts().length;
    document.getElementById("nav-open-deliveries").textContent = state.deliveries.filter(isOpenDelivery).length;
    const pages = {
      dashboard: renderDashboard,
      stock: renderStock,
      deliveries: renderDeliveries,
      replenishment: renderReplenishment,
      reports: renderReports
    };
    pageContent.innerHTML = pages[currentRoute]();
    if (currentRoute === "stock") {
      const category = document.getElementById("stock-category");
      const status = document.getElementById("stock-status");
      if (category && window.stockCategory) category.value = window.stockCategory;
      if (status && window.stockStatus) status.value = window.stockStatus;
    }
    if (currentRoute === "deliveries") {
      const status = document.getElementById("delivery-status");
      const period = document.getElementById("delivery-period");
      if (status && window.deliveryStatus) status.value = window.deliveryStatus;
      if (period && window.deliveryPeriod) period.value = window.deliveryPeriod;
    }
  }

  function navigate(route) {
    if (!routes[route]) return;
    if (!can(`view.${route}`)) {
      toast(`O perfil ${users[currentUserId].role} não tem acesso a essa área.`, "error");
      return;
    }
    currentRoute = route;
    activeQuery = "";
    document.getElementById("global-search").value = "";
    document.getElementById("sidebar").classList.remove("mobile-open");
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showDialog(title, body, onSubmit, eyebrow = "OPERAÇÃO") {
    document.getElementById("dialog-eyebrow").textContent = eyebrow;
    dialogTitle.textContent = title;
    dialogContent.innerHTML = body;
    dialog.showModal();
    const form = dialogContent.querySelector("form");
    if (form) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const result = onSubmit(new FormData(form), form);
        if (result !== false) dialog.close();
      });
    }
    dialogContent.querySelector("input,select,textarea")?.focus();
  }

  function dialogFooter(cancelLabel = "Cancelar", saveLabel = "Salvar alterações") {
    return `<div class="form-footer"><button class="button button-secondary" type="button" data-dialog-close>${cancelLabel}</button><button class="button button-primary" type="submit">${saveLabel}</button></div>`;
  }

  function showProductDialog(product = null) {
    if (!can("products.manage")) {
      toast("Seu perfil não pode cadastrar ou editar produtos.", "error");
      return;
    }
    const editing = Boolean(product);
    showDialog(editing ? "Editar produto" : "Cadastrar produto", `
      <form novalidate>
        <div class="form-grid">
          <div class="field"><label for="product-sku">SKU / código</label><input id="product-sku" name="sku" required maxlength="24" placeholder="Ex.: MER-004" value="${escapeHtml(product?.sku || "")}"></div>
          <div class="field"><label for="product-category">Categoria</label><input id="product-category" name="category" required maxlength="50" placeholder="Ex.: Mercearia" value="${escapeHtml(product?.category || "")}"></div>
          <div class="field full"><label for="product-name">Nome do produto</label><input id="product-name" name="name" required maxlength="90" placeholder="Descrição para identificação" value="${escapeHtml(product?.name || "")}"></div>
          <div class="field"><label for="product-supplier">Fornecedor principal</label><input id="product-supplier" name="supplier" maxlength="70" placeholder="Nome do fornecedor" value="${escapeHtml(product?.supplier || "")}"></div>
          <div class="field"><label for="product-cost">Custo unitário (R$)</label><input id="product-cost" name="unitCost" type="number" min="0" step="0.01" required value="${product?.unitCost ?? ""}"></div>
          <div class="field"><label for="product-min">Estoque mínimo</label><input id="product-min" name="reorderPoint" type="number" min="0" step="1" required value="${product?.reorderPoint ?? 10}"><span class="field-help">Base para os alertas e a sugestão de compra.</span></div>
          ${editing ? `<div class="field"><label>Estoque físico atual</label><input value="${number(product.onHand)} unidades" disabled><span class="field-help">Use “Registrar movimentação” para alterar o saldo.</span></div>` : `<div class="field"><label for="product-initial">Estoque inicial</label><input id="product-initial" name="initialStock" type="number" min="0" step="1" value="0"><span class="field-help">A entrada inicial será registrada no histórico.</span></div>`}
        </div><div class="form-error" role="alert"></div>${dialogFooter("Cancelar", editing ? "Salvar produto" : "Cadastrar produto")}
      </form>
    `, (formData, form) => {
      const sku = String(formData.get("sku")).trim();
      const name = String(formData.get("name")).trim();
      const category = String(formData.get("category")).trim();
      const unitCost = Number(formData.get("unitCost"));
      const reorderPoint = Number(formData.get("reorderPoint"));
      const initialStock = Number(formData.get("initialStock") || 0);
      const duplicate = state.products.some((item) => item.sku.toLocaleLowerCase("pt-BR") === sku.toLocaleLowerCase("pt-BR") && item.id !== product?.id);
      if (!sku || !name || !category || !Number.isFinite(unitCost) || unitCost < 0 || !Number.isInteger(reorderPoint) || reorderPoint < 0 || !Number.isInteger(initialStock) || initialStock < 0 || duplicate) {
        const error = form.querySelector(".form-error");
        error.textContent = duplicate ? "Já existe um produto com esse SKU." : "Confira os campos obrigatórios e informe quantidades inteiras iguais ou maiores que zero.";
        error.classList.add("visible");
        return false;
      }
      const ok = commit((draft) => {
        if (product) {
          const target = draft.products.find((item) => item.id === product.id);
          Object.assign(target, { sku, name, category, supplier: String(formData.get("supplier")).trim(), unitCost, reorderPoint });
        } else {
          const created = { id: uid("prd"), sku, name, category, supplier: String(formData.get("supplier")).trim(), unitCost, reorderPoint, onHand: initialStock };
          draft.products.push(created);
          if (initialStock > 0) draft.movements.push({ id: uid("mov"), productId: created.id, type: "Entrada inicial", quantity: initialStock, date: dateOffset(0), reference: "CADASTRO", note: "Saldo inicial informado no cadastro" });
        }
      }, product ? "Produto atualizado." : "Produto cadastrado.");
      return ok;
    }, "CATÁLOGO");
  }

  function showMovementDialog(productId = "") {
    if (!can("stock.move")) {
      toast("Seu perfil não pode registrar movimentações manuais.", "error");
      return;
    }
    const selectedProduct = productById(productId);
    const options = state.products.map((product) => `<option value="${product.id}" ${product.id === productId ? "selected" : ""}>${escapeHtml(product.sku)} · ${escapeHtml(product.name)} (disp. ${availableFor(product)})</option>`).join("");
    showDialog("Registrar movimentação", `
      <form novalidate>
        <div class="form-grid">
          <div class="field full"><label for="movement-product">Produto</label><select id="movement-product" name="productId" required>${options}</select></div>
          <div class="field"><label for="movement-type">Tipo de movimentação</label><select id="movement-type" name="type"><option value="in">Entrada / recebimento</option><option value="out">Saída avulsa</option><option value="adjust">Ajuste positivo</option></select></div>
          <div class="field"><label for="movement-quantity">Quantidade</label><input id="movement-quantity" name="quantity" type="number" required min="1" step="1" placeholder="Ex.: 12"></div>
          <div class="field"><label for="movement-reference">Documento / referência</label><input id="movement-reference" name="reference" maxlength="35" placeholder="Ex.: NF-1092"></div>
          <div class="field"><label for="movement-date">Data</label><input id="movement-date" name="date" type="date" required value="${dateOffset(0)}"></div>
          <div class="field full"><label for="movement-note">Observação</label><textarea id="movement-note" name="note" maxlength="160" placeholder="Informe o motivo ou detalhe do movimento"></textarea></div>
        </div><div class="form-error" role="alert"></div>${dialogFooter("Cancelar", "Registrar movimento")}
      </form>
    `, (formData, form) => {
      const selected = productById(String(formData.get("productId")));
      const quantity = Number(formData.get("quantity"));
      const type = String(formData.get("type"));
      const date = String(formData.get("date"));
      if (!selected || !Number.isInteger(quantity) || quantity <= 0 || !date) {
        const error = form.querySelector(".form-error");
        error.textContent = "Selecione um produto, informe uma quantidade inteira positiva e uma data.";
        error.classList.add("visible");
        return false;
      }
      if (type === "out" && quantity > availableFor(selected)) {
        const error = form.querySelector(".form-error");
        error.textContent = `Saldo disponível insuficiente. Disponível: ${availableFor(selected)} unidades; ${reservedFor(selected.id)} já estão reservadas.`;
        error.classList.add("visible");
        return false;
      }
      const ok = commit((draft) => {
        const target = draft.products.find((item) => item.id === selected.id);
        const movementType = type === "in" ? "Entrada" : type === "out" ? "Saída" : "Ajuste positivo";
        target.onHand += type === "out" ? -quantity : quantity;
        draft.movements.push({ id: uid("mov"), productId: selected.id, type: movementType, quantity, date, reference: String(formData.get("reference")).trim(), note: String(formData.get("note")).trim() });
      }, "Movimentação registrada e saldo atualizado.");
      return ok;
    }, "ESTOQUE");
  }

  function addDeliveryLine() {
    const lines = dialogContent.querySelector(".line-items");
    if (!lines) return;
    const line = document.createElement("div");
    line.className = "line-item";
    line.innerHTML = `<div class="field"><label>Produto</label><select name="productId" required>${state.products.map((product) => `<option value="${product.id}">${escapeHtml(product.sku)} · ${escapeHtml(product.name)} (disp. ${availableFor(product)})</option>`).join("")}</select></div><div class="field"><label>Quantidade</label><input name="quantity" type="number" min="1" step="1" required value="1"></div><button class="remove-line" type="button" data-action="remove-line" aria-label="Remover item">×</button>`;
    lines.append(line);
  }

  function showDeliveryDialog() {
    if (!can("deliveries.create")) {
      toast("Seu perfil não pode criar entregas.", "error");
      return;
    }
    const options = state.products.map((product) => `<option value="${product.id}">${escapeHtml(product.sku)} · ${escapeHtml(product.name)} (disp. ${availableFor(product)})</option>`).join("");
    showDialog("Planejar entrega", `
      <form novalidate>
        <div class="form-grid">
          <div class="field"><label for="delivery-customer">Cliente</label><input id="delivery-customer" name="customer" required maxlength="80" placeholder="Nome do cliente"></div>
          <div class="field"><label for="delivery-city">Cidade / município</label><input id="delivery-city" name="city" required maxlength="60" placeholder="Ex.: Bom Jesus da Lapa"></div>
          <div class="field full"><label for="delivery-address">Endereço de entrega</label><input id="delivery-address" name="destination" required maxlength="120" placeholder="Rua, número e bairro"></div>
          <div class="field"><label for="delivery-route">Rota</label><input id="delivery-route" name="route" required maxlength="50" placeholder="Ex.: Rota Centro"></div>
          <div class="field"><label for="delivery-date">Previsão de entrega</label><input id="delivery-date" name="expectedDate" type="date" required value="${dateOffset(1)}"></div>
          <div class="field"><label for="delivery-freight">Custo de frete (R$)</label><input id="delivery-freight" name="freightCost" type="number" min="0" step="0.01" value="0"></div>
          <div class="field full"><label class="field-label">Itens do pedido</label><div class="line-items"><div class="line-item"><div class="field"><label>Produto</label><select name="productId" required>${options}</select></div><div class="field"><label>Quantidade</label><input name="quantity" type="number" min="1" step="1" required value="1"></div><button class="remove-line" type="button" data-action="remove-line" aria-label="Remover item" disabled>×</button></div></div><button class="text-button" type="button" data-action="add-line" style="margin-top:9px">+ Adicionar outro produto</button><div class="line-total">As quantidades ficam reservadas ao planejar e são baixadas ao iniciar o trânsito.</div></div>
          <div class="field full"><label for="delivery-notes">Observações para a entrega</label><textarea id="delivery-notes" name="notes" maxlength="180" placeholder="Instruções para separação ou recebimento"></textarea></div>
        </div><div class="form-error" role="alert"></div>${dialogFooter("Cancelar", "Criar entrega")}
      </form>
    `, (formData, form) => {
      const customer = String(formData.get("customer")).trim();
      const city = String(formData.get("city")).trim();
      const destination = String(formData.get("destination")).trim();
      const route = String(formData.get("route")).trim();
      const expectedDate = String(formData.get("expectedDate"));
      const freightCost = Number(formData.get("freightCost"));
      const productIds = formData.getAll("productId").map(String);
      const quantities = formData.getAll("quantity").map(Number);
      const items = productIds.map((id, index) => ({ productId: id, quantity: quantities[index] }));
      const duplicateItems = new Set(productIds).size !== productIds.length;
      const invalid = !customer || !city || !destination || !route || !expectedDate || !Number.isFinite(freightCost) || freightCost < 0 ||
        !items.length || items.some((item) => !productById(item.productId) || !Number.isInteger(item.quantity) || item.quantity <= 0);
      if (invalid || duplicateItems) {
        const error = form.querySelector(".form-error");
        error.textContent = duplicateItems ? "Cada produto deve aparecer uma única vez. Edite a quantidade na linha correspondente." : "Preencha os campos obrigatórios e use quantidades inteiras positivas.";
        error.classList.add("visible");
        return false;
      }
      const insufficient = items.find((item) => item.quantity > availableFor(productById(item.productId)));
      if (insufficient) {
        const product = productById(insufficient.productId);
        const error = form.querySelector(".form-error");
        error.textContent = `Saldo insuficiente para ${product.name}. Disponível: ${availableFor(product)} unidade(s).`;
        error.classList.add("visible");
        return false;
      }
      const ok = commit((draft) => {
        const sequence = String(50 + draft.deliveries.length + 1).padStart(3, "0");
        draft.deliveries.push({ id: `d-${new Date().getFullYear()}-${sequence}`, customer, city, destination, route, expectedDate, createdDate: dateOffset(0), status: "planned", freightCost, notes: String(formData.get("notes")).trim(), items });
      }, "Entrega criada; saldo separado para este pedido.");
      return ok;
    }, "EXPEDIÇÃO");
    const firstSelect = dialogContent.querySelector('select[name="productId"]');
    if (firstSelect && state.products.length === 0) firstSelect.innerHTML = "";
  }

  function showDeliveryDetail(delivery) {
    const next = { planned: ["separating", "Iniciar separação"], separating: ["in_transit", "Despachar pedido"], in_transit: ["delivered", "Confirmar entrega"] }[delivery.status];
    const showNextAction = canAdvance(delivery);
    const statusLabels = { planned: "Planejada", separating: "Em separação", in_transit: "Em trânsito", delivered: "Entregue", cancelled: "Cancelada" };
    showDialog(`Pedido ${delivery.id}`, `
      <div class="form-grid">
        <div class="field"><span class="field-label">Cliente</span><strong>${escapeHtml(delivery.customer)}</strong></div>
        <div class="field"><span class="field-label">Status atual</span>${statusPill(delivery)}</div>
        <div class="field full"><span class="field-label">Endereço de entrega</span><span>${escapeHtml(delivery.destination)}, ${escapeHtml(delivery.city)}</span></div>
        <div class="field"><span class="field-label">Rota / previsão</span><span>${escapeHtml(delivery.route)} · ${fullDate(delivery.expectedDate)}</span></div>
        <div class="field"><span class="field-label">Frete estimado</span><span>${currency(delivery.freightCost)}</span></div>
        <div class="field full"><span class="field-label">Itens</span><span>${delivery.items.map((item) => `${item.quantity} × ${escapeHtml(productById(item.productId)?.name || "Produto removido")}`).join("<br>")}</span></div>
        ${delivery.notes ? `<div class="field full"><span class="field-label">Observações</span><span>${escapeHtml(delivery.notes)}</span></div>` : ""}
        ${delivery.deliveredDate ? `<div class="field"><span class="field-label">Entregue em</span><span>${fullDate(delivery.deliveredDate)}</span></div>` : ""}
      </div>
      <div class="timeline">${["planned", "separating", "in_transit", "delivered"].map((stage) => `<div class="timeline-item"><i class="timeline-dot" style="${["planned", "separating", "in_transit", "delivered"].indexOf(stage) <= ["planned", "separating", "in_transit", "delivered"].indexOf(delivery.status) ? "" : "border-color:#dfe4ea"}"></i><div><strong>${statusLabels[stage]}</strong>${stage === "planned" ? `Criado em ${dateLabel(delivery.createdDate)}` : stage === "delivered" && delivery.deliveredDate ? `Confirmado em ${dateLabel(delivery.deliveredDate)}` : stage === "in_transit" ? "Saldo baixado e transporte iniciado" : stage === "separating" ? "Itens reservados para o pedido" : "Conclusão e cálculo de OTIF"}</div></div>`).join("")}</div>
      <div class="form-footer">${isOpenDelivery(delivery) ? `${can("deliveries.cancel") && ["planned", "separating"].includes(delivery.status) ? `<button class="button button-danger" type="button" data-action="cancel-delivery" data-id="${escapeHtml(delivery.id)}">Cancelar pedido</button>` : ""}${showNextAction && next ? `<button class="button button-primary" type="button" data-action="advance-delivery" data-id="${escapeHtml(delivery.id)}">${next[1]}</button>` : ""}<button class="button button-secondary" type="button" data-dialog-close>Fechar</button>` : `<button class="button button-secondary" type="button" data-dialog-close>Fechar</button>`}</div>
    `, null, "RASTREABILIDADE");
  }

  function advanceDelivery(id) {
    const delivery = state.deliveries.find((item) => item.id === id);
    if (!delivery || !isOpenDelivery(delivery)) return;
    const transitions = { planned: "separating", separating: "in_transit", in_transit: "delivered" };
    const nextStatus = transitions[delivery.status];
    if (!nextStatus) return;
    const permission = deliveryPermission(delivery.status);
    if (!can(permission)) {
      toast("Seu perfil não tem permissão para avançar esta etapa da entrega.", "error");
      return;
    }
    if (nextStatus === "in_transit") {
      const insufficient = delivery.items.find((item) => item.quantity > productById(item.productId).onHand);
      if (insufficient) {
        toast(`Saldo físico insuficiente para iniciar o trânsito. Produto: ${productById(insufficient.productId).name}.`, "error");
        return;
      }
    }
    const ok = commit((draft) => {
      const target = draft.deliveries.find((item) => item.id === id);
      if (nextStatus === "in_transit") {
        target.items.forEach((item) => {
          const product = draft.products.find((entry) => entry.id === item.productId);
          product.onHand -= item.quantity;
          draft.movements.push({ id: uid("mov"), productId: product.id, type: "Saída para entrega", quantity: item.quantity, date: dateOffset(0), reference: target.id, note: `Despacho para ${target.customer}` });
        });
      }
      if (nextStatus === "delivered") target.deliveredDate = dateOffset(0);
      target.status = nextStatus;
    }, `Entrega atualizada: ${{ separating: "em separação", in_transit: "em trânsito", delivered: "concluída" }[nextStatus]}.`);
    if (ok) dialog.close();
  }

  function cancelDelivery(id) {
    const delivery = state.deliveries.find((item) => item.id === id);
    if (!can("deliveries.cancel")) {
      toast("Seu perfil não pode cancelar entregas.", "error");
      return;
    }
    if (!delivery || ["in_transit", "delivered", "cancelled"].includes(delivery.status)) {
      toast("Este pedido não pode ser cancelado nesta etapa.", "error");
      return;
    }
    const ok = commit((draft) => {
      draft.deliveries.find((item) => item.id === id).status = "cancelled";
    }, "Pedido cancelado; reservas liberadas para o estoque disponível.");
    if (ok) dialog.close();
  }

  function showReceiveDialog(product) {
    if (!can("replenishment.receive")) {
      toast("Seu perfil não pode confirmar recebimentos de estoque.", "error");
      return;
    }
    const options = state.products.map((item) => `<option value="${item.id}" ${item.id === product.id ? "selected" : ""}>${escapeHtml(item.sku)} · ${escapeHtml(item.name)}</option>`).join("");
    showDialog("Registrar recebimento", `
      <form novalidate><div class="form-grid">
        <div class="field full"><label for="receive-product">Produto recebido</label><select id="receive-product" name="productId">${options}</select></div>
        <div class="field"><label for="receive-qty">Quantidade recebida</label><input id="receive-qty" name="quantity" type="number" min="1" step="1" required placeholder="Quantidade"></div>
        <div class="field"><label for="receive-reference">Nota fiscal / pedido</label><input id="receive-reference" name="reference" maxlength="35" placeholder="Ex.: NF-1098"></div>
        <div class="field full"><label for="receive-note">Observação</label><input id="receive-note" name="note" maxlength="150" placeholder="Detalhes do recebimento"></div>
      </div><div class="form-error" role="alert"></div>${dialogFooter("Cancelar", "Confirmar recebimento")}</form>
    `, (formData, form) => {
      const productId = String(formData.get("productId"));
      const quantity = Number(formData.get("quantity"));
      if (!productById(productId) || !Number.isInteger(quantity) || quantity <= 0) {
        const error = form.querySelector(".form-error");
        error.textContent = "Selecione o produto e informe uma quantidade inteira positiva.";
        error.classList.add("visible");
        return false;
      }
      return commit((draft) => {
        draft.products.find((item) => item.id === productId).onHand += quantity;
        draft.movements.push({ id: uid("mov"), productId, type: "Entrada", quantity, date: dateOffset(0), reference: String(formData.get("reference")).trim(), note: String(formData.get("note") || "Recebimento de compra").trim() });
      }, "Recebimento confirmado e estoque atualizado.");
    }, "REPOSIÇÃO");
  }

  function renderUserSwitcher() {
    const menu = document.getElementById("user-switcher");
    const options = Object.entries(users).map(([id, user]) => `
      <button class="user-option" type="button" role="option" aria-selected="${id === currentUserId}" data-user-option="${id}">
        <span class="account-avatar avatar-${id}">${user.initials}</span>
        <span class="user-option-copy"><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.role)}</small><small class="user-option-description">${escapeHtml(user.description)}</small></span>
        <span class="user-option-check" aria-hidden="true">${id === currentUserId ? "✓" : ""}</span>
      </button>
    `).join("");
    menu.innerHTML = `<div class="user-switcher-title">Trocar usuário de demonstração</div>${options}<div class="user-switcher-footnote">Perfis demonstrativos · sem autenticação</div>`;
  }

  function updateCurrentUserUi() {
    const user = users[currentUserId];
    document.getElementById("profile-name").textContent = user.name;
    document.getElementById("profile-avatar").textContent = user.initials;
    document.getElementById("profile-avatar").className = `account-avatar small avatar-${currentUserId}`;
    document.getElementById("profile-button").setAttribute("aria-label", `Usuário atual: ${user.name}, ${user.role}. Trocar usuário`);
    document.getElementById("sidebar-name").textContent = user.name;
    document.getElementById("sidebar-role").textContent = user.role;
    document.getElementById("sidebar-avatar").textContent = user.initials;
    document.getElementById("sidebar-avatar").className = `account-avatar avatar-${currentUserId}`;
    document.querySelectorAll(".user-option").forEach((option) => {
      const selected = option.dataset.userOption === currentUserId;
      option.setAttribute("aria-selected", String(selected));
      option.querySelector(".user-option-check").textContent = selected ? "✓" : "";
    });
  }

  function toggleUserSwitcher() {
    const menu = document.getElementById("user-switcher");
    const button = document.getElementById("profile-button");
    menu.hidden = !menu.hidden;
    button.setAttribute("aria-expanded", String(!menu.hidden));
    if (!menu.hidden) menu.querySelector(`[data-user-option="${currentUserId}"]`)?.focus();
  }

  function closeUserSwitcher(returnFocus = false) {
    const menu = document.getElementById("user-switcher");
    if (menu.hidden) return;
    menu.hidden = true;
    document.getElementById("profile-button").setAttribute("aria-expanded", "false");
    if (returnFocus) document.getElementById("profile-button").focus();
  }

  function switchUser(userId) {
    if (!users[userId]) return;
    try {
      localStorage.setItem(USER_STORAGE_KEY, userId);
    } catch (error) {
      toast(error instanceof Error ? `Não foi possível salvar o perfil: ${error.message}` : "Não foi possível salvar o perfil neste navegador.", "error");
      closeUserSwitcher();
      return;
    }
    currentUserId = userId;
    closeUserSwitcher();
    if (!can(`view.${currentRoute}`)) currentRoute = defaultRoute();
    activeQuery = "";
    document.getElementById("global-search").value = "";
    render();
    toast(`Perfil de demonstração: ${users[userId].role}.`);
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCsv(filename, rows) {
    const csv = rows.map((row) => row.map((field) => `"${String(field ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    downloadFile(filename, `\uFEFF${csv}`, "text/csv;charset=utf-8");
    toast("Arquivo CSV exportado.");
  }

  function exportStockCsv() {
    const rows = [["SKU", "Produto", "Categoria", "Fornecedor", "Estoque físico", "Reservado", "Disponível", "Estoque mínimo", "Custo unitário", "Valor físico"]];
    state.products.forEach((product) => rows.push([product.sku, product.name, product.category, product.supplier, product.onHand, reservedFor(product.id), availableFor(product), product.reorderPoint, product.unitCost.toFixed(2), (product.onHand * product.unitCost).toFixed(2)]));
    exportCsv("nexo-estoque.csv", rows);
  }

  function exportDeliveriesCsv() {
    const rows = [["Pedido", "Cliente", "Cidade", "Endereço", "Rota", "Produtos", "Data de criação", "Previsão", "Data de entrega", "Status", "Frete", "Observações"]];
    state.deliveries.forEach((delivery) => rows.push([delivery.id, delivery.customer, delivery.city, delivery.destination, delivery.route, delivery.items.map((item) => `${item.quantity} x ${productById(item.productId)?.name || "Produto removido"}`).join(" | "), delivery.createdDate, delivery.expectedDate, delivery.deliveredDate || "", statusMeta(delivery).label, Number(delivery.freightCost || 0).toFixed(2), delivery.notes || ""]));
    exportCsv("nexo-entregas.csv", rows);
  }

  function exportReplenishmentCsv() {
    const rows = [["SKU", "Produto", "Fornecedor", "Disponível", "Mínimo", "Quantidade sugerida", "Custo unitário", "Custo estimado"]];
    lowProducts().forEach((product) => {
      const target = Math.max(product.reorderPoint * 2, product.reorderPoint + 1);
      const suggested = Math.max(0, target - availableFor(product));
      rows.push([product.sku, product.name, product.supplier, availableFor(product), product.reorderPoint, suggested, product.unitCost.toFixed(2), (suggested * product.unitCost).toFixed(2)]);
    });
    exportCsv("nexo-sugestao-reposicao.csv", rows);
  }

  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = validateState(JSON.parse(String(reader.result)));
        const confirmed = window.confirm("Restaurar esta cópia substituirá os dados atuais neste navegador. Deseja continuar?");
        if (!confirmed) return;
        const normalized = JSON.parse(JSON.stringify(parsed));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        state = normalized;
        render();
        toast("Cópia de segurança restaurada.");
      } catch (error) {
        toast(error instanceof Error ? `Não foi possível restaurar: ${error.message}` : "Arquivo de cópia inválido.", "error");
      } finally {
        const input = document.getElementById("backup-file");
        if (input) input.value = "";
      }
    };
    reader.onerror = () => toast("Não foi possível ler o arquivo selecionado.", "error");
    reader.readAsText(file);
  }

  function handleAction(action, id, target) {
    const requiredPermission = {
      "new-product": "products.manage",
      "edit-product": "products.manage",
      movement: "stock.move",
      "new-delivery": "deliveries.create",
      "receive-product": "replenishment.receive",
      "request-purchase": "purchase.request",
      "review-purchase-request": "purchase.approve",
      "receive-purchase-request": "purchase.receive",
      "export-stock": "export.stock",
      "export-deliveries": "export.deliveries",
      "export-replenishment": "export.replenishment",
      "backup-json": "backup.manage",
      "import-json": "backup.manage"
    }[action];
    if (requiredPermission && !can(requiredPermission)) {
      toast("Ação não permitida para o perfil atual.", "error");
      return;
    }
    switch (action) {
      case "new-product": showProductDialog(); break;
      case "edit-product": {
        const product = productById(id);
        if (product) showProductDialog(product);
        break;
      }
      case "movement": showMovementDialog(id || ""); break;
      case "new-delivery": showDeliveryDialog(); break;
      case "add-line": addDeliveryLine(); break;
      case "remove-line": {
        const line = dialogContent.querySelectorAll(".line-item");
        if (line.length > 1) target.closest(".line-item")?.remove();
        break;
      }
      case "advance-delivery": advanceDelivery(id); break;
      case "cancel-delivery": cancelDelivery(id); break;
      case "delivery-detail": {
        const delivery = state.deliveries.find((item) => item.id === id);
        if (delivery) showDeliveryDetail(delivery);
        break;
      }
      case "receive-product": {
        const product = productById(id);
        if (product) showReceiveDialog(product);
        break;
      }
      case "request-purchase": {
        const product = productById(id);
        if (product) showPurchaseRequestDialog(product);
        break;
      }
      case "review-purchase-request": reviewPurchaseRequest(id, target.dataset.status); break;
      case "receive-purchase-request": showPurchaseReceiptDialog(id); break;
      case "export-stock": exportStockCsv(); break;
      case "export-deliveries": exportDeliveriesCsv(); break;
      case "export-replenishment": exportReplenishmentCsv(); break;
      case "backup-json": downloadFile("nexo-backup.json", JSON.stringify(state, null, 2), "application/json;charset=utf-8"); toast("Cópia de segurança exportada."); break;
      case "import-json": document.getElementById("backup-file").click(); break;
    }
  }

  document.addEventListener("click", (event) => {
    const userOption = event.target.closest("[data-user-option]");
    if (userOption) {
      event.preventDefault();
      switchUser(userOption.dataset.userOption);
      return;
    }
    if (!event.target.closest(".profile-picker")) closeUserSwitcher();
    if (event.target.closest("#profile-button")) {
      event.preventDefault();
      toggleUserSwitcher();
      return;
    }
    const target = event.target.closest("[data-route]");
    if (target) {
      event.preventDefault();
      navigate(target.dataset.route);
      return;
    }
    const actionTarget = event.target.closest("[data-action]");
    if (actionTarget) {
      event.preventDefault();
      handleAction(actionTarget.dataset.action, actionTarget.dataset.id, actionTarget);
      return;
    }
    if (event.target.closest("[data-dialog-close]")) dialog.close();
  });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());

  document.addEventListener("input", (event) => {
    if (event.target.id === "global-search" || event.target.id === "stock-search" || event.target.id === "delivery-search") {
      activeQuery = event.target.value.trim();
      if (event.target.id === "global-search") {
        if (currentRoute === "dashboard" || currentRoute === "reports" || currentRoute === "replenishment") currentRoute = "stock";
        render();
        const local = document.getElementById("stock-search") || document.getElementById("delivery-search");
        if (local) local.value = activeQuery;
      } else {
        const cursor = event.target.selectionStart;
        render();
        const input = document.getElementById(event.target.id);
        if (input) { input.focus(); input.setSelectionRange(cursor, cursor); }
      }
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.id === "stock-category") window.stockCategory = event.target.value;
    if (event.target.id === "stock-status") window.stockStatus = event.target.value;
    if (event.target.id === "delivery-status") window.deliveryStatus = event.target.value;
    if (event.target.id === "delivery-period") window.deliveryPeriod = event.target.value;
    if (["stock-category", "stock-status", "delivery-status", "delivery-period"].includes(event.target.id)) render();
    if (event.target.id === "backup-file" && event.target.files?.[0]) importBackup(event.target.files[0]);
  });

  document.getElementById("mobile-menu").addEventListener("click", () => document.getElementById("sidebar").classList.toggle("mobile-open"));
  document.querySelector(".notification-button").addEventListener("click", () => navigate("replenishment"));
  document.getElementById("user-switcher").addEventListener("keydown", (event) => {
    const options = [...document.querySelectorAll(".user-option")];
    const currentIndex = options.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      closeUserSwitcher(true);
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const nextIndex = event.key === "Home" ? 0
        : event.key === "End" ? options.length - 1
          : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
      options[nextIndex]?.focus();
    }
  });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      document.getElementById("global-search").focus();
    }
    if (event.key === "Escape") {
      closeUserSwitcher(true);
      document.getElementById("sidebar").classList.remove("mobile-open");
    }
  });

  try {
    state = loadState();
    renderUserSwitcher();
    render();
  } catch (error) {
    pageContent.innerHTML = `<section class="panel"><div class="empty-state"><strong>Não foi possível carregar os dados</strong>${escapeHtml(error instanceof Error ? error.message : "Verifique os dados locais ou restaure uma cópia JSON válida.")}<br><br><button class="button button-secondary" id="reset-demo">Carregar demonstração inicial</button></div></section>`;
    document.getElementById("reset-demo").addEventListener("click", () => {
      try {
        state = seedState();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        render();
        toast("Demonstração carregada. Os dados anteriores do navegador foram substituídos.");
      } catch (resetError) {
        toast(resetError instanceof Error ? resetError.message : "Não foi possível inicializar a demonstração.", "error");
      }
    });
  }
})();
