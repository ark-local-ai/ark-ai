// ===== 本地多用户认证 API（数据不出本机） =====
// POST /api/auth/register {username, password, displayName?} → {user}（自动登录）
// POST /api/auth/login     {username, password}              → {token, user}
// POST /api/auth/logout     Bearer token                      → 注销
// GET  /api/auth/me         Bearer token                      → {user} | 401
// GET  /api/auth/status                                      → {hasUsers, me}
//
// 会话 = 随机 token（存 sessions 表，7 天过期），前端持 token 走 `Authorization: Bearer`。
// 密码用 crypto.scrypt 哈希，本地优先、零依赖。

import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  createUser, findUserByUsername, findUserById, verifyPassword,
  createSession, resolveSession, destroySession, countUsers, type User,
} from "../db/store";

interface AuthBody {
  username?: string;
  password?: string;
  displayName?: string;
}

function readToken(req: FastifyRequest): string | undefined {
  const h = req.headers.authorization;
  if (h && h.startsWith("Bearer ")) return h.slice(7).trim();
  return undefined;
}

/** 当前登录用户（无则 undefined） */
export function currentUser(req: FastifyRequest): User | undefined {
  const token = readToken(req);
  return token ? resolveSession(token) : undefined;
}

export async function authRoutes(app: FastifyInstance) {
  // 当前认证状态（是否有用户、当前登录者）——前端首屏判断用
  app.get("/status", async (req) => {
    const me = currentUser(req);
    return { hasUsers: countUsers() > 0, me: me ?? null };
  });

  app.post<{ Body: AuthBody }>("/register", async (req, reply) => {
    const username = req.body?.username?.trim();
    const password = req.body?.password ?? "";
    if (!username || !password) {
      return reply.code(400).send({ error: "username 与 password 不能为空" });
    }
    if (password.length < 4) {
      return reply.code(400).send({ error: "密码至少 4 位" });
    }
    if (findUserByUsername(username)) {
      return reply.code(409).send({ error: "用户名已存在" });
    }
    const displayName = req.body?.displayName?.trim() || username;
    const user = createUser(username, password, displayName);
    const token = createSession(user.id);
    return reply.code(201).send({ token, user });
  });

  app.post<{ Body: AuthBody }>("/login", async (req, reply) => {
    const username = req.body?.username?.trim();
    const password = req.body?.password ?? "";
    const row = findUserByUsername(username ?? "");
    if (!row || !verifyPassword(password, row.password_hash)) {
      return reply.code(401).send({ error: "用户名或密码错误" });
    }
    const user = findUserById(row.id)!;
    const token = createSession(user.id);
    return reply.send({ token, user });
  });

  app.post("/logout", async (req, reply) => {
    const token = readToken(req);
    if (token) destroySession(token);
    return reply.code(204).send();
  });

  app.get("/me", async (req, reply) => {
    const me = currentUser(req);
    if (!me) return reply.code(401).send({ error: "未登录" });
    return reply.send({ user: me });
  });
}
