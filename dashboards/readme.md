# API Gateway

Single entry point for frontend and external API requests. Responsible for auth, routing, and common logic.

## Features

- JWT validation and tenant context extraction
- Role-based access filtering
- Proxy to internal services (REST/gRPC)
- Rate limiting and logging
- Service discovery or static routing

## Responsibilities

- Validate incoming requests (JWT, headers)
- Route to appropriate microservice
- Add tenant_id to forwarded requests

## Technologies

- NestJS, Redis (for rate limiting), REST or gRPC proxy
