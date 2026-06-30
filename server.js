const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");
const nodemailer = require("nodemailer");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "luke@horizon-wiring.co.uk").toLowerCase();
const DATA_FILE = process.env.AUTH_DATA_FILE || path.join(ROOT, ".data", "auth.json");
const STAFF_IMPORT_FILE = path.join(ROOT, "imported-staff.json");
const SESSION_COOKIE = "hwplanner_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

const PUBLIC_FILES = new Set([
  "/auth.js",
  "/login.html",
  "/reset-password.html",
  "/styles.css",
]);

const PROTECTED_FILES = new Set([
  "/app.js",
  "/app/app.js",
  "/app/imported-schedule-rows.js",
  "/app/index.html",
  "/app/styles.css",
  "/index.html",
  "/staff-resource.html",
  "/staff-resource.js",
]);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const sessions = new Map();

const ROLE_PERMISSIONS = {
  Admin: {
    canManageUsers: true,
    canEditPlanning: true,
    canClearData: true,
    canViewStaffLogins: true,
  },
  Management: {
    canManageUsers: true,
    canEditPlanning: true,
    canClearData: true,
    canViewStaffLogins: true,
  },
  Lead: {
    canManageUsers: false,
    canEditPlanning: true,
    canClearData: false,
    canViewStaffLogins: false,
  },
  Tech: {
    canManageUsers: false,
    canEditPlanning: false,
    canClearData: false,
    canViewStaffLogins: false,
  },
  Inspection: {
    canManageUsers: false,
    canEditPlanning: false,
    canClearData: false,
    canViewStaffLogins: false,
  },
};

async function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey.toString("hex"));
    });
  });

  return { salt, hash };
}

async function verifyPassword(password, savedHash) {
  if (!savedHash?.salt || !savedHash?.hash) {
    return false;
  }

  const candidate = await hashPassword(password, savedHash.salt);
  return crypto.timingSafeEqual(
    Buffer.from(candidate.hash, "hex"),
    Buffer.from(savedHash.hash, "hex"),
  );
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function readAuthData() {
  try {
    const data = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
    data.adminEmail = (data.adminEmail || ADMIN_EMAIL).toLowerCase();
    data.users = Array.isArray(data.users) ? data.users : [];
    return seedImportedStaff(data);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }

    const initialData = {
      adminEmail: ADMIN_EMAIL,
      passwordHash: process.env.ADMIN_PASSWORD
        ? await hashPassword(process.env.ADMIN_PASSWORD)
        : null,
      reset: null,
      users: [],
    };

    await writeAuthData(initialData);
    if (!process.env.ADMIN_PASSWORD) {
      console.warn(
        `Admin account ${ADMIN_EMAIL} created without a password. Use the forgot-password flow to set one.`,
      );
    }

    return seedImportedStaff(initialData);
  }
}

async function writeAuthData(data) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

async function seedImportedStaff(data) {
  try {
    const imported = JSON.parse(await fs.readFile(STAFF_IMPORT_FILE, "utf8"));
    if (!imported.version || data.staffImportVersion === imported.version) {
      return data;
    }

    const existingEmails = new Set([
      data.adminEmail,
      ...data.users.map((user) => String(user.email || "").toLowerCase()),
    ]);
    let addedCount = 0;
    let profileUpdated = false;
    for (const staffMember of imported.staff || []) {
      const email = String(staffMember.email || "").toLowerCase();
      if (email === data.adminEmail) {
        data.adminProfile = {
          name: staffMember.name,
          rating: normaliseRating(staffMember.rating),
          hoursPerWeek: normaliseHoursPerWeek(staffMember.hoursPerWeek),
          imported: true,
          createdAt: staffMember.createdAt || new Date().toISOString(),
        };
        profileUpdated = true;
        continue;
      }

      if (!email || existingEmails.has(email)) {
        continue;
      }

      data.users.push({
        id: staffMember.id || crypto.randomUUID(),
        name: staffMember.name,
        email,
        role: normaliseRole(staffMember.role),
        rating: normaliseRating(staffMember.rating),
        hoursPerWeek: normaliseHoursPerWeek(staffMember.hoursPerWeek),
        blocked: Boolean(staffMember.blocked),
        imported: true,
        passwordHash: null,
        createdAt: staffMember.createdAt || new Date().toISOString(),
      });
      existingEmails.add(email);
      addedCount += 1;
    }

    const previousImportVersion = data.staffImportVersion;
    data.staffImportVersion = imported.version;
    if (addedCount || profileUpdated || previousImportVersion !== imported.version) {
      await writeAuthData(data);
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Unable to seed imported staff:", error);
    }
  }

  return data;
}

