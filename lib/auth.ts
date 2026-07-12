import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { findStudentByCredentials, findStudentByNameAndCode } from "@/lib/homework-data";

export type UserRole = "admin" | "teacher" | "student";

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
  user: SessionUser;
  expiresAt: number;
};

export const SESSION_COOKIE_NAME = "power-repeat-session";

const SESSION_MAX_AGE_SEC = 60 * 60 * 8;
const AUTH_SECRET = process.env.AUTH_SECRET || "power-repeat-development-secret";

const teacherUsers: DemoUser[] = [
  {
    id: "u-admin-1",
    email: "admin@powerrepeat.test",
    password: "jace3000khan!!",
    name: "금혜연",
    role: "admin"
  },
  {
    id: "u-teacher-1",
    email: "teacher@powerrepeat.test",
    password: "teacher123",
    name: "Jamie Teacher",
    role: "teacher"
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

export const authenticateDemoUser = async (email: string, password: string) => {
  const normalizedLogin = email.trim().toLowerCase();
  const user = teacherUsers.find(
    (item) =>
      (item.email.toLowerCase() === normalizedLogin || item.name.trim().toLowerCase() === normalizedLogin) &&
      item.password === password
  );

  if (user) {
    return toPublicUser(user);
  }

  const student = await findStudentByCredentials(email, password);
  if (!student) {
    return null;
  }

  return {
    id: `u-${student.id}`,
    email: student.email,
    name: student.name,
    role: "student",
    studentId: student.id,
    className: student.className
  } satisfies SessionUser;
};

export const authenticateStudentByNameAndCode = async (name: string, loginCode: string) => {
  const student = await findStudentByNameAndCode(name, loginCode);
  if (!student) {
    return null;
  }

  return {
    id: `u-${student.id}`,
    email: student.email,
    name: student.name,
    role: "student",
    studentId: student.id,
    className: student.className
  } satisfies SessionUser;
};

export const createSessionToken = (user: SessionUser) => {
  const payload: SessionPayload = {
    user,
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

    return payload.user;
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
