/* eslint-disable no-console */
// server.js — Local mock API for a Blank Street–style coffee app (CommonJS).
// Run: npm i express cors nanoid@3 && node server.js

const express = require("express");
const cors = require("cors");
const { nanoid } = require("nanoid");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

// ----------------------- In-memory stores -----------------------
const users = new Map(); // userId -> { userId, points, isMember, lastOrderId }
const orders = new Map(); // orderId -> order
const sseClientsByOrder = new Map(); // orderId -> Set(res)

// ----------------------- Geo helpers ---------------------------
const toRad = (d) => (d * Math.PI) / 180;
function haversine(lat1, lon1, lat2, lon2) {
  // meters
  const R = 6371e3;
  const φ1 = toRad(lat1),
    φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1),
    Δλ = toRad(lon2 - lon1);
  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function bearingDeg(lat1, lon1, lat2, lon2) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.cos(toRad(lon2 - lon1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
const rand = (min, max) => Math.random() * (max - min) + min;
const toCents = (n) => Math.round(n * 100);

// ----------------------- Shops (US + UK) ------------------------
function makeShops() {
  const logo =
    "https://commons.wikimedia.org/wiki/Special:FilePath/Blank%20Street%20Coffee%20logo.png";
  return [
    // NEW YORK
    {
      id: "us_ny_48th_lex",
      name: "48th & Lex",
      address: "500 Lexington Ave, New York, NY 10017",
      city: "New York",
      country: "US",
      lat: 40.75538,
      lon: -73.97456,
      imageUrl: logo,
      acceptsOrders: true,
      openingHours: { open: "06:30", close: "18:30" },
    },
    {
      id: "us_ny_church_murray",
      name: "Church & Murray",
      address: "125 Church St, New York, NY 10007",
      city: "New York",
      country: "US",
      lat: 40.7170211,
      lon: -74.0063009,
      imageUrl: logo,
      acceptsOrders: true,
      openingHours: { open: "06:30", close: "18:30" },
    },
    {
      id: "us_ny_green_room_soho",
      name: "The Green Room – Soho",
      address: "63 Spring St, New York, NY 10012",
      city: "New York",
      country: "US",
      lat: 40.7223025,
      lon: -73.9971855,
      imageUrl: logo,
      acceptsOrders: true,
      openingHours: { open: "06:30", close: "18:30" },
    },
    {
      id: "us_ny_broadway_e4",
      name: "Broadway & E 4th St",
      address: "688 Broadway, New York, NY 10012",
      city: "New York",
      country: "US",
      lat: 40.72799,
      lon: -73.99411,
      imageUrl: logo,
      acceptsOrders: true,
      openingHours: { open: "06:30", close: "18:30" },
    },
    {
      id: "us_ny_57th_5th",
      name: "57th St (near 5th Ave)",
      address: "30 W 57th St, New York, NY 10019",
      city: "New York",
      country: "US",
      lat: 40.76382,
      lon: -73.9749,
      imageUrl: logo,
      acceptsOrders: true,
      openingHours: { open: "06:30", close: "18:30" },
    },
    // LONDON
    {
      id: "uk_ldn_regent_st",
      name: "Regent Street",
      address: "315 Regent St, London W1B 2HT, UK",
      city: "London",
      country: "UK",
      lat: 51.513132,
      lon: -0.140924,
      imageUrl: logo,
      acceptsOrders: true,
      openingHours: { open: "06:30", close: "21:00" },
    },
    {
      id: "uk_ldn_st_pauls",
      name: "St Paul’s (Cheapside)",
      address: "138 Cheapside, London EC2V 6BJ, UK",
      city: "London",
      country: "UK",
      lat: 51.51452,
      lon: -0.095771,
      imageUrl: logo,
      acceptsOrders: true,
      openingHours: { open: "06:30", close: "20:00" },
    },
    {
      id: "uk_ldn_marble_arch",
      name: "Marble Arch / Old Quebec St",
      address: "1 Old Quebec St, London W1H 7AF, UK",
      city: "London",
      country: "UK",
      lat: 51.51386,
      lon: -0.158032,
      imageUrl: logo,
      acceptsOrders: true,
      openingHours: { open: "06:30", close: "20:00" },
    },
    {
      id: "uk_ldn_curzon_st",
      name: "Curzon Street (Mayfair)",
      address: "14 Curzon St, London W1J 5HN, UK",
      city: "London",
      country: "UK",
      lat: 51.506558,
      lon: -0.145623,
      imageUrl: logo,
      acceptsOrders: true,
      openingHours: { open: "06:30", close: "20:00" },
    },
    {
      id: "uk_ldn_canary_wharf",
      name: "Canary Wharf – Canada Place",
      address: "38 Canada Place (Lower Mall), London E14 5AH, UK",
      city: "London",
      country: "UK",
      lat: 51.504454,
      lon: -0.017428,
      imageUrl: logo,
      acceptsOrders: true,
      openingHours: { open: "06:30", close: "20:00" },
    },
  ];
}
const SHOPS = makeShops();

// ----------------------- Menu per shop ------------------------
function makeMenuForShop(shopId) {
  const size = {
    id: "size",
    name: "Size",
    min: 1,
    max: 1,
    choices: [
      { id: "sm", name: "Small", priceCents: 0 },
      { id: "md", name: "Medium", priceCents: 50 },
      { id: "lg", name: "Large", priceCents: 100 },
    ],
  };
  const milk = {
    id: "milk",
    name: "Milk",
    min: 1,
    max: 1,
    choices: [
      { id: "whole", name: "Whole", priceCents: 0 },
      { id: "oat", name: "Oat", priceCents: 50 },
      { id: "almond", name: "Almond", priceCents: 50 },
      { id: "skim", name: "Skim", priceCents: 0 },
    ],
  };
  const shots = {
    id: "shots",
    name: "Extra Espresso Shots",
    min: 0,
    max: 3,
    choices: [
      { id: "x1", name: "+1 Shot", priceCents: 75 },
      { id: "x2", name: "+2 Shots", priceCents: 150 },
      { id: "x3", name: "+3 Shots", priceCents: 225 },
    ],
  };
  const sweet = {
    id: "sweet",
    name: "Sweetener",
    min: 0,
    max: 2,
    choices: [
      { id: "sugar", name: "Sugar", priceCents: 0 },
      { id: "honey", name: "Honey", priceCents: 25 },
      { id: "vanilla", name: "Vanilla Syrup", priceCents: 50 },
    ],
  };

  const base = [
    {
      id: "latte",
      name: "Caffè Latte",
      description: "Rich espresso with steamed milk",
      basePriceCents: toCents(4.0),
      optionGroups: [size, milk, shots, sweet],
    },
    {
      id: "americano",
      name: "Americano",
      description: "Espresso with hot water",
      basePriceCents: toCents(3.5),
      optionGroups: [size, sweet],
    },
    {
      id: "coldbrew",
      name: "Cold Brew",
      description: "Slow-steeped cold brew over ice",
      basePriceCents: toCents(4.25),
      optionGroups: [size, sweet],
    },
    {
      id: "matcha",
      name: "Iced Matcha Latte",
      description: "Ceremonial matcha with milk over ice",
      basePriceCents: toCents(4.75),
      optionGroups: [size, milk, sweet],
    },
    {
      id: "croissant",
      name: "Butter Croissant",
      description: "Flaky, buttery pastry",
      basePriceCents: toCents(3.25),
      optionGroups: [],
    },
  ];

  const items = base.map((it) => ({
    ...it,
    id: `${it.id}_${shopId}`,
    basePriceCents: it.basePriceCents + Math.round(rand(-25, 25)),
  }));

  if (Math.random() > 0.5) {
    items.push({
      id: `seasonal_${shopId}`,
      name: "Seasonal Pumpkin Spice Latte",
      description: "Espresso, milk, pumpkin spice",
      basePriceCents: toCents(5.25),
      optionGroups: [size, milk, sweet],
    });
  }
  return items;
}
const MENUS = Object.fromEntries(
  SHOPS.map((s) => [s.id, makeMenuForShop(s.id)])
);

// ----------------------- Order totals ------------------------
function computeItemTotalCents(menuItem, selected, qty) {
  let extras = 0;
  for (const group of menuItem.optionGroups || []) {
    const sel = selected && selected[group.id] ? selected[group.id] : [];
    if (sel.length < group.min || sel.length > group.max) {
      throw new Error(`Group ${group.name}: select ${group.min}-${group.max}`);
    }
    const priceMap = new Map(group.choices.map((c) => [c.id, c.priceCents]));
    for (const choiceId of sel) {
      const add = priceMap.get(choiceId);
      if (typeof add !== "number")
        throw new Error(`Invalid choice ${choiceId} for group ${group.name}`);
      extras += add;
    }
  }
  return (menuItem.basePriceCents + extras) * qty;
}
function computeOrderTotalsCents(shopId, itemsPayload) {
  const menu = MENUS[shopId] || [];
  const byId = new Map(menu.map((i) => [i.id, i]));
  let subtotal = 0;
  const normalizedItems = itemsPayload.map((raw) => {
    const item = byId.get(raw.itemId);
    if (!item) throw new Error(`Unknown item ${raw.itemId}`);
    const qty = Math.max(1, parseInt(raw.quantity || 1, 10));
    const selected = raw.selected || {};
    const line = computeItemTotalCents(item, selected, qty);
    subtotal += line;
    return { itemId: item.id, quantity: qty, selected };
  });
  const tax = Math.round(subtotal * 0.1);
  const total = subtotal + tax;
  return { normalizedItems, subtotal, tax, total };
}
function ensureUser(userId) {
  if (!users.has(userId))
    users.set(userId, {
      userId,
      points: 0,
      isMember: false,
      lastOrderId: null,
    });
  return users.get(userId);
}
function sendSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}
function broadcastOrder(id) {
  const ord = orders.get(id);
  const set = sseClientsByOrder.get(id);
  if (set) for (const res of set) sendSse(res, "update", ord);

  // NEW: also broadcast over WebSocket
  wsBroadcast(id, "update", ord);
}

// ----------------------- Delivery simulation ------------------
const driverSims = new Map(); // orderId -> { timer, startedAt, durationSec, start, end, speedMps }
const interpolate = (a, b, t) => a + (b - a) * t;

function broadcastLocation(orderId, courier) {
  const set = sseClientsByOrder.get(orderId);
  if (set)
    for (const res of set) sendSse(res, "location", { orderId, courier });

  // NEW: WS broadcast
  wsBroadcast(orderId, "location", { orderId, courier });
}

function startDeliverySimulation(
  order,
  { speedMps = 5.0, simSpeed = 2.0 } = {}
) {
  const shop = SHOPS.find((s) => s.id === order.shopId);
  const dest = order.deliveryTo;
  if (!shop || !dest) return;

  const start = { lat: shop.lat, lon: shop.lon };
  const end = { lat: dest.lat, lon: dest.lon };
  const distance = haversine(start.lat, start.lon, end.lat, end.lon); // meters

  let durationSec = Math.max(45, Math.min(600, distance / speedMps)); // clamp 45s..10m
  durationSec = durationSec / simSpeed; // speed up for demo

  const startedAt = Date.now();
  const timer = setInterval(() => {
    const elapsed = (Date.now() - startedAt) / 1000;
    const t = Math.min(1, elapsed / durationSec);

    const lat = interpolate(start.lat, end.lat, t);
    const lon = interpolate(start.lon, end.lon, t);
    const eta = Math.max(0, Math.round(durationSec - elapsed));
    const bear = bearingDeg(lat, lon, end.lat, end.lon);

    order.courier = {
      location: { lat, lon },
      bearing: bear,
      etaSeconds: eta,
      progress: t,
    };
    broadcastLocation(order.id, order.courier);

    if (t >= 1) {
      clearInterval(timer);
      driverSims.delete(order.id);
      advanceOrder(order.id, { status: "delivered" });
    }
  }, 1000);

  driverSims.set(order.id, {
    timer,
    startedAt,
    durationSec,
    start,
    end,
    speedMps,
  });
}

// ------------------------- Routes ---------------------------
// Health
app.get("/health", (req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);

// Shops
app.get("/shops", (req, res) => res.json(SHOPS));

// Nearest shop helper
app.get("/shops/nearest", (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (Number.isNaN(lat) || Number.isNaN(lon))
    return res.status(400).json({ error: "lat/lon required" });
  const sorted = [...SHOPS].sort(
    (a, b) =>
      haversine(lat, lon, a.lat, a.lon) - haversine(lat, lon, b.lat, b.lon)
  );
  res.json({
    shop: sorted[0],
    distanceMeters: Math.round(
      haversine(lat, lon, sorted[0].lat, sorted[0].lon)
    ),
  });
});

// Menu
app.get("/shops/:id/menu", (req, res) => {
  const menu = MENUS[req.params.id];
  if (!menu) return res.status(404).json({ error: "shop not found" });
  res.json(menu);
});

// Create order
// Body: {
//   userId, shopId, items:[{itemId,quantity,selected:{groupId:[choiceId]}}],
//   scheduledAt?, deliveryTo?: { lat, lon }
// }
// GET /users/:userId/orders
app.get('/users/:userId/orders', (req, res) => {
  const { userId } = req.params;
  const list = Array.from(orders.values())
    .filter(o => o.userId === userId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  res.status(200).json(list); // <-- just the list
});

app.post("/orders", (req, res) => {
  try {
    const {
      userId = "demo-user",
      shopId,
      items = [],
      scheduledAt = null,
      deliveryTo = null,
    } = req.body || {};
    if (!shopId) return res.status(400).json({ error: "shopId required" });
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: "items required" });
    const user = ensureUser(userId);

    const { normalizedItems, subtotal, tax, total } = computeOrderTotalsCents(
      shopId,
      items
    );
    const orderId = "ord_" + nanoid(10);
    const order = {
      id: orderId,
      userId,
      shopId,
      createdAt: new Date().toISOString(),
      scheduledAt,
      deliveryTo, // if present, we’ll simulate delivery
      items: normalizedItems,
      subtotalCents: subtotal,
      taxCents: tax,
      totalCents: total,
      status: "pending", // pending -> preparing -> ready -> out_for_delivery -> delivered
      paymentStatus: "none", // none -> requires_confirmation -> succeeded
      courier: null, // { location, bearing, etaSeconds, progress }
    };
    orders.set(orderId, order);
    user.lastOrderId = orderId;

    // Simulate status progression
    const prepDelay = 10 * 1000; // -> preparing
    const readyDelay = 30 * 1000; // -> ready
    setTimeout(() => advanceOrder(orderId, { status: "preparing" }), prepDelay);
    setTimeout(() => advanceOrder(orderId, { status: "ready" }), readyDelay);

    // If this is a delivery, dispatch shortly after ready
    if (deliveryTo) {
      setTimeout(
        () => advanceOrder(orderId, { status: "out_for_delivery" }),
        readyDelay + 3000
      );
    }

    return res.status(201).json({ order });
  } catch (e) {
    console.error(e);
    return res.status(400).json({ error: String(e.message || e) });
  }
});

// Get order
app.get("/orders/:id", (req, res) => {
  const ord = orders.get(req.params.id);
  if (!ord) return res.status(404).json({ error: "order not found" });
  res.json(ord);
});

// SSE stream for an order (status + location)
app.get("/orders/:id/stream", (req, res) => {
  const { id } = req.params;
  const ord = orders.get(id);
  if (!ord) return res.status(404).json({ error: "order not found" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  if (!sseClientsByOrder.has(id)) sseClientsByOrder.set(id, new Set());
  sseClientsByOrder.get(id).add(res);

  // initial snapshot
  sendSse(res, "snapshot", ord);

  // keepalive pings
  const ping = setInterval(
    () => sendSse(res, "ping", { t: Date.now() }),
    15000
  );

  req.on("close", () => {
    clearInterval(ping);
    const set = sseClientsByOrder.get(id);
    if (set) set.delete(res);
  });
});

// Optional: latest courier-only endpoint
app.get("/orders/:id/courier", (req, res) => {
  const ord = orders.get(req.params.id);
  if (!ord) return res.status(404).json({ error: "order not found" });
  if (!ord.courier) return res.status(404).json({ error: "not in delivery" });
  res.json(ord.courier);
});

// Optional: manual dispatch trigger (if you want to start delivery yourself)
app.post("/orders/:id/dispatch", (req, res) => {
  const ord = orders.get(req.params.id);
  if (!ord) return res.status(404).json({ error: "order not found" });
  advanceOrder(ord.id, { status: "out_for_delivery" });
  res.json({ ok: true });
});

// Status change + maybe start delivery sim
function advanceOrder(id, patch) {
  const cur = orders.get(id);
  if (!cur) return;
  const next = { ...cur, ...patch };
  orders.set(id, next);
  broadcastOrder(id);

  if (patch.status === "out_for_delivery" && next.deliveryTo) {
    startDeliverySimulation(next, { speedMps: 5.0, simSpeed: 2.0 }); // tweak knobs here
  }
}

// ------------------------- Payments (mock) -------------------
app.post("/payments/intent/:orderId", (req, res) => {
  const ord = orders.get(req.params.orderId);
  if (!ord) return res.status(404).json({ error: "order not found" });
  ord.paymentStatus = "requires_confirmation";
  orders.set(ord.id, ord);
  const clientSecret = `pi_${ord.id}_secret_${nanoid(8)}`;
  res.json({ clientSecret, orderId: ord.id });
});

app.post("/payments/confirm/:orderId", (req, res) => {
  const ord = orders.get(req.params.orderId);
  if (!ord) return res.status(404).json({ error: "order not found" });
  ord.paymentStatus = "succeeded";
  orders.set(ord.id, ord);

  const user = ensureUser(ord.userId);
  const dollars = Math.floor(ord.totalCents / 100);
  user.points += dollars * 10;

  broadcastOrder(ord.id);
  res.json({ ok: true, order: ord, points: user.points });
});

// --------------------------- Loyalty ------------------------
app.get("/loyalty/:userId", (req, res) => {
  const u = ensureUser(req.params.userId);
  res.json({ userId: u.userId, points: u.points, isMember: u.isMember });
});
app.post("/loyalty/:userId/add", (req, res) => {
  const u = ensureUser(req.params.userId);
  const pts = parseInt(req.body.points || 0, 10);
  u.points += Math.max(0, pts);
  res.json({ userId: u.userId, points: u.points, isMember: u.isMember });
});

// ---------------------- "Your usual" ------------------------
app.get("/users/:userId/last-order", (req, res) => {
  const u = ensureUser(req.params.userId);
  const lastId = u.lastOrderId;
  if (!lastId) return res.status(404).json({ error: "no last order" });
  res.json(orders.get(lastId));
});

// ------------------------- Start ----------------------------
// --- at the bottom, replace app.listen with:
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/ws" });

// Map: orderId -> Set<WebSocket>
const wsClientsByOrder = new Map();

function wsSend(ws, type, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, data }));
  }
}
function wsBroadcast(orderId, type, data) {
  const set = wsClientsByOrder.get(orderId);
  if (!set) return;
  for (const ws of set) wsSend(ws, type, data);
}

// Simple heartbeat so dead sockets get closed
wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "subscribe" && msg.orderId) {
        const id = String(msg.orderId);
        ws.orderId = id;
        if (!wsClientsByOrder.has(id)) wsClientsByOrder.set(id, new Set());
        wsClientsByOrder.get(id).add(ws);

        // send initial snapshot
        const ord = orders.get(id);
        if (ord) wsSend(ws, "snapshot", ord);
        else wsSend(ws, "error", { message: "order not found" });
      } else {
        wsSend(ws, "error", { message: "bad payload" });
      }
    } catch {
      wsSend(ws, "error", { message: "bad json" });
    }
  });

  ws.on("close", () => {
    const id = ws.orderId;
    if (id && wsClientsByOrder.has(id)) wsClientsByOrder.get(id).delete(ws);
  });
});

// terminate dead clients
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// Start HTTP+WS server
server.listen(PORT, () => {
  console.log(`✅ coffee-backend running at http://localhost:${PORT}`);
  console.log(`   WS endpoint: ws://localhost:${PORT}/ws`);
});
