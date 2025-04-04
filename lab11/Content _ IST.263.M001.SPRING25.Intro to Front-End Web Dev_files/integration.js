if (!window.parent) {
    throw new Error('Not within iframe');
}
var portalId;
var messageChannel;
var courses = [];
var _settings = null;
var _courseId = null;
var lastPanel = null;
//var chrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
var safari = (navigator.userAgent.indexOf('Safari') !== -1 && (navigator.userAgent.indexOf('Chrome') === -1 || (navigator.userAgent.indexOf('Chrome') > -1 && navigator.userAgent.indexOf('OPR') > -1)));

// Set up the window.postMessage listener for the integration handshake (for step #2)
window.addEventListener("message", onPostMessageReceived, false);

// (1) Send the integration handshake message to Learn Ultra. This notifies Learn Ultra that the integration has
// loaded and is ready to communicate.
window.parent.postMessage({ "type": "integration:hello" }, `${window.__lmsHost}/*`);

// Sets up a way to communicate between the iframe and the integration script
window.addEventListener('storage', onEventFromIframe);

setInterval(function () {
    var xhr = createCORSRequest('GET', `${window.__host}/blackboard/keepalive?token=${encodeURIComponent(window.__token)}`);

    if (!xhr) { return; }
    xhr.onload = function () {
        //if (xhr.status === 200) {
        //    if (isEmpty(xhr.responseText)) window.location.href = window.__refer;
        //}
    };
    xhr.send();
}, 600000); // 10 mins

function onEventFromIframe(evt) {
    //console.log(evt);
    if (evt.newValue === null) return;
    switch (evt.key) {
        case 'iframe-defer':
            closeSn();
            //doDefer();
            break;
        case 'iframe-survey':
            closeSn();
            displaySurvey();
            break;
        default:
    }
}
function closeSn() {
    // console.log("closing: " + portalId);
    messageChannel.postMessage({
        type: 'portal:panel:close',
        id: portalId
    });
}


