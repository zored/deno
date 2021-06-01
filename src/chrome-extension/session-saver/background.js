"use strict";
chrome.webNavigation.onDOMContentLoaded.addListener(onload);

const urlNeedles = {
  jira: "https://jira.",
  upsource: "https://upsource.",
};

async function onload({ url }) {
  if (!await shouldUpdate(url)) {
    return;
  }
  const cookies = await chromeCookiesGetAllSecureByUrl(url);
  console.debug({ cookies });
  const result =
    await (await fetch(`http://localhost:11536?siteId=${getSiteId(url)}`, {
      method: "POST",
      body: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    })).text();
  if (result !== "ok") {
    console.error("could not write cookies", result);
    return;
  }
  console.info("sent");
}

async function shouldUpdate(url) {
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

const dateKey = "zoredDenoJiraListenCookiesDate";

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
