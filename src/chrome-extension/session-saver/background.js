"use strict";

chrome.webNavigation.onCompleted.addListener(onload);

const urlNeedles = {
  jira: "https://jira.",
  upsource: "https://upsource.",
};

function getUpsourceRequestToken() {
  return new Promise(async (resolve) => {
    const check = async () => {
      const auth = window?.app?.getAuth();
      const log = (v) => console.log("session-saver background.js", v);
      const retry = (v) => {
        // log(v)
        return setTimeout(check, 5000);
      };
      if (!auth) {
        retry({ m: "no auth" });
        return;
      }
      const token = await auth.requestToken();
      if (typeof token !== "string") {
        retry({ m: "invalid token", token });
        return;
      }
      log({ m: "ok", token });
      resolve(token);
    };
    await check();
  });
}

async function onload(e) {
  const {
    url,
    tabId,
  } = e;

  if (!await shouldUpdate(url)) {
    return;
  }

  let body = "";

  const siteId = getSiteId(url);
  switch (siteId) {
    case "upsource":
      body = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        world: "MAIN",
        func: getUpsourceRequestToken,
      });
      if (Array.isArray(body)) {
        body = body.find((v) => !!v.result)?.result;
      }
      break;
    case "jira":
      body = (await chromeCookiesGetAllSecureByUrl(url))
        .map((c) => `${c.name}=${c.value}`).join("; ");
      break;
    default:
      return;
  }

  const result = await (await fetch(`http://localhost:11536?siteId=${siteId}`, {
    method: "POST",
    body,
  })).text();
  if (result !== "ok") {
    return;
  }
}

async function shouldUpdate(url) {
  return true;
  const now = new Date();
  const ok = async () => {
    await chromeStorageLocalSetKey(now.toString());
    return true;
  };
  if (url.includes("#sss")) {
    return await ok();
  }
  if (!getSiteId(url)) {
    return false;
  }

  const dateString = await chromeStorageLocalGetKey(),
    date = dateString ? new Date(dateString) : now,
    hour = 1000 * 60 * 60;

  if (now.getTime() - date.getTime() < hour) {
    return false;
  }

  return await ok();
}

function chromeCookiesGetAllSecureByUrl(url) {
  return promisify(chrome.cookies.getAll, chrome.cookies)({
    url,
    secure: false,
  });
}

const dateKey = "zoredDenoJiralistenSessionDate";

async function chromeStorageLocalGetKey() {
  return (await promisify(chrome.storage.local.get, chrome.storage.local)([
    dateKey,
  ]))[dateKey];
}

function chromeStorageLocalSetKey(value) {
  return promisify(chrome.storage.local.set, chrome.storage.local)({
    [dateKey]: value,
  });
}

function promisify(f, o) {
  return (...args) =>
    new Promise((resolve) => {
      args.push((r) => resolve(r));
      f.call(o || this, ...args);
    });
}

function getSiteId(url) {
  return Object
    .entries(urlNeedles)
    .filter(([, v]) => url.includes(v))
    .map(([k]) => k)[0];
}
