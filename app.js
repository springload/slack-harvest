import config   from 'config';
import Promise  from 'bluebird';
import Slack    from 'slack-node';
import express  from 'express';
import Harvest  from 'harvest';

// Easier to work with promises than big nested callback trees!
Promise.promisifyAll(Slack.prototype);
Promise.promisifyAll(Harvest.prototype);


const app         = express();
const harvest     = new Harvest({
    subdomain:      config.get('harvest.subdomain'),
    email:          config.get('harvest.email'),
    password:       config.get('harvest.password')
});

const People      = Promise.promisifyAll(harvest.People);
const slack       = new Slack(config.get('slack.apiToken'));


slack.setWebhook(config.get('slack.webhookUri'));

app.use(function(req, res, next) {
    req.harvest = harvest;
    req.slack = slack;
    next();
});


app.get('/', function (req, res) {
    var slackUsers = [];

    slack
        .apiAsync("users.list")
        .then(function getSlackUsers(result) {
            if (!result.ok) {
                throw new Error('Not okay');
            }

            var slackers = result.members.filter(function(slacker) {
                return slacker.deleted === false;
            });

            slackUsers = slackers;
            return slackers;
        })
        .then(function() {
            return People.listAsync({});
        })
        .then(function getHarvestUsers(workers) {
            var users = workers.map(function(user) {
                var harvestEmail = user.user.email;
                var slackUser = slackUsers.find(function(i) {
                    return i.profile.email === harvestEmail;
                });
                user.slackUser = slackUser;
                return user;
            });
            res.json(users);
        })
        .catch(function(err) {
            throw new Error(err);
        });
});


const port = config.get('port');

const server = app.listen(port, function () {
    const host = server.address().address;
    const port = server.address().port;
    console.log('%s listening at http://%s:%s',  config.get('name'), host, port);
});
