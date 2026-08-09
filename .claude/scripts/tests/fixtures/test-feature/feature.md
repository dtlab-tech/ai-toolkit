# Feature: TEST-001 — JWT Authentication

## Overview

Add user authentication to the API using JSON Web Tokens (JWT). Users register with an email and password, log in to receive a signed access token, and present that token on protected endpoints. A token refresh flow is also supported.

## Goals

- Allow new users to register with a unique email address and a hashed password.
- Allow registered users to log in and receive a short-lived JWT access token and a long-lived refresh token.
- Allow clients to exchange a valid refresh token for a new access token without re-entering credentials.
- Protect designated API routes so that only requests bearing a valid JWT are accepted.

## Non-Goals

- OAuth / social login is out of scope.
- Role-based access control beyond "authenticated vs. anonymous" is out of scope.

## Actors

- **Anonymous user** — not yet authenticated; may register or log in.
- **Authenticated user** — holds a valid JWT; may call protected endpoints and refresh tokens.

## Use Cases

### UC-01: User Registration
An anonymous user submits an email and password. The system validates the input, checks the email is not already taken, hashes the password, persists a new user record, and returns a 201 response.

### UC-02: User Login
A registered user submits their email and password. The system validates credentials, signs a JWT access token (15-minute expiry) and a refresh token (7-day expiry), persists the refresh token, and returns both tokens.

### UC-03: Token Refresh
An authenticated client presents a valid refresh token. The system validates the token, rotates it (invalidates the old one, issues a new one), and returns a fresh access token and new refresh token.

## Acceptance Criteria

| ID    | Priority | User Story | Description |
|-------|----------|-----------|-------------|
| AC-01 | Must     | US-01      | POST /auth/register returns 201 with user id and email on valid input |
| AC-02 | Must     | US-01      | POST /auth/register returns 409 when email already exists |
| AC-03 | Must     | US-01      | Passwords are stored as bcrypt hashes; plain text is never persisted |
| AC-04 | Must     | US-02      | POST /auth/login returns 200 with accessToken and refreshToken on valid credentials |
| AC-05 | Must     | US-02      | POST /auth/login returns 401 on invalid credentials |
| AC-06 | Must     | US-03      | POST /auth/refresh returns 200 with a new accessToken and rotated refreshToken |
| AC-07 | Must     | US-03      | POST /auth/refresh returns 401 when refresh token is expired or invalid |
