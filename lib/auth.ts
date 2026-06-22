import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

export type UserRole = "teacher" | "student";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  studentId?: string;
  className?: string;
};

type DemoUser = SessionUser & {
  password: string;
};

type SessionPayload = {
  userId: string;
  expiresAt: number;
};

export const SESSION_COOKIE_NAME = "power-repeat-session";

const SESSION_MAX_AGE_SEC = 60 * 60 * 8;
const AUTH_SECRET = process.env.AUTH_SECRET || "power-repeat-development-secret";

const demoUsers: DemoUser[] = [
  {
    id: "u-teacher-1",
    email: "teacher@powerrepeat.test",
    password: "teacher123",
    name: "Jamie Teacher",
    role: "teacher"
  },
  {
    id: "u-student-1",
    email: "minjun@powerrepeat.test",
    password: "student123",
    name: "김민준",
    role: "student",
    studentId: "s-1",
    className: "CHESS Reading A"
  },
  {
    id: "u-student-3",
    email: "jiwoo@powerrepeat.test",
    password: "student123",
    name: "박지우",
    role: "student",
    studentId: "s-3",
    className: "CHESS Reading B"
  }
];

const toPublicUser = (user: DemoUser): SessionUser => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  studentId: user.studentId,
  className: user.className
});

const base64UrlEncode = (value: string) => Buffer.from(value).toString("base64url");

const base64UrlDecode = (value: string) => Buffer.from(value, "base64url").toString("utf8");

const sign = (value: string) => createHmac("sha256", AUTH_SECRET).update(value).digest("base64url");

const safeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

export const getDemoLoginUsers = () =>
  demoUsers.map((user) => ({
    email: user.email,
    name: user.name,
    role: user.role,
    passwordHint: user.password
  }));

export const authenticateDemoUser = (email: string, password: string) => {
  const user = demoUsers.find(
    (item) => item.email.toLowerCase() === email.trim().toLowerCase() && item.password === password
  );

  return user ? toPublicUser(user) : null;
};

export const createSessionToken = (user: SessionUser) => {
  const payload: SessionPayload = {
    userId: user.id,
    expiresAt: Date.now() + SESSION_MAX_AGE_SEC * 1000
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));

  return `${encodedPayload}.${sign(encodedPayload)}`;
};

export const verifySessionToken = (token?: string) => {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature || !safeEqual(sign(encodedPayload), signature)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;
    if (payload.expiresAt < Date.now()) {
      return null;
    }

    const user = demoUsers.find((item) => item.id === payload.userId);
    return user ? toPublicUser(user) : null;
  } catch {
    return null;
  }
};

export const getCurrentUser = async () => {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
};

export const setSessionCookie = (response: NextResponse, user: SessionUser) => {
  response.cookies.set(SESSION_COOKIE_NAME, createSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC
  });
};

export const clearSessionCookie = (response: NextResponse) => {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
};