function parseCookies(request) {
  return Object.fromEntries(
    (request.headers.cookie || "")
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const index = cookie.indexOf("=");
        return [
          decodeURIComponent(cookie.slice(0, index)),
          decodeURIComponent(cookie.slice(index + 1)),
        ];
      }),
  );
}

function getSession(request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  const session = token ? sessions.get(token) : null;

  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }

  return { token, ...session };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    rating: user.rating,
    hoursPerWeek: user.hoursPerWeek,
    blocked: Boolean(user.blocked),
    hasPassword: Boolean(user.passwordHash),
    imported: Boolean(user.imported),
    createdAt: user.createdAt,
  };
}

function publicAdminUser(data) {
  const profile = data.adminProfile || {};
  return {
    id: "admin-account",
    name: profile.name || "Admin",
    email: data.adminEmail,
    role: "Admin",
    rating: profile.rating || 5,
    hoursPerWeek: profile.hoursPerWeek || 0,
    blocked: false,
    hasPassword: Boolean(data.passwordHash),
    imported: Boolean(profile.imported),
    protected: true,
    createdAt: profile.createdAt || null,
  };
}

function permissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.Tech;
}

function canManageUsers(session) {
  return Boolean(permissionsForRole(session?.role).canManageUsers);
}

function normaliseRole(role) {
  const value = String(role || "").trim().toLowerCase();
  if (value === "admin") {
    return "Admin";
  }
  if (value === "management") {
    return "Management";
  }
  if (value === "lead") {
    return "Lead";
  }
  if (value === "inspection") {
    return "Inspection";
  }
  return "Tech";
}

function normaliseRating(rating) {
  const parsed = Number(rating);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.min(5, Math.max(1, Math.round(parsed)));
}

function normaliseHoursPerWeek(hoursPerWeek) {
  const parsed = Number(hoursPerWeek);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.round(parsed * 4) / 4;
}

function createSession(email, user = {}) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, {
    email,
    name: user.name || (email === ADMIN_EMAIL ? "Admin" : email),
    role: user.role || (email === ADMIN_EMAIL ? "Admin" : "Tech"),
    rating: user.rating || null,
    permissions: permissionsForRole(user.role || (email === ADMIN_EMAIL ? "Admin" : "Tech")),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

function sessionCookie(token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(
    SESSION_TTL_MS / 1000,
  )}${secure}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function redirect(response, location) {
  response.writeHead(302, { Location: location });
  response.end();
}

function notFound(response) {
  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found");
}

function originFor(request) {
  const protocol =
    request.headers["x-forwarded-proto"] ||
    (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${protocol}://${request.headers.host}`;
}

function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT);
}

async function sendResetEmail(email, resetLink) {
  if (!isSmtpConfigured()) {
    console.warn(`Password reset link for ${email}: ${resetLink}`);
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure:
      process.env.SMTP_SECURE === "true" || Number(process.env.SMTP_PORT) === 465,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
  });

  await transporter.sendMail({
    from:
      process.env.SMTP_FROM ||
      process.env.SMTP_USER ||
      "HWPlanner <no-reply@horizon-wiring.co.uk>",
    to: email,
    subject: "Reset your HWPlanner password",
    text: `Use this one-hour link to reset your HWPlanner password: ${resetLink}`,
    html: `
      <p>Use this one-hour link to reset your HWPlanner password:</p>
      <p><a href="${resetLink}">${resetLink}</a></p>
      <p>If you did not request this, you can ignore this email.</p>
    `,
  });

  return true;
}

