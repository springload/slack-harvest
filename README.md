# Harvester

Plumbing between Slack and Harvest with node.js

Right now, this doesn't do much. It generates a list of users from slack, mashes
them up with a list of users from harvest, paired via email address, and outputs
the result as JSON.


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

Then you can query the APIs and generate users:

```bash
curl http://localhost:3000 > users.json
```



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
