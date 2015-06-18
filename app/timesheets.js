import config   from 'config';
import Promise  from 'bluebird';
import moment   from 'moment';
import Humanize from 'humanize-plus';


// TODO: Source public holidays from somewhere. We don't want to nag people to
// timesheet for days that shouldn't have time entries.
//
// This would also mean checking the entries for each day, rather than the quick
// and very dirty check on the 'updated_at' time for each user.
//
// ASB's public API seems to have some sweet data, but needs a token:
// https://developer.asb.co.nz/documentation/public-holidays

// https://www.govt.nz/browse/work/public-holidays-and-work/public-holidays-and-anniversary-dates/

const publicHolidays = config.get('holidays');

const SUNDAY        = 0;
const MONDAY        = 1;
const TUESDAY       = 2;
const WEDNESDAY     = 3;
const THURSDAY      = 4;
const FRIDAY        = 5;
const SATURDAY      = 6;


function isHoliday(today) {
    const weekend = [SUNDAY, SATURDAY];

    if (weekend.indexOf(today.day()) > -1) {
        return true;
    }

    const dates = publicHolidays.map(str => moment(str, "DD-MM-YYYY"));
    var isTodayHoliday = dates.find(date => date.isSame(today, 'day'));

    if (!isTodayHoliday) {
        isTodayHoliday = false;
    }

    return isTodayHoliday;
}


// Returns objects containing the slack and the harvest side of the relationship
// joined by email address
function mapUsers(slackResult, harvestResult) {
    const excludedUsers = config.get('harvest.exclude') || [];

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
        var isWhiteListed = (excludedUsers.indexOf(worker.user.email) === -1);

        if (!isWhiteListed) {
            console.log('Excluded %s', worker.user.email);
        }

        return isUserActive && isUserFTE && isWhiteListed;
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



function askNicelyOnSlack(slack, users, today) {
    const humanisedDate = today.format('dddd');
    const webhookUrl = config.get('slack.timesheets.webhook');

    const userList = users.map(user => {
        return `<@${user.slackUser.id}|${user.slackUser.name}>`;
    });

    const message = [
        'Hey ',
        Humanize.oxford(userList),
        '. Could you check your timesheets are up to date for ',
        humanisedDate,
        '? ',
    ].join('')

    const payload = {
        'text': message,
        'username': config.get('slack.timesheets.botName'),
        'icon_emoji': config.get('slack.timesheets.botEmoji'),
        'channel': config.get('slack.timesheets.channel')
    };

    // slack.setWebhook(config.get('slack.timesheets.webhook'));
    // return slack
    //     .webhookAsync(payload)
    //     .then(result => {
    //         console.log(result);
    //     })
    //     .catch(err => {
    //         console.log(err);
    //     })
}


function getDayOfInterest() {
    const TIMESHEET_DEADLINE = 19; // 7pm!
    const currentTime = moment();
    var currentDay;

    const todayAt6pm = moment().hour(TIMESHEET_DEADLINE);

    // Roll back to the previous day. If it's Monday, roll back to Friday.
    if (currentTime.isBefore(todayAt6pm)) {
        currentDay = currentTime.day();

        // If it's monday, check Friday's timesheet instead.
        if (currentDay === MONDAY) {
            currentTime.day( currentDay - 3);
        } else {
            currentTime.day(currentDay - 1).hour(TIMESHEET_DEADLINE);
        }
    }

    return currentTime;
}


export default function checkTimeSheets(slack, harvest) {
    // Promise.join() has a weird syntax... uses a callback as the final argument
    // rather than a typical promise.then(). Still, it saves some typing so
    // using it here :)

    const People            = Promise.promisifyAll(harvest.People);
    const Reports           = Promise.promisifyAll(harvest.Reports);
    const THROTTLE_SPEED    = 200;
    const today             = getDayOfInterest();
    const todayUTC          = today.format('YYYYMMDD');

    // Don't bother people on weekends and days off.
    if (isHoliday(today)) {
        return Promise.delay(1).then(() => {
            return {
                'isHoliday': true
            }
        });
    }

    console.log('Fetching time entries for %s', today.format());

    return Promise.join(
        slack.apiAsync('users.list'),
        People.listAsync({}),
        mapUsers
    )
    .map((user, index) => {
         return Promise
                .delay(THROTTLE_SPEED * index)
                .then(() => {
                    console.log('Fetching entries for %s', user.slackUser.real_name)
                    return Reports.timeEntriesByUserAsync({
                        user_id: user.harvestUser.id,
                        from: todayUTC,
                        to: todayUTC
                    })
                })
                .then(entries => {
                    user.entries = entries;
                    return user;
                }).catch(err => { console.log(err) });
    })
    .then(users => {
        const usersOfInterest = users.filter(user => {
            if (!user.entries.length) {
                return true;
            }
            return false;
        });

        if (usersOfInterest.length) {
            askNicelyOnSlack(slack, usersOfInterest, today);
        }

        return usersOfInterest;
    })
    .catch(err => {
        console.log(err);
        throw new Error(err);
    });
}
