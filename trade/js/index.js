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

$(document).ready(function () {
    var infoDiv = $('.infoDiv');

    hide = function () {
        infoDiv.text('󠀡');
        document.getElementById("hideMe").style.color = '#242424';
    }

    showDiscord = function () {
        infoDiv.animateCss('tada');
        infoDiv.text('Cubity_First#0001');
        document.getElementById("hideMe").style.color = 'white';
    }

    showBackpack = function () {
        infoDiv.animateCss('tada');
        infoDiv.text('cubityfir.st/bp');
        document.getElementById("hideMe").style.color = 'white';
    }

    showSteam = function () {
        infoDiv.animateCss('tada');
        infoDiv.text('cubityfir.st/offer');
        document.getElementById("hideMe").style.color = 'white';
    }
});