async function serveFile(response, filePath) {
  const extension = path.extname(filePath);
  const contents = await fs.readFile(filePath);
  response.writeHead(200, {
    "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
  });
  response.end(contents);
}

async function handleApi(request, response, pathname) {
  if (request.method === "GET" && pathname === "/api/session") {
    const session = getSession(request);
    if (!session) {
      sendJson(response, 401, { authenticated: false });
      return;
    }

    sendJson(response, 200, {
      authenticated: true,
      email: session.email,
      name: session.name,
      role: session.role,
      rating: session.rating,
      permissions: session.permissions || permissionsForRole(session.role),
    });
    return;
  }

  if (request.method === "GET" && pathname === "/api/users") {
    const session = getSession(request);
    if (!session) {
      sendJson(response, 401, { message: "Authentication required." });
      return;
    }

    if (!canManageUsers(session)) {
      sendJson(response, 403, { message: "You do not have access to manage staff accounts." });
      return;
    }

    const authData = await readAuthData();
    sendJson(response, 200, {
      users: [publicAdminUser(authData), ...authData.users.map(publicUser)],
    });
    return;
  }

  if (request.method === "POST" && pathname === "/api/users") {
    const session = getSession(request);
    if (!session) {
      sendJson(response, 401, { message: "Authentication required." });
      return;
    }

    if (!canManageUsers(session)) {
      sendJson(response, 403, { message: "Only Admin and Management can create staff logins." });
      return;
    }

    const body = await readJsonBody(request);
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const role = normaliseRole(body.role);
    const rating = normaliseRating(body.rating);
    const hoursPerWeek = normaliseHoursPerWeek(body.hoursPerWeek);

    if (!name || !email || !email.includes("@")) {
      sendJson(response, 400, { message: "Enter a staff name and valid email." });
      return;
    }

    if (password.length < 10) {
      sendJson(response, 400, {
        message: "Staff passwords must be at least 10 characters.",
      });
      return;
    }

    const authData = await readAuthData();
    if (email === authData.adminEmail || authData.users.some((user) => user.email === email)) {
      sendJson(response, 409, { message: "A login already exists for that email." });
      return;
    }

    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      role,
      rating,
      hoursPerWeek,
      blocked: false,
      passwordHash: await hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    authData.users.push(user);
    await writeAuthData(authData);

    sendJson(response, 201, { user: publicUser(user) });
    return;
  }

  const updateUserMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
  if (request.method === "PUT" && updateUserMatch) {
    const session = getSession(request);
    if (!session) {
      sendJson(response, 401, { message: "Authentication required." });
      return;
    }

    if (!canManageUsers(session)) {
      sendJson(response, 403, { message: "Only Admin and Management can update staff resources." });
      return;
    }

    const body = await readJsonBody(request);
    const authData = await readAuthData();
    if (updateUserMatch[1] === "admin-account") {
      const password = String(body.password || "");
      if (password && password.length < 10) {
        sendJson(response, 400, {
          message: "Admin passwords must be at least 10 characters.",
        });
        return;
      }

      authData.adminProfile = {
        name: String(body.name || "").trim() || "Admin",
        rating: normaliseRating(body.rating),
        hoursPerWeek: normaliseHoursPerWeek(body.hoursPerWeek),
        imported: Boolean(authData.adminProfile?.imported),
        createdAt: authData.adminProfile?.createdAt || new Date().toISOString(),
      };
      if (password) {
        authData.passwordHash = await hashPassword(password);
        sessions.clear();
      }
      await writeAuthData(authData);
      sendJson(response, 200, { user: publicAdminUser(authData) });
      return;
    }

    const user = authData.users.find((staffUser) => staffUser.id === updateUserMatch[1]);
    if (!user) {
      sendJson(response, 404, { message: "Staff resource not found." });
      return;
    }

    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!name || !email || !email.includes("@")) {
      sendJson(response, 400, { message: "Enter a staff name and valid email." });
      return;
    }

    if (
      email !== user.email &&
      (email === authData.adminEmail || authData.users.some((staffUser) => staffUser.email === email))
    ) {
      sendJson(response, 409, { message: "A login already exists for that email." });
      return;
    }

    if (password && password.length < 10) {
      sendJson(response, 400, {
        message: "Staff passwords must be at least 10 characters.",
      });
      return;
    }

    const previousEmail = user.email;
    user.name = name;
    user.email = email;
    user.role = normaliseRole(body.role);
    user.rating = normaliseRating(body.rating);
    user.hoursPerWeek = normaliseHoursPerWeek(body.hoursPerWeek);
    if (password) {
      user.passwordHash = await hashPassword(password);
    }
    await writeAuthData(authData);

    if (previousEmail !== user.email || password) {
      for (const [token, activeSession] of sessions.entries()) {
        if (activeSession.email === previousEmail || activeSession.email === user.email) {
          sessions.delete(token);
        }
      }
    }

    sendJson(response, 200, { user: publicUser(user) });
    return;
  }

  const blockUserMatch = pathname.match(/^\/api\/users\/([^/]+)\/block$/);
  if (request.method === "POST" && blockUserMatch) {
    const session = getSession(request);
    if (!session) {
      sendJson(response, 401, { message: "Authentication required." });
      return;
    }

    if (!canManageUsers(session)) {
      sendJson(response, 403, { message: "Only Admin and Management can block staff logins." });
      return;
    }

    const body = await readJsonBody(request);
    const authData = await readAuthData();
    if (blockUserMatch[1] === "admin-account") {
      sendJson(response, 400, { message: "The main admin login cannot be blocked." });
      return;
    }

    const user = authData.users.find((staffUser) => staffUser.id === blockUserMatch[1]);
    if (!user) {
      sendJson(response, 404, { message: "Staff login not found." });
      return;
    }

    user.blocked = Boolean(body.blocked);
    await writeAuthData(authData);

    for (const [token, activeSession] of sessions.entries()) {
      if (activeSession.email === user.email) {
        sessions.delete(token);
      }
    }

    sendJson(response, 200, { user: publicUser(user) });
    return;
  }

  if (request.method === "POST" && pathname === "/api/login") {
    const body = await readJsonBody(request);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const authData = await readAuthData();
    const staffUser = authData.users.find((user) => user.email === email);
    const isValid =
      email === authData.adminEmail
        ? await verifyPassword(password, authData.passwordHash)
        : await verifyPassword(password, staffUser?.passwordHash);

    if (staffUser?.blocked) {
      sendJson(response, 403, {
        message: "This login has been blocked. Please contact Management.",
      });
      return;
    }

    if (!isValid) {
      sendJson(response, 401, {
        message: "Invalid email or password.",
      });
      return;
    }

    const token = createSession(email, staffUser);
    sendJson(
      response,
      200,
      { message: "Signed in successfully." },
      { "Set-Cookie": sessionCookie(token) },
    );
    return;
  }

  if (request.method === "POST" && pathname === "/api/logout") {
    const session = getSession(request);
    if (session) {
      sessions.delete(session.token);
    }

    sendJson(
      response,
      200,
      { message: "Signed out successfully." },
      { "Set-Cookie": clearSessionCookie() },
    );
    return;
  }

  if (request.method === "POST" && pathname === "/api/forgot-password") {
    const body = await readJsonBody(request);
    const email = String(body.email || "").trim().toLowerCase();
    const authData = await readAuthData();
    let resetLink = null;
    let emailSent = false;

    const resetUser = authData.users.find((user) => user.email === email);
    if (email === authData.adminEmail || resetUser) {
      const token = crypto.randomBytes(32).toString("hex");
      authData.reset = {
        email,
        tokenHash: hashToken(token),
        expiresAt: Date.now() + RESET_TTL_MS,
      };
      await writeAuthData(authData);

      resetLink = `${originFor(request)}/reset-password.html?token=${encodeURIComponent(
        token,
      )}`;

      try {
        emailSent = await sendResetEmail(email, resetLink);
      } catch (error) {
        console.error("Failed to send password reset email:", error);
      }
    }

    sendJson(response, 202, {
      message:
        "If that admin account exists, a password reset email will be sent shortly.",
      resetLink:
        !emailSent && process.env.NODE_ENV !== "production" ? resetLink : undefined,
    });
    return;
  }

  if (request.method === "POST" && pathname === "/api/reset-password") {
    const body = await readJsonBody(request);
    const token = String(body.token || "");
    const password = String(body.password || "");
    const authData = await readAuthData();

    if (password.length < 10) {
      sendJson(response, 400, {
        message: "Please choose a password with at least 10 characters.",
      });
      return;
    }

    const reset = authData.reset;
    const isTokenValid =
      reset?.tokenHash &&
      reset.expiresAt > Date.now() &&
      crypto.timingSafeEqual(
        Buffer.from(reset.tokenHash, "hex"),
        Buffer.from(hashToken(token), "hex"),
      );

    if (!isTokenValid) {
      sendJson(response, 400, {
        message: "This reset link is invalid or has expired.",
      });
      return;
    }

    if (reset.email === authData.adminEmail) {
      authData.passwordHash = await hashPassword(password);
    } else {
      const resetUser = authData.users.find((user) => user.email === reset.email);
      if (!resetUser) {
        sendJson(response, 400, {
          message: "This reset link is invalid or has expired.",
        });
        return;
      }

      resetUser.passwordHash = await hashPassword(password);
    }
    authData.reset = null;
    await writeAuthData(authData);
    sessions.clear();

    sendJson(response, 200, {
      message: "Password updated. Please sign in with your new password.",
    });
    return;
  }

  notFound(response);
}

