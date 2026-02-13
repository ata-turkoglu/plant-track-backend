# PlantTrack Backend

Node.js + TypeScript + Express + Knex + PostgreSQL backend.

## Kurulum

1. Bagimliliklari kur:

```bash
cd backend
npm install
```

2. Ortam degiskenlerini `backend/.env` dosyasinda doldur.

3. JWT secret uret (onerilen):

```bash
openssl rand -base64 64
```

4. Migration calistir:

```bash
npm run migrate:latest
```

5. Super user olustur:

```bash
npm run superuser:create
```

6. Development server:

```bash
npm run dev
```

Not: `npm run dev` artik `nodemon` kullanir. Eski alternatif: `npm run dev:ts-node-dev`.

`DB_NAME` varsayilan hedefi: `plant_track`

## API Ozeti

Base URL: `http://localhost:4000/api/v1`

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/forgot-password`
- `GET /users/me`
- `PATCH /users/me`
- `GET /users` (admin)
- `GET /users/:id` (admin)
- `PATCH /users/:id` (admin)
- `DELETE /users/:id` (admin, soft delete)
- `GET /products`
- `POST /products`
- `GET /organizations`
- `POST /organizations` (admin)
- `PATCH /organizations/:id` (admin)
- `DELETE /organizations/:id` (admin, soft delete)
- `GET /organization-units`
- `POST /organization-units` (admin)
- `PATCH /organization-units/:id` (admin)
- `DELETE /organization-units/:id` (admin, soft delete)
- `GET /warehouses`
- `POST /warehouses`
- `POST /stock/transactions`
- `POST /stock/transfers`
- `GET /stock/on-hand?productId=&warehouseId=`
- `GET /stock/ledger?productId=&warehouseId=&from=&to=`

## Inventory modeli

- Stok miktari urun satirinda tutulmaz; stok tamamen `stock_transactions` kayitlarindan hesaplanir.
- `IN`, `OUT`, `ADJUST` islemleri tek hareket kaydi olusturur.
- `TRANSFER` islemi atomik olarak iki kayit olusturur:
  - kaynak depoda `direction=OUT`
  - hedef depoda `direction=IN`
- Negatif stok varsayilan olarak engellenir. Ortam degiskeni ile acilabilir:
  - `ALLOW_NEGATIVE_STOCK=true`
- On-hand hesaplama mantigi:
  - `SUM(CASE WHEN direction='IN' THEN quantity ELSE -quantity END)`

## Inventory tablolari

- `products`
- `organizations`
- `organization_units` (parent-child hiyerarsi)
- `warehouses`
- `warehouse_locations` (opsiyonel lokasyon master)
- `stock_transactions`

Migration:

```bash
npm run migrate:latest
```

Test:

```bash
npm test
```

## Full curl flow

```bash
BASE_URL="http://localhost:4000/api/v1"

# 1) Register
REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user1@example.com",
    "password": "Str0ng!Pass123",
    "firstName": "User",
    "lastName": "One"
  }')

echo "$REGISTER_RESPONSE"
ACCESS_TOKEN=$(echo "$REGISTER_RESPONSE" | jq -r '.data.tokens.accessToken')
REFRESH_TOKEN=$(echo "$REGISTER_RESPONSE" | jq -r '.data.tokens.refreshToken')

# 2) Login
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user1@example.com",
    "password": "Str0ng!Pass123"
  }')

echo "$LOGIN_RESPONSE"
ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.tokens.accessToken')
REFRESH_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.tokens.refreshToken')

# 3) Me
curl -s "$BASE_URL/users/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# 4) Me update
curl -s -X PATCH "$BASE_URL/users/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Updated",
    "lastName": "Name"
  }'

# 5) Refresh token
REFRESH_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}")

echo "$REFRESH_RESPONSE"
ACCESS_TOKEN=$(echo "$REFRESH_RESPONSE" | jq -r '.data.accessToken')
REFRESH_TOKEN=$(echo "$REFRESH_RESPONSE" | jq -r '.data.refreshToken')

# 6) Logout
curl -s -X POST "$BASE_URL/auth/logout" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}"

# 7) Admin endpoints (admin access token gerektirir)
ADMIN_TOKEN="<admin_access_token>"
TARGET_USER_ID="<user_id>"

curl -s "$BASE_URL/users?page=1&limit=20" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

curl -s "$BASE_URL/users/$TARGET_USER_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

curl -s -X PATCH "$BASE_URL/users/$TARGET_USER_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role":"admin","isActive":true}'

curl -s -X DELETE "$BASE_URL/users/$TARGET_USER_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Otomatik script: `backend/docs/curl-examples.sh`

## Frontend entegrasyonu

Frontend tarafinda hazir servisler:

- `frontend/src/services/api.ts`
- `frontend/src/services/authApi.ts`

Temel kullanim:

```ts
import { authApi } from './services/authApi';

await authApi.register({
  email: 'user1@example.com',
  password: 'Str0ng!Pass123',
  firstName: 'User',
  lastName: 'One',
});

const me = await authApi.getMe();
console.log(me.email);
```

## Guvenlik Notlari

- Sifreler `bcryptjs` ile hashlenir.
- Access + refresh token modeli kullanilir.
- Refresh token veritabaninda hashli saklanir.
- Refresh token rotate edilir (yenilemede eski token revoke olur).
- Role-based authorization (`admin`, `user`) uygulanir.
