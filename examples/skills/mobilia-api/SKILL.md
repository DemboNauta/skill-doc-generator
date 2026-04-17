---
name: mobilia-api
description: Integration with Mobilia Public API — a RESTful CRM for real estate agencies. Use when working with Mobilia's inmuebles (properties), clientes (contacts/leads), agentes (agents), agenda (visits), campanas (campaigns), grupos, cuentas, or estados administrativos.
triggers:
  - User mentions "Mobilia", "mobiliagestion", or "CRM inmobiliario"
  - Code imports or calls https://api.mobiliagestion.es
  - User asks about inmuebles, clientes, agentes, agenda visitas in the context of this API
  - User asks to integrate with a real estate CRM named Mobilia
---

# Mobilia Public API

RESTful API for integrating with the Mobilia real estate CRM. Base URL: `https://api.mobiliagestion.es/api/v1`

## Authentication

OAuth 2.0 with Bearer Token. Get token first:

```http
POST /api/v1/token
Content-Type: application/json

{
  "client_id": "<CLIENT_ID>",
  "client_secret": "<CLIENT_SECRET>"
}
```

Use in all subsequent requests:
```
Authorization: Bearer <token>
```

Each endpoint requires specific OAuth scopes (listed below).

---

## Pagination

Paginated endpoints use these query params:
- `NumeroPagina` — page number (min 1)
- `TamanoPagina` — page size (max 100)
- `OrdenarPor` — sort field (enum per resource)
- `Ordenacion` — sort direction (`Asc` / `Desc`)

---

## Endpoints by Resource

### Inmuebles (Properties)
**Rate limit: 10 requests/minute**
Scope: `inmuebles_read` (standard), `inmueblestodos_read` (all)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/inmuebles` | Available properties published on web (for sale/rent/transfer) |
| GET | `/inmuebles/todos` | All properties including off-market (requires `inmueblestodos_read`) |
| GET | `/inmuebles/desactivados` | Properties not available or not published |
| GET | `/inmuebles/{referencia}` | Single property by reference |

**Key filters for `/inmuebles`:**
- `Busqueda` — search by reference text
- `TiposOperacion` — filter by operation type (Venta/Alquiler/Traspaso)
- `IdGrupos` / `IdExcluyeGrupos` — include/exclude property groups
- `IdCuentas` / `IdExcluyeCuentas` — filter by account
- `FechaUltimaModificacion` — ISO 8601 date, returns properties modified after this date
- `PrecioVentaDesde` — minimum sale price
- `IdAgente` — agent responsible for sale/rent/transfer/capture
- `IdPropietario` — filter by owner ID
- `MarcaAguaImagenes` — include watermark on images (default `true`)
- `DescripcionImagenes` — include image descriptions (default `false`)

**Extra filters for `/inmuebles/todos`:**
- `Disponible` — filter available properties (default `true`)
- `PublicarEnWeb` — filter web-published (default `true`)
- `IdEstadosAdministrativos` — filter by administrative state IDs

---

### Clientes (Contacts / Leads)
Scope: `clientes_read`, `clientes_create`, `clientes_update`, `clientes_delete`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/clientes` | List clients with filters |
| POST | `/clientes` | Create a new client |
| GET | `/clientes/{referencia}` | Get client by reference ID |
| PUT | `/clientes/{referencia}` | Update client by reference ID |
| DELETE | `/clientes/{referencia}` | Delete client (409 if conflict) |
| GET | `/clientes/by-email?email=` | Get client by email |

**Key filters for `/clientes`:**
- `TiposCliente` — filter by client type enum
- `IdGrupos` / `IdExcluyeGrupos` — include/exclude client groups
- `IdCampana` — filter by campaign ID
- `UltimoContactoDesde` / `UltimoContactoHasta` — last contact date range (`YYYY-MM-DD HH:MM:SS`)
- `FechaDesde` / `FechaHasta` — registration date range
- `IdCuenta` — filter by account ID
- `Busqueda` — search by name or email

---

### Agentes (Agents)
Scope: `agentes_read` — returns **active agents only**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/agentes` | List active agents (paginated) |
| GET | `/agentes/{idAgente}` | Get agent by ID |
| GET | `/agentes/by-email?email=` | Get agent by email |

Filters: `Busqueda` (name, email, or agent ID text search)

---

### Agenda (Visits)
Scope: `visitaspendientes_read`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/agenda/visitas?idAgente=&fecha=` | Pending visits for an agent on a given date |

`fecha` format: ISO 8601 datetime

---

### Campanas (Campaigns)
Scope: `campanas_read`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/campanas` | List all agency campaigns |

---

### Grupos (Groups)
Scope: `grupos_read`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/grupos/clientes` | Client groups |
| GET | `/grupos/inmuebles` | Property groups |

Use these IDs in `IdGrupos` / `IdExcluyeGrupos` filters on clientes and inmuebles.

---

### Cuentas (Accounts)
Scope: `cuentas_read`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/cuentas` | List all agency accounts |

Use these IDs in `IdCuenta` / `IdCuentas` filters.

---

### Estados Administrativos
Scope: `estadosadministrativos_read`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/estadosadministrativos` | List all administrative states |

Use these IDs in `IdEstadosAdministrativos` filter on `/inmuebles/todos`.

---

### Aplicaciones Clientes
No scope required.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/aplicaciones-cliente/current` | Info about the current client application |

---

## Common Patterns

### Sync modified properties since a given date
```http
GET /inmuebles?FechaUltimaModificacion=2024-01-01T00:00:00Z&NumeroPagina=1&TamanoPagina=100
```

### Get all properties (including off-market) with specific admin state
```http
GET /inmuebles/todos?Disponible=false&IdEstadosAdministrativos=3&NumeroPagina=1&TamanoPagina=50
```

### Find client by email before creating to avoid duplicates
```http
GET /clientes/by-email?email=user@example.com
```
If 404/empty, then `POST /clientes` with `ClienteCrearRequest` body.

### List all active agents, then filter by name
```http
GET /agentes?Busqueda=Juan&NumeroPagina=1&TamanoPagina=20
```

### Check agent's agenda for today
```http
GET /agenda/visitas?idAgente=42&fecha=2024-04-17T00:00:00Z
```

---

## Error Handling
- `204 No Content` — successful DELETE
- `409 Conflict` — DELETE on a client that cannot be removed (response body has details)
- Always check OAuth scopes; missing scope returns 401/403

## Notes
- All list endpoints return only **active** records unless using `/todos` or `/desactivados` variants
- Inmuebles endpoints have a hard rate limit of **10 requests/minute** — implement backoff
- Dates in filters use `YYYY-MM-DD HH:MM:SS` format; `FechaUltimaModificacion` uses ISO 8601
