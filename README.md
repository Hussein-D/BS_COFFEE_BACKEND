# coffee-backend (Local Mock API)

A **complete local backend** for a Blank Street–style Flutter app. It covers:

- **Shops** (near Cupertino, CA) and **nearest shop** helper
- **Menus** with **option groups** (min/max rules) and option pricing
- **Orders** (server-side price validation) + **status progression** (`pending → preparing → ready`)
- **Real-time updates via SSE** (`/orders/:id/stream`)
- **Payments (mock)**: create intent + confirm, updates `paymentStatus`
- **Loyalty**: simple points wallet; auto-earn on payment confirm
- **“Your usual”**: returns last order for a user

> Data is in-memory and resets on each start. Perfect for interview demos.

## Quick start
```bash
cd coffee-backend
npm i
npm start
# server -> http://localhost:4000
```

## Endpoints
### Health
- `GET /health` → `{ ok: true }`

### Shops
- `GET /shops` → list of shops around **Cupertino, CA**
- `GET /shops/nearest?lat={}&lon={}` → nearest shop to a coordinate

### Menu
- `GET /shops/:id/menu` → menu items with option groups and extra pricing

### Orders
- `POST /orders`
  ```jsonc
  {
    "userId": "demo-user",
    "shopId": "shop_1",
    "items": [
      {
        "itemId": "latte_shop_1",
        "quantity": 2,
        "selected": { "size": ["md"], "milk": ["oat"], "shots": ["x1"], "sweet": ["vanilla"] }
      }
    ],
    "scheduledAt": null
  }
  ```
  Returns `{ order }`. Validates min/max for option groups and computes totals.
  Simulates status updates: **preparing (10s)** → **ready (30s)** after creation.

- `GET /orders/:id` → current snapshot
- `GET /orders/:id/stream` (SSE) → real-time updates. Example (curl):
  ```bash
  curl -N http://localhost:4000/orders/ord_xxx/stream
  ```

### Payments (mock)
- `POST /payments/intent/:orderId` → `{ clientSecret }` and sets `paymentStatus = "requires_confirmation"`
- `POST /payments/confirm/:orderId` body: `{ "clientSecret": "..." }`
  - Marks `paymentStatus = "succeeded"` and **awards loyalty points**.

### Loyalty
- `GET /loyalty/:userId` → `{ userId, points, isMember }`
- `POST /loyalty/:userId/add` body: `{ "points": 50 }`

### “Your usual”
- `GET /users/:userId/last-order` → last order snapshot for quick re-order

## Notes for Flutter wiring
- `Endpoints.shops = '/shops'`
- `Endpoints.menu(shopId) = '/shops/{shopId}/menu'`
- `Endpoints.placeOrder = '/orders'`
- `Endpoints.order(id) = '/orders/{id}'`
- `Endpoints.paymentIntent(orderId) = '/payments/intent/{orderId}'`
- (Optional stream) `/orders/{id}/stream` for live status updates via SSE

## Testing quickly
1. Get shops:
   ```bash
   curl http://localhost:4000/shops
   ```
2. Get a menu:
   ```bash
   curl http://localhost:4000/shops/shop_1/menu
   ```
3. Place an order:
   ```bash
   curl -X POST http://localhost:4000/orders      -H 'Content-Type: application/json'      -d '{"userId":"demo-user","shopId":"shop_1","items":[{"itemId":"latte_shop_1","quantity":1,"selected":{"size":["md"],"milk":["oat"],"shots":["x1"]}}]}'
   ```
4. Stream updates (status changes to **preparing** and then **ready**):
   ```bash
   curl -N http://localhost:4000/orders/ORD_ID/stream
   ```
5. Create a mock payment intent, then confirm it:
   ```bash
   curl -X POST http://localhost:4000/payments/intent/ORD_ID
   curl -X POST http://localhost:4000/payments/confirm/ORD_ID -H 'Content-Type: application/json' -d '{"clientSecret":"..."}'
   ```

## License
MIT
