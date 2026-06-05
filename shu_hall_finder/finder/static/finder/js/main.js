(function () {
    const STORAGE_KEY = "shu-hall-finder-theme";

    function applyTheme(isDark) {
        const body = document.getElementById("body");
        const icon = document.getElementById("themeIcon");
        if (!body) return;
        body.classList.toggle("dark-mode", isDark);
        if (icon) {
            icon.className = isDark ? "bi bi-sun-fill" : "bi bi-moon-stars";
        }
        localStorage.setItem(STORAGE_KEY, isDark ? "dark" : "light");
        document.dispatchEvent(
            new CustomEvent("shu-theme-changed", { detail: { isDark } })
        );
    }

    function readStoredTheme() {
        return localStorage.getItem(STORAGE_KEY) === "dark";
    }

    window.showToast = function (message, variant = "info") {
        const host = document.getElementById("toastHost");
        if (!host) {
            window.alert(message);
            return;
        }
        const el = document.createElement("div");
        el.className = `app-toast app-toast--${variant}`;
        el.setAttribute("role", "status");
        el.textContent = message;
        host.appendChild(el);
        requestAnimationFrame(() => el.classList.add("app-toast--show"));
        setTimeout(() => {
            el.classList.remove("app-toast--show");
            setTimeout(() => el.remove(), 300);
        }, 4200);
    };

    window.toggleDarkMode = function () {
        const body = document.getElementById("body");
        applyTheme(!body.classList.contains("dark-mode"));
    };

    document.addEventListener("DOMContentLoaded", () => {
        const btn = document.getElementById("themeToggle");
        if (readStoredTheme()) {
            applyTheme(true);
        }
        if (btn) {
            btn.addEventListener("click", toggleDarkMode);
        }
    });
})();
