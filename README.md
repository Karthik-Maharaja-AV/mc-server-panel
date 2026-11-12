# Server Panel for Minecraft

A web panel for running a Minecraft Java server on your own PC. It runs the server for you, and you control it from any browser on your network: from the PC itself, a laptop, or a phone.

- **Console:** live server log with filters and search, plus a command box with history.
- **Players:** operators, whitelist, kick and ban.
- **Permissions:** give friends their own login and choose what each person may do.
- **server.properties:** every setting as a switch or field, plus custom keys and a raw file view.
- **Backups:** one-click and scheduled world backups, restore, and download.
- **Worlds:** generate new worlds (normal, superflat, amplified, single biome…) and switch between them.
- **Setup:** download Paper or Vanilla for any version, accept the EULA, and choose Java and memory.

Not affiliated with Mojang or Microsoft.

## What you need

| | |
|---|---|
| **Node.js 18 or newer** | <https://nodejs.org> (the LTS version) |
| **Java** | The version your Minecraft release needs. The Setup page tells you which one: Minecraft 1.20.5–1.21.x needs Java 21, and 26.x needs Java 25. Get it from <https://adoptium.net>. |
| **A PC that stays on** while people play | Windows, macOS or Linux |

## Start it

1. Download this folder (or `git clone` it).
2. Start the panel:
   - **Windows:** double-click `start.bat`
   - **macOS:** double-click `start.command` (the first time, right-click → Open)
   - **Linux / terminal:** `./start.sh` or `npm install && npm start`
3. Open **<http://localhost:8080>** and create the **owner account**.
4. On the **Setup** page:
   1. choose **Paper** (recommended, supports plugins) or **Vanilla** and a version, then press **Install**;
   2. read and accept the **Minecraft EULA**;
   3. set the memory (4096 MB is a good start).
5. Press **Start** at the top. The first start takes a minute while the world is generated.

The window that started the panel must stay open. Closing it (or pressing Ctrl+C) stops Minecraft cleanly and saves the world first.

## Opening the panel from other PCs

When the panel starts, it prints addresses like `http://192.168.1.24:8080`. Any device on the same network can open that address and sign in.

- If it doesn't load, allow **Node.js** through the host PC's firewall (Windows asks the first time; click *Allow* for private networks).
- Give each person their own login on the **Permissions** page. Presets: **Admin** (everything except managing access), **Moderator** (console, commands, players) and **Viewer** (read the console).
- To turn network access off, use the switch on the Permissions page, or set `"lanAccess": false` in `data/config.json`, then restart the panel.

**From outside your home:** don't port-forward the panel. Use a private VPN such as [Tailscale](https://tailscale.com) or [ZeroTier](https://www.zerotier.com), so only your devices can reach it.

## Letting friends join the game

The panel and the game use different ports:

| | Port | Who connects |
|---|---|---|
| Panel | 8080 | You and your helpers, in a browser |
| Minecraft | 25565 | Players, in Minecraft |

- **Same network:** players use *Multiplayer → Add Server* with the host PC's address, e.g. `192.168.1.24`.
- **Over the internet:** forward TCP port **25565** on your router to the host PC (never port 8080), or have everyone join the same Tailscale or ZeroTier network. With `online-mode=true` and the whitelist on, only players you approve can join.

## Where things are stored

```
mc-server-panel/
├─ server/     Minecraft server: server.jar, worlds, server.properties, logs, plugins/
├─ backups/    World backups (.zip) and their index
└─ data/       Panel settings (config.json), accounts (users.json), world info
```

All three are in `.gitignore`. To move an existing server in, stop the panel's server, copy your files into `server/`, rename the jar to `server.jar`, then accept the EULA on the Setup page if it isn't already accepted.

## Settings file

`data/config.json` is created on first save. Everything in it can be changed in the panel except these:

| Key | Default | What it does |
|---|---|---|
| `panelPort` | `8080` | Panel port (or start with `PANEL_PORT=8081`) |
| `lanAccess` | `true` | `false` = only this PC can open the panel |
| `serverDir` | `server` | Where the Minecraft server lives |
| `backupDir` | `backups` | Where backups go (e.g. another drive) |
| `stopTimeoutSec` | `60` | How long to wait for a clean stop before force-closing |

Set `PANEL_DATA_DIR` to keep `data/` somewhere else.

## How it works

The panel starts Java as a child process (`java -Xms… -Xmx… -jar server.jar nogui`). It reads everything the server prints and streams it to browsers over a WebSocket. Commands you type are written to the server's standard input, the same as typing in its terminal. RCON isn't needed.

Player changes run as normal server commands (`op`, `whitelist add`, `ban`…), so the server stays in charge of its own files. Backups pause autosave (`save-off`), flush the world (`save-all flush`), zip the world plus its Nether and End folders, then turn autosave back on. Restores first take a safety backup, stop the server, swap in the files, then start it again.

## Security notes

- Passwords are hashed with scrypt; sessions are HTTP-only, SameSite=Strict cookies.
- Every API call and WebSocket message is checked against the user's permissions, and removed users are disconnected straight away.
- Sign-in is rate-limited (10 tries per 10 minutes per address).
- The panel uses plain HTTP, which is fine on a home network or over a VPN. Don't expose it directly to the internet.

## Development

```
npm install
npm test        # unit tests for the log parser and server.properties handling
npm start
```

No build step: the frontend is plain HTML, CSS and JavaScript in `public/`.

## License

MIT
