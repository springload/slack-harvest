import config   from 'config';
import Promise  from 'bluebird';
import Slack    from 'slack-node';
import express  from 'express';
import Harvest  from 'harvest';
import moment   from 'moment';
import request  from 'request';
import schedule from 'node-schedule'


// App modules
import timesheets from './app/timesheets';
import billablePercentage from './app/billable-percentage';

// The docs say the following should work for debugging promises, but it doesn't
// seem to work at all. Hmm!
if (process.env.NODE_ENV === 'development') {
    Promise.longStackTraces();
}

// Easier to work with promises than big nested callback trees.
Promise.promisifyAll(Slack.prototype);
Promise.promisifyAll(Harvest.prototype);


const app         = express();
const harvest     = new Harvest({
    subdomain:      config.get('harvest.subdomain'),
    email:          config.get('harvest.email'),
    password:       config.get('harvest.password')
});

const People            = Promise.promisifyAll(harvest.People);
const TimeTracking      = Promise.promisifyAll(harvest.TimeTracking);


// Represent the result of a promise chain as JSON.
function apiResponse(res, promise) {
    promise.then(result => {
        res.json({
            'status': 1,
            'result': result
        });
    })
    .catch(err => {
        res.json({
            'status': 0,
            'error': err
        })
    });
}


app.get('/timesheets-plz/', (req, res) => {
    const slack         = new Slack(config.get('slack.apiToken'));
    const promise       = timesheets(slack, People);

    apiResponse(res, promise)
});


app.get('/percentage-plz/', (req, res) => {
    const slack             = new Slack(config.get('slack.apiToken'));
    const promise           = billablePercentage(slack, harvest);
    apiResponse(res, promise);
});



// Boot the application
const server = app.listen(config.get('port'), () => {
    const name = config.get('name');
    const host = server.address().address;
    const port = server.address().port;

    console.log('%s listening at http://%s:%s', name, host, port);
    console.log('scheduling a timesheet check for 1800h on weekdays')

    // const j = schedule.scheduleJob('* 18 * * 1-5', () => {
    //     const slack         = new Slack(config.get('slack.apiToken'));
    //     console.log('checking timesheets...');
    //     timesheets(slack, People)
    //         .then(result => {
    //             console.log(result);
    //         });
    // });
});
