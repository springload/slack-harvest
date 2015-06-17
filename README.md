# Harvester

Plumbing between Slack and Harvest with node.js

Right now, it runs a bot to generate a message asking users to do their timesheets.
The bot options can be configured in `config/default.json`. You'll need a webhook
URL, which you can get from `https://[account].slack.com/services/`.

You'll also need Harvest API credentials. Those are in the UPM under 'Harvest Bot User'.


### TODO
* [ ] Get Public Holidays from an API and respect them.
* [ ] Humanise the message some more "tom, dick __and__ harry"
* [ ] Handle leave, scrum, other calendar events with a nice integration?
* [ ] Open source it (eventually)


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

To bug users on #chatload, just curl the index page:

```bash
curl http://localhost:3000/timesheets-plz/
```

There's also a scheduler via `node-schedule` that automatically runs at
6pm on weekdays.


## Production
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
