# LaunderGraph Backend API Documentation

Base URL: http://127.0.0.1:8000
Swagger UI: http://127.0.0.1:8000/docs

## Endpoints

### GET /health
Confirms the backend is running.
Response: `{"status": "ok"}`

### GET /transactions
Returns all flagged transactions from PostgreSQL.
Response: `{"count": <int>, "transactions": [...]}`

### GET /transactions/{transaction_id}
Returns a single transaction by its transaction_id (integer).

### GET /summary
Returns summary counts.
Response: `{"total_flagged": <int>, "high_risk": <int>, "medium_risk": <int>}`

### GET /investigations
Returns all investigation records.

### GET /investigations/{id}
Returns a single investigation record by its database id.

### POST /investigations
Creates a new investigation record.
Request body:
```json
{
  "transaction_id": 0,
  "status": "UNDER_REVIEW",
  "notes": "Optional notes here"
}
```
Allowed status values: `OPEN`, `UNDER_REVIEW`, `CLOSED`

### PUT /investigations/{id}
Updates an existing investigation's status and/or notes.
Request body:
```json
{
  "status": "CLOSED",
  "notes": "Updated notes"
}
```