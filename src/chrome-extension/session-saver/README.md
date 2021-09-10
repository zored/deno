# Zored Session Exporter

This code is written to send session data to server (cookies, local storage
data, etc.).

- Add this folder in Chrome Extensions developer mode.
- `pm2 start ecosystem.config.js -- --config=${ROB_DIR}/zored_deno.json --jira=${ROB_DIR}/zored_deno.jira.json`
  will start daemon:
  - When you will visit specified site then extension will export data to
    server.
  - Predefined server stores session to file.
- See [background file](./background.js) to validate logic.
