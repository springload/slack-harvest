import config   from 'config';
import Promise  from 'bluebird';
import moment   from 'moment';

const SUNDAY        = 0;
const MONDAY        = 1;
const TUESDAY       = 2;
const WEDNESDAY     = 3;
const THURSDAY      = 4;
const FRIDAY        = 5;
const SATURDAY      = 6;


var _isUndefined = function(obj) {
    var i;

    for (i = arguments.length - 1; i >= 1; i--) {
        if(!obj.hasOwnProperty(arguments[i])) {
            return true;
        }
    };
    return false;
};


function monkeyPatchedEntriesByProject(options, cb) {
    if (_isUndefined(options, 'project_id', 'from', 'to')) {
        return cb(new Error('getting time entries by project requires an id \
                            for the project. It also requires UTC dates (e.g. YYYYMMDD) \
                            for both the from date and the to date'));
    }

    var billable = options.billable ? 'yes' : 'no';
    var url = '/projects/' + options.project_id + '/entries?from=' + options.from + '&to=' + options.to + '&billable=' + billable;
    this.client.get(url, {}, cb);
};



function slackNotifyPercentage(slack, percent) {
    const message = [
        'The billable percentage for this week is ',
        percent,
        '%.',
    ].join('')

    const payload = {
        'text': message,
        'username': config.get('slack.billable.botName'),
        'icon_emoji': config.get('slack.billable.botEmoji'),
        'channel': config.get('slack.billable.channel')
    };

    slack.setWebhook(config.get('slack.billable.webhook'));

    console.log("Posting to slack", payload);

    return slack
        .webhookAsync(payload)
        .then(result => {
            console.log(result);
        })
        .catch(err => {
            console.log(err);
        })
}


//
function accumulator(results) {
    var tasksNonBillable = [];
    var tasksBillable = [];
    var billableHours = 0;
    var nonBillableHours = 0;
    var totalHours = 0;
    var billablePercentage = 0;

    results.forEach((item) => {
        tasksBillable = tasksBillable.concat(item.billable);
        tasksNonBillable = tasksNonBillable.concat(item.nonBillable);
    });

    tasksBillable.forEach(task => {
        billableHours = billableHours + task.day_entry.hours
    })

    tasksNonBillable.forEach(task => {
        nonBillableHours = nonBillableHours + task.day_entry.hours
    });

    totalHours = nonBillableHours + billableHours;
    billablePercentage = billableHours / totalHours;

    return {
        results: results,
        totalHours: totalHours,
        billableHours: billableHours,
        nonBillableHours: nonBillableHours,
        billablePercentage: billablePercentage,
        billablePercentageRounded: Math.ceil(billablePercentage * 100)
    }
}


export default function getPercentage(slack, harvest) {
    harvest.Reports.timeEntriesByProject = monkeyPatchedEntriesByProject;

    const Projects     = Promise.promisifyAll(harvest.Projects);
    const Reports      = Promise.promisifyAll(harvest.Reports);

    // Default timescale is a week
    const today         = moment();
    const day           = today.day();
    const dayDelta      = day - MONDAY + 1;
    const past          = moment().subtract(dayDelta, 'days');

    const THROTTLE_SPEED = 500; //ms


    return Projects
        .listAsync({})
        .then(projects => {
            // TODO: Filter out all the inactive/old projects.
            console.log(projects.length);

            projects = projects.filter(item => {
                const hintLatestRecord = moment(item.project.hint_latest_record_at);
                // console.log(hintLatestRecord);

                // Filter out items that haven't been updated in the timeframe
                if (hintLatestRecord.isBefore(past)) {
                    return false;
                }

                return true;
            });

            console.log("Final projects length", projects.length);
            return projects;
        })
        .map((project, index) => {
            const pastUTC = past.format('YYYYMMDD');
            const todayUTC = today.format('YYYYMMDD');

            return Promise
                .delay(THROTTLE_SPEED * index)
                .then(() => {
                    return Promise.all([
                        Reports.timeEntriesByProjectAsync({
                            project_id: project.project.id,
                            from: pastUTC,
                            to: todayUTC,
                            billable: true
                        }),
                        Reports.timeEntriesByProjectAsync({
                            project_id: project.project.id,
                            from: pastUTC,
                            to: todayUTC,
                            billable: false
                        })
                    ])
                    .catch(err => {
                        console.log(err);
                    })
                    .spread((billable, nonBillable) => {
                        // console.log(billable, nonBillable);
                        console.log("fetched project %s (%s)", project.project.name, project.project.id);

                        return {
                            project: project.project,
                            billable,
                            nonBillable
                        }
                    });
                })
        })
        .then(results => {
            //
            results = results.filter(result => {
                if (!result.billable.length && !result.nonBillable.length) {
                    return false;
                }
                return true;
            });

            var allHours = accumulator(results);

            // Post to Slack
            slackNotifyPercentage(slack, allHours.billablePercentageRounded);

            return allHours;
        })

}
