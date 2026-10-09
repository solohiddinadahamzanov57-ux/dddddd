(function () {
  async function postJson(path, body) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || "Something went wrong. Please try again.");
    }
    return data;
  }

  function withBusy(btn, fn) {
    return async (...args) => {
      btn.disabled = true;
      try {
        await fn(...args);
      } finally {
        btn.disabled = false;
      }
    };
  }

  function wireSignIn({ formId, submitBtnId, errorId, googleBtnId }) {
    const form = document.getElementById(formId);
    const btn = document.getElementById(submitBtnId);
    const errorEl = document.getElementById(errorId);

    form.addEventListener(
      "submit",
      withBusy(btn, async (e) => {
        e.preventDefault();
        errorEl.textContent = "";
        try {
          await postJson("/api/auth/sign-in/email", {
            email: document.getElementById("email").value.trim(),
            password: document.getElementById("password").value,
          });
          window.location.href = "/dashboard";
        } catch (err) {
          errorEl.textContent = err.message;
        }
      }),
    );

    const googleBtn = document.getElementById(googleBtnId);
    if (googleBtn) {
      googleBtn.addEventListener(
        "click",
        withBusy(googleBtn, async () => {
          errorEl.textContent = "";
          try {
            const data = await postJson("/api/auth/sign-in/social", {
              provider: "google",
              callbackURL: "/dashboard",
            });
            if (data.url) window.location.href = data.url;
          } catch (err) {
            errorEl.textContent = err.message;
          }
        }),
      );
    }
  }

  function wireSignUp({ formId, submitBtnId, errorId, googleBtnId }) {
    const form = document.getElementById(formId);
    const btn = document.getElementById(submitBtnId);
    const errorEl = document.getElementById(errorId);

    form.addEventListener(
      "submit",
      withBusy(btn, async (e) => {
        e.preventDefault();
        errorEl.textContent = "";
        try {
          await postJson("/api/auth/sign-up/email", {
            name: document.getElementById("name").value.trim(),
            email: document.getElementById("email").value.trim(),
            password: document.getElementById("password").value,
          });
          window.location.href = "/dashboard";
        } catch (err) {
          errorEl.textContent = err.message;
        }
      }),
    );

    const googleBtn = document.getElementById(googleBtnId);
    if (googleBtn) {
      googleBtn.addEventListener(
        "click",
        withBusy(googleBtn, async () => {
          errorEl.textContent = "";
          try {
            const data = await postJson("/api/auth/sign-in/social", {
              provider: "google",
              callbackURL: "/dashboard",
            });
            if (data.url) window.location.href = data.url;
          } catch (err) {
            errorEl.textContent = err.message;
          }
        }),
      );
    }
  }

  function wireForgotPassword({ formId, submitBtnId, errorId, introId }) {
    const form = document.getElementById(formId);
    const btn = document.getElementById(submitBtnId);
    const errorEl = document.getElementById(errorId);
    const introEl = document.getElementById(introId);

    form.addEventListener(
      "submit",
      withBusy(btn, async (e) => {
        e.preventDefault();
        errorEl.textContent = "";
        try {
          await postJson("/api/auth/request-password-reset", {
            email: document.getElementById("email").value.trim(),
            redirectTo: `${window.location.origin}/reset-password.html`,
          });
          introEl.textContent =
            "If that email has an account, a reset link is on its way. Check your inbox.";
          form.classList.add("hidden");
        } catch (err) {
          errorEl.textContent = err.message;
        }
      }),
    );
  }

  function wireResetPassword({ formId, submitBtnId, errorId }) {
    const form = document.getElementById(formId);
    const btn = document.getElementById(submitBtnId);
    const errorEl = document.getElementById(errorId);
    const token = new URLSearchParams(window.location.search).get("token");

    if (!token) {
      errorEl.textContent = "This reset link is missing its token. Request a new one.";
      form.querySelector("button").disabled = true;
      return;
    }

    form.addEventListener(
      "submit",
      withBusy(btn, async (e) => {
        e.preventDefault();
        errorEl.textContent = "";
        try {
          await postJson("/api/auth/reset-password", {
            newPassword: document.getElementById("password").value,
            token,
          });
          window.location.href = "/login.html";
        } catch (err) {
          errorEl.textContent = err.message;
        }
      }),
    );
  }

  window.DriverDeskAuth = {
    wireSignIn,
    wireSignUp,
    wireForgotPassword,
    wireResetPassword,
  };
})();
