# Harvester

Plumbing between Slack and Harvest with node.js

Right now, it runs a bot to generate a message asking users to do their timesheets.
The bot options can be configured in `config/default.json`. You'll need a webhook
URL, which you can get from `https://[account].slack.com/services/`.

You'll also need Harvest API credentials (store them safely away from git/GitHub, eg. in a password manager).

### TODO
* [ ] Get Public Holidays from an API and respect them.
* [ ] Humanise the message some more "tom, dick __and__ harry"
* [ ] Handle leave, other calendar events with a nice integration?


## Installation

```bash
npm install
```

You'll need to copy the example config JSON file:

```
npm run config
```

## Running the app in development

Harvester uses nodemon for development.

```bash
npm start
```

To bug users on, just `curl` the URLs:

```bash
curl http://localhost:3000/timesheets-plz/
curl http://localhost:3000/percentage-plz/
```

There's also a scheduler via `node-schedule` that automatically runs at
6pm on weekdays.


## Production

Put the app on an internal server. It doesn't need to be
accessible by the general public, no need for a reverse proxy set up.

```bash
curl http://10.0.0.10:3444/timesheets-plz/
curl http://10.0.0.10:3444/percentage-plz/
```


Harvester relies on the fantastic PM2 library in production.

Install it on your server with:

```bash
npm install pm2 -g
```

Start the application (with baked-in Babel support!) via:


```bash
# Start all apps
$ pm2 start processes.json

# Stop
$ pm2 stop processes.json

# Restart
$ pm2 start processes.json
## Or
$ pm2 restart processes.json

# Reload
$ pm2 reload processes.json

# Graceful Reload
$ pm2 gracefulReload processes.json

# Delete from PM2
$ pm2 delete processes.json

```
