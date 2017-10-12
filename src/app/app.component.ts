import { Component, OnInit, ChangeDetectorRef, NgZone } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

import { Observable } from 'rxjs/Observable';
import * as moment from 'moment';

import 'rxjs/add/observable/fromPromise';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/switchMap';

declare var gapi: any;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})

export class AppComponent implements OnInit {
  user = null;
  isSignedIn = false;
  interval;
  events = [];
  scheduledEvents = {};
  apiLoaded;
  apiFailed;
  apiReady = false;

  constructor(private http: HttpClient, private zone: NgZone, private cd: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadClient().then(
        result => {
          this.apiLoaded = true;
          return this.initClient();
        },
        err => {
          this.apiFailed = true;
        }
    ).then(result => {
      this.apiReady = true;
    }, err => {
      this.apiFailed = true;
    }).then(() => {
      let authInstance = gapi.auth2.getAuthInstance();
      // Listen for sign in state changes
      authInstance.isSignedIn.listen(this.updateSigninStatus.bind(this));

      this.updateSigninStatus();
    });
  }

  loadClient(): Promise<any> {
    return new Promise((resolve, reject) => {
      this.zone.run(() => {
        gapi.load('client', {
          callback: resolve,
          onerror: reject,
          timeout: 1000, // 5 seconds.
          ontimeout: reject
        });
      });
    });
  }

  initClient() {
    // Client ID and API key from the Developer Console
    const CLIENT_ID = '311338573945-em8aa6dki87cun1t0u5pcrel3ua8fcp7.apps.googleusercontent.com';

    // Array of API discovery doc URLs for APIs used by the quickstart
    const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'];

    // Authorization scopes required by the API; multiple scopes can be
    // included, separated by spaces.
    const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';

    const initObj = {
      discoveryDocs: DISCOVERY_DOCS,
      clientId: CLIENT_ID,
      scope: SCOPES
    };

    return new Promise((resolve, reject) => {
      this.zone.run(() => {
        gapi.client.init(initObj).then(resolve, reject);
      });
    });
  }

  updateSigninStatus() {
    this.zone.run(() => {
      let authInstance = gapi.auth2.getAuthInstance();

      this.user = authInstance.currentUser.get();
      this.isSignedIn = authInstance.isSignedIn.get();

      this.updateUpcomingEvents();
    });

    if (this.isSignedIn) {
      this.interval = setInterval( () => {
        this.checkForCurrentEvents(this.events);
        this.zone.run(() => {
          this.updateUpcomingEvents();
        });
      }, 1000 * 60);
    } else {
      clearInterval(this.interval);
    }
  }

  updateUpcomingEvents() {
    if (!this.isSignedIn) {
      this.events = [];
      return;
    }

    this.getUpcomingEvents()
      .map((res) => {
        return res.result.items;
      })
      .subscribe((items) => {
        this.events = items.sort((a, b) => {
          return moment(a.start.dateTime).diff(moment(b.end.dateTime));
        });
        items.map((item) => {
          if (!this.scheduledEvents[item.id]) {
            this.scheduledEvents[item.id] = {
              icon: 'spiral_calendar_pad',
              message: 'In a meeting',
              expiresIcon: '',
              expiresMessage: '',
              expiresTime: item.end.dateTime
            };
          } else {
            this.scheduledEvents[item.id].expiresTime = item.end.dateTime;
          }
        });

        this.checkForCurrentEvents(this.events);
        this.cd.detectChanges();
      });
  }

  handleAuthClick() {
    this.zone.run(() => {
      gapi.auth2.getAuthInstance().signIn();
    });
  }

  handleSignoutClick() {
    this.zone.run(() => {
      gapi.auth2.getAuthInstance().signOut();
    });
  }

  checkForCurrentEvents(events) {
    let firstEvent = events[0];

    moment().diff(moment(firstEvent.start.dateTime));

    let minutesUntil = moment(firstEvent.start.dateTime).diff(moment()) / 60000;
    let minutesUntilEnd = moment(firstEvent.end.dateTime).diff(moment()) / 60000;

    console.log('Minutes until event: ' + minutesUntil);
    console.log('Minutes until event ends: ' + minutesUntilEnd);
    // console.log(moment(firstEvent.start.dateTime).fromNow(true));

    let scheduledEvent = this.scheduledEvents[firstEvent.id];

    if (minutesUntil < 0.5 && minutesUntil > -0.49) {
      console.log('setting status');
      this.setStatus(scheduledEvent.message, scheduledEvent.icon);
    }

    if (minutesUntilEnd < 0.5 && minutesUntilEnd > -0.49) {
      console.log('clearing status');
      this.setStatus(scheduledEvent.expiresMessage, scheduledEvent.expiresIcon);
    }
  }

  setStatus(message, icon) {
    let emoji = '';
    if (icon.length > 1) {
      emoji = ':' + icon + ':';
    }

    let response = fetch('http://slack.com/api/users.profile.set?' +
            // Set this to your 'super secret token' token
        'token=' +
        '&profile={ "status_text": "' + message + '", ' +
        '"status_emoji": "' + emoji + '"}', { method: 'POST'})
          .then(res => res.json())
          .then((res) => {
            console.log(res);
          });
  }

  getUpcomingEvents(): Observable<any> {
    return Observable.fromPromise(gapi.client.calendar.events.list({
      'calendarId': 'primary',
      'timeMin': (new Date()).toISOString(),
      'showDeleted': false,
      'singleEvents': true,
      'maxResults': 10,
      'orderBy': 'startTime'
    }));
  }
}
