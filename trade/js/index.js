//I'm so sorry any of this has to be done the way it was. 

$.fn.extend({
    animateCss: function (animationName, callback) {
        var animationEnd = (function (el) {
            var animations = {
                animation: 'animationend',
                OAnimation: 'oAnimationEnd',
                MozAnimation: 'mozAnimationEnd',
                WebkitAnimation: 'webkitAnimationEnd',
            };

            for (var t in animations) {
                if (el.style[t] !== undefined) {
                    return animations[t];
                }
            }
        })(document.createElement('div'));

        this.addClass('animated ' + animationName).one(animationEnd, function () {
            $(this).removeClass('animated ' + animationName);

            if (typeof callback === 'function') callback();
        });

        return this;
    },
});

function showDiscord() {
    var div = document.getElementsByClassName("main")[0];
    var infoDiv = $(div.getElementsByClassName("infoDiv")[0]);
    infoDiv.animateCss('tada')
    infoDiv.text('DeJay#1337')
}

function showTwitter() {
    var div = document.getElementsByClassName("main")[0];
    var infoDiv = $(div.getElementsByClassName("infoDiv")[0]);
    infoDiv.animateCss('tada')
    infoDiv.text('@DeJayDev')
}

function showGit() {
    var div = document.getElementsByClassName("main")[0];
    var infoDiv = $(div.getElementsByClassName("infoDiv")[0]);
    infoDiv.animateCss('tada')
    infoDiv.text('DeJayDev')
}

$(function() {
    //:shrug:
});