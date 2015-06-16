import config   from 'config';
import Promise  from 'bluebird';
import Slack    from 'slack-node';
import express  from 'express';
import Harvest  from 'harvest';
import moment   from 'moment';
import request  from 'request';
import schedule from 'node-schedule'

// TODO: Source public holidays from somewhere. We don't want to nag people to
// timesheet for days that shouldn't have time entries.
//
// This would also mean checking the entries for each day, rather than the quick
// and very dirty check on the 'updated_at' time for each user.
//
// ASB's public API seems to have some sweet data, but needs a token:
// https://developer.asb.co.nz/documentation/public-holidays

const publicHolidays = [];

const SUNDAY        = 0;
const MONDAY        = 1;
const TUESDAY       = 2;
const WEDNESDAY     = 3;
const THURSDAY      = 4;
const FRIDAY        = 5;
const SATURDAY      = 6;

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
const slack             = new Slack(config.get('slack.apiToken'));



function isHoliday(date) {
    var weekend = [SUNDAY, SATURDAY];

    if (weekend.indexOf(date.day()) > -1) {
        return true;
    }

    return publicHolidays.indexOf(date.dayOfYear()) > -1;
}


// Returns objects containing the slack and the harvest side of the relationship
// joined by email address
function mapUsers(slackResult, harvestResult) {
    if (!slackResult.ok) {
        throw new Error('Not okay');
    }

    // Strip out all deactivated people who aren't actively working here
    var slackers = slackResult.members.filter(slacker => {
        return slacker.deleted === false;
    });

    var workers = harvestResult.filter(worker => {
        var isUserActive = worker.user.is_active;
        var isUserFTE = !(worker.user.is_contractor);

        return isUserActive && isUserFTE;
    });

    var users = workers.map(user => {
        var harvestEmail = user.user.email;
        var slackUser = slackers.find(i => {
            return i.profile.email === harvestEmail;
        });

        if (!slackUser) {
            return;
        }

        return {
            harvestUser: user.user,
            slackUser: slackUser
        };
    });

    // Strip out users that aren't in both slack and harvest, e.g automated bots
    // and admin accounts. This leaves us with just billable staff, in theory.
    return users.filter(user => {
        return (typeof user !== 'undefined')
    });
}


function getUsersWhoHaventTimeSheeted(users) {
    const TIMESHEET_DEADLINE = 18; // 6pm!
    const currentTime = moment();
    var currentDay;

    const todayAt6pm = moment().hour(TIMESHEET_DEADLINE);

    // Don't bother people on weekends and days off.
    if (isHoliday(currentTime)) {
        return [];
    }

    // Roll back to the previous day. If it's Monday, roll back to Friday.
    if (currentTime.isBefore(todayAt6pm)) {
        currentDay = currentTime.weekday();

        if (currentDay === MONDAY) {
            currentTime.weekday(FRIDAY);
        } else {
            currentTime.weekday(currentDay-1).hour(TIMESHEET_DEADLINE);
        }
    }

    users = users.filter(user => {
        const updatedAt = moment(user.harvestUser.updated_at);

        // Don't nag people about days when the office is shut.
        // TODO: implement this properly
        if (isHoliday(updatedAt)) {
            return false;
        }

        if (updatedAt.isBefore(currentTime, 'day')) {
            return user;
        }
    });

    return {
        users,
        currentTime
    }
}


function askNicelyOnSlack(hitList) {
    const { users, currentTime } = hitList;
    const humanisedDate = currentTime.format('dddd');
    const webhookUrl = config.get('slack.webhook');

    const userList = users.map(user => {
        return user.slackUser.name;
    });

    const message = [
        'Hey ',
        userList.join(', '),
        '. Could you check your timesheets are up to date for ',
        humanisedDate,
        '? <https://springload.harvestapp.com/time>'
    ].join('')

    const payload = {
        'text': message,
        'username': config.get('slack.botName'),
        'icon_emoji': config.get('slack.botEmoji'),
        'channel': config.get('slack.channel')
    };

    slack.setWebhook(config.get('slack.webhook'));

    return slack
        .webhookAsync(payload)
        .then(result => {
            console.log(result);
        })
        .catch(err => {
            console.log(err);
        })
}


function checkTimeSheets() {
    // Promise.join has a weird syntax... uses a callback as the final argument
    // rather than a typical promise.then(). Still, it saves some typing so
    // using it here :)

    return Promise.join(
        slack.apiAsync('users.list'),
        People.listAsync({}),
        mapUsers
    )
    // TODO: Decide if we need to go this far or not
    // .map(user => {
    //     return TimeTracking.dailyAsync({
    //         of_user: user.harvestUser.id,
    //         date: new Date()
    //     }).then(result => {
    //         // console.log(user, result)
    //         user.time = result;
    //         return user;
    //     });
    // })
    .then(users => {
        var hitList = getUsersWhoHaventTimeSheeted(users);

        hitList.users.forEach(user => {
            var u = user.slackUser;
            console.log('Offender: %s – %s (%s)', u.real_name, u.name,  u.profile.email);
        });

        askNicelyOnSlack(hitList);
    })
    .catch(err => {
        throw new Error(err);
    });
}


app.get('/', (req, res) => {
    checkTimeSheets()
        .then((result) => {
            res.json({
                'status': 1,
                'message': 'Done checking timesheets',
                'result': result
            });
        })
        .catch(err => {
            res.json({
                'status': 0,
                'message': 'An error occurred.',
                'error': err
            })
        });
});


// Boot the application
const server = app.listen(config.get('port'), () => {
    const name = config.get('name');
    const host = server.address().address;
    const port = server.address().port;

    console.log('%s listening at http://%s:%s', name, host, port);
    console.log('scheduling checkTimeSheets() for 1800h on weekdays')

    const j = schedule.scheduleJob('* 18 * * 1-5', () => {
        console.log('checking timesheets...');
        checkTimeSheets();
    });
});
