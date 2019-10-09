angular.module('viaggia.controllers.profile', [])

  .controller('ProfileCtrl', function ($scope, $rootScope, $filter, Config, GameSrv, Toast) {
    $rootScope.currentUser = null;
    $scope.status = null;
    $scope.ranking = null;
    $scope.prize = null;
    $scope.noStatus = false;
    $scope.pointsTab = true;
    $scope.statisticsTab = false;
    $scope.blacklistTab = false;
    $scope.rankingFilterOptions = ['now', 'last', 'global'];
    $scope.rankingPerPage = 50;
    var setUserLevel = function () {
      $scope.level = "";
      if ($scope.status && $scope.status.levels && $scope.status.levels.length > 0 && $scope.status.levels[0].levelValue) {
        $scope.level = $scope.status.levels[0].levelValue;
        $scope.levelNumber = $scope.status.levels[0].levelIndex;
      }

    }
    Config.loading();
    GameSrv.getLocalStatus().then(
      function (status) {
        $scope.status = status;
        setUserLevel();
        GameSrv.getRanking($scope.rankingFilterOptions[0], 0, $scope.rankingPerPage, null).then(
          function (ranking) {
            $rootScope.currentUser = ranking['actualUser'];
            $scope.ranking = ranking['classificationList'];
            $scope.$broadcast('scroll.infiniteScrollComplete');
            $scope.noStatus = false;
          }
        );
      },
      function (err) {
        $scope.noStatus = true;
        Toast.show($filter('translate')("pop_up_error_server_template"), "short", "bottom");
      }
    ).finally(Config.loaded);
    $scope.goToPoints = function () {
      $scope.pointsTab = true;
      $scope.statisticsTab = false;
      $scope.blacklistTab = false;
    }
    $scope.goToStatistics = function () {
      $scope.pointsTab = false;
      $scope.statisticsTab = true;
      $scope.blacklistTab = false;
    }
    $scope.goToBlacklist = function () {
      $scope.pointsTab = false;
      $scope.statisticsTab = false;
      $scope.blacklistTab = true;
    }

  })

  .controller('StatisticsCtrl', function ($scope, $ionicScrollDelegate, $window, $filter, $timeout, Toast, Config, GameSrv) {
    $scope.stats = [];
    $scope.noStats = false;
    $scope.maybeMore = true;
    var getStatistics = false;
    $scope.statsPerPage = 5;
    $scope.singleStatStatus = true;
    $scope.status = null;
    $scope.noStatus = false;
    $scope.serverhow = null
    $scope.previousStat = null;
    $scope.maxvalues = {
      maxDailywalk: 10000,
      maxDailybike: 20000,
      maxDailytransit: 50000,
      maxDailycar: 50000,
      maxWeeklywalk: 70000,
      maxWeeklybike: 140000,
      maxWeeklytransit: 300000,
      maxWeeklycar: 300000,
      maxMonthlywalk: 280000,
      maxMonthlybike: 560000,
      maxMonthlytransit: 1200000,
      maxMonthlycar: 1200000,
      maxTotalwalk: 840000,
      maxTotalbike: 1680000,
      maxTotaltransit: 3600000,
      maxTotalcar: 3600000,
    }
    $scope.filter = {
      open: false,
      toggle: function () {
        this.open = !this.open;
        $ionicScrollDelegate.resize();
      },
      filterBy: function (selection) {
        if (this.selected !== selection) {
          this.selected = selection;
          this.filter(this.selected);
        }
        this.toggle();
      },
      update: function () {
        this.filter(this.selected);
      },
      filter: function (selection) {},
      options: [],
      selected: null,
    };

    $scope.filter.options = ['Daily', 'Weekly', 'Monthly', 'Total'];
    $scope.filter.selected = !$scope.filter.selected ? $scope.filter.options[0] : $scope.filter.selected;
    $scope.filter.filter = function (selection) {
      $scope.previousStat = null;
      $scope.calculateMaxStats()
      $scope.serverhow = GameSrv.getServerHow($scope.filter.selected);
      $scope.maybeMore = true;
      $scope.singleStatStatus = true;
      $scope.stats = [];
      $ionicScrollDelegate.$getByHandle('statisticScroll').scrollTop();
      $scope.noStats = false;

    }

    $scope.getTitle = function (day) {
      dateFrom = new Date(day.from)
      dateTo = new Date(day.to)
      if ($scope.filter.selected == $scope.filter.options[0]) {
        // dateFrom = new Date(day.from);
        return dateFrom.toLocaleString(window.navigator.language, {
          weekday: 'long'
        }) + ' ' + $filter('date')(dateFrom, 'dd/MM');
      }
      if ($scope.filter.selected == $scope.filter.options[1]) {


        return $filter('date')(dateFrom, 'dd/MM/yyyy') + ' - ' + $filter('date')(dateTo, 'dd/MM/yyyy');
      }
      if ($scope.filter.selected == $scope.filter.options[2]) {
        return dateFrom.toLocaleString(window.navigator.language, {
          month: 'long'
        });
      }
      if ($scope.filter.selected == $scope.filter.options[3]) {
        return $filter('translate')('statistic_total_label');
      }
    }

    $scope.serverhow = GameSrv.getServerHow($scope.filter.selected);
    var generateRankingStyle = function () {
      $scope.profileStyle = {
        'height': window.innerHeight - (44 + 44) + 'px'
      };
      if (document.getElementById("myStatistic")) {
        document.getElementById("myStatistic").style.height = window.innerHeight - (44 + 44) + 'px';
      }

      // $ionicScrollDelegate.$getByHandle('statisticScroll').resize();
    };

    $window.onresize = function (event) {
      // Timeout required for our purpose
      $timeout(function () {
        generateRankingStyle();
      }, 200);
    };
    $scope.calculateMaxStats = function () {
      $scope.maxStat = GameSrv.getMaxStat($scope.filter.selected);
      if ($scope.maxStat) {
        $scope.maximum = 0;
        Object.keys($scope.maxStat).map(function (objectKey, index) {
          if (objectKey.startsWith("max ") && $scope.maxStat[objectKey] > $scope.maximum) {
            $scope.maximum = $scope.maxStat[objectKey];
          }
        });
      }
    }

    $scope.getStyle = function (stat, veichle) {
      if (veichle == 'transit') {
        $scope.maxStat["max " + veichle] = Math.max(($scope.maxStat["max bus"] || 0), ($scope.maxStat["max bike"] || 0), ($scope.maxStat["max train"] || 0), ($scope.maxStat["max transit"] || 0));
      }
      // if ((83 * stat) / $scope.maxStat["max " + veichle] < 8.8 && veichle == 'transit') {
      //     return { width: "8.8%" }
      // } else if ((83 * stat) / $scope.maxStat["max " + veichle] < 4.5) {
      //     return { width: + "4.5%" }
      // } else if ($scope.maxStat["max " + veichle] < $scope.maxvalues["max" + $scope.filter.selected + veichle] && stat < $scope.maxStat["max " + veichle]) {
      //     return { width: "" + ((83 * stat) / $scope.maxStat["max " + veichle]) + "%" }
      // } else {
      //     return { width: "83%" }
      // }

      if ($scope.maxStat && (75 * stat) / $scope.maximum < 10 && veichle == 'transit') {
        return {
          width: "10%"
        }
      } else if ($scope.maxStat && ((75 * stat) / $scope.maximum < 5)) {
        return {
          width: +"5%"
        }
      } else if ($scope.maxStat && stat < $scope.maxvalues["max" + $scope.filter.selected + veichle] && stat < $scope.maximum) {
        return {
          width: "" + ((75 * stat) / $scope.maximum) + "%"
        }
      } else {
        return {
          width: "75%"
        }
      }
    }



    GameSrv.getLocalStatus().then(
      function (status) {
        $scope.status = status;
        $scope.noStatus = false;
      },
      function (err) {
        $scope.noStatus = true;
        Toast.show($filter('translate')("pop_up_error_server_template"), "short", "bottom");
      })


    var getTimeForStat = function (type) {
      var temporanea = ($scope.stats != null && $scope.previousStat != null) ? $scope.previousStat : new Date().getTime()
      var x = temporanea - $scope.valbefore;
      var from = new Date(x).setHours(0, 0, 0, 0);
      var to = ($scope.stats != null && $scope.previousStat != null) ? $scope.previousStat : new Date().getTime();
      to = new Date(to).setHours(23, 59, 59, 999);
      //force day from sat to friday if week
      if ($scope.filter.selected == 'Weekly') {
        var fromMoment = new moment(from);
        var toMoment = new moment(to);
        const dayINeedFrom = 6; // for Saturday                    
        const dayINeedTo = 5; // for Saturday                    
        if (fromMoment.isoWeekday() <= dayINeedFrom) {
          from = fromMoment.isoWeekday(dayINeedFrom);
        } else {
          from = fromMoment.add(1, 'weeks').isoWeekday(dayINeedFrom);
        }
        if (toMoment.isoWeekday() <= dayINeedTo) {
          to = toMoment.isoWeekday(dayINeedTo);
        } else {
          to = toMoment.add(1, 'weeks').isoWeekday(dayINeedTo);
        }
        from = from.valueOf();
        to = to.valueOf();
      } else if ($scope.filter.selected == 'Monthly') {
        var fromMoment = new moment(from).startOf('month');
        var toMoment = new moment(to).endOf('month');
        from = fromMoment.valueOf();
        to = toMoment.valueOf();

      }
      if (type == 'from')
        return from;
      return to
    }
    $scope.loadMore = function () {
      if (!getStatistics) {
        getStatistics = true;
        $scope.findbefore()
        from = getTimeForStat('from');
        to = getTimeForStat('to');
        GameSrv.getStatistics($scope.serverhow, from, to).then(
          function (statistics) {
            $scope.stats = $scope.stats.concat(statistics.stats);

            $scope.calculateMaxStats();
            $scope.$broadcast('scroll.infiniteScrollComplete');
            $scope.singleStatStatus = true;
            Config.loaded();
            getStatistics = false;
            $scope.singleStatStatus = true;
            $scope.previousStat = statistics.firstBefore;
            if (!$scope.previousStat) {
              $scope.maybeMore = false;
              if ($scope.stats.length == 0) {
                $scope.noStats = true;
              } else {
                $scope.noStats = true;
                //even if all the stats is 0 set no stats to true
                for (var i = 0; i < $scope.stats.length; i++) {
                  if ($scope.stats[i].data.walk && $scope.stats[i].data.walk != 0 || $scope.stats[i].data.bike && $scope.stats[i].data.bike != 0 || $scope.stats[i].data.car && $scope.stats[i].data.car != 0 || $scope.stats[i].data.transit && $scope.stats[i].data.transit != 0 || $scope.stats[i].data.bus && $scope.stats[i].data.bus != 0 || $scope.stats[i].data.train && $scope.stats[i].data.train != 0) {
                    $scope.noStats = false;
                    break;
                  }
                }
              }
              generateRankingStyle();

            }
            $scope.nextStat = statistics.firstAfter;
          },
          function (err) {
            $scope.maybeMore = false;
            Toast.show($filter('translate')("pop_up_error_server_template"), "short", "bottom");
            $scope.$broadcast('scroll.infiniteScrollComplete');
            getStatistics = false;
            $scope.singleStatStatus = true;
          }
        );
      }
    };
    $scope.valbefore = 0
    $scope.findbefore = function () {
      //windows of data
      if ($scope.filter.selected == "Daily") {
        $scope.valbefore = 604800000 //one week
      }
      if ($scope.filter.selected == "Weekly") {
        $scope.valbefore = 2592000000 //one month
      }
      if ($scope.filter.selected == "Monthly") {
        $scope.valbefore = 31104000000 //one year
      }
      if ($scope.filter.selected == "Total") {
        $scope.valbefore = new Date().getTime()
      }
    }

    $scope.dayHasStat = function (day) {
      return (day.data.walk || day.data.transit || day.data.bike || day.data.car || day.data.bus);
    }
    GameSrv.getRemoteMaxStat().then(function () {
      $scope.findbefore();
      generateRankingStyle();
      // $scope.$apply();
    })
  })
  .controller('ProfileOthersCtrl', function ($scope) {

  })



  .controller('BlacklistCtrl', function ($scope, $ionicScrollDelegate, $window, $filter, $timeout, Toast, Config, GameSrv) {
    $scope.blacklist = [];
    $scope.noBlack = false;
    // $scope.maybeMore = true;
    var getBlacklist = false;
    $scope.status = null;
    $scope.noStatus = false;

    var generateRankingStyle = function () {
      $scope.rankingStyle = {
        'height': window.innerHeight - (44 + 44) + 'px'
      };
      $ionicScrollDelegate.$getByHandle('statisticScroll').resize();
    };

    $window.onresize = function (event) {
      // Timeout required for our purpose
      $timeout(function () {
        generateRankingStyle();
      }, 200);
    };

    GameSrv.getLocalStatus().then(
      function (status) {
        $scope.status = status;
        $scope.noStatus = false;
      },
      function (err) {
        $scope.noStatus = true;
        Toast.show($filter('translate')("pop_up_error_server_template"), "short", "bottom");
      })


    $scope.removeFromBlacklist = function (id) {
      Config.loading();
      GameSrv.removeFromBlacklist(id).then(function () {
        //removed
        Config.loaded();
      }, function (err) {
        //not removed
        Config.loaded();
      })

    }
    $scope.loadMore = function () {
      if (!getBlacklist) {
        getBlacklist = true;
        Config.loading();
        //TODO manage from and to
        GameSrv.getBlacklist().then(
          function (blacklist) {
            Config.loaded();

            getBlacklist = false;
            $scope.blacklist = blacklist;
            if ($scope.blacklist && $scope.blacklist.length == 0) {
              $scope.noBlack = true
            }
          },
          function (err) {
            Config.loaded();
            Toast.show($filter('translate')("pop_up_error_server_template"), "short", "bottom");
            getBlacklist = false;
          }
        );
      }
    };
    $scope.removeFromBlacklist = function (id) {
      Config.loading();
      GameSrv.removeFromBlacklist(id).then(function () {
        //removed
        GameSrv.getBlacklist().then(
          function (blacklist) {
            Config.loaded();
            $scope.blacklist = blacklist;
          },
          function (err) {
            //not refreshed
            Config.loaded();
          })
      }, function (err) {
        //not removed
        Config.loaded();
      });
    }
  })

  ///loads the score tab and all the badges of the user
  .controller('PointsCtrl', function ($scope, $rootScope, Config, profileService, $ionicPopup, $filter) {

    $scope.badges = null;
    $scope.badgeTypes = Config.getBadgeTypes();
    $scope.changeProfile = function () {
      $ionicPopup.confirm({
        title: $filter('translate')("change_image_title"),
        template: $filter('translate')("change_image_template"),
        buttons: [{
            text: $filter('translate')("btn_close"),
            type: 'button-cancel'
          },
          {
            text: $filter('translate')("change_image_confirm"),
            type: 'button-custom',
            onTap: function () {
              $scope.choosePhoto();

              // document.getElementById('inputImg').click()
            }
          }
        ]
      });
    }

    $scope.choosePhoto = function () {
      $scope.chooseAndUploadPhoto($scope.uploadFileImage);
    }

    $scope.getImage = function () {
      if ($scope.$parent.$parent.$parent.status)
        profileService.getProfileImage($scope.$parent.$parent.$parent.status.playerData.playerId).then(function (image) {
          $rootScope.profileImg = profileService.getAvatarUrl() + $scope.$parent.$parent.$parent.status.playerData.playerId + '/big?' + (localStorage.getItem(Config.getAppId() + '_timestampImg'));
        }, function (error) {
          $rootScope.profileImg = 'img/game/generic_user.png' + '/big?' + (localStorage.getItem(Config.getAppId() + '_timestampImg'));
        })
    }

    $scope.$watch('status.badgeCollectionConcept', function (newBadges, oldBadges) {
      var badges = {};
      if (!!$scope.status) {
        angular.forEach($scope.badgeTypes, function (badgeType) {
          for (var i = 0; i < $scope.status['badgeCollectionConcept'].length; i++) {
            if ($scope.status['badgeCollectionConcept'][i].name === badgeType) {
              badges[badgeType] = $scope.status['badgeCollectionConcept'][i]['badgeEarned'];
            }
          }
        });
      }
      $scope.badges = badges;
    });
    $scope.$watch('$rootScope.profileImg', function (newBadges, oldBadges) {
      $scope.getImage();
    });
  })
  .controller('BlacklistCtrl', function ($scope, $ionicScrollDelegate, $window, $filter, $timeout, Toast, Config, GameSrv) {
    $scope.blacklist = [];
    $scope.noBlack = false;
    // $scope.maybeMore = true;
    var getBlacklist = false;
    $scope.status = null;
    $scope.noStatus = false;

    var generateRankingStyle = function () {
      $scope.rankingStyle = {
        'height': window.innerHeight - (44 + 44) + 'px'
      };
      $ionicScrollDelegate.$getByHandle('statisticScroll').resize();
    };

    $window.onresize = function (event) {
      // Timeout required for our purpose
      $timeout(function () {
        generateRankingStyle();
      }, 200);
    };

    GameSrv.getLocalStatus().then(
      function (status) {
        $scope.status = status;
        $scope.noStatus = false;
      },
      function (err) {
        $scope.noStatus = true;
        Toast.show($filter('translate')("pop_up_error_server_template"), "short", "bottom");
      })


    $scope.removeFromBlacklist = function (id) {
      Config.loading();
      GameSrv.removeFromBlacklist(id).then(function () {
        //removed
        Config.loaded();
      }, function (err) {
        //not removed
        Config.loaded();
      })

    }
    $scope.loadMore = function () {
      if (!getBlacklist) {
        getBlacklist = true;
        Config.loading();
        //TODO manage from and to
        GameSrv.getBlacklist().then(
          function (blacklist) {
            Config.loaded();

            getBlacklist = false;
            $scope.blacklist = blacklist;
            if ($scope.blacklist && $scope.blacklist.length == 0) {
              $scope.noBlack = true
            }
          },
          function (err) {
            Config.loaded();
            Toast.show($filter('translate')("pop_up_error_server_template"), "short", "bottom");
            getBlacklist = false;
          }
        );
      }
    };
    $scope.removeFromBlacklist = function (id) {
      Config.loading();
      GameSrv.removeFromBlacklist(id).then(function () {
        //removed
        GameSrv.getBlacklist().then(
          function (blacklist) {
            Config.loaded();
            $scope.blacklist = blacklist;
          },
          function (err) {
            //not refreshed
            Config.loaded();
          })
      }, function (err) {
        //not removed
        Config.loaded();
      });
    }
  })
  .controller('ProfileOthersContainerCtrl', function ($scope, $filter, $stateParams, Config, GameSrv, $ionicScrollDelegate, Toast) {
    Config.loading();
    $scope.profileId = $stateParams.profileId
    $scope.blacklisted = GameSrv.blacklisted($scope.profileId);
    $scope.user = {};
    $scope.badges = null;
    $scope.stats = {}
    $scope.challenges = {};
    $scope.noStats = false;
    $scope.badgeTypes = Config.getBadgeTypes();
    $scope.maxStat = GameSrv.getMaxStat("Total");
    $scope.maxvalues = {
      maxDailywalk: 10000,
      maxDailybike: 20000,
      maxDailytransit: 50000,
      maxDailycar: 50000,
      maxWeeklywalk: 70000,
      maxWeeklybike: 140000,
      maxWeeklytransit: 300000,
      maxWeeklycar: 300000,
      maxMonthlywalk: 280000,
      maxMonthlybike: 560000,
      maxMonthlytransit: 1200000,
      maxMonthlycar: 1200000,
      maxTotalwalk: 840000,
      maxTotalbike: 1680000,
      maxTotaltransit: 3600000,
      maxTotalcar: 3600000,
    }
    $scope.filter = {
      open: false,
      toggle: function () {
        this.open = !this.open;
        $ionicScrollDelegate.resize();
      },
      filterBy: function (selection) {
        if (this.selected !== selection) {
          this.selected = selection;
          this.filter(this.selected);
        }
        this.toggle();
      },
      update: function () {
        this.filter(this.selected);
      },
      filter: function (selection) {},
      options: [],
      selected: null,
    };


    $scope.getChallengeBarTemplate = function (challenge) {
      challenge.status = 100;
      return GameSrv.getChallengeBarTemplate(challenge);
    }



    $scope.filter.options = ['Total', 'Monthly'];
    $scope.filter.selected = !$scope.filter.selected ? $scope.filter.options[0] : $scope.filter.selected;
    $scope.filter.filter = function (selection) {
      $scope.previousStat = null;
      //TODO calculate max of other
      $scope.calculateMaxStats()
      $scope.serverhow = GameSrv.getServerHow($scope.filter.selected);
      $scope.maybeMore = true;
      $scope.singleStatStatus = true;
      $ionicScrollDelegate.$getByHandle('statisticScroll').scrollTop();
      $scope.noStats = false;

    }
    var updateBadges = function () {
      var badges = {};
      if (!!$scope.user) {
        angular.forEach($scope.badgeTypes, function (badgeType) {
          for (var i = 0; i < $scope.user['badgeCollectionConcept'].length; i++) {
            if ($scope.user['badgeCollectionConcept'][i].name === badgeType) {
              badges[badgeType] = $scope.user['badgeCollectionConcept'][i]['badgeEarned'];
            }
          }
        });
      }
      $scope.badges = badges;
    }
    $scope.calculateMaxStats = function () {
      $scope.maxStat = GameSrv.getMaxStat("Total");
      if ($scope.maxStat) {
        $scope.maximum = 0;
        Object.keys($scope.maxStat).map(function (objectKey, index) {
          if (objectKey.startsWith("max ") && $scope.maxStat[objectKey] > $scope.maximum) {
            $scope.maximum = $scope.maxStat[objectKey];
          }
        });
      }
    }
    $scope.getBorderColor = function (challenge) {
      return GameSrv.getBorderColor(challenge);
    }
    GameSrv.getRemoteMaxStat().then(function () {
      $scope.calculateMaxStats();
    })

    GameSrv.getProfileOther($scope.profileId).then(
      function (profile) {
        $scope.user = profile
        updateBadges();


        $scope.challenges = $scope.user.wonChallenges;
        if (Object.keys($scope.user.statistics).length != 0 && $scope.user.statistics.constructor === Object) {
          $scope.stats['Total'] = $scope.user.statistics;
        }
        if (Object.keys($scope.user.lastMonthStatistics).length != 0 && $scope.user.lastMonthStatistics.constructor === Object) {
          $scope.stats['Monthly'] = $scope.user.lastMonthStatistics;
        }

      },
      function (err) {
        Toast.show($filter('translate')("pop_up_error_server_template"), "short", "bottom");
        $scope.user = null;
      }
    ).finally(Config.loaded);

    $scope.getStyle = function (stat, veichle) {
      if (veichle == 'transit') {
        $scope.maxStat["max " + veichle] = Math.max(($scope.maxStat["max bus"] || 0), ($scope.maxStat["max bike"] || 0), ($scope.maxStat["max train"] || 0), ($scope.maxStat["max transit"] || 0));
      }

      if ($scope.maxStat && (75 * stat) / $scope.maximum < 10 && veichle == 'transit') {
        return {
          width: "10%"
        }
      } else if ($scope.maxStat && ((75 * stat) / $scope.maximum < 5)) {
        return {
          width: +"5%"
        }
      } else if ($scope.maxStat && stat < $scope.maxvalues["maxTotal" + veichle] && stat < $scope.maximum) {
        return {
          width: "" + ((75 * stat) / $scope.maximum) + "%"
        }
      } else {
        return {
          width: "75%"
        }
      }
    }
    $scope.removeFromBlacklist = function () {
      Config.loading();
      GameSrv.removeFromBlacklist($scope.profileId).then(function () {
        //removed
        $scope.blacklisted = false;
        Config.loaded();
        Toast.show($filter('translate')("blacklist_removed_toast"), "short", "bottom");
      }, function (err) {
        //not removed
        Config.loaded();
      });
    }
    $scope.addToBlacklist = function () {
      Config.loading();
      GameSrv.addToBlacklist($scope.profileId, $scope.user).then(function () {
        //removed
        $scope.blacklisted = true;
        Config.loaded();
        Toast.show($filter('translate')("blacklist_add_toast"), "short", "bottom");
      }, function (err) {
        //not removed
        Config.loaded();
        Toast.show($filter('translate')("pop_up_error_server_template"), "short", "bottom");

      });
    }

  })
  .controller('ProfileOthersChallengesCtrl', function ($scope) {})
  .controller('ProfileOthersStatisticsCtrl', function ($scope) {})