async function handleRequest(request, response) {
  try {
    const requestUrl = new URL(request.url, originFor(request));
    let pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
    if (pathname === "/app" || pathname === "/app/") {
      pathname = "/app/index.html";
    }

    if (pathname.startsWith("/api/")) {
      await handleApi(request, response, pathname);
      return;
    }

    if (PROTECTED_FILES.has(pathname) && !getSession(request)) {
      if (path.extname(pathname) === ".html") {
        const next = pathname === "/index.html" ? "/" : pathname;
        redirect(response, `/login.html?next=${encodeURIComponent(next)}`);
        return;
      }

      sendJson(response, 401, { message: "Authentication required." });
      return;
    }

    if (["/staff-resource.html", "/staff-resource.js"].includes(pathname)) {
      const session = getSession(request);
      if (!canManageUsers(session)) {
        if (path.extname(pathname) === ".html") {
          response.writeHead(403, { "Content-Type": "text/html; charset=utf-8" });
          response.end("<h1>Staff Resource access denied</h1><p>Only Admin and Management users can view this page.</p>");
          return;
        }

        sendJson(response, 403, { message: "Only Admin and Management users can view Staff Resource." });
        return;
      }
    }

    if (PROTECTED_FILES.has(pathname) || PUBLIC_FILES.has(pathname)) {
      await serveFile(response, path.join(ROOT, pathname));
      return;
    }

    notFound(response);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { message: "Something went wrong." });
  }
}

http.createServer(handleRequest).listen(PORT, () => {
  console.log(`HWPlanner server running at http://localhost:${PORT}`);
  console.log(`Admin account: ${ADMIN_EMAIL}`);
});
