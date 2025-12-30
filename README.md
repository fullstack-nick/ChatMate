# ChatMate

Real-time web messenger for direct and group conversations with session-aware device trust.

## Overview

ChatMate is a full-stack messaging app for users who want lightweight, real-time chats with simple account management. The React client handles authentication and chat workflows, while the Express + MongoDB backend stores users, chats, and messages. A key differentiator in this codebase is session tracking: each login becomes a session ID, devices can be trusted, and refresh tokens rotate with reuse detection.

## Features

### Core messaging

- Direct 1:1 chats and group chats with optional group names.
- Chat list sorted by recent activity with last-message previews.
- Send, edit (author-only), and delete messages for everyone.
- Infinite-scroll message history with cursor-based pagination.
- Real-time updates for new messages, edits, deletions, chat creation, and chat deletion via Socket.io.

### Authentication and sessions

- Username/password registration with client-side validation rules.
- Login with short-lived JWT access tokens and refresh tokens stored in httpOnly cookies.
- "Trust this device" option that controls refresh token eligibility.
- Password reset by username that revokes all refresh tokens and forces active sessions to log out.

### Device management

- View active devices tied to your account.
- Trusted devices can mark other devices as trusted or log them out remotely.

### UX flow helpers

- Protected routes with token verification and automatic refresh for trusted devices.
- Toast notifications and loading indicators for async actions.

## Tech Stack

### Frontend

- **React 19** for the UI component model and stateful interactions.
- **React Router 7** for client-side routing and protected routes.
- **TanStack Query** for server-state caching, pagination, and optimistic updates.
- **Tailwind CSS v4** (via the Vite plugin) plus custom CSS for styling.
- **Framer Motion** for animated loaders and transitions.
- **Axios** for REST API calls and **socket.io-client** for realtime events.
- **React Toastify** for user-facing notifications.
- **Lucide React** and **Font Awesome** for icons.
- **Vite** as the build tool and dev server.

### Backend

- **Node.js + Express 5** for the REST API and HTTP server.
- **MongoDB + Mongoose** for data persistence and schema modeling.
- **Socket.io** for realtime chat events and session notifications.
- **jsonwebtoken** for access/refresh token issuing and verification.
- **bcrypt** for password hashing.
- **cookie-parser** to read refresh tokens from httpOnly cookies.
- **cors** with an allowlist strategy for cross-origin requests.
- **dotenv** for environment variable loading.
- **date-fns** and **uuid** for request/error logging.

### How it fits together

- REST endpoints handle auth, chat creation, message CRUD, and device management.
- Socket.io broadcasts chat and message changes, plus session events like forced logout and trust updates.
- Access tokens are verified by `GET /verifyAccess` and are also required for Socket.io connections; refresh tokens rotate via `GET /refresh`.

## Architecture / Project Structure

Notable modules and responsibilities:

- `client/src/components` contains auth screens, the main chat layout, and settings UI.
- `client/src/api` centralizes REST and Socket.io clients, driven by Vite env vars.
- `client/src/hooks` and `client/src/context` manage auth state, persistence, and refresh flow.
- `server/routes` maps REST endpoints to `server/controllers`.
- `server/model` defines `User`, `Chat`, and `Message` schemas.
- `server/index.js` bootstraps Express, connects to MongoDB, and wires Socket.io.

## Security / Privacy Notes

- Passwords are hashed with bcrypt before storage.
- Access tokens are short-lived; refresh tokens are stored in httpOnly cookies and rotated on refresh.
- Refresh token reuse is detected and causes token invalidation.
- Password resets clear refresh tokens and force active sessions to log out.
- Socket.io connections require an access token and session ID.

## Live Demo

[Open the app](https://mychatmate.vercel.app/)
