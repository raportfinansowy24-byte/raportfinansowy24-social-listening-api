# RaportFinansowy24 Social Listening API

Secure Bun API bridge between the social-listening agent and Supabase.

## Endpoints
GET /health
GET /v1/opportunities
GET /v1/stats
POST /v1/opportunities
POST /v1/runs

All /v1 endpoints require x-agent-api-key.

## Railway variables
SUPABASE_URL=https://ddishvpzbmjmbtziovgz.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-secret-service-role-key
AGENT_API_KEY=your-secret-agent-key

Never commit secrets.
