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
    infoDiv.text('Cubity_First#0001')
    document.getElementById("hideMe").style.color = 'white';
}
function hide() {
    var div = document.getElementsByClassName("main")[0];
    var infoDiv = $(div.getElementsByClassName("infoDiv")[0]);
    infoDiv.text('Blank')
    document.getElementById("hideMe").style.color = '#242424';
}

function showTwitter() {
    var div = document.getElementsByClassName("main")[0];
    var infoDiv = $(div.getElementsByClassName("infoDiv")[0]);
    infoDiv.animateCss('tada')
    infoDiv.text('cubityfir.st/bp')
}

function showSteam() {
    var div = document.getElementsByClassName("main")[0];
    var infoDiv = $(div.getElementsByClassName("infoDiv")[0]);
    infoDiv.animateCss('tada')
    infoDiv.text('cubityfir.st/offer')
    infoDiv.setAttribute("href", "https://cubityfir.st/offer");
}

$(function() {
    //:shrug:
});