function onPostMessageReceived(evt) {
    // Do some basic message validation.
    const fromTrustedHost = evt.origin === window.__lmsHost || evt.origin === window.__host;
    if (!fromTrustedHost || !evt.data || !evt.data.type) {
        return;
    }

    // (2) A majority of the communication between the integration and Learn Ultra will be over a "secure" MessageChannel.
    // As response to the integration handshake, Learn Ultra will send a MessageChannel port to the integration.

    if (isEmpty(window.__token)) return;

    if (evt.data.type === 'integration:hello') {
        // Store the MessageChannel port for future use
        messageChannel = new LoggedMessageChannel(evt.ports[0]);
        messageChannel.onmessage = onMessageFromUltra;
        courses = []; //reset
        // (3) Now, we need to authorize with Learn Ultra using the OAuth2 token that the server negotiated for us
        messageChannel.postMessage({
            type: 'authorization:authorize',

            // This token is passed in through integration.cshtml
            token: window.__lmsToken,
        });
    }
}
function initUserSettings() {

    // _courseId = null;// quick fix, remove latter and fix
    if (typeof _courseId === 'undefined' || _courseId === null) {
        getSettings(1);
        return;
    }
    // check cache course
    if (_courseId in courses) {
        getSettings(1);
        return;
    }
    var xhr = createCORSRequest('GET', window.__lmsHost + '/learn/api/public/v3/courses/' + _courseId);
    if (!xhr) { return; }
    xhr.setRequestHeader('Authorization', 'Bearer ' + window.__lmsToken);
    xhr.onload = function () {
        if (xhr.status === 200) {
            courses[_courseId] = JSON.parse(xhr.responseText);
            getSettings(1);
        }
        // TODO handle Bb 401 refresh token, but if it expires it will redirect to Bb login?
    };
    xhr.onerror = function () {
        //console.log(xhr);

        _courseId = null;
        getSettings(1);
    };
    xhr.send();
}
function getSettings(attempt) {
    //var currentAttempt = sessionStorage.getItem('ek-attempts');
    //var attempts = currentAttempt === null ? 0 : parseInt(currentAttempt);
    //attempts += 1;
    console.log("Get Settings " + attempt);
    // sessionStorage.setItem('ek-attempts', `${attempts}`);
    //console.log('attempt' + attempts);
    if (attempt > 5) {
        return;
    }
    attempt++;

    var xhr = createCORSRequest('POST', `${window.__host}/blackboard/settings?token=${encodeURIComponent(window.__token)}&safari=${safari}`);

    if (!xhr) { return; }
    xhr.onload = function () {
        if (xhr.status === 200) {
            _settings = isEmpty(xhr.responseText) ? null : JSON.parse(xhr.responseText);
            sessionStorage.setItem('_settings', xhr.responseText);
            if (_settings === null) {
                //sessionStorage.setItem('ek-attempts', `${attempts}`);
                window.location.href = window.__refer;
            }
            else {
                displayNotify();
                //sessionStorage.removeItem('ek-attempts');
            }
        }
        else {
            getSettings(attempt);
        }
    };
    xhr.send(typeof _courseId === 'undefined' || _courseId === null ? null : JSON.stringify(courses[_courseId]));
}
function isEmpty(str) {
    return (!str || 0 === str.length);
}
function displayNotify() {

    if (_settings.notify === null) return;
    lastPanel = 'panel-sn';
    messageChannel.postMessage({
        type: 'portal:panel',
        correlationId: 'panel-sn',
        source: 'panel-sn',
        panelType: 'small',
        panelTitle: _settings.notify.header
    });
}
function displaySurvey() {
    if (_settings.survey === null) return;
    lastPanel = 'panel-survey';
    messageChannel.postMessage({
        type: 'portal:panel',
        correlationId: 'panel-survey',
        panelType: 'full',
        panelTitle: _settings.notify.header
    });
}
function doDefer() {
    if (_settings.notify.defer === null || isEmpty(_settings.notify.defer.url)) return;
    var xhr = createCORSRequest('GET', _settings.notify.defer.url);
    if (!xhr) { return; }
    xhr.onload = function () {
        if (xhr.status === 200) {
            // if (isEmpty(xhr.responseText)) window.location.href = window.__refer;
        }
    };
    xhr.send();
}
function onMessageFromUltra(message) {
    // (4) If our authorization token was valid, Learn Ultra will send us a response, notifying us that the authorization
    // was successful
    if (message.data.type === 'authorization:authorize') {
        onAuthorizedWithUltra();
    }

    // (7) On click, route, and hover messages, we will receive an event:event event
    if (message.data.eventType === 'route') {

        _courseId = message.data.routeData.courseId;

        switch (message.data.routeName) {
            //
            case "base.institution-page-admin":
            case "base.institution-page":
            case "base.recentActivity":
            //case "base.courses":
            case "base.courses.peek.course.classic.outline":
            case "base.courses.peek.course.outline":
                initUserSettings();
                break;
        }
    }
    if (message.data.type === 'portal:panel:response') {
        if (message.data.correlationId === 'panel-survey') {
            if (_settings.notify.survey === null) return;
            portalId = message.data.portalId;

            //setTimeout(function () {
            messageChannel.postMessage({
                type: 'portal:render',
                portalId: portalId,
                contents: {
                    tag: 'span',
                    props: {
                        style: {
                            display: 'flex',
                            height: '100%',
                            width: '100%',
                            flexDirection: 'column',
                            alignItems: 'stretch',
                            justifyContent: 'stretch',
                        },
                    },
                    children: [{
                        tag: 'iframe',
                        props: {
                            style: { flex: '1 1 auto' }, //safari does not open in panel
                            src: _settings.notify.survey.url
                        },
                    }]
                }
            });

            // }, 500);

        }
        else if (message.data.correlationId === 'panel-sn') {
            if (_settings.notify.survey === null) return;
            portalId = message.data.portalId;
            //console.log("sn portalid: " + portalId);

            //setTimeout(function () {
            messageChannel.postMessage({
                type: 'portal:render',
                portalId: portalId,
                contents: {
                    tag: 'span',
                    props: {
                        style: {
                            display: 'flex',
                            height: '100%',
                            width: '100%',
                            flexDirection: 'column',
                            alignItems: 'stretch',
                            justifyContent: 'stretch',
                        },
                    },
                    children: [{
                        tag: 'iframe',
                        props: {
                            style: safari ? { height: '800px', flex: '1 1 auto' } : { flex: '1 1 auto' },
                            src: `${window.__host}/blackboard/iframe-sn?token=${encodeURIComponent(window.__token)}`
                        },
                    }]
                }
            });

            // }, 500);        
        }
    }


    if (message.data.type === 'event:event') {
        switch (message.data.eventType) {

            // closing survey panel
            case 'portal:remove':
                if (lastPanel === 'panel-survey') {
                    lastPanel = null;
                }
                else if (_settings.notify.defer === null && (lastPanel === null || lastPanel === 'panel-sn')) {

                    getSettings(1);
                }
                else if (_settings.notify.defer !== null && (lastPanel === 'panel-sn')) {

                    doDefer();
                }
                //doit
                break;
        }

    }
    //switch (message.data.routeName) {

    //    case "base.recentActivity":


    //        //messageChannel.postMessage({
    //        //    type: 'portal:modal',
    //        //    correlationId: 'modal-1',
    //        //    panelType: 'small',
    //        //    panelTitle: 'Survey Nottification',
    //        //    attributes: {
    //        //        onClose: {
    //        //            callbackId: 'modal-1-close',
    //        //        },
    //        //    },
    //        //});
    //        //var xhr = that.createCORSRequest('GET', '/api/v1/accounts/' + evalkit_setup.account_id + '/external_tools/sessionless_launch?launch_type=user_navigation&url=' + encodeURIComponent(evalkit_setup.service_url + '/canvas/authlti'));
    //        //if (!xhr) { return; }
    //        //xhr.onload = function () {
    //        //    if (xhr.status === 200) {
    //        //        var jsondata = $.parseJSON(xhr.responseText.replace('while(1);', ''));// while(1) included for security reasons from canvas
    //        //        if ($('#evalkit-lti').length > 0) {
    //        //            $('#evalkit-lti').attr('src', jsondata.url);
    //        //        }
    //        //        else {
    //        //            $('<iframe src="' + jsondata.url + '" id="evalkit-lti" style="display:none;"></iframe>').appendTo($('body'));
    //        //        }
    //        //    }
    //        //    else {
    //        //        var redo = EvaluationKIT || {};
    //        //        redo.onLoad();
    //        //    }
    //        //};
    //        //xhr.send();


    //        break;
    //    default:
    //}



    //if (message.data.routeData.courseId >= 0 && contents.indexOf(message.data.routeData.contentId) >= 0) {
    //    console.log("passed my check")

    //    localStorage.setItem('context', JSON.stringify(message.data.routeData));
    //    console.log("show the panel")
    //    setTimeout(() => {
    //        // (8) For demo purposes, we will open a panel. We send a message to
    //        // Ultra requesting a panel be
    //        // opened (if shouldShowPanel is enabled)
    //        messageChannel.postMessage({
    //            type: 'portal:panel',
    //            correlationId: 'panel-1',
    //            panelType: 'small',
    //            panelTitle: 'UEF Python Demo',
    //            attributes: {
    //                onClose: {
    //                    callbackId: 'panel-1-close',
    //                },
    //                onClick: {
    //                    callbackId: 'panel-1-close',
    //                },
    //            },
    //        });
    //    }, 2000);
    //}

    //// (9) Once Ultra has opened the panel, it will notify us that we can render into the panel
    //if (message.data.type === 'portal:modal:response') {
    //    renderPanelContents(message);
    //}

    //// (10) When the help button has been clicked, we'll use the registered help provider
    //if (message.data.type === 'help:request') {
    //    // for demo purposes we'll just open Google's home page
    //    window.open('https://google.com');
    //    sendMessage({
    //        "type": "help:request:response",
    //        "correlationId": msg.data.correlationId
    //    });
    //}
}
function createCORSRequest(method, url) {
    try {
        var xhr = new XMLHttpRequest();
        if ("withCredentials" in xhr) {
            /* XHR for Chrome/Firefox/Opera/Safari.*/
            xhr.open(method, url, true);
            xhr.withCredentials = true;
        } else if (typeof XDomainRequest !== "undefined") {
            /* XDomainRequest for IE.*/
            xhr = new XDomainRequest();
            xhr.open(method, url);
        } else {
            /* CORS not supported.*/
            xhr = null;
        }
        return xhr;
    } catch (e) {
        console.log(e);
    }
}
function onAuthorizedWithUltra() {

    // (5) Once we are authorized, we can subscribe to events, such as telemetry events
    messageChannel.postMessage({
        type: 'event:subscribe',
        subscriptions: ['click', 'route']
    });
}
var LoggedMessageChannel = /** @class */ (function () {
    function LoggedMessageChannel(messageChannel) {
        var _this = this;
        this.onmessage = function (evt) { };
        // From Learn Ultra
        this.onMessage = function (evt) {
            _this.onmessage(evt);
            //console.log(`[UEF] From Learn Ultra:`, evt.data);
        };
        // To Learn Ultra
        this.postMessage = function (msg) {
            //console.log(`[UEF] To Learn Ultra`, msg);
            _this.messageChannel.postMessage(msg);
        };
        this.messageChannel = messageChannel;
        this.messageChannel.onmessage = this.onMessage;
    }
    return LoggedMessageChannel;
}());