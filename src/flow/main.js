const ignoreWarnsLinks = new Set();
JSON.parse(localStorage.ignoreWarnsLinks || "[]").forEach((v) =>
  ignoreWarnsLinks.add(v)
);
let status = {};

async function loadStatus() {
  const status = await (await fetch("/status")).json();
  const e = status.error;
  if (e) {
    throw new Error(JSON.stringify({ status }));
  }
  return status;
}

function a(text, link) {
  return `<a target="_blank" href="${link}">${text}</a>`;
}

function maxWidth(html, v) {
  return `<div style="max-width:${v}px">${html}</div>`;
}

function b(t) {
  return `<b>${t}</b>`;
}

function slash(a, b) {
  return a ? `<div class="slash-before">${a}</div>${b}` : b;
}

function warn(text, cond) {
  return cond ? `<span class="warning">${text}</span>` : text;
}

function aWarn(text, cond, url) {
  if (ignoreWarnsLinks.has(url)) {
    return a(text, url);
  }
  return a(warn(text, cond), url);
}

function opaque(s) {
  return `<span class="opaque">${s}</span>`;
}

function title(t, s) {
  return `<span title="${t}">${s}</span>`;
}

function fillStatus(s) {
  document.getElementById("status_rows").innerHTML = Object
    .values(s)
    .map((v) => {
      const lastDeveloper = v.issue.developers.slice(-1)[0] ?? {};
      let lastDeveloperHtml = lastDeveloper.displayName;
      if (lastDeveloper.me) {
        lastDeveloperHtml = b(lastDeveloperHtml);
      }
      const statusColumn = [
        v.issue.status,
        title("last developer", lastDeveloperHtml),
      ];
      const assignee = v.issue.assignee;
      if (assignee !== lastDeveloper.displayName) {
        statusColumn.push(title("assignee", opaque(assignee)));
      }

      return [
        statusColumn,
        maxWidth(
          (v.issue.parent
            ? `<div class="slash-before">${
              a(v.issue.parent.key, v.issue.url)
            }</div> `
            : "") +
            a(b(v.issue.key), v.issue.url) + " " + v.issue.summary,
          300,
        ),
        (v.pipelines ?? []).map((v) =>
          aWarn(v.status, v.status !== "success", v.web_url)
        ),
        (v.reviews ?? []).map((v) =>
          aWarn(v.completed ? "готово" : "ревью", !v.completed, v.url)
        ),
      ];
    }).map((v) =>
      v.map((v) =>
        Array.isArray(v) ? v.map((v) => `<div>${v}</div>`).join("") : v + ""
      )
    ).map((v) => v.map((v) => `<td>${v}</td>`).join(""))
    .map((v) => `<tr>${v}</tr>`)
    .join("");
}

function loading(visible) {
  document.getElementById("loading").style.display = visible ? "block" : "none";
}

async function update() {
  loading(true);
  status = await loadStatus();
  fillStatus(status);
  loading(false);
}

window.onkeyup = async function ({ code }) {
  if (code === "KeyR") {
    await update();
  }
};

window.onload = async () => {
  await update();
  setInterval(update, 300000);
};

(() => {
  let active = false;
  const toggle = ({ key }, v) => {
    console.log({ key });
    if (key === "Alt") {
      active = v;
    }
  };
  window.addEventListener("keydown", (e) => toggle(e, true));
  window.addEventListener("keyup", (e) => toggle(e, false));
  window.addEventListener("mousedown", (e) => {
    if (!active) {
      return;
    }
    const href = e.target.closest("a")?.href;
    console.log(href);
    if (!href) {
      return;
    }

    if (ignoreWarnsLinks.has(href)) {
      ignoreWarnsLinks.delete(href);
    } else {
      ignoreWarnsLinks.add(href);
    }
    localStorage.ignoreWarnsLinks = JSON.stringify([...ignoreWarnsLinks]);
    fillStatus(status);
    e.preventDefault();
  });
})();
