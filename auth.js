function setMessage(element, message, type = "info") {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.dataset.type = type;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || "Request failed.");
  }

  return payload;
}

function nextPath() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  return next && next.startsWith("/") ? next : "/";
}

function bindLoginForm() {
  const form = document.querySelector("#login-form");
  const message = document.querySelector("#login-message");

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage(message, "Signing in...");

    try {
      const formData = new FormData(form);
      await postJson("/api/login", {
        email: formData.get("email"),
        password: formData.get("password"),
      });
      window.location.assign(nextPath());
    } catch (error) {
      setMessage(message, error.message, "error");
    }
  });
}

function bindForgotPasswordForm() {
  const toggle = document.querySelector("#forgot-toggle");
  const form = document.querySelector("#forgot-form");
  const message = document.querySelector("#forgot-message");

  if (!form || !toggle) {
    return;
  }

  toggle.addEventListener("click", () => {
    form.classList.toggle("auth-form-hidden");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage(message, "Requesting password reset...");

    try {
      const formData = new FormData(form);
      const result = await postJson("/api/forgot-password", {
        email: formData.get("email"),
      });
      const devLink = result.resetLink
        ? ` Development reset link: ${result.resetLink}`
        : "";
      setMessage(message, `${result.message}${devLink}`, "success");
    } catch (error) {
      setMessage(message, error.message, "error");
    }
  });
}

function bindResetForm() {
  const form = document.querySelector("#reset-form");
  const message = document.querySelector("#reset-message");

  if (!form) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  if (!token) {
    setMessage(message, "This reset link is missing a token.", "error");
    form.querySelector("button")?.setAttribute("disabled", "disabled");
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");

    if (password !== confirmPassword) {
      setMessage(message, "Passwords do not match.", "error");
      return;
    }

    setMessage(message, "Updating password...");

    try {
      const result = await postJson("/api/reset-password", {
        token,
        password,
      });
      form.reset();
      setMessage(message, result.message, "success");
    } catch (error) {
      setMessage(message, error.message, "error");
    }
  });
}

function bindLogout() {
  const logoutButton = document.querySelector("#logout-button");

  if (!logoutButton) {
    return;
  }

  logoutButton.addEventListener("click", async () => {
    logoutButton.setAttribute("disabled", "disabled");
    try {
      await postJson("/api/logout", {});
    } finally {
      window.location.assign("/login.html");
    }
  });
}

bindLoginForm();
bindForgotPasswordForm();
bindResetForm();
bindLogout();
