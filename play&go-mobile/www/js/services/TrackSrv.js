angular.module('viaggia.services.tracking', [])
  .factory('trackService', function (Config, $q, $http, $state, $timeout, $filter, $ionicHistory, LoginService, $ionicPlatform, $ionicPopup, $rootScope, Utils, GeoLocate, BT) {
    var trackService = {};
    var bgGeo = {};
    var appVersion = function () {
      return Config.getVersion();
    };
    var GPSpopup = false;
    var refreshCallback = null;
    var ACCURACY = -1;
    var timerTrack = null;
    var hasLocationPermission = function (cb) {
      if (window.cordova.plugins.diagnostic) {
        cordova.plugins.diagnostic.isLocationAvailable(function (state) {
          cb(state);
        }, function (e) {
          console.log('diagnostic error', e);
          cb(false);
        });
      } else {
        cb(true);
      }
    }

    /**
     * initialize bgPlugin. Setup default HTTP response processor for sync operation - clear DB upon successful sync
     */
    $ionicPlatform.ready(function () {
      bgGeo = window.BackgroundGeolocation;

    });

    /**
     * check tracking state on app resume: if finished - stop, cleanup and call refresg callback if active.
     */
    document.addEventListener("resume", function () {
      if (refreshCallback) {
        refreshCallback();
        refreshCallback = null;
      }
    }, false);


    /**
     * INITIALIZE THE TRACKER. RESTART IF IS RUNNING, OR SYNCHRONIZE IF IS FINISHED.
     */
    trackService.startup = function () {
      var deferred = $q.defer();
      $rootScope.GPSAllow = true;
      var trackingConfigure = Config.getTrackingConfig();
      bgGeo.configure(trackingConfigure, callbackFn, failureFn);
      init();
      deferred.resolve();
      GeoLocate.initLocalization().then(function () {
        hasLocationPermission(function (status) {
          $rootScope.GPSAllow = status;
        });
      }, function () {
        $rootScope.GPSAllow = false;
      });
      return deferred.promise;
    };

    /**
     * send to server the information about tracking start: tripId, transport type (in case of direct tracking), status of geolocalization, and device information
     */
    var sendServerStart = function (trip, tripId, multimodalId, token, transportType, status) {
      var deferred = $q.defer();

      var info = angular.copy(ionic.Platform.device());
      info.trackingStatus = status;
      //add version of application
      info.appVersion = appVersion();
      var url = "";
      if (transportType) {
        url = (Config.getServerGamificationURL() + '/gamification/freetracking/' + transportType + '/' + tripId);
      } else if (tripId.indexOf("temporary") == -1) {
        url = (Config.getServerGamificationURL() + '/gamification/journey/' + tripId);
        trip = {};
      } else {
        url = (Config.getServerGamificationURL() + '/gamification/temporary')
      }
      $http({
        method: 'PUT',
        url: url,
        data: {
          clientId: tripId,
          appId: Config.getAppGameId(),
          userId: LoginService.getUserProfile().userId,
          data: trip
        },
        headers: {
          'Authorization': 'Bearer ' + token,
          'appId': Config.getAppGameId(),
          'deviceInfo': JSON.stringify(info)
        },
        timeout: Config.getHTTPConfig().timeout
      }).success(function () {
        deferred.resolve(true);
      }).error(function (err) {
        console.log(err)
        deferred.reject(false);
      });
      return deferred.promise;;

    }

    /*
     *check if GPS signal is present and accurated
     *
     */
    trackService.checkLocalization = function () {
      var deferred = $q.defer();
      hasLocationPermission(function (status) {
        if (!status) {
          deferred.reject(Config.getErrorGPSNoSignal());
          return;
        }
        //check gps and accuracy
        launchGeoConfiguration({
          timeout: 10, // 10 seconds timeout to fetch location
          maximumAge: 50000, // Accept the last-known-location if not older than 50 secs.
        }, function (location, taskId) {
          if (location.coords.accuracy > ACCURACY) {
            deferred.reject(Config.getErrorLowAccuracy());
          } else {
            deferred.resolve(location.coords.accuracy);

          }
        }, function (errorCode) {
          console.log(errorCode);
          //if 0,1 -> GPS off
          deferred.reject(Config.getErrorGPSNoSignal());
        });
      });
      return deferred.promise;
    }
    /**
     * check if the specified trip is currently tracked
     */
    trackService.isThisTheJourney = function (tripId) {
      if (localStorage.getItem(Config.getAppId() + '_tripId') == tripId) {
        return true;
      }
      return false;
    }
    /**
     * If the specified trip tracking is available for tracking: non recurrent is available on its
     * specified day, recurrent - on any day corresponding to the recurrency information.
     * If already tracked for the day, then is not available
     */
    trackService.isAvailableForDay = function (tripId) {
      var date = new Date();
      date.setHours(0, 0, 0, 0);
      var doneTrips = JSON.parse(localStorage.getItem(Config.getAppId() + "_doneTrips"));

      if (doneTrips && Number(doneTrips[tripId]) == date.getTime()) {
        return false;
      }
      return true;
    }

    var getEndTime = function (startime, endtime, recurrency) {
      var now = new Date();
      var duration = endtime - startime;
      var newEndTime = now.getTime() + duration;
      return newEndTime;
    }

    /**
     * Check whether the trip with the specified start time and recurrency is currently applicable
     * (i.e., current time is within +-threshold from the start time)
     */
    trackService.isInTime = function (startime, recurrency) {
      // return trackService.isInTime($scope.currentItinerary.startime,$scope.recurrency.daysOfWeek);
      var now = new Date();
      //if recurrent check only hours if day is correct;
      var startTime = startime;
      if (recurrency && recurrency.daysOfWeek && recurrency.daysOfWeek.length > 0) {
        if (Utils.contains(recurrency.daysOfWeek, now.getDay())) {
          var startTimeDate = new Date(startime);
          //var today = new Date();
          startTimeDate.setFullYear(now.getFullYear());
          startTimeDate.setMonth(now.getMonth());
          startTimeDate.setDate(now.getDate());
          startTime = startTimeDate.getTime();
        } else return -1;
      }
      if (now.getTime() > new Date(startTime + Config.getThresholdStartTime())) {
        return 1;
      }
      if (now.getTime() < new Date(startTime - Config.getThresholdStartTime())) {
        return -1;
      }
      return 0;
    }

    /**
     * Start direct tracking of the specified transport type
     */
    trackService.startTransportTrack = function (transport) {
      var deferred = $q.defer();
      if (trackService.trackingIsGoingOn() && !trackService.trackingIsFinished()) {
        deferred.resolve();
      } else {
        localStorage.setItem(Config.getAppId() + '_trackedTransport', transport);
        var ts = new Date().getTime();
        var tripId = transport + '_' + ts;
        //if same group multimodal is present, otherwise create a new multimodalid
        var multimodalId = localStorage.getItem(Config.getAppId() + '_multimodalId');
        if (!multimodalId) {
          multimodalId = 'multimodal_' + ts;
          //set id for db
          localStorage.setItem(Config.getAppId() + '_dbId', tripId);
        }
        // default duration set to 1 month
        trackService.start(tripId, multimodalId, {
            data: {
              startime: ts,
              endtime: ts + 2 * 24 * 60 * 60 * 1000
            }
          }, null)
          .then(function () {
            if (transport === 'bus') {
              BT.startScan(function (btId) {
                launchGeoConfiguration({}, function (location, taskId) {
                  location.extras = {
                    idTrip: tripId,
                    multimodalId: multimodalId,
                    start: ts,
                    transportType: transport,
                    btDeviceId: btId
                  }; // <-- add some arbitrary extras-data
                  //                      // Insert it.
                  bgGeo.insertLocation(location, function () {
                    bgGeo.finish(taskId);
                  });
                });
              });
            }
            deferred.resolve();
          }, function (errorCode) {
            deferred.reject(errorCode);
          });


      }
      return deferred.promise;
    }

    /**
     * Start planned tracking on the fly
     */
    trackService.startTemporary = function (tripId, trip, callback) {
      var deferred = $q.defer();
      if (trackService.trackingIsGoingOn() && !trackService.trackingIsFinished()) {
        deferred.resolve();
      } else {
        //check temporary flow
        var startTimestamp = new Date().getTime();
        LoginService.getValidAACtoken().then(function (token) {
          launchGeoConfiguration({}, function (location, taskId) {
            sendServerStart(trip, tripId, null, token, null, -1).then(function () {
              location.extras = {
                idTrip: tripId,
                start: startTimestamp
              }; // <-- add some arbitrary extras-data
              //                      // Insert it.
              bgGeo.insertLocation(location, function () {
                bgGeo.finish(taskId);
              });
              trip.tripId = tripId;
              localStorage.setItem(Config.getAppId() + '_temporary', JSON.stringify(trip));
              trackService.start(tripId, null, {
                  data: trip
                }, callback, startTimestamp)
                .then(function () {
                  deferred.resolve();
                }, function (errorCode) {
                  deferred.reject(errorCode);
                });
            }, function (err) {
              //in case of temporary journey, if start doesn't arrive, stop it
              bgGeo.stop(function () {
                clean()
                deferred.reject("temporary");
              });


            })

          }, function (errorCode) {
            bgGeo.stop(function () {
              clean()
              deferred.reject(errorCode);
            });

          })
        }, function (err) {

          deferred.reject(err);

        })





      }
      return deferred.promise;
    }
    /**
     * Compute tracked information of the saved track with the specified ID.
     *
     */
    trackService.computeInfo = function () {
      var trackId = localStorage.getItem(Config.getAppId() + '_tripId');
      var deferred = $q.defer();
      bgGeo.getLocations(function (locations, taskId) {
        bgGeo.finish(taskId);
        var tripLocs = [];
        locations.forEach(function (l) {
          if (l.extras && trackId == l.extras.idTrip) {
            tripLocs.push(l);
          }
        });

        var realTripLocs = [];
        var prev = null;
        if (tripLocs.length > 0) {
          realTripLocs.push(tripLocs[tripLocs.length - 1]);
          prev = tripLocs[tripLocs.length - 1].timestamp;
        }
        for (var i = tripLocs.length - 2; i >= 0; i--) {
          if (tripLocs[i].timestamp > prev) {
            console.log('inversion!!!!!');
          } else {
            realTripLocs.push(tripLocs[i]);
            prev = tripLocs[i].timestamp;
          }
        }
        tripLocs = realTripLocs;
        tripLocs.sort(function (la, lb) {
          return la.timestamp - lb.timestamp;
        });
        var data = {
          dist: 0,
          transport: localStorage.getItem(Config.getAppId() + '_trackedTransport'),
          // points: 0,
          valid: true
        };
        var transLocs = GeoLocate.transform(tripLocs);
        var dist = 0;
        var maxSpeed = 0;
        for (var i = 1; i < transLocs.length; i++) {
          var iv = GeoLocate.distance([transLocs[i - 1].lat, transLocs[i - 1].lng], [transLocs[i].lat, transLocs[i].lng]);
          var time = Math.abs(transLocs[i].timestamp - transLocs[i - 1].timestamp);
          if (time > 0) {
            var speed = iv * 1000 * 1000 / time;
            maxSpeed = Math.max(maxSpeed, speed);
          }
          dist += iv;
        }
        if (tripLocs.length > 0) {
          data.dist = dist * 1000; // in meters
          data.start = tripLocs[0].timestamp;
          data.end = tripLocs[tripLocs.length - 1].timestamp;
          data.avgSpeed = data.dist / (data.end - data.start) * 1000; // in m/s
          data.maxSpeed = maxSpeed; // in m/s
        } else {
          data.valid = false;
        }
        deferred.resolve(data);
      }, function (error) {
        deferred.reject();
      });
      return deferred.promise;
    }

    var checkMaxSpeed = function (mean, speed) {
      if (mean == 'walk') return (speed * 3.6 < 20);
      else if (mean == 'bike') return (speed * 3.6 < 65);
      else return true;
    }

    var launchGeoConfiguration = function (options, successFn, failFn) {
      var isAndroid = ionic.Platform.isAndroid();
      var currentPlatformVersion = ionic.Platform.version();
      var returnObj = {};
      if (isAndroid && currentPlatformVersion < 4.4 || !bgGeo.reset) {
        bgGeo.getCurrentPosition(successFn, failFn, options)
      } else {
        bgGeo.getCurrentPosition(options, successFn, failFn)
      }

    }
    var manageStartToServer = function (trip, idTrip, multimodalId, transportType, startTimestamp) {
      var deferred = $q.defer();
      var temporary = false;
      if (trip) {
        LoginService.getValidAACtoken().then(function (token) {

          launchGeoConfiguration({
            timeout: 10, // 10 seconds timeout to fetch location
            maximumAge: 50000, // Accept the last-known-location if not older than 50 secs.
            //minimumAccuracy: ACCURACY,
            desiredAccuracy: ACCURACY, // Fetch a location with a minimum accuracy of ACCURACY meters.
            extras: {
              idTrip: idTrip,
              multimodalId: multimodalId,
              start: startTimestamp,
              transportType: transportType
            }
          }, function (location, taskId) {
            sendServerStart(trip.data, idTrip, multimodalId, token, transportType, -1).then(function () {
              location.extras = {
                idTrip: idTrip,
                multimodalId: multimodalId,
                start: startTimestamp,
                transportType: transportType
              }; // <-- add some arbitrary extras-data
              //                      // Insert it.
              bgGeo.insertLocation(location, function () {
                bgGeo.finish(taskId);
              });
              deferred.resolve();
            }, function (err) {
              //in case of temporary journey, if start doesn't arrive, stop it
              deferred.resolve();
            })
          }, function (errorCode) {
            deferred.resolve();
          })
        }, function (err) {
          deferred.resolve();
        })
      } else {
        deferred.resolve();
      }
      return deferred.promise;

    }
    /**
     * START THE TRACKER FOR THE SPECIFIED TRIP.
     * If trip object is specified, then the tracking data is updated with its properties (start/end time).
     * If callback is specified, this will be executed upon end of tracking time.
     */
    trackService.start = function (idTrip, multimodalId, trip, callback, timestamp) {
      var deferred = $q.defer();
      // LoginService.getValidAACtoken().then(function (token) {
      var today = new Date();
      refreshCallback = callback;
      var startTimestamp = new Date().getTime();
      var today = new Date();
      var endtimeDate = new Date();
      endtimeDate.setDate(today.getDate() + 1);
      var transportType = null;
      var trackingConfigure = {};
      try {
        if (trip) {
          endtimeDate = new Date(getEndTime(Number(trip.data.startime), Number(trip.data.endtime), trip.recurrency));
          if (timestamp) {
            startTimestamp = timestamp;
          } else {
            startTimestamp = new Date().getTime();
          }
        } else {
          var lastRememberedEnd = localStorage.getItem(Config.getAppId() + '_endTimestamp');
          if (lastRememberedEnd) {
            endtimeDate = new Date(Number(lastRememberedEnd));
          }
          startTimestamp = new Date(Number(localStorage.getItem(Config.getAppId() + '_startTimestamp'))).getTime();
        }
        endtime = endtimeDate.getTime() + Config.getThresholdEndTime();
        var duration = endtime - today.getTime();
        //configuro il plugin con i vari param
        trackingConfigure = Config.getTrackingConfig();
        var minutesOfRun = duration / 60000;
        trackingConfigure['stopAfterElapsedMinutes'] = Math.floor(minutesOfRun);
        trackingConfigure['notificationTitle'] = $filter('translate')('tracking_notification_title');
        trackingConfigure['notificationText'] = $filter('translate')('tracking_notification_text');
        transportType = localStorage.getItem(Config.getAppId() + '_trackedTransport');
        if (!transportType) {
          transportType = null;
        }
      } catch (err) {
        //use default value
      }
      trackingConfigure['extras'] = {
        idTrip: idTrip,
        multimodalId: multimodalId,
        start: startTimestamp,
        transportType: transportType
      };
      //setto le variabili in localstorage
      if (trip) {
        localStorage.setItem(Config.getAppId() + '_state', 'TRACKING');
        localStorage.setItem(Config.getAppId() + '_tripId', idTrip);
        localStorage.setItem(Config.getAppId() + '_multimodalId', multimodalId);
        //se c'e' gia' e' multimodal e non lo sovrascrivo
        if (!localStorage.getItem(Config.getAppId() + '_startTimestamp')) {
          localStorage.setItem(Config.getAppId() + '_startTimestamp', startTimestamp);
        }
        localStorage.setItem(Config.getAppId() + '_endTimestamp', endtime);
        if (trip.data && trip.data.customData) {
          localStorage.setItem(Config.getAppId() + '_expectedPoints', trip.data.customData['estimatedScore']);
        }
        //taggo la prima locazione con parametro extra
      }
      if (!bgGeo) {
        deferred.resolve();
        return;
      }
      bgGeo.configure(trackingConfigure, callbackFn, failureFn);
      timerTrack = $timeout(function () {
        trackService.stop();
        if (callback) callback();
      }, duration);
      bgGeo.start(function () {
        bgGeo.changePace(true);

        //if not temporary try to send start otherwise u already send it
        if (idTrip.indexOf("temporary") == -1) {
          manageStartToServer(trip, idTrip, multimodalId, transportType, startTimestamp).then(function () {
            deferred.resolve();
          }, function (err) {
            deferred.reject();
          });
        } else {
          deferred.resolve();
        }
      });
      return deferred.promise;
    };

    var sync = function () {
      var deferred = $q.defer();
      $rootScope.syncRunning = true;

      LoginService.getValidAACtoken().then(function (token) {
        var trackingConfigure = Config.getTrackingConfig();
        //trackingConfigure['url'] += token;
        trackingConfigure['headers'] = { // <-- Optional HTTP headers
          'Authorization': 'Bearer ' + token,
          'appId': Config.getAppGameId()
        }
        trackingConfigure['foregroundService'] = false;
        if (!bgGeo) {
          $rootScope.syncRunning = false;
          deferred.resolve(true);
          return;
        }
        bgGeo.configure(trackingConfigure, callbackFn, failureFn);
        bgGeo.start(function () {
          bgGeo.getLocations(function (locations, taskId) {
            bgGeo.finish(taskId);
            if (locations == null || locations.length == 0) {
              $rootScope.syncRunning = false;
              deferred.resolve(true);
              return;
            }
            var device = angular.copy(ionic.Platform.device());
            device.appVersion = appVersion();
            $http({
              method: 'POST',
              url: trackingConfigure['url'],
              data: {
                location: locations,
                device: device
              },
              headers: {
                'Authorization': 'Bearer ' + token,
                'appId': Config.getAppGameId()
              }
            }).then(function (response) {
              console.log('Geo Sync SUCCESS: ' + locations.length);
              if (response.status == 200 && response.data && 'OK' == response.data.storeResult) {
                bgGeo.clearDatabase(function () {
                  console.log('- cleared database');
                });
                $rootScope.syncRunning = false;
                deferred.resolve(true);
              } else {
                console.log('Geo Sync FAILURE: ' + JSON.stringify(response));
                $rootScope.syncRunning = false;
                deferred.resolve(false);
              }
            }, function (err) {
              console.log('Geo Sync FAILURE: ' + JSON.stringify(err));
              console.log(err);
              $rootScope.syncRunning = false;
              deferred.resolve(false);
            });

          }, function (error) {
            $rootScope.syncRunning = false;
            deferred.resolve(false);
          });
        }, function (error) {
          $rootScope.syncRunning = false;
          deferred.resolve(false);
        });
      }, function (error) {
        // no token obtained
        $rootScope.syncRunning = false;
        deferred.resolve(false);
      });
      return deferred.promise;
    };


    /**
     * STOP THE TRACKER.
     * Synchronize data and stop the plugin.
     */
    trackService.stop = function () {
      var deferred = $q.defer();
      markAsDone();
      // addTravelDiary();
      clean();
      //delete timer if pending
      $timeout.cancel(timerTrack);
      sync().then(function (done) {
        deferred.resolve();
        if (bgGeo) bgGeo.stop();
      }, function (error) {
        deferred.resolve();
        if (bgGeo) bgGeo.stop();
      });
      BT.stopScan();

      return deferred.promise;
    };

    /**
     * STOP THE TRACKER WITHOUTH SYNCH.
     * Used for changing on the fly .
     */
    trackService.stopNoSynch = function () {
      var deferred = $q.defer();
      markAsDone();
      cleanPartially();
      //delete timer if pending
      $timeout.cancel(timerTrack);
      if (bgGeo) {
        bgGeo.stop(function () {
          deferred.resolve();
        }, function () {
          deferred.reject();
        });
      }
      BT.stopScan();
      return deferred.promise;
    };


    var markAsDone = function () {

      var tripId = localStorage.getItem(Config.getAppId() + "_tripId");
      var date = new Date();
      date.setHours(0, 0, 0, 0);
      var doneTrips = JSON.parse(localStorage.getItem(Config.getAppId() + "_doneTrips"));
      if (!doneTrips) {
        doneTrips = {};
      }
      doneTrips[tripId] = date.getTime();
      localStorage.setItem(Config.getAppId() + "_doneTrips", JSON.stringify(doneTrips));
    }


    var init = function () {
      //choose if go on with tracking
      //or manage the stop and sync the data
      if (trackService.trackingIsGoingOn() && !trackService.trackingIsFinished()) {
        trackService.start(localStorage.getItem(Config.getAppId() + '_tripId'), localStorage.getItem(Config.getAppId() + '_multimodalId'));
      } else {
        //preserve strange state when user delete memory and tracking service start again
        trackService.stop();
      }
      //check localstorage
    };

    /**
     * Checki if the tracking has finished
     */
    trackService.trackingIsFinished = function () {
      //if is present timestamp of finish
      if (localStorage.getItem(Config.getAppId() + '_endTimestamp') != null) {
        //and it is earlier than now
        var endtimestamp = localStorage.getItem(Config.getAppId() + '_endTimestamp');
        if (Number(endtimestamp) > new Date().getTime()) {
          return false;
        }
      }
      return true;

    }

    var clean = function () {
      //clean local db
      //clean local storage data from localstorage
      localStorage.removeItem(Config.getAppId() + '_state');
      localStorage.removeItem(Config.getAppId() + '_tripId');
      localStorage.removeItem(Config.getAppId() + '_dbId');
      localStorage.removeItem(Config.getAppId() + '_multimodalId');
      localStorage.removeItem(Config.getAppId() + '_startTimestamp');
      localStorage.removeItem(Config.getAppId() + '_endTimestamp');
      localStorage.removeItem(Config.getAppId() + '_trackedTransport');
      localStorage.removeItem(Config.getAppId() + '_expectedPoints');
    };

    var cleanPartially = function () {
      //leave multimodal
      localStorage.removeItem(Config.getAppId() + '_state');
      localStorage.removeItem(Config.getAppId() + '_tripId');
      localStorage.removeItem(Config.getAppId() + '_endTimestamp');
      localStorage.removeItem(Config.getAppId() + '_trackedTransport');
      localStorage.removeItem(Config.getAppId() + '_expectedPoints');
    };

    trackService.cleanTracking = function () {
      clean();
    }
    /**
     * Return type of transport used for direct tracking (if any)
     */
    trackService.trackedTransport = function () {
      return localStorage.getItem(Config.getAppId() + '_trackedTransport');
    }

    /**
     * Return timestamp of the tracking start.
     */
    trackService.trackingTimeStart = function () {
      return new Date(Number(localStorage.getItem(Config.getAppId() + '_startTimestamp')));
    }

    /**
     * Return true if tracking is currently goes on according to the state recorded.
     */
    trackService.trackingIsGoingOn = function () {
      //check local storage is tracking
      if (localStorage.getItem(Config.getAppId() + '_state') != null) {
        return true;
      }
      return false;
    }
    /**
     * This callback will be executed every time a geolocation is recorded in the background.
     */
    var callbackFn = function () {
      console.log('[js] BackgroundGeoLocation configure callback');
    };

    var failureFn = function (error) {
      console.log('BackgroundGeoLocation error');
    };

    /**
     * Return true if the tracking is going on (estimated end time is not yet reached and the state is 'tracking')
     */
    trackService.isTracking = function (id) {
      //return true if this is the tracking is going to track and is going
      if (trackService.isThisTheJourney(id) && trackService.trackingIsGoingOn()) {
        return true;
      }
      return false;
    }

    /**
     * Popup to show in case no geolocation options are available
     */
    trackService.geolocationPopup = function () {
      var alert = $ionicPopup.alert({
        title: $filter('translate')("pop_up_no_geo_title"),
        template: $filter('translate')("pop_up_no_geo_template"),
        buttons: [{
          text: $filter('translate')("btn_close"),
          type: 'button-custom'
        }]
      });
      alert.then(function (e) {
        trackService.startup();
        //if I'm visualizing the map, go to home page
        if ($state.current.name === 'app.mapTracking') {
          $ionicHistory.nextViewOptions({
            disableBack: true
          });
          $state.go('app.home.home');
        }
      });
    }
    /**
     * Popup to show in case no geolocation options are available
     */
    trackService.noStartPopup = function () {
      var alert = $ionicPopup.alert({
        title: $filter('translate')("pop_up_no_start_title"),
        template: $filter('translate')("pop_up_no_start_template"),
        buttons: [{
          text: $filter('translate')("btn_close"),
          type: 'button-custom'
        }]
      });
      alert.then(function (e) {
        trackService.startup();
      });
    }
    /**
     * Popup to show in case permission has been disabled during a record of a track
     */
    trackService.geolocationDisabledPopup = function () {
      //reset the variable
      if (!GPSpopup) {
        GPSpopup = true;
        var alert = $ionicPopup.alert({
          title: $filter('translate')("gps_disabled_title"),
          template: $filter('translate')("gps_disabled_template"),
          buttons: [{
            text: $filter('translate')("btn_close"),
            type: 'button-custom'
          }]
        });

        alert.then(function (e) {
          GPSpopup = false;
          trackService.startup();
          $ionicHistory.goBack();

        });
      }
    }

    /**
     * Update the local notifications to be triggered before the start time of the instances to track.
     */
    trackService.updateNotification = function (trips, tripId, action) {
      if (window.plugin && cordova && cordova.plugins && cordova.plugins.notification) {
        console.log('initializing notifications...');
        //create a notification that fire in that day and if it is recursive every n day
        // notifications for 1 month range
        var dFrom = new Date(); //from today
        var dTo = new Date(); //to next month
        dTo.setMonth(dTo.getMonth() + 3);
        var notifArray = [];
        var tripsArray = [];
        if (trips) {
          for (var key in trips) {
            tripsArray.push(trips[key]);
          }
        }
        cordova.plugins.notification.local.clearAll(function () {
          //for all trips regens notifications
          cordova.plugins.notification.local.cancelAll(function () {
            cordova.plugins.notification.local.getAll(function (notifications) {
              console.log(JSON.stringify(notifications));
            });
          });


          action = "create";
          var idNotification = 0;
          for (var k = 0; k < tripsArray.length; k++) {

            tripToSave = tripsArray[k];
            if (tripToSave.recurrency && tripToSave.recurrency.daysOfWeek && tripToSave.recurrency.daysOfWeek.length != 0) {
              //add into array one notification for every trip if recursive
              var arrayOfDate = getnotificationDates(tripToSave);
              arrayOfDate.forEach(function (calculateddate) {
                var targetDate = new Date(calculateddate - (1000 * 60 * 10));
                if (targetDate > dFrom) {
                  notifArray.push({
                    id: idNotification,
                    title: $filter('translate')('notification_tracking_title'),
                    text: $filter('translate')('notification_tracking_text'),
                    icon: 'res://notification.png',
                    //autoCancel: false,
                    autoClear: false,
                    at: targetDate,
                    data: {
                      tripId: tripToSave.clientId
                    }
                  })
                }
                idNotification++;
              });
            } else {
              //put just one notification
              //tripToSave.data.startime - 10 min
              var targetDate = new Date(tripToSave.data.startime - (1000 * 60 * 10));
              if (targetDate > dFrom) {
                notifArray.push({
                  id: idNotification,
                  title: $filter('translate')('notification_tracking_title'),
                  text: $filter('translate')('notification_tracking_text'),
                  icon: 'res://notification.png',
                  //autoCancel: false,
                  autoClear: false,
                  at: targetDate,
                  data: {
                    tripId: tripToSave.clientId
                  }
                });
              }
              idNotification++;
            }
          }
          if (cordova && cordova.plugins && cordova.plugins.notification && notifArray) {
            switch (action) {
              case "create":
                cordova.plugins.notification.local.schedule(notifArray);

                cordova.plugins.notification.local.on("click", function (notification) {
                  JSON.stringify(notification);
                  $state.go("app.tripdetails", {
                    tripId: JSON.parse(notification.data).tripId
                  })
                });
                break;
              case "delete":
                break;
              case "modify":
                //clear with id and add new
                var indexNotify = [];
                for (var i = 0; i < notifArray.length; i++) {
                  indexNotify.push(notifArray[i].id);

                }
                cordova.plugins.notification.local.schedule(notifArray);
                cordova.plugins.notification.local.on("click", function (notification) {
                  JSON.stringify(notification);
                  $state.go("app.tripdetails", {
                    tripId: JSON.parse(notification.data).tripId
                  })
                });
                break;
            }

          }
        }, this);

      }
    };


    function getnotificationDates(trip) {
      var arrayOfDate = [];
      var tripHour = new Date(trip.data.startime);
      var now = new Date();
      var dFrom = new Date(); //from today
      dFrom.setFullYear(tripHour.getFullYear());
      dFrom.setMonth(tripHour.getMonth());
      dFrom.setDate(tripHour.getDate());
      dFrom.setHours(tripHour.getHours());
      dFrom.setMinutes(tripHour.getMinutes());
      dFrom.setSeconds(tripHour.getSeconds());
      dFrom.setMilliseconds(tripHour.getMilliseconds());
      var dTo = new Date(); //to next month
      dTo.setFullYear(tripHour.getFullYear());
      dTo.setMonth(tripHour.getMonth() + 3);
      dTo.setDate(tripHour.getDate());
      dTo.setHours(tripHour.getHours());
      dTo.setMinutes(tripHour.getMinutes());
      dTo.setSeconds(tripHour.getSeconds());
      dTo.setMilliseconds(tripHour.getMilliseconds());
      //dTo.setMonth(dTo.getMonth() + 3);
      var next_date = dFrom.setDate(dFrom.getDate());

      //from today to next month do:
      while (dFrom < dTo) {

        var next_days_date = new Date(next_date);
        if (next_days_date > now) {
          day_index = next_days_date.getDay();
          if (day_index == 0) {
            day_index = 7;
          }
          if (trip.recurrency.daysOfWeek.indexOf(day_index) != -1) {
            arrayOfDate.push(next_days_date);
          }
        }
        // increment the date
        var next_date = dFrom.setDate(dFrom.getDate() + 1);

        dFrom = new Date(next_date);
      }
      return arrayOfDate;
    };


    // FOR testing only
    trackService.checkLocations = function () {

      var NumberLong = function (n) {
        return n;
      }
      var ISODate = function (s) {
        return new Date(s);
      }
      var locations = [];
      var tripLocs = [];
      locations.forEach(function (l) {
        l.timestamp = l.recorded_at.getTime();
        l.coords = {
          latitude: l.latitude,
          longitude: l.longitude,
          accuracy: l.accuracy
        };
        tripLocs.push(l);
      });
      tripLocs.sort(function (la, lb) {
        return la.timestamp - lb.timestamp;
      });

      var data = {
        dist: 0,
        transport: 'bike',
        points: 0,
        valid: true
      };

      var transLocs = GeoLocate.transform(tripLocs);
      transLocs.sort(function (la, lb) {
        return la.timestamp - lb.timestamp;
      });
      var dist = 0;
      var maxSpeed = 0;
      var maxSpeedCount = 0;
      for (var i = 1; i < transLocs.length; i++) {
        var iv = GeoLocate.distance([transLocs[i - 1].lat, transLocs[i - 1].lng], [transLocs[i].lat, transLocs[i].lng]);
        var time = Math.abs(transLocs[i].timestamp - transLocs[i - 1].timestamp);
        if (time > 0) {
          var speed = iv * 1000 * 1000 / time;
          if (checkMaxSpeed(data.transport, speed)) {
            maxSpeedCount = 0;
          } else {
            maxSpeedCount++;
            if (maxSpeedCount > 3) {
              data.valid = false;
            }
          }
          maxSpeed = Math.max(maxSpeed, speed);
        }
        dist += iv;
      }
      if (tripLocs.length > 0) {
        data.dist = dist * 1000; // in meters
        data.start = tripLocs[0].timestamp;
        data.end = tripLocs[tripLocs.length - 1].timestamp;
        data.avgSpeed = data.dist / (data.end - data.start) * 1000; // in m/s
        data.maxSpeed = maxSpeed; // in m/s
        if (data.transport == 'walk') {
          data.points = data.dist > 250 ? Math.round(Math.min(53, data.dist / 1000 * 10 * 1.5)) : 0;
          data.valid = data.valid && (data.avgSpeed * 3.6) < 15; // avg (max) speed should be less than 15 (20) km/h (consider running)
        } else if (data.transport == 'bike') {
          data.points = Math.round(Math.min(53, data.dist / 1000 * 5 * 1.5));
          data.valid = data.valid && (data.avgSpeed * 3.6) < 27; // avg (max) speed should be less than 15 (65) km/h
        } else {
          data.points = localStorage.getItem(Config.getAppId() + '_expectedPoints');
        }
      }
    }

    return trackService;
  })

  .factory('BT', function ($http, $q, $ionicPlatform, $timeout) {
    $ionicPlatform.ready(function () {
      if (!window.bluetoothSerial || ionic.Platform.isIOS()) return;

      $http.get('data/bus.csv').then(function (data) {
        var lines = data.data.split('\n');
        lines.forEach(function (line) {
          var fields = line.split(';');
          if (fields.length == 3 && !!fields[2] && !!fields[0]) {
            var addr = fields[2].toLowerCase();
            addr = addr.substr(0, 2) + ':' + addr.substr(2, 2) + ':' + addr.substr(4, 2) + ':' + addr.substr(6, 2) + ':' + addr.substr(8, 2) + ':' + addr.substr(10, 2);
            deviceList[addr] = fields[0];
          }
        });
      });
    });

    var svc = {};
    var deviceList = {};
    var startScan = 0;
    var to = null;

    svc.needBTActivated = function (cb) {
      if (!window.bluetoothSerial || ionic.Platform.isIOS()) cb(false);
      else {
        bluetoothSerial.isEnabled(function () {
          cb(false);
        }, function () {
          cb(true);
        });
      }
    }

    // start scan until found. optional notifyCb to be called upon each new packet received
    svc.startScan = function (cb, notifyCb) {
      if (!window.bluetoothSerial || ionic.Platform.isIOS()) return;

      startScan = new Date().getTime();

      var onComplete = function () {
        if (new Date().getTime() - startScan < 5 * 1000 * 60) {
          bluetoothSerial.discoverUnpaired(onComplete, onError);
        }
      }
      var onError = function () {
        if (startScan == 0) return;
        // retry in 1 min
        $timeout(function () {
          bluetoothSerial.discoverUnpaired(onComplete, onError);
        }, 60 * 1000);
      }
      bluetoothSerial.setDeviceDiscoveredListener(function (device) {
        if (startScan > 0) {
          var addr = device.address.toLowerCase();
          // cb('testdevice');  
          if (deviceList[addr]) {
            startScan = 0;
            cb(deviceList[addr]);
            // continue listening until not closed
            to = $timeout(function () {
              startScan = new Date().getTime();
              bluetoothSerial.discoverUnpaired(onComplete, onError);
            }, 1 * 1000 * 60);
          } else {
            if (notifyCb) {
              notifyCb(device);
            }
          }
        }
      });

      bluetoothSerial.isEnabled(function () {
        bluetoothSerial.discoverUnpaired(onComplete, onError);
      }, onError);
    }

    svc.stopScan = function () {
      //bluetoothle.stopScan();      
      startScan = 0;
      if (to != null) {
        $timeout.cancel(to);
        to = null;
      }
    }

    svc.matches = function (address) {
      return deviceList[address.toLowerCase()];
    }

    return svc;
  })

;
