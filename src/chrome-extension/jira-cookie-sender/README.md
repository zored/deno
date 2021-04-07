# Jira Cookie Sender

This code is written to handle Jira API via browser cookies.

- Add this folder in Chrome Extensions developer mode.
- `pm2 start ecosystem.config.js` will start daemon:
  - When you will visit Jira extension will send cookies to daemon.
  - Daemon will save cookies to file.
  - Therefore `./src/jira.ts` commands will always
- See [background file](./background.js) to validate logic.
