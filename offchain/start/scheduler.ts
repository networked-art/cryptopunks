/*
|--------------------------------------------------------------------------
| Scheduler
|--------------------------------------------------------------------------
*/
import MatchTickJob from '#jobs/match_tick'
import NotificationDrainJob from '#jobs/notification_drain'

void MatchTickJob.schedule({}).id('match-tick').every('15s').run()
void NotificationDrainJob.schedule({}).id('notification-drain').every('10s').run()
