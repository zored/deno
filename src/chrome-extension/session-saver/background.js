"use strict";
chrome.webNavigation.onCompleted.addListener(onload);

const urlNeedles = {
  jira: "https://jira.",
  upsource: "https://upsource.",
};

function getUpsourceRequestToken() {
  console.error({
    arguments,
    app: window.app,
  });
  return new Promise(async (resolve) => {
    const check = async () => {
      const auth = window?.app?.getAuth();
      if (!auth) {
        setTimeout(check, 200);
        return;
      }
      const token = await auth.requestToken();
      console.error({ token });
      debugger;
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
        target: {
          tabId,
          allFrames: true,
        },
        function: getUpsourceRequestToken,
      });
      break;
    case "jira":
      body = (await chromeCookiesGetAllSecureByUrl(url))
        .map((c) => `${c.name}=${c.value}`).join("; ");
      break;
    default:
      console.debug({ url });
      return;
  }

  console.error({ body });

  const result = await (await fetch(`http://localhost:11536?siteId=${siteId}`, {
    method: "POST",
    body,
  })).text();
  if (result !== "ok") {
    console.error("could not write cookies", result);
    return;
  }
  console.info("sent");
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
    console.debug(["less than 1 hour passed", date]);
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
