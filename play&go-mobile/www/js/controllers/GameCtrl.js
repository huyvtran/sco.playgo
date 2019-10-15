angular.module('viaggia.controllers.game', [])




  //The main game Menu
  .controller('GameMenuCtrl', function ($scope, $state, $ionicHistory, GameSrv) {
    $scope.init = function () {
      GameSrv.getLocalStatus().then(
        function (status) {
          $scope.title = status.playerData.nickName
        });
    }
    $scope.init();

    //the back button is managed with this function
    $scope.goHome = function () {
      $state.go('app.home.home');
      $ionicHistory.nextViewOptions({
        disableBack: true
      });
    }

  })


  //Container of the tabs, load data of the game: username, ranking, ...
  .controller('GameCtrl', function ($scope, $rootScope, GameSrv, Config, Toast, $timeout, $filter) {

    $rootScope.currentUser = null;
    $scope.status = null;
    $scope.ranking = null;
    $scope.prize = null;
    $scope.noStatus = false;
    $scope.rankingFilterOptions = ['now', 'last', 'global'];
    $scope.rankingPerPage = 50;

    Config.loading();
    GameSrv.getLocalStatus().then(
      function (status) {
        $scope.status = status;
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
  })






  //loads the challenges tab, manage the filter of past and new challenges

  .controller('ChallengesCtrl', function ($scope, $q, $rootScope, $state, $stateParams, Toast, LoginService, Config, $filter, $ionicScrollDelegate, $ionicPopup, profileService, $window, $timeout, GameSrv) {
    $scope.inventory = 0;
    $scope.msg = true;
    $scope.challenges = null;
    $scope.param = null;
    $scope.tabs = ['past', 'future', 'unlock'];
    $scope.actualTab = "";
    $scope.expansion = [];
    $scope.challenge = [];
    $scope.typeOfChallenges = [];
    $scope.language = null;
    var paramEnd = $stateParams.challengeEnd;
    var paramStart = $stateParams.challengeStart;
    var unlock = $stateParams.unlock;
    var now = new Date().getTime();


    $scope.openTab = function (tab) {
      $scope.actualTab = tab;
    }
    $scope.activeTab = function (tab) {
      return (tab == $scope.actualTab);
    }
    $scope.showChallengeInfo = function (challenge) {
      // FIXME temporarly not null
      if (!challenge) {
        challenge = {
          challCompleteDesc: 'Lorem ipsum dolor sic amet'
        };
      }

      var infoPopup = $ionicPopup.alert({
        title: $filter('translate')('game_tab_challenges_info'),
        subTitle: '',
        cssClass: '',
        template: challenge.challCompleteDesc,
        okText: $filter('translate')('pop_up_close'),
        okType: ''
      });

      infoPopup.then(
        function () {}
      );
    };
    // $scope.msgInvite = function () {
    //   if ($scope.status &&!$scope.status.canInvite && $scope.msg)
    //   {$scope.msg=false;
    //     return true
    //   }
    //   return false;
    // }
    $scope.expand = function (index) {
      $scope.expansion[index] = !$scope.expansion[index];
    }
    $scope.isExpanded = function (index) {
      return $scope.expansion[index]
    }
    var reloadList = function () {
      $scope.buildingChallenges = true;

      $scope.getActual().finally(function () {
        $scope.buildingChallenges = false;
      });
      $scope.getPast();
    }
    $scope.updateInventory = function (status) {
      if (status.inventory) {
        $scope.inventory = status.inventory.challengeActivationActions;
      }
    }


    $scope.init = function () {
      navigator.globalization.getPreferredLanguage(
        function (result) {
          $scope.language = result.value.substring(0, 2);
          $scope.buildingChallenges = true;
          GameSrv.getLocalStatus().then(
            function (status) {
              $scope.status = status;
              $scope.noStatus = false;
              $scope.actualTab = $scope.tabs[0];
              if ((paramEnd && paramEnd > now && paramStart > now) || (paramEnd && !paramStart)) {
                $scope.actualTab = $scope.tabs[1];
              }
              if (unlock) {
                $scope.actualTab = $scope.tabs[2];
              }
              $scope.updateInventory(status);
              $scope.getTypes().finally(function () {
                $scope.getActual().finally(function () {
                  $scope.buildingChallenges = false;
                });
              });
              $scope.getPast();
            },
            function (err) {
              if (!$scope.challenges) {
                $scope.buildingChallenges = false;
                $scope.noStatus = true;
                $scope.actualTab = $scope.tabs[0];
                Toast.show($filter('translate')("pop_up_error_server_template"), "short", "bottom");
                $scope.challenges = [];
                $scope.pastChallenges = [];
              }
            })

        },
        function (err) {

        });
    }

    var availableType = function (type, types) {
      var state = "LOCKED";
      for (var i = 0; i < types.length; i++) {
        if (types[i].modelName == type.id) {
          state = types[i].state

        }
      }
      return state
    }
    $scope.getTypes = function () {
      var deferred = $q.defer();
      Config.loading();
      if (LoginService.getUserProfile()) {
        GameSrv.getAvailableChallenges(LoginService.getUserProfile().userId).then(function (types) {
          var typesChallenges = GameSrv.getTypesChallenges();
          $scope.typeOfChallenges = [];
          for (var key in typesChallenges) {
            if (typesChallenges.hasOwnProperty(key)) {
              //check if available
              var state = availableType(typesChallenges[key], types);
              $scope.typeOfChallenges.push({
                type: typesChallenges[key].id,
                short: typesChallenges[key].short,
                long: typesChallenges[key].long,
                state: state
              });
            }
          }
          return deferred.resolve();
        }, function (err) {
          return deferred.reject();

        }).finally(Config.loaded);
      }
      return deferred.promise;
    }

    var convertChall = function (chall, type) {
      var challConverted = {}
      switch (type) {
        case "racc": {
          challConverted.challId = chall.challId;
          challConverted.startDate = chall.startDate;
          challConverted.endDate = chall.endDate;
          challConverted.bonus = chall.bonus;
          challConverted.group = type;
          challConverted.type = type;
          challConverted.short = chall.challDesc;
          challConverted.long = chall.challCompleteDesc;
        }
        case "futu": {
          challConverted.challId = chall.challId;
          challConverted.startDate = chall.startDate;
          challConverted.endDate = chall.endDate;
          challConverted.bonus = chall.bonus;
          challConverted.group = type;
          challConverted.type = type;
          challConverted.short = chall.challDesc;
          challConverted.long = chall.challCompleteDesc;
        }
        case "invite": {
          challConverted.challId = chall.challId;
          challConverted.startDate = chall.startDate;
          challConverted.endDate = chall.endDate;
          challConverted.bonus = chall.bonus;
          challConverted.group = type;
          challConverted.type = chall.type;
          challConverted.short = chall.challDesc;
          challConverted.long = chall.challCompleteDesc;
          challConverted.received = $scope.status ? (chall.proposerId != $scope.status.playerData.playerId) : false
          challConverted.nickname = chall.otherAttendeeData ? chall.otherAttendeeData.nickname : ""
        }
      }
      return challConverted;
    }
    var futureNotSet = function (future) {
      //check if future has otherchallenge
      if (future && future.length > 0) {
        for (var i = 0; i < future.length; i++) {
          {
            if (future[i].otherAttendeeData != null) {
              return false;
            }
          }
        }
        return true;
      }
      return true
    }

    var buildChallenges = function (future, proposed) {
      $scope.challenges = [];
      if (future) {
        for (var i = 0; i < future.length; i++) {
          $scope.challenges.push(convertChall(future[i], "futu"));
        }
      }
      //proposed from raccomandation system
      if (proposed || futureNotSet(future)) {
        if (proposed)
          for (var i = 0; i < proposed.length; i++) {
            if (proposed[i].otherAttendeeData) {
              $scope.challenges.push(convertChall(proposed[i], "invite"));
            } else {
              $scope.challenges.push(convertChall(proposed[i], "racc"));
            }
          }
        //build challenges with type
        if (!$rootScope.canPropose) {
          for (var i = 0; i < $scope.typeOfChallenges.length; i++) {
            if ($scope.typeOfChallenges[i] && $scope.typeOfChallenges[i].state == "ACTIVE") {
              $scope.challenges.push({
                group: 'unlock',
                msg: false,
                type: $scope.typeOfChallenges[i].type,
                short: $scope.typeOfChallenges[i].short,
                long: $scope.typeOfChallenges[i].long,
                state: 'ACTIVE'
              });
            }
          }
        } else {
          //find last index with invite
          var index = 0;
          for (var i = 0; i < $scope.challenges.length; i++) {
            if ($scope.challenges[i].group == "racc") {
              index = i;
              break;
            }
          }
          var first = true;
          for (var i = 0; i < $scope.typeOfChallenges.length; i++) {
            if ($scope.typeOfChallenges[i] && $scope.typeOfChallenges[i].state == "ACTIVE") {
              $scope.challenges.splice(index, 0, {
                group: 'unlock',
                msg: first,
                type: $scope.typeOfChallenges[i].type,
                short: $scope.typeOfChallenges[i].short,
                long: $scope.typeOfChallenges[i].long,
                state: 'ACTIVE'
              });
            }
            if (first)
              first = false;
          }
        }
      }

    }
    $scope.showWarning = function (type) {
      if (localStorage.getItem('warning_hide_' + type))
        return false;
      return true;
    }
    $scope.hideWarning = function (type) {
      localStorage.setItem('warning_hide_' + type, true);
    }
    $scope.chooseChallenge = function (challenge) {
      //confirm popup
      $ionicPopup.show({
        title: $filter('translate')("challenge_accept_popup_title"),
        template: $filter('translate')("challenge_accept_popup_template"),
        buttons: [{
            text: $filter('translate')("btn_close"),
            type: 'button-cancel'
          },
          {
            text: $filter('translate')("btn_conferma"),
            type: 'button-custom',
            onTap: function () {
              Config.loading();
              GameSrv.chooseChallenge(challenge).then(function () {
                //clean list and keep the only one
                reloadList();
              }, function (err) {
                //TODO err
              }).finally(Config.loaded);
            }
          }

        ]
      });

    }
    $scope.acceptChallenge = function (challenge) {
      //confirm popup
      $ionicPopup.show({
        title: $filter('translate')("challenge_accept_popup_title"),
        template: $filter('translate')("challenge_accept_popup_template"),
        buttons: [{
            text: $filter('translate')("btn_close"),
            type: 'button-cancel'
          },
          {
            text: $filter('translate')("btn_conferma"),
            type: 'button-custom',
            onTap: function () {
              Config.loading();
              GameSrv.acceptChallenge(challenge).then(function () {
                //clean list and keep the only one
                reloadList();
              }, function (err) {
                //TODO err
              }).finally(Config.loaded);
            }
          }

        ]
      });

    }
    $scope.rejectChallenge = function (challenge) {
      Config.loading();
      GameSrv.rejectChallenge(challenge).then(function () {
        reloadList();
      }, function (err) {

      }).finally(Config.loaded);
    }
    $scope.cancelChallenge = function (challenge) {
      Config.loading();
      GameSrv.cancelChallenge(challenge).then(function () {
        $rootScope.canPropose = true;
        reloadList();
      }, function (err) {

      }).finally(Config.loaded);
    }
    $scope.configureChallenge = function (challenge) {
      $state.go('app.configureChallenge', {
        challenge: challenge
      })
    }


    $scope.getActual = function () {
      var deferred = $q.defer();
      var future = []
      var available = []
      // var invites = []
      // var sent = {}
      Config.loading();
      GameSrv.getFutureChallenges(profileService.status).then(function (challenges) {
        future = challenges

        GameSrv.getProposedChallenges(profileService.status).then(function (challenges) {
          available = challenges;
          buildChallenges(future, available);

          return deferred.resolve();
        }, function (err) {
          $scope.challenges = [];
          Toast.show($filter('translate')("pop_up_error_server_template"), "short", "bottom");
          return deferred.rejec();

        }, function (err) {
          $scope.challenges = [];
          Toast.show($filter('translate')("pop_up_error_server_template"), "short", "bottom");
          return deferred.rejec();

          // }
        }).finally(Config.loaded);

      })
      return deferred.promise;
    }

    $scope.getChallengeBarTemplate = function (challenge) {
      return GameSrv.getChallengeBarTemplate(challenge);
    }
    $scope.getWidthTimeUser = function (challenge) {
      if (challenge.status > challenge.otherAttendeeData.status)
        return "width: 100%;";
      return "width:" + (challenge.status * 100) / challenge.otherAttendeeData.status + "%;"
    }
    $scope.getWidthTimeOther = function (challenge) {
      if (challenge.otherAttendeeData.status > challenge.status)
        return "width: 100%;";
      return "width:" + (challenge.otherAttendeeData.status * 100) / challenge.status + "%;"
    }
    $scope.getWidthUser = function (challenge) {
      return "width:" + ((challenge.status > 100) ? 100 : challenge.status) + "%;"
    }
    $scope.getWidthOther = function (challenge) {
      if (challenge.otherAttendeeData)
        return "width:" + ((challenge.otherAttendeeData.status > 100) ? 100 : challenge.otherAttendeeData.status) + "%;"
      return "width: 1%;"
    }
    $scope.getWidthSeparator = function (challenge) {
      return "width:" + (100 - challenge.otherAttendeeData.status - challenge.status) + "%;background:transparent;"
    }
    var getChallengeByUnit = function (challenge) {
      return GameSrv.getChallengeByUnit(challenge.unit)
    }
    $scope.getValueUser = function (challenge) {
      var labelChallenge = getChallengeByUnit(challenge);
      return $filter('number')(challenge.row_status, isKm(labelChallenge) ? 2 : 0) + " " + $filter('translate')(labelChallenge);
    }
    var isKm = function (unit) {
      if (unit != "Walk_Km" && unit != "Bike_Km")
        return false;
      return true
    }
    $scope.getValueOther = function (challenge) {
      if (challenge.otherAttendeeData) {
        var labelChallenge = getChallengeByUnit(challenge);
        return $filter('number')(challenge.otherAttendeeData.row_status, isKm(labelChallenge) ? 2 : 0) + " " + $filter('translate')(labelChallenge);
      }
      return "";
    }

    $scope.getPast = function () {
      $scope.pastChallenges = null;
      if (!!$scope.status && !!$scope.status['challengeConcept']) {
        if ($scope.status) {
          GameSrv.getPastChallenges(profileService.status).then(function (pastChallenges) {
            if (!pastChallenges)
              $scope.pastChallenges = [];
            else {
              $scope.pastChallenges = [];
              for (var i = 0; i < pastChallenges.length; i++) {
                $scope.pastChallenges.push({
                  group: "racc",
                  type: pastChallenges[i].type,
                  short: pastChallenges[i].challDesc,
                  long: pastChallenges[i].challCompleteDesc,
                  row_status: $filter('number')(pastChallenges[i].row_status, 0),
                  status: pastChallenges[i].status,
                  unit: pastChallenges[i].unit,
                  otherAttendeeData: pastChallenges[i].otherAttendeeData,
                  dataFinished: pastChallenges[i].success ? pastChallenges[i].challCompletedDate : pastChallenges[i].endDate,
                  success: pastChallenges[i].success
                });
              }
            }
          }, function (err) {
            $scope.challenges = [];
            $scope.pastChallenges = [];
            Toast.show($filter('translate')("pop_up_error_server_template"), "short", "bottom");
          });
          if (!$scope.pastChallenges) $scope.challenges = [];
        } else {
          $scope.pastChallenges = null;
        }
      }
    }
    var unlockChallenge = function (type) {
      Config.loading();
      GameSrv.unlockChallenge(type.type).then(function () {
        //reload
        $scope.getTypes();
        GameSrv.getLocalStatus().then(function (status) {
          Toast.show($filter('translate')("toast_type_unlocked"), "short", "bottom");
          $scope.updateInventory(status);
          reloadList();

        })
      }, function (err) {
        Toast.show($filter('translate')("pop_up_error_server_template"), "short", "bottom");

      }).finally(Config.loaded);

    }
    $scope.readMore = function (type) {
      if (!$scope.lockedType(type)) {
        $ionicPopup.show({
          title: $filter('translate')("challenge_detail_popup_title"),
          template: $filter('translate')(type["long"]),
          buttons: [{
            text: $filter('translate')("btn_close"),
            type: 'button-cancel'
          }]
        });
      }
    }
    $scope.getIconType = function (type) {
      return GameSrv.getIconType(type);
    }
    $scope.getColorType = function (type) {
      return GameSrv.getColorType(type);
    }
    $scope.getIconChallenge = function (challenge) {
      return GameSrv.getIconChallenge(challenge);
    }
    $scope.getColorChallenge = function (challenge) {
      return GameSrv.getColorChallenge(challenge);
    }
    $scope.getBorderColor = function (challenge) {
      return GameSrv.getBorderColor(challenge);
    }
    $scope.getColorCup = function (challenge) {
      return GameSrv.getColorCup(challenge);
    }
    $scope.lockedType = function (type) {
      if (type.state)
        return (type.state == 'LOCKED' || ($scope.inventory == 0 && type.state != 'ACTIVE'))
      return false;
    }
    $scope.unlock = function (type) {
      if ($scope.inventory != 0) {
        $ionicPopup.show({
          title: $filter('translate')("challenge_popup_title"),
          template: $filter('translate')("challenge_popup_template_" + type.type),
          buttons: [{
              text: $filter('translate')("btn_close"),
              type: 'button-cancel'
            },
            {
              text: $filter('translate')("btn_conferma"),
              type: 'button-custom',
              onTap: function () {
                unlockChallenge(type);
              }
            }
          ]
        });
      }
    }
    /* Resize ion-scroll */
    $scope.challengesStyle = {};

    var generateChallengesStyle = function () {
      // header 44, tabs 49, filter 44, listheader 44, my ranking 48
      $scope.challengesStyle = {
        'height': window.innerHeight - (44 + 49 + 44) + 'px'
      };
      $ionicScrollDelegate.$getByHandle('challengesScroll').resize();
    };

    $window.onresize = function (event) {
      // Timeout required for our purpose
      $timeout(function () {
        generateChallengesStyle();
      }, 200);
    };


    $scope.$on("$ionicView.afterEnter", function (event, data) {
      //check timer if passed x time
      var date = new Date();
      // var params = data.stateParams;
      // paramEnd = params.challengeEnd;
      // paramStart = params.challengeStart;
      // unlock =params.unlock;
      $scope.challengesStyle = {
        'height': window.innerHeight - (44 + 49 + 44) + 'px'
      };
      if (!localStorage.getItem(Config.getAppId() + "_challengesRefresh") || parseInt(localStorage.getItem(Config.getAppId() + "_challengesRefresh")) + Config.getCacheRefresh() < new Date().getTime()) {
        $scope.init();
        generateChallengesStyle();
        localStorage.setItem(Config.getAppId() + "_challengesRefresh", new Date().getTime());
      } else if (!$scope.pastChallenges) {
        $scope.init();
      }
    });
  })
  .controller('ConfigureChallengeCtrl', function ($scope, $state, $rootScope, $ionicHistory, $ionicPopup, $stateParams, $filter, $ionicModal, Toast, GameSrv, Config) {
    $scope.players = [];
    $scope.blacklistplayers = [];
    howPlayer = 0;
    fromPlayer = 0;
    toPlayer = 0;
    howBlack = 0;
    fromBlack = 0;
    toBlack = 0;
    $scope.why = false;
    $scope.playerChoice = null;
    // $scope.challenge = {};
    $scope.rewards = {}
    $scope.challenge = $stateParams.challenge;

    $scope.isChallengeMean = function (mean) {
      return (mean == $scope.challenge.mean);
    }
    $scope.getChooseOpponentString = function () {
      if ($scope.challenge.type != 'groupCooperative')
        return $filter('translate')("lbl_challenge_configure_opponent");
      return $filter('translate')("lbl_challenge_configure_friend");
    }
    $scope.setChallengeMean = function (mean) {
      $scope.challenge.mean = mean;
      $scope.preview = null;
    }
    $scope.confirmPlayer = function () {
      console.log($scope.challenge.player);
      $scope.closeList();
    }
    $scope.selectPlayer = function (player) {
      $scope.challenge.player = player;
      $scope.confirmPlayer()
    }
    $scope.getConfigureTemplate = function (challenge) {
      return GameSrv.getConfigureTemplate(challenge);
    }
    $scope.chooseFromList = function () {
      //open modal for choosing the player
      $ionicModal.fromTemplateUrl('templates/game/choosePlayerChallengeModal.html', {
        scope: $scope,
        animation: 'slide-in-up'
      }).then(function (modal) {
        $scope.modal = modal;
        $scope.modal.show();
      });
    }
    $scope.closeList = function () {
      $scope.modal.hide();
    }
    $scope.getConfRewards = function () {
      GameSrv.getRewards().then(function (rewards) {
        $scope.rewards = rewards;
      }, function (error) {

      }).finally();;
    }
    $scope.getPlayers = function () {
      Config.loading();
      GameSrv.getPlayersForChallenge(null).then(function (players) {
        $scope.players = players;
      }, function (error) {

      }).finally(Config.loaded);;
      GameSrv.getBlacklist().then(function (players) {
        $scope.blacklistplayers = players;
      }, function (error) {

      });
    }
    $scope.showWhy = function () {
      //show popup
      $ionicPopup.confirm({
        title: $filter('translate')("lbl_chall_choose_player_blacklist"),
        template: $filter('translate')("lbl_chall_blacklist"),
        buttons: [{
          text: $filter('translate')("btn_close"),
          type: 'button-cancel'
        }]
      });
      //$scope.why = !$scope.why;
    }
    $scope.calculateTarget = function () {
      if (parametersCorrect()) {

        //$scope.challenge.target = $scope.rewards[$scope.challenge.type];
        Config.loading();
        GameSrv.previewChallenge($scope.challenge).then(function (preview) {
          $scope.preview = preview;
        }, function (error) {
          Toast.show($filter('translate')("pop_up_error_server_template"), "short", "bottom");

        }).finally(Config.loaded);;
      } else {
        Toast.show($filter('translate')("toast_error_configure"), "short", "bottom");

      }
    }
    var parametersCorrect = function () {
      //check if there is type and opponent
      if (!$scope.challenge.player)
        return false
      if (!$scope.challenge.mean)
        return false
      return true;
    }
    $scope.requestChallenge = function () {
      if (parametersCorrect()) {
        Config.loading();
        GameSrv.requestChallenge($scope.challenge).then(function () {
          $ionicHistory.clearCache().then(function () {
            $rootScope.canPropose = false;
            $state.go('app.home.challenges', {
              challengeEnd: new Date().getTime()
            });
          })
        }, function (error) {
          if (error && error.status == 400) {
            //user not available
            //popup and refresh
            $ionicPopup.confirm({
              title: $filter('translate')("lbl_chall_user_not_available_title"),
              template: $filter('translate')("lbl_chall_user_not_available"),
              buttons: [{
                text: $filter('translate')("btn_close"),
                type: 'button-ok',
                onTap: function () {
                  //refresh list
                  $scope.removePlayer();
                  $scope.getPlayers();
                }
              }]
            });
          } else {
            Toast.show($filter('translate')("pop_up_error_server_template"), "short", "bottom");

          }
        }).finally(Config.loaded);
      } else {
        Toast.show($filter('translate')("toast_error_configure"), "short", "bottom");

      }
    }
    $scope.removePlayer = function () {
      $scope.challenge.player = null;
      $scope.preview = null;

    }
    $scope.initConf = function () {
      $scope.getPlayers();
      $scope.getConfRewards();
    }
    $scope.playerName = null;
    var getNames = function (players) {
      return players.map(function (player) {
        return player.nickname;
      })
    }
    var createMapNames = function (players) {
      var map = {};
      players.forEach(function (element) {
        map[element.nickname] = element;
      });
      return map;
      // return players.reduce(function (map, obj) {
      //     map[obj.nickname] = obj;
      //     return map;
      // });
    }
    $scope.typeName = function (typedthings) {
      // GameSrv.getPlayersForChallenge(typedthings).then(function (players) {
      // filtering by typed things
      var players = $scope.players.filter(function (element) {
        return element.nickname.includes(typedthings)
      })
      $scope.playersName = getNames(players);
      if (players) {
        $scope.mapName = createMapNames(players);
      } else {
        $scope.mapName = {};
      }
      // }, function (err) {

      // });
    }
    $scope.changeStringName = function (suggestion) {
      console.log($scope.mapName[suggestion]);
      $scope.selectPlayer($scope.mapName[suggestion]);
    };
  })





  .controller('DiaryCtrl', function ($scope, $timeout, $state, $filter, GameSrv, $window, $ionicScrollDelegate, DiaryDbSrv, Toast, Config, trackService) {
    $scope.messages = [];
    // $scope.days=[];
    $scope.days = null;
    $scope.maybeMore = true;
    var getDiary = false;
    $scope.singleDiaryStatus = true;
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

    $scope.filter.options = ['allnotifications', 'badge', 'challenge', 'trip', 'raccomandation'];
    $scope.filter.selected = !$scope.filter.selected ? $scope.filter.options[0] : $scope.filter.selected;
    $scope.filter.filter = function (selection) {
      Config.loading();
      $scope.maybeMore = true;
      $scope.singleDiaryStatus = true;
      $ionicScrollDelegate.$getByHandle('diaryScroll').scrollTop();
      $scope.init()
      Config.loaded();
    }

    $scope.manageOneEntry = function (notification, multimodal) {
      var time1 = notification.timestamp
      var time2 = $scope.days[$scope.days.length - 1].name
      var msg1 = new Date(time1).setHours(0, 0, 0, 0);
      var msg2 = new Date(time2).setHours(0, 0, 0, 0);
      if (notification.travelValidity == 'PENDING') {
        notification.travelValidity = 'VALID';
        if (notification.event) {
          var event = JSON.parse(notification.event);
          event.travelValidity = 'VALID';
          notification.event = JSON.stringify(event);
        }
      }
      if (multimodal) {
        notification = {
          event: JSON.stringify(notification),
          id: notification.clientId,
          timestamp: notification.timestamp,
          travelValidity: notification.travelValidity,
          type: notification.type,
          multimodal: true,
          multimodalId: notification.multimodalId
        }
      }
      //se stesso giorno lo metto in coda al blocco altrimenti creo un nuovo giorno
      if (msg1 == msg2) {
        $scope.days[$scope.days.length - 1].messages.push(notification)
      } else {
        $scope.days.push({
          name: notification.timestamp,
          messages: [notification]
        })
      }
      //se viaggio multimodale e il primo di un nuovo blocco setto parametro first a true in modo da visualizzare la stringa nel diario
      if (multimodal && $scope.days[$scope.days.length - 1].messages && ($scope.days[$scope.days.length - 1].messages.length == 1 || ($scope.days[$scope.days.length - 1].messages[$scope.days[$scope.days.length - 1].messages.length - 1].multimodalId != $scope.days[$scope.days.length - 1].messages[$scope.days[$scope.days.length - 1].messages.length - 2].multimodalId))) {
        $scope.days[$scope.days.length - 1].messages[$scope.days[$scope.days.length - 1].messages.length - 1]["first"] = true;
      }
    }
    $scope.groupDays = function (notifications) {
      if (notifications[0]) {
        if (!$scope.days) {
          $scope.days = []
        }
        var event = JSON.parse(notifications[0].event);
        if (notifications[0].type == 'TRAVEL' && event.children && event.children.length > 1) {

          $scope.days.push({
            name: notifications[0].timestamp,
            messages: []
          })
          event.children.sort(function (a, b) {
            return b.timestamp - a.timestamp;
          });
          for (var childrenIndex = 0; childrenIndex < event.children.length; childrenIndex++) {
            $scope.manageOneEntry(event.children[childrenIndex], true)
          }
        } else {
          if (notifications[0].travelValidity == 'PENDING') {
            notifications[0].travelValidity = 'VALID';
            if (notifications[0].event) {
              var event = JSON.parse(notifications[0].event);
              event.travelValidity = 'VALID';
              notifications[0].event = JSON.stringify(event);
            }
          }
          $scope.days.push({
            name: notifications[0].timestamp,
            messages: [notifications[0]]
          })
        }
        for (var j = 1; j < notifications.length; j++) {
          event = JSON.parse(notifications[j].event);
          if (notifications[j].type == 'TRAVEL' && event.children && event.children.length > 1) {
            //oder from newest to oldest
            event.children.sort(function (a, b) {
              return b.timestamp - a.timestamp;
            });
            for (var childrenIndex = 0; childrenIndex < event.children.length; childrenIndex++) {
              $scope.manageOneEntry(event.children[childrenIndex], true)
            }
          } else {
            $scope.manageOneEntry(notifications[j], false)
          }
        }
      }
    }
    $scope.isTracking = function (message) {
      if (trackService.isThisTheJourney(message.id)) {
        return true;
      }
      return false;
    }
    $scope.loadMore = function () {
      if (!getDiary && $scope.maybeMore) {
        getDiary = true;
        if (!$scope.from) {
          $scope.from = new Date().getTime();
        }
        var temporanea = ($scope.messages != null && $scope.messages.length > 0) ? $scope.messages[$scope.messages.length - 1].timestamp : $scope.from
        var x = temporanea - 2592000000;
        $scope.from = x;
        $scope.to = ($scope.days != null) ? $scope.days[$scope.days.length - 1].messages[$scope.days[$scope.days.length - 1].messages.length - 1].timestamp - 1 : new Date().getTime();
        //bisogna aggiornare scope.to all'ultimo messaggio `
        var filter = GameSrv.getDbType($scope.filter.selected)
        DiaryDbSrv.readEvents(filter, $scope.from, $scope.to).then(function (notifications) {
            if (notifications == null || notifications.length == 0) {
              $scope.maybeMore = false;
            }
            $scope.singleDiaryStatus = true;
            $scope.groupDays(notifications);
            $scope.messages = notifications;
            if ($scope.from < Config.getTimeGameLimit()) {
              $scope.maybeMore = false;
            }
            $scope.$broadcast('scroll.infiniteScrollComplete');
            $scope.singleDiaryStatus = true;
            Config.loaded();
            getDiary = false;
          },
          function (err) {
            $scope.maybeMore = false;
            if (!$scope.message) {
              $scope.days = [];
            }
            Toast.show($filter('translate')("pop_up_error_server_template"), "short", "bottom");
            $scope.$broadcast('scroll.infiniteScrollComplete');
            $scope.singleDiaryStatus = true;
            Config.loaded();
            getDiary = false;
          });

      }
    };
    $scope.noDiary = function () {
      if (!$scope.days) {
        return false
      } else if ($scope.days.length == 0) {
        return true
      }
      return false

    }
    $scope.getStyleColor = function (message) {
      return GameSrv.getStyleColor(message);
    }
    $scope.getIconColor = function (message) {
      return GameSrv.getIconColor(message);
    }
    $scope.getIcon = function (message) {
      return GameSrv.getIcon(message);
    }
    $scope.getString = function (message) {
      return GameSrv.getString(message);
    }
    $scope.getState = function (message) {
      return GameSrv.getState(message)
    }
    $scope.getParams = function (message) {
      return GameSrv.getParams(message);
    }
    $scope.openEventTripDetail = function (message) {
      $state.go('app.tripDiary', {
        message: message.event
      });
    }
    $scope.init = function () {
      if (!getDiary) {
        Config.loading();
        getDiary = true;
        var x = new Date().getTime() - 2592000000;
        var filter = GameSrv.getDbType($scope.filter.selected)
        DiaryDbSrv.readEvents(filter, x, new Date().getTime()).then(function (notifications) {
          if (notifications == null || notifications.length == 0) {
            $scope.maybeMore = false;
          }
          $scope.singleDiaryStatus = true;
          $scope.days = []
          $scope.groupDays(notifications)
          $scope.messages = notifications;
          getDiary = false;
          $scope.$broadcast('scroll.infiniteScrollComplete');
          Config.loaded();
        }, function (err) {
          $scope.days = null;
          $scope.messages = [];
          Toast.show($filter('translate')("pop_up_error_server_template"), "short", "bottom");
          $scope.$broadcast('scroll.infiniteScrollComplete');
          getDiary = false;
          $scope.singleDiaryStatus = false;
          $scope.maybeMore = false;
          Config.loaded();
        });
      }
    }

    /* Resize ion-scroll */
    $scope.rankingStyle = {};

    var generateRankingStyle = function () {
      // header 44, filter 44, 
      $scope.rankingStyle = {
        'height': window.innerHeight - (44 + 44) + 'px'
      };
      $ionicScrollDelegate.$getByHandle('rankingScroll').resize();
    };


    $window.onresize = function (event) {
      // Timeout required for our purpose
      $timeout(function () {
        generateRankingStyle();
      }, 200);
    };

    $scope.openChallengeBoard = function (message) {
      //get end
      var end = (JSON.parse(message.event)).challengeEnd;
      var start = (JSON.parse(message.event)).challengeStart;
      var now = new Date().getTime();
      if (end > now && start < now) {
        $state.go('app.home.home');
      } else {
        $state.go('app.home.challenges', {
          challengeEnd: end,
          challengeStart: start
        });
      }
    };
    $scope.$on("$ionicView.afterEnter", function (scopes, states) {
      //check timer if passed x time
      var date = new Date();
      $scope.rankingStyle = {
        'height': window.innerHeight - (44 + 44) + 'px'
      };
      if (!localStorage.getItem(Config.getAppId() + "_diaryRefresh") || parseInt(localStorage.getItem(Config.getAppId() + "_diaryRefresh")) + Config.getCacheRefresh() < new Date().getTime()) {
        Config.loading();
        DiaryDbSrv.dbSetup().then(function () {
          $scope.init();
          Config.loaded();
        }, function (err) {
          Toast.show($filter('translate')("pop_up_error_server_template"), "short", "bottom");
          Config.loaded();
        })
        generateRankingStyle();
        localStorage.setItem(Config.getAppId() + "_diaryRefresh", new Date().getTime());
      }
    });

  })
  .controller('TripDiaryCtrl', function ($scope, $filter, $stateParams, planService, mapService, GameSrv, $window, $ionicScrollDelegate, DiaryDbSrv, Toast, Config) {
    $scope.message = {};
    $scope.trip = {};
    $scope.maxOfMessage = 0;
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
    $scope.$on('$ionicView.beforeEnter', function () {
      mapService.refresh('eventTripMapDetail');
    });


    $scope.initMap = function () {
      mapService.initMap('eventTripMapDetail', false).then(function () {
        console.log('map initialized');
      });
    };
    $scope.$on('$ionicView.afterEnter', function (e) {
      // Prevent destroying of leaflet
      $scope.initMap();
    });
    var fitBounds = function () {
      var boundsArray = [];
      for (var i = 0; i < $scope.pathMarkers.length; i++) {
        var bound = [$scope.pathMarkers[i].lat, $scope.pathMarkers[i].lng];
        boundsArray.push(bound);
      }
      for (var key in $scope.paths) {
        if ($scope.paths[key].latlngs) {
          var bound = L.polyline($scope.paths[key].latlngs).getBounds();
          boundsArray.push(bound);
        }
      }

      if (boundsArray.length > 0) {
        var bounds = L.latLngBounds(boundsArray);
        mapService.getMap('eventTripMapDetail').then(function (map) {
          map.fitBounds(bounds);
          Config.loaded();
        }, function (err) {
          Config.loaded();
        });
      } else {
        Config.loaded();
      }
    }
    $scope.tripIsValid = function () {
      return ($scope.trip.validity != 'INVALID');
    }

    $scope.calculateMaxStats = function (stats) {
      $scope.maxStat = GameSrv.getMaxStat("Daily");
    }
    $scope.getErrorMotivation = function () {
      $scope.errorMotivation = GameSrv.getError($scope.trip);
    }

    function isOnlyByCar(modes) {
      if (modes.length == 1 && modes[0] == 'car') {
        return true
      }
      return false
    }
    $scope.isErrorMessagePresent = function () {
      // if (!$scope.tripIsValid()&&($scope.message.travelEstimatedScore==0 && nn in macchina && distanza percorsa >250m: ))
      if (!$scope.tripIsValid() || ($scope.message.travelScore == 0 && !isOnlyByCar($scope.message.travelModes) && $scope.message.travelLength > 250)) {
        $scope.errorMessagePresent = true;
        return true
      }
      $scope.errorMessagePresent = false;
      return false
    }
    $scope.getStyle = function (stat, veichle) {
      //get max of message
      $scope.maxOfMessage = Math.max(($scope.message.travelDistances.transit || 0), ($scope.message.travelDistances.bike || 0), ($scope.message.travelDistances.bus || 0), ($scope.message.travelDistances.train || 0), ($scope.message.travelDistances.walk || 0), ($scope.message.travelDistances.car || 0))
      if (veichle == 'transit') {
        stat = ($scope.message.travelDistances.transit || 0) + ($scope.message.travelDistances.bus || 0) + ($scope.message.travelDistances.train || 0);
        //     $scope.maxStat["max " + veichle] = Math.max(($scope.maxStat["max bus"]||0), ($scope.maxStat["max train"]||0), ($scope.maxStat["max transit"]||0));
      }

      if ($scope.maxStat && (83 * stat) / $scope.maxOfMessage < 8.8 && veichle == 'transit') {
        return "width:" + (8.8) + "%"
      } else if ($scope.maxStat && (83 * stat) / $scope.maxOfMessage < 4.5) {
        return "width:" + (4.5) + "%"
      } else if ($scope.maxStat && $scope.maxOfMessage < $scope.maxvalues["maxDaily" + veichle] && stat < $scope.maxOfMessage) {
        return "width:" + ((78 * stat) / $scope.maxOfMessage) + "%"
      } else {
        return "width:" + (78) + "%"
      }
    }
    $scope.init = function () {
      $scope.message = JSON.parse($stateParams.message);
      $scope.paths = {};
      $scope.pathMarkers = [];
      var currentlyLine = {};
      //get detailt of trip 
      Config.loading();
      GameSrv.getEventTripDeatil($scope.message.entityId).then(function (trip) {
        $scope.trip = trip;
        if ($scope.isErrorMessagePresent()) {
          $scope.getErrorMotivation();
        }
        GameSrv.getRemoteMaxStat().then(function () {
          $scope.calculateMaxStats();
        });
        if (trip.itinerary) {
          //visualize itinerary planned
          planService.setPlanConfigure(planService.buildConfigureOptions(trip.itinerary));
          planService.process(trip.itinerary.data, trip.itinerary.originalFrom, trip.itinerary.originalTo);
          $scope.paths = mapService.getTripPolyline(trip.itinerary.data);
          $scope.pathMarkers = mapService.getTripPoints(trip.itinerary.data);
          //visualize itinerary done
        } else {
          Config.loaded();
        }

        //add real path
        if (trip.geolocationPolyline) {
          currentlyLine = mapService.decodePolyline(trip.geolocationPolyline);
        }
        $scope.paths["p" + $scope.paths.length] = {
          color: '#2975a7',
          weight: 8,
          latlngs: currentlyLine
        }
        angular.extend($scope, {
          center: {
            lat: Config.getMapPosition().lat,
            lng: Config.getMapPosition().long,
            zoom: Config.getMapPosition().zoom
          },
          markers: $scope.pathMarkers,
          events: {},
          paths: $scope.paths
        });
        // fit bounds
        fitBounds();


      }, function (err) {
        Config.loaded();
        Toast.show($filter('translate')("pop_up_error_server_template"), "short", "bottom");

      });

    }
    angular.extend($scope, {
      center: {
        lat: Config.getMapPosition().lat,
        lng: Config.getMapPosition().long,
        zoom: Config.getMapPosition().zoom
      },
      markers: {},
      events: {},
      paths: {}
    });
    $scope.init();
  })
  .controller('RankingsCtrl', function ($scope, $rootScope, $state, $ionicScrollDelegate, $window, $timeout, Config, GameSrv, Toast, $filter, $ionicPosition) {
    $scope.maybeMore = true;
    $scope.currentUser = {};
    $scope.ranking = [];
    $scope.searchOpen = false;
    $scope.singleRankStatus = true;
    $scope.rank = true;
    $scope.search = {
      searchdata: ""
    }
    $scope.rankingFilterOptions = ['now', 'last', 'global'];
    var getRanking = false;
    $scope.rankingPerPage = 50;

    GameSrv.getLocalStatus().then(
      function (status) {
        $scope.status = status;
      });
    $scope.searchToggle = function () {
      $scope.searchOpen = !$scope.searchOpen;
      if ($scope.searchOpen) {
        const input = document.getElementById('search-input-leaderboard');
        if (input) {
          input.focus();
        }
      } else {
        $scope.searchPlayer("");
      }
      if ($scope.filter.open)
        $scope.filter.open = false;
      $scope.search.searchdata = "";

    }
    $scope.searchPlayer = function (searchdata) {
      Config.loading();
      //parte la ricerca
      console.log(searchdata);
      // $scope.search.searchdata = searchdata;
      GameSrv.getRanking($scope.rankingFilterOptions[0], 0, $scope.rankingPerPage, searchdata).then(
        function (ranking) {
          $rootScope.currentUser = ranking['actualUser'];
          $scope.ranking = ranking['classificationList'];
          $scope.$broadcast('scroll.infiniteScrollComplete');
          $scope.noStatus = false;
          if ($scope.ranking && $scope.ranking.length == 0) {
            $scope.rank = false;
          } else {
            $scope.rank = true;
          }
          Config.loaded();
        },
        function (err) {
          Toast.show($filter('translate')("pop_up_error_server_template"), "short", "bottom");
          $scope.rank = false;
          $scope.singleRankStatus = true;
          Config.loaded();
        }
      );

    }
    $scope.filter = {
      open: false,
      toggle: function () {
        this.open = !this.open;
        if ($scope.searchOpen) {
          $scope.searchOpen = false;
          $scope.searchPlayer("");
        }
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
      selected: null
    };

    $scope.filter.options = $scope.rankingFilterOptions;
    $scope.filter.selected = !$scope.filter.selected ? $scope.filter.options[0] : $scope.filter.selected;

    $scope.filter.filter = function (selection) {
      // reload using new selection
      $scope.rank = true;
      getRanking = true;
      $scope.maybeMore = true;
      $scope.singleRankStatus = true;
      $scope.ranking = [];
      Config.loading();
      GameSrv.getRanking(selection, 0, $scope.rankingPerPage, null).then(
        function (ranking) {
          if (ranking) {
            getRanking = false;
            $scope.singleRankStatus = true;
            $scope.currentUser = ranking['actualUser'];
            $scope.ranking = ranking['classificationList'];
            if (!$scope.ranking || $scope.ranking.length < $scope.rankingPerPage) {
              $scope.maybeMore = false;
            }
            if ($scope.ranking && $scope.ranking.length == 0) {
              $scope.rank = false;
            } else {
              $scope.rank = true;
            }
          } else {
            $scope.maybeMore = false;
            Toast.show($filter('translate')("pop_up_error_server_template"), "short", "bottom");
            $scope.$broadcast('scroll.infiniteScrollComplete');
            getRanking = false;
            if ($scope.ranking.length == 0) {
              $scope.singleRankStatus = false;

            }
            //position to the last visible so No infinite scroll
            if ($scope.ranking.length > 0) {
              var visualizedElements = Math.ceil((window.innerHeight - (44 + 49 + 44 + 44 + 48)) / 40);
              var lastelementPosition = $ionicPosition.position(angular.element(document.getElementById('position-' + ($scope.ranking.length - visualizedElements))));
              $ionicScrollDelegate.scrollTo(lastelementPosition.left, lastelementPosition.top, true);
            }
          }
          $scope.$broadcast('scroll.infiniteScrollComplete');
          Config.loaded();
        },
        function (err) {
          Toast.show($filter('translate')("pop_up_error_server_template"), "short", "bottom");
          $scope.rank = false;
          $scope.singleRankStatus = true;
          Config.loaded();
        }
      )


    };

    $scope.reloadRank = function () {
      $scope.maybeMore = true;
      $scope.loadMore()
    }
    /* Infinite scrolling */
    $scope.loadMore = function () {
      if (!getRanking && $scope.maybeMore) {
        getRanking = true;
        var start = $scope.ranking != null ? $scope.ranking.length + 1 : 0;
        var end = start + $scope.rankingPerPage;
        GameSrv.getRanking($scope.filter.selected, start, end).then(
          function (ranking) {
            if (start == 0) {
              $scope.ranking = [];
            }
            if (ranking) {
              $scope.currentUser = ranking['actualUser'];
              $scope.ranking = $scope.ranking.concat(ranking['classificationList']);

              if (ranking['classificationList'].length < $scope.rankingPerPage) {
                $scope.maybeMore = false;
              }

              $scope.$broadcast('scroll.infiniteScrollComplete');
              getRanking = false;
              $scope.singleRankStatus = true;
            } else {
              $scope.maybeMore = false;
              Toast.show($filter('translate')("pop_up_error_server_template"), "short", "bottom");
              $scope.$broadcast('scroll.infiniteScrollComplete');
              getRanking = false;
              if ($scope.ranking && $scope.ranking.length == 0) {
                $scope.singleRankStatus = false;

              }
            }
          },
          function (err) {
            if (!$scope.ranking || $scope.ranking.length == 0) {
              $scope.maybeMore = false;
              Toast.show($filter('translate')("pop_up_error_server_template"), "short", "bottom");
              $scope.$broadcast('scroll.infiniteScrollComplete');
              getRanking = false;
              if ($scope.ranking.length == 0) {
                $scope.singleRankStatus = false;

              }
              //position to the last visible so No infinite scroll
              if ($scope.ranking.length > 0) {
                var visualizedElements = Math.ceil((window.innerHeight - (44 + 49 + 44 + 44 + 48)) / 40);
                var lastelementPosition = $ionicPosition.position(angular.element(document.getElementById('position-' + ($scope.ranking.length - visualizedElements))));
                $ionicScrollDelegate.scrollTo(lastelementPosition.left, lastelementPosition.top, true);
              }

            }
          }
        );
      } else {
        $scope.$broadcast('scroll.infiniteScrollComplete');

      }
    };

    /* Resize ion-scroll */
    $scope.rankingStyle = {};

    var generateRankingStyle = function () {
      // header 44, tabs 49, filter 44, listheader 44, my ranking 48
      $scope.rankingStyle = {
        'height': window.innerHeight - (44 + 49 + 44 + 44 + 48) + 'px'
      };
      $ionicScrollDelegate.$getByHandle('rankingScroll').resize();
    };


    $window.onresize = function (event) {
      $timeout(function () {
        generateRankingStyle();
      }, 200);
    };


    $scope.$on("$ionicView.afterEnter", function (scopes, states) {
      //check timer if passed x time
      var date = new Date();
      $scope.rankingStyle = {
        'height': window.innerHeight - (44 + 49 + 44 + 44 + 48) + 'px'
      };
      if (!localStorage.getItem(Config.getAppId() + "_rankingRefresh") || parseInt(localStorage.getItem(Config.getAppId() + "_rankingRefresh")) + Config.getCacheRefresh() < new Date().getTime()) {
        generateRankingStyle();
        $scope.reloadRank();
        localStorage.setItem(Config.getAppId() + "_rankingRefresh", new Date().getTime());

      }
    });
  });